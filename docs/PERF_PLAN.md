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

---
## Update 2026-11-25 (night): v6.177 and production state

### Deployed and verified in production
- PR #160 (v6.176) merged; app.nabiad.com serves `6.176-perf-p0-stabilize` (checked from the live sw.js).
- `schema_tally_perf_v3.sql` applied as migration `tally_perf_v3` after the Bridge full load had finished (9 of 9 companies ok, nothing writing, last run 4 min earlier). Backup of the previous function bodies: table `public.fn_backup_20261125` (names tally_overview, tally_voucher_filters).
- Verified after apply: cron job `tally_snapshot_refresh` (`*/10 * * * *`) ran at 17:00 UTC, status succeeded, 11.9 s; snapshot == live computation (318,687 rows = raw count); admin default overview from snapshot 3 ms; boss/staff/anon denied for the RPCs, and staff cannot read `tally_snapshot` or call refresh/compute.
- Rollback of v3: see the header of schema_tally_perf_v3.sql; restore old bodies from `fn_backup_20261125`.

### v6.177 (this PR)
- Cancellation: a newer voucher search / ledger list / statement request cancels the older one of the same kind; leaving the Tally pages cancels all. Export pages are never cancelled. (Mock test: first of two quick searches rejected with AbortError, second and export pages succeed.)
- Tally result cache is bounded (60 entries; expired first, then oldest); logout reloads the page and drops it.
- Overview shows "Summary computed (every 10 min)" when served from the snapshot; "Last successful sync" stays a separate card.
- `scripts/check-perf-budget.py` (CI): gzip budgets for app/inv/cashbook/tally/i18n/style + guards that saveCache stays debounced, the 30 s refresh uses quietReload, and Tally reads go through tdRpc.

### Measured, and therefore NOT done
- Incremental fetch of the core tables: cheques 417 rows, cheque_status 100, accounts 67, books 7 (one request page each); biggest others: balances 13.3k, cash_tally_vouchers 9.7k. A delta fetch would save almost nothing and cannot see edits or deletes without new columns/tombstones, so it is a correctness risk. The scale risk is only the Tally mirror (318k rows), already served by paged server-side RPCs.
- Lazy loading of inv.js/cashbook.js/tally.js: headless Chrome with 4x CPU throttling, DCL 346 ms (183 ms unthrottled) and no long task (>50 ms) during script execution. Nothing to gain; changing script loading would put offline/PWA behaviour at risk.
- IndexedDB migration: the offline cache is small (tens of KB of cheques/accounts); localStorage write is now once per 400 ms burst. No evidence of benefit; the outbox/offline entries stay as they are.
- Normalized ledger lines: deferred until the 1M-row staging test shows the explorer's jsonb scan is the bottleneck.

### Still open (needs something I do not have here)
- Real signed-in browser timings on production (the sandbox has no signed-in session; demo data only).
- 1M / 3M / 5M / 10M synthetic-row tests need a separate staging database (not production); concurrent-user test while the Bridge syncs needs the same.

---
## Update 2026-11-26: staging scale test, validation, thresholds (authoritative baseline)

### Release state
- main = v6.177 (PR #161 merged, CI green, Pages build succeeded). Origin serves `6.177-perf-p0b` (`/sw.js?nocache=1`), but the plain `https://app.nabiad.com/sw.js` still returned `6.176-perf-p0-stabilize` about an hour after the merge, so an edge cache (most likely Cloudflare) is holding `sw.js`. A PWA that cannot see a new `sw.js` cannot update. Action for the owner: Cloudflare -> Caching -> purge `/sw.js` and `/index.html`, and add a Cache Rule "bypass cache" for `/sw.js`, `/index.html`, `/manifest*`.
- Database: `tally_perf_v3` applied; snapshot cron succeeds every 10 min (see monitoring below). **Process note:** I applied v3 at about 16:56 UTC after judging the Bridge load finished; the Bridge was in fact still running (runs are logged only when a company finishes, and the next company had started at 16:51). The migration is additive and the 17:00 refresh succeeded, nothing was harmed, but the owner's "only after completion" condition was not met. New rule: before any migration, treat the Bridge as running unless two consecutive checks 15 min apart show no new finished run AND the owner confirms the Sync Center is idle.

### Accounting validation (read-only, nothing modified)
After the Bridge 1.2.2 (bridge 0.3.2) full load: 302,654 non-cancelled vouchers with entries, **0 unbalanced** in every company and voucher type (sum of signed entry amounts < 0.01). Before the reload, 1,233 vouchers (all Niramoy, written by Bridge 0.3.0 at 11:2x UTC, only the party leg present, no foreign-currency text) were unbalanced; they were not rewritten by the 0.3.1 run, and the 0.3.2 reload of Niramoy (17:24-17:48 UTC) rewrote 102,315 rows and cleared all of them. The 16,049 vouchers without entries are all Stock Journal / BoM / Finish Goods / Mixture types with amount 0 (no accounting legs by design). Detergent (35 rows) and Lalmatia (0) had not yet been rewritten by 0.3.2 when checked; both were already balanced. Re-run the query in "Rerun" below after any full load.
Rerun: `select company, count(*) filter (where abs((select sum((e->>'amount')::numeric) from jsonb_array_elements(entries) e))>=0.01) unbalanced from tally_vouchers where not deleted and not cancelled and jsonb_array_length(entries)>0 group by 1;` (read-only; or the Tally Dashboard > Reconciliation > Debit/credit check).

### Staging scale test (local PostgreSQL 16, synthetic data, no cloud cost)
Environment: PostgreSQL 16.15, 2 vCPU, 8 GB RAM, shared_buffers 256 MB, synthetic rows (9 companies with production's shares, production's voucher-type mix, 2 entries per voucher for 92 %, 1.5 % shared GUIDs). Not Supabase compute: use for the shape of the curve. Production calibration: the same snapshot refresh took 6.6-37 s (median about 12 s) at 318k rows while the Bridge was loading. Raw data: `docs/perf/staging-2026-11-26.json`; scripts: `tools/perf-staging/`.

Single user, median of 2-3 runs (ms):

| Query | 1M | 3M | 5M | 10M |
|---|---:|---:|---:|---:|
| Overview, full history, live | 2,125 | 6,256 | 10,233 | 21,537 |
| Overview, one company + one month | 103 | 335 | 552 | 1,618 |
| Filter counts, live | 417 | 1,064 | 1,798 | 3,046 |
| Snapshot refresh (overview + shared GUID + filters) | 3,400 | 11,958 | 18,942 | 41,346 |
| **Snapshot read (what the app calls)** | **0** | **0** | **0** | **0** |
| Voucher search, one month | 13 | 59 | 93 | 325 |
| Voucher search, company + type + year | 89 | 368 | 379 | 788 |
| Voucher search, free text, all history | 983 | 3,145 | 4,696 | 9,595 |
| Ledger list, one company, one year | 178 | 1,039 | 1,061 | 1,906 |
| Ledger list, all companies, all history | 1,603 | 4,457 | 6,020 | 11,411 |
| Ledger statement, one ledger, all history | 566 | 900 | 1,175 | 2,565 |
| Shared-GUID reconciliation, first page | 763 | 3,244 | 6,560 | 23,383 |
| Table / index size (MB) | 283 / 99 | 857 / 301 | 1,431 / 495 | 2,866 / 984 |

Concurrent users, mixed reads (40 % snapshot read, 40 % month voucher search, 10 % ledger list, 10 % ledger statement; 40 s each; "writer" = Bridge-like 500-voucher upsert batches on a fixed key space):

| Rows | Clients | Writer | Reads/s | p50 ms | p95 ms | p99 ms | Writer batch p50 / p95 ms |
|---:|---:|:--:|---:|---:|---:|---:|---|
| 340k | 5 | no / yes | 61.8 / 52.3 | 18 / 20 | 400 / 464 | 694 / 829 | - / 47 / 72 |
| 340k | 10 | no / yes | 70.1 / 59.4 | 33 / 36 | 736 / 857 | 1,245 / 1,401 | - / 56 / 78 |
| 340k | 20 | no / yes | 70.8 / 66.8 | 55 / 57 | 1,862 / 1,907 | 2,154 / 2,231 | - / 80 / 112 |
| 10M | 5 | no / yes | 2.7 / 2.1 | 1,107 / 1,279 | 7,856 / 8,307 | 9,700 / 17,714 | - / 60 / 104 |
| 10M | 10 | no / yes | 3.3 / 3.1 | 1,698 / 1,863 | 15,385 / 14,976 | 27,294 / 25,940 | - / 91 / 168 |
| 10M | 20 | no / yes | 3.1 / 3.1 | 3,319 / 3,340 | 40,184 / 34,290 | 43,446 / 44,159 | - / 144 / 334 |

Peak system memory during all runs: 1.74 GB (256 MB shared buffers + up to 20 backends and parallel workers). Storage at 10M: about 3.9 GB for the database (2.9 GB table + 1 GB indexes), 2 GB WAL headroom configured.

What this says
1. At today's size (about 320k) 5-20 simultaneous users, with a worst-case 20 % of requests being admin explorers, stay at p50 under 60 ms and p95 under 1.9 s; a Bridge-like writer adds about 10-15 % to read p95 and its own batches stay under 120 ms p95. No sign of lock contention.
2. The risk is the admin explorers and reconciliation at millions of rows (they scan jsonb), not the everyday modules: the core tables are 417 cheques, 13k balances, 9.7k cash vouchers and stay far below any limit. Everyday app speed does not depend on the Tally mirror at all (different tables, different users).
3. The snapshot keeps the Dashboard at 0 ms at any size, but the refresh itself grows linearly: about 41 s of one core every 10 minutes at 10M here, and about 3x that on production's measured speed. It becomes a load problem before the explorers do (see thresholds).
4. Browser abort is not proof the database stopped: PostgREST/Postgres may keep running a query after the client cancels. The abort added in v6.177 saves the browser and network; it is not a database protection. Protection against a runaway explorer query is `statement_timeout` (see "Not done").

### Thresholds: when each optimisation becomes necessary
Measure first (`tools/perf-capture.js`, `pg_stat_statements`, `cron.job_run_details`), then act. Do not implement a row below before its trigger is met.

| Optimisation | Trigger (any one) | First action |
|---|---|---|
| Snapshot cadence / incremental summary | refresh median > 30 s, or > 20 % of a core averaged over an hour | change `*/10` to `*/30`, then maintain per-company counters from the Bridge upsert instead of recounting |
| `(guid, company)` index | shared-GUID RPC > 3 s on production (about 3M rows locally) | create on a copy, EXPLAIN, expect > 3x; index cost 29 MB per 318k rows |
| Normalized ledger lines table (voucher_id, ledger, amount) | ledger list one company/one year p95 > 1 s on production, or > 1M vouchers | build in staging, compare totals to the jsonb result for every company, migrate behind a flag |
| Free-text search index (pg_trgm on narration / ledger text) | free-text search p95 > 2 s on production (about 1M rows) | prove with EXPLAIN on a copy; consider restricting text search to one company/date range first |
| `statement_timeout` for the authenticated role's RPCs | any RPC > 10 s seen in `pg_stat_statements`, or two explorer queries running longer than 5 s concurrently | `alter role authenticated set statement_timeout = '15s'` after testing the Bridge role is unaffected (it uses the service/other role) |
| Incremental fetch of core tables | any `loadAll` table > 20,000 rows, or `loadAll` p95 > 1.5 s on a real device, or transfer > 2 MB | add `updated_at` + soft-delete tombstones first (schema change) |
| Module splitting / lazy loading | DCL > 1.5 s at 4x CPU throttle, a script-evaluation long task > 200 ms, or total JS gzip > 450 KB (currently about 420 KB) | split `tally.js` (admin only) first |
| IndexedDB cache | localStorage cache write > 50 ms or > 3 MB | migrate with a read-old-then-write-new step and keep the old key for one release |
| Database compute upgrade | CPU > 60 % for 15 min, or explorer p95 > 2 s after the items above, or > 3M vouchers | quote Hostinger/Supabase cost first; Singapore region moves are a separate downtime decision |

### Monitoring (cheap, run weekly or when something feels slow)
- Snapshot refresh: `select to_char(start_time,'MM-DD HH24:MI') t, status, round(extract(epoch from end_time-start_time)*1000) ms from cron.job_run_details d join cron.job j using(jobid) where j.jobname='tally_snapshot_refresh' order by start_time desc limit 20;` Observed 6.6-37 s (median about 12 s) on 17:00-17:50 UTC 25 Nov, all while the Bridge was loading.
- Slowest queries: `select left(query,80), calls, round(mean_exec_time) mean_ms, round(max_exec_time) max_ms from pg_stat_statements order by mean_exec_time desc limit 10;`
- Backups: latest `offsite_backup_runs` row `ok = true` (the last DB backup at 02:53 UTC 25 Nov predates the RLS and v3 migrations).

### Backup and rollback strategy for further migrations
1. Before any migration: confirm the newest `offsite_backup_runs` DB row is `ok` and younger than 24 h, or run the "Off-site backup" workflow manually and wait for `ok`.
2. Save the bodies of every function the migration replaces into a dated backup table (as `fn_backup_20261125`) and the policies into `policy_backup_*`.
3. Write the migration additive and re-runnable, with the rollback statements in its header.
4. Apply only after the owner's "yes", and only when the Bridge is idle (see the process note above).
5. Verify with a rolled-back dry run first, then roles (admin/boss/staff/anon) and cron.
- `fn_backup_20261125`, `policy_backup_20261125`, `tally_snapshot`: RLS enabled, no grants to `anon` or `authenticated` (verified), so the browser cannot read them. Keep them; drop only after the next verified full backup and two weeks without issues.

### Not done (and why)
- `statement_timeout` for explorer RPCs: not applied; needs its own test so the Bridge's role is unaffected. Trigger in the table above.
- Real signed-in browser numbers: need the owner's capture (`docs/PERF_MEASURE.md`, `tools/perf-capture.js`). Performance stabilization is **not** declared complete until those exist.
- 24 h soak with the Bridge running at the same time as real users: not possible in the sandbox.
