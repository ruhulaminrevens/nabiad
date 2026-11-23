-- v6.126 Tax Help — per-assessment-year Bangladesh income tax rules, edited by Admin in the app.
-- NOT applied automatically. Run once in the Supabase SQL editor AFTER taking a manual backup.
-- The app works without this table (it falls back to built-in rules); the table only lets an Admin add/edit years.
begin;

create table if not exists public.tax_rules (
  ay text primary key check (ay ~ '^[0-9]{4}-[0-9]{2}$'),
  data jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.tax_rules enable row level security;
revoke all on public.tax_rules from anon, authenticated;
grant select, insert, update on public.tax_rules to authenticated;

drop policy if exists tax_rules_read on public.tax_rules;
drop policy if exists tax_rules_insert on public.tax_rules;
drop policy if exists tax_rules_update on public.tax_rules;
create policy tax_rules_read on public.tax_rules
  for select to authenticated using (public.my_role() is not null);
create policy tax_rules_insert on public.tax_rules
  for insert to authenticated with check (public.my_role() = 'admin');
create policy tax_rules_update on public.tax_rules
  for update to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

commit;
