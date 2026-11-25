#!/usr/bin/env python3
"""Performance guard (runs in CI): gzip size budgets for the files every user downloads, plus three code-shape checks
that protect the v6.175-6.177 fixes from being undone by accident. Raise a budget only on purpose, with a measurement."""
import gzip, pathlib, re, sys
root = pathlib.Path(__file__).resolve().parent.parent
BUDGET_GZ = {"app.js": 290_000, "inv.js": 80_000, "cashbook.js": 36_000, "tally.js": 30_000, "i18n.js": 40_000, "style.css": 60_000}
bad = []
for f, cap in BUDGET_GZ.items():
    p = root / f
    if not p.exists(): continue
    n = len(gzip.compress(p.read_bytes(), 9))
    print(f"{f:14s} {n:>8,d} B gz  (budget {cap:,d})")
    if n > cap: bad.append(f"{f}: {n:,d} B gz is over the {cap:,d} B budget")
app = (root / "app.js").read_text(encoding="utf-8"); tally = (root / "tally.js").read_text(encoding="utf-8")
if not re.search(r"function saveCache\(\)\s*{[^}]*setTimeout\(saveCacheNow", app): bad.append("app.js: saveCache() must stay debounced (setTimeout -> saveCacheNow)")
if "quietReload(" not in app: bad.append("app.js: the 30 s refresh must use quietReload (redraw only on change)")
if not re.search(r"const tdRpc = \(name, args\)", tally) or "tdFly" not in tally: bad.append("tally.js: Tally reads must go through tdRpc (single-flight + short cache)")
if re.search(r'\bsb\.rpc\("tally_(overview|voucher_filters|sync_health|recon_shared|recon_coverage|recon_changes)"', tally): bad.append("tally.js: dashboard summaries must not call sb.rpc directly (use tdRpc)")
if bad:
    print("\n".join("FAIL " + b for b in bad)); sys.exit(1)
print("perf budget OK")
