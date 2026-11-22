-- Server-side: admin and boss accounts MUST have a verified 2FA factor AND an aal2 session.
-- Until now 2FA was optional (my_role() let a user without a factor in at aal1).
--
-- !! APPLY ONLY AFTER every active admin/boss has turned on 2FA, or they are locked out of all data.
-- Step 1 - run this and expect ZERO rows:
--   select p.email, p.role from public.profiles p
--   where p.active and p.role in ('admin','boss')
--     and not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified');
-- Step 2 - take a manual backup (select public.make_backup('manual');), then run the function below.
-- Rollback: re-run the my_role() definition from schema_v6.sql (v6.44).
create or replace function public.my_role() returns text language sql stable security definer set search_path = public, auth as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.active
    and (
      case when p.role in ('admin','boss')
        then exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
             and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
        else (not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
              or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2')
      end)
    and (auth.jwt()->>'session_id' is null or exists (select 1 from auth.sessions s where s.id = (auth.jwt()->>'session_id')::uuid))
$$;
