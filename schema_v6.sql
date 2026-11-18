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

-- v6.43 — staff edit window (per user, 0 = OFF, max 7 days), purposes managed in DB, staff cannot delete anything
alter table public.profiles add column if not exists edit_days int not null default 0;
alter table public.profiles drop constraint if exists profiles_edit_days_chk;
alter table public.profiles add constraint profiles_edit_days_chk check (edit_days between 0 and 7);

create or replace function public.can_edit_cheque(c_user uuid, c_created timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.my_role() = 'admin' then true
    when public.my_role() = 'staff' then coalesce((select p.active and p.edit_days > 0 and c_user = auth.uid() and c_created > now() - make_interval(days => p.edit_days)
                                                   from public.profiles p where p.id = auth.uid()), false)
    else false end
$$;
revoke execute on function public.can_edit_cheque(uuid, timestamptz) from anon, public;
grant execute on function public.can_edit_cheque(uuid, timestamptz) to authenticated;

drop policy if exists p_chq_w on public.cheques;
create policy p_chq_w on public.cheques for update to authenticated
  using (public.can_edit_cheque(user_id, created_at)) with check (public.can_edit_cheque(user_id, created_at));

-- non-admin edits can never change ownership/entry time (would extend the window)
create or replace function public.cheque_upd_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then
    new.user_id := old.user_id; new.created_at := old.created_at; new.entered_by := old.entered_by;
  end if;
  return new;
end $$;
revoke execute on function public.cheque_upd_guard() from anon, public;
drop trigger if exists cheque_upd_guard on public.cheques;
create trigger cheque_upd_guard before update on public.cheques for each row execute function public.cheque_upd_guard();

-- photo: staff may add when none, or replace inside their edit window
create or replace function public.set_cheque_photo(cid uuid, p text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() = 'admin' then update cheques set photo = p where id = cid;
  elsif my_role() = 'staff' then update cheques set photo = p where id = cid and (photo is null or public.can_edit_cheque(user_id, created_at));
  else raise exception 'not allowed'; end if;
  if not found then raise exception 'edit_window_closed'; end if;
end $$;

-- staff: no deletes at all (own reminders were the last exception; they can mark them done)
drop policy if exists p_rem_del on public.reminders;
create policy p_rem_del on public.reminders for delete to authenticated using (public.my_role() = 'admin');

-- purposes: defaults now live in the table so admin can rename/delete them too
alter table public.cheque_purposes add column if not exists sort int not null default 100;
insert into public.cheque_purposes(name, entered_by, sort, user_id) values
 ('Cash Withdrawal (ক্যাশ উত্তোলন)','system',1,null),('Own A/C Transfer (নিজ অ্যাকাউন্টে জমা)','system',2,null),('Supplier Payment (সাপ্লায়ার পেমেন্ট)','system',3,null),
 ('Rent (ভাড়া)','system',4,null),('Loan/EMI (লোন কিস্তি)','system',5,null),('Inter-company (সহযোগী প্রতিষ্ঠান)','system',6,null),
 ('Zakat/Donation (যাকাত/দান)','system',7,null),('Cancelled/Spoiled (বাতিল/নষ্ট পাতা)','system',8,null)
on conflict do nothing;
drop policy if exists p_cpur_upd on public.cheque_purposes;
create policy p_cpur_upd on public.cheque_purposes for update to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

create or replace function public.purpose_rename(p_old text, p_new text) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; nn text := btrim(p_new);
begin
  if my_role() is distinct from 'admin' then raise exception 'admin_only'; end if;
  if nn is null or nn = '' then raise exception 'bad_name'; end if;
  if lower(nn) <> lower(btrim(p_old)) and exists (select 1 from cheque_purposes where lower(btrim(name)) = lower(nn)) then raise exception 'purpose_exists'; end if;
  update cheque_purposes set name = nn where name = p_old;
  if not found then raise exception 'no_purpose'; end if;
  update cheques set purpose = nn where purpose = p_old; get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purpose_rename(text, text) from anon, public;
grant execute on function public.purpose_rename(text, text) to authenticated;

-- v6.44 — security: 2FA enforced server-side, force-logout takes effect at once, session/activity RPCs, user delete / email change
create or replace function public.my_role() returns text language sql stable security definer set search_path = public, auth as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.active
    and (not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified') or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2')
    and (auth.jwt()->>'session_id' is null or exists (select 1 from auth.sessions s where s.id = (auth.jwt()->>'session_id')::uuid))
$$;

create or replace function public.admin_user_security() returns table(user_id uuid, has_2fa boolean, sessions int, last_active timestamptz, last_sign_in_at timestamptz)
language plpgsql security definer set search_path = public, auth as $$
begin
  if my_role() is distinct from 'admin' then raise exception 'admin_only'; end if;
  return query select p.id,
    exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
    (select count(*)::int from auth.sessions s where s.user_id = p.id and (s.not_after is null or s.not_after > now())),
    (select max(coalesce(s.refreshed_at, s.updated_at, s.created_at)) from auth.sessions s where s.user_id = p.id),
    u.last_sign_in_at
  from public.profiles p left join auth.users u on u.id = p.id;
end $$;

create or replace function public.admin_sessions(p_user uuid) returns table(id uuid, created_at timestamptz, last_seen timestamptz, user_agent text, ip text, aal text, mine boolean)
language plpgsql security definer set search_path = public, auth as $$
begin
  if my_role() is distinct from 'admin' then raise exception 'admin_only'; end if;
  return query select s.id, s.created_at, coalesce(s.refreshed_at, s.updated_at, s.created_at), s.user_agent, host(s.ip), s.aal::text,
                      (s.id::text = auth.jwt()->>'session_id')
    from auth.sessions s where s.user_id = p_user and (s.not_after is null or s.not_after > now()) order by 3 desc;
end $$;

create or replace function public.admin_revoke_sessions(p_user uuid, p_session uuid default null) returns int
language plpgsql security definer set search_path = public, auth as $$
declare n int; em text;
begin
  if my_role() is distinct from 'admin' then raise exception 'admin_only'; end if;
  select email into em from public.profiles where id = p_user; if em is null then raise exception 'no_user'; end if;
  delete from auth.sessions where user_id = p_user and (p_session is null or id = p_session); get diagnostics n = row_count;
  insert into public.audit_log(user_name,tbl,action,row_key,new) values ((select name from public.profiles where id = auth.uid()),'users','update',em,jsonb_build_object('event','force_logout','sessions',n));
  return n;
end $$;

create or replace function public.admin_reset_2fa(p_user uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare em text;
begin
  if my_role() is distinct from 'admin' then raise exception 'admin_only'; end if;
  select email into em from public.profiles where id = p_user; if em is null then raise exception 'no_user'; end if;
  delete from auth.mfa_factors where user_id = p_user;
  delete from auth.sessions where user_id = p_user and p_user <> auth.uid();
  insert into public.audit_log(user_name,tbl,action,row_key,new) values ((select name from public.profiles where id = auth.uid()),'users','update',em,jsonb_build_object('event','2fa_reset'));
end $$;

create or replace function public.admin_set_email(p_user uuid, p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare em text := lower(btrim(p_email)); old text;
begin
  if my_role() is distinct from 'admin' then raise exception 'admin_only'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  select email into old from public.profiles where id = p_user; if old is null then raise exception 'no_user'; end if;
  if exists (select 1 from auth.users where lower(email) = em and id <> p_user) then raise exception 'email_exists'; end if;
  update auth.users set email = em, updated_at = now() where id = p_user;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', em), updated_at = now() where user_id = p_user and provider = 'email';
  update public.profiles set email = em where id = p_user;
  delete from auth.sessions where user_id = p_user and p_user <> auth.uid();
  insert into public.audit_log(user_name,tbl,action,row_key,old,new) values ((select name from public.profiles where id = auth.uid()),'users','update',em,jsonb_build_object('email',old),jsonb_build_object('email',em,'event','email_changed'));
end $$;

create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare em text; act boolean; r text;
begin
  if my_role() is distinct from 'admin' then raise exception 'admin_only'; end if;
  if p_user = auth.uid() then raise exception 'cannot_delete_self'; end if;
  select email, active, role into em, act, r from public.profiles where id = p_user; if em is null then raise exception 'no_user'; end if;
  if act then raise exception 'deactivate_first'; end if;
  insert into public.audit_log(user_name,tbl,action,row_key,old) values ((select name from public.profiles where id = auth.uid()),'users','delete',em,jsonb_build_object('role',r,'event','user_deleted'));
  delete from auth.users where id = p_user;
end $$;

revoke execute on function public.admin_user_security(), public.admin_sessions(uuid), public.admin_revoke_sessions(uuid, uuid), public.admin_reset_2fa(uuid), public.admin_set_email(uuid, text), public.admin_delete_user(uuid) from anon, public;
grant execute on function public.admin_user_security(), public.admin_sessions(uuid), public.admin_revoke_sessions(uuid, uuid), public.admin_reset_2fa(uuid), public.admin_set_email(uuid, text), public.admin_delete_user(uuid) to authenticated;

-- v6.44 — idle-lock password check without creating a new session (rate limited)
create table if not exists public.pw_attempts (user_id uuid not null, at timestamptz not null default now());
alter table public.pw_attempts enable row level security;
revoke all on public.pw_attempts from anon, authenticated;
create or replace function public.verify_my_password(p text) returns boolean
language plpgsql security definer set search_path = public, extensions, auth as $$
declare ok boolean;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  delete from pw_attempts where at < now() - interval '1 day';
  if (select count(*) from pw_attempts where user_id = auth.uid() and at > now() - interval '10 minutes') >= 8 then raise exception 'too_many_attempts'; end if;
  select encrypted_password = crypt(p, encrypted_password) into ok from auth.users where id = auth.uid();
  if coalesce(ok, false) then delete from pw_attempts where user_id = auth.uid(); else insert into pw_attempts(user_id) values (auth.uid()); end if;
  return coalesce(ok, false);
end $$;
revoke execute on function public.verify_my_password(text) from anon, public;
grant execute on function public.verify_my_password(text) to authenticated;

-- ===== v6.46: Web Push subscriptions + daily summary (edge function `notify`, pg_cron) =====
-- v6.46: push subscriptions + daily summary
create table if not exists public.push_subs(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null, auth text not null, ua text,
  summary boolean not null default true,
  created_at timestamptz not null default now());
alter table public.push_subs enable row level security;
drop policy if exists ps_sel on public.push_subs; drop policy if exists ps_ins on public.push_subs; drop policy if exists ps_upd on public.push_subs; drop policy if exists ps_del on public.push_subs;
create policy ps_sel on public.push_subs for select to authenticated using (user_id = auth.uid());
create policy ps_ins on public.push_subs for insert to authenticated with check (user_id = auth.uid() and my_role() is not null);
create policy ps_upd on public.push_subs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ps_del on public.push_subs for delete to authenticated using (user_id = auth.uid());   -- own device subscription only

create or replace function public.daily_summary(p_day date default ((now() at time zone 'Asia/Dhaka')::date))
returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object(
  'day', p_day,
  'chq_n', (select count(*) from cheques where chq_date = p_day),
  'chq_amt', (select coalesce(sum(amount),0) from cheques where chq_date = p_day),
  'bal_date', (select max(date) from balances where date <= p_day),
  'bal_total', (select coalesce(sum(total),0) from balances where date = (select max(date) from balances where date <= p_day)),
  'col_amt', (select coalesce(sum(amount),0) from dist_collections where date = p_day and status <> 'cancelled'),
  'col_pending_n', (select count(*) from dist_collections where status = 'pending'),
  'col_pending_amt', (select coalesce(sum(amount),0) from dist_collections where status = 'pending'),
  'rem_due', (select count(*) from reminders where not done and coalesce(snooze_until, due_at) <= now()));
$$;
revoke all on function public.daily_summary(date) from public, anon, authenticated;
grant execute on function public.daily_summary(date) to service_role;
-- (applied via dashboard) pg_net enabled; vault secret 'notify_cron_secret'; edge function `notify` (source: dev/fn/notify.ts, verify_jwt=false, own x-cron-secret check)
-- select cron.schedule('nabiad-daily-summary','0 14 * * *', $c$ select net.http_post(url:='https://<ref>.supabase.co/functions/v1/notify', headers:=jsonb_build_object('content-type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='notify_cron_secret')), body:='{}'::jsonb) $c$);   -- 20:00 Asia/Dhaka

-- ============================================================
-- v6.51 — Leaf register: cheque leaves that are missing / blank-stub / lost / cancelled / unused
-- A "mark" explains why a leaf number has no cheque entry, keeps a stub photo and lets Admin trace it to closure.
-- ============================================================
create table if not exists public.leaf_marks (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.accounts(code),
  leaf_no bigint not null,
  kind text not null check (kind in ('blank','lost','cancelled','unused','other')),
  note text,
  photo text,
  resolved boolean not null default false,
  resolved_note text,
  resolved_by text,
  resolved_at timestamptz,
  user_id uuid default auth.uid(),
  entered_by text,
  created_at timestamptz not null default now(),
  unique (code, leaf_no)
);
create index if not exists leaf_marks_kind_idx on public.leaf_marks(kind, resolved);
alter table public.leaf_marks enable row level security;
drop policy if exists p_lm_read on public.leaf_marks;
create policy p_lm_read on public.leaf_marks for select to authenticated using (my_role() is not null);
drop policy if exists p_lm_ins on public.leaf_marks;
create policy p_lm_ins on public.leaf_marks for insert to authenticated with check (my_role() in ('admin','staff') and user_id = auth.uid());
drop policy if exists p_lm_upd on public.leaf_marks;
create policy p_lm_upd on public.leaf_marks for update to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
drop policy if exists p_lm_del on public.leaf_marks;
create policy p_lm_del on public.leaf_marks for delete to authenticated using (my_role() = 'admin');

-- guard: a leaf that already has a cheque entry cannot be marked; resolved is decided by the server, not the client
create or replace function public.leaf_mark_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from cheques where code = new.code and chq_no = new.leaf_no) then raise exception 'leaf_in_use'; end if;
    new.resolved := new.kind in ('cancelled','unused'); new.resolved_note := null; new.resolved_by := null; new.resolved_at := null;
    if new.resolved then new.resolved_at := now(); new.resolved_by := 'System'; end if;
  end if;
  return new;
end $$;
drop trigger if exists leaf_mark_guard on public.leaf_marks;
create trigger leaf_mark_guard before insert on public.leaf_marks for each row execute function public.leaf_mark_guard();

-- when a cheque for a marked leaf is posted later, the trace closes itself
create or replace function public.leaf_mark_autoresolve() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update leaf_marks set resolved = true, resolved_at = now(), resolved_by = 'System', resolved_note = coalesce(nullif(resolved_note, ''), 'Cheque was posted for this leaf')
   where code = new.code and leaf_no = new.chq_no and not resolved;
  return null;
end $$;
drop trigger if exists leaf_mark_autoresolve on public.cheques;
create trigger leaf_mark_autoresolve after insert on public.cheques for each row execute function public.leaf_mark_autoresolve();

drop trigger if exists audit_leaf on public.leaf_marks;
create trigger audit_leaf after insert or update or delete on public.leaf_marks for each row execute function audit_trg();

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
    when 'leaf_marks' then 'Leaf ' || (r->>'code') || ' · ' || (r->>'leaf_no') || ' (' || (r->>'kind') || ')'
    else r->>'id' end;
  select name into nm from profiles where id = auth.uid();
  insert into audit_log(user_name, tbl, action, row_key, old, new)
    values (coalesce(nm, 'system'), tg_table_name, lower(tg_op), k, o, n);
  return null;
end $$;

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
    'dist_collections', (select coalesce(jsonb_agg(t), '[]') from dist_collections t),
    'leaf_marks',       (select coalesce(jsonb_agg(t), '[]') from leaf_marks t));
  n := (select count(*) from accounts) + (select count(*) from cheques) + (select count(*) from cheque_status)
     + (select count(*) from balances) + (select count(*) from books) + (select count(*) from reminders) + (select count(*) from cash_records)
     + (select count(*) from dist_parties) + (select count(*) from dist_collections) + (select count(*) from leaf_marks);
  insert into backups(kind, size_rows, data) values (k, n, d) returning id into bid;
  delete from backups where kind = 'auto' and at < now() - interval '14 days';
  delete from backups where kind = 'manual' and id not in (select id from backups where kind = 'manual' order by at desc limit 10);
  return bid;
end $$;
revoke all on function public.make_backup(text) from public, anon;
grant execute on function public.make_backup(text) to authenticated;
revoke execute on function public.leaf_mark_guard(), public.leaf_mark_autoresolve(), public.audit_trg() from anon, public;

-- =====================================================================
-- v6.71 — INVENTORY (Niramoy delivery, Distribution order→delivery, RM Factory)
-- Safe to re-run. Roles: admin = all; staff = add/edit (no delete; delivered/cancelled orders locked); boss = read.
-- =====================================================================

-- 1) product master: one list, separate rate per channel (orders keep their own rate snapshot)
create table if not exists public.inv_items (
  id serial primary key,
  name text not null unique,
  grp text not null default 'coil' check (grp in ('coil','detergent','cleaner','other')),
  unit text not null default 'ctn',
  rate_nir numeric(12,2), rate_dist numeric(12,2),
  in_nir boolean not null default false, in_dist boolean not null default false,
  sort int not null default 100, active boolean not null default true,
  updated_at timestamptz not null default now());
drop trigger if exists touch_inv_items on public.inv_items;
create trigger touch_inv_items before update on public.inv_items for each row execute function touch_updated_at();

-- 2) orders / trips. lines = {"<item id>": {"q": qty, "r": rate}}; totals are computed by the trigger
create table if not exists public.inv_orders (
  id uuid primary key default gen_random_uuid(),
  ch text not null check (ch in ('nir','dist')),
  date date not null,
  party text, location text, asm text,
  transport text, vehicle text, rent numeric(12,2),
  lines jsonb not null default '{}'::jsonb,
  free text, remarks text,
  status text not null default 'pending' check (status in ('pending','today','ok','cancel')),
  delivery_date date,
  total_qty numeric(14,2) not null default 0,
  value numeric(16,2) not null default 0,
  entered_by text, user_id uuid default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists inv_orders_ch_date on public.inv_orders(ch, date);
create index if not exists inv_orders_status on public.inv_orders(status);

create or replace function public.inv_order_calc() returns trigger language plpgsql set search_path = public as $$
declare k text; v jsonb; q numeric; r numeric; tq numeric := 0; tv numeric := 0; clean jsonb := '{}'::jsonb;
begin
  for k, v in select * from jsonb_each(coalesce(new.lines, '{}'::jsonb)) loop
    q := coalesce((v->>'q')::numeric, 0); r := coalesce((v->>'r')::numeric, 0);
    if q < 0 or r < 0 then raise exception 'negative_qty'; end if;
    if q > 0 then clean := clean || jsonb_build_object(k, jsonb_build_object('q', q, 'r', r)); tq := tq + q; tv := tv + q * r; end if;
  end loop;
  new.lines := clean; new.total_qty := tq; new.value := round(tv, 2);
  if new.status = 'ok' and new.delivery_date is null then new.delivery_date := (now() at time zone 'Asia/Dhaka')::date; end if;
  if new.status in ('pending','today') then new.delivery_date := null; end if;
  if tg_op = 'UPDATE' then new.updated_at := now();
    if coalesce(my_role(), '') <> 'admin' then new.user_id := old.user_id; new.created_at := old.created_at; new.entered_by := old.entered_by; end if;
  end if;
  return new;
end $$;
drop trigger if exists inv_order_calc on public.inv_orders;
create trigger inv_order_calc before insert or update on public.inv_orders for each row execute function public.inv_order_calc();

-- 3) monthly demand per channel: lines = {"<item id>": qty}
create table if not exists public.inv_demand (
  ch text not null check (ch in ('nir','dist')),
  month date not null,
  lines jsonb not null default '{}'::jsonb,
  entered_by text, updated_at timestamptz not null default now(),
  primary key (ch, month));
drop trigger if exists touch_inv_demand on public.inv_demand;
create trigger touch_inv_demand before update on public.inv_demand for each row execute function touch_updated_at();

-- 4) RM Factory: products (bag size + opening), daily ready/delivery, party ledger (receive/return)
create table if not exists public.rm_products (
  code text primary key, name text not null, bag_kg numeric(8,2) not null,
  opening_date date not null, opening_bag numeric(12,2) not null default 0,
  sort int not null default 100, active boolean not null default true);
create table if not exists public.rm_daily (
  date date not null, product text not null references public.rm_products(code) on delete restrict,
  ready_bag numeric(12,2) not null default 0 check (ready_bag >= 0),
  delivery_bag numeric(12,2) not null default 0 check (delivery_bag >= 0),
  remarks text, entered_by text, updated_at timestamptz not null default now(),
  primary key (date, product));
drop trigger if exists touch_rm_daily on public.rm_daily;
create trigger touch_rm_daily before update on public.rm_daily for each row execute function touch_updated_at();
create table if not exists public.rm_ledger (
  id uuid primary key default gen_random_uuid(),
  party text not null, product text not null references public.rm_products(code) on delete restrict,
  date date not null,
  receive_bag numeric(12,2) not null default 0 check (receive_bag >= 0),
  return_bag numeric(12,2) not null default 0 check (return_bag >= 0),
  remarks text, entered_by text, user_id uuid default auth.uid(), created_at timestamptz not null default now());
create index if not exists rm_ledger_party on public.rm_ledger(party, date);
insert into public.rm_products(code, name, bag_kg, opening_date, opening_bag, sort) values
  ('tamarind', 'Tamarind Powder', 50, '2026-09-30', 25, 1),
  ('wood', 'Wood Powder', 40, '2026-09-30', 0, 2)
on conflict (code) do nothing;

-- 4b) month lock: a locked month cannot be written by anyone (admin unlocks first)
create table if not exists public.inv_locks (
  month date primary key check (extract(day from month) = 1),
  locked_by text, locked_at timestamptz not null default now());
create or replace function public.inv_lock_chk() returns trigger language plpgsql set search_path = public as $$
declare d1 date; d2 date;
begin
  if tg_table_name = 'inv_demand' then
    if tg_op <> 'INSERT' then d1 := old.month; end if;
    if tg_op <> 'DELETE' then d2 := new.month; end if;
  else
    if tg_op <> 'INSERT' then d1 := old.date; end if;
    if tg_op <> 'DELETE' then d2 := new.date; end if;
  end if;
  if exists (select 1 from inv_locks where month in (date_trunc('month', d1)::date, date_trunc('month', d2)::date)) then
    raise exception 'month_locked';
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.inv_lock_chk() from anon, public;
do $$ declare t text; begin
  foreach t in array array['inv_orders','inv_demand','rm_daily','rm_ledger'] loop
    execute format('drop trigger if exists %I on public.%I', 'lock_' || t, t);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function inv_lock_chk()', 'lock_' || t, t);
  end loop; end $$;

-- 5) RLS
alter table public.inv_items enable row level security;
alter table public.inv_orders enable row level security;
alter table public.inv_demand enable row level security;
alter table public.rm_products enable row level security;
alter table public.rm_daily enable row level security;
alter table public.rm_ledger enable row level security;
alter table public.inv_locks enable row level security;
do $$ declare t text; begin
  foreach t in array array['inv_items','inv_orders','inv_demand','rm_products','rm_daily','rm_ledger','inv_locks'] loop
    execute format('drop policy if exists %I on public.%I', t || '_r', t);
    execute format('drop policy if exists %I on public.%I', t || '_i', t);
    execute format('drop policy if exists %I on public.%I', t || '_u', t);
    execute format('drop policy if exists %I on public.%I', t || '_d', t);
    execute format('create policy %I on public.%I for select to authenticated using (my_role() is not null)', t || '_r', t);
    execute format('create policy %I on public.%I for delete to authenticated using (my_role() = ''admin'')', t || '_d', t);
  end loop; end $$;
-- master data (items, RM products/opening): admin only
create policy inv_items_i on public.inv_items for insert to authenticated with check (my_role() = 'admin');
create policy inv_items_u on public.inv_items for update to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create policy inv_locks_i on public.inv_locks for insert to authenticated with check (my_role() = 'admin');
create policy rm_products_i on public.rm_products for insert to authenticated with check (my_role() = 'admin');
create policy rm_products_u on public.rm_products for update to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
-- orders: staff adds and edits open (pending / today) orders; delivered or cancelled orders are locked for staff
create policy inv_orders_i on public.inv_orders for insert to authenticated with check (my_role() in ('admin','staff'));
create policy inv_orders_u on public.inv_orders for update to authenticated
  using (my_role() = 'admin' or (my_role() = 'staff' and status in ('pending','today')))
  with check (my_role() in ('admin','staff'));
-- demand, daily RM, ledger: admin + staff add/edit
create policy inv_demand_i on public.inv_demand for insert to authenticated with check (my_role() in ('admin','staff'));
create policy inv_demand_u on public.inv_demand for update to authenticated using (my_role() in ('admin','staff')) with check (my_role() in ('admin','staff'));
create policy rm_daily_i on public.rm_daily for insert to authenticated with check (my_role() in ('admin','staff'));
create policy rm_daily_u on public.rm_daily for update to authenticated using (my_role() in ('admin','staff')) with check (my_role() in ('admin','staff'));
create policy rm_ledger_i on public.rm_ledger for insert to authenticated with check (my_role() in ('admin','staff'));
create policy rm_ledger_u on public.rm_ledger for update to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
revoke all on public.inv_items, public.inv_orders, public.inv_demand, public.rm_products, public.rm_daily, public.rm_ledger, public.inv_locks from anon;
revoke execute on function public.inv_order_calc() from anon, public;

-- 6) audit (row key per new table) + triggers
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
    when 'leaf_marks' then 'Leaf ' || (r->>'code') || ' · ' || (r->>'leaf_no') || ' (' || (r->>'kind') || ')'
    when 'inv_orders' then (case r->>'ch' when 'nir' then 'Niramoy ' else 'Order ' end) || (r->>'date') || ' · ' || coalesce(nullif(r->>'party',''), r->>'transport', '') || ' · ' || coalesce(r->>'value','0') || ' (' || (r->>'status') || ')'
    when 'inv_items' then 'Item ' || (r->>'name')
    when 'inv_demand' then 'Demand ' || (r->>'ch') || ' ' || (r->>'month')
    when 'rm_daily' then 'RM ' || (r->>'product') || ' ' || (r->>'date')
    when 'rm_products' then 'RM product ' || (r->>'code')
    when 'rm_ledger' then 'RM ledger ' || (r->>'party') || ' ' || (r->>'date')
    when 'inv_locks' then 'Lock ' || (r->>'month')
    else r->>'id' end;
  select name into nm from profiles where id = auth.uid();
  insert into audit_log(user_name, tbl, action, row_key, old, new)
    values (coalesce(nm, 'system'), tg_table_name, lower(tg_op), k, o, n);
  return null;
end $$;
revoke execute on function public.audit_trg() from anon, public;
do $$ declare t text; begin
  foreach t in array array['inv_items','inv_orders','inv_demand','rm_products','rm_daily','rm_ledger','inv_locks'] loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function audit_trg()', 'audit_' || t, t);
  end loop; end $$;

-- 7) backup includes the inventory tables
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
    'dist_collections', (select coalesce(jsonb_agg(t), '[]') from dist_collections t),
    'leaf_marks',       (select coalesce(jsonb_agg(t), '[]') from leaf_marks t),
    'inv_items',        (select coalesce(jsonb_agg(t), '[]') from inv_items t),
    'inv_orders',       (select coalesce(jsonb_agg(t), '[]') from inv_orders t),
    'inv_demand',       (select coalesce(jsonb_agg(t), '[]') from inv_demand t),
    'rm_products',      (select coalesce(jsonb_agg(t), '[]') from rm_products t),
    'rm_daily',         (select coalesce(jsonb_agg(t), '[]') from rm_daily t),
    'rm_ledger',        (select coalesce(jsonb_agg(t), '[]') from rm_ledger t),
    'inv_locks',        (select coalesce(jsonb_agg(t), '[]') from inv_locks t));
  n := (select count(*) from accounts) + (select count(*) from cheques) + (select count(*) from cheque_status)
     + (select count(*) from balances) + (select count(*) from books) + (select count(*) from reminders) + (select count(*) from cash_records)
     + (select count(*) from dist_parties) + (select count(*) from dist_collections) + (select count(*) from leaf_marks)
     + (select count(*) from inv_items) + (select count(*) from inv_orders) + (select count(*) from inv_demand)
     + (select count(*) from rm_products) + (select count(*) from rm_daily) + (select count(*) from rm_ledger);
  insert into backups(kind, size_rows, data) values (k, n, d) returning id into bid;
  delete from backups where kind = 'auto' and at < now() - interval '14 days';
  delete from backups where kind = 'manual' and id not in (select id from backups where kind = 'manual' order by at desc limit 10);
  return bid;
end $$;
revoke all on function public.make_backup(text) from public, anon;
grant execute on function public.make_backup(text) to authenticated;

-- =====================================================================
-- v6.72 — Inventory: link Distribution orders to the Collection party list (Delivery ↔ Collection)
-- Safe to re-run.
-- =====================================================================
alter table public.inv_orders add column if not exists party_id uuid references public.dist_parties(id) on delete restrict;
create index if not exists inv_orders_party on public.inv_orders(party_id);

-- ======== v6.73 — staff may edit delivered orders too (add / remove items, change quantity); only cancelled orders stay admin-only ========
drop policy if exists inv_orders_u on public.inv_orders;
create policy inv_orders_u on public.inv_orders for update to authenticated
  using (my_role() = 'admin' or (my_role() = 'staff' and status <> 'cancel'))
  with check (my_role() in ('admin','staff'));

-- ======== v6.75 — Order vs Delivery: opening balance (01-01-2026) and Tally sales register ========
-- Safe to re-run. Balance = opening + sales (Tally register up to its last date, then app deliveries after that date) - approved collections since the opening date.
create table if not exists public.dist_opening (
  id serial primary key,
  party_name text not null unique,
  party_id uuid references public.dist_parties(id) on delete set null,
  opening numeric(14,2) not null default 0,
  note text not null default '',            -- '', 'INACTIVE' or 'NEW' as in the source sheet
  as_of date not null default '2026-01-01'
);
create table if not exists public.dist_sales_reg (
  id bigserial primary key,
  sale_date date not null,
  party_name text not null,
  party_id uuid references public.dist_parties(id) on delete set null,
  voucher_no text not null default '',
  amount numeric(14,2) not null
);
create index if not exists dist_opening_party on public.dist_opening(party_id);
create index if not exists dist_sales_reg_party on public.dist_sales_reg(party_id);
create index if not exists dist_sales_reg_date on public.dist_sales_reg(sale_date);
alter table public.dist_opening enable row level security;
alter table public.dist_sales_reg enable row level security;
drop policy if exists dist_opening_r on public.dist_opening;
drop policy if exists dist_opening_w on public.dist_opening;
drop policy if exists dist_sales_reg_r on public.dist_sales_reg;
drop policy if exists dist_sales_reg_w on public.dist_sales_reg;
create policy dist_opening_r on public.dist_opening for select to authenticated using (my_role() is not null);
create policy dist_opening_w on public.dist_opening for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create policy dist_sales_reg_r on public.dist_sales_reg for select to authenticated using (my_role() is not null);
create policy dist_sales_reg_w on public.dist_sales_reg for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
revoke all on public.dist_opening, public.dist_sales_reg from anon;
grant usage, select on sequence public.dist_opening_id_seq, public.dist_sales_reg_id_seq to authenticated;

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
    'dist_collections', (select coalesce(jsonb_agg(t), '[]') from dist_collections t),
    'leaf_marks',       (select coalesce(jsonb_agg(t), '[]') from leaf_marks t),
    'inv_items',        (select coalesce(jsonb_agg(t), '[]') from inv_items t),
    'inv_orders',       (select coalesce(jsonb_agg(t), '[]') from inv_orders t),
    'inv_demand',       (select coalesce(jsonb_agg(t), '[]') from inv_demand t),
    'rm_products',      (select coalesce(jsonb_agg(t), '[]') from rm_products t),
    'rm_daily',         (select coalesce(jsonb_agg(t), '[]') from rm_daily t),
    'rm_ledger',        (select coalesce(jsonb_agg(t), '[]') from rm_ledger t),
    'inv_locks',        (select coalesce(jsonb_agg(t), '[]') from inv_locks t),
    'dist_opening',     (select coalesce(jsonb_agg(t), '[]') from dist_opening t),
    'dist_sales_reg',   (select coalesce(jsonb_agg(t), '[]') from dist_sales_reg t));
  n := (select count(*) from accounts) + (select count(*) from cheques) + (select count(*) from cheque_status)
     + (select count(*) from balances) + (select count(*) from books) + (select count(*) from reminders) + (select count(*) from cash_records)
     + (select count(*) from dist_parties) + (select count(*) from dist_collections) + (select count(*) from leaf_marks)
     + (select count(*) from inv_items) + (select count(*) from inv_orders) + (select count(*) from inv_demand)
     + (select count(*) from rm_products) + (select count(*) from rm_daily) + (select count(*) from rm_ledger)
     + (select count(*) from dist_opening) + (select count(*) from dist_sales_reg);
  insert into backups(kind, size_rows, data) values (k, n, d) returning id into bid;
  delete from backups where kind = 'auto' and at < now() - interval '14 days';
  delete from backups where kind = 'manual' and id not in (select id from backups where kind = 'manual' order by at desc limit 10);
  return bid;
end $$;
revoke all on function public.make_backup(text) from public, anon;
grant execute on function public.make_backup(text) to authenticated;


-- ============================================================
-- v6.76 — ক্যাশ খাতা / Cash Book (daily paper-book style entry; Cash Checker groups it into cash_records)
-- ============================================================
create table if not exists public.cashbook_days (
  date date primary key,
  opening_cash numeric not null default 0,
  lines jsonb not null default '{"r":[],"p":[]}'::jsonb,   -- r = received lines, p = payment lines: {n: name, a: amount, x: "5000+300", k: category key, c: bank A/C code}
  total_receipt numeric not null default 0,
  total_payment numeric not null default 0,
  cash_in_hand numeric,                                      -- counted cash at the end of the day ("হাতে ক্যাশ")
  remarks text,
  status text not null default 'draft' check (status in ('draft','final')),
  entered_by text,
  user_id uuid default auth.uid(),
  updated_at timestamptz default now()
);
alter table public.cashbook_days enable row level security;
drop policy if exists p_cb_read on public.cashbook_days;
drop policy if exists p_cb_ins on public.cashbook_days;
drop policy if exists p_cb_upd on public.cashbook_days;
drop policy if exists p_cb_del on public.cashbook_days;
create policy p_cb_read on public.cashbook_days for select to authenticated using (my_role() is not null);
create policy p_cb_ins on public.cashbook_days for insert to authenticated with check (my_role() in ('admin','staff'));
create policy p_cb_upd on public.cashbook_days for update to authenticated
  using (my_role() = 'admin' or (my_role() = 'staff' and status = 'draft'))
  with check (my_role() in ('admin','staff'));
create policy p_cb_del on public.cashbook_days for delete to authenticated using (my_role() = 'admin');
revoke all on public.cashbook_days from anon;

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
    when 'leaf_marks' then 'Leaf ' || (r->>'code') || ' · ' || (r->>'leaf_no') || ' (' || (r->>'kind') || ')'
    when 'inv_orders' then (case r->>'ch' when 'nir' then 'Niramoy ' else 'Order ' end) || (r->>'date') || ' · ' || coalesce(nullif(r->>'party',''), r->>'transport', '') || ' · ' || coalesce(r->>'value','0') || ' (' || (r->>'status') || ')'
    when 'inv_items' then 'Item ' || (r->>'name')
    when 'inv_demand' then 'Demand ' || (r->>'ch') || ' ' || (r->>'month')
    when 'rm_daily' then 'RM ' || (r->>'product') || ' ' || (r->>'date')
    when 'rm_products' then 'RM product ' || (r->>'code')
    when 'rm_ledger' then 'RM ledger ' || (r->>'party') || ' ' || (r->>'date')
    when 'inv_locks' then 'Lock ' || (r->>'month')
    when 'cashbook_days' then 'Cash Book ' || (r->>'date') || ' (' || (r->>'status') || ')'
    else r->>'id' end;
  select name into nm from profiles where id = auth.uid();
  insert into audit_log(user_name, tbl, action, row_key, old, new)
    values (coalesce(nm, 'system'), tg_table_name, lower(tg_op), k, o, n);
  return null;
end $$;
revoke execute on function public.audit_trg() from anon, public;
drop trigger if exists audit_cashbook on public.cashbook_days;
create trigger audit_cashbook after insert or update or delete on public.cashbook_days for each row execute function audit_trg();

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
    'dist_collections', (select coalesce(jsonb_agg(t), '[]') from dist_collections t),
    'leaf_marks',       (select coalesce(jsonb_agg(t), '[]') from leaf_marks t),
    'inv_items',        (select coalesce(jsonb_agg(t), '[]') from inv_items t),
    'inv_orders',       (select coalesce(jsonb_agg(t), '[]') from inv_orders t),
    'inv_demand',       (select coalesce(jsonb_agg(t), '[]') from inv_demand t),
    'rm_products',      (select coalesce(jsonb_agg(t), '[]') from rm_products t),
    'rm_daily',         (select coalesce(jsonb_agg(t), '[]') from rm_daily t),
    'rm_ledger',        (select coalesce(jsonb_agg(t), '[]') from rm_ledger t),
    'inv_locks',        (select coalesce(jsonb_agg(t), '[]') from inv_locks t),
    'dist_opening',     (select coalesce(jsonb_agg(t), '[]') from dist_opening t),
    'dist_sales_reg',   (select coalesce(jsonb_agg(t), '[]') from dist_sales_reg t),
    'cashbook_days',    (select coalesce(jsonb_agg(t), '[]') from cashbook_days t));
  n := (select count(*) from accounts) + (select count(*) from cheques) + (select count(*) from cheque_status)
     + (select count(*) from balances) + (select count(*) from books) + (select count(*) from reminders) + (select count(*) from cash_records)
     + (select count(*) from dist_parties) + (select count(*) from dist_collections) + (select count(*) from leaf_marks)
     + (select count(*) from inv_items) + (select count(*) from inv_orders) + (select count(*) from inv_demand)
     + (select count(*) from rm_products) + (select count(*) from rm_daily) + (select count(*) from rm_ledger)
     + (select count(*) from dist_opening) + (select count(*) from dist_sales_reg) + (select count(*) from cashbook_days);
  insert into backups(kind, size_rows, data) values (k, n, d) returning id into bid;
  delete from backups where kind = 'auto' and at < now() - interval '14 days';
  delete from backups where kind = 'manual' and id not in (select id from backups where kind = 'manual' order by at desc limit 10);
  return bid;
end $$;
revoke all on function public.make_backup(text) from public, anon;
grant execute on function public.make_backup(text) to authenticated;
