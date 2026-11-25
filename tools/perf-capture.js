/* NABIAD performance capture v2 — paste this whole file into the Chrome/Edge DevTools Console while signed in at https://app.nabiad.com
   READ-ONLY. It changes the page only by (a) setting location.hash to open a page and (b) clicking the Tally tab / sub-tab buttons. It never clicks
   Save/Submit, never types into a field, never creates/edits/cancels/deletes anything, never reads cookies, storage, headers, tokens, request or
   response bodies or anything printed on screen. It wraps window.fetch ONLY to count in-flight requests and record path + status + duration
   (no URLs with query strings, no bodies). The exported JSON holds: labels, timings, request paths (query removed, ids/storage paths redacted), byte
   counts, HTTP status codes, long-task durations, heap totals, and the app / service-worker version strings. Procedure: docs/PERF_MEASURE.md */
(() => {
  "use strict";
  if (window.NabiadPerf && window.NabiadPerf.version === 2) { console.log("NabiadPerf 2 is already loaded: NabiadPerf.help()"); return; }
  const TARGET_CACHED_MS = 200, TARGET_NETWORK_MS = 1500, STATEMENT_TIMEOUT_MS = 8000, MAX_RUN_MS = 20000, NO_CHANGE_MS = 3000;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const now = () => performance.now();
  const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]); };   // nearest-rank
  const heap = () => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 104857.6) / 10 : null;

  /* ---------- redaction: paths only, no query, no ids, no storage object paths ---------- */
  const cleanPath = u => {
    try {
      const x = new URL(u, location.href);
      let p = x.pathname.replace(/\/storage\/v1\/object\/.*/, "/storage/v1/object/<redacted>").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{20,}/gi, ":id").replace(/\/\d{5,}(?=\/|$)/g, "/:n");
      return x.origin === location.origin ? p : x.hostname.replace(/^[a-z0-9]{16,}\./, "<project>.") + p;
    } catch { return "?"; }
  };
  const kind = p => /\/rest\/v1\/rpc\//.test(p) ? "rpc" : /\/rest\/v1\//.test(p) ? "table" : /\/auth\/v1\//.test(p) ? "auth" : /\/storage\/v1\//.test(p) ? "storage" : /\.(js|css|woff2?|png|svg|json|webmanifest|ico)$/.test(p) ? "asset" : "other";
  const rpcName = p => (p.match(/\/rpc\/([\w]+)/) || [])[1] || p;

  /* ---------- observers (own buffers, so the 250-entry Resource Timing limit cannot lose data) ---------- */
  const res = [], longTasks = [], net = [], flags = { buffer_full_events: 0, fetch_wrapper_effective: null, resource_buffer_possibly_truncated_at_load: false };
  try { performance.setResourceTimingBufferSize(3000); } catch { }
  flags.resource_buffer_possibly_truncated_at_load = performance.getEntriesByType("resource").length >= 240;
  performance.addEventListener?.("resourcetimingbufferfull", () => { flags.buffer_full_events++; try { performance.setResourceTimingBufferSize(performance.getEntriesByType("resource").length + 2000); } catch { } });
  try { new PerformanceObserver(l => l.getEntries().forEach(e => { const p = cleanPath(e.name); res.push({ path: p, kind: kind(p), start: e.startTime, end: e.responseEnd, dur: e.duration, status: e.responseStatus || null, bytes: e.transferSize || 0, cached: e.transferSize === 0 && e.decodedBodySize > 0 }); })).observe({ type: "resource", buffered: true }); } catch { }
  try { new PerformanceObserver(l => l.getEntries().forEach(e => longTasks.push({ t: e.startTime, d: e.duration }))).observe({ type: "longtask", buffered: true }); } catch { }
  let fcp = null, lcp = null;
  try { new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.name === "first-contentful-paint") fcp = e.startTime; })).observe({ type: "paint", buffered: true }); } catch { }
  try { new PerformanceObserver(l => l.getEntries().forEach(e => { lcp = e.startTime; })).observe({ type: "largest-contentful-paint", buffered: true }); } catch { }

  /* ---------- in-flight tracking (fetch wrapper: counts + status only) ---------- */
  let inflight = 0, lastNetAt = 0;
  const origFetch = window.fetch;
  window.fetch = function (input) {
    const rec = { path: cleanPath(typeof input === "string" ? input : (input && input.url) || String(input)), t0: now(), t1: null, status: null, err: null };
    net.push(rec); inflight++; lastNetAt = rec.t0;
    const done = (s, e) => { rec.t1 = now(); rec.status = s; rec.err = e; inflight--; lastNetAt = rec.t1; };
    return origFetch.apply(this, arguments).then(r => { done(r.status, null); return r; }, e => { done(null, e && e.name === "AbortError" ? "aborted" : "failed"); throw e; });
  };

  /* ---------- unsaved-typing guard (same idea as the app's own DIRTY flag) ---------- */
  let typed = false;
  document.addEventListener("input", e => { if (e.isTrusted && e.target.closest?.("#view, .modal")) typed = true; }, true);

  /* ---------- page state helpers ---------- */
  const activeKey = () => $("[data-k].on")?.dataset.k || null;
  const routeKey = h => (String(h).match(/^#\/(\w+)/) || [])[1] || null;
  const ready = el => !!el && !el.querySelector(".skel") && el.children.length > 0 && (el.textContent || "").trim().length > 20;
  const errored = el => !!el && !!el.querySelector(".alert.rd");
  async function idle(maxMs = 15000) {   // unmeasured: wait until nothing is in flight and nothing started for 400 ms
    const t0 = now();
    while (now() - t0 < maxMs) { if (inflight === 0 && now() - lastNetAt > 400 && !$("#view .skel")) return true; await sleep(100); }
    return false;
  }

  /* ---------- the core measurement ---------- */
  const runs = [], seen = new Set();
  async function measure(label, category, trigger, o) {
    const settledBefore = await idle();
    const t0 = now(), net0 = net.length, res0 = res.length, lt0 = longTasks.length, heap0 = heap(), nodes0 = document.getElementsByTagName("*").length, wall = new Date().toISOString();
    const out = { label, category, at: wall, ok: false, incomplete: false, reasons: [], unsettled_before: !settledBefore };
    let changed = false, usableDom = null, usable = null, pendingAtUsable = null, errorRendered = false, finished = false;
    const check = () => {
      if (finished) return;
      const tt = now() - t0;
      if (!changed && o.expect()) changed = true;
      if (changed && usable === null && usableDom === null && ready(o.container())) {
        usableDom = tt; pendingAtUsable = inflight; errorRendered = errored(o.container());
        requestAnimationFrame(() => setTimeout(() => { usable = now() - t0; }, 0));   // include the next paint, not any quiet-window wait
      }
    };
    const mo = new MutationObserver(check); mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "aria-selected"] });
    trigger();
    let timedOut = false, noChange = false;
    for (;;) {
      check();
      const tt = now() - t0;
      if (usable !== null && inflight === 0 && now() - lastNetAt > 500) break;      // quiet window is only used to DECIDE we are done; it is excluded from the metrics
      if (!changed && tt > NO_CHANGE_MS) { noChange = true; break; }
      if (tt > MAX_RUN_MS) { timedOut = true; break; }
      await sleep(16);
    }
    finished = true; mo.disconnect();
    await sleep(300);   // let Resource Timing / long-task observers deliver (not counted)
    const mine = net.slice(net0), pending = mine.filter(r => r.t1 === null).map(r => r.path);
    const resMine = res.slice(res0).filter(r => r.start >= t0 - 5);
    const apiNet = mine.filter(r => ["rpc", "table", "auth"].includes(kind(r.path)));
    if (apiNet.length === 0 && resMine.some(r => ["rpc", "table"].includes(r.kind))) flags.fetch_wrapper_effective = false; else if (apiNet.length) flags.fetch_wrapper_effective = flags.fetch_wrapper_effective !== false;
    const lastEnd = Math.max(0, ...mine.filter(r => r.t1 !== null).map(r => r.t1), ...resMine.map(r => r.end));
    const rpcs = mine.filter(r => kind(r.path) === "rpc").map(r => {
      const m = resMine.find(x => x.path === r.path && Math.abs(x.start - r.t0) < 50);
      const ms = Math.round(m ? m.dur : (r.t1 === null ? now() - r.t0 : r.t1 - r.t0));
      const status = m?.status ?? r.status;
      return { name: rpcName(r.path), ms, status, aborted: r.err === "aborted", failed: r.err === "failed", statement_timeout_suspected: (status >= 500 && ms >= STATEMENT_TIMEOUT_MS - 600) || undefined, pending: r.t1 === null || undefined };
    });
    const lt = longTasks.slice(lt0).filter(l => l.t >= t0 - 5);
    const cached = mine.length === 0 || apiNet.length === 0;
    Object.assign(out, {
      route_changed: changed, route_after: activeKey(), usable_ms: usable === null ? null : Math.round(usable), usable_dom_ms: usableDom === null ? null : Math.round(usableDom),
      network_settled_ms: lastEnd ? Math.max(Math.round(lastEnd - t0), usable === null ? 0 : Math.round(usable)) : (usable === null ? null : Math.round(usable)),
      pending_at_usable: pendingAtUsable, cache_state: cached ? "cached" : "network", api_requests: apiNet.length, requests: Math.max(mine.length, resMine.length),
      transferred_kB: Math.round(resMine.reduce((s, r) => s + r.bytes, 0) / 102.4) / 10, rpc: rpcs,
      long_tasks: lt.length, long_task_total_ms: Math.round(lt.reduce((s, l) => s + l.d, 0)), long_task_max_ms: Math.round(Math.max(0, ...lt.map(l => l.d))),
      js_heap_MB_before: heap0, js_heap_MB_after: heap(), dom_nodes_before: nodes0, dom_nodes_after: document.getElementsByTagName("*").length, error_rendered: errorRendered || undefined
    });
    if (noChange) { out.reasons.push("intended route/tab did not become active (not allowed for this login, or the click did nothing)"); out.incomplete = true; }
    if (timedOut) { out.timed_out = true; out.incomplete = true; out.reasons.push("no usable content / requests still running after " + MAX_RUN_MS / 1000 + " s"); out.pending_requests = pending; }
    if (pending.length && !timedOut) { out.incomplete = true; out.reasons.push(pending.length + " request(s) never completed"); out.pending_requests = pending; }
    if (errorRendered) out.reasons.push("the page rendered an error box (counted as a failure, not a speed result)");
    if (rpcs.some(r => r.statement_timeout_suspected)) out.reasons.push("a database call looks like a statement timeout: " + rpcs.filter(r => r.statement_timeout_suspected).map(r => r.name).join(", "));
    if (flags.buffer_full_events) out.reasons.push("Resource Timing buffer filled during the session (own buffer used; counts are complete)");
    if (!settledBefore) out.reasons.push("page was not idle before the run started");
    out.ok = !out.incomplete && !errorRendered && usable !== null && !rpcs.some(r => r.statement_timeout_suspected || (r.status >= 400));
    const target = out.cache_state === "cached" ? TARGET_CACHED_MS : TARGET_NETWORK_MS;
    out.target_ms = target; out.meets_target = out.usable_ms !== null && out.usable_ms <= target;
    runs.push(out);
    return out;
  }

  /* ---------- scenarios ---------- */
  const guard = force => { if (typed && !force) throw new Error("You typed in a form on this page. Leaving it could lose the entry. Save or clear it, then NabiadPerf.reset() and retry (or pass {force:true})."); };
  async function hop(hash) { const k = routeKey(hash); location.hash = hash; const t0 = now(); while (now() - t0 < 6000 && !(activeKey() === k && ready($("#view")))) await sleep(50); await idle(); }
  async function goRoute(label, hash, opt = {}) {
    guard(opt.force); const k = routeKey(hash);
    if (activeKey() === k) await hop(k === "dash" ? "#/cash" : "#/dash");   // make sure the route really changes
    const first = !seen.has(label); seen.add(label);
    return measure(label, first ? "first_visit" : "warm_revisit", () => { location.hash = hash; }, { expect: () => activeKey() === k, container: () => $("#view") });
  }
  async function repeatRoute(label, hash, n, opt = {}) {
    await goRoute(label, hash, opt);
    for (let i = 1; i <= n; i++) { await hop(routeKey(hash) === "dash" ? "#/cash" : "#/dash"); await goRoute(label, hash, opt); }
  }
  async function clickTab(label, selector, key, containerSel, n, stayWith, opt = {}) {
    guard(opt.force);
    const btn = () => $(`[${selector}="${key}"]`), other = () => $$(`[${selector}]`).find(b => b.dataset[selector.replace(/^data-/, "").replace(/-(\w)/g, (_, c) => c.toUpperCase())] !== key);
    if (!btn()) return runs.push({ label, category: "tab", ok: false, incomplete: true, reasons: ["tab button not found on this page"] });
    const first = !seen.has(label); seen.add(label);
    const shoot = cat => measure(label, cat, () => btn().click(), { expect: () => btn().classList.contains("on"), container: () => $(containerSel) });
    if (btn().classList.contains("on")) { other()?.click(); await idle(); }
    await shoot(first ? "tab_first" : "tab_revisit");
    for (let i = 1; i <= n; i++) { other()?.click(); await idle(); await shoot("tab_cached"); }
  }
  async function tally(n, opt = {}) {
    await goRoute("Tally Dashboard", "#/tallydash", opt);
    const tabs = $$("[data-td-tab]").map(b => b.dataset.tdTab);
    if (!tabs.length) return console.warn("Tally Dashboard tabs not found (admin login needed)");
    for (const k of tabs) await clickTab("Tally tab: " + k, "data-td-tab", k, "#td-out", n, null, opt);
    const reconKey = tabs.find(k => /recon/.test(k));
    if (reconKey) {
      if (!$("[data-td-tab=" + reconKey + "]").classList.contains("on")) { $("[data-td-tab=" + reconKey + "]").click(); await idle(); }
      const subs = $$("[data-rt]").map(b => b.dataset.rt);
      for (const k of subs) await clickTab("Reconciliation: " + k, "data-rt", k, "#tr-out", n, null, opt);
    }
  }
  const SCENARIOS = [["Dashboard", "#/dash"], ["Cheque Posting (open only)", "#/entry"], ["Cheque Register", "#/cheques"], ["Bank Closing (open only)", "#/closing"], ["Cash Book (open only)", "#/cash"],
    ["Cash Register", "#/register"], ["Inventory Dashboard", "#/ivdash"], ["Collection Entry (open only)", "#/dcol"], ["Collection Summary", "#/dsum"]];
  async function auto(opt = {}) {
    const n = opt.samples ?? 20; guard(opt.force);
    if (n < 20) console.warn("samples < 20: p95 is indicative only (the export says so)");
    const only = opt.only; const t0 = now();
    for (const [l, h] of SCENARIOS) { if (only && !only.includes(l)) continue; console.log("measuring", l); await repeatRoute(l, h, n, opt); }
    if (!only || only.includes("Tally")) await tally(n, opt);
    await hop("#/dash");
    console.log("done in " + Math.round((now() - t0) / 1000) + " s — NabiadPerf.summary() / NabiadPerf.export()");
    return summary();
  }

  /* ---------- cold start (run right after a hard reload, before anything else) ---------- */
  function cold() {
    const nav = performance.getEntriesByType("navigation")[0];
    const ent = performance.getEntriesByType("resource");
    const lcpAt = lcp, early = res.filter(r => lcpAt === null || r.start <= lcpAt);
    const out = { label: "Cold start", category: "cold_startup", at: new Date().toISOString(), method: "Navigation/Paint timing (retroactive); usable content is approximated by LCP", nav_type: nav?.type || null,
      service_worker_controlled: !!navigator.serviceWorker?.controller, dom_content_loaded_ms: nav ? Math.round(nav.domContentLoadedEventEnd) : null, load_event_ms: nav ? Math.round(nav.loadEventEnd) : null,
      first_contentful_paint_ms: fcp === null ? null : Math.round(fcp), largest_contentful_paint_ms: lcp === null ? null : Math.round(lcp),
      requests_until_lcp: early.length, rpc_until_lcp: early.filter(r => r.kind === "rpc").map(r => ({ name: rpcName(r.path), ms: Math.round(r.dur), status: r.status })),
      long_tasks_total_ms: Math.round(longTasks.reduce((s, l) => s + l.d, 0)), incomplete: false, reasons: [] };
    if (nav && nav.type !== "reload" && nav.type !== "navigate") out.reasons.push("navigation type is " + nav.type);
    if (ent.length >= 240) { out.incomplete = true; out.reasons.push("Resource Timing buffer was probably full before this script ran; request counts may be low. Paste the script sooner after the reload."); }
    if (performance.now() > 120000) out.reasons.push("page has been open > 2 min; the LCP/long-task numbers may include later activity");
    out.ok = !out.incomplete && lcp !== null; runs.push(out); console.table([{ fcp: out.first_contentful_paint_ms, lcp: out.largest_contentful_paint_ms, load: out.load_event_ms, sw: out.service_worker_controlled }]);
    return out;
  }

  /* ---------- versions: loaded app, edge copy of index.html, sw.js script, the ACTIVE service worker, caches ---------- */
  async function versions() {
    const v = { loaded_app_js: (document.querySelector('script[src*="app.js"]')?.getAttribute("src") || "").split("v=")[1] || null, loaded_script_versions: {} };
    $$("script[src]").forEach(s => { const m = (s.getAttribute("src") || "").match(/^([\w./-]+)\?v=([\w.-]+)/); if (m) v.loaded_script_versions[m[1]] = m[2]; });
    const bust = "?pc=" + Date.now();
    try { const t = await (await origFetch("/index.html" + bust, { cache: "no-store" })).text(); v.edge_index_html = (t.match(/app\.js\?v=([\w.-]+)/) || [])[1] || null; } catch { v.edge_index_html = "unreadable"; }
    try { const t = await (await origFetch("/sw.js" + bust, { cache: "no-store" })).text(); v.edge_sw_js = (t.match(/VERSION\s*=\s*["']([\w.-]+)["']/) || [])[1] || null; } catch { v.edge_sw_js = "unreadable"; }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      v.sw_registered = !!reg; v.sw_controlling_this_page = !!navigator.serviceWorker.controller;
      v.sw_states = { active: reg?.active?.state || null, waiting: reg?.waiting?.state || null, installing: reg?.installing?.state || null };
      v.sw_script = reg?.active ? cleanPath(reg.active.scriptURL) : null;
      const ctl = navigator.serviceWorker.controller;
      if (ctl) v.active_sw_version = await new Promise(res => { const ch = new MessageChannel(); const t = setTimeout(() => res("no answer"), 3000); ch.port1.onmessage = e => { clearTimeout(t); res(e.data?.version || "unknown"); }; ctl.postMessage({ type: "nabiad-offline-status" }, [ch.port2]); });
      v.cache_names = (await caches.keys()).filter(n => /^nabiad-v/.test(n));
    } catch { v.sw_error = "service worker API unavailable"; }
    const set = [v.loaded_app_js, v.edge_index_html, v.edge_sw_js, v.active_sw_version, ...(v.cache_names || []).map(n => n.replace(/^nabiad-v/, "")), ...Object.values(v.loaded_script_versions)].filter(x => x && !/unreadable|no answer|unknown/.test(x));
    v.distinct_versions = [...new Set(set)]; v.consistent_release = v.distinct_versions.length === 1;
    v.note = v.consistent_release ? "page, edge files, active service worker and cache belong to one release" : "MIXED versions: a new release is waiting (reload) or the CDN still serves an older file; re-run after a hard reload";
    return v;
  }

  /* ---------- summary / export ---------- */
  function summary() {
    const g = {};
    runs.forEach(r => { if (r.category === "cold_startup") return; const k = r.label + " | " + (r.category === "tab_first" ? "tab (first)" : r.category === "first_visit" ? "first visit" : r.category === "warm_revisit" ? "warm revisit" : r.category === "tab_cached" ? "tab switch (repeat)" : r.category) + " | " + (r.cache_state || "-"); (g[k] = g[k] || []).push(r); });
    const rows = Object.entries(g).map(([k, a]) => {
      const good = a.filter(r => r.ok && r.usable_ms !== null), u = good.map(r => r.usable_ms), s = good.map(r => r.network_settled_ms).filter(x => x !== null);
      return { scenario: k, samples: a.length, ok_samples: good.length, failed_or_incomplete: a.length - good.length, usable_p50_ms: q(u, .5), usable_p95_ms: q(u, .95), usable_max_ms: u.length ? Math.max(...u) : null,
        settled_p50_ms: q(s, .5), settled_p95_ms: q(s, .95), p95_reliable: good.length >= 20, target_ms: a[0].target_ms ?? null, p95_meets_target: u.length ? q(u, .95) <= (a[0].target_ms ?? Infinity) : null,
        reasons: [...new Set(a.flatMap(r => r.reasons || []))].slice(0, 4) };
    });
    const rp = {};
    runs.forEach(r => (r.rpc || []).forEach(c => { const x = rp[c.name] = rp[c.name] || { ms: [], n: 0, errors: 0, timeouts: 0, aborted: 0 }; x.n++; if (c.aborted) { x.aborted++; return; } x.ms.push(c.ms); if (c.status >= 400 || c.failed) x.errors++; if (c.statement_timeout_suspected) x.timeouts++; }));
    const rpcRows = Object.entries(rp).map(([name, x]) => ({ rpc: name, calls: x.n, p50_ms: q(x.ms, .5), p95_ms: q(x.ms, .95), max_ms: x.ms.length ? Math.max(...x.ms) : null, errors: x.errors, suspected_statement_timeouts: x.timeouts, aborted: x.aborted })).sort((a, b) => (b.p95_ms || 0) - (a.p95_ms || 0));
    const out = { scenarios: rows, rpc: rpcRows };
    console.table(rows.map(r => ({ scenario: r.scenario, n: r.samples, ok: r.ok_samples, "usable p50": r.usable_p50_ms, "usable p95": r.usable_p95_ms, "settled p95": r.settled_p95_ms, target: r.target_ms, meets: r.p95_meets_target })));
    console.table(rpcRows); return out;
  }
  async function exportJson() {
    const payload = { tool: "nabiad-perf-capture", tool_version: 2, captured: new Date().toISOString(), versions: await versions(), flags, browser: navigator.userAgent.replace(/\(.*?\)/, "").trim().slice(0, 120),
      connection: navigator.connection ? { type: navigator.connection.effectiveType, rtt_ms: navigator.connection.rtt, downlink_Mbps: navigator.connection.downlink } : null,
      targets: { cached_ms: TARGET_CACHED_MS, network_ms: TARGET_NETWORK_MS, statement_timeout_ms: STATEMENT_TIMEOUT_MS },
      incomplete_runs: runs.filter(r => r.incomplete).length, total_runs: runs.length, summary: summary(), runs };
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "nabiad-perf-" + Date.now() + ".json"; document.body.appendChild(a); a.click(); a.remove();
    console.log("saved nabiad-perf-*.json — no tokens, cookies, storage, bodies or business data inside. Send that file."); return payload;
  }
  const manual = { cur: null };
  window.NabiadPerf = { version: 2, go: goRoute, repeat: repeatRoute, tally, auto, cold, versions, summary, export: exportJson, runs, reset() { typed = false; },
    start(label) { manual.cur = { label, t0: now(), net0: net.length, res0: res.length, lt0: longTasks.length }; console.log("measuring… call NabiadPerf.stop() when the result is fully visible"); },
    stop() { const c = manual.cur; if (!c) return console.warn("call NabiadPerf.start('name') first"); manual.cur = null; const t = now() - c.t0, mine = net.slice(c.net0), lt = longTasks.slice(c.lt0).filter(l => l.t >= c.t0);
      const r = { label: c.label, category: "manual", at: new Date().toISOString(), ok: mine.every(x => x.t1 !== null), incomplete: mine.some(x => x.t1 === null), reasons: mine.some(x => x.t1 === null) ? ["requests still pending at stop"] : [], elapsed_ms: Math.round(t),
        note: "manual: includes your own reaction time", api_requests: mine.filter(x => ["rpc", "table"].includes(kind(x.path))).length, rpc: mine.filter(x => kind(x.path) === "rpc").map(x => ({ name: rpcName(x.path), ms: x.t1 === null ? null : Math.round(x.t1 - x.t0), status: x.status })), long_tasks: lt.length, long_task_total_ms: Math.round(lt.reduce((s, l) => s + l.d, 0)) };
      runs.push(r); console.table([{ label: r.label, ms: r.elapsed_ms, api: r.api_requests }]); return r; },
    help: () => console.log(["NabiadPerf 2 (read-only)", "await NabiadPerf.cold()                    // right after a hard reload: cold start", "await NabiadPerf.auto()                    // all pages + every Tally tab + every reconciliation sub-tab, 20 samples each",
      "await NabiadPerf.auto({samples:8})         // quick run (p95 flagged indicative)", "await NabiadPerf.go('Cash Book','#/cash') // one page, one sample", "await NabiadPerf.tally(20)                 // Tally tabs only", "await NabiadPerf.versions()                // app / edge / service-worker consistency",
      "NabiadPerf.summary()  NabiadPerf.export()", "NabiadPerf.start('x') … NabiadPerf.stop()  // time something YOU do (a real daily entry); the tool never saves anything itself"].join("\n")) };
  console.log("NabiadPerf 2 ready (read-only). NabiadPerf.help()");
})();
