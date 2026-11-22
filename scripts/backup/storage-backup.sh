#!/usr/bin/env bash
# Nabiad off-site backup, part 2: Supabase Storage bucket (cheque photos).
# Syncs the bucket through Supabase's S3-compatible endpoint (scoped S3 keys,
# not the service_role key), verifies, then encrypts with an age public key.
#
# Required env:
#   S3_ENDPOINT            e.g. https://<ref>.storage.supabase.co/storage/v1/s3
#   S3_REGION              e.g. ap-southeast-1
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   Supabase Storage S3 access keys
#   AGE_RECIPIENT          age public key (age1...)
# Optional env:
#   BUCKET                 default cheque-photos
#   OUT_DIR                default ./out
#   AWS_BIN                aws cli binary (default aws; tests use a shim)
#   PREV_MANIFEST          previous storage manifest.json (enables the shrink alarm)
#   MAX_DROP_PCT           fail if object count fell by more than this (default 10)
#   ALLOW_EMPTY=1          allow an empty bucket (first setup only)
set -Eeuo pipefail

: "${S3_ENDPOINT:?S3_ENDPOINT is required}"
: "${S3_REGION:?S3_REGION is required}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT is required}"
case "$AGE_RECIPIENT" in age1*) ;; *) echo "AGE_RECIPIENT must be an age public key (age1...)" >&2; exit 2;; esac

BUCKET="${BUCKET:-cheque-photos}"
OUT_DIR="${OUT_DIR:-./out}"
AWS_BIN="${AWS_BIN:-aws}"
MAX_DROP_PCT="${MAX_DROP_PCT:-10}"
STAMP="${STAMP:-$(date -u +%Y%m%d-%H%M)}"
export AWS_DEFAULT_REGION="$S3_REGION"
# some S3-compatible servers reject newer default checksum headers
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

umask 077
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT_DIR" "$WORK/files"

echo "==> syncing s3://$BUCKET"
"$AWS_BIN" s3 sync "s3://$BUCKET" "$WORK/files" --endpoint-url "$S3_ENDPOINT" --only-show-errors

echo "==> building manifest"
python3 - "$WORK/files" "$WORK/manifest.json" "$STAMP" "$BUCKET" <<'PY'
import hashlib, json, os, sys, datetime
root, out, stamp, bucket = sys.argv[1:5]
items = {}
for d, _, fs in os.walk(root):
    for f in fs:
        p = os.path.join(d, f)
        h = hashlib.sha256()
        with open(p, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""): h.update(chunk)
        items[os.path.relpath(p, root)] = {"size": os.path.getsize(p), "sha256": h.hexdigest()}
json.dump({"taken_at": datetime.datetime.now(datetime.timezone.utc).strftime("%FT%TZ"), "stamp": stamp, "bucket": bucket,
           "count": len(items), "bytes": sum(v["size"] for v in items.values()), "objects": items}, open(out, "w"))
print(f"{len(items)} objects, {sum(v['size'] for v in items.values())} bytes")
PY

echo "==> verifying"
count=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['count'])" "$WORK/manifest.json")
if [ "$count" -eq 0 ] && [ "${ALLOW_EMPTY:-0}" != "1" ]; then echo "FAIL: bucket $BUCKET is empty (set ALLOW_EMPTY=1 only on first setup)" >&2; exit 3; fi
if [ -n "${PREV_MANIFEST:-}" ] && [ -s "$PREV_MANIFEST" ]; then
  python3 - "$PREV_MANIFEST" "$WORK/manifest.json" "$MAX_DROP_PCT" <<'PY'
import json, sys
prev, cur = (json.load(open(p)) for p in sys.argv[1:3]); pct = float(sys.argv[3])
bad = []
if prev["count"] >= 10 and cur["count"] < prev["count"] * (1 - pct / 100):
    bad.append(f"object count {prev['count']} -> {cur['count']}")
# photos are write-once: a key whose content changed or vanished deserves a look
gone = [k for k in prev["objects"] if k not in cur["objects"]]
changed = [k for k, v in prev["objects"].items() if k in cur["objects"] and cur["objects"][k]["sha256"] != v["sha256"]]
if changed: bad.append(f"{len(changed)} object(s) changed content, e.g. {changed[0]}")
if bad: print("FAIL: storage shrink/change alarm - " + "; ".join(bad), file=sys.stderr); sys.exit(4)
print(f"check ok ({len(gone)} object(s) deleted since last backup)")
PY
fi

echo "==> encrypting"
OUT="$OUT_DIR/nabiad-storage-$STAMP.tar.age"
tar -C "$WORK" -cf - files manifest.json | age -r "$AGE_RECIPIENT" -o "$OUT"
cp "$WORK/manifest.json" "$OUT_DIR/storage-manifest.json"
( cd "$OUT_DIR" && sha256sum "nabiad-storage-$STAMP.tar.age" > "nabiad-storage-$STAMP.tar.age.sha256" )
echo "OK  $(stat -c %s "$OUT") bytes -> $OUT"
