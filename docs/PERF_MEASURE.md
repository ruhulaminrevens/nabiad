# NABIAD — real browser performance measurement (safe procedure)

Goal: measure what you actually feel on your own computer or phone, signed in on https://app.nabiad.com, without exposing anything private.

## কী নিরাপদ (what is safe)
`tools/perf-capture.js` only reads the browser's own timing entries. It does **not** read cookies, localStorage, request headers, tokens, response bodies or anything on screen, and it sends nothing anywhere. The saved JSON has: page/action name, milliseconds, request **paths** (query strings are cut off), byte counts, long-task times, memory totals, browser/CPU/connection type. You can open the JSON in a text editor before sending it.

## ১. প্রস্তুতি (once)
1. Chrome or Edge on the computer you really use. Close other heavy tabs. Use an **Admin** login (needed for the Tally pages).
2. Open https://app.nabiad.com and sign in. Wait until the dashboard has loaded. Press **Ctrl+Shift+R** once (hard reload) so you measure the newest version.
3. Press **F12** → **Console**. If the browser says "type allow pasting", type `allow pasting` and Enter (this is a browser safety step).
4. Open `tools/perf-capture.js` from the repository (https://github.com/ruhulaminrevens/nabiad/blob/main/tools/perf-capture.js → **Raw**), copy everything, paste into the Console, Enter. You should see `NabiadPerf ready`.

## ২. স্বয়ংক্রিয় পরিমাপ — প্রধান পেজগুলো (about 2 minutes)
```
await NabiadPerf.auto()
```
It opens, one after another: Cheque Posting, Cheque Register, Bank Closing, Cash Book, Cash Register, Inventory Dashboard, Collection Entry, Collection Summary, Tally Dashboard — each **first visit** and **revisit** (revisit shows the cache effect). Do not click anything until it prints `done`.

## ৩. হাতে-করা পরিমাপ — ট্যাব বদল, এন্ট্রি সেভ, Explorer
For anything you click yourself:
```
NabiadPerf.start('Tally: Voucher Explorer tab')
```
click the tab, wait until the table is fully visible, then
```
NabiadPerf.stop()
```
Do these (each one 3 times, label them the same):

| What | start label | Stop when |
|---|---|---|
| Dashboard open | `Dashboard` (or use `await NabiadPerf.go('Dashboard','#/dash')`) | numbers visible |
| Internal tab switching | `Tab: <page> -> <tab>` | new tab content visible |
| Cheque Posting save | `Cheque posting save` | success message shown |
| Cash Book entry save | `Cash book entry save` | saved / row visible |
| Bank Closing | `Bank closing open` and `Bank closing save` | page ready / saved |
| Voucher Explorer | `Tally: Voucher Explorer open`, `…search month`, `…search text "<a word>"` | rows shown |
| Ledger Explorer | `Tally: Ledger Explorer open`, `…open one ledger statement` | rows shown |

Use real but harmless test entries for the save measurements, or cancel/delete them afterwards the normal way. Do **not** type real customer data into labels.

## ৪. ফাইল পাঠান
```
NabiadPerf.export()
```
downloads `nabiad-perf-<time>.json`. Send that file. Also write down (one line): device (PC/laptop/phone), Wi-Fi or mobile data, which city you are in.

## ৫. কী দেখব (how I read the result)
Targets from `docs/PERF_PLAN.md`: cached page ≤ 200 ms, tab ≤ 500 ms, dashboard usable ≤ 1.5 s, entry save ≤ 1.5 s, Tally summary RPC ≤ 100 ms with a fresh snapshot. `api_ms_p95` is the slowest typical request; `slow_api_ge_500ms` names the RPC/table path that is slow; `long_tasks` and `long_task_total_ms` show UI freezing (a task over 50 ms); `js_heap_MB_after` growing over visits points to a leak.

## Optional: DevTools Performance panel (when one page feels slow)
F12 → **Performance** → click record → do the slow action → stop. A red bar in "Main" is a long task. Chrome's **Network** tab with "Disable cache" **unchecked** shows what the second visit really downloads. Do not share HAR files or screenshots of the Network tab: they contain tokens. Use the JSON above instead.
