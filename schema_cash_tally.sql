-- Apply after schema_v6.sql and schema_module_access.sql.
begin;

create table if not exists public.cash_tally_vouchers (
  date date not null,
  type text not null check (type in ('receipt', 'payment')),
  ref text not null check (length(btrim(ref)) between 1 and 160),
  ledger text not null check (length(btrim(ledger)) between 1 and 300),
  amount numeric(16,2) not null check (amount >= 0 and amount <> 'NaN'::numeric),
  primary key (date, type, ref)
);
alter table public.cash_tally_vouchers enable row level security;
revoke all on public.cash_tally_vouchers from public, anon, authenticated;
grant select on public.cash_tally_vouchers to authenticated;
drop policy if exists cash_tally_read on public.cash_tally_vouchers;
create policy cash_tally_read on public.cash_tally_vouchers for select to authenticated
  using ((select public.my_role()) in ('admin', 'staff', 'boss'));

create or replace function public.import_cash_tally(vouchers jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare added integer;
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if vouchers is null or jsonb_typeof(vouchers) <> 'array' then
    raise exception 'invalid_cash_tally_vouchers';
  end if;
  if jsonb_array_length(vouchers) not between 1 and 25000 then
    raise exception 'invalid_cash_tally_voucher_count';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(vouchers) as v(date date, type text, ref text, led text, a numeric)
    group by v.date, v.type, v.ref having count(*) > 1
  ) then
    raise exception 'cash_tally_duplicate_voucher';
  end if;

  -- Ignore identical reimports, but abort the whole import if an existing voucher differs.
  -- Serialize imports so that the conflict check and insert see the same voucher set.
  lock table public.cash_tally_vouchers in share row exclusive mode;
  if exists (
    select 1
    from jsonb_to_recordset(vouchers) as v(date date, type text, ref text, led text, a numeric)
    join public.cash_tally_vouchers t using (date, type, ref)
    where (t.ledger, t.amount) is distinct from (btrim(v.led), v.a)
  ) then
    raise exception 'cash_tally_voucher_conflict';
  end if;

  insert into public.cash_tally_vouchers(date, type, ref, ledger, amount)
    select v.date, v.type, v.ref, btrim(v.led), v.a
    from jsonb_to_recordset(vouchers) as v(date date, type text, ref text, led text, a numeric)
    on conflict do nothing;
  get diagnostics added = row_count;

  insert into public.cashbook_ledgers(name, kind, created_by)
    select distinct on (lower(t.ledger)) t.ledger, 'both',
      (select p.name from public.profiles p where p.id = auth.uid())
    from public.cash_tally_vouchers t
    order by lower(t.ledger), t.ledger
    on conflict (lower(name)) do nothing;
  return added;
end
$$;
revoke all on function public.import_cash_tally(jsonb) from public, anon, authenticated;
grant execute on function public.import_cash_tally(jsonb) to authenticated;

commit;
