# Local staging for scale tests (synthetic data only)
Nothing here touches production or uses production rows. Data shape comes from aggregate statistics only (company/type shares, entries per voucher, row size).

```
# PostgreSQL 16 on a scratch directory (not a Supabase project, no cost)
initdb -D /tmp/stage/pg; set port=5544, shared_buffers=256MB in postgresql.conf; pg_ctl start
psql -p 5544 -f schema.sql ; psql -p 5544 -f seed-ledgers.sql
bash grow.sh 1 1000000          # load; then 1000001 3000000 / 3000001 5000000 / 5000001 10000000 (also adds shared-GUID pairs, ANALYZE)
python3 bench.py 1M             # single-user timings of the Tally RPCs -> bench_1M.json
./conc.sh postgres 10 40 1 name # pgbench: clients, seconds, bridge-like writer 0|1, label -> p50/p95/p99
```
Results and thresholds: docs/PERF_PLAN.md and docs/perf/staging-2026-11-26.json. The functions in schema.sql are copies of the production RPC bodies with `my_role()` stubbed, minus the free-text pattern escaping.
