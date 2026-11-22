#!/usr/bin/env python3
"""Keep the four backup table lists in sync:
  1. app.js            BACKUP_TABLES        ("Full Data" export)
  2. schema_admin_restore.sql  nabiad_restore_tables() + extras in nabiad_capture_snapshot (DB snapshot / restore)
  3. scripts/backup/offsite-backup.sh  TABLES  (off-site manifest; may hold extra operational tables)
  4. every table must be created by some schema*.sql
Exit 1 on any mismatch."""
import glob, os, re, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
read = lambda p: open(os.path.join(root, p), encoding="utf-8").read()
errors = []

app = read("app.js")
m = re.search(r"/\* BACKUP_TABLES:start.*?\*/\s*const BACKUP_TABLES = \{(.*?)\};\s*/\* BACKUP_TABLES:end \*/", app, re.S)
if not m: sys.exit("BACKUP_TABLES block not found in app.js")
js = set(re.findall(r"(\w+):\s*(?:\"|\[)", m.group(1)))

sql = read("schema_admin_restore.sql")
m = re.search(r"nabiad_restore_tables\(\) returns text\[\].*?select array\[(.*?)\]::text\[\]", sql, re.S)
restore = set(re.findall(r"'(\w+)'", m.group(1))) if m else set()
m = re.search(r"nabiad_restore_tables\(\) \|\| array\[(.*?)\]", sql, re.S)
extras = set(re.findall(r"'(\w+)'", m.group(1))) if m else set()
if not restore or not extras: errors.append("could not parse schema_admin_restore.sql table lists")
snapshot = restore | extras

sh = read("scripts/backup/offsite-backup.sh")
m = re.search(r"^TABLES=\((.*?)\)", sh, re.S | re.M)
bash = set(m.group(1).split()) if m else set()

for name, a, b in [("app.js BACKUP_TABLES vs SQL snapshot", js, snapshot)]:
    if a - b: errors.append(f"{name}: only in app.js: {sorted(a - b)}")
    if b - a: errors.append(f"{name}: only in SQL: {sorted(b - a)}")
if snapshot - bash: errors.append(f"offsite-backup.sh TABLES is missing: {sorted(snapshot - bash)}")

created = set()
for f in glob.glob(os.path.join(root, "schema*.sql")):
    created |= set(re.findall(r"create table (?:if not exists )?(?:public\.)?(\w+)", open(f, encoding="utf-8").read(), re.I))
created |= {"profiles"}
for t in sorted(snapshot | bash):
    if t not in created: errors.append(f"table {t} is listed but no schema*.sql creates it")

if errors:
    print("\n".join("FAIL: " + e for e in errors)); sys.exit(1)
print(f"ok: {len(js)} export tables = {len(snapshot)} snapshot tables; off-site manifest covers {len(bash)}")
