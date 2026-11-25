/* NABIAD — TALLY DASHBOARD (v6.177) — admin only. Tabs: Overview (sync state), Companies, Voucher Explorer, Ledger Explorer, Reconciliation and Sync Health.
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
  const tabs = [["overview", "dash", bi("সারসংক্ষেপ", "Overview"), tdOverview], ["companies", "bank", bi("কোম্পানি", "Companies"), tdCompanies], ["vouchers", "search", bi("ভাউচার খুঁজুন", "Voucher Explorer"), tdVouchers], ["ledgers", "list", bi("লেজার", "Ledger Explorer"), tdLedgers], ["recon", "shield", bi("রিকনসিলিয়েশন", "Reconciliation"), tdRecon], ["sync", "refresh", bi("সিঙ্ক স্বাস্থ্য", "Sync Health"), tdSync]];
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
  $("#td-refresh", v).onclick = () => { tdBust(); Promise.resolve(reload()).then(() => toast(bi("রিফ্রেশ হয়েছে", "Refreshed"), "info")); };
  TD.go = (k, patch) => { Object.assign(TD, patch || {}); open(k); window.scrollTo(0, 0); };
  await open("overview");
  return () => { epoch++; cleanup?.(); TD.go = null; tdAbortAll(); };
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
  const r = await tdRpc("tally_voucher_filters"); return { data: r.data, error: r.error };
}
async function tdVSearch(f, offset, limit = TD_PAGE) {
  if (DEMO) {
    const q = (f.q || "").toLowerCase(), all = tdDemoVouchers().filter(x => (!f.company || x.company === f.company) && (!f.vtype || x.vtype === f.vtype) && (!f.from || x.vdate >= f.from) && (!f.to || x.vdate <= f.to) && (f.cancelled || !x.cancelled)
      && (!q || (x.vno + " " + (x.narration || "") + " " + JSON.stringify(x.entries)).toLowerCase().includes(q))).sort((a, b) => b.vdate.localeCompare(a.vdate));
    return { data: { total: all.length, rows: all.slice(offset, offset + limit), limit, offset } };
  }
  const { data, error } = await sb.rpc("tally_voucher_search", { p_q: f.q || null, p_company: f.company || null, p_vtype: f.vtype || null, p_from: f.from || null, p_to: f.to || null, p_include_cancelled: !!f.cancelled, p_limit: limit, p_offset: offset }).abortSignal(limit === TD_PAGE ? tdSignal("vsearch") : new AbortController().signal);
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
  const es = x.entries || [];
  const rows = es.map(e => `<tr><td>${esc(e.ledger)}</td><td class="r num">${e.amount < 0 ? money0(-e.amount) : ""}</td><td class="r num">${e.amount > 0 ? money0(e.amount) : ""}</td></tr>`).join("");
  return `<div class="td-vd"><div class="mut sm">${esc(x.company)}${x.counter_company ? " ⇄ " + esc(x.counter_company) : ""} · ${esc(x.vtype || "—")} #${esc(x.vno || "—")} · ${dmy(x.vdate)}</div>
    ${x.narration ? `<p class="sm" style="margin:6px 0">${esc(x.narration)}</p>` : ""}
    <table class="td-t"><thead><tr><th>${bi("লেজার", "Ledger")}</th><th class="r">${bi("ডেবিট", "Debit")}</th><th class="r">${bi("ক্রেডিট", "Credit")}</th></tr></thead><tbody>${rows || `<tr><td colspan="3" class="mut">${bi("কোনো লাইন কপি হয়নি", "No entry lines were mirrored")}</td></tr>`}</tbody></table></div>`;
}

async function tdVouchers(out) {
  let gone = false, epoch = 0, offset = 0, last = null, rows = [];
  const f = { q: "", company: TD.company || "", vtype: TD.vtype || "", from: TD.from || tdDhaka().slice(0, 8) + "01", to: TD.to || tdDhaka(), cancelled: true };
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
  $("#td-co", out).value = f.company; $("#td-ty", out).value = f.vtype;
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
  const { data, error } = await sb.rpc("tally_ledger_list", { p_company: f.company || null, p_q: f.q || null, p_from: f.from || null, p_to: f.to || null, p_limit: TD_PAGE, p_offset: offset }).abortSignal(tdSignal("llist"));
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
  let gone = false, epoch = 0, offset = 0, last = null, rows = [];
  const yStart = tdDhaka().slice(0, 4) + "-01-01", f = { q: "", company: TD.company || "", from: TD.from || yStart, to: TD.to || tdDhaka() };
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
  $("#tl-co", out).value = f.company;
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

/* ======================= Phase 1–3 (v6.174): Overview, Companies, Reconciliation, Sync Health ======================= */
/* Shared filter state: Overview filters drive drill-downs; a company click opens the explorers already scoped to it. */
const TD = { company: "", from: "", to: "", vtype: "", go: null };
/* v6.177: one in-flight request per identical read, short result cache (per signed-in user), errors never cached. Refresh button clears it. */
const TD_TTL = { tally_voucher_filters: 600000, tally_overview: 30000, tally_sync_health: 30000, tally_recon_shared: 60000, tally_recon_coverage: 120000, tally_recon_changes: 60000 };
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
const tdBars = (items, lab, val) => { const max = Math.max(1, ...items.map(x => +x[val] || 0)), tot = items.reduce((s, x) => s + (+x[val] || 0), 0);
  return items.length ? items.map(x => `<div class="td-bar"><span class="td-bl" title="${esc(x[lab])}">${esc(x[lab] || "—")}</span><i style="--w:${Math.max(1, Math.round((+x[val] || 0) * 100 / max))}%"></i><b>${money0(x[val])}</b><em>${tdPct(+x[val] || 0, tot)}%</em></div>`).join("") : `<p class="mut sm">${bi("এই ফিল্টারে কোনো ডেটা নেই", "No data for this filter")}</p>`; };
const tdCols = items => { const max = Math.max(1, ...items.map(x => +x.n || 0));
  return items.length ? `<div class="td-cols" role="img" aria-label="${bi("মাসওয়ারি ভাউচার সংখ্যা", "Vouchers per month")}">${items.map(x => `<div title="${esc(x.m)}: ${money0(x.n)}"><i style="height:${Math.max(2, Math.round((+x.n || 0) * 100 / max))}%"></i><small>${esc(x.m.slice(2))}</small></div>`).join("")}</div>` : `<p class="mut sm">${bi("কোনো ডেটা নেই", "No data")}</p>`; };
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
async function tdOverview(out) {
  let gone = false, epoch = 0;
  const flP = tdVFilters();
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`;
  out.innerHTML = `<form class="card td-vf" id="to-f"><div><label class="f" for="to-co">${bi("কোম্পানি", "Company")}</label><select class="in" id="to-co">${opt("", bi("সব কোম্পানি", "All companies"), TD.company)}</select></div>
    <div><label class="f" for="to-ty">${bi("ধরন", "Voucher type")}</label><select class="in" id="to-ty">${opt("", bi("সব ধরন", "All types"), TD.vtype)}</select></div>
    <div><label class="f" for="to-fr">${bi("থেকে", "From")}</label><input class="in" id="to-fr" type="date" value="${esc(TD.from)}"></div><div><label class="f" for="to-to">${bi("পর্যন্ত", "To")}</label><input class="in" id="to-to" type="date" value="${esc(TD.to)}"></div>
    <div class="td-vb"><button class="btn pri" type="submit">${bi("প্রয়োগ", "Apply")}</button><button class="btn" type="button" id="to-r">${bi("রিসেট", "Reset")}</button></div></form><div id="to-body" aria-live="polite"></div>`;
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
    body.querySelectorAll("[data-go]").forEach(b => b.onclick = () => TD.go(b.dataset.go, {}));
  }
  const chips = () => [TD.company && [bi("কোম্পানি", "Company"), TD.company], TD.vtype && [bi("ধরন", "Type"), TD.vtype], (TD.from || TD.to) && [bi("সময়", "Period"), `${TD.from ? dmy(TD.from) : "…"} → ${TD.to ? dmy(TD.to) : "…"}`]].filter(Boolean);
  $("#to-f", out).onsubmit = e => { e.preventDefault(); Object.assign(TD, { company: $("#to-co", out).value, vtype: $("#to-ty", out).value, from: $("#to-fr", out).value, to: $("#to-to", out).value }); load(); };
  $("#to-r", out).onclick = () => { Object.assign(TD, { company: "", vtype: "", from: "", to: "" }); ["to-co", "to-ty", "to-fr", "to-to"].forEach(i => $("#" + i, out).value = ""); load(); };
  tdOverview.chips = chips;
  await load();
  return { reload: load, cleanup: () => { gone = true; } };
}
function tdOverviewView(d, h) {
  const sc = d.scope || {}, cos = d.by_company || [], col = d.collisions || {}, filtered = !!(TD.company || TD.vtype || TD.from || TD.to), sub = filtered ? bi("নির্বাচিত ফিল্টার", "selected filters") : bi("সব সময়", "all time");
  const lifeRows = cos.reduce((s, c) => s + (+c.life_rows || 0), 0), ledgers = cos.reduce((s, c) => s + (+c.ledgers || 0), 0), canc = cos.reduce((s, c) => s + (+c.cancelled || 0), 0), del = cos.reduce((s, c) => s + (+c.deleted || 0), 0);
  const kpi = (label, value, s, cls = "", go = "") => `<${go ? `button type="button" data-go="${go}"` : "div"} class="card as-kpi ${cls}"><span>${label}</span><strong>${value}</strong>${s ? `<small class="mut">${s}</small>` : ""}</${go ? "button" : "div"}>`;
  const lastOk = (h?.companies || []).map(c => c.last_ok_at).filter(Boolean).sort().pop();
  const chipHtml = tdOverview.chips ? tdOverview.chips().map(([k, v]) => `<span class="chip on">${k}: ${esc(v)}</span>`).join(" ") : "";
  const compRows = cos.map(c => `<tr><td><b>${esc(c.company)}</b></td><td class="r num">${money0(c.rows)}</td><td class="r num">${money0(c.life_rows)}</td><td class="r num">${money0(c.ledgers)}</td><td class="r num">${money0(c.cancelled)}</td><td class="sm">${c.first_date ? dmy(c.first_date) + " → " + dmy(c.last_date) : "—"}</td><td>${tdDrill("vouchers", c.company)} ${tdDrill("ledgers", c.company)}</td></tr>`).join("");
  return `${chipHtml ? `<div style="margin:10px 0">${chipHtml}</div>` : ""}
    <div class="as-metrics">
      ${kpi(bi("কোম্পানি", "Companies"), money0(sc.companies), bi("ভাউচার আছে এমন, " + sub, "with vouchers, " + sub), "", "companies")}
      ${kpi(bi("ভাউচার সারি (raw)", "Voucher rows (raw)"), money0(sc.rows), sub, "", "vouchers")}
      ${kpi(bi("আলাদা GUID", "Distinct GUIDs"), money0(sc.unique_guids), bi("সত্যিকারের ইউনিক ভাউচার নয় — নিচের ‘ইন্টেগ্রিটি’ দেখুন", "not a true unique-voucher count — see Integrity below"))}
      ${kpi(bi("লেজার সারি", "Ledger rows"), money0(ledgers), bi("কোম্পানি-ভিত্তিক যোগফল, সারাজীবন", "sum of company rows, all time"))}
      ${kpi(bi("শেষ সফল সিঙ্ক", "Last successful sync"), lastOk ? relTime(lastOk) : "—", lastOk ? tdTime(lastOk) : bi("অজানা", "unknown"))}
      ${kpi(bi("চলমান সমস্যা", "Open issues"), money0(h?.open_issues ?? 0), bi("এই মুহূর্তে সমাধানহীন", "unresolved right now"), (h?.open_issues || 0) ? "rd" : "", "sync")}
      ${kpi(bi("ব্যর্থ run (৭ দিন)", "Failed runs (7 days)"), money0(h?.failed_window ?? 0), bi(`ইতিহাস; ${h?.recovered || 0}টি পরে ঠিক`, `history; ${h?.recovered || 0} later recovered`), "", "sync")}
      ${kpi(bi("বাতিল / মুছে ফেলা", "Cancelled / deleted"), `${money0(canc)} / ${money0(del)}`, bi("সারাজীবন", "all time"), "", "recon")}
    </div>
    <div class="td-grid2">
      <div class="card"><h3 style="margin:0 0 8px">${bi("কোম্পানি অনুযায়ী ভাউচার", "Vouchers by company")}</h3><p class="mut xs" style="margin:0 0 8px">${bi("raw সারির সংখ্যা (টাকার পরিমাণ নয়, ডিডুপ করা নয়) · ", "raw row counts (not amounts, not deduplicated) · ")}${sub}</p>${tdBars(cos.filter(c => c.rows > 0).map(c => ({ n: c.company, rows: c.rows })), "n", "rows")}</div>
      <div class="card"><h3 style="margin:0 0 8px">${bi("ভাউচারের ধরন", "Voucher types")}</h3><p class="mut xs" style="margin:0 0 8px">${sub}</p>${tdBars(d.by_type || [], "vtype", "n")}</div>
      <div class="card"><h3 style="margin:0 0 8px">${bi("মাসওয়ারি ভাউচার (সর্বশেষ ৩৬ মাস পর্যন্ত)", "Vouchers per month (up to 36 months)")}</h3>${tdCols(d.by_month || [])}</div>
      <div class="card"><h3 style="margin:0 0 8px">${bi("দৈনিক কার্যকলাপ (শেষ ৩০ দিন)", "Daily activity (last 30 days of data)")}</h3>${tdCols((d.daily || []).map(x => ({ m: "--" + x.d.slice(5), n: x.n })))}</div>
    </div>
    <div class="card" style="margin-top:12px"><h3 style="margin:0 0 8px">${bi("ডেটা ইন্টেগ্রিটি", "Data integrity")}</h3>
      <p class="sm" id="to-col" style="margin:0 0 6px"><b>${d.collisions ? money0(col.identities || 0) : "…"}</b> ${bi("GUID একাধিক কোম্পানিতে আছে; এর মধ্যে বিষয়বস্তু হুবহু এক", "GUIDs appear in more than one company; of these the content is identical for")} <b>${d.collisions ? money0(col.identical || 0) : "…"}</b>.</p>
      <p class="mut sm" style="margin:0 0 8px">${bi("তাই এগুলো ডুপ্লিকেট নয় — একই ID-র আলাদা লেনদেন। GUID ধরে বাদ দিলে লেনদেন হারাবে; কোম্পানি যোগ করে মোট করাও ভুল। বিস্তারিত: Reconciliation → Shared GUIDs।", "so these are not duplicates — different transactions sharing an ID. Removing them by GUID would lose transactions, and summing companies blindly is wrong too. Details: Reconciliation → Shared GUIDs.")}</p>
      <button type="button" class="btn sm" data-go="recon">${bi("Reconciliation খুলুন", "Open Reconciliation")}</button></div>
    <div class="card" style="margin-top:12px"><h3 style="margin:0 0 8px">${bi("কোম্পানি ভিত্তিক সারসংক্ষেপ", "Company overview")}</h3><div class="tw"><table class="td-t"><thead><tr><th>${bi("কোম্পানি", "Company")}</th><th class="r">${bi("ফিল্টারে", "In filter")}</th><th class="r">${bi("মোট", "All time")}</th><th class="r">${bi("লেজার", "Ledgers")}</th><th class="r">${bi("বাতিল", "Cancelled")}</th><th>${bi("ডেটার সীমা", "Data range")}</th><th></th></tr></thead><tbody>${compRows || `<tr><td colspan="7" class="mut">—</td></tr>`}</tbody></table></div></div>
    <div class="card" style="margin-top:12px"><h3 style="margin:0 0 8px">${bi("আর্থিক রিপোর্ট", "Financial reports")}</h3><p class="mut sm" style="margin:0">${bi("Trial Balance, P&L, Balance Sheet, Receivable/Payable ageing", "Trial Balance, P&L, Balance Sheet, Receivable/Payable ageing")}: ${tdNA()} — ${bi("opening balance, লেজার গ্রুপ ও bill-wise তথ্য Tally থেকে আসে না। শূন্য বা আন্দাজ দেখানো হয় না।", "opening balances, ledger groups and bill-wise data are not mirrored from Tally. No zero or estimate is shown.")}</p></div>
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
    <div class="tw"><table class="td-t"><thead><tr>${cols.map(([k, l]) => `<th data-k="${k}" class="${["life_rows", "ledgers", "cancelled", "deleted"].includes(k) ? "r" : ""}"><button type="button" class="td-sort" data-sk="${k}">${l}</button></th>`).join("")}<th></th></tr></thead><tbody></tbody></table></div>
    <p class="mut xs" style="margin:10px 0 0">${bi("কোম্পানির নাম হুবহু Tally-র মতো; একই নামের লেজার বা একই নম্বরের ভাউচার আলাদা কোম্পানিতে আলাদা ধরা হয়।", "Company names are exactly as in Tally; same-name ledgers and repeated voucher numbers in different companies stay separate.")}</p></div>`;
  $("#tc-q", out).oninput = e => { q = e.target.value.trim().toLowerCase(); paint(); };
  out.querySelectorAll("[data-sk]").forEach(b => b.onclick = () => { sort = { k: b.dataset.sk, d: sort.k === b.dataset.sk ? -sort.d : (["company"].includes(b.dataset.sk) ? 1 : -1) }; paint(); });
  paint();
  return { reload: () => null, cleanup: () => { gone = true; } };
}

/* ---------- Sync Health ---------- */
async function tdSync(out) {
  let gone = false, epoch = 0, offset = 0, last = null;
  const f = { company: "", ok: "" };
  out.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div></div>`;
  const demoRuns = () => { const rs = tdDemo().recent_runs.filter(x => (!f.company || x.company === f.company) && (f.ok === "" || String(x.ok) === f.ok)); return { data: { total: rs.length, rows: rs.slice(offset, offset + TD_PAGE) } }; };
  const [h, rl0] = DEMO ? [{ data: tdDemoHealth() }, demoRuns()] : await Promise.all([tdRpc("tally_sync_health", { p_days: 7 }), tdRpc("tally_sync_runs_list", { p_limit: TD_PAGE })]);
  if (gone || !out.isConnected) return {};
  if (h.error) { out.innerHTML = tdError({ error: h.error, missing: h.missing, explorer: true }); return { cleanup: () => { gone = true; } }; }
  const d = h.data, cos = d.companies || [];
  const rows = cos.map(c => { const [k, l] = tdSyncStatus(c); return `<tr><td><b>${esc(c.company)}</b></td><td><span class="st ${k}">${l}</span></td><td class="sm">${tdTime(c.last_run_at)}</td><td class="sm">${tdTime(c.last_ok_at)}</td><td class="r num">${money0(c.failed_window)}</td><td class="mut xs td-err">${esc(c.open_issue ? c.last_error || "" : "")}</td></tr>`; }).join("");
  out.innerHTML = `<div class="as-metrics"><div class="card as-kpi ${d.open_issues ? "rd" : ""}"><span>${bi("চলমান সমস্যা", "Open issues")}</span><strong>${money0(d.open_issues)}</strong><small class="mut">${bi("সর্বশেষ run ব্যর্থ", "latest run failed")}</small></div>
      <div class="card as-kpi"><span>${bi("ব্যর্থ run (৭ দিন)", "Failed runs (7 days)")}</span><strong>${money0(d.failed_window)}</strong><small class="mut">${bi("ইতিহাস", "history")}</small></div>
      <div class="card as-kpi"><span>${bi("পরে ঠিক হয়েছে", "Failed, then recovered")}</span><strong>${money0(d.recovered)}</strong><small class="mut">${bi("কোম্পানি", "companies")}</small></div>
      <div class="card as-kpi"><span>${bi("Tally-র অবস্থা", "TallyPrime status")}</span><strong>${bi("অজানা", "Unknown")}</strong><small class="mut">${bi("যাচাই-করা heartbeat নেই; শেষ রিপোর্ট দেখুন", "no verified heartbeat; see last reported")}</small></div></div>
    <div class="card"><h3 style="margin:0 0 8px">${bi("কোম্পানি ভিত্তিক সিঙ্ক", "Sync by company")}</h3><div class="tw"><table class="td-t"><thead><tr><th>${bi("কোম্পানি", "Company")}</th><th>${bi("অবস্থা", "Status")}</th><th>${bi("শেষ চেষ্টা", "Last attempt")}</th><th>${bi("শেষ সফল", "Last success")}</th><th class="r">${bi("ব্যর্থ (৭ দিন)", "Failed (7 d)")}</th><th>${bi("ত্রুটি", "Error")}</th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="mut">—</td></tr>`}</tbody></table></div>
      <p class="mut xs" style="margin:10px 0 0">${bi("পরে সফল run হলে আগের ব্যর্থতা ইতিহাসে থাকে কিন্তু ‘চলমান সমস্যা’ গোনা হয় না। এই পাতা browser–Supabase সংযোগ দেখায়, TallyPrime নয়; Windows-এর নিয়ন্ত্রণ Data Bridge app-এ।", "A later successful run keeps the earlier failure in history but it no longer counts as an open issue. This page shows browser–Supabase connectivity, not TallyPrime; Windows controls stay in the Data Bridge app.")}</p></div>
    <div class="card" style="margin-top:12px"><div class="td-vh"><h3 style="margin:0">${bi("সাম্প্রতিক সিঙ্ক run", "Recent sync runs")}</h3><div class="td-vb" style="margin:0"><select class="in" id="ts-co" aria-label="${bi("কোম্পানি", "Company")}"><option value="">${bi("সব কোম্পানি", "All companies")}</option>${cos.map(c => `<option>${esc(c.company)}</option>`).join("")}</select><select class="in" id="ts-ok" aria-label="${bi("ফল", "Result")}"><option value="">${bi("সব ফল", "All results")}</option><option value="true">OK</option><option value="false">${bi("ব্যর্থ", "Failed")}</option></select></div></div>
      <div class="tw"><table class="td-t"><thead><tr><th>${bi("শুরু (ঢাকা)", "Started (Dhaka)")}</th><th>${bi("কোম্পানি", "Company")}</th><th>${bi("সময়কাল", "Period")}</th><th class="r">${bi("ভাউচার", "Vouchers")}</th><th>${bi("ফল", "Result")}</th><th>${bi("ত্রুটি", "Error")}</th></tr></thead><tbody id="ts-body"></tbody></table></div>
      <div class="td-pg"><button class="btn" type="button" id="ts-pv">‹ ${bi("আগে", "Prev")}</button><span id="ts-pi" class="mut sm"></span><button class="btn" type="button" id="ts-nx">${bi("পরে", "Next")} ›</button></div></div>`;
  const body = $("#ts-body", out), pv = $("#ts-pv", out), nx = $("#ts-nx", out);
  function paint() { const total = last?.total || 0; pv.disabled = offset <= 0; nx.disabled = offset + TD_PAGE >= total; $("#ts-pi", out).textContent = total ? `${money0(offset + 1)}–${money0(Math.min(offset + TD_PAGE, total))} / ${money0(total)}` : "";
    body.innerHTML = (last?.rows || []).map(x => `<tr><td class="sm">${tdTime(x.started_at)}</td><td>${esc(x.company)}</td><td class="sm">${x.from_date ? dmy(x.from_date) + " → " + dmy(x.to_date) : "—"}</td><td class="r num">${x.vouchers == null ? "—" : money0(x.vouchers)}</td><td><span class="st ${x.ok ? "gr" : x.ok === false ? "rd" : "am"}">${x.ok ? "OK" : x.ok === false ? bi("ব্যর্থ", "Failed") : "—"}</span></td><td class="mut xs td-err">${esc(x.error || "")}</td></tr>`).join("") || `<tr><td colspan="6" class="mut">—</td></tr>`; }
  async function run(off) { const my = ++epoch; offset = off; f.company = $("#ts-co", out).value; f.ok = $("#ts-ok", out).value;
    const r = DEMO ? demoRuns() : await tdRpc("tally_sync_runs_list", { p_company: f.company || null, p_ok: f.ok === "" ? null : f.ok === "true", p_limit: TD_PAGE, p_offset: off });
    if (gone || my !== epoch) return; if (r.error) { body.innerHTML = `<tr><td colspan="6"><div class="alert rd"><span>${esc(r.error.message)}</span></div></td></tr>`; return; } last = r.data; paint(); }
  last = rl0.data; paint();
  $("#ts-co", out).onchange = () => run(0); $("#ts-ok", out).onchange = () => run(0); pv.onclick = () => run(Math.max(0, offset - TD_PAGE)); nx.onclick = () => run(offset + TD_PAGE);
  return { reload: () => Promise.all([run(offset)]), cleanup: () => { gone = true; } };
}

/* ---------- Reconciliation ---------- */
const TD_RECON_TABS = [["shared", () => bi("একই GUID", "Shared GUIDs")], ["cash", () => bi("Tally বনাম ক্যাশ বুক", "Tally vs Cash Book")], ["changes", () => bi("বাতিল / মুছে ফেলা", "Cancelled / deleted")], ["coverage", () => bi("কভারেজ / ফাঁক", "Coverage / gaps")], ["balance", () => bi("ডেবিট = ক্রেডিট", "Debit = credit")], ["pending", () => bi("এখনো নেই", "Not available yet")]];
async function tdRecon(out) {
  let gone = false, cur = "shared", epoch = 0;
  out.innerHTML = `<div class="tabs ntabs as-tabs" role="group" aria-label="${bi("রিকনসিলিয়েশন বিভাগ", "Reconciliation sections")}">${TD_RECON_TABS.map(([k, l]) => `<button type="button" class="chip" data-rt="${k}" aria-pressed="false">${l()}</button>`).join("")}</div><div id="tr-out" style="margin-top:12px"></div>`;
  const box = $("#tr-out", out), btns = $$("[data-rt]", out);
  const err = r => tdError({ error: r.error, missing: r.missing, explorer: true });
  async function open(k) {
    const my = ++epoch; cur = k; btns.forEach(b => { const on = b.dataset.rt === k; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    box.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div></div>`;
    try { const html = await tdReconPanes[k](box, () => gone || my !== epoch); if (gone || my !== epoch) return; if (typeof html === "string") box.innerHTML = html; } catch (e) { if (!gone && my === epoch) box.innerHTML = `<div class="alert rd"><span>${esc(e.message || e)}</span></div>`; }
  }
  btns.forEach(b => b.onclick = () => open(b.dataset.rt));
  tdReconPanes.err = err;
  await open("shared");
  return { reload: () => open(cur), cleanup: () => { gone = true; } };
}
const tdDemoNote = () => DEMO ? `<div class="alert am" style="margin-bottom:10px"><span>⚠ <b>${bi("DEMO মোড", "DEMO mode")}</b> — ${bi("এই বিভাগে কাল্পনিক ডেটাও নেই; আসল ডেটা লাগবে।", "this section needs real data; nothing is shown in demo.")}</span></div>` : "";
const tdReconPanes = {
  async shared(box, stale) {
    if (DEMO) return tdDemoNote();
    const [r, rs] = await Promise.all([tdRpc("tally_recon_shared", { p_limit: TD_PAGE, p_offset: 0, p_only_differing: false }), Promise.resolve(null)]);
    if (stale()) return;
    if (r.error) return tdReconPanes.err(r);
    const d = r.data; let off = 0, data = d;
    const pair = (d.by_pair || []).map(p => `${esc(p.a_company)} ⇄ ${esc(p.b_company)}: <b>${money0(p.n)}</b> (${dmy(p.first_date)} → ${dmy(p.last_date)})`).join("<br>") || "—";
    box.innerHTML = `<div class="as-metrics"><div class="card as-kpi"><span>${bi("একাধিক কোম্পানিতে একই GUID", "GUIDs in more than one company")}</span><strong>${money0(d.total)}</strong></div><div class="card as-kpi"><span>${bi("বিষয়বস্তু হুবহু এক", "Identical content")}</span><strong>${money0(d.identical)}</strong></div><div class="card as-kpi ${d.differing ? "am" : ""}"><span>${bi("বিষয়বস্তু আলাদা", "Different content")}</span><strong>${money0(d.differing)}</strong></div></div>
      <div class="card"><p class="sm" style="margin:0 0 6px">${pair}</p><p class="mut sm" style="margin:0 0 10px">${bi("একই GUID কিন্তু তারিখ/নম্বর/পরিমাণ/লাইন আলাদা হলে সেটি ডুপ্লিকেট নয়। কিছুই মুছে বা মিলিয়ে ফেলা হয়নি; দুই কোম্পানির ইতিহাস আলাদাই আছে। কোনটিকে ‘আসল’ ধরা হবে — এই সিদ্ধান্ত মালিকের।", "Same GUID with different date/number/amount/lines is not a duplicate. Nothing was deleted or merged; both companies keep their own history. Which one counts as canonical is the owner's decision.")}</p>
      <div class="tw"><table class="td-t"><thead><tr><th>${bi("তারিখ", "Date")}</th><th>${bi("ধরন", "Type")}</th><th>${esc(d.by_pair?.[0]?.a_company || "A")}</th><th>${esc(d.by_pair?.[0]?.b_company || "B")}</th><th>${bi("অবস্থা", "State")}</th></tr></thead><tbody id="tr-sh"></tbody></table></div>
      <div class="td-pg"><button class="btn" type="button" id="tr-pv">‹ ${bi("আগে", "Prev")}</button><span id="tr-pi" class="mut sm"></span><button class="btn" type="button" id="tr-nx">${bi("পরে", "Next")} ›</button></div></div>`;
    const draw = () => { $("#tr-sh", box).innerHTML = (data.rows || []).map(x => `<tr><td class="sm">${dmy(x.a_date)}${x.a_date !== x.b_date ? " / " + dmy(x.b_date) : ""}</td><td>${esc(x.a_type || "—")}</td><td>#${esc(x.a_vno || "—")} · ${money0(x.a_amount)} · ${x.a_lines} ${bi("লাইন", "lines")}</td><td>#${esc(x.b_vno || "—")} · ${money0(x.b_amount)} · ${x.b_lines} ${bi("লাইন", "lines")}</td><td><span class="st ${x.same_content ? "gr" : "am"}">${x.same_content ? bi("এক", "Same") : bi("আলাদা", "Different")}</span></td></tr>`).join("") || `<tr><td colspan="5" class="mut">—</td></tr>`;
      $("#tr-pi", box).textContent = d.total ? `${money0(off + 1)}–${money0(Math.min(off + TD_PAGE, d.total))} / ${money0(d.total)}` : ""; $("#tr-pv", box).disabled = off <= 0; $("#tr-nx", box).disabled = off + TD_PAGE >= d.total; };
    const go = async o => { const r2 = await tdRpc("tally_recon_shared", { p_limit: TD_PAGE, p_offset: o, p_only_differing: false }); if (stale() || r2.error) return; off = o; data = r2.data; draw(); };
    $("#tr-pv", box).onclick = () => go(Math.max(0, off - TD_PAGE)); $("#tr-nx", box).onclick = () => go(off + TD_PAGE); draw();
  },
  async cash(box, stale) {
    if (DEMO) return tdDemoNote();
    const fl = await tdVFilters(); if (stale()) return;
    const st = { company: "Nabiad-Cash & Bank", from: "", to: "" }; let off = 0, data = null;
    box.innerHTML = `<form class="card td-vf" id="tr-cf"><div><label class="f" for="tr-co">${bi("Tally কোম্পানি", "Tally company")}</label><select class="in" id="tr-co">${((fl.data || {}).companies || []).map(c => `<option ${c.company === st.company ? "selected" : ""}>${esc(c.company)}</option>`).join("")}</select></div>
        <div><label class="f" for="tr-fr">${bi("থেকে (ফাঁকা = app-এর সময়)", "From (blank = app period)")}</label><input class="in" id="tr-fr" type="date"></div><div><label class="f" for="tr-to">${bi("পর্যন্ত", "To")}</label><input class="in" id="tr-to" type="date"></div><div class="td-vb"><button class="btn pri" type="submit">${bi("মেলান", "Reconcile")}</button><button class="btn" type="button" id="tr-xl">${ico("dl")} ${bi("এক্সেল", "Excel")}</button></div></form><div id="tr-cb" style="margin-top:12px"></div>`;
    const cb = $("#tr-cb", box);
    const args = (o, l = TD_PAGE) => ({ p_company: st.company, p_from: st.from || null, p_to: st.to || null, p_limit: l, p_offset: o });
    const kindLab = k => k === "app_only" ? [bi("শুধু app-এ", "App only"), "am"] : k === "mirror_only" ? [bi("শুধু Tally mirror-এ", "Tally mirror only"), "rd"] : [bi("সংখ্যায় অমিল", "Count differs"), "am"];
    function draw() { const d = data, tot = d.exceptions || 0;
      cb.innerHTML = `<div class="as-metrics"><div class="card as-kpi"><span>${bi("app-এর Tally ক্যাশ voucher", "App Tally cash vouchers")}</span><strong>${money0(d.app_rows)}</strong><small class="mut">${dmy(d.from)} → ${dmy(d.to)}</small></div><div class="card as-kpi"><span>${bi("Tally mirror Receipt/Payment", "Tally mirror Receipt/Payment")}</span><strong>${money0(d.mirror_vouchers)}</strong></div>
        <div class="card as-kpi gr"><span>${bi("মিলেছে", "Matched")}</span><strong>${money0(d.matched_rows)}</strong><small class="mut">${tdPct(d.matched_rows, d.app_rows)}% ${bi("app সারির", "of app rows")}</small></div><div class="card as-kpi ${tot ? "am" : ""}"><span>${bi("ব্যতিক্রম", "Exceptions")}</span><strong>${money0(tot)}</strong><small class="mut">${money0(d.app_only)} ${bi("শুধু app", "app only")} · ${money0(d.mirror_only)} ${bi("শুধু mirror", "mirror only")} · ${money0(d.count_diff_groups)} ${bi("সংখ্যা অমিল", "count differs")}</small></div></div>
        <div class="card"><p class="mut sm" style="margin:0 0 8px">${bi(`মেলানোর নিয়ম: তারিখ + ধরন + পরিমাণ + লেজারের নাম। ভাউচার নম্বর ব্যবহার হয়নি, কারণ দুই উৎসের নম্বর আলাদা (নম্বর মিলেছে মাত্র ${money0(d.same_voucher_no)}টির)। কোনো ব্যতিক্রম নিজে থেকে ঠিক করা হয় না; Tally-তে কিছু লেখা হয় না।`, `Rule: date + type + amount + ledger name. Voucher numbers are not used because the two sources number differently (numbers agree for only ${money0(d.same_voucher_no)}). Nothing is corrected automatically and nothing is written to Tally.`)}</p>
        <div class="tw"><table class="td-t"><thead><tr><th>${bi("তারিখ", "Date")}</th><th>${bi("ধরন", "Type")}</th><th>${bi("ধরণ", "Kind")}</th><th>${bi("লেজার", "Ledger")}</th><th class="r">${bi("পরিমাণ", "Amount")}</th><th class="r">app</th><th class="r">mirror</th></tr></thead><tbody>${(d.rows || []).map(x => { const [l, c] = kindLab(x.kind); return `<tr><td class="sm">${dmy(x.d)}</td><td>${esc(x.t)}</td><td><span class="st ${c}">${l}</span></td><td class="td-pt">${esc(x.ledger || "—")}${x.vno ? `<div class="mut xs">#${esc(x.vno)}</div>` : ""}</td><td class="r num">${money0(x.amount)}</td><td class="r num">${money0(x.app_n)}</td><td class="r num">${money0(x.mirror_n)}</td></tr>`; }).join("") || `<tr><td colspan="7" class="mut">${bi("কোনো ব্যতিক্রম নেই", "No exceptions")}</td></tr>`}</tbody></table></div>
        <div class="td-pg"><button class="btn" type="button" id="tr-pv">‹ ${bi("আগে", "Prev")}</button><span class="mut sm">${tot ? `${money0(off + 1)}–${money0(Math.min(off + TD_PAGE, tot))} / ${money0(tot)}` : ""}</span><button class="btn" type="button" id="tr-nx">${bi("পরে", "Next")} ›</button></div></div>`;
      $("#tr-pv", cb).disabled = off <= 0; $("#tr-nx", cb).disabled = off + TD_PAGE >= tot; $("#tr-pv", cb).onclick = () => run(Math.max(0, off - TD_PAGE)); $("#tr-nx", cb).onclick = () => run(off + TD_PAGE); }
    async function run(o) { cb.innerHTML = `<div class="card"><div class="skel"></div></div>`; const r = await tdRpc("tally_recon_cash", args(o)); if (stale()) return; if (r.error) { cb.innerHTML = tdReconPanes.err(r); return; } off = o; data = r.data; draw(); }
    $("#tr-cf", box).onsubmit = e => { e.preventDefault(); st.company = $("#tr-co", box).value; st.from = $("#tr-fr", box).value; st.to = $("#tr-to", box).value; run(0); };
    $("#tr-xl", box).onclick = async () => { const all = []; try { for (let o = 0; o < 2000; o += 200) { const r = await tdRpc("tally_recon_cash", args(o, 200)); if (r.error) throw r.error; all.push(...(r.data.rows || [])); if (all.length >= (r.data.exceptions || 0)) break; }
      await exportXlsx({ Exceptions: [["Date", "Type", "Kind", "Ledger", "Voucher No (mirror)", "Amount", "App count", "Mirror count"], ...all.map(x => [x.d, x.t, x.kind, x.ledger || "", x.vno || "", Number(x.amount) || 0, x.app_n, x.mirror_n])] }, `tally_vs_cashbook_${tdDhaka()}.xlsx`); } catch (e) { toast(bi("এক্সপোর্ট করা যায়নি", "Export failed") + ": " + (e.message || e), "err"); } };
    await run(0);
  },
  async changes(box, stale) {
    if (DEMO) return tdDemoNote();
    const r = await tdRpc("tally_recon_changes", { p_limit: 200 }); if (stale()) return; if (r.error) return tdReconPanes.err(r);
    return `<div class="card"><h3 style="margin:0 0 8px">${bi("বাতিল ও মুছে ফেলা ভাউচার", "Cancelled and deleted vouchers")} (${money0(r.data.total)})</h3><div class="tw"><table class="td-t"><thead><tr><th>${bi("তারিখ", "Date")}</th><th>${bi("কোম্পানি", "Company")}</th><th>${bi("ধরন", "Type")}</th><th>${bi("নং", "No.")}</th><th class="r">${bi("পরিমাণ", "Amount")}</th><th>${bi("অবস্থা", "State")}</th><th>${bi("সিঙ্ক", "Synced")}</th></tr></thead><tbody>${(r.data.rows || []).map(x => `<tr><td class="sm">${dmy(x.vdate)}</td><td>${esc(x.company)}</td><td>${esc(x.vtype || "—")}</td><td>${esc(x.vno || "—")}</td><td class="r num">${money0(x.amount)}</td><td><span class="st ${x.deleted ? "rd" : "am"}">${x.deleted ? bi("মুছে ফেলা", "Deleted") : bi("বাতিল", "Cancelled")}</span></td><td class="sm">${tdTime(x.synced_at)}</td></tr>`).join("") || `<tr><td colspan="7" class="mut">${bi("কিছু নেই", "None")}</td></tr>`}</tbody></table></div><p class="mut xs" style="margin:10px 0 0">${bi("Tally-তে বাতিল/মুছে ফেলা ভাউচার এখানে চিহ্নিত থাকে, নিঃশব্দে সরানো হয় না।", "Source cancellations/deletions stay visible here; nothing is silently removed.")}</p></div>`;
  },
  async coverage(box, stale) {
    if (DEMO) return tdDemoNote();
    const r = await tdRpc("tally_recon_coverage", { p_gap_days: 7 }); if (stale()) return; if (r.error) return tdReconPanes.err(r);
    const d = r.data;
    return `<div class="card"><h3 style="margin:0 0 8px">${bi("কভারেজ", "Coverage")}</h3><div class="tw"><table class="td-t"><thead><tr><th>${bi("কোম্পানি", "Company")}</th><th>${bi("প্রথম", "First")}</th><th>${bi("শেষ", "Last")}</th><th class="r">${bi("ভাউচারসহ দিন", "Days with vouchers")}</th><th class="r">${bi("মোট দিন", "Span (days)")}</th><th class="r">${bi(`${d.gap_days}+ দিনের ফাঁক`, `${d.gap_days}+ day gaps`)}</th></tr></thead><tbody>${(d.companies || []).map(c => `<tr><td><b>${esc(c.company)}</b></td><td class="sm">${dmy(c.first_date)}</td><td class="sm">${dmy(c.last_date)}</td><td class="r num">${money0(c.days_with)}</td><td class="r num">${money0(c.span_days)}</td><td class="r num">${money0(c.gaps)}</td></tr>`).join("")}</tbody></table></div>
      ${(d.gaps || []).length ? `<h3 style="margin:14px 0 8px">${bi("সবচেয়ে বড় ফাঁক", "Longest gaps")}</h3><div class="tw"><table class="td-t"><thead><tr><th>${bi("কোম্পানি", "Company")}</th><th>${bi("থেকে", "From")}</th><th>${bi("পর্যন্ত", "To")}</th><th class="r">${bi("দিন", "Days")}</th></tr></thead><tbody>${d.gaps.map(g => `<tr><td>${esc(g.company)}</td><td class="sm">${dmy(g.gap_from)}</td><td class="sm">${dmy(g.gap_to)}</td><td class="r num">${money0(g.days)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <p class="mut xs" style="margin:10px 0 0">${bi("ফাঁক মানেই ডেটা হারানো নয় (ছুটি/লেনদেনহীন দিন হতে পারে); শেষ ভাউচারের তারিখ সিঙ্ক-কভারেজের প্রমাণ নয়। এটি পর্যালোচনার সূত্র মাত্র।", "A gap is not proof of missing data (holidays or quiet days); the latest voucher date is not proof of sync coverage. This is a lead for review only.")}</p></div>`;
  },
  async balance(box, stale) {
    if (DEMO) return tdDemoNote();
    box.innerHTML = `<div class="card"><p class="mut sm" style="margin:0 0 10px">${bi("প্রতিটি ভাউচারে ডেবিট = ক্রেডিট কি না যাচাই। কয়েক সেকেন্ড লাগতে পারে।", "Checks that debit = credit in every voucher. It can take a few seconds.")}</p><button class="btn pri" type="button" id="tb-run">${bi("যাচাই চালান", "Run check")}</button><div id="tb-out" style="margin-top:12px"></div></div>`;
    $("#tb-run", box).onclick = async () => { const o = $("#tb-out", box); o.innerHTML = `<div class="skel"></div>`; const r = await tdRpc("tally_balance_check", {}); if (stale()) return; if (r.error) { o.innerHTML = tdReconPanes.err(r); return; }
      o.innerHTML = `<div class="tw"><table class="td-t"><thead><tr><th>${bi("ধরন", "Type")}</th><th class="r">${bi("মোট", "Total")}</th><th class="r">${bi("সমান", "Balanced")}</th><th class="r">${bi("অসমান", "Unbalanced")}</th><th class="r">%</th></tr></thead><tbody>${(r.data.rows || []).map(x => `<tr><td>${esc(x.vtype || "—")}</td><td class="r num">${money0(x.total)}</td><td class="r num">${money0(x.balanced)}</td><td class="r num">${money0(x.unbalanced)}</td><td class="r num"><span class="st ${x.unbalanced ? "am" : "gr"}">${tdPct(x.balanced, x.total)}%</span></td></tr>`).join("")}</tbody></table></div><p class="mut xs" style="margin:10px 0 0">${tdTime(r.data.generated_at)} · ${bi("Sales/Purchase/Note-এ অসমান মানে sales/purchase লেজারের লাইন এখনো আসেনি (Bridge 1.2.1 ও full history load দরকার)।", "Unbalanced Sales/Purchase/Notes mean the sales/purchase ledger lines have not been mirrored yet (needs Bridge 1.2.1 and a full history load).")}</p>`; };
  },
  async pending() {
    const item = (t, why) => `<tr><td><b>${t}</b></td><td>${tdNA()}</td><td class="sm" style="white-space:normal">${why}</td></tr>`;
    return `<div class="card"><h3 style="margin:0 0 8px">${bi("এখনো সম্ভব নয়", "Not available yet")}</h3><div class="tw"><table class="td-t"><thead><tr><th>${bi("মডিউল", "Module")}</th><th>${bi("অবস্থা", "State")}</th><th>${bi("কারণ", "Why")}</th></tr></thead><tbody>
      ${item(bi("Tally বনাম Bank Closing", "Tally vs Bank Closing"), bi("ব্যাংক হিসাব ↔ Tally লেজার mapping ও ক্লোজিং ব্যালেন্সের জন্য opening balance দরকার।", "needs a bank account ↔ Tally ledger mapping and opening balances for closing balances."))}
      ${item(bi("Tally বনাম Cheque Register", "Tally vs Cheque Register"), bi("চেকের রেফারেন্স Tally-তে কোন ক্ষেত্রে থাকে তা নিশ্চিত নয়; নিয়ম ঠিক করা দরকার।", "which Tally field carries the cheque reference is not confirmed; a match rule must be agreed."))}
      ${item(bi("Tally বনাম Collection", "Tally vs Collection"), bi("পার্টি ↔ Tally লেজার নাম-মেলানো (dist_parties) এখনো হয়নি।", "party ↔ Tally ledger name mapping (dist_parties) has not been done."))}
      ${item(bi("Trial Balance / P&L / Balance Sheet / ageing", "Trial Balance / P&L / Balance Sheet / ageing"), bi("opening balance, লেজার গ্রুপ, bill-wise বরাদ্দ ও stock মূল্য Tally থেকে আসে না।", "opening balances, ledger groups, bill allocations and stock valuation are not mirrored."))}
      </tbody></table></div><p class="mut xs" style="margin:10px 0 0">${bi("কোনো আন্দাজ বা শূন্য দেখানো হয় না। প্রয়োজনীয় ডেটা/নিয়ম নিশ্চিত হলে এগুলো চালু হবে।", "No estimate or zero is shown. These switch on once the data and rules are confirmed.")}</p></div>`;
  }
};
