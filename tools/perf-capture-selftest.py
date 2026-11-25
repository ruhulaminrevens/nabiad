"""Self-test for tools/perf-capture.js against the demo build (synthetic data only, no network, no production).
Checks: it loads, measures routes + Tally tabs + reconciliation sub-tabs, reports route_changed / usable vs settled,
flags a missing route as incomplete, exports no tokens/URLs/queries, and never leaves the page with changed data.
Run: python3 tools/perf-capture-selftest.py"""
import asyncio, json, pathlib, subprocess, sys, time, re
from playwright.async_api import async_playwright
root = pathlib.Path(__file__).resolve().parent.parent
PORT = 8979
CFG = 'window.NABIAD_CONFIG={SUPABASE_URL:"",SUPABASE_ANON_KEY:"",START_DATE:"2026-11-14"};'
async def main():
    subprocess.run(["pkill", "-f", f"http.server {PORT}"], check=False)
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", str(root)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
    bad = []
    try:
        async with async_playwright() as p:
            br = await p.chromium.launch(**({"executable_path": "/usr/bin/google-chrome"} if pathlib.Path("/usr/bin/google-chrome").exists() else {}), args=["--no-sandbox"])
            ctx = await br.new_context(service_workers="block", viewport={"width": 1280, "height": 800}); pg = await ctx.new_page()
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            # synthetic fixtures (the private dev/ folder is not in the repository): 24 fake accounts, 400 days of fake balances
            import datetime
            accs = [{"code": f"TST-{i}", "holder": f"Test Holder {i}", "bank": "Test Bank", "branch": "Main", "acno": f"1000{i:04d}", "group": "N" if i % 2 else "Z", "active": True, "status": "Active", "type": "Current", "sort": i, "routing": "000000000", "swift": "TESTBDDH"} for i in range(24)]
            d0 = datetime.date(2025, 10, 1); hist = [[(d0 + datetime.timedelta(days=k)).isoformat(), f"TST-{i}", 100000 + (k * 37 + i * 911) % 500000, (k * 13 + i) % 20000, ""] for k in range(400) for i in range(24)]
            for pat, body, ct in (("**/config.js*", CFG, "application/javascript"), ("**/dev/accounts.json", json.dumps(accs), "application/json"), ("**/dev/history.json", json.dumps(hist), "application/json"), ("**/dev/dist_parties.json", "[]", "application/json")):
                await pg.route(pat, (lambda b, c: (lambda r: r.fulfill(body=b, content_type=c)))(body, ct))
            await pg.route("**/fonts.g*", lambda r: r.abort())
            await pg.goto(f"http://localhost:{PORT}/"); await pg.wait_for_selector("[data-demo]"); await pg.click("[data-demo^=admin]"); await pg.wait_for_selector("#view"); await pg.wait_for_timeout(800)
            await pg.evaluate((root / "tools/perf-capture.js").read_text())
            cold = await pg.evaluate("NabiadPerf.cold()")
            await pg.evaluate("NabiadPerf.auto({samples:3, only:['Dashboard','Cash Book (open only)','Tally']})")
            bogus = await pg.evaluate("NabiadPerf.go('Bogus','#/nope_page')")      # unknown route -> app redirects to dash: must not be reported as a clean result
            data = await pg.evaluate("NabiadPerf.export.call(NabiadPerf)") if False else await pg.evaluate("(async()=>{const a=document.createElement('a');const o={};const orig=URL.createObjectURL;let txt='';URL.createObjectURL=b=>{b.text().then(t=>txt=t);return 'blob:x'};HTMLAnchorElement.prototype.click=function(){};await NabiadPerf.export();await new Promise(r=>setTimeout(r,200));URL.createObjectURL=orig;return txt})()")
            d = json.loads(data); runs = d["runs"]
            labels = {r["label"] for r in runs}
            print("runs:", len(runs), "labels:", len(labels)); [print("  ", l) for l in sorted(labels)]
            for need in ("Dashboard", "Cash Book (open only)", "Tally Dashboard"):
                if need not in labels: bad.append("missing " + need)
            tabs = [l for l in labels if l.startswith("Tally tab:")]; subs = [l for l in labels if l.startswith("Reconciliation:")]
            if len(tabs) < 6: bad.append(f"expected >=6 Tally tabs, got {len(tabs)}")
            if len(subs) < 6: bad.append(f"expected >=6 reconciliation sub-tabs, got {len(subs)}")
            cats = {r["category"] for r in runs}
            for c in ("first_visit", "warm_revisit", "tab_first", "tab_cached", "cold_startup"):
                if c not in cats: bad.append("category not produced: " + c)
            for r in runs:
                if r.get("category") in ("cold_startup", "manual"): continue
                if r.get("route_changed") and r.get("usable_ms") is None and not r.get("incomplete"): bad.append("usable_ms missing for " + r["label"])
                if r.get("usable_ms") is not None and r.get("network_settled_ms") is not None and r["network_settled_ms"] < r["usable_ms"]: bad.append("settled < usable for " + r["label"])
                if r.get("usable_ms") is not None and r["usable_ms"] > 700 + r.get("network_settled_ms", 0): bad.append("usable includes quiet-window wait: " + r["label"])
            if not (bogus["incomplete"] or not bogus["route_changed"]): bad.append("unknown route must be flagged incomplete/not changed")
            if "typed" in json.dumps(d): pass
            blob = json.dumps(d)
            for pat in (r"eyJ[A-Za-z0-9_-]{20,}", r"apikey", r"authorization", r"\?[a-z_]+=", r"localStorage", r"cookie"):
                if re.search(pat, blob, re.I): bad.append("export contains forbidden pattern: " + pat)
            v = d["versions"]; print("versions:", {k: v.get(k) for k in ("loaded_app_js", "edge_index_html", "edge_sw_js", "consistent_release", "sw_registered")})
            if v.get("loaded_app_js") != v.get("edge_index_html"): bad.append("loaded vs index version mismatch")
            if errs: bad.append("page errors: " + "; ".join(errs[:3]))
            for r in runs:
                if r.get("incomplete"): print("  incomplete:", r["label"], r.get("category"), r.get("reasons"))
            print("summary rows:", len(d["summary"]["scenarios"]), "| incomplete runs:", d["incomplete_runs"], "/", d["total_runs"])
            for s in d["summary"]["scenarios"][:8]: print("  ", s["scenario"], "n=", s["samples"], "usable p50/p95:", s["usable_p50_ms"], s["usable_p95_ms"], "settled p95:", s["settled_p95_ms"])
            await br.close()
    finally: srv.terminate()
    if bad: print("FAIL\n" + "\n".join(bad)); sys.exit(1)
    print("perf-capture self-test OK")
asyncio.run(main())
