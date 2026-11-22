-- v6.87 — let STAFF register a new cheque book (INSERT only).
-- Editing/deleting books stays admin-only (policy p_bk_w is unchanged).
-- NOT applied automatically: run only after a manual backup:
--     select public.make_backup('manual');
-- Rollback:
--     drop policy if exists p_bk_ins_staff on public.books;

drop policy if exists p_bk_ins_staff on public.books;
create policy p_bk_ins_staff on public.books
  for insert to authenticated
  with check (public.my_role() = 'staff');
