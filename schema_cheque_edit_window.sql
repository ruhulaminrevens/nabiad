-- Apply after schema_v6.sql and schema_module_access.sql.
-- Require ownership and the approved window even when a custom module grants Edit.
begin;

drop policy if exists cheque_entry_edit_window on public.cheques;
create policy cheque_entry_edit_window on public.cheques
  as restrictive for update to authenticated
  using (public.can_edit_cheque(user_id, created_at)
         and public.module_access_flag('cheque', 'edit') is distinct from false)
  with check (public.can_edit_cheque(user_id, created_at)
              and public.module_access_flag('cheque', 'edit') is distinct from false);

commit;
