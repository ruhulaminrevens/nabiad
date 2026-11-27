-- Follow-up to schema_distribution_posting_queue.sql. Activation remains opt-in.
-- Rollback: set automatic_enabled=false and clear eligible_from to stop reservations.
begin;

alter table public.distribution_posting_settings
  add column if not exists automatic_enabled boolean not null default false;

create or replace function public.queue_distribution_collection_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.distribution_posting_queue (collection_id, snapshot)
  select new.id, jsonb_build_object(
    'id', new.id, 'date', new.date, 'party_id', new.party_id,
    'amount', new.amount, 'account', new.account, 'created_at', new.created_at,
    'approved_at', new.decided_at
  )
  from public.distribution_posting_settings s
  where s.eligible_from is not null
    and (s.automatic_enabled or new.id = s.pilot_collection_id)
    and new.created_at >= s.eligible_from
    and new.decided_at >= new.created_at
  on conflict (collection_id) do nothing;
  return new;
end;
$$;

create or replace function public.can_process_distribution_pilot(p_collection_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_tally_bridge() and exists (
    select 1 from public.distribution_posting_settings s
    where (s.automatic_enabled or s.pilot_collection_id = p_collection_id)
      and s.pilot_bridge_user_id = auth.uid()
      and s.eligible_from is not null
  );
$$;

create or replace function public.reserve_distribution_collection_send(p_collection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.dist_collections;
begin
  if not public.can_process_distribution_pilot(p_collection_id) then
    return false;
  end if;

  select * into current_row from public.dist_collections
  where id = p_collection_id for update;
  if not found or current_row.status <> 'approved' then
    return false;
  end if;

  update public.distribution_posting_queue q
  set send_reserved_at = clock_timestamp()
  where q.collection_id = p_collection_id and q.send_reserved_at is null
    and exists (
      select 1 from public.distribution_posting_settings s
      where s.eligible_from is not null
        and (s.automatic_enabled or current_row.id = s.pilot_collection_id)
        and current_row.created_at >= s.eligible_from
    )
    and q.snapshot = jsonb_build_object(
      'id', current_row.id, 'date', current_row.date, 'party_id', current_row.party_id,
      'amount', current_row.amount, 'account', current_row.account,
      'created_at', current_row.created_at, 'approved_at', current_row.decided_at
    );
  return found;
end;
$$;

create or replace function public.list_distribution_posting_work()
returns table (collection_id uuid)
language sql stable security definer set search_path = ''
as $$
  select q.collection_id
  from public.distribution_posting_queue q
  join public.dist_collections c on c.id = q.collection_id
  join public.distribution_posting_settings s on s.singleton
  where s.automatic_enabled
    and public.can_process_distribution_pilot(q.collection_id)
    and q.verified_at is null and c.status = 'approved'
    and c.created_at >= s.eligible_from
  order by q.queued_at, q.collection_id
  limit 100;
$$;

revoke all on function public.list_distribution_posting_work() from public, anon, authenticated;
grant execute on function public.list_distribution_posting_work() to authenticated;

commit;
