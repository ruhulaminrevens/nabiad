#!/usr/bin/env bash
# Record one off-site backup result for the app's Backup page.
# usage: record-run.sh <db|storage> <ok|fail> [stamp] [bytes] [detail]
# Needs DATABASE_URL. Never fails the workflow: a missing table (migration
# schema_offsite_backup_runs.sql not applied yet) only prints a warning.
set -uo pipefail
kind="${1:?kind}"; res="${2:?ok|fail}"; stamp="${3:-}"; bytes="${4:-}"; detail="${5:-}"
[ -n "${DATABASE_URL:-}" ] || { echo "record-run: DATABASE_URL not set, skipping"; exit 0; }
case "$kind" in db|storage) ;; *) echo "record-run: bad kind $kind" >&2; exit 0;; esac
case "$res" in ok) okv=true;; fail) okv=false;; *) echo "record-run: bad result $res" >&2; exit 0;; esac
[[ "$bytes" =~ ^[0-9]+$ ]] || bytes=""
detail="${detail:0:300}"
if ! "${PG_BIN:+$PG_BIN/}psql" "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v kind="$kind" -v ok="$okv" -v stamp="$stamp" -v bytes="$bytes" -v detail="$detail" >/dev/null <<'SQL'
insert into public.offsite_backup_runs(kind, ok, stamp, bytes, detail)
values (:'kind', :'ok'::boolean, nullif(:'stamp',''), nullif(:'bytes','')::bigint, nullif(:'detail',''));
delete from public.offsite_backup_runs where at < now() - interval '400 days';
SQL
then echo "record-run: could not record (is schema_offsite_backup_runs.sql applied?)" >&2; fi
exit 0
