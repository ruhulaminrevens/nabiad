-- Nabiad v6.15 — Distribution Collection (daily collection record, party master, approval workflow)
-- Run ONCE in Supabase → SQL Editor (after schema.sql … schema_v5.sql). Safe to re-run.

-- 0) helper: keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- 1) distribution parties (master list; each party belongs to one ASM / salesman)
create table if not exists dist_parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  asm text,                       -- ASM / RSM / salesman responsible for the party
  account text,                   -- usual deposit account (e.g. DBBL-17); pre-fills the entry form
  phone text,
  note text,
  active boolean not null default true,
  entered_by text,
  user_id uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table dist_parties add column if not exists district text;
alter table dist_parties add column if not exists division text;
create index if not exists dist_parties_dist_ix on dist_parties (district);
create unique index if not exists dist_parties_name_uq on dist_parties (lower(btrim(name)));
create index if not exists dist_parties_asm_ix on dist_parties (asm);

-- 2) collections (one row per deposit; pending → approved / hold / cancelled after the bank statement check)
create table if not exists dist_collections (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  party_id uuid references dist_parties(id) on delete set null,
  party text not null,            -- name snapshot (history stays correct if a party is renamed)
  asm text,                       -- ASM snapshot
  account text,                   -- deposit account code, free text (Cash, bKash, Unknown … allowed)
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','approved','hold','cancelled')),
  remarks text,
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  entered_by text,
  user_id uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists dist_col_date_ix on dist_collections (date);
create index if not exists dist_col_status_ix on dist_collections (status);
create index if not exists dist_col_party_ix on dist_collections (party_id);

drop trigger if exists touch_dist_parties on dist_parties;
create trigger touch_dist_parties before update on dist_parties for each row execute function touch_updated_at();
drop trigger if exists touch_dist_col on dist_collections;
create trigger touch_dist_col before update on dist_collections for each row execute function touch_updated_at();

-- 3) row-level security
alter table dist_parties enable row level security;
alter table dist_collections enable row level security;
drop policy if exists p_dpar_read on dist_parties;
drop policy if exists p_dpar_ins on dist_parties;
drop policy if exists p_dpar_upd on dist_parties;
drop policy if exists p_dpar_del on dist_parties;
create policy p_dpar_read on dist_parties for select to authenticated using (my_role() is not null);
create policy p_dpar_ins  on dist_parties for insert to authenticated with check (my_role() in ('admin','staff'));
create policy p_dpar_upd  on dist_parties for update to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create policy p_dpar_del  on dist_parties for delete to authenticated using (my_role() = 'admin');

drop policy if exists p_dcol_read on dist_collections;
drop policy if exists p_dcol_ins on dist_collections;
drop policy if exists p_dcol_upd on dist_collections;
drop policy if exists p_dcol_del on dist_collections;
create policy p_dcol_read on dist_collections for select to authenticated using (my_role() is not null);
-- staff can only add PENDING rows; the approval step is separate (dist_set_status)
create policy p_dcol_ins on dist_collections for insert to authenticated
  with check (my_role() = 'admin' or (my_role() = 'staff' and status = 'pending'));
-- staff may correct a row only while it is still pending (and cannot change its status here)
create policy p_dcol_upd on dist_collections for update to authenticated
  using (my_role() = 'admin' or (my_role() = 'staff' and status = 'pending'))
  with check (my_role() = 'admin' or (my_role() = 'staff' and status = 'pending'));
create policy p_dcol_del on dist_collections for delete to authenticated using (my_role() = 'admin');

-- 4) approval: admin can set any status; staff can decide pending / hold rows only (approved / cancelled stay locked)
create or replace function public.dist_set_status(ids uuid[], st text, note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare r text := my_role(); n int; nm text;
begin
  if r is null or r not in ('admin','staff') then raise exception 'not allowed'; end if;
  if st not in ('pending','approved','hold','cancelled') then raise exception 'invalid status'; end if;
  if r = 'staff' and st = 'pending' then raise exception 'not allowed'; end if;
  select name into nm from profiles where id = auth.uid();
  update dist_collections set
      status = st,
      decided_by = case when st = 'pending' then null else nm end,
      decided_at = case when st = 'pending' then null else now() end,
      decision_note = case when st = 'pending' then null else nullif(btrim(coalesce(note, '')), '') end
    where id = any(ids) and (r = 'admin' or status in ('pending','hold'));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.dist_set_status(uuid[], text, text) from public;
grant execute on function public.dist_set_status(uuid[], text, text) to authenticated;

-- 5) audit: extend the trigger function (same as v3 + the two new tables)
create or replace function public.audit_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; r jsonb; k text; nm text;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  r := coalesce(n, o);
  if r->>'entered_by' = 'Old file (Foysal)' then return null; end if;
  if tg_op = 'UPDATE' and o = n then return null; end if;
  k := case tg_table_name
    when 'cheques'  then (r->>'code') || ' · ' || (r->>'chq_no')
    when 'balances' then (r->>'date') || ' · ' || (r->>'code')
    when 'accounts' then r->>'code'
    when 'books'    then (r->>'code') || ' · ' || coalesce(r->>'first_leaf','') || '–' || coalesce(r->>'last_leaf','')
    when 'cheque_status' then coalesce((select code || ' · ' || chq_no from cheques where id = (r->>'cheque_id')::uuid), '?') || ' → ' || (r->>'new_status')
    when 'profiles' then r->>'email'
    when 'cash_records' then 'Cash ' || (r->>'date') || ' (' || (r->>'status') || ')'
    when 'dist_collections' then 'Collection ' || (r->>'date') || ' · ' || (r->>'party') || ' · ' || (r->>'amount')
    when 'dist_parties' then 'Party ' || (r->>'name')
    else r->>'id' end;
  select name into nm from profiles where id = auth.uid();
  insert into audit_log(user_name, tbl, action, row_key, old, new)
    values (coalesce(nm, 'system'), tg_table_name, lower(tg_op), k, o, n);
  return null;
end $$;
drop trigger if exists audit_dcol on dist_collections;
create trigger audit_dcol after insert or update or delete on dist_collections for each row execute function audit_trg();
drop trigger if exists audit_dpar on dist_parties;
create trigger audit_dpar after insert or update or delete on dist_parties for each row execute function audit_trg();

-- 6) nightly backup now includes both tables (same as v3 + 2 tables)
create or replace function public.make_backup(k text default 'auto') returns bigint
language plpgsql security definer set search_path = public as $$
declare d jsonb; n int; bid bigint;
begin
  if auth.uid() is not null and coalesce(my_role(), '') <> 'admin' then raise exception 'not allowed'; end if;
  d := jsonb_build_object(
    'taken_at', now(),
    'accounts',         (select coalesce(jsonb_agg(t), '[]') from accounts t),
    'cheques',          (select coalesce(jsonb_agg(t), '[]') from cheques t),
    'cheque_status',    (select coalesce(jsonb_agg(t), '[]') from cheque_status t),
    'balances',         (select coalesce(jsonb_agg(t), '[]') from balances t),
    'books',            (select coalesce(jsonb_agg(t), '[]') from books t),
    'profiles',         (select coalesce(jsonb_agg(t), '[]') from profiles t),
    'reminders',        (select coalesce(jsonb_agg(t), '[]') from reminders t),
    'cash_records',     (select coalesce(jsonb_agg(t), '[]') from cash_records t),
    'balance_drafts',   (select coalesce(jsonb_agg(t), '[]') from balance_drafts t),
    'dist_parties',     (select coalesce(jsonb_agg(t), '[]') from dist_parties t),
    'dist_collections', (select coalesce(jsonb_agg(t), '[]') from dist_collections t));
  n := (select count(*) from accounts) + (select count(*) from cheques) + (select count(*) from cheque_status)
     + (select count(*) from balances) + (select count(*) from books) + (select count(*) from reminders) + (select count(*) from cash_records)
     + (select count(*) from dist_parties) + (select count(*) from dist_collections);
  insert into backups(kind, size_rows, data) values (k, n, d) returning id into bid;
  delete from backups where kind = 'auto' and at < now() - interval '14 days';
  delete from backups where kind = 'manual' and id not in (select id from backups where kind = 'manual' order by at desc limit 10);
  return bid;
end $$;
revoke all on function public.make_backup(text) from public;
grant execute on function public.make_backup(text) to authenticated;

-- ============ v6.19 — richer party record, ASM master list, "never orphan history" ============
alter table dist_parties add column if not exists contact_person text;
alter table dist_parties add column if not exists address text;

-- a party that has collection records can no longer be deleted (was: party_id silently set to null)
alter table dist_collections drop constraint if exists dist_collections_party_id_fkey;
alter table dist_collections add constraint dist_collections_party_id_fkey foreign key (party_id) references dist_parties(id) on delete restrict;

-- ASM / salesman master list
create table if not exists dist_asms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  entered_by text,
  user_id uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists dist_asms_name_uq on dist_asms (lower(btrim(name)));
drop trigger if exists touch_dist_asms on dist_asms;
create trigger touch_dist_asms before update on dist_asms for each row execute function touch_updated_at();
alter table dist_asms enable row level security;
drop policy if exists p_dasm_read on dist_asms;
drop policy if exists p_dasm_ins on dist_asms;
drop policy if exists p_dasm_upd on dist_asms;
drop policy if exists p_dasm_del on dist_asms;
create policy p_dasm_read on dist_asms for select to authenticated using (my_role() is not null);
create policy p_dasm_ins  on dist_asms for insert to authenticated with check (my_role() in ('admin','staff'));
create policy p_dasm_upd  on dist_asms for update to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create policy p_dasm_del  on dist_asms for delete to authenticated using (my_role() = 'admin');

-- an ASM used by any party or any collection cannot be deleted (deactivate instead)
create or replace function public.dist_asm_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from dist_parties where lower(btrim(asm)) = lower(btrim(old.name)))
     or exists (select 1 from dist_collections where lower(btrim(asm)) = lower(btrim(old.name))) then
    raise exception 'ASM is in use — deactivate instead of deleting' using errcode = '23503';
  end if;
  return old;
end $$;
drop trigger if exists dist_asm_guard_trg on dist_asms;
create trigger dist_asm_guard_trg before delete on dist_asms for each row execute function dist_asm_guard();
drop trigger if exists audit_dasm on dist_asms;
create trigger audit_dasm after insert or update or delete on dist_asms for each row execute function audit_trg();

-- fill the master list from the ASM names already on parties (safe to re-run)
insert into dist_asms (name, entered_by)
  select distinct on (lower(btrim(asm))) btrim(asm), 'Old file (Foysal)' from dist_parties where btrim(coalesce(asm, '')) <> ''
  on conflict do nothing;

-- v6.24 — user-added cheque purposes (shared by all users)
create table if not exists cheque_purposes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entered_by text,
  user_id uuid default auth.uid(),
  created_at timestamptz default now()
);
create unique index if not exists cheque_purposes_name_uq on cheque_purposes (lower(btrim(name)));
alter table cheque_purposes enable row level security;
drop policy if exists p_cpur_read on cheque_purposes;
drop policy if exists p_cpur_ins on cheque_purposes;
drop policy if exists p_cpur_del on cheque_purposes;
create policy p_cpur_read on cheque_purposes for select to authenticated using (my_role() is not null);
create policy p_cpur_ins  on cheque_purposes for insert to authenticated with check (my_role() in ('admin','staff'));
create policy p_cpur_del  on cheque_purposes for delete to authenticated using (my_role() = 'admin');

-- v6.28 — hardening + indexes (safe to re-run)
-- RPC functions already check my_role() internally; also stop anonymous callers reaching them at all.
revoke execute on function public.clear_audit(timestamptz) from public, anon;
revoke execute on function public.delete_backup(bigint) from public, anon;
revoke execute on function public.user_logins() from public, anon;
revoke execute on function public.set_my_name(text) from public, anon;
revoke execute on function public.set_cheque_photo(uuid, text) from public, anon;
revoke execute on function public.dist_set_status(uuid[], text, text) from public, anon;
revoke execute on function public.make_backup(text) from public, anon;
grant execute on function public.clear_audit(timestamptz), public.delete_backup(bigint), public.user_logins(), public.set_my_name(text), public.set_cheque_photo(uuid, text), public.dist_set_status(uuid[], text, text), public.make_backup(text) to authenticated;
create index if not exists balances_code_date_ix on balances (code, date);
create index if not exists dist_col_asm_ix on dist_collections (asm);

-- v6.29 — delete protection for cheques and cheque books (accounts already protected by FKs; no delete UI)
create or replace function public.cheque_del_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from cheque_status s where s.cheque_id = old.id) then
    raise exception 'cheque_in_use: has status records' using errcode = '23503';
  end if;
  return old;
end $$;
drop trigger if exists cheque_del_guard on cheques;
create trigger cheque_del_guard before delete on cheques for each row execute function cheque_del_guard();

create or replace function public.book_del_guard() returns trigger
language plpgsql set search_path = public as $$
declare st bigint := coalesce(old.track_from, old.first_leaf);
        en bigint := coalesce(old.last_leaf, 9223372036854775807);
begin
  if exists (select 1 from cheques c where c.code = old.code and c.chq_no between st and en) then
    raise exception 'book_in_use: cheques exist in this book' using errcode = '23503';
  end if;
  return old;
end $$;
drop trigger if exists book_del_guard on books;
create trigger book_del_guard before delete on books for each row execute function book_del_guard();

-- v6.34: the "Hold" status was retired (Pending covers it). Existing hold rows were moved to pending.
-- The check constraint still allows 'hold' so old backups restore cleanly; the app no longer offers it.
update dist_collections set status = 'pending' where status = 'hold';

-- v6.36 hardening (applied to the live DB 16-11-2026)
revoke execute on function public.my_role(), public.handle_new_user(), public.touch_updated_at(), public.audit_trg(), public.dist_asm_guard(), public.cheque_del_guard(), public.book_del_guard(), public.rls_auto_enable() from anon, public;
grant execute on function public.my_role() to authenticated;
create index if not exists books_code_idx on public.books(code);
create index if not exists reminders_cheque_idx on public.reminders(cheque_id);
-- Auth (dashboard): Site URL = https://app.nabiad.com, Redirect URLs include it, min password length 10, sign-ups disabled.

-- v6.38 — admin can create users and reset passwords from inside the app (admin only, min password 10)
create or replace function public.admin_create_user(p_email text, p_password text, p_name text, p_role text)
returns uuid language plpgsql security definer set search_path = public, extensions, auth as $$
declare uid uuid := gen_random_uuid(); em text := lower(trim(p_email)); nm text := nullif(trim(coalesce(p_name,'')), '');
begin
  if my_role() is distinct from 'admin' then raise exception 'admin_only'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  if length(coalesce(p_password,'')) < 10 then raise exception 'weak_password'; end if;
  if p_role not in ('admin','staff','boss') then raise exception 'bad_role'; end if;
  if exists (select 1 from auth.users where lower(email) = em) then raise exception 'email_exists'; end if;
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
  values ('00000000-0000-0000-0000-000000000000',uid,'authenticated','authenticated',em,crypt(p_password,gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('name',coalesce(nm,split_part(em,'@',1))),now(),now(),'','','','');
  insert into auth.identities(id,user_id,provider_id,provider,identity_data,last_sign_in_at,created_at,updated_at)
  values (gen_random_uuid(),uid,uid::text,'email',jsonb_build_object('sub',uid::text,'email',em,'email_verified',true,'phone_verified',false),now(),now(),now());
  update public.profiles set name = coalesce(nm,name), role = p_role, active = true where id = uid;
  insert into public.audit_log(user_name,tbl,action,row_key,new) values ((select name from public.profiles where id = auth.uid()),'users','insert',em,jsonb_build_object('role',p_role,'event','user_created'));
  return uid;
end $$;

create or replace function public.admin_set_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions, auth as $$
declare em text;
begin
  if my_role() is distinct from 'admin' then raise exception 'admin_only'; end if;
  if length(coalesce(p_password,'')) < 10 then raise exception 'weak_password'; end if;
  update auth.users set encrypted_password = crypt(p_password,gen_salt('bf')), updated_at = now() where id = p_user returning email into em;
  if em is null then raise exception 'no_user'; end if;
  if p_user is distinct from auth.uid() then delete from auth.sessions where user_id = p_user; end if;
  insert into public.audit_log(user_name,tbl,action,row_key,new) values ((select name from public.profiles where id = auth.uid()),'users','update',em,jsonb_build_object('event','password_reset'));
end $$;

revoke execute on function public.admin_create_user(text,text,text,text), public.admin_set_password(uuid,text) from anon, public;
grant execute on function public.admin_create_user(text,text,text,text), public.admin_set_password(uuid,text) to authenticated;

-- v6.41 — profile pictures (each user sets their own; everyone signed in can see). Stored as small JPEG data-URL (256x256).
create table if not exists public.user_avatars (
  user_id uuid primary key references auth.users(id) on delete cascade,
  img text not null check (img like 'data:image/%' and length(img) <= 150000),
  updated_at timestamptz not null default now()
);
alter table public.user_avatars enable row level security;
drop policy if exists p_ava_read on public.user_avatars;
create policy p_ava_read on public.user_avatars for select to authenticated using (true);
revoke all on public.user_avatars from anon, public;
grant select on public.user_avatars to authenticated;
create or replace function public.set_my_avatar(a text) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or my_role() is null then raise exception 'not_allowed'; end if;
  if a is null or a = '' then delete from public.user_avatars where user_id = auth.uid(); return; end if;
  if a not like 'data:image/%' or length(a) > 150000 then raise exception 'bad_image'; end if;
  insert into public.user_avatars(user_id, img, updated_at) values (auth.uid(), a, now())
    on conflict (user_id) do update set img = excluded.img, updated_at = now();
end $$;
revoke execute on function public.set_my_avatar(text) from anon, public;
grant execute on function public.set_my_avatar(text) to authenticated;

-- v6.42 — admin can set / remove any user's profile picture (edit-user screen)
create or replace function public.admin_set_avatar(p_user uuid, a text) returns void language plpgsql security definer set search_path = public as $$
declare em text;
begin
  if my_role() is distinct from 'admin' then raise exception 'admin_only'; end if;
  select email into em from public.profiles where id = p_user;
  if em is null then raise exception 'no_user'; end if;
  if a is null or a = '' then delete from public.user_avatars where user_id = p_user;
  else
    if a not like 'data:image/%' or length(a) > 150000 then raise exception 'bad_image'; end if;
    insert into public.user_avatars(user_id, img, updated_at) values (p_user, a, now())
      on conflict (user_id) do update set img = excluded.img, updated_at = now();
  end if;
  insert into public.audit_log(user_name,tbl,action,row_key,new) values ((select name from public.profiles where id = auth.uid()),'users','update',em,jsonb_build_object('event','photo_changed'));
end $$;
revoke execute on function public.admin_set_avatar(uuid,text) from anon, public;
grant execute on function public.admin_set_avatar(uuid,text) to authenticated;
