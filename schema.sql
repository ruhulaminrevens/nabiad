-- Nabiad Cheque & Bank System — Supabase schema
-- Run once in Supabase → SQL Editor. Accounts are added from the app (Admin).

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, name text,
  role text not null default 'staff' check (role in ('admin','staff','boss')),
  active boolean not null default true
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id,email,name,role,active) values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    case lower(new.email)
      when 'ruhulaminrevens@gmail.com' then 'admin'
      when 'nabiadoffice@gmail.com'   then 'boss'
      else 'staff' end,
    lower(new.email) in ('ruhulaminrevens@gmail.com','nabiadoffice@gmail.com'));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and active $$;

create table if not exists accounts (
  code text primary key, holder text, bank text, branch text, acno text, type text,
  daily boolean default true, status text default 'Active', sort int default 0
);

create table if not exists cheques (
  id uuid primary key default gen_random_uuid(),
  chq_date date not null,
  code text not null references accounts(code),
  chq_no bigint not null,
  amount numeric not null default 0,
  purpose text not null,
  cash_taker text, party text, to_ac text, remarks text,
  entered_by text, user_id uuid default auth.uid(),
  created_at timestamptz default now(),
  unique (code, chq_no)
);
create index if not exists cheques_date_idx on cheques(chq_date);

create table if not exists cheque_status (
  id uuid primary key default gen_random_uuid(),
  cheque_id uuid not null references cheques(id) on delete cascade,
  new_status text not null check (new_status in ('Pending','Cleared','Bounced','Returned-Cash','Cancelled','Stopped')),
  status_date date not null,
  remarks text, entered_by text, user_id uuid default auth.uid(),
  created_at timestamptz default now()
);
create index if not exists cs_cheque_idx on cheque_status(cheque_id);

create table if not exists balances (
  date date not null, code text not null references accounts(code),
  total numeric, block numeric, remark text, other_debit numeric, other_deposit numeric,
  entered_by text, created_at timestamptz default now(),
  primary key (date, code)
);

create table if not exists books (
  id uuid primary key default gen_random_uuid(),
  code text not null references accounts(code),
  series text, first_leaf bigint not null, last_leaf bigint,
  track_from bigint, status text default 'Active', note text
);

-- ---------------- Row Level Security ----------------
alter table profiles enable row level security;
alter table accounts enable row level security;
alter table cheques enable row level security;
alter table cheque_status enable row level security;
alter table balances enable row level security;
alter table books enable row level security;

create policy p_prof_read on profiles for select to authenticated using (true);
create policy p_prof_admin on profiles for all to authenticated using (my_role()='admin') with check (my_role()='admin');

-- everyone signed-in (admin, staff, boss) can read
create policy p_acc_read on accounts for select to authenticated using (my_role() is not null);
create policy p_chq_read on cheques for select to authenticated using (my_role() is not null);
create policy p_cs_read  on cheque_status for select to authenticated using (my_role() is not null);
create policy p_bal_read on balances for select to authenticated using (my_role() is not null);
create policy p_bk_read  on books for select to authenticated using (my_role() is not null);

-- staff & admin can ADD only
create policy p_chq_ins on cheques for insert to authenticated with check (my_role() in ('admin','staff'));
create policy p_cs_ins  on cheque_status for insert to authenticated with check (my_role() in ('admin','staff'));
create policy p_bal_ins on balances for insert to authenticated with check (my_role() in ('admin','staff'));

-- ONLY admin can change / delete anything
create policy p_acc_w  on accounts for all to authenticated using (my_role()='admin') with check (my_role()='admin');
create policy p_chq_w  on cheques for update to authenticated using (my_role()='admin') with check (my_role()='admin');
create policy p_chq_d  on cheques for delete to authenticated using (my_role()='admin');
create policy p_cs_w   on cheque_status for update to authenticated using (my_role()='admin') with check (my_role()='admin');
create policy p_cs_d   on cheque_status for delete to authenticated using (my_role()='admin');
create policy p_bal_w  on balances for update to authenticated using (my_role()='admin') with check (my_role()='admin');
create policy p_bal_d  on balances for delete to authenticated using (my_role()='admin');
create policy p_bk_w   on books for all to authenticated using (my_role()='admin') with check (my_role()='admin');

-- encryption key for data files kept in the public repo (history.enc); readable only by active users
create table if not exists app_secrets (k text primary key, v text);
alter table app_secrets enable row level security;
create policy p_sec_read on app_secrets for select to authenticated using (my_role() is not null);
