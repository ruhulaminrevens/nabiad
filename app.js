/* Nabiad — Cheque & Bank Control  (single-page app, no build step) */
"use strict";
const CFG = window.NABIAD_CONFIG || {};
const DEMO = !CFG.SUPABASE_URL;
const STATUSES = ["Pending","Cleared","Bounced","Returned-Cash","Cancelled","Stopped"];
const PURPOSES = ["Cash Withdrawal (ক্যাশ উত্তোলন)","Own A/C Transfer (নিজ অ্যাকাউন্টে জমা)","Supplier Payment (সাপ্লায়ার পেমেন্ট)","Salary (বেতন)","Utility/Bills (বিদ্যুৎ/গ্যাস/বিল)","Rent (ভাড়া)","Loan/EMI (লোন কিস্তি)","LC/Import (এলসি)","Tax/VAT (ট্যাক্স/ভ্যাট)","Office Expense (অফিস খরচ)","Transport/Carriage (পরিবহন খরচ)","Advance (অগ্রিম)","Inter-company (সহযোগী প্রতিষ্ঠান)","Bank Charge (ব্যাংক চার্জ)","Zakat/Donation (যাকাত/দান)","Personal (বস/পরিবার)","Cancelled/Spoiled (বাতিল/নষ্ট পাতা)","Others (অন্যান্য)"];
const TAKERS = ["Foysal","Sourov","Sadik","Tushar","Sohan","Omi","Aslam","Boss","Others"];
const BN_M = ["জানু","ফেব্রু","মার্চ","এপ্রিল","মে","জুন","জুলাই","আগস্ট","সেপ্টে","অক্টো","নভে","ডিসে"];

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => (n === null || n === undefined || n === "" || isNaN(n)) ? "" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const money0 = n => (n === null || n === undefined || isNaN(n)) ? "0" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const dmy = s => s ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : "";
const dmy2 = s => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(2, 4)}` : "";
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
const num = v => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isNaN(n) ? 0 : n; };
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const purposeKey = p => { const s = String(p || "").toLowerCase(); return s.startsWith("cash") ? "cash" : s.startsWith("own") ? "own" : s.startsWith("cancel") ? "cancel" : s.startsWith("supplier") ? "supplier" : "other"; };
function toast(msg, kind = "ok") { const t = document.createElement("div"); t.className = "toast " + kind; t.innerHTML = `<i>${kind === "err" ? "!" : "✓"}</i><span></span>`; t.lastChild.textContent = tr(String(msg)).replace(/^✔\s*/, ""); $("#toasts").appendChild(t); setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, kind === "err" ? 6000 : 2800); }
const ask = m => confirm(tr(m));
function modal(html, onMount) {
  const root = $("#modal-root"); root.innerHTML = `<div class="mback"><div class="modal">${html}</div></div>`;
  const close = () => root.innerHTML = "";
  $(".mback", root).addEventListener("mousedown", e => { if (e.target.classList.contains("mback")) close(); });
  onMount && onMount(root, close); return close;
}
function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector(`script[data-s="${src}"]`)) return res(); const s = document.createElement("script"); s.src = src; s.dataset.s = src; s.onload = res; s.onerror = () => rej(new Error("Load failed: " + src)); document.head.appendChild(s); }); }
const ICON = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
  img: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  book: '<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM4 17a3 3 0 0 1 3-3h12"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  dl: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/>',
  save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 3v5h8M7 21v-7h10v7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  copyt: '<path d="M8 4h8M8 4a2 2 0 0 0-2 2v14h12V6a2 2 0 0 0-2-2M9 10h6M9 14h6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'
};
const ico = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;

/* ---------- state ---------- */
const S = { me: null, accounts: [], cheques: [], books: [], reminders: [], loaded: false, lastBal: null };
const accMap = () => Object.fromEntries(S.accounts.map(a => [a.code, a]));
function derive(c) {
  const k = purposeKey(c.purpose);
  let st = "Pending", sd = null;
  if (k === "cash" || k === "own") { st = "Cleared"; sd = c.date; } else if (k === "cancel") { st = "Cancelled"; sd = c.date; }
  const ev = c.events || [];
  if (ev.length) { const l = ev[ev.length - 1]; st = l.status; sd = l.status === "Pending" ? null : l.date; }
  c.status = st; c.sdate = sd; return c;
}
const isLive = c => !["Cancelled", "Bounced", "Stopped"].includes(c.status);

/* ---------- data layer: Supabase ---------- */
let sb = null;
async function fetchAll(table, order = "id") {
  let out = [], from = 0; const step = 1000;
  for (;;) {
    const { data, error } = await sb.from(table).select("*").order(order).range(from, from + step - 1);
    if (error) throw error; out = out.concat(data); if (data.length < step) break; from += step;
  }
  return out;
}
const SbAPI = {
  async init() { await loadScript("vendor/supabase.js"); sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); },
  async session() {
    const { data } = await sb.auth.getSession(); const u = data.session?.user;
    if (!u) { const c = readCache(); if (!navigator.onLine && c?.me) return c.me; return null; }
    const { data: p, error } = await sb.from("profiles").select("*").eq("id", u.id).maybeSingle();
    if (error && isNetErr(error)) { const c = readCache(); if (c?.me?.id === u.id) return c.me; }
    if (error || !p || !p.active) return null; return { id: u.id, email: p.email, name: p.name, role: p.role };
  },
  async login(email, pw) { const { error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error; return this.session(); },
  async logout() { await sb.auth.signOut(); },
  async loadAll() {
    const [acc, ch, ev, bk] = await Promise.all([fetchAll("accounts", "sort"), fetchAll("cheques", "created_at"), fetchAll("cheque_status", "created_at"), fetchAll("books", "code")]);
    const by = {}; ev.forEach(e => (by[e.cheque_id] ||= []).push({ id: e.id, status: e.new_status, date: e.status_date, remarks: e.remarks, by: e.entered_by, at: e.created_at }));
    return {
      accounts: acc, books: bk.map(b => ({ id: b.id, code: b.code, series: b.series, first: Number(b.first_leaf), last: b.last_leaf == null ? null : Number(b.last_leaf), track: b.track_from == null ? null : Number(b.track_from), status: b.status, note: b.note })),
      cheques: ch.map(r => ({ id: r.id, date: r.chq_date, code: r.code, no: Number(r.chq_no), amount: Number(r.amount), purpose: r.purpose, taker: r.cash_taker, party: r.party, toac: r.to_ac, remarks: r.remarks, photo: r.photo || null, by: r.entered_by, at: r.created_at, events: by[r.id] || [] }))
    };
  },
  async addCheque(c) {
    const row = { id: c.id || crypto.randomUUID(), chq_date: c.date, code: c.code, chq_no: c.no, amount: c.amount, purpose: c.purpose, cash_taker: c.taker || null, party: c.party || null, to_ac: c.toac || null, remarks: c.remarks || null, entered_by: S.me.name };
    if (c.photo) row.photo = c.photo;
    const local = () => ({ id: row.id, date: c.date, code: c.code, no: c.no, amount: c.amount, purpose: c.purpose, taker: row.cash_taker, party: row.party, toac: row.to_ac, remarks: row.remarks, by: S.me.name, at: new Date().toISOString(), events: [], pending: true });
    if (!navigator.onLine) { Outbox.add("cheque", row); return local(); }
    const { data, error } = await sb.from("cheques").insert(row).select().single();
    if (error && isNetErr(error)) { Outbox.add("cheque", row); return local(); }
    if (error) { if (error.code === "23505") throw new Error("এই চেক নম্বর এই অ্যাকাউন্টে আগেই এন্ট্রি আছে"); throw error; }
    return { id: data.id, date: data.chq_date, code: data.code, no: Number(data.chq_no), amount: Number(data.amount), purpose: data.purpose, taker: data.cash_taker, party: data.party, toac: data.to_ac, remarks: data.remarks, photo: data.photo || null, by: data.entered_by, at: data.created_at, events: [] };
  },
  async addStatus(chequeId, status, date, remarks) {
    const row = { id: crypto.randomUUID(), cheque_id: chequeId, new_status: status, status_date: date, remarks: remarks || null, entered_by: S.me.name };
    const local = () => ({ id: row.id, status, date, remarks: row.remarks, by: S.me.name, at: new Date().toISOString(), pending: true });
    if (!navigator.onLine || Outbox.has(chequeId)) { Outbox.add("status", row); return local(); }
    const { data, error } = await sb.from("cheque_status").insert(row).select().single();
    if (error && isNetErr(error)) { Outbox.add("status", row); return local(); }
    if (error) throw error; return { id: data.id, status: data.new_status, date: data.status_date, remarks: data.remarks, by: data.entered_by, at: data.created_at };
  },
  async updateCheque(id, p) {
    const m = { date: "chq_date", code: "code", no: "chq_no", amount: "amount", purpose: "purpose", taker: "cash_taker", party: "party", toac: "to_ac", remarks: "remarks" }; const row = {};
    for (const k in p) row[m[k]] = p[k] === "" ? null : p[k];
    const { error } = await sb.from("cheques").update(row).eq("id", id); if (error) throw error;
  },
  async deleteCheque(id) { const { error } = await sb.from("cheques").delete().eq("id", id); if (error) throw error; },
  async deleteStatus(id) { const { error } = await sb.from("cheque_status").delete().eq("id", id); if (error) throw error; },
  async lastBalDate() { const { data } = await sb.from("balances").select("date").order("date", { ascending: false }).limit(1); return data?.[0]?.date || null; },
  async balancesOn(d) { const { data, error } = await sb.from("balances").select("*").eq("date", d).limit(2000); if (error) throw error; return Object.fromEntries(data.map(r => [r.code, { total: r.total == null ? null : Number(r.total), block: r.block == null ? null : Number(r.block), remark: r.remark, od: r.other_debit, odp: r.other_deposit, by: r.entered_by }])); },
  async prevBalances(d) {
    const { data } = await sb.from("balances").select("date").lt("date", d).order("date", { ascending: false }).limit(1);
    if (!data?.length) return { date: null, map: {} }; return { date: data[0].date, map: await this.balancesOn(data[0].date) };
  },
  async saveBalances(d, rows, overwrite) {
    const payload = rows.map(r => ({ date: d, code: r.code, total: r.total, block: r.block, remark: r.remark || null, other_debit: r.od || null, other_deposit: r.odp || null, entered_by: S.me.name }));
    balCache.delete(d);
    if (!navigator.onLine && !overwrite) { Outbox.add("bal", payload); return; }
    const q = overwrite ? sb.from("balances").upsert(payload, { onConflict: "date,code" }) : sb.from("balances").insert(payload);
    const { error } = await q; if (error && isNetErr(error) && !overwrite) { Outbox.add("bal", payload); return; }
    if (error) { if (error.code === "23505") throw new Error("এই তারিখের ব্যালেন্স আগেই সেভ করা আছে — শুধু Admin বদলাতে পারবে"); throw error; }
  },
  async history(code, from, to) { const { data, error } = await sb.from("balances").select("date,total,block,remark").eq("code", code).gte("date", from).lte("date", to).order("date"); if (error) throw error; return data.map(r => ({ date: r.date, total: Number(r.total), block: r.block == null ? null : Number(r.block), remark: r.remark })); },
  async balanceCount() { const { count } = await sb.from("balances").select("date", { count: "exact", head: true }); return count || 0; },
  async importBalances(rows, onProg) {
    for (let i = 0; i < rows.length; i += 1000) {
      const part = rows.slice(i, i + 1000).map(r => ({ date: r[0], code: r[1], total: r[2], block: r[3], remark: r[4], entered_by: "Old file (Foysal)" }));
      const { error } = await sb.from("balances").upsert(part, { onConflict: "date,code" }); if (error) throw error; onProg && onProg(Math.min(i + 1000, rows.length), rows.length);
    }
  },
  async upsertAccount(a) { const { error } = await sb.from("accounts").upsert(a, { onConflict: "code" }); if (error) throw error; },
  async upsertBook(b) {
    const row = { code: b.code, series: b.series || null, first_leaf: b.first, last_leaf: b.last, track_from: b.track, status: b.status, note: b.note || null }; if (b.id) row.id = b.id;
    const { data, error } = await sb.from("books").upsert(row).select().single(); if (error) throw error; return data.id;
  },
  async deleteBook(id) { const { error } = await sb.from("books").delete().eq("id", id); if (error) throw error; },
  async dataKey() { const { data, error } = await sb.from("app_secrets").select("v").eq("k", "data_key").maybeSingle(); if (error || !data) throw new Error("ডাটা কী পাওয়া যায়নি"); return data.v; },
  async users() { const { data, error } = await sb.from("profiles").select("*").order("role"); if (error) throw error; return data; },
  async updateProfile(id, p) { const { error } = await sb.from("profiles").update(p).eq("id", id); if (error) throw error; },
  /* v2: drafts, reminders, audit log, cheque photos (need schema_v2.sql) */
  async getDraft(d) { const { data, error } = await sb.from("balance_drafts").select("*").eq("date", d).maybeSingle(); if (error) throw error; return data ? { rows: data.data, at: data.updated_at, by: data.updated_by } : null; },
  async saveDraft(d, rows) { const { error } = await sb.from("balance_drafts").upsert({ date: d, data: rows, updated_by: S.me.name, updated_at: new Date().toISOString() }); if (error) throw error; },
  async deleteDraft(d) { const { error } = await sb.from("balance_drafts").delete().eq("date", d); if (error) throw error; },
  async reminders() { const since = new Date(Date.now() - 30 * 864e5).toISOString(); const { data, error } = await sb.from("reminders").select("*").or(`done.eq.false,done_at.gte.${since}`).order("due_at").limit(1000); if (error) throw error; return data; },
  async addReminder(r) { const row = { id: crypto.randomUUID(), title: r.title, note: r.note || null, due_at: r.due_at, repeat: r.repeat || "none", for_role: r.for_role || "me", kind: r.kind || "custom", cheque_id: r.cheque_id || null, created_by: S.me.name }; const { data, error } = await sb.from("reminders").insert(row).select().single(); if (error) throw error; return data; },
  async updateReminder(id, p) { const { error } = await sb.from("reminders").update(p).eq("id", id); if (error) throw error; },
  async deleteReminder(id) { const { error } = await sb.from("reminders").delete().eq("id", id); if (error) throw error; },
  async audit(f) { let q = sb.from("audit_log").select("*").order("at", { ascending: false }).limit(500); if (f.tbl) q = q.eq("tbl", f.tbl); if (f.act) q = q.eq("action", f.act); if (f.from) q = q.gte("at", new Date(f.from + "T00:00:00").toISOString()); if (f.to) q = q.lt("at", new Date(addDays(f.to, 1) + "T00:00:00").toISOString()); const { data, error } = await q; if (error) throw error; return data; },
  async uploadPhoto(path, blob) { const { error } = await sb.storage.from("cheque-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false }); if (error) throw error; },
  async photoUrl(path) { const { data, error } = await sb.storage.from("cheque-photos").createSignedUrl(path, 3600); if (error) throw error; return data.signedUrl; },
  async setPhoto(id, path) { const { error } = await sb.rpc("set_cheque_photo", { cid: id, p: path }); if (error) throw error; }
};

/* ---------- data layer: Demo (in-memory + localStorage) ---------- */
const DEMO_KEY = "nabiad_demo_v1";
let demoHist = null, demoStore = null;
const DemoAPI = {
  async init() {
    demoStore = JSON.parse(localStorage.getItem(DEMO_KEY) || "null") || { cheques: [], events: [], balances: {}, books: [], accounts: null };
    demoStore.drafts ||= {}; demoStore.reminders ||= []; demoStore.audit ||= []; demoStore.photos ||= {};
    S.demoAccounts = await (await fetch("dev/accounts.json")).json();
    if (!demoStore.accounts) demoStore.accounts = S.demoAccounts;
  },
  save() { localStorage.setItem(DEMO_KEY, JSON.stringify(demoStore)); },
  async session() { const s = sessionStorage.getItem("nabiad_demo_user"); return s ? JSON.parse(s) : null; },
  async login(role, name) { const u = { id: "demo-" + role, email: role + "@demo", name, role }; sessionStorage.setItem("nabiad_demo_user", JSON.stringify(u)); return u; },
  async logout() { sessionStorage.removeItem("nabiad_demo_user"); },
  async loadAll() {
    const ev = {}; demoStore.events.forEach(e => (ev[e.cheque_id] ||= []).push(e));
    return { accounts: demoStore.accounts, books: demoStore.books, cheques: demoStore.cheques.map(c => ({ ...c, events: ev[c.id] || [] })) };
  },
  async addCheque(c) {
    if (demoStore.cheques.some(x => x.code === c.code && x.no === c.no)) throw new Error("এই চেক নম্বর এই অ্যাকাউন্টে আগেই এন্ট্রি আছে");
    const row = { ...c, id: crypto.randomUUID(), by: S.me.name, at: new Date().toISOString() }; demoStore.cheques.push(row); this.save(); return { ...row, events: [] };
  },
  async addStatus(chequeId, status, date, remarks) { const e = { id: crypto.randomUUID(), cheque_id: chequeId, status, date, remarks, by: S.me.name, at: new Date().toISOString() }; demoStore.events.push(e); this.save(); return e; },
  async updateCheque(id, p) { const c = demoStore.cheques.find(c => c.id === id); this.aud("cheques", "update", `${c.code} · ${c.no}`, { ...c }, { ...c, ...p }); Object.assign(c, p); this.save(); },
  async deleteCheque(id) { const c = demoStore.cheques.find(c => c.id === id); c && this.aud("cheques", "delete", `${c.code} · ${c.no}`, c, null); demoStore.cheques = demoStore.cheques.filter(c => c.id !== id); demoStore.events = demoStore.events.filter(e => e.cheque_id !== id); this.save(); },
  async deleteStatus(id) { demoStore.events = demoStore.events.filter(e => e.id !== id); this.save(); },
  async hist() {
    if (!demoHist) {
      demoHist = new Map(); const rows = await (await fetch("dev/history.json")).json();
      for (const r of rows) { let m = demoHist.get(r[0]); if (!m) demoHist.set(r[0], m = {}); m[r[1]] = { total: r[2], block: r[3], remark: r[4] }; }
      for (const k in demoStore.balances) { const [d, code] = k.split("|"); let m = demoHist.get(d); if (!m) demoHist.set(d, m = {}); m[code] = demoStore.balances[k]; }
    } return demoHist;
  },
  async lastBalDate() { const h = await this.hist(); return [...h.keys()].sort().pop() || null; },
  async balancesOn(d) { const h = await this.hist(); return h.get(d) || {}; },
  async prevBalances(d) { const h = await this.hist(); const ks = [...h.keys()].filter(k => k < d).sort(); const k = ks.pop(); return k ? { date: k, map: h.get(k) } : { date: null, map: {} }; },
  async saveBalances(d, rows, overwrite) {
    const h = await this.hist(); if (h.has(d) && !overwrite && Object.keys(h.get(d)).length) throw new Error("এই তারিখের ব্যালেন্স আগেই সেভ করা আছে — শুধু Admin বদলাতে পারবে");
    if (overwrite) rows.forEach(r => { const o = h.get(d)?.[r.code]; if (o && (o.total !== r.total || (o.block || 0) !== (r.block || 0))) this.aud("balances", "update", `${d} · ${r.code}`, { total: o.total, block: o.block }, { total: r.total, block: r.block }); });
    const m = {}; rows.forEach(r => { m[r.code] = { total: r.total, block: r.block, remark: r.remark, od: r.od, odp: r.odp, by: S.me.name }; demoStore.balances[d + "|" + r.code] = m[r.code]; }); h.set(d, { ...(h.get(d) || {}), ...m }); this.save();
  },
  async history(code, from, to) { const h = await this.hist(); const out = []; for (const [d, m] of [...h.entries()].sort()) if (d >= from && d <= to && m[code]) out.push({ date: d, total: m[code].total, block: m[code].block, remark: m[code].remark }); return out; },
  async balanceCount() { const h = await this.hist(); let n = 0; h.forEach(m => n += Object.keys(m).length); return n; },
  async importBalances() { }, 
  async upsertAccount(a) { const i = demoStore.accounts.findIndex(x => x.code === a.code); if (i >= 0) demoStore.accounts[i] = { ...demoStore.accounts[i], ...a }; else demoStore.accounts.push(a); this.save(); },
  async upsertBook(b) { if (b.id) { Object.assign(demoStore.books.find(x => x.id === b.id), b); } else { b.id = crypto.randomUUID(); demoStore.books.push(b); } this.save(); return b.id; },
  async deleteBook(id) { demoStore.books = demoStore.books.filter(b => b.id !== id); this.save(); },
  async users() { return [{ id: "1", email: "admin@demo", name: "Admin", role: "admin", active: true }]; },
  async updateProfile() { },
  aud(tbl, action, key, o, n) { demoStore.audit.unshift({ id: Date.now() + Math.random(), at: new Date().toISOString(), user_name: S.me?.name, tbl, action, row_key: key, old: o || null, new: n || null }); demoStore.audit.length > 2000 && (demoStore.audit.length = 2000); },
  async getDraft(d) { return demoStore.drafts[d] || null; },
  async saveDraft(d, rows) { demoStore.drafts[d] = { rows, at: new Date().toISOString(), by: S.me.name }; this.save(); },
  async deleteDraft(d) { delete demoStore.drafts[d]; this.save(); },
  async reminders() { return demoStore.reminders.map(r => ({ ...r })); },
  async addReminder(r) { const row = { id: crypto.randomUUID(), ...r, created_by: S.me.name, done: false, created_at: new Date().toISOString() }; demoStore.reminders.push(row); this.save(); return { ...row }; },
  async updateReminder(id, p) { Object.assign(demoStore.reminders.find(r => r.id === id) || {}, p); this.save(); },
  async deleteReminder(id) { demoStore.reminders = demoStore.reminders.filter(r => r.id !== id); this.save(); },
  async audit(f) { return demoStore.audit.filter(r => (!f.tbl || r.tbl === f.tbl) && (!f.act || r.action === f.act) && (!f.from || r.at.slice(0, 10) >= f.from) && (!f.to || r.at.slice(0, 10) <= f.to)).slice(0, 500); },
  async uploadPhoto(path, blob) { demoStore.photos[path] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); }); this.save(); },
  async photoUrl(path) { return demoStore.photos[path] || ""; },
  async setPhoto(id, path) { const c = demoStore.cheques.find(c => c.id === id); this.aud("cheques", "update", `${c.code} · ${c.no}`, { photo: c.photo || null }, { photo: path }); c.photo = path; this.save(); }
};
const API = DEMO ? DemoAPI : SbAPI;

/* local cache: app opens instantly with last known data, then refreshes in background */
const CACHE_KEY = "nabiad_cache_v2";
function saveCache() { if (DEMO) return; try { const old = readCache() || {}; localStorage.setItem(CACHE_KEY, JSON.stringify({ u: S.me?.id, me: S.me, t: Date.now(), accounts: S.accounts, books: S.books, cheques: S.cheques.filter(c => !c.pending), reminders: S.reminders, lastBal: S.lastBal, lastCash: S.lastCash, snap: S.snap || old.snap || null })); } catch { } }
function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; } }
const isNetErr = e => !navigator.onLine || /fetch|network|load failed|timed? ?out|ERR_/i.test(String(e?.message || e || ""));

/* ---------- offline outbox: entries made without internet are kept here and synced automatically ---------- */
const OB_KEY = "nabiad_outbox_v1";
const Outbox = {
  list() { try { return JSON.parse(localStorage.getItem(OB_KEY) || "[]"); } catch { return []; } },
  save(a) { localStorage.setItem(OB_KEY, JSON.stringify(a)); syncBadge(); },
  add(kind, payload) { const a = this.list(); a.push({ k: kind, p: payload, at: Date.now(), u: S.me?.id }); this.save(a); },
  has(chequeId) { return this.list().some(x => x.k === "cheque" && x.p.id === chequeId); },
  count() { return this.list().length; },
  busy: false,
  async flush() {
    if (DEMO || this.busy || !navigator.onLine || !sb) return;
    let a = this.list(); if (!a.length) return syncBadge();
    this.busy = true; syncBadge(); let done = 0, dropped = [];
    try { await sb.auth.getSession(); } catch { }
    try {
      while (a.length) {
        const it = a[0], tbl = { cheque: "cheques", status: "cheque_status", bal: "balances" }[it.k];
        const { error } = await sb.from(tbl).insert(it.p);
        if (error && isNetErr(error)) break;
        if (error && error.code !== "23505" && !/foreign key/i.test(error.message)) { if (/JWT|auth|permission|policy/i.test(error.message)) break; dropped.push(`${it.k}: ${error.message}`); }
        else if (error) {
          if (it.k === "cheque") { dropped.push(`${it.p.code} · ${it.p.chq_no} — আগেই অন্য কেউ এন্ট্রি করেছে`); a = a.filter((x, i) => i === 0 || !(x.k === "status" && x.p.cheque_id === it.p.id)); }
          else if (it.k === "bal") dropped.push(`${it.p[0]?.date} ব্যালেন্স — আগেই সেভ করা আছে`);
        } else done++;
        a.shift(); this.save(a);
      }
    } finally { this.busy = false; syncBadge(); }
    if (done) { toast(`✔ ${done}টি অফলাইন এন্ট্রি সিঙ্ক হয়েছে`); balCache.clear(); try { await reload(); refreshBadges(); if (CUR !== "closing") route(); } catch { } }
    dropped.forEach(m => toast("সিঙ্ক হয়নি: " + m, "err"));
  }
};
function syncBadge() {
  const el = $("#sync"); if (!el) return; const n = Outbox.count(), on = navigator.onLine;
  el.className = "sync " + (!on ? "off" : n ? "wait" : "ok");
  el.innerHTML = `<i></i><span>${!on ? "অফলাইন" : Outbox.busy ? "সিঙ্ক হচ্ছে…" : n ? "সিঙ্ক বাকি" : "অনলাইন"}${n ? ` · ${n}` : ""}</span>`;
  el.title = !on ? "ইন্টারনেট নেই — এন্ট্রি এই ডিভাইসে জমা থাকবে, নেট এলে নিজে থেকে সিঙ্ক হবে" : n ? `${n}টি এন্ট্রি সার্ভারে যাওয়া বাকি — চাপলে এখনই সিঙ্ক` : "সব ডাটা সার্ভারে সেভ আছে";
}
window.addEventListener("online", () => { syncBadge(); toast("ইন্টারনেট ফিরে এসেছে — সিঙ্ক হচ্ছে"); Outbox.flush(); });
window.addEventListener("offline", () => { syncBadge(); toast("ইন্টারনেট নেই — অফলাইনে এন্ট্রি চালিয়ে যান, পরে নিজে সিঙ্ক হবে", "err"); });
setInterval(() => { if (Outbox.count()) Outbox.flush(); }, 20000);
function mergeOutbox() {
  const ob = Outbox.list().filter(x => x.u === S.me?.id); const ids = new Set(S.cheques.map(c => c.id));
  ob.filter(x => x.k === "cheque" && !ids.has(x.p.id)).forEach(x => { const r = x.p; S.cheques.push(derive({ id: r.id, date: r.chq_date, code: r.code, no: Number(r.chq_no), amount: Number(r.amount), purpose: r.purpose, taker: r.cash_taker, party: r.party, toac: r.to_ac, remarks: r.remarks, by: r.entered_by, at: new Date(x.at).toISOString(), events: [], pending: true })); });
  ob.filter(x => x.k === "status").forEach(x => { const c = S.cheques.find(c => c.id === x.p.cheque_id); if (c && !c.events.some(e => e.id === x.p.id)) { c.events.push({ id: x.p.id, status: x.p.new_status, date: x.p.status_date, remarks: x.p.remarks, by: x.p.entered_by, at: new Date(x.at).toISOString(), pending: true }); derive(c); } });
}
function pendingBal(d) { const m = {}; Outbox.list().filter(x => x.k === "bal" && x.p[0]?.date === d).forEach(x => x.p.forEach(r => m[r.code] = { total: r.total, block: r.block, remark: r.remark, od: r.other_debit, odp: r.other_deposit, by: r.entered_by, pending: true })); return m; }
function pendingBalDates() { return Outbox.list().filter(x => x.k === "bal").map(x => x.p[0]?.date).filter(Boolean); }
function loadCache() { if (DEMO) return false; try { const c = readCache(); if (!c || c.u !== S.me?.id) return false; S.accounts = c.accounts; S.books = c.books; S.cheques = c.cheques.map(derive); S.reminders = c.reminders || []; S.lastBal = c.lastBal; S.lastCash = c.lastCash || null; S.snap = c.snap; S.loaded = true; mergeOutbox(); const pd = pendingBalDates().sort().pop(); if (pd && (!S.lastBal || pd > S.lastBal)) S.lastBal = pd; return true; } catch { return false; } }
const balCache = new Map();
async function balancesOn(d) {
  const pb = pendingBal(d);
  if (!navigator.onLine && !DEMO) return Object.keys(pb).length ? pb : (S.snap?.date === d ? S.snap.map : {});
  if (!balCache.has(d)) balCache.set(d, API.balancesOn(d).then(m => { if (!DEMO && d === S.lastBal) { S.snap = { date: d, map: m }; saveCache(); } return m; }).catch(e => { balCache.delete(d); throw e; }));
  const m = await balCache.get(d); return Object.keys(pb).length ? { ...m, ...pb } : m;
}
async function reload() {
  const [d, lb, lc, rm] = await Promise.all([API.loadAll(), API.lastBalDate(), API.lastCashDate().then(x => { S.cashOff = false; return x; }).catch(() => { S.cashOff = true; return S.lastCash || null; }), API.reminders().then(x => { S.remErr = null; return x; }).catch(e => { S.remErr = e.message || String(e); return null; })]);
  if (rm) S.reminders = rm; S.lastCash = lc;
  S.accounts = d.accounts; S.books = d.books; S.cheques = d.cheques.map(derive); S.lastBal = lb; S.loaded = true; saveCache(); setTimeout(() => typeof remTick === "function" && remTick(), 50);
  if (!DEMO) { mergeOutbox(); const pd = pendingBalDates().sort().pop(); if (pd && (!S.lastBal || pd > S.lastBal)) S.lastBal = pd; if (S.lastBal && S.snap?.date !== S.lastBal) balancesOn(S.lastBal).catch(() => { }); }
}

/* encrypted data files (repo is public; key lives in the database, readable only by signed-in users) */
async function loadEncrypted(path) {
  const keyB64 = await API.dataKey(); const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const buf = new Uint8Array(await (await fetch(path, { cache: "no-store" })).arrayBuffer());
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
}

/* ---------- derived stats ---------- */
function bookStats(b) {
  const start = b.track ?? b.first, end = b.last ?? Infinity;
  const used = new Set(), nos = [];
  S.cheques.forEach(c => { if (c.code === b.code && c.no >= start && c.no <= end) { used.add(c.no); nos.push(c.no); } });
  const maxUsed = nos.length ? Math.max(...nos) : null;
  const missing = []; if (maxUsed !== null && maxUsed - start < 5000) for (let n = start; n <= maxUsed; n++) if (!used.has(n)) missing.push(n);
  return { start, end, used: used.size, maxUsed, missing, remaining: b.last != null ? b.last - (maxUsed ?? start - 1) : null };
}
const allMissing = () => S.books.filter(b => b.status === "Active").map(b => ({ b, st: bookStats(b) })).filter(x => x.st.missing.length);
const nextNo = code => { const n = S.cheques.filter(c => c.code === code).map(c => c.no); return n.length ? Math.max(...n) + 1 : ""; };
const pendingOld = () => S.cheques.filter(c => c.status === "Pending" && daysBetween(c.date, today()) > (CFG.PENDING_ALERT_DAYS ?? 3));
const activeAccounts = () => S.accounts.filter(a => a.status === "Active");
const sumAmt = a => a.reduce((s, c) => s + c.amount, 0);

/* ---------- searchable combobox ---------- */
function suggest(input, getItems, onPick) {
  const wrap = input.parentElement; wrap.classList.add("suggest");
  const list = document.createElement("div"); list.className = "sg-list hide"; wrap.appendChild(list);
  let items = [], idx = 0, picked = null;
  const render = () => {
    const q = norm(input.value);
    items = getItems().map(it => ({ it, s: norm(it.value + " " + it.label + " " + (it.sub || "")) })).filter(x => !q || x.s.includes(q))
      .sort((a, b) => (norm(a.it.value).startsWith(q) ? 0 : 1) - (norm(b.it.value).startsWith(q) ? 0 : 1)).slice(0, 40).map(x => x.it);
    idx = 0; list.innerHTML = items.map((it, i) => `<div data-i="${i}" class="${i === 0 ? "on" : ""}"><span><b>${esc(it.value)}</b> ${esc(it.label)}</span><small>${esc(it.sub || "")}</small></div>`).join("") || `<div class="mut">কিছু পাওয়া যায়নি</div>`;
    list.classList.toggle("hide", !items.length && !input.value);
  };
  const pick = it => { picked = it; input.value = `${it.value} (${it.label})`; list.classList.add("hide"); onPick && onPick(it); };
  input.addEventListener("input", () => { picked = null; onPick && onPick(null); render(); });
  input.addEventListener("focus", () => { input.select(); render(); });
  input.addEventListener("keydown", e => {
    if (list.classList.contains("hide") && ["ArrowDown", "ArrowUp"].includes(e.key)) render();
    if (e.key === "ArrowDown") { idx = Math.min(idx + 1, items.length - 1); e.preventDefault(); } else if (e.key === "ArrowUp") { idx = Math.max(idx - 1, 0); e.preventDefault(); }
    else if (e.key === "Enter" || e.key === "Tab") {
      const exact = items.find(it => norm(it.value) === norm(input.value));
      if (!picked && (exact || items.length) && !list.classList.contains("hide")) { pick(exact || items[idx]); if (e.key === "Enter") { e.preventDefault(); input.dispatchEvent(new CustomEvent("picked")); } }
      else if (picked && e.key === "Enter") { e.preventDefault(); input.dispatchEvent(new CustomEvent("picked")); }
      return;
    } else if (e.key === "Escape") { list.classList.add("hide"); return; } else return;
    $$("div", list).forEach((d, i) => d.classList.toggle("on", i === idx)); $$("div", list)[idx]?.scrollIntoView({ block: "nearest" });
  });
  list.addEventListener("mousedown", e => { const d = e.target.closest("[data-i]"); if (d) { e.preventDefault(); pick(items[+d.dataset.i]); input.dispatchEvent(new CustomEvent("picked")); } });
  input.addEventListener("blur", () => setTimeout(() => list.classList.add("hide"), 120));
  return { get: () => picked, set: it => { if (it) pick(it); else { picked = null; input.value = ""; } }, setSilent: it => { picked = it; input.value = it ? `${it.value} (${it.label})` : ""; } };
}
const acItems = (all = false) => (all ? S.accounts : activeAccounts()).map(a => ({ value: a.code, label: a.holder || "", sub: a.bank || "" }));

/* ---------- shell / router ---------- */
const ROUTES = {
  dash: { t: "ড্যাশবোর্ড", ic: "home", roles: "asb", sec: "top", f: () => vDash },
  entry: { t: "চেক এন্ট্রি", ic: "plus", roles: "as", sec: "main", f: () => vEntry },
  status: { t: "স্ট্যাটাস", ic: "flag", roles: "as", sec: "main", f: () => vStatus },
  cheques: { t: "চেক তালিকা", ic: "list", roles: "asb", sec: "main", f: () => vCheques },
  closing: { t: "দৈনিক ক্লোজিং", ic: "bank", roles: "as", sec: "bank", f: () => vClosing },
  crep: { t: "ব্যালেন্স রিপোর্ট", ic: "img", roles: "asb", sec: "bank", f: () => vCrep },
  reports: { t: "রিপোর্ট", ic: "chart", roles: "asb", sec: "bank", f: () => vReports },
  cash: { t: "দৈনিক ক্যাশ রেকর্ড", ic: "wallet", roles: "as", sec: "cash", f: () => vCash },
  cashsum: { t: "ক্যাশ সামারি", ic: "clock", roles: "asb", sec: "cash", f: () => vCashSum },
  cashrep: { t: "ক্যাশ রিপোর্ট", ic: "chart", roles: "asb", sec: "cash", f: () => vCashRep },
  books: { t: "চেক বই", ic: "book", roles: "asb", sec: "more", f: () => vBooks },
  accounts: { t: "অ্যাকাউন্ট খুঁজুন", ic: "card", roles: "asb", sec: "more", f: () => vAccounts },
  register: { t: "ক্যাশ রেজিস্টার", ic: "list", roles: "asb", sec: "more", f: () => vRegister },
  rem: { t: "রিমাইন্ডার", ic: "bell", roles: "asb", sec: "more", f: () => vRem },
  settings: { t: "সেটিংস", ic: "gear", roles: "asb", sec: "more", f: () => vSettings },
  audit: { t: "Audit ও Security", ic: "shield", roles: "ab", sec: "more", f: () => vSecurity },
  admin: { t: "অ্যাডমিন", ic: "gear", roles: "a", sec: "more", f: () => vAdmin }
};
const SECS = { top: "", main: "চেক", bank: "ব্যাংক", cash: "ক্যাশ", more: "অন্যান্য" };
const roleKey = () => ({ admin: "a", staff: "s", boss: "b" }[S.me.role]);
const allowed = () => Object.keys(ROUTES).filter(k => ROUTES[k].roles.includes(roleKey()));
let cleanup = null;
const getTheme = () => document.documentElement.dataset.theme || "light";
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("nabiad_theme", t); } catch { } $$(".th-ic").forEach(e => e.innerHTML = ico(t === "dark" ? "sun" : "moon")); }
function badges() { return { status: pendingOld().length, books: allMissing().length, rem: typeof dueList === "function" ? dueList().length : 0 }; }
function shell() {
  const keys = allowed(), bd = badges();
  const link = k => { const r = ROUTES[k]; const n = bd[k]; return `<a href="#/${k}" data-k="${k}">${ico(r.ic)}<span>${r.t}</span>${n ? `<span class="badge">${n}</span>` : ""}</a>`; };
  let nav = "", last = "";
  keys.forEach(k => { if (ROUTES[k].sec !== last) { last = ROUTES[k].sec; if (SECS[last]) nav += `<div class="sec">${SECS[last]}</div>`; } nav += link(k); });
  const mob = (S.me.role === "boss" ? ["dash", "crep", "cashsum", "reports"] : ["dash", "entry", "closing", "cash"]).filter(k => keys.includes(k));
  const ini = (S.me.name || "?").trim().slice(0, 1).toUpperCase();
  $("#app").innerHTML = `<div class="shell">
    <aside class="side"><div class="brand"><div class="logo"><img src="icon.svg" alt="Nabiad"></div><div><b>NABIAD</b><span>Cheque &amp; Bank Control</span></div></div>
      <nav class="nav">${nav}</nav>
      <div class="me"><div class="ava">${esc(ini)}</div><div class="who"><b>${esc(S.me.name)}</b><span class="mut">${esc(S.me.email)}</span></div><button class="iconbtn" id="logout" title="লগআউট">${ico("out")}</button></div></aside>
    <div class="mainwrap">
      <header class="topbar"><div class="tb-brand"><div class="logo" style="width:30px;height:30px"><img src="icon.svg" alt="Nabiad"></div>NABIAD</div><div class="crumb" id="crumb"></div><div class="sp"></div>
        <button class="searchbtn" id="qs">${ico("search").replace("<svg", '<svg width="16" height="16"')}<span class="lbl">চেক / অ্যাকাউন্ট খুঁজুন…</span><kbd>Ctrl K</kbd></button>
        <button class="iconbtn bell" id="bell" title="রিমাইন্ডার ও সতর্কতা">${ico("bell")}<span class="bb"></span></button>${DEMO ? "" : `<button class="sync" id="sync"></button>`}${langToggle()}<button class="iconbtn th-ic" id="theme" title="থিম">${ico(getTheme() === "dark" ? "sun" : "moon")}</button>
        <span class="pill" style="align-self:center">${esc(S.me.role)}${DEMO ? " · demo" : ""}</span></header>
      <main class="main"><div id="view"></div></main></div></div>
    <nav class="mnav">${mob.map(k => `<a href="#/${k}" data-k="${k}">${ico(ROUTES[k].ic)}<span>${{ dash: "হোম", entry: "চেক", closing: "ব্যাংক", cash: "ক্যাশ", crep: "ব্যালেন্স", cashsum: "ক্যাশ", reports: "রিপোর্ট" }[k] || ROUTES[k].t.split(" ")[0]}</span>${bd[k] ? `<span class="badge">${bd[k]}</span>` : ""}</a>`).join("")}<a href="#" id="more">${ico("more")}<span>আরও</span></a></nav>`;
  const lo = async () => { await API.logout(); try { localStorage.removeItem(CACHE_KEY); } catch { } location.hash = ""; location.reload(); };
  $("#logout").onclick = lo;
  $("#theme").onclick = () => setTheme(getTheme() === "dark" ? "light" : "dark");
  $("#qs").onclick = palette; $("#bell").onclick = () => { const d = dueList(); if (d.length) dueModal(d); else location.hash = "#/rem"; }; updateBell();
  if ($("#sync")) { $("#sync").onclick = () => navigator.onLine ? Outbox.flush() : toast("ইন্টারনেট নেই — নেট এলে নিজে থেকে সিঙ্ক হবে", "err"); syncBadge(); }
  $("#lang").onclick = () => setLang(LANG === "bn" ? "en" : "bn");
  $("#more").onclick = e => { e.preventDefault(); openMore(keys, mob, bd, lo); };

}
function refreshBadges() {
  const bd = badges();
  $$("[data-k]").forEach(a => { const n = bd[a.dataset.k]; let b = $(".badge", a); if (n) { if (!b) { b = document.createElement("span"); b.className = "badge"; a.appendChild(b); } b.textContent = n; } else b && b.remove(); });
}
/* label table cells so they can become cards on phones */
function labelTables(root) {
  $$("table", root).forEach(t => { const hs = $$("thead th", t).map(th => th.textContent.trim()); if (!hs.length) return; $$("tbody tr", t).forEach(tr => [...tr.children].forEach((td, i) => { if (!td.hasAttribute("data-l")) td.setAttribute("data-l", hs[i] || ""); })); });
}
async function route() {
  if (!S.me) return;
  if (updReady && navigator.onLine && !Outbox.busy) { location.reload(); return; }   // switching page = safe moment to load the new version
  DIRTY = false;
  let k = (location.hash.match(/^#\/(\w+)/) || [])[1];
  if (!allowed().includes(k)) k = "dash";
  CUR = k; document.body.classList.remove("print-rep");
  if (cleanup) { cleanup(); cleanup = null; }
  $$("[data-k]").forEach(a => a.classList.toggle("on", a.dataset.k === k));
  const cr = $("#crumb"); if (cr) cr.textContent = ROUTES[k].t;
  document.title = ROUTES[k].t + " · Nabiad";
  const v = $("#view"); v.innerHTML = `<div class="card"><div class="skel" style="width:40%"></div><div class="skel" style="margin-top:12px"></div><div class="skel" style="margin-top:12px;width:70%"></div></div>`;
  try { cleanup = await ROUTES[k].f()(v) || null; } catch (e) { console.error(e); v.innerHTML = `<div class="alert rd">ত্রুটি: ${esc(e.message || e)}</div>`; }
  window.scrollTo(0, 0);
}
/* ---------- command palette (Ctrl+K) ---------- */
function palette() {
  if ($(".pal")) return;
  const el = document.createElement("div"); el.className = "pal";
  el.innerHTML = `<div class="box"><input placeholder="চেক নং, A/C কোড, হোল্ডার, পার্টি, টাকা বা পাতার নাম…" autocomplete="off"><div class="res"></div></div>`;
  document.body.appendChild(el);
  const inp = $("input", el), res = $(".res", el); let items = [], idx = 0;
  const close = () => el.remove();
  const draw = () => {
    const q = inp.value.trim(), n = norm(q); items = [];
    const pages = allowed().filter(k => !n || norm(ROUTES[k].t + k).includes(n)).map(k => ({ g: "পাতা", ic: ROUTES[k].ic, t: ROUTES[k].t, s: "", go: () => location.hash = "#/" + k }));
    let chq = [], acc = [];
    if (n) {
      acc = S.accounts.filter(a => norm(a.code + a.holder + a.bank + (a.acno || "")).includes(n)).slice(0, 6).map(a => ({ g: "অ্যাকাউন্ট", ic: "card", t: `<b>${esc(a.code)}</b> · ${esc(a.holder || "")}`, s: `${esc(a.bank || "")} ${a.acno ? "· " + esc(a.acno) : ""}`, go: () => { location.hash = "#/accounts"; setTimeout(() => { const i = $("#ad-q"); if (i) { i.value = a.code; i.dispatchEvent(new Event("input")); } }, 60); } }));
      const raw = q.replace(/,/g, "");
      chq = S.cheques.filter(c => String(c.no).includes(raw) || norm(c.code + c.no + (c.party || "") + (c.remarks || "")).includes(n) || String(c.amount) === raw).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)
        .map(c => ({ g: "চেক", ic: "list", t: `<b>${esc(c.code)} · ${c.no}</b> &nbsp;<span class="num">৳ ${money(c.amount)}</span> &nbsp;${stTag(c.status)}`, s: `${dmy(c.date)} · ${esc(c.purpose.split(" (")[0])}${c.party ? " · " + esc(c.party) : ""}`, go: () => chequeModal(c, () => { }) }));
    }
    items = [...chq, ...acc, ...pages.slice(0, n ? 4 : 10)]; idx = 0; let g = "";
    res.innerHTML = items.map((it, i) => { const h = it.g !== g ? `<div class="grp">${(g = it.g)}</div>` : ""; return h + `<div class="it ${i === 0 ? "on" : ""}" data-i="${i}">${ico(it.ic).replace("<svg", '<svg width="18" height="18" style="color:var(--mut)"')}<div class="t"><div>${it.t}</div>${it.s ? `<div class="mut sm">${it.s}</div>` : ""}</div></div>`; }).join("") || `<div class="empty">কিছু পাওয়া যায়নি</div>`;
  };
  const pick = i => { const it = items[i]; if (!it) return; close(); it.go(); };
  inp.addEventListener("input", draw);
  inp.addEventListener("keydown", e => {
    if (e.key === "Escape") return close();
    if (e.key === "Enter") { e.preventDefault(); return pick(idx); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(0, Math.min(items.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1))); $$(".it", res).forEach((d, i) => d.classList.toggle("on", i === idx)); $$(".it", res)[idx]?.scrollIntoView({ block: "nearest" }); }
  });
  res.addEventListener("click", e => { const d = e.target.closest("[data-i]"); if (d) pick(+d.dataset.i); });
  el.addEventListener("mousedown", e => { if (e.target === el) close(); });
  draw(); inp.focus();
}
document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && S.me) { e.preventDefault(); palette(); } });
let CUR = "dash";
const head = (title, extra = "") => `<div class="top"><div class="pic">${ico(ROUTES[CUR]?.ic || "home")}</div><h1>${title}</h1><div class="sp"></div>${extra ? `<div class="acts">${extra}</div>` : ""}</div>`;
const stTag = s => `<span class="st ${s}">${s}</span>`;
const pendTag = c => c.pending || c.events?.some(e => e.pending) ? ` <span class="tag" style="background:var(--am-soft);color:var(--am)" title="সার্ভারে যাওয়া বাকি">⏳ সিঙ্ক বাকি</span>` : "";
const chqLine = c => `${esc(c.code)} · ${c.no}`;
const chqIcons = c => `${c.photo ? ` <span class="ci" title="ছবি আছে">📷</span>` : ""}${(S.reminders || []).some(r => r.cheque_id === c.id && !r.done) ? ` <span class="ci" title="রিমাইন্ডার আছে">⏰</span>` : ""}`;

/* ---------- login ---------- */
function loginView() {
  const demoBox = DEMO ? `<div class="alert am" style="margin-top:14px"><span>⚠ <b>DEMO মোড</b> — Supabase সেট করা হয়নি, ডাটা শুধু এই ব্রাউজারে থাকবে।</span></div>
    <div class="chips" style="margin-top:12px">${[["admin", "Ruhul"], ["staff", "Foysal"], ["boss", "Boss"]].map(([r, n]) => `<span class="chip" data-demo="${r}|${n}">${r} (${n})</span>`).join("")}</div>` : "";
  $("#app").innerHTML = `<div class="login"><div class="tl">${langToggle()}</div>
    <div class="art"><div class="brand" style="padding:0"><div class="logo"><img src="icon.svg" alt="Nabiad"></div><div><b>NABIAD</b><span>Cheque &amp; Bank Control</span></div></div>
      <div><h1>চেক রেজিস্টার, দৈনিক ব্যাংক ক্লোজিং আর রিপোর্ট — এক জায়গায়</h1><p>প্রতিটি চেক পাতার হিসাব, মিসিং পাতা ধরা, আর Boss-এর জন্য তাৎক্ষণিক এনকোয়ারি।</p>
      <ul><li>Staff শুধু যোগ করতে পারে, বদলাতে পারে শুধু Admin</li><li>দৈনিক ক্লোজিং রিপোর্ট — ছবি, PDF, Excel, WhatsApp</li><li>মোবাইল ও কম্পিউটার দুটোতেই চলে</li></ul></div>
      <div class="sm" style="opacity:.6">© ${new Date().getFullYear()} NABIAD Group</div></div>
    <div class="pane"><div class="card"><div class="brand" style="padding:0 0 22px"><div class="logo"><img src="icon.svg" alt="Nabiad"></div><div><b style="color:var(--txt)">NABIAD</b><span class="mut">Cheque &amp; Bank Control</span></div></div>
    <h2>লগইন করুন</h2><p class="mut">আপনার অফিস ইমেইল ও পাসওয়ার্ড দিন</p>
    ${DEMO ? "" : `<form id="lf"><label class="f">ইমেইল</label><input class="in" id="em" type="email" autocomplete="username" required>
    <label class="f" style="margin-top:14px">পাসওয়ার্ড</label><input class="in" id="pw" type="password" autocomplete="current-password" required>
    <button class="btn pri lg" style="width:100%;margin-top:20px" id="lb">লগইন</button><div class="hint" id="le"></div></form>`}${demoBox}</div></div></div>`;
  $("#lang").onclick = () => setLang(LANG === "bn" ? "en" : "bn");
  const done = async u => { S.me = u; await boot(); };
  if (DEMO) $$("[data-demo]").forEach(c => c.onclick = async () => { const [r, n] = c.dataset.demo.split("|"); await done(await API.login(r, n)); });
  else $("#lf").onsubmit = async e => { e.preventDefault(); $("#lb").disabled = true; try { const u = await API.login($("#em").value.trim(), $("#pw").value); if (!u) throw new Error("প্রোফাইল পাওয়া যায়নি বা নিষ্ক্রিয়"); await done(u); } catch (er) { $("#le").textContent = "লগইন হয়নি: " + (er.message || er); $("#le").className = "hint rd"; $("#lb").disabled = false; } };
}

/* ---------- dashboard ---------- */

/* ---------- cheque entry ---------- */
async function setStatus(c, status, date, remarks) {
  const e = await API.addStatus(c.id, status, date, remarks); c.events.push(e); derive(c); saveCache(); refreshBadges(); return c;
}
async function vEntry(v) {
  const st = { purpose: null, photo: null };
  v.innerHTML = head("নতুন চেক এন্ট্রি<span class=\"mut\">Enter চাপলে পরের ঘরে যাবে · শেষ ঘরে Enter = সেভ</span>") + `
  <div class="split">
   <div class="card">
    <div class="fgrid">
     <div class="s4 daterow"><div class="dr-d"><label class="f">চেকের তারিখ</label><input class="in big" type="date" id="e-date" value="${today()}"></div><div class="dr-p"><label class="f">চেকের ছবি <span class="mut">(ঐচ্ছিক)</span></label><div class="photo-in"><label class="btn big" for="e-ph">${ico("cam")} <span class="lbl">ছবি তুলুন / বাছুন</span></label><input type="file" id="e-ph" accept="image/*" hidden><img id="e-phv" class="hide" alt=""><button class="btn sm ghost hide" id="e-phx" title="ছবি বাদ">✕</button></div></div></div>
     <div class="s4"><label class="f">A/C Code <span class="mut">(টাইপ করুন: pbl, 483, nabiad…)</span></label><div><input class="in big" id="e-ac" autocomplete="off" placeholder="PBL-483" autofocus></div><div class="hint" id="e-achint"></div></div>
     <div class="s2"><label class="f">চেক নং (শুধু সংখ্যা)</label><input class="in big" id="e-no" inputmode="numeric" autocomplete="off"><div class="hint" id="e-nohint"></div></div>
     <div class="s2"><label class="f">টাকা (বাতিল পাতা হলে 0)</label><input class="in big num" id="e-amt" inputmode="decimal" autocomplete="off"><div class="hint num" id="e-amthint"></div></div>
     <div class="s4"><label class="f">খাত</label><div class="chips" id="e-purp">${PURPOSES.map(p => `<span class="chip" data-p="${esc(p)}">${esc(p.split(" (")[0])}</span>`).join("")}</div></div>
     <div class="s2" id="x-cash" style="display:none"><label class="f">কে তুলেছে *</label><select class="in" id="e-taker"><option value=""></option>${TAKERS.map(t => `<option>${t}</option>`).join("")}</select></div>
     <div class="s2" id="x-own" style="display:none"><label class="f">কোন A/C তে জমা *</label><div><input class="in" id="e-toac" autocomplete="off" placeholder="যে অ্যাকাউন্টে টাকা গেছে"></div></div>
     <div class="s4"><label class="f">নোট / মন্তব্য / সাপ্লায়ার / অন্যান্য</label><input class="in" id="e-rem" autocomplete="off" list="dl-rem" placeholder="যেমন: সাপ্লায়ারের নাম — বিলের বিবরণ"></div>
     <div class="s4" id="e-sum" style="display:none"></div>
    </div>${datalist("dl-rem", [...S.cheques.map(c => c.remarks), ...S.cheques.map(c => c.party)])}
    <div class="fbar"><button class="btn pri lg" id="e-save">${ico("save")} সেভ করুন <kbd style="background:rgba(255,255,255,.15);color:#fff;border-color:rgba(255,255,255,.35)">Enter</kbd></button><button class="btn lg" id="e-clear">পরিষ্কার</button><div class="hint rd" id="e-err" style="margin:0"></div><div class="sp"></div><label class="keep"><input type="checkbox" id="keep" checked> A/C ও খাত ধরে রাখুন</label></div>
   </div>
   <div class="card flush"><div class="ch"><h3>আজকের এন্ট্রি</h3><span class="tag" id="e-cnt"></span></div><div id="e-list"></div></div>
  </div>`;
  const $e = id => $("#" + id, v);
  const ac = suggest($e("e-ac"), () => acItems(), it => {
    const a = it && accMap()[it.value]; $e("e-achint").innerHTML = a ? `${esc(a.bank)} ${a.branch ? "· " + esc(a.branch) : ""} ${a.acno ? "· " + esc(a.acno) : ""}` : "";
    if (it) { const n = nextNo(it.value); $e("e-no").value = n; const last = S.cheques.filter(c => c.code === it.value).sort((x, y) => y.no - x.no)[0]; $e("e-nohint").textContent = last ? `শেষ এন্ট্রি: ${last.no} (${dmy(last.date)})` : "এই অ্যাকাউন্টে এখনো এন্ট্রি নেই"; }
    sum();
  });
  const toac = suggest($e("e-toac"), () => acItems(true), () => sum());
  const clearPhoto = photoPicker(v, st, { inp: "e-ph", img: "e-phv", x: "e-phx" });
  const purpKey = () => st.purpose ? purposeKey(st.purpose) : "";
  function applyPurpose() {
    $$(".chip[data-p]", v).forEach(c => c.classList.toggle("on", c.dataset.p === st.purpose));
    const k = purpKey(); $e("x-cash").style.display = k === "cash" ? "" : "none"; $e("x-own").style.display = k === "own" ? "" : "none"; sum();
  }
  function sum() {
    const code = ac.get()?.value, no = $e("e-no").value, amt = num($e("e-amt").value);
    $e("e-amthint").textContent = amt ? "৳ " + money(amt) : ""; const el = $e("e-sum");
    if (code && no) {
      const dup = S.cheques.find(c => c.code === code && c.no === +no);
      el.style.display = ""; el.className = "s4 sumbox" + (dup ? " dup" : "");
      el.innerHTML = dup ? `⛔ <b>${esc(code)} · ${no}</b> আগেই এন্ট্রি আছে (${dmy(dup.date)}, ৳ ${money(dup.amount)}, ${dup.status})` : `<span class="tag">${esc(code)}</span><span>চেক নং <b>${no}</b></span><span class="big num">৳ ${money(amt) || 0}</span><span class="mut">${esc((st.purpose || "খাত বাছুন").split(" (")[0])}</span>`;
    } else el.style.display = "none";
  }
  $$(".chip[data-p]", v).forEach(c => c.onclick = () => { st.purpose = c.dataset.p; applyPurpose(); if (purpKey() === "cash") $e("e-taker").focus(); else if (purpKey() === "own") $e("e-toac").focus(); else $e("e-rem").focus(); });
  ["e-no", "e-amt"].forEach(i => $e(i).addEventListener("input", sum));
  $e("e-ac").addEventListener("picked", () => $e("e-no").select() || $e("e-no").focus());
  $e("e-no").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $e("e-amt").focus(); } });
  $e("e-amt").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); if (st.purpose) save(); else $e("e-err").textContent = "খাত বাছুন"; } });
  $$("#e-taker,#e-rem", v).forEach(el => el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } }));
  $e("e-toac").addEventListener("picked", () => $e("e-rem").focus());
  function clearAll(full) {
    if (full || !$("#keep", v).checked) { ac.set(null); st.purpose = null; $e("e-taker").value = ""; $e("e-achint").textContent = ""; $e("e-nohint").textContent = ""; }
    toac.set(null); $e("e-no").value = ac.get() ? nextNo(ac.get().value) : ""; $e("e-amt").value = ""; $e("e-rem").value = ""; clearPhoto(); applyPurpose();
  }
  function list() {
    const t = today(), arr = S.cheques.filter(c => (c.at || "").slice(0, 10) === t || c.date === t).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    $e("e-cnt").textContent = arr.length;
    $e("e-list").innerHTML = arr.length ? `<div class="tw cards" style="max-height:66vh"><table><thead><tr><th>A/C · চেক</th><th class="r">টাকা</th><th>স্ট্যাটাস</th><th>কে</th></tr></thead><tbody>${arr.map(c => `<tr><td><b>${esc(c.code)}</b> · ${c.no}${chqIcons(c)}<div class="mut sm">${esc(c.purpose.split(" (")[0])}${c.party ? " · " + esc(c.party) : ""}</div></td><td class="r num">${money(c.amount)}</td><td>${stTag(c.status)}${pendTag(c)}</td><td class="mut sm">${esc(c.by || "")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">আজ এখনো কোনো এন্ট্রি নেই</div>`;
  }
  let busy = false;
  async function save() {
    if (busy) return; const err = $e("e-err"); err.textContent = ""; err.className = "hint rd";
    const code = ac.get()?.value, no = parseInt($e("e-no").value), amount = num($e("e-amt").value), date = $e("e-date").value, k = purpKey();
    if (!code) return err.textContent = "A/C Code বাছুন", $e("e-ac").focus();
    if (!no || no < 1) return err.textContent = "চেক নং দিন", $e("e-no").focus();
    if (!st.purpose) return err.textContent = "খাত বাছুন";
    if (!date) return err.textContent = "তারিখ দিন";
    if (k !== "cancel" && !(amount > 0)) return err.textContent = "টাকার অংক দিন (বাতিল পাতা হলে খাত 'বাতিল/নষ্ট পাতা' বাছুন)", $e("e-amt").focus();
    if (k === "cash" && !$e("e-taker").value) return err.textContent = "কে তুলেছে — বাছুন", $e("e-taker").focus();
    if (k === "own" && !toac.get()) return err.textContent = "কোন A/C তে জমা — বাছুন", $e("e-toac").focus();
    if (k === "own" && toac.get().value === code) return err.textContent = "From ও To একই A/C হতে পারে না";
    if (S.cheques.some(c => c.code === code && c.no === no)) return err.textContent = "এই চেক আগেই এন্ট্রি আছে";
    const diff = daysBetween(date, today());
    if ((diff > 7 || diff < 0) && !ask(`তারিখ ${dmy(date)} — আজ থেকে ${Math.abs(diff)} দিন ${diff > 0 ? "আগের" : "পরের"}। ঠিক আছে?`)) return;
    if (amount >= 1000000 && !ask(`৳ ${money(amount)} — অংক ঠিক আছে?`)) return;
    busy = true; $e("e-save").disabled = true;
    try {
      const id = crypto.randomUUID(); let photo = null, warn = "";
      if (st.photo) {
        if (!navigator.onLine && !DEMO) warn = " · ইন্টারনেট নেই, তাই ছবি সেভ হয়নি (পরে চেকের পাতা থেকে যোগ করুন)";
        else { try { const p = photoPath(id, code, no, date); await API.uploadPhoto(p, st.photo); photo = p; } catch (e) { if (!ask("ছবি আপলোড হয়নি (" + (e.message || e) + ")।\nছবি ছাড়া চেক সেভ করবেন?")) throw new Error("ছবি আপলোড হয়নি — আবার চেষ্টা করুন"); warn = " · ছবি সেভ হয়নি"; } }
      }
      const party = "";
      const row = await API.addCheque({ id, photo, date, code, no, amount: k === "cancel" ? 0 : amount, purpose: st.purpose, taker: k === "cash" ? $e("e-taker").value : "", party, toac: k === "own" ? toac.get().value : "", remarks: $e("e-rem").value.trim() });
      S.cheques.push(derive(row)); saveCache();
      if (warn) toast(warn.slice(3), /হয়নি/.test(warn) ? "err" : "ok"); toast(row.pending ? `✔ অফলাইনে জমা হয়েছে: ${code} · ${no} · ৳ ${money(row.amount)} — নেট এলে সিঙ্ক হবে` : `✔ সেভ হয়েছে: ${code} · ${no} · ৳ ${money(row.amount)}`); clearAll(false); list();
      const n = $e("e-no"); n.focus(); n.select();
    } catch (e) { err.textContent = e.message || String(e); toast(e.message || String(e), "err"); }
    finally { busy = false; $e("e-save").disabled = false; }
  }
  $e("e-save").onclick = save; $e("e-clear").onclick = () => { clearAll(true); $e("e-ac").focus(); };
  list(); const poll = setInterval(async () => { if (document.hidden) return; try { await reload(); list(); } catch { } }, 30000); return () => clearInterval(poll);
}

/* ---------- status update ---------- */
function statusModal(c, after) {
  const evs = (c.events || []);
  modal(`<h2>${esc(c.code)} · ${c.no} <span class="mut sm">৳ ${money(c.amount)}</span></h2><div class="mut sm" style="margin:-8px 0 12px">${dmy(c.date)} · ${esc(c.purpose)} ${c.party ? "· " + esc(c.party) : ""}</div>
   <div class="row"><div><label class="f">নতুন স্ট্যাটাস</label><select class="in" id="m-st">${STATUSES.map(s => `<option ${s === c.status ? "selected" : ""}>${s}</option>`).join("")}</select></div><div><label class="f">তারিখ</label><input class="in" type="date" id="m-d" value="${today()}"></div></div>
   <label class="f" style="margin-top:12px">মন্তব্য (ঐচ্ছিক)</label><input class="in" id="m-r">
   <div class="mut sm" style="margin-top:12px">ইতিহাস: ${evs.length ? evs.map(e => `${e.status} (${dmy(e.date)}${e.by ? ", " + esc(e.by) : ""})`).join(" → ") : "—"}</div>
   <div class="row" style="margin-top:16px"><button class="btn pri" id="m-ok">সেভ</button><button class="btn" id="m-x">বাতিল</button></div>`, (root, close) => {
    $("#m-x", root).onclick = close; $("#m-ok", root).onclick = async () => {
      try { await setStatus(c, $("#m-st", root).value, $("#m-d", root).value, $("#m-r", root).value.trim()); toast(`✔ ${c.code} · ${c.no} → ${c.status}`); close(); after && after(); } catch (e) { toast(e.message, "err"); }
    };
  });
}
async function vStatus(v) {
  v.innerHTML = head("চেক স্ট্যাটাস আপডেট") + `<div class="card noprint" style="margin-bottom:14px"><div class="row">
    <div style="flex:2 1 260px"><label class="f">খুঁজুন (A/C বা চেক নং — যেমন: pbl 12565)</label><input class="in big" id="s-q" autocomplete="off" placeholder="চেক নং / কোড…" autofocus></div>
    <div class="fix" style="width:180px"><label class="f">স্ট্যাটাসের তারিখ (Quick বাটনে)</label><input class="in" type="date" id="s-d" value="${today()}"></div>
    <div class="fix"><label class="f">দেখান</label><select class="in" id="s-f"><option value="Pending">শুধু Pending</option><option value="">সব</option></select></div></div></div>
    <div id="s-list"></div>`;
  const q = $("#s-q", v);
  const draw = () => {
    const t = norm(q.value), f = $("#s-f", v).value;
    let arr = S.cheques.filter(c => (!f || c.status === f) && (!t || norm(c.code + c.no + (c.party || "")).includes(t) || String(c.no) === t));
    arr.sort((a, b) => f === "Pending" && !t ? a.date.localeCompare(b.date) : (b.at || "").localeCompare(a.at || ""));
    const tot = arr.length; arr = arr.slice(0, 80); const T = today();
    $("#s-list", v).innerHTML = tot ? `<div class="mut sm" style="margin-bottom:8px">${tot}টি চেক ${tot > 80 ? "(প্রথম ৮০টি)" : ""}</div><div class="card flush"><div class="tw cards"><table><thead><tr><th>তারিখ</th><th>A/C · চেক</th><th class="r">টাকা</th><th>বিবরণ</th><th>স্ট্যাটাস</th><th></th></tr></thead><tbody>${arr.map(c => { const d = daysBetween(c.date, T); return `<tr><td>${dmy(c.date)}${c.status === "Pending" && d > (CFG.PENDING_ALERT_DAYS ?? 3) ? `<div class="rd sm b">${d} দিন</div>` : ""}</td><td><b>${esc(c.code)}</b> · ${c.no}</td><td class="r num">${money(c.amount)}</td><td class="mut sm">${esc(c.purpose.split(" (")[0])}${c.party || c.remarks ? " · " + esc(c.party || c.remarks) : ""}</td><td>${stTag(c.status)}${pendTag(c)}${c.sdate && c.status !== "Pending" ? `<div class="mut sm">${dmy(c.sdate)}</div>` : ""}</td>
      <td class="r" data-l="" style="white-space:nowrap"><button class="btn ok sm" data-q="Cleared" data-id="${c.id}" ${c.status === "Cleared" ? "disabled" : ""}>✓ Cleared</button> <button class="btn bad sm" data-q="Bounced" data-id="${c.id}" ${c.status === "Bounced" ? "disabled" : ""}>✗ Bounced</button> <button class="btn sm" data-m="${c.id}">${ico("more")}</button></td></tr>`; }).join("")}</tbody></table></div></div>` : `<div class="card empty">${S.cheques.length ? "কোনো চেক পাওয়া যায়নি" : "এখনো কোনো চেক এন্ট্রি হয়নি"}</div>`;
    $$("[data-q]", v).forEach(b => b.onclick = async () => { const c = S.cheques.find(x => x.id === b.dataset.id); b.disabled = true; try { await setStatus(c, b.dataset.q, $("#s-d", v).value, ""); toast(`✔ ${c.code} · ${c.no} → ${c.status}`); draw(); } catch (e) { toast(e.message, "err"); b.disabled = false; } });
    $$("[data-m]", v).forEach(b => b.onclick = () => statusModal(S.cheques.find(x => x.id === b.dataset.m), draw));
  };
  q.addEventListener("input", draw); $("#s-f", v).onchange = draw; draw();
}

/* ---------- export helpers ---------- */
async function exportXlsx(sheets, filename) {
  await loadScript("vendor/xlsx.min.js"); const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) { const ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = (rows[0] || []).map((_, i) => ({ wch: Math.min(40, Math.max(10, ...rows.slice(0, 60).map(r => String(r[i] ?? "").length + 2))) })); XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); }
  XLSX.writeFile(wb, filename);
}
const chqRow = c => [dmy(c.date), c.code, (accMap()[c.code] || {}).holder || "", c.no, c.amount, c.purpose, c.taker || "", c.party || "", c.toac || "", c.status, c.sdate ? dmy(c.sdate) : "", c.remarks || "", c.by || ""];
const CHQ_HEAD = ["Date", "A/C Code", "Holder", "Cheque No", "Amount", "Purpose", "Cash Taker", "Party", "To A/C", "Status", "Status Date", "Remarks", "Entered By"];

/* ---------- cheque list / enquiry ---------- */
function chequeModal(c, after) {
  const admin = S.me.role === "admin"; const a = accMap()[c.code] || {};
  modal(`<h2>${esc(c.code)} · ${c.no} ${stTag(c.status)}</h2>
   <div class="grid g2" style="gap:8px;font-size:14px"><div><span class="mut sm">তারিখ</span><br>${dmy(c.date)}</div><div><span class="mut sm">টাকা</span><br><b class="num">৳ ${money(c.amount)}</b></div>
   <div><span class="mut sm">A/C</span><br>${esc(a.holder || "")}<div class="mut sm">${esc(a.bank || "")}</div></div><div><span class="mut sm">খাত</span><br>${esc(c.purpose)}</div>
   ${c.taker ? `<div><span class="mut sm">কে তুলেছে</span><br>${esc(c.taker)}</div>` : ""}${c.toac ? `<div><span class="mut sm">To A/C</span><br>${esc(c.toac)}</div>` : ""}${c.party ? `<div><span class="mut sm">পার্টি</span><br>${esc(c.party)}</div>` : ""}${c.remarks ? `<div><span class="mut sm">মন্তব্য</span><br>${esc(c.remarks)}</div>` : ""}
   <div><span class="mut sm">এন্ট্রি</span><br>${esc(c.by || "")} <span class="mut sm">${c.at ? new Date(c.at).toLocaleString("en-GB") : ""}</span></div></div>
   <div id="c-ph" style="margin-top:12px"></div>
   ${(S.reminders || []).filter(r => r.cheque_id === c.id && !r.done).map(r => `<div class="alert vi" style="margin-top:10px">⏰ <span>${esc(r.title)} — ${new Date(remDue(r)).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span></div>`).join("")}
   <h3 style="margin:16px 0 8px;font-size:13px;color:var(--mut)">স্ট্যাটাস ইতিহাস</h3>
   ${c.events.length ? c.events.map(e => `<div style="display:flex;gap:8px;align-items:center;padding:4px 0">${stTag(e.status)} <span>${dmy(e.date)}</span> <span class="mut sm">${esc(e.by || "")} ${esc(e.remarks || "")}</span>${admin ? `<button class="btn bad sm" style="margin-left:auto" data-de="${e.id}">মুছুন</button>` : ""}</div>`).join("") : `<div class="mut sm">কোনো আপডেট নেই (ডিফল্ট: ${c.status})</div>`}
   <div class="row" style="margin-top:16px">${S.me.role !== "boss" ? `<button class="btn pri" id="c-st">স্ট্যাটাস দিন</button>` : ""}<button class="btn" id="c-rm">${ico("bell")} রিমাইন্ডার</button>${admin || (S.me.role === "staff" && !c.photo) ? `<button class="btn" id="c-ap">${ico("cam")} ${c.photo ? "ছবি বদলান" : "ছবি যোগ"}</button>` : ""}${admin ? `<button class="btn" id="c-ed">✎ এডিট</button><button class="btn bad" id="c-dl">🗑 মুছুন</button>` : ""}<button class="btn" id="c-x">বন্ধ</button></div>`, (root, close) => {
    $("#c-x", root).onclick = close; showPhoto($("#c-ph", root), c);
    $("#c-rm", root).onclick = () => { close(); reminderModal(null, { title: `চেক ${c.code} · ${c.no} পাস হয়েছে কিনা দেখুন`, note: `৳ ${money(c.amount)}${c.party ? " · " + c.party : ""} · চেকের তারিখ ${dmy(c.date)}`, due: (() => { const d = new Date(addDays(c.date < today() ? today() : c.date, 3) + "T10:00"); return d; })(), kind: "cheque", cheque_id: c.id, for_role: "all" }, after); };
    $("#c-ap", root) && ($("#c-ap", root).onclick = () => { close(); addPhotoModal(c, after); });
    $("#c-st", root) && ($("#c-st", root).onclick = () => { close(); statusModal(c, after); });
    $$("[data-de]", root).forEach(b => b.onclick = async () => { if (!ask("এই স্ট্যাটাস এন্ট্রি স্থায়ীভাবে মুছবেন?")) return; await API.deleteStatus(b.dataset.de); await reload(); close(); after && after(); toast("মুছে ফেলা হয়েছে"); });
    $("#c-dl", root) && ($("#c-dl", root).onclick = async () => { if (!ask(`চেক ${c.code} · ${c.no} স্থায়ীভাবে মুছবেন? (ফেরানো যাবে না)`)) return; try { await API.deleteCheque(c.id); await reload(); close(); after && after(); toast("চেক মুছে ফেলা হয়েছে"); } catch (e) { toast(e.message, "err"); } });
    $("#c-ed", root) && ($("#c-ed", root).onclick = () => { close(); editChequeModal(c, after); });
  });
}
function editChequeModal(c, after) {
  modal(`<h2>এডিট (Admin): ${esc(c.code)} · ${c.no}</h2><div class="grid" style="gap:10px">
   <div class="row"><div><label class="f">তারিখ</label><input class="in" type="date" id="x-d" value="${c.date}"></div><div><label class="f">A/C Code</label><select class="in" id="x-c">${S.accounts.map(a => `<option ${a.code === c.code ? "selected" : ""}>${esc(a.code)}</option>`).join("")}</select></div></div>
   <div class="row"><div><label class="f">চেক নং</label><input class="in" id="x-n" value="${c.no}"></div><div><label class="f">টাকা</label><input class="in" id="x-a" value="${c.amount}"></div></div>
   <div><label class="f">খাত</label><select class="in" id="x-p">${PURPOSES.map(p => `<option ${p === c.purpose ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></div>
   <div class="row"><div><label class="f">কে তুলেছে</label><input class="in" id="x-t" value="${esc(c.taker || "")}"></div><div><label class="f">To A/C</label><input class="in" id="x-o" value="${esc(c.toac || "")}"></div></div>
   <div class="row"><div><label class="f">পার্টি</label><input class="in" id="x-y" value="${esc(c.party || "")}"></div><div><label class="f">মন্তব্য</label><input class="in" id="x-r" value="${esc(c.remarks || "")}"></div></div>
   <div class="row"><button class="btn pri" id="x-ok">সেভ</button><button class="btn" id="x-x">বাতিল</button></div></div>`, (root, close) => {
    $("#x-x", root).onclick = close; $("#x-ok", root).onclick = async () => {
      try { await API.updateCheque(c.id, { date: $("#x-d", root).value, code: $("#x-c", root).value, no: parseInt($("#x-n", root).value), amount: num($("#x-a", root).value), purpose: $("#x-p", root).value, taker: $("#x-t", root).value.trim(), toac: $("#x-o", root).value.trim(), party: $("#x-y", root).value.trim(), remarks: $("#x-r", root).value.trim() }); await reload(); close(); after && after(); toast("আপডেট হয়েছে"); } catch (e) { toast(e.message, "err"); }
    };
  });
}
async function vCheques(v) {
  const F = { q: "", from: "", to: "", code: "", status: "", purpose: "", taker: "", page: 0 }, PS = 100;
  v.innerHTML = head("চেক তালিকা ও এনকোয়ারি", `<button class="btn" id="k-x">${ico("dl")} Excel</button><button class="btn" id="k-p">${ico("print")} প্রিন্ট</button>`) + `<div class="card noprint" style="margin-bottom:14px"><div class="row">
   <div style="flex:2 1 220px"><label class="f">খুঁজুন (কোড, চেক নং, পার্টি, মন্তব্য, টাকা)</label><input class="in" id="k-q" placeholder="যেকোনো কিছু লিখুন…"></div>
   <div><label class="f">From</label><input class="in" type="date" id="k-f"></div><div><label class="f">To</label><input class="in" type="date" id="k-t"></div>
   <div><label class="f">A/C</label><select class="in" id="k-c"><option value="">সব</option>${S.accounts.map(a => `<option>${esc(a.code)}</option>`).join("")}</select></div>
   <div><label class="f">স্ট্যাটাস</label><select class="in" id="k-s"><option value="">সব</option>${STATUSES.map(s => `<option>${s}</option>`).join("")}</select></div>
   <div><label class="f">খাত</label><select class="in" id="k-u"><option value="">সব</option>${PURPOSES.map(p => `<option value="${esc(p)}">${esc(p.split(" (")[0])}</option>`).join("")}</select></div></div></div>
   <div id="k-sum" class="mut sm" style="margin-bottom:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center"></div><div class="card flush"><div id="k-tab"></div></div><div id="k-pg" class="row noprint" style="margin-top:10px;justify-content:center"></div>`;
  const filt = () => { const t = norm(F.q), raw = F.q.trim(); return S.cheques.filter(c => (!F.from || c.date >= F.from) && (!F.to || c.date <= F.to) && (!F.code || c.code === F.code) && (!F.status || c.status === F.status) && (!F.purpose || c.purpose === F.purpose) && (!t || norm(c.code + c.no + (c.party || "") + (c.remarks || "") + (c.taker || "") + (c.toac || "")).includes(t) || String(c.amount) === raw.replace(/,/g, ""))).sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no); };
  const draw = () => {
    const arr = filt(), pages = Math.max(1, Math.ceil(arr.length / PS)); F.page = Math.min(F.page, pages - 1); const part = arr.slice(F.page * PS, F.page * PS + PS), live = arr.filter(isLive);
    $("#k-sum", v).innerHTML = `<b>${arr.length}</b>টি চেক · কার্যকর মোট <b class="num">৳ ${money0(sumAmt(live))}</b> ${["Pending", "Cleared", "Bounced"].map(s => { const x = arr.filter(c => c.status === s); return x.length ? `· ${stTag(s)} ${x.length} (${money0(sumAmt(x))})` : ""; }).join(" ")}`;
    $("#k-tab", v).innerHTML = part.length ? `<div class="tw cards"><table><thead><tr><th>তারিখ</th><th>A/C · চেক</th><th>হোল্ডার</th><th class="r">টাকা</th><th>খাত / বিবরণ</th><th>স্ট্যাটাস</th><th>কে</th></tr></thead><tbody>${part.map(c => `<tr data-id="${c.id}" style="cursor:pointer"><td>${dmy(c.date)}</td><td><b>${esc(c.code)}</b> · ${c.no}${chqIcons(c)}</td><td class="mut sm">${esc((accMap()[c.code] || {}).holder || "")}</td><td class="r num">${money(c.amount)}</td><td>${esc(c.purpose.split(" (")[0])}<div class="mut sm">${esc([c.taker, c.party, c.toac && "→ " + c.toac, c.remarks].filter(Boolean).join(" · "))}</div></td><td>${stTag(c.status)}${pendTag(c)}${c.sdate && c.status !== "Pending" ? `<div class="mut sm">${dmy(c.sdate)}</div>` : ""}</td><td class="mut sm">${esc(c.by || "")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">কিছু পাওয়া যায়নি</div>`;
    $("#k-pg", v).innerHTML = pages > 1 ? `<button class="btn sm fix" id="pv" ${F.page ? "" : "disabled"}>‹ আগের</button><span class="mut fix">পাতা ${F.page + 1} / ${pages}</span><button class="btn sm fix" id="nx" ${F.page < pages - 1 ? "" : "disabled"}>পরের ›</button>` : "";
    $("#pv", v) && ($("#pv", v).onclick = () => { F.page--; draw(); }); $("#nx", v) && ($("#nx", v).onclick = () => { F.page++; draw(); });
    $$("tr[data-id]", v).forEach(r => r.onclick = () => chequeModal(S.cheques.find(c => c.id === r.dataset.id), draw));
  };
  const bind = (id, k) => { const el = $("#" + id, v); el.addEventListener("input", () => { F[k] = el.value; F.page = 0; draw(); }); };
  const pre = sessionStorage.getItem("nabiad_chq_ac"); if (pre) { sessionStorage.removeItem("nabiad_chq_ac"); F.code = pre; $("#k-c", v).value = pre; }
  bind("k-q", "q"); bind("k-f", "from"); bind("k-t", "to"); bind("k-c", "code"); bind("k-s", "status"); bind("k-u", "purpose");
  $("#k-x", v).onclick = () => exportXlsx({ Cheques: [CHQ_HEAD, ...filt().map(chqRow)] }, `Cheques_${today()}.xlsx`);
  $("#k-p", v).onclick = () => { F.page = 0; const keep = PS; draw(); window.print(); };
  draw();
}

/* ---------- daily closing ---------- */
const isFri = d => new Date(d + "T00:00:00").getDay() === 5;
const stepDay = (d, n) => { let x = addDays(d, n); if (CFG.SKIP_FRIDAY !== false && isFri(x)) x = addDays(x, n); return x; };
const workGap = (a, b) => { let n = 0; for (let d = addDays(a, 1); d < b; d = addDays(d, 1)) if (!isFri(d)) n++; return n; };
const fmtIn = n => n === null || n === undefined || n === "" || isNaN(n) ? "" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const same = (a, b) => Math.abs(num(a) - num(b)) < 0.005;
/* Previous | Date | Next on one line */
function dateNav(id, date) {
  return `<div class="dnav"><button class="btn" id="${id}-p" title="আগের দিন (শুক্রবার বাদ)">‹ আগের</button><input class="in big" type="date" id="${id}-d" value="${date}"><button class="btn" id="${id}-n" title="পরের দিন (শুক্রবার বাদ)">পরের ›</button></div>`;
}
function bindDateNav(v, id, draw) {
  const d = $(`#${id}-d`, v); d.onchange = draw;
  $(`#${id}-p`, v).onclick = () => { d.value = stepDay(d.value, -1); draw(); };
  $(`#${id}-n`, v).onclick = () => { d.value = stepDay(d.value, 1); draw(); };
}
const searchBox = (id, ph, extra = "") => `<div class="srch"><label class="si">${ico("search")}<input class="in" id="${id}" placeholder="${ph}" autocomplete="off" type="search"></label>${extra}</div>`;
const accHay = a => norm([a.code, a.holder, a.bank, a.branch, a.acno, a.type].join(" "));

/* drafts: kept on this device automatically, and on the server when "ড্রাফট সেভ" is pressed */
const DRAFT_KEY = d => "nabiad_draft_" + d;
const Draft = {
  local(d) { try { return JSON.parse(localStorage.getItem(DRAFT_KEY(d)) || "null"); } catch { return null; } },
  saveLocal(d, rows) { try { localStorage.setItem(DRAFT_KEY(d), JSON.stringify({ rows, at: new Date().toISOString(), by: S.me.name, local: true })); } catch { } },
  dropLocal(d) { try { localStorage.removeItem(DRAFT_KEY(d)); } catch { } },
  localDates() { const o = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("nabiad_draft_")) o.push(k.slice(13)); } return o.sort(); },
  async get(d) {
    const l = this.local(d); let s = null;
    if (navigator.onLine || DEMO) { try { s = await API.getDraft(d); } catch (e) { console.warn("draft", e); } }
    if (l && s) return new Date(l.at) > new Date(s.at) ? l : s; return l || s;
  },
  async save(d, rows) { this.saveLocal(d, rows); await API.saveDraft(d, rows); },
  async drop(d) { this.dropLocal(d); try { await API.deleteDraft(d); } catch { } }
};

async function vClosing(v) {
  const t = today(); let date = S.lastBal && S.lastBal < t ? stepDay(S.lastBal, 1) : t;
  if (date > t) date = t;
  v.innerHTML = head("দৈনিক ব্যাংক ক্লোজিং", `<span id="c-info" class="cinfo"></span>`) + `<div class="card navcard" style="margin-bottom:14px">${dateNav("c", date)}
   ${searchBox("c-q", "A/C খুঁজুন — কোড, হোল্ডার, ব্যাংক, A/C নং…", `<select class="in fix" id="c-f"><option value="">সব অ্যাকাউন্ট</option><option value="chg">শুধু আপডেট করা</option><option value="same">শুধু অপরিবর্তিত</option><option value="mv">আজ লেনদেন আছে</option></select>`)}
   <div id="c-msg" style="margin-top:10px"></div></div>
   <div class="card"><div id="c-body"><div class="empty">লোড হচ্ছে…</div></div></div>`;
  const body = $("#c-body", v); let autoT = null;
  async function draw() {
    date = $("#c-d", v).value; if (!date) return;
    body.innerHTML = `<div class="empty">লোড হচ্ছে…</div>`;
    let prev, ex;
    try { if (!navigator.onLine && !DEMO) throw new Error("offline"); [prev, ex] = await Promise.all([API.prevBalances(date), API.balancesOn(date)]); ex = { ...ex, ...pendingBal(date) }; }
    catch (e) {
      if (!isNetErr(e) && e.message !== "offline") throw e;
      const pds = pendingBalDates().filter(x => x < date).sort(), pd = pds.pop();
      prev = pd && (!S.snap || pd > S.snap.date) ? { date: pd, map: pendingBal(pd) } : S.snap && S.snap.date < date ? { date: S.snap.date, map: S.snap.map } : { date: null, map: {} };
      ex = pendingBal(date);
      if (!prev.date) { body.innerHTML = `<div class="alert am">ইন্টারনেট নেই এবং আগের দিনের ব্যালেন্স এই ডিভাইসে জমা নেই। একবার অনলাইনে ক্লোজিং পাতা খুললে পরে অফলাইনেও চলবে।</div>`; return; }
    }
    const accs = S.accounts.filter(a => a.daily && (a.status === "Active" || ex[a.code])).sort((a, b) => a.sort - b.sort);
    const has = Object.values(ex).some(r => r.total != null); const locked = has && (S.me.role !== "admin" || Object.values(ex).some(r => r.pending));
    const draft = has ? null : await Draft.get(date); const dr = draft?.rows || {};
    const cl = {}, tin = {}; S.cheques.forEach(c => { if (c.status === "Cleared" && c.sdate === date) { cl[c.code] = (cl[c.code] || 0) + c.amount; if (c.toac) tin[c.toac] = (tin[c.toac] || 0) + c.amount; } });
    const gap = prev.date ? workGap(prev.date, date) : 0;
    const msgs = [];
    if (has) msgs.push(`<div class="alert ${locked ? "rd" : "am"}">${locked ? "🔒 এই তারিখের ব্যালেন্স ফাইনাল সেভ হয়েছে। বদলাতে Admin কে বলুন।" : "⚠ এই তারিখ আগেই ফাইনাল সেভ আছে — সেভ করলে Admin হিসেবে নতুন মান বসবে।"}</div>`);
    else if (prev.date) msgs.push(`<div class="mut sm">আগের ডাটা: <b>${dmy(prev.date)}</b>${gap ? ` <b class="am">(মাঝে ${gap} কর্মদিবসের ডাটা নেই)</b>` : ""} · আগের দিনের ক্লোজিং নিজে থেকে বসানো আছে — শুধু যেগুলো বদলেছে সেগুলো লিখুন।</div>`);
    if (draft) msgs.push(`<div class="alert vi">📝 <span>ড্রাফট লোড হয়েছে — ${esc(draft.by || "")} · ${new Date(draft.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${draft.local ? " (এই ডিভাইস)" : ""}</span><button class="btn sm" id="c-dd" style="margin-left:auto">ড্রাফট বাদ দিন</button></div>`);
    if (isFri(date) && !has) msgs.push(`<div class="alert am">শুক্রবার — সাধারণত ব্যাংক বন্ধ থাকে। দরকার না হলে "পরের ›" চাপুন।</div>`);
    $("#c-msg", v).innerHTML = msgs.join("");
    $("#c-dd", v) && ($("#c-dd", v).onclick = async () => { if (!ask("এই তারিখের ড্রাফট মুছে আগের দিনের ক্লোজিং থেকে নতুন করে শুরু করবেন?")) return; await Draft.drop(date); draw(); });
    const rows = accs.map(a => {
      const p = prev.map[a.code] || {}, e = ex[a.code] || {}, d = dr[a.code] || {};
      const src = has ? e : d;
      return { a, code: a.code, holder: a.holder, prevT: p.total || 0, prevB: p.block || 0, chq: cl[a.code] || 0, tin: tin[a.code] || 0, od: src.od || 0, odp: src.odp || 0,
        total: has ? e.total : (d.tot ?? null), block: has ? (e.block ?? 0) : (d.blk ?? p.block ?? 0), remark: src.remark ?? src.rem ?? "" };
    });
    const B = a => brandOf(a);
    body.innerHTML = `<div class="tw cards closing" style="max-height:72vh"><table id="ct"><thead><tr><th>#</th><th>A/C</th><th class="r">আগের ক্লোজিং</th><th class="r c-dr">চেক খরচ</th><th class="r c-dr">অন্য খরচ</th><th class="r c-cr">ট্রান্সফার জমা</th><th class="r c-cr">অন্য জমা</th><th class="r">হিসাব মতে</th><th class="r c-bk">ব্যাংক ক্লোজিং</th><th class="r">BLOCK</th><th class="r">USABLE</th><th class="r">Diff</th><th>মন্তব্য</th></tr></thead><tbody>
    ${rows.map((r, i) => { const b = B(r.a); return `<tr data-i="${i}" class="${r.chq || r.tin ? "mv" : ""}"><td class="mut">${i + 1}</td><td class="acc-c" style="--b1:${b.c1}"><b>${esc(r.code)}</b>${r.chq || r.tin ? ` <span class="mvdot" title="আজ অ্যাপে লেনদেন আছে — যাচাই করুন">●</span>` : ""}<div class="mut sm">${esc(r.holder)}</div></td><td class="r num">${money(r.prevT)}</td><td class="r num c-dr">${r.chq ? money(r.chq) : "-"}</td>
     <td class="c-dr"><input class="cell od" value="${fmtIn(r.od || "")}" inputmode="decimal" ${locked ? "disabled" : ""}></td><td class="r num c-cr">${r.tin ? money(r.tin) : "-"}</td><td class="c-cr"><input class="cell odp" value="${fmtIn(r.odp || "")}" inputmode="decimal" ${locked ? "disabled" : ""}></td>
     <td class="r num exp"></td><td class="c-bk"><input class="cell tot" value="${r.total == null ? "" : fmtIn(r.total)}" data-dirty="${r.total == null ? "" : "1"}" inputmode="decimal" ${locked ? "disabled" : ""}></td><td><input class="cell blk" value="${fmtIn(r.block || "")}" inputmode="decimal" ${locked ? "disabled" : ""}></td>
     <td class="r num usa b"></td><td class="r num dif"></td><td><input class="cell t rem" value="${esc(r.remark)}" ${locked ? "disabled" : ""}></td></tr>`; }).join("")}
    <tr class="tot"><td></td><td>মোট <span class="mut sm" id="T-n"></span></td><td class="r num" id="T0"></td><td class="r num c-dr" id="T1"></td><td class="r num c-dr" id="T2"></td><td class="r num c-cr" id="T3"></td><td class="r num c-cr" id="T4"></td><td class="r num" id="T5"></td><td class="r num c-bk t-bank" id="T6"></td><td class="r num" id="T7"></td><td class="r num t-usa" id="T8"></td><td class="r num t-diff" id="T9"></td><td></td></tr></tbody></table></div>
    ${locked ? "" : `<div class="cbar"><button class="btn lg fix" id="c-draft">${ico("edit")} ড্রাফট সেভ</button><button class="btn pri lg fix" id="c-save">${ico("save")} ${date === today() ? "আজকের" : dmy(date)} ব্যালেন্স ফাইনাল সেভ</button><div class="hint" id="c-err"></div><div class="sp"></div><span class="mut sm" id="c-auto"></span></div>`}
    <div class="legend"><span><i class="lg-chg"></i>নীল = আপডেট করা</span><span><i class="lg-same"></i>কালো = আগের দিনের মতোই</span><span><i class="lg-mv"></i>আজ অ্যাপে লেনদেন আছে</span><span><i class="lg-dr"></i>খরচ</span><span><i class="lg-cr"></i>জমা</span></div>
    <div class="mut sm" style="margin-top:6px">ফাইনাল সেভের পর Staff আর বদলাতে পারবে না। মাঝপথে থামতে "ড্রাফট সেভ" চাপুন — এই ডিভাইসে নিজে থেকেও জমা হয়। Diff ≠ 0 হলে মন্তব্য বাধ্যতামূলক।</div>`;
    const trs = $$("#ct tbody tr[data-i]", body);
    const calc = () => {
      const T = Array(10).fill(0); let nChg = 0, nMv = 0;
      trs.forEach(tr => {
        const r = rows[+tr.dataset.i]; const od = num($(".od", tr).value), odp = num($(".odp", tr).value), ti = $(".tot", tr), blkI = $(".blk", tr), blk = num(blkI.value);
        const exp = r.prevT - r.chq - od + r.tin + odp;
        if (!ti.dataset.dirty && document.activeElement !== ti) ti.value = fmtIn(exp);
        const tot = ti.value.trim() === "" ? exp : num(ti.value), diff = tot - exp, usa = tot - blk;
        const chg = !same(tot, exp) || (has && !same(tot, r.prevT) && !same(tot, exp));
        ti.classList.toggle("chg", chg); blkI.classList.toggle("chg", !same(blk, r.prevB));
        $(".od", tr).classList.toggle("chg", od !== 0); $(".odp", tr).classList.toggle("chg", odp !== 0);
        tr.classList.toggle("chgrow", chg); if (chg) nChg++; if (r.chq || r.tin) nMv++;
        $(".exp", tr).textContent = money(exp); $(".usa", tr).textContent = money(usa); const d = $(".dif", tr); d.textContent = diff ? money(diff) : "0"; d.className = "r num dif " + (Math.abs(diff) > 0.001 ? "diffx" : "diff0");
        [r.prevT, r.chq, od, r.tin, odp, exp, tot, blk, usa, diff].forEach((x, i) => T[i] += x);
        Object.assign(r, { _od: od, _odp: odp, _tot: tot, _blk: blk, _diff: diff, _exp: exp, _rem: $(".rem", tr).value.trim(), _chg: chg, _dirty: !!ti.dataset.dirty });
      });
      T.forEach((x, i) => $("#T" + i, body).textContent = money0(x));
      $("#T-n", body).textContent = `(${rows.length})`;
      $("#c-info", v).innerHTML = rows.length ? `<span class="tag t-chg">আপডেট করা ${nChg}</span><span class="tag">অপরিবর্তিত ${rows.length - nChg}</span>${nMv ? `<span class="tag t-mv">লেনদেন ${nMv}</span>` : ""}` : "";
      filter();
    };
    const filter = () => {
      const q = norm($("#c-q", v).value), f = $("#c-f", v).value;
      trs.forEach(tr => { const r = rows[+tr.dataset.i]; const ok = (!q || accHay(r.a).includes(q)) && (!f || (f === "chg" && r._chg) || (f === "same" && !r._chg) || (f === "mv" && (r.chq || r.tin))); tr.style.display = ok ? "" : "none"; });
    };
    const collect = () => Object.fromEntries(rows.map(r => [r.code, { od: r._od || 0, odp: r._odp || 0, tot: r._dirty ? r._tot : null, blk: r._blk || 0, rem: r._rem || "" }]));
    const autosave = () => { if (locked) return; clearTimeout(autoT); autoT = setTimeout(() => { Draft.saveLocal(date, collect()); const a = $("#c-auto", body); if (a) a.textContent = "✓ এই ডিভাইসে অটো-সেভ " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }, 700); };
    $$("#ct input", body).forEach(i => i.addEventListener("input", () => { if (i.classList.contains("tot")) i.dataset.dirty = i.value.trim() === "" ? "" : "1"; calc(); autosave(); }));
    $$("#ct input.cell:not(.rem)", body).forEach(inp => {
      inp.addEventListener("focus", () => inp.select());
      inp.addEventListener("blur", () => { if (inp.value.trim() !== "") inp.value = fmtIn(num(inp.value)); calc(); });
      inp.addEventListener("keydown", e => { if (e.key !== "Enter") return; e.preventDefault(); let tr = inp.closest("tr").nextElementSibling; while (tr && tr.style.display === "none") tr = tr.nextElementSibling; const cls = [...inp.classList].find(c => ["od", "odp", "tot", "blk"].includes(c)); const nx = tr && $("." + cls, tr); if (nx) nx.focus(); });
    });
    $("#c-q", v).oninput = filter; $("#c-f", v).onchange = filter;
    calc();
    if (locked) return;
    $("#c-draft", body).onclick = async () => {
      calc(); const b = $("#c-draft", body); b.disabled = true;
      try { await Draft.save(date, collect()); toast("✔ ড্রাফট সেভ হয়েছে — পরে যেকোনো ডিভাইস থেকে চালিয়ে যেতে পারবেন"); }
      catch (e) { toast(isNetErr(e) ? "ইন্টারনেট নেই — ড্রাফট শুধু এই ডিভাইসে জমা আছে" : "সার্ভারে ড্রাফট সেভ হয়নি (এই ডিভাইসে জমা আছে): " + (e.message || e), "err"); }
      finally { b.disabled = false; }
    };
    $("#c-save", body).onclick = async () => {
      calc(); const err = $("#c-err", body); err.className = "hint rd"; err.textContent = "";
      const bad = rows.filter(r => Math.abs(r._diff) > 0.001 && !r._rem);
      if (bad.length) { err.textContent = `Diff আছে কিন্তু মন্তব্য নেই: ${bad.map(r => r.code).join(", ")}`; $("#c-q", v).value = ""; $("#c-f", v).value = ""; filter(); trs[rows.indexOf(bad[0])].scrollIntoView({ block: "center" }); $(".rem", trs[rows.indexOf(bad[0])]).focus(); return; }
      const tot = rows.reduce((s, r) => s + r._tot, 0), blk = rows.reduce((s, r) => s + r._blk, 0), nChg = rows.filter(r => r._chg).length;
      if (!ask(`${dmy(date)} — ফাইনাল সেভ\nমোট ক্লোজিং ৳ ${money0(tot)}, Block ${money0(blk)}, Usable ${money0(tot - blk)}\n${nChg}টি অ্যাকাউন্ট আপডেট, ${rows.length - nChg}টি আগের মতো।${S.me.role !== "admin" ? "\n\nসেভের পর আর বদলানো যাবে না (শুধু Admin পারবে)।" : ""}`)) return;
      $("#c-save", body).disabled = true;
      try {
        await API.saveBalances(date, rows.map(r => ({ code: r.code, total: r._tot, block: r._blk || null, remark: r._rem, od: r._od, odp: r._odp })), has && S.me.role === "admin");
        if (navigator.onLine && !Outbox.count()) S.lastBal = await API.lastBalDate(); else if (!S.lastBal || date > S.lastBal) S.lastBal = date;
        await Draft.drop(date); refreshBadges();
        toast(Outbox.count() ? "✔ অফলাইনে জমা হয়েছে — নেট এলে সিঙ্ক হবে" : "✔ ব্যালেন্স ফাইনাল সেভ হয়েছে");
        await draw();
        $("#c-msg", v).insertAdjacentHTML("afterbegin", `<div class="alert gr" style="margin-bottom:8px">✔ <span>${dmy(date)} ক্লোজিং সেভ হয়েছে।</span><a class="btn sm pri" style="margin-left:auto" href="#/crep" onclick="sessionStorage.setItem('nabiad_crep_date','${date}')">${ico("img")} রিপোর্ট দেখুন ও Boss-কে পাঠান</a></div>`);
      } catch (e) { err.textContent = e.message || String(e); toast(e.message || String(e), "err"); $("#c-save", body).disabled = false; }
    };
  }
  bindDateNav(v, "c", draw);
  await draw();
  return () => clearTimeout(autoT);
}

/* ---------- closing report + account history ---------- */
async function vCrep(v) {
  let date = sessionStorage.getItem("nabiad_crep_date") || S.lastBal || today(); sessionStorage.removeItem("nabiad_crep_date");
  const canShare = !!navigator.share;
  v.innerHTML = head("ব্যাংক ক্লোজিং রিপোর্ট", `<button class="btn" id="r-png">${ico("img")} ছবি</button><button class="btn" id="r-pdf">${ico("print")} PDF</button><button class="btn" id="r-xl">${ico("dl")} Excel</button>${canShare ? `<button class="btn" id="r-sh">${ico("share")} শেয়ার</button>` : ""}<button class="btn pri" id="r-em">${ico("mail")} Boss-কে ইমেইল</button>`) + `
   <div class="card noprint navcard" style="margin-bottom:14px">${dateNav("r", date)}${searchBox("r-q", "রিপোর্টে খুঁজুন — কোড, হোল্ডার, ব্যাংক…")}</div>
   <div class="card rep-wrap"><div class="rep-scroll"><div id="crep"></div></div></div>
   <div class="card noprint" style="margin-top:14px"><h3>অ্যাকাউন্ট ইতিহাস</h3><div class="row"><div style="flex:2 1 240px"><label class="f">A/C</label><div><input class="in" id="h-ac" placeholder="কোড টাইপ করুন"></div></div><div><label class="f">From</label><input class="in" type="date" id="h-f" value="${addDays(today(), -60)}"></div><div><label class="f">To</label><input class="in" type="date" id="h-t" value="${today()}"></div></div><div id="h-out" style="margin-top:12px"></div></div>`;
  let data = null, bm = {};
  async function load() { date = $("#r-d", v).value; bm = await balancesOn(date); draw(); }
  function draw() {
    const q = norm($("#r-q", v).value);
    const all = S.accounts.filter(a => a.daily && bm[a.code] && bm[a.code].total != null).sort((a, b) => a.sort - b.sort);
    const rows = all.filter(a => !q || accHay(a).includes(q)).map(a => ({ n: 0, a, total: bm[a.code].total, block: bm[a.code].block || 0, remark: bm[a.code].remark || "" }));
    rows.forEach((r, i) => r.n = i + 1); const T = rows.reduce((s, r) => ({ t: s.t + r.total, b: s.b + r.block }), { t: 0, b: 0 }); data = { rows, T, filtered: rows.length !== all.length, all: all.length };
    const wd = new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long" }), dl = new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const usaN = rows.filter(r => r.total - r.block > 0).length, by = (bm[all[0]?.code] || {}).by;
    $("#crep", v).innerHTML = rows.length ? `<div class="rep" id="crep-in">
      <div class="rep-hd"><div class="lg"><img src="icon-192.png" alt=""></div><div class="tt"><b>NABIAD GROUP</b><span>Daily Bank Closing Report · ব্যাংক ক্লোজিং রিপোর্ট${data.filtered ? ` · Filtered ${rows.length}/${all.length}` : ""}</span></div><div class="dt"><b>${dl}</b><span>${wd}</span></div></div>
      <div class="rep-kpi"><div><span>Accounts</span><b>${rows.length}</b></div><div class="k1"><span>Total Balance</span><b>৳ ${money0(T.t)}</b></div><div class="k2"><span>Block / Lien</span><b>৳ ${money0(T.b)}</b></div><div class="k3"><span>Usable (${usaN} A/C)</span><b>৳ ${money0(T.t - T.b)}</b></div></div>
      <table class="rep-t"><thead><tr><th class="r">#</th><th>A/C Code</th><th>Account Holder</th><th class="r">Total</th><th class="r bk">Block</th><th class="r us">Usable</th><th>Remarks</th></tr></thead><tbody>
      ${rows.map(r => { const u = r.total - r.block; return `<tr><td class="n">${r.n}</td><td class="cd"><i class="bdot" style="background:${brandOf(r.a).c1}"></i>${esc(r.a.code)}</td><td class="ho">${esc(r.a.holder)}</td><td class="r num">${money0(r.total)}</td><td class="r num ${r.block ? "bk" : "z"}">${r.block ? money0(r.block) : "—"}</td><td class="r num ${u > 0 ? "us" : "z"}">${u > 0 ? money0(u) : u < 0 ? money0(u) : "0"}</td><td class="rm">${esc(r.remark)}</td></tr>`; }).join("")}
      <tr class="tot"><td></td><td colspan="2">GRAND TOTAL</td><td class="r num">${money0(T.t)}</td><td class="r num">${money0(T.b)}</td><td class="r num">${money0(T.t - T.b)}</td><td></td></tr></tbody></table>
      <div class="rep-ft"><span>Generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${by ? " · Entered by " + esc(by) : ""} · Printed by ${esc(S.me.name)}</span><span>NABIAD Cheque &amp; Bank Control</span></div></div>` : `<div class="empty">${all.length ? "খোঁজার সাথে কিছু মেলেনি" : "এই তারিখে কোনো ব্যালেন্স সেভ নেই"}</div>`;
    fitRep();
  }
  function fitRep() { const el = $("#crep-in", v); if (!el) return; el.style.zoom = ""; const w = el.parentElement.clientWidth - 8; if (w < 1000) el.style.zoom = (w / 1000).toFixed(3); }
  async function canvas() { const el = $("#crep-in", v); if (!el) { toast("ডাটা নেই", "err"); return null; } await loadScript("vendor/html2canvas.min.js"); const z = el.style.zoom; el.style.zoom = ""; try { return await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", width: el.offsetWidth, windowWidth: 1200 }); } finally { el.style.zoom = z; } }
  const onRs = () => fitRep(); window.addEventListener("resize", onRs);
  bindDateNav(v, "r", load); $("#r-q", v).oninput = draw;
  $("#r-pdf", v).onclick = () => { if (!$("#crep-in", v)) return toast("ডাটা নেই", "err"); document.body.classList.add("print-rep"); const t = document.title; document.title = `Bank_Closing_${date}`; window.print(); document.title = t; setTimeout(() => document.body.classList.remove("print-rep"), 500); };
  $("#r-png", v).onclick = async () => { const cv = await canvas(); if (!cv) return; const a = document.createElement("a"); a.download = `Bank_Closing_${date}.png`; a.href = cv.toDataURL("image/png"); a.click(); };
  $("#r-sh", v) && ($("#r-sh", v).onclick = async () => {
    const cv = await canvas(); if (!cv) return; const blob = await new Promise(r => cv.toBlob(r, "image/png")); const file = new File([blob], `Bank_Closing_${date}.png`, { type: "image/png" });
    const T = data.T, txt = `${dmy(date)} Bank Closing — Total ৳ ${money0(T.t)} · Block ${money0(T.b)} · Usable ${money0(T.t - T.b)}`;
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: `Bank Closing ${dmy(date)}`, text: txt }); else await navigator.share({ title: `Bank Closing ${dmy(date)}`, text: txt }); } catch (e) { if (e.name !== "AbortError") toast("শেয়ার করা যায়নি: " + e.message, "err"); }
  });
  $("#r-em", v).onclick = () => {
    if (!data?.rows.length) return toast("ডাটা নেই", "err"); const T = data.T;
    const L = [`Bank Closing — ${dmy(date)}`, "", `Total Balance: ${money0(T.t)}`, `Block / Lien: ${money0(T.b)}`, `Usable: ${money0(T.t - T.b)}`, `Accounts: ${data.rows.length}`, "", ...data.rows.map(r => `${r.n}. ${r.a.code} — ${r.a.holder}: ${money0(r.total)}${r.block ? ` (Block ${money0(r.block)})` : ""}${r.remark ? " · " + r.remark : ""}`), "", `— ${S.me.name}, NABIAD Cheque & Bank Control`];
    let body = L.join("\n"); if (body.length > 1800) body = L.slice(0, 7).join("\n") + "\n\n(পূর্ণ রিপোর্ট PDF/ছবি সংযুক্ত করুন)\n— " + S.me.name;
    location.href = `mailto:${encodeURIComponent(CFG.BOSS_EMAIL || "")}?subject=${encodeURIComponent(`Bank Closing ${dmy(date)} — Usable ${money0(T.t - T.b)}`)}&body=${encodeURIComponent(body)}`;
  };
  $("#r-xl", v).onclick = () => data?.rows.length ? exportXlsx({ Closing: [[dmy2(date), "A/C", "Code", "TOTAL", "BLOCK", "USABLE", "REMARKS"], ...data.rows.map(r => [r.n, r.a.holder, r.a.code, r.total, r.block, r.total - r.block, r.remark]), ["", "TOTAL", "", data.T.t, data.T.b, data.T.t - data.T.b, ""]] }, `Closing_${date}.xlsx`) : toast("ডাটা নেই", "err");
  const hAc = suggest($("#h-ac", v), () => acItems(true), () => hist());
  async function hist() {
    const c = hAc.get()?.value; if (!c) return; const rows = await API.history(c, $("#h-f", v).value, $("#h-t", v).value);
    if (!rows.length) { $("#h-out", v).innerHTML = `<div class="empty">ডাটা নেই</div>`; return; }
    const max = Math.max(...rows.map(r => r.total)), min = Math.min(...rows.map(r => r.total)), W = 700, H = 120, rg = max - min || 1;
    const pts = rows.map((r, i) => `${(i / Math.max(1, rows.length - 1) * W).toFixed(1)},${(H - 8 - (r.total - min) / rg * (H - 16)).toFixed(1)}`).join(" ");
    $("#h-out", v).innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:120px"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><polyline fill="none" stroke="url(#lg)" stroke-width="2.5" points="${pts}"/></svg>
     <div class="mut sm">সর্বোচ্চ ${money0(max)} · সর্বনিম্ন ${money0(min)} · ${rows.length} দিন</div><div class="tw" style="max-height:300px;margin-top:8px"><table><thead><tr><th>তারিখ</th><th class="r">Total</th><th class="r">Block</th><th class="r">Usable</th><th>মন্তব্য</th></tr></thead><tbody>${[...rows].reverse().map(r => `<tr><td>${dmy(r.date)}</td><td class="r num">${money0(r.total)}</td><td class="r num">${r.block ? money0(r.block) : ""}</td><td class="r num">${money0(r.total - (r.block || 0))}</td><td class="mut sm">${esc(r.remark || "")}</td></tr>`).join("")}</tbody></table></div>`;
  }
  $("#h-f", v).onchange = hist; $("#h-t", v).onchange = hist; await load();
  return () => window.removeEventListener("resize", onRs);
}

/* ---------- reports ---------- */
function periodRange(p) {
  const t = new Date(), y = t.getFullYear(), m = t.getMonth();
  if (p === "today") return [today(), today()];
  if (p === "month") return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  if (p === "last") return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  if (p === "year") return [`${y}-01-01`, `${y}-12-31`];
  return null;
}
function group(arr, kf) { const m = new Map(); arr.forEach(c => { const k = kf(c); if (k === "" || k == null) return; const o = m.get(k) || { k, n: 0, amt: 0 }; o.n++; o.amt += c.amount; m.set(k, o); }); return [...m.values()]; }

/* ---------- cheque books / missing leaves ---------- */
function bookModal(b, after) {
  b = b || { code: "", series: "", first: "", last: "", track: "", status: "Active", note: "" };
  modal(`<h2>${b.id ? "বই এডিট" : "নতুন চেক বই"}</h2><div class="grid" style="gap:10px">
   <div><label class="f">A/C Code</label><select class="in" id="b-c">${S.accounts.map(a => `<option ${a.code === b.code ? "selected" : ""}>${esc(a.code)}</option>`).join("")}</select></div>
   <div class="row"><div><label class="f">সিরিজ (CD/SB…)</label><input class="in" id="b-s" value="${esc(b.series || "")}"></div><div><label class="f">Status</label><select class="in" id="b-st">${["Active", "Finished", "Lost"].map(s => `<option ${s === b.status ? "selected" : ""}>${s}</option>`).join("")}</select></div></div>
   <div class="row"><div><label class="f">প্রথম পাতা</label><input class="in" id="b-f" value="${b.first ?? ""}" inputmode="numeric"></div><div><label class="f">শেষ পাতা</label><input class="in" id="b-l" value="${b.last ?? ""}" inputmode="numeric"></div><div><label class="f">ট্র্যাক শুরু (ঐচ্ছিক)</label><input class="in" id="b-t" value="${b.track ?? ""}" inputmode="numeric"></div></div>
   <div class="mut sm">ট্র্যাক শুরু = সিস্টেম চালুর পর যে পাতা থেকে মিসিং গোনা শুরু হবে (আগের পাতাগুলো এন্ট্রি হয়নি বলে মিসিং ধরা হবে না)।</div>
   <div><label class="f">নোট</label><input class="in" id="b-n" value="${esc(b.note || "")}"></div>
   <div class="row"><button class="btn pri" id="b-ok">সেভ</button>${b.id ? `<button class="btn bad" id="b-dl">মুছুন</button>` : ""}<button class="btn" id="b-x">বাতিল</button></div></div>`, (root, close) => {
    $("#b-x", root).onclick = close;
    $("#b-ok", root).onclick = async () => { const first = parseInt($("#b-f", root).value); if (!first) return toast("প্রথম পাতা দিন", "err"); try { await API.upsertBook({ id: b.id, code: $("#b-c", root).value, series: $("#b-s", root).value.trim(), first, last: parseInt($("#b-l", root).value) || null, track: parseInt($("#b-t", root).value) || null, status: $("#b-st", root).value, note: $("#b-n", root).value.trim() }); await reload(); close(); after(); toast("সেভ হয়েছে"); } catch (e) { toast(e.message, "err"); } };
    $("#b-dl", root) && ($("#b-dl", root).onclick = async () => { if (!ask("এই বই মুছবেন?")) return; await API.deleteBook(b.id); await reload(); close(); after(); });
  });
}
async function vBooks(v) {
  const admin = S.me.role === "admin";
  const draw = () => {
    const am = accMap(), rows = S.books.map(b => ({ b, st: bookStats(b) })), miss = rows.reduce((s, r) => s + (r.b.status === "Active" ? r.st.missing.length : 0), 0);
    v.innerHTML = head("চেক বই ও মিসিং পাতা", admin ? `<button class="btn pri" id="bk-add">${ico("plus")} নতুন বই</button>` : "") + (miss ? `<div class="alert rd" style="margin-bottom:14px">📚 মোট <b>${miss}</b>টি পাতা মিসিং — নিচের লাল তালিকা দেখুন।</div>` : `<div class="alert gr" style="margin-bottom:14px">✔ কোনো মিসিং পাতা নেই</div>`) +
      `<div class="card flush">${rows.length ? `<div class="tw cards"><table><thead><tr><th>A/C</th><th>সিরিজ</th><th class="r">প্রথম–শেষ</th><th class="r">ট্র্যাক</th><th class="r">ব্যবহৃত</th><th class="r">সর্বশেষ</th><th class="r">বাকি</th><th>মিসিং পাতা</th><th>Status</th>${admin ? "<th></th>" : ""}</tr></thead><tbody>${rows.map(({ b, st }) => `<tr><td><b>${esc(b.code)}</b><div class="mut sm">${esc((am[b.code] || {}).holder || "")}</div></td><td>${esc(b.series || "")}</td><td class="r num">${b.first}–${b.last ?? "?"}</td><td class="r num">${b.track ?? "—"}</td><td class="r num">${st.used}</td><td class="r num">${st.maxUsed ?? "—"}</td><td class="r num">${st.remaining ?? "—"}</td>
       <td>${st.missing.length ? `<span class="rd b">${st.missing.length}টি:</span> <span class="sm">${st.missing.slice(0, 30).join(", ")}${st.missing.length > 30 ? "…" : ""}</span>` : `<span class="mut">—</span>`}</td><td>${esc(b.status)}</td>${admin ? `<td><button class="btn sm" data-e="${b.id}">✎</button></td>` : ""}</tr>`).join("")}</tbody></table></div>` : `<div class="empty">এখনো কোনো চেক বই যোগ করা হয়নি${admin ? ' — "+ নতুন বই" চাপুন' : ""}</div>`}</div>`;
    $("#bk-add", v) && ($("#bk-add", v).onclick = () => bookModal(null, draw)); $$("[data-e]", v).forEach(b => b.onclick = () => bookModal(S.books.find(x => x.id === b.dataset.e), draw));
  };
  draw();
}

/* ---------- admin ---------- */
const BANKS = ["United Commercial Bank PLC|UCB", "BRAC Bank PLC|BBL", "Dutch-Bangla Bank PLC|DBBL", "Pubali Bank PLC|PBL", "Eastern Bank PLC|EBL", "National Bank PLC|NBL", "Islami Bank Bangladesh PLC|IBBL", "Standard Bank PLC|SBL", "IFIC Bank PLC|IFIC", "Mercantile Bank PLC|MBL", "Agrani Bank PLC|ABL", "Sonali Bank PLC|SONALI", "Janata Bank PLC|JANATA", "Rupali Bank PLC|RUPALI", "The City Bank PLC|CITY", "Prime Bank PLC|PRIME", "Bank Asia PLC|BAL", "Dhaka Bank PLC|DHAKA", "Jamuna Bank PLC|JBL", "Mutual Trust Bank PLC|MTBL", "Southeast Bank PLC|SEBL", "ONE Bank PLC|ONE", "Trust Bank PLC|TBL", "Uttara Bank PLC|UBL", "AB Bank PLC|AB", "NCC Bank PLC|NCC", "The Premier Bank PLC|PREMIER", "EXIM Bank PLC|EXIM", "Al-Arafah Islami Bank PLC|AIBL", "Shahjalal Islami Bank PLC|SJIBL", "First Security Islami Bank PLC|FSIBL", "Social Islami Bank PLC|SIBL", "Standard Chartered Bank|SCB", "HSBC|HSBC", "Bangladesh Krishi Bank|BKB", "Nagad (MFS)|NAGAD", "bKash (MFS)|BKASH"];
const AC_TYPES = ["Current", "Savings", "Al-Wadeeah Current (AWCA)", "Mudaraba Savings (MSA)", "Mudaraba Short Notice (MSNA)", "SND / Short Notice", "Current (VIP Banking)", "Savings (Imperial Priority)", "Savings (Islamic)", "OD", "CC / COD", "Term Loan", "FDR", "Credit Card Cheque", "MFS", "Other"];
function datalist(id, values) { const u = [...new Set(values.filter(Boolean).map(x => String(x).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)).slice(0, 400); return `<datalist id="${id}">${u.map(x => `<option value="${esc(x)}">`).join("")}</datalist>`; }
/* ---------- bank details helpers: routing / SWIFT / completeness / share ---------- */
// commonly published SWIFT/BIC codes — only offered as a suggestion, always confirm with the bank
const SWIFT = { BBL: "BRAKBDDH", DBBL: "DBBLBDDH", IBBL: "IBBLBDDH", PBL: "PUBABDDH", EBL: "EBLDBDDH", UCB: "UCBLBDDH", CITY: "CIBLBDDH", PRIME: "PRBLBDDH", SCB: "SCBLBDDX", HSBC: "HSBCBDDH", SONALI: "BSONBDDH", JANATA: "JANBBDDH", ABL: "AGBKBDDH", RUPALI: "RUPBBDDH", NBL: "NBLBBDDH", SBL: "SDBLBDDH", IFIC: "IFICBDDH", MBL: "MBLBBDDH", BAL: "BALBBDDH", DHAKA: "DHBLBDDH", JBL: "JAMUBDDH", MTBL: "MTBLBDDH", SEBL: "SEBDBDDH", ONE: "ONEBBDDH", TBL: "TTBLBDDH", UBL: "UTBLBDDH", AB: "ABBLBDDH", NCC: "NCCLBDDH", PREMIER: "PRMRBDDH", EXIM: "EXBKBDDH", AIBL: "ALARBDDH", SJIBL: "SJBLBDDH", FSIBL: "FSEBBDDH", SIBL: "SOIVBDDH", BKB: "BKBABDDH" };
const bankPrefix = name => { const bk = BANKS.find(b => b.split("|")[0].toLowerCase() === String(name || "").trim().toLowerCase()); return bk ? bk.split("|")[1] : ""; };
const isMFS = a => /\bMFS\b|bkash|nagad|rocket/i.test(`${a.bank} ${a.type}`);
const ACC_FIELDS = [["holder", "হোল্ডারের নাম"], ["bank", "ব্যাংক"], ["acno", "A/C নং"], ["branch", "শাখা"], ["routing", "Routing নং"], ["type", "ধরন"]];
const accNeed = a => ACC_FIELDS.filter(([k]) => !(isMFS(a) && ["branch", "routing", "acno", "type"].includes(k)));
function accMissing(a) { return accNeed(a).filter(([k]) => !String(a[k] || "").trim()).map(([k, l]) => ({ k, l })); }
const accPct = a => { const need = accNeed(a).length; return Math.round((need - accMissing(a).length) / need * 100); };
const fmtAcno = s => String(s || "").replace(/\s+/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
function accText(list, opt = {}) {
  return list.map((a, i) => [list.length > 1 ? `${i + 1})` : "", a.bank && `Bank: ${a.bank}`, a.branch && `Branch: ${a.branch}`, !opt.cheque && a.routing && `Routing No: ${a.routing}`, !opt.cheque && a.swift && `SWIFT: ${a.swift}`, a.holder && `A/C Name: ${a.holder}`, a.acno && `A/C No: ${a.acno}`].filter(Boolean).join("\n")).join("\n\n");
}
async function copyText(t, msg = "কপি হয়েছে") { try { await navigator.clipboard.writeText(t); toast(msg); } catch { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch { toast("কপি করা যায়নি", "err"); } ta.remove(); } }
const bookBlob = async a => { const u = await API.photoUrl(a.book_photo); const r = await fetch(u); return await r.blob(); };
const pngOf = async blob => { const bm = await createImageBitmap(blob), cv = document.createElement("canvas"); cv.width = bm.width; cv.height = bm.height; cv.getContext("2d").drawImage(bm, 0, 0); return await new Promise(r => cv.toBlob(r, "image/png")); };
const dlBlob = (blob, name) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
function viewBookPhoto(a) {
  modal(`<h2>${ico("img")} Cheque book · ${esc(a.code)}</h2><div class="mut sm">${esc(a.holder || "")} · ${esc(a.bank || "")}</div><div id="bk-i" style="margin-top:10px"><div class="skel" style="height:200px"></div></div><div class="row" style="margin-top:12px"><button class="btn pri" id="bk-s">${ico("share")} শেয়ার</button><button class="btn fix" id="bk-x">বন্ধ</button></div>`, (root, close) => {
    API.photoUrl(a.book_photo).then(u => $("#bk-i", root).innerHTML = `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="cheque book" style="width:100%;border-radius:12px;border:1px solid var(--line)"></a>`).catch(e => $("#bk-i", root).innerHTML = `<div class="mut">ছবি লোড হয়নি: ${esc(e.message || e)}</div>`);
    $("#bk-x", root).onclick = close; $("#bk-s", root).onclick = () => { close(); shareAccounts([a], "chq"); };
  });
}
function shareAccounts(list, startMode) {
  if (!list.length) return; let mode = startMode || "full", blobs = null;
  const withPh = () => list.filter(a => a.book_photo);
  const getBlobs = async () => blobs || (blobs = await Promise.all(withPh().map(async a => ({ a, blob: await bookBlob(a) }))));
  const cardHtml = () => `<div class="shc" id="sh-card">${list.map(a => { const b = brandOf(a); return `<div class="shc-i" style="--b1:${b.c1};--b2:${b.c2}"><div class="shc-h"><span class="blogo">${esc(b.s)}</span><b>${esc(a.bank || "")}</b></div><div class="shc-b"><div class="shc-n">${esc(a.holder || "")}</div><div class="shc-a">${esc(fmtAcno(a.acno) || "—")}</div><div class="shc-m">${[a.branch, a.routing && "Routing " + a.routing].filter(Boolean).map(esc).join(" · ")}</div></div></div>`; }).join("")}<div class="shc-f">NABIAD GROUP</div></div>`;
  modal(`<h2>${ico("share")} ব্যাংক তথ্য শেয়ার <span class="tag">${list.length}</span></h2>
   <div class="seg" id="sh-mode" style="margin-bottom:10px"><span class="chip" data-m="full">সব তথ্য</span><span class="chip" data-m="chq">A/C with Cheque</span></div>
   <label class="f">যা পাঠানো হবে <span class="mut">(চাইলে বদলাতে পারেন)</span></label><textarea class="in" id="sh-t" rows="${Math.min(14, list.length * 6 + 1)}" style="height:auto;font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.5"></textarea>
   <div id="sh-ph"></div><div id="sh-warn"></div>
   <div class="shgrid" id="sh-btns"></div>
   <div id="sh-prev" style="position:absolute;left:-9999px;top:0"></div>
   <div class="row" style="margin-top:12px"><button class="btn fix" id="sh-x">বন্ধ</button></div>`, (root, close) => {
    const ta = $("#sh-t", root), btns = $("#sh-btns", root);
    const warn = () => {
      const miss = list.filter(a => accMissing(a).some(m => ["bank", "acno", "holder"].includes(m.k) || (mode === "full" && ["branch", "routing"].includes(m.k))));
      const nop = mode === "chq" ? list.filter(a => !a.book_photo) : [];
      $("#sh-warn", root).innerHTML = (miss.length ? `<div class="alert am" style="margin-top:8px">⚠ <span>কিছু তথ্য বাকি আছে: ${miss.map(a => `<b>${esc(a.code)}</b> (${accMissing(a).filter(m => ["bank", "acno", "holder", ...(mode === "full" ? ["branch", "routing"] : [])].includes(m.k)).map(m => m.l).join(", ")})`).join(" · ")}</span></div>` : "") + (nop.length ? `<div class="alert am" style="margin-top:8px">📷 <span>Cheque book-এর ছবি নেই: ${nop.map(a => `<b>${esc(a.code)}</b>`).join(", ")} — অ্যাকাউন্ট এডিটে ছবি যোগ করুন</span></div>` : "");
    };
    const phStrip = async () => {
      const box = $("#sh-ph", root); if (mode !== "chq") return box.innerHTML = ""; const w = withPh(); if (!w.length) return box.innerHTML = "";
      box.innerHTML = `<div class="phstrip">${w.map(a => `<div class="phi"><img data-c="${esc(a.code)}" alt=""><span>${esc(a.code)}</span></div>`).join("")}</div>`;
      for (const a of w) { try { const u = await API.photoUrl(a.book_photo); const im = $(`img[data-c="${CSS.escape(a.code)}"]`, box); if (im) im.src = u; } catch { } }
    };
    const draw = () => {
      $$("#sh-mode .chip", root).forEach(x => x.classList.toggle("on", x.dataset.m === mode));
      ta.value = accText(list, { cheque: mode === "chq" });
      const chq = mode === "chq", hasPh = withPh().length > 0;
      btns.innerHTML = `<button class="btn" data-s="copy">${ico("copy")} কপি</button>` +
        (chq && hasPh ? `<button class="btn pri" data-s="withph">${ico("share")} ছবিসহ শেয়ার</button>` : "") +
        `<button class="btn wa" data-s="wa">${ico("share")} WhatsApp</button>` +
        (chq && hasPh ? `<button class="btn" data-s="cpimg">${ico("img")} ছবি কপি</button><button class="btn" data-s="dlimg">${ico("img")} ছবি ডাউনলোড</button>` : "") +
        (!chq && navigator.share ? `<button class="btn" data-s="native">${ico("share")} অন্য অ্যাপে</button>` : "") +
        `<button class="btn" data-s="mail">${ico("mail")} ইমেইল</button>` + (!chq ? `<button class="btn" data-s="img">${ico("img")} কার্ড ছবি</button>` : "");
      warn(); phStrip();
    };
    draw();
    $$("#sh-mode .chip", root).forEach(c => c.onclick = () => { mode = c.dataset.m; draw(); });
    $("#sh-x", root).onclick = close;
    btns.onclick = async e => {
      const b = e.target.closest("[data-s]"); if (!b) return; const t = ta.value.trim(), k = b.dataset.s;
      if (k === "copy") return copyText(t, "✔ কপি হয়েছে — যেখানে খুশি paste করুন");
      if (k === "wa") return window.open("https://wa.me/?text=" + encodeURIComponent(t), "_blank", "noopener");
      if (k === "mail") return location.href = `mailto:?subject=${encodeURIComponent("Bank details — " + (list[0].holder || ""))}&body=${encodeURIComponent(t)}`;
      if (k === "native") { try { await navigator.share({ title: "Bank details", text: t }); } catch (e) { if (e.name !== "AbortError") toast(e.message, "err"); } return; }
      b.disabled = true;
      try {
        if (k === "withph" || k === "dlimg" || k === "cpimg") {
          const bl = await getBlobs(), files = bl.map(x => new File([x.blob], `${x.a.code}_cheque.jpg`, { type: "image/jpeg" }));
          if (k === "withph") {
            if (navigator.canShare && navigator.canShare({ files })) { try { await navigator.share({ files, text: t, title: "Bank details" }); } catch (e) { if (e.name !== "AbortError") throw e; } }
            else { await copyText(t, "✔ টেক্সট কপি হয়েছে"); files.forEach(f => dlBlob(f, f.name)); toast("ছবি ডাউনলোড হয়েছে — WhatsApp-এ ছবি attach করে টেক্সট paste করুন"); }
          } else if (k === "dlimg") { files.forEach(f => dlBlob(f, f.name)); toast("ছবি ডাউনলোড হয়েছে"); }
          else { await navigator.clipboard.write([new ClipboardItem({ "image/png": await pngOf(bl[0].blob) })]); toast(bl.length > 1 ? "✔ প্রথম ছবিটি কপি হয়েছে (বাকিগুলো ডাউনলোড করুন)" : "✔ ছবি কপি হয়েছে — chat-এ paste করুন"); }
        } else if (k === "img") {
          const host = $("#sh-prev", root); host.innerHTML = cardHtml();
          await loadScript("vendor/html2canvas.min.js"); const cv = await html2canvas($("#sh-card", host), { scale: 2, backgroundColor: null }); const blob = await new Promise(r => cv.toBlob(r, "image/png")); const file = new File([blob], `Bank_details_${list[0].code}.png`, { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: "Bank details" }); } catch (e) { if (e.name !== "AbortError") throw e; } }
          else { dlBlob(blob, file.name); toast("ছবি ডাউনলোড হয়েছে"); }
        }
      } catch (e) { toast("ব্যর্থ: " + (e.message || e), "err"); }
      b.disabled = false;
    };
  });
}

/* ---------- account form (new / edit) with live preview ---------- */
function accountModal(a, after) {
  const isNew = !a; a = { code: "", holder: "", bank: "", branch: "", acno: "", type: "", routing: "", swift: "", note: "", daily: true, status: "Active", sort: Math.max(0, ...S.accounts.map(x => x.sort || 0)) + 1, ...(a || {}) };
  const banks = [...new Set([...BANKS.map(b => b.split("|")[0]), ...S.accounts.map(x => x.bank).filter(Boolean)])].sort();
  const quickTypes = ["Current", "Savings", "SND / Short Notice", "OD", "CC / COD", "MFS"];
  modal(`<div class="accf"><h2>${isNew ? "➕ নতুন অ্যাকাউন্ট" : "✏️ অ্যাকাউন্ট এডিট"}${isNew ? "" : ` <span class="tag" style="background:rgba(255,255,255,.22);color:#fff;border-color:rgba(255,255,255,.3)">${esc(a.code)}</span>`}</h2>
   <div class="accf-g"><div class="accf-form">
    <div class="fsec"><div class="fst"><i>1</i>ব্যাংক</div>
     <div class="fr2"><div><label class="f">ব্যাংক *</label><div><input class="in" id="a-b" value="${esc(a.bank || "")}" placeholder="টাইপ করুন: brac, dbbl, pubali…" autocomplete="off"></div></div>
     <div><label class="f">শাখা</label><input class="in" id="a-br" list="dl-branch" value="${esc(a.branch || "")}" placeholder="যেমন: Gulshan Branch, Dhaka" autocomplete="off"></div></div>
     <div class="fr2"><div><label class="f">Routing নং <span class="mut">(৯ ডিজিট)</span></label><input class="in num" id="a-r" value="${esc(a.routing || "")}" inputmode="numeric" maxlength="9" placeholder="চেকের নিচে / স্টেটমেন্টে থাকে" autocomplete="off"><div class="hint" id="a-rh"></div></div>
     <div><label class="f">SWIFT <span class="mut">(বিদেশি লেনদেনে)</span></label><input class="in" id="a-w" value="${esc(a.swift || "")}" placeholder="যেমন: BRAKBDDH" autocomplete="off" style="text-transform:uppercase"><div class="hint" id="a-wh"></div></div></div></div>
    <div class="fsec"><div class="fst"><i>2</i>অ্যাকাউন্ট</div>
     <div><label class="f">হোল্ডার (অ্যাকাউন্টের নাম) *</label><input class="in" id="a-h" list="dl-holder" value="${esc(a.holder || "")}" autocomplete="off"></div>
     <div class="fr2"><div><label class="f">A/C নং *</label><input class="in num" id="a-n" value="${esc(a.acno || "")}" inputmode="numeric" autocomplete="off"><div class="hint" id="a-nh"></div></div>
     <div><label class="f">Code <span class="mut">(BANK-শেষ ৩ ডিজিট)</span></label><input class="in" id="a-c" value="${esc(a.code)}" ${isNew ? "" : "disabled"} autocomplete="off" style="text-transform:uppercase"><div class="hint" id="a-ch"></div></div></div>
     <div><label class="f">ধরন</label><div class="chips" id="a-tq">${quickTypes.map(t => `<span class="chip" data-ty="${esc(t)}">${esc(t)}</span>`).join("")}</div><input class="in" id="a-t" list="dl-type" value="${esc(a.type || "")}" placeholder="অথবা লিখুন" autocomplete="off" style="margin-top:6px"></div></div>
    <div class="fsec"><div class="fst"><i>3</i>সেটিংস</div>
     <div class="fr3"><div><label class="f">দৈনিক ক্লোজিং-এ</label><label class="sw2"><input type="checkbox" id="a-d" ${a.daily ? "checked" : ""}><i></i><span>আসবে</span></label></div><div><label class="f">Status</label><div class="seg" id="a-s">${["Active", "Closed"].map(s => `<span class="chip ${s === a.status ? "on" : ""}" data-st="${s}">${s}</span>`).join("")}</div></div><div><label class="f">ক্রম</label><input class="in" id="a-o" value="${a.sort}" inputmode="numeric"></div></div>
     <div><label class="f">Cheque book-এর ছবি <span class="mut">(পার্টিকে পাঠানোর জন্য)</span></label><div class="bph"><div id="a-bphw" class="bph-w hide"><img id="a-bphi" alt=""></div><div class="row" style="gap:8px"><label class="btn sm" for="a-bpin">${ico("cam")} ছবি তুলুন / বাছুন</label><input type="file" id="a-bpin" accept="image/*" hidden><button class="btn sm ghost hide" id="a-bpx" type="button">মুছুন</button></div></div></div>
     <div><label class="f">নোট <span class="mut">(ঐচ্ছিক)</span></label><input class="in" id="a-note" value="${esc(a.note || "")}" placeholder="যেমন: OD limit 1.5 Cr, signatory…" autocomplete="off"></div></div>
   </div>
   <aside class="accf-side"><div class="mut xs" style="margin-bottom:6px">প্রিভিউ</div><div id="a-prev"></div><div id="a-comp" style="margin-top:12px"></div></aside></div>
   <div class="row accf-bar"><button class="btn pri fix" id="a-ok">${ico("save")} সেভ</button><button class="btn fix" id="a-x">বাতিল</button>${isNew ? "" : `<button class="btn fix" id="a-sh" style="margin-left:auto">${ico("share")} শেয়ার</button>`}</div></div>
   ${datalist("dl-branch", S.accounts.map(x => x.branch))}${datalist("dl-holder", S.accounts.map(x => x.holder))}${datalist("dl-type", [...AC_TYPES, ...S.accounts.map(x => x.type)])}`, (root, close) => {
    root.querySelector(".modal").classList.add("wide");
    const g = id => $("#" + id, root); let touched = !isNew, status = a.status;
    suggest(g("a-b"), () => banks.map(b => ({ value: b, label: "", sub: bankPrefix(b) })), it => { if (it) { g("a-b").value = it.value; upd(); g("a-br").focus(); } });
    g("a-b").addEventListener("blur", () => setTimeout(() => { g("a-b").value = g("a-b").value.replace(/\s*\(\)\s*$/, ""); upd(); }, 150));
    g("a-c").addEventListener("input", () => touched = true);
    $$("#a-tq .chip", root).forEach(c => c.onclick = () => { g("a-t").value = c.dataset.ty; upd(); });
    $$("#a-s .chip", root).forEach(c => c.onclick = () => { status = c.dataset.st; $$("#a-s .chip", root).forEach(x => x.classList.toggle("on", x === c)); upd(); });
    const cur = () => ({ code: g("a-c").value.trim().toUpperCase(), holder: g("a-h").value.trim(), bank: g("a-b").value.replace(/\s*\(\)\s*$/, "").trim(), branch: g("a-br").value.trim(), acno: g("a-n").value.replace(/\s+/g, "").trim(), type: g("a-t").value.trim(), routing: g("a-r").value.replace(/\D/g, ""), swift: g("a-w").value.trim().toUpperCase(), note: g("a-note").value.trim(), daily: g("a-d").checked, status, sort: parseInt(g("a-o").value) || 0 });
    function upd() {
      const c = cur(), pre = bankPrefix(c.bank) || (S.accounts.find(x => x.bank === c.bank)?.code.split("-")[0] || ""), d = c.acno.replace(/\D/g, "");
      if (isNew && !touched && pre && d.length >= 3) { g("a-c").value = `${pre}-${d.slice(-3)}`; c.code = g("a-c").value; }
      const dup = isNew && c.code && S.accounts.find(x => x.code === c.code), dupNo = d && S.accounts.find(x => x.code !== a.code && (x.acno || "").replace(/\D/g, "") === d);
      g("a-ch").innerHTML = dup ? `<span class="rd">এই Code আগেই আছে (${esc(dup.holder)})</span>` : "";
      g("a-nh").innerHTML = dupNo ? `<span class="am">⚠ এই A/C নং আগেই আছে: ${esc(dupNo.code)}</span>` : d ? `<span class="mut">${esc(fmtAcno(d))} · ${d.length} ডিজিট</span>` : "";
      g("a-rh").innerHTML = !c.routing ? "" : c.routing.length === 9 ? `<span class="gr">✓ ঠিক আছে</span>` : `<span class="am">${c.routing.length}/9 ডিজিট</span>`;
      const sw = SWIFT[pre]; g("a-wh").innerHTML = sw && c.swift !== sw ? `<button class="btn sm ghost" id="a-ws">💡 ${sw} বসান</button> <span class="mut xs">ব্যাংক থেকে নিশ্চিত হয়ে নিন</span>` : "";
      $("#a-ws", root) && ($("#a-ws", root).onclick = e => { e.preventDefault(); g("a-w").value = sw; upd(); });
      $$("#a-tq .chip", root).forEach(x => x.classList.toggle("on", x.dataset.ty === c.type));
      const b = brandOf(c.code ? c : { bank: c.bank }), miss = accMissing(c), pct = accPct(c);
      g("a-prev").innerHTML = `<div class="card acc" style="--b1:${b.c1};--b2:${b.c2};margin:0"><div class="hd"><span class="blogo">${esc(b.s)}</span><span class="code">${esc(c.code || "CODE")}</span>${c.type ? `<span class="tag">${esc(c.type)}</span>` : ""}</div><div class="bd"><div class="b">${esc(c.holder || "হোল্ডারের নাম")}</div><div class="bk">${esc(c.bank || "ব্যাংক")}${c.branch ? " · " + esc(c.branch) : ""}</div><div class="no"><span>${esc(fmtAcno(c.acno) || "A/C নং")}</span></div><div class="mut xs">${[c.routing && "Routing " + c.routing, c.swift && "SWIFT " + c.swift].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</div></div></div>`;
      g("a-comp").innerHTML = `<div class="cmp"><div class="cmp-t"><b>তথ্য ${pct}% সম্পূর্ণ</b></div><div class="bar"><i style="width:${pct}%;background:${pct === 100 ? "var(--g-green)" : pct >= 60 ? "var(--g-amber)" : "var(--g-red)"}"></i></div>${miss.length ? `<div class="mut xs" style="margin-top:6px">বাকি: ${miss.map(m => m.l).join(", ")}</div>` : `<div class="gr xs" style="margin-top:6px">✓ পার্টিকে শেয়ার করার জন্য প্রস্তুত</div>`}</div>`;
    }
    $$("input", root).forEach(i => i.addEventListener("input", upd)); g("a-d").addEventListener("change", upd); upd();
    const ph = { blob: null, remove: false }, showPh = src => { g("a-bphi").src = src; g("a-bphw").classList.remove("hide"); g("a-bpx").classList.remove("hide"); }, hidePh = () => { g("a-bphw").classList.add("hide"); g("a-bpx").classList.add("hide"); g("a-bphi").removeAttribute("src"); };
    if (a.book_photo) API.photoUrl(a.book_photo).then(showPh).catch(() => { });
    g("a-bpin").onchange = async () => { const f = g("a-bpin").files[0]; if (!f) return; try { ph.blob = await compressImage(f); ph.remove = false; showPh(URL.createObjectURL(ph.blob)); } catch (e) { toast(e.message, "err"); } g("a-bpin").value = ""; };
    g("a-bpx").onclick = () => { ph.blob = null; ph.remove = true; hidePh(); };
    g("a-x").onclick = close;
    g("a-sh") && (g("a-sh").onclick = () => { close(); shareAccounts([{ ...a, ...cur(), code: a.code }]); });
    g("a-ok").onclick = async () => {
      const c = cur(); if (!c.bank) return toast("ব্যাংক বাছুন", "err"), g("a-b").focus(); if (!c.code) return toast("Code দিন", "err"), g("a-c").focus();
      if (isNew && S.accounts.some(x => x.code === c.code)) return toast("এই Code আগেই আছে", "err");
      if (c.routing && c.routing.length !== 9 && !ask("Routing নং ৯ ডিজিট নয়। তবুও সেভ করবেন?")) return;
      const b = g("a-ok"); b.disabled = true;
      try { const row = { ...c }; if (!isNew) row.code = a.code; if (ph.blob) { const pth = `books/${norm(row.code)}_${Date.now()}.jpg`; await API.uploadPhoto(pth, ph.blob); row.book_photo = pth; } else if (ph.remove && a.book_photo) row.book_photo = null; await API.upsertAccount(row); await reload(); close(); after && after(); toast("✔ সেভ হয়েছে"); }
      catch (e) { toast(/routing|swift|note|book_photo|column/i.test(e.message || "") ? "নতুন ঘর (Routing/SWIFT/নোট/ছবি) সেভ করতে schema_v5.sql চালাতে হবে" : e.message, "err"); b.disabled = false; }
    };
    g(isNew ? "a-b" : "a-h").focus();
  });
}

/* ---------- account directory: search · missing-info filter · select & share ---------- */
/* ---------- bulk import of cheque-book photos: file name  BANK-BRANCH-HOLDER-LAST3.jpg  →  account ---------- */
const FILE_PFX = { AGRANI: "ABL", BRAC: "BBL", DBBL: "DBBL", EBL: "EBL", IBBL: "IBBL", IFIC: "IFIC", MBL: "MBL", NBL: "NBL", PUBALI: "PBL", SIBPLC: "SBL", UCB: "UCB", ABL: "ABL", BBL: "BBL", PBL: "PBL", SBL: "SBL" };
function matchBookFile(fname) {
  const base = fname.replace(/\.[a-z0-9]+$/i, "").trim();
  if (/\(\d+\)\s*$/.test(base)) return { st: "dup" };
  const p = base.split("-").map(x => x.trim()); if (p.length < 3) return { st: "bad" };
  const pfx = FILE_PFX[p[0].toUpperCase()], last = p[p.length - 1].replace(/\D/g, ""), hold = norm(p.slice(2, -1).join(" "));
  if (!pfx || !last) return { st: "bad" };
  let c = S.accounts.filter(a => a.code.split("-")[0] === pfx && String(a.acno || "").replace(/\D/g, "").endsWith(last));
  if (c.length > 1) { const ex = c.filter(a => norm(a.holder) === hold); if (ex.length === 1) c = ex; else { const h1 = c.filter(a => norm(a.holder).includes(hold)); if (h1.length === 1) c = h1; else { const h2 = c.filter(a => hold.includes(norm(a.holder))); if (h2.length === 1) c = h2; } } }
  return c.length === 1 ? { st: "ok", a: c[0] } : { st: c.length ? "amb" : "none" };
}
function bookImportModal(after) {
  let items = [];
  modal(`<h2>${ico("cam")} Cheque book ছবি ইমপোর্ট</h2>
   <div class="mut sm" style="margin-bottom:10px">ফাইলের নাম <b>BANK-BRANCH-HOLDER-শেষ৩ডিজিট.jpg</b> ধরনের হলে নিজে নিজে অ্যাকাউন্ট খুঁজে নেবে। একসাথে অনেক ছবি বাছুন।</div>
   <label class="btn" for="bi-f">${ico("cam")} ছবি বাছুন (একাধিক)</label><input type="file" id="bi-f" accept="image/*" multiple hidden>
   <div id="bi-l" style="margin-top:12px;max-height:48vh;overflow:auto"></div>
   <label class="sw2 hide" id="bi-rw" style="margin-top:8px"><input type="checkbox" id="bi-r"><i></i><span>যাদের ছবি আছে তাদেরটাও বদলান</span></label>
   <div class="row" style="margin-top:12px"><button class="btn pri fix hide" id="bi-ok">আপলোড</button><button class="btn fix" id="bi-x">বন্ধ</button></div>`, (root, close) => {
    const g = id => $("#" + id, root); g("bi-x").onclick = close;
    const list = () => {
      const ok = items.filter(x => x.m.st === "ok" && (g("bi-r").checked || !x.m.a.book_photo));
      g("bi-l").innerHTML = `<table class="tbl"><tbody>${items.map(x => `<tr><td class="sm">${esc(x.f.name.slice(0, 44))}</td><td>${x.m.st === "ok" ? `<b>${esc(x.m.a.code)}</b> <span class="mut xs">${esc(x.m.a.holder)}</span>${x.m.a.book_photo ? ` <span class="am xs">(ছবি আছে)</span>` : ""}` : x.m.st === "dup" ? `<span class="mut xs">ডুপ্লিকেট — বাদ</span>` : `<span class="rd xs">${x.m.st === "amb" ? "একাধিক মিলেছে" : "অ্যাকাউন্ট মেলেনি"}</span>`}</td><td>${x.done ? "✅" : x.err ? "❌" : ""}</td></tr>`).join("")}</tbody></table>`;
      g("bi-rw").classList.toggle("hide", !items.some(x => x.m.st === "ok" && x.m.a.book_photo)); g("bi-ok").classList.toggle("hide", !items.length);
      g("bi-ok").textContent = `আপলোড (${ok.length}টি)`; g("bi-ok").disabled = !ok.length; return ok;
    };
    g("bi-f").onchange = () => { items = [...g("bi-f").files].map(f => ({ f, m: matchBookFile(f.name) })); list(); };
    g("bi-r").onchange = list;
    g("bi-ok").onclick = async () => {
      const ok = list(); if (!ok.length) return; g("bi-ok").disabled = true; let n = 0;
      for (const x of ok) {
        try { const blob = await compressImage(x.f), pth = `books/${norm(x.m.a.code)}_${Date.now()}.jpg`; await API.uploadPhoto(pth, blob); await API.upsertAccount({ ...x.m.a, book_photo: pth }); x.done = true; n++; }
        catch (e) { x.err = true; console.warn(e); if (/book_photo|column/i.test(e.message || "")) { toast("schema_v5.sql চালাতে হবে", "err"); break; } }
        g("bi-ok").textContent = `আপলোড হচ্ছে… ${n}/${ok.length}`; list();
      }
      await reload(); toast(`✔ ${n}টি ছবি যোগ হয়েছে`); after && after(); g("bi-ok").textContent = "হয়ে গেছে"; 
    };
  });
}
async function vAccounts(v) {
  const admin = S.me.role === "admin", sel = new Set(); const F = { q: "", b: "", h: "", st: "Active", miss: "" };
  const banks = [...new Set(S.accounts.map(a => a.bank).filter(Boolean))].sort(), holders = [...new Set(S.accounts.map(a => a.holder).filter(Boolean))].sort();
  v.innerHTML = head("অ্যাকাউন্ট খুঁজুন", admin ? `<button class="btn" id="ad-imp">${ico("cam")} ছবি ইমপোর্ট</button><button class="btn pri" id="ad-add">${ico("plus")} নতুন অ্যাকাউন্ট</button>` : "") + `<div class="card noprint" style="margin-bottom:12px">
    ${searchBox("ad-q", "কোড, নাম, ব্যাংক, শাখা, A/C বা Routing নং — যেমন: 483, pubali")}
    <div class="aufl" style="margin-top:8px"><select class="in" id="ad-b"><option value="">সব ব্যাংক</option>${banks.map(b => `<option>${esc(b)}</option>`).join("")}</select><select class="in" id="ad-h"><option value="">সব হোল্ডার</option>${holders.map(b => `<option>${esc(b)}</option>`).join("")}</select><select class="in" id="ad-s"><option value="Active">Active</option><option value="">সব</option><option value="Closed">Closed</option></select></div>
    <div class="mchips" id="ad-m"></div></div>
   <div class="mut sm" id="ad-n" style="margin-bottom:8px"></div><div class="acc-grid" id="ad-out"></div><div id="ad-selbar" class="selbar hide"></div>`;
  const base = () => S.accounts.filter(a => (!F.b || a.bank === F.b) && (!F.h || a.holder === F.h) && (!F.st || a.status === F.st));
  const mf = { mfs: a => isMFS(a), inc: a => !isMFS(a) && accMissing(a).length > 0, ok: a => !isMFS(a) && !accMissing(a).length, acno: a => accMissing(a).some(m => m.k === "acno"), routing: a => accMissing(a).some(m => m.k === "routing"), branch: a => accMissing(a).some(m => m.k === "branch"), type: a => accMissing(a).some(m => m.k === "type"), nophoto: a => !isMFS(a) && !a.book_photo };
  const selbar = () => { const el = $("#ad-selbar", v); if (!sel.size) return el.classList.add("hide"); el.classList.remove("hide"); el.innerHTML = `<b>${sel.size}</b> <span>টি নির্বাচিত</span><button class="btn sm pri" id="sb-sh">${ico("share")} শেয়ার</button><button class="btn sm" id="sb-cp">${ico("copy")} কপি</button><button class="btn sm ghost" id="sb-x">✕</button>`;
    const list = () => S.accounts.filter(a => sel.has(a.code)); $("#sb-sh", el).onclick = () => shareAccounts(list()); $("#sb-cp", el).onclick = () => copyText(accText(list()), "✔ নির্বাচিত অ্যাকাউন্টের তথ্য কপি হয়েছে"); $("#sb-x", el).onclick = () => { sel.clear(); draw(); }; };
  const draw = () => {
    const q = norm(F.q), b0 = base(), cnt = k => b0.filter(mf[k]).length;
    $("#ad-m", v).innerHTML = [["", "সব", b0.length], ["inc", "⚠ তথ্য অসম্পূর্ণ", cnt("inc")], ["ok", "✓ সম্পূর্ণ", cnt("ok")], ["acno", "A/C নং নেই", cnt("acno")], ["routing", "Routing নেই", cnt("routing")], ["branch", "শাখা নেই", cnt("branch")], ["type", "ধরন নেই", cnt("type")], ["nophoto", "📷 ছবি নেই", cnt("nophoto")], ["mfs", "📱 মোবাইল ব্যাংকিং", cnt("mfs")]].filter(([k, , n]) => !k || n || F.miss === k).map(([k, l, n]) => `<span class="chip ${F.miss === k ? "on" : ""} ${k && k !== "ok" ? "warn" : ""}" data-mf="${k}"><span>${l}</span> <b>${n}</b></span>`).join("");
    $$("#ad-m [data-mf]", v).forEach(c => c.onclick = () => { F.miss = c.dataset.mf; draw(); });
    const arr = b0.filter(a => (!F.miss || mf[F.miss](a)) && (!q || norm([a.code, a.holder, a.bank, a.branch, a.acno, a.type, a.routing, a.swift].join(" ")).includes(q))).sort((x, y) => (x.sort || 0) - (y.sort || 0));
    $("#ad-n", v).innerHTML = `<b>${arr.length}</b>টি অ্যাকাউন্ট${arr.length ? ` · <a href="#" id="ad-all">সব নির্বাচন</a>` : ""}`;
    $("#ad-out", v).innerHTML = arr.map(a => { const n = S.cheques.filter(c => c.code === a.code).length, br = brandOf(a), miss = accMissing(a), pct = accPct(a); return `<div class="card acc ${sel.has(a.code) ? "picked" : ""}" style="--b1:${br.c1};--b2:${br.c2}"><div class="hd"><label class="pick" title="নির্বাচন"><input type="checkbox" data-sel="${esc(a.code)}" ${sel.has(a.code) ? "checked" : ""}><i></i></label><span class="blogo">${esc(br.s)}</span><span class="code">${esc(a.code)}</span>${a.status !== "Active" ? `<span class="tag cl">${esc(a.status)}</span>` : ""}${a.type ? `<span class="tag">${esc(a.type)}</span>` : ""}<span style="flex:1"></span>${a.book_photo ? `<button class="btn sm ghost" data-ph="${esc(a.code)}" title="Cheque ছবি">${ico("img")}</button>` : ""}<button class="btn sm ghost" data-sh="${esc(a.code)}" title="শেয়ার">${ico("share")}</button>${admin ? `<button class="btn sm ghost" data-e="${esc(a.code)}" title="এডিট">${ico("edit")}</button>` : ""}</div><div class="bd">
      <div class="b">${esc(a.holder || "")}</div><div class="bk">${esc(a.bank || "")}${a.branch ? " · " + esc(a.branch) : ""}</div>
      ${a.acno ? `<div class="no"><span>${esc(fmtAcno(a.acno))}</span><button class="btn sm ghost" data-cp="${esc(a.acno)}" title="কপি">${ico("copy")} কপি</button></div>` : isMFS(a) ? `<div class="nomiss" style="color:var(--mut,#8b93a7)">📱 মোবাইল ব্যাংকিং (শাখা/Routing/SWIFT প্রযোজ্য নয়)</div>` : `<div class="nomiss">A/C নং দেওয়া নেই</div>`}
      ${a.routing || a.swift ? `<div class="rt">${a.routing ? `<span>Routing <b>${esc(a.routing)}</b> <button class="lnkb" data-cp="${esc(a.routing)}">কপি</button></span>` : ""}${a.swift ? `<span>SWIFT <b>${esc(a.swift)}</b></span>` : ""}</div>` : ""}
      ${miss.length ? `<div class="cmpl"><div class="bar"><i style="width:${pct}%"></i></div><div class="cmpl-t"><span class="am xs">${pct}% · <span>বাকি:</span> ${miss.map(m => m.l).join(", ")}</span>${admin ? `<button class="lnkb" data-e="${esc(a.code)}">পূরণ করুন</button>` : ""}</div></div>` : ""}
      <div class="mut sm">${n ? `${n}টি চেক · <a href="#/cheques" data-go="${esc(a.code)}">দেখুন</a>` : "এখনো চেক নেই"}${a.daily ? " · দৈনিক ক্লোজিং" : ""}${a.note ? ` · <span title="${esc(a.note)}">📝 ${esc(a.note.slice(0, 30))}</span>` : ""}</div></div></div>`; }).join("") || `<div class="card empty" style="grid-column:1/-1">কিছু পাওয়া যায়নি</div>`;
    $$("[data-cp]", v).forEach(x => x.onclick = () => copyText(x.dataset.cp, "✔ কপি হয়েছে"));
    $$("[data-e]", v).forEach(x => x.onclick = () => accountModal(S.accounts.find(a => a.code === x.dataset.e), () => vAccounts(v)));
    $$("[data-ph]", v).forEach(x => x.onclick = () => viewBookPhoto(S.accounts.find(a => a.code === x.dataset.ph)));
    $$("[data-sh]", v).forEach(x => x.onclick = () => shareAccounts([S.accounts.find(a => a.code === x.dataset.sh)]));
    $$("[data-go]", v).forEach(x => x.onclick = () => sessionStorage.setItem("nabiad_chq_ac", x.dataset.go));
    $$("[data-sel]", v).forEach(x => x.onchange = () => { x.checked ? sel.add(x.dataset.sel) : sel.delete(x.dataset.sel); x.closest(".acc").classList.toggle("picked", x.checked); selbar(); });
    $("#ad-all", v) && ($("#ad-all", v).onclick = e => { e.preventDefault(); arr.forEach(a => sel.add(a.code)); draw(); });
    selbar();
  };
  $("#ad-q", v).oninput = e => { F.q = e.target.value; draw(); }; $("#ad-b", v).onchange = e => { F.b = e.target.value; draw(); }; $("#ad-h", v).onchange = e => { F.h = e.target.value; draw(); }; $("#ad-s", v).onchange = e => { F.st = e.target.value; draw(); };
  $("#ad-imp", v) && ($("#ad-imp", v).onclick = () => bookImportModal(() => vAccounts(v)));
  $("#ad-add", v) && ($("#ad-add", v).onclick = () => accountModal(null, () => vAccounts(v)));
  draw(); setTimeout(() => $("#ad-q", v)?.focus(), 50);
}
async function vAdmin(v) {
  let tab = sessionStorage.getItem("nabiad_admin_tab") || "acc";
  const draw = async () => {
    sessionStorage.setItem("nabiad_admin_tab", tab);
    v.innerHTML = head("অ্যাডমিন") + `<div class="tabs ntabs">${[["acc", "🏦", "অ্যাকাউন্ট"], ["usr", "👥", "ব্যবহারকারী"], ["imp", "📥", "পুরনো ডাটা"], ["help", "🧰", "সেটআপ"]].map(([k, i, l]) => `<span class="chip ${k === tab ? "on" : ""}" data-t="${k}"><i class="te">${i}</i> <span>${l}</span></span>`).join("")}</div><div id="ad"></div>`;
    $$("[data-t]", v).forEach(c => c.onclick = () => { tab = c.dataset.t; draw(); }); const out = $("#ad", v);
    if (tab === "acc") {
      const F = { q: "", st: "Active" };
      out.innerHTML = `<div class="card noprint" style="margin-bottom:12px"><div class="srch" style="margin-top:0"><label class="si">${ico("search")}<input class="in" id="aa-q" placeholder="কোড, হোল্ডার, ব্যাংক, A/C নং…" autocomplete="off" type="search"></label><select class="in fix" id="aa-s"><option value="Active">Active</option><option value="">সব</option><option value="Closed">Closed</option></select><button class="btn pri fix" id="ac-add">${ico("plus")} <span class="lbl2">নতুন</span></button></div></div><div class="mut sm" id="aa-n" style="margin-bottom:8px"></div><div class="card flush"><div class="alist" id="aa-out"></div></div>`;
      const list = () => {
        const q = norm(F.q), arr = S.accounts.filter(a => (!F.st || a.status === F.st) && (!q || accHay(a).includes(q))).sort((a, b) => (a.sort || 0) - (b.sort || 0));
        $("#aa-n", out).innerHTML = `<b>${arr.length}</b>টি অ্যাকাউন্ট · <span>দৈনিক ক্লোজিং-এ</span> ${arr.filter(a => a.daily).length}`;
        $("#aa-out", out).innerHTML = arr.map(a => { const b = brandOf(a); return `<div class="ar" style="--b1:${b.c1}"><span class="blg" style="background:${b.c1}">${esc(b.s)}</span><div class="acm"><div><b>${esc(a.code)}</b> <span class="mut sm">#${a.sort ?? ""}</span>${a.status !== "Active" ? ` <span class="tag cl">${esc(a.status)}</span>` : ""}${a.daily ? ` <span class="tag t-chg">দৈনিক</span>` : ""}</div><div class="sm">${esc(a.holder || "")}</div><div class="mut xs">${esc(a.bank || "")}${a.acno ? " · " + esc(a.acno) : ""}</div></div><button class="btn sm" data-a="${esc(a.code)}">${ico("edit")}</button></div>`; }).join("") || `<div class="empty">কিছু পাওয়া যায়নি</div>`;
        $$("[data-a]", out).forEach(b => b.onclick = () => accountModal(S.accounts.find(x => x.code === b.dataset.a), draw));
      };
      $("#aa-q", out).oninput = e => { F.q = e.target.value; list(); }; $("#aa-s", out).onchange = e => { F.st = e.target.value; list(); };
      $("#ac-add", out).onclick = () => accountModal(null, draw); list();
    } else if (tab === "usr") {
      out.innerHTML = `<div class="card empty">লোড হচ্ছে…</div>`;
      let us = []; try { us = await API.users(); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(e.message)}</div>`; return; }
      out.innerHTML = `<div class="ulist">${us.map(u => `<div class="card uc" data-u="${u.id}"><div class="uh"><div class="ava">${esc((u.name || u.email || "?").trim().slice(0, 1).toUpperCase())}</div><div class="ue"><b>${esc(u.name || "—")}</b><div class="mut xs">${esc(u.email)}</div></div><label class="sw" title="সক্রিয়"><input type="checkbox" class="ac" ${u.active ? "checked" : ""}><i></i></label></div>
        <div class="ug"><div><label class="f">নাম</label><input class="in nm" value="${esc(u.name || "")}"></div><div><label class="f">Role</label><div class="seg rl">${[["admin", "Admin"], ["staff", "Staff"], ["boss", "Boss"]].map(([r, l]) => `<span class="chip ${r === u.role ? "on" : ""}" data-r="${r}">${l}</span>`).join("")}</div></div></div>
        <div class="row" style="margin-top:10px"><button class="btn pri sm fix" data-s="${u.id}">${ico("save")} সেভ</button>${u.id === S.me.id ? `<span class="mut xs">এটা আপনি</span>` : ""}</div></div>`).join("")}</div>
       <details class="card" style="margin-top:12px"><summary><b>➕ নতুন ব্যবহারকারী কীভাবে যোগ করবেন</b></summary><ol class="steps"><li>Supabase → <b>Authentication → Users → Add user</b></li><li>ইমেইল ও পাসওয়ার্ড দিন, <b>Auto Confirm</b> টিক দিন</li><li>এই পাতা রিফ্রেশ করুন — নতুন ব্যবহারকারী নিষ্ক্রিয় অবস্থায় আসবে</li><li>নাম ও Role ঠিক করে সক্রিয় করুন, তারপর সেভ</li></ol><div class="mut xs">নাম চেক/ক্লোজিং/ক্যাশে "কে এন্ট্রি করেছে" হিসেবে বসে।</div></details>`;
      $$(".rl .chip", out).forEach(c => c.onclick = () => { $$(".chip", c.parentElement).forEach(x => x.classList.toggle("on", x === c)); });
      $$("[data-s]", out).forEach(b => b.onclick = async () => {
        const card = b.closest(".uc"), role = $(".rl .chip.on", card)?.dataset.r, active = $(".ac", card).checked;
        if (b.dataset.s === S.me.id && (role !== "admin" || !active) && !ask("নিজের Admin অধিকার সরিয়ে দিলে আর অ্যাডমিন পাতায় আসতে পারবেন না। নিশ্চিত?")) return;
        b.disabled = true; try { await API.updateProfile(b.dataset.s, { name: $(".nm", card).value.trim(), role, active }); toast("✔ সেভ হয়েছে"); if (b.dataset.s === S.me.id) { S.me.name = $(".nm", card).value.trim(); saveCache(); } } catch (e) { toast(e.message, "err"); } b.disabled = false;
      });
    } else if (tab === "imp") {
      out.innerHTML = `<div class="card empty">লোড হচ্ছে…</div>`;
      let n = 0; try { n = await API.balanceCount(); } catch { }
      const done = n >= 39000;
      out.innerHTML = `<div class="card"><h3>📥 পুরনো ব্যাংক ব্যালেন্স ইতিহাস</h3>
        <div class="grid g3" style="margin:12px 0"><div class="kv"><span>ডাটাবেসে রেকর্ড</span><b class="num">${money0(n)}</b></div><div class="kv"><span>ফাইলে রেকর্ড</span><b class="num">39,479</b></div><div class="kv"><span>শুরু</span><b>02-09-2023</b></div></div>
        ${DEMO ? `<div class="alert gr">DEMO মোডে পুরনো ডাটা আগে থেকেই লোড আছে।</div>` : done ? `<div class="alert gr">✔ পুরনো ডাটা ইতিমধ্যে import হয়ে গেছে — আর কিছু করতে হবে না।</div><details style="margin-top:10px"><summary class="mut sm">আবার import করতে চাইলে</summary><div style="margin-top:8px"><button class="btn" id="im-go">⬆ আবার import</button></div></details>` : `<div class="alert am">এখনো import হয়নি।</div><button class="btn pri" id="im-go" style="margin-top:10px">⬆ পুরনো ডাটা import করুন</button>`}
        <div class="bar" style="margin-top:12px"><i id="im-bar" style="width:0"></i></div><div class="hint" id="im-t"></div>
        <div class="mut xs" style="margin-top:8px">একই তারিখ+A/C আবার তুললে আগেরটার জায়গায় বসবে — ডুপ্লিকেট হয় না।</div></div>`;
      $("#im-go", out) && ($("#im-go", out).onclick = async () => { if (!ask("পুরনো ডাটা import করবেন?")) return; $("#im-go", out).disabled = true; try { const rows = await loadEncrypted("history.enc"); await API.importBalances(rows, (a, b) => { $("#im-bar", out).style.width = a / b * 100 + "%"; $("#im-t", out).textContent = `${a} / ${b}`; }); balCache.clear(); toast("✔ import সম্পূর্ণ"); S.lastBal = await API.lastBalDate(); } catch (e) { toast(e.message, "err"); $("#im-go", out).disabled = false; } });
    } else {
      out.innerHTML = `<div class="card empty">সিস্টেম পরীক্ষা হচ্ছে…</div>`;
      const chk = await API.health().catch(() => ({}));
      const row = (ok, l, sub) => `<div class="hc ${ok ? "ok" : "no"}"><i>${ok ? "✓" : "✗"}</i><div><b>${l}</b>${sub ? `<div class="mut xs">${sub}</div>` : ""}</div></div>`;
      out.innerHTML = `<div class="grid g2"><div class="card"><h3>🩺 সিস্টেম অবস্থা</h3><div class="hcl">
        ${row(chk.db, "ডাটাবেস সংযোগ", DEMO ? "DEMO মোড" : "Supabase")}${row(chk.v2, "v2: ড্রাফট · রিমাইন্ডার · Audit · ছবি", chk.v2 ? "চালু" : "schema_v2.sql চালাতে হবে")}
        ${row(chk.v3, "v3: ক্যাশ · Backup · নিজের নাম", chk.v3 ? "চালু" : "schema_v3.sql চালাতে হবে")}${row(chk.backup, "রাত ১২টার Backup", chk.backupAt ? "শেষ: " + new Date(chk.backupAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "এখনো হয়নি")}
        ${row(location.protocol === "https:" || DEMO, "HTTPS", location.host)}${row(!!navigator.serviceWorker?.controller || DEMO, "অফলাইন মোড (PWA)", navigator.serviceWorker?.controller ? "চালু" : "রিলোড দিলে চালু হবে")}</div>
        <div class="mut xs" style="margin-top:10px">সংস্করণ v6 · ${esc(document.querySelector('script[src^="app.js"]')?.getAttribute("src")?.split("v=")[1] || "")}</div></div>
       <div class="card"><h3>👮 কে কী পারে</h3><table class="perm"><thead><tr><th></th><th>Admin</th><th>Staff</th><th>Boss</th></tr></thead><tbody>
        ${[["চেক / ক্লোজিং / ক্যাশ যোগ", 1, 1, 0], ["ফাইনাল সেভের পর বদলানো", 1, 0, 0], ["মুছে ফেলা", 1, 0, 0], ["রিপোর্ট দেখা", 1, 1, 1], ["Audit log", 1, 0, 1], ["Backup ও ব্যবহারকারী", 1, 0, 0]].map(([l, ...r]) => `<tr><td>${l}</td>${r.map(x => `<td class="c">${x ? `<b class="gr">✓</b>` : `<span class="mut">—</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table>
        <div class="mut xs" style="margin-top:8px">ভুল স্ট্যাটাস দিলে নতুন স্ট্যাটাস দিন — ইতিহাস থেকে যায়। এই নিয়ম ডাটাবেস (RLS) নিজেই আটকায়।</div></div>
       <div class="card" style="grid-column:1/-1"><h3>⚡ দ্রুত লিংক</h3><div class="qlinks"><a href="#/audit">${ico("shield")} Audit ও Backup</a><a href="#/books">${ico("book")} চেক বই</a><a href="#/settings">${ico("gear")} সেটিংস</a><a href="https://supabase.com/dashboard/project/mtzxcwuojiajsanearsz" target="_blank" rel="noopener">${ico("bank")} Supabase ড্যাশবোর্ড ↗</a><a href="https://github.com/ruhulaminrevens/nabiad" target="_blank" rel="noopener">${ico("copyt")} GitHub কোড ↗</a></div></div></div>`;
    }
  };
  await draw();
}
Object.assign(SbAPI, {
  async health() {
    const t = async (tbl, col = "*") => { const { error } = await sb.from(tbl).select(col, { count: "exact", head: true }); return !error; };
    const [db, v2, v3] = await Promise.all([t("accounts", "code"), t("reminders", "id"), t("cash_records", "date")]);
    let backupAt = null; try { backupAt = (await this.backups())[0]?.at || null; } catch { }
    return { db, v2, v3, backup: !!backupAt && Date.now() - new Date(backupAt) < 36 * 36e5, backupAt };
  }
});
Object.assign(DemoAPI, { async health() { const b = (demoStore.backups || [])[0]; return { db: true, v2: true, v3: true, backup: !!b, backupAt: b?.at }; } });

/* ---------- "More" sheet: grouped tiles, ✕ / tap outside / swipe down / phone Back all close it ---------- */
let moreClose = null;
function openMore(keys, mob, bd, lo) {
  if (moreClose) return moreClose();
  const cur = (location.hash.match(/^#\/(\w+)/) || [])[1], dark = getTheme() === "dark";
  const groups = []; keys.filter(k => !mob.includes(k)).forEach(k => { const s = ROUTES[k].sec; let g = groups.find(x => x.s === s); if (!g) groups.push(g = { s, ks: [] }); g.ks.push(k); });
  const el = document.createElement("div"); el.className = "sheet sheet2";
  el.innerHTML = `<div class="box"><div class="sh-hd"><div class="grab"></div><b>সব পাতা</b><button class="iconbtn sh-x" data-x="close" title="বন্ধ">✕</button></div><div class="sh-body">
    ${groups.map(g => `<div class="sh-sec">${SECS[g.s] || "মেনু"}</div><div class="sh-grid">${g.ks.map(k => `<a href="#/${k}" class="${k === cur ? "on" : ""}"><span class="ti">${ico(ROUTES[k].ic)}${bd[k] ? `<span class="badge">${bd[k]}</span>` : ""}</span><span class="tl">${ROUTES[k].t}</span></a>`).join("")}</div>`).join("")}
    <div class="sh-foot"><button data-x="th">${ico(dark ? "sun" : "moon")}<span>${dark ? "লাইট থিম" : "ডার্ক থিম"}</span></button><button data-x="lg">${ico("copyt")}<span>${LANG === "bn" ? "English" : "বাংলা"}</span></button><button data-x="lo" class="lo">${ico("out")}<span>লগআউট</span></button></div>
    <div class="mut xs c" style="margin-top:8px">${esc(S.me.name)} · ${esc(S.me.role)}</div></div></div>`;
  document.body.appendChild(el); document.body.classList.add("noscroll");
  history.pushState({ more: 1 }, "");
  let closed = false;
  const close = viaPop => {
    if (closed) return; closed = true; moreClose = null; window.removeEventListener("popstate", onPop); document.removeEventListener("keydown", onKey);
    el.classList.add("out"); document.body.classList.remove("noscroll"); setTimeout(() => el.remove(), 200);
    if (!viaPop && history.state?.more) history.back();
  };
  const onPop = () => close(true), onKey = e => { if (e.key === "Escape") close(); };
  window.addEventListener("popstate", onPop); document.addEventListener("keydown", onKey); moreClose = () => close();
  el.addEventListener("click", ev => {
    if (ev.target === el) return close();
    const a = ev.target.closest("a[href^='#/']");
    if (a) { ev.preventDefault(); const h = a.getAttribute("href"); close(true); history.replaceState(null, "", h); route(); return; }
    const x = ev.target.closest("[data-x]"); if (!x) return;
    if (x.dataset.x === "close") close();
    else if (x.dataset.x === "th") { setTheme(dark ? "light" : "dark"); close(); }
    else if (x.dataset.x === "lg") { close(); setTimeout(() => setLang(LANG === "bn" ? "en" : "bn"), 60); }
    else if (x.dataset.x === "lo") lo();
  });
  let y0 = null; const hd = $(".sh-hd", el);
  hd.addEventListener("touchstart", e => { y0 = e.touches[0].clientY; }, { passive: true });
  hd.addEventListener("touchend", e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 50) close(); y0 = null; });
}


/* ---------- bank brand colours (approximate brand palettes; edit here if a shade looks off) ---------- */
const BRAND = {
  ABL: ["#00843d", "#d71920", "Agrani"], BBL: ["#0067b1", "#1b365d", "BRAC"], DBBL: ["#00703c", "#c8102e", "DBBL"], IFIC: ["#0054a6", "#ed1c24", "IFIC"],
  IBBL: ["#00693c", "#c9a227", "IBBL"], PBL: ["#00508f", "#e31b23", "Pubali"], UCB: ["#c8102e", "#6d0f1f", "UCB"], EBL: ["#00427a", "#f7931d", "EBL"],
  NBL: ["#ce1126", "#003b73", "NBL"], SBL: ["#006b3f", "#e30613", "SBL"], MBL: ["#0e3d8c", "#e2231a", "MBL"], SONALI: ["#f39200", "#1d3f8c", "Sonali"],
  JANATA: ["#004b93", "#e31e24", "Janata"], RUPALI: ["#00529b", "#7a8c99", "Rupali"], CITY: ["#e2231a", "#1c1c1c", "City"], PRIME: ["#00539b", "#00a3e0", "Prime"],
  BAL: ["#005ba4", "#e31b23", "B.Asia"], DHAKA: ["#00539f", "#00a0df", "Dhaka"], JBL: ["#004b87", "#00a651", "Jamuna"], MTBL: ["#ab1e36", "#1b3a6b", "MTB"],
  SEBL: ["#006c35", "#8dc63f", "SEBL"], ONE: ["#00529c", "#ed1c24", "ONE"], TBL: ["#006838", "#c99a2e", "Trust"], UBL: ["#00468b", "#00a1e4", "Uttara"],
  AB: ["#e31b23", "#00427a", "AB"], NCC: ["#003d7c", "#e31e24", "NCC"], PREMIER: ["#d71921", "#231f20", "Premier"], EXIM: ["#004990", "#00a859", "EXIM"],
  AIBL: ["#00843d", "#004b2d", "AIBL"], SJIBL: ["#006837", "#f6a01a", "SJIBL"], FSIBL: ["#00843f", "#1f3f73", "FSIBL"], SIBL: ["#00843d", "#ed1c24", "SIBL"],
  SCB: ["#0473ea", "#38d200", "SC"], HSBC: ["#db0011", "#4d4d4d", "HSBC"], BKB: ["#008540", "#f7a600", "BKB"], NAGAD: ["#ec1c24", "#f6921e", "Nagad"], BKASH: ["#e2136e", "#9c0d4c", "bKash"]
};
function brandOf(a) {
  let p = String(a?.code || "").split("-")[0].toUpperCase();
  if (!BRAND[p]) { const bk = BANKS.find(b => b.split("|")[0].toLowerCase() === String(a?.bank || "").toLowerCase()); if (bk) p = bk.split("|")[1]; }
  const b = BRAND[p]; return b ? { c1: b[0], c2: b[1], s: b[2] } : { c1: "#4f46e5", c2: "#7c3aed", s: p || "BANK" };
}

/* ---------- cheque photos ---------- */
async function compressImage(file, max = 1600, q = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("ছবি পড়া যায়নি")); i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement("canvas");
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise(r => cv.toBlob(r, "image/jpeg", q));
  } finally { URL.revokeObjectURL(url); }
}
const photoPath = (id, code, no, date) => `${(date || today()).slice(0, 4)}/${norm(code)}_${no}_${id.slice(0, 8)}.jpg`;
async function showPhoto(el, c) {
  if (!c.photo) return; el.innerHTML = `<div class="skel" style="height:120px"></div>`;
  try { const u = await API.photoUrl(c.photo); el.innerHTML = `<a href="${esc(u)}" target="_blank" rel="noopener" class="chq-ph"><img src="${esc(u)}" alt="cheque"></a>`; }
  catch (e) { el.innerHTML = `<div class="mut sm">ছবি লোড হয়নি: ${esc(e.message || e)}</div>`; }
}
function photoPicker(root, st, ids) {
  const inp = $("#" + ids.inp, root), img = $("#" + ids.img, root), x = $("#" + ids.x, root);
  inp.onchange = async () => { const f = inp.files[0]; if (!f) return; try { st.photo = await compressImage(f); img.src = URL.createObjectURL(st.photo); img.classList.remove("hide"); x.classList.remove("hide"); } catch (e) { toast(e.message, "err"); } inp.value = ""; };
  x.onclick = e => { e.preventDefault(); st.photo = null; img.classList.add("hide"); x.classList.add("hide"); img.removeAttribute("src"); };
  return () => x.onclick(new Event("click"));
}
function addPhotoModal(c, after) {
  const st = { photo: null };
  modal(`<h2>📷 চেকের ছবি · ${esc(c.code)} · ${c.no}</h2><div class="photo-in"><label class="btn" for="p-in">${ico("cam")} ছবি তুলুন / বাছুন</label><input type="file" id="p-in" accept="image/*" hidden><img id="p-img" class="hide"><button class="btn sm ghost hide" id="p-x">✕</button></div>
   <div class="row" style="margin-top:16px"><button class="btn pri" id="p-ok">${ico("save")} সেভ</button><button class="btn" id="p-c">বাতিল</button></div>`, (root, close) => {
    photoPicker(root, st, { inp: "p-in", img: "p-img", x: "p-x" }); $("#p-c", root).onclick = close;
    $("#p-ok", root).onclick = async () => {
      if (!st.photo) return toast("ছবি বাছুন", "err"); const b = $("#p-ok", root); b.disabled = true;
      try { const p = photoPath(c.id, c.code, c.no, c.date); await API.uploadPhoto(p, st.photo); await API.setPhoto(c.id, p); c.photo = p; saveCache(); close(); toast("✔ ছবি সেভ হয়েছে"); after && after(); }
      catch (e) { toast("ছবি সেভ হয়নি: " + (e.message || e), "err"); b.disabled = false; }
    };
  });
}

/* ---------- reminders ---------- */
const REPEATS = { none: "একবার", hourly: "প্রতি ঘণ্টা", daily: "প্রতিদিন", weekly: "প্রতি সপ্তাহ", monthly: "প্রতি মাস" };
const FOR_ROLE = { me: "শুধু আমি", all: "সবাই", admin: "শুধু Admin" };
const remDue = r => new Date(r.snooze_until || r.due_at);
const dueList = () => (S.reminders || []).filter(r => !r.done && remDue(r) <= new Date());
const localDT = d => { const x = new Date(d); return [iso(x), `${pad(x.getHours())}:${pad(x.getMinutes())}`]; };
function nextOcc(r) {
  const d = new Date(r.due_at), now = Date.now();
  const step = () => { if (r.repeat === "hourly") d.setHours(d.getHours() + 1); else if (r.repeat === "daily") d.setDate(d.getDate() + 1); else if (r.repeat === "weekly") d.setDate(d.getDate() + 7); else d.setMonth(d.getMonth() + 1); };
  let i = 0; do step(); while (d.getTime() <= now && ++i < 100000); return d.toISOString();
}
function relTime(d) {
  const m = Math.round((new Date(d) - Date.now()) / 6e4), a = Math.abs(m);
  if (LANG === "en") { const e = a < 60 ? `${a} min` : a < 1440 ? `${Math.round(a / 60)} h` : `${Math.round(a / 1440)} day${Math.round(a / 1440) === 1 ? "" : "s"}`; return m < 0 ? `${e} ago` : m === 0 ? "now" : `in ${e}`; }
  const s = a < 60 ? `${a} মিনিট` : a < 1440 ? `${Math.round(a / 60)} ঘণ্টা` : `${Math.round(a / 1440)} দিন`;
  return m < 0 ? `${s} আগে` : m === 0 ? "এখন" : `${s} পরে`;
}
function sysAlerts() {
  const o = [], t = today(), h = new Date().getHours();
  if (S.me.role !== "boss") {
    if (!isFri(t) && h >= (CFG.CLOSING_REMIND_HOUR ?? 17) && (!S.lastBal || S.lastBal < t)) o.push({ id: "closing-" + t, k: "rd", ic: "bank", t: "আজকের দৈনিক ক্লোজিং এখনো সেভ হয়নি", go: "#/closing", notify: true });
    if (!isFri(t) && h >= (CFG.CASH_REMIND_HOUR ?? 19) && S.lastCash !== t && !S.cashOff) o.push({ id: "cash-" + t, k: "rd", ic: "wallet", t: "আজকের দৈনিক ক্যাশ রেকর্ড এখনো সেভ হয়নি", go: "#/cash", notify: true });
    if (S.lastBal) { const g = workGap(S.lastBal, t); if (g > 0) o.push({ k: "am", ic: "bank", t: `${g} কর্মদিবসের ক্লোজিং বাকি (শেষ সেভ: ${dmy(S.lastBal)})`, go: "#/closing" }); }
    const dd = Draft.localDates().filter(d => !S.lastBal || d > S.lastBal); if (dd.length) o.push({ k: "vi", ic: "edit", t: `ড্রাফট আছে, ফাইনাল সেভ বাকি: ${dd.map(dmy).join(", ")}`, go: "#/closing" });
    if (!DEMO && Outbox.count()) o.push({ k: "am", ic: "clock", t: `${Outbox.count()}টি অফলাইন এন্ট্রি সিঙ্ক বাকি`, go: "" });
  }
  const old = pendingOld(); if (old.length) o.push({ k: "am", ic: "clock", t: `${old.length}টি চেক ${CFG.PENDING_ALERT_DAYS ?? 3} দিনের বেশি Pending`, go: "#/status" });
  const miss = allMissing(); if (miss.length) o.push({ k: "am", ic: "book", t: `মিসিং চেক পাতা আছে: ${miss.slice(0, 3).map(x => x.b.code).join(", ")}`, go: "#/books" });
  return o;
}
function updateBell() {
  const b = $("#bell"); if (!b || !S.me) return; const n = dueList().length, sys = sysAlerts();
  const bb = $(".bb", b); bb.textContent = n || ""; bb.className = "bb" + (n ? " on" : sys.length ? " dot" : "");
  b.title = `${n}টি রিমাইন্ডার সময় হয়েছে · ${sys.length}টি সতর্কতা`;
}
function beep() { try { const C = new (window.AudioContext || window.webkitAudioContext)(); [0, 0.22].forEach(t0 => { const o = C.createOscillator(), g = C.createGain(); o.frequency.value = 880; o.connect(g); g.connect(C.destination); g.gain.setValueAtTime(0.0001, C.currentTime + t0); g.gain.exponentialRampToValueAtTime(0.25, C.currentTime + t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, C.currentTime + t0 + 0.18); o.start(C.currentTime + t0); o.stop(C.currentTime + t0 + 0.2); }); } catch { } }
async function sysNotify(title, body, tag) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const opt = { body: body || "", icon: "icon-192.png", badge: "icon-192.png", tag, data: { url: "#/rem" } };
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) return await reg.showNotification(title, opt); new Notification(title, opt); } catch { }
}
const SEEN_KEY = "nabiad_rem_seen";
function remTick() {
  if (!S.me || !$("#bell")) return; updateBell();
  let seen; try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { seen = {}; }
  const key = r => r.id + "|" + (r.snooze_until || r.due_at);
  const due = dueList().filter(r => !seen[key(r)]);
  const sysN = sysAlerts().filter(a => a.notify && !seen[a.id]);
  if (!due.length && !sysN.length) return;
  due.forEach(r => seen[key(r)] = Date.now()); sysN.forEach(a => seen[a.id] = Date.now());
  const cut = Date.now() - 60 * 864e5; for (const k in seen) if (seen[k] < cut) delete seen[k];
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { }
  if (PREFS.sound) beep();
  due.forEach(r => sysNotify("⏰ " + r.title, r.note || "Nabiad রিমাইন্ডার", "rem-" + r.id));
  sysN.forEach(a => sysNotify("⚠ " + a.t, "NABIAD Cheque & Bank Control", a.id));
  if (due.length && !$(".mback")) dueModal(due); else if (sysN.length) toast(sysN[0].t, "err");
}
setInterval(remTick, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) remTick(); });
async function remDone(r) {
  const p = r.repeat && r.repeat !== "none" ? { due_at: nextOcc(r), snooze_until: null } : { done: true, done_at: new Date().toISOString(), snooze_until: null };
  await API.updateReminder(r.id, p); Object.assign(r, p); saveCache(); updateBell();
}
async function remSnooze(r, until) { const p = { snooze_until: until.toISOString() }; await API.updateReminder(r.id, p); Object.assign(r, p); saveCache(); updateBell(); }
const tomorrow10 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; };
function snoozeBtns(id) { return `<button class="btn sm" data-sz="${id}|10">১০ মিনিট</button><button class="btn sm" data-sz="${id}|60">১ ঘণ্টা</button><button class="btn sm" data-sz="${id}|tm">কাল ১০টা</button>`; }
function bindRemActions(root, after) {
  $$("[data-dn]", root).forEach(b => b.onclick = async () => { const r = S.reminders.find(x => x.id === b.dataset.dn); b.disabled = true; try { await remDone(r); toast(r.done ? "✔ সম্পন্ন" : `✔ পরের রিমাইন্ডার: ${new Date(r.due_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`); after(); } catch (e) { toast(e.message, "err"); b.disabled = false; } });
  $$("[data-sz]", root).forEach(b => b.onclick = async () => { const [id, m] = b.dataset.sz.split("|"); const r = S.reminders.find(x => x.id === id); try { await remSnooze(r, m === "tm" ? tomorrow10() : new Date(Date.now() + +m * 6e4)); toast("⏰ পরে মনে করিয়ে দেবে"); after(); } catch (e) { toast(e.message, "err"); } });
  $$("[data-oc]", root).forEach(b => b.onclick = () => { const c = S.cheques.find(x => x.id === b.dataset.oc); if (c) chequeModal(c, () => { }); else toast("চেক পাওয়া যায়নি", "err"); });
}
function dueModal(due) {
  modal(`<h2>⏰ রিমাইন্ডার <span class="tag">${due.length}</span></h2><div class="rem-list">${due.map(r => `<div class="rem due"><div class="rt"><b>${esc(r.title)}</b>${r.note ? `<div class="mut sm">${esc(r.note)}</div>` : ""}<div class="mut sm">${new Date(remDue(r)).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · ${REPEATS[r.repeat] || ""}</div></div>
   <div class="ra"><button class="btn ok sm" data-dn="${r.id}">✓ সম্পন্ন</button>${snoozeBtns(r.id)}${r.cheque_id ? `<button class="btn sm" data-oc="${r.cheque_id}">চেক</button>` : ""}</div></div>`).join("")}</div>
   <div class="row" style="margin-top:14px"><a class="btn" href="#/rem" id="dm-all">সব রিমাইন্ডার</a><button class="btn" id="dm-x">বন্ধ</button></div>`, (root, close) => {
    $("#dm-x", root).onclick = close; $("#dm-all", root).onclick = close;
    bindRemActions(root, () => { const left = dueList(); if (!left.length) close(); else { close(); dueModal(left); } if (CUR === "rem") route(); });
  });
}
function icsFile(r) {
  const z = d => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const e = s => String(s || "").replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const rr = { hourly: "HOURLY", daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY" }[r.repeat];
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nabiad//Reminder//BN", "BEGIN:VEVENT", `UID:${r.id}@nabiad`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(remDue(r))}`, `DTEND:${z(remDue(r).getTime() + 15 * 6e4)}`, `SUMMARY:${e(r.title)}`, `DESCRIPTION:${e((r.note || "") + "\nNABIAD Cheque & Bank Control")}`, rr ? `RRULE:FREQ=${rr}` : "", "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", `DESCRIPTION:${e(r.title)}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR"].filter(Boolean);
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([L.join("\r\n")], { type: "text/calendar" })); a.download = `reminder_${norm(r.title).slice(0, 20) || "nabiad"}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const remErrMsg = e => /relation|does not exist|schema cache|not find/i.test(e?.message || "") ? "রিমাইন্ডার টেবিল নেই — Supabase-এ schema_v2.sql চালাতে হবে" : (e?.message || String(e));

/* ---------- audit log ---------- */
const AU_T = { cheques: "চেক", cheque_status: "স্ট্যাটাস", balances: "ব্যালেন্স", accounts: "অ্যাকাউন্ট", books: "চেক বই", profiles: "ব্যবহারকারী" };
const AU_A = { insert: ["যোগ", "gr"], update: ["বদল", "am"], delete: ["মুছে ফেলা", "rd"] };
const AU_F = { chq_date: "তারিখ", code: "A/C", chq_no: "চেক নং", amount: "টাকা", purpose: "খাত", cash_taker: "কে তুলেছে", party: "পার্টি", to_ac: "To A/C", remarks: "মন্তব্য", new_status: "স্ট্যাটাস", status_date: "স্ট্যাটাস তারিখ", total: "ক্লোজিং", block: "Block", remark: "মন্তব্য", other_debit: "অন্য খরচ", other_deposit: "অন্য জমা", photo: "ছবি", holder: "হোল্ডার", bank: "ব্যাংক", acno: "A/C নং", status: "Status", role: "Role", active: "সক্রিয়", name: "নাম" };
const AU_SKIP = new Set(["created_at", "user_id", "id", "updated_at", "entered_by", "cheque_id"]);
const auV = x => x === null || x === undefined || x === "" ? "—" : typeof x === "number" || /^-?\d+(\.\d+)?$/.test(String(x)) && String(x).length > 3 ? money(x) : String(x);
function auDiff(r) {
  const o = r.old || {}, n = r.new || {}, L = k => `<span class="au-k">${esc(AU_F[k] || k)}</span>`;
  if (r.action === "update") return Object.keys({ ...o, ...n }).filter(k => !AU_SKIP.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k])).map(k => `${L(k)} <s>${esc(auV(o[k]))}</s> → <b>${esc(auV(n[k]))}</b>`).join("<br>") || "—";
  const x = r.action === "delete" ? o : n; return Object.entries(x).filter(([k, val]) => !AU_SKIP.has(k) && val !== null && val !== "").slice(0, 7).map(([k, val]) => `${L(k)} ${esc(auV(val))}`).join(" · ");
}

/* =================== v6: API extensions =================== */
Object.assign(SbAPI, {
  async balancesRange(from, to) {
    let out = [], f = 0;
    for (;;) { const { data, error } = await sb.from("balances").select("date,code,total,block").gte("date", from).lte("date", to).order("date").order("code").range(f, f + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; f += 1000; }
    return out.map(r => ({ date: r.date, code: r.code, total: Number(r.total) || 0, block: Number(r.block) || 0 }));
  },
  async cashOn(d) { const { data, error } = await sb.from("cash_records").select("*").eq("date", d).maybeSingle(); if (error) throw error; return data; },
  async cashPrev(d) { const { data, error } = await sb.from("cash_records").select("*").lt("date", d).eq("status", "final").order("date", { ascending: false }).limit(1); if (error) throw error; return data?.[0] || null; },
  async cashSave(row) { const { error } = await sb.from("cash_records").upsert({ ...row, entered_by: S.me.name, updated_at: new Date().toISOString() }); if (error) throw error; },
  async cashRange(from, to) { const { data, error } = await sb.from("cash_records").select("*").gte("date", from).lte("date", to).order("date").limit(3000); if (error) throw error; return data; },
  async lastCashDate() { const { data, error } = await sb.from("cash_records").select("date").eq("status", "final").order("date", { ascending: false }).limit(1); if (error) throw error; return data?.[0]?.date || null; },
  async backups() { const { data, error } = await sb.from("backups").select("id,at,kind,size_rows").order("at", { ascending: false }).limit(60); if (error) throw error; return data; },
  async backupData(id) { const { data, error } = await sb.from("backups").select("data").eq("id", id).single(); if (error) throw error; return data.data; },
  async backupNow() { const { data, error } = await sb.rpc("make_backup", { k: "manual" }); if (error) throw error; return data; },
  async setMyName(n) { const { error } = await sb.rpc("set_my_name", { n }); if (error) throw error; },
  async changePassword(p) { const { error } = await sb.auth.updateUser({ password: p }); if (error) throw error; },
  async signOutOthers() { const { error } = await sb.auth.signOut({ scope: "others" }); if (error) throw error; },
  async dumpAll() { const T = ["accounts", "cheques", "cheque_status", "balances", "books", "reminders", "cash_records", "balance_drafts"], o = {}; for (const t of T) { try { o[t] = await fetchAll(t, t === "accounts" ? "code" : t === "balances" ? "date" : t === "balance_drafts" || t === "cash_records" ? "date" : "id"); } catch (e) { o[t] = { error: e.message }; } } return o; }
});
Object.assign(DemoAPI, {
  async balancesRange(from, to) { const h = await this.hist(), out = []; for (const [d, m] of h) if (d >= from && d <= to) for (const c in m) out.push({ date: d, code: c, total: Number(m[c].total) || 0, block: Number(m[c].block) || 0 }); return out.sort((a, b) => a.date.localeCompare(b.date)); },
  async cashOn(d) { return (demoStore.cash ||= {})[d] || null; },
  async cashPrev(d) { const c = demoStore.cash ||= {}; const k = Object.keys(c).filter(x => x < d && c[x].status === "final").sort().pop(); return k ? c[k] : null; },
  async cashSave(row) { const c = demoStore.cash ||= {}; if (c[row.date]) this.aud("cash_records", "update", row.date, c[row.date], row); c[row.date] = { ...row, entered_by: S.me.name, updated_at: new Date().toISOString() }; this.save(); },
  async cashRange(from, to) { const c = demoStore.cash ||= {}; return Object.values(c).filter(r => r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date)); },
  async lastCashDate() { const c = demoStore.cash ||= {}; return Object.keys(c).filter(k => c[k].status === "final").sort().pop() || null; },
  async backups() { return (demoStore.backups ||= []).map(({ data, ...b }) => b); },
  async backupData(id) { return (demoStore.backups || []).find(b => b.id === id)?.data; },
  async backupNow() { const b = { id: Date.now(), at: new Date().toISOString(), kind: "manual", size_rows: demoStore.cheques.length, data: { cheques: demoStore.cheques, cash: demoStore.cash } }; (demoStore.backups ||= []).unshift(b); this.save(); return b.id; },
  async setMyName(n) { S.me.name = n; sessionStorage.setItem("nabiad_demo_user", JSON.stringify(S.me)); },
  async changePassword() { }, async signOutOthers() { },
  async dumpAll() { return { ...demoStore, photos: undefined }; }
});

/* =================== v6: per-device settings =================== */
const PREF_KEY = "nabiad_prefs";
const PREF_DEF = { start: "dash", font: "normal", compact: false, sound: true, closingHour: CFG.CLOSING_REMIND_HOUR ?? 17, cashHour: 19, skipFri: CFG.SKIP_FRIDAY !== false, pendDays: CFG.PENDING_ALERT_DAYS ?? 3 };
let PREFS = (() => { try { return { ...PREF_DEF, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") }; } catch { return { ...PREF_DEF }; } })();
function applyPrefs() {
  CFG.CLOSING_REMIND_HOUR = +PREFS.closingHour; CFG.CASH_REMIND_HOUR = +PREFS.cashHour; CFG.SKIP_FRIDAY = !!PREFS.skipFri; CFG.PENDING_ALERT_DAYS = +PREFS.pendDays;
  document.documentElement.dataset.font = PREFS.font; document.documentElement.classList.toggle("compact", !!PREFS.compact);
}
function savePrefs(p) { PREFS = { ...PREFS, ...p }; try { localStorage.setItem(PREF_KEY, JSON.stringify(PREFS)); } catch { } applyPrefs(); }
applyPrefs();

/* =================== v6: small chart helpers =================== */
const DCACHE = {};
async function cached(key, ttl, fn) { const c = DCACHE[key]; if (c && Date.now() - c.t < ttl) return c.v; const v = await fn(); DCACHE[key] = { t: Date.now(), v }; return v; }
const dropCache = p => Object.keys(DCACHE).forEach(k => k.startsWith(p) && delete DCACHE[k]);
function spark(vals, color = "#6366f1", h = 64) {
  if (vals.length < 2) return `<div class="mut sm" style="padding:18px 0">ট্রেন্ড দেখাতে আরও ডাটা লাগবে</div>`;
  const w = 300, mx = Math.max(...vals), mn = Math.min(...vals), rg = mx - mn || 1;
  const p = vals.map((v, i) => [i / (vals.length - 1) * w, h - 5 - (v - mn) / rg * (h - 10)]), d = p.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1)).join("");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark" style="height:${h}px"><path d="${d}L${w},${h}L0,${h}Z" fill="${color}" opacity=".13"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle cx="${p[p.length - 1][0]}" cy="${p[p.length - 1][1]}" r="3.5" fill="${color}"/></svg>`;
}
function bars2(rows, h = 90) {
  if (!rows.length) return `<div class="mut sm" style="padding:18px 0">এই সময়ে কোনো রেকর্ড নেই</div>`;
  const mx = Math.max(1, ...rows.flatMap(r => [r.a, r.b])), w = 300, bw = w / Math.max(rows.length, 12);
  return `<svg viewBox="0 0 ${w} ${h + 14}" preserveAspectRatio="none" class="spark" style="height:${h + 14}px">${rows.map((r, i) => { const x = i * bw, ha = r.a / mx * h, hb = r.b / mx * h, q = Math.max(1, bw * 0.34); return `<rect x="${(x + bw * 0.14).toFixed(1)}" y="${(h - ha).toFixed(1)}" width="${q.toFixed(1)}" height="${ha.toFixed(1)}" rx="2" fill="#10b981"><title>${r.l} · Receipt ${money0(r.a)}</title></rect><rect x="${(x + bw * 0.14 + q + 1).toFixed(1)}" y="${(h - hb).toFixed(1)}" width="${q.toFixed(1)}" height="${hb.toFixed(1)}" rx="2" fill="#f43f5e"><title>${r.l} · Payment ${money0(r.b)}</title></rect>`; }).join("")}<line x1="0" x2="${w}" y1="${h}" y2="${h}" stroke="currentColor" opacity=".15"/></svg>`;
}
const delta = (a, b) => { if (b == null || a == null) return ""; const d = a - b; if (Math.abs(d) < 1) return `<span class="dl0">— আগের মতো</span>`; return `<span class="${d > 0 ? "dlu" : "dld"}">${d > 0 ? "▲" : "▼"} ${money0(Math.abs(d))}</span>`; };
function balSeries(rows) {
  const am = accMap(), by = new Map();
  rows.forEach(r => { const a = am[r.code]; if (!a || !a.daily) return; const o = by.get(r.date) || { date: r.date, t: 0, b: 0, n: 0 }; o.t += r.total; o.b += r.block; o.n++; by.set(r.date, o); });
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* =================== v6: dashboard =================== */
const greet = () => { const h = new Date().getHours(); return h < 12 ? "শুভ সকাল" : h < 17 ? "শুভ দুপুর" : "শুভ সন্ধ্যা"; };
async function vDash(v) {
  const t = today(), ym = t.slice(0, 7), boss = S.me.role === "boss", admin = S.me.role === "admin";
  const todayC = S.cheques.filter(c => c.date === t && isLive(c)), pend = S.cheques.filter(c => c.status === "Pending"), old = pendingOld();
  const mon = S.cheques.filter(c => c.date.startsWith(ym) && isLive(c)), due = dueList(), sys = sysAlerts();
  const upcoming = (S.reminders || []).filter(r => !r.done).sort((a, b) => remDue(a) - remDue(b)).slice(0, 5);
  const acts = boss ? [["crep", "img", "ব্যালেন্স রিপোর্ট", "qa1"], ["cashsum", "wallet", "ক্যাশ সামারি", "qa2"], ["reports", "chart", "ব্যাংক রিপোর্ট", "qa3"]]
    : [["entry", "plus", "নতুন চেক এন্ট্রি", "qa1"], ["closing", "bank", "দৈনিক ব্যাংক ক্লোজিং", "qa2"], ["cash", "wallet", "দৈনিক ক্যাশ রেকর্ড", "qa3"]];
  const bankDone = S.lastBal === t, cashDone = S.lastCash === t, workday = !isFri(t);
  const st = (ok, l, go, sub) => `<a class="stchip ${ok ? "ok" : "no"}" href="${go}"><i>${ok ? "✓" : "!"}</i><span><b>${l}</b><small>${sub}</small></span></a>`;
  v.innerHTML = `<div class="hero dash-hero"><div class="hh"><h1>${greet()}, ${esc(S.me.name)} 👋</h1><p>${new Date().toLocaleDateString(LANG === "en" ? "en-GB" : "bn-BD", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${workday ? "" : " · শুক্রবার (সাপ্তাহিক বন্ধ)"}</p></div>
      <div class="qacts">${acts.map(([k, ic, l, c]) => `<a class="qa ${c}" href="#/${k}"><span class="qi">${ico(ic)}</span><span>${l}</span></a>`).join("")}</div></div>
    <div class="ststrip">${boss ? "" : st(bankDone, "ব্যাংক ক্লোজিং", "#/closing", bankDone ? "আজ সেভ হয়েছে" : S.lastBal ? "<span>শেষ:</span> " + dmy(S.lastBal) : "এখনো নেই")}${boss ? "" : st(cashDone, "ক্যাশ রেকর্ড", "#/cash", cashDone ? "আজ সেভ হয়েছে" : S.lastCash ? "<span>শেষ:</span> " + dmy(S.lastCash) : "এখনো নেই")}
      ${st(!due.length, "রিমাইন্ডার", "#/rem", due.length ? `${due.length}টি সময় হয়েছে` : `${upcoming.length}টি আসছে`)}${st(!old.length, "Pending চেক", "#/status", `${pend.length}টি · পুরনো ${old.length}`)}${admin ? `<span id="d-bk" class="stchip"><i>…</i><span><b>Backup</b><small>দেখা হচ্ছে…</small></span></span>` : ""}</div>
    <div class="grid g4" id="d-kpi">
      <div class="kpi card k-vi"><div class="l">ব্যাংক ব্যালেন্স<span class="ki">${ico("bank")}</span></div><div class="v num" id="d-bt">—</div><div class="s" id="d-bs">লোড হচ্ছে…</div></div>
      <div class="kpi card k-gr"><div class="l">ব্যবহারযোগ্য (Usable)<span class="ki">${ico("wallet")}</span></div><div class="v num" id="d-bu">—</div><div class="s" id="d-bb"></div></div>
      <div class="kpi card k-cy"><div class="l">ক্যাশ ক্লোজিং<span class="ki">${ico("wallet")}</span></div><div class="v num" id="d-ct">—</div><div class="s" id="d-cs">লোড হচ্ছে…</div></div>
      <div class="kpi card k-am"><div class="l">চেক · এই মাস<span class="ki">${ico("list")}</span></div><div class="v num">${mon.length}</div><div class="s num">৳ ${money0(sumAmt(mon))} · <span>আজ</span> ${todayC.length} · Pending ${pend.length}</div></div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><div class="ch" style="padding:0 0 8px"><h3>ব্যাংক ব্যালেন্স ট্রেন্ড</h3><span class="mut sm" id="d-tr-l">৩০ দিন</span><div class="sp" style="flex:1"></div><a class="sm" href="#/reports">রিপোর্ট →</a></div><div id="d-tr"><div class="skel" style="height:64px"></div></div><div class="lgd"><span><i style="background:#6366f1"></i>মোট</span><span><i style="background:#10b981"></i>Usable</span></div></div>
      <div class="card"><div class="ch" style="padding:0 0 8px"><h3>ক্যাশ: আয় বনাম ব্যয়</h3><span class="mut sm">১৪ দিন</span><div class="sp" style="flex:1"></div><a class="sm" href="#/cashsum">সামারি →</a></div><div id="d-cash"><div class="skel" style="height:90px"></div></div><div class="lgd"><span><i style="background:#10b981"></i>Receipt</span><span><i style="background:#f43f5e"></i>Payment</span></div></div>
    </div>
    ${sys.length || due.length ? `<div class="grid" style="margin-top:14px;gap:8px">${due.slice(0, 3).map(r => `<div class="alert rd">⏰ <span><b>${esc(r.title)}</b> — ${relTime(remDue(r))}</span><a class="btn sm" style="margin-left:auto" href="#/rem">দেখুন</a></div>`).join("")}${sys.map(a => `<div class="alert ${a.k}">${ico(a.ic).replace("<svg", '<svg width="18" height="18"')}<span>${esc(a.t)}</span>${a.go ? `<a class="btn sm" style="margin-left:auto" href="${a.go}">খুলুন →</a>` : ""}</div>`).join("")}</div>` : `<div class="alert gr" style="margin-top:14px">✔ কোনো সতর্কতা নেই — সব ঠিক আছে।</div>`}
    <div class="grid g3" style="margin-top:14px">
      <div class="card flush"><div class="ch"><h3>সর্বশেষ চেক এন্ট্রি</h3><div class="sp" style="flex:1"></div><a class="sm" href="#/cheques">সব →</a></div>${(() => { const r = [...S.cheques].sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 6); return r.length ? `<div class="mini">${r.map(c => `<div class="mi" data-id="${c.id}"><div><b>${esc(c.code)} · ${c.no}</b>${chqIcons(c)}<div class="mut sm">${dmy(c.date)} · ${esc(c.purpose.split(" (")[0])}</div></div><div class="r"><b class="num">৳ ${money0(c.amount)}</b><div>${stTag(c.status)}</div></div></div>`).join("")}</div>` : `<div class="empty">এখনো কোনো চেক এন্ট্রি হয়নি${boss ? "" : `<div style="margin-top:10px"><a class="btn sm pri" href="#/entry">${ico("plus")} প্রথম চেক এন্ট্রি</a></div>`}</div>`; })()}</div>
      <div class="card flush"><div class="ch"><h3>আসন্ন রিমাইন্ডার</h3><div class="sp" style="flex:1"></div><a class="sm" href="#/rem">সব →</a></div>${upcoming.length ? `<div class="mini">${upcoming.map(r => `<a class="mi" href="#/rem"><div><b>${esc(r.title)}</b><div class="mut sm">${esc(r.note || REPEATS[r.repeat] || "")}</div></div><div class="r"><span class="tag ${remDue(r) <= new Date() ? "t-due" : ""}">${relTime(remDue(r))}</span></div></a>`).join("")}</div>` : `<div class="empty">কোনো রিমাইন্ডার নেই<div style="margin-top:10px"><button class="btn sm" id="d-addrem">${ico("plus")} রিমাইন্ডার দিন</button></div></div>`}</div>
      <div class="card flush"><div class="ch"><h3>পুরনো Pending চেক</h3><span class="tag">${old.length}</span></div>${old.length ? `<div class="mini">${old.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6).map(c => `<div class="mi" data-id="${c.id}"><div><b>${esc(c.code)} · ${c.no}</b><div class="mut sm">${esc(c.remarks || c.party || c.purpose.split(" (")[0])}</div></div><div class="r"><b class="num">৳ ${money0(c.amount)}</b><div class="rd sm b">${daysBetween(c.date, t)} দিন</div></div></div>`).join("")}</div>` : `<div class="empty">কোনো পুরনো Pending নেই 🎉</div>`}</div>
    </div>`;
  $$(".mi[data-id]", v).forEach(r => r.onclick = () => chequeModal(S.cheques.find(c => c.id === r.dataset.id), () => route()));
  $("#d-addrem", v) && ($("#d-addrem", v).onclick = () => reminderModal(null, {}, () => route()));
  // bank figures
  (async () => {
    try {
      const rows = await cached("bal30", 60000, () => API.balancesRange(addDays(t, -45), t)); const ser = balSeries(rows);
      if (!$("#d-bt", v)) return;
      const last = ser[ser.length - 1], prev = ser[ser.length - 2];
      if (last) {
        $("#d-bt", v).textContent = "৳ " + money0(last.t); $("#d-bs", v).innerHTML = `${dmy(last.date)} · ${delta(last.t, prev?.t)}`;
        $("#d-bu", v).textContent = "৳ " + money0(last.t - last.b); $("#d-bb", v).innerHTML = `Block ${money0(last.b)} · ${last.n} A/C · ${delta(last.t - last.b, prev ? prev.t - prev.b : null)}`;
        const s30 = ser.slice(-30); $("#d-tr", v).innerHTML = `<div class="dual">${spark(s30.map(x => x.t), "#6366f1")}${spark(s30.map(x => x.t - x.b), "#10b981", 40)}</div><div class="mut sm">${dmy(s30[0].date)} → ${dmy(last.date)} · সর্বোচ্চ ${money0(Math.max(...s30.map(x => x.t)))} · সর্বনিম্ন ${money0(Math.min(...s30.map(x => x.t)))}</div>`;
      } else { $("#d-bs", v).textContent = "কোনো ব্যালেন্স সেভ নেই"; $("#d-tr", v).innerHTML = `<div class="mut sm">ডাটা নেই</div>`; }
    } catch (e) { if ($("#d-bs", v)) { $("#d-bs", v).textContent = isNetErr(e) ? "অফলাইন" : "লোড হয়নি"; $("#d-tr", v).innerHTML = `<div class="mut sm">${isNetErr(e) ? "ইন্টারনেট নেই" : esc(e.message)}</div>`; } }
  })();
  // cash figures
  (async () => {
    try {
      const rows = await cached("cash14", 60000, () => API.cashRange(addDays(t, -40), t)); if (!$("#d-ct", v)) return;
      const fin = rows.filter(r => r.status === "final"), last = fin[fin.length - 1], prev = fin[fin.length - 2];
      if (last) { $("#d-ct", v).textContent = "৳ " + money0(last.closing); $("#d-cs", v).innerHTML = `${dmy(last.date)} · হাতে ক্যাশ ${money0(last.cash_in_hand)} · ${delta(+last.closing, prev ? +prev.closing : null)}`; }
      else $("#d-cs", v).textContent = "এখনো কোনো ক্যাশ রেকর্ড নেই";
      const r14 = rows.filter(r => r.date > addDays(t, -14)); $("#d-cash", v).innerHTML = bars2(r14.map(r => ({ l: dmy(r.date), a: +r.total_receipt || 0, b: +r.total_payment || 0 }))) + (r14.length ? `<div class="mut sm">Receipt ৳ ${money0(r14.reduce((s, r) => s + (+r.total_receipt || 0), 0))} · Payment ৳ ${money0(r14.reduce((s, r) => s + (+r.total_payment || 0), 0))}</div>` : "");
    } catch (e) { if ($("#d-cs", v)) { $("#d-cs", v).textContent = /relation|does not exist|schema cache|not find/i.test(e.message || "") ? "SQL v3 চালানো বাকি" : isNetErr(e) ? "অফলাইন" : "লোড হয়নি"; $("#d-cash", v).innerHTML = ""; } }
  })();
  if (admin) (async () => { const el = $("#d-bk", v); try { const b = (await API.backups())[0]; if (!el) return; const ok = b && Date.now() - new Date(b.at) < 36 * 36e5; el.className = "stchip " + (ok ? "ok" : "no"); el.innerHTML = `<i>${ok ? "✓" : "!"}</i><span><b>Backup</b><small>${b ? relTime(b.at) : "এখনো হয়নি"}</small></span>`; el.onclick = () => location.hash = "#/audit"; } catch { if (el) { el.className = "stchip no"; el.innerHTML = `<i>!</i><span><b>Backup</b><small>সেটআপ বাকি</small></span>`; } } })();
}

/* =================== v6: bank + cheque reports =================== */
async function vReports(v) {
  const F = { tab: sessionStorage.getItem("nabiad_rep_tab") || "bank", p: "month", from: "", to: "", holder: "" }; const holders = [...new Set(S.accounts.map(a => a.holder).filter(Boolean))].sort();
  v.innerHTML = head("রিপোর্ট", `<button class="btn" id="p-x">${ico("dl")} Excel</button><button class="btn" id="p-p">${ico("print")} প্রিন্ট</button>`) + `
   <div class="tabs noprint">${[["bank", "🏦 ব্যাংক ব্যালেন্স"], ["chq", "🧾 চেক"]].map(([k, l]) => `<span class="chip ${k === F.tab ? "on" : ""}" data-tab="${k}">${l}</span>`).join("")}</div>
   <div class="card noprint" style="margin-bottom:14px"><label class="f">সময়</label><div class="seg wrap">${[["today", "আজ"], ["week", "৭ দিন"], ["month", "এই মাস"], ["last", "গত মাস"], ["year", "এই বছর"], ["custom", "তারিখ নির্বাচন"]].map(([k, l]) => `<span class="chip ${k === F.p ? "on" : ""}" data-p="${k}">${l}</span>`).join("")}</div>
   <div class="row" style="margin-top:10px"><div class="hide" id="p-cu" style="flex:2 1 260px"><label class="f">From → To</label><div style="display:flex;gap:6px"><input class="in" type="date" id="p-f"><input class="in" type="date" id="p-t"></div></div>
   <div style="flex:1 1 200px"><label class="f">অ্যাকাউন্ট হোল্ডার</label><select class="in" id="p-h"><option value="">সব</option>${holders.map(h => `<option>${esc(h)}</option>`).join("")}</select></div></div></div><div id="p-out"></div>`;
  let cur = null;
  const tbl = (title, rows, cols, total = true, fmt = r => [r.n, money0(r.amt)]) => { const mx = Math.max(1, ...rows.map(r => Math.abs(r.amt))); const T = rows.reduce((s, r) => ({ n: s.n + (r.n || 0), a: s.a + r.amt }), { n: 0, a: 0 });
    return `<div class="card"><h3>${title}</h3>${rows.length ? `<div class="tw"><table><thead><tr>${cols.map((c, i) => `<th class="${i ? "r" : ""}">${c}</th>`).join("")}<th style="width:26%" class="noprint"></th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.k}</td>${fmt(r).map(x => `<td class="r num">${x}</td>`).join("")}<td class="noprint"><div class="bar ${r.amt < 0 ? "neg" : ""}"><i style="width:${(Math.abs(r.amt) / mx * 100).toFixed(1)}%"></i></div></td></tr>`).join("")}${total ? `<tr class="tot"><td>মোট</td>${fmt({ n: T.n, amt: T.a }).map(x => `<td class="r num">${x}</td>`).join("")}<td class="noprint"></td></tr>` : ""}</tbody></table></div>` : `<div class="empty">ডাটা নেই</div>`}</div>`; };
  const range = () => { if (F.p === "custom") return [F.from || addDays(today(), -30), F.to || today()]; if (F.p === "week") return [addDays(today(), -6), today()]; return periodRange(F.p); };
  async function draw() {
    const [from, to] = range(), am = accMap(), out = $("#p-out", v); const hOk = code => !F.holder || (am[code] || {}).holder === F.holder;
    const label = `<div class="mut sm" style="margin-bottom:10px"><b>${dmy(from)}</b> → <b>${dmy(to)}</b>${F.holder ? " · " + esc(F.holder) : ""} · <span>${daysBetween(from, to) + 1}</span> <span>দিন</span></div>`;
    if (F.tab === "bank") {
      out.innerHTML = `<div class="card"><div class="skel" style="height:120px"></div></div>`;
      let rows; try { rows = (await cached(`br:${from}:${to}`, 120000, () => API.balancesRange(addDays(from, -10), to))).filter(r => hOk(r.code) && am[r.code]?.daily); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(isNetErr(e) ? "ইন্টারনেট নেই — ব্যাংক রিপোর্টের জন্য অনলাইন থাকতে হবে" : e.message)}</div>`; return; }
      const before = rows.filter(r => r.date < from), inR = rows.filter(r => r.date >= from);
      const ser = balSeries(inR); if (!ser.length) { out.innerHTML = label + `<div class="card empty">এই সময়ে কোনো ব্যালেন্স সেভ নেই</div>`; cur = null; return; }
      const firstD = ser[0].date, lastD = ser[ser.length - 1].date, openD = before.length ? before[before.length - 1].date : firstD;
      const mapOn = (arr, d) => Object.fromEntries(arr.filter(r => r.date === d).map(r => [r.code, r]));
      const O = mapOn(before.length ? before : inR, openD), C = mapOn(inR, lastD);
      const codes = [...new Set([...Object.keys(O), ...Object.keys(C)])].sort((a, b) => (am[a]?.sort || 0) - (am[b]?.sort || 0));
      const accRows = codes.map(c => ({ c, a: am[c], o: O[c]?.total || 0, cl: C[c]?.total || 0, bl: C[c]?.block || 0 })).map(r => ({ ...r, ch: r.cl - r.o }));
      const grp = kf => { const m = new Map(); accRows.forEach(r => { const k = kf(r) || "—"; const o = m.get(k) || { k, n: 0, amt: 0, o: 0, bl: 0 }; o.n++; o.amt += r.cl; o.o += r.o; o.bl += r.bl; m.set(k, o); }); return [...m.values()].sort((a, b) => b.amt - a.amt); };
      const byBank = grp(r => r.a?.bank), byHolder = grp(r => r.a?.holder);
      const L = ser[ser.length - 1], To = accRows.reduce((s, r) => s + r.o, 0), mx = ser.reduce((a, b) => b.t > a.t ? b : a), mn = ser.reduce((a, b) => b.t < a.t ? b : a);
      const movers = [...accRows].filter(r => Math.abs(r.ch) >= 1).sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch)).slice(0, 12);
      cur = { kind: "bank", from, to, ser, accRows, byBank, byHolder };
      out.innerHTML = label + `<div class="grid g4">
        <div class="kpi card k-vi"><div class="l">ক্লোজিং ব্যালেন্স<span class="ki">${ico("bank")}</span></div><div class="v num">৳ ${money0(L.t)}</div><div class="s">${dmy(lastD)} · ${L.n} A/C</div></div>
        <div class="kpi card ${L.t - To >= 0 ? "k-gr" : "k-rd"}"><div class="l">এই সময়ে পরিবর্তন<span class="ki">${ico("chart")}</span></div><div class="v num">${L.t - To >= 0 ? "+" : "−"}${money0(Math.abs(L.t - To))}</div><div class="s">শুরু ${money0(To)} (${dmy(openD)})</div></div>
        <div class="kpi card k-gr"><div class="l">Usable<span class="ki">${ico("wallet")}</span></div><div class="v num">৳ ${money0(L.t - L.b)}</div><div class="s">Block ${money0(L.b)}</div></div>
        <div class="kpi card k-am"><div class="l">সর্বোচ্চ / সর্বনিম্ন<span class="ki">${ico("clock")}</span></div><div class="v num" style="font-size:18px">${money0(mx.t)}</div><div class="s">${dmy(mx.date)} · সর্বনিম্ন ${money0(mn.t)} (${dmy(mn.date)})</div></div></div>
       <div class="card" style="margin-top:14px"><div class="ch" style="padding:0 0 8px"><h3>দৈনিক মোট ব্যালেন্স</h3><span class="mut sm">${ser.length} দিন</span></div><div class="dual">${spark(ser.map(x => x.t), "#6366f1", 110)}${spark(ser.map(x => x.t - x.b), "#10b981", 60)}</div><div class="lgd"><span><i style="background:#6366f1"></i>মোট</span><span><i style="background:#10b981"></i>Usable</span></div></div>
       <div class="grid g2" style="margin-top:14px">${tbl("ব্যাংক অনুযায়ী (ক্লোজিং)", byBank.map(r => ({ ...r, k: esc(r.k) })), ["ব্যাংক", "A/C", "ব্যালেন্স"])}${tbl("হোল্ডার অনুযায়ী (ক্লোজিং)", byHolder.map(r => ({ ...r, k: esc(r.k) })), ["হোল্ডার", "A/C", "ব্যালেন্স"])}</div>
       <div style="margin-top:14px">${tbl("সবচেয়ে বেশি পরিবর্তন", movers.map(r => ({ k: `<b>${esc(r.c)}</b> <span class="mut sm">${esc(r.a?.holder || "")}</span>`, n: money0(r.o), amt: r.ch, cl: r.cl })), ["অ্যাকাউন্ট", "শুরু", "শেষ", "পরিবর্তন"], false, r => [r.n, money0(r.cl), `<b class="${r.amt >= 0 ? "gr" : "rd"}">${r.amt >= 0 ? "+" : "−"}${money0(Math.abs(r.amt))}</b>`])}</div>
       <div style="margin-top:14px">${tbl("সব অ্যাকাউন্ট", accRows.map(r => ({ k: `<i class="bdot" style="background:${brandOf(r.a).c1}"></i><b>${esc(r.c)}</b> <span class="mut sm">${esc(r.a?.holder || "")}</span>`, n: money0(r.o), amt: r.cl, ch: r.ch, bl: r.bl })), ["অ্যাকাউন্ট", "শুরু", "ক্লোজিং", "Block", "পরিবর্তন"], false, r => [r.n, money0(r.amt), r.bl ? money0(r.bl) : "—", `<span class="${r.ch >= 0 ? "gr" : "rd"}">${Math.abs(r.ch) < 1 ? "—" : (r.ch >= 0 ? "+" : "−") + money0(Math.abs(r.ch))}</span>`])}</div>`;
      return;
    }
    const all = S.cheques.filter(c => c.date >= from && c.date <= to && hOk(c.code)); const live = all.filter(isLive), by = s => all.filter(c => c.status === s);
    const monRows = group(live, c => c.date.slice(0, 7)).sort((a, b) => a.k.localeCompare(b.k)).map(r => ({ ...r, k: (LANG === "en" ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] : BN_M)[+r.k.slice(5) - 1] + " " + r.k.slice(0, 4) }));
    const T = { pur: group(live, c => c.purpose.split(" (")[0]).sort((a, b) => b.amt - a.amt), tak: group(live.filter(c => c.taker), c => c.taker).sort((a, b) => b.amt - a.amt), st: group(all, c => c.status).sort((a, b) => b.amt - a.amt), bank: group(live, c => (am[c.code] || {}).bank).sort((a, b) => b.amt - a.amt), acc: group(live, c => `${c.code} <span class="mut sm">${esc((am[c.code] || {}).holder || "")}</span>`).sort((a, b) => b.amt - a.amt), day: group(live, c => c.date).sort((a, b) => a.k.localeCompare(b.k)).map(r => ({ ...r, k: dmy(r.k) })), mon: monRows };
    cur = { kind: "chq", from, to, all, live, T };
    if (!all.length) { out.innerHTML = label + `<div class="card empty">এই সময়ে কোনো চেক এন্ট্রি নেই।<div class="mut sm" style="margin-top:6px">ডাটাবেসে মোট <b>${S.cheques.length}</b>টি চেক আছে। চেক এন্ট্রি করলে এখানে খাত, ব্যাংক, অ্যাকাউন্ট আর দিন অনুযায়ী হিসাব আসবে।</div>${S.me.role !== "boss" ? `<div style="margin-top:12px"><a class="btn pri sm" href="#/entry">${ico("plus")} চেক এন্ট্রি</a></div>` : ""}</div>`; return; }
    out.innerHTML = label + `<div class="grid g4"><div class="kpi card"><div class="l">মোট চেক (কার্যকর)<span class="ki">${ico("list")}</span></div><div class="v num">${live.length}</div><div class="s num">৳ ${money0(sumAmt(live))}</div></div>
      <div class="kpi card k-gr"><div class="l">Cleared<span class="ki">${ico("flag")}</span></div><div class="v num gr">${by("Cleared").length}</div><div class="s num">৳ ${money0(sumAmt(by("Cleared")))}</div></div>
      <div class="kpi card k-am"><div class="l">Pending<span class="ki">${ico("clock")}</span></div><div class="v num am">${by("Pending").length}</div><div class="s num">৳ ${money0(sumAmt(by("Pending")))}</div></div>
      <div class="kpi card k-rd"><div class="l">Bounced / বাতিল<span class="ki">${ico("flag")}</span></div><div class="v num rd">${by("Bounced").length} / ${by("Cancelled").length}</div><div class="s num">৳ ${money0(sumAmt(by("Bounced")))}</div></div></div>
     <div class="grid g2" style="margin-top:14px">${tbl("খাত অনুযায়ী", T.pur, ["খাত", "চেক", "টাকা"])}${tbl("কে তুলেছে (ক্যাশ)", T.tak, ["নাম", "চেক", "টাকা"])}${tbl("স্ট্যাটাস", T.st, ["স্ট্যাটাস", "চেক", "টাকা"])}${tbl("ব্যাংক অনুযায়ী", T.bank, ["ব্যাংক", "চেক", "টাকা"])}</div>
     <div style="margin-top:14px">${tbl("অ্যাকাউন্ট অনুযায়ী", T.acc, ["অ্যাকাউন্ট", "চেক", "টাকা"])}</div>
     <div class="grid g2" style="margin-top:14px">${daysBetween(from, to) <= 62 ? tbl("দিন অনুযায়ী", T.day, ["তারিখ", "চেক", "টাকা"]) : ""}${tbl("মাস অনুযায়ী", T.mon, ["মাস", "চেক", "টাকা"])}</div>`;
  }
  $$(".chip[data-tab]", v).forEach(c => c.onclick = () => { F.tab = c.dataset.tab; sessionStorage.setItem("nabiad_rep_tab", F.tab); $$(".chip[data-tab]", v).forEach(x => x.classList.toggle("on", x === c)); draw(); });
  $$(".chip[data-p]", v).forEach(c => c.onclick = () => { F.p = c.dataset.p; $$(".chip[data-p]", v).forEach(x => x.classList.toggle("on", x === c)); $("#p-cu", v).classList.toggle("hide", F.p !== "custom"); if (F.p === "custom" && !F.from) { F.from = addDays(today(), -30); F.to = today(); $("#p-f", v).value = F.from; $("#p-t", v).value = F.to; } draw(); });
  ["p-f", "p-t"].forEach(id => $("#" + id, v).onchange = () => { F.from = $("#p-f", v).value; F.to = $("#p-t", v).value; if (F.from && F.to && F.from > F.to) return toast("From তারিখ To-এর পরে হতে পারে না", "err"); draw(); });
  $("#p-h", v).onchange = e => { F.holder = e.target.value; draw(); };
  $("#p-p", v).onclick = () => window.print();
  $("#p-x", v).onclick = () => {
    if (!cur) return toast("ডাটা নেই", "err"); const strip = s => String(s).replace(/<[^>]+>/g, "").trim();
    if (cur.kind === "bank") return exportXlsx({ Daily: [["Date", "Accounts", "Total", "Block", "Usable"], ...cur.ser.map(x => [dmy(x.date), x.n, x.t, x.b, x.t - x.b])], Accounts: [["Code", "Holder", "Bank", "Opening", "Closing", "Block", "Change"], ...cur.accRows.map(r => [r.c, r.a?.holder || "", r.a?.bank || "", r.o, r.cl, r.bl, r.ch])], "By Bank": [["Bank", "A/C", "Closing", "Block"], ...cur.byBank.map(r => [r.k, r.n, r.amt, r.bl])], "By Holder": [["Holder", "A/C", "Closing", "Block"], ...cur.byHolder.map(r => [r.k, r.n, r.amt, r.bl])] }, `Bank_Report_${cur.from}_${cur.to}.xlsx`);
    const sh = (rows, h) => [h, ...rows.map(r => [strip(r.k), r.n, r.amt])];
    exportXlsx({ Summary: [["Period", `${cur.from} → ${cur.to}`], ["Holder", F.holder || "All"], [], ["Live cheques", cur.live.length, sumAmt(cur.live)]], "By Purpose": sh(cur.T.pur, ["Purpose", "Count", "Amount"]), "By Cash Taker": sh(cur.T.tak, ["Name", "Count", "Amount"]), "By Status": sh(cur.T.st, ["Status", "Count", "Amount"]), "By Bank": sh(cur.T.bank, ["Bank", "Count", "Amount"]), "By Account": sh(cur.T.acc, ["Account", "Count", "Amount"]), "By Day": sh(cur.T.day, ["Date", "Count", "Amount"]), "By Month": sh(cur.T.mon, ["Month", "Count", "Amount"]), Details: [CHQ_HEAD, ...[...cur.all].sort((a, b) => a.date.localeCompare(b.date)).map(chqRow)] }, `Cheque_Report_${today()}.xlsx`);
  };
  await draw();
}

/* =================== v6: CASH — daily record =================== */
const CASH = {
  receipt: [{ g: "Chawkbazar", items: [["cz_cos", "Cosmetics Parties"], ["cz_food", "Food Parties"], ["cz_chem", "Chemicals"], ["cz_oth", "Others"]] }, { g: "", items: [["niramoy", "Niramoy"], ["dist", "Distribution"], ["bank_in", "Total Bank"]] }],
  payment: [{ g: "", items: [["bank_out", "Bank"], ["lc", "LC/CC/OD"], ["loans", "Loans/Bills/Etc."], ["supp", "Suppliers"], ["p_oth", "Others"]] }]
};
const CASH_KEYS = t => CASH[t].flatMap(g => g.items.map(i => i[0]));
const cashLabel = k => { for (const t of ["receipt", "payment"]) for (const g of CASH[t]) for (const [kk, l] of g.items) if (kk === k) return (g.g ? g.g + " · " : "") + l; return k; };
const cashType = k => CASH_KEYS("receipt").includes(k) ? "receipt" : "payment";
function evalAmt(s) { s = String(s ?? "").replace(/[,৳\s]/g, ""); if (!s) return 0; if (!/^[-+]?\d*\.?\d+([+-]\d*\.?\d+)*$/.test(s)) return NaN; return s.match(/[+-]?\d*\.?\d+/g).reduce((a, b) => a + parseFloat(b), 0); }
function cashTotals(items) { const sum = t => CASH_KEYS(t).reduce((s, k) => s + (+items?.[k]?.a || 0), 0); return { r: sum("receipt"), p: sum("payment") }; }
const CASH_DRAFT = d => "nabiad_cash_draft_" + d;

async function vCash(v) {
  const t = today(); let date = sessionStorage.getItem("nabiad_cash_date") || (S.lastCash && S.lastCash < t ? stepDay(S.lastCash, 1) : t); sessionStorage.removeItem("nabiad_cash_date"); if (date > t) date = t;
  v.innerHTML = head("দৈনিক ক্যাশ রেকর্ড", `<a class="btn" href="#/cashsum">${ico("chart")} সামারি</a>`) + `<div class="card navcard" style="margin-bottom:14px">${dateNav("cs", date)}<div id="cs-msg" style="margin-top:10px"></div></div><div id="cs-body"><div class="card empty">লোড হচ্ছে…</div></div>`;
  const body = $("#cs-body", v); let autoT = null;
  async function draw() {
    date = $("#cs-d", v).value; if (!date) return; body.innerHTML = `<div class="card empty">লোড হচ্ছে…</div>`;
    let ex = null, prev = null, bankRef = null;
    try { [ex, prev] = await Promise.all([API.cashOn(date), API.cashPrev(date)]); } catch (e) {
      body.innerHTML = `<div class="alert rd">${/relation|does not exist|schema cache|not find/i.test(e.message || "") ? "ক্যাশ টেবিল নেই — Supabase-এ schema_v3.sql চালাতে হবে" : isNetErr(e) ? "ইন্টারনেট নেই — ক্যাশ রেকর্ডের জন্য অনলাইন থাকতে হবে (এই ডিভাইসে লেখা ড্রাফট জমা থাকবে)" : esc(e.message)}</div>`; if (!isNetErr(e)) return;
    }
    try { const bm = await balancesOn(date); const am = accMap(); let tot = 0, n = 0; Object.entries(bm).forEach(([c, r]) => { if (am[c] && r.total != null) { tot += r.total; n++; } }); if (n) bankRef = tot; } catch { }
    const final = ex?.status === "final", admin = S.me.role === "admin", locked = (final && !admin) || S.me.role === "boss";
    let local = null; try { local = JSON.parse(localStorage.getItem(CASH_DRAFT(date)) || "null"); } catch { }
    let src = ex; let fromLocal = false;
    if (!final && local && (!ex || new Date(local.updated_at) > new Date(ex.updated_at))) { src = local; fromLocal = true; }
    const oc = src ? +src.opening_cash || 0 : (prev ? +prev.cash_in_hand || 0 : 0), ob = src ? +src.opening_bank || 0 : (prev ? (+prev.closing || 0) - (+prev.cash_in_hand || 0) : 0);
    const items = src?.items || {};
    const msgs = [];
    if (final) msgs.push(`<div class="alert ${locked ? "rd" : "am"}">${locked ? "🔒 এই তারিখের ক্যাশ রেকর্ড ফাইনাল সেভ হয়েছে।" : "⚠ ফাইনাল সেভ করা আছে — Admin হিসেবে বদলাতে পারবেন।"} <span class="mut sm">${esc(ex.entered_by || "")}</span></div>`);
    else if (src) msgs.push(`<div class="alert vi">📝 <span>ড্রাফট লোড হয়েছে${fromLocal ? " (এই ডিভাইস)" : ""} — ${esc(src.entered_by || S.me.name)} · ${new Date(src.updated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>${!locked ? `<button class="btn sm" id="cs-dd" style="margin-left:auto">ড্রাফট বাদ দিন</button>` : ""}</div>`);
    if (!src && prev) msgs.push(`<div class="mut sm">Opening নেওয়া হয়েছে <b>${dmy(prev.date)}</b>-এর ক্লোজিং থেকে${workGap(prev.date, date) ? ` · <b class="am">মাঝে ${workGap(prev.date, date)} কর্মদিবসের রেকর্ড নেই</b>` : ""}</div>`);
    if (!src && !prev) msgs.push(`<div class="mut sm">এটা প্রথম রেকর্ড — Opening Cash ও Bank নিজে লিখুন।</div>`);
    if (!locked) msgs.push(`<div class="mut xs">💡 একই খাতে কয়েকটা অংক থাকলে + দিয়ে লিখুন, যেমন 5000+12000</div>`);
    $("#cs-msg", v).innerHTML = msgs.join("");
    $("#cs-dd", v) && ($("#cs-dd", v).onclick = async () => { if (!ask("এই তারিখের ড্রাফট মুছবেন?")) return; localStorage.removeItem(CASH_DRAFT(date)); if (ex && !final) { try { await API.cashSave({ date, opening_cash: oc, opening_bank: ob, items: {}, total_receipt: 0, total_payment: 0, closing: oc + ob, cash_in_hand: null, remarks: null, status: "draft" }); } catch { } } draw(); });
    const dis = locked ? "disabled" : "";
    const row = (k, l) => { const it = items[k] || {}; return `<div class="crow cr2" data-k="${k}"><label>${esc(l)}</label><div class="cv"><input class="cell camt" value="${esc(it.x ?? (it.a ? fmtIn(it.a) : ""))}" inputmode="decimal" placeholder="0" ${dis}><span class="cval num"></span></div></div>`; };
    const side = (t, title, cls) => `<div class="card csec ${cls}"><div class="csh"><h3>${title}</h3><b class="num" id="cs-T${t[0]}">0</b></div>${CASH[t].map(g => `${g.g ? `<div class="cgrp"><span>${g.g}</span><b class="num" data-g="${g.g}">0</b></div>` : ""}<div class="${g.g ? "cin" : ""}">${g.items.map(([k, l]) => row(k, l)).join("")}</div>`).join("")}</div>`;
    body.innerHTML = `<div class="card csec c-open"><div class="csh"><h3>Opening Balance <span class="mut sm">(Cash in hand + Bank)</span></h3><b class="num" id="cs-OT">0</b></div>
       <div class="crow"><label>Cash in hand</label><input class="cell" id="cs-oc" value="${fmtIn(oc)}" inputmode="decimal" ${dis}></div><div class="crow"><label>Bank</label><input class="cell" id="cs-ob" value="${fmtIn(ob)}" inputmode="decimal" ${dis}></div></div>
      <div class="grid g2" style="margin-top:14px">${side("receipt", "Total Receipt", "c-rec")}${side("payment", "Total Payment", "c-pay")}</div>
      <div class="card csec c-close" style="margin-top:14px"><div class="csh"><h3>Closing Balance</h3><b class="num big" id="cs-CL">0</b></div>
       <div class="cbox"><div><span>Opening</span><b class="num" id="cs-x1"></b></div><div class="gr"><span>+ Receipt</span><b class="num" id="cs-x2"></b></div><div class="rd"><span>− Payment</span><b class="num" id="cs-x3"></b></div><div class="eq"><span>= Closing</span><b class="num" id="cs-x4"></b></div></div>
       <div class="crow hl"><label>Cash in hand <span class="mut xs">(গুনে লিখুন)</span></label><input class="cell" id="cs-ch" value="${src?.cash_in_hand == null ? "" : fmtIn(src.cash_in_hand)}" inputmode="decimal" placeholder="হাতে নগদ" ${dis}></div>
       <div class="crow"><label>Bank <span class="mut xs">(Closing − Cash)</span></label><b class="num" id="cs-cb"></b></div>
       ${bankRef != null ? `<div class="crow"><label class="mut">Daily Bank Closing (${dmy(date)})</label><span class="num mut">৳ ${money0(bankRef)}</span></div>` : ""}
       <div class="crow"><label>মন্তব্য</label><input class="cell t" id="cs-rm" value="${esc(src?.remarks || "")}" ${dis}></div></div>
      ${locked ? "" : `<div class="cbar"><button class="btn lg fix" id="cs-draft">${ico("edit")} ড্রাফট সেভ</button><button class="btn pri lg fix" id="cs-save">${ico("save")} ${dmy(date)} ক্যাশ ফাইনাল সেভ</button><div class="hint" id="cs-err"></div><div class="sp"></div><span class="mut sm" id="cs-auto"></span></div>`}`;
    const collect = () => {
      const it = {}; let bad = null;
      $$(".crow[data-k]", body).forEach(r => { const k = r.dataset.k, x = $(".camt", r).value.trim(), n = items[k]?.n || "", a = evalAmt(x); r.classList.toggle("err", isNaN(a)); if (isNaN(a)) bad ||= k; $(".cval", r).textContent = /[+-]/.test(x.replace(/^[-+]/, "")) && !isNaN(a) ? "= " + money0(a) : ""; $(".camt", r).classList.toggle("chg", !!a); if (a || n) it[k] = { a: isNaN(a) ? 0 : a, ...(x && /[+-]/.test(x.replace(/^[-+]/, "")) ? { x } : {}), ...(n ? { n } : {}) }; });
      const T = cashTotals(it), oc = num($("#cs-oc", body).value), ob = num($("#cs-ob", body).value), cl = oc + ob + T.r - T.p, chv = $("#cs-ch", body).value.trim();
      return { bad, row: { date, opening_cash: oc, opening_bank: ob, items: it, total_receipt: T.r, total_payment: T.p, closing: cl, cash_in_hand: chv === "" ? null : num(chv), remarks: $("#cs-rm", body).value.trim() || null } };
    };
    const calc = () => {
      const { row: r } = collect();
      $("#cs-OT", body).textContent = money0(r.opening_cash + r.opening_bank); $("#cs-Tr", body).textContent = money0(r.total_receipt); $("#cs-Tp", body).textContent = money0(r.total_payment);
      CASH.receipt.filter(g => g.g).forEach(g => { const el = $(`[data-g="${g.g}"]`, body); if (el) el.textContent = money0(g.items.reduce((s, [k]) => s + (r.items[k]?.a || 0), 0)); });
      $("#cs-CL", body).textContent = "৳ " + money0(r.closing); $("#cs-x1", body).textContent = money0(r.opening_cash + r.opening_bank); $("#cs-x2", body).textContent = money0(r.total_receipt); $("#cs-x3", body).textContent = money0(r.total_payment); $("#cs-x4", body).textContent = money0(r.closing);
      const cb = $("#cs-cb", body); cb.textContent = r.cash_in_hand == null ? "—" : money0(r.closing - r.cash_in_hand); cb.className = "num " + (r.cash_in_hand != null && r.closing - r.cash_in_hand < 0 ? "rd b" : "");
      return r;
    };
    const autosave = () => { if (locked) return; clearTimeout(autoT); autoT = setTimeout(() => { const { row } = collect(); try { localStorage.setItem(CASH_DRAFT(date), JSON.stringify({ ...row, status: "draft", entered_by: S.me.name, updated_at: new Date().toISOString() })); } catch { } const a = $("#cs-auto", body); if (a) a.textContent = "✓ এই ডিভাইসে অটো-সেভ " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }, 700); };
    $$("input", body).forEach(i => { i.addEventListener("input", () => { calc(); autosave(); }); if (!i.classList.contains("t") && !i.classList.contains("cnote")) { i.addEventListener("focus", () => i.select()); i.addEventListener("blur", () => { if (i.classList.contains("camt") && /[+-]/.test(i.value.replace(/^[-+]/, ""))) return; if (i.value.trim() !== "" && !isNaN(evalAmt(i.value))) i.value = fmtIn(evalAmt(i.value)); calc(); }); } });
    const amts = $$("input.camt, #cs-oc, #cs-ob, #cs-ch", body); amts.forEach((i, n) => i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); const nx = amts[n + 1]; nx ? nx.focus() : $("#cs-save", body)?.focus(); } }));
    calc();
    if (locked) return;
    const save = async status => {
      const { row, bad } = collect(), err = $("#cs-err", body); err.className = "hint rd"; err.textContent = "";
      if (bad) { err.textContent = `ভুল অংক: ${cashLabel(bad)} — শুধু সংখ্যা আর + / − লিখুন`; return; }
      if (status === "final") {
        if (row.cash_in_hand == null) { err.textContent = "Cash in hand লিখুন (হাতে কত নগদ আছে)"; $("#cs-ch", body).focus(); return; }
        if (row.cash_in_hand > row.closing && !ask("Cash in hand Closing-এর চেয়ে বেশি — Bank ঋণাত্মক হবে। তবুও সেভ করবেন?")) return;
        if (!ask(`${dmy(date)} — ক্যাশ ফাইনাল সেভ\nReceipt ৳ ${money0(row.total_receipt)} · Payment ৳ ${money0(row.total_payment)}\nClosing ৳ ${money0(row.closing)} · Cash in hand ৳ ${money0(row.cash_in_hand)}${S.me.role !== "admin" ? "\n\nসেভের পর আর বদলানো যাবে না (শুধু Admin পারবে)।" : ""}`)) return;
      }
      const b = $(status === "final" ? "#cs-save" : "#cs-draft", body); b.disabled = true;
      try {
        await API.cashSave({ ...row, status }); localStorage.removeItem(CASH_DRAFT(date)); dropCache("cash");
        if (status === "final") { S.lastCash = await API.lastCashDate().catch(() => date); saveCache(); refreshBadges(); toast("✔ ক্যাশ রেকর্ড ফাইনাল সেভ হয়েছে"); } else toast("✔ ড্রাফট সেভ হয়েছে");
        await draw();
      } catch (e) { toast(isNetErr(e) ? "ইন্টারনেট নেই — এই ডিভাইসে জমা আছে, নেট এলে আবার সেভ করুন" : e.message || String(e), "err"); b.disabled = false; }
    };
    $("#cs-draft", body).onclick = () => save("draft"); $("#cs-save", body).onclick = () => save("final");
  }
  bindDateNav(v, "cs", draw); await draw(); return () => clearTimeout(autoT);
}

/* =================== v6: CASH — summary board / history =================== */
function cashPeriod(p, f, t) { const T = today(); if (p === "30") return [addDays(T, -29), T]; if (p === "custom") return [f || addDays(T, -29), t || T]; return periodRange(p); }
function periodBar(id, cur) { return `<div class="seg wrap" id="${id}">${[["30", "৩০ দিন"], ["month", "এই মাস"], ["last", "গত মাস"], ["year", "এই বছর"], ["custom", "তারিখ নির্বাচন"]].map(([k, l]) => `<span class="chip ${k === cur ? "on" : ""}" data-p="${k}">${l}</span>`).join("")}</div><div class="row hide" id="${id}-cu" style="margin-top:8px"><input class="in" type="date" id="${id}-f"><input class="in" type="date" id="${id}-t"></div>`; }
function bindPeriod(v, id, F, draw) {
  $$(`#${id} .chip`, v).forEach(c => c.onclick = () => { F.p = c.dataset.p; $$(`#${id} .chip`, v).forEach(x => x.classList.toggle("on", x === c)); $(`#${id}-cu`, v).classList.toggle("hide", F.p !== "custom"); if (F.p === "custom" && !F.f) { F.f = addDays(today(), -29); F.t = today(); $(`#${id}-f`, v).value = F.f; $(`#${id}-t`, v).value = F.t; } draw(); });
  [`${id}-f`, `${id}-t`].forEach(x => $("#" + x, v).onchange = () => { F.f = $(`#${id}-f`, v).value; F.t = $(`#${id}-t`, v).value; draw(); });
}
const cashErr = e => /relation|does not exist|schema cache|not find/i.test(e.message || "") ? "ক্যাশ টেবিল নেই — Supabase-এ schema_v3.sql চালাতে হবে" : isNetErr(e) ? "ইন্টারনেট নেই" : (e.message || String(e));
async function vCashSum(v) {
  const F = { p: "30" };
  v.innerHTML = head("ক্যাশ সামারি ও ইতিহাস", `<button class="btn" id="cm-x">${ico("dl")} Excel</button>${S.me.role !== "boss" ? `<a class="btn pri" href="#/cash">${ico("plus")} আজকের রেকর্ড</a>` : ""}`) + `<div class="card noprint" style="margin-bottom:14px">${periodBar("cm", F.p)}</div><div id="cm-out"></div>`;
  let rows = [];
  async function draw() {
    const [f, t] = cashPeriod(F.p, F.f, F.t), out = $("#cm-out", v); out.innerHTML = `<div class="card"><div class="skel" style="height:120px"></div></div>`;
    try { rows = await API.cashRange(f, t); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(cashErr(e))}</div>`; return; }
    const fin = rows.filter(r => r.status === "final"), R = fin.reduce((s, r) => s + (+r.total_receipt || 0), 0), P = fin.reduce((s, r) => s + (+r.total_payment || 0), 0), last = fin[fin.length - 1], first = fin[0];
    let miss = 0; for (let d = f; d <= (t > today() ? today() : t); d = addDays(d, 1)) if (!isFri(d) && !rows.some(r => r.date === d)) miss++;
    const drafts = rows.filter(r => r.status !== "final");
    out.innerHTML = `<div class="mut sm" style="margin-bottom:10px"><b>${dmy(f)}</b> → <b>${dmy(t)}</b> · ${fin.length} দিনের ফাইনাল রেকর্ড${drafts.length ? ` · <span class="am">${drafts.length}টি ড্রাফট</span>` : ""}${miss ? ` · <span class="rd">${miss} কর্মদিবসের রেকর্ড নেই</span>` : ""}</div>
     <div class="grid g4"><div class="kpi card k-gr"><div class="l">মোট Receipt<span class="ki">${ico("dl")}</span></div><div class="v num">৳ ${money0(R)}</div><div class="s">দৈনিক গড় ${money0(fin.length ? R / fin.length : 0)}</div></div>
      <div class="kpi card k-rd"><div class="l">মোট Payment<span class="ki">${ico("out")}</span></div><div class="v num">৳ ${money0(P)}</div><div class="s">দৈনিক গড় ${money0(fin.length ? P / fin.length : 0)}</div></div>
      <div class="kpi card ${R - P >= 0 ? "k-vi" : "k-am"}"><div class="l">নিট (Receipt − Payment)<span class="ki">${ico("chart")}</span></div><div class="v num">${R - P >= 0 ? "+" : "−"}${money0(Math.abs(R - P))}</div><div class="s">${first ? `Opening ${money0(+first.opening_cash + +first.opening_bank)}` : "—"}</div></div>
      <div class="kpi card k-cy"><div class="l">সর্বশেষ Closing<span class="ki">${ico("wallet")}</span></div><div class="v num">৳ ${money0(last?.closing)}</div><div class="s">${last ? `${dmy(last.date)} · হাতে ${money0(last.cash_in_hand)}` : "রেকর্ড নেই"}</div></div></div>
     <div class="grid g2" style="margin-top:14px"><div class="card"><div class="ch" style="padding:0 0 8px"><h3>দৈনিক Receipt বনাম Payment</h3></div>${bars2(fin.slice(-45).map(r => ({ l: dmy(r.date), a: +r.total_receipt || 0, b: +r.total_payment || 0 })), 110)}<div class="lgd"><span><i style="background:#10b981"></i>Receipt</span><span><i style="background:#f43f5e"></i>Payment</span></div></div>
      <div class="card"><div class="ch" style="padding:0 0 8px"><h3>Closing ও হাতে নগদ</h3></div><div class="dual">${spark(fin.map(r => +r.closing || 0), "#6366f1", 100)}${spark(fin.map(r => +r.cash_in_hand || 0), "#f59e0b", 50)}</div><div class="lgd"><span><i style="background:#6366f1"></i>Closing</span><span><i style="background:#f59e0b"></i>Cash in hand</span></div></div></div>
     <div class="card flush" style="margin-top:14px"><div class="ch"><h3>দৈনিক ইতিহাস</h3><span class="tag">${rows.length}</span></div>${rows.length ? `<div class="tw cards"><table><thead><tr><th>তারিখ</th><th class="r">Opening</th><th class="r">Receipt</th><th class="r">Payment</th><th class="r">Closing</th><th class="r">Cash in hand</th><th class="r">Bank</th><th>অবস্থা</th><th>কে</th></tr></thead><tbody>${[...rows].reverse().map(r => `<tr data-d="${r.date}" style="cursor:pointer"><td><b>${dmy(r.date)}</b> <span class="mut xs">${new Date(r.date + "T00:00").toLocaleDateString("en-GB", { weekday: "short" })}</span></td><td class="r num">${money0(+r.opening_cash + +r.opening_bank)}</td><td class="r num gr">${money0(r.total_receipt)}</td><td class="r num rd">${money0(r.total_payment)}</td><td class="r num b">${money0(r.closing)}</td><td class="r num">${r.cash_in_hand == null ? "—" : money0(r.cash_in_hand)}</td><td class="r num">${r.cash_in_hand == null ? "—" : money0(r.closing - r.cash_in_hand)}</td><td>${r.status === "final" ? `<span class="tag au-insert">ফাইনাল</span>` : `<span class="tag au-update">ড্রাফট</span>`}</td><td class="mut sm">${esc(r.entered_by || "")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">এই সময়ে কোনো ক্যাশ রেকর্ড নেই${S.me.role !== "boss" ? `<div style="margin-top:10px"><a class="btn pri sm" href="#/cash">${ico("plus")} ক্যাশ রেকর্ড শুরু করুন</a></div>` : ""}</div>`}</div>`;
    $$("tr[data-d]", out).forEach(r => r.onclick = () => { if (S.me.role === "boss") return cashView(r.dataset.d); sessionStorage.setItem("nabiad_cash_date", r.dataset.d); location.hash = "#/cash"; });
  }
  bindPeriod(v, "cm", F, draw);
  $("#cm-x", v).onclick = () => rows.length ? exportXlsx({ Daily: [["Date", "Opening Cash", "Opening Bank", "Receipt", "Payment", "Closing", "Cash in hand", "Bank", "Status", "By", "Remarks"], ...rows.map(r => [dmy(r.date), +r.opening_cash, +r.opening_bank, +r.total_receipt, +r.total_payment, +r.closing, r.cash_in_hand == null ? "" : +r.cash_in_hand, r.cash_in_hand == null ? "" : r.closing - r.cash_in_hand, r.status, r.entered_by || "", r.remarks || ""])] }, `Cash_Summary_${today()}.xlsx`) : toast("ডাটা নেই", "err");
  await draw();
}
/* read-only view of one day (used by Boss, who cannot open the entry page) */
async function cashView(d) {
  let r; try { r = await API.cashOn(d); } catch (e) { return toast(cashErr(e), "err"); } if (!r) return toast("রেকর্ড নেই", "err");
  const line = k => r.items?.[k]?.a ? `<tr><td>${esc(cashLabel(k))}${r.items[k].n ? `<div class="mut xs">${esc(r.items[k].n)}</div>` : ""}</td><td class="r num">${money0(r.items[k].a)}</td></tr>` : "";
  modal(`<h2>ক্যাশ রেকর্ড · ${dmy(d)}</h2><div class="tw"><table><tbody><tr class="tot"><td>Opening (Cash ${money0(r.opening_cash)} + Bank ${money0(r.opening_bank)})</td><td class="r num">${money0(+r.opening_cash + +r.opening_bank)}</td></tr>${CASH_KEYS("receipt").map(line).join("")}<tr class="tot"><td>Total Receipt</td><td class="r num gr">${money0(r.total_receipt)}</td></tr>${CASH_KEYS("payment").map(line).join("")}<tr class="tot"><td>Total Payment</td><td class="r num rd">${money0(r.total_payment)}</td></tr><tr class="tot"><td>Closing · Cash in hand ${money0(r.cash_in_hand)}</td><td class="r num">${money0(r.closing)}</td></tr></tbody></table></div><div class="row" style="margin-top:14px"><button class="btn" id="cv-x">বন্ধ</button></div>`, (root, close) => $("#cv-x", root).onclick = close);
}

/* =================== v6: CASH — reports (category breakdown) =================== */
async function vCashRep(v) {
  const F = { p: "month" };
  v.innerHTML = head("ক্যাশ রিপোর্ট", `<button class="btn" id="cr-x">${ico("dl")} Excel</button><button class="btn" id="cr-p">${ico("print")} প্রিন্ট</button>`) + `<div class="card noprint" style="margin-bottom:14px">${periodBar("cr", F.p)}</div><div id="cr-out"></div>`;
  let cur = null;
  async function draw() {
    const [f, t] = cashPeriod(F.p, F.f, F.t), out = $("#cr-out", v); out.innerHTML = `<div class="card"><div class="skel" style="height:120px"></div></div>`;
    let rows; try { rows = (await API.cashRange(f, t)).filter(r => r.status === "final"); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(cashErr(e))}</div>`; return; }
    if (!rows.length) { out.innerHTML = `<div class="card empty">এই সময়ে কোনো ফাইনাল ক্যাশ রেকর্ড নেই</div>`; cur = null; return; }
    const cat = k => rows.reduce((s, r) => s + (+r.items?.[k]?.a || 0), 0), days = k => rows.filter(r => +r.items?.[k]?.a).length;
    const R = rows.reduce((s, r) => s + +r.total_receipt, 0), P = rows.reduce((s, r) => s + +r.total_payment, 0);
    const block = (t, title, tot, cls) => { const mx = Math.max(1, ...CASH_KEYS(t).map(cat)); return `<div class="card ${cls}"><div class="ch" style="padding:0 0 8px"><h3>${title}</h3><b class="num" style="margin-left:auto">৳ ${money0(tot)}</b></div><div class="tw"><table><thead><tr><th>খাত</th><th class="r">দিন</th><th class="r">টাকা</th><th class="r">%</th><th class="noprint" style="width:28%"></th></tr></thead><tbody>${CASH[t].map(g => (g.g ? `<tr class="grp"><td colspan="5"><b>${g.g}</b> <span class="mut sm">৳ ${money0(g.items.reduce((s, [k]) => s + cat(k), 0))}</span></td></tr>` : "") + g.items.map(([k, l]) => `<tr><td${g.g ? ' style="padding-left:22px"' : ""}>${esc(l)}</td><td class="r num">${days(k)}</td><td class="r num">${money0(cat(k))}</td><td class="r num mut">${tot ? (cat(k) / tot * 100).toFixed(1) : 0}%</td><td class="noprint"><div class="bar"><i style="width:${(cat(k) / mx * 100).toFixed(1)}%"></i></div></td></tr>`).join("")).join("")}<tr class="tot"><td>মোট</td><td></td><td class="r num">${money0(tot)}</td><td class="r num">100%</td><td class="noprint"></td></tr></tbody></table></div></div>`; };
    const months = [...new Set(rows.map(r => r.date.slice(0, 7)))].sort(), mName = m => (LANG === "en" ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] : BN_M)[+m.slice(5) - 1] + " " + m.slice(2, 4);
    const mcat = (m, k) => rows.filter(r => r.date.startsWith(m)).reduce((s, r) => s + (+r.items?.[k]?.a || 0), 0);
    cur = { f, t, rows, cat, months, mcat };
    out.innerHTML = `<div class="mut sm" style="margin-bottom:10px"><b>${dmy(f)}</b> → <b>${dmy(t)}</b> · ${rows.length} দিন</div>
     <div class="grid g3"><div class="kpi card k-gr"><div class="l">মোট Receipt</div><div class="v num">৳ ${money0(R)}</div></div><div class="kpi card k-rd"><div class="l">মোট Payment</div><div class="v num">৳ ${money0(P)}</div></div><div class="kpi card k-vi"><div class="l">নিট</div><div class="v num">${R - P >= 0 ? "+" : "−"}${money0(Math.abs(R - P))}</div></div></div>
     <div class="grid g2" style="margin-top:14px">${block("receipt", "Receipt — খাত অনুযায়ী", R, "c-rec")}${block("payment", "Payment — খাত অনুযায়ী", P, "c-pay")}</div>
     ${months.length > 1 ? `<div class="card flush" style="margin-top:14px"><div class="ch"><h3>মাস অনুযায়ী</h3></div><div class="tw"><table><thead><tr><th>খাত</th>${months.map(m => `<th class="r">${mName(m)}</th>`).join("")}<th class="r">মোট</th></tr></thead><tbody>${["receipt", "payment"].map(t => CASH_KEYS(t).map(k => `<tr><td>${esc(cashLabel(k))}</td>${months.map(m => `<td class="r num">${money0(mcat(m, k)) || "—"}</td>`).join("")}<td class="r num b">${money0(cat(k))}</td></tr>`).join("") + `<tr class="tot"><td>Total ${t === "receipt" ? "Receipt" : "Payment"}</td>${months.map(m => `<td class="r num">${money0(CASH_KEYS(t).reduce((s, k) => s + mcat(m, k), 0))}</td>`).join("")}<td class="r num">${money0(t === "receipt" ? R : P)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
  }
  bindPeriod(v, "cr", F, draw); $("#cr-p", v).onclick = () => window.print();
  $("#cr-x", v).onclick = () => { if (!cur) return toast("ডাটা নেই", "err"); const all = [...CASH_KEYS("receipt"), ...CASH_KEYS("payment")]; exportXlsx({ Categories: [["Type", "Category", "Amount"], ...all.map(k => [cashType(k), cashLabel(k), cur.cat(k)])], Monthly: [["Category", ...cur.months, "Total"], ...all.map(k => [cashLabel(k), ...cur.months.map(m => cur.mcat(m, k)), cur.cat(k)])] }, `Cash_Report_${cur.f}_${cur.t}.xlsx`); };
  await draw();
}

/* =================== v6: Cash Register (every line of every day) =================== */
async function vRegister(v) {
  const F = { p: "30", q: "", type: "", k: "" };
  v.innerHTML = head("ক্যাশ রেজিস্টার", `<button class="btn" id="rg-x">${ico("dl")} Excel</button>`) + `<div class="card noprint" style="margin-bottom:14px">${periodBar("rg", F.p)}<div class="row" style="margin-top:10px"><div style="flex:2 1 220px"><label class="f">খুঁজুন (নোট, খাত, অংক)</label><input class="in" id="rg-q" type="search" autocomplete="off"></div><div><label class="f">ধরন</label><select class="in" id="rg-t"><option value="">সব</option><option value="receipt">Receipt</option><option value="payment">Payment</option></select></div><div><label class="f">খাত</label><select class="in" id="rg-k"><option value="">সব</option>${[...CASH_KEYS("receipt"), ...CASH_KEYS("payment")].map(k => `<option value="${k}">${esc(cashLabel(k))}</option>`).join("")}</select></div></div></div><div id="rg-sum" class="mut sm" style="margin-bottom:8px"></div><div class="card flush" id="rg-out"></div>`;
  let lines = [], shown = [];
  async function load() {
    const [f, t] = cashPeriod(F.p, F.f, F.t); $("#rg-out", v).innerHTML = `<div class="empty">লোড হচ্ছে…</div>`;
    try { const rows = await API.cashRange(f, t); lines = rows.flatMap(r => Object.entries(r.items || {}).filter(([, it]) => it.a).map(([k, it]) => ({ date: r.date, k, type: cashType(k), a: +it.a, n: it.n || "", x: it.x || "", st: r.status, by: r.entered_by }))).sort((a, b) => b.date.localeCompare(a.date)); }
    catch (e) { $("#rg-out", v).innerHTML = `<div class="alert rd" style="margin:12px">${esc(cashErr(e))}</div>`; return; }
    draw();
  }
  function draw() {
    const q = norm(F.q); shown = lines.filter(l => (!F.type || l.type === F.type) && (!F.k || l.k === F.k) && (!q || norm(cashLabel(l.k) + l.n + l.a + l.x).includes(q)));
    const R = shown.filter(l => l.type === "receipt").reduce((s, l) => s + l.a, 0), P = shown.filter(l => l.type === "payment").reduce((s, l) => s + l.a, 0);
    $("#rg-sum", v).innerHTML = `<b>${shown.length}</b>টি লাইন · <span class="gr">Receipt ৳ ${money0(R)}</span> · <span class="rd">Payment ৳ ${money0(P)}</span>`;
    $("#rg-out", v).innerHTML = shown.length ? `<div class="tw cards"><table><thead><tr><th>তারিখ</th><th>ধরন</th><th>খাত</th><th class="r">টাকা</th><th>নোট</th><th>অবস্থা</th></tr></thead><tbody>${shown.slice(0, 1000).map(l => `<tr><td>${dmy(l.date)}</td><td><span class="tag ${l.type === "receipt" ? "au-insert" : "au-delete"}">${l.type === "receipt" ? "Receipt" : "Payment"}</span></td><td>${esc(cashLabel(l.k))}</td><td class="r num b ${l.type === "receipt" ? "gr" : "rd"}">${money0(l.a)}${l.x ? `<div class="mut xs">${esc(l.x)}</div>` : ""}</td><td class="sm">${esc(l.n)}</td><td class="mut sm">${l.st === "final" ? "ফাইনাল" : "ড্রাফট"} · ${esc(l.by || "")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">কিছু পাওয়া যায়নি</div>`;
  }
  bindPeriod(v, "rg", F, load); $("#rg-q", v).oninput = e => { F.q = e.target.value; draw(); }; $("#rg-t", v).onchange = e => { F.type = e.target.value; draw(); }; $("#rg-k", v).onchange = e => { F.k = e.target.value; draw(); };
  $("#rg-x", v).onclick = () => shown.length ? exportXlsx({ Register: [["Date", "Type", "Category", "Amount", "Expression", "Note", "Status", "By"], ...shown.map(l => [dmy(l.date), l.type, cashLabel(l.k), l.a, l.x, l.n, l.st, l.by || ""])] }, `Cash_Register_${today()}.xlsx`) : toast("ডাটা নেই", "err");
  await load();
}

/* =================== v6: reminders (photo + pick days + cheque link) =================== */
Object.assign(SbAPI, {
  async addReminder(r) { const row = { id: r.id || crypto.randomUUID(), title: r.title, note: r.note || null, due_at: r.due_at, repeat: r.repeat || "none", for_role: r.for_role || "me", kind: r.kind || "custom", cheque_id: r.cheque_id || null, created_by: S.me.name }; if (r.photo) row.photo = r.photo; const { data, error } = await sb.from("reminders").insert(row).select().single(); if (error) throw error; return data; }
});
const PICK_DAYS = [1, 2, 3, 5, 7, 10, 15, 30];
function reminderModal(r, opts = {}, after) {
  const isNew = !r; const def = opts.due ? new Date(opts.due) : (() => { const d = new Date(Date.now() + 36e5); d.setMinutes(0, 0, 0); return d; })();
  r = r || { title: opts.title || "", note: opts.note || "", due_at: def.toISOString(), repeat: "none", for_role: opts.for_role || "me", kind: opts.kind || "custom", cheque_id: opts.cheque_id || null, photo: null };
  const [d0, t0] = localDT(r.due_at), admin = S.me.role === "admin", canPhoto = S.me.role !== "boss", st = { photo: null };
  const chq = r.cheque_id && S.cheques.find(c => c.id === r.cheque_id);
  modal(`<h2>${isNew ? "⏰ নতুন রিমাইন্ডার" : "রিমাইন্ডার এডিট"}</h2><div class="grid" style="gap:12px">
   <div><label class="f">কী মনে করাবে *</label><input class="in" id="m-t" value="${esc(r.title)}" placeholder="যেমন: পার্টির চেক জমা দিন / পাস হয়েছে কিনা দেখুন" autocomplete="off"></div>
   <div><label class="f">বিস্তারিত (পার্টি, টাকা, ব্যাংক…)</label><input class="in" id="m-n" value="${esc(r.note || "")}" autocomplete="off"></div>
   ${canPhoto ? `<div><label class="f">চেক / কাগজের ছবি <span class="mut">(ঐচ্ছিক)</span></label><div class="photo-in"><label class="btn" for="m-ph">${ico("cam")} ছবি তুলুন / বাছুন</label><input type="file" id="m-ph" accept="image/*" hidden><img id="m-phv" class="hide" alt=""><button class="btn sm ghost hide" id="m-phx">✕</button>${r.photo ? `<span class="mut sm">ছবি আছে — নতুন দিলে বদলাবে</span>` : ""}</div></div>` : ""}
   <div><label class="f">কত দিন পরে (Pick days)</label><div class="chips" id="m-pd">${PICK_DAYS.map(n => `<span class="chip" data-pd="${n}">${n} দিন</span>`).join("")}</div></div>
   <div class="row"><div><label class="f">তারিখ</label><input class="in" type="date" id="m-d" value="${d0}"></div><div><label class="f">সময়</label><input class="in" type="time" id="m-tm" value="${t0}"></div></div>
   <div class="row"><div><label class="f">পুনরাবৃত্তি</label><select class="in" id="m-r">${Object.entries(REPEATS).map(([k, l]) => `<option value="${k}" ${k === r.repeat ? "selected" : ""}>${l}</option>`).join("")}</select></div>
   <div><label class="f">কার জন্য</label><select class="in" id="m-f">${Object.entries(FOR_ROLE).filter(([k]) => k !== "admin" || admin).map(([k, l]) => `<option value="${k}" ${k === r.for_role ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
   <div><label class="f">আমাদের চেকের সাথে যুক্ত করুন <span class="mut">(ঐচ্ছিক)</span></label><div><input class="in" id="m-c" placeholder="A/C বা চেক নং লিখুন" autocomplete="off"></div></div>
   <div class="row"><button class="btn pri fix" id="m-ok">${ico("save")} সেভ</button><button class="btn fix" id="m-x">বাতিল</button></div></div>`, (root, close) => {
    const g = id => $("#" + id, root);
    if (canPhoto) photoPicker(root, st, { inp: "m-ph", img: "m-phv", x: "m-phx" });
    const cs = suggest(g("m-c"), () => [...S.cheques].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 400).map(c => ({ value: `${c.code} · ${c.no}`, label: `৳ ${money0(c.amount)}`, sub: `${dmy(c.date)} · ${c.status}`, id: c.id })), () => { });
    if (chq) cs.setSilent({ value: `${chq.code} · ${chq.no}`, label: `৳ ${money0(chq.amount)}`, id: chq.id });
    $$("[data-pd]", root).forEach(c => c.onclick = () => { $$("[data-pd]", root).forEach(x => x.classList.toggle("on", x === c)); const d = new Date(); d.setDate(d.getDate() + +c.dataset.pd); g("m-d").value = iso(d); if (!g("m-tm").value || isNew) g("m-tm").value = "10:00"; });
    g("m-x").onclick = close; g("m-t").focus();
    g("m-ok").onclick = async () => {
      const title = g("m-t").value.trim(); if (!title) return toast("কী মনে করাবে লিখুন", "err");
      const due = new Date(`${g("m-d").value}T${g("m-tm").value || "10:00"}`); if (isNaN(due)) return toast("তারিখ/সময় ঠিক করুন", "err");
      const b = g("m-ok"); b.disabled = true;
      try {
        const id = r.id || crypto.randomUUID(); let photo;
        if (st.photo) { if (!navigator.onLine && !DEMO) throw new Error("ছবি সেভ করতে ইন্টারনেট লাগবে"); photo = `rem/${id.slice(0, 8)}_${Date.now()}.jpg`; await API.uploadPhoto(photo, st.photo); }
        const p = { title, note: g("m-n").value.trim(), due_at: due.toISOString(), repeat: g("m-r").value, for_role: g("m-f").value, snooze_until: null, cheque_id: cs.get()?.id || null, kind: cs.get() ? "cheque" : (r.kind || "custom"), ...(photo ? { photo } : {}) };
        if (isNew) { const row = await API.addReminder({ ...p, id }); (S.reminders ||= []).push(row); }
        else { await API.updateReminder(r.id, p); Object.assign(r, p); }
        S.reminders.sort((a, b) => remDue(a) - remDue(b)); saveCache(); updateBell(); close(); toast(`✔ রিমাইন্ডার: ${due.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`); after && after();
      } catch (e) { toast(remErrMsg(e), "err"); b.disabled = false; }
    };
  });
}
async function vRem(v) {
  let tab = "up";
  const draw = () => {
    const all = (S.reminders || []).slice().sort((a, b) => remDue(a) - remDue(b)), now = new Date(), sys = sysAlerts();
    const list = tab === "up" ? all.filter(r => !r.done) : tab === "done" ? all.filter(r => r.done).reverse() : all;
    const perm = "Notification" in window ? Notification.permission : "na", nUp = all.filter(r => !r.done).length, nDue = all.filter(r => !r.done && remDue(r) <= now).length;
    v.innerHTML = head("রিমাইন্ডার ও সতর্কতা") +
      (S.remErr ? `<div class="alert rd" style="margin-bottom:12px">${esc(remErrMsg({ message: S.remErr }))}</div>` : "") +
      (perm === "default" ? `<div class="alert vi" style="margin-bottom:12px">🔔 <span>নোটিফিকেশন চালু করলে সময় হলে ফোনে জানাবে।</span><button class="btn sm pri" id="rm-perm" style="margin-left:auto">চালু করুন</button></div>` : perm === "denied" ? `<div class="alert am" style="margin-bottom:12px">ব্রাউজারে নোটিফিকেশন বন্ধ — সাইট সেটিং থেকে চালু করুন। অ্যাপের ভিতরে রিমাইন্ডার তবুও আসবে।</div>` : "") +
      `<div class="remtop"><div class="tabs" style="margin:0">${[["up", "চালু", nUp], ["done", "সম্পন্ন", null], ["all", "সব", null]].map(([k, l, n]) => `<span class="chip ${k === tab ? "on" : ""}" data-t="${k}"><span>${l}</span>${n != null ? ` <b>${n}</b>` : ""}</span>`).join("")}</div>${nDue ? `<span class="tag t-due">${nDue} <span>টির সময় হয়েছে</span></span>` : ""}</div>
      <div class="rem-list" style="margin-top:12px">${tab !== "done" ? `<button class="card rem-add" id="rm-add"><span class="ri">${ico("plus")}</span><span><b>নতুন রিমাইন্ডার</b><small>পার্টির চেক, পেমেন্ট, অডিট বা যেকোনো কাজ — ছবি ও দিন বেছে দিন</small></span></button>` : ""}
      ${list.length ? list.map(r => { const due = !r.done && remDue(r) <= now; const ch = r.cheque_id && S.cheques.find(c => c.id === r.cheque_id); return `<div class="card rem ${due ? "due" : ""} ${r.done ? "dn" : ""}"><div class="ri">${ico(r.kind === "cheque" ? "list" : r.photo ? "cam" : "bell")}</div><div class="rt"><b>${esc(r.title)}</b>${r.note ? `<div class="mut sm">${esc(r.note)}</div>` : ""}
        <div class="rmeta"><span class="tag ${due ? "t-due" : ""}">${ico("clock").replace("<svg", '<svg width="12" height="12"')} ${new Date(remDue(r)).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · ${r.done ? "সম্পন্ন" : relTime(remDue(r))}</span>${r.repeat !== "none" ? `<span class="tag">${REPEATS[r.repeat] || ""}</span>` : ""}<span class="tag">${FOR_ROLE[r.for_role] || ""}</span>${ch ? `<span class="tag t-mv">${esc(ch.code)} · ${ch.no} ${stTag(ch.status)}</span>` : ""}<span class="mut xs">${esc(r.created_by || "")}</span></div>${r.photo ? `<div class="rph" data-ph="${esc(r.photo)}"></div>` : ""}</div>
        <div class="ra">${r.done ? "" : `<button class="btn ok sm" data-dn="${r.id}">✓ সম্পন্ন</button>${due ? snoozeBtns(r.id) : ""}`}${r.cheque_id ? `<button class="btn sm" data-oc="${r.cheque_id}">চেক</button>` : ""}<button class="btn sm" data-ics="${r.id}" title="ফোনের ক্যালেন্ডারে অ্যালার্ম সহ যোগ করুন">${ico("cal")}</button><button class="btn sm ghost" data-ed="${r.id}" title="এডিট">${ico("edit")}</button><button class="btn sm ghost" data-rm="${r.id}" title="মুছুন">${ico("trash")}</button></div></div>`; }).join("") : `<div class="card empty">${tab === "done" ? "কোনো সম্পন্ন রিমাইন্ডার নেই" : "এখনো কোনো রিমাইন্ডার নেই — উপরের \"নতুন রিমাইন্ডার\" চাপুন।"}</div>`}</div>
      <div class="card" style="margin-top:14px"><div class="ch" style="padding:0 0 10px"><h3>সিস্টেম সতর্কতা</h3><span class="tag">${sys.length}</span></div>${sys.length ? `<div class="grid" style="gap:8px">${sys.map(a => `<div class="alert ${a.k}">${ico(a.ic).replace("<svg", '<svg width="18" height="18"')}<span>${esc(a.t)}</span>${a.go ? `<a class="btn sm" style="margin-left:auto" href="${a.go}">খুলুন →</a>` : ""}</div>`).join("")}</div>` : `<div class="alert gr">✔ কোনো সতর্কতা নেই</div>`}</div>
      <div class="mut sm" style="margin-top:12px">💡 অ্যাপ পুরো বন্ধ থাকলেও অ্যালার্ম চাইলে ${ico("cal").replace("<svg", '<svg width="13" height="13" style="vertical-align:-2px"')} বাটন চাপুন — ফোনের ক্যালেন্ডারে অ্যালার্মসহ যোগ হবে।</div>`;
    $$("[data-t]", v).forEach(c => c.onclick = () => { tab = c.dataset.t; draw(); });
    $("#rm-add", v) && ($("#rm-add", v).onclick = () => reminderModal(null, {}, draw));
    $("#rm-perm", v) && ($("#rm-perm", v).onclick = async () => { const p = await Notification.requestPermission(); if (p === "granted") sysNotify("✔ নোটিফিকেশন চালু হয়েছে", "রিমাইন্ডারের সময় এখানে জানাবে", "test"); draw(); });
    bindRemActions(v, draw);
    $$("[data-ics]", v).forEach(b => b.onclick = () => icsFile(S.reminders.find(r => r.id === b.dataset.ics)));
    $$("[data-ed]", v).forEach(b => b.onclick = () => reminderModal(S.reminders.find(r => r.id === b.dataset.ed), {}, draw));
    $$("[data-rm]", v).forEach(b => b.onclick = async () => { if (!ask("এই রিমাইন্ডার মুছবেন?")) return; try { await API.deleteReminder(b.dataset.rm); S.reminders = S.reminders.filter(r => r.id !== b.dataset.rm); saveCache(); updateBell(); draw(); } catch (e) { toast(e.message, "err"); } });
    $$("[data-ph]", v).forEach(el => showPhoto(el, { photo: el.dataset.ph }));
  };
  draw(); updateBell();
}

/* =================== v6: settings (everyone) =================== */
let installEvt = null; window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; });
async function vSettings(v) {
  const admin = S.me.role === "admin"; const sel = (id, opts, val) => `<select class="in" id="${id}">${opts.map(([k, l]) => `<option value="${k}" ${String(k) === String(val) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const hours = Array.from({ length: 15 }, (_, i) => i + 9).map(h => [h, `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "PM" : "AM"}`]);
  const starts = allowed().filter(k => !["admin", "settings", "audit"].includes(k)).map(k => [k, ROUTES[k].t]);
  const perm = "Notification" in window ? Notification.permission : "na";
  let used = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); used += (localStorage.getItem(k) || "").length + k.length; } } catch { }
  v.innerHTML = head("সেটিংস") + `<div class="grid g2 setg">
   <div class="card"><h3>👤 প্রোফাইল</h3><div class="grid" style="gap:12px">
     <div><label class="f">আপনার নাম <span class="mut">(চেক/ক্লোজিং-এ "কে এন্ট্রি করেছে" হিসেবে বসে)</span></label><div class="row" style="flex-wrap:nowrap"><input class="in" id="st-nm" value="${esc(S.me.name || "")}"><button class="btn fix" id="st-nm-s">সেভ</button></div></div>
     <div class="mut sm">${esc(S.me.email)} · <span class="pill">${esc(S.me.role)}</span></div>
     ${DEMO ? "" : `<div><label class="f">নতুন পাসওয়ার্ড</label><div class="row" style="flex-wrap:nowrap"><input class="in" type="password" id="st-pw" autocomplete="new-password" placeholder="কমপক্ষে ৮ অক্ষর"><button class="btn fix" id="st-pw-s">বদলান</button></div></div>`}</div></div>
   <div class="card"><h3>🎨 দেখতে কেমন</h3><div class="grid" style="gap:12px">
     <div class="row"><div><label class="f">থিম</label>${sel("st-th", [["light", "লাইট"], ["dark", "ডার্ক"]], getTheme())}</div><div><label class="f">ভাষা</label>${sel("st-lg", [["bn", "বাংলা"], ["en", "English"]], LANG)}</div></div>
     <div class="row"><div><label class="f">লেখার আকার</label>${sel("st-fs", [["small", "ছোট"], ["normal", "স্বাভাবিক"], ["large", "বড়"]], PREFS.font)}</div><div><label class="f">টেবিল</label>${sel("st-cp", [["0", "আরামদায়ক"], ["1", "ঘন (বেশি সারি)"]], PREFS.compact ? 1 : 0)}</div></div>
     <div><label class="f">অ্যাপ খুললে কোন পাতা</label>${sel("st-start", starts, PREFS.start)}</div></div></div>
   <div class="card"><h3>🔔 রিমাইন্ডার ও সতর্কতা</h3><div class="grid" style="gap:12px">
     <div class="row"><div><label class="f">ব্যাংক ক্লোজিং বাকি থাকলে সতর্কতা</label>${sel("st-ch", hours, PREFS.closingHour)}</div><div><label class="f">ক্যাশ রেকর্ড বাকি থাকলে সতর্কতা</label>${sel("st-cs", hours, PREFS.cashHour)}</div></div>
     <div class="row"><div><label class="f">কত দিন Pending হলে সতর্কতা</label>${sel("st-pd", [[2, "২ দিন"], [3, "৩ দিন"], [5, "৫ দিন"], [7, "৭ দিন"]], PREFS.pendDays)}</div><div><label class="f">শব্দ</label>${sel("st-snd", [["1", "চালু"], ["0", "বন্ধ"]], PREFS.sound ? 1 : 0)}</div></div>
     <div class="row"><div><label class="f">শুক্রবার</label>${sel("st-fri", [["1", "বন্ধ দিন (আগের/পরের বাটনে বাদ)"], ["0", "কর্মদিবস"]], PREFS.skipFri ? 1 : 0)}</div></div>
     <div class="row"><button class="btn fix" id="st-np" ${perm === "granted" || perm === "na" ? "disabled" : ""}>${perm === "granted" ? "✓ নোটিফিকেশন চালু আছে" : perm === "denied" ? "নোটিফিকেশন ব্রাউজারে বন্ধ" : "নোটিফিকেশন চালু করুন"}</button><button class="btn fix" id="st-nt">পরীক্ষা করুন</button></div></div></div>
   <div class="card"><h3>📱 অ্যাপ ও ডাটা</h3><div class="grid" style="gap:10px">
     <div class="kv"><span>সংস্করণ</span><b>v6 · ${esc(document.querySelector('script[src^="app.js"]')?.getAttribute("src")?.split("v=")[1] || "")}</b></div>
     <div class="kv"><span>ইন্টারনেট</span><b class="${navigator.onLine ? "gr" : "rd"}">${navigator.onLine ? "অনলাইন" : "অফলাইন"}</b></div>
     <div class="kv"><span>সিঙ্ক বাকি</span><b>${DEMO ? "—" : Outbox.count()}</b></div>
     <div class="kv"><span>এই ডিভাইসে জমা ডাটা</span><b>${(used / 1024).toFixed(0)} KB</b></div>
     <div class="row" style="margin-top:6px"><button class="btn fix" id="st-sync">${ico("clock")} এখনই সিঙ্ক</button><button class="btn fix" id="st-upd">↻ আপডেট দেখুন</button>${installEvt ? `<button class="btn pri fix" id="st-inst">⬇ অ্যাপ ইনস্টল</button>` : ""}<button class="btn bad fix" id="st-clr">ক্যাশ মুছে রিলোড</button></div>
     <div class="mut xs">"ক্যাশ মুছে রিলোড" শুধু এই ডিভাইসের জমা কপি মোছে — সার্ভারের ডাটা ঠিক থাকে। সিঙ্ক বাকি থাকলে আগে সিঙ্ক করুন।</div></div></div>
   ${admin ? `<div class="card" style="grid-column:1/-1"><h3>🛡 Admin শর্টকাট</h3><div class="row"><a class="btn fix" href="#/admin">${ico("gear")} ব্যবহারকারী ও অ্যাকাউন্ট</a><a class="btn fix" href="#/audit">${ico("shield")} Audit ও Backup</a><a class="btn fix" href="#/books">${ico("book")} চেক বই</a></div></div>` : ""}</div>`;
  const g = id => $("#" + id, v);
  g("st-nm-s").onclick = async () => { const n = g("st-nm").value.trim(); if (!n) return toast("নাম লিখুন", "err"); try { await API.setMyName(n); S.me.name = n; saveCache(); shell(); route(); toast("✔ নাম সেভ হয়েছে"); } catch (e) { toast(/function|does not exist/i.test(e.message) ? "schema_v3.sql চালানো বাকি" : e.message, "err"); } };
  g("st-pw-s") && (g("st-pw-s").onclick = async () => { const p = g("st-pw").value; if (p.length < 8) return toast("পাসওয়ার্ড কমপক্ষে ৮ অক্ষর", "err"); try { await API.changePassword(p); g("st-pw").value = ""; toast("✔ পাসওয়ার্ড বদলানো হয়েছে"); } catch (e) { toast(e.message, "err"); } });
  g("st-th").onchange = e => setTheme(e.target.value); g("st-lg").onchange = e => setLang(e.target.value);
  g("st-fs").onchange = e => savePrefs({ font: e.target.value }); g("st-cp").onchange = e => savePrefs({ compact: e.target.value === "1" }); g("st-start").onchange = e => { savePrefs({ start: e.target.value }); toast("✔ সেভ হয়েছে"); };
  g("st-ch").onchange = e => { savePrefs({ closingHour: +e.target.value }); updateBell(); }; g("st-cs").onchange = e => { savePrefs({ cashHour: +e.target.value }); updateBell(); };
  g("st-pd").onchange = e => { savePrefs({ pendDays: +e.target.value }); refreshBadges(); }; g("st-snd").onchange = e => savePrefs({ sound: e.target.value === "1" }); g("st-fri").onchange = e => savePrefs({ skipFri: e.target.value === "1" });
  g("st-np").onclick = async () => { await Notification.requestPermission(); vSettings(v); };
  g("st-nt").onclick = () => { if (PREFS.sound) beep(); sysNotify("🔔 পরীক্ষা — Nabiad", "নোটিফিকেশন ঠিকমতো কাজ করছে", "test"); toast("পরীক্ষার নোটিফিকেশন পাঠানো হয়েছে"); };
  g("st-sync").onclick = async () => { if (DEMO) return toast("DEMO মোড"); await Outbox.flush(); await reload(); toast("✔ সিঙ্ক ও রিফ্রেশ হয়েছে"); };
  g("st-upd").onclick = async () => { try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { } toast("নতুন সংস্করণ থাকলে রিলোড হচ্ছে…"); setTimeout(() => location.reload(), 900); };
  g("st-inst") && (g("st-inst").onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; });
  g("st-clr").onclick = () => { if (Outbox.count() && !ask(`${Outbox.count()}টি এন্ট্রি এখনো সিঙ্ক হয়নি — মুছলে হারিয়ে যাবে। তবুও মুছবেন?`)) return; if (!ask("এই ডিভাইসের জমা কপি মুছে রিলোড করবেন?")) return; [CACHE_KEY, "nabiad_rem_seen"].forEach(k => localStorage.removeItem(k)); if (!Outbox.count()) localStorage.removeItem(OB_KEY); location.reload(); };
}

/* =================== v6: audit & security (tabs) =================== */

/* =================== v6.2: audit log =================== */
AU_T.cash_records = "ক্যাশ"; AU_T.audit_log = "Audit log";
const AU_IC = { insert: "plus", update: "edit", delete: "trash" };
const auText = r => { const o = r.old || {}, n = r.new || {}; if (r.action === "update") return Object.keys({ ...o, ...n }).filter(k => !AU_SKIP.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k])).map(k => `${AU_F[k] || k}: ${auV(o[k])} → ${auV(n[k])}`).join("; "); const x = r.action === "delete" ? o : n; return Object.entries(x).filter(([k, val]) => !AU_SKIP.has(k) && val !== null && val !== "").map(([k, val]) => `${AU_F[k] || k}: ${auV(val)}`).join("; "); };
function auChips(r, all) {
  const o = r.old || {}, n = r.new || {}, L = k => `<span class="au-k">${esc(AU_F[k] || k)}</span>`;
  if (r.action === "update") { const ks = Object.keys({ ...o, ...n }).filter(k => !AU_SKIP.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k])); return ks.map(k => `<span class="auc">${L(k)}<s>${esc(auV(o[k]))}</s><i>→</i><b>${esc(auV(n[k]))}</b></span>`).join("") || `<span class="mut xs">—</span>`; }
  const x = r.action === "delete" ? o : n, es = Object.entries(x).filter(([k, val]) => !AU_SKIP.has(k) && val !== null && val !== "" && typeof val !== "object");
  return es.slice(0, all ? 99 : 4).map(([k, val]) => `<span class="auc">${L(k)}<b>${esc(auV(val))}</b></span>`).join("") + (!all && es.length > 4 ? `<button class="btn sm ghost au-more">+${es.length - 4}</button>` : "");
}
async function vAudit(v) {
  const admin = S.me.role === "admin", F = { p: "30", tbl: "", act: "", who: "", q: "", from: "", to: "" };
  v.innerHTML = head("Audit log", `<div class="dd"><button class="btn" id="au-dl">${ico("dl")} ডাউনলোড ▾</button><div class="ddm hide" id="au-menu"><button data-dl="xlsx">${ico("dl")} Excel (.xlsx)</button><button data-dl="csv">${ico("list")} CSV</button><button data-dl="print">${ico("print")} প্রিন্ট / PDF</button></div></div>${admin ? `<button class="btn rdo" id="au-clr">${ico("trash")} লগ পরিষ্কার</button>` : ""}`) + `
   <div class="card noprint" style="margin-bottom:12px"><div class="seg wrap" id="au-p">${[["1", "আজ"], ["7", "৭ দিন"], ["30", "৩০ দিন"], ["90", "৯০ দিন"], ["custom", "তারিখ"]].map(([k, l]) => `<span class="chip ${k === F.p ? "on" : ""}" data-p="${k}">${l}</span>`).join("")}</div>
    <div class="row hide" id="au-cu" style="margin-top:8px"><input class="in" type="date" id="au-f"><input class="in" type="date" id="au-to"></div>
    <div class="srch"><label class="si">${ico("search")}<input class="in" id="au-q" placeholder="খুঁজুন — A/C, চেক নং, ইমেইল…" autocomplete="off" type="search"></label></div>
    <div class="aufl"><select class="in" id="au-t"><option value="">সব জায়গা</option>${Object.entries({ ...AU_T, cash_records: "ক্যাশ" }).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select><select class="in" id="au-a"><option value="">সব কাজ</option>${Object.entries(AU_A).map(([k, l]) => `<option value="${k}">${l[0]}</option>`).join("")}</select><select class="in" id="au-w"><option value="">সবাই</option></select></div></div>
   <div class="grid g4 au-k4" id="au-kpi"></div><div id="au-out" style="margin-top:12px"><div class="card empty">লোড হচ্ছে…</div></div>`;
  let rows = [], shown = [], more = false;
  const range = () => { if (F.p === "custom") return [F.from || addDays(today(), -30), F.to || today()]; return [addDays(today(), -(+F.p - 1)), today()]; };
  async function load(append) {
    const [from, to] = range(); if (!append) $("#au-out", v).innerHTML = `<div class="card empty">লোড হচ্ছে…</div>`;
    try { const r = await API.audit({ tbl: F.tbl, act: F.act, from, to, offset: append ? rows.length : 0 }); rows = append ? rows.concat(r) : r; more = r.length >= 500; }
    catch (e) { $("#au-out", v).innerHTML = `<div class="alert rd">${/relation|does not exist|schema cache|not find/i.test(e.message || "") ? "Audit log টেবিল নেই — Supabase-এ schema_v2.sql চালাতে হবে" : esc(e.message || e)}</div>`; return; }
    const users = [...new Set(rows.map(r => r.user_name).filter(Boolean))].sort(); const ws = $("#au-w", v), cur = ws.value; ws.innerHTML = `<option value="">সবাই</option>` + users.map(u => `<option ${u === cur ? "selected" : ""}>${esc(u)}</option>`).join("");
    draw();
  }
  function draw() {
    const q = norm(F.q); shown = rows.filter(r => (!F.who || r.user_name === F.who) && (!q || norm([r.user_name, r.row_key, r.tbl, JSON.stringify(r.new || r.old)].join(" ")).includes(q)));
    const c = a => shown.filter(r => r.action === a).length, top = Object.entries(shown.reduce((m, r) => (m[r.user_name] = (m[r.user_name] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1])[0];
    $("#au-kpi", v).innerHTML = `<div class="kpi card k-vi"><div class="l">মোট পরিবর্তন</div><div class="v num">${shown.length}${more ? "+" : ""}</div><div class="s">${top ? `<span>সবচেয়ে বেশি:</span> ${esc(top[0])} (${top[1]})` : "—"}</div></div><div class="kpi card k-gr"><div class="l">যোগ</div><div class="v num">${c("insert")}</div></div><div class="kpi card k-am"><div class="l">বদল</div><div class="v num">${c("update")}</div></div><div class="kpi card k-rd"><div class="l">মুছে ফেলা</div><div class="v num">${c("delete")}</div></div>`;
    if (!shown.length) { $("#au-out", v).innerHTML = `<div class="card empty">এই সময়ে কোনো পরিবর্তন নেই</div>`; return; }
    let last = "", html = "";
    shown.forEach((r, i) => { const d = r.at.slice(0, 10), ld = new Date(r.at); if (d !== last) { last = d; html += `<div class="au-day">${ld.toLocaleDateString(LANG === "en" ? "en-GB" : "bn-BD", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>`; }
      html += `<div class="aui a-${r.action}" data-i="${i}"><div class="aic">${ico(AU_IC[r.action] || "edit")}</div><div class="aib"><div class="ait"><span class="tag au-${r.action}">${(AU_A[r.action] || [r.action])[0]}</span><b>${esc(AU_T[r.tbl] || (r.tbl === "cash_records" ? "ক্যাশ" : r.tbl))}</b><span class="aik">${esc(r.row_key || "")}</span></div><div class="aim">${ico("clock").replace("<svg", '<svg width="12" height="12"')} ${ld.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · <b>${esc(r.user_name || "system")}</b></div><div class="aud">${auChips(r)}</div></div></div>`; });
    $("#au-out", v).innerHTML = `<div class="card au-list">${html}</div>${more ? `<div class="row" style="justify-content:center;margin-top:10px"><button class="btn fix" id="au-more">আরও লোড করুন</button></div>` : ""}`;
    $$(".au-more", v).forEach(b => b.onclick = e => { e.stopPropagation(); const r = shown[+b.closest(".aui").dataset.i]; b.closest(".aud").innerHTML = auChips(r, true); });
    $("#au-more", v) && ($("#au-more", v).onclick = () => load(true));
  }
  const fname = ext => `Audit_${range()[0]}_${range()[1]}.${ext}`;
  async function download(kind) {
    $("#au-menu", v).classList.add("hide"); if (!shown.length) return toast("ডাটা নেই", "err");
    const H = ["Time", "User", "Where", "Action", "Item", "Changes", "Old (JSON)", "New (JSON)"], R = shown.map(r => [new Date(r.at).toLocaleString("en-GB"), r.user_name || "", AU_T[r.tbl] ? tr(AU_T[r.tbl]) : r.tbl, r.action, r.row_key || "", auText(r), r.old ? JSON.stringify(r.old) : "", r.new ? JSON.stringify(r.new) : ""]);
    if (kind === "xlsx") return exportXlsx({ Audit: [H, ...R] }, fname("xlsx"));
    if (kind === "csv") { const csv = "﻿" + [H, ...R].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\r\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = fname("csv"); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return; }
    window.print();
  }
  $("#au-dl", v).onclick = e => { e.stopPropagation(); $("#au-menu", v).classList.toggle("hide"); };
  $$("#au-menu [data-dl]", v).forEach(b => b.onclick = () => download(b.dataset.dl));
  const hideMenu = () => $("#au-menu", v)?.classList.add("hide"); document.addEventListener("click", hideMenu);
  $("#au-clr", v) && ($("#au-clr", v).onclick = () => clearAuditModal(() => load()));
  $$("#au-p .chip", v).forEach(c => c.onclick = () => { F.p = c.dataset.p; $$("#au-p .chip", v).forEach(x => x.classList.toggle("on", x === c)); $("#au-cu", v).classList.toggle("hide", F.p !== "custom"); if (F.p === "custom" && !F.from) { F.from = addDays(today(), -30); F.to = today(); $("#au-f", v).value = F.from; $("#au-to", v).value = F.to; } load(); });
  ["au-f", "au-to"].forEach(id => $("#" + id, v).onchange = () => { F.from = $("#au-f", v).value; F.to = $("#au-to", v).value; load(); });
  $("#au-t", v).onchange = e => { F.tbl = e.target.value; load(); }; $("#au-a", v).onchange = e => { F.act = e.target.value; load(); }; $("#au-w", v).onchange = e => { F.who = e.target.value; draw(); };
  $("#au-q", v).oninput = e => { F.q = e.target.value; draw(); };
  await load();
  return () => document.removeEventListener("click", hideMenu);
}
function clearAuditModal(after) {
  modal(`<h2>🧹 Audit log পরিষ্কার</h2><p class="mut sm" style="margin-top:-6px">পুরনো লগ মুছে জায়গা খালি করুন। মোছার পরেও "কে কখন পরিষ্কার করেছে" তার একটা রেকর্ড থেকে যাবে।</p>
   <div class="grid" style="gap:8px">${[["90", "৯০ দিনের বেশি পুরনো"], ["30", "৩০ দিনের বেশি পুরনো"], ["7", "৭ দিনের বেশি পুরনো"], ["all", "সব লগ"]].map(([k, l], i) => `<label class="rad"><input type="radio" name="clr" value="${k}" ${i === 0 ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>
   <label class="rad" style="margin-top:12px"><input type="checkbox" id="clr-dl" checked><span>মোছার আগে Excel কপি ডাউনলোড করুন</span></label>
   <div id="clr-all" class="hide" style="margin-top:10px"><label class="f">নিশ্চিত করতে <b>CLEAR</b> লিখুন</label><input class="in" id="clr-t" autocomplete="off"></div>
   <div class="row" style="margin-top:16px"><button class="btn bad fix" id="clr-ok">${ico("trash")} পরিষ্কার করুন</button><button class="btn fix" id="clr-x">বাতিল</button></div>`, (root, close) => {
    $$("[name=clr]", root).forEach(r => r.onchange = () => $("#clr-all", root).classList.toggle("hide", $("[name=clr]:checked", root).value !== "all"));
    $("#clr-x", root).onclick = close;
    $("#clr-ok", root).onclick = async () => {
      const k = $("[name=clr]:checked", root).value; if (k === "all" && $("#clr-t", root).value.trim().toUpperCase() !== "CLEAR") return toast("CLEAR লিখুন", "err");
      const before = k === "all" ? new Date(Date.now() + 60000).toISOString() : new Date(addDays(today(), -+k) + "T00:00:00").toISOString();
      const b = $("#clr-ok", root); b.disabled = true;
      try {
        if ($("#clr-dl", root).checked) { const old = await API.audit({ from: "2000-01-01", to: k === "all" ? today() : addDays(today(), -+k - 1), limit: 20000 }); if (old.length) await exportXlsx({ Audit: [["Time", "User", "Where", "Action", "Item", "Changes"], ...old.map(r => [new Date(r.at).toLocaleString("en-GB"), r.user_name || "", r.tbl, r.action, r.row_key || "", auText(r)])] }, `Audit_archive_${today()}.xlsx`); }
        const n = await API.clearAudit(before); close(); toast(`✔ ${n}টি পুরনো লগ মুছে ফেলা হয়েছে`); after && after();
      } catch (e) { toast(/function|does not exist/i.test(e.message || "") ? "schema_v4.sql চালানো বাকি" : e.message, "err"); b.disabled = false; }
    };
  });
}

/* =================== v6.2: audit & security shell =================== */
async function vSecurity(v) {
  const admin = S.me.role === "admin"; let tab = sessionStorage.getItem("nabiad_sec_tab") || "audit"; if (!admin && tab !== "audit") tab = "audit";
  const tabs = [["audit", "📜", "Audit log"], ...(admin ? [["backup", "💾", "Backup"], ["sec", "🔐", "Security"]] : [])];
  v.innerHTML = `<div class="tabs ntabs" style="margin-bottom:12px">${tabs.map(([k, i, l]) => `<span class="chip ${k === tab ? "on" : ""}" data-st="${k}"><i class="te">${i}</i> <span>${l}</span></span>`).join("")}</div><div id="sec-out"></div>`;
  $$("[data-st]", v).forEach(c => c.onclick = () => { sessionStorage.setItem("nabiad_sec_tab", c.dataset.st); if (cleanup) { cleanup(); cleanup = null; } vSecurity(v).then(f => { cleanup = f || null; }); });
  const out = $("#sec-out", v);
  if (tab === "audit") return vAudit(out);
  if (tab === "backup") return vBackup(out);
  return vSec(out);
}
function nextMidnight() { const d = new Date(); d.setHours(24, 0, 0, 0); return d; }
async function vBackup(out) {
  out.innerHTML = head("Backup", `<button class="btn pri" id="bk-now">${ico("save")} এখনই Backup</button><button class="btn" id="bk-dl">${ico("dl")} পুরো ডাটা (Excel)</button>`) + `<div class="grid g4" id="bk-kpi"><div class="kpi card"><div class="skel"></div></div><div class="kpi card"><div class="skel"></div></div><div class="kpi card"><div class="skel"></div></div><div class="kpi card"><div class="skel"></div></div></div>
   <div class="card flush" style="margin-top:12px" id="bk-list"><div class="empty">লোড হচ্ছে…</div></div>
   <div class="card" style="margin-top:12px"><h3>ℹ️ Backup কীভাবে কাজ করে</h3><ul class="chk"><li>🕛 প্রতি রাত ১২টায় (বাংলাদেশ সময়) ডাটাবেস নিজে থেকে Backup নেয় — কাউকে কিছু করতে হয় না।</li><li>🗂 স্বয়ংক্রিয় Backup শেষ ১৪ দিনের রাখা হয়, হাতে নেওয়া Backup শেষ ১০টি।</li><li>⬇ যেকোনো Backup JSON বা Excel হিসেবে ডাউনলোড করে নিজের কম্পিউটার / Google Drive-এ রাখুন — মাসে অন্তত একবার।</li><li>♻ ডাটা ফেরত আনতে হলে Admin ডাউনলোড করা ফাইল দিয়ে Supabase-এ restore করতে পারে।</li></ul></div>`;
  const toXlsx = async (d, name) => { const sheets = {}; for (const [t, rows] of Object.entries(d || {})) { if (!Array.isArray(rows) || !rows.length) continue; const keys = [...new Set(rows.flatMap(r => Object.keys(r)))]; sheets[t.slice(0, 31)] = [keys, ...rows.map(r => keys.map(k => r[k] !== null && typeof r[k] === "object" ? JSON.stringify(r[k]) : r[k]))]; } if (!Object.keys(sheets).length) return toast("ডাটা নেই", "err"); await exportXlsx(sheets, name); };
  const list = async () => {
    let rows; try { rows = await API.backups(); } catch (e) { $("#bk-list", out).innerHTML = `<div class="alert rd" style="margin:12px">${/relation|does not exist|schema cache|not find/i.test(e.message || "") ? "Backup টেবিল নেই — Supabase-এ schema_v3.sql চালাতে হবে" : esc(e.message)}</div>`; $("#bk-kpi", out).innerHTML = ""; return; }
    const lastA = rows.find(r => r.kind === "auto"), lastM = rows.find(r => r.kind === "manual"), nm = nextMidnight(), ok = lastA && Date.now() - new Date(lastA.at) < 36 * 36e5;
    $("#bk-kpi", out).innerHTML = `<div class="kpi card ${ok ? "k-gr" : "k-am"}"><div class="l">শেষ স্বয়ংক্রিয়</div><div class="v" style="font-size:17px">${lastA ? new Date(lastA.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "এখনো হয়নি"}</div><div class="s">${lastA ? relTime(lastA.at) : "আজ রাতে প্রথমটি হবে"}</div></div>
      <div class="kpi card k-vi"><div class="l">পরের Backup</div><div class="v" style="font-size:17px">${nm.toLocaleString("en-GB", { day: "2-digit", month: "short" })}, 12:00 AM</div><div class="s">${relTime(nm)}</div></div>
      <div class="kpi card k-cy"><div class="l">মোট Backup</div><div class="v num">${rows.length}</div><div class="s"><span>স্বয়ংক্রিয়</span> ${rows.filter(r => r.kind === "auto").length} · <span>হাতে</span> ${rows.filter(r => r.kind === "manual").length}</div></div>
      <div class="kpi card"><div class="l">শেষ হাতে-নেওয়া</div><div class="v" style="font-size:17px">${lastM ? new Date(lastM.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</div><div class="s">${rows[0] ? `<span>রেকর্ড</span> ${money0(rows[0].size_rows)}` : ""}</div></div>`;
    $("#bk-list", out).innerHTML = `<div class="ch"><h3>Backup তালিকা</h3><span class="tag">${rows.length}</span></div>` + (rows.length ? `<div class="bkl">${rows.map(r => `<div class="bkr"><div class="bki ${r.kind}">${ico(r.kind === "auto" ? "clock" : "save")}</div><div class="bkb"><b>${new Date(r.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</b><div class="mut xs"><span>${r.kind === "auto" ? "স্বয়ংক্রিয়" : "হাতে"}</span> · ${money0(r.size_rows)} <span>রেকর্ড</span> · ${relTime(r.at)}</div></div><div class="bka"><button class="btn sm" data-j="${r.id}" data-at="${r.at}" title="JSON">JSON</button><button class="btn sm" data-x="${r.id}" data-at="${r.at}" title="Excel">${ico("dl")} Excel</button>${r.kind === "manual" ? `<button class="btn sm ghost" data-del="${r.id}" title="মুছুন">${ico("trash")}</button>` : ""}</div></div>`).join("")}</div>` : `<div class="empty">এখনো কোনো Backup নেই — "এখনই Backup" চাপুন</div>`);
    const fn = (at, ext) => `nabiad_backup_${at.slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;
    $$("[data-j]", out).forEach(b => b.onclick = async () => { b.disabled = true; try { const d = await API.backupData(+b.dataset.j || b.dataset.j); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: "application/json" })); a.download = fn(b.dataset.at, "json"); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } catch (e) { toast(e.message, "err"); } b.disabled = false; });
    $$("[data-x]", out).forEach(b => b.onclick = async () => { b.disabled = true; try { await toXlsx(await API.backupData(+b.dataset.x || b.dataset.x), fn(b.dataset.at, "xlsx")); } catch (e) { toast(e.message, "err"); } b.disabled = false; });
    $$("[data-del]", out).forEach(b => b.onclick = async () => { if (!ask("এই হাতে-নেওয়া Backup মুছবেন?")) return; try { await API.deleteBackup(+b.dataset.del || b.dataset.del); toast("✔ মুছে ফেলা হয়েছে"); list(); } catch (e) { toast(/function|does not exist/i.test(e.message || "") ? "schema_v4.sql চালানো বাকি" : e.message, "err"); } });
  };
  $("#bk-now", out).onclick = async () => { const b = $("#bk-now", out); b.disabled = true; try { await API.backupNow(); toast("✔ Backup নেওয়া হয়েছে"); await list(); } catch (e) { toast(e.message, "err"); } b.disabled = false; };
  $("#bk-dl", out).onclick = async () => { const b = $("#bk-dl", out); b.disabled = true; toast("ডাটা আনা হচ্ছে… একটু সময় লাগবে"); try { await toXlsx(await API.dumpAll(), `Nabiad_Full_Data_${today()}.xlsx`); } catch (e) { toast(e.message, "err"); } b.disabled = false; };
  await list();
}
async function vSec(out) {
  out.innerHTML = head("Security") + `<div class="card empty">লোড হচ্ছে…</div>`;
  const [logins, bks, recent] = await Promise.all([API.userLogins().catch(() => null), API.backups().catch(() => []), API.audit({ act: "delete", from: addDays(today(), -6), to: today() }).catch(() => [])]);
  let us = logins; if (!us) { try { us = (await API.users()).map(u => ({ ...u, last_sign_in_at: null })); } catch { us = []; } }
  const perm = "Notification" in window ? Notification.permission : "na", lastB = bks.find(b => b.kind === "auto"), noName = us.filter(u => !u.name || u.name === (u.email || "").split("@")[0]).length;
  const checks = [[true, "ডাটাবেস নিরাপত্তা (RLS) চালু", "Staff শুধু যোগ করতে পারে; বদলানো ও মোছা শুধু Admin"], [true, "নতুন কেউ নিজে অ্যাকাউন্ট খুলতে পারে না", "শুধু Admin ব্যবহারকারী যোগ করে"], [location.protocol === "https:" || DEMO, "নিরাপদ সংযোগ (HTTPS)", location.host],
    [!!lastB && Date.now() - new Date(lastB.at) < 36 * 36e5, "দৈনিক Backup", lastB ? relTime(lastB.at) : "এখনো স্বয়ংক্রিয় Backup হয়নি"], [true, "সব পরিবর্তনের রেকর্ড (Audit log)", "কে, কখন, আগে কী ছিল"], [true, "চেকের ছবি সুরক্ষিত", "লগইন ছাড়া দেখা যায় না"],
    [perm === "granted", "এই ডিভাইসে নোটিফিকেশন", perm === "granted" ? "চালু" : "সেটিংস থেকে চালু করুন"], [!noName, "সব ব্যবহারকারীর নাম দেওয়া", noName ? `${noName} জনের নাম ঠিক করা বাকি` : "ঠিক আছে"]];
  const score = Math.round(checks.filter(c => c[0]).length / checks.length * 100);
  out.innerHTML = head("Security") + `<div class="grid g2">
    <div class="card"><div class="secs"><div class="ring" style="--p:${score}"><b>${score}%</b></div><div><h3 style="margin:0">নিরাপত্তা স্কোর</h3><div class="mut sm">${checks.filter(c => c[0]).length} / ${checks.length} <span>ঠিক আছে</span></div></div></div>
      <div class="hcl">${checks.map(([ok, l, s]) => `<div class="hc ${ok ? "ok" : "no"}"><i>${ok ? "✓" : "!"}</i><div><b>${l}</b><div class="mut xs">${esc(s)}</div></div></div>`).join("")}</div></div>
    <div class="grid" style="gap:14px;align-content:start"><div class="card"><h3>💻 এই ডিভাইস</h3><div class="kv"><span>লগইন ইমেইল</span><b class="sm">${esc(S.me.email)}</b></div><div class="kv"><span>Role</span><b>${esc(S.me.role)}</b></div><div class="kv"><span>ডিভাইস</span><b class="sm">${esc((navigator.userAgentData?.platform || navigator.platform || "") + " · " + (/Mobi/.test(navigator.userAgent) ? "Mobile" : "Desktop"))}</b></div>
       <div class="row" style="margin-top:12px"><button class="btn fix" id="sc-oth">${ico("out")} অন্য সব ডিভাইস থেকে লগআউট</button><a class="btn fix" href="#/settings">${ico("gear")} পাসওয়ার্ড বদলান</a></div><div class="mut xs" style="margin-top:6px">ফোন হারালে বা পাসওয়ার্ড অন্য কেউ জানলে আগে "অন্য সব ডিভাইস থেকে লগআউট" চাপুন, তারপর পাসওয়ার্ড বদলান।</div></div>
      <div class="card"><h3>🗑 গত ৭ দিনে মুছে ফেলা</h3>${recent.length ? `<div class="mini">${recent.slice(0, 6).map(r => `<div class="mi"><div><b>${esc(AU_T[r.tbl] || r.tbl)} · ${esc(r.row_key || "")}</b><div class="mut xs">${esc(r.user_name || "")} · ${new Date(r.at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</div></div></div>`).join("")}</div><a class="btn sm" style="margin-top:8px" href="#/audit" onclick="sessionStorage.setItem('nabiad_sec_tab','audit')">সব দেখুন →</a>` : `<div class="alert gr">✔ গত ৭ দিনে কিছু মোছা হয়নি</div>`}</div></div>
    <div class="card flush" style="grid-column:1/-1"><div class="ch"><h3>👥 ব্যবহারকারী ও শেষ লগইন</h3><span class="tag">${us.length}</span><div class="sp" style="flex:1"></div><a class="sm" href="#/admin" onclick="sessionStorage.setItem('nabiad_admin_tab','usr')">বদলান →</a></div>
      <div class="ulr">${us.map(u => `<div class="ur"><div class="ava">${esc((u.name || u.email || "?").trim().slice(0, 1).toUpperCase())}</div><div class="ub"><b>${esc(u.name || "—")}</b> <span class="pill sm">${esc(u.role)}</span>${u.active ? "" : ` <span class="tag cl">নিষ্ক্রিয়</span>`}<div class="mut xs">${esc(u.email)}</div></div><div class="ut"><span class="mut xs">শেষ লগইন</span><b class="sm">${u.last_sign_in_at ? relTime(u.last_sign_in_at) : "—"}</b></div></div>`).join("")}</div>
      ${logins ? "" : `<div class="mut xs" style="padding:0 16px 12px">শেষ লগইনের সময় দেখাতে schema_v4.sql চালাতে হবে।</div>`}</div></div>`;
  $("#sc-oth", out).onclick = async () => { if (!ask("অন্য সব ডিভাইস থেকে লগআউট করবেন? (এই ডিভাইস লগইন থাকবে)")) return; try { await API.signOutOthers(); toast("✔ অন্য ডিভাইস থেকে লগআউট হয়েছে"); } catch (e) { toast(e.message, "err"); } };
}
Object.assign(SbAPI, {
  async audit(f) { const lim = f.limit || 500, off = f.offset || 0; let q = sb.from("audit_log").select("*").order("at", { ascending: false }).range(off, off + lim - 1); if (f.tbl) q = q.eq("tbl", f.tbl); if (f.act) q = q.eq("action", f.act); if (f.from) q = q.gte("at", new Date(f.from + "T00:00:00").toISOString()); if (f.to) q = q.lt("at", new Date(addDays(f.to, 1) + "T00:00:00").toISOString()); const { data, error } = await q; if (error) throw error; return data; },
  async clearAudit(before) { const { data, error } = await sb.rpc("clear_audit", { before }); if (error) throw error; return data; },
  async deleteBackup(id) { const { error } = await sb.rpc("delete_backup", { bid: id }); if (error) throw error; },
  async userLogins() { const { data, error } = await sb.rpc("user_logins"); if (error) throw error; return data; }
});
Object.assign(DemoAPI, {
  async audit(f) { const off = f.offset || 0, lim = f.limit || 500; return demoStore.audit.filter(r => (!f.tbl || r.tbl === f.tbl) && (!f.act || r.action === f.act) && (!f.from || r.at.slice(0, 10) >= f.from) && (!f.to || r.at.slice(0, 10) <= f.to)).slice(off, off + lim); },
  async clearAudit(before) { const n = demoStore.audit.filter(r => r.at < before).length; demoStore.audit = demoStore.audit.filter(r => r.at >= before); this.aud("audit_log", "delete", `${n} rows cleared`, null, null); this.save(); return n; },
  async deleteBackup(id) { demoStore.backups = (demoStore.backups || []).filter(b => b.id !== id); this.save(); },
  async userLogins() { return [{ email: "admin@demo", name: S.me.name, role: "admin", active: true, last_sign_in_at: new Date().toISOString() }]; }
});

/* ---------- auto update: every open app notices a new release within minutes ---------- */
const RUN_V = document.querySelector('script[src^="app.js"]')?.getAttribute("src")?.split("v=")[1] || "";
let updReady = "", updBusy = false, DIRTY = false;
document.addEventListener("input", e => { if (e.target.closest?.("#view, .modal")) DIRTY = true; }, true);
async function checkUpdate() {
  if (updBusy || updReady || !navigator.onLine || !RUN_V) return; updBusy = true;
  try { const t = await (await fetch("index.html?u=" + Date.now(), { cache: "no-store" })).text(); const m = t.match(/app\.js\?v=([\w.\-]+)/); if (m && m[1] !== RUN_V) onUpdate(m[1]); }
  catch { } finally { updBusy = false; }
}
function onUpdate(v) {
  updReady = v; navigator.serviceWorker?.getRegistration().then(r => r && r.update()).catch(() => { });
  if (document.hidden && !DIRTY && !Outbox.busy) return location.reload();   // nobody is looking and nothing is typed → update silently
  if ($("#updbar")) return;
  const el = document.createElement("div"); el.id = "updbar";
  el.innerHTML = `<span>🚀 <b>নতুন আপডেট এসেছে</b> <span class="mut xs">v${esc(v)}</span></span><button class="btn sm pri" id="upd-go">এখনই আপডেট</button><button class="iconbtn" id="upd-x" title="পরে">✕</button>`;
  document.body.appendChild(el);
  $("#upd-go").onclick = () => { if (DIRTY && !ask("এই পাতায় লেখা কিছু সেভ হয়নি — আপডেট করলে তা হারাতে পারে (ক্লোজিং/ক্যাশের ড্রাফট নিরাপদ থাকবে)। আপডেট করবেন?")) return; location.reload(); };
  $("#upd-x").onclick = () => el.remove();
}
setTimeout(checkUpdate, 8000); setInterval(checkUpdate, 3 * 60 * 1000);
window.addEventListener("online", () => setTimeout(checkUpdate, 2000));
document.addEventListener("visibilitychange", () => { if (document.hidden) { if (updReady && !DIRTY && !Outbox.busy) location.reload(); } else checkUpdate(); });

/* ---------- boot ---------- */
let inited = false;
function onLangChange() { if (S.me && $("#view")) { shell(); route(); } else if (!S.me) loginView(); }
async function boot() {
  try {
    if (!inited) { startI18n(); await API.init(); inited = true; }
    if (!S.me) S.me = await API.session();
    if (!S.me) return loginView();
    let mo = null;
    const start = () => { if (!location.hash && PREFS.start && PREFS.start !== "dash" && allowed().includes(PREFS.start)) location.replace("#/" + PREFS.start); shell(); route(); setTimeout(remTick, 1500); if (!mo) { let q = 0; mo = new MutationObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; labelTables(document); }); }); mo.observe(document.body, { childList: true, subtree: true }); } };
    if (loadCache()) { start(); reload().then(() => { refreshBadges(); const k = (location.hash.match(/^#\/(\w+)/) || [])[1] || "dash"; if (["dash", "cheques", "books", "accounts"].includes(k) && !document.querySelector(".mback,.pal") && !document.activeElement?.matches("input,select,textarea")) route(); }).catch(e => { if (!isNetErr(e)) toast("রিফ্রেশ ব্যর্থ: " + (e.message || e), "err"); }); Outbox.flush(); }
    else { $("#app").innerHTML = `<div class="boot"><div><div class="logo"><img src="icon.svg" alt="Nabiad"></div><div class="mut">ডাটা লোড হচ্ছে…</div></div></div>`; await reload(); start(); Outbox.flush(); }
  } catch (e) { console.error(e); $("#app").innerHTML = `<div class="login"><div class="card"><div class="alert rd">শুরু করা যায়নি: ${esc(e.message || e)}</div><p class="mut sm">config.js এ Supabase URL ও key ঠিক আছে কি এবং schema.sql চালানো হয়েছে কি দেখুন।</p></div></div>`; }
}
window.addEventListener("hashchange", route);
boot();
