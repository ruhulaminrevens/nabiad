-- Off-site backup run log. Written only by the backup workflows (connected as the
-- database owner); the app reads it to show "last off-site backup" on the Backup page.
-- Safe to re-run. Apply in the Supabase SQL editor.
begin;

create table if not exists public.offsite_backup_runs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('db','storage')),
  ok boolean not null,
  stamp text,
  bytes bigint,
  detail text,
  at timestamptz not null default now()
);
create index if not exists offsite_backup_runs_kind_at_ix on public.offsite_backup_runs (kind, at desc);

alter table public.offsite_backup_runs enable row level security;
drop policy if exists offsite_runs_read on public.offsite_backup_runs;
create policy offsite_runs_read on public.offsite_backup_runs
  for select to authenticated using (public.my_role() in ('admin','boss'));

-- no insert/update/delete for app users, nothing for anon
revoke all on public.offsite_backup_runs from anon, authenticated;
grant select on public.offsite_backup_runs to authenticated;

commit;
