/* NABIAD — TALLY DASHBOARD (v6.178) — admin only. Tabs: Overview (sync state), Companies, Voucher Explorer, Ledger Explorer, Reconciliation and Sync Health.
   Shows the state of the read-only TallyPrime → Supabase mirror (written by the NABIAD DATA BRIDGE desktop app).
   Loaded after app.js and inv.js; uses their helpers (head, bi, esc, ico, money0, dmy, toast, ROUTES, API, DEMO, sb).
   Data comes from admin-only RPCs (schema_tally_dashboard.sql, schema_tally_explorer.sql). Nothing here writes to the database. */
"use strict";

Object.assign(ROUTES, {
  tallydash: { t: "ট্যালি ড্যাশবোর্ড", ic: "tally", roles: "a", sec: "more", f: () => vTallyDash }
});
Object.assign(ICON, {
  tally: '<path d="M4 6h16M4 12h16M4 18h10"/><path d="M17 15l3 3-3 3"/>'
});

const TD_STALE_HOURS = 36;   // a nightly sync older than this is "stale" (one missed night plus a margin)
const tdFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const tdTime = s => s ? tdFmt.format(new Date(s)) : "—";

/* demo mode has no Supabase: fictional companies, so the page can be tried without any real data */
function tdDemo() {
  const now = Date.now(), h = x => new Date(now - x * 36e5).toISOString();
  const co = (company, vouchers, ledgers, first_date, last_date, ago, extra = {}) => ({ company, vouchers, ledgers, cancelled: 0, deleted: 0, first_date, last_date, last_ok_at: h(ago), last_run_at: h(ago), last_run_ok: true, last_error: null, ...extra });
  const companies = [co("Alpha Trading Co", 112000, 2800, "2023-01-01", dmyIso(now - 864e5), 9), co("Beta Distribution Ltd.", 28400, 1000, "2023-01-01", dmyIso(now - 864e5), 8),
    co("Gamma Factory", 680, 19, "2026-01-01", dmyIso(now - 864e5), 7), co("Delta Traders", 5000, 600, "2026-01-01", dmyIso(now), 60, { last_run_ok: false, last_error: "Tally did not answer (demo)" })];
  return { generated_at: new Date().toISOString(), companies, total_rows: 146080, unique_guids: 145500, failed_7d: 1,
    recent_runs: companies.map((c, i) => ({ id: i + 1, company: c.company, kind: "daybook", from_date: "2026-09-26", to_date: dmyIso(now), started_at: c.last_run_at, finished_at: c.last_ok_at, ok: c.last_run_ok, ledgers: 10, vouchers: 120 + i, error: c.last_error })) };
}
const dmyIso = ms => new Date(ms).toISOString().slice(0, 10);

function tdStatus(c) {
  if (c.last_run_ok === false) return ["rd", bi("ব্যর্থ", "Failed")];
  if (!c.last_ok_at) return ["am", bi("কোনো সিঙ্ক নেই", "No sync yet")];
  if ((Date.now() - new Date(c.last_ok_at)) / 36e5 > TD_STALE_HOURS) return ["am", bi("পুরোনো", "Stale")];
  return ["gr", bi("ঠিক আছে", "OK")];
}

async function tdLoad() {
  if (DEMO) return { data: tdDemo(), demo: true };
  const { data, error } = await sb.rpc("tally_dashboard_summary");
  if (error) {
    const missing = error.code === "PGRST202" || /could not find the function|does not exist/i.test(error.message || "");
    return { error, missing };
  }
  return { data };
}

const TD_TABS = () => [["overview", "dash", bi("সারসংক্ষেপ", "Overview"), tdOverview], ["companies", "bank", bi("কোম্পানি", "Companies"), tdCompanies], ["vouchers", "search", bi("ভাউচার খুঁজুন", "Voucher Explorer"), tdVouchers], ["ledgers", "list", bi("লেজার", "Ledger Explorer"), tdLedgers], ["recon", "shield", bi("রিকনসিলিয়েশন", "Reconciliation"), tdRecon], ["sync", "refresh", bi("সিঙ্ক স্বাস্থ্য", "Sync Health"), tdSync]];
/* v6.178: tab, sub-tab and filters survive page changes (TD lives as long as the app) and a reload (sessionStorage); a link can open a tab: #/tallydash?tab=vouchers */
const tdSS = { get() { try { return JSON.parse(sessionStorage.getItem("nabiad_td") || "{}"); } catch { return {}; } }, set(o) { try { sessionStorage.setItem("nabiad_td", JSON.stringify(o)); } catch { } } };
async function vTallyDash(v) {
  const tabs = TD_TABS(), keys = tabs.map(t => t[0]);
  const saved = tdSS.get(); if (!TD.restored) { Object.assign(TD, saved.f || {}); TD.rt = saved.rt || TD.rt; TD.restored = true; }
  const fromHash = (location.hash.match(/[?&]tab=(\w+)/) || [])[1], pend = TD.pending; TD.pending = null;
  if (pend) Object.assign(TD, pend.patch || {});
  let tab = keys.includes(pend?.tab) ? pend.tab : keys.includes(fromHash) ? fromHash : keys.includes(saved.tab) ? saved.tab : "overview", cleanup = null, reload = () => {}, epoch = 0;
  v.innerHTML = head(bi("ট্যালি ড্যাশবোর্ড", "Tally Dashboard"), `<button class="btn" type="button" id="td-dense" aria-pressed="${!!tdPrefs.dense}" title="${bi("ঘন / আরামদায়ক সারি", "Compact / comfortable rows")}">${ico("list")} ${bi("ঘনত্ব", "Density")}</button><button class="btn" type="button" id="td-refresh">${ico("refresh")} ${bi("রিফ্রেশ", "Refresh")}</button>`) +
    `<div class="td-navw"><div class="tabs ntabs as-tabs td-nav" role="tablist" aria-label="${bi("ট্যালি ড্যাশবোর্ডের বিভাগ", "Tally Dashboard sections")}">${tabs.map(([k, ic, l], i) => `<button type="button" class="chip" role="tab" data-td-tab="${k}" aria-controls="td-out" aria-selected="false" title="Alt+${i + 1}">${ico(ic)} ${l}</button>`).join("")}</div></div><div id="td-out" class="${tdPrefs.dense ? "td-dense" : ""}" aria-live="polite"></div>`;
  const out = $("#td-out", v), btns = $$("[data-td-tab]", v);
  const remember = () => tdSS.set({ tab, rt: TD.rt, f: { company: TD.company, vtype: TD.vtype, from: TD.from, to: TD.to } });
  async function open(k) {
    const my = ++epoch; cleanup?.(); cleanup = null; tab = k; tdAbortAll();
    btns.forEach(b => { const on = b.dataset.tdTab === k; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    try { history.replaceState(null, "", "#/tallydash?tab=" + k); } catch { }
    remember(); out.innerHTML = "";
    const r = await tabs.find(t => t[0] === k)[3](out);
    if (my !== epoch) { r?.cleanup?.(); return; }
    cleanup = r?.cleanup || null; reload = r?.reload || (() => {}); remember();
  }
  btns.forEach(b => b.onclick = () => { if (b.dataset.tdTab !== tab) open(b.dataset.tdTab); });
  $("#td-refresh", v).onclick = () => { tdBust(); Promise.resolve(reload()).then(() => toast(bi("রিফ্রেশ হয়েছে", "Refreshed"), "info")); };
  $("#td-dense", v).onclick = e => { tdPrefs.dense = !tdPrefs.dense; tdSavePrefs(); out.classList.toggle("td-dense", tdPrefs.dense); e.currentTarget.setAttribute("aria-pressed", tdPrefs.dense); };
  const onKey = e => {   // Alt+1..6 switch tabs; "/" jumps to the search box of the open tab
    if (e.altKey && !e.ctrlKey && /^[1-6]$/.test(e.key)) { e.preventDefault(); const k = keys[+e.key - 1]; if (k && k !== tab) open(k); return; }
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) { const i = out.querySelector('input[type="search"]'); if (i) { e.preventDefault(); i.focus(); } }
  };
  document.addEventListener("keydown", onKey);
  TD.go = (k, patch) => { Object.assign(TD, patch || {}); open(k); window.scrollTo(0, 0); };
  await open(tab);
  return () => { epoch++; cleanup?.(); TD.go = null; tdAbortAll(); document.removeEventListener("keydown", onKey); remember(); };
}
/* open a Tally tab from anywhere (command palette, other pages) */
function tdOpenAt(tab, patch) { if (TD.go && CUR === "tallydash") return TD.go(tab, patch); TD.pending = { tab, patch }; location.hash = "#/tallydash"; }
window.paletteExtra = q => {
  if (S.me?.role !== "admin" || !q || q.trim().length < 2) return [];
  const t = q.trim(), y = tdDhaka().slice(0, 4) + "-01-01", g = bi("ট্যালি", "Tally");
  const cos = (tdMem.get((S.me?.id || "") + "|tally_voucher_filters|{}")?.v?.data?.companies || []).filter(c => norm(c.company).includes(norm(t))).slice(0, 3)
    .map(c => ({ g, ic: "bank", t: `<b>${esc(c.company)}</b>`, s: bi(`${money0(c.n)}টি ভাউচার · কোম্পানির ভাউচার খুলুন`, `${money0(c.n)} vouchers · open this company's vouchers`), go: () => tdOpenAt("vouchers", { company: c.company, q: "" }) }));
  return [{ g, ic: "search", t: bi(`Tally ভাউচারে খুঁজুন: <b>${esc(t)}</b>`, `Search Tally vouchers: <b>${esc(t)}</b>`), s: bi("ভাউচার নং, লেজার/পার্টি, narration · এ বছর", "voucher no, ledger/party, narration · this year"), go: () => tdOpenAt("vouchers", { q: t, from: y, to: tdDhaka() }) },
    { g, ic: "list", t: bi(`Tally লেজারে খুঁজুন: <b>${esc(t)}</b>`, `Search Tally ledgers: <b>${esc(t)}</b>`), s: bi("লেজার বা গ্রুপের নাম · এ বছর", "ledger or group name · this year"), go: () => tdOpenAt("ledgers", { lq: t }) }, ...cos];
};

function tdError(r) {
  if (r.missing && r.ledger) return `<div class="alert am" role="alert"><span>⚠ <b>${bi("লেজার ফাংশন এখনো বসানো হয়নি", "The ledger functions are not installed yet")}</b> — ${bi(
    "অ্যাডমিন যখন চাইবেন, Supabase SQL Editor-এ <code>schema_tally_explorer_ledger.sql</code> চালান। এটি কোনো টেবিল বা ডেটা বদলায় না।",
    "when you are ready, run <code>schema_tally_explorer_ledger.sql</code> in the Supabase SQL Editor. It creates no table and changes no data.")}</span></div>`;
  if (r.missing && r.explorer) return `<div class="alert am" role="alert"><span>⚠ <b>${bi("ভাউচার খোঁজার ফাংশন এখনো বসানো হয়নি", "The voucher search functions are not installed yet")}</b> — ${bi(
    "অ্যাডমিন যখন চাইবেন, Supabase SQL Editor-এ আগে <code>select make_backup('manual');</code> চালিয়ে ব্যাকআপ নিন, তারপর <code>schema_tally_explorer.sql</code> চালান। এটি কোনো টেবিল বা ডেটা বদলায় না।",
    "when you are ready, run <code>select make_backup('manual');</code> in the Supabase SQL Editor first, then <code>schema_tally_explorer.sql</code>. It creates no table and changes no data.")}</span></div>`;
  if (r.missing) return `<div class="alert am" role="alert"><span>⚠ <b>${bi("ড্যাশবোর্ডের ফাংশন এখনো বসানো হয়নি", "The dashboard function is not installed yet")}</b> — ${bi(
    "অ্যাডমিন যখন চাইবেন, Supabase SQL Editor-এ আগে <code>select make_backup('manual');</code> চালিয়ে ব্যাকআপ নিন, তারপর <code>schema_tally_dashboard.sql</code> চালান। এটি কোনো টেবিল বা ডেটা বদলায় না।",
    "when you are ready, run <code>select make_backup('manual');</code> in the Supabase SQL Editor first, then <code>schema_tally_dashboard.sql</code>. It creates no table and changes no data.")}</span></div>`;
  const denied = r.error?.code === "42501" || /admin only/i.test(r.error?.message || "");
  return `<div class="alert rd" role="alert"><span>${denied ? bi("এই পাতা শুধু অ্যাডমিনের জন্য।", "This page is for admins only.") : bi("ডেটা আনা যায়নি", "Could not load the data") + ": " + esc(r.error?.message || r.error || "")}</span></div>`;
}

function tdView(d, demo) {
  const cos = d.companies || [], runs = d.recent_runs || [];
  const stale = cos.filter(c => tdStatus(c)[0] === "am"), failed = cos.filter(c => c.last_run_ok === false);
  const lastOk = cos.map(c => c.last_ok_at).filter(Boolean).sort().pop();
  const shared = Math.max(0, (d.total_rows || 0) - (d.unique_guids || 0));
  const kpi = (label, value, sub, cls = "") => `<div class="card as-kpi ${cls}"><span>${label}</span><strong>${esc(value)}</strong>${sub ? `<small class="mut">${sub}</small>` : ""}</div>`;
  const alerts = [
    demo ? `<div class="alert am"><span>⚠ <b>${bi("DEMO মোড", "DEMO mode")}</b> — ${bi("কাল্পনিক ডেটা দেখানো হচ্ছে।", "fictional data is shown.")}</span></div>` : "",
    failed.length ? `<div class="alert rd" role="alert"><span>✕ <b>${bi("সর্বশেষ সিঙ্ক ব্যর্থ", "Last sync failed")}</b>: ${failed.map(c => esc(c.company)).join(", ")}</span></div>` : "",
    stale.length ? `<div class="alert am"><span>⚠ <b>${bi(`${TD_STALE_HOURS} ঘণ্টার বেশি সিঙ্ক হয়নি`, `Not synced for over ${TD_STALE_HOURS} hours`)}</b>: ${stale.map(c => esc(c.company)).join(", ")}. ${bi("অফিস PC চালু/sleep আছে কিনা এবং Tally খোলা ও কোম্পানি load করা আছে কিনা দেখুন।", "Check the office PC is on or asleep and Tally is open with the companies loaded.")}</span></div>` : "",
    !failed.length && !stale.length && cos.length ? `<div class="alert gr"><span>✔ ${bi("সব কোম্পানির সিঙ্ক ঠিক আছে।", "All companies are syncing normally.")}</span></div>` : "",
    !cos.length ? `<div class="alert am"><span>${bi("এখনো কোনো ডেটা সিঙ্ক হয়নি।", "No data has been synced yet.")}</span></div>` : ""
  ].filter(Boolean).map(a => `<div style="margin-bottom:10px">${a}</div>`).join("");
  const rows = cos.map(c => { const [k, lab] = tdStatus(c);
    return `<tr><td><b>${esc(c.company)}</b></td><td class="r num">${money0(c.vouchers)}</td><td class="r num">${money0(c.ledgers)}</td><td class="r num">${money0(c.cancelled)}</td><td class="r num">${money0(c.deleted)}</td>
      <td class="sm">${c.first_date ? dmy(c.first_date) + " → " + dmy(c.last_date) : "—"}</td><td class="sm">${tdTime(c.last_ok_at)}</td><td><span class="st ${k}">${lab}</span>${c.last_error ? `<div class="mut xs td-err">${esc(c.last_error)}</div>` : ""}</td></tr>`; }).join("");
  const runRows = runs.map(x => `<tr><td class="sm">${tdTime(x.started_at)}</td><td>${esc(x.company)}</td><td class="sm">${x.from_date ? dmy(x.from_date) + " → " + dmy(x.to_date) : "—"}</td><td class="r num">${x.vouchers == null ? "—" : money0(x.vouchers)}</td>
      <td><span class="st ${x.ok ? "gr" : x.ok === false ? "rd" : "am"}">${x.ok ? "OK" : x.ok === false ? bi("ব্যর্থ", "Failed") : "—"}</span></td><td class="mut xs td-err">${esc(x.error || "")}</td></tr>`).join("");
  return `${alerts}
    <div class="as-metrics">
      ${kpi(bi("কোম্পানি", "Companies"), cos.length, bi("Tally থেকে কপি করা", "mirrored from Tally"))}
      ${kpi(bi("ভাউচার (সারি)", "Vouchers (rows)"), money0(d.total_rows), bi(`ইউনিক ${money0(d.unique_guids)} · কোম্পানির মধ্যে একই ${money0(shared)}`, `${money0(d.unique_guids)} unique · ${money0(shared)} shared between companies`))}
      ${kpi(bi("শেষ সফল সিঙ্ক", "Last successful sync"), lastOk ? relTime(lastOk) : "—", lastOk ? tdTime(lastOk) + " · " + bi("ঢাকা", "Dhaka") : "")}
      ${kpi(bi("ব্যর্থ run (৭ দিন)", "Failed runs (7 days)"), money0(d.failed_7d || 0), bi("ব্যর্থ হলে উপরে দেখানো হয়", "shown above when a company fails"))}
    </div>
    <div class="card"><h3 style="margin:0 0 8px">${bi("কোম্পানি অনুযায়ী অবস্থা", "Status by company")}</h3>
      <div class="tw"><table class="td-t"><thead><tr><th>${bi("কোম্পানি", "Company")}</th><th class="r">${bi("ভাউচার", "Vouchers")}</th><th class="r">${bi("লেজার", "Ledgers")}</th><th class="r">${bi("বাতিল", "Cancelled")}</th><th class="r">${bi("মুছে ফেলা", "Deleted")}</th><th>${bi("ডেটার সময়সীমা", "Data range")}</th><th>${bi("শেষ সফল সিঙ্ক", "Last successful sync")}</th><th>${bi("অবস্থা", "Status")}</th></tr></thead><tbody>${rows || `<tr><td colspan="8" class="mut">—</td></tr>`}</tbody></table></div>
      <p class="mut sm" style="margin:10px 0 0">${bi("ChawkBazar-2026 ও Cash & Bank-এর ২০২৬ সালের কিছু ভাউচার দুই কোম্পানিতেই আছে (কোম্পানি ভাগ হওয়ার কারণে); তাই সারি যোগ করলে ডবল গোনা হবে — মোটের জন্য ‘ইউনিক’ সংখ্যা দেখুন।", "Some 2026 vouchers exist in both ChawkBazar-2026 and Cash & Bank (the company was split), so adding rows across companies double counts. Use the ‘unique’ figure for totals.")}</p></div>
    <div class="card" style="margin-top:12px"><h3 style="margin:0 0 8px">${bi("সাম্প্রতিক সিঙ্ক (শেষ ৪০টি)", "Recent sync runs (last 40)")}</h3>
      <div class="tw"><table class="td-t"><thead><tr><th>${bi("শুরু (ঢাকা)", "Started (Dhaka)")}</th><th>${bi("কোম্পানি", "Company")}</th><th>${bi("সময়কাল", "Period")}</th><th class="r">${bi("ভাউচার", "Vouchers")}</th><th>${bi("ফল", "Result")}</th><th>${bi("ত্রুটি", "Error")}</th></tr></thead><tbody>${runRows || `<tr><td colspan="6" class="mut">—</td></tr>`}</tbody></table></div></div>
    <p class="mut xs" style="margin-top:10px">${bi("শুধু অ্যাডমিন দেখতে পারেন। এই ডেটা TallyPrime থেকে শুধু-পড়া কপি; এখান থেকে Tally বা ডেটা বদলানো যায় না।", "Visible to admins only. This is a read-only copy of TallyPrime; nothing here changes Tally or the data.")}</p>`;
}


/* ======================= Voucher Explorer ======================= */
const TD_PAGE = 50, TD_EXPORT_MAX = 5000;
const tdDhaka = () => new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 10);
/* ---------- v6.178 shared UI helpers: preferences, date presets, pagers, freshness ---------- */
const TD_SIZES = [25, 50, 100];
const tdPrefs = (() => { try { return JSON.parse(localStorage.getItem("nabiad_td_prefs") || "{}") || {}; } catch { return {}; } })();
const tdSavePrefs = () => { try { localStorage.setItem("nabiad_td_prefs", JSON.stringify(tdPrefs)); } catch { } };
const tdSize = () => TD_SIZES.includes(tdPrefs.size) ? tdPrefs.size : TD_PAGE;
const tdIso = d => d.toISOString().slice(0, 10);
const TD_PRESETS = () => [["today", bi("আজ", "Today")], ["yday", bi("গতকাল", "Yesterday")], ["week", bi("এ সপ্তাহ", "This week")], ["month", bi("এ মাস", "This month")], ["lmonth", bi("গত মাস", "Last month")], ["year", bi("এ বছর", "This year")], ["all", bi("সব সময়", "All time")]];
function tdPreset(k) {   // Dhaka calendar; the week starts on Saturday
  const t = tdDhaka(), d = new Date(t + "T00:00:00Z"), y = d.getUTCFullYear(), m = d.getUTCMonth(), add = n => tdIso(new Date(d.getTime() + n * 864e5));
  return k === "today" ? [t, t] : k === "yday" ? [add(-1), add(-1)] : k === "week" ? [add(-((d.getUTCDay() + 1) % 7)), t] : k === "month" ? [t.slice(0, 8) + "01", t]
    : k === "lmonth" ? [tdIso(new Date(Date.UTC(y, m - 1, 1))), tdIso(new Date(Date.UTC(y, m, 0)))] : k === "year" ? [y + "-01-01", t] : ["", ""];
}
const tdPresetBar = (skip = []) => `<div class="td-pre" role="group" aria-label="${bi("তারিখের শর্টকাট", "Date shortcuts")}">${TD_PRESETS().filter(([k]) => !skip.includes(k)).map(([k, l]) => `<button type="button" class="chip" data-pre="${k}">${l}</button>`).join("")}</div>`;
function tdWirePresets(root, fr, to, after) {
  const mark = () => { const a = $(fr, root).value, z = $(to, root).value; root.querySelectorAll("[data-pre]").forEach(b => { const [x, y] = tdPreset(b.dataset.pre); b.classList.toggle("on", x === a && y === z); b.setAttribute("aria-pressed", x === a && y === z); }); };
  root.querySelectorAll("[data-pre]").forEach(b => b.onclick = () => { const [a, z] = tdPreset(b.dataset.pre); $(fr, root).value = a; $(to, root).value = z; mark(); after?.(); });
  [fr, to].forEach(sel => $(sel, root).addEventListener("change", mark)); mark(); return mark;
}
/* the same pager at the top and the bottom of a table, with a rows-per-page choice (remembered) */
const tdPager = () => `<div class="td-pg"><button class="btn sm" type="button" data-pv>‹ ${bi("আগে", "Prev")}</button><span class="mut sm" data-pi></span><label class="td-ps"><span class="mut xs">${bi("প্রতি পাতায়", "Rows")}</span><select class="in" data-ps aria-label="${bi("প্রতি পাতায় সারি", "Rows per page")}">${TD_SIZES.map(n => `<option value="${n}">${n}</option>`).join("")}</select></label><button class="btn sm" type="button" data-nx>${bi("পরে", "Next")} ›</button></div>`;
function tdPagerSet(root, off, size, total, run) {
  root.querySelectorAll(".td-pg").forEach(p => {
    p.querySelector("[data-pi]").textContent = total ? `${money0(off + 1)}–${money0(Math.min(off + size, total))} / ${money0(total)}` : "";
    const pv = p.querySelector("[data-pv]"), nx = p.querySelector("[data-nx]"), ps = p.querySelector("[data-ps]");
    pv.disabled = off <= 0; nx.disabled = off + size >= total; pv.onclick = () => run(Math.max(0, off - size)); nx.onclick = () => run(off + size);
    ps.value = String(size); ps.onchange = () => { tdPrefs.size = +ps.value; tdSavePrefs(); run(0); };
  });
}
const tdPagerBusy = root => root.querySelectorAll(".td-pg [data-pv], .td-pg [data-nx]").forEach(b => b.disabled = true);
/* "computed at" pill: amber once older than the expected cadence x1.5 */
const tdFresh = (label, at, everyMin) => { if (!at) return ""; const ageMin = (Date.now() - new Date(at)) / 6e4, old = everyMin && ageMin > everyMin * 1.5;
  return `<span class="td-fresh ${old ? "am" : ""}" title="${esc(tdTime(at))}"><i aria-hidden="true"></i>${label}: ${esc(relTime(at))}${everyMin ? ` <span class="mut">· ${bi(`প্রতি ${everyMin} মিনিটে`, `every ${everyMin} min`)}</span>` : ""}</span>`; };
const tdTimeoutHint = r => r?.error && (r.error.code === "57014" || /statement timeout/i.test(r.error.message || "")) ? `<div class="alert am" style="margin-top:8px"><span>${bi("সার্ভার ৮ সেকেন্ডের মধ্যে উত্তর দিতে পারেনি। সময়সীমা ছোট করুন (যেমন ‘এ মাস’)। স্থায়ী সমাধান: <code>schema_tally_perf_v4.sql</code>।", "The server could not answer within 8 seconds. Narrow the period (e.g. ‘This month’). Permanent fix: <code>schema_tally_perf_v4.sql</code>.")}</span></div>` : "";

/* demo: fictional vouchers filtered in the browser (demo mode has no Supabase) */
function tdDemoVouchers() {
  if (tdDemoVouchers.c) return tdDemoVouchers.c;
  const cos = ["Alpha Trading Co", "Beta Distribution Ltd.", "Gamma Factory"], types = ["Sales", "Receipt", "Payment", "Journal", "Purchase"],
    parties = ["Rahim Traders", "Karim Store", "Sunrise Enterprise", "Green Mart", "City Hardware"], rows = [], base = Date.parse(tdDhaka());
  for (let i = 0; i < 240; i++) {
    const t = types[i % types.length], p = parties[(i * 3) % parties.length], amt = 1000 + ((i * 7919) % 90000), d = new Date(base - Math.floor(i / 6) * 864e5).toISOString().slice(0, 10);
    const e = t === "Sales" ? [{ ledger: p, amount: -amt }, { ledger: "Sales Account", amount: amt }] : t === "Purchase" ? [{ ledger: "Purchase Account", amount: -amt }, { ledger: p, amount: amt }]
      : t === "Receipt" ? [{ ledger: "Cash", amount: -amt }, { ledger: p, amount: amt }] : [{ ledger: p, amount: -amt }, { ledger: "Bank Account", amount: amt }];
    rows.push({ company: cos[i % 3], guid: "demo-" + i, vdate: d, vtype: t, vno: String(1000 + i), narration: i % 4 === 0 ? "Demo narration " + i : null, amount: amt, entries: e, counter_company: i % 37 === 0 ? cos[(i + 1) % 3] : null, cancelled: i % 53 === 0 });
  }
  return (tdDemoVouchers.c = rows);
}
async function tdVFilters() {
  if (DEMO) { const r = tdDemoVouchers(), cnt = k => Object.entries(r.reduce((a, x) => (a[x[k]] = (a[x[k]] || 0) + 1, a), {})).map(([n, c]) => [n, c]).sort((a, b) => b[1] - a[1]);
    return { data: { companies: cnt("company").map(([company, n]) => ({ company, n })), types: cnt("vtype").map(([vtype, n]) => ({ vtype, n })) } }; }
  const r = await tdRpc("tally_voucher_filters"); return { data: r.data, error: r.error };
}
async function tdVSearch(f, offset, limit = tdSize()) {
  if (DEMO) {
    const q = (f.q || "").toLowerCase(), all = tdDemoVouchers().filter(x => (!f.company || x.company === f.company) && (!f.vtype || x.vtype === f.vtype) && (!f.from || x.vdate >= f.from) && (!f.to || x.vdate <= f.to) && (f.cancelled || !x.cancelled)
      && (!q || (x.vno + " " + (x.narration || "") + " " + JSON.stringify(x.entries)).toLowerCase().includes(q))).sort((a, b) => b.vdate.localeCompare(a.vdate));
    return { data: { total: all.length, rows: all.slice(offset, offset + limit), limit, offset } };
  }
  const { data, error } = await sb.rpc("tally_voucher_search", { p_q: f.q || null, p_company: f.company || null, p_vtype: f.vtype || null, p_from: f.from || null, p_to: f.to || null, p_include_cancelled: !!f.cancelled, p_limit: limit, p_offset: offset }).abortSignal(limit <= 100 ? tdSignal("vsearch") : new AbortController().signal);
  return { data, error };
}
/* v6.177: a newer search/page request cancels the older one of the same kind, and leaving the page cancels all of them (the DB stops working for results nobody will see) */
const tdAbort = new Map();
const tdSignal = slot => { try { tdAbort.get(slot)?.abort(); } catch { } const c = new AbortController(); tdAbort.set(slot, c); return c.signal; };
const tdAbortAll = () => { for (const c of tdAbort.values()) { try { c.abort(); } catch { } } tdAbort.clear(); };
const tdRpcMissing = e => e && (e.code === "PGRST202" || /could not find the function|does not exist/i.test(e.message || ""));
/* Tally exports a debit as a negative amount */
const tdEntryText = e => `${e.ledger} ${e.amount < 0 ? "Dr" : "Cr"} ${money0(Math.abs(e.amount))}`;
function tdParty(x) {
  const names = [...new Set((x.entries || []).map(e => e.ledger).filter(Boolean))];
  if (!names.length) return `<span class="mut">—</span>`;
  return esc(names.slice(0, 2).join(" · ")) + (names.length > 2 ? ` <span class="mut xs">+${names.length - 2}</span>` : "");
}
function tdVDetail(x) {
  const es = x.entries || [], dr = es.reduce((a, e) => a + (e.amount < 0 ? -e.amount : 0), 0), cr = es.reduce((a, e) => a + (e.amount > 0 ? +e.amount : 0), 0), diff = Math.round((cr - dr) * 100) / 100;
  const rows = es.map(e => `<tr><td>${esc(e.ledger)}</td><td class="r num">${e.amount < 0 ? money0(-e.amount) : ""}</td><td class="r num">${e.amount > 0 ? money0(e.amount) : ""}</td></tr>`).join("");
  const check = !es.length ? `<span class="st am">${bi("যাচাই হয়নি — লাইন নেই", "Not verified — no lines")}</span>` : Math.abs(diff) < 0.01 ? `<span class="st gr">${bi("ডেবিট = ক্রেডিট", "Debit = credit")}</span>` : `<span class="st rd">${bi("পার্থক্য", "Difference")} ${money0(Math.abs(diff))}</span>`;
  return `<div class="td-vd"><div class="td-vdh"><div class="mut sm">${esc(x.company)}${x.counter_company ? " ⇄ " + esc(x.counter_company) : ""} · ${esc(x.vtype || "—")} #${esc(x.vno || "—")} · ${dmy(x.vdate)}</div>${check}</div>
    ${x.narration ? `<p class="sm" style="margin:6px 0">${esc(x.narration)}</p>` : ""}
    <table class="td-t"><thead><tr><th>${bi("লেজার", "Ledger")}</th><th class="r">${bi("ডেবিট", "Debit")}</th><th class="r">${bi("ক্রেডিট", "Credit")}</th></tr></thead><tbody>${rows || `<tr><td colspan="3" class="mut">${bi("কোনো লাইন কপি হয়নি", "No entry lines were mirrored")}</td></tr>`}</tbody>
    ${es.length ? `<tfoot><tr><td><b>${bi("মোট", "Total")}</b></td><td class="r num"><b>${money0(dr)}</b></td><td class="r num"><b>${money0(cr)}</b></td></tr></tfoot>` : ""}</table></div>`;
}
async function tdVouchers(out) {
  let gone = false, epoch = 0, offset = 0, last = null, rows = [], size = tdSize(), deb = 0;
  const f = { q: TD.q || "", company: TD.company || "", vtype: TD.vtype || "", from: TD.from || tdDhaka().slice(0, 8) + "01", to: TD.to || tdDhaka(), cancelled: true }; TD.q = "";
  out.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div></div>`;
  const fl = await tdVFilters();
  if (gone || !out.isConnected) return {};
  if (fl.error) { out.innerHTML = tdError({ error: fl.error, missing: tdRpcMissing(fl.error), explorer: true }); return { cleanup: () => { gone = true; } }; }
  const opt = (val, lab) => `<option value="${esc(val)}">${esc(lab)}</option>`;
  out.innerHTML = `${DEMO ? `<div class="alert am" style="margin-bottom:10px"><span>⚠ <b>${bi("DEMO মোড", "DEMO mode")}</b> — ${bi("কাল্পনিক ডেটা।", "fictional data.")}</span></div>` : ""}
    <form class="card td-vf" id="td-vf" role="search">
      <div class="td-vq"><label class="f" for="td-q">${bi("খুঁজুন", "Search")} <kbd>/</kbd></label><input class="in" id="td-q" type="search" autocomplete="off" maxlength="100" placeholder="${bi("ভাউচার নম্বর, লেজার/পার্টি, narration…", "Voucher no, ledger/party, narration…")}"></div>
      <div><label class="f" for="td-co">${bi("কোম্পানি", "Company")}</label><select class="in" id="td-co">${opt("", bi("সব কোম্পানি", "All companies"))}${(fl.data.companies || []).map(c => opt(c.company, c.company)).join("")}</select></div>
      <div><label class="f" for="td-ty">${bi("ধরন", "Voucher type")}</label><select class="in" id="td-ty">${opt("", bi("সব ধরন", "All types"))}${(fl.data.types || []).map(t => opt(t.vtype, t.vtype || bi("(ধরন নেই)", "(no type)"))).join("")}</select></div>
      <div><label class="f" for="td-fr">${bi("থেকে", "From")}</label><input class="in" id="td-fr" type="date"></div>
      <div><label class="f" for="td-to">${bi("পর্যন্ত", "To")}</label><input class="in" id="td-to" type="date"></div>
      <label class="td-ck"><input type="checkbox" id="td-cx" checked> ${bi("বাতিল ভাউচারসহ", "Include cancelled")}</label>
      <div class="td-vq td-row">${tdPresetBar()}<div class="td-vb"><button class="btn pri" type="submit">${ico("search")} ${bi("খুঁজুন", "Search")}</button><button class="btn" type="button" id="td-clr">${bi("মুছুন", "Clear")}</button></div></div>
      <div class="td-vq td-recent" id="td-rec" hidden></div>
    </form>
    <div class="card" style="margin-top:12px"><div class="td-vh"><div id="td-cnt" class="mut sm" aria-live="polite"></div><button class="btn" type="button" id="td-xl" title="${bi(`সব মিলে যাওয়া ভাউচার, সর্বোচ্চ ${money0(TD_EXPORT_MAX)}`, `All matching vouchers, up to ${money0(TD_EXPORT_MAX)}`)}">${ico("dl")} ${bi("এক্সেল", "Excel")}</button></div>
      ${tdPager()}
      <div class="tw td-scroll"><table class="td-t td-vt"><thead><tr><th>${bi("তারিখ", "Date")}</th><th>${bi("ধরন", "Type")}</th><th>${bi("নং", "No.")}</th><th>${bi("লেজার / পার্টি", "Ledger / Party")}</th><th class="r">${bi("পরিমাণ", "Amount")}</th><th>${bi("কোম্পানি", "Company")}</th><th>${bi("অবস্থা", "Status")}</th></tr></thead><tbody id="td-body"></tbody></table></div>
      ${tdPager()}
      <p class="mut xs" style="margin:10px 0 0">${bi("সারিতে ক্লিক করলে এন্ট্রি ও ডেবিট = ক্রেডিট যাচাই দেখা যাবে। ChawkBazar-2026 ও Cash & Bank-এ কিছু ভাউচার দুই কোম্পানিতেই থাকায় ‘সব কোম্পানি’ দেখলে একই ভাউচার দুবার আসতে পারে। সময়সীমা ১৩ মাসের কম হলে লিখতে লিখতেই খোঁজা হয়; পুরো ইতিহাসে লেখা খুঁজতে Enter চাপুন (কয়েক সেকেন্ড লাগতে পারে)।", "Click a row for the entries and the debit = credit check. Some vouchers exist in both ChawkBazar-2026 and Cash & Bank, so ‘All companies’ can list the same voucher twice. With a period under 13 months results update as you type; for a text search over the whole history press Enter (it can take a few seconds).")}</p></div>`;
  $("#td-q", out).value = f.q; $("#td-co", out).value = f.company; $("#td-ty", out).value = f.vtype; $("#td-fr", out).value = f.from; $("#td-to", out).value = f.to;
  const $b = $("#td-body", out), cnt = $("#td-cnt", out), xl = $("#td-xl", out), rec = $("#td-rec", out);
  const readForm = () => Object.assign(f, { q: $("#td-q", out).value.trim(), company: $("#td-co", out).value, vtype: $("#td-ty", out).value, from: $("#td-fr", out).value, to: $("#td-to", out).value, cancelled: $("#td-cx", out).checked });
  const short = () => f.from && f.to && (new Date(f.to) - new Date(f.from)) / 864e5 <= 400;
  function drawRecent() {   // last five searches with text, kept on this device only
    const list = (tdPrefs.recentV || []).slice(0, 5);
    rec.hidden = !list.length;
    rec.innerHTML = list.length ? `<span class="mut xs">${bi("সাম্প্রতিক", "Recent")}:</span> ${list.map((r, i) => `<button type="button" class="chip" data-rec="${i}" title="${esc([r.company, r.vtype, r.from && dmy(r.from) + " → " + (r.to ? dmy(r.to) : "…")].filter(Boolean).join(" · "))}">${esc(r.q)}</button>`).join("")}` : "";
    rec.querySelectorAll("[data-rec]").forEach(b => b.onclick = () => { const r = list[+b.dataset.rec]; $("#td-q", out).value = r.q; $("#td-co", out).value = r.company || ""; $("#td-ty", out).value = r.vtype || ""; $("#td-fr", out).value = r.from || ""; $("#td-to", out).value = r.to || ""; markPre(); run(0); });
  }
  function remember() { if (!f.q) return; const r = { q: f.q, company: f.company, vtype: f.vtype, from: f.from, to: f.to }; tdPrefs.recentV = [r, ...(tdPrefs.recentV || []).filter(x => x.q !== r.q)].slice(0, 5); tdSavePrefs(); drawRecent(); }
  function paint() {
    const total = last?.total || 0;
    cnt.textContent = bi(`মোট ${money0(total)}টি ভাউচার`, `${money0(total)} vouchers`) + (f.from || f.to ? ` · ${f.from ? dmy(f.from) : "…"} → ${f.to ? dmy(f.to) : "…"}` : ` · ${bi("সব সময়", "all time")}`);
    tdPagerSet(out, offset, size, total, run); xl.disabled = !total;
    $b.innerHTML = rows.map((x, i) => `<tr class="td-vr" data-i="${i}" tabindex="0" role="button" aria-expanded="false" aria-label="${bi("বিস্তারিত দেখুন", "Show details")}"><td class="sm">${dmy(x.vdate)}</td><td>${esc(x.vtype || "—")}</td><td>${esc(x.vno || "—")}</td>
      <td class="td-pt">${tdParty(x)}${x.narration ? `<div class="mut xs td-nar">${esc(x.narration)}</div>` : ""}</td><td class="r num">${money0(x.amount)}</td><td class="sm">${esc(x.company)}</td>
      <td>${x.cancelled ? `<span class="st rd">${bi("বাতিল", "Cancelled")}</span>` : ""}${x.counter_company ? `<span class="st am" title="${esc(x.counter_company)}">${bi("আন্তঃকোম্পানি", "Inter-company")}</span>` : ""}</td></tr>`).join("") ||
      `<tr><td colspan="7" class="mut" style="white-space:normal">${bi("কোনো ভাউচার মেলেনি — ফিল্টার বা সময় বদলে দেখুন।", "No vouchers match — try other filters or a wider period.")}</td></tr>`;
  }
  async function run(off = 0) {
    clearTimeout(deb); const my = ++epoch; offset = off; size = tdSize(); readForm();
    Object.assign(TD, { company: f.company, vtype: f.vtype, from: f.from, to: f.to });
    $b.innerHTML = `<tr><td colspan="7"><div class="skel"></div></td></tr>`; tdPagerBusy(out); xl.disabled = true;
    let r; try { r = await tdVSearch(f, off, size); } catch (e) { r = { error: e }; }
    if (gone || my !== epoch || !out.isConnected) return;
    if (r.error) { if (r.error.name === "AbortError" || /abort/i.test(r.error.message || "")) return; $b.innerHTML = `<tr><td colspan="7" style="white-space:normal"><div class="alert rd" role="alert"><span>${esc(r.error.message || r.error)}</span></div>${tdTimeoutHint(r)}</td></tr>`; cnt.textContent = ""; return; }
    last = r.data; rows = r.data.rows || []; paint(); if (!off) remember();
  }
  const toggle = tr => {
    const open = tr.getAttribute("aria-expanded") === "true";
    if (open) { tr.nextElementSibling?.classList.contains("td-vx") && tr.nextElementSibling.remove(); tr.setAttribute("aria-expanded", "false"); return; }
    tr.insertAdjacentHTML("afterend", `<tr class="td-vx"><td colspan="7" style="white-space:normal">${tdVDetail(rows[+tr.dataset.i])}</td></tr>`); tr.setAttribute("aria-expanded", "true");
  };
  $b.onclick = e => { const tr = e.target.closest(".td-vr"); if (tr) toggle(tr); };
  $b.onkeydown = e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".td-vr")) { e.preventDefault(); toggle(e.target); } };
  const markPre = tdWirePresets(out, "#td-fr", "#td-to", () => run(0));
  $("#td-vf", out).onsubmit = e => { e.preventDefault(); run(0); };
  $("#td-q", out).oninput = () => { clearTimeout(deb); readForm(); if (short()) deb = setTimeout(() => run(0), 450); };   // live only for short periods; the server cancels nothing, the browser drops the older answer
  ["#td-co", "#td-ty", "#td-cx"].forEach(sel => $(sel, out).onchange = () => run(0));
  $("#td-clr", out).onclick = () => { const [a, z] = tdPreset("month"); $("#td-q", out).value = ""; $("#td-co", out).value = ""; $("#td-ty", out).value = ""; $("#td-cx", out).checked = true; $("#td-fr", out).value = a; $("#td-to", out).value = z; markPre(); run(0); };
  xl.onclick = async () => {
    xl.disabled = true; const total = last?.total || 0, cap = Math.min(total, TD_EXPORT_MAX), all = [];
    try {
      for (let o = 0; o < cap; o += 200) { const r = await tdVSearch(f, o, 200); if (r.error) throw r.error; all.push(...(r.data.rows || [])); if (gone) return; }
      await exportXlsx({ Vouchers: [["Date", "Company", "Type", "Voucher No", "Entries", "Narration", "Amount", "Cancelled", "Inter-company"],
        ...all.map(x => [x.vdate, x.company, x.vtype || "", x.vno || "", (x.entries || []).map(tdEntryText).join("; "), x.narration || "", Number(x.amount) || 0, x.cancelled ? "Yes" : "", x.counter_company || ""])] }, `tally_vouchers_${tdDhaka()}.xlsx`);
      toast(total > cap ? bi(`প্রথম ${money0(cap)}টি এক্সপোর্ট হয়েছে — ফিল্টার ছোট করুন`, `Exported the first ${money0(cap)} — narrow the filters for the rest`) : bi(`${money0(all.length)}টি এক্সপোর্ট হয়েছে`, `Exported ${money0(all.length)}`), "info");
    } catch (e) { toast(bi("এক্সপোর্ট করা যায়নি", "Export failed") + ": " + (e.message || e), "err"); }
    xl.disabled = !last?.total;
  };
  drawRecent();
  await run(0);
  return { reload: () => run(offset), cleanup: () => { gone = true; clearTimeout(deb); } };
}


/* ======================= Ledger Explorer ======================= */
/* The mirror has no opening balances: every figure is movement inside the chosen period (debit, credit, net), never a closing balance. */
const TD_STMT_MAX = 3000;
const tdNet = (dr, cr) => { const n = (Number(dr) || 0) - (Number(cr) || 0); return (n < 0 ? "−" : "") + money0(Math.abs(n)) + (n === 0 ? "" : n > 0 ? " Dr" : " Cr"); };
function tdDemoLedgerAgg(f) {
  const m = {};
  for (const x of tdDemoVouchers()) { if (x.cancelled || (f.company && x.company !== f.company) || (f.from && x.vdate < f.from) || (f.to && x.vdate > f.to)) continue;
    for (const e of x.entries) { const k = x.company + "\u0001" + e.ledger, r = m[k] || (m[k] = { company: x.company, ledger: e.ledger, parent: /Cash/.test(e.ledger) ? "Cash-in-Hand" : /Bank/.test(e.ledger) ? "Bank Accounts" : /Account$/.test(e.ledger) ? "Sales Accounts" : "Sundry Debtors", dr: 0, cr: 0, n: 0 });
      e.amount < 0 ? r.dr -= e.amount : r.cr += e.amount; r.n++; } }
  const q = (f.q || "").toLowerCase();
  return Object.values(m).filter(r => !q || (r.ledger + " " + r.parent).toLowerCase().includes(q)).sort((a, b) => (b.dr + b.cr) - (a.dr + a.cr));
}
async function tdLList(f, offset, size = tdSize()) {
  if (DEMO) { const all = tdDemoLedgerAgg(f); return { data: { total: all.length, rows: all.slice(offset, offset + size) } }; }
  const { data, error } = await sb.rpc("tally_ledger_list", { p_company: f.company || null, p_q: f.q || null, p_from: f.from || null, p_to: f.to || null, p_limit: size, p_offset: offset }).abortSignal(tdSignal("llist"));
  return { data, error };
}
async function tdLStatement(company, ledger, f) {
  if (DEMO) {
    const rows = tdDemoVouchers().filter(x => !x.cancelled && x.company === company && (!f.from || x.vdate >= f.from) && (!f.to || x.vdate <= f.to) && x.entries.some(e => e.ledger === ledger)).sort((a, b) => a.vdate.localeCompare(b.vdate))
      .map(x => ({ vdate: x.vdate, vtype: x.vtype, vno: x.vno, narration: x.narration, amt: x.entries.filter(e => e.ledger === ledger).reduce((s, e) => s + e.amount, 0), other: x.entries.filter(e => e.ledger !== ledger).map(e => e.ledger).join(" · ") }));
    return { data: { parent: null, n: rows.length, dr: rows.reduce((s, r) => s + (r.amt < 0 ? -r.amt : 0), 0), cr: rows.reduce((s, r) => s + (r.amt > 0 ? r.amt : 0), 0), truncated: false, rows } };
  }
  const { data, error } = await sb.rpc("tally_ledger_statement", { p_company: company, p_ledger: ledger, p_from: f.from || null, p_to: f.to || null }).abortSignal(tdSignal("lstmt"));
  return { data, error };
}

async function tdLedgers(out) {
  let gone = false, epoch = 0, offset = 0, last = null, rows = [], size = tdSize(), deb = 0;
  const yStart = tdDhaka().slice(0, 4) + "-01-01", f = { q: TD.lq || "", company: TD.company || "", from: TD.from || yStart, to: TD.to || tdDhaka() }; TD.lq = "";
  out.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div></div>`;
  const fl = await tdVFilters();
  if (gone || !out.isConnected) return {};
  if (fl.error) { out.innerHTML = tdError({ error: fl.error, missing: tdRpcMissing(fl.error), explorer: true }); return { cleanup: () => { gone = true; } }; }
  const opt = (val, lab) => `<option value="${esc(val)}">${esc(lab)}</option>`;
  out.innerHTML = `${DEMO ? `<div class="alert am" style="margin-bottom:10px"><span>⚠ <b>${bi("DEMO মোড", "DEMO mode")}</b> — ${bi("কাল্পনিক ডেটা।", "fictional data.")}</span></div>` : ""}
    <div id="tl-list">
    <form class="card td-vf" id="tl-vf" role="search">
      <div class="td-vq"><label class="f" for="tl-q">${bi("লেজার বা গ্রুপের নাম", "Ledger or group name")} <kbd>/</kbd></label><input class="in" id="tl-q" type="search" autocomplete="off" maxlength="100" placeholder="${bi("যেমন Cash, Bank, পার্টির নাম…", "e.g. Cash, Bank, a party name…")}"></div>
      <div><label class="f" for="tl-co">${bi("কোম্পানি", "Company")}</label><select class="in" id="tl-co">${opt("", bi("সব কোম্পানি", "All companies"))}${(fl.data.companies || []).map(c => opt(c.company, c.company)).join("")}</select></div>
      <div><label class="f" for="tl-fr">${bi("থেকে", "From")}</label><input class="in" id="tl-fr" type="date" value="${f.from}"></div>
      <div><label class="f" for="tl-to">${bi("পর্যন্ত", "To")}</label><input class="in" id="tl-to" type="date" value="${f.to}"></div>
      <div class="td-vq td-row">${tdPresetBar()}<div class="td-vb"><button class="btn pri" type="submit">${ico("search")} ${bi("খুঁজুন", "Search")}</button><button class="btn" type="button" id="tl-clr">${bi("মুছুন", "Clear")}</button></div></div>
    </form>
    <div class="card" style="margin-top:12px"><div class="td-vh"><div id="tl-cnt" class="mut sm" aria-live="polite"></div></div>
      ${tdPager()}
      <div class="tw td-scroll"><table class="td-t td-vt"><thead><tr><th>${bi("লেজার", "Ledger")}</th><th>${bi("গ্রুপ", "Group")}</th><th>${bi("কোম্পানি", "Company")}</th><th class="r">${bi("ডেবিট", "Debit")}</th><th class="r">${bi("ক্রেডিট", "Credit")}</th><th class="r">${bi("নিট", "Net")}</th><th class="r">${bi("লাইন", "Lines")}</th></tr></thead><tbody id="tl-body"></tbody></table></div>
      ${tdPager()}
      <p class="mut xs" style="margin:10px 0 0">${bi("Tally থেকে opening balance আসে না, তাই এখানে সব সংখ্যা নির্বাচিত সময়ের মধ্যের লেনদেন (ডেবিট, ক্রেডিট, নিট) — ক্লোজিং ব্যালেন্স নয়। বাতিল ও মুছে ফেলা ভাউচার বাদ। Sales/Purchase লেজারের লাইন Bridge 1.2.1 দিয়ে আবার সিঙ্ক না হওয়া পর্যন্ত অসম্পূর্ণ থাকতে পারে।", "Opening balances are not mirrored from Tally, so every figure here is movement inside the chosen period (debit, credit, net), not a closing balance. Cancelled and deleted vouchers are excluded. Sales/Purchase ledger lines can be incomplete until Bridge 1.2.1 has re-synced.")}</p></div></div>
    <div id="tl-stmt" hidden></div>`;
  $("#tl-co", out).value = f.company; $("#tl-q", out).value = f.q;
  const $b = $("#tl-body", out), cnt = $("#tl-cnt", out), L = $("#tl-list", out), S = $("#tl-stmt", out);
  const readForm = () => Object.assign(f, { q: $("#tl-q", out).value.trim(), company: $("#tl-co", out).value, from: $("#tl-fr", out).value, to: $("#tl-to", out).value });
  function paint() {
    const total = last?.total || 0;
    cnt.textContent = bi(`মোট ${money0(total)}টি লেজার`, `${money0(total)} ledgers`) + ` · ${f.from ? dmy(f.from) : "…"} → ${f.to ? dmy(f.to) : "…"}`;
    tdPagerSet(L, offset, size, total, run);
    $b.innerHTML = rows.map((x, i) => `<tr class="td-vr" data-i="${i}" tabindex="0" role="button" aria-label="${bi("লেজারের বিবরণ খুলুন", "Open ledger statement")}"><td class="td-pt"><b>${esc(x.ledger)}</b></td><td class="sm">${esc(x.parent || "—")}</td><td class="sm">${esc(x.company)}</td>
      <td class="r num">${money0(x.dr)}</td><td class="r num">${money0(x.cr)}</td><td class="r num">${tdNet(x.dr, x.cr)}</td><td class="r num">${money0(x.n)}</td></tr>`).join("") ||
      `<tr><td colspan="7" class="mut" style="white-space:normal">${bi("এই সময়ে কোনো লেজার মেলেনি।", "No ledger has activity in this period.")}</td></tr>`;
  }
  async function run(off = 0) {
    clearTimeout(deb); const my = ++epoch; offset = off; size = tdSize(); readForm(); Object.assign(TD, { company: f.company, from: f.from, to: f.to });
    $b.innerHTML = `<tr><td colspan="7"><div class="skel"></div></td></tr>`; tdPagerBusy(L);
    let r; try { r = await tdLList(f, off, size); } catch (e) { r = { error: e }; }
    if (gone || my !== epoch || !out.isConnected) return;
    if (r.error) { if (r.error.name === "AbortError" || /abort/i.test(r.error.message || "")) return; $b.innerHTML = `<tr><td colspan="7" style="white-space:normal">${tdError({ error: r.error, missing: tdRpcMissing(r.error), ledger: true })}${tdTimeoutHint(r)}</td></tr>`; cnt.textContent = ""; return; }
    last = r.data; rows = r.data.rows || []; paint();
  }
  async function openStmt(x) {
    L.hidden = true; S.hidden = false; S.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div></div>`; window.scrollTo(0, 0);
    let r; try { r = await tdLStatement(x.company, x.ledger, f); } catch (e) { r = { error: e }; }
    if (gone || !out.isConnected) return;
    const back = `<button class="btn" type="button" id="ts-back">‹ ${bi("লেজার তালিকা", "Ledger list")}</button>`;
    if (r.error) { S.innerHTML = `<div style="margin-bottom:10px">${back}</div>` + tdError({ error: r.error, missing: tdRpcMissing(r.error), ledger: true }); $("#ts-back", S).onclick = () => { S.hidden = true; L.hidden = false; }; return; }
    const d = r.data; let run = 0;
    const lines = (d.rows || []).map(t => { run += -t.amt; return `<tr><td class="sm">${dmy(t.vdate)}</td><td>${esc(t.vtype || "—")}</td><td>${esc(t.vno || "—")}</td><td class="td-pt">${esc(t.other || "—")}${t.narration ? `<div class="mut xs td-nar">${esc(t.narration)}</div>` : ""}</td>
      <td class="r num">${t.amt < 0 ? money0(-t.amt) : ""}</td><td class="r num">${t.amt > 0 ? money0(t.amt) : ""}</td><td class="r num">${tdNet(run > 0 ? run : 0, run < 0 ? -run : 0)}</td></tr>`; }).join("");
    S.innerHTML = `<div class="td-vh noprint" style="margin-bottom:10px">${back}<div class="td-vb" style="margin:0"><button class="btn" type="button" id="ts-pr">${ico("print")} ${bi("প্রিন্ট", "Print")}</button><button class="btn" type="button" id="ts-xl">${ico("dl")} ${bi("এক্সেল", "Excel")}</button></div></div>
      <div class="card"><h3 style="margin:0">${esc(x.ledger)}</h3><div class="mut sm">${esc(x.company)}${d.parent ? " · " + esc(d.parent) : ""} · ${dmy(f.from)} → ${dmy(f.to)}</div>
        <div class="as-metrics" style="margin-block:12px"><div class="card as-kpi"><span>${bi("ডেবিট", "Debit")}</span><strong>${money0(d.dr)}</strong></div><div class="card as-kpi"><span>${bi("ক্রেডিট", "Credit")}</span><strong>${money0(d.cr)}</strong></div>
          <div class="card as-kpi"><span>${bi("নিট লেনদেন", "Net movement")}</span><strong>${tdNet(d.dr, d.cr)}</strong></div><div class="card as-kpi"><span>${bi("লাইন", "Lines")}</span><strong>${money0(d.n)}</strong></div></div>
        ${d.truncated ? `<div class="alert am" style="margin-bottom:10px"><span>${bi(`প্রথম ${money0(TD_STMT_MAX)}টি লাইন দেখানো হচ্ছে; মোট সংখ্যা ওপরে। সময় ছোট করুন।`, `Showing the first ${money0(TD_STMT_MAX)} lines; the totals above cover all. Narrow the period.`)}</span></div>` : ""}
        <div class="tw td-scroll"><table class="td-t td-vt"><thead><tr><th>${bi("তারিখ", "Date")}</th><th>${bi("ধরন", "Type")}</th><th>${bi("নং", "No.")}</th><th>${bi("বিপরীত লেজার", "Particulars")}</th><th class="r">${bi("ডেবিট", "Debit")}</th><th class="r">${bi("ক্রেডিট", "Credit")}</th><th class="r">${bi("চলতি নিট", "Running net")}</th></tr></thead><tbody>${lines || `<tr><td colspan="7" class="mut">—</td></tr>`}</tbody></table></div>
        <p class="mut xs" style="margin:10px 0 0">${bi("‘চলতি নিট’ শুরুর তারিখ থেকে জমা নিট লেনদেন; opening balance ধরা নেই।", "‘Running net’ accumulates movement from the start date; no opening balance is included.")}</p></div>`;
    $("#ts-back", S).onclick = () => { S.hidden = true; L.hidden = false; };
    $("#ts-pr", S).onclick = () => { document.body.classList.add("td-print"); const done = () => { document.body.classList.remove("td-print"); window.removeEventListener("afterprint", done); }; window.addEventListener("afterprint", done); window.print(); };
    $("#ts-xl", S).onclick = async () => { let acc = 0;
      await exportXlsx({ Statement: [["Date", "Type", "Voucher No", "Particulars", "Narration", "Debit", "Credit", "Running net (Dr+/Cr-)"], ...(d.rows || []).map(t => { acc += -t.amt; return [t.vdate, t.vtype || "", t.vno || "", t.other || "", t.narration || "", t.amt < 0 ? -t.amt : 0, t.amt > 0 ? t.amt : 0, acc]; })] }, `ledger_${tdDhaka()}.xlsx`); };
  }
  const openRow = tr => { if (tr) openStmt(rows[+tr.dataset.i]); };
  $b.onclick = e => openRow(e.target.closest(".td-vr"));
  $b.onkeydown = e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".td-vr")) { e.preventDefault(); openRow(e.target); } };
  const markPre = tdWirePresets(out, "#tl-fr", "#tl-to", () => run(0));
  $("#tl-vf", out).onsubmit = e => { e.preventDefault(); run(0); };
  $("#tl-q", out).oninput = () => { clearTimeout(deb); if ($("#tl-co", out).value) deb = setTimeout(() => run(0), 500); };   // live only inside one company (each call aggregates every line of the period); otherwise Enter
  $("#tl-co", out).onchange = () => run(0);
  $("#tl-clr", out).onclick = () => { $("#tl-q", out).value = ""; $("#tl-co", out).value = ""; $("#tl-fr", out).value = yStart; $("#tl-to", out).value = tdDhaka(); markPre(); run(0); };
  await run(0);
  return { reload: () => (S.hidden ? run(offset) : null), cleanup: () => { gone = true; clearTimeout(deb); } };
}

/* ======================= Phase 1–3 (v6.174): Overview, Companies, Reconciliation, Sync Health ======================= */
/* Shared filter state: Overview filters drive drill-downs; a company click opens the explorers already scoped to it. */
const TD = { company: "", from: "", to: "", vtype: "", go: null, rt: "", q: "", lq: "", pending: null, restored: false };
/* v6.177: one in-flight request per identical read, short result cache (per signed-in user), errors never cached. Refresh button clears it. */
const TD_TTL = { tally_balance_check: 60000, tally_voucher_filters: 600000, tally_overview: 30000, tally_sync_health: 30000, tally_recon_shared: 60000, tally_recon_coverage: 120000, tally_recon_changes: 60000 };
const tdMem = new Map(), tdFly = new Map();
const tdBust = () => tdMem.clear();
const TD_MEM_MAX = 60;   // bounded: expired entries go first, then the oldest; logout always reloads the page, which drops everything
const tdTrim = () => { if (tdMem.size <= TD_MEM_MAX) return; const now = Date.now(); for (const [k, e] of tdMem) { if (tdMem.size <= TD_MEM_MAX) break; if (now - e.t > (TD_TTL[k.split("|")[1]] || 0)) tdMem.delete(k); } while (tdMem.size > TD_MEM_MAX) tdMem.delete(tdMem.keys().next().value); };
const tdRpc = (name, args) => {
  const ttl = TD_TTL[name] || 0, key = (S.me?.id || "") + "|" + name + "|" + JSON.stringify(args || {}), hit = ttl && tdMem.get(key);
  if (hit && Date.now() - hit.t < ttl) return Promise.resolve(hit.v);
  if (tdFly.has(key)) return tdFly.get(key);
  const p = (async () => { try { const { data, error } = await sb.rpc(name, args); const v = { data, error, missing: tdRpcMissing(error) }; if (ttl && !error) { tdMem.set(key, { t: Date.now(), v }); tdTrim(); } return v; } finally { tdFly.delete(key); } })();
  tdFly.set(key, p); return p;
};
const tdPct = (a, b) => b ? Math.round(a * 1000 / b) / 10 : 0;
const tdNA = () => `<span class="mut">${bi("পাওয়া যায়নি", "Not available")}</span>`;
const tdBars = (items, lab, val, drill) => { const max = Math.max(1, ...items.map(x => +x[val] || 0)), tot = items.reduce((s, x) => s + (+x[val] || 0), 0);
  return items.length ? items.map(x => { const inner = `<span class="td-bl" title="${esc(x[lab])}">${esc(x[lab] || "—")}</span><i style="--w:${Math.max(1, Math.round((+x[val] || 0) * 100 / max))}%"></i><b>${money0(x[val])}</b><em>${tdPct(+x[val] || 0, tot)}%</em>`;
    return drill ? `<button type="button" class="td-bar" data-dv="${esc(JSON.stringify(drill(x)))}" title="${bi("এই ভাউচারগুলো দেখুন", "Show these vouchers")}">${inner}</button>` : `<div class="td-bar">${inner}</div>`; }).join("") : `<p class="mut sm">${bi("এই ফিল্টারে কোনো ডেটা নেই", "No data for this filter")}</p>`; };
const tdCols = (items, drill) => { const max = Math.max(1, ...items.map(x => +x.n || 0));
  return items.length ? `<div class="td-cols" role="${drill ? "group" : "img"}" aria-label="${bi("ভাউচার সংখ্যা", "Voucher counts")}">${items.map(x => { const inner = `<i style="height:${Math.max(2, Math.round((+x.n || 0) * 100 / max))}%"></i><small>${esc(x.m.slice(2))}</small>`, t = `${esc(x.label || x.m)}: ${money0(x.n)}`;
    return drill ? `<button type="button" data-dv="${esc(JSON.stringify(drill(x)))}" title="${t}" aria-label="${t}">${inner}</button>` : `<div title="${t}">${inner}</div>`; }).join("")}</div>` : `<p class="mut sm">${bi("কোনো ডেটা নেই", "No data")}</p>`; };
const tdMonthEnd = m => tdIso(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)));
const tdDrill = (tab, company) => `<button type="button" class="btn sm" data-drill="${tab}" data-co="${esc(company)}">${tab === "vouchers" ? bi("ভাউচার", "Vouchers") : bi("লেজার", "Ledgers")}</button>`;
const tdWireDrill = root => root.querySelectorAll("[data-drill]").forEach(b => b.onclick = () => TD.go(b.dataset.drill, { company: b.dataset.co }));
function tdSyncStatus(c) { if (c.open_issue) return ["rd", bi("সমাধান হয়নি", "Open issue")]; if (!c.last_ok_at) return ["am", bi("কোনো সিঙ্ক নেই", "No sync yet")];
  if (c.recovered) return ["am", bi("ব্যর্থ হয়ে পরে ঠিক", "Failed, then recovered")]; if ((Date.now() - new Date(c.last_ok_at)) / 36e5 > TD_STALE_HOURS) return ["am", bi("পুরোনো", "Stale")]; return ["gr", bi("ঠিক আছে", "OK")]; }

/* demo data (fictional) so every tab can be tried without Supabase */
function tdDemoOverview(f) {
  const rows = tdDemoVouchers().filter(x => (!f.company || x.company === f.company) && (!f.from || x.vdate >= f.from) && (!f.to || x.vdate <= f.to) && (!f.vtype || x.vtype === f.vtype)), by = (k) => Object.entries(rows.reduce((a, x) => (a[x[k]] = (a[x[k]] || 0) + 1, a), {}));
  const cos = ["Alpha Trading Co", "Beta Distribution Ltd.", "Gamma Factory"].filter(c => !f.company || c === f.company);
  return { generated_at: new Date().toISOString(), scope: { rows: rows.length, unique_guids: rows.length, cancelled: rows.filter(x => x.cancelled).length, companies: cos.length },
    by_company: cos.map(c => ({ company: c, rows: rows.filter(x => x.company === c).length, life_rows: 80, ledgers: 120, cancelled: 1, deleted: 0, first_date: "2023-01-01", last_date: tdDhaka() })),
    by_month: Object.entries(rows.reduce((a, x) => (a[x.vdate.slice(0, 7)] = (a[x.vdate.slice(0, 7)] || 0) + 1, a), {})).sort().map(([m, n]) => ({ m, n })), by_type: by("vtype").map(([vtype, n]) => ({ vtype, n })).sort((a, b) => b.n - a.n),
    daily: Object.entries(rows.reduce((a, x) => (a[x.vdate] = (a[x.vdate] || 0) + 1, a), {})).sort().slice(-30).map(([d, n]) => ({ d, n })), collisions: { identities: 12, identical: 0 } };
}
const tdDemoHealth = () => { const c = tdDemo().companies.map(x => ({ company: x.company, last_ok_at: x.last_ok_at, last_run_at: x.last_run_at, last_run_ok: x.last_run_ok, last_error: x.last_error, failed_window: x.last_run_ok ? 0 : 1, open_issue: x.last_run_ok === false, recovered: false }));
  return { days: 7, open_issues: c.filter(x => x.open_issue).length, failed_window: c.filter(x => x.open_issue).length, recovered: 0, companies: c }; };

/* ---------- Overview ---------- */
/* one line for the integrity card; pre-v4 databases answer "missing" (the p_live argument does not exist there), which is shown, never guessed */
function tdBalLine(r) {
  if (r.missing) return `<span class="mut">${bi("ডেবিট = ক্রেডিট সারাংশের জন্য <code>schema_tally_perf_v4.sql</code> দরকার; Reconciliation → Debit = credit থেকে চালানো যায়।", "The debit = credit summary needs <code>schema_tally_perf_v4.sql</code>; it can still be run from Reconciliation → Debit = credit.")}</span>`;
  if (r.error) return `<span class="mut">${bi("ডেবিট = ক্রেডিট যাচাই আনা যায়নি", "Could not load the debit = credit check")}: ${esc(r.error.message || "")}</span>`;
  const rows = r.data?.rows || [], tot = rows.reduce((a, x) => a + (+x.total || 0), 0), un = rows.reduce((a, x) => a + (+x.unbalanced || 0), 0);
  return `${un ? `<span class="st rd">${bi("পার্থক্য", "Difference")}</span>` : `<span class="st gr">${bi("সব সমান", "All balanced")}</span>`} ${bi(`লাইনসহ ${money0(tot)}টি ভাউচারের মধ্যে ডেবিট ≠ ক্রেডিট`, `Of ${money0(tot)} vouchers with lines, debit ≠ credit in`)} <b>${money0(un)}</b>. ${tdFresh(bi("যাচাই", "Checked"), r.data?.generated_at, r.data?.from_snapshot ? 30 : 0)}`;
}
async function tdOverview(out) {
  let gone = false, epoch = 0;
  const flP = tdVFilters();
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`;
  out.innerHTML = `<form class="card td-vf" id="to-f"><div><label class="f" for="to-co">${bi("কোম্পানি", "Company")}</label><select class="in" id="to-co">${opt("", bi("সব কোম্পানি", "All companies"), TD.company)}</select></div>
    <div><label class="f" for="to-ty">${bi("ধরন", "Voucher type")}</label><select class="in" id="to-ty">${opt("", bi("সব ধরন", "All types"), TD.vtype)}</select></div>
    <div><label class="f" for="to-fr">${bi("থেকে", "From")}</label><input class="in" id="to-fr" type="date" value="${esc(TD.from)}"></div><div><label class="f" for="to-to">${bi("পর্যন্ত", "To")}</label><input class="in" id="to-to" type="date" value="${esc(TD.to)}"></div>
    <div class="td-vq td-row">${tdPresetBar(["today", "yday"])}<div class="td-vb"><button class="btn pri" type="submit">${bi("প্রয়োগ", "Apply")}</button><button class="btn" type="button" id="to-r">${bi("রিসেট", "Reset")}</button></div></div></form><div id="to-body" aria-live="polite"></div>`;
  const body = $("#to-body", out);
  flP.then(fl => { if (gone || !out.isConnected) return; const co = $("#to-co", out), ty = $("#to-ty", out); if (!co || !ty) return;
    co.insertAdjacentHTML("beforeend", ((fl.data || {}).companies || []).map(c => opt(c.company, c.company, TD.company)).join("")); ty.insertAdjacentHTML("beforeend", ((fl.data || {}).types || []).map(t => opt(t.vtype, t.vtype || "—", TD.vtype)).join("")); co.value = TD.company; ty.value = TD.vtype; }).catch(() => { });
  async function load() {
    const my = ++epoch; body.innerHTML = `<div class="card" style="margin-top:12px"><div class="skel" style="width:40%"></div><div class="skel" style="margin-top:12px"></div></div>`;
    const args = { p_company: TD.company || null, p_from: TD.from || null, p_to: TD.to || null, p_vtype: TD.vtype || null };
    let o, h;
    try { [o, h] = DEMO ? [{ data: tdDemoOverview(TD) }, { data: tdDemoHealth() }] : await Promise.all([tdRpc("tally_overview", args), tdRpc("tally_sync_health", { p_days: 7 })]); } catch (e) { o = { error: e }; }
    if (gone || my !== epoch || !body.isConnected) return;
    if (o.missing) { const r = await tdLoad().catch(e => ({ error: e })); if (gone || my !== epoch) return; body.innerHTML = `<div class="alert am" style="margin:12px 0"><span>⚠ <b>${bi("নতুন Overview ফাংশন বসানো হয়নি", "The new Overview function is not installed yet")}</b> — <code>schema_tally_dashboard_v2.sql</code>. ${bi("আগের সারসংক্ষেপ দেখানো হচ্ছে।", "Showing the previous summary.")}</span></div>` + (r.error ? tdError(r) : tdView(r.data, r.demo)); return; }
    if (o.error) { body.innerHTML = tdError(o); return; }
    body.innerHTML = tdOverviewView(o.data, h?.data);
    if (o.data && !o.data.collisions) tdRpc("tally_recon_shared", { p_limit: 1, p_offset: 0, p_only_differing: false }).then(r => { const el = !gone && my === epoch && $("#to-col", body); if (el && r.data) el.innerHTML = `<b>${money0(r.data.total)}</b> ${bi("GUID একাধিক কোম্পানিতে আছে; এর মধ্যে বিষয়বস্তু হুবহু এক", "GUIDs appear in more than one company; of these the content is identical for")} <b>${money0(r.data.identical)}</b>.`; else if (el) el.textContent = "—"; });
    tdWireDrill(body);
    body.querySelectorAll("[data-go]").forEach(b => b.onclick = () => TD.go(b.dataset.go, b.dataset.rt ? { rt: b.dataset.rt } : {}));
    body.querySelectorAll("[data-dv]").forEach(b => b.onclick = () => { try { TD.go("vouchers", JSON.parse(b.dataset.dv)); } catch { } });
    if (!DEMO) tdRpc("tally_balance_check", { p_company: TD.company || null, p_live: false }).then(r => { const el = !gone && my === epoch && $("#to-bal", body); if (el) el.innerHTML = tdBalLine(r); });
  }
  const chips = () => [TD.company && [bi("কোম্পানি", "Company"), TD.company], TD.vtype && [bi("ধরন", "Type"), TD.vtype], (TD.from || TD.to) && [bi("সময়", "Period"), `${TD.from ? dmy(TD.from) : "…"} → ${TD.to ? dmy(TD.to) : "…"}`]].filter(Boolean);
  const apply = () => { Object.assign(TD, { company: $("#to-co", out).value, vtype: $("#to-ty", out).value, from: $("#to-fr", out).value, to: $("#to-to", out).value }); load(); };
  $("#to-f", out).onsubmit = e => { e.preventDefault(); apply(); };
  const markPre = tdWirePresets(out, "#to-fr", "#to-to", apply);
  $("#to-r", out).onclick = () => { Object.assign(TD, { company: "", vtype: "", from: "", to: "" }); ["to-co", "to-ty", "to-fr", "to-to"].forEach(i => $("#" + i, out).value = ""); markPre(); load(); };
  tdOverview.chips = chips;
  await load();
  return { reload: load, cleanup: () => { gone = true; } };
}
function tdOverviewView(d, h) {
  const sc = d.scope || {}, cos = d.by_company || [], col = d.collisions || {}, filtered = !!(TD.company || TD.vtype || TD.from || TD.to), sub = filtered ? bi("নির্বাচিত ফিল্টার", "selected filters") : bi("সব সময়", "all time");
  const lifeRows = cos.reduce((s, c) => s + (+c.life_rows || 0), 0), ledgers = cos.reduce((s, c) => s + (+c.ledgers || 0), 0), canc = cos.reduce((s, c) => s + (+c.cancelled || 0), 0), del = cos.reduce((s, c) => s + (+c.deleted || 0), 0);
  const kpi = (label, value, s, cls = "", go = "", rt = "") => `<${go ? `button type="button" data-go="${go}"${rt ? ` data-rt="${rt}"` : ""}` : "div"} class="card as-kpi ${cls}"><span>${label}</span><strong>${value}</strong>${s ? `<small class="mut">${s}</small>` : ""}</${go ? "button" : "div"}>`;
  const lastOk = (h?.companies || []).map(c => c.last_ok_at).filter(Boolean).sort().pop();
  const chipHtml = tdOverview.chips ? tdOverview.chips().map(([k, v]) => `<span class="chip on">${k}: ${esc(v)}</span>`).join(" ") : "";
  const compRows = cos.map(c => `<tr><td><b>${esc(c.company)}</b></td><td class="r num">${money0(c.rows)}</td><td class="r num">${money0(c.life_rows)}</td><td class="r num">${money0(c.ledgers)}</td><td class="r num">${money0(c.cancelled)}</td><td class="sm">${c.first_date ? dmy(c.first_date) + " → " + dmy(c.last_date) : "—"}</td><td>${tdDrill("vouchers", c.company)} ${tdDrill("ledgers", c.company)}</td></tr>`).join("");
  const dv = patch => ({ company: TD.company, vtype: TD.vtype, from: TD.from, to: TD.to, q: "", ...patch });
  return `<div class="td-strip">${tdFresh(bi("সারাংশ তৈরি", "Summary computed"), d.generated_at, d.from_snapshot ? 10 : 0)}${lastOk ? tdFresh(bi("শেষ সফল সিঙ্ক", "Last successful sync"), lastOk, 0) : ""}${chipHtml}</div>
    <div class="as-metrics">
      ${kpi(bi("কোম্পানি", "Companies"), money0(sc.companies), bi("ভাউচার আছে এমন, " + sub, "with vouchers, " + sub), "", "companies")}
      ${kpi(bi("ভাউচার সারি (raw)", "Voucher rows (raw)"), money0(sc.rows), sub, "", "vouchers")}
      ${kpi(bi("আলাদা GUID", "Distinct GUIDs"), money0(sc.unique_guids), bi("সত্যিকারের ইউনিক ভাউচার নয় — নিচের ‘ইন্টেগ্রিটি’ দেখুন", "not a true unique-voucher count — see Integrity below"), "", "recon", "shared")}
      ${kpi(bi("লেজার সারি", "Ledger rows"), money0(ledgers), bi("কোম্পানি-ভিত্তিক যোগফল, সারাজীবন", "sum of company rows, all time"))}
      ${kpi(bi("শেষ সফল সিঙ্ক", "Last successful sync"), lastOk ? relTime(lastOk) : "—", lastOk ? tdTime(lastOk) : bi("অজানা", "unknown"))}
      ${kpi(bi("চলমান সমস্যা", "Open issues"), money0(h?.open_issues ?? 0), bi("এই মুহূর্তে সমাধানহীন", "unresolved right now"), (h?.open_issues || 0) ? "rd" : "", "sync")}
      ${kpi(bi("ব্যর্থ run (৭ দিন)", "Failed runs (7 days)"), money0(h?.failed_window ?? 0), bi(`ইতিহাস; ${h?.recovered || 0}টি পরে ঠিক`, `history; ${h?.recovered || 0} later recovered`), "", "sync")}
      ${kpi(bi("বাতিল / মুছে ফেলা", "Cancelled / deleted"), `${money0(canc)} / ${money0(del)}`, bi("সারাজীবন", "all time"), "", "recon", "changes")}
    </div>
    <div class="td-grid2">
      <div class="card"><h3 style="margin:0 0 8px">${bi("কোম্পানি অনুযায়ী ভাউচার", "Vouchers by company")}</h3><p class="mut xs" style="margin:0 0 8px">${bi("raw সারির সংখ্যা (টাকার পরিমাণ নয়, ডিডুপ করা নয়) · ", "raw row counts (not amounts, not deduplicated) · ")}${sub}</p>${tdBars(cos.filter(c => c.rows > 0).map(c => ({ n: c.company, rows: c.rows })), "n", "rows", x => dv({ company: x.n }))}</div>
      <div class="card"><h3 style="margin:0 0 8px">${bi("ভাউচারের ধরন", "Voucher types")}</h3><p class="mut xs" style="margin:0 0 8px">${sub}</p>${tdBars(d.by_type || [], "vtype", "n", x => dv({ vtype: x.vtype }))}</div>
      <div class="card"><h3 style="margin:0 0 8px">${bi("মাসওয়ারি ভাউচার (সর্বশেষ ৩৬ মাস পর্যন্ত)", "Vouchers per month (up to 36 months)")}</h3><p class="mut xs" style="margin:0 0 4px">${bi("কলামে ক্লিক করলে সেই মাসের ভাউচার খুলবে", "click a column to open that month's vouchers")}</p>${tdCols(d.by_month || [], x => dv({ from: x.m + "-01", to: tdMonthEnd(x.m) }))}</div>
      <div class="card"><h3 style="margin:0 0 8px">${bi("দৈনিক কার্যকলাপ (শেষ ৩০ দিন)", "Daily activity (last 30 days of data)")}</h3>${tdCols((d.daily || []).map(x => ({ m: "--" + x.d.slice(5), label: dmy(x.d), d: x.d, n: x.n })), x => dv({ from: x.d, to: x.d }))}</div>
    </div>
    <div class="card" style="margin-top:12px"><h3 style="margin:0 0 8px">${bi("ডেটা ইন্টেগ্রিটি", "Data integrity")}</h3>
      <p class="sm" id="to-col" style="margin:0 0 6px"><b>${d.collisions ? money0(col.identities || 0) : "…"}</b> ${bi("GUID একাধিক কোম্পানিতে আছে; এর মধ্যে বিষয়বস্তু হুবহু এক", "GUIDs appear in more than one company; of these the content is identical for")} <b>${d.collisions ? money0(col.identical || 0) : "…"}</b>.</p>
      <p class="mut sm" style="margin:0 0 8px">${bi("তাই এগুলো ডুপ্লিকেট নয় — একই ID-র আলাদা লেনদেন। GUID ধরে বাদ দিলে লেনদেন হারাবে; কোম্পানি যোগ করে মোট করাও ভুল। বিস্তারিত: Reconciliation → Shared GUIDs।", "so these are not duplicates — different transactions sharing an ID. Removing them by GUID would lose transactions, and summing companies blindly is wrong too. Details: Reconciliation → Shared GUIDs.")}</p>
      <p class="sm" id="to-bal" style="margin:0 0 8px"><span class="mut">${bi("ডেবিট = ক্রেডিট যাচাই আনা হচ্ছে…", "Loading the debit = credit check…")}</span></p>
      <div class="td-vb" style="justify-content:flex-start"><button type="button" class="btn sm" data-go="recon" data-rt="shared">${bi("Shared GUIDs", "Shared GUIDs")}</button><button type="button" class="btn sm" data-go="recon" data-rt="balance">${bi("ডেবিট = ক্রেডিট", "Debit = credit")}</button></div></div>
    <div class="card" style="margin-top:12px"><h3 style="margin:0 0 8px">${bi("কোম্পানি ভিত্তিক সারসংক্ষেপ", "Company overview")}</h3><div class="tw td-scroll"><table class="td-t"><thead><tr><th>${bi("কোম্পানি", "Company")}</th><th class="r">${bi("ফিল্টারে", "In filter")}</th><th class="r">${bi("মোট", "All time")}</th><th class="r">${bi("লেজার", "Ledgers")}</th><th class="r">${bi("বাতিল", "Cancelled")}</th><th>${bi("ডেটার সীমা", "Data range")}</th><th></th></tr></thead><tbody>${compRows || `<tr><td colspan="7" class="mut">—</td></tr>`}</tbody></table></div></div>
    <div class="card" style="margin-top:12px"><div class="td-vh"><h3 style="margin:0">${bi("আর্থিক রিপোর্ট", "Financial reports")}</h3><button type="button" class="btn sm" data-go="recon" data-rt="pending">${bi("প্রস্তুতি দেখুন", "See readiness")}</button></div><p class="mut sm" style="margin:0">${bi("Trial Balance, P&L, Balance Sheet, Receivable/Payable ageing", "Trial Balance, P&L, Balance Sheet, Receivable/Payable ageing")}: ${tdNA()} — ${bi("opening balance, লেজার গ্রুপ ও bill-wise তথ্য Tally থেকে আসে না। শূন্য বা আন্দাজ দেখানো হয় না।", "opening balances, ledger groups and bill-wise data are not mirrored from Tally. No zero or estimate is shown.")}</p></div>
    <p class="mut xs" style="margin-top:10px">${d.from_snapshot ? bi("সারাংশ তৈরি (প্রতি ১০ মিনিটে)", "Summary computed (every 10 min)") : bi("সর্বশেষ হালনাগাদ", "Last refreshed")}: ${tdTime(d.generated_at)} · ${bi("শুধু অ্যাডমিন; Tally-তে কিছু লেখা হয় না।", "Admins only; nothing is written to Tally.")}</p>`;
}

/* ---------- Companies (searchable, sortable) ---------- */
async function tdCompanies(out) {
  let gone = false, rows = [], sort = { k: "rows", d: -1 }, q = "";
  out.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div></div>`;
  const [o, h] = DEMO ? [{ data: tdDemoOverview({}) }, { data: tdDemoHealth() }] : await Promise.all([tdRpc("tally_overview", { p_company: null, p_from: null, p_to: null, p_vtype: null }), tdRpc("tally_sync_health", { p_days: 7 })]);
  if (gone || !out.isConnected) return {};
  if (o.error) { out.innerHTML = tdError({ error: o.error, missing: o.missing, explorer: true }); return { cleanup: () => { gone = true; } }; }
  const hm = Object.fromEntries((h?.data?.companies || []).map(c => [c.company, c]));
  rows = (o.data.by_company || []).map(c => ({ ...c, ...(hm[c.company] ? { sync: hm[c.company] } : {}) }));
  const cols = [["company", bi("কোম্পানি", "Company")], ["life_rows", bi("ভাউচার", "Vouchers")], ["ledgers", bi("লেজার", "Ledgers")], ["cancelled", bi("বাতিল", "Cancelled")], ["deleted", bi("মুছে ফেলা", "Deleted")], ["first_date", bi("শুরু", "From")], ["last_date", bi("শেষ ভাউচার", "Latest voucher")], ["last_ok", bi("শেষ সফল সিঙ্ক", "Last successful sync")], ["status", bi("অবস্থা", "Status")]];
  const val = (c, k) => k === "last_ok" ? c.sync?.last_ok_at || "" : k === "status" ? (c.sync?.open_issue ? 0 : c.sync?.recovered ? 1 : 2) : c[k];
  function paint() {
    const list = rows.filter(c => !q || c.company.toLowerCase().includes(q)).sort((a, b) => { const x = val(a, sort.k), y = val(b, sort.k); return (x > y ? 1 : x < y ? -1 : 0) * sort.d; });
    out.querySelector("tbody").innerHTML = list.map(c => { const [k, l] = c.sync ? tdSyncStatus(c.sync) : ["am", "—"];
      return `<tr><td><b>${esc(c.company)}</b></td><td class="r num">${money0(c.life_rows)}</td><td class="r num">${money0(c.ledgers)}</td><td class="r num">${money0(c.cancelled)}</td><td class="r num">${money0(c.deleted)}</td><td class="sm">${c.first_date ? dmy(c.first_date) : "—"}</td><td class="sm">${c.last_date ? dmy(c.last_date) : "—"}</td><td class="sm">${tdTime(c.sync?.last_ok_at)}</td><td><span class="st ${k}">${l}</span></td><td>${tdDrill("vouchers", c.company)} ${tdDrill("ledgers", c.company)}</td></tr>`; }).join("") || `<tr><td colspan="10" class="mut">${bi("কোনো কোম্পানি মেলেনি", "No company matches")}</td></tr>`;
    tdWireDrill(out);
    out.querySelectorAll("th[data-k]").forEach(t => t.setAttribute("aria-sort", t.dataset.k === sort.k ? (sort.d > 0 ? "ascending" : "descending") : "none"));
  }
  out.innerHTML = `<div class="card"><div class="td-vh"><div><label class="f" for="tc-q">${bi("কোম্পানি খুঁজুন", "Search company")}</label><input class="in" id="tc-q" type="search" autocomplete="off" maxlength="60"></div></div>
    <div class="tw td-scroll"><table class="td-t"><thead><tr>${cols.map(([k, l]) => `<th data-k="${k}" class="${["life_rows", "ledgers", "cancelled", "deleted"].includes(k) ? "r" : ""}"><button type="button" class="td-sort" data-sk="${k}">${l}</button></th>`).join("")}<th></th></tr></thead><tbody></tbody></table></div>
    <p class="mut xs" style="margin:10px 0 0">${bi("কোম্পানির নাম হুবহু Tally-র মতো; একই নামের লেজার বা একই নম্বরের ভাউচার আলাদা কোম্পানিতে আলাদা ধরা হয়।", "Company names are exactly as in Tally; same-name ledgers and repeated voucher numbers in different companies stay separate.")}</p></div>`;
  $("#tc-q", out).oninput = e => { q = e.target.value.trim().toLowerCase(); paint(); };
  out.querySelectorAll("[data-sk]").forEach(b => b.onclick = () => { sort = { k: b.dataset.sk, d: sort.k === b.dataset.sk ? -sort.d : (["company"].includes(b.dataset.sk) ? 1 : -1) }; paint(); });
  paint();
  return { reload: () => null, cleanup: () => { gone = true; } };
}

/* ---------- Sync Health ---------- */
const tdDur = (a, b) => { if (!a || !b) return "—"; const sec = Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000)); return sec < 60 ? sec + " s" : sec < 3600 ? Math.floor(sec / 60) + "m " + String(sec % 60).padStart(2, "0") + "s" : Math.floor(sec / 3600) + "h " + Math.floor(sec % 3600 / 60) + "m"; };
async function tdSync(out) {
  let gone = false, epoch = 0, offset = 0, last = null, size = tdSize(), rtt = null;
  const f = { company: "", ok: "" };
  out.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div></div>`;
  const demoRuns = () => { const rs = tdDemo().recent_runs.filter(x => (!f.company || x.company === f.company) && (f.ok === "" || String(x.ok) === f.ok)); return { data: { total: rs.length, rows: rs.slice(offset, offset + size) } }; };
  const t0 = performance.now();
  const [h, rl0] = DEMO ? [{ data: tdDemoHealth() }, demoRuns()] : await Promise.all([tdRpc("tally_sync_health", { p_days: 7 }), tdRpc("tally_sync_runs_list", { p_limit: size })]);
  rtt = DEMO ? null : Math.round(performance.now() - t0);
  if (gone || !out.isConnected) return {};
  if (h.error) { out.innerHTML = tdError({ error: h.error, missing: h.missing, explorer: true }); return { cleanup: () => { gone = true; } }; }
  const d = h.data, cos = d.companies || [], latest = (rl0.data?.rows || [])[0];
  const lastSeen = latest ? (latest.finished_at && latest.finished_at > latest.started_at ? latest.finished_at : latest.started_at) : null;
  const lastOk = cos.map(c => c.last_ok_at).filter(Boolean).sort().pop();
  const rows = cos.map(c => { const [k, l] = tdSyncStatus(c); return `<tr><td><b>${esc(c.company)}</b></td><td><span class="st ${k}">${l}</span></td><td class="sm">${tdTime(c.last_run_at)}</td><td class="sm">${tdTime(c.last_ok_at)}</td><td class="r num">${money0(c.runs_window ?? 0)}</td><td class="r num">${money0(c.failed_window)}</td><td class="mut xs td-err">${c.open_issue && c.last_error ? `<details><summary>${bi("ত্রুটি দেখুন", "Show error")}</summary>${esc(c.last_error)}</details>` : ""}</td></tr>`; }).join("");
  const layer = (name, state, cls, note) => `<tr><td><b>${name}</b></td><td><span class="st ${cls}">${state}</span></td><td class="sm" style="white-space:normal">${note}</td></tr>`;
  out.innerHTML = `<div class="as-metrics"><button type="button" class="card as-kpi ${d.open_issues ? "rd" : ""}" data-f-ok="false"><span>${bi("চলমান সমস্যা", "Open issues")}</span><strong>${money0(d.open_issues)}</strong><small class="mut">${bi("সর্বশেষ run ব্যর্থ এমন কোম্পানি", "companies whose latest run failed")}</small></button>
      <button type="button" class="card as-kpi" data-f-ok="false"><span>${bi("ব্যর্থ run (৭ দিন)", "Failed runs (7 days)")}</span><strong>${money0(d.failed_window)}</strong><small class="mut">${bi("ইতিহাস; ক্লিকে তালিকা", "history; click to list")}</small></button>
      <div class="card as-kpi"><span>${bi("পরে ঠিক হয়েছে", "Failed, then recovered")}</span><strong>${money0(d.recovered)}</strong><small class="mut">${bi("কোম্পানি", "companies")}</small></div>
      <div class="card as-kpi"><span>${bi("শেষ সফল সিঙ্ক", "Last successful sync")}</span><strong>${lastOk ? esc(relTime(lastOk)) : "—"}</strong><small class="mut">${tdTime(lastOk)}</small></div></div>
    <div class="td-grid2" style="margin-top:0">
      <div class="card"><h3 style="margin:0 0 8px">${bi("সংযোগের স্তর", "Connection layers")}</h3><div class="tw"><table class="td-t"><tbody>
        ${layer(bi("এই browser", "This browser"), navigator.onLine ? bi("অনলাইন", "Online") : bi("অফলাইন", "Offline"), navigator.onLine ? "gr" : "rd", bi("এই ডিভাইসের ইন্টারনেট।", "This device's internet."))}
        ${layer("Supabase", DEMO ? "—" : bi("সংযুক্ত", "Reachable"), DEMO ? "am" : "gr", DEMO ? bi("DEMO মোড", "demo mode") : bi(`এই পাতার ডেটা আনতে ${money0(rtt)} ms লেগেছে।`, `This page's data took ${money0(rtt)} ms.`))}
        ${layer("NABIAD Data Bridge", lastSeen ? esc(relTime(lastSeen)) : "—", lastSeen && (Date.now() - new Date(lastSeen)) / 36e5 < TD_STALE_HOURS ? "gr" : "am", lastSeen ? bi(`শেষ রিপোর্ট ${tdTime(lastSeen)}${latest?.bridge_version ? " · Bridge " + esc(latest.bridge_version) : ""}। কোনো লাইভ heartbeat নেই — run শেষ হলে তবেই লেখা হয়।`, `Last report ${tdTime(lastSeen)}${latest?.bridge_version ? " · Bridge " + esc(latest.bridge_version) : ""}. No live heartbeat — a run is recorded only when it finishes.`) : bi("এখনো কোনো run নেই।", "No run recorded yet."))}
        ${layer("TallyPrime", bi("অজানা", "Unknown"), "am", lastOk ? bi(`সরাসরি দেখা যায় না; ${tdTime(lastOk)}-এ সফল run মানে তখন Tally উত্তর দিয়েছিল।`, `Not visible from here; the successful run at ${tdTime(lastOk)} means Tally answered then.`) : bi("সরাসরি দেখা যায় না।", "Not visible from here."))}
      </tbody></table></div></div>
      <div class="card"><h3 style="margin:0 0 8px">${bi("ডেটার সতেজতা", "Data freshness")}</h3><div id="ts-fresh" class="td-freshl"><div class="skel"></div></div>
        <p class="mut xs" style="margin:8px 0 0">${bi("সারাংশ ও রিকনসিলিয়েশন সার্ভারে নির্দিষ্ট সময় পরপর হিসাব হয়; সিঙ্কের সময় আলাদা। Windows-এর নিয়ন্ত্রণ Data Bridge app-এ।", "Summaries and reconciliation are computed on the server on a schedule; sync time is separate. Windows controls stay in the Data Bridge app.")}</p></div>
    </div>
    <div class="card" style="margin-top:12px"><h3 style="margin:0 0 8px">${bi("কোম্পানি ভিত্তিক সিঙ্ক", "Sync by company")}</h3><div class="tw"><table class="td-t"><thead><tr><th>${bi("কোম্পানি", "Company")}</th><th>${bi("অবস্থা", "Status")}</th><th>${bi("শেষ চেষ্টা", "Last attempt")}</th><th>${bi("শেষ সফল", "Last success")}</th><th class="r">${bi("run (৭ দিন)", "Runs (7 d)")}</th><th class="r">${bi("ব্যর্থ (৭ দিন)", "Failed (7 d)")}</th><th>${bi("ত্রুটি", "Error")}</th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="mut">—</td></tr>`}</tbody></table></div>
      <p class="mut xs" style="margin:10px 0 0">${bi("পরে সফল run হলে আগের ব্যর্থতা ইতিহাসে থাকে কিন্তু ‘চলমান সমস্যা’ গোনা হয় না।", "A later successful run keeps the earlier failure in history but it no longer counts as an open issue.")}</p></div>
    <div class="card" style="margin-top:12px"><div class="td-vh"><h3 style="margin:0">${bi("সিঙ্ক run-এর ইতিহাস", "Sync run history")}</h3><div class="td-vb" style="margin:0"><select class="in" id="ts-co" aria-label="${bi("কোম্পানি", "Company")}"><option value="">${bi("সব কোম্পানি", "All companies")}</option>${cos.map(c => `<option>${esc(c.company)}</option>`).join("")}</select><select class="in" id="ts-ok" aria-label="${bi("ফল", "Result")}"><option value="">${bi("সব ফল", "All results")}</option><option value="true">OK</option><option value="false">${bi("ব্যর্থ", "Failed")}</option></select></div></div>
      ${tdPager()}
      <div class="tw td-scroll"><table class="td-t"><thead><tr><th>${bi("শুরু (ঢাকা)", "Started (Dhaka)")}</th><th>${bi("কোম্পানি", "Company")}</th><th>${bi("সময়কাল", "Period")}</th><th class="r">${bi("ভাউচার", "Vouchers")}</th><th class="r">${bi("সময় লেগেছে", "Duration")}</th><th>${bi("ফল", "Result")}</th><th>${bi("ত্রুটি", "Error")}</th></tr></thead><tbody id="ts-body"></tbody></table></div>
      ${tdPager()}</div>`;
  const body = $("#ts-body", out), hist = body.closest(".card");
  function paint() { const total = last?.total || 0; tdPagerSet(hist, offset, size, total, run);
    body.innerHTML = (last?.rows || []).map(x => `<tr><td class="sm">${tdTime(x.started_at)}</td><td>${esc(x.company)}</td><td class="sm">${x.from_date ? dmy(x.from_date) + " → " + dmy(x.to_date) : "—"}</td><td class="r num">${x.vouchers == null ? "—" : money0(x.vouchers)}</td><td class="r num">${x.ok ? tdDur(x.started_at, x.finished_at) : "—"}</td><td><span class="st ${x.ok ? "gr" : x.ok === false ? "rd" : "am"}">${x.ok ? "OK" : x.ok === false ? bi("ব্যর্থ", "Failed") : "—"}</span>${x.bridge_version ? `<div class="mut xs">v${esc(x.bridge_version)}</div>` : ""}</td><td class="mut xs td-err">${x.error ? `<details><summary>${esc(x.error.slice(0, 48))}${x.error.length > 48 ? "…" : ""}</summary>${esc(x.error)}</details>` : ""}</td></tr>`).join("") || `<tr><td colspan="7" class="mut">—</td></tr>`; }
  async function run(off) { const my = ++epoch; offset = off; size = tdSize(); f.company = $("#ts-co", out).value; f.ok = $("#ts-ok", out).value; tdPagerBusy(hist);
    const r = DEMO ? demoRuns() : await tdRpc("tally_sync_runs_list", { p_company: f.company || null, p_ok: f.ok === "" ? null : f.ok === "true", p_limit: size, p_offset: off });
    if (gone || my !== epoch) return; if (r.error) { body.innerHTML = `<tr><td colspan="7"><div class="alert rd"><span>${esc(r.error.message)}</span></div></td></tr>`; return; } last = r.data; paint(); }
  last = rl0.data; paint();
  $("#ts-co", out).onchange = () => run(0); $("#ts-ok", out).onchange = () => run(0);
  out.querySelectorAll("[data-f-ok]").forEach(b => b.onclick = () => { $("#ts-ok", out).value = b.dataset.fOk; run(0); hist.scrollIntoView({ behavior: "smooth", block: "start" }); });
  if (DEMO) { const f = $("#ts-fresh", out); if (f) f.innerHTML = `<span class="mut sm">${bi("DEMO মোডে সতেজতার তথ্য নেই", "No freshness data in demo mode")}</span>`; }
  if (!DEMO) Promise.all([tdRpc("tally_overview", { p_company: null, p_from: null, p_to: null, p_vtype: null }), tdRpc("tally_balance_check", { p_company: null, p_live: false })]).then(([o, b]) => {
    const el = !gone && $("#ts-fresh", out); if (!el) return;
    el.innerHTML = [o.data ? tdFresh(bi("Overview সারাংশ", "Overview summary"), o.data.generated_at, o.data.from_snapshot ? 10 : 0) : `<span class="mut sm">${bi("Overview সারাংশ", "Overview summary")}: —</span>`,
      b.data ? tdFresh(bi("রিকনসিলিয়েশন (ডেবিট = ক্রেডিট, কভারেজ, Shared GUID)", "Reconciliation (debit = credit, coverage, shared GUIDs)"), b.data.generated_at, b.data.from_snapshot ? 30 : 0) : `<span class="mut sm">${bi("রিকনসিলিয়েশন স্ন্যাপশট", "Reconciliation snapshot")}: ${b.missing ? bi("v4 বসানো হয়নি — চাইলে লাইভ চলে", "v4 not installed — runs live on request") : "—"}</span>`,
      lastOk ? tdFresh(bi("শেষ সফল সিঙ্ক", "Last successful sync"), lastOk, 0) : ""].join("");
  });
  return { reload: () => run(offset), cleanup: () => { gone = true; } };
}

/* ---------- Reconciliation ---------- */
const TD_RECON_TABS = [["shared", () => bi("একই GUID", "Shared GUIDs")], ["cash", () => bi("Tally বনাম ক্যাশ বুক", "Tally vs Cash Book")], ["changes", () => bi("বাতিল / মুছে ফেলা", "Cancelled / deleted")], ["coverage", () => bi("কভারেজ / ফাঁক", "Coverage / gaps")], ["balance", () => bi("ডেবিট = ক্রেডিট", "Debit = credit")], ["pending", () => bi("প্রস্তুতি", "Setup & readiness")]];
async function tdRecon(out) {
  let gone = false, cur = TD_RECON_TABS.some(t => t[0] === TD.rt) ? TD.rt : "shared", epoch = 0;
  out.innerHTML = `<div class="tabs ntabs as-tabs td-sub" role="tablist" aria-label="${bi("রিকনসিলিয়েশন বিভাগ", "Reconciliation sections")}">${TD_RECON_TABS.map(([k, l]) => `<button type="button" class="chip" role="tab" data-rt="${k}" aria-selected="false">${l()}</button>`).join("")}</div><div id="tr-out"></div>`;
  const box = $("#tr-out", out), btns = $$("[data-rt]", out);
  const err = r => tdError({ error: r.error, missing: r.missing, explorer: true }) + tdTimeoutHint(r);
  async function open(k) {
    const my = ++epoch; cur = k; TD.rt = k; try { const o = tdSS.get(); o.rt = k; tdSS.set(o); } catch { }
    btns.forEach(b => { const on = b.dataset.rt === k; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    box.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div></div>`;
    try { const html = await tdReconPanes[k](box, () => gone || my !== epoch); if (gone || my !== epoch) return; if (typeof html === "string") box.innerHTML = html; } catch (e) { if (!gone && my === epoch) box.innerHTML = `<div class="alert rd"><span>${esc(e.message || e)}</span></div>`; }
    box.querySelectorAll("[data-dv]").forEach(b => b.onclick = () => { try { TD.go("vouchers", JSON.parse(b.dataset.dv)); } catch { } });
  }
  btns.forEach(b => b.onclick = () => { if (b.dataset.rt !== cur) open(b.dataset.rt); });
  tdReconPanes.err = err;
  await open(cur);
  return { reload: () => open(cur), cleanup: () => { gone = true; } };
}
const tdDemoNote = () => DEMO ? `<div class="alert am" style="margin-bottom:10px"><span>⚠ <b>${bi("DEMO মোড", "DEMO mode")}</b> — ${bi("এই বিভাগে কাল্পনিক ডেটাও নেই; আসল ডেটা লাগবে।", "this section needs real data; nothing is shown in demo.")}</span></div>` : "";
const tdDvAttr = patch => `data-dv="${esc(JSON.stringify({ vtype: "", q: "", ...patch }))}"`;
const tdAddDays = (iso, n) => tdIso(new Date(new Date(iso + "T00:00:00Z").getTime() + n * 864e5));
const tdSnapNote = d => d?.from_snapshot ? `<div class="td-strip">${tdFresh(bi("হিসাব করা হয়েছে", "Computed"), d.generated_at, 30)}${d.stale ? `<span class="st am">${bi("পুরোনো — নির্ধারিত হিসাব চলেনি", "Stale — the scheduled run did not happen")}</span>` : ""}</div>` : d?.generated_at ? `<div class="td-strip">${tdFresh(bi("এইমাত্র হিসাব", "Computed live"), d.generated_at, 0)}</div>` : "";
const tdReconPanes = {
  async shared(box, stale) {
    if (DEMO) return tdDemoNote();
    let off = 0, size = tdSize(), only = false, data = null;
    const args = (o, l = size) => ({ p_limit: l, p_offset: o, p_only_differing: only });
    const r = await tdRpc("tally_recon_shared", args(0)); if (stale()) return; if (r.error) return tdReconPanes.err(r);
    data = r.data; const d0 = r.data, A = d0.by_pair?.[0]?.a_company || "A", B = d0.by_pair?.[0]?.b_company || "B";
    const pair = (d0.by_pair || []).map(p => `${esc(p.a_company)} ⇄ ${esc(p.b_company)}: <b>${money0(p.n)}</b> (${dmy(p.first_date)} → ${dmy(p.last_date)})`).join("<br>") || "—";
    box.innerHTML = `${tdSnapNote(d0)}<div class="as-metrics"><div class="card as-kpi"><span>${bi("একাধিক কোম্পানিতে একই GUID", "GUIDs in more than one company")}</span><strong>${money0(d0.total)}</strong></div><div class="card as-kpi ${d0.identical ? "gr" : ""}"><span>${bi("বিষয়বস্তু হুবহু এক", "Identical content")}</span><strong>${money0(d0.identical)}</strong><small class="mut">${bi("একই লেনদেন দুই জায়গায়", "same transaction in both")}</small></div><div class="card as-kpi ${d0.differing ? "am" : ""}"><span>${bi("বিষয়বস্তু আলাদা", "Different content")}</span><strong>${money0(d0.differing)}</strong><small class="mut">${bi("পর্যালোচনা দরকার", "review required")}</small></div>
      <div class="card as-kpi"><span>${bi("ধরন অনুযায়ী (শীর্ষ ৩)", "By type (top 3)")}</span><small class="mut" style="white-space:normal">${(d0.by_type || []).slice(0, 3).map(t => `${esc(t.vtype || "—")} ${money0(t.n)}`).join(" · ") || "—"}</small></div></div>
      <div class="card"><p class="sm" style="margin:0 0 6px">${pair}</p><p class="mut sm" style="margin:0 0 10px">${bi("একই GUID কিন্তু তারিখ/নম্বর/পরিমাণ/লাইন আলাদা হলে সেটি ডুপ্লিকেট নয়। কিছুই মুছে বা মিলিয়ে ফেলা হয়নি; দুই কোম্পানির ইতিহাস আলাদাই আছে। কোনটিকে ‘আসল’ ধরা হবে — এই সিদ্ধান্ত মালিকের।", "Same GUID with different date/number/amount/lines is not a duplicate. Nothing was deleted or merged; both companies keep their own history. Which one counts as canonical is the owner's decision.")}</p>
      <div class="td-vh"><label class="td-ck" style="min-height:0"><input type="checkbox" id="tr-only"> ${bi("শুধু আলাদা বিষয়বস্তু", "Only different content")}</label><button class="btn" type="button" id="tr-sx">${ico("dl")} ${bi("এক্সেল (সব)", "Excel (all)")}</button></div>
      ${tdPager()}<div class="tw td-scroll"><table class="td-t"><thead><tr><th>${bi("তারিখ", "Date")}</th><th>${bi("ধরন", "Type")}</th><th>${esc(A)}</th><th>${esc(B)}</th><th>${bi("অবস্থা", "State")}</th></tr></thead><tbody id="tr-sh"></tbody></table></div>${tdPager()}</div>`;
    const card = $("#tr-sh", box).closest(".card");
    const draw = () => { $("#tr-sh", box).innerHTML = (data.rows || []).map(x => `<tr><td class="sm">${dmy(x.a_date)}${x.a_date !== x.b_date ? " / " + dmy(x.b_date) : ""}</td><td>${esc(x.a_type || "—")}</td><td><button type="button" class="td-link" ${tdDvAttr({ company: x.a_company, from: x.a_date, to: x.a_date, q: x.a_vno || "" })}>#${esc(x.a_vno || "—")}</button> · ${money0(x.a_amount)} · ${x.a_lines} ${bi("লাইন", "lines")}</td><td><button type="button" class="td-link" ${tdDvAttr({ company: x.b_company, from: x.b_date, to: x.b_date, q: x.b_vno || "" })}>#${esc(x.b_vno || "—")}</button> · ${money0(x.b_amount)} · ${x.b_lines} ${bi("লাইন", "lines")}</td><td><span class="st ${x.same_content ? "gr" : "am"}">${x.same_content ? bi("এক", "Same") : bi("আলাদা — পর্যালোচনা", "Different — review")}</span></td></tr>`).join("") || `<tr><td colspan="5" class="mut">—</td></tr>`;
      tdPagerSet(card, off, size, data.listed ?? data.total, go); card.querySelectorAll("[data-dv]").forEach(b => b.onclick = () => { try { TD.go("vouchers", JSON.parse(b.dataset.dv)); } catch { } }); };
    async function go(o) { size = tdSize(); tdPagerBusy(card); const r2 = await tdRpc("tally_recon_shared", args(o)); if (stale() || r2.error) return; off = o; data = r2.data; draw(); }
    $("#tr-only", box).onchange = e => { only = e.target.checked; go(0); };
    $("#tr-sx", box).onclick = async e => { const b = e.currentTarget; b.disabled = true; const all = []; try { const n = Math.min(data.listed ?? data.total, TD_EXPORT_MAX); for (let o = 0; o < n; o += 200) { const r2 = await tdRpc("tally_recon_shared", args(o, 200)); if (r2.error) throw r2.error; all.push(...(r2.data.rows || [])); if (stale()) return; }
      await exportXlsx({ SharedGUIDs: [["GUID", "Company A", "Date A", "Type A", "No A", "Amount A", "Lines A", "Company B", "Date B", "Type B", "No B", "Amount B", "Lines B", "Same content"], ...all.map(x => [x.guid, x.a_company, x.a_date, x.a_type || "", x.a_vno || "", Number(x.a_amount) || 0, x.a_lines, x.b_company, x.b_date, x.b_type || "", x.b_vno || "", Number(x.b_amount) || 0, x.b_lines, x.same_content ? "Yes" : "No"])] }, `tally_shared_guids_${tdDhaka()}.xlsx`);
      toast(bi(`${money0(all.length)}টি এক্সপোর্ট হয়েছে`, `Exported ${money0(all.length)}`), "info"); } catch (e2) { toast(bi("এক্সপোর্ট করা যায়নি", "Export failed") + ": " + (e2.message || e2), "err"); } b.disabled = false; };
    draw();
  },
  async cash(box, stale) {
    if (DEMO) return tdDemoNote();
    const fl = await tdVFilters(); if (stale()) return;
    const st = { company: "Nabiad-Cash & Bank", from: "", to: "" }; let off = 0, data = null, size = tdSize();
    box.innerHTML = `<form class="card td-vf" id="tr-cf"><div><label class="f" for="tr-co">${bi("Tally কোম্পানি", "Tally company")}</label><select class="in" id="tr-co">${((fl.data || {}).companies || []).map(c => `<option ${c.company === st.company ? "selected" : ""}>${esc(c.company)}</option>`).join("")}</select></div>
        <div><label class="f" for="tr-fr">${bi("থেকে (ফাঁকা = app-এর সময়)", "From (blank = app period)")}</label><input class="in" id="tr-fr" type="date"></div><div><label class="f" for="tr-to">${bi("পর্যন্ত", "To")}</label><input class="in" id="tr-to" type="date"></div>
        <div class="td-vq td-row">${tdPresetBar(["today", "yday", "all"])}<div class="td-vb"><button class="btn pri" type="submit">${bi("মেলান", "Reconcile")}</button><button class="btn" type="button" id="tr-xl">${ico("dl")} ${bi("এক্সেল", "Excel")}</button></div></div></form><div id="tr-cb" style="margin-top:12px"></div>`;
    const cb = $("#tr-cb", box);
    const args = (o, l = size) => ({ p_company: st.company, p_from: st.from || null, p_to: st.to || null, p_limit: l, p_offset: o });
    const kindLab = k => k === "app_only" ? [bi("মেলেনি — শুধু app-এ", "Unmatched — app only"), "am"] : k === "mirror_only" ? [bi("মেলেনি — শুধু Tally-তে", "Unmatched — Tally only"), "rd"] : [bi("অস্পষ্ট — সংখ্যা আলাদা", "Ambiguous — count differs"), "am"];
    function draw() { const d = data, tot = d.exceptions || 0;
      cb.innerHTML = `<div class="as-metrics"><div class="card as-kpi"><span>${bi("app-এর Tally ক্যাশ voucher", "App Tally cash vouchers")}</span><strong>${money0(d.app_rows)}</strong><small class="mut">${dmy(d.from)} → ${dmy(d.to)}</small></div><div class="card as-kpi"><span>${bi("Tally mirror Receipt/Payment", "Tally mirror Receipt/Payment")}</span><strong>${money0(d.mirror_vouchers)}</strong><small class="mut">${esc(d.company)}</small></div>
        <div class="card as-kpi gr"><span>${bi("মিলেছে", "Matched")}</span><strong>${money0(d.matched_rows)}</strong><small class="mut">${tdPct(d.matched_rows, d.app_rows)}% ${bi("app সারির", "of app rows")}</small></div><div class="card as-kpi ${tot ? "am" : "gr"}"><span>${bi("পর্যালোচনা দরকার", "Review required")}</span><strong>${money0(tot)}</strong><small class="mut">${money0(d.app_only)} ${bi("শুধু app", "app only")} · ${money0(d.mirror_only)} ${bi("শুধু Tally", "Tally only")} · ${money0(d.count_diff_groups)} ${bi("অস্পষ্ট", "ambiguous")}</small></div></div>
        <div class="card"><p class="mut sm" style="margin:0 0 8px">${bi(`মেলানোর নিয়ম: তারিখ + ধরন + পরিমাণ + লেজারের নাম। ভাউচার নম্বর ব্যবহার হয়নি, কারণ দুই উৎসের নম্বর আলাদা (নম্বর মিলেছে মাত্র ${money0(d.same_voucher_no)}টির)। ‘অস্পষ্ট’ মানে একই তারিখ-পরিমাণ-লেজারে দুই পাশে সংখ্যা আলাদা। কোনো ব্যতিক্রম নিজে থেকে ঠিক করা হয় না; Tally-তে কিছু লেখা হয় না।`, `Rule: date + type + amount + ledger name. Voucher numbers are not used because the two sources number differently (numbers agree for only ${money0(d.same_voucher_no)}). ‘Ambiguous’ means the same date/amount/ledger appears a different number of times on each side. Nothing is corrected automatically and nothing is written to Tally.`)}</p>
        ${tdPager()}<div class="tw td-scroll"><table class="td-t"><thead><tr><th>${bi("তারিখ", "Date")}</th><th>${bi("ধরন", "Type")}</th><th>${bi("শ্রেণি", "Class")}</th><th>${bi("লেজার", "Ledger")}</th><th class="r">${bi("পরিমাণ", "Amount")}</th><th class="r">app</th><th class="r">Tally</th></tr></thead><tbody>${(d.rows || []).map(x => { const [l, c] = kindLab(x.kind); return `<tr><td class="sm">${dmy(x.d)}</td><td>${esc(x.t)}</td><td><span class="st ${c}">${l}</span></td><td class="td-pt">${esc(x.ledger || "—")}${x.vno ? `<div class="xs"><button type="button" class="td-link" ${tdDvAttr({ company: d.company, from: x.d, to: x.d, q: x.vno })}>#${esc(x.vno)} ›</button></div>` : ""}</td><td class="r num">${money0(x.amount)}</td><td class="r num">${money0(x.app_n)}</td><td class="r num">${money0(x.mirror_n)}</td></tr>`; }).join("") || `<tr><td colspan="7" class="mut">${bi("কোনো ব্যতিক্রম নেই — সব মিলেছে", "No exceptions — everything matched")}</td></tr>`}</tbody></table></div>${tdPager()}</div>`;
      tdPagerSet(cb, off, size, tot, run); cb.querySelectorAll("[data-dv]").forEach(b => b.onclick = () => { try { TD.go("vouchers", JSON.parse(b.dataset.dv)); } catch { } }); }
    async function run(o) { size = tdSize(); cb.innerHTML = `<div class="card"><div class="skel"></div><p class="mut xs" style="margin:8px 0 0">${bi("মেলানো হচ্ছে…", "Reconciling…")}</p></div>`; const r = await tdRpc("tally_recon_cash", args(o)); if (stale()) return; if (r.error) { cb.innerHTML = tdReconPanes.err(r); return; } off = o; data = r.data; draw(); }
    const read = () => { st.company = $("#tr-co", box).value; st.from = $("#tr-fr", box).value; st.to = $("#tr-to", box).value; };
    tdWirePresets(box, "#tr-fr", "#tr-to", () => { read(); run(0); });
    $("#tr-cf", box).onsubmit = e => { e.preventDefault(); read(); run(0); };
    $("#tr-co", box).onchange = () => { read(); run(0); };
    $("#tr-xl", box).onclick = async () => { const all = []; try { for (let o = 0; o < TD_EXPORT_MAX; o += 200) { const r = await tdRpc("tally_recon_cash", args(o, 200)); if (r.error) throw r.error; all.push(...(r.data.rows || [])); if (all.length >= (r.data.exceptions || 0)) break; }
      await exportXlsx({ Exceptions: [["Date", "Type", "Class", "Ledger", "Voucher No (Tally)", "Amount", "App count", "Tally count"], ...all.map(x => [x.d, x.t, x.kind, x.ledger || "", x.vno || "", Number(x.amount) || 0, x.app_n, x.mirror_n])] }, `tally_vs_cashbook_${tdDhaka()}.xlsx`); } catch (e) { toast(bi("এক্সপোর্ট করা যায়নি", "Export failed") + ": " + (e.message || e), "err"); } };
    await run(0);
  },
  async changes(box, stale) {
    if (DEMO) return tdDemoNote();
    const r = await tdRpc("tally_recon_changes", { p_limit: 200 }); if (stale()) return; if (r.error) return tdReconPanes.err(r);
    return `<div class="card"><h3 style="margin:0 0 8px">${bi("বাতিল ও মুছে ফেলা ভাউচার", "Cancelled and deleted vouchers")} (${money0(r.data.total)})</h3><div class="tw td-scroll"><table class="td-t"><thead><tr><th>${bi("তারিখ", "Date")}</th><th>${bi("কোম্পানি", "Company")}</th><th>${bi("ধরন", "Type")}</th><th>${bi("নং", "No.")}</th><th class="r">${bi("পরিমাণ", "Amount")}</th><th>${bi("অবস্থা", "State")}</th><th>${bi("সিঙ্ক", "Synced")}</th></tr></thead><tbody>${(r.data.rows || []).map(x => `<tr><td class="sm">${dmy(x.vdate)}</td><td>${esc(x.company)}</td><td>${esc(x.vtype || "—")}</td><td><button type="button" class="td-link" ${tdDvAttr({ company: x.company, from: x.vdate, to: x.vdate, q: x.vno || "" })}>${esc(x.vno || "—")} ›</button></td><td class="r num">${money0(x.amount)}</td><td><span class="st ${x.deleted ? "rd" : "am"}">${x.deleted ? bi("মুছে ফেলা", "Deleted") : bi("বাতিল", "Cancelled")}</span></td><td class="sm">${tdTime(x.synced_at)}</td></tr>`).join("") || `<tr><td colspan="7" class="mut">${bi("কিছু নেই", "None")}</td></tr>`}</tbody></table></div><p class="mut xs" style="margin:10px 0 0">${bi("Tally-তে বাতিল/মুছে ফেলা ভাউচার এখানে চিহ্নিত থাকে, নিঃশব্দে সরানো হয় না। নম্বরে ক্লিক করলে Voucher Explorer-এ খুলবে (বাতিলসহ)।", "Source cancellations/deletions stay visible here; nothing is silently removed. Click a number to open it in the Voucher Explorer (cancelled included).")}</p></div>`;
  },
  async coverage(box, stale) {
    if (DEMO) return tdDemoNote();
    const r = await tdRpc("tally_recon_coverage", { p_gap_days: 7 }); if (stale()) return; if (r.error) return tdReconPanes.err(r);
    const d = r.data, cls = g => g.days >= 14 ? ["am", bi("পর্যালোচনা দরকার", "Review required")] : ["", bi("সম্ভবত লেনদেনহীন দিন", "Possibly quiet days")];
    return `${tdSnapNote(d)}<div class="card"><h3 style="margin:0 0 8px">${bi("কভারেজ", "Coverage")}</h3><div class="tw"><table class="td-t"><thead><tr><th>${bi("কোম্পানি", "Company")}</th><th>${bi("প্রথম", "First")}</th><th>${bi("শেষ", "Last")}</th><th class="r">${bi("ভাউচারসহ দিন", "Days with vouchers")}</th><th class="r">${bi("মোট দিন", "Span (days)")}</th><th class="r">${bi("দিনের হার", "Day coverage")}</th><th class="r">${bi(`${d.gap_days}+ দিনের ফাঁক`, `${d.gap_days}+ day gaps`)}</th></tr></thead><tbody>${(d.companies || []).map(c => `<tr><td><b>${esc(c.company)}</b></td><td class="sm">${dmy(c.first_date)}</td><td class="sm">${dmy(c.last_date)}</td><td class="r num">${money0(c.days_with)}</td><td class="r num">${money0(c.span_days)}</td><td class="r num">${tdPct(c.days_with, c.span_days)}%</td><td class="r num">${c.gaps ? `<span class="st am">${money0(c.gaps)}</span>` : "0"}</td></tr>`).join("")}</tbody></table></div>
      ${(d.gaps || []).length ? `<h3 style="margin:14px 0 8px">${bi("সবচেয়ে বড় ফাঁক", "Longest gaps")}</h3><div class="tw td-scroll"><table class="td-t"><thead><tr><th>${bi("কোম্পানি", "Company")}</th><th>${bi("থেকে", "From")}</th><th>${bi("পর্যন্ত", "To")}</th><th class="r">${bi("দিন", "Days")}</th><th>${bi("শ্রেণি", "Class")}</th><th></th></tr></thead><tbody>${d.gaps.map(g => { const [c, l] = cls(g); return `<tr><td>${esc(g.company)}</td><td class="sm">${dmy(g.gap_from)}</td><td class="sm">${dmy(g.gap_to)}</td><td class="r num">${money0(g.days)}</td><td><span class="st ${c}">${l}</span></td><td><button type="button" class="btn sm" ${tdDvAttr({ company: g.company, from: tdAddDays(g.gap_from, -3), to: tdAddDays(g.gap_to, 3) })}>${bi("আশেপাশের ভাউচার", "Vouchers around")}</button></td></tr>`; }).join("")}</tbody></table></div>` : ""}
      <p class="mut xs" style="margin:10px 0 0">${bi("ফাঁক মানেই ডেটা হারানো নয় (ছুটি/লেনদেনহীন দিন হতে পারে); শেষ ভাউচারের তারিখ সিঙ্ক-কভারেজের প্রমাণ নয়। ১৪ দিন বা বেশি হলে ‘পর্যালোচনা দরকার’ — এটি সূত্র মাত্র, নিশ্চিত প্রমাণ নয়।", "A gap is not proof of missing data (holidays or quiet days); the latest voucher date is not proof of sync coverage. 14 days or more is marked ‘Review required’ — a lead, not proof.")}</p></div>`;
  },
  async balance(box, stale) {
    if (DEMO) return tdDemoNote();
    const fl = await tdVFilters(); if (stale()) return;
    box.innerHTML = `<div class="card td-vh" style="flex-wrap:wrap"><p class="mut sm" style="margin:0;flex:1 1 320px">${bi("প্রতিটি ভাউচারে ডেবিট = ক্রেডিট কি না। সারাংশ সার্ভারে প্রতি ৩০ মিনিটে হিসাব হয়; একটি কোম্পানি এখনই যাচাই করা যায়।", "Whether debit = credit in every voucher. The summary is computed on the server every 30 minutes; one company can be checked live right now.")}</p>
        <div class="td-vb" style="margin:0"><select class="in" id="tb-co" aria-label="${bi("কোম্পানি", "Company")}"><option value="">${bi("সব কোম্পানি", "All companies")}</option>${((fl.data || {}).companies || []).map(c => `<option>${esc(c.company)}</option>`).join("")}</select><button class="btn pri" type="button" id="tb-live">${bi("এখনই যাচাই", "Check now")}</button></div></div><div id="tb-out" style="margin-top:12px"></div>`;
    const o = $("#tb-out", box), co = $("#tb-co", box), live = $("#tb-live", box);
    const paint = d => {
      const rows = d.rows || [], byc = d.by_company || [], tot = rows.reduce((a, x) => a + (+x.total || 0), 0), un = rows.reduce((a, x) => a + (+x.unbalanced || 0), 0), ne = (d.no_entries || []).reduce((a, x) => a + (+x.n || 0), 0);
      const comp = Object.values(byc.reduce((m, x) => { const c = m[x.company] || (m[x.company] = { company: x.company, total: 0, balanced: 0, unbalanced: 0 }); c.total += +x.total; c.balanced += +x.balanced; c.unbalanced += +x.unbalanced; return m; }, {}));
      const neMap = Object.fromEntries((d.no_entries || []).map(x => [x.company, x.n]));
      o.innerHTML = `${tdSnapNote(d)}<div class="as-metrics"><div class="card as-kpi"><span>${bi("লাইনসহ ভাউচার", "Vouchers with lines")}</span><strong>${money0(tot)}</strong><small class="mut">${esc(d.company || bi("সব কোম্পানি", "all companies"))}</small></div><div class="card as-kpi gr"><span>${bi("সমান", "Balanced")}</span><strong>${money0(tot - un)}</strong><small class="mut">${tdPct(tot - un, tot)}%</small></div><div class="card as-kpi ${un ? "rd" : ""}"><span>${bi("পার্থক্য পাওয়া গেছে", "Difference detected")}</span><strong>${money0(un)}</strong><small class="mut">${bi("|ডেবিট − ক্রেডিট| ≥ ০.০১", "|debit − credit| ≥ 0.01")}</small></div><div class="card as-kpi"><span>${bi("যাচাই হয়নি", "Not verified")}</span><strong>${money0(ne)}</strong><small class="mut">${bi("লাইন নেই (stock/BoM ধরনের)", "no lines (stock/BoM types)")}</small></div></div>
        <div class="td-grid2" style="margin-top:0">
          <div class="card"><h3 style="margin:0 0 8px">${bi("কোম্পানি অনুযায়ী", "By company")}</h3><div class="tw"><table class="td-t"><thead><tr><th>${bi("কোম্পানি", "Company")}</th><th class="r">${bi("মোট", "Total")}</th><th class="r">${bi("পার্থক্য", "Difference")}</th><th class="r">${bi("লাইন নেই", "No lines")}</th><th>${bi("অবস্থা", "State")}</th></tr></thead><tbody>${comp.map(c => `<tr><td><b>${esc(c.company)}</b></td><td class="r num">${money0(c.total)}</td><td class="r num">${money0(c.unbalanced)}</td><td class="r num">${money0(neMap[c.company] || 0)}</td><td><span class="st ${c.unbalanced ? "rd" : "gr"}">${c.unbalanced ? bi("পর্যালোচনা", "Review") : bi("সমান", "Balanced")}</span></td></tr>`).join("") || `<tr><td colspan="5" class="mut">—</td></tr>`}</tbody></table></div></div>
          <div class="card"><h3 style="margin:0 0 8px">${bi("ভাউচারের ধরন অনুযায়ী", "By voucher type")}</h3><div class="tw"><table class="td-t"><thead><tr><th>${bi("ধরন", "Type")}</th><th class="r">${bi("মোট", "Total")}</th><th class="r">${bi("সমান", "Balanced")}</th><th class="r">${bi("পার্থক্য", "Difference")}</th><th class="r">%</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(x.vtype || "—")}</td><td class="r num">${money0(x.total)}</td><td class="r num">${money0(x.balanced)}</td><td class="r num">${money0(x.unbalanced)}</td><td class="r num"><span class="st ${x.unbalanced ? "am" : "gr"}">${tdPct(x.balanced, x.total)}%</span></td></tr>`).join("")}</tbody></table></div></div></div>
        ${(d.unbalanced_sample || []).length ? `<div class="card" style="margin-top:12px"><h3 style="margin:0 0 8px">${bi("পার্থক্যসহ ভাউচার (বড় থেকে ছোট, সর্বোচ্চ ২০০)", "Vouchers with a difference (largest first, up to 200)")}</h3><div class="tw td-scroll"><table class="td-t"><thead><tr><th>${bi("তারিখ", "Date")}</th><th>${bi("কোম্পানি", "Company")}</th><th>${bi("ধরন", "Type")}</th><th>${bi("নং", "No.")}</th><th class="r">${bi("পরিমাণ", "Amount")}</th><th class="r">${bi("পার্থক্য", "Difference")}</th></tr></thead><tbody>${d.unbalanced_sample.map(x => `<tr><td class="sm">${dmy(x.vdate)}</td><td>${esc(x.company)}</td><td>${esc(x.vtype || "—")}</td><td><button type="button" class="td-link" ${tdDvAttr({ company: x.company, from: x.vdate, to: x.vdate, q: x.vno || "" })}>${esc(x.vno || "—")} ›</button></td><td class="r num">${money0(x.amount)}</td><td class="r num">${money0(Math.abs(x.diff))} ${x.diff < 0 ? "Dr" : "Cr"}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
        <p class="mut xs" style="margin:10px 0 0">${bi("Tally ডেবিটকে ঋণাত্মক রাখে; প্রতিটি ভাউচারের সব লাইনের যোগফল ০ হলে ‘সমান’। পার্থক্য পেলে Bridge-এর পরের full load-এর পর আবার দেখুন; কিছুই নিজে থেকে ঠিক করা হয় না।", "Tally stores a debit as negative; a voucher is ‘balanced’ when its lines sum to 0. If a difference appears, re-check after the next Bridge full load; nothing is corrected automatically.")}</p>`;
      o.querySelectorAll("[data-dv]").forEach(b => b.onclick = () => { try { TD.go("vouchers", JSON.parse(b.dataset.dv)); } catch { } });
    };
    async function load(isLive) {
      const c = co.value || null; o.innerHTML = `<div class="card"><div class="skel"></div><p class="mut xs" style="margin:8px 0 0">${isLive ? bi("একটি কোম্পানির সব ভাউচার যাচাই হচ্ছে…", "Checking every voucher of one company…") : ""}</p></div>`;
      let r = isLive ? await sb.rpc("tally_balance_check", { p_company: c, p_live: true }).then(x => ({ data: x.data, error: x.error, missing: tdRpcMissing(x.error) })) : await tdRpc("tally_balance_check", { p_company: c, p_live: false });
      if (stale()) return;
      if (r.missing) {   // database without v4: the old function computes everything live (can time out over the whole history)
        if (!c && !isLive) { o.innerHTML = `<div class="alert am"><span>${bi("সব কোম্পানির সারাংশের জন্য <code>schema_tally_perf_v4.sql</code> দরকার। ততদিন একটি কোম্পানি বেছে ‘এখনই যাচাই’ চাপুন।", "The all-company summary needs <code>schema_tally_perf_v4.sql</code>. Until then, choose one company and press ‘Check now’.")}</span></div>`; return; }
        r = await sb.rpc("tally_balance_check", { p_company: c }).then(x => ({ data: x.data, error: x.error })); if (stale()) return;
      }
      if (r.error) { o.innerHTML = tdReconPanes.err(r); return; }
      paint(r.data);
    }
    co.onchange = () => load(false);
    live.onclick = () => { if (!co.value) { toast(bi("এখনই যাচাইয়ের জন্য একটি কোম্পানি বাছুন", "Choose one company for a live check"), "info"); co.focus(); return; } load(true); };
    await load(false);
  },
  async pending() {
    const S_ = { ok: ["gr", bi("চালু", "Available")], part: ["am", bi("আংশিক", "Partial")], no: ["", bi("প্রস্তুত নয়", "Not ready")] };
    const have = [bi("ভাউচার (সব ধরন, ২০২৩ থেকে)", "Vouchers (all types, since 2023)"), bi("প্রতি ভাউচারের লেজার লাইন — ডেবিট = ক্রেডিট যাচাই করা", "Ledger lines per voucher — debit = credit verified"), bi("লেজারের নাম ও তাৎক্ষণিক মূল গ্রুপ", "Ledger names and immediate parent group"), bi("বাতিল/মুছে ফেলা চিহ্ন, বৈদেশিক মুদ্রার টাকা অংশ (Bridge 1.2.2)", "Cancelled/deleted flags, foreign-currency BDT amounts (Bridge 1.2.2)")];
    const need = { ob: bi("Opening balance", "Opening balances"), grp: bi("সম্পূর্ণ গ্রুপ-কাঠামো (Primary পর্যন্ত)", "Full group hierarchy (up to Primary)"), bill: bi("Bill-wise বরাদ্দ", "Bill-wise allocations"), stock: bi("Stock মূল্যায়ন", "Stock valuation"), map: bi("app ↔ Tally লেজার mapping", "App ↔ Tally ledger mapping"), rule: bi("মেলানোর নিয়ম (মালিকের অনুমোদন)", "Match rule (owner approval)"), cls: bi("খরচ/আয় শ্রেণিবিন্যাস", "Expense/income classification") };
    const items = [
      [bi("Voucher ও Ledger Explorer", "Voucher & Ledger Explorer"), "ok", [], bi("চালু — নির্বাচিত সময়ের লেনদেন (opening ছাড়া)।", "Live — movement within a period (no opening).")],
      [bi("Tally বনাম Cash Book", "Tally vs Cash Book"), "ok", [], bi("চালু — তারিখ+ধরন+পরিমাণ+লেজার মিলিয়ে।", "Live — matched on date+type+amount+ledger.")],
      [bi("Sales ও Purchase বিশ্লেষণ", "Sales & Purchase analysis"), "part", ["grp"], bi("Sales/Purchase লেজারের লেনদেন Ledger Explorer-এ আছে; গ্রুপ-ভিত্তিক মোট ও পণ্যভিত্তিক বিশ্লেষণের জন্য গ্রুপ-কাঠামো ও stock লাইন দরকার।", "Sales/Purchase ledger movement is in the Ledger Explorer; group totals and item-wise analysis need the hierarchy and stock lines.")],
      [bi("খরচ বিশ্লেষণ", "Expense analysis"), "part", ["grp", "cls"], bi("খরচের লেজার আলাদা দেখা যায়; Indirect/Direct Expenses পর্যন্ত গ্রুপ না এলে মোট নির্ভরযোগ্য নয়।", "Expense ledgers are visible one by one; totals are not reliable until groups up to Direct/Indirect Expenses are mirrored.")],
      [bi("Cash ও Bank অবস্থান", "Cash & Bank position"), "no", ["ob", "map"], bi("ক্লোজিং ব্যালেন্সের জন্য opening ও ব্যাংক হিসাবের mapping দরকার।", "Closing balances need openings and the bank account mapping.")],
      [bi("Tally বনাম Bank Closing", "Tally vs Bank Closing"), "no", ["ob", "map"], bi("ব্যাংক হিসাব ↔ Tally লেজার mapping দরকার।", "Needs the bank account ↔ Tally ledger mapping.")],
      [bi("Tally বনাম Cheque Register", "Tally vs Cheque Register"), "no", ["rule"], bi("চেকের রেফারেন্স Tally-র কোন ক্ষেত্রে থাকে তা নিশ্চিত নয়।", "Which Tally field carries the cheque reference is not confirmed.")],
      [bi("Tally বনাম Collection", "Tally vs Collection"), "no", ["map"], bi("পার্টি ↔ Tally লেজার নাম-মেলানো (dist_parties) হয়নি।", "Party ↔ Tally ledger mapping (dist_parties) has not been done.")],
      [bi("Receivable ও Payable / ageing", "Receivable & Payable / ageing"), "no", ["ob", "bill"], bi("Bill-wise বরাদ্দ ছাড়া ageing হিসাব করা যায় না।", "Ageing cannot be computed without bill-wise allocations.")],
      ["Trial Balance", "no", ["ob", "grp"], bi("Opening ও গ্রুপ-কাঠামো দরকার।", "Needs openings and the group hierarchy.")],
      [bi("লাভ-ক্ষতি (P&L)", "Profit & Loss"), "no", ["grp", "stock"], bi("Stock মূল্যায়ন ও গ্রুপ দরকার।", "Needs stock valuation and groups.")],
      ["Balance Sheet", "no", ["ob", "grp", "stock"], bi("Opening, গ্রুপ ও stock দরকার।", "Needs openings, groups and stock.")],
      ["Cash Flow", "no", ["ob", "grp", "cls"], bi("Opening ও শ্রেণিবিন্যাস দরকার।", "Needs openings and classification.")],
      [bi("Management MIS", "Management MIS"), "part", ["grp", "cls"], bi("ভাউচার সংখ্যা, মাসওয়ারি কার্যকলাপ ও লেজার লেনদেন চালু; টাকার MIS-এর জন্য গ্রুপ ও শ্রেণিবিন্যাস দরকার।", "Voucher counts, monthly activity and ledger movement are live; money MIS needs groups and classification.")]];
    const cnt = k => items.filter(i => i[1] === k).length;
    return `<div class="as-metrics"><div class="card as-kpi gr"><span>${S_.ok[1]}</span><strong>${cnt("ok")}</strong></div><div class="card as-kpi am"><span>${S_.part[1]}</span><strong>${cnt("part")}</strong></div><div class="card as-kpi"><span>${S_.no[1]}</span><strong>${cnt("no")}</strong></div><div class="card as-kpi"><span>${bi("সবচেয়ে বেশি দরকার", "Most needed")}</span><small class="mut" style="white-space:normal">${need.ob} · ${need.grp}</small></div></div>
      <div class="td-grid2" style="margin-top:0"><div class="card"><h3 style="margin:0 0 8px">${bi("এখন যা আসে", "Mirrored today")}</h3><ul class="td-chk">${have.map(h => `<li class="ok">${h}</li>`).join("")}</ul></div>
        <div class="card"><h3 style="margin:0 0 8px">${bi("যা এখনো আসে না", "Not mirrored yet")}</h3><ul class="td-chk">${Object.values(need).map(h => `<li>${h}</li>`).join("")}</ul></div></div>
      <div class="card" style="margin-top:12px"><h3 style="margin:0 0 8px">${bi("রিপোর্ট ও মিলানোর প্রস্তুতি", "Report and reconciliation readiness")}</h3><div class="tw"><table class="td-t"><thead><tr><th>${bi("মডিউল", "Module")}</th><th>${bi("অবস্থা", "State")}</th><th>${bi("যা দরকার", "Needs")}</th><th>${bi("বিবরণ", "Notes")}</th></tr></thead><tbody>
      ${items.map(([t, k, n, why]) => `<tr><td><b>${t}</b></td><td><span class="st ${S_[k][0]}">${S_[k][1]}</span></td><td class="sm" style="white-space:normal">${n.map(x => need[x]).join(", ") || "—"}</td><td class="sm" style="white-space:normal">${why}</td></tr>`).join("")}
      </tbody></table></div><p class="mut xs" style="margin:10px 0 0">${bi("কোনো আন্দাজ বা শূন্য দেখানো হয় না। প্রয়োজনীয় ডেটা Bridge-এ যোগ হলে ও নিয়ম নিশ্চিত হলে এগুলো চালু হবে।", "No estimate or zero is shown. These switch on once the Bridge mirrors the data and the rules are confirmed.")}</p></div>`;
  }
};
