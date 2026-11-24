# Nabiad Bridge (Phase 1, read-only)

Copies TallyPrime data (ledger list, Day Book vouchers) into Supabase tables `tally_ledgers`, `tally_vouchers`, `tally_sync_runs`. It never writes to Tally.

**Status:** tested only against `mock_tally.py` (a fake server). It has not been run against the real Tally. The real XML shape is unverified: run once with `--save-raw` on a Tally backup copy and compare.

## Safety (why it is built this way)
On 24-11-2026 a hand-written custom TDL query made the live TallyPrime crash (c0000005). So:
- only Tally's standard reports; no custom TDL; no import or write requests (the tests assert this)
- one request at a time, a pause between requests, day ranges in 7-day chunks
- the first connection error stops the run (a crashed Tally is never hammered)
- only companies in the config file are read
- port 9000 (the real Tally) needs `--confirm-live`; the default is a dry run that only writes JSON files

## Run (dry run, nothing uploaded)
```
python bridge.py --config config.json --company "Nabiad Distribution Ltd." --from 2026-11-20 --to 2026-11-22 --confirm-live --save-raw
```
Do this first on a copy of the data, outside office hours, after a fresh Tally backup (`E:\Tally_Backup\Daily`).

## Upload
`--upload` needs the DB tables (`schema_tally_bridge.sql`, applied only after the owner's "yes" and a manual backup) and a bridge user. Credentials go in the environment (`TALLY_BRIDGE_EMAIL`, `TALLY_BRIDGE_PASSWORD`), never in the repo or config file. Upload code is not tested yet.

## Not done yet
- add the new tables to the three backup lists before applying the SQL
- closing balances (needs Trial Balance or another standard report)
- stock, party/ledger name mapping, Task Scheduler setup, an admin page in the app
