-- Draft: queue eligible approvals for Distribution posting.
-- Activation is opt-in. Existing collections are never queued by this migration.
begin;

create table if not exists public.distribution_posting_settings (
  singleton boolean primary key default true check (singleton),
  eligible_from timestamptz,
  pilot_collection_id uuid,
  pilot_bridge_user_id uuid
);

insert into public.distribution_posting_settings (singleton)
values (true) on conflict do nothing;

create table if not exists public.distribution_posting_queue (
  -- Retain the posting reference even if an admin deletes the collection.
  collection_id uuid primary key,
  snapshot jsonb not null,
  queued_at timestamptz not null default now(),
  send_reserved_at timestamptz
);

alter table public.distribution_posting_settings enable row level security;
alter table public.distribution_posting_queue enable row level security;
revoke all on public.distribution_posting_settings from public, anon, authenticated;
revoke all on public.distribution_posting_queue from public, anon, authenticated;

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
    and new.id = s.pilot_collection_id
    and new.created_at >= s.eligible_from
    and new.decided_at >= new.created_at
  on conflict (collection_id) do nothing;
  return new;
end;
$$;

revoke all on function public.queue_distribution_collection_approval()
  from public, anon, authenticated;

drop trigger if exists queue_distribution_collection_approval on public.dist_collections;
create trigger queue_distribution_collection_approval
after update of status on public.dist_collections
for each row
when (old.status is distinct from new.status and new.status = 'approved')
execute function public.queue_distribution_collection_approval();

-- Only the explicitly selected Bridge account may process the pilot.
create or replace function public.can_process_distribution_pilot(p_collection_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_tally_bridge() and exists (
    select 1 from public.distribution_posting_settings s
    where s.pilot_collection_id = p_collection_id
      and s.pilot_bridge_user_id = auth.uid()
      and s.eligible_from is not null
  );
$$;

revoke all on function public.can_process_distribution_pilot(uuid)
  from public, anon, authenticated;

-- Reserve a send exactly once and invalidate snapshots changed after approval.
-- An existing reservation with no visible voucher requires manual reconciliation.
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
        and current_row.id = s.pilot_collection_id
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

revoke all on function public.reserve_distribution_collection_send(uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_distribution_collection_send(uuid) to authenticated;

-- Keep the verified voucher identity even if its source collection is later cancelled.
alter table public.distribution_posting_queue
  add column if not exists tally_guid text unique,
  add column if not exists tally_voucher_number text,
  add column if not exists tally_alter_id text,
  add column if not exists tally_master_id text,
  add column if not exists verified_at timestamptz,
  add column if not exists manual_completed_at timestamptz,
  add column if not exists manual_completed_by uuid;

create or replace function public.get_distribution_posting_pilot(p_collection_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select q.snapshot || jsonb_build_object(
    'amount', q.snapshot->>'amount', 'eligible_from', s.eligible_from
  )
  from public.distribution_posting_queue q
  cross join public.distribution_posting_settings s
  where q.collection_id = p_collection_id
    and q.verified_at is null
    and public.can_process_distribution_pilot(p_collection_id);
$$;

revoke all on function public.get_distribution_posting_pilot(uuid)
  from public, anon, authenticated;
grant execute on function public.get_distribution_posting_pilot(uuid)
  to authenticated;

create or replace function public.confirm_distribution_collection_send(
  p_collection_id uuid, p_tally_guid text, p_voucher_number text, p_alter_id text default null, p_master_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_process_distribution_pilot(p_collection_id) then
    return false;
  end if;

  if nullif(btrim(p_tally_guid), '') is null
    or nullif(btrim(p_voucher_number), '') is null then
    return false;
  end if;

  update public.distribution_posting_queue
  set tally_guid = p_tally_guid,
      tally_voucher_number = p_voucher_number,
      tally_master_id = case when verified_at is null then p_master_id else tally_master_id end,
      tally_alter_id = case when verified_at is null then p_alter_id else tally_alter_id end,
      verified_at = coalesce(verified_at, clock_timestamp())
  where collection_id = p_collection_id
    and send_reserved_at is not null
    and (
      verified_at is null
      or (tally_guid = p_tally_guid and tally_voucher_number = p_voucher_number)
    );
  return found;
end;
$$;

revoke all on function public.confirm_distribution_collection_send(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.confirm_distribution_collection_send(uuid, text, text, text, text)
  to authenticated;

-- Expose only the pilot status and voucher number to admins.
create or replace function public.distribution_collection_posting_status(p_collection_ids uuid[])
returns table (collection_id uuid, tally_voucher_number text, posting_status text)
language sql
stable
security definer
set search_path = ''
as $$
  select q.collection_id, q.tally_voucher_number,
    case
      when q.verified_at is not null and c.status = 'cancelled' then
        case when q.manual_completed_at is null then 'manual_pending' else 'manual_complete' end
      when q.verified_at is not null then 'posted'
      when q.send_reserved_at is not null then 'verification_pending'
      else 'queued'
    end
  from public.distribution_posting_queue q
  join public.dist_collections c on c.id = q.collection_id
  where public.my_role() = 'admin'
    and q.collection_id = any(p_collection_ids);
$$;

revoke all on function public.distribution_collection_posting_status(uuid[])
  from public, anon, authenticated;
grant execute on function public.distribution_collection_posting_status(uuid[])
  to authenticated;

create or replace function public.complete_distribution_manual_cancel(p_collection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.my_role() is distinct from 'admin' or auth.uid() is null then
    return false;
  end if;

  perform 1 from public.dist_collections
  where id = p_collection_id and status = 'cancelled' for update;
  if not found then
    return false;
  end if;

  update public.distribution_posting_queue
  set manual_completed_at = coalesce(manual_completed_at, clock_timestamp()),
      manual_completed_by = coalesce(manual_completed_by, auth.uid())
  where collection_id = p_collection_id and verified_at is not null;
  return found;
end;
$$;

revoke all on function public.complete_distribution_manual_cancel(uuid)
  from public, anon, authenticated;
grant execute on function public.complete_distribution_manual_cancel(uuid)
  to authenticated;

create table if not exists public.distribution_posting_correction_approvals (
  approval_id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.distribution_posting_queue(collection_id),
  previous_snapshot jsonb not null,
  approved_snapshot jsonb not null,
  tally_guid text not null,
  tally_alter_id text not null,
  approved_by uuid not null,
  approved_at timestamptz not null default clock_timestamp(),
  send_reserved_at timestamptz,
  unique (collection_id, tally_alter_id, approved_snapshot)
);

alter table public.distribution_posting_correction_approvals enable row level security;
revoke all on public.distribution_posting_correction_approvals from public, anon, authenticated;

-- The expected snapshot must match exactly what the approver saw.
create or replace function public.approve_distribution_posting_correction(
  p_collection_id uuid, p_expected_snapshot jsonb, p_expected_alter_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  collection_row public.dist_collections;
  posting public.distribution_posting_queue;
  proposed jsonb;
  previous_values jsonb;
  approval uuid;
begin
  if public.my_role() is distinct from 'admin' or auth.uid() is null then
    return null;
  end if;
  select * into collection_row from public.dist_collections
  where id = p_collection_id and status = 'approved' for update;
  if not found then
    return null;
  end if;

  select * into posting from public.distribution_posting_queue
  where collection_id = p_collection_id and verified_at is not null for update;
  if not found or nullif(btrim(posting.tally_alter_id), '') is null
    or posting.tally_alter_id is distinct from p_expected_alter_id then
    return null;
  end if;

  proposed := jsonb_build_object(
    'date', collection_row.date, 'party_id', collection_row.party_id,
    'amount', collection_row.amount, 'account', collection_row.account
  );
  previous_values := posting.snapshot - array['id', 'created_at', 'approved_at'];
  if proposed is distinct from p_expected_snapshot or proposed = previous_values then
    return null;
  end if;

  insert into public.distribution_posting_correction_approvals (
    collection_id, previous_snapshot, approved_snapshot, tally_guid, tally_alter_id, approved_by
  ) values (
    p_collection_id, previous_values, proposed, posting.tally_guid, posting.tally_alter_id, auth.uid()
  )
  on conflict (collection_id, tally_alter_id, approved_snapshot) do nothing
  returning approval_id into approval;

  if approval is null then
    select approval_id into approval from public.distribution_posting_correction_approvals
    where collection_id = p_collection_id and tally_alter_id = posting.tally_alter_id
      and approved_snapshot = proposed;
  end if;
  return approval;
end;
$$;

revoke all on function public.approve_distribution_posting_correction(uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.approve_distribution_posting_correction(uuid, jsonb, text)
  to authenticated;

create or replace function public.preview_distribution_posting_correction(p_collection_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'before', previous.snapshot, 'after', proposed.snapshot,
    'before_party', old_party.name, 'after_party', c.party,
    'voucher_number', q.tally_voucher_number, 'alter_id', q.tally_alter_id
  )
  from public.dist_collections c
  join public.distribution_posting_queue q on q.collection_id = c.id
  cross join lateral (select q.snapshot - array['id', 'created_at', 'approved_at'] as snapshot) previous
  cross join lateral (select jsonb_build_object(
    'date', c.date, 'party_id', c.party_id, 'amount', c.amount, 'account', c.account
  ) as snapshot) proposed
  left join public.dist_parties old_party on old_party.id = (previous.snapshot->>'party_id')::uuid
  where public.my_role() = 'admin'
    and c.id = p_collection_id and c.status = 'approved'
    and q.verified_at is not null and nullif(btrim(q.tally_alter_id), '') is not null
    and proposed.snapshot is distinct from previous.snapshot;
$$;

revoke all on function public.preview_distribution_posting_correction(uuid)
  from public, anon, authenticated;
grant execute on function public.preview_distribution_posting_correction(uuid)
  to authenticated;

create unique index if not exists distribution_posting_one_correction_per_revision
  on public.distribution_posting_correction_approvals (collection_id, tally_alter_id)
  where send_reserved_at is not null;

create or replace function public.reserve_distribution_correction_send(
  p_collection_id uuid, p_approval_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  collection_row public.dist_collections;
  posting public.distribution_posting_queue;
begin
  if not public.can_process_distribution_pilot(p_collection_id) then
    return false;
  end if;
  select * into collection_row from public.dist_collections
  where id = p_collection_id and status = 'approved' for update;
  if not found then
    return false;
  end if;
  select * into posting from public.distribution_posting_queue
  where collection_id = p_collection_id and verified_at is not null for update;
  if not found or posting.tally_master_id is null or posting.tally_master_id !~ '^[0-9]+$' then
    return false;
  end if;

  update public.distribution_posting_correction_approvals a
  set send_reserved_at = clock_timestamp()
  where a.approval_id = p_approval_id and a.collection_id = p_collection_id
    and a.send_reserved_at is null and a.tally_guid = posting.tally_guid
    and a.tally_alter_id = posting.tally_alter_id
    and a.approved_snapshot = jsonb_build_object(
      'date', collection_row.date, 'party_id', collection_row.party_id,
      'amount', collection_row.amount, 'account', collection_row.account
    )
    and not exists (
      select 1 from public.distribution_posting_correction_approvals prior
      where prior.collection_id = a.collection_id
        and prior.tally_alter_id = a.tally_alter_id and prior.send_reserved_at is not null
    );
  return found;
end;
$$;

revoke all on function public.reserve_distribution_correction_send(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_distribution_correction_send(uuid, uuid)
  to authenticated;

create or replace function public.get_distribution_posting_correction(
  p_collection_id uuid, p_approval_id uuid
)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'before', a.previous_snapshot, 'after', a.approved_snapshot, 'reserved', a.send_reserved_at is not null,
    'guid', q.tally_guid, 'master_id', q.tally_master_id,
    'voucher_number', q.tally_voucher_number, 'alter_id', q.tally_alter_id
  )
  from public.distribution_posting_correction_approvals a
  join public.distribution_posting_queue q on q.collection_id = a.collection_id
  where a.approval_id = p_approval_id and a.collection_id = p_collection_id
    and a.tally_guid = q.tally_guid and a.tally_alter_id = q.tally_alter_id
    and public.can_process_distribution_pilot(p_collection_id);
$$;

create or replace function public.confirm_distribution_correction_send(
  p_collection_id uuid, p_approval_id uuid, p_guid text, p_master_id text,
  p_voucher_number text, p_alter_id text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_process_distribution_pilot(p_collection_id)
    or nullif(btrim(p_alter_id), '') is null
    or nullif(btrim(p_voucher_number), '') is null then
    return false;
  end if;

  update public.distribution_posting_queue q
  set snapshot = q.snapshot || a.approved_snapshot,
      tally_alter_id = p_alter_id,
      tally_voucher_number = p_voucher_number,
      verified_at = clock_timestamp()
  from public.distribution_posting_correction_approvals a
  where a.approval_id = p_approval_id and a.collection_id = p_collection_id
    and q.collection_id = a.collection_id and a.send_reserved_at is not null
    and q.tally_guid = a.tally_guid and q.tally_guid = p_guid
    and q.tally_master_id = p_master_id
    and q.tally_alter_id = a.tally_alter_id and p_alter_id <> a.tally_alter_id;
  return found;
end;
$$;

revoke all on function public.get_distribution_posting_correction(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.confirm_distribution_correction_send(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.get_distribution_posting_correction(uuid, uuid) to authenticated;
grant execute on function public.confirm_distribution_correction_send(uuid, uuid, text, text, text, text)
  to authenticated;

commit;
