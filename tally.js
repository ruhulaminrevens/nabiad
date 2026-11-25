/* NABIAD — TALLY DASHBOARD (v6.173) — admin only. Tabs: Overview (sync state), Voucher Explorer and Ledger Explorer.
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

async function vTallyDash(v) {
  const tabs = [["overview", "dash", bi("সারসংক্ষেপ", "Overview"), tdOverview], ["vouchers", "search", bi("ভাউচার খুঁজুন", "Voucher Explorer"), tdVouchers], ["ledgers", "list", bi("লেজার", "Ledger Explorer"), tdLedgers]];
  let tab = "overview", cleanup = null, reload = () => {}, epoch = 0;
  v.innerHTML = head(bi("ট্যালি ড্যাশবোর্ড", "Tally Dashboard"), `<button class="btn" type="button" id="td-refresh">${ico("refresh")} ${bi("রিফ্রেশ", "Refresh")}</button>`) +
    `<div class="tabs ntabs as-tabs" role="group" aria-label="${bi("ট্যালি ড্যাশবোর্ডের বিভাগ", "Tally Dashboard sections")}">${tabs.map(([k, ic, l]) => `<button type="button" class="chip" data-td-tab="${k}" aria-controls="td-out" aria-pressed="false">${ico(ic)} ${l}</button>`).join("")}</div><div id="td-out" aria-live="polite"></div>`;
  const out = $("#td-out", v), btns = $$("[data-td-tab]", v);
  async function open(k) {
    const my = ++epoch; cleanup?.(); cleanup = null; tab = k;
    btns.forEach(b => { const on = b.dataset.tdTab === k; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    out.innerHTML = "";
    const r = await tabs.find(t => t[0] === k)[3](out);
    if (my !== epoch) { r?.cleanup?.(); return; }
    cleanup = r?.cleanup || null; reload = r?.reload || (() => {});
  }
  btns.forEach(b => b.onclick = () => { if (b.dataset.tdTab !== tab) open(b.dataset.tdTab); });
  $("#td-refresh", v).onclick = () => { Promise.resolve(reload()).then(() => toast(bi("রিফ্রেশ হয়েছে", "Refreshed"), "info")); };
  await open("overview");
  return () => { epoch++; cleanup?.(); };
}

/* ---------- Overview tab (the v6.170 page) ---------- */
async function tdOverview(out) {
  let gone = false;
  async function load() {
    out.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div><div class="skel" style="margin-top:12px"></div><div class="skel" style="margin-top:12px;width:70%"></div></div>`;
    let r;
    try { r = await tdLoad(); } catch (e) { r = { error: e }; }
    if (gone || !out.isConnected) return;
    if (r.error) { out.innerHTML = tdError(r); return; }
    out.innerHTML = tdView(r.data, r.demo);
  }
  await load();
  return { reload: load, cleanup: () => { gone = true; } };
}

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
  const { data, error } = await sb.rpc("tally_voucher_filters"); return { data, error };
}
async function tdVSearch(f, offset, limit = TD_PAGE) {
  if (DEMO) {
    const q = (f.q || "").toLowerCase(), all = tdDemoVouchers().filter(x => (!f.company || x.company === f.company) && (!f.vtype || x.vtype === f.vtype) && (!f.from || x.vdate >= f.from) && (!f.to || x.vdate <= f.to) && (f.cancelled || !x.cancelled)
      && (!q || (x.vno + " " + (x.narration || "") + " " + JSON.stringify(x.entries)).toLowerCase().includes(q))).sort((a, b) => b.vdate.localeCompare(a.vdate));
    return { data: { total: all.length, rows: all.slice(offset, offset + limit), limit, offset } };
  }
  const { data, error } = await sb.rpc("tally_voucher_search", { p_q: f.q || null, p_company: f.company || null, p_vtype: f.vtype || null, p_from: f.from || null, p_to: f.to || null, p_include_cancelled: !!f.cancelled, p_limit: limit, p_offset: offset });
  return { data, error };
}
const tdRpcMissing = e => e && (e.code === "PGRST202" || /could not find the function|does not exist/i.test(e.message || ""));
/* Tally exports a debit as a negative amount */
const tdEntryText = e => `${e.ledger} ${e.amount < 0 ? "Dr" : "Cr"} ${money0(Math.abs(e.amount))}`;
function tdParty(x) {
  const names = [...new Set((x.entries || []).map(e => e.ledger).filter(Boolean))];
  if (!names.length) return `<span class="mut">—</span>`;
  return esc(names.slice(0, 2).join(" · ")) + (names.length > 2 ? ` <span class="mut xs">+${names.length - 2}</span>` : "");
}
function tdVDetail(x) {
  const es = x.entries || [];
  const rows = es.map(e => `<tr><td>${esc(e.ledger)}</td><td class="r num">${e.amount < 0 ? money0(-e.amount) : ""}</td><td class="r num">${e.amount > 0 ? money0(e.amount) : ""}</td></tr>`).join("");
  return `<div class="td-vd"><div class="mut sm">${esc(x.company)}${x.counter_company ? " ⇄ " + esc(x.counter_company) : ""} · ${esc(x.vtype || "—")} #${esc(x.vno || "—")} · ${dmy(x.vdate)}</div>
    ${x.narration ? `<p class="sm" style="margin:6px 0">${esc(x.narration)}</p>` : ""}
    <table class="td-t"><thead><tr><th>${bi("লেজার", "Ledger")}</th><th class="r">${bi("ডেবিট", "Debit")}</th><th class="r">${bi("ক্রেডিট", "Credit")}</th></tr></thead><tbody>${rows || `<tr><td colspan="3" class="mut">${bi("কোনো লাইন কপি হয়নি", "No entry lines were mirrored")}</td></tr>`}</tbody></table></div>`;
}

async function tdVouchers(out) {
  let gone = false, epoch = 0, offset = 0, last = null, rows = [];
  const f = { q: "", company: "", vtype: "", from: tdDhaka().slice(0, 8) + "01", to: tdDhaka(), cancelled: true };
  out.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div></div>`;
  const fl = await tdVFilters();
  if (gone || !out.isConnected) return {};
  if (fl.error) { out.innerHTML = tdError({ error: fl.error, missing: tdRpcMissing(fl.error), explorer: true }); return { cleanup: () => { gone = true; } }; }
  const opt = (val, lab, cur) => `<option value="${esc(val)}" ${val === cur ? "selected" : ""}>${esc(lab)}</option>`;
  out.innerHTML = `${DEMO ? `<div class="alert am" style="margin-bottom:10px"><span>⚠ <b>${bi("DEMO মোড", "DEMO mode")}</b> — ${bi("কাল্পনিক ডেটা।", "fictional data.")}</span></div>` : ""}
    <form class="card td-vf" id="td-vf" role="search">
      <div class="td-vq"><label class="f" for="td-q">${bi("খুঁজুন", "Search")}</label><input class="in" id="td-q" type="search" autocomplete="off" maxlength="100" placeholder="${bi("ভাউচার নম্বর, লেজার/পার্টি, narration…", "Voucher no, ledger/party, narration…")}"></div>
      <div><label class="f" for="td-co">${bi("কোম্পানি", "Company")}</label><select class="in" id="td-co">${opt("", bi("সব কোম্পানি", "All companies"), "")}${(fl.data.companies || []).map(c => opt(c.company, c.company, "")).join("")}</select></div>
      <div><label class="f" for="td-ty">${bi("ধরন", "Voucher type")}</label><select class="in" id="td-ty">${opt("", bi("সব ধরন", "All types"), "")}${(fl.data.types || []).map(t => opt(t.vtype, t.vtype || bi("(ধরন নেই)", "(no type)"), "")).join("")}</select></div>
      <div><label class="f" for="td-fr">${bi("থেকে", "From")}</label><input class="in" id="td-fr" type="date" value="${f.from}"></div>
      <div><label class="f" for="td-to">${bi("পর্যন্ত", "To")}</label><input class="in" id="td-to" type="date" value="${f.to}"></div>
      <label class="td-ck"><input type="checkbox" id="td-cx" checked> ${bi("বাতিল ভাউচারসহ", "Include cancelled")}</label>
      <div class="td-vb"><button class="btn pri" type="submit">${ico("search")} ${bi("খুঁজুন", "Search")}</button><button class="btn" type="button" id="td-clr">${bi("মুছুন", "Clear")}</button></div>
    </form>
    <div class="card" style="margin-top:12px"><div class="td-vh"><div id="td-cnt" class="mut sm"></div><button class="btn" type="button" id="td-xl">${ico("dl")} ${bi("এক্সেল", "Excel")}</button></div>
      <div class="tw"><table class="td-t td-vt"><thead><tr><th>${bi("তারিখ", "Date")}</th><th>${bi("ধরন", "Type")}</th><th>${bi("নং", "No.")}</th><th>${bi("লেজার / পার্টি", "Ledger / Party")}</th><th class="r">${bi("পরিমাণ", "Amount")}</th><th>${bi("কোম্পানি", "Company")}</th><th>${bi("অবস্থা", "Status")}</th></tr></thead><tbody id="td-body"></tbody></table></div>
      <div class="td-pg"><button class="btn" type="button" id="td-pv">‹ ${bi("আগে", "Prev")}</button><span id="td-pi" class="mut sm"></span><button class="btn" type="button" id="td-nx">${bi("পরে", "Next")} ›</button></div>
      <p class="mut xs" style="margin:10px 0 0">${bi("ChawkBazar-2026 ও Cash & Bank-এ কিছু ভাউচার দুই কোম্পানিতেই থাকায় ‘সব কোম্পানি’ দেখলে একই ভাউচার দুবার আসতে পারে। দ্রুত ফলের জন্য তারিখ বা কোম্পানি দিয়ে সীমিত করুন; পুরো ইতিহাসে লেখা খুঁজতে কয়েক সেকেন্ড লাগতে পারে।", "Some vouchers exist in both ChawkBazar-2026 and Cash & Bank, so ‘All companies’ can list the same voucher twice. Narrow by date or company for fast results; a text search over the whole history can take a few seconds.")}</p></div>`;
  const $b = $("#td-body", out), cnt = $("#td-cnt", out), pv = $("#td-pv", out), nx = $("#td-nx", out), pi = $("#td-pi", out), xl = $("#td-xl", out);
  const readForm = () => Object.assign(f, { q: $("#td-q", out).value.trim(), company: $("#td-co", out).value, vtype: $("#td-ty", out).value, from: $("#td-fr", out).value, to: $("#td-to", out).value, cancelled: $("#td-cx", out).checked });
  function paint() {
    const total = last?.total || 0, from = total ? offset + 1 : 0, to = Math.min(offset + TD_PAGE, total);
    cnt.textContent = bi(`মোট ${money0(total)}টি ভাউচার`, `${money0(total)} vouchers`);
    pi.textContent = total ? `${money0(from)}–${money0(to)} / ${money0(total)}` : "";
    pv.disabled = offset <= 0; nx.disabled = offset + TD_PAGE >= total; xl.disabled = !total;
    $b.innerHTML = rows.map((x, i) => `<tr class="td-vr" data-i="${i}" tabindex="0" role="button" aria-expanded="false" aria-label="${bi("বিস্তারিত দেখুন", "Show details")}"><td class="sm">${dmy(x.vdate)}</td><td>${esc(x.vtype || "—")}</td><td>${esc(x.vno || "—")}</td>
      <td class="td-pt">${tdParty(x)}${x.narration ? `<div class="mut xs td-nar">${esc(x.narration)}</div>` : ""}</td><td class="r num">${money0(x.amount)}</td><td class="sm">${esc(x.company)}</td>
      <td>${x.cancelled ? `<span class="st rd">${bi("বাতিল", "Cancelled")}</span>` : ""}${x.counter_company ? `<span class="st am" title="${esc(x.counter_company)}">${bi("আন্তঃকোম্পানি", "Inter-company")}</span>` : ""}</td></tr>`).join("") ||
      `<tr><td colspan="7" class="mut" style="white-space:normal">${bi("কোনো ভাউচার মেলেনি — ফিল্টার বদলে দেখুন।", "No vouchers match — try changing the filters.")}</td></tr>`;
  }
  async function run(off = 0) {
    const my = ++epoch; offset = off; readForm();
    $b.innerHTML = `<tr><td colspan="7"><div class="skel"></div></td></tr>`; pv.disabled = nx.disabled = xl.disabled = true;
    let r; try { r = await tdVSearch(f, off); } catch (e) { r = { error: e }; }
    if (gone || my !== epoch || !out.isConnected) return;
    if (r.error) { $b.innerHTML = `<tr><td colspan="7"><div class="alert rd" role="alert"><span>${esc(r.error.message || r.error)}</span></div></td></tr>`; cnt.textContent = ""; return; }
    last = r.data; rows = r.data.rows || []; paint();
  }
  const toggle = tr => {
    const open = tr.getAttribute("aria-expanded") === "true";
    if (open) { tr.nextElementSibling?.classList.contains("td-vx") && tr.nextElementSibling.remove(); tr.setAttribute("aria-expanded", "false"); return; }
    tr.insertAdjacentHTML("afterend", `<tr class="td-vx"><td colspan="7" style="white-space:normal">${tdVDetail(rows[+tr.dataset.i])}</td></tr>`); tr.setAttribute("aria-expanded", "true");
  };
  $b.onclick = e => { const tr = e.target.closest(".td-vr"); if (tr) toggle(tr); };
  $b.onkeydown = e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".td-vr")) { e.preventDefault(); toggle(e.target); } };
  $("#td-vf", out).onsubmit = e => { e.preventDefault(); run(0); };
  $("#td-clr", out).onclick = () => { $("#td-q", out).value = ""; $("#td-co", out).value = ""; $("#td-ty", out).value = ""; $("#td-cx", out).checked = true; $("#td-fr", out).value = f.from; $("#td-to", out).value = f.to; run(0); };
  pv.onclick = () => run(Math.max(0, offset - TD_PAGE)); nx.onclick = () => run(offset + TD_PAGE);
  xl.onclick = async () => {
    xl.disabled = true; const total = last?.total || 0, cap = Math.min(total, TD_EXPORT_MAX), all = [];
    try {
      for (let o = 0; o < cap; o += 200) { const r = await tdVSearch(f, o, 200); if (r.error) throw r.error; all.push(...(r.data.rows || [])); if (gone) return; }
      await exportXlsx({ Vouchers: [["Date", "Company", "Type", "Voucher No", "Entries", "Narration", "Amount", "Cancelled", "Inter-company"],
        ...all.map(x => [x.vdate, x.company, x.vtype || "", x.vno || "", (x.entries || []).map(tdEntryText).join("; "), x.narration || "", Number(x.amount) || 0, x.cancelled ? "Yes" : "", x.counter_company || ""])] }, `tally_vouchers_${tdDhaka()}.xlsx`);
      toast(total > cap ? bi(`প্রথম ${money0(cap)}টি এক্সপোর্ট হয়েছে — ফিল্টার ছোট করুন`, `Exported the first ${money0(cap)} — narrow the filters for the rest`) : bi("এক্সপোর্ট হয়েছে", "Exported"), "info");
    } catch (e) { toast(bi("এক্সপোর্ট করা যায়নি", "Export failed") + ": " + (e.message || e), "err"); }
    xl.disabled = !last?.total;
  };
  await run(0);
  return { reload: () => run(offset), cleanup: () => { gone = true; } };
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
async function tdLList(f, offset) {
  if (DEMO) { const all = tdDemoLedgerAgg(f); return { data: { total: all.length, rows: all.slice(offset, offset + TD_PAGE) } }; }
  const { data, error } = await sb.rpc("tally_ledger_list", { p_company: f.company || null, p_q: f.q || null, p_from: f.from || null, p_to: f.to || null, p_limit: TD_PAGE, p_offset: offset });
  return { data, error };
}
async function tdLStatement(company, ledger, f) {
  if (DEMO) {
    const rows = tdDemoVouchers().filter(x => !x.cancelled && x.company === company && (!f.from || x.vdate >= f.from) && (!f.to || x.vdate <= f.to) && x.entries.some(e => e.ledger === ledger)).sort((a, b) => a.vdate.localeCompare(b.vdate))
      .map(x => ({ vdate: x.vdate, vtype: x.vtype, vno: x.vno, narration: x.narration, amt: x.entries.filter(e => e.ledger === ledger).reduce((s, e) => s + e.amount, 0), other: x.entries.filter(e => e.ledger !== ledger).map(e => e.ledger).join(" · ") }));
    return { data: { parent: null, n: rows.length, dr: rows.reduce((s, r) => s + (r.amt < 0 ? -r.amt : 0), 0), cr: rows.reduce((s, r) => s + (r.amt > 0 ? r.amt : 0), 0), truncated: false, rows } };
  }
  const { data, error } = await sb.rpc("tally_ledger_statement", { p_company: company, p_ledger: ledger, p_from: f.from || null, p_to: f.to || null });
  return { data, error };
}

async function tdLedgers(out) {
  let gone = false, epoch = 0, offset = 0, last = null, rows = [];
  const yStart = tdDhaka().slice(0, 4) + "-01-01", f = { q: "", company: "", from: yStart, to: tdDhaka() };
  out.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div></div>`;
  const fl = await tdVFilters();
  if (gone || !out.isConnected) return {};
  if (fl.error) { out.innerHTML = tdError({ error: fl.error, missing: tdRpcMissing(fl.error), explorer: true }); return { cleanup: () => { gone = true; } }; }
  const opt = (val, lab) => `<option value="${esc(val)}">${esc(lab)}</option>`;
  out.innerHTML = `${DEMO ? `<div class="alert am" style="margin-bottom:10px"><span>⚠ <b>${bi("DEMO মোড", "DEMO mode")}</b> — ${bi("কাল্পনিক ডেটা।", "fictional data.")}</span></div>` : ""}
    <div id="tl-list">
    <form class="card td-vf" id="tl-vf" role="search">
      <div class="td-vq"><label class="f" for="tl-q">${bi("লেজার বা গ্রুপের নাম", "Ledger or group name")}</label><input class="in" id="tl-q" type="search" autocomplete="off" maxlength="100" placeholder="${bi("যেমন Cash, Bank, পার্টির নাম…", "e.g. Cash, Bank, a party name…")}"></div>
      <div><label class="f" for="tl-co">${bi("কোম্পানি", "Company")}</label><select class="in" id="tl-co">${opt("", bi("সব কোম্পানি", "All companies"))}${(fl.data.companies || []).map(c => opt(c.company, c.company)).join("")}</select></div>
      <div><label class="f" for="tl-fr">${bi("থেকে", "From")}</label><input class="in" id="tl-fr" type="date" value="${f.from}"></div>
      <div><label class="f" for="tl-to">${bi("পর্যন্ত", "To")}</label><input class="in" id="tl-to" type="date" value="${f.to}"></div>
      <div class="td-vb"><button class="btn pri" type="submit">${ico("search")} ${bi("খুঁজুন", "Search")}</button><button class="btn" type="button" id="tl-clr">${bi("মুছুন", "Clear")}</button></div>
    </form>
    <div class="card" style="margin-top:12px"><div class="td-vh"><div id="tl-cnt" class="mut sm"></div></div>
      <div class="tw"><table class="td-t td-vt"><thead><tr><th>${bi("লেজার", "Ledger")}</th><th>${bi("গ্রুপ", "Group")}</th><th>${bi("কোম্পানি", "Company")}</th><th class="r">${bi("ডেবিট", "Debit")}</th><th class="r">${bi("ক্রেডিট", "Credit")}</th><th class="r">${bi("নিট", "Net")}</th><th class="r">${bi("লাইন", "Lines")}</th></tr></thead><tbody id="tl-body"></tbody></table></div>
      <div class="td-pg"><button class="btn" type="button" id="tl-pv">‹ ${bi("আগে", "Prev")}</button><span id="tl-pi" class="mut sm"></span><button class="btn" type="button" id="tl-nx">${bi("পরে", "Next")} ›</button></div>
      <p class="mut xs" style="margin:10px 0 0">${bi("Tally থেকে opening balance আসে না, তাই এখানে সব সংখ্যা নির্বাচিত সময়ের মধ্যের লেনদেন (ডেবিট, ক্রেডিট, নিট) — ক্লোজিং ব্যালেন্স নয়। বাতিল ও মুছে ফেলা ভাউচার বাদ। Sales/Purchase লেজারের লাইন Bridge 1.2.1 দিয়ে আবার সিঙ্ক না হওয়া পর্যন্ত অসম্পূর্ণ থাকতে পারে।", "Opening balances are not mirrored from Tally, so every figure here is movement inside the chosen period (debit, credit, net), not a closing balance. Cancelled and deleted vouchers are excluded. Sales/Purchase ledger lines can be incomplete until Bridge 1.2.1 has re-synced.")}</p></div></div>
    <div id="tl-stmt" hidden></div>`;
  const $b = $("#tl-body", out), cnt = $("#tl-cnt", out), pv = $("#tl-pv", out), nx = $("#tl-nx", out), pi = $("#tl-pi", out), L = $("#tl-list", out), S = $("#tl-stmt", out);
  const readForm = () => Object.assign(f, { q: $("#tl-q", out).value.trim(), company: $("#tl-co", out).value, from: $("#tl-fr", out).value, to: $("#tl-to", out).value });
  function paint() {
    const total = last?.total || 0;
    cnt.textContent = bi(`মোট ${money0(total)}টি লেজার`, `${money0(total)} ledgers`);
    pi.textContent = total ? `${money0(offset + 1)}–${money0(Math.min(offset + TD_PAGE, total))} / ${money0(total)}` : "";
    pv.disabled = offset <= 0; nx.disabled = offset + TD_PAGE >= total;
    $b.innerHTML = rows.map((x, i) => `<tr class="td-vr" data-i="${i}" tabindex="0" role="button" aria-label="${bi("লেজারের বিবরণ খুলুন", "Open ledger statement")}"><td class="td-pt"><b>${esc(x.ledger)}</b></td><td class="sm">${esc(x.parent || "—")}</td><td class="sm">${esc(x.company)}</td>
      <td class="r num">${money0(x.dr)}</td><td class="r num">${money0(x.cr)}</td><td class="r num">${tdNet(x.dr, x.cr)}</td><td class="r num">${money0(x.n)}</td></tr>`).join("") ||
      `<tr><td colspan="7" class="mut" style="white-space:normal">${bi("এই সময়ে কোনো লেজার মেলেনি।", "No ledger has activity in this period.")}</td></tr>`;
  }
  async function run(off = 0) {
    const my = ++epoch; offset = off; readForm();
    $b.innerHTML = `<tr><td colspan="7"><div class="skel"></div></td></tr>`; pv.disabled = nx.disabled = true;
    let r; try { r = await tdLList(f, off); } catch (e) { r = { error: e }; }
    if (gone || my !== epoch || !out.isConnected) return;
    if (r.error) { $b.innerHTML = `<tr><td colspan="7">${tdError({ error: r.error, missing: tdRpcMissing(r.error), ledger: true })}</td></tr>`; cnt.textContent = ""; return; }
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
    S.innerHTML = `<div class="td-vh" style="margin-bottom:10px">${back}<button class="btn" type="button" id="ts-xl">${ico("dl")} ${bi("এক্সেল", "Excel")}</button></div>
      <div class="card"><h3 style="margin:0">${esc(x.ledger)}</h3><div class="mut sm">${esc(x.company)}${d.parent ? " · " + esc(d.parent) : ""} · ${dmy(f.from)} → ${dmy(f.to)}</div>
        <div class="as-metrics" style="margin-block:12px"><div class="card as-kpi"><span>${bi("ডেবিট", "Debit")}</span><strong>${money0(d.dr)}</strong></div><div class="card as-kpi"><span>${bi("ক্রেডিট", "Credit")}</span><strong>${money0(d.cr)}</strong></div>
          <div class="card as-kpi"><span>${bi("নিট লেনদেন", "Net movement")}</span><strong>${tdNet(d.dr, d.cr)}</strong></div><div class="card as-kpi"><span>${bi("লাইন", "Lines")}</span><strong>${money0(d.n)}</strong></div></div>
        ${d.truncated ? `<div class="alert am" style="margin-bottom:10px"><span>${bi(`প্রথম ${money0(TD_STMT_MAX)}টি লাইন দেখানো হচ্ছে; মোট সংখ্যা ওপরে। সময় ছোট করুন।`, `Showing the first ${money0(TD_STMT_MAX)} lines; the totals above cover all. Narrow the period.`)}</span></div>` : ""}
        <div class="tw"><table class="td-t td-vt"><thead><tr><th>${bi("তারিখ", "Date")}</th><th>${bi("ধরন", "Type")}</th><th>${bi("নং", "No.")}</th><th>${bi("বিপরীত লেজার", "Particulars")}</th><th class="r">${bi("ডেবিট", "Debit")}</th><th class="r">${bi("ক্রেডিট", "Credit")}</th><th class="r">${bi("চলতি নিট", "Running net")}</th></tr></thead><tbody>${lines || `<tr><td colspan="7" class="mut">—</td></tr>`}</tbody></table></div>
        <p class="mut xs" style="margin:10px 0 0">${bi("‘চলতি নিট’ শুরুর তারিখ থেকে জমা নিট লেনদেন; opening balance ধরা নেই।", "‘Running net’ accumulates movement from the start date; no opening balance is included.")}</p></div>`;
    $("#ts-back", S).onclick = () => { S.hidden = true; L.hidden = false; };
    $("#ts-xl", S).onclick = async () => { let acc = 0;
      await exportXlsx({ Statement: [["Date", "Type", "Voucher No", "Particulars", "Narration", "Debit", "Credit", "Running net (Dr+/Cr-)"], ...(d.rows || []).map(t => { acc += -t.amt; return [t.vdate, t.vtype || "", t.vno || "", t.other || "", t.narration || "", t.amt < 0 ? -t.amt : 0, t.amt > 0 ? t.amt : 0, acc]; })] }, `ledger_${tdDhaka()}.xlsx`); };
  }
  const openRow = tr => { if (tr) openStmt(rows[+tr.dataset.i]); };
  $b.onclick = e => openRow(e.target.closest(".td-vr"));
  $b.onkeydown = e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".td-vr")) { e.preventDefault(); openRow(e.target); } };
  $("#tl-vf", out).onsubmit = e => { e.preventDefault(); run(0); };
  $("#tl-clr", out).onclick = () => { $("#tl-q", out).value = ""; $("#tl-co", out).value = ""; $("#tl-fr", out).value = yStart; $("#tl-to", out).value = tdDhaka(); run(0); };
  pv.onclick = () => run(Math.max(0, offset - TD_PAGE)); nx.onclick = () => run(offset + TD_PAGE);
  await run(0);
  return { reload: () => (S.hidden ? run(offset) : null), cleanup: () => { gone = true; } };
}
