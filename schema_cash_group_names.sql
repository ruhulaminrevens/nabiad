-- Apply after schema_module_access.sql. Existing voucher and cash data need no rewrite.
begin;

create table if not exists public.cash_group_names (
  group_key text primary key check (group_key in (
    'cz_cos', 'cz_food', 'cz_oth', 'cz_chem', 'niramoy', 'dist', 'suspense',
    'bank_in', 'bank_out', 'lc', 'loans', 'supp', 'p_oth'
  )),
  label text not null check (label = btrim(label) and char_length(label) between 1 and 120)
);

alter table public.cash_group_names enable row level security;
revoke all on public.cash_group_names from anon, authenticated;
grant select, insert, update on public.cash_group_names to authenticated;

drop policy if exists cash_group_names_read on public.cash_group_names;
drop policy if exists cash_group_names_insert on public.cash_group_names;
drop policy if exists cash_group_names_update on public.cash_group_names;
create policy cash_group_names_read on public.cash_group_names
  for select to authenticated using (public.my_role() is not null);
create policy cash_group_names_insert on public.cash_group_names
  for insert to authenticated with check (
    public.my_role() in ('admin', 'staff') and coalesce(public.module_access_flag('cash', 'edit'), true)
  );
create policy cash_group_names_update on public.cash_group_names
  for update to authenticated
  using (public.my_role() in ('admin', 'staff') and coalesce(public.module_access_flag('cash', 'edit'), true))
  with check (public.my_role() in ('admin', 'staff') and coalesce(public.module_access_flag('cash', 'edit'), true));

drop trigger if exists audit_cash_group_names on public.cash_group_names;
create trigger audit_cash_group_names after insert or update on public.cash_group_names
  for each row execute function public.audit_trg();

commit;
