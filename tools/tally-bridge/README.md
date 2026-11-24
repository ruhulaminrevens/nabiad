# Nabiad Bridge (Phase 1, read-only)

Copies TallyPrime data (ledger list, Day Book vouchers) into Supabase tables `tally_ledgers`, `tally_vouchers`, `tally_sync_runs`. It never writes to Tally.

**Status:** parser and Day Book dates verified on the real Tally (Nabiad Distribution Ltd., 21-22 Nov 2026: 7 + 8 vouchers matched Tally's own Day Book). The upload path is tested only against a fake PostgREST server in `test_bridge.py`, not yet against Supabase.

## Safety
On 24-11-2026 a hand-written custom TDL query made the live TallyPrime crash. So:
- only Tally's standard reports; no custom TDL; no import or write requests (tests assert this)
- one request at a time, a pause between requests; the first connection error stops the run
- only companies in the config file; port 9000 needs `--confirm-live`; the default is a dry run (JSON files only)
- if Tally answers for a different date than asked, the run stops and writes nothing (exit code 3)

## How it keeps up with late and old edits (the app needs data from 2023-01-01)
Vouchers are upserted by GUID, so edits overwrite. Each night (default mode, with `--upload`):
1. re-reads the last `window_days` (60) days,
2. plus the next `deep_days` (150) days of history, moving forward each night and wrapping around from `start_date` (progress is kept in `bridge_state.json`), so an old edit is found within one cycle,
3. vouchers Tally no longer returns for a re-read day are flagged `deleted=true` (never hard-deleted).
`--from YYYY-MM-DD [--to ...]` re-reads exactly that period at once. `--deep-days 5000 --max-minutes 240` does the first backfill in resumable pieces.
This Tally ignores SVFROMDATE/SVTODATE and follows SVCURRENTDATE, so it is one request per day.

## Run (dry run, nothing uploaded)
```
py bridge.py --config config.json --company "Nabiad Distribution Ltd." --from 2026-11-21 --to 2026-11-22 --skip-ledgers --confirm-live
```
Do this after a fresh Tally backup, with nobody entering data.

## Upload
`--upload` needs the tables (`schema_tally_bridge.sql`, applied only after the owner's "yes" and a manual backup) and a bridge user. Credentials go in the environment (`TALLY_BRIDGE_EMAIL`, `TALLY_BRIDGE_PASSWORD`), never in the repo or config file.

## Not done yet
- Phase 2 guard: nightly Trial Balance vs database balances, to flag any change the scan has not reached yet
- stock items, Task Scheduler setup, an admin page in the app
