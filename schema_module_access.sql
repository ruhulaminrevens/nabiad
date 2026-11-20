-- Apply after schema_v6.sql. Existing users keep their role defaults until an Admin saves custom access.
begin;

alter table public.profiles add column if not exists module_access jsonb;

create or replace function public.valid_module_access(config jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case when config is null then true
    when jsonb_typeof(config) <> 'object' then false
    else not exists (
      select 1 from jsonb_each(config) as m(key, value)
      where m.key not in ('cheque', 'bank', 'cash', 'collection', 'inventory')
        or jsonb_typeof(m.value) <> 'object'
        or not (m.value ? 'entry' and m.value ? 'edit')
        or jsonb_typeof(m.value->'entry') <> 'boolean'
        or jsonb_typeof(m.value->'edit') <> 'boolean'
        or (m.value - 'entry' - 'edit') <> '{}'::jsonb
    )
  end
$$;

alter table public.profiles drop constraint if exists profiles_module_access_check;
alter table public.profiles add constraint profiles_module_access_check check (public.valid_module_access(module_access));

-- Return NULL for role defaults. Authorization never reads client-supplied user metadata.
create or replace function public.module_access_flag(module_key text, action_key text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare user_role text := public.my_role(); config jsonb;
begin
  if user_role is null then return false; end if;
  if user_role = 'admin' then return true; end if;
  select p.module_access into config from public.profiles p where p.id = auth.uid();
  if config is null then return null; end if;
  return coalesce((config #>> array[module_key, action_key])::boolean, false);
end
$$;
revoke all on function public.module_access_flag(text,text) from public, anon;
grant execute on function public.module_access_flag(text,text) to authenticated;

create or replace function public.admin_set_module_access(target_id uuid, config jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare previous jsonb;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  select p.module_access into previous from public.profiles p where p.id = target_id and p.role <> 'admin' for update;
  if not found then raise exception 'user_not_configurable'; end if;
  if previous is not distinct from config then return; end if;
  update public.profiles set module_access = config where id = target_id;
  insert into public.audit_log(user_name, tbl, action, row_key, old, new)
    values ((select name from public.profiles where id = auth.uid()), 'users', 'update', target_id::text,
      jsonb_build_object('module_access',previous), jsonb_build_object('module_access',config,'event','module_access_changed'));
end
$$;
revoke all on function public.admin_set_module_access(uuid,jsonb) from public, anon;
grant execute on function public.admin_set_module_access(uuid,jsonb) to authenticated;

-- AFTER sees the actual operation on upsert, and also applies to writes made inside existing RPCs.
create or replace function public.check_module_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  action_key text := case when tg_op = 'INSERT' then 'entry' else 'edit' end;
  entry_allowed boolean := public.module_access_flag(tg_argv[0], 'entry');
  allowed boolean;
begin
  -- Maintenance, migrations and system jobs without an end-user identity.
  if auth.uid() is null then return null; end if;
  if tg_argv[1] = 'status' then action_key := 'edit'; end if;
  allowed := public.module_access_flag(tg_argv[0], action_key);
  if tg_argv[1] = 'draft' then
    allowed := public.module_access_flag(tg_argv[0], 'edit') or entry_allowed;
  elsif tg_argv[1] = 'cash_day' and tg_op = 'UPDATE' and to_jsonb(old)->>'status' = 'draft' then
    allowed := allowed or entry_allowed;
  end if;
  if allowed is false then raise exception 'module_access_denied: % %', tg_argv[0], action_key using errcode = '42501'; end if;
  return null;
end
$$;
revoke all on function public.check_module_write() from public, anon, authenticated;

do $$
declare item record; entry text; edit text; extra text; permissions text;
begin
  for item in select * from (values
    ('cheques','cheque','ordinary',true),
    ('cheque_status','cheque','status',true),
    ('cheque_purposes','cheque','ordinary',false),
    ('books','cheque','ordinary',false),
    ('leaf_marks','cheque','leaf',false),
    ('balances','bank','upsert',true),
    ('balance_drafts','bank','draft',true),
    ('cash_records','cash','cash_day',true),
    ('cashbook_days','cash','cash_day',true),
    ('cashbook_ledgers','cash','ordinary',false),
    ('dist_collections','collection','collection',true),
    ('dist_parties','collection','ordinary',false),
    ('dist_asms','collection','ordinary',false),
    ('inv_orders','inventory','orders',true),
    ('inv_demand','inventory','upsert',true),
    ('rm_daily','inventory','upsert',true),
    ('inv_items','inventory','ordinary',false),
    ('inv_locks','inventory','ordinary',false),
    ('rm_products','inventory','ordinary',false),
    ('rm_ledger','inventory','ordinary',false),
    ('dist_opening','inventory','ordinary',false),
    ('dist_sales_reg','inventory','ordinary',false)
  ) as modules(table_name, module_key, kind, delegated)
  loop
    execute format('drop trigger if exists module_write_guard on public.%I', item.table_name);
    execute format('create trigger module_write_guard after insert%s on public.%I for each row execute function public.check_module_write(%L,%L)',
      case when item.kind = 'leaf' then '' when item.kind = 'draft' then ' or update or delete' else ' or update' end,
      item.table_name, item.module_key, item.kind);
    if not item.delegated then continue; end if;
    entry := format('(public.module_access_flag(%L,''entry'') is true)', item.module_key);
    edit := format('(public.module_access_flag(%L,''edit'') is true)', item.module_key);
    extra := case item.kind when 'status' then edit when 'collection' then entry || ' and status = ''pending'''
      when 'draft' then entry || ' or ' || edit when 'upsert' then entry || ' or ' || edit
      when 'cash_day' then entry || ' or ' || edit else entry end;
    execute format('drop policy if exists module_insert on public.%I',item.table_name);
    execute format('create policy module_insert on public.%I for insert to authenticated with check (%s)',item.table_name,extra);
    if item.kind <> 'status' then
      permissions := case item.kind when 'collection' then edit || ' and status = ''pending'''
        when 'orders' then edit || ' and status <> ''cancel'''
        when 'draft' then entry || ' or ' || edit
        when 'cash_day' then edit || ' or (' || entry || ' and status = ''draft'')' else edit end;
      extra := case item.kind when 'collection' then edit || ' and status = ''pending'''
        when 'draft' then entry || ' or ' || edit when 'cash_day' then entry || ' or ' || edit else edit end;
      execute format('drop policy if exists module_update on public.%I',item.table_name);
      execute format('create policy module_update on public.%I for update to authenticated using (%s) with check (%s)',item.table_name,permissions,extra);
    end if;
    if item.kind = 'draft' then
      execute 'drop policy if exists module_draft_read on public.balance_drafts';
      execute format('create policy module_draft_read on public.balance_drafts for select to authenticated using (%s or %s)',entry,edit);
      execute 'drop policy if exists module_draft_delete on public.balance_drafts';
      execute format('create policy module_draft_delete on public.balance_drafts for delete to authenticated using (%s or %s)',entry,edit);
    end if;
  end loop;
end
$$;

do $$
begin
  if to_regclass('public.cheque_statement_verifications') is not null then
    drop trigger if exists module_write_guard on public.cheque_statement_verifications;
    create trigger module_write_guard after insert or update on public.cheque_statement_verifications
      for each row execute function public.check_module_write('cheque','status');
  end if;
end
$$;

create or replace function public.dist_set_status(ids uuid[], st text, note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare r text := my_role(); allowed boolean := public.module_access_flag('collection','edit'); n int; nm text;
begin
  if not coalesce(allowed, r = 'staff', false) then raise exception 'not allowed' using errcode = '42501'; end if;
  if st is null or st not in ('pending','approved','hold','cancelled') then raise exception 'invalid status'; end if;
  if r <> 'admin' and st = 'pending' then raise exception 'not allowed'; end if;
  select name into nm from profiles where id = auth.uid();
  update dist_collections set status = st,
      decided_by = case when st = 'pending' then null else nm end,
      decided_at = case when st = 'pending' then null else now() end,
      decision_note = case when st = 'pending' then null else nullif(btrim(coalesce(note, '')), '') end
    where id = any(ids) and (r = 'admin' or status in ('pending','hold'));
  get diagnostics n = row_count;
  return n;
end
$$;

create or replace function public.set_cheque_photo(cid uuid, p text)
returns void language plpgsql security definer set search_path = public as $$
declare r text := my_role(); allowed boolean := public.module_access_flag('cheque','edit');
begin
  if allowed is true then update cheques set photo = p where id = cid;
  elsif allowed is null and r = 'staff' then
    update cheques set photo = p where id = cid and (photo is null or public.can_edit_cheque(user_id, created_at));
  else raise exception 'not allowed' using errcode = '42501';
  end if;
  if not found then raise exception 'edit_window_closed'; end if;
end
$$;

drop policy if exists module_cheque_photo_allow on storage.objects;
create policy module_cheque_photo_allow on storage.objects for insert to authenticated with check (
  bucket_id = 'cheque-photos' and split_part(name,'/',1) ~ '^[0-9]{4}$'
  and (public.module_access_flag('cheque','entry') is true or public.module_access_flag('cheque','edit') is true)
);
drop policy if exists module_cheque_photo_guard on storage.objects;
create policy module_cheque_photo_guard on storage.objects as restrictive for insert to authenticated with check (
  bucket_id <> 'cheque-photos' or split_part(name,'/',1) !~ '^[0-9]{4}$'
  or coalesce(public.module_access_flag('cheque','entry') or public.module_access_flag('cheque','edit'), true)
);

commit;
