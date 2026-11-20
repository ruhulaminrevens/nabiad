-- Preserve unknown creation dates for existing ledgers.
begin;
alter table public.cashbook_ledgers add column if not exists created_at timestamptz;
alter table public.cashbook_ledgers alter column created_at set default now();
commit;
