#!/usr/bin/env python3
"""Automated browser benchmark (demo data, no network, headless Chrome). NOT run in CI (needs Playwright + Chrome); run before a release:
    python3 tools/perf-browser-bench.py [--cpu 4] [--repeat 7]
Measures page-switch time (hash change -> skeleton gone) per route, plus script-evaluation long tasks at start-up, prints p50/p95 and fails if a threshold from docs/PERF_PLAN.md is exceeded.
Demo data exercises rendering and JS only; real latency (network, database) must be captured with tools/perf-capture.js on production."""
import argparse, asyncio, json, pathlib, statistics, subprocess, sys, time
from playwright.async_api import async_playwright
root = pathlib.Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(); ap.add_argument("--cpu", type=float, default=4); ap.add_argument("--repeat", type=int, default=7); ap.add_argument("--port", type=int, default=8978); a = ap.parse_args()
ROUTES = ["dash", "entry", "cheques", "closing", "cash", "register", "ivdash", "dcol", "dsum", "tallydash"]
LIMIT_PAGE_MS = 600 * 1.0      # per page switch p95 at 4x CPU throttle (target: <= 200 ms unthrottled, cached)
LIMIT_LONGTASK_MS = 400        # worst single long task during start-up at 4x throttle
CFG = 'window.NABIAD_CONFIG={SUPABASE_URL:"",SUPABASE_ANON_KEY:"",START_DATE:"2026-11-14"};'
def q(v, x): s = sorted(v); return round(s[min(len(s) - 1, int(x * len(s)))])
async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(a.port), "--directory", str(root)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
    bad = []
    try:
        async with async_playwright() as p:
            br = await p.chromium.launch(**({"executable_path": "/usr/bin/google-chrome"} if pathlib.Path("/usr/bin/google-chrome").exists() else {}), args=["--no-sandbox"])
            ctx = await br.new_context(service_workers="block", viewport={"width": 1280, "height": 800}); pg = await ctx.new_page()
            cdp = await ctx.new_cdp_session(pg); await cdp.send("Emulation.setCPUThrottlingRate", {"rate": a.cpu})
            await pg.add_init_script("window.__lt=[];new PerformanceObserver(l=>l.getEntries().forEach(e=>__lt.push(Math.round(e.duration)))).observe({type:'longtask',buffered:true})")
            # synthetic fixtures (the private dev/ folder is not in the repository): 24 fake accounts, 400 days of fake balances
            import datetime
            accs = [{"code": f"TST-{i}", "holder": f"Test Holder {i}", "bank": "Test Bank", "branch": "Main", "acno": f"1000{i:04d}", "group": "N" if i % 2 else "Z", "active": True, "status": "Active", "type": "Current", "sort": i, "routing": "000000000", "swift": "TESTBDDH"} for i in range(24)]
            d0 = datetime.date(2025, 10, 1); hist = [[(d0 + datetime.timedelta(days=k)).isoformat(), f"TST-{i}", 100000 + (k * 37 + i * 911) % 500000, (k * 13 + i) % 20000, ""] for k in range(400) for i in range(24)]
            for pat, body, ct in (("**/config.js*", CFG, "application/javascript"), ("**/dev/accounts.json", json.dumps(accs), "application/json"), ("**/dev/history.json", json.dumps(hist), "application/json"), ("**/dev/dist_parties.json", "[]", "application/json")):
                await pg.route(pat, (lambda b, c: (lambda r: r.fulfill(body=b, content_type=c)))(body, ct))
            await pg.route("**/fonts.g*", lambda r: r.abort())
            await pg.goto(f"http://localhost:{a.port}/"); await pg.wait_for_selector("[data-demo]"); await pg.click("[data-demo^=admin]"); await pg.wait_for_selector("#view")
            await pg.wait_for_timeout(500)
            startup_lt = await pg.evaluate("__lt.slice()")
            print(f"cpu x{a.cpu:g}, repeat {a.repeat}; start-up long tasks (ms): {startup_lt}")
            if startup_lt and max(startup_lt) > LIMIT_LONGTASK_MS: bad.append(f"start-up long task {max(startup_lt)} ms > {LIMIT_LONGTASK_MS}")
            print(f"{'route':10s} {'p50':>6s} {'p95':>6s}  (ms, hash change -> content ready)")
            for r in ROUTES:
                ts = []
                for i in range(a.repeat + 1):
                    await pg.evaluate("location.hash='#/dash'"); await pg.wait_for_timeout(250)
                    t = await pg.evaluate("""(h)=>new Promise(res=>{const t0=performance.now();location.hash=h;const iv=setInterval(()=>{const v=document.querySelector('#view');if(v&&!v.querySelector('.skel')&&v.children.length&&performance.now()-t0>20){clearInterval(iv);res(Math.round(performance.now()-t0))}if(performance.now()-t0>10000){clearInterval(iv);res(10000)}},10)})""", "#/" + r)
                    if i: ts.append(t)      # first visit of each route is a warm-up
                p50, p95 = q(ts, .5), q(ts, .95); print(f"{r:10s} {p50:6d} {p95:6d}")
                if p95 > LIMIT_PAGE_MS: bad.append(f"{r}: p95 {p95} ms > {LIMIT_PAGE_MS:g}")
            await br.close()
    finally: srv.terminate()
    if bad: print("FAIL\n" + "\n".join(bad)); sys.exit(1)
    print("browser bench OK")
asyncio.run(main())
