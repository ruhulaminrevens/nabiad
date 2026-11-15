-- v6.5: routing / SWIFT / note on accounts (safe to re-run)
alter table public.accounts add column if not exists routing text;
alter table public.accounts add column if not exists swift text;
alter table public.accounts add column if not exists note text;
notify pgrst, 'reload schema';
alter table public.accounts add column if not exists book_photo text;
notify pgrst, 'reload schema';
