-- Apply after schema_v6.sql and the current cash and cheque migrations.
begin;

create or replace function public.nabiad_restore_tables() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'accounts','dist_asms','dist_parties','inv_items','rm_products','cheque_purposes',
    'cheques','cheque_status','cheque_statement_verifications','books','balances','balance_drafts',
    'reminders','cash_records','cashbook_days','cashbook_ledgers','cash_group_names',
    'cash_tally_vouchers','dist_collections','dist_opening','dist_sales_reg',
    'inv_demand','inv_orders','rm_daily','rm_ledger','inv_locks'
  ]::text[]
$$;

-- Reuse the same table registry for new snapshots. Profiles and leaf history
-- remain available in snapshot exports for separate recovery.
create or replace function public.nabiad_capture_snapshot(snapshot_kind text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  name text;
  queries text[] := array[]::text[];
  snapshot_id bigint;
begin
  foreach name in array public.nabiad_restore_tables() || array['profiles','leaf_marks'] loop
    if to_regclass(format('public.%I', name)) is null then continue; end if;
    queries := array_append(queries, format(
      'select %L as key, coalesce(jsonb_agg(t), ''[]''::jsonb) as entries from public.%I t', name, name
    ));
  end loop;

  execute
    'insert into public.backups(kind, size_rows, data)
     select $1, coalesce(sum(jsonb_array_length(entries)), 0)::integer,
            jsonb_build_object(''taken_at'',now()) || jsonb_object_agg(key, entries)
     from (' || array_to_string(queries, ' union all ') || ') snapshot
     returning id'
  into snapshot_id using snapshot_kind;
  return snapshot_id;
end $$;

create or replace function public.make_backup(k text default 'auto') returns bigint
language plpgsql security definer set search_path = '' as $$
declare bid bigint;
begin
  if (auth.uid() is not null or current_setting('role', true) = 'authenticated')
    and public.my_role() is distinct from 'admin' then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  bid := public.nabiad_capture_snapshot(k);
  delete from public.backups where kind = 'auto' and at < now() - interval '14 days';
  delete from public.backups where kind = 'manual' and id not in (
    select id from public.backups where kind = 'manual' order by at desc, id desc limit 10
  );
  return bid;
end $$;

-- Preview checks primary keys without running triggers.
-- Apply creates a recovery point, then inserts missing rows in dependency order.
create or replace function public.nabiad_restore_payload(
  payload jsonb, p_backup_id bigint, p_apply boolean, p_tables text[]
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  allowed_tables text[] := public.nabiad_restore_tables();
  results jsonb := '[]';
  skipped jsonb;
  name text;
  rel regclass;
  entries jsonb;
  keys text;
  nonnull_keys text;
  cols text;
  src_cols text;
  first_entry jsonb;
  missing integer;
  inserted integer;
  total_inserted integer := 0;
  restore_point bigint;
  seq record;
  seq_last bigint;
  seq_called boolean;
  max_id bigint;
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if p_apply is null or (p_apply and coalesce(cardinality(p_tables), 0) = 0)
    or (p_tables is not null and (array_position(p_tables, null) is not null or not (p_tables <@ allowed_tables))) then
    raise exception 'invalid_restore_selection';
  end if;
  if p_apply then perform pg_advisory_xact_lock(62026, 124); end if;

  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'snapshot_unavailable';
  end if;
  select coalesce(jsonb_agg(entry.key order by entry.key), '[]') into skipped
  from jsonb_each(payload) entry
  where jsonb_typeof(entry.value) = 'array' and not (entry.key = any(allowed_tables));

  if p_apply then
    foreach name in array allowed_tables loop
      if name = any(p_tables) and jsonb_typeof(payload -> name) = 'array'
        and to_regclass(format('public.%I', name)) is not null then
        execute format('lock table public.%I in share row exclusive mode', name);
      end if;
    end loop;
    if 'cheques' = any(p_tables) and to_regclass('public.leaf_marks') is not null then
      lock table public.leaf_marks in share row exclusive mode;
    end if;
  end if;

  foreach name in array allowed_tables loop
    if p_tables is not null and not (name = any(p_tables)) then continue; end if;
    entries := payload -> name;
    if entries is null then continue; end if;
    rel := to_regclass(format('public.%I', name));
    if rel is null then
      results := results || jsonb_build_array(jsonb_build_object('table',name,'unavailable',true));
      continue;
    end if;
    if jsonb_typeof(entries) <> 'array' then raise exception 'invalid_snapshot_table: %', name; end if;
    if jsonb_array_length(entries) = 0 then
      results := results || jsonb_build_array(jsonb_build_object('table',name,'snapshot',0,'missing',0,'inserted',0));
      continue;
    end if;

    select string_agg(format('dst.%1$I = src.%1$I', a.attname), ' and '),
           string_agg(format('src.%I is not null', a.attname), ' and ')
    into keys, nonnull_keys
    from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
    where i.indrelid=rel and i.indisprimary;
    if keys is null then raise exception 'restore_key_missing: %', name; end if;

    execute format(
      'select count(*) from jsonb_populate_recordset(null::%s,$1) src
       where %s and not exists (select 1 from %s dst where %s)',
      rel, nonnull_keys, rel, keys
    ) into missing using entries;

    inserted := 0;
    if p_apply and missing > 0 then
      if restore_point is null then restore_point := public.nabiad_capture_snapshot('restore_point'); end if;
      -- Reposting a cheque would auto-resolve existing leaf marks. Keep that
      -- reconciliation explicit and roll back the restore when it is needed.
      if name = 'cheques' and to_regclass('public.leaf_marks') is not null and exists (
        select 1 from jsonb_populate_recordset(null::public.cheques, entries) src
        join public.leaf_marks lm on lm.code=src.code and lm.leaf_no=src.chq_no and not lm.resolved
        where not exists (select 1 from public.cheques dst where dst.id=src.id or (dst.code=src.code and dst.chq_no=src.chq_no))
      ) then
        raise exception 'restore_blocked_by_open_leaf_mark';
      end if;

      first_entry := entries -> 0;
      select string_agg(format('%I', attname), ',' order by attnum),
             string_agg(format('src.%I', attname), ',' order by attnum)
      into cols, src_cols from pg_attribute
      where attrelid=rel and attnum>0 and not attisdropped and attgenerated='' and first_entry ? attname;
      if cols is null then raise exception 'invalid_snapshot_columns: %', name; end if;
      begin
        execute format(
          'insert into %s (%s) overriding system value
           select %s from jsonb_populate_recordset(null::%s,$1) src
           where %s and not exists (select 1 from %s dst where %s)
           on conflict do nothing', rel,cols,src_cols,rel,nonnull_keys,rel,keys
        ) using entries;
        get diagnostics inserted = row_count;
      exception when foreign_key_violation or check_violation or not_null_violation or raise_exception then
        raise exception 'restore_table_failed: % (%)', name, sqlstate;
      end;
      total_inserted := total_inserted + inserted;

      if inserted > 0 then
        for seq in
          select a.attname, pg_get_serial_sequence(format('public.%I',name),a.attname) as name
          from pg_attribute a where a.attrelid=rel and a.attnum>0 and not a.attisdropped
        loop
          if seq.name is null then continue; end if;
          execute format('select max(%I) from %s',seq.attname,rel) into max_id;
          execute format('select last_value,is_called from %s',seq.name::regclass) into seq_last,seq_called;
          if max_id >= seq_last + seq_called::integer then
            execute format('alter sequence %s restart with %s',seq.name::regclass,max_id+1);
          end if;
        end loop;
      end if;
    end if;
    results := results || jsonb_build_array(jsonb_build_object(
      'table',name,'snapshot',jsonb_array_length(entries),'missing',missing,'inserted',inserted
    ));
  end loop;

  if p_apply and restore_point is not null then
    insert into public.audit_log(user_name,tbl,action,row_key,new)
    values ((select profile.name from public.profiles profile where profile.id=auth.uid()), 'backups','insert',coalesce(p_backup_id::text, 'uploaded_backup'),
      jsonb_build_object('event','snapshot_restore','restore_point',restore_point,'inserted',total_inserted,'tables',results));
  end if;
  return jsonb_build_object('tables',results,'excluded',skipped,'inserted',total_inserted,'restore_point',restore_point);
end $$;

create or replace function public.nabiad_restore_snapshot(
  p_backup_id bigint, p_apply boolean default false, p_tables text[] default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb;
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  select data into snapshot from public.backups where id = p_backup_id;
  return public.nabiad_restore_payload(snapshot, p_backup_id, p_apply, p_tables);
end $$;

-- Uploaded backups use the same restore transaction and stay out of backup history.
create or replace function public.nabiad_restore_uploaded_backup(
  p_data jsonb, p_apply boolean default false, p_tables text[] default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object'
    or jsonb_typeof(p_data -> 'taken_at') is distinct from 'string'
    or pg_column_size(p_data) > 25 * 1024 * 1024 then
    raise exception 'invalid_backup_file';
  end if;
  if not exists (
    select 1 from jsonb_each(p_data) entry
    where entry.key = any(public.nabiad_restore_tables())
      and case when jsonb_typeof(entry.value) = 'array' then jsonb_array_length(entry.value) > 0 else false end
  ) then
    raise exception 'invalid_backup_file';
  end if;
  return public.nabiad_restore_payload(p_data, null, p_apply, p_tables);
end $$;

revoke all on function public.nabiad_restore_tables(), public.nabiad_capture_snapshot(text),
  public.nabiad_restore_payload(jsonb,bigint,boolean,text[]) from public, anon, authenticated;
revoke all on function public.nabiad_restore_snapshot(bigint,boolean,text[]),
  public.nabiad_restore_uploaded_backup(jsonb,boolean,text[]), public.make_backup(text) from public, anon;
grant execute on function public.nabiad_restore_snapshot(bigint,boolean,text[]),
  public.nabiad_restore_uploaded_backup(jsonb,boolean,text[]), public.make_backup(text) to authenticated;
commit;
