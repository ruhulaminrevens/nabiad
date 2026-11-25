# NABIAD — real browser performance measurement (read-only procedure, capture tool v2)

Goal: measure what you actually feel on your own computer or phone, signed in on https://app.nabiad.com, without changing or exposing anything.

## What the tool does and does not do
`tools/perf-capture.js` is **read-only**.
- It opens pages by changing the address (`#/dash`, `#/cash` …) and clicks only the Tally **tab and sub-tab buttons**. It never clicks Save/Submit and never types in a field.
- It does **not** create, edit, cancel or delete any voucher, cheque, cash entry or collection. Do **not** create test entries in production to benchmark. Save/entry speed is measured only on staging, or by timing a genuine entry you were going to make anyway (see "Your own entries").
- It does **not** read cookies, storage, headers, tokens, request or response bodies, or anything printed on screen. It wraps `fetch` only to count requests in flight and note path + HTTP status + duration.
- The export keeps: labels, timings, request **paths** (no query string; ids and storage object paths replaced by `:id` / `<redacted>`), byte counts, status codes, long-task times, heap totals, and the version strings of the app and service worker. No money amounts, party names or user ids.
- If you typed in a form on the current page the tool refuses to run (leaving the page could lose the entry). Finish or clear it first.

## What is measured (and why the old number was wrong)
The old script waited for 700 ms of quiet and reported that wait inside `total_ms`, so it could never show the 200 ms target. Version 2 reports separately:

| Field | Meaning |
|---|---|
| `usable_ms` | from the click/route change until the page shows real content (skeleton gone, text present) **and the next paint**. No quiet-window wait is included. This is the number for the 200 ms / 1.5 s targets. |
| `network_settled_ms` | until the last request of that action finished (quiet window only decides *when to stop*; it is not added). |
| `pending_at_usable` | requests still running when the content became usable (content may be a cached view being refreshed). |
| `cache_state` | `cached` = no API request was needed, `network` = at least one. Target: cached ≤ 200 ms, network ≤ 1.5 s. |
| `category` | `cold_startup`, `first_visit` (first time since the tool loaded), `warm_revisit`, `tab_first`, `tab_cached` (repeat switch), `manual`. |
| `route_changed` / `route_after` | proof the intended page/tab really became active. A page your login cannot open is reported **incomplete**, not fast. |
| `timed_out`, `incomplete`, `reasons` | after 20 s, or when requests never finish, the run is marked incomplete and says why. Incomplete runs are never counted in p50/p95. |
| `rpc[]` | each database call: name, ms, HTTP status, `statement_timeout_suspected` (status ≥ 500 near the 8 s limit). |
| `error_rendered` | the page drew a red error box: counted as a failure, not as speed. |

"First visit" is the first visit **since the tool was loaded**; the app may already hold data from earlier use. `cache_state` is the ground truth. For a true cold start use the reload step below.

Resource Timing keeps only 250 entries by default. The tool keeps its **own** list through observers and enlarges the browser buffer; if the buffer was already full before you pasted the script, `cold()` says so and marks itself incomplete.

## Samples: how many
`auto()` takes **20 samples** per cached revisit and per tab switch (p95 is only meaningful from about 20; the summary shows `p95_reliable`). A first visit can only be observed once, so it is a single sample. `auto({samples:8})` is a quick run; its p95 is flagged indicative.

## 1. Preparation (once)
1. Chrome or Edge on the computer you really use, other heavy tabs closed. Use the **Admin** login (needed for the Tally pages).
2. Open https://app.nabiad.com, sign in, wait for the dashboard. Do **not** be in the middle of an entry.
3. F12 → Console. If it says "type allow pasting", type `allow pasting` and Enter.
4. Open `tools/perf-capture.js` from https://github.com/ruhulaminrevens/nabiad/blob/main/tools/perf-capture.js → **Raw**, copy all, paste in the Console, Enter. You should see `NabiadPerf 2 ready (read-only)`.

## 2. Cold start (optional, 30 seconds)
Press **Ctrl+Shift+R**, wait for the dashboard, paste the script **immediately**, then:
```
await NabiadPerf.cold()
```
It reports first paint, largest paint (the approximation of "usable"), load time, whether the service worker controlled the page, and the database calls made during start-up.

## 3. Everything else, automatically (~15–25 minutes, run once)
```
await NabiadPerf.auto()
```
It measures, in order: Dashboard, Cheque Posting (open only), Cheque Register, Bank Closing (open only), Cash Book (open only), Cash Register, Inventory Dashboard, Collection Entry (open only), Collection Summary, then the **Tally Dashboard** and **every Tally tab** (Overview, Companies, Vouchers, Ledgers, Reconciliation, Sync Health) and **every Reconciliation sub-tab** (Shared GUIDs, Tally vs Cash Book, Cancelled/deleted, Coverage, Debit = credit, Setup & readiness). "open only" means it opens the page; it never fills or saves it. Pages your login cannot open show up as incomplete.

Quick check: `await NabiadPerf.auto({samples:8})`. One area only: `await NabiadPerf.tally(20)` or `await NabiadPerf.go('Cash Book','#/cash')`.

## 4. Versions: is everything one release? (10 seconds)
```
await NabiadPerf.versions()
```
Reports, **separately**: the app version the page loaded, the `index.html` and `sw.js` the CDN serves right now (fetched with a unique query, so no cache), the version the **active** service worker reports about itself, the service-worker cache name, and every `?v=` of the loaded scripts. `consistent_release: true` means they all agree. `false` means a new release is waiting (reload) or the CDN still serves an older file; wait 10 minutes and run again. The export includes this block.

## 5. Your own entries (cheque posting, cash book, bank closing, collection)
The tool never saves anything. To time a **real** entry you were going to make anyway:
```
NabiadPerf.start('Cash book entry save')
```
press Save yourself, wait for the success message, then `NabiadPerf.stop()`. This includes your reaction time, so it is labelled `manual` and the report treats it only as a rough figure. Never type customer data into the label. Precise save timings are measured on staging with synthetic data (`docs/PERF_PLAN.md`), not by creating entries in production.

## 6. Send the file
```
await NabiadPerf.export()
```
downloads `nabiad-perf-<time>.json` (summary table and every run). Also write one line: device, Wi-Fi or mobile data, city. Check the printed `incomplete_runs`; if it is not 0 the file still says which runs and why.

## 7. How the result is read
- Per scenario: `usable_p50_ms` / `usable_p95_ms` against `target_ms` (200 cached, 1500 network), `ok_samples` vs `samples`, `p95_reliable`.
- Per database call (`summary.rpc`): p50 / p95 / max, errors, `suspected_statement_timeouts`. Any suspected timeout in `tally_recon_cash` or `tally_balance_check` means the reconciliation fix is **not** verified.
- Not complete until: no incomplete runs for the Tally tabs, no suspected timeouts, every p95 within target (or a documented reason), and `consistent_release: true`.

## Self-test (developers)
`python3 tools/perf-capture-selftest.py` runs the tool against the demo build with synthetic data: it checks that every tab and sub-tab is measured, that an unknown route is flagged, that usable time contains no quiet-window wait, and that the export has no tokens, query strings or storage references.

## Optional: DevTools Performance panel
F12 → **Performance** → record → do the slow action → stop. A red bar in "Main" is a long task. In **Network** keep "Disable cache" unchecked to see what a second visit really downloads. Do not share HAR files; they contain tokens.
