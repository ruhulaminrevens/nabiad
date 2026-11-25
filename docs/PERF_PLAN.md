# NABIAD performance: findings, fixes, future-proof plan (2026-11-25)

## What was measured
- App code is not the main cost. In a local test at 4x CPU slowdown every page paints in 55-205 ms; the whole app (1.4 MB JS, gzip ~0.6 MB) loads in ~0.5 s.
- The database is where time goes:
  - Every row-level-security policy calls `my_role()` unwrapped. Postgres runs it **once per row**, and `my_role()` itself queries `profiles` and `auth.mfa_factors`. Measured: reading 1,000 balance rows touches 4,664 buffers instead of 19 and takes 35 ms instead of 10 ms on an idle server. Counting 42k rows over 36 tables as a signed-in user takes 1.0-1.9 s. 98 of 133 policies have this pattern.
  - Production query stats: balance history pages ~208 ms each (1,602 calls); a distinct-date scan over balances ~1.7 s (63 calls); `cheques`/`accounts`/`cheque_status` loaded ~2,700 times at 17-48 ms.
  - The server is in Tokyo (ap-northeast-1); each extra sequential request costs a full round trip from Bangladesh.
  - `tally_vouchers` is 171 MB / 316k rows. While the Bridge uploads (65 ms per 100-row insert, thousands of calls) and while heavy reports run, the same database also serves the app.
- Entry/Status/Cheques pages re-fetched everything (8 requests) every 30 s and redrew the page, even while typing.

## Fixed in this change (v6.175)
1. `fetchAll`: extra pages are requested in parallel (one round trip instead of N).
2. 30 s background refresh: skipped while a field in the page has focus; page is redrawn only if the data really changed.
3. Browser opens the Supabase connection early (preconnect).

## Needs owner approval (not applied)
- Rewrite 98 RLS policies to `(select my_role())` so it is evaluated once per query. Same permissions, standard Supabase fix. Originals are saved in `public.policy_backup_20261125`. Verify by comparing visible row counts per role (admin/staff/boss) before and after (helper `public.rls_snap_run`, 36 tables x 3 roles; baseline already recorded in `public.rls_snap_tmp`). Rollback: recreate each policy from the backup table.

## Plan, in order
1. RLS initplan rewrite (above) - biggest single win, no UI change.
2. Run Bridge full history loads outside working hours; incremental syncs are small.
3. Consider a bigger Supabase compute size and moving the project to Singapore (ap-southeast-1, closer to Bangladesh). Needs the owner's decision (cost, short migration window).
4. Replace the "load everything at start" pattern for growing tables: dashboard and reports ask the database for sums (RPC) instead of downloading rows (the Tally Dashboard already works this way).
5. Add a trigram index only if free-text voucher search stays slow (currently ~5.5 s over all history; date/company filters are fast).
6. Add a simple timing log (route, request count, ms) in the Admin page to spot regressions early.
7. Drop unused indexes and merge duplicate permissive policies after step 1 (advisor lists 9 and 27).

## Limits
- No measurement with real production data in a browser (needs a signed-in session). Browser timings above are from demo data; database timings are real.
