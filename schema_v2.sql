-- Nabiad v2 — drafts, reminders, audit log, cheque photos
-- Run ONCE in Supabase → SQL Editor (after schema.sql). Safe to re-run.

-- 1) Daily closing drafts (one row per date; admin + staff)
create table if not exists balance_drafts (
  date date primary key,
  data jsonb not null,
  updated_by text,
  updated_at timestamptz default now()
);
alter table balance_drafts enable row level security;
drop policy if exists p_draft_all on balance_drafts;
create policy p_draft_all on balance_drafts for all to authenticated
  using (my_role() in ('admin','staff')) with check (my_role() in ('admin','staff'));

-- 2) Reminders
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text,
  due_at timestamptz not null,
  snooze_until timestamptz,
  repeat text not null default 'none' check (repeat in ('none','hourly','daily','weekly','monthly')),
  for_role text not null default 'me' check (for_role in ('me','all','admin')),
  kind text default 'custom',
  cheque_id uuid references cheques(id) on delete set null,
  done boolean not null default false,
  done_at timestamptz,
  user_id uuid default auth.uid(),
  created_by text,
  created_at timestamptz default now()
);
create index if not exists reminders_due_idx on reminders(due_at) where not done;
alter table reminders enable row level security;
drop policy if exists p_rem_read on reminders;
drop policy if exists p_rem_ins on reminders;
drop policy if exists p_rem_upd on reminders;
drop policy if exists p_rem_del on reminders;
create policy p_rem_read on reminders for select to authenticated using (
  my_role() is not null and (user_id = auth.uid() or for_role = 'all' or (for_role = 'admin' and my_role() = 'admin') or my_role() = 'admin'));
create policy p_rem_ins on reminders for insert to authenticated with check (my_role() is not null and user_id = auth.uid());
create policy p_rem_upd on reminders for update to authenticated using (
  my_role() is not null and (user_id = auth.uid() or for_role = 'all' or my_role() = 'admin'));
create policy p_rem_del on reminders for delete to authenticated using (user_id = auth.uid() or my_role() = 'admin');

-- 3) Audit log (written only by trigger; admin + boss can read)
create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  user_name text, tbl text, action text, row_key text,
  old jsonb, new jsonb
);
create index if not exists audit_at_idx on audit_log(at desc);
alter table audit_log enable row level security;
drop policy if exists p_audit_read on audit_log;
create policy p_audit_read on audit_log for select to authenticated using (my_role() in ('admin','boss'));

create or replace function public.audit_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; r jsonb; k text; nm text;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  r := coalesce(n, o);
  if r->>'entered_by' = 'Old file (Foysal)' then return null; end if;   -- bulk history import
  if tg_op = 'UPDATE' and o = n then return null; end if;
  k := case tg_table_name
    when 'cheques'  then (r->>'code') || ' · ' || (r->>'chq_no')
    when 'balances' then (r->>'date') || ' · ' || (r->>'code')
    when 'accounts' then r->>'code'
    when 'books'    then (r->>'code') || ' · ' || coalesce(r->>'first_leaf','') || '–' || coalesce(r->>'last_leaf','')
    when 'cheque_status' then coalesce((select code || ' · ' || chq_no from cheques where id = (r->>'cheque_id')::uuid), '?') || ' → ' || (r->>'new_status')
    when 'profiles' then r->>'email'
    else r->>'id' end;
  select name into nm from profiles where id = auth.uid();
  insert into audit_log(user_name, tbl, action, row_key, old, new)
    values (coalesce(nm, 'system'), tg_table_name, lower(tg_op), k, o, n);
  return null;
end $$;

drop trigger if exists audit_cheques on cheques;
create trigger audit_cheques after insert or update or delete on cheques for each row execute function audit_trg();
drop trigger if exists audit_status on cheque_status;
create trigger audit_status after insert or update or delete on cheque_status for each row execute function audit_trg();
drop trigger if exists audit_balances on balances;
create trigger audit_balances after update or delete on balances for each row execute function audit_trg();  -- daily inserts are already stamped with entered_by
drop trigger if exists audit_accounts on accounts;
create trigger audit_accounts after insert or update or delete on accounts for each row execute function audit_trg();
drop trigger if exists audit_books on books;
create trigger audit_books after insert or update or delete on books for each row execute function audit_trg();
drop trigger if exists audit_profiles on profiles;
create trigger audit_profiles after update or delete on profiles for each row execute function audit_trg();

-- 4) Cheque photos (private bucket; signed URLs only)
alter table cheques add column if not exists photo text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('cheque-photos', 'cheque-photos', false, 3145728, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;
drop policy if exists p_photo_read on storage.objects;
drop policy if exists p_photo_ins on storage.objects;
drop policy if exists p_photo_del on storage.objects;
create policy p_photo_read on storage.objects for select to authenticated using (bucket_id = 'cheque-photos' and public.my_role() is not null);
create policy p_photo_ins on storage.objects for insert to authenticated with check (bucket_id = 'cheque-photos' and public.my_role() in ('admin','staff'));
create policy p_photo_del on storage.objects for delete to authenticated using (bucket_id = 'cheque-photos' and public.my_role() = 'admin');

-- staff may attach a photo to a cheque that has none; admin may always replace
create or replace function public.set_cheque_photo(cid uuid, p text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() = 'admin' then update cheques set photo = p where id = cid;
  elsif my_role() = 'staff' then update cheques set photo = p where id = cid and photo is null;
  else raise exception 'not allowed'; end if;
end $$;
grant execute on function public.set_cheque_photo(uuid, text) to authenticated;
