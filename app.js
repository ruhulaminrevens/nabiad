/* Nabiad — Cheque & Bank Control  (single-page app, no build step) */
"use strict";
const CFG = window.NABIAD_CONFIG || {};
const DEMO = !CFG.SUPABASE_URL;
const STATUSES = ["Pending","Cleared","Bounced","Returned-Cash","Cancelled","Stopped"];
const PURPOSES = ["Cash Withdrawal (ক্যাশ উত্তোলন)","Own A/C Transfer (নিজ অ্যাকাউন্টে জমা)","Supplier/Party Payment (সাপ্লায়ার/পার্টি পেমেন্ট)","Salary (বেতন)","Utility/Bills (বিদ্যুৎ/গ্যাস/বিল)","Rent (ভাড়া)","Loan/EMI (লোন কিস্তি)","LC/Import (এলসি)","Tax/VAT (ট্যাক্স/ভ্যাট)","Office Expense (অফিস খরচ)","Personal (বস/পরিবার)","Cancelled/Spoiled (বাতিল/নষ্ট পাতা)","Others (অন্যান্য)"];
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
function toast(msg, kind = "ok") { const t = document.createElement("div"); t.className = "toast " + kind; t.innerHTML = `<i>${kind === "err" ? "!" : "✓"}</i><span></span>`; t.lastChild.textContent = tr(String(msg).replace(/^✔\s*/, "")); $("#toasts").appendChild(t); setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, kind === "err" ? 6000 : 2800); }
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
  copyt: '<path d="M8 4h8M8 4a2 2 0 0 0-2 2v14h12V6a2 2 0 0 0-2-2M9 10h6M9 14h6"/>'
};
const ico = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;

/* ---------- state ---------- */
const S = { me: null, accounts: [], cheques: [], books: [], loaded: false, lastBal: null };
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
      cheques: ch.map(r => ({ id: r.id, date: r.chq_date, code: r.code, no: Number(r.chq_no), amount: Number(r.amount), purpose: r.purpose, taker: r.cash_taker, party: r.party, toac: r.to_ac, remarks: r.remarks, by: r.entered_by, at: r.created_at, events: by[r.id] || [] }))
    };
  },
  async addCheque(c) {
    const row = { id: crypto.randomUUID(), chq_date: c.date, code: c.code, chq_no: c.no, amount: c.amount, purpose: c.purpose, cash_taker: c.taker || null, party: c.party || null, to_ac: c.toac || null, remarks: c.remarks || null, entered_by: S.me.name };
    const local = () => ({ id: row.id, date: c.date, code: c.code, no: c.no, amount: c.amount, purpose: c.purpose, taker: row.cash_taker, party: row.party, toac: row.to_ac, remarks: row.remarks, by: S.me.name, at: new Date().toISOString(), events: [], pending: true });
    if (!navigator.onLine) { Outbox.add("cheque", row); return local(); }
    const { data, error } = await sb.from("cheques").insert(row).select().single();
    if (error && isNetErr(error)) { Outbox.add("cheque", row); return local(); }
    if (error) { if (error.code === "23505") throw new Error("এই চেক নম্বর এই অ্যাকাউন্টে আগেই এন্ট্রি আছে"); throw error; }
    return { id: data.id, date: data.chq_date, code: data.code, no: Number(data.chq_no), amount: Number(data.amount), purpose: data.purpose, taker: data.cash_taker, party: data.party, toac: data.to_ac, remarks: data.remarks, by: data.entered_by, at: data.created_at, events: [] };
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
  async updateProfile(id, p) { const { error } = await sb.from("profiles").update(p).eq("id", id); if (error) throw error; }
};

/* ---------- data layer: Demo (in-memory + localStorage) ---------- */
const DEMO_KEY = "nabiad_demo_v1";
let demoHist = null, demoStore = null;
const DemoAPI = {
  async init() {
    demoStore = JSON.parse(localStorage.getItem(DEMO_KEY) || "null") || { cheques: [], events: [], balances: {}, books: [], accounts: null };
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
  async updateCheque(id, p) { Object.assign(demoStore.cheques.find(c => c.id === id), p); this.save(); },
  async deleteCheque(id) { demoStore.cheques = demoStore.cheques.filter(c => c.id !== id); demoStore.events = demoStore.events.filter(e => e.cheque_id !== id); this.save(); },
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
    const m = {}; rows.forEach(r => { m[r.code] = { total: r.total, block: r.block, remark: r.remark, od: r.od, odp: r.odp, by: S.me.name }; demoStore.balances[d + "|" + r.code] = m[r.code]; }); h.set(d, { ...(h.get(d) || {}), ...m }); this.save();
  },
  async history(code, from, to) { const h = await this.hist(); const out = []; for (const [d, m] of [...h.entries()].sort()) if (d >= from && d <= to && m[code]) out.push({ date: d, total: m[code].total, block: m[code].block, remark: m[code].remark }); return out; },
  async balanceCount() { const h = await this.hist(); let n = 0; h.forEach(m => n += Object.keys(m).length); return n; },
  async importBalances() { }, 
  async upsertAccount(a) { const i = demoStore.accounts.findIndex(x => x.code === a.code); if (i >= 0) demoStore.accounts[i] = { ...demoStore.accounts[i], ...a }; else demoStore.accounts.push(a); this.save(); },
  async upsertBook(b) { if (b.id) { Object.assign(demoStore.books.find(x => x.id === b.id), b); } else { b.id = crypto.randomUUID(); demoStore.books.push(b); } this.save(); return b.id; },
  async deleteBook(id) { demoStore.books = demoStore.books.filter(b => b.id !== id); this.save(); },
  async users() { return [{ id: "1", email: "ruhulaminrevens@gmail.com", name: "Ruhul", role: "admin", active: true }]; },
  async updateProfile() { }
};
const API = DEMO ? DemoAPI : SbAPI;

/* local cache: app opens instantly with last known data, then refreshes in background */
const CACHE_KEY = "nabiad_cache_v2";
function saveCache() { if (DEMO) return; try { const old = readCache() || {}; localStorage.setItem(CACHE_KEY, JSON.stringify({ u: S.me?.id, me: S.me, t: Date.now(), accounts: S.accounts, books: S.books, cheques: S.cheques.filter(c => !c.pending), lastBal: S.lastBal, snap: S.snap || old.snap || null })); } catch { } }
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
function loadCache() { if (DEMO) return false; try { const c = readCache(); if (!c || c.u !== S.me?.id) return false; S.accounts = c.accounts; S.books = c.books; S.cheques = c.cheques.map(derive); S.lastBal = c.lastBal; S.snap = c.snap; S.loaded = true; mergeOutbox(); const pd = pendingBalDates().sort().pop(); if (pd && (!S.lastBal || pd > S.lastBal)) S.lastBal = pd; return true; } catch { return false; } }
const balCache = new Map();
async function balancesOn(d) {
  const pb = pendingBal(d);
  if (!navigator.onLine && !DEMO) return Object.keys(pb).length ? pb : (S.snap?.date === d ? S.snap.map : {});
  if (!balCache.has(d)) balCache.set(d, API.balancesOn(d).then(m => { if (!DEMO && d === S.lastBal) { S.snap = { date: d, map: m }; saveCache(); } return m; }).catch(e => { balCache.delete(d); throw e; }));
  const m = await balCache.get(d); return Object.keys(pb).length ? { ...m, ...pb } : m;
}
async function reload() {
  const [d, lb] = await Promise.all([API.loadAll(), API.lastBalDate()]);
  S.accounts = d.accounts; S.books = d.books; S.cheques = d.cheques.map(derive); S.lastBal = lb; S.loaded = true; saveCache();
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
  dash: { t: "ড্যাশবোর্ড", ic: "home", roles: "asb", sec: "main", f: () => vDash },
  entry: { t: "চেক এন্ট্রি", ic: "plus", roles: "as", sec: "main", f: () => vEntry },
  status: { t: "স্ট্যাটাস", ic: "flag", roles: "as", sec: "main", f: () => vStatus },
  cheques: { t: "চেক তালিকা", ic: "list", roles: "asb", sec: "main", f: () => vCheques },
  closing: { t: "দৈনিক ক্লোজিং", ic: "bank", roles: "as", sec: "bank", f: () => vClosing },
  crep: { t: "ব্যালেন্স রিপোর্ট", ic: "img", roles: "asb", sec: "bank", f: () => vCrep },
  reports: { t: "রিপোর্ট", ic: "chart", roles: "asb", sec: "bank", f: () => vReports },
  accounts: { t: "অ্যাকাউন্ট খুঁজুন", ic: "card", roles: "asb", sec: "more", f: () => vAccounts },
  books: { t: "চেক বই", ic: "book", roles: "asb", sec: "more", f: () => vBooks },
  admin: { t: "অ্যাডমিন", ic: "gear", roles: "a", sec: "more", f: () => vAdmin }
};
const SECS = { main: "চেক", bank: "ব্যাংক ও রিপোর্ট", more: "অন্যান্য" };
const roleKey = () => ({ admin: "a", staff: "s", boss: "b" }[S.me.role]);
const allowed = () => Object.keys(ROUTES).filter(k => ROUTES[k].roles.includes(roleKey()));
let cleanup = null;
const getTheme = () => document.documentElement.dataset.theme || "light";
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("nabiad_theme", t); } catch { } $$(".th-ic").forEach(e => e.innerHTML = ico(t === "dark" ? "sun" : "moon")); }
function badges() { return { status: pendingOld().length, books: allMissing().length }; }
function shell() {
  const keys = allowed(), bd = badges();
  const link = k => { const r = ROUTES[k]; const n = bd[k]; return `<a href="#/${k}" data-k="${k}">${ico(r.ic)}<span>${r.t}</span>${n ? `<span class="badge">${n}</span>` : ""}</a>`; };
  let nav = "", last = "";
  keys.forEach(k => { if (ROUTES[k].sec !== last) { last = ROUTES[k].sec; nav += `<div class="sec">${SECS[last]}</div>`; } nav += link(k); });
  const mob = (S.me.role === "boss" ? ["dash", "cheques", "crep", "reports"] : ["dash", "entry", "status", "closing"]).filter(k => keys.includes(k));
  const ini = (S.me.name || "?").trim().slice(0, 1).toUpperCase();
  $("#app").innerHTML = `<div class="shell">
    <aside class="side"><div class="brand"><div class="logo">N</div><div><b>NABIAD</b><span>Cheque &amp; Bank Control</span></div></div>
      <nav class="nav">${nav}</nav>
      <div class="me"><div class="ava">${esc(ini)}</div><div class="who"><b>${esc(S.me.name)}</b><span class="mut">${esc(S.me.email)}</span></div><button class="iconbtn" id="logout" title="লগআউট">${ico("out")}</button></div></aside>
    <div class="mainwrap">
      <header class="topbar"><div class="tb-brand"><div class="logo" style="width:30px;height:30px;font-size:13px">N</div>NABIAD</div><div class="crumb" id="crumb"></div><div class="sp"></div>
        <button class="searchbtn" id="qs">${ico("search").replace("<svg", '<svg width="16" height="16"')}<span class="lbl">চেক / অ্যাকাউন্ট খুঁজুন…</span><kbd>Ctrl K</kbd></button>
        ${DEMO ? "" : `<button class="sync" id="sync"></button>`}${langToggle()}<button class="iconbtn th-ic" id="theme" title="থিম">${ico(getTheme() === "dark" ? "sun" : "moon")}</button>
        <span class="pill" style="align-self:center">${esc(S.me.role)}${DEMO ? " · demo" : ""}</span></header>
      <main class="main"><div id="view"></div></main></div></div>
    <nav class="mnav">${mob.map(k => `<a href="#/${k}" data-k="${k}">${ico(ROUTES[k].ic)}<span>${ROUTES[k].t.split(" ")[0]}</span>${bd[k] ? `<span class="badge">${bd[k]}</span>` : ""}</a>`).join("")}<a href="#" id="more">${ico("more")}<span>আরও</span></a></nav>`;
  const lo = async () => { await API.logout(); try { localStorage.removeItem(CACHE_KEY); } catch { } location.hash = ""; location.reload(); };
  $("#logout").onclick = lo;
  $("#theme").onclick = () => setTheme(getTheme() === "dark" ? "light" : "dark");
  $("#qs").onclick = palette;
  if ($("#sync")) { $("#sync").onclick = () => navigator.onLine ? Outbox.flush() : toast("ইন্টারনেট নেই — নেট এলে নিজে থেকে সিঙ্ক হবে", "err"); syncBadge(); }
  $("#lang").onclick = () => setLang(LANG === "bn" ? "en" : "bn");
  $("#more").onclick = e => {
    e.preventDefault(); const cur = (location.hash.match(/^#\/(\w+)/) || [])[1];
    const el = document.createElement("div"); el.className = "sheet";
    el.innerHTML = `<div class="box"><div class="grab"></div>${keys.filter(k => !mob.includes(k)).map(k => `<a href="#/${k}" class="${k === cur ? "on" : ""}">${ico(ROUTES[k].ic)}${ROUTES[k].t}${bd[k] ? `<span class="badge">${bd[k]}</span>` : ""}</a>`).join("")}
      <button class="lnk" data-x="th">${ico(getTheme() === "dark" ? "sun" : "moon")}${getTheme() === "dark" ? "লাইট থিম" : "ডার্ক থিম"}</button>
      <button class="lnk" data-x="lg">${ico("copyt")}${LANG === "bn" ? "English" : "বাংলা"}</button>
      <button class="lnk" data-x="lo">${ico("out")}লগআউট <span class="mut sm" style="margin-left:auto">${esc(S.me.name)}</span></button></div>`;
    document.body.appendChild(el);
    el.addEventListener("click", ev => { if (ev.target === el || ev.target.closest("a")) el.remove(); const x = ev.target.closest("[data-x]"); if (x?.dataset.x === "th") { setTheme(getTheme() === "dark" ? "light" : "dark"); el.remove(); } if (x?.dataset.x === "lo") lo(); if (x?.dataset.x === "lg") { el.remove(); setLang(LANG === "bn" ? "en" : "bn"); } });
  };
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

/* ---------- login ---------- */
function loginView() {
  const demoBox = DEMO ? `<div class="alert am" style="margin-top:14px"><span>⚠ <b>DEMO মোড</b> — Supabase সেট করা হয়নি, ডাটা শুধু এই ব্রাউজারে থাকবে।</span></div>
    <div class="chips" style="margin-top:12px">${[["admin", "Ruhul"], ["staff", "Foysal"], ["boss", "Boss"]].map(([r, n]) => `<span class="chip" data-demo="${r}|${n}">${r} (${n})</span>`).join("")}</div>` : "";
  $("#app").innerHTML = `<div class="login"><div class="tl">${langToggle()}</div>
    <div class="art"><div class="brand" style="padding:0"><div class="logo">N</div><div><b>NABIAD</b><span>Cheque &amp; Bank Control</span></div></div>
      <div><h1>চেক রেজিস্টার, দৈনিক ব্যাংক ক্লোজিং আর রিপোর্ট — এক জায়গায়</h1><p>প্রতিটি চেক পাতার হিসাব, মিসিং পাতা ধরা, আর Boss-এর জন্য তাৎক্ষণিক এনকোয়ারি।</p>
      <ul><li>Staff শুধু যোগ করতে পারে, বদলাতে পারে শুধু Admin</li><li>দৈনিক ক্লোজিং রিপোর্ট — ছবি, PDF, Excel, WhatsApp</li><li>মোবাইল ও কম্পিউটার দুটোতেই চলে</li></ul></div>
      <div class="sm" style="opacity:.6">© ${new Date().getFullYear()} NABIAD Group</div></div>
    <div class="pane"><div class="card"><div class="brand" style="padding:0 0 22px"><div class="logo">N</div><div><b style="color:var(--txt)">NABIAD</b><span class="mut">Cheque &amp; Bank Control</span></div></div>
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
async function vDash(v) {
  const t = today(), ym = t.slice(0, 7);
  const todayC = S.cheques.filter(c => c.date === t && isLive(c)), pend = S.cheques.filter(c => c.status === "Pending");
  const old = pendingOld(), mon = S.cheques.filter(c => c.date.startsWith(ym) && isLive(c)), bounced = S.cheques.filter(c => c.status === "Bounced" && (c.sdate || c.date).startsWith(ym));
  const miss = allMissing();
  let balHtml = `<div class="kpi card k-vi"><div class="l">সর্বশেষ ব্যাংক ক্লোজিং<span class="ki">${ico("bank")}</span></div><div class="v">—</div><div class="s">কোনো ব্যালেন্স সেভ হয়নি</div></div>`;
  if (S.lastBal) {
    const bm = await balancesOn(S.lastBal); const am = accMap(); let tot = 0, blk = 0;
    Object.entries(bm).forEach(([c, r]) => { if (am[c]) { tot += r.total || 0; blk += r.block || 0; } });
    balHtml = `<div class="kpi card k-vi"><div class="l">ব্যাংক ক্লোজিং · ${dmy(S.lastBal)}<span class="ki">${ico("bank")}</span></div><div class="v num">৳ ${money0(tot)}</div><div class="s">Block ${money0(blk)} · Usable <b class="gr">${money0(tot - blk)}</b></div></div>`;
  }
  const alerts = [];
  if (old.length) alerts.push(`<div class="alert rd">⏳ <span><b>${old.length}টি চেক</b> ${CFG.PENDING_ALERT_DAYS ?? 3} দিনের বেশি Pending — ${old.slice(0, 5).map(chqLine).join(", ")}${old.length > 5 ? "…" : ""} <a href="#/status">স্ট্যাটাস দিন →</a></span></div>`);
  if (miss.length) alerts.push(`<div class="alert am">📚 <span>মিসিং চেক পাতা: ${miss.slice(0, 4).map(x => `<b>${esc(x.b.code)}</b> (${x.st.missing.slice(0, 6).join(", ")}${x.st.missing.length > 6 ? "…" : ""})`).join(" · ")} <a href="#/books">সব দেখুন →</a></span></div>`);
  if (!alerts.length) alerts.push(`<div class="alert gr">✔ কোনো সতর্কতা নেই — সব ঠিক আছে।</div>`);
  const recent = [...S.cheques].sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 8);
  v.innerHTML = `<div class="hero"><div><h1>স্বাগতম, ${esc(S.me.name)} 👋</h1><p>${new Date().toLocaleDateString(LANG === "en" ? "en-GB" : "bn-BD", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · NABIAD Cheque &amp; Bank Control</p></div><div class="sp"></div>${S.me.role !== "boss" ? `<a class="btn lg" href="#/entry">${ico("plus")} নতুন চেক এন্ট্রি</a>` : `<a class="btn lg" href="#/crep">${ico("img")} ব্যালেন্স রিপোর্ট</a>`}</div>` + `
  <div class="grid g4">
    <div class="kpi card"><div class="l">আজকের চেক<span class="ki">${ico("list")}</span></div><div class="v num">${todayC.length}</div><div class="s num">৳ ${money0(sumAmt(todayC))}</div></div>
    <div class="kpi card k-am"><div class="l">Pending চেক<span class="ki">${ico("clock")}</span></div><div class="v num am">${pend.length}</div><div class="s num">৳ ${money0(sumAmt(pend))} · পুরনো ${old.length}</div></div>
    <div class="kpi card k-gr"><div class="l">এই মাসের চেক<span class="ki">${ico("chart")}</span></div><div class="v num">${mon.length}</div><div class="s num">৳ ${money0(sumAmt(mon))} · Bounce ${bounced.length}</div></div>
    ${balHtml}
  </div>
  <div class="grid" style="margin-top:14px;gap:8px">${alerts.join("")}</div>
  <div class="split" style="margin-top:14px">
    <div class="card flush"><div class="ch"><h3>সর্বশেষ এন্ট্রি</h3><div class="sp" style="flex:1"></div><a class="sm" href="#/cheques">সব দেখুন →</a></div>${recent.length ? `<div class="tw cards"><table><thead><tr><th>তারিখ</th><th>A/C · চেক</th><th class="r">টাকা</th><th>স্ট্যাটাস</th><th>কে</th></tr></thead><tbody>${recent.map(c => `<tr data-id="${c.id}"><td>${dmy(c.date)}</td><td><b>${esc(c.code)}</b> · ${c.no}</td><td class="r num">${money(c.amount)}</td><td>${stTag(c.status)}</td><td class="mut sm">${esc(c.by || "")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">এখনো কোনো চেক এন্ট্রি হয়নি</div>`}</div>
    <div class="card flush"><div class="ch"><h3>পুরনো Pending</h3><span class="tag">${old.length}</span></div>${old.length ? `<div class="tw cards"><table><thead><tr><th>A/C · চেক</th><th class="r">টাকা</th><th class="r">দিন</th></tr></thead><tbody>${old.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10).map(c => `<tr><td><b>${esc(c.code)}</b> · ${c.no}<div class="mut sm">${esc(c.party || c.purpose.split(" (")[0])}</div></td><td class="r num">${money(c.amount)}</td><td class="r rd b">${daysBetween(c.date, t)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">কোনো পুরনো Pending নেই 🎉</div>`}</div>
  </div>`;
  $$("tr[data-id]", v).forEach(r => r.onclick = () => chequeModal(S.cheques.find(c => c.id === r.dataset.id), () => route()));
}

/* ---------- cheque entry ---------- */
async function setStatus(c, status, date, remarks) {
  const e = await API.addStatus(c.id, status, date, remarks); c.events.push(e); derive(c); saveCache(); refreshBadges(); return c;
}
async function vEntry(v) {
  const st = { purpose: null };
  v.innerHTML = head("নতুন চেক এন্ট্রি<span class=\"mut\">Enter চাপলে পরের ঘরে যাবে · শেষ ঘরে Enter = সেভ</span>") + `
  <div class="split">
   <div class="card">
    <div class="fgrid">
     <div class="s1"><label class="f">চেকের তারিখ</label><input class="in big" type="date" id="e-date" value="${today()}"></div>
     <div class="s3"><label class="f">A/C Code <span class="mut">(টাইপ করুন: pbl, 483, nabiad…)</span></label><div><input class="in big" id="e-ac" autocomplete="off" placeholder="PBL-483" autofocus></div><div class="hint" id="e-achint"></div></div>
     <div class="s2"><label class="f">চেক নং (শুধু সংখ্যা)</label><input class="in big" id="e-no" inputmode="numeric" autocomplete="off"><div class="hint" id="e-nohint"></div></div>
     <div class="s2"><label class="f">টাকা (বাতিল পাতা হলে 0)</label><input class="in big num" id="e-amt" inputmode="decimal" autocomplete="off"><div class="hint num" id="e-amthint"></div></div>
     <div class="s4"><label class="f">খাত</label><div class="chips" id="e-purp">${PURPOSES.map(p => `<span class="chip" data-p="${esc(p)}">${esc(p.split(" (")[0])}</span>`).join("")}</div></div>
     <div class="s2" id="x-cash" style="display:none"><label class="f">কে তুলেছে *</label><select class="in" id="e-taker"><option value=""></option>${TAKERS.map(t => `<option>${t}</option>`).join("")}</select></div>
     <div class="s2" id="x-own" style="display:none"><label class="f">কোন A/C তে জমা *</label><div><input class="in" id="e-toac" autocomplete="off" placeholder="যে অ্যাকাউন্টে টাকা গেছে"></div></div>
     <div class="s2"><label class="f">পার্টি / সাপ্লায়ার</label><input class="in" id="e-party" autocomplete="off" list="dl-party"></div>
     <div class="s2"><label class="f">মন্তব্য</label><input class="in" id="e-rem" autocomplete="off" list="dl-rem"></div>
     <div class="s4" id="e-sum" style="display:none"></div>
    </div>${datalist("dl-party", S.cheques.map(c => c.party))}${datalist("dl-rem", S.cheques.map(c => c.remarks))}
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
  $$(".chip[data-p]", v).forEach(c => c.onclick = () => { st.purpose = c.dataset.p; applyPurpose(); if (purpKey() === "cash") $e("e-taker").focus(); else if (purpKey() === "own") $e("e-toac").focus(); else $e("e-party").focus(); });
  ["e-no", "e-amt"].forEach(i => $e(i).addEventListener("input", sum));
  $e("e-ac").addEventListener("picked", () => $e("e-no").select() || $e("e-no").focus());
  $e("e-no").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $e("e-amt").focus(); } });
  $e("e-amt").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); if (st.purpose) save(); else $e("e-err").textContent = "খাত বাছুন"; } });
  $$("#e-taker,#e-party,#e-rem", v).forEach(el => el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } }));
  $e("e-toac").addEventListener("picked", () => $e("e-party").focus());
  function clearAll(full) {
    if (full || !$("#keep", v).checked) { ac.set(null); st.purpose = null; $e("e-taker").value = ""; $e("e-achint").textContent = ""; $e("e-nohint").textContent = ""; }
    toac.set(null); $e("e-no").value = ac.get() ? nextNo(ac.get().value) : ""; $e("e-amt").value = ""; $e("e-party").value = ""; $e("e-rem").value = ""; applyPurpose();
  }
  function list() {
    const t = today(), arr = S.cheques.filter(c => (c.at || "").slice(0, 10) === t || c.date === t).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    $e("e-cnt").textContent = arr.length;
    $e("e-list").innerHTML = arr.length ? `<div class="tw cards" style="max-height:66vh"><table><thead><tr><th>A/C · চেক</th><th class="r">টাকা</th><th>স্ট্যাটাস</th><th>কে</th></tr></thead><tbody>${arr.map(c => `<tr><td><b>${esc(c.code)}</b> · ${c.no}<div class="mut sm">${esc(c.purpose.split(" (")[0])}${c.party ? " · " + esc(c.party) : ""}</div></td><td class="r num">${money(c.amount)}</td><td>${stTag(c.status)}${pendTag(c)}</td><td class="mut sm">${esc(c.by || "")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">আজ এখনো কোনো এন্ট্রি নেই</div>`;
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
      const row = await API.addCheque({ date, code, no, amount: k === "cancel" ? 0 : amount, purpose: st.purpose, taker: k === "cash" ? $e("e-taker").value : "", party: $e("e-party").value.trim(), toac: k === "own" ? toac.get().value : "", remarks: $e("e-rem").value.trim() });
      S.cheques.push(derive(row)); saveCache(); toast(row.pending ? `✔ অফলাইনে জমা হয়েছে: ${code} · ${no} · ৳ ${money(row.amount)} — নেট এলে সিঙ্ক হবে` : `✔ সেভ হয়েছে: ${code} · ${no} · ৳ ${money(row.amount)}`); clearAll(false); list();
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
    $("#s-list", v).innerHTML = tot ? `<div class="mut sm" style="margin-bottom:8px">${tot}টি চেক ${tot > 80 ? "(প্রথম ৮০টি)" : ""}</div><div class="card flush"><div class="tw cards"><table><thead><tr><th>তারিখ</th><th>A/C · চেক</th><th class="r">টাকা</th><th>বিবরণ</th><th>স্ট্যাটাস</th><th></th></tr></thead><tbody>${arr.map(c => { const d = daysBetween(c.date, T); return `<tr><td>${dmy(c.date)}${c.status === "Pending" && d > (CFG.PENDING_ALERT_DAYS ?? 3) ? `<div class="rd sm b">${d} দিন</div>` : ""}</td><td><b>${esc(c.code)}</b> · ${c.no}</td><td class="r num">${money(c.amount)}</td><td class="mut sm">${esc(c.purpose.split(" (")[0])}${c.party ? " · " + esc(c.party) : ""}</td><td>${stTag(c.status)}${pendTag(c)}${c.sdate && c.status !== "Pending" ? `<div class="mut sm">${dmy(c.sdate)}</div>` : ""}</td>
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
   <h3 style="margin:16px 0 8px;font-size:13px;color:var(--mut)">স্ট্যাটাস ইতিহাস</h3>
   ${c.events.length ? c.events.map(e => `<div style="display:flex;gap:8px;align-items:center;padding:4px 0">${stTag(e.status)} <span>${dmy(e.date)}</span> <span class="mut sm">${esc(e.by || "")} ${esc(e.remarks || "")}</span>${admin ? `<button class="btn bad sm" style="margin-left:auto" data-de="${e.id}">মুছুন</button>` : ""}</div>`).join("") : `<div class="mut sm">কোনো আপডেট নেই (ডিফল্ট: ${c.status})</div>`}
   <div class="row" style="margin-top:16px">${S.me.role !== "boss" ? `<button class="btn pri" id="c-st">স্ট্যাটাস দিন</button>` : ""}${admin ? `<button class="btn" id="c-ed">✎ এডিট</button><button class="btn bad" id="c-dl">🗑 মুছুন</button>` : ""}<button class="btn" id="c-x">বন্ধ</button></div>`, (root, close) => {
    $("#c-x", root).onclick = close;
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
    $("#k-tab", v).innerHTML = part.length ? `<div class="tw cards"><table><thead><tr><th>তারিখ</th><th>A/C · চেক</th><th>হোল্ডার</th><th class="r">টাকা</th><th>খাত / বিবরণ</th><th>স্ট্যাটাস</th><th>কে</th></tr></thead><tbody>${part.map(c => `<tr data-id="${c.id}" style="cursor:pointer"><td>${dmy(c.date)}</td><td><b>${esc(c.code)}</b> · ${c.no}</td><td class="mut sm">${esc((accMap()[c.code] || {}).holder || "")}</td><td class="r num">${money(c.amount)}</td><td>${esc(c.purpose.split(" (")[0])}<div class="mut sm">${esc([c.taker, c.party, c.toac && "→ " + c.toac, c.remarks].filter(Boolean).join(" · "))}</div></td><td>${stTag(c.status)}${pendTag(c)}${c.sdate && c.status !== "Pending" ? `<div class="mut sm">${dmy(c.sdate)}</div>` : ""}</td><td class="mut sm">${esc(c.by || "")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">কিছু পাওয়া যায়নি</div>`;
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
async function vClosing(v) {
  const t = today(); let date = S.lastBal && S.lastBal < t ? addDays(S.lastBal, 1) : t;
  v.innerHTML = head("দৈনিক ব্যাংক ক্লোজিং", `<span id="c-info" class="mut sm"></span>`) + `<div class="card" style="margin-bottom:14px"><div class="row"><div class="fix" style="width:180px"><label class="f">তারিখ</label><input class="in big" type="date" id="c-d" value="${date}"></div>
   <div class="fix" style="display:flex;gap:6px"><button class="btn" id="c-prev">‹ আগের দিন</button><button class="btn" id="c-next">পরের দিন ›</button></div><div id="c-msg" style="flex:3 1 300px"></div></div></div>
   <div class="card"><div id="c-body"><div class="empty">লোড হচ্ছে…</div></div></div>`;
  const body = $("#c-body", v);
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
    const am = accMap();
    const accs = S.accounts.filter(a => a.daily && (a.status === "Active" || ex[a.code])).sort((a, b) => a.sort - b.sort);
    const has = Object.values(ex).some(r => r.total != null); const locked = has && (S.me.role !== "admin" || Object.values(ex).some(r => r.pending));
    const cl = {}, tin = {}; S.cheques.forEach(c => { if (c.status === "Cleared" && c.sdate === date) { cl[c.code] = (cl[c.code] || 0) + c.amount; if (c.toac) tin[c.toac] = (tin[c.toac] || 0) + c.amount; } });
    $("#c-msg", v).innerHTML = has ? `<div class="alert ${locked ? "rd" : "am"}">${locked ? "🔒 এই তারিখের ব্যালেন্স আগেই সেভ হয়েছে। বদলাতে Admin কে বলুন।" : "⚠ এই তারিখ আগেই সেভ আছে — সেভ করলে Admin হিসেবে নতুন মান বসবে।"}</div>` : (prev.date ? `<div class="mut sm">আগের ডাটা: ${dmy(prev.date)}${daysBetween(prev.date, date) > 1 ? ` <b class="am">(মাঝে ${daysBetween(prev.date, date) - 1} দিনের ডাটা নেই)</b>` : ""}</div>` : "");
    const rows = accs.map(a => { const p = prev.map[a.code] || {}, e = ex[a.code] || {}; return { code: a.code, holder: a.holder, prevT: p.total || 0, prevB: p.block || 0, chq: cl[a.code] || 0, tin: tin[a.code] || 0, od: e.od || 0, odp: e.odp || 0, total: e.total, block: e.block ?? p.block ?? 0, remark: e.remark || "", ex: e.total != null }; });
    body.innerHTML = `<div class="tw cards closing" style="max-height:70vh"><table id="ct"><thead><tr><th>#</th><th>A/C</th><th class="r">আগের ক্লোজিং</th><th class="r">চেক খরচ</th><th class="r">অন্য খরচ</th><th class="r">ট্রান্সফার জমা</th><th class="r">অন্য জমা</th><th class="r">হিসাব মতে</th><th class="r">ব্যাংক ক্লোজিং</th><th class="r">BLOCK</th><th class="r">USABLE</th><th class="r">Diff</th><th>মন্তব্য</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr data-i="${i}"><td class="mut">${i + 1}</td><td><b>${esc(r.code)}</b><div class="mut sm">${esc(r.holder)}</div></td><td class="r num">${money(r.prevT)}</td><td class="r num">${r.chq ? money(r.chq) : "-"}</td>
     <td><input class="cell od" value="${r.od || ""}" inputmode="decimal" ${locked ? "disabled" : ""}></td><td class="r num">${r.tin ? money(r.tin) : "-"}</td><td><input class="cell odp" value="${r.odp || ""}" inputmode="decimal" ${locked ? "disabled" : ""}></td>
     <td class="r num exp"></td><td><input class="cell tot" value="${r.total ?? ""}" inputmode="decimal" placeholder="হিসাব মতে" ${locked ? "disabled" : ""}></td><td><input class="cell blk" value="${r.block || ""}" inputmode="decimal" ${locked ? "disabled" : ""}></td>
     <td class="r num usa b"></td><td class="r num dif"></td><td><input class="cell t rem" value="${esc(r.remark)}" ${locked ? "disabled" : ""}></td></tr>`).join("")}
    <tr class="tot"><td></td><td>মোট</td><td class="r num" id="T0"></td><td class="r num" id="T1"></td><td class="r num" id="T2"></td><td class="r num" id="T3"></td><td class="r num" id="T4"></td><td class="r num" id="T5"></td><td class="r num" id="T6"></td><td class="r num" id="T7"></td><td class="r num" id="T8"></td><td class="r num" id="T9"></td><td></td></tr></tbody></table></div>
    <div class="row" style="margin-top:14px"><button class="btn pri lg fix" id="c-save" ${locked ? "disabled" : ""}>${ico("save")} ${date === today() ? "আজকের" : dmy(date)} ব্যালেন্স সেভ</button><div class="hint" id="c-err"></div></div>
    <div class="mut sm" style="margin-top:8px">ব্যাংক ক্লোজিং ঘর খালি রাখলে "হিসাব মতে" অংক ধরা হবে। Diff ≠ 0 হলে মন্তব্য বাধ্যতামূলক।</div>`;
    const calc = () => {
      const T = Array(10).fill(0);
      $$("#ct tbody tr[data-i]", body).forEach(tr => {
        const r = rows[+tr.dataset.i]; const od = num($(".od", tr).value), odp = num($(".odp", tr).value), tv = $(".tot", tr).value.trim(), blk = num($(".blk", tr).value);
        const exp = r.prevT - r.chq - od + r.tin + odp, tot = tv === "" ? exp : num(tv), diff = tot - exp, usa = tot - blk;
        $(".exp", tr).textContent = money(exp); $(".usa", tr).textContent = money(usa); const d = $(".dif", tr); d.textContent = diff ? money(diff) : "0"; d.className = "r num dif " + (Math.abs(diff) > 0.001 ? "diffx" : "diff0");
        [r.prevT, r.chq, od, r.tin, odp, exp, tot, blk, usa, diff].forEach((x, i) => T[i] += x); Object.assign(r, { _od: od, _odp: odp, _tot: tot, _blk: blk, _diff: diff, _exp: exp, _rem: $(".rem", tr).value.trim(), _manual: tv !== "" });
      });
      T.forEach((x, i) => $("#T" + i, body).textContent = money0(x)); $("#T9", body).className = "r num " + (Math.abs(T[9]) > 0.001 ? "rd b" : "");
    };
    $$("#ct input", body).forEach(i => i.addEventListener("input", calc)); calc();
    $$("#ct input.cell:not(.rem)", body).forEach((inp, i, all) => inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); const tr = inp.closest("tr").nextElementSibling; const cls = [...inp.classList].find(c => ["od", "odp", "tot", "blk"].includes(c)); const nx = tr && $("." + cls, tr); nx ? (nx.focus(), nx.select()) : null; } }));
    $("#c-save", body).onclick = async () => {
      const err = $("#c-err", body); err.className = "hint rd"; err.textContent = "";
      const bad = rows.filter(r => Math.abs(r._diff) > 0.001 && !r._rem);
      if (bad.length) { err.textContent = `Diff আছে কিন্তু মন্তব্য নেই: ${bad.map(r => r.code).join(", ")}`; $$("#ct tbody tr[data-i]", body)[rows.indexOf(bad[0])].scrollIntoView({ block: "center" }); return; }
      const tot = rows.reduce((s, r) => s + r._tot, 0), blk = rows.reduce((s, r) => s + r._blk, 0);
      if (!ask(`${dmy(date)} — মোট ক্লোজিং ৳ ${money0(tot)}, Block ${money0(blk)}, Usable ${money0(tot - blk)}।\nসেভ করবেন?${S.me.role !== "admin" ? "\n(সেভের পর শুধু Admin বদলাতে পারবে)" : ""}`)) return;
      $("#c-save", body).disabled = true;
      try { await API.saveBalances(date, rows.map(r => ({ code: r.code, total: r._tot, block: r._blk || null, remark: r._rem, od: r._od, odp: r._odp })), has && S.me.role === "admin"); if (navigator.onLine && !Outbox.count()) S.lastBal = await API.lastBalDate(); else if (!S.lastBal || date > S.lastBal) S.lastBal = date; toast(Outbox.count() ? "✔ অফলাইনে জমা হয়েছে — নেট এলে সিঙ্ক হবে" : "✔ ব্যালেন্স সেভ হয়েছে"); await draw(); }
      catch (e) { err.textContent = e.message || String(e); toast(e.message || String(e), "err"); $("#c-save", body).disabled = false; }
    };
  }
  $("#c-d", v).onchange = draw; $("#c-prev", v).onclick = () => { $("#c-d", v).value = addDays($("#c-d", v).value, -1); draw(); }; $("#c-next", v).onclick = () => { $("#c-d", v).value = addDays($("#c-d", v).value, 1); draw(); };
  await draw();
}

/* ---------- closing report (WhatsApp style) + account history ---------- */
async function vCrep(v) {
  let date = S.lastBal || today();
  v.innerHTML = head("ব্যাংক ক্লোজিং রিপোর্ট", `<button class="btn" id="r-png">${ico("img")} ছবি</button><button class="btn" id="r-pdf">${ico("print")} PDF</button><button class="btn" id="r-xl">${ico("dl")} Excel</button><button class="btn" id="r-cp">${ico("copyt")} WhatsApp টেক্সট</button>`) + `
   <div class="card noprint" style="margin-bottom:14px"><div class="row"><div class="fix" style="width:190px"><label class="f">তারিখ</label><input class="in big" type="date" id="r-d" value="${date}"></div><div class="fix" style="display:flex;gap:6px"><button class="btn" id="r-p">‹ আগের দিন</button><button class="btn" id="r-n">পরের দিন ›</button></div></div></div>
   <div class="card rep-wrap"><div class="rep-scroll"><div id="crep"></div></div></div>
   <div class="card noprint" style="margin-top:14px"><h3>অ্যাকাউন্ট ইতিহাস</h3><div class="row"><div style="flex:2 1 240px"><label class="f">A/C</label><div><input class="in" id="h-ac" placeholder="কোড টাইপ করুন"></div></div><div><label class="f">From</label><input class="in" type="date" id="h-f" value="${addDays(today(), -60)}"></div><div><label class="f">To</label><input class="in" type="date" id="h-t" value="${today()}"></div></div><div id="h-out" style="margin-top:12px"></div></div>`;
  let data = null;
  async function draw() {
    date = $("#r-d", v).value; const bm = await balancesOn(date); const am = accMap();
    const rows = S.accounts.filter(a => a.daily && bm[a.code] && bm[a.code].total != null).sort((a, b) => a.sort - b.sort).map(a => ({ n: 0, a, total: bm[a.code].total, block: bm[a.code].block || 0, remark: bm[a.code].remark || "" }));
    rows.forEach((r, i) => r.n = i + 1); const T = rows.reduce((s, r) => ({ t: s.t + r.total, b: s.b + r.block }), { t: 0, b: 0 }); data = { rows, T };
    const wd = new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long" }), dl = new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const usaN = rows.filter(r => r.total - r.block > 0).length, by = (bm[rows[0]?.a.code] || {}).by;
    $("#crep", v).innerHTML = rows.length ? `<div class="rep" id="crep-in">
      <div class="rep-hd"><div class="lg">N</div><div class="tt"><b>NABIAD GROUP</b><span>Daily Bank Closing Report · ব্যাংক ক্লোজিং রিপোর্ট</span></div><div class="dt"><b>${dl}</b><span>${wd}</span></div></div>
      <div class="rep-kpi"><div><span>Accounts</span><b>${rows.length}</b></div><div class="k1"><span>Total Balance</span><b>৳ ${money0(T.t)}</b></div><div class="k2"><span>Block / Lien</span><b>৳ ${money0(T.b)}</b></div><div class="k3"><span>Usable (${usaN} A/C)</span><b>৳ ${money0(T.t - T.b)}</b></div></div>
      <table class="rep-t"><thead><tr><th class="r">#</th><th>A/C Code</th><th>Account Holder</th><th class="r">Total</th><th class="r bk">Block</th><th class="r us">Usable</th><th>Remarks</th></tr></thead><tbody>
      ${rows.map(r => { const u = r.total - r.block; return `<tr><td class="n">${r.n}</td><td class="cd">${esc(r.a.code)}</td><td class="ho">${esc(r.a.holder)}</td><td class="r num">${money0(r.total)}</td><td class="r num ${r.block ? "bk" : "z"}">${r.block ? money0(r.block) : "—"}</td><td class="r num ${u > 0 ? "us" : "z"}">${u > 0 ? money0(u) : u < 0 ? money0(u) : "0"}</td><td class="rm">${esc(r.remark)}</td></tr>`; }).join("")}
      <tr class="tot"><td></td><td colspan="2">GRAND TOTAL</td><td class="r num">${money0(T.t)}</td><td class="r num">${money0(T.b)}</td><td class="r num">${money0(T.t - T.b)}</td><td></td></tr></tbody></table>
      <div class="rep-ft"><span>Generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}${by ? " · Entered by " + esc(by) : ""} · Printed by ${esc(S.me.name)}</span><span>NABIAD Cheque &amp; Bank Control</span></div></div>` : `<div class="empty">এই তারিখে কোনো ব্যালেন্স সেভ নেই</div>`;
    fitRep();
  }
  function fitRep() { const el = $("#crep-in", v); if (!el) return; el.style.zoom = ""; const w = el.parentElement.clientWidth - 8; if (w < 1000) el.style.zoom = (w / 1000).toFixed(3); }
  const onRs = () => fitRep(); window.addEventListener("resize", onRs);
  $("#r-d", v).onchange = draw; $("#r-p", v).onclick = () => { $("#r-d", v).value = addDays($("#r-d", v).value, -1); draw(); }; $("#r-n", v).onclick = () => { $("#r-d", v).value = addDays($("#r-d", v).value, 1); draw(); };
  $("#r-pdf", v).onclick = () => { if (!$("#crep-in", v)) return toast("ডাটা নেই", "err"); document.body.classList.add("print-rep"); const t = document.title; document.title = `Bank_Closing_${date}`; window.print(); document.title = t; setTimeout(() => document.body.classList.remove("print-rep"), 500); };
  $("#r-png", v).onclick = async () => { const el = $("#crep-in", v); if (!el) return toast("ডাটা নেই", "err"); await loadScript("vendor/html2canvas.min.js"); const z = el.style.zoom; el.style.zoom = ""; const cv = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", width: el.offsetWidth, windowWidth: 1200 }); const a = document.createElement("a"); el.style.zoom = z; a.download = `Bank_Closing_${date}.png`; a.href = cv.toDataURL("image/png"); a.click(); };
  $("#r-xl", v).onclick = () => data?.rows.length ? exportXlsx({ Closing: [[dmy2(date), "A/C", "Code", "TOTAL", "BLOCK", "USABLE", "REMARKS"], ...data.rows.map(r => [r.n, r.a.holder, r.a.code, r.total, r.block, r.total - r.block, r.remark]), ["", "TOTAL", "", data.T.t, data.T.b, data.T.t - data.T.b, ""]] }, `Closing_${date}.xlsx`) : toast("ডাটা নেই", "err");
  $("#r-cp", v).onclick = async () => { if (!data?.rows.length) return toast("ডাটা নেই", "err"); const L = [`*${dmy2(date)} — Bank Closing*`, ...data.rows.map(r => `${r.n}. ${r.a.code} (${r.a.holder}): ${money0(r.total)}${r.block ? ` | Block ${money0(r.block)} | Usable ${money0(r.total - r.block)}` : ""}${r.remark ? " — " + r.remark : ""}`), "", `*TOTAL ${money0(data.T.t)} | BLOCK ${money0(data.T.b)} | USABLE ${money0(data.T.t - data.T.b)}*`]; try { await navigator.clipboard.writeText(L.join("\n")); toast("কপি হয়েছে — WhatsApp এ paste করুন"); } catch { toast("কপি করা যায়নি", "err"); } };
  const hAc = suggest($("#h-ac", v), () => acItems(true), () => hist());
  async function hist() {
    const c = hAc.get()?.value; if (!c) return; const rows = await API.history(c, $("#h-f", v).value, $("#h-t", v).value);
    if (!rows.length) { $("#h-out", v).innerHTML = `<div class="empty">ডাটা নেই</div>`; return; }
    const max = Math.max(...rows.map(r => r.total)), min = Math.min(...rows.map(r => r.total)), W = 700, H = 120, rg = max - min || 1;
    const pts = rows.map((r, i) => `${(i / Math.max(1, rows.length - 1) * W).toFixed(1)},${(H - 8 - (r.total - min) / rg * (H - 16)).toFixed(1)}`).join(" ");
    $("#h-out", v).innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:120px"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><polyline fill="none" stroke="url(#lg)" stroke-width="2.5" points="${pts}"/></svg>
     <div class="mut sm">সর্বোচ্চ ${money0(max)} · সর্বনিম্ন ${money0(min)} · ${rows.length} দিন</div><div class="tw" style="max-height:300px;margin-top:8px"><table><thead><tr><th>তারিখ</th><th class="r">Total</th><th class="r">Block</th><th class="r">Usable</th><th>মন্তব্য</th></tr></thead><tbody>${[...rows].reverse().map(r => `<tr><td>${dmy(r.date)}</td><td class="r num">${money0(r.total)}</td><td class="r num">${r.block ? money0(r.block) : ""}</td><td class="r num">${money0(r.total - (r.block || 0))}</td><td class="mut sm">${esc(r.remark || "")}</td></tr>`).join("")}</tbody></table></div>`;
  }
  $("#h-f", v).onchange = hist; $("#h-t", v).onchange = hist; await draw();
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
async function vReports(v) {
  const F = { p: "month", from: "", to: "", holder: "" }; const holders = [...new Set(S.accounts.map(a => a.holder).filter(Boolean))].sort();
  v.innerHTML = head("রিপোর্ট", `<button class="btn" id="p-x">${ico("dl")} Excel (সামারি + ডিটেইলস)</button><button class="btn" id="p-p">${ico("print")} প্রিন্ট</button>`) + `<div class="card noprint" style="margin-bottom:14px"><div class="row">
   <div class="fix"><label class="f">সময়</label><div class="seg">${[["today", "আজ"], ["month", "এই মাস"], ["last", "গত মাস"], ["year", "এই বছর"], ["custom", "তারিখ নির্বাচন"]].map(([k, l]) => `<span class="chip ${k === F.p ? "on" : ""}" data-p="${k}">${l}</span>`).join("")}</div></div>
   <div class="fix hide" id="p-cu"><label class="f">From – To</label><div style="display:flex;gap:6px"><input class="in" type="date" id="p-f"><input class="in" type="date" id="p-t"></div></div>
   <div><label class="f">অ্যাকাউন্ট হোল্ডার</label><select class="in" id="p-h"><option value="">সব</option>${holders.map(h => `<option>${esc(h)}</option>`).join("")}</select></div></div></div><div id="p-out"></div>`;
  let cur = null;
  const tbl = (title, rows, cols = ["নাম", "চেক", "টাকা"], total = true) => { const mx = Math.max(1, ...rows.map(r => r.amt)); const T = rows.reduce((s, r) => ({ n: s.n + r.n, a: s.a + r.amt }), { n: 0, a: 0 });
    return `<div class="card"><h3>${title}</h3>${rows.length ? `<div class="tw"><table><thead><tr><th>${cols[0]}</th><th class="r">${cols[1]}</th><th class="r">${cols[2]}</th><th style="width:30%" class="noprint"></th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.k}</td><td class="r num">${r.n}</td><td class="r num">${money0(r.amt)}</td><td class="noprint"><div class="bar"><i style="width:${(r.amt / mx * 100).toFixed(1)}%"></i></div></td></tr>`).join("")}${total ? `<tr class="tot"><td>মোট</td><td class="r num">${T.n}</td><td class="r num">${money0(T.a)}</td><td class="noprint"></td></tr>` : ""}</tbody></table></div>` : `<div class="empty">ডাটা নেই</div>`}</div>`; };
  function draw() {
    const rg = F.p === "custom" ? [F.from, F.to] : periodRange(F.p); const [from, to] = rg; const am = accMap();
    const all = S.cheques.filter(c => (!from || c.date >= from) && (!to || c.date <= to) && (!F.holder || (am[c.code] || {}).holder === F.holder)); const live = all.filter(isLive);
    const by = s => all.filter(c => c.status === s);
    const days = from && to ? daysBetween(from, to) + 1 : 0;
    const dayRows = group(live, c => c.date).sort((a, b) => a.k.localeCompare(b.k)).map(r => ({ ...r, k: dmy(r.k) }));
    const monRows = group(live, c => c.date.slice(0, 7)).sort((a, b) => a.k.localeCompare(b.k)).map(r => ({ ...r, k: (LANG === "en" ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] : BN_M)[+r.k.slice(5) - 1] + " " + r.k.slice(0, 4) }));
    const T = {
      pur: group(live, c => c.purpose.split(" (")[0]).sort((a, b) => b.amt - a.amt), tak: group(live.filter(c => c.taker), c => c.taker).sort((a, b) => b.amt - a.amt),
      st: group(all, c => c.status).sort((a, b) => b.amt - a.amt), bank: group(live, c => (am[c.code] || {}).bank).sort((a, b) => b.amt - a.amt),
      acc: group(live, c => `${c.code} <span class="mut sm">${esc((am[c.code] || {}).holder || "")}</span>`).sort((a, b) => b.amt - a.amt), day: dayRows, mon: monRows
    };
    cur = { from, to, all, live, T, am };
    $("#p-out", v).innerHTML = `<div class="mut sm" style="margin-bottom:10px">${from ? dmy(from) : "শুরু"} থেকে ${to ? dmy(to) : "আজ"}${F.holder ? " · " + esc(F.holder) : ""}${days ? ` · ${days} দিন` : ""}</div>
     <div class="grid g4"><div class="kpi card"><div class="l">মোট চেক (কার্যকর)<span class="ki">${ico("list")}</span></div><div class="v num">${live.length}</div><div class="s num">৳ ${money0(sumAmt(live))}</div></div>
      <div class="kpi card k-gr"><div class="l">Cleared<span class="ki">${ico("flag")}</span></div><div class="v num gr">${by("Cleared").length}</div><div class="s num">৳ ${money0(sumAmt(by("Cleared")))}</div></div>
      <div class="kpi card k-am"><div class="l">Pending<span class="ki">${ico("clock")}</span></div><div class="v num am">${by("Pending").length}</div><div class="s num">৳ ${money0(sumAmt(by("Pending")))}</div></div>
      <div class="kpi card k-rd"><div class="l">Bounced / বাতিল<span class="ki">${ico("flag")}</span></div><div class="v num rd">${by("Bounced").length} / ${by("Cancelled").length}</div><div class="s num">৳ ${money0(sumAmt(by("Bounced")))}</div></div></div>
     <div class="grid g2" style="margin-top:14px">${tbl("১ খাত অনুযায়ী", T.pur, ["খাত", "চেক", "টাকা"])}${tbl("২ কে তুলেছে (ক্যাশ)", T.tak, ["নাম", "চেক", "টাকা"])}${tbl("৩ স্ট্যাটাস", T.st, ["স্ট্যাটাস", "চেক", "টাকা"])}${tbl("৪ ব্যাংক অনুযায়ী", T.bank, ["ব্যাংক", "চেক", "টাকা"])}</div>
     <div style="margin-top:14px">${tbl("৫ অ্যাকাউন্ট অনুযায়ী", T.acc, ["অ্যাকাউন্ট", "চেক", "টাকা"])}</div>
     <div class="grid g2" style="margin-top:14px">${days && days <= 62 ? tbl("৬ দিন অনুযায়ী", T.day, ["তারিখ", "চেক", "টাকা"]) : ""}${tbl("৭ মাস অনুযায়ী", T.mon, ["মাস", "চেক", "টাকা"])}</div>`;
  }
  $$(".chip[data-p]", v).forEach(c => c.onclick = () => { F.p = c.dataset.p; $$(".chip[data-p]", v).forEach(x => x.classList.toggle("on", x === c)); $("#p-cu", v).classList.toggle("hide", F.p !== "custom"); draw(); });
  ["p-f", "p-t"].forEach(id => $("#" + id, v).onchange = () => { F.from = $("#p-f", v).value; F.to = $("#p-t", v).value; draw(); });
  $("#p-h", v).onchange = e => { F.holder = e.target.value; draw(); };
  $("#p-p", v).onclick = () => window.print();
  $("#p-x", v).onclick = () => { const strip = s => String(s).replace(/<[^>]+>/g, ""); const sh = (rows, h) => [h, ...rows.map(r => [strip(r.k), r.n, r.amt])];
    exportXlsx({ Summary: [["Period", `${cur.from || ""} → ${cur.to || ""}`], ["Holder", F.holder || "All"], [], ["Live cheques", cur.live.length, sumAmt(cur.live)]], "By Purpose": sh(cur.T.pur, ["Purpose", "Count", "Amount"]), "By Cash Taker": sh(cur.T.tak, ["Name", "Count", "Amount"]), "By Status": sh(cur.T.st, ["Status", "Count", "Amount"]), "By Bank": sh(cur.T.bank, ["Bank", "Count", "Amount"]), "By Account": sh(cur.T.acc, ["Account", "Count", "Amount"]), "By Day": sh(cur.T.day, ["Date", "Count", "Amount"]), "By Month": sh(cur.T.mon, ["Month", "Count", "Amount"]), Details: [CHQ_HEAD, ...[...cur.all].sort((a, b) => a.date.localeCompare(b.date)).map(chqRow)] }, `Cheque_Report_${today()}.xlsx`); };
  draw();
}

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
function accountModal(a, after) {
  const isNew = !a; a = a || { code: "", holder: "", bank: "", branch: "", acno: "", type: "", daily: true, status: "Active", sort: Math.max(0, ...S.accounts.map(x => x.sort || 0)) + 1 };
  const banks = [...new Set([...BANKS.map(b => b.split("|")[0]), ...S.accounts.map(x => x.bank)])];
  modal(`<h2>${isNew ? "নতুন অ্যাকাউন্ট" : "অ্যাকাউন্ট এডিট · " + esc(a.code)}</h2><div class="grid" style="gap:12px">
   <div class="row"><div><label class="f">ব্যাংক <span class="mut">(লিখলে তালিকা আসবে)</span></label><input class="in" id="a-b" list="dl-bank" value="${esc(a.bank || "")}" autocomplete="off"></div><div><label class="f">শাখা</label><input class="in" id="a-br" list="dl-branch" value="${esc(a.branch || "")}" autocomplete="off"></div></div>
   <div class="row"><div><label class="f">হোল্ডার (অ্যাকাউন্টের নাম)</label><input class="in" id="a-h" list="dl-holder" value="${esc(a.holder || "")}" autocomplete="off"></div><div><label class="f">ধরন</label><input class="in" id="a-t" list="dl-type" value="${esc(a.type || "")}" autocomplete="off"></div></div>
   <div class="row"><div><label class="f">A/C নং</label><input class="in" id="a-n" value="${esc(a.acno || "")}" inputmode="numeric" autocomplete="off"></div><div><label class="f">Code <span class="mut">(BANK-শেষ ৩ ডিজিট)</span></label><input class="in" id="a-c" value="${esc(a.code)}" ${isNew ? "" : "disabled"} autocomplete="off"><div class="hint" id="a-ch"></div></div></div>
   <div class="row"><div><label class="f">দৈনিক ক্লোজিং এ আসবে?</label><select class="in" id="a-d"><option value="1" ${a.daily ? "selected" : ""}>হ্যাঁ</option><option value="0" ${a.daily ? "" : "selected"}>না</option></select></div><div><label class="f">Status</label><select class="in" id="a-s">${["Active", "Closed"].map(s => `<option ${s === a.status ? "selected" : ""}>${s}</option>`).join("")}</select></div><div><label class="f">ক্রম</label><input class="in" id="a-o" value="${a.sort}" inputmode="numeric"></div></div>
   <div class="row"><button class="btn pri fix" id="a-ok">${ico("save")} সেভ</button><button class="btn fix" id="a-x">বাতিল</button></div></div>
   ${datalist("dl-bank", banks)}${datalist("dl-branch", S.accounts.map(x => x.branch))}${datalist("dl-holder", S.accounts.map(x => x.holder))}${datalist("dl-type", [...AC_TYPES, ...S.accounts.map(x => x.type)])}`, (root, close) => {
    const g = id => $("#" + id, root);
    let touched = !isNew;
    g("a-c").addEventListener("input", () => touched = true);
    const auto = () => {
      const bk = BANKS.find(b => b.split("|")[0].toLowerCase() === g("a-b").value.trim().toLowerCase());
      const pre = bk ? bk.split("|")[1] : (S.accounts.find(x => x.bank === g("a-b").value.trim())?.code.split("-")[0] || "");
      const d = g("a-n").value.replace(/\D/g, "");
      if (isNew && !touched && pre && d.length >= 3) g("a-c").value = `${pre}-${d.slice(-3)}`;
      const code = g("a-c").value.trim().toUpperCase(), dup = isNew && S.accounts.find(x => x.code === code), dupNo = d && S.accounts.find(x => x.code !== a.code && (x.acno || "").replace(/\D/g, "") === d);
      g("a-ch").innerHTML = dup ? `<span class="rd">এই Code আগেই আছে (${esc(dup.holder)})</span>` : dupNo ? `<span class="am">এই A/C নং আগেই আছে: ${esc(dupNo.code)}</span>` : "";
    };
    ["a-b", "a-n", "a-c"].forEach(id => g(id).addEventListener("input", auto)); auto();
    g("a-x").onclick = close; g("a-ok").onclick = async () => { const code = g("a-c").value.trim().toUpperCase(); if (!code) return toast("Code দিন", "err"); if (isNew && S.accounts.some(x => x.code === code)) return toast("এই Code আগেই আছে", "err"); try { await API.upsertAccount({ code, holder: g("a-h").value.trim(), bank: g("a-b").value.trim(), branch: g("a-br").value.trim(), acno: g("a-n").value.trim(), type: g("a-t").value.trim(), daily: g("a-d").value === "1", status: g("a-s").value, sort: parseInt(g("a-o").value) || 0 }); await reload(); close(); after(); toast("সেভ হয়েছে"); } catch (e) { toast(e.message, "err"); } };
    g(isNew ? "a-b" : "a-h").focus();
  });
}
/* ---------- account directory (search + copy) ---------- */
async function vAccounts(v) {
  const admin = S.me.role === "admin"; const banks = [...new Set(S.accounts.map(a => a.bank).filter(Boolean))].sort(), holders = [...new Set(S.accounts.map(a => a.holder).filter(Boolean))].sort();
  v.innerHTML = head("অ্যাকাউন্ট খুঁজুন", admin ? `<button class="btn pri" id="ad-add">${ico("plus")} নতুন অ্যাকাউন্ট</button>` : "") + `<div class="card noprint" style="margin-bottom:14px"><div class="row">
    <div style="flex:2 1 260px"><label class="f">খুঁজুন <span class="mut">(কোড, নাম, ব্যাংক, শাখা, A/C নং — ড্যাশ/স্পেস লাগবে না: ibbl203)</span></label><input class="in big" id="ad-q" autocomplete="off" placeholder="যেমন: 483, noor, pubali" autofocus></div>
    <div><label class="f">ব্যাংক</label><select class="in" id="ad-b"><option value="">সব</option>${banks.map(b => `<option>${esc(b)}</option>`).join("")}</select></div>
    <div><label class="f">হোল্ডার</label><select class="in" id="ad-h"><option value="">সব</option>${holders.map(b => `<option>${esc(b)}</option>`).join("")}</select></div>
    <div class="fix"><label class="f">Status</label><select class="in" id="ad-s"><option value="Active">Active</option><option value="">সব</option><option value="Closed">Closed</option></select></div></div></div>
    <div class="mut sm" id="ad-n" style="margin-bottom:8px"></div><div class="acc-grid" id="ad-out"></div>`;
  const draw = () => {
    const q = norm($("#ad-q", v).value), b = $("#ad-b", v).value, h = $("#ad-h", v).value, st = $("#ad-s", v).value;
    const arr = S.accounts.filter(a => (!b || a.bank === b) && (!h || a.holder === h) && (!st || a.status === st) && (!q || norm([a.code, a.holder, a.bank, a.branch, a.acno, a.type].join(" ")).includes(q)));
    $("#ad-n", v).textContent = `${arr.length}টি অ্যাকাউন্ট`;
    $("#ad-out", v).innerHTML = arr.map(a => { const n = S.cheques.filter(c => c.code === a.code).length; return `<div class="card acc"><div class="hd"><span class="code">${esc(a.code)}</span>${a.status !== "Active" ? `<span class="tag cl">${esc(a.status)}</span>` : ""}${a.type ? `<span class="tag">${esc(a.type)}</span>` : ""}<span style="flex:1"></span>${admin ? `<button class="btn sm ghost" data-e="${esc(a.code)}">${ico("edit")}</button>` : ""}</div><div class="bd">
      <div class="b">${esc(a.holder || "")}</div><div class="bk">${esc(a.bank || "")}${a.branch ? " · " + esc(a.branch) : ""}</div>
      ${a.acno ? `<div class="no"><span>${esc(a.acno)}</span><button class="btn sm ghost" data-cp="${esc(a.acno)}" title="কপি">${ico("copy")} কপি</button></div>` : `<div class="mut sm">A/C নং দেওয়া নেই</div>`}
      <div class="mut sm">${n ? `${n}টি চেক এন্ট্রি · <a href="#/cheques" data-go="${esc(a.code)}">চেক দেখুন</a>` : "এখনো চেক এন্ট্রি নেই"}${a.daily ? " · দৈনিক ক্লোজিং" : ""}</div></div></div>`; }).join("") || `<div class="card empty" style="grid-column:1/-1">কিছু পাওয়া যায়নি</div>`;
    $$("[data-cp]", v).forEach(x => x.onclick = async () => { try { await navigator.clipboard.writeText(x.dataset.cp); toast("A/C নং কপি হয়েছে"); } catch { toast("কপি করা যায়নি", "err"); } });
    $$("[data-e]", v).forEach(x => x.onclick = () => accountModal(S.accounts.find(a => a.code === x.dataset.e), () => vAccounts(v)));
    $$("[data-go]", v).forEach(x => x.onclick = () => { sessionStorage.setItem("nabiad_chq_ac", x.dataset.go); });
  };
  ["ad-q", "ad-b", "ad-h", "ad-s"].forEach(id => $("#" + id, v).addEventListener("input", draw));
  $("#ad-add", v) && ($("#ad-add", v).onclick = () => accountModal(null, () => vAccounts(v)));
  draw();
}
async function vAdmin(v) {
  let tab = "acc";
  const draw = async () => {
    v.innerHTML = head("অ্যাডমিন") + `<div class="tabs">${[["acc", "অ্যাকাউন্ট"], ["usr", "ব্যবহারকারী"], ["imp", "পুরনো ডাটা import"], ["help", "সেটআপ"]].map(([k, l]) => `<span class="chip ${k === tab ? "on" : ""}" data-t="${k}">${l}</span>`).join("")}</div><div id="ad"></div>`;
    $$("[data-t]", v).forEach(c => c.onclick = () => { tab = c.dataset.t; draw(); }); const out = $("#ad", v);
    if (tab === "acc") {
      out.innerHTML = `<div class="row" style="margin-bottom:12px"><button class="btn pri fix" id="ac-add">${ico("plus")} নতুন অ্যাকাউন্ট</button></div><div class="card flush"><div class="tw cards"><table><thead><tr><th>#</th><th>Code</th><th>হোল্ডার</th><th>ব্যাংক</th><th>A/C নং</th><th>দৈনিক</th><th>Status</th><th></th></tr></thead><tbody>${S.accounts.map(a => `<tr><td class="mut">${a.sort}</td><td><b>${esc(a.code)}</b></td><td>${esc(a.holder || "")}</td><td class="mut sm">${esc(a.bank || "")}</td><td class="mut sm">${esc(a.acno || "")}</td><td>${a.daily ? "✓" : ""}</td><td>${esc(a.status)}</td><td><button class="btn sm" data-a="${esc(a.code)}">${ico("edit")} এডিট</button></td></tr>`).join("")}</tbody></table></div></div>`;
      $("#ac-add", out).onclick = () => accountModal(null, draw); $$("[data-a]", out).forEach(b => b.onclick = () => accountModal(S.accounts.find(x => x.code === b.dataset.a), draw));
    } else if (tab === "usr") {
      const us = await API.users();
      out.innerHTML = `<div class="card"><div class="alert am" style="margin-bottom:12px"><span>নতুন ব্যবহারকারী যোগ: Supabase → Authentication → Users → Add user (ইমেইল + পাসওয়ার্ড)। এখানে এসে নাম ও Role ঠিক করুন। <b>নাম</b> চেক এন্ট্রিতে "কে এন্ট্রি করেছে" হিসেবে বসে।</span></div>
       <div class="tw"><table><thead><tr><th>ইমেইল</th><th>নাম</th><th>Role</th><th>সক্রিয়</th><th></th></tr></thead><tbody>${us.map(u => `<tr data-u="${u.id}"><td>${esc(u.email)}</td><td><input class="cell t nm" value="${esc(u.name || "")}"></td><td><select class="in rl" style="min-height:34px;padding:4px 8px">${["admin", "staff", "boss"].map(r => `<option ${r === u.role ? "selected" : ""}>${r}</option>`).join("")}</select></td><td><input type="checkbox" class="ac" ${u.active ? "checked" : ""}></td><td><button class="btn sm" data-s="${u.id}">সেভ</button></td></tr>`).join("")}</tbody></table></div></div>`;
      $$("[data-s]", out).forEach(b => b.onclick = async () => { const tr = b.closest("tr"); try { await API.updateProfile(b.dataset.s, { name: $(".nm", tr).value.trim(), role: $(".rl", tr).value, active: $(".ac", tr).checked }); toast("সেভ হয়েছে"); } catch (e) { toast(e.message, "err"); } });
    } else if (tab === "imp") {
      const n = await API.balanceCount();
      out.innerHTML = `<div class="card"><h3>পুরনো ব্যাংক ব্যালেন্স ইতিহাস</h3><p>এখন ডাটাবেসে ব্যালেন্স রেকর্ড: <b class="num">${money0(n)}</b></p>${DEMO ? `<div class="alert gr">DEMO মোডে পুরনো ডাটা (৩৯,৪৭৯ রেকর্ড, ০২-০৯-২০২৩ থেকে) আগে থেকেই লোড আছে।</div>` : `<p class="mut">history.json (২০২৩-২০২৬ এর ৩৯,৪৭৯ রেকর্ড) ডাটাবেসে তুলবে। একই তারিখ+A/C আবার তুললে নতুন করে বসবে, ডুপ্লিকেট হবে না।</p><button class="btn pri" id="im-go">⬆ পুরনো ডাটা import করুন</button><div class="bar" style="margin-top:12px"><i id="im-bar" style="width:0"></i></div><div class="hint" id="im-t"></div>`}</div>`;
      $("#im-go", out) && ($("#im-go", out).onclick = async () => { if (!ask("পুরনো ডাটা import করবেন?")) return; $("#im-go", out).disabled = true; try { const rows = await loadEncrypted("history.enc"); await API.importBalances(rows, (a, b) => { $("#im-bar", out).style.width = a / b * 100 + "%"; $("#im-t", out).textContent = `${a} / ${b}`; }); balCache.clear(); toast("✔ import সম্পূর্ণ"); S.lastBal = await API.lastBalDate(); } catch (e) { toast(e.message, "err"); $("#im-go", out).disabled = false; } });
    } else {
      out.innerHTML = `<div class="card"><h3>সংক্ষেপে</h3><ul style="line-height:1.9"><li><b>Staff</b> শুধু নতুন এন্ট্রি / স্ট্যাটাস / ব্যালেন্স <u>যোগ</u> করতে পারে — পুরনো এন্ট্রি বদলানো বা মোছা শুধু <b>Admin</b> (ডাটাবেস নিজেই আটকায়)।</li><li><b>Boss</b> শুধু দেখতে ও এনকোয়ারি/রিপোর্ট নিতে পারে।</li><li>ভুল স্ট্যাটাস দিলে নতুন স্ট্যাটাস দিন — ইতিহাস থেকে যাবে।</li><li>নতুন চেক বই যোগ করলে "চেক বই" পাতায় মিসিং পাতা নিজে থেকে ধরা পড়বে।</li></ul></div>`;
    }
  };
  await draw();
}

/* ---------- boot ---------- */
let inited = false;
function onLangChange() { if (S.me && $("#view")) { shell(); route(); } else if (!S.me) loginView(); }
async function boot() {
  try {
    if (!inited) { startI18n(); await API.init(); inited = true; }
    if (!S.me) S.me = await API.session();
    if (!S.me) return loginView();
    let mo = null;
    const start = () => { shell(); route(); if (!mo) { let q = 0; mo = new MutationObserver(() => { if (!q) q = requestAnimationFrame(() => { q = 0; labelTables(document); }); }); mo.observe(document.body, { childList: true, subtree: true }); } };
    if (loadCache()) { start(); reload().then(() => { refreshBadges(); const k = (location.hash.match(/^#\/(\w+)/) || [])[1] || "dash"; if (["dash", "cheques", "books", "accounts"].includes(k) && !document.querySelector(".mback,.pal") && !document.activeElement?.matches("input,select,textarea")) route(); }).catch(e => { if (!isNetErr(e)) toast("রিফ্রেশ ব্যর্থ: " + (e.message || e), "err"); }); Outbox.flush(); }
    else { $("#app").innerHTML = `<div class="boot"><div><div class="logo">N</div><div class="mut">ডাটা লোড হচ্ছে…</div></div></div>`; await reload(); start(); Outbox.flush(); }
  } catch (e) { console.error(e); $("#app").innerHTML = `<div class="login"><div class="card"><div class="alert rd">শুরু করা যায়নি: ${esc(e.message || e)}</div><p class="mut sm">config.js এ Supabase URL ও key ঠিক আছে কি এবং schema.sql চালানো হয়েছে কি দেখুন।</p></div></div>`; }
}
window.addEventListener("hashchange", route);
boot();
