-- Tally Bridge Phase 1 (read-only mirror of TallyPrime data). NOT applied yet.
-- Apply only after the owner's explicit "yes" and select make_backup('manual').
-- Before applying: add tally_ledgers, tally_vouchers (and tally_sync_runs if wanted) to the three backup
-- lists (app.js BACKUP_TABLES, schema_admin_restore.sql, scripts/backup/offsite-backup.sh) in the same PR.

-- The bridge is an ordinary auth user with NO profile (so my_role() is null and it can read nothing else).
-- The admin registers its user id here once: insert into public.tally_bridge_users(user_id) values ('<id>');
create table if not exists public.tally_bridge_users (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.tally_bridge_users enable row level security;
drop policy if exists tbu_admin on public.tally_bridge_users;
create policy tbu_admin on public.tally_bridge_users for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

create or replace function public.is_tally_bridge() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.tally_bridge_users where user_id = auth.uid()) $$;
revoke execute on function public.is_tally_bridge() from public, anon;
grant execute on function public.is_tally_bridge() to authenticated;

create table if not exists public.tally_ledgers (
  company text not null, name text not null, parent text,
  synced_at timestamptz not null default now(),
  primary key (company, name));

create table if not exists public.tally_vouchers (
  company text not null, guid text not null,
  vdate date not null, vtype text, vno text, narration text,
  amount numeric(16,2),                       -- sum of debit side, for quick totals
  entries jsonb not null default '[]'::jsonb, -- [{ledger, amount}] amount < 0 = debit, as Tally exports it
  counter_company text,                       -- set when the other side is another Nabiad company (inter-company)
  alter_id bigint, cancelled boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (company, guid));
create index if not exists tally_vouchers_company_date on public.tally_vouchers (company, vdate);
create index if not exists tally_vouchers_counter on public.tally_vouchers (counter_company) where counter_company is not null;

create table if not exists public.tally_sync_runs (
  id bigserial primary key,
  company text not null, kind text not null default 'daybook',
  from_date date, to_date date,
  started_at timestamptz not null default now(), finished_at timestamptz,
  ok boolean, ledgers int, vouchers int, error text, bridge_version text);

alter table public.tally_ledgers enable row level security;
alter table public.tally_vouchers enable row level security;
alter table public.tally_sync_runs enable row level security;

-- Read: admin and boss only (full financial mirror). Write: only the registered bridge user.
do $$ declare t text; begin
  foreach t in array array['tally_ledgers','tally_vouchers','tally_sync_runs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_r', t);
    execute format('drop policy if exists %I on public.%I', t || '_bi', t);
    execute format('drop policy if exists %I on public.%I', t || '_bu', t);
    execute format('create policy %I on public.%I for select to authenticated using (my_role() in (''admin'',''boss'') or (select is_tally_bridge()))', t || '_r', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select is_tally_bridge()))', t || '_bi', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select is_tally_bridge())) with check ((select is_tally_bridge()))', t || '_bu', t);
  end loop;
end $$;
-- No delete policy: nobody deletes mirrored data through the API.
