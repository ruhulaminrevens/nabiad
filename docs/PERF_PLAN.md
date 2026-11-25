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

---
## Update 2026-11-25 (late): P0 stabilization checkpoint (v6.176)

### Measured before (database, signed-in admin, Bridge idle, 318k vouchers)
| Call | Before |
|---|---|
| tally_overview (all) | 7,210 ms |
| tally_voucher_filters | 5,876 ms |
| tally_overview (one company, one month) | 1,990 ms |
| tally_recon_shared | 1,442 ms |
| tally_voucher_search (month) / (text, all history) | 431 / 1,506 ms |
| tally_ledger_list (all companies, one year) | 406 ms |
| Reading 36 tables as a signed-in user (RLS) | 1,049-1,853 ms |
Cache hit ratio 99.78 % (shared_buffers 224 MB): the cost is CPU, not disk or memory.

### Done and applied
- RLS: `my_role()` evaluated once per query (98 policies). Same rows for admin/boss/staff. 36 tables: 1,049 -> 20 ms (admin), 1,853 -> 31 ms (boss), 1,041 -> 22 ms (staff).
### Done in code (v6.176, no SQL)
- fetchAll: parallel pages. 30 s refresh: skips while typing, redraws only on change.
- Offline cache written once 400 ms after the last change (was re-read and re-serialised on every change); flushed on page hide/close; cancelled on logout. Pending offline entries (outbox) untouched.
- Button-role decorator scans only newly added nodes (was the whole document after every change).
- Tally: filter lists no longer block the overview; identical reads are single-flight and cached for 10 min (filters) / 30-120 s (summaries), per user, errors never cached; Refresh button clears the cache; shared-GUID card loads separately if the overview does not carry it.
### Prepared, validated, NOT applied (needs owner "yes"): `schema_tally_perf_v3.sql`
- Snapshot of the default overview + filters, refreshed every 10 min by pg_cron, used while younger than 20 min; filtered views still live.
- Verified inside a rolled-back transaction on production data: snapshot result identical to the old function (all fields except timestamps, shared-GUID figures equal), default overview 13 ms (was 7,210), filters 1 ms (was 5,876), company+month overview 48 ms.
### Tried and rejected
- Extra indexes on tally_vouchers (company,vtype,vdate incl. guid) and (guid,company), tested on a scratch copy: no consistent gain for filters/overview (count distinct is CPU-bound); (guid,company) cut the shared-GUID count 1.2 s -> 0.25 s but not the content comparison. Not created: they cost disk (34 MB + 29 MB) and write time during sync.
### Still open
- Browser timings with a real signed-in session; 1m-10m voucher stress test needs a staging copy; ledger/voucher text search over all history (~1.5 s) and normalized ledger lines; lazy-loading of inv.js/cashbook.js/tally.js; IndexedDB cache; request cancellation on route change.
