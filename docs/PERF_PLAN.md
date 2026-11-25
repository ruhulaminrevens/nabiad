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

### Automated browser benchmark (`tools/perf-browser-bench.py`, run before each release; not in CI)
Headless Chrome, demo data (24 synthetic accounts, 9,600 synthetic balance rows), service worker blocked, 7 repeats per route after a warm-up visit. Thresholds: page switch p95 <= 600 ms at 4x CPU throttle, worst start-up long task <= 400 ms.
Baseline 2026-11-26 (v6.177, sandbox CPU), page switch hash-change -> content ready, ms p50 / p95:

| Route | 1x CPU | 4x CPU |
|---|---|---|
| Dashboard | 20 / 20 | 21 / 37 |
| Cheque Posting | 24 / 27 | 73 / 111 |
| Cheque Register | 24 / 28 | 63 / 78 |
| Bank Closing | 21 / 24 | 71 / 88 |
| Cash Book | 22 / 38 | 88 / 108 |
| Cash Register | 21 / 30 | 63 / 74 |
| Inventory Dashboard | 29 / 30 | 92 / 149 |
| Collection Entry | 22 / 36 | 86 / 116 |
| Collection Summary | 21 / 29 | 69 / 96 |
| Tally Dashboard | 22 / 32 | 76 / 92 |

Start-up long tasks during login: 71 and 56 ms (1x); 229 and 173 ms (4x). This proves rendering and JavaScript are not the bottleneck on a 4x-slower CPU. It says nothing about network or database latency (no network in the test); those come only from the owner's `tools/perf-capture.js` capture on production.

---
## Update 2026-11-26 (night): Tally Dashboard v2 (v6.178) and SQL v4

### Confirmed production failures and the fix (`schema_tally_perf_v4.sql`, NOT applied yet: needs owner "yes" + Bridge idle)
The admin role has `statement_timeout = 8s`. Measured on production with the Bridge syncing (real conditions):

| RPC | Before | After v4 (rolled-back test on production data) | Same result? |
|---|---:|---:|---|
| tally_balance_check() all | 11,093 ms -> timeout | 13 ms (snapshot) | rows identical |
| tally_balance_check(company, live) | 572 ms | 570 ms | identical |
| tally_recon_cash default period | 12,001-15,532 ms -> timeout | 309-465 ms (set-based rewrite) | all exception rows identical in 5 cases (42..2,643 rows) |
| tally_recon_coverage(7) | 7,984 ms (at the limit) | 5 ms (snapshot) | identical |
| tally_recon_shared page | 1,442-2,992 ms | 10-15 ms (precomputed pairs) | identical; table == live join |
| tally_recon_changes | 3,205 ms (seq scan for 2 rows) | 162 ms (partial index) | identical |
Role tests in the same transaction: staff/boss/anon denied; staff cannot read `tally_shared_pairs`, call refresh or the compute functions. New cron job `tally_recon_refresh` at :05 and :35 (does not overlap the :00/:10 overview job); adds roughly 25 s of one core every 30 min at today's size. Backup of the replaced bodies: `fn_backup_20261126`. Rollback in the file header.
Note: the old recon_cash paging was not deterministic when rows tie (same date/type/amount); v4 adds a tie-break (ledger, vno). The set of exception rows is unchanged.

### UI changes (tally.js, style.css, app.js palette hook) — no new dependency, no new request on page open except one 13 ms snapshot read
- Sticky section nav; tab, Reconciliation sub-tab and filters kept across page changes and reload; links `#/tallydash?tab=…`; Alt+1..6 and `/`.
- Date presets (Dhaka calendar, week from Saturday); rows per page 25/50/100 (remembered) with the pager above and below; sticky table headers in scroll boxes; compact/comfortable density.
- Voucher Explorer: live search while typing only when the period is under 13 months (otherwise Enter), older request aborted in the browser; recent searches (device only); detail row shows debit/credit totals and a Balanced / Difference / Not verified tag.
- Ledger Explorer: presets, pagers, live search only inside one company, printable statement.
- Overview: freshness strip (summary computed vs last successful sync, never mixed); every bar and month/day column opens the matching vouchers; integrity card shows debit = credit from the 30-min snapshot.
- Reconciliation: computed-at labels and stale flag; classes Matched / Unmatched (app only, Tally only) / Ambiguous / Review required / Not verified; Tally-side numbers open the voucher; shared-GUID "only different" filter and full Excel export; coverage day-coverage % and "vouchers around this gap"; Debit = credit loads instantly with company/type breakdown, largest differences and a live one-company check; "Not available yet" became the Setup & Readiness Center (14 modules, Available / Partial / Not ready, with prerequisites).
- Sync Health: connection layers (browser, Supabase with measured ms, Bridge last report + version, TallyPrime "unknown" with the evidence), data freshness, runs per company, run duration, Bridge version, collapsible errors, clickable failure KPIs.
- Ctrl+K: admins get "Search Tally vouchers / ledgers" and matching companies.
- Size: tally.js 23.2 -> 33.9 KB gzip (budget raised 30 -> 36 KB on purpose; the file is cached by the service worker; total JS about 409 KB gzip, below the 450 KB split threshold). Browser bench results below.

### Not done (deliberately)
- Server-side column sorting for the explorers (needs new RPC parameters; the server order is date desc / amount desc).
- Saved named filters (recent searches cover the common case); PDF export (Print works, Excel is the full-data export).
- Opening balances, group hierarchy, bill-wise, stock: not mirrored by the Bridge, so no financial statements are shown (Readiness Center explains each).

---
## Update 2026-11-26 (after midnight): completion gate, PWA delivery, accounting re-validation

**Performance Stabilization is NOT complete.** PR #162 and #163 are merged (main = v6.178). Gate status:

| Gate | Status |
|---|---|
| Both reconciliation timeouts fixed **in production** | **Open.** Fix is validated (rolled-back test, identical output) but `schema_tally_perf_v4.sql` is not applied: it needs the owner's explicit migration "yes" (see checklist below). A direct-database result never closes a UI/RPC problem; it is closed only when the production capture shows `tally_recon_cash` and `tally_balance_check` with no suspected timeouts. |
| Corrected authenticated browser capture | **Open.** Capture tool v2 is ready (`tools/perf-capture.js`, `docs/PERF_MEASURE.md`); the owner has not run it on production yet. |
| Performance targets verified on production | **Open** (depends on the capture). |
| PWA update consistency | Mechanism verified, one hardening change made (below); consistency on production is confirmed by `NabiadPerf.versions()`, **open until the owner runs it**. |
| Accounting validation | **Done** (below). |
| Module regression tests | Pass: crawl, all-module UI, ledger, Tally full-path (0 console errors on desktop/phone/dark+Bangla), browser bench, capture self-test, CI. |

### Capture tool v2 (what changed and why)
The v1 total included its own 700 ms quiet window, so it could not show the 200 ms target. v2: `usable_ms` (skeleton gone + text present + next paint; no quiet wait) is separate from `network_settled_ms`; it checks the intended route/tab really became active (an inaccessible page is *incomplete*, not fast); distinguishes `cold_startup`, `first_visit`, `warm_revisit`, `tab_first`, `tab_cached`; counts in-flight requests with a fetch wrapper (path + status + duration only); keeps its own resource list so the 250-entry Resource Timing buffer cannot lose data (and says when it already overflowed); reports timeouts, never-finished requests and rendered error boxes as incomplete, excluded from p50/p95; 20 samples per cached case (`p95_reliable` flag); redacts query strings, ids and storage paths; reports app version, CDN `index.html`, CDN `sw.js`, the **active service worker's own version** and cache names separately; covers every Tally tab and every Reconciliation sub-tab plus Cash Book, Cash Register, Cheque Posting, Bank Closing, Collection, Inventory. It is read-only: it never saves, types, cancels or deletes. The old advice to create "harmless test entries" in production was removed; save timings are measured on staging or by timing a genuine entry by hand. Self-test: `tools/perf-capture-selftest.py` (demo build, synthetic data; it also exposed a demo-only never-ending skeleton on the Sync tab, fixed).

### PWA stale `sw.js`: investigation (response headers, read from the user's own browser)
`https://app.nabiad.com/`, `/index.html`, `/sw.js` and the versioned scripts all answered `server: GitHub.com`, `via: 1.1 varnish`, `x-served-by: cache-ccu…` (Fastly), `cache-control: max-age=600`, `expires` = +10 min, `age: 0`, `x-cache: MISS` then `HIT`. There was **no** `cf-ray` / `cf-cache-status` / `server: cloudflare`: **Cloudflare is not in the delivery path** (DNS only). My earlier advice to purge Cloudflare and add a bypass rule was based on an assumption and is withdrawn.
- Layer that caches: the GitHub Pages CDN (Fastly) and, for 10 minutes, the browser HTTP cache. GitHub Pages does not allow custom headers, so `Cache-Control` cannot be changed there.
- Bounded worst case: a file can be up to 10 minutes old at the edge after a deploy. Right after the v6.178 merge the edge still served 6.177 (deploy lag plus the 10-minute window).
- The earlier observation of an hour-old `sw.js` is **not explained** by these headers (max 10 min); the likely cause was the fetch tool's own 15-minute cache. It could not be reproduced, so no claim is made beyond that.
- Existing protections (verified in code): `register("sw.js", {updateViaCache:"none"})`; the update check fetches `index.html?u=<time>` (a different CDN cache key) every 3 min and on focus; the service-worker install **fails and retries** if the shell it fetches does not name the same release as the worker (so a stale CDN copy can never be installed as the new release); navigations use `no-cache`; a switch to the new version happens only when nothing is typed and the outbox is idle; nothing in this flow touches `localStorage`, IndexedDB or the offline outbox.
- Hardening added in v6.179: the install-time shell fetch now uses a unique query string (ignored by Pages, different CDN key) so verification always sees the live `index.html` instead of the 10-minute-old copy; previously a install that raced a deploy failed and waited for the next check. No browser storage is cleared.
- Permanent options: (1) **current**: the above; staleness is bounded to ≤ 10 min and self-heals, with no cost. (2) Optional, owner decision: proxy the domain through Cloudflare (free plan) with a Cache Rule "Bypass cache" for `/`, `/index.html`, `/sw.js` and `Edge TTL: respect origin` for versioned `?v=` files. This gives immediate freshness but changes DNS and adds a component; not done. Verify any time with `NabiadPerf.versions()` (`consistent_release`).

### Accounting validation (read-only, re-run after Detergent Factory and Lalmatia Depo were rewritten)
Run at 2026-11-26 about 00:55 Dhaka (18:55 UTC). Source: `tally_vouchers` excluding cancelled and deleted; voucher balanced when the sum of its ledger entries (debit negative) has |sum| < 0.01. Source Bridge engine **0.3.2** for all nine companies (latest successful run per company: 2026-11-25 18:18-18:35 UTC; the desktop app shows Data Bridge 1.2.2, idle, 9/9 synced). No source row was modified.

| Company | Vouchers | Balanced | Unbalanced | No entries (stock) | Coverage |
|---|---:|---:|---:|---:|---|
| Nabiad-Cash & Bank | 95,313 | 95,079 | 0 | 234 | 2023-01-01 → 2026-11-24 |
| Nabiad Distribution Ltd. | 28,450 | 28,444 | 0 | 6 | 2023-01-01 → 2026-11-25 |
| Nabiad-ChawkBazar-2026 | 5,068 | 5,047 | 0 | 21 | 2026-01-01 → 2026-11-25 |
| Nabiad Savar Coil Factory | 64,936 | 49,518 | 0 | 15,418 | 2023-01-01 → 2026-11-24 |
| Niramoy Traders- Naogaon | 112,900 | 112,879 | 0 | 21 | 2023-01-01 → 2026-11-24 |
| N.Zaman Ch. | 418 | 418 | 0 | 0 | 2026-01-01 → 2026-11-22 |
| N.Zaman Veg. Cr. | 483 | 482 | 0 | 1 | 2026-01-01 → 2026-11-24 |
| Nabiad Detergent Factory | 680 | 333 | 0 | 347 | 2026-01-01 → 2026-11-24 |
| Lalmatia Depo | 10,456 | 10,455 | 0 | 1 | 2024-07-01 → 2026-11-24 |
| **Total** | **318,704** | **302,655** | **0** | **16,049** | |

By voucher type: Payment 89,843, Sales 73,080, Receipt 57,177, Journal 54,823, Purchase 23,727, Credit Note 3,436, Debit Note 338, Sales Order 231: all balanced. Excluded as stock-only (no ledger entries, amount 0): Mixture (BoM) 7,048, Finish Goods 5,141, EX-Mixture 2,791, Stock Journal 818, Finished Good (BoM) 244, Physical Stock 7 (= 16,049). No voucher of an accounting type has empty entries. The earlier 1,233 foreign-currency imbalances (Bridge 0.3.0 rows) are gone, so 0.3.2 rewrote them correctly. Limit of this check: it proves each voucher's lines sum to zero, not that the ledger balances agree with Tally's reports (opening balances and groups are not mirrored).

### Before 1,000,000 voucher rows (now 318,704 non-deleted; ≈ 3x headroom)
Re-evaluate each item when the first trigger trips (numbers from the staging benchmark, a development guide, not a capacity guarantee):

| Item | Trigger to start work | Direction |
|---|---|---|
| Ledger-entry normalization (one row per line) | ≥ 700k vouchers, or live ledger search p95 > 800 ms on production, or entries scans > 3 s | normalized table filled by the Bridge upsert; `entries` stays as source until verified identical |
| Incremental accounting validation | full `tally_balance_compute` > 3 s, or snapshot refresh > 60 s | validate only vouchers with `synced_at` newer than the last run; keep a monthly full run |
| Indexed text search | voucher text search p95 > 500 ms, or ≥ 600k rows | trigram index on vno/narration (measure index size and write cost on staging first) |
| Incremental reconciliation summaries | `tally_recon_refresh` > 30 s | recompute only months touched since the last run |
| Snapshot refresh performance | any refresh > 20 % of its cron interval (overview 10 min, recon 30 min) | log duration per run (`tally_snapshot.refreshed_at` + cron history), alert on growth |
| Separate heavy reporting from operations | the 8 s statement timeout is hit by any interactive RPC, or Bridge upserts slow cash/cheque screens | read replica or a reporting schema; **needs owner cost approval** |
No infrastructure cost is incurred without approval.

### Migration safety checklist (replaces the earlier rule; the "Bridge idle" check was wrong because runs are logged only when a company finishes)
Before **any** production migration all must be true and recorded in the handover:
1. The owner explicitly confirms in chat that the Bridge Sync Center is idle (screenshot of Live sync "Idle" acceptable) **and** gives a separate explicit "yes" for the named migration. A quote of my own question is not an approval.
2. No active sync or conflicting job: no running scheduled run (next-run time shown by the Bridge), and `pg_cron` / `pg_stat_activity` show no long statement on `tally_vouchers`.
3. A fresh successful database backup exists (latest `offsite_backup_runs` row ok and recent; Supabase backup list).
4. Affected function and policy definitions are saved in a backup table (`fn_backup_<date>`, `policy_backup_<date>`: RLS on, no client grants).
5. Rollback SQL is in the migration header and was executed successfully inside a rolled-back transaction on production data.
6. Results of the rolled-back test (identical output, role tests for admin/staff/boss/anon) are shown to the owner before the apply.
