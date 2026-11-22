-- Apply after schema_cash_tally_report_ledger.sql.
begin;

alter table public.cash_tally_vouchers
  add column if not exists cashbook_edit jsonb;

comment on column public.cash_tally_vouchers.cashbook_edit is
  'Cash Book correction only. Raw Tally reports and reimports keep using the original voucher fields.';

create or replace function public.cashbook_edit_imported(
  p_date date, p_type text, p_ref text, p_version timestamptz, p_data jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles;
  voucher public.cash_tally_vouchers;
  particulars text := btrim(p_data->>'n');
  voucher_ref text := btrim(coalesce(p_data->>'ref', ''));
  narration text := btrim(coalesce(p_data->>'note', ''));
  amount numeric;
  revised jsonb;
begin
  select * into actor from public.profiles where id = auth.uid() and active;
  if not found or actor.role <> 'admin' then
    raise exception 'cashbook_permission' using errcode = '42501';
  end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'cashbook_date';
  end if;
  if coalesce(length(particulars), 0) not between 1 and 300
    or length(voucher_ref) > 160 or length(narration) > 2000
    or jsonb_typeof(p_data->'a') is distinct from 'number' then
    raise exception 'cashbook_invalid_line';
  end if;
  amount := (p_data->>'a')::numeric;
  if amount <= 0 or amount >= 100000000000000 or amount <> round(amount, 2) then
    raise exception 'cashbook_invalid_line';
  end if;

  select * into voucher from public.cash_tally_vouchers
    where date = p_date and type = p_type and ref = p_ref for update;
  if not found or (voucher.cashbook_edit->>'updated_at')::timestamptz is distinct from p_version then
    raise exception 'cashbook_conflict' using errcode = '40001';
  end if;

  revised := jsonb_build_object('n', particulars, 'a', amount, 'ref', voucher_ref, 'note', narration,
    'updated_at', clock_timestamp());
  update public.cash_tally_vouchers set cashbook_edit = revised
    where date = p_date and type = p_type and ref = p_ref;

  insert into public.audit_log(user_name, tbl, action, row_key, old, new)
    values (actor.name, 'cash_tally_vouchers', 'update', concat_ws(' · ', p_date, p_type, p_ref),
      coalesce(voucher.cashbook_edit,
        jsonb_build_object('n', coalesce(voucher.report_ledger, voucher.ledger), 'a', voucher.amount, 'ref', voucher.ref)),
      revised);
  return revised;
end;
$$;

revoke all on function public.cashbook_edit_imported(date,text,text,timestamptz,jsonb) from public, anon;
grant execute on function public.cashbook_edit_imported(date,text,text,timestamptz,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
