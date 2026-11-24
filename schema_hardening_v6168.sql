-- v6.168 hardening (from ANALYSIS v6.167 items 3-6). NOT applied automatically.
-- Run only after the owner's explicit "yes" and select make_backup('manual'). Safe to re-run.

-- 3. Trigger / event-trigger functions must not be callable through /rest/v1/rpc.
--    Triggers keep working: EXECUTE is checked when a trigger is created, not when it fires.
revoke execute on function public.audit_trg()              from public, anon, authenticated;
revoke execute on function public.handle_new_user()        from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()        from public, anon, authenticated;
revoke execute on function public.leaf_mark_guard()        from public, anon, authenticated;
revoke execute on function public.leaf_mark_autoresolve()  from public, anon, authenticated;
revoke execute on function public.cheque_upd_guard()       from public, anon, authenticated;
revoke execute on function public.dist_asm_guard()         from public, anon, authenticated;

-- 4. Fixed search_path (advisor WARN function_search_path_mutable).
alter function public.touch_updated_at() set search_path = public;

-- 5. RLS initplan: evaluate auth.uid() once per statement, not per row. Behaviour unchanged.
alter policy p_lm_ins on public.leaf_marks
  with check ((my_role() = any (array['admin','staff'])) and user_id = (select auth.uid()));
alter policy ps_del on public.push_subs using (user_id = (select auth.uid()));
alter policy ps_ins on public.push_subs
  with check (user_id = (select auth.uid()) and my_role() is not null);
alter policy ps_sel on public.push_subs using (user_id = (select auth.uid()));
alter policy ps_upd on public.push_subs
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy p_rem_ins on public.reminders
  with check (my_role() is not null and user_id = (select auth.uid()));
alter policy p_rem_read on public.reminders
  using (my_role() is not null and (user_id = (select auth.uid()) or for_role = 'all'
         or (for_role = 'admin' and my_role() = 'admin') or my_role() = 'admin'));
alter policy p_rem_upd on public.reminders
  using (my_role() is not null and (user_id = (select auth.uid()) or for_role = 'all' or my_role() = 'admin'));

-- 6. Missing foreign-key indexes.
create index if not exists push_subs_user_id_idx  on public.push_subs (user_id);
create index if not exists rm_daily_product_idx   on public.rm_daily (product);
create index if not exists rm_ledger_product_idx  on public.rm_ledger (product);
