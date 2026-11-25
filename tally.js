/* NABIAD — TALLY DASHBOARD (v6.170) — admin only.
   Shows the state of the read-only TallyPrime → Supabase mirror (written by the NABIAD DATA BRIDGE desktop app).
   Loaded after app.js and inv.js; uses their helpers (head, bi, esc, ico, money0, dmy, toast, ROUTES, API, DEMO, sb).
   Data comes from one admin-only RPC (schema_tally_dashboard.sql). Nothing here writes to the database. */
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
  let gone = false;
  v.innerHTML = head(bi("ট্যালি ড্যাশবোর্ড", "Tally Dashboard"), `<button class="btn" type="button" id="td-refresh">${ico("refresh")} ${bi("রিফ্রেশ", "Refresh")}</button>`) +
    `<div id="td-out" aria-live="polite"></div>`;
  const out = $("#td-out", v);
  async function load() {
    out.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div><div class="skel" style="margin-top:12px"></div><div class="skel" style="margin-top:12px;width:70%"></div></div>`;
    let r;
    try { r = await tdLoad(); } catch (e) { r = { error: e }; }
    if (gone || !out.isConnected) return;
    if (r.error) { out.innerHTML = tdError(r); return; }
    out.innerHTML = tdView(r.data, r.demo);
  }
  $("#td-refresh", v).onclick = () => { load().then(() => { if (!gone) toast(bi("রিফ্রেশ হয়েছে", "Refreshed"), "info"); }); };
  await load();
  return () => { gone = true; };
}

function tdError(r) {
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
