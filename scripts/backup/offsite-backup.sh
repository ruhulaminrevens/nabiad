#!/usr/bin/env bash
# Nabiad off-site backup: dump -> verify -> encrypt (age, public key only).
# Used by .github/workflows/offsite-backup.yml and runnable locally.
#
# Required env:
#   DATABASE_URL     Supabase *session pooler* (or direct) connection string
#   AGE_RECIPIENT    age public key (age1...). The private key never touches CI.
# Optional env:
#   OUT_DIR          output folder (default ./out)
#   PG_BIN           folder holding pg_dump/psql/pg_restore (default: from PATH)
#   PREV_MANIFEST    path to the previous manifest.json (enables the shrink alarm)
#   MAX_DROP_PCT     fail if a table lost more than this share of rows (default 20)
#   MIN_ROWS_FLOOR   ignore the alarm for tables smaller than this (default 20)
#   MIN_DUMP_BYTES   fail if public.dump is smaller (default 50000)
#   SKIP_AUTH=1      skip the auth.users/identities dump (not recommended)
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT is required}"
case "$AGE_RECIPIENT" in age1*) ;; *) echo "AGE_RECIPIENT must be an age public key (age1...)" >&2; exit 2;; esac

OUT_DIR="${OUT_DIR:-./out}"
PG_BIN="${PG_BIN:-}"
MAX_DROP_PCT="${MAX_DROP_PCT:-20}"
MIN_ROWS_FLOOR="${MIN_ROWS_FLOOR:-20}"
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-50000}"
STAMP="${STAMP:-$(date -u +%Y%m%d-%H%M)}"
pg() { if [ -n "$PG_BIN" ]; then "$PG_BIN/$1" "${@:2}"; else "$1" "${@:2}"; fi; }

# every table a restore needs (kept in sync with public.nabiad_restore_tables() + profiles/leaf_marks/audit_log)
TABLES=(accounts dist_asms dist_parties inv_items rm_products cheque_purposes cheques cheque_status
  cheque_statement_verifications books balances balance_drafts reminders cash_records cashbook_days
  cashbook_ledgers cash_group_names cash_tally_vouchers dist_collections dist_opening dist_sales_reg
  inv_demand inv_orders rm_daily rm_ledger inv_locks profiles leaf_marks audit_log user_avatars push_subs backups)
# a backup with zero rows here is treated as broken
MUST_HAVE=(accounts balances profiles)

umask 077
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT_DIR"

echo "==> dumping public schema"
pg pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --schema=public --file="$WORK/public.dump"

if [ "${SKIP_AUTH:-0}" != "1" ]; then
  echo "==> dumping auth.users / auth.identities (logins)"
  pg pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --data-only \
    --table=auth.users --table=auth.identities --file="$WORK/auth.dump"
fi

echo "==> building manifest"
{
  printf '{"taken_at":"%s","stamp":"%s","tables":{' "$(date -u +%FT%TZ)" "$STAMP"
  first=1
  for t in "${TABLES[@]}"; do
    n="$(pg psql "$DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c "select to_regclass('public.${t}') is not null" 2>/dev/null || echo f)"
    if [ "$n" = "t" ]; then c="$(pg psql "$DATABASE_URL" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from public.\"${t}\"")"; else c="null"; fi
    [ $first = 1 ] || printf ','; first=0
    printf '"%s":%s' "$t" "$c"
  done
  printf '}}\n'
} > "$WORK/manifest.json"

echo "==> verifying"
size=$(stat -c %s "$WORK/public.dump")
[ "$size" -ge "$MIN_DUMP_BYTES" ] || { echo "FAIL: public.dump only $size bytes (< $MIN_DUMP_BYTES)" >&2; exit 3; }
entries=$(pg pg_restore --list "$WORK/public.dump" | grep -c . || true)
[ "$entries" -gt 20 ] || { echo "FAIL: pg_restore --list shows only $entries entries" >&2; exit 3; }
if [ "${SKIP_AUTH:-0}" != "1" ]; then
  [ "$(pg pg_restore --list "$WORK/auth.dump" | grep -c 'TABLE DATA')" -ge 1 ] || { echo "FAIL: auth.dump has no table data" >&2; exit 3; }
fi
for t in "${MUST_HAVE[@]}"; do
  c=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['tables'].get(sys.argv[2]))" "$WORK/manifest.json" "$t")
  case "$c" in ''|None|null|0) echo "FAIL: table $t has $c rows" >&2; exit 3;; esac
done
if [ -n "${PREV_MANIFEST:-}" ] && [ -s "$PREV_MANIFEST" ]; then
  python3 - "$PREV_MANIFEST" "$WORK/manifest.json" "$MAX_DROP_PCT" "$MIN_ROWS_FLOOR" <<'PY'
import json, sys
prev, cur = (json.load(open(p))["tables"] for p in sys.argv[1:3])
pct, floor = float(sys.argv[3]), int(sys.argv[4])
bad = []
for t, p in prev.items():
    c = cur.get(t)
    if p is None or p < floor: continue
    if c is None or c < p * (1 - pct / 100): bad.append(f"{t}: {p} -> {c}")
if bad:
    print("FAIL: shrink alarm (possible data loss) - " + "; ".join(bad), file=sys.stderr); sys.exit(4)
print("shrink check ok")
PY
fi

echo "==> encrypting"
OUT="$OUT_DIR/nabiad-$STAMP.tar.age"
files=(public.dump manifest.json); [ -f "$WORK/auth.dump" ] && files+=(auth.dump)
tar -C "$WORK" -cf - "${files[@]}" | age -r "$AGE_RECIPIENT" -o "$OUT"
cp "$WORK/manifest.json" "$OUT_DIR/manifest.json"
( cd "$OUT_DIR" && sha256sum "nabiad-$STAMP.tar.age" > "nabiad-$STAMP.tar.age.sha256" )
echo "OK  $(stat -c %s "$OUT") bytes -> $OUT"
