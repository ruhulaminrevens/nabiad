/* NABIAD performance capture — paste this whole file into the Chrome/Edge DevTools Console while signed in at https://app.nabiad.com
   It only READS the browser's own timing entries. It never reads cookies, localStorage, headers, tokens, response bodies or screen content,
   never sends anything anywhere, and the exported JSON keeps only: route/action label, timings, request PATHS (query strings removed),
   byte counts, long-task durations and memory totals. Procedure: docs/PERF_MEASURE.md */
(() => {
  if (window.NabiadPerf) { console.log("NabiadPerf is already loaded: NabiadPerf.help()"); return; }
  const longTasks = [], runs = [];
  try { new PerformanceObserver(l => l.getEntries().forEach(e => longTasks.push({ t: e.startTime, d: e.duration }))).observe({ type: "longtask", buffered: true }); } catch { }
  const cleanPath = u => { try { const x = new URL(u); return x.origin === location.origin ? x.pathname : x.hostname + x.pathname.replace(/\/rest\/v1\//, "/rest/v1/"); } catch { return "?"; } };   // no query string: filters and ids can hold business data
  const kind = p => /\/rest\/v1\/rpc\//.test(p) ? "rpc" : /\/rest\/v1\//.test(p) ? "table" : /\/auth\/v1\//.test(p) ? "auth" : /\.(js|css|woff2?|png|svg|json|webmanifest)$/.test(p) ? "asset" : "other";
  const heap = () => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null;
  const quantile = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]); };
  let cur = null;
  const start = label => { cur = { label, t0: performance.now(), res0: performance.getEntriesByType("resource").length, lt0: longTasks.length, heap0: heap(), nodes0: document.getElementsByTagName("*").length, wall: new Date().toISOString() }; console.log("▶ measuring:", label, "— now do the action, then NabiadPerf.stop()"); };
  const stop = (note) => {
    if (!cur) return console.warn("call NabiadPerf.start('name') first");
    const t1 = performance.now(), res = performance.getEntriesByType("resource").slice(cur.res0).filter(r => r.startTime >= cur.t0 - 5 && ["fetch", "xmlhttprequest", "script", "link", "css", "img"].includes(r.initiatorType));
    const api = res.filter(r => ["rpc", "table", "auth"].includes(kind(cleanPath(r.name)))), lt = longTasks.slice(cur.lt0).filter(l => l.t >= cur.t0 - 5);
    const slow = api.filter(r => r.duration >= 500).map(r => ({ path: cleanPath(r.name), ms: Math.round(r.duration), kB: Math.round((r.transferSize || r.encodedBodySize || 0) / 102.4) / 10 })).sort((a, b) => b.ms - a.ms).slice(0, 8);
    const out = {
      label: cur.label, note: note || "", at: cur.wall, total_ms: Math.round(t1 - cur.t0),
      requests: res.length, api_requests: api.length, transferred_kB: Math.round(res.reduce((s, r) => s + (r.transferSize || 0), 0) / 102.4) / 10,
      api_ms_p50: quantile(api.map(r => r.duration), .5), api_ms_p95: quantile(api.map(r => r.duration), .95), slow_api_ge_500ms: slow,
      long_tasks: lt.length, long_task_total_ms: Math.round(lt.reduce((s, l) => s + l.d, 0)), long_task_max_ms: Math.round(Math.max(0, ...lt.map(l => l.d))),
      js_heap_MB_before: cur.heap0, js_heap_MB_after: heap(), dom_nodes_before: cur.nodes0, dom_nodes_after: document.getElementsByTagName("*").length,
      cache_hits_0B: res.filter(r => r.transferSize === 0 && r.decodedBodySize > 0).length
    };
    runs.push(out); cur = null; console.table([{ label: out.label, ms: out.total_ms, req: out.requests, api: out.api_requests, kB: out.transferred_kB, "api p95": out.api_ms_p95, longtasks: out.long_tasks, "lt ms": out.long_task_total_ms, heapMB: out.js_heap_MB_after }]);
    if (slow.length) console.log("slow API/RPC calls:", slow); return out;
  };
  /* navigate by hash and stop when the page has been quiet for 700 ms (no new requests, skeleton gone), max 20 s */
  const go = (label, hash) => new Promise(res => {
    start(label); const t0 = performance.now(); let last = performance.getEntriesByType("resource").length, quietSince = performance.now();
    location.hash = hash;
    const iv = setInterval(() => {
      const n = performance.getEntriesByType("resource").length, skel = document.querySelector("#view .skel");
      if (n !== last || skel) { last = n; quietSince = performance.now(); }
      if (performance.now() - quietSince > 700 || performance.now() - t0 > 20000) { clearInterval(iv); res(stop("auto: quiet 700 ms")); }
    }, 100);
  });
  const SCENARIOS = [["Dashboard", "#/dash"], ["Cheque Posting", "#/entry"], ["Cheque Register", "#/cheques"], ["Bank Closing", "#/closing"], ["Cash Book", "#/cash"], ["Cash Register", "#/register"],
    ["Inventory Dashboard", "#/ivdash"], ["Collection Entry", "#/dcol"], ["Collection Summary", "#/dsum"], ["Tally Dashboard", "#/tallydash"]];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const auto = async () => { for (const [l, h] of SCENARIOS) { await go(l + " (first visit)", h); await wait(800); location.hash = "#/dash"; await wait(1500); await go(l + " (revisit)", h); await wait(800); } location.hash = "#/dash"; console.log("done — NabiadPerf.export()"); };
  const exportJson = () => {
    const payload = { tool: "nabiad-perf-capture 1", app_version: (document.querySelector('script[src*="app.js"]')?.src.match(/v=([^&]+)/) || [])[1] || null, browser: navigator.userAgent.replace(/\(.*?\)/, "").trim(), cores: navigator.hardwareConcurrency, device_memory_GB: navigator.deviceMemory || null,
      connection: navigator.connection ? { type: navigator.connection.effectiveType, rtt_ms: navigator.connection.rtt, downlink_Mbps: navigator.connection.downlink } : null, captured: new Date().toISOString(), runs };
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "nabiad-perf-" + Date.now() + ".json"; a.click();
    console.log("saved nabiad-perf-*.json (contains no tokens, cookies or business data). Send that file."); return payload;
  };
  window.NabiadPerf = { start, stop, go, auto, export: exportJson, runs, help: () => console.log("NabiadPerf.go('Dashboard','#/dash')  — open a page and measure it\nNabiadPerf.start('Cash Book save'); …click Save…; NabiadPerf.stop()  — measure any click/typing\nNabiadPerf.auto()  — all main pages: first visit and revisit\nNabiadPerf.export()  — download the JSON") };
  console.log("NabiadPerf ready. NabiadPerf.help()");
})();
