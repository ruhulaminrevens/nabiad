-- Nabiad v3 — cash records, reminder photos, own-name change, daily backup at 12:00 AM (Dhaka)
-- Run ONCE in Supabase → SQL Editor (after schema.sql and schema_v2.sql). Safe to re-run.

-- 1) reminder photo
alter table reminders add column if not exists photo text;

-- 2) daily cash records (one row per date; draft → final)
create table if not exists cash_records (
  date date primary key,
  opening_cash numeric default 0,
  opening_bank numeric default 0,
  items jsonb not null default '{}'::jsonb,      -- {key: {a: amount, x: "5000+300", n: "note"}}
  total_receipt numeric default 0,
  total_payment numeric default 0,
  closing numeric default 0,
  cash_in_hand numeric,
  remarks text,
  status text not null default 'draft' check (status in ('draft','final')),
  entered_by text,
  user_id uuid default auth.uid(),
  updated_at timestamptz default now()
);
alter table cash_records enable row level security;
drop policy if exists p_cash_read on cash_records;
drop policy if exists p_cash_ins on cash_records;
drop policy if exists p_cash_upd on cash_records;
drop policy if exists p_cash_del on cash_records;
create policy p_cash_read on cash_records for select to authenticated using (my_role() is not null);
create policy p_cash_ins on cash_records for insert to authenticated with check (my_role() in ('admin','staff'));
-- staff may keep editing a DRAFT (and finalise it); once final only admin can change it
create policy p_cash_upd on cash_records for update to authenticated
  using (my_role() = 'admin' or (my_role() = 'staff' and status = 'draft'))
  with check (my_role() in ('admin','staff'));
create policy p_cash_del on cash_records for delete to authenticated using (my_role() = 'admin');

-- 3) audit: add cash_records to the trigger function
create or replace function public.audit_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; r jsonb; k text; nm text;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  r := coalesce(n, o);
  if r->>'entered_by' = 'Old file (Foysal)' then return null; end if;
  if tg_op = 'UPDATE' and o = n then return null; end if;
  k := case tg_table_name
    when 'cheques'  then (r->>'code') || ' · ' || (r->>'chq_no')
    when 'balances' then (r->>'date') || ' · ' || (r->>'code')
    when 'accounts' then r->>'code'
    when 'books'    then (r->>'code') || ' · ' || coalesce(r->>'first_leaf','') || '–' || coalesce(r->>'last_leaf','')
    when 'cheque_status' then coalesce((select code || ' · ' || chq_no from cheques where id = (r->>'cheque_id')::uuid), '?') || ' → ' || (r->>'new_status')
    when 'profiles' then r->>'email'
    when 'cash_records' then 'Cash ' || (r->>'date') || ' (' || (r->>'status') || ')'
    else r->>'id' end;
  select name into nm from profiles where id = auth.uid();
  insert into audit_log(user_name, tbl, action, row_key, old, new)
    values (coalesce(nm, 'system'), tg_table_name, lower(tg_op), k, o, n);
  return null;
end $$;
drop trigger if exists audit_cash on cash_records;
create trigger audit_cash after insert or update or delete on cash_records for each row execute function audit_trg();

-- 4) every user may change their OWN display name (not role / active)
create or replace function public.set_my_name(n text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or my_role() is null then raise exception 'not allowed'; end if;
  if length(trim(n)) < 2 or length(n) > 60 then raise exception 'invalid name'; end if;
  update profiles set name = trim(n) where id = auth.uid();
end $$;
grant execute on function public.set_my_name(text) to authenticated;

-- 5) backups (snapshot of all business tables as jsonb; admin only)
create table if not exists backups (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null default 'auto',
  size_rows int,
  data jsonb
);
alter table backups enable row level security;
drop policy if exists p_backup_read on backups;
create policy p_backup_read on backups for select to authenticated using (my_role() = 'admin');

create or replace function public.make_backup(k text default 'auto') returns bigint
language plpgsql security definer set search_path = public as $$
declare d jsonb; n int; bid bigint;
begin
  -- cron runs without a user (auth.uid() is null); from the app only admin may call it
  if auth.uid() is not null and coalesce(my_role(), '') <> 'admin' then raise exception 'not allowed'; end if;
  d := jsonb_build_object(
    'taken_at', now(),
    'accounts',       (select coalesce(jsonb_agg(t), '[]') from accounts t),
    'cheques',        (select coalesce(jsonb_agg(t), '[]') from cheques t),
    'cheque_status',  (select coalesce(jsonb_agg(t), '[]') from cheque_status t),
    'balances',       (select coalesce(jsonb_agg(t), '[]') from balances t),
    'books',          (select coalesce(jsonb_agg(t), '[]') from books t),
    'profiles',       (select coalesce(jsonb_agg(t), '[]') from profiles t),
    'reminders',      (select coalesce(jsonb_agg(t), '[]') from reminders t),
    'cash_records',   (select coalesce(jsonb_agg(t), '[]') from cash_records t),
    'balance_drafts', (select coalesce(jsonb_agg(t), '[]') from balance_drafts t));
  n := (select count(*) from accounts) + (select count(*) from cheques) + (select count(*) from cheque_status)
     + (select count(*) from balances) + (select count(*) from books) + (select count(*) from reminders) + (select count(*) from cash_records);
  insert into backups(kind, size_rows, data) values (k, n, d) returning id into bid;
  -- retention: 14 days of automatic backups, last 10 manual ones
  delete from backups where kind = 'auto' and at < now() - interval '14 days';
  delete from backups where kind = 'manual' and id not in (select id from backups where kind = 'manual' order by at desc limit 10);
  return bid;
end $$;
revoke all on function public.make_backup(text) from public;
grant execute on function public.make_backup(text) to authenticated;

-- 6) schedule: every day 18:00 UTC = 12:00 AM Bangladesh time
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'nabiad-daily-backup';
select cron.schedule('nabiad-daily-backup', '0 18 * * *', $$select public.make_backup('auto')$$);
