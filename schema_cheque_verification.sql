-- Optional cheque verification against a bank statement.
-- Apply after the existing Nabiad schema. Safe to re-run.
begin;

create table if not exists public.cheque_statement_verifications (
  cheque_id uuid primary key references public.cheques(id) on delete cascade,
  code text not null,
  cheque_no bigint not null,
  amount numeric not null check (amount > 0),
  statement_date date,
  verified_at timestamptz not null default now(),
  verified_by uuid not null,
  verifier_name text not null,
  invalidated_at timestamptz
);

alter table public.cheque_statement_verifications enable row level security;
revoke all on public.cheque_statement_verifications from public, anon, authenticated;
grant select on public.cheque_statement_verifications to authenticated;

drop policy if exists cheque_verification_read on public.cheque_statement_verifications;
create policy cheque_verification_read on public.cheque_statement_verifications
  for select to authenticated using (public.my_role() in ('admin', 'staff', 'boss'));

create or replace function public.invalidate_cheque_statement_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cheque_statement_verifications
  set invalidated_at = clock_timestamp()
  where cheque_id = new.id and invalidated_at is null;
  return new;
end;
$$;
revoke all on function public.invalidate_cheque_statement_verification() from public, anon, authenticated;

drop trigger if exists invalidate_cheque_statement_verification on public.cheques;
create trigger invalidate_cheque_statement_verification
  after update of code, chq_no, amount on public.cheques
  for each row
  when ((old.code, old.chq_no, old.amount) is distinct from (new.code, new.chq_no, new.amount))
  execute function public.invalidate_cheque_statement_verification();

create or replace function public.verify_cheques_against_statement(matches jsonb)
returns setof public.cheque_statement_verifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  operator_id uuid := auth.uid();
  operator_name text;
  candidate record;
  cheque public.cheques%rowtype;
begin
  if operator_id is null or coalesce(public.my_role(), '') not in ('admin', 'staff') then
    raise exception 'Only active admin or staff can confirm statement matches' using errcode = '42501';
  end if;
  select coalesce(nullif(name, ''), nullif(email, ''), operator_id::text)
    into operator_name from public.profiles where id = operator_id;
  if jsonb_typeof(matches) is distinct from 'array' then
    raise exception 'Select 1 to 200 statement matches';
  end if;
  if jsonb_array_length(matches) not between 1 and 200 then
    raise exception 'Select 1 to 200 statement matches';
  end if;
  for candidate in
    select * from jsonb_to_recordset(matches)
      as m(cheque_id uuid, code text, cheque_no bigint, amount numeric, statement_date date)
    order by cheque_id
  loop
    select c.* into cheque from public.cheques c where c.id = candidate.cheque_id for update;
    if not found or candidate.amount is null or candidate.amount <= 0
       or (cheque.code, cheque.chq_no, cheque.amount)
            is distinct from (candidate.code, candidate.cheque_no, candidate.amount) then
      raise exception 'A cheque has changed. Refresh the register and check the statement again.';
    end if;
    insert into public.cheque_statement_verifications as previous
      (cheque_id, code, cheque_no, amount, statement_date, verified_by, verifier_name)
    values (cheque.id, cheque.code, cheque.chq_no, cheque.amount, candidate.statement_date, operator_id, operator_name)
    on conflict (cheque_id) do update set
      code = excluded.code, cheque_no = excluded.cheque_no, amount = excluded.amount,
      statement_date = excluded.statement_date, verified_at = excluded.verified_at,
      verified_by = excluded.verified_by, verifier_name = excluded.verifier_name, invalidated_at = null
    where previous.invalidated_at is not null;

    return query select v.* from public.cheque_statement_verifications v where v.cheque_id = cheque.id;
  end loop;
end;
$$;
revoke all on function public.verify_cheques_against_statement(jsonb) from public, anon, authenticated;
grant execute on function public.verify_cheques_against_statement(jsonb) to authenticated;

commit;
