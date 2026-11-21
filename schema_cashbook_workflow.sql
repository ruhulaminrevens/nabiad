-- Apply after schema_v6.sql and schema_module_access.sql.
begin;

create or replace function public.cashbook_write(
  p_date date, p_version timestamptz, p_action text,
  p_side text default null, p_index integer default null,
  p_data jsonb default '{}'::jsonb
) returns public.cashbook_days
language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles;
  book public.cashbook_days;
  entries jsonb;
  prior jsonb;
  item jsonb;
  opened numeric;
  reference jsonb;
  fresh boolean;
  local_day date := (now() at time zone 'Asia/Dhaka')::date;
  in_day_window boolean;
  may_enter boolean;
  may_edit boolean;
begin
  select * into actor from public.profiles where id = auth.uid() and active;
  if not found or actor.role not in ('admin','staff') then
    raise exception 'cashbook_permission' using errcode = '42501';
  end if;
  if p_date is null or p_date > local_day then raise exception 'cashbook_date'; end if;
  in_day_window := p_date >= local_day - actor.edit_days;
  may_enter := actor.role = 'admin' or coalesce(public.module_access_flag('cash','entry'), true);
  may_edit := actor.role = 'admin' or coalesce(public.module_access_flag('cash','edit'), true);

  perform pg_advisory_xact_lock(hashtext('nabiad.cashbook'), p_date - date '2000-01-01');
  select * into book from public.cashbook_days where date = p_date for update;
  fresh := not found;
  if (fresh and p_version is not null) or (not fresh and book.updated_at is distinct from p_version) then
    raise exception 'cashbook_conflict' using errcode = '40001';
  end if;
  if fresh then
    if p_action not in ('add','balance','close') or not may_enter or (actor.role = 'staff' and not in_day_window) then
      raise exception 'cashbook_permission' using errcode = '42501';
    end if;
    select q.cash into opened from (
      select b.date, coalesce(b.cash_in_hand, b.opening_cash + b.total_receipt - b.total_payment) as cash, 1 as priority
        from public.cashbook_days b where b.date < p_date and b.status = 'final'
      union all
      select c.date, coalesce(c.cash_in_hand, 0), 0
        from public.cash_records c where c.date < p_date and c.status = 'final'
    ) q order by q.date desc, q.priority desc limit 1;
    book.date := p_date;
    book.opening_cash := coalesce(opened, 0);
    book.lines := '{"r":[],"p":[]}'::jsonb;
    book.status := 'draft';
    book.user_id := actor.id;
  end if;

  if p_action in ('add','edit','delete') then
    if p_side is null or p_side not in ('r','p') then raise exception 'cashbook_side'; end if;
    entries := coalesce(book.lines->p_side, '[]'::jsonb);
    if p_action <> 'add' then
      if p_index is null or p_index < 0 or p_index >= jsonb_array_length(entries) then
        raise exception 'cashbook_conflict' using errcode = '40001';
      end if;
      prior := entries->p_index;
    end if;
    if p_action = 'add' and (not may_enter or (actor.role = 'staff' and not in_day_window)) then
      raise exception 'cashbook_permission' using errcode = '42501';
    elsif p_action = 'edit' and (not may_edit or (actor.role = 'staff'
      and not public.can_edit_cheque((prior->>'uid')::uuid, (prior->>'created_at')::timestamptz))) then
      raise exception 'cashbook_permission' using errcode = '42501';
    elsif p_action = 'delete' and actor.role <> 'admin' then
      raise exception 'cashbook_permission' using errcode = '42501';
    end if;

    if p_action = 'delete' then
      entries := entries - p_index;
    else
      if coalesce(trim(p_data->>'n'), '') = '' or jsonb_typeof(p_data->'a') is distinct from 'number'
         or (p_data->>'a')::numeric = 0 or (p_data->>'a')::numeric <> round((p_data->>'a')::numeric, 2) then
        raise exception 'cashbook_invalid_line';
      end if;
      if coalesce(p_data->>'k','') <> '' and not (
        (p_side = 'r' and p_data->>'k' in ('cz_cos','cz_food','cz_oth','cz_chem','niramoy','dist','suspense','bank_in'))
        or (p_side = 'p' and p_data->>'k' in ('bank_out','lc','loans','supp','p_oth'))
      ) then raise exception 'cashbook_invalid_group'; end if;
      if p_data->>'k' in ('bank_in','bank_out') and not exists (
        select 1 from public.accounts where code = p_data->>'c'
      ) then raise exception 'cashbook_bank_required'; end if;
      item := jsonb_strip_nulls(jsonb_build_object(
        'n', trim(p_data->>'n'), 'a', (p_data->>'a')::numeric,
        'k', nullif(p_data->>'k',''), 'c', case when p_data->>'k' in ('bank_in','bank_out') then p_data->>'c' end,
        'ref', nullif(p_data->>'ref',''), 'note', nullif(p_data->>'note',''),
        'uid', case when p_action = 'add' then actor.id::text else prior->>'uid' end,
        'created_at', case when p_action = 'add' then statement_timestamp()::text else prior->>'created_at' end
      ));
      entries := case when p_action = 'add' then entries || jsonb_build_array(item)
        else jsonb_set(entries, array[p_index::text], item) end;
    end if;
    book.lines := jsonb_set(book.lines, array[p_side], entries);
  elsif p_action in ('balance','close') then
    if actor.role = 'staff' and (not in_day_window or book.user_id is distinct from actor.id
      or (case when book.status = 'final' then not may_edit else not (may_enter or may_edit) end)) then
      raise exception 'cashbook_permission' using errcode = '42501';
    end if;
    if p_data ? 'cash_in_hand' then
      if jsonb_typeof(p_data->'cash_in_hand') not in ('null','number')
        or (book.status = 'final' and p_data->'cash_in_hand' = 'null'::jsonb) then
        raise exception 'cashbook_count_required';
      end if;
      book.cash_in_hand := (p_data->>'cash_in_hand')::numeric;
    end if;
    if p_data ? 'remarks' then book.remarks := nullif(trim(p_data->>'remarks'), ''); end if;
    if p_data ? 'opening_cash' and actor.role = 'admin' then
      book.opening_cash := (p_data->>'opening_cash')::numeric;
    end if;
    if p_action = 'close' then
      if book.cash_in_hand is null then raise exception 'cashbook_count_required'; end if;
      if book.status <> 'final' then
        if exists (
          select 1 from jsonb_array_elements(coalesce(book.lines->'r','[]'::jsonb) || coalesce(book.lines->'p','[]'::jsonb)) l
          where l->>'k' in ('bank_in','bank_out') and not exists (select 1 from public.accounts a where a.code = l->>'c')
        ) then raise exception 'cashbook_bank_required'; end if;
        select jsonb_build_object(
          'at', statement_timestamp(),
          'bank', (select sum(b.total) from public.balances b join public.accounts a on a.code = b.code where a.daily and b.date = p_date),
          'collection', coalesce(sum(c.amount), 0),
          'cash', coalesce(sum(c.amount) filter (where lower(trim(c.account)) = 'cash'), 0)
        ) into reference from public.dist_collections c where c.date = p_date and c.status = 'approved';
        book.lines := jsonb_set(book.lines, '{register}', reference);
        book.status := 'final';
      end if;
    end if;
  else
    raise exception 'cashbook_action';
  end if;

  select coalesce(sum((l->>'a')::numeric),0) into book.total_receipt from jsonb_array_elements(coalesce(book.lines->'r','[]'::jsonb)) l;
  select coalesce(sum((l->>'a')::numeric),0) into book.total_payment from jsonb_array_elements(coalesce(book.lines->'p','[]'::jsonb)) l;
  book.entered_by := actor.name;
  book.updated_at := clock_timestamp();
  insert into public.cashbook_days select (book).*
    on conflict (date) do update set opening_cash = excluded.opening_cash, lines = excluded.lines,
      total_receipt = excluded.total_receipt, total_payment = excluded.total_payment,
      cash_in_hand = excluded.cash_in_hand, remarks = excluded.remarks, status = excluded.status,
      entered_by = excluded.entered_by, updated_at = excluded.updated_at
    returning * into book;
  return book;
end;
$$;

revoke all on function public.cashbook_write(date,timestamptz,text,text,integer,jsonb) from public, anon;
grant execute on function public.cashbook_write(date,timestamptz,text,text,integer,jsonb) to authenticated;
-- Route browser writes through the checked RPC. The audit trigger and privileged restore continue to operate.
revoke insert, update, delete on public.cashbook_days from public, anon, authenticated;
drop trigger if exists module_write_guard on public.cashbook_days;
notify pgrst, 'reload schema';
commit;
