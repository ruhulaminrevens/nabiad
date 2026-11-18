/* NABIAD — INVENTORY (v6.71)
   Dashboard · Niramoy · Distribution · RM Factory (Tamarind + Wood) · Status & Report
   Loaded after app.js; uses its helpers (head, pbBar, repSheet, exportXlsx, modal, suggest, bi …).
   Model: orders / trips with item lines {itemId:{q,r}} (rate kept per order), monthly demand,
   RM daily ready/delivery (bags) with opening per product, AH Star Agro receive/return ledger, month locks. */
"use strict";

/* ---------- routes, sidebar group, page header text ---------- */
Object.assign(ROUTES, {
  ivdash: { t: "ইনভেন্টরি ড্যাশবোর্ড", ic: "ivbox", roles: "asb", sec: "inv", f: () => vInvDash },
  ivnir: { t: "নিরাময় ডেলিভারি", ic: "ivtruck", roles: "asb", sec: "inv", f: () => vInvNir },
  ivdist: { t: "ডিস্ট্রিবিউশন অর্ডার", ic: "ivcart", roles: "asb", sec: "inv", f: () => vInvDist },
  ivrm: { t: "আরএম ফ্যাক্টরি", ic: "ivfac", roles: "asb", sec: "inv", f: () => vInvRm },
  ivrep: { t: "স্ট্যাটাস ও রিপোর্ট", ic: "chart", roles: "asb", sec: "inv", f: () => vInvRep }
});
SECS.inv = "ইনভেন্টরি";
PH_SEC.inv = ["ইনভেন্টরি", "Inventory"];
Object.assign(ICON, {
  ivbox: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  ivtruck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  ivcart: '<path d="M3 4h2l2.4 11h10.2L20 8H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  ivfac: '<path d="M3 21V10l6 4V10l6 4V6l6-3v18z"/><path d="M7 17h2M12 17h2M17 17h2"/>',
  ivlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
});

/* ---------- small helpers ---------- */
const IV_CH = { nir: ["নিরাময়", "Niramoy"], dist: ["ডিস্ট্রিবিউশন", "Distribution"] };
const IV_ST = { pending: ["Pending", "Pending", "am"], today: ["আজ যাবে", "Today", "cy"], ok: ["Delivered", "Delivered", "gr"], cancel: ["Cancel", "Cancelled", "rd"] };
const ivSt = s => `<span class="iv-st s-${s}">${bi(IV_ST[s][0], IV_ST[s][1])}</span>`;
const ivMon = d => d.slice(0, 7) + "-01";
const ivMonEnd = m => { const d = new Date(m.slice(0, 7) + "-01T00:00:00"); d.setMonth(d.getMonth() + 1); d.setDate(0); return iso(d); };
const ivMonName = m => new Date(m.slice(0, 7) + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const ivQ = n => (n === null || n === undefined || isNaN(n)) ? "0" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const ivDays = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
const ivErr = e => /inv_|rm_|relation|does not exist|schema cache/i.test(e.message || "") && !/permission|policy|locked/i.test(e.message || "")
  ? bi("Inventory টেবিল নেই — Supabase-এ schema_v6.sql-এর v6.71 অংশ চালাতে হবে", "Inventory tables are missing — run the v6.71 part of schema_v6.sql in Supabase")
  : /month_locked/.test(e.message || "") ? bi("এই মাস Lock করা — admin আগে Unlock করুন", "This month is locked — an admin must unlock it first")
  : /negative_qty/.test(e.message || "") ? bi("পরিমাণ বা রেট মাইনাস হতে পারে না", "Quantity or rate cannot be negative")
  : /row-level security|policy|permission/i.test(e.message || "") ? bi("এই কাজের অনুমতি নেই", "You are not allowed to do this")
  : isNetErr(e) ? bi("ইন্টারনেট নেই", "No internet") : (e.message || String(e));
/* totals exactly like the database trigger (zero lines dropped, value = Σ q × r) */
function ivCalc(o) {
  const clean = {}; let tq = 0, tv = 0;
  for (const [k, l] of Object.entries(o.lines || {})) {
    const q = +l.q || 0, r = +l.r || 0; if (q < 0 || r < 0) throw new Error("negative_qty");
    if (q > 0) { clean[k] = { q, r }; tq += q; tv += q * r; }
  }
  o.lines = clean; o.total_qty = tq; o.value = Math.round(tv * 100) / 100;
  if (o.status === "ok" && !o.delivery_date) o.delivery_date = today();
  if (o.status === "pending" || o.status === "today") o.delivery_date = null;
  return o;
}
const ivRow = r => ({ ...r, rent: r.rent == null ? null : +r.rent, total_qty: +r.total_qty || 0, value: +r.value || 0, lines: r.lines || {} });

/* ---------- data layer ---------- */
const IV_T = ["inv_items", "inv_orders", "inv_demand", "rm_products", "rm_daily", "rm_ledger", "inv_locks"];
Object.assign(SbAPI, {
  async ovdAll() {
    const [opening, sales] = await Promise.all([fetchAll("dist_opening", "id"), fetchAll("dist_sales_reg", "id")]);
    return { opening: opening.map(o => ({ ...o, opening: Number(o.opening) })), sales: sales.map(x => ({ ...x, amount: Number(x.amount) })) };
  },
  async ovdLink(name, pid) {
    for (const t of ["dist_opening", "dist_sales_reg"]) { const { error } = await sb.from(t).update({ party_id: pid }).eq("party_name", name).is("party_id", null); if (error) throw error; }
  },
  async invAll() {
    const [items, orders, demand, rmp, rmd, rml, locks] = await Promise.all([
      fetchAll("inv_items", "sort"), fetchAll("inv_orders", "date"), fetchAll("inv_demand", "month"),
      fetchAll("rm_products", "sort"), fetchAll("rm_daily", "date"), fetchAll("rm_ledger", "date"), fetchAll("inv_locks", "month")]);
    return { items, orders: orders.map(ivRow), demand, rmp, rmd, rml, locks };
  },
  async invItemSave(it) {
    const row = { name: it.name, grp: it.grp || "coil", unit: it.unit || "ctn", rate_nir: it.rate_nir ?? null, rate_dist: it.rate_dist ?? null, in_nir: !!it.in_nir, in_dist: !!it.in_dist, sort: +it.sort || 100, active: it.active !== false };
    const q = it.id ? sb.from("inv_items").update(row).eq("id", it.id) : sb.from("inv_items").insert(row);
    const { data, error } = await q.select().single(); if (error) throw error.code === "23505" ? new Error(bi("এই নামে আইটেম আগেই আছে", "An item with this name already exists")) : error; return data;
  },
  async invItemDelete(id) { const { error } = await sb.from("inv_items").delete().eq("id", id); if (error) throw error; },
  async invOrderSave(o) {
    const row = { ch: o.ch, date: o.date, party: o.party || null, party_id: o.party_id || null, location: o.location || null, asm: o.asm || null, transport: o.transport || null, vehicle: o.vehicle || null, rent: o.rent === "" || o.rent == null ? null : +o.rent, lines: o.lines, free: o.free || null, remarks: o.remarks || null, status: o.status, delivery_date: o.delivery_date || null };
    let q; if (o.id) q = sb.from("inv_orders").update(row).eq("id", o.id); else { row.entered_by = S.me.name; q = sb.from("inv_orders").insert(row); }
    const { data, error } = await q.select(); if (error) throw error; if (!data.length) throw new Error("policy"); return ivRow(data[0]);
  },
  async invOrderStatus(ids, status, dd) {
    const row = { status, delivery_date: status === "ok" ? (dd || today()) : null };
    const { data, error } = await sb.from("inv_orders").update(row).in("id", ids).select(); if (error) throw error; return data.map(ivRow);
  },
  async invLinkParty(name, loc, pid) {
    let q = sb.from("inv_orders").update({ party_id: pid }).eq("ch", "dist").eq("party", name).is("party_id", null);
    q = loc ? q.eq("location", loc) : q.is("location", null);
    const { data, error } = await q.select(); if (error) throw error; return data.map(ivRow);
  },
  async invOrderDelete(id) { const { data, error } = await sb.from("inv_orders").delete().eq("id", id).select("id"); if (error) throw error; if (!data.length) throw new Error("policy"); },
  async invDemandSave(ch, month, lines) { const { error } = await sb.from("inv_demand").upsert({ ch, month, lines, entered_by: S.me.name }); if (error) throw error; },
  async rmProductSave(p) { const { error } = await sb.from("rm_products").update({ name: p.name, bag_kg: +p.bag_kg, opening_date: p.opening_date, opening_bag: +p.opening_bag || 0 }).eq("code", p.code); if (error) throw error; },
  async rmDailySave(r) { const { error } = await sb.from("rm_daily").upsert({ date: r.date, product: r.product, ready_bag: +r.ready_bag || 0, delivery_bag: +r.delivery_bag || 0, remarks: r.remarks || null, entered_by: S.me.name }); if (error) throw error; },
  async rmDailyDelete(date, product) { const { error } = await sb.from("rm_daily").delete().eq("date", date).eq("product", product); if (error) throw error; },
  async rmLedgerSave(r) {
    const row = { party: r.party, product: r.product, date: r.date, receive_bag: +r.receive_bag || 0, return_bag: +r.return_bag || 0, remarks: r.remarks || null };
    const { error } = r.id ? await sb.from("rm_ledger").update(row).eq("id", r.id) : await sb.from("rm_ledger").insert({ ...row, entered_by: S.me.name }); if (error) throw error;
  },
  async rmLedgerDelete(id) { const { error } = await sb.from("rm_ledger").delete().eq("id", id); if (error) throw error; },
  async invLock(month) { const { error } = await sb.from("inv_locks").insert({ month, locked_by: S.me.name }); if (error && error.code !== "23505") throw error; },
  async invUnlock(month) { const { error } = await sb.from("inv_locks").delete().eq("month", month); if (error) throw error; }
});
/* demo: same rules as the database (role, lock, totals) so the UI behaves the same offline */
Object.assign(DemoAPI, {
  async ivStore() {
    if (!demoStore.inv) {
      let s = null; try { s = await (await fetch("dev/inv/inv_seed.json")).json(); } catch { }
      const st = { items: [], orders: [], demand: [], rmp: [{ code: "tamarind", name: "Tamarind Powder", bag_kg: 50, opening_date: "2026-09-30", opening_bag: 0, sort: 1, active: true }, { code: "wood", name: "Wood Powder", bag_kg: 40, opening_date: "2026-09-30", opening_bag: 0, sort: 2, active: true }], rmd: [], rml: [], locks: [] };
      if (s) Object.assign(st, { items: s.items, demand: s.demand, rmp: s.rmp, rmd: s.rmd, rml: s.rml.map(x => ({ id: crypto.randomUUID(), ...x })), orders: s.orders.map(o => { const { xl_value, xl_row, src, ...r } = o; return ivCalc({ id: crypto.randomUUID(), vehicle: null, rent: null, entered_by: "Excel import", created_at: o.date + "T09:00:00Z", ...r }); }) });
      demoStore.inv = st; this.save();
    }
    return demoStore.inv;
  },
  ivGuard(dates, staffOk = true) {
    const r = S.me.role; if (r === "boss" || (!staffOk && r !== "admin")) throw new Error("row-level security");
    const L = demoStore.inv.locks.map(x => x.month); if (dates.some(d => d && L.includes(ivMon(d)))) throw new Error("month_locked");
  },
  async ovdAll() {
    const s = demoStore.ovd ||= (() => { const P = (DPARTY || []).slice(0, 8), op = P.map((p, i) => ({ id: i + 1, party_name: p.name, party_id: p.id, opening: (i + 1) * 25000, note: i === 6 ? "NEW" : "", as_of: "2026-01-01" })); op.push({ id: 99, party_name: "Demo Unlinked Store-Test", party_id: null, opening: 12345, note: "", as_of: "2026-01-01" }); const sales = []; P.forEach((p, i) => { sales.push({ id: i * 2 + 1, sale_date: "2026-03-10", party_name: p.name, party_id: p.id, voucher_no: "D" + i, amount: 100000 + i * 5000 }, { id: i * 2 + 2, sale_date: "2026-11-10", party_name: p.name, party_id: p.id, voucher_no: "E" + i, amount: 40000 }); }); sales.push({ id: 999, sale_date: "2026-11-17", party_name: "Demo Unlinked Store-Test", party_id: null, voucher_no: "U1", amount: 5000 }); return { opening: op, sales }; })();
    return JSON.parse(JSON.stringify(s));
  },
  async ovdLink(name, pid) { const s = demoStore.ovd; this.ivGuard([], false); s.opening.forEach(o => { if (o.party_name === name) o.party_id = pid; }); s.sales.forEach(x => { if (x.party_name === name) x.party_id = pid; }); this.save(); },
  async invAll() { const s = await this.ivStore(); return JSON.parse(JSON.stringify(s)); },
  async invItemSave(it) {
    const s = await this.ivStore(); this.ivGuard([], false);
    if (s.items.some(x => x.id !== it.id && norm(x.name) === norm(it.name))) throw new Error(bi("এই নামে আইটেম আগেই আছে", "An item with this name already exists"));
    const row = { name: it.name, grp: it.grp || "coil", unit: it.unit || "ctn", rate_nir: it.rate_nir ?? null, rate_dist: it.rate_dist ?? null, in_nir: !!it.in_nir, in_dist: !!it.in_dist, sort: +it.sort || 100, active: it.active !== false };
    if (it.id) { const o = s.items.find(x => x.id === it.id); this.aud("inv_items", "update", "Item " + o.name, { ...o }, { ...o, ...row }); Object.assign(o, row); this.save(); return { ...o }; }
    const n = { id: Math.max(0, ...s.items.map(x => x.id)) + 1, ...row }; s.items.push(n); this.aud("inv_items", "insert", "Item " + n.name, null, n); this.save(); return { ...n };
  },
  async invItemDelete(id) {
    const s = await this.ivStore(); this.ivGuard([], false);
    if (s.orders.some(o => o.lines[id]) || s.demand.some(d => d.lines[id])) throw new Error(bi("এই আইটেম অর্ডারে ব্যবহার হয়েছে — মুছা যাবে না, নিষ্ক্রিয় করুন", "This item is used in orders — it cannot be deleted, deactivate it"));
    s.items = s.items.filter(x => x.id !== id); this.save();
  },
  async invOrderSave(o) {
    const s = await this.ivStore(), old = o.id ? s.orders.find(x => x.id === o.id) : null;
    this.ivGuard([o.date, old?.date]);
    if (old && S.me.role === "staff" && old.status === "cancel") throw new Error("policy");
    const row = ivCalc({ ch: o.ch, date: o.date, party: o.party || null, party_id: o.party_id || null, location: o.location || null, asm: o.asm || null, transport: o.transport || null, vehicle: o.vehicle || null, rent: o.rent === "" || o.rent == null ? null : +o.rent, lines: JSON.parse(JSON.stringify(o.lines)), free: o.free || null, remarks: o.remarks || null, status: o.status, delivery_date: o.delivery_date || null });
    const key = r => `${r.ch === "nir" ? "Niramoy" : "Order"} ${r.date} · ${r.party || r.transport || ""} · ${r.value} (${r.status})`;
    if (old) { this.aud("inv_orders", "update", key(row), { ...old }, { ...old, ...row }); Object.assign(old, row, { updated_at: new Date().toISOString() }); this.save(); return { ...old }; }
    const n = { id: crypto.randomUUID(), ...row, entered_by: S.me.name, created_at: new Date().toISOString() }; s.orders.push(n); this.aud("inv_orders", "insert", key(n), null, n); this.save(); return { ...n };
  },
  async invOrderStatus(ids, status, dd) {
    const s = await this.ivStore(), out = [];
    for (const id of ids) { const o = s.orders.find(x => x.id === id); if (!o) continue; this.ivGuard([o.date]); if (S.me.role === "staff" && o.status === "cancel") continue; const before = { ...o }; o.status = status; o.delivery_date = status === "ok" ? (dd || today()) : null; ivCalc(o); this.aud("inv_orders", "update", `Order ${o.date} · ${o.party || ""} (${status})`, before, { ...o }); out.push({ ...o }); }
    this.save(); return out;
  },
  async invLinkParty(name, loc, pid) { const s = await this.ivStore(); this.ivGuard([], false); const out = []; s.orders.forEach(o => { if (o.ch === "dist" && o.party === name && !o.party_id && (o.location || null) === (loc || null) && !s.locks.some(l => l.month === ivMon(o.date))) { o.party_id = pid; out.push({ ...o }); } }); this.save(); return out; },
  async invOrderDelete(id) { const s = await this.ivStore(), o = s.orders.find(x => x.id === id); this.ivGuard([o?.date], false); s.orders = s.orders.filter(x => x.id !== id); this.aud("inv_orders", "delete", `Order ${o.date} · ${o.party || o.transport || ""}`, o, null); this.save(); },
  async invDemandSave(ch, month, lines) { const s = await this.ivStore(); this.ivGuard([month]); const d = s.demand.find(x => x.ch === ch && x.month === month); if (d) d.lines = lines; else s.demand.push({ ch, month, lines }); this.aud("inv_demand", d ? "update" : "insert", `Demand ${ch} ${month}`, null, { ch, month, lines }); this.save(); },
  async rmProductSave(p) { const s = await this.ivStore(); this.ivGuard([], false); Object.assign(s.rmp.find(x => x.code === p.code), { name: p.name, bag_kg: +p.bag_kg, opening_date: p.opening_date, opening_bag: +p.opening_bag || 0 }); this.save(); },
  async rmDailySave(r) { const s = await this.ivStore(); this.ivGuard([r.date]); const o = s.rmd.find(x => x.date === r.date && x.product === r.product), row = { date: r.date, product: r.product, ready_bag: +r.ready_bag || 0, delivery_bag: +r.delivery_bag || 0, remarks: r.remarks || null }; if (o) Object.assign(o, row); else s.rmd.push(row); this.aud("rm_daily", o ? "update" : "insert", `RM ${r.product} ${r.date}`, null, row); this.save(); },
  async rmDailyDelete(date, product) { const s = await this.ivStore(); this.ivGuard([date], false); s.rmd = s.rmd.filter(x => !(x.date === date && x.product === product)); this.save(); },
  async rmLedgerSave(r) { const s = await this.ivStore(); this.ivGuard([r.date], !r.id); const row = { party: r.party, product: r.product, date: r.date, receive_bag: +r.receive_bag || 0, return_bag: +r.return_bag || 0, remarks: r.remarks || null }; if (r.id) Object.assign(s.rml.find(x => x.id === r.id), row); else s.rml.push({ id: crypto.randomUUID(), ...row }); this.save(); },
  async rmLedgerDelete(id) { const s = await this.ivStore(), o = s.rml.find(x => x.id === id); this.ivGuard([o?.date], false); s.rml = s.rml.filter(x => x.id !== id); this.save(); },
  async invLock(month) { const s = await this.ivStore(); this.ivGuard([], false); if (!s.locks.some(x => x.month === month)) s.locks.push({ month, locked_by: S.me.name, locked_at: new Date().toISOString() }); this.aud("inv_locks", "insert", "Lock " + month, null, { month }); this.save(); },
  async invUnlock(month) { const s = await this.ivStore(); if (S.me.role !== "admin") throw new Error("row-level security"); s.locks = s.locks.filter(x => x.month !== month); this.aud("inv_locks", "delete", "Lock " + month, { month }, null); this.save(); }
});

/* ---------- cache (shared by all five pages) ---------- */
let INV = null, INV_T = 0;
async function invLoad(force) {
  if (INV && !force && Date.now() - INV_T < 120000) return INV;
  const d = await API.invAll();
  d.items.sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100) || a.id - b.id);
  d.byId = Object.fromEntries(d.items.map(i => [String(i.id), i]));
  d.lockSet = new Set(d.locks.map(l => String(l.month).slice(0, 10)));
  INV = d; INV_T = Date.now(); return INV;
}
/* fast path: patch the cache with what the server returned instead of reloading everything */
function ivPut(rows) { (Array.isArray(rows) ? rows : [rows]).forEach(r => { const i = INV.orders.findIndex(o => o.id === r.id); if (i >= 0) INV.orders[i] = r; else INV.orders.push(r); }); }
const ivDrop = id => { INV.orders = INV.orders.filter(o => o.id !== id); };
/* show cached data at once; refresh quietly in the background when it is older than 15 s */
async function ivBoot(draw, fail) {
  if (INV) { draw(); if (Date.now() - INV_T > 15000) invLoad(true).then(() => draw()).catch(() => { }); return true; }
  try { await invLoad(); draw(); return true; } catch (e) { fail(e); return false; }
}
/* party master shared with Distribution Collection */
const ivParty = id => (typeof DPARTY !== "undefined" && DPARTY || []).find(p => p.id === id);
const ivPname = o => (o.party_id && ivParty(o.party_id)?.name) || o.party || "—";
/* collections cached per month range */
const IV_COL = {};
async function ivCols(f, t, force) { const k = f + "|" + t; if (!force && IV_COL[k] && Date.now() - IV_COL[k].t < 60000) return IV_COL[k].r; const r = await API.dcolRange(f, t); IV_COL[k] = { r, t: Date.now() }; return r; }
const ivColDrop = () => Object.keys(IV_COL).forEach(k => delete IV_COL[k]);
const ivLocked = d => !!(INV && d && INV.lockSet.has(ivMon(d)));
const ivItemName = id => INV?.byId[String(id)]?.name || `#${id}`;
const ivItemsFor = (ch, withIds = []) => INV.items.filter(i => (i.active !== false && (ch === "nir" ? i.in_nir : i.in_dist)) || withIds.includes(String(i.id)));
const ivDemandOf = (ch, month) => (INV.demand.find(d => d.ch === ch && String(d.month).slice(0, 10) === month) || {}).lines || {};

/* item-wise totals for a set of orders: {id: {ord, del, pend, val, dval}} */
function ivItemTotals(orders, f = "0000-01-01", t = "9999-12-31") {
  const T = {};
  orders.forEach(o => { if (o.status === "cancel") return; const dl = ivDelIn(o, f, t); for (const [k, l] of Object.entries(o.lines)) { const x = T[k] ||= { ord: 0, del: 0, pend: 0, val: 0, dval: 0 }; x.ord += +l.q; x.val += l.q * l.r; if (dl) { x.del += +l.q; x.dval += l.q * l.r; } else x.pend += +l.q; } });
  return T;
}
/* an order belongs to a period like a month file of the old workbook: ordered in it, delivered in it,
   or still open from an earlier month (carried over). Delivered = delivery date inside the period. */
const ivInPeriod = (o, f, t) => o.date <= t && (o.date >= f || (o.status === "ok" ? (o.delivery_date || o.date) >= f : o.status !== "cancel"));
const ivDelIn = (o, f, t) => o.status === "ok" && (o.delivery_date || o.date) >= f && (o.delivery_date || o.date) <= t;
const ivSum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);

/* RM stock: running balance per product from its opening; rows = [{date, ready, del, stock, remarks}] */
function rmLedgerRows(code, from, to) {
  const p = INV.rmp.find(x => x.code === code); if (!p) return { p: null, open: 0, rows: [] };
  const od = String(p.opening_date).slice(0, 10), days = INV.rmd.filter(x => x.product === code && String(x.date) > od).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let bal = +p.opening_bag || 0, open = null; const rows = [];
  for (const x of days) {
    const d = String(x.date).slice(0, 10); if (d < from && from) { bal += (+x.ready_bag || 0) - (+x.delivery_bag || 0); continue; }
    if (to && d > to) break; if (open === null) open = bal;
    bal += (+x.ready_bag || 0) - (+x.delivery_bag || 0); rows.push({ date: d, ready: +x.ready_bag || 0, del: +x.delivery_bag || 0, stock: bal, remarks: x.remarks || "" });
  }
  return { p, open: open === null ? bal : open, rows, close: bal };
}
const rmStockAt = (code, d) => { const r = rmLedgerRows(code, "", d); return r.close ?? r.open; };
/* AH Star Agro style ledger: running payable = Σ receive − Σ return */
function rmPartyRows(party) {
  let bal = 0; return INV.rml.filter(x => x.party === party).sort((a, b) => String(a.date).localeCompare(String(b.date))).map(x => { bal += (+x.receive_bag || 0) - (+x.return_bag || 0); return { ...x, date: String(x.date).slice(0, 10), bal }; });
}
function rmPatch(d, code, r, x, m) { INV.rmd = INV.rmd.filter(z => !(String(z.date).slice(0, 10) === d && z.product === code)); if (r || x || m) INV.rmd.push({ date: d, product: code, ready_bag: r, delivery_bag: x, remarks: m || null }); }
const rmParties = () => [...new Set(INV.rml.map(x => x.party))].sort();

/* ---------- shared UI pieces ---------- */
const ivCan = () => ({ admin: S.me.role === "admin", edit: S.me.role !== "boss" });
const ivDl = (id, vals) => `<datalist id="${id}">${[...new Set(vals.filter(Boolean))].sort().map(x => `<option value="${esc(x)}">`).join("")}</datalist>`;
const ivTile = (c, ic, lab, val, sub) => `<div class="kc iv-k" style="--kc:${c}"><span>${ico(ic)} ${lab}</span><div class="kv"><b class="num">${val}</b></div>${sub ? `<small class="mut">${sub}</small>` : ""}</div>`;
const ivSeg = (id, opts, cur) => `<div class="pbm iv-seg" id="${id}">${opts.map(([k, l]) => `<span class="chip ${k === cur ? "on" : ""}" data-k="${k}">${l}</span>`).join("")}</div>`;
const ivSegBind = (v, id, F, key, draw) => $$(`#${id} .chip`, v).forEach(c => c.onclick = () => { F[key] = c.dataset.k; $$(`#${id} .chip`, v).forEach(x => x.classList.toggle("on", x === c)); draw(); });
const ivLockNote = d => ivLocked(d) ? `<div class="alert am iv-lk">${ico("ivlock")} ${bi(`${ivMonName(d)} Lock করা — এই মাসে কিছু বদলানো যাবে না`, `${ivMonName(d)} is locked — nothing in this month can be changed`)}</div>` : "";
const ivEmpty = t => `<div class="empty iv-empty">${t}</div>`;

/* order / trip form (both channels) */
function ivOrderModal(ch, o, done) {
  const C = ivCan(), isNew = !o.id, cur = o.id ? { ...JSON.parse(JSON.stringify(o)), party: ivPname(o) } : { ch, date: today(), status: ch === "nir" ? "ok" : "pending", lines: {}, party: ch === "nir" ? "Niramoy Traders" : "", location: ch === "nir" ? "Naogaon" : "" };
  const staffLock = !isNew && S.me.role === "staff" && o.status === "cancel";
  const ro = !C.edit || staffLock || ivLocked(cur.date), used = Object.keys(cur.lines);
  const items = ivItemsFor(ch, used), rateOf = it => ch === "nir" ? it.rate_nir : it.rate_dist;
  const past = INV.orders.filter(x => x.ch === ch);
  const F2 = { q: "", only: !isNew };
  const fld = (id, lab, val, type = "text", extra = "") => `<div><label class="f">${lab}</label><input class="in" id="io-${id}" type="${type}" value="${esc(val ?? "")}" ${ro ? "disabled" : ""} ${extra}></div>`;
  const head2 = ch === "nir"
    ? fld("date", bi("তারিখ", "Date"), cur.date, "date") + fld("transport", bi("ট্রান্সপোর্ট", "Transport"), cur.transport, "text", `list="io-dl-tr"`) + fld("vehicle", bi("গাড়ির নম্বর", "Vehicle no."), cur.vehicle) + fld("rent", bi("ভাড়া (৳)", "Rent (৳)"), cur.rent, "number", `min="0" step="1"`)
    : fld("date", bi("অর্ডারের তারিখ", "Order date"), cur.date, "date") + fld("party", bi("পার্টি / দোকান", "Party / shop"), cur.party, "text", `list="io-dl-pa"`) + fld("location", bi("এলাকা", "Location"), cur.location, "text", `list="io-dl-lo"`) + fld("asm", "ASM / RSM", cur.asm, "text", `list="io-dl-asm"`) + fld("transport", bi("ট্রান্সপোর্ট", "Transport"), cur.transport, "text", `list="io-dl-tr"`);
  const stSel = `<div><label class="f">${bi("অবস্থা", "Status")}</label><select class="in" id="io-status" ${ro ? "disabled" : ""}>${Object.keys(IV_ST).map(k => `<option value="${k}" ${k === cur.status ? "selected" : ""}>${bi(IV_ST[k][0], IV_ST[k][1])}</option>`).join("")}</select></div><div id="io-ddw"><label class="f">${bi("ডেলিভারির তারিখ", "Delivery date")}</label><input class="in" id="io-dd" type="date" value="${cur.delivery_date || ""}" ${ro ? "disabled" : ""}></div>`;
  modal(`<h2>${ico(ch === "nir" ? "ivtruck" : "ivcart")} ${isNew ? bi(ch === "nir" ? "নতুন ট্রিপ — নিরাময়" : "নতুন অর্ডার — ডিস্ট্রিবিউশন", ch === "nir" ? "New trip — Niramoy" : "New order — Distribution") : bi(ch === "nir" ? "ট্রিপ" : "অর্ডার", ch === "nir" ? "Trip" : "Order") + " · " + dmy(cur.date)}</h2>
    ${ivLockNote(cur.date)}${staffLock ? `<div class="alert am">${bi("Cancel হওয়া অর্ডার শুধু admin বদলাতে পারেন", "Only an admin can change a cancelled order")}</div>` : ""}
    <div class="iv-fg">${head2}${stSel}</div>
    <div class="iv-lh"><b>${bi("পণ্য ও পরিমাণ", "Items & quantity")}</b><input class="in sm" id="io-q" placeholder="${bi("আইটেম খুঁজুন…", "Find item…")}"><label class="iv-chk"><input type="checkbox" id="io-only" ${F2.only ? "checked" : ""}> ${bi("শুধু পরিমাণ দেওয়া", "Only filled")}</label></div>
    ${!isNew && !ro ? `<div class="mut sm iv-eh">${bi("নতুন আইটেম যোগ: উপরে নাম খুঁজুন। আইটেম বাদ: পরিমাণ ০ বা খালি করুন। পরিমাণ বদল: ঘরে নতুন সংখ্যা দিন।", "Add an item: search its name above. Remove an item: clear its quantity or set 0. Change quantity: type the new number.")}</div>` : ""}
    <div class="iv-lines" id="io-lines"></div>
    <div class="iv-ltot" id="io-tot"></div>
    <div class="iv-fg two">${fld("free", bi("ফ্রি / অফার", "Free / offer"), cur.free)}${fld("remarks", bi("মন্তব্য", "Remarks"), cur.remarks)}</div>
    <div class="hint rd iv-err" id="io-e"></div>
    <div class="row iv-mb">${!isNew && C.admin && !ivLocked(cur.date) ? `<button class="btn rdo" id="io-del">${ico("trash")} ${bi("মুছুন", "Delete")}</button>` : ""}<div class="sp"></div><button class="btn" id="io-x">${bi("বন্ধ", "Close")}</button>${ro ? "" : `<button class="btn pri" id="io-s">${ico("check")} ${bi("সেভ", "Save")}</button>`}</div>
    ${ivDl("io-dl-tr", past.map(x => x.transport))}${ivDl("io-dl-pa", past.map(x => x.party).concat((typeof DPARTY !== "undefined" && DPARTY || []).map(p => p.name)))}${ivDl("io-dl-lo", past.map(x => x.location))}${ivDl("io-dl-asm", past.map(x => x.asm).concat((typeof DASM !== "undefined" ? DASM : []).map(a => a.name)))}`, (root, close) => {
    root.querySelector(".modal").classList.add("iv-modal");
    const e = m => $("#io-e", root).textContent = m || "";
    const lineVal = id => cur.lines[id] || { q: 0, r: rateOf(INV.byId[id]) ?? 0 };
    const tot = () => { let q = 0, val = 0; Object.values(cur.lines).forEach(l => { q += +l.q || 0; val += (+l.q || 0) * (+l.r || 0); }); $("#io-tot", root).innerHTML = `<span>${bi("মোট পরিমাণ", "Total qty")} <b class="num">${ivQ(q)}</b></span><span>${bi("মোট মূল্য", "Total value")} <b class="num">৳ ${money(Math.round(val * 100) / 100)}</b></span>`; };
    const lines = () => {
      const q = norm(F2.q), vis = items.filter(it => (!q || norm(it.name).includes(q)) && (q || !F2.only || +cur.lines[it.id]?.q));
      $("#io-lines", root).innerHTML = vis.length ? vis.map(it => { const l = lineVal(String(it.id)); return `<div class="iv-ln ${+l.q ? "has" : ""}" data-id="${it.id}"><span class="nm">${esc(it.name)}${it.active === false ? ` <i class="tag">${bi("নিষ্ক্রিয়", "inactive")}</i>` : ""}<small class="mut">${esc(it.unit || "ctn")}</small></span><input class="in num q" type="number" min="0" step="any" inputmode="decimal" value="${+l.q || ""}" placeholder="0" ${ro ? "disabled" : ""} aria-label="${esc(it.name)} qty"><input class="in num r" type="number" min="0" step="any" inputmode="decimal" value="${l.r ?? ""}" ${ro || !C.admin ? "disabled" : ""} title="${bi("রেট", "Rate")}" aria-label="${esc(it.name)} rate"><b class="num v">${+l.q ? money0(l.q * l.r) : ""}</b></div>`; }).join("") : `<div class="mut c" style="padding:14px">${bi("কোনো আইটেম নেই", "No items")}</div>`;
      $$(".iv-ln", root).forEach(row => { const id = row.dataset.id, qi = $(".q", row), ri = $(".r", row);
        const upd = () => { const qv = num(qi.value), rv = num(ri.value); if (qv > 0) cur.lines[id] = { q: qv, r: rv }; else delete cur.lines[id]; row.classList.toggle("has", qv > 0); $(".v", row).textContent = qv > 0 ? money0(qv * rv) : ""; tot(); };
        qi.oninput = upd; ri.oninput = upd; qi.onkeydown = ev => { if (ev.key === "Enter") { ev.preventDefault(); const nx = row.nextElementSibling; nx ? $(".q", nx).focus() : $("#io-s", root)?.focus(); } }; });
      tot();
    };
    lines();
    $("#io-q", root).oninput = ev => { F2.q = ev.target.value; lines(); };
    $("#io-only", root).onchange = ev => { F2.only = ev.target.checked; lines(); };
    const ddw = () => $("#io-ddw", root).classList.toggle("hide", $("#io-status", root).value !== "ok");
    $("#io-status", root).onchange = () => { if ($("#io-status", root).value === "ok" && !$("#io-dd", root).value) $("#io-dd", root).value = today(); ddw(); }; ddw();
    $("#io-x", root).onclick = close;
    const del = $("#io-del", root); if (del) del.onclick = async () => { if (!confirm(bi("এই রেকর্ড মুছে ফেলবেন?", "Delete this record?"))) return; try { await API.invOrderDelete(o.id); ivDrop(o.id); toast(bi("✔ মুছে ফেলা হয়েছে", "✔ Deleted")); close(); done && done(); } catch (x) { e(ivErr(x)); } };
    const sv = $("#io-s", root); if (sv) sv.onclick = async () => {
      const g = id => ($("#io-" + id, root)?.value || "").trim();
      const row = { ...cur, date: g("date"), transport: g("transport"), status: g("status"), delivery_date: g("status") === "ok" ? (g("dd") || today()) : null, free: g("free"), remarks: g("remarks") };
      if (ch === "nir") Object.assign(row, { vehicle: g("vehicle"), rent: g("rent") }); else Object.assign(row, { party: g("party"), location: g("location"), asm: g("asm") });
      if (!row.date) return e(bi("তারিখ দিন", "Enter the date"));
      if (ch === "dist" && !row.party) return e(bi("পার্টির নাম দিন", "Enter the party name"));
      if (ch === "nir" && !row.transport) return e(bi("ট্রান্সপোর্টের নাম দিন", "Enter the transport name"));
      if (!Object.keys(row.lines).length) return e(bi("অন্তত একটি আইটেমের পরিমাণ দিন", "Enter a quantity for at least one item"));
      if (row.delivery_date && row.delivery_date < row.date) return e(bi("ডেলিভারির তারিখ অর্ডারের আগে হতে পারে না", "Delivery date cannot be before the order date"));
      if (ivLocked(row.date)) return e(ivErr(new Error("month_locked")));
      sv.disabled = true; try { if (ch === "dist") { const P = (typeof DPARTY !== "undefined" && DPARTY || []).find(p => p.name === row.party); row.party_id = P ? P.id : (row.party === o.party ? o.party_id || null : null); } ivPut(await API.invOrderSave(row)); toast(bi("✔ সেভ হয়েছে", "✔ Saved")); close(); done && done(); } catch (x) { e(ivErr(x)); sv.disabled = false; }
    };
    setTimeout(() => (ch === "dist" && isNew ? $("#io-party", root) : $("#io-q", root))?.focus(), 50);
  });
}

/* product master (admin edits; others view) */
function ivItemsModal(done) {
  const C = ivCan(), G = { coil: bi("কয়েল", "Coil"), detergent: bi("ডিটারজেন্ট", "Detergent"), cleaner: bi("ক্লিনার", "Cleaner"), other: bi("অন্যান্য", "Other") };
  const list = () => `<div class="tw"><table class="iv-it"><thead><tr><th>${bi("আইটেম", "Item")}</th><th>${bi("গ্রুপ", "Group")}</th><th class="r">${bi("নিরাময় রেট", "Niramoy rate")}</th><th class="r">${bi("ডিস্ট্রি. রেট", "Dist. rate")}</th><th>${bi("কোথায়", "Used in")}</th>${C.admin ? "<th></th>" : ""}</tr></thead><tbody>${INV.items.map(i => `<tr class="${i.active === false ? "dim" : ""}"><td><b>${esc(i.name)}</b> <small class="mut">${esc(i.unit || "ctn")}</small></td><td>${G[i.grp] || i.grp}</td><td class="r num">${i.rate_nir != null ? money(i.rate_nir) : "—"}</td><td class="r num">${i.rate_dist != null ? money(i.rate_dist) : "—"}</td><td>${[i.in_nir ? bi("নিরাময়", "Niramoy") : "", i.in_dist ? bi("ডিস্ট্রি.", "Dist.") : ""].filter(Boolean).join(" · ") || "—"}${i.active === false ? ` · <i>${bi("নিষ্ক্রিয়", "inactive")}</i>` : ""}</td>${C.admin ? `<td class="r"><button class="btn sm" data-ie="${i.id}">${ico("edit")}</button></td>` : ""}</tr>`).join("")}</tbody></table></div>`;
  modal(`<h2>${ico("ivbox")} ${bi("আইটেম ও রেট", "Items & rates")} <span class="tag">${INV.items.length}</span></h2><div class="mut sm">${bi("রেট বদলালে শুধু নতুন অর্ডারে নতুন রেট বসবে — আগের অর্ডার নিজের রেটেই থাকবে।", "A rate change applies to new orders only — earlier orders keep their own rate.")}</div><div id="it-l">${list()}</div><div class="row iv-mb"><div class="sp"></div><button class="btn" id="it-x">${bi("বন্ধ", "Close")}</button>${C.admin ? `<button class="btn pri" id="it-n">${ico("plus")} ${bi("নতুন আইটেম", "New item")}</button>` : ""}</div>`, (root, close) => {
    root.querySelector(".modal").classList.add("iv-modal");
    $("#it-x", root).onclick = () => { close(); done && done(); };
    const edit = it => modal(`<h2>${it.id ? bi("আইটেম বদলান", "Edit item") : bi("নতুন আইটেম", "New item")}</h2><div class="iv-fg two">
        <div><label class="f">${bi("নাম", "Name")}</label><input class="in" id="ie-n" value="${esc(it.name || "")}"></div>
        <div><label class="f">${bi("গ্রুপ", "Group")}</label><select class="in" id="ie-g">${Object.entries(G).map(([k, l]) => `<option value="${k}" ${k === (it.grp || "coil") ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div><label class="f">${bi("নিরাময় রেট (৳)", "Niramoy rate (৳)")}</label><input class="in" id="ie-rn" type="number" min="0" step="any" value="${it.rate_nir ?? ""}"></div>
        <div><label class="f">${bi("ডিস্ট্রিবিউশন রেট (৳)", "Distribution rate (৳)")}</label><input class="in" id="ie-rd" type="number" min="0" step="any" value="${it.rate_dist ?? ""}"></div>
        <div><label class="f">${bi("একক", "Unit")}</label><input class="in" id="ie-u" value="${esc(it.unit || "ctn")}"></div>
        <div><label class="f">${bi("ক্রম", "Order")}</label><input class="in" id="ie-s" type="number" value="${it.sort ?? 100}"></div></div>
        <div class="iv-chks"><label class="iv-chk"><input type="checkbox" id="ie-in" ${it.in_nir ? "checked" : ""}> ${bi("নিরাময়ে দেখাবে", "Show in Niramoy")}</label><label class="iv-chk"><input type="checkbox" id="ie-id" ${it.in_dist ? "checked" : ""}> ${bi("ডিস্ট্রিবিউশনে দেখাবে", "Show in Distribution")}</label><label class="iv-chk"><input type="checkbox" id="ie-a" ${it.active !== false ? "checked" : ""}> ${bi("সক্রিয়", "Active")}</label></div>
        <div class="hint rd iv-err" id="ie-e"></div><div class="row iv-mb">${it.id ? `<button class="btn rdo" id="ie-d">${ico("trash")}</button>` : ""}<div class="sp"></div><button class="btn" id="ie-x">${bi("বাতিল", "Cancel")}</button><button class="btn pri" id="ie-ok">${bi("সেভ", "Save")}</button></div>`, (r2, c2) => {
      const back = () => ivItemsModal(done);
      $("#ie-x", r2).onclick = back;
      const d = $("#ie-d", r2); if (d) d.onclick = async () => { if (!confirm(bi("আইটেমটি মুছবেন?", "Delete this item?"))) return; try { await API.invItemDelete(it.id); await invLoad(true); back(); } catch (x) { $("#ie-e", r2).textContent = /foreign|23503|used/i.test(x.message) ? bi("এই আইটেম অর্ডারে ব্যবহার হয়েছে — মুছা যাবে না, নিষ্ক্রিয় করুন", "This item is used in orders — deactivate it instead") : ivErr(x); } };
      $("#ie-ok", r2).onclick = async () => {
        const g = id => $("#" + id, r2).value.trim(), nb = id => g(id) === "" ? null : num(g(id));
        const row = { id: it.id, name: g("ie-n"), grp: g("ie-g"), rate_nir: nb("ie-rn"), rate_dist: nb("ie-rd"), unit: g("ie-u") || "ctn", sort: num(g("ie-s")) || 100, in_nir: $("#ie-in", r2).checked, in_dist: $("#ie-id", r2).checked, active: $("#ie-a", r2).checked };
        if (!row.name) return $("#ie-e", r2).textContent = bi("নাম দিন", "Enter a name");
        try { await API.invItemSave(row); await invLoad(true); toast(bi("✔ সেভ হয়েছে", "✔ Saved")); back(); } catch (x) { $("#ie-e", r2).textContent = ivErr(x); }
      };
    });
    const n = $("#it-n", root); if (n) n.onclick = () => edit({});
    $$("[data-ie]", root).forEach(b => b.onclick = () => edit(INV.items.find(i => String(i.id) === b.dataset.ie)));
  });
}

/* monthly demand (target) per item */
function ivDemandModal(ch, month, done) {
  const C = ivCan(), cur = { ...ivDemandOf(ch, month) }, items = ivItemsFor(ch, Object.keys(cur)), ro = !C.edit || ivLocked(month);
  modal(`<h2>${bi("মাসের Demand", "Monthly demand")} · ${ivMonName(month)} · ${bi(...IV_CH[ch])}</h2>${ivLockNote(month)}
    <div class="iv-lines dm">${items.map(it => `<div class="iv-ln" data-id="${it.id}"><span class="nm">${esc(it.name)}</span><input class="in num q" type="number" min="0" step="any" inputmode="decimal" value="${cur[it.id] || ""}" placeholder="0" ${ro ? "disabled" : ""}></div>`).join("")}</div>
    <div class="iv-ltot" id="dm-t"></div><div class="hint rd iv-err" id="dm-e"></div>
    <div class="row iv-mb"><div class="sp"></div><button class="btn" id="dm-x">${bi("বন্ধ", "Close")}</button>${ro ? "" : `<button class="btn pri" id="dm-s">${bi("সেভ", "Save")}</button>`}</div>`, (root, close) => {
    root.querySelector(".modal").classList.add("iv-modal");
    const t = () => $("#dm-t", root).innerHTML = `<span>${bi("মোট Demand", "Total demand")} <b class="num">${ivQ(Object.values(cur).reduce((a, b) => a + (+b || 0), 0))}</b></span>`; t();
    $$(".iv-ln .q", root).forEach(i => i.oninput = () => { const id = i.closest(".iv-ln").dataset.id, q = num(i.value); if (q > 0) cur[id] = q; else delete cur[id]; t(); });
    $("#dm-x", root).onclick = close;
    const s = $("#dm-s", root); if (s) s.onclick = async () => { try { await API.invDemandSave(ch, month, cur); await invLoad(true); toast(bi("✔ Demand সেভ হয়েছে", "✔ Demand saved")); close(); done && done(); } catch (x) { $("#dm-e", root).textContent = ivErr(x); } };
  });
}

/* =================== Niramoy + Distribution pages (one engine) =================== */
const vInvNir = v => ivOrdersPage(v, "nir");
const vInvDist = v => ivOrdersPage(v, "dist");
async function ivOrdersPage(v, ch) {
  const C = ivCan(), nir = ch === "nir", K = "iv" + ch;
  let m0 = "ent"; try { m0 = sessionStorage.getItem("ivm_" + ch) || "ent"; } catch { }
  const F = Object.assign(pbInit("month"), { q: "", st: "", asm: "", tab: "list", sel: new Set(), mode: m0 });
  v.innerHTML = head(ROUTES[CUR].t, `<button class="btn" id="${K}-it">${ico("ivbox")} ${bi("আইটেম ও রেট", "Items & rates")}</button><button class="btn" id="${K}-dm">${ico("flag")} Demand</button><button class="btn" id="${K}-xl">${ico("dl")} Excel</button>${!nir && C.admin ? `<button class="btn" id="${K}-mt">${ico("users")} ${bi("পার্টি মেলান", "Match parties")}</button>` : ""}`) +
    ivSeg(K + "-mode", [["ent", nir ? bi("ট্রিপ এন্ট্রি", "Trip entry") : bi("অর্ডার এন্ট্রি", "Order entry")], ["lst", bi("তালিকা ও হিসাব", "List & totals")], ...(nir ? [] : [["led", bi("অর্ডার বনাম ডেলিভারি", "Order vs Delivery")]])], F.mode) +
    `<div id="${K}-ent" class="iv-mode"></div><div id="${K}-lst" class="iv-mode hide"><div class="card tbar noprint">${pbBar(K + "pb", F, { all: true })}<div class="row pflt iv-flt"><div class="pq"><label class="f">${bi("খুঁজুন", "Search")}</label><input class="in" id="${K}-q" placeholder="${nir ? bi("ট্রান্সপোর্ট, গাড়ি, আইটেম…", "Transport, vehicle, item…") : bi("পার্টি, এলাকা, ASM, আইটেম…", "Party, location, ASM, item…")}"></div><div><label class="f">${bi("অবস্থা", "Status")}</label><select class="in" id="${K}-st"><option value="">${bi("সব", "All")}</option><option value="open">${bi("Pending + আজ যাবে", "Pending + Today")}</option>${Object.keys(IV_ST).map(k => `<option value="${k}">${bi(IV_ST[k][0], IV_ST[k][1])}</option>`).join("")}</select></div>${nir ? "" : `<div><label class="f">ASM / RSM</label><select class="in" id="${K}-asm"></select></div>`}</div></div>
    <div id="${K}-lk"></div><div class="ksum iv-ks" id="${K}-kpi"></div>
    ${ivSeg(K + "-tab", [["list", nir ? bi("ট্রিপ তালিকা", "Trips") : bi("অর্ডার তালিকা", "Orders")], ["item", bi("আইটেম অনুযায়ী", "By item")], ...(nir ? [["tr", bi("ট্রান্সপোর্ট অনুযায়ী", "By transport")]] : [["party", bi("পার্টি অনুযায়ী", "By party")], ["asm", bi("ASM অনুযায়ী", "By ASM")]])], F.tab)}
    <div class="card flush"><div class="ch"><h3 id="${K}-h"></h3><span class="tag" id="${K}-cnt">0</span><div class="sp"></div><div id="${K}-bulk" class="iv-bulk hide"></div></div><div id="${K}-out"></div></div></div>${nir ? "" : `<div id="${K}-led" class="iv-mode hide"></div>`}`;
  const out = $(`#${K}-out`, v);
  try { await invLoad(); } catch (e) { out.innerHTML = `<div class="alert rd" style="margin:12px">${esc(ivErr(e))}</div>`; return; }
  const range = () => pbRange(F);
  function rows() {
    const [f, t] = range(), q = norm(F.q);
    return INV.orders.filter(o => o.ch === ch && ivInPeriod(o, f, t)
      && (!F.st || (F.st === "open" ? ["pending", "today"].includes(o.status) : o.status === F.st))
      && (!F.asm || (F.asm === "__none" ? !o.asm : o.asm === F.asm))
      && (!q || norm([o.party, o.location, o.asm, o.transport, o.vehicle, o.free, o.remarks, ...Object.keys(o.lines).map(ivItemName)].join(" ")).includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }
  function kpi(list) {
    const [f, t] = range(), live = list.filter(o => o.status !== "cancel"), ok = live.filter(o => ivDelIn(o, f, t)), op = live.filter(o => !ivDelIn(o, f, t)), carry = live.filter(o => o.date < f).length;
    const months = F.m === "month" ? [ivMon(f)] : [];
    const dem = months.reduce((s, m) => s + Object.values(ivDemandOf(ch, m)).reduce((a, b) => a + (+b || 0), 0), 0);
    const tq = ivSum(live, o => o.total_qty), oq = ivSum(ok, o => o.total_qty), pq = ivSum(op, o => o.total_qty);
    $(`#${K}-kpi`, v).innerHTML = (dem ? ivTile("#7c3aed", "flag", "Demand", ivQ(dem), `${bi("অর্ডার বাকি", "Still to order")}: ${ivQ(dem - tq)}${dem - tq < 0 ? " · " + bi("বেশি অর্ডার", "over-ordered") : ""}`) : "")
      + ivTile("#4f46e5", nir ? "ivtruck" : "ivcart", nir ? bi("মোট ট্রিপ", "Trips") : bi("মোট অর্ডার", "Orders"), live.length, `${bi("পরিমাণ", "Qty")} ${ivQ(tq)} · ৳ ${money0(ivSum(live, o => o.value))}${carry ? ` · ${bi("আগের মাসের", "carried over")} ${carry}` : ""}`)
      + ivTile("#059669", "check", bi("ডেলিভারি হয়েছে", "Delivered"), ivQ(oq), `৳ ${money0(ivSum(ok, o => o.value))} · ${ok.length} ${nir ? bi("ট্রিপ", "trips") : bi("অর্ডার", "orders")}`)
      + (nir ? ivTile("#0ea5e9", "ivtruck", bi("মোট ভাড়া", "Total rent"), "৳ " + money0(ivSum(live, o => o.rent)), oq ? `${bi("প্রতি ctn", "Per ctn")} ৳ ${(ivSum(live, o => o.rent) / tq).toFixed(2)}` : "")
        : ivTile("#d97706", "clock", bi("ডেলিভারি বাকি", "Pending delivery"), ivQ(pq), `৳ ${money0(ivSum(op, o => o.value))} · ${op.length} ${bi("অর্ডার", "orders")}`))
      + (list.length - live.length ? ivTile("#dc2626", "x", "Cancel", list.length - live.length, "৳ " + money0(ivSum(list.filter(o => o.status === "cancel"), o => o.value))) : "");
  }
  const dd = o => o.status === "ok" ? (o.delivery_date ? dmy(o.delivery_date) : "—") : o.status === "cancel" ? "—" : `<span class="iv-age ${ivDays(o.date, today()) > 7 ? "late" : ""}">${ivDays(o.date, today())} ${bi("দিন", "days")}</span>`;
  const itemsTxt = o => Object.entries(o.lines).map(([k, l]) => `${esc(ivItemName(k))} <b class="num">${ivQ(l.q)}</b>`).join(" · ");
  function table(list) {
    const can = C.edit, chk = o => can && (C.admin || o.status !== "cancel") && !ivLocked(o.date);
    const tq = ivSum(list.filter(o => o.status !== "cancel"), o => o.total_qty), tv = ivSum(list.filter(o => o.status !== "cancel"), o => o.value);
    return `<div class="tw cards"><table class="iv-ot"><thead><tr>${can && !nir ? `<th class="noprint c"><input type="checkbox" id="${K}-all" aria-label="all"></th>` : ""}<th>${bi("তারিখ", "Date")}</th>${nir ? `<th>${bi("ট্রান্সপোর্ট", "Transport")}</th><th>${bi("গাড়ি", "Vehicle")}</th><th class="r">${bi("ভাড়া", "Rent")}</th>` : `<th>${bi("পার্টি", "Party")}</th><th>ASM</th>`}<th>${bi("আইটেম", "Items")}</th><th class="r">${bi("পরিমাণ", "Qty")}</th><th class="r">${bi("মূল্য ৳", "Value ৳")}</th><th>${bi("অবস্থা", "Status")}</th><th>${bi("ডেলিভারি", "Delivery")}</th><th class="noprint"></th></tr></thead><tbody>${list.map(o => `<tr class="${o.status === "cancel" ? "dim" : ""}">${can && !nir ? `<td class="noprint c">${chk(o) ? `<input type="checkbox" data-sel="${o.id}" ${F.sel.has(o.id) ? "checked" : ""}>` : ""}</td>` : ""}<td class="nw">${dmy(o.date)}${ivLocked(o.date) ? ` <span title="Locked">${ico("ivlock").replace("<svg", '<svg width="12" height="12"')}</span>` : ""}</td>${nir ? `<td><b>${esc(o.transport || "—")}</b></td><td class="nw">${esc(o.vehicle || "—")}</td><td class="r num">${o.rent ? money0(o.rent) : "—"}</td>` : `<td><b>${esc(ivPname(o))}</b>${o.party_id ? "" : ` <i class="iv-nl" title="${bi("কালেকশনের পার্টির সাথে মেলানো নেই", "Not linked to a collection party")}">!</i>`}${o.location || o.transport ? `<div class="mut xs">${esc([o.location, o.transport].filter(Boolean).join(" · "))}</div>` : ""}</td><td class="nw">${esc(o.asm || "—")}</td>`}<td class="iv-its">${itemsTxt(o)}${o.free ? `<div class="mut xs">${bi("ফ্রি", "Free")}: ${esc(o.free)}</div>` : ""}${o.remarks ? `<div class="mut xs">${esc(o.remarks)}</div>` : ""}</td><td class="r num b">${ivQ(o.total_qty)}</td><td class="r num">${money0(o.value)}</td><td>${ivSt(o.status)}</td><td class="nw">${dd(o)}</td><td class="r noprint"><button class="btn sm" data-ed="${o.id}" title="${bi("খুলুন", "Open")}">${ico(chk(o) || C.admin ? "edit" : "list")}</button></td></tr>`).join("")}</tbody>
      <tfoot><tr class="tot">${can && !nir ? "<td class='noprint'></td>" : ""}<td colspan="${nir ? 3 : 2}">${bi("মোট (Cancel বাদে)", "Total (excl. cancelled)")}</td>${nir ? `<td class="r num">${money0(ivSum(list.filter(o => o.status !== "cancel"), o => o.rent))}</td>` : ""}<td></td><td class="r num">${ivQ(tq)}</td><td class="r num">${money0(tv)}</td><td colspan="3"></td></tr></tfoot></table></div>`;
  }
  function byItem(list) {
    const [f, t0] = range(), dm = F.m === "month" ? ivDemandOf(ch, ivMon(f)) : {}, t = ivItemTotals(list, f, t0);
    const ids = [...new Set([...Object.keys(t), ...Object.keys(dm)])].sort((a, b) => (INV.byId[a]?.sort ?? 100) - (INV.byId[b]?.sort ?? 100) || a - b);
    const S2 = k => ids.reduce((s, id) => s + (k === "dem" ? +dm[id] || 0 : t[id]?.[k] || 0), 0);
    return ids.length ? `<div class="tw cards"><table class="iv-mt"><thead><tr><th>${bi("আইটেম", "Item")}</th>${F.m === "month" ? `<th class="r">Demand</th><th class="r">${bi("অর্ডার বাকি", "To order")}</th>` : ""}<th class="r">${bi("মোট অর্ডার", "Ordered")}</th><th class="r">${bi("ডেলিভারি", "Delivered")}</th><th class="r">${bi("ডেলিভারি বাকি", "Pending")}</th><th class="r">${bi("ডেলিভারি মূল্য ৳", "Delivered ৳")}</th></tr></thead><tbody>${ids.map(id => { const x = t[id] || { ord: 0, del: 0, pend: 0, dval: 0 }, d = +dm[id] || 0, po = d - x.ord; return `<tr><td><b>${esc(ivItemName(id))}</b></td>${F.m === "month" ? `<td class="r num">${d ? ivQ(d) : "—"}</td><td class="r num ${po < 0 ? "iv-over" : ""}" ${po < 0 ? `title="${bi("Demand-এর চেয়ে বেশি অর্ডার", "Ordered more than demand")}"` : ""}>${d ? ivQ(po) : "—"}</td>` : ""}<td class="r num">${ivQ(x.ord)}</td><td class="r num">${ivQ(x.del)}</td><td class="r num ${x.pend ? "b" : "z"}">${ivQ(x.pend)}</td><td class="r num">${money0(x.dval)}</td></tr>`; }).join("")}</tbody><tfoot><tr class="tot"><td>${bi("মোট", "Total")}</td>${F.m === "month" ? `<td class="r num">${ivQ(S2("dem"))}</td><td class="r num">${ivQ(S2("dem") - S2("ord"))}</td>` : ""}<td class="r num">${ivQ(S2("ord"))}</td><td class="r num">${ivQ(S2("del"))}</td><td class="r num">${ivQ(S2("pend"))}</td><td class="r num">${money0(S2("dval"))}</td></tr></tfoot></table></div>` : ivEmpty(bi("এই সময়ে কিছু নেই", "Nothing in this period"));
  }
  function byKey(list, key, lab) {
    const [f, t] = range(), g = {}; list.filter(o => o.status !== "cancel").forEach(o => { const k = (key === "party" ? ivPname(o) : o[key]) || "—", x = g[k] ||= { n: 0, q: 0, v: 0, dq: 0, dv: 0, pq: 0, rent: 0, last: "" }; x.n++; x.q += o.total_qty; x.v += o.value; x.rent += +o.rent || 0; if (ivDelIn(o, f, t)) { x.dq += o.total_qty; x.dv += o.value; } else x.pq += o.total_qty; if (o.date > x.last) x.last = o.date; });
    const ks = Object.keys(g).sort((a, b) => g[b].v - g[a].v);
    return ks.length ? `<div class="tw cards"><table class="iv-mt"><thead><tr><th>${lab}</th><th class="r">${nir ? bi("ট্রিপ", "Trips") : bi("অর্ডার", "Orders")}</th><th class="r">${bi("পরিমাণ", "Qty")}</th><th class="r">${bi("মূল্য ৳", "Value ৳")}</th><th class="r">${nir ? bi("ভাড়া ৳", "Rent ৳") : bi("ডেলিভারি বাকি", "Pending")}</th><th>${bi("শেষ", "Last")}</th></tr></thead><tbody>${ks.map(k => { const x = g[k]; return `<tr><td><b>${esc(k)}</b></td><td class="r num">${x.n}</td><td class="r num">${ivQ(x.q)}</td><td class="r num">${money0(x.v)}</td><td class="r num ${!nir && x.pq ? "b" : ""}">${nir ? money0(x.rent) : ivQ(x.pq)}</td><td class="nw">${dmy(x.last)}</td></tr>`; }).join("")}</tbody></table></div>` : ivEmpty(bi("এই সময়ে কিছু নেই", "Nothing in this period"));
  }
  function bulkBar() {
    const b = $(`#${K}-bulk`, v); if (!b) return; const n = F.sel.size; b.classList.toggle("hide", !n);
    b.innerHTML = n ? `<span class="mut sm">${n} ${bi("টি বাছাই", "selected")}</span><input class="in sm" type="date" id="${K}-bd" value="${today()}" title="${bi("ডেলিভারির তারিখ", "Delivery date")}"><button class="btn sm pri" data-bs="ok">${ico("check")} Delivered</button><button class="btn sm" data-bs="today">${bi("আজ যাবে", "Today")}</button><button class="btn sm" data-bs="pending">Pending</button>` : "";
    $$("[data-bs]", b).forEach(x => x.onclick = async () => { const st = x.dataset.bs; try { const r = await API.invOrderStatus([...F.sel], st, $(`#${K}-bd`, v)?.value || today()); F.sel.clear(); ivPut(r); toast(bi(`✔ ${r.length}টি অর্ডার আপডেট হয়েছে`, `✔ ${r.length} orders updated`)); draw(); } catch (e) { toast(ivErr(e), "err"); } });
  }
  function draw() {
    const list = rows(), [f, t] = range();
    $(`#${K}-lk`, v).innerHTML = F.m === "month" ? ivLockNote(f) : "";
    if (!nir) { const a = $(`#${K}-asm`, v), as = [...new Set(INV.orders.filter(o => o.ch === ch && o.asm).map(o => o.asm))].sort(); a.innerHTML = `<option value="">${bi("সব", "All")}</option><option value="__none" ${F.asm === "__none" ? "selected" : ""}>${bi("ASM নেই", "No ASM")}</option>` + as.map(x => `<option ${x === F.asm ? "selected" : ""}>${esc(x)}</option>`).join(""); }
    kpi(list);
    const T = { list: [nir ? bi("ট্রিপ", "Trips") : bi("অর্ডার", "Orders"), list.length], item: [bi("আইটেম অনুযায়ী", "By item"), Object.keys(ivItemTotals(list)).length], party: [bi("পার্টি অনুযায়ী", "By party"), new Set(list.map(o => o.party)).size], asm: [bi("ASM অনুযায়ী", "By ASM"), new Set(list.map(o => o.asm)).size], tr: [bi("ট্রান্সপোর্ট অনুযায়ী", "By transport"), new Set(list.map(o => o.transport)).size] }[F.tab];
    $(`#${K}-h`, v).textContent = T[0] + (F.m === "all" ? "" : ` · ${dcRangeLabel(f, t)}`); $(`#${K}-cnt`, v).textContent = T[1];
    out.innerHTML = F.tab === "item" ? byItem(list) : F.tab === "party" ? byKey(list, "party", bi("পার্টি", "Party")) : F.tab === "asm" ? byKey(list, "asm", "ASM / RSM") : F.tab === "tr" ? byKey(list, "transport", bi("ট্রান্সপোর্ট", "Transport"))
      : list.length ? table(list) : ivEmpty(F.q || F.st || F.asm ? bi("ফিল্টারে কিছু মেলেনি", "Nothing matches the filters") : bi("এই সময়ে কোনো রেকর্ড নেই", "No records in this period") + (C.edit ? `<div style="margin-top:10px"><button class="btn pri" id="${K}-new2">${ico("plus")} ${nir ? bi("নতুন ট্রিপ", "New trip") : bi("নতুন অর্ডার", "New order")}</button></div>` : ""));
    labelTables(out);
    $$("[data-ed]", out).forEach(b => b.onclick = () => ivOrderModal(ch, INV.orders.find(o => o.id === b.dataset.ed), draw));
    $$("[data-sel]", out).forEach(c => c.onchange = () => { c.checked ? F.sel.add(c.dataset.sel) : F.sel.delete(c.dataset.sel); bulkBar(); });
    const all = $(`#${K}-all`, out); if (all) all.onchange = () => { $$("[data-sel]", out).forEach(c => { c.checked = all.checked; all.checked ? F.sel.add(c.dataset.sel) : F.sel.delete(c.dataset.sel); }); bulkBar(); };
    const n2 = $(`#${K}-new2`, out); if (n2) n2.onclick = () => ivOrderModal(ch, {}, draw);
    bulkBar();
  }
  pbBind(v, K + "pb", F, () => { F.sel.clear(); draw(); }, { all: true });
  ivSegBind(v, K + "-tab", F, "tab", draw);
  $(`#${K}-q`, v).oninput = e => { F.q = e.target.value; draw(); };
  $(`#${K}-st`, v).onchange = e => { F.st = e.target.value; F.sel.clear(); draw(); };
  if (!nir) $(`#${K}-asm`, v).onchange = e => { F.asm = e.target.value; draw(); };
  const nw = $(`#${K}-new`, v); if (nw) nw.onclick = () => ivOrderModal(ch, {}, draw);
  $(`#${K}-it`, v).onclick = () => ivItemsModal(draw);
  $(`#${K}-dm`, v).onclick = () => ivDemandModal(ch, ivMon(F.m === "month" || F.m === "day" || F.m === "week" ? range()[0] : today()), draw);
  $(`#${K}-xl`, v).onclick = () => ivExportOrders(ch, rows(), range());
  const ent = ivEntry($(`#${K}-ent`, v), ch, () => { if (F.mode === "lst") draw(); }), led = nir ? null : ivLedger($(`#${K}-led`, v));
  const MD = { ent: () => ent.draw(), lst: draw, led: () => led && led.draw() };
  const setMode = m => { F.mode = MD[m] ? m : "ent"; try { sessionStorage.setItem("ivm_" + ch, F.mode); } catch { } ["ent", "lst", "led"].forEach(x => $(`#${K}-${x}`, v)?.classList.toggle("hide", x !== F.mode)); MD[F.mode](); };
  ivSegBind(v, K + "-mode", F, "mode", () => setMode(F.mode));
  const mt = $(`#${K}-mt`, v); if (mt) mt.onclick = () => ivMatchModal(() => MD[F.mode]());
  setMode(F.mode);
  if (Date.now() - INV_T > 15000) invLoad(true).then(() => $(`#${K}-ent`, v) && MD[F.mode]()).catch(() => { });
}
/* =================== fast keyboard entry (same flow as Collection Entry) ===================
   Distribution: Party → Item → Qty ⏎ → Item → Qty ⏎ … → empty Item ⏎ (or Ctrl+Enter) = Save
   Niramoy:      Transport → Vehicle → Rent → Item → Qty ⏎ … → Save */
function ivEntry(box, ch, changed) {
  const C = ivCan(), nir = ch === "nir", K = "ie" + ch;
  let date = today(), cart = [], party = null, busy = false, showOpen = false, q = "", sel = new Set();
  const rateOf = it => nir ? it.rate_nir : it.rate_dist;
  box.innerHTML = `<div class="card tbar dcx-bar"><div class="dcx-date">${dateNav(K, date)}</div><div class="dcx-stats" id="${K}-kpi"></div></div>
   <div class="dcx-split iv-split">
    ${C.edit ? `<div class="card dcx-entry iv-ent"><div class="dcx-et"><h3>${ico("plus")} ${nir ? bi("নতুন ট্রিপ", "New trip") : bi("নতুন অর্ডার", "New order")}</h3><span class="mut xs">${nir ? bi("Enter চাপুন: ট্রান্সপোর্ট → গাড়ি → ভাড়া → আইটেম → পরিমাণ ⏎ … খালি আইটেমে ⏎ = সেভ", "Press Enter: Transport → Vehicle → Rent → Item → Qty ⏎ … Enter on an empty item = Save") : bi("Enter চাপুন: পার্টি → আইটেম → পরিমাণ ⏎ … খালি আইটেমে ⏎ = সেভ · Ctrl+Enter = সেভ", "Press Enter: Party → Item → Qty ⏎ … Enter on an empty item = Save · Ctrl+Enter = Save")}</span></div>
     <div class="iv-eg ${nir ? "nir" : "dist"}">
      ${nir ? `<div class="g-tr"><label class="f">${bi("ট্রান্সপোর্ট", "Transport")} *</label><input class="in big" id="${K}-tr" list="${K}-dtr" autocomplete="off"></div>
       <div class="g-vh"><label class="f">${bi("গাড়ির নম্বর", "Vehicle no.")}</label><input class="in" id="${K}-vh" list="${K}-dvh" autocomplete="off"></div>
       <div class="g-rt"><label class="f">${bi("ভাড়া ৳", "Rent ৳")}</label><input class="in num" id="${K}-rt" inputmode="decimal" autocomplete="off" placeholder="0"></div>`
      : `<div class="g-pt"><label class="f">${bi("পার্টি", "Party")} *</label><div><input class="in big" id="${K}-pt" autocomplete="off" placeholder="${bi("পার্টির নাম লিখুন…", "Type the party name…")}"></div><div class="dcx-h" id="${K}-ph"></div></div>
       <div class="g-as"><label class="f">ASM / RSM</label><input class="in" id="${K}-as" list="${K}-das" autocomplete="off" placeholder="${bi("অটো বসবে", "Auto")}"></div>
       <div class="g-tr"><label class="f">${bi("ট্রান্সপোর্ট", "Transport")}</label><input class="in" id="${K}-tr" list="${K}-dtr" autocomplete="off"></div>`}
      <div class="g-it"><label class="f">${bi("আইটেম", "Item")}</label><div><input class="in big" id="${K}-it" autocomplete="off" placeholder="${bi("যেমন jambo 30, mega…", "e.g. jambo 30, mega…")}"></div></div>
      <div class="g-qt"><label class="f">${bi("পরিমাণ (ctn)", "Qty (ctn)")}</label><input class="in big num" id="${K}-qt" inputmode="decimal" autocomplete="off" placeholder="0"></div>
      <div class="g-ad"><label class="f">&nbsp;</label><button class="btn big" type="button" id="${K}-ad" title="${bi("লাইনে যোগ", "Add line")}">${ico("plus")}</button></div>
     </div>
     <div class="iv-cart" id="${K}-cart"></div>
     <div class="iv-eg2"><div class="iv-sts" id="${K}-st"></div><input class="in" id="${K}-rm" autocomplete="off" placeholder="${bi("মন্তব্য / ফ্রি অফার (ঐচ্ছিক)", "Remarks / free offer (optional)")}"></div>
     <div class="dcx-b iv-b"><button class="btn big" type="button" id="${K}-cl">${ico("x")} ${bi("পরিষ্কার", "Clear")}</button><button class="btn pri big" type="button" id="${K}-sv">${ico("check")} ${bi("সেভ করুন", "Save")}</button></div>
     <div class="hint rd" id="${K}-er" style="min-height:0;margin-top:8px"></div>
     <datalist id="${K}-dtr"></datalist><datalist id="${K}-dvh"></datalist><datalist id="${K}-das"></datalist></div>` : ""}
    <div class="card flush dcx-list"><div class="ch"><h3 id="${K}-lh"></h3><span class="tag" id="${K}-cnt">0</span><div class="sp"></div><label class="iv-chk sm"><input type="checkbox" id="${K}-op"> ${bi("সব খোলা অর্ডার", "All open orders")}</label></div>
     <div class="noprint dcx-tools">${searchBox(K + "-q", nir ? bi("খুঁজুন — ট্রান্সপোর্ট, গাড়ি, আইটেম…", "Search — transport, vehicle, item…") : bi("খুঁজুন — পার্টি, ASM, আইটেম…", "Search — party, ASM, item…"))}</div>
     <div id="${K}-ls"></div></div></div><div id="${K}-sb" class="selbar hide"></div>`;
  const $b = id => $(`#${K}-${id}`, box), err = m => { const e = $b("er"); if (e) e.textContent = m || ""; };
  let st = nir ? "ok" : "pending";
  const stBar = () => { const e = $b("st"); if (!e) return; e.innerHTML = ["pending", "today", "ok"].map(k => `<span class="chip ${k === st ? "on" : ""}" data-s="${k}">${bi(IV_ST[k][0], IV_ST[k][1])}</span>`).join(""); $$("[data-s]", e).forEach(c => c.onclick = () => { st = c.dataset.s; stBar(); }); };
  const lines = () => Object.fromEntries(cart.map(l => [String(l.id), { q: l.q, r: l.r }]));
  function drawCart() {
    const e = $b("cart"); if (!e) return; const tq = ivSum(cart, l => l.q), tv = ivSum(cart, l => l.q * l.r);
    e.innerHTML = cart.length ? `<div class="iv-cl">${cart.map((l, i) => `<div class="iv-cr"><span class="nm">${esc(ivItemName(l.id))}</span><input class="in num" data-cq="${i}" value="${l.q}" inputmode="decimal" aria-label="qty"><span class="rt">× ${C.admin ? `<input class="in num" data-cr="${i}" value="${l.r}" inputmode="decimal" aria-label="rate">` : money(l.r)}</span><b class="num">${money0(l.q * l.r)}</b><button class="btn sm" data-cx="${i}" title="${bi("বাদ দিন", "Remove")}">${ico("x")}</button></div>`).join("")}</div><div class="iv-ltot"><span>${cart.length} ${bi("আইটেম", "items")}</span><span>${bi("মোট", "Total")} <b class="num">${ivQ(tq)}</b> ctn</span><span>৳ <b class="num">${money(Math.round(tv * 100) / 100)}</b></span></div>`
      : `<div class="iv-ce mut sm">${bi("এখনো কোনো আইটেম নেই — আইটেম ও পরিমাণ লিখে Enter চাপুন", "No items yet — type an item and quantity, then press Enter")}</div>`;
    $$("[data-cq]", e).forEach(x => x.onchange = () => { const n = evalAmt(x.value); if (isNaN(n) || n <= 0) cart.splice(+x.dataset.cq, 1); else cart[+x.dataset.cq].q = n; drawCart(); });
    $$("[data-cr]", e).forEach(x => x.onchange = () => { const n = evalAmt(x.value); if (!isNaN(n) && n >= 0) cart[+x.dataset.cr].r = n; drawCart(); });
    $$("[data-cx]", e).forEach(x => x.onclick = () => { cart.splice(+x.dataset.cx, 1); drawCart(); $b("it")?.focus(); });
  }
  /* ---- pickers ---- */
  let pPick = null, iPick = null;
  const pIn = $b("pt"), aIn = $b("as"), tIn = $b("tr"), vIn = $b("vh"), rIn = $b("rt"), iIn = $b("it"), qIn = $b("qt");
  function partyInfo(p) {
    if (!p) return ""; const mine = INV.orders.filter(o => o.ch === "dist" && o.party_id === p.id), open = mine.filter(o => ["pending", "today"].includes(o.status));
    const m1 = ivMon(date), m2 = ivMonEnd(m1), dl = ivSum(mine.filter(o => ivDelIn(o, m1, m2)), o => o.value), last = mine.map(o => o.date).sort().at(-1);
    const cols = (IV_COL[m1 + "|" + m2]?.r || []).filter(c => c.party_id === p.id && c.status !== "cancelled"), cv = ivSum(cols, c => c.amount);
    return `<div class="dcx-info"><span class="tg v">${ico("users")} ${esc(p.asm || bi("ASM নেই", "No ASM"))}</span>${p.district ? `<span class="tg">${ico("map")} ${esc(p.district)}</span>` : ""}${open.length ? `<span class="tg w">${bi("খোলা অর্ডার", "Open orders")} ${open.length} · ${ivQ(ivSum(open, o => o.total_qty))} ctn</span>` : ""}<span class="tg">${bi("এই মাসে ডেলিভারি", "Delivered this month")} ৳ ${money0(dl)}</span><span class="tg">${bi("কালেকশন", "Collected")} ৳ ${money0(cv)}</span>${last ? `<span class="mut xs">${bi("শেষ অর্ডার", "Last order")} ${dmy(last)}</span>` : ""}</div>`;
  }
  async function bootPickers() {
    if (!C.edit) return;
    if (!nir) {
      let parties = []; try { parties = await dpLoad(); } catch { }
      ivCols(ivMon(date), ivMonEnd(ivMon(date))).then(() => party && ($b("ph").innerHTML = partyInfo(party))).catch(() => { });
      pPick = suggest(pIn, () => (DPARTY || parties).filter(p => p.active !== false).map(p => ({ value: p.name, label: p.asm || "", sub: "", html: `<span class="sgn"><b>${esc(p.name)}</b><em>${esc([p.asm, p.district].filter(Boolean).join(" · "))}</em></span>` })), it => {
        party = it ? (DPARTY || parties).find(p => p.name === it.value) : null;
        if (party) { pIn.value = party.name; aIn.value = party.asm || ""; const lastO = INV.orders.filter(o => o.party_id === party.id).sort((a, b) => b.date.localeCompare(a.date))[0]; if (lastO?.transport && !tIn.value) tIn.value = lastO.transport; }
        $b("ph").innerHTML = partyInfo(party);
      });
      pIn.addEventListener("picked", () => iIn.focus());
      pIn.addEventListener("input", () => { if (!pPick.get()) { party = null; $b("ph").innerHTML = pIn.value.trim() ? `<span class="mut xs">${bi("তালিকা থেকে বাছুন — নতুন পার্টি হলে Collection-এর পার্টি তালিকায় আগে যোগ করুন", "Pick from the list — add a new party in the Collection party list first")}</span>` : ""; } });
      aIn.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); tIn.focus(); } });
      tIn.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); iIn.focus(); } });
    } else {
      [[tIn, vIn], [vIn, rIn], [rIn, iIn]].forEach(([a, b]) => a.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); b.focus(); } }));
      tIn.addEventListener("change", () => { const lo = INV.orders.filter(o => o.ch === "nir" && o.transport === tIn.value.trim()).sort((a, b) => b.date.localeCompare(a.date))[0]; if (lo && !rIn.value) rIn.value = lo.rent || ""; vList(); });
    }
    iPick = suggest(iIn, () => ivItemsFor(ch).map(it => ({ value: it.name, label: "", sub: "", html: `<span class="sgn"><b>${esc(it.name)}</b><em>${rateOf(it) != null ? "৳ " + money(rateOf(it)) : bi("রেট নেই", "no rate")} · ${esc(it.unit || "ctn")}</em></span>` })), it => { if (it) iIn.value = it.value; });
    iIn.addEventListener("picked", () => qIn.focus());
    const sgHide = () => { if (!iIn.value.trim()) setTimeout(() => iIn.parentElement.querySelector(".sg-list")?.classList.add("hide"), 0); };
    iIn.addEventListener("focus", sgHide); /* empty item box: no list over the cart (↓ still opens it) */
    iIn.addEventListener("keydown", e => { if (e.key === "Enter" && !iIn.value.trim()) { e.preventDefault(); e.stopImmediatePropagation(); save(); } }, true); /* capture: an empty item box must save, not pick the first suggestion */
    qIn.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addLine(); } });
    $b("ad").onclick = addLine; $b("sv").onclick = save; $b("cl").onclick = () => clear(true);
    $b("rm").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } });
    box.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } });
    dls();
  }
  const dls = () => { const past = INV.orders.filter(o => o.ch === ch); const dl = (id, vals) => { const e = $b(id); if (e) e.innerHTML = [...new Set(vals.filter(Boolean))].sort().map(x => `<option value="${esc(x)}">`).join(""); }; dl("dtr", past.map(o => o.transport)); if (!nir) dl("das", past.map(o => o.asm).concat((typeof DASM !== "undefined" ? DASM : []).map(a => a.name))); else vList(); };
  const vList = () => { const e = $b("dvh"); if (e) e.innerHTML = [...new Set(INV.orders.filter(o => o.ch === "nir" && (!tIn.value || o.transport === tIn.value.trim())).map(o => o.vehicle).filter(Boolean))].map(x => `<option value="${esc(x)}">`).join(""); };
  function addLine() {
    err(""); const name = iIn.value.trim(); if (!name) return iIn.focus();
    const it = ivItemsFor(ch).find(x => norm(x.name) === norm(name)) || ivItemsFor(ch).find(x => norm(x.name).includes(norm(name)));
    if (!it) return err(bi("আইটেম মেলেনি — তালিকা থেকে বাছুন", "Item not found — pick from the list")), iIn.focus();
    const n = evalAmt(qIn.value); if (isNaN(n) || n <= 0) return err(bi("পরিমাণ দিন", "Enter the quantity")), qIn.focus();
    const ex = cart.find(l => l.id === it.id); if (ex) ex.q += n; else cart.push({ id: it.id, q: n, r: +(rateOf(it) ?? 0) });
    iPick.set(null); qIn.value = ""; drawCart(); iIn.focus();
  }
  function clear(all) { cart = []; err(""); if (iPick) iPick.set(null); if (qIn) qIn.value = ""; if ($b("rm")) $b("rm").value = ""; if (all || !nir) { if (pPick) pPick.set(null); party = null; if (pIn) { pIn.value = ""; aIn.value = ""; tIn.value = ""; $b("ph").innerHTML = ""; } } if (nir && all) { tIn.value = ""; vIn.value = ""; rIn.value = ""; } st = nir ? "ok" : "pending"; stBar(); drawCart(); (nir ? tIn : pIn)?.focus(); }
  async function save() {
    if (busy || !C.edit) return; err("");
    if (iIn.value.trim() && qIn.value.trim()) addLine();
    const d = $b("d").value; if (!d) return err(bi("তারিখ দিন", "Enter the date"));
    if (ivLocked(d)) return err(ivErr(new Error("month_locked")));
    if (!nir && !party) return err(bi("পার্টি বাছুন (তালিকা থেকে)", "Pick a party from the list")), pIn.focus();
    if (nir && !tIn.value.trim()) return err(bi("ট্রান্সপোর্টের নাম দিন", "Enter the transport name")), tIn.focus();
    if (!cart.length) return err(bi("অন্তত একটি আইটেম যোগ করুন", "Add at least one item")), iIn.focus();
    const row = nir ? { ch, date: d, party: "Niramoy Traders", location: "Naogaon", transport: tIn.value.trim(), vehicle: vIn.value.trim(), rent: evalAmt(rIn.value) || null, lines: lines(), remarks: $b("rm").value.trim(), status: st, delivery_date: st === "ok" ? d : null }
      : { ch, date: d, party: party.name, party_id: party.id, location: party.district || null, asm: aIn.value.trim() || party.asm || null, transport: tIn.value.trim(), lines: lines(), remarks: $b("rm").value.trim(), status: st, delivery_date: st === "ok" ? d : null };
    const tq = ivSum(cart, l => l.q);
    if (INV.orders.some(o => o.ch === ch && o.date === d && (nir ? o.transport === row.transport && o.vehicle === row.vehicle : o.party_id === row.party_id) && o.total_qty === tq) && !ask(bi("এই তারিখে একই রকম অর্ডার আগেই আছে। আবার সেভ করবেন?", "A similar order already exists on this date. Save again?"))) return;
    busy = true; $b("sv").disabled = true;
    try { const r = await API.invOrderSave(row); ivPut(r); toast(bi(`✔ সেভ হয়েছে — ${nir ? row.transport : row.party} · ${ivQ(tq)} ctn · ৳ ${money0(r.value)}`, `✔ Saved — ${nir ? row.transport : row.party} · ${ivQ(tq)} ctn · ৳ ${money0(r.value)}`)); clear(false); dls(); draw(); changed && changed(); }
    catch (x) { err(ivErr(x)); } finally { busy = false; $b("sv").disabled = false; }
  }
  /* ---- list for the date (or every open order) ---- */
  function selbar() {
    const el = $b("sb"); sel = new Set([...sel].filter(id => INV.orders.some(o => o.id === id))); if (!sel.size) return el.classList.add("hide");
    const rs = INV.orders.filter(o => sel.has(o.id)); el.classList.remove("hide");
    el.innerHTML = `<b>${sel.size}</b> <span>· ${ivQ(ivSum(rs, o => o.total_qty))} ctn · ৳ ${money0(ivSum(rs, o => o.value))}</span><input class="in sm" type="date" id="${K}-bd" value="${today()}" title="${bi("ডেলিভারির তারিখ", "Delivery date")}"><button class="btn sm pri" data-bs="ok">${ico("check")} Delivered</button><button class="btn sm" data-bs="today">${bi("আজ যাবে", "Today")}</button><button class="btn sm" data-bs="pending">Pending</button><button class="btn sm ghost" data-bs="x">✕</button>`;
    $$("[data-bs]", el).forEach(b => b.onclick = async () => { if (b.dataset.bs === "x") { sel.clear(); return draw(); } try { const r = await API.invOrderStatus([...sel], b.dataset.bs, $(`#${K}-bd`, el).value || today()); ivPut(r); sel.clear(); toast(bi(`✔ ${r.length}টি অর্ডার আপডেট`, `✔ ${r.length} orders updated`)); draw(); changed && changed(); } catch (e) { toast(ivErr(e), "err"); } });
  }
  function draw() {
    if (!box.isConnected) return; date = $b("d").value || today();
    const day = INV.orders.filter(o => o.ch === ch && o.date === date), dlv = INV.orders.filter(o => o.ch === ch && o.status === "ok" && o.delivery_date === date), open = INV.orders.filter(o => o.ch === ch && ["pending", "today"].includes(o.status));
    const stat = (cls, ic, lab, arr, sub) => `<div class="dcx-stat ${cls}"><span class="si">${ico(ic)}</span><span class="tx"><small>${lab}</small><b class="num">৳ ${money0(ivSum(arr, o => o.value))}</b><i>${sub}</i></span></div>`;
    $b("kpi").innerHTML = stat("t", nir ? "ivtruck" : "ivcart", nir ? bi("এই দিনের ট্রিপ", "Trips today") : bi("এই দিনের অর্ডার", "Orders this day"), day.filter(o => o.status !== "cancel"), `${day.length} · ${ivQ(ivSum(day, o => o.total_qty))} ctn`)
      + stat("a", "check", bi("এই দিনে ডেলিভারি", "Delivered this day"), dlv, `${dlv.length} · ${ivQ(ivSum(dlv, o => o.total_qty))} ctn`)
      + stat("p", "clock", bi("মোট খোলা অর্ডার", "All open orders"), open, `${open.length} · ${ivQ(ivSum(open, o => o.total_qty))} ctn`);
    const nq = norm(q), base = showOpen ? open.slice().sort((a, b) => a.date.localeCompare(b.date)) : day.slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    const vis = base.filter(o => !nq || norm([ivPname(o), o.asm, o.transport, o.vehicle, o.remarks, ...Object.keys(o.lines).map(ivItemName)].join(" ")).includes(nq));
    $b("lh").textContent = showOpen ? bi("সব খোলা অর্ডার (পুরনো আগে)", "All open orders (oldest first)") : bi(`${dmy(date)} তারিখের ${nir ? "ট্রিপ" : "অর্ডার"}`, `${nir ? "Trips" : "Orders"} on ${dmy(date)}`); $b("cnt").textContent = vis.length;
    const canSt = o => C.edit && (C.admin || o.status !== "cancel") && !ivLocked(o.date);
    $b("ls").innerHTML = vis.length ? `<div class="iv-ol">${vis.map(o => `<div class="iv-or s-${o.status}">${!nir && canSt(o) ? `<input type="checkbox" data-sl="${o.id}" ${sel.has(o.id) ? "checked" : ""} aria-label="select">` : `<span></span>`}
        <div class="iv-om"><div class="iv-ot1"><b>${esc(nir ? (o.transport || "—") : ivPname(o))}</b>${!nir && !o.party_id ? ` <i class="iv-nl" title="${bi("কালেকশনের পার্টির সাথে মেলানো নেই", "Not linked to a collection party")}">!</i>` : ""}<span class="mut xs">${esc([showOpen ? dmy(o.date) : "", nir ? o.vehicle : o.asm, o.transport && !nir ? o.transport : ""].filter(Boolean).join(" · "))}</span></div>
        <div class="iv-ot2">${Object.entries(o.lines).map(([k, l]) => `<span>${esc(ivItemName(k))} <b>${ivQ(l.q)}</b></span>`).join("")}${o.remarks ? `<span class="mut">${esc(o.remarks)}</span>` : ""}</div></div>
        <div class="iv-ov"><b class="num">${ivQ(o.total_qty)}</b><small class="num">৳ ${money0(o.value)}</small></div>
        <div class="iv-oa">${ivSt(o.status)}${o.status === "ok" && o.delivery_date && o.delivery_date !== o.date ? `<small class="mut">${dmy(o.delivery_date)}</small>` : ""}${["pending", "today"].includes(o.status) ? `<small class="iv-age ${ivDays(o.date, today()) > 7 ? "late" : ""}">${ivDays(o.date, today())} ${bi("দিন", "d")}</small>` : ""}</div>
        <div class="iv-ob">${canSt(o) && o.status !== "ok" ? `<button class="btn sm pri" data-ok="${o.id}" title="Delivered">${ico("check")}</button>` : ""}${!nir && C.edit ? `<button class="btn sm" data-col="${o.id}" title="${bi("কালেকশন যোগ", "Add collection")}">৳</button>` : ""}<button class="btn sm" data-ed="${o.id}" title="${bi("খুলুন", "Open")}">${ico("edit")}</button></div></div>`).join("")}</div>`
      : `<div class="empty">${showOpen ? bi("কোনো খোলা অর্ডার নেই ✓", "No open orders ✓") : bi("এই তারিখে কিছু নেই", "Nothing on this date")}</div>`;
    $$("[data-sl]", box).forEach(c => c.onchange = () => { c.checked ? sel.add(c.dataset.sl) : sel.delete(c.dataset.sl); selbar(); });
    $$("[data-ok]", box).forEach(b => b.onclick = async () => { b.disabled = true; try { ivPut(await API.invOrderStatus([b.dataset.ok], "ok", today())); toast(bi("✔ Delivered", "✔ Delivered")); draw(); changed && changed(); } catch (e) { toast(ivErr(e), "err"); b.disabled = false; } });
    $$("[data-ed]", box).forEach(b => b.onclick = () => ivOrderModal(ch, INV.orders.find(o => o.id === b.dataset.ed), () => { draw(); changed && changed(); }));
    $$("[data-col]", box).forEach(b => b.onclick = () => ivColModal(INV.orders.find(o => o.id === b.dataset.col), () => { if (party) $b("ph").innerHTML = partyInfo(party); }));
    selbar();
  }
  bindDateNav(box, K, () => { sel.clear(); draw(); if (!nir) ivCols(ivMon($b("d").value), ivMonEnd(ivMon($b("d").value))).then(() => party && ($b("ph").innerHTML = partyInfo(party))).catch(() => { }); });
  $b("op").onchange = e => { showOpen = e.target.checked; sel.clear(); draw(); };
  $b("q").oninput = e => { q = e.target.value; draw(); };
  stBar(); drawCart(); bootPickers().then(() => { if (!matchMedia("(pointer:coarse)").matches) setTimeout(() => (nir ? tIn : pIn)?.focus(), 30); }); /* phones: no auto-focus (keyboard + list would cover the page) */
  return { draw };
}

/* add a Distribution Collection straight from an order (same table as Collection Entry) */
function ivColModal(o, done) {
  if (!o) return; const p = o.party_id && ivParty(o.party_id);
  if (!p) return toast(bi("এই অর্ডারের পার্টি কালেকশনের তালিকার সাথে মেলানো নেই — আগে \"পার্টি মেলান\" করুন বা অর্ডারে পার্টি তালিকা থেকে বাছুন", "This order's party is not linked to the collection party list — use \"Match parties\" or pick the party from the list in the order"), "err");
  modal(`<h2>৳ ${bi("কালেকশন যোগ", "Add collection")}</h2><div class="mut sm">${esc(p.name)} · ${bi("অর্ডার", "Order")} ${dmy(o.date)} · ৳ ${money0(o.value)}</div>
    <div class="iv-fg two"><div><label class="f">${bi("তারিখ", "Date")}</label><input class="in" type="date" id="cm-d" value="${today()}"></div><div><label class="f">${bi("টাকা", "Amount")} *</label><input class="in num" id="cm-a" inputmode="decimal" value="${Math.round(o.value)}"></div>
    <div><label class="f">Account *</label><div><input class="in" id="cm-c" autocomplete="off" placeholder="DBBL-17" value="${esc(p.account || "")}"></div></div><div><label class="f">${bi("মন্তব্য", "Remarks")}</label><input class="in" id="cm-r" value="${esc("Order " + dmy(o.date))}"></div></div>
    <div class="mut xs">${bi("এটা Collection Entry-তে Pending হিসেবে যাবে — Approve হবে কালেকশনের নিয়মে।", "This goes to Collection Entry as Pending — it is approved the usual collection way.")}</div><div class="hint rd iv-err" id="cm-e"></div>
    <div class="row iv-mb"><div class="sp"></div><button class="btn" id="cm-x">${bi("বাতিল", "Cancel")}</button><button class="btn pri" id="cm-s">${bi("যোগ করুন", "Add")}</button></div>`, (root, close) => {
    const cIn = $("#cm-c", root); suggest(cIn, () => dcAccounts().map(c => { const a = (S.accounts || []).find(x => x.code === c); return { value: c, label: a?.holder || "", sub: a?.bank || "" }; }), it => { if (it) cIn.value = it.value; });
    $("#cm-x", root).onclick = close;
    $("#cm-s", root).onclick = async () => {
      const amount = evalAmt($("#cm-a", root).value), account = cIn.value.trim(), d = $("#cm-d", root).value, e = m => $("#cm-e", root).textContent = m;
      if (!d) return e(bi("তারিখ দিন", "Enter the date")); if (!account) return e(bi("Account দিন", "Enter the account")); if (isNaN(amount) || amount <= 0) return e(bi("টাকার অঙ্ক ঠিক নেই", "Check the amount"));
      try { await API.dcolAdd({ date: d, party_id: p.id, party: p.name, asm: p.asm || o.asm || "", account, amount, remarks: $("#cm-r", root).value.trim() }); if (typeof DCACHE !== "undefined") DCACHE.dcol = null; ivColDrop(); toast(bi(`✔ কালেকশন যোগ হয়েছে — ৳ ${money0(amount)}`, `✔ Collection added — ৳ ${money0(amount)}`)); close(); done && done(); } catch (x) { e(typeof dcErr === "function" ? dcErr(x) : ivErr(x)); }
    };
  });
}

/* Order vs Delivery by party — Balance = opening (01-01-2026) + sales (Tally register up to its last date, then app deliveries) − approved collections */
const OVD_FROM = "2026-01-01";
let OVD = null;
async function ovdLoad(force) { if (OVD && !force && Date.now() - OVD.t < 120000) return OVD.d; const d = await API.ovdAll(); OVD = { d, t: Date.now() }; return d; }
function ivLedger(box) {
  let data = [], cut = "", unT = [], unO = [], show0 = false, qs = "";
  box.innerHTML = `<div class="card tbar noprint"><div class="row pflt iv-flt"><div class="pq"><label class="f">${bi("খুঁজুন", "Search")}</label><input class="in" id="ov-q" placeholder="${bi("পার্টি বা ASM…", "Party or ASM…")}"></div><div><label class="f">${bi("দেখান", "Show")}</label><label class="iv-chk"><input type="checkbox" id="ov-z"> ${bi("শূন্য হিসাবের পার্টিও", "Also zero-balance parties")}</label></div><div class="sp"></div><button class="btn sm" id="ov-xl">${ico("dl")} Excel</button></div></div><div class="ksum iv-ks" id="ov-kpi"></div><div class="card flush"><div class="ch"><h3>${bi("অর্ডার বনাম ডেলিভারি", "Order vs Delivery")}</h3><span class="tag" id="ov-cnt">0</span></div><div id="ov-nt"></div><div id="ov-out"></div></div>`;
  async function load() {
    const out = $("#ov-out", box), td = today();
    try { await dpLoad(); await invLoad(); var [d, cols] = await Promise.all([ovdLoad(true), API.dcolRange(OVD_FROM, td)]); } catch (e) { out.innerHTML = `<div class="alert rd" style="margin:12px">${esc(ivErr(e))}</div>`; return; }
    cut = d.sales.reduce((m, s) => s.sale_date > m ? s.sale_date : m, d.opening.length ? OVD_FROM : "");
    const g = {}, row = k => g[k] ||= { k, pid: null, name: "", op: 0, reg: 0, app: 0, aq: 0, col: 0, pq: 0, old: "", note: "" };
    const key = (pid, nm) => pid || "n:" + nm;
    d.opening.forEach(o => { const x = row(key(o.party_id, o.party_name)); x.pid = o.party_id; x.name = o.party_name; x.op += o.opening; if (o.note === "NEW" || o.note === "INACTIVE") x.note = o.note; });
    d.sales.forEach(s => { const x = row(key(s.party_id, s.party_name)); x.pid = s.party_id; x.name ||= s.party_name; x.reg += s.amount; });
    unO = []; const L = INV.orders.filter(o => o.ch === "dist" && o.status !== "cancel");
    L.forEach(o => {
      const dd = o.delivery_date || o.date, isOk = o.status === "ok", open = !isOk;
      if (!o.party_id) { if (open || (dd > cut && dd >= OVD_FROM)) unO.push(o); return; }
      const x = row(o.party_id);
      if (isOk && dd > cut && dd >= OVD_FROM && dd <= td) { x.app += o.value; x.aq += o.total_qty; }
      if (open) { x.pq += o.total_qty; if (!x.old || o.date < x.old) x.old = o.date; }
    });
    cols.forEach(c => { if (c.party_id && c.status === "approved") row(c.party_id).col += c.amount; });
    data = Object.values(g).map(x => {
      const p = x.pid ? ivParty(x.pid) : null; x.name = p?.name || x.name; x.asm = p?.asm || ""; x.dl = x.reg + x.app; x.bal = x.op + x.dl - x.col; x.days = x.old ? Math.max(0, ivDays(x.old, td)) : 0;
      x.st = Math.abs(x.bal) < 1 ? "clear" : x.bal < 0 ? "adv" : x.col > 0 ? "part" : "due"; x.zero = !x.op && !x.dl && !x.col && !x.pq; return x;
    });
    unT = data.filter(x => !x.pid && (x.op || x.reg));
    draw();
  }
  const ST = { due: ["#dc2626", bi("বাকি", "Due")], part: ["#d97706", bi("আংশিক", "Partial")], clear: ["#059669", bi("পরিশোধিত", "Clear")], adv: ["#4f46e5", bi("অগ্রিম", "Advance")] };
  function draw() {
    const out = $("#ov-out", box); if (!out) return; const q = norm(qs);
    const L = data.filter(x => (show0 || !x.zero) && (!q || norm(x.name + " " + x.asm).includes(q))).sort((a, b) => b.bal - a.bal || a.name.localeCompare(b.name));
    const T = k => ivSum(L, x => x[k]), td = today();
    $("#ov-kpi", box).innerHTML = ivTile("#dc2626", "coins", bi("মোট বাকি (Balance)", "Total balance"), "৳ " + money0(T("bal")), `${L.filter(x => x.bal >= 1).length} ${bi("পার্টির বাকি আছে", "parties owe")}`) + ivTile("#64748b", "flag", bi("Opening (০১-০১-২০২৬)", "Opening (01-01-2026)"), "৳ " + money0(T("op")), bi("সব পার্টির যোগফল", "all parties")) + ivTile("#059669", "check", bi("ডেলিভারি", "Delivered"), "৳ " + money0(T("dl")), `${bi("Tally", "Tally")} ৳ ${money0(T("reg"))} + ${bi("অ্যাপ", "App")} ৳ ${money0(T("app"))}`) + ivTile("#4f46e5", "coins", bi("কালেকশন (Approved)", "Collected (approved)"), "৳ " + money0(T("col")), bi("০১-০১-২০২৬ থেকে", "since 01-01-2026")) + ivTile("#d97706", "ivcart", bi("Pending অর্ডার", "Pending orders"), ivQ(T("pq")) + " ctn", `${L.filter(x => x.pq).length} ${bi("পার্টি", "parties")}`);
    const nt = [];
    if (cut) nt.push(`<div class="mut sm" style="margin:10px 12px 0">${bi(`হিসাব: Opening + বিক্রয় − Approved কালেকশন। বিক্রয় ${dmy(cut)} পর্যন্ত Tally Sales Register থেকে, তার পরের ডেলিভারি অ্যাপ থেকে।`, `Balance = Opening + sales − approved collections. Sales come from the Tally Sales Register up to ${dmy(cut)}, then from app deliveries.`)}</div>`);
    if (unT.length) nt.push(`<div class="alert am" style="margin:10px 12px 0">${bi(`${unT.length}টি Tally পার্টি (Balance ৳ ${money0(ivSum(unT, x => x.bal))}) কালেকশন তালিকার সাথে মেলানো নেই — এদের কালেকশন বাদ যাচ্ছে।`, `${unT.length} Tally parties (balance ৳ ${money0(ivSum(unT, x => x.bal))}) are not linked to the collection list, so their collections are not counted.`)}${S.me.role === "admin" ? ` <a href="#" id="ov-mt">${bi("Tally পার্টি মেলান ›", "Match Tally parties ›")}</a>` : ""}</div>`);
    if (unO.length) nt.push(`<div class="alert am" style="margin:10px 12px 0">${bi(`${unO.length}টি অর্ডার (৳ ${money0(ivSum(unO, o => o.value))}) পার্টির সাথে মেলানো নেই — হিসাবে আসেনি।`, `${unO.length} orders (৳ ${money0(ivSum(unO, o => o.value))}) are not linked to a party and are left out.`)}${S.me.role === "admin" ? ` <a href="#" id="ov-mo">${bi("অর্ডারের পার্টি মেলান ›", "Match order parties ›")}</a>` : ""}</div>`);
    $("#ov-nt", box).innerHTML = nt.join("");
    const a = $("#ov-mt", box); if (a) a.onclick = e => { e.preventDefault(); ovdMatchModal(() => load()); };
    const b = $("#ov-mo", box); if (b) b.onclick = e => { e.preventDefault(); ivMatchModal(() => load()); };
    $("#ov-cnt", box).textContent = L.length;
    out.innerHTML = L.length ? `<div class="tw cards"><table class="iv-mt"><thead><tr><th>${bi("পার্টি", "Party")}</th><th>ASM</th><th class="r">Pending (ctn)</th><th class="r">Pending (${bi("দিন", "days")})</th><th class="r">${bi("ডেলিভারি ৳", "Delivered ৳")}</th><th class="r">${bi("কালেকশন ৳", "Collected ৳")}</th><th>${bi("পেমেন্ট অবস্থা", "Payment status")}</th><th class="r">Balance ৳</th></tr></thead><tbody>${L.map(x => `<tr><td><b>${esc(x.name || "?")}</b>${x.pid ? "" : ` <i class="iv-mk">${bi("মেলেনি", "unlinked")}</i>`}${x.note ? ` <i class="iv-mk ${x.note === "NEW" ? "ok" : "no"}">${x.note === "NEW" ? bi("নতুন", "new") : bi("নিষ্ক্রিয়", "inactive")}</i>` : ""}</td><td class="nw">${esc(x.asm)}</td><td class="r num">${x.pq ? ivQ(x.pq) : "—"}</td><td class="r num ${x.days > 7 ? "iv-due" : ""}">${x.pq ? x.days : "—"}</td><td class="r num">${money0(x.dl)}</td><td class="r num">${money0(x.col)}</td><td><i class="iv-mk" style="background:${ST[x.st][0]}1a;color:${ST[x.st][0]}">${ST[x.st][1]}</i></td><td class="r num b ${x.bal >= 1 ? "iv-due" : x.bal <= -1 ? "iv-adv" : "iv-paid"}" title="Opening ${money0(x.op)} + ${bi("বিক্রয়", "Sales")} ${money0(x.dl)} − ${bi("কালেকশন", "Collected")} ${money0(x.col)}">${money0(x.bal)}</td></tr>`).join("")}</tbody><tfoot><tr class="tot"><td colspan="2">${bi("মোট", "Total")}</td><td class="r num">${ivQ(T("pq"))}</td><td></td><td class="r num">${money0(T("dl"))}</td><td class="r num">${money0(T("col"))}</td><td></td><td class="r num">${money0(T("bal"))}</td></tr></tfoot></table></div>` : ivEmpty(bi("কোনো পার্টি পাওয়া যায়নি", "No parties found"));
    labelTables(out);
  }
  $("#ov-q", box).oninput = e => { qs = e.target.value; draw(); };
  $("#ov-z", box).onchange = e => { show0 = e.target.checked; draw(); };
  $("#ov-xl", box).onclick = () => { const td = today(); exportXlsx({ "Order vs Delivery": [["Party", "ASM", "Pending (ctn)", "Pending (days)", "Opening 01-01-2026", "Tally sales to " + (cut || "-"), "App deliveries after", "Delivered", "Collected (approved)", "Payment status", "Balance"], ...[...data].filter(x => show0 || !x.zero).sort((a, b) => b.bal - a.bal).map(x => [x.name, x.asm, x.pq || 0, x.pq ? x.days : 0, x.op, x.reg, x.app, x.dl, x.col, ({ due: "Due", part: "Partial", clear: "Clear", adv: "Advance" })[x.st], x.bal])] }, `Order_vs_Delivery_${td}.xlsx`); };
  load();
  return { draw: load };
}
/* link Tally names (opening / sales register) to the collection party list */
async function ovdMatchModal(done) {
  let parties = []; try { parties = await dpLoad(); } catch (e) { return toast(ivErr(e), "err"); }
  const d = await ovdLoad(true), grp = () => { const g = {}; d.opening.forEach(o => { if (!o.party_id && o.opening) { const x = g[o.party_name] ||= { name: o.party_name, v: 0 }; x.v += o.opening; } }); d.sales.forEach(s => { if (!s.party_id) { const x = g[s.party_name] ||= { name: s.party_name, v: 0 }; x.v += s.amount; } }); return Object.values(g).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)); };
  const draw = root => {
    const G = grp(); G.forEach(x => { x.g = ivGuess(x.name, "", "", parties); x.ok = ivSure(x.g); }); G.sort((a, b) => (b.ok - a.ok) || (Math.abs(b.v) - Math.abs(a.v)));
    $("#mt-n", root).textContent = G.length;
    $("#mt-l", root).innerHTML = G.length ? G.map((x, i) => `<div class="iv-mr" data-i="${i}"><div class="iv-mn"><b>${esc(x.name)}</b><small class="mut">Tally · ৳ ${money0(x.v)}</small></div><div class="iv-mc">${x.ok ? `<i class="iv-mk ok">${bi("নিশ্চিত", "sure")}</i>` : x.g.length ? `<i class="iv-mk">${bi("যাচাই করে বাছুন", "check & pick")}</i>` : `<i class="iv-mk no">${bi("তালিকায় নেই", "not in list")}</i>`}${x.g.map((c, j) => `<span class="chip ${j === 0 && x.ok ? "on" : ""}" data-p="${c.p.id}">${esc(c.p.name)}</span>`).join("")}<span class="iv-ms"><input class="in sm" placeholder="${bi("তালিকা থেকে খুঁজুন…", "Search the list…")}"></span></div><button class="btn sm pri" data-go="${i}">${bi("মেলান", "Link")}</button></div>`).join("") : `<div class="empty">${bi("সব Tally পার্টি মেলানো হয়েছে ✓", "All Tally parties are linked ✓")}</div>`;
    $$(".iv-mr", root).forEach(r => {
      const x = G[+r.dataset.i]; let pid = $(".chip.on", r)?.dataset.p || null;
      $$(".chip", r).forEach(c => c.onclick = () => { $$(".chip", r).forEach(z => z.classList.toggle("on", z === c)); pid = c.dataset.p; });
      const inp = $(".iv-ms input", r); suggest(inp, () => parties.map(p => ({ value: p.name, label: p.asm || "", sub: p.district || "" })), it => { if (it) { pid = parties.find(p => p.name === it.value)?.id; $$(".chip", r).forEach(z => z.classList.remove("on")); } });
      $("[data-go]", r).onclick = async () => { if (!pid) return toast(bi("একটা পার্টি বাছুন", "Pick a party"), "err"); try { await API.ovdLink(x.name, pid); d.opening.forEach(o => { if (o.party_name === x.name) o.party_id = pid; }); d.sales.forEach(s => { if (s.party_name === x.name) s.party_id = pid; }); toast(bi("✔ মেলানো হয়েছে", "✔ Linked")); draw(root); } catch (e) { toast(ivErr(e), "err"); } };
    });
  };
  modal(`<h2>${ico("users")} ${bi("Tally পার্টি মেলান", "Match Tally parties")} <span class="tag" id="mt-n">0</span></h2><div class="mut sm">${bi("Tally-র পার্টির নাম কালেকশন তালিকার পার্টির সাথে মেলান — তাহলে কালেকশন ও ডেলিভারি একই হিসাবে আসবে।", "Link each Tally party name to a party in the collection list so collections and deliveries land in the same balance.")}</div><div class="iv-ml" id="mt-l"></div><div class="row iv-mb"><div class="sp"></div><button class="btn" id="mt-x">${bi("বন্ধ", "Close")}</button></div>`, (root, close) => {
    root.querySelector(".modal").classList.add("iv-modal"); $("#mt-x", root).onclick = () => { close(); done && done(); }; draw(root);
  });
}

/* link old (imported) orders to the Collection party list — admin confirms every match */
const IV_STOP = new Set(["ent", "enterprise", "enterprises", "store", "stores", "traders", "trader", "trading", "general", "the", "and", "mart", "shop", "house", "co", "ltd", "bazar", "sadar", "road"]);
const IV_AST = new Set(["asm", "rsm", "sm", "tse", "ho", "vacant", "head", "quarter", "office", "modern", "trade"]);
const ivWords = s => String(s || "").toLowerCase().replace(/[`'’.]/g, "").split(/[^a-z0-9]+/).filter(w => w.length > 1);
const ivBg = s => { const a = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); a.set(k, (a.get(k) || 0) + 1); } return a; };
const ivDice = (a, b) => { if (!a || !b) return 0; if (a === b) return 1; if (a.length < 2 || b.length < 2) return 0; const A = ivBg(a), B = ivBg(b); let n = 0; for (const [k, v] of A) n += Math.min(v, B.get(k) || 0); return 2 * n / (a.length + b.length - 2); };
const ivWsim = (w, ws) => Math.max(0, ...ws.map(x => x === w ? 1 : (w.length >= 4 && x.length >= 4 && (x.startsWith(w) || w.startsWith(x))) ? 0.9 : ivDice(w, x)));
/* score = whole-name similarity (shop part of the master name) + name words + location words + ASM words; tolerant to spelling (Nawas/Newaz, Uzzail/Uzzal) */
function ivGuess(name, loc, asm, parties) {
  const nw = ivWords(name).filter(w => !IV_STOP.has(w)), lw = ivWords(loc), aw = ivWords(asm).filter(w => !IV_AST.has(w)), on = norm(name);
  return parties.map(p => {
    const parts = String(p.name).split(/\s*[-,:]\s*/).filter(Boolean); let best = 0, shop = parts[0] || "";
    for (let i = 1; i <= Math.min(3, parts.length); i++) { const c = parts.slice(0, i).join(" "), d = ivDice(on, norm(c)); if (d > best) { best = d; shop = c; } }
    const pw = ivWords(p.name + " " + (p.district || "")), sw = ivWords(shop), paw = ivWords(p.asm).filter(w => !IV_AST.has(w));
    let sc = best * 8, nh = 0;
    nw.forEach(w => { const x = ivWsim(w, sw); if (x >= 0.7) nh++; sc += x >= 0.9 ? 3 : x >= 0.7 ? 2 : 0; });
    lw.forEach(w => { const x = ivWsim(w, pw); sc += x >= 0.9 ? 3 : x >= 0.72 ? 2 : 0; });
    aw.forEach(w => { const x = ivWsim(w, paw); sc += x >= 0.9 ? 2 : x >= 0.7 ? 1.5 : 0; });
    if (nw.length && !nh) sc = 0;
    return { p, sc: Math.round(sc * 10) / 10 };
  }).filter(x => x.sc >= 6).sort((a, b) => b.sc - a.sc).slice(0, 3);
}
const ivSure = g => g.length > 0 && (g.length === 1 || g[0].sc - g[1].sc >= 2);
async function ivMatchModal(done) {
  let parties = []; try { parties = await dpLoad(); } catch (e) { return toast(ivErr(e), "err"); }
  const groups = () => { const g = {}; INV.orders.filter(o => o.ch === "dist" && !o.party_id).forEach(o => { const k = o.party + "|" + (o.location || ""); const x = g[k] ||= { name: o.party, loc: o.location || "", asm: o.asm || "", n: 0, v: 0 }; x.n++; x.v += o.value; }); return Object.values(g).sort((a, b) => b.v - a.v); };
  const draw = (root) => {
    const G = groups(); G.forEach(x => { x.g = ivGuess(x.name, x.loc, x.asm, parties); x.ok = ivSure(x.g); }); G.sort((a, b) => (b.ok - a.ok) || (b.v - a.v)); const nSure = G.filter(x => x.ok).length;
    $("#mt-all", root).textContent = bi(`নিশ্চিত প্রস্তাবগুলো একসাথে মেলান (${nSure})`, `Link all sure matches (${nSure})`); $("#mt-all", root).disabled = !nSure; root._G = G;
    $("#mt-l", root).innerHTML = G.length ? G.map((x, i) => `<div class="iv-mr" data-i="${i}"><div class="iv-mn"><b>${esc(x.name)}</b><small class="mut">${esc([x.loc, x.asm].filter(Boolean).join(" · "))} · ${x.n} ${bi("অর্ডার", "orders")} · ৳ ${money0(x.v)}</small></div>
      <div class="iv-mc">${x.ok ? `<i class="iv-mk ok">${bi("নিশ্চিত", "sure")}</i>` : x.g.length ? `<i class="iv-mk">${bi("যাচাই করে বাছুন", "check & pick")}</i>` : `<i class="iv-mk no">${bi("তালিকায় নেই", "not in list")}</i> <a href="#" class="iv-np" data-np="${i}">+ ${bi("নতুন পার্টি তৈরি", "Create party")}</a>`}${x.g.map((c, j) => `<span class="chip ${j === 0 && x.ok ? "on" : ""}" data-p="${c.p.id}">${esc(c.p.name)}<small>${esc(c.p.asm || "")}</small></span>`).join("")}<div class="iv-ms"><input class="in sm" placeholder="${bi("অন্য পার্টি খুঁজুন…", "Search another party…")}" autocomplete="off"></div></div>
      <button class="btn sm pri" data-go="${i}">${bi("মেলান", "Link")}</button></div>`).join("") : `<div class="empty">${bi("সব অর্ডার মেলানো হয়েছে ✓", "All orders are linked ✓")}</div>`;
    $("#mt-n", root).textContent = G.length;
    $$(".iv-mr", root).forEach(r => {
      const x = G[+r.dataset.i]; let pid = $(".chip.on", r)?.dataset.p || null;
      $$(".chip", r).forEach(c => c.onclick = () => { $$(".chip", r).forEach(z => z.classList.toggle("on", z === c)); pid = c.dataset.p; });
      const inp = $(".iv-ms input", r); suggest(inp, () => parties.map(p => ({ value: p.name, label: p.asm || "", sub: p.district || "" })), it => { if (it) { pid = parties.find(p => p.name === it.value)?.id; $$(".chip", r).forEach(z => z.classList.remove("on")); } });
      const np = $("[data-np]", r); if (np) np.onclick = e => { e.preventDefault(); if (typeof dpartyModal !== "function") return; dpartyModal({ name: [x.name, x.loc].filter(Boolean).join("-") }, saved => { if (!saved) return; parties = DPARTY || parties; pid = saved.id; toast(bi("✔ পার্টি তৈরি হয়েছে — এখন \"মেলান\" চাপুন", "✔ Party created — now press \"Link\"")); ivMatchModal(done); }); };
      $("[data-go]", r).onclick = async () => { if (!pid) return toast(bi("একটা পার্টি বাছুন", "Pick a party"), "err"); try { const rs = await API.invLinkParty(x.name, x.loc || null, pid); ivPut(rs); toast(bi(`✔ ${rs.length}টি অর্ডার মেলানো হয়েছে`, `✔ ${rs.length} orders linked`)); draw(root); } catch (e) { toast(ivErr(e), "err"); } };
    });
  };
  modal(`<h2>${ico("users")} ${bi("পার্টি মেলান", "Match parties")} <span class="tag" id="mt-n">0</span></h2><div class="mut sm">${bi("পুরনো Excel-এর পার্টির নাম কালেকশনের পার্টি তালিকার সাথে মেলান — তাহলে ডেলিভারি ও কালেকশন একসাথে হিসাব হবে। প্রস্তাবগুলো নামের মিল দেখে; ভুল হলে অন্যটা বাছুন বা খুঁজুন। নতুন অর্ডার তালিকা থেকে বাছলে নিজেই মেলে।", "Link the old Excel party names to the collection party list so delivery and collection add up together. Suggestions come from name similarity; pick or search another if wrong. New orders picked from the list link themselves.")}</div><div class="iv-ml" id="mt-l"></div><div class="row iv-mb"><button class="btn pri" id="mt-all"></button><div class="sp"></div><button class="btn" id="mt-x">${bi("বন্ধ", "Close")}</button></div>`, (root, close) => {
    root.querySelector(".modal").classList.add("iv-modal"); $("#mt-x", root).onclick = () => { close(); done && done(); };
    $("#mt-all", root).onclick = async () => { const S2 = (root._G || []).filter(x => x.ok); if (!S2.length || !ask(bi(`${S2.length}টি নিশ্চিত প্রস্তাব একসাথে মেলাবেন?`, `Link ${S2.length} sure matches at once?`))) return; const b = $("#mt-all", root); b.disabled = true; let n = 0; try { for (const x of S2) { const rs = await API.invLinkParty(x.name, x.loc || null, x.g[0].p.id); ivPut(rs); n += rs.length; } toast(bi(`✔ ${n}টি অর্ডার মেলানো হয়েছে`, `✔ ${n} orders linked`)); } catch (e) { toast(ivErr(e), "err"); } draw(root); };
    draw(root);
  });
}

/* Excel in the same shape as the old workbook: one row per order, one column per item */
function ivExportOrders(ch, list, [f, t]) {
  const nir = ch === "nir", ids = [...new Set(list.flatMap(o => Object.keys(o.lines)))].sort((a, b) => (INV.byId[a]?.sort ?? 100) - (INV.byId[b]?.sort ?? 100) || a - b);
  const hd = nir ? ["Date", "Transport", "Vehicle", "Rent"] : ["Date", "Party", "Location", "ASM", "Transport"];
  const rows = [[...hd, ...ids.map(ivItemName), "Total Qty", "Value", "Status", "Delivery Date", "Free", "Remarks"]];
  [...list].sort((a, b) => a.date.localeCompare(b.date)).forEach(o => rows.push([...(nir ? [o.date, o.transport, o.vehicle, o.rent] : [o.date, ivPname(o), o.location, o.asm, o.transport]), ...ids.map(id => o.lines[id]?.q || ""), o.total_qty, o.value, IV_ST[o.status][1], o.delivery_date || "", o.free || "", o.remarks || ""]));
  const t2 = ivItemTotals(list, f, t);
  const items = [["Item", "Ordered", "Delivered", "Pending", "Order Value", "Delivered Value"], ...ids.map(id => [ivItemName(id), t2[id]?.ord || 0, t2[id]?.del || 0, t2[id]?.pend || 0, t2[id]?.val || 0, t2[id]?.dval || 0])];
  exportXlsx({ [nir ? "Niramoy" : "Distribution"]: rows, "By Item": items }, `${nir ? "Niramoy" : "Distribution"}_${f === "0000-01-01" ? "All" : f + "_" + t}.xlsx`);
}

/* =================== RM Factory — Tamarind + Wood on one page =================== */
async function vInvRm(v) {
  const C = ivCan(), F = Object.assign(pbInit("month"), { tab: "all", party: "" });
  v.innerHTML = head(ROUTES[CUR].t, `<button class="btn" id="rm-xl">${ico("dl")} Excel</button>${C.admin ? `<button class="btn" id="rm-op">${ico("sliders")} ${bi("Opening ও ব্যাগ সাইজ", "Opening & bag size")}</button>` : ""}`) +
    `<div class="card tbar noprint">${pbBar("rmpb", F)}</div><div id="rm-lk"></div><div id="rm-seg"></div><div id="rm-out"></div>`;
  const out = $("#rm-out", v);
  try { await invLoad(); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(ivErr(e))}</div>`; return; }
  if (Date.now() - INV_T > 15000) invLoad(true).then(() => out.isConnected && draw()).catch(() => { });
  const kg = (p, b) => ivQ(b * (+p.bag_kg || 0));
  const seg = () => { $("#rm-seg", v).innerHTML = ivSeg("rm-tab", [["all", bi("একসাথে", "Combined")], ...INV.rmp.filter(p => p.active !== false).map(p => [p.code, p.name]), ["led", bi("পার্টি খাতা", "Party ledger")]], F.tab); ivSegBind(v, "rm-tab", F, "tab", draw); };
  function card(code, f, t) {
    const L = rmLedgerRows(code, f, t), p = L.p, R = ivSum(L.rows, x => x.ready), D = ivSum(L.rows, x => x.del), cl = L.open + R - D, neg = L.rows.filter(x => x.stock < 0).length;
    return `<div class="card iv-rmc ${cl < 0 ? "neg" : ""}"><div class="iv-rmh"><b>${esc(p.name)}</b><span class="tag">1 bag = ${ivQ(p.bag_kg)} kg</span></div>
      <div class="iv-rmg"><div><small>Opening</small><b class="num">${ivQ(L.open)}</b><i>${kg(p, L.open)} kg</i></div><div class="gr"><small>Ready</small><b class="num">+${ivQ(R)}</b><i>${kg(p, R)} kg</i></div><div class="am"><small>Delivery</small><b class="num">−${ivQ(D)}</b><i>${kg(p, D)} kg</i></div><div class="vi"><small>${bi("স্টক", "Stock")}</small><b class="num">${ivQ(cl)}</b><i>${kg(p, cl)} kg</i></div></div>
      ${neg ? `<div class="alert rd sm">${bi(`${neg} দিন স্টক মাইনাসে গেছে — রেকর্ড মিলিয়ে দেখুন`, `Stock went below zero on ${neg} day(s) — please check the entries`)}</div>` : ""}</div>`;
  }
  function combined(f, t) {
    const ps = INV.rmp.filter(p => p.active !== false), Ls = ps.map(p => rmLedgerRows(p.code, f, t));
    const dates = [...new Set(Ls.flatMap(L => L.rows.map(x => x.date)))].sort();
    const ckg = Ls.reduce((s, L, i) => s + (L.open + ivSum(L.rows, x => x.ready) - ivSum(L.rows, x => x.del)) * ps[i].bag_kg, 0);
    const qf = C.edit ? `<div class="card iv-rmq noprint"><div class="dcx-et"><h3>${ico("plus")} ${bi("দৈনিক এন্ট্রি — দুটো একসাথে", "Daily entry — both together")}</h3><span class="mut xs">${bi("Enter চাপলে পরের ঘর · শেষ ঘরে Enter = সেভ · একই তারিখ আবার দিলে বদলে যাবে", "Enter moves on · Enter on the last box saves · the same date again replaces it")}</span></div>
      <div class="iv-rq"><div><label class="f">${bi("তারিখ", "Date")}</label><input class="in big" type="date" id="rq-d" value="${today() >= f && today() <= t ? today() : t}" max="${today()}"></div>${ps.map(p => `<div class="iv-rqp"><b>${esc(p.name)}</b><div class="iv-rq2"><div><label class="f">Ready (bag)</label><input class="in big num rqi" data-c="${p.code}" data-k="r" inputmode="decimal" autocomplete="off"></div><div><label class="f">Delivery (bag)</label><input class="in big num rqi" data-c="${p.code}" data-k="x" inputmode="decimal" autocomplete="off"></div></div><small class="mut" data-sk="${p.code}"></small></div>`).join("")}<div class="wide"><label class="f">${bi("মন্তব্য", "Remarks")}</label><input class="in big rqi" id="rq-m" autocomplete="off"></div><div class="bt"><button class="btn pri big" id="rq-s">${ico("check")} ${bi("সেভ", "Save")}</button></div></div><div class="hint rd iv-err" id="rq-e"></div></div>` : "";
    return qf + `<div class="iv-rm2">${ps.map(p => card(p.code, f, t)).join("")}</div><div class="iv-ckg">${bi("মোট স্টক (দুটো মিলিয়ে)", "Total stock (both)")}: <b class="num">${ivQ(ckg)} kg</b></div>
      <div class="card flush"><div class="ch"><h3>${bi("দৈনিক হিসাব", "Daily")}</h3><span class="tag">${dates.length}</span></div>${dates.length ? `<div class="tw"><table class="iv-rmt"><thead><tr><th rowspan="2">${bi("তারিখ", "Date")}</th>${ps.map(p => `<th colspan="3" class="c">${esc(p.name)} (bag)</th>`).join("")}</tr><tr>${ps.map(() => `<th class="r">Ready</th><th class="r">Delivery</th><th class="r">${bi("স্টক", "Stock")}</th>`).join("")}</tr></thead><tbody>${dates.map(d => `<tr><td class="nw">${dmy(d)}</td>${Ls.map(L => { const x = L.rows.find(r => r.date === d); return x ? `<td class="r num">${x.ready || ""}</td><td class="r num">${x.del || ""}</td><td class="r num b ${x.stock < 0 ? "iv-neg" : ""}">${ivQ(x.stock)}</td>` : `<td></td><td></td><td></td>`; }).join("")}</tr>`).join("")}</tbody></table></div>` : ivEmpty(bi("এই সময়ে কোনো এন্ট্রি নেই", "No entries in this period"))}</div>`;
  }
  function product(code, f, t) {
    const L = rmLedgerRows(code, f, t), p = L.p, lk = ivLocked(f) && F.m === "month";
    const form = C.edit ? `<div class="card iv-rmf noprint"><div class="iv-fg rm"><div><label class="f">${bi("তারিখ", "Date")}</label><input class="in" type="date" id="rf-d" value="${today() >= f && today() <= t ? today() : t}" max="${today()}"></div><div><label class="f">Ready (bag)</label><input class="in num" type="number" min="0" step="any" inputmode="decimal" id="rf-r"></div><div><label class="f">Delivery (bag)</label><input class="in num" type="number" min="0" step="any" inputmode="decimal" id="rf-x"></div><div class="wide"><label class="f">${bi("মন্তব্য", "Remarks")}</label><input class="in" id="rf-m"></div><div class="bt"><button class="btn pri" id="rf-s">${ico("check")} ${bi("সেভ", "Save")}</button></div></div><div class="mut xs iv-hn" id="rf-h"></div><div class="hint rd iv-err" id="rf-e"></div></div>` : "";
    return card(code, f, t) + form + `<div class="card flush"><div class="ch"><h3>${esc(p.name)} · ${bi("দৈনিক", "Daily")}</h3><span class="tag">${L.rows.length}</span></div>${L.rows.length ? `<div class="tw cards"><table class="iv-rmt"><thead><tr><th>${bi("তারিখ", "Date")}</th><th class="r">Ready</th><th class="r">Ready kg</th><th class="r">Delivery</th><th class="r">Delivery kg</th><th class="r">${bi("স্টক", "Stock")}</th><th class="r">${bi("স্টক kg", "Stock kg")}</th><th>${bi("মন্তব্য", "Remarks")}</th>${C.edit ? `<th class="noprint"></th>` : ""}</tr></thead><tbody><tr class="iv-op"><td>Opening</td><td colspan="4"></td><td class="r num b">${ivQ(L.open)}</td><td class="r num">${kg(p, L.open)}</td><td colspan="${C.edit ? 2 : 1}"></td></tr>${L.rows.map(x => `<tr class="${x.stock < 0 ? "iv-negr" : ""}"><td class="nw">${dmy(x.date)}</td><td class="r num">${x.ready ? ivQ(x.ready) : ""}</td><td class="r num mut">${x.ready ? kg(p, x.ready) : ""}</td><td class="r num">${x.del ? ivQ(x.del) : ""}</td><td class="r num mut">${x.del ? kg(p, x.del) : ""}</td><td class="r num b">${ivQ(x.stock)}</td><td class="r num">${kg(p, x.stock)}</td><td>${esc(x.remarks)}</td>${C.edit ? `<td class="r noprint">${ivLocked(x.date) ? "" : `<button class="btn sm" data-rd="${x.date}">${ico("edit")}</button>`}</td>` : ""}</tr>`).join("")}</tbody></table></div>` : ivEmpty(bi("এই সময়ে কোনো এন্ট্রি নেই", "No entries in this period"))}</div>`;
  }
  function ledger() {
    const ps = rmParties(); if (!F.party || !ps.includes(F.party)) F.party = ps[0] || "";
    const rows = F.party ? rmPartyRows(F.party) : [], last = rows.at(-1);
    const R = ivSum(rows, x => x.receive_bag), X = ivSum(rows, x => x.return_bag);
    return `<div class="card tbar iv-pl"><div class="row pflt"><div><label class="f">${bi("পার্টি", "Party")}</label><select class="in" id="rl-p">${ps.map(x => `<option ${x === F.party ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div></div><div class="mut xs">${bi("Receive = পার্টির কাছ থেকে নেওয়া ব্যাগ, Return = ফেরত দেওয়া। বাকি = মোট Receive − মোট Return।", "Receive = bags taken from the party, Return = bags given back. Payable = total receive − total return.")}</div></div>
      <div class="ksum iv-ks">${ivTile("#4f46e5", "dl", "Receive", ivQ(R) + " bag")}${ivTile("#059669", "check", "Return", ivQ(X) + " bag")}${ivTile("#dc2626", "clock", bi("বাকি (Payable)", "Payable"), ivQ(R - X) + " bag", last ? bi("শেষ এন্ট্রি ", "Last entry ") + dmy(last.date) : "")}</div>
      ${C.edit ? `<div class="card iv-rmf noprint"><div class="iv-fg rm"><div><label class="f">${bi("পার্টি", "Party")}</label><input class="in" id="lf-p" list="lf-dl" value="${esc(F.party || "AH Star Agro Limited")}">${ivDl("lf-dl", ps)}</div><div><label class="f">${bi("তারিখ", "Date")}</label><input class="in" type="date" id="lf-d" value="${today()}"></div><div><label class="f">Receive (bag)</label><input class="in num" type="number" min="0" step="any" id="lf-r"></div><div><label class="f">Return (bag)</label><input class="in num" type="number" min="0" step="any" id="lf-x"></div><div><label class="f">${bi("পণ্য", "Product")}</label><select class="in" id="lf-pr">${INV.rmp.map(p => `<option value="${p.code}">${esc(p.name)}</option>`).join("")}</select></div><div class="bt"><button class="btn pri" id="lf-s">${ico("plus")} ${bi("যোগ করুন", "Add")}</button></div></div><div class="hint rd iv-err" id="lf-e"></div></div>` : ""}
      <div class="card flush"><div class="ch"><h3>${esc(F.party || "—")}</h3><span class="tag">${rows.length}</span></div>${rows.length ? `<div class="tw cards"><table class="iv-rmt"><thead><tr><th>${bi("তারিখ", "Date")}</th><th>${bi("পণ্য", "Product")}</th><th class="r">Receive</th><th class="r">Return</th><th class="r">${bi("বাকি", "Payable")}</th><th>${bi("মন্তব্য", "Remarks")}</th>${C.admin ? `<th class="noprint"></th>` : ""}</tr></thead><tbody>${rows.map(x => `<tr><td class="nw">${dmy(x.date)}</td><td>${esc(INV.rmp.find(p => p.code === x.product)?.name || x.product)}</td><td class="r num">${+x.receive_bag ? ivQ(x.receive_bag) : ""}</td><td class="r num">${+x.return_bag ? ivQ(x.return_bag) : ""}</td><td class="r num b">${ivQ(x.bal)}</td><td>${esc(x.remarks || "")}</td>${C.admin ? `<td class="r noprint">${ivLocked(x.date) ? "" : `<button class="btn sm rdo" data-ld="${x.id}" title="${bi("মুছুন", "Delete")}">${ico("trash")}</button>`}</td>` : ""}</tr>`).join("")}</tbody></table></div>` : ivEmpty(bi("কোনো এন্ট্রি নেই", "No entries"))}</div>`;
  }
  function draw() {
    const [f, t] = pbRange(F); seg();
    $("#rm-lk", v).innerHTML = F.m === "month" && F.tab !== "led" ? ivLockNote(f) : "";
    out.innerHTML = F.tab === "all" ? combined(f, t) : F.tab === "led" ? ledger() : product(F.tab, f, t);
    labelTables(out);
    if (F.tab !== "all" && F.tab !== "led" && C.edit) {
      const code = F.tab, fill = () => { const d = $("#rf-d", out).value, x = INV.rmd.find(r => String(r.date).slice(0, 10) === d && r.product === code); $("#rf-r", out).value = x ? +x.ready_bag || "" : ""; $("#rf-x", out).value = x ? +x.delivery_bag || "" : ""; $("#rf-m", out).value = x?.remarks || ""; $("#rf-h", out).textContent = x ? bi("এই তারিখের এন্ট্রি আছে — সেভ করলে বদলে যাবে", "An entry exists for this date — saving will replace it") : ""; $("#rf-e", out).textContent = ivLocked(d) ? ivErr(new Error("month_locked")) : ""; };
      $("#rf-d", out).onchange = fill; fill();
      $$("[data-rd]", out).forEach(b => b.onclick = () => { $("#rf-d", out).value = b.dataset.rd; fill(); $("#rf-r", out).focus(); });
      $("#rf-s", out).onclick = async () => {
        const d = $("#rf-d", out).value, r = num($("#rf-r", out).value), x = num($("#rf-x", out).value), e = m => $("#rf-e", out).textContent = m;
        if (!d) return e(bi("তারিখ দিন", "Enter the date")); if (r < 0 || x < 0) return e(ivErr(new Error("negative_qty")));
        const ex = INV.rmd.find(z => String(z.date).slice(0, 10) === d && z.product === code);
        try {
          if (!r && !x && !$("#rf-m", out).value.trim()) { if (!ex) return e(bi("Ready বা Delivery দিন", "Enter ready or delivery")); if (!C.admin) return e(bi("এন্ট্রি মুছতে পারেন শুধু admin", "Only an admin can remove an entry")); await API.rmDailyDelete(d, code); }
          else await API.rmDailySave({ date: d, product: code, ready_bag: r, delivery_bag: x, remarks: $("#rf-m", out).value.trim() });
          rmPatch(d, code, r, x, $("#rf-m", out).value.trim()); const st = rmStockAt(code, d); toast(bi("✔ সেভ হয়েছে", "✔ Saved") + ` · ${bi("স্টক", "Stock")} ${ivQ(st)} bag`, st < 0 ? "err" : "ok"); draw();
        } catch (z) { e(ivErr(z)); }
      };
    }
    if (F.tab === "all" && C.edit && $("#rq-s", out)) {
      const ps = INV.rmp.filter(p => p.active !== false), ins = $$(".rqi", out);
      const fill = () => { const d = $("#rq-d", out).value; ps.forEach(p => { const x = INV.rmd.find(r => String(r.date).slice(0, 10) === d && r.product === p.code); $(`[data-c="${p.code}"][data-k="r"]`, out).value = x ? +x.ready_bag || "" : ""; $(`[data-c="${p.code}"][data-k="x"]`, out).value = x ? +x.delivery_bag || "" : ""; const sb = rmStockAt(p.code, addDays(d, -1)); $(`[data-sk="${p.code}"]`, out).textContent = bi(`আগের দিনের স্টক ${ivQ(sb)} bag`, `Stock the day before ${ivQ(sb)} bag`) + (x ? bi(" · এই তারিখের এন্ট্রি আছে", " · this date has an entry") : ""); }); const x0 = INV.rmd.find(r => String(r.date).slice(0, 10) === d && r.remarks); $("#rq-m", out).value = x0?.remarks || ""; $("#rq-e", out).textContent = ivLocked(d) ? ivErr(new Error("month_locked")) : ""; };
      $("#rq-d", out).onchange = fill; fill();
      ins.forEach((el, i) => el.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); i < ins.length - 1 ? ins[i + 1].focus() : $("#rq-s", out).click(); } });
      $("#rq-s", out).onclick = async () => {
        const d = $("#rq-d", out).value, m = $("#rq-m", out).value.trim(), e = t => $("#rq-e", out).textContent = t; if (!d) return e(bi("তারিখ দিন", "Enter the date"));
        const todo = []; for (const p of ps) { const r = evalAmt($(`[data-c="${p.code}"][data-k="r"]`, out).value), x = evalAmt($(`[data-c="${p.code}"][data-k="x"]`, out).value); if (isNaN(r) || isNaN(x) || r < 0 || x < 0) return e(ivErr(new Error("negative_qty"))); const ex = INV.rmd.find(z => String(z.date).slice(0, 10) === d && z.product === p.code); if (r || x || ex) todo.push({ p, r, x, ex }); }
        if (!todo.length) return e(bi("Ready বা Delivery দিন", "Enter ready or delivery"));
        $("#rq-s", out).disabled = true;
        try { for (const z of todo) { if (!z.r && !z.x) { if (!C.admin) continue; await API.rmDailyDelete(d, z.p.code); rmPatch(d, z.p.code, 0, 0, ""); } else { await API.rmDailySave({ date: d, product: z.p.code, ready_bag: z.r, delivery_bag: z.x, remarks: m }); rmPatch(d, z.p.code, z.r, z.x, m); } }
          const msg = ps.map(p => `${p.name.split(" ")[0]} ${ivQ(rmStockAt(p.code, d))}`).join(" · "); toast(bi("✔ সেভ হয়েছে · স্টক ", "✔ Saved · stock ") + msg, ps.some(p => rmStockAt(p.code, d) < 0) ? "err" : "ok"); draw(); setTimeout(() => { const nd = $("#rq-d", out); if (nd) { nd.value = addDays(d, 1) <= today() ? addDays(d, 1) : d; nd.dispatchEvent(new Event("change")); $(".rqi", out)?.focus(); } }, 0);
        } catch (z) { e(ivErr(z)); $("#rq-s", out).disabled = false; }
      };
    }
    if (F.tab === "led") {
      const p = $("#rl-p", out); if (p) p.onchange = () => { F.party = p.value; draw(); };
      const s = $("#lf-s", out); if (s) s.onclick = async () => {
        const g = id => $("#" + id, out).value.trim(), row = { party: g("lf-p"), date: g("lf-d"), receive_bag: num(g("lf-r")), return_bag: num(g("lf-x")), product: g("lf-pr") }, e = m => $("#lf-e", out).textContent = m;
        if (!row.party || !row.date) return e(bi("পার্টি ও তারিখ দিন", "Enter party and date")); if (!row.receive_bag && !row.return_bag) return e(bi("Receive বা Return দিন", "Enter receive or return"));
        try { await API.rmLedgerSave(row); await invLoad(true); F.party = row.party; toast(bi("✔ যোগ হয়েছে", "✔ Added")); draw(); } catch (z) { e(ivErr(z)); }
      };
      $$("[data-ld]", out).forEach(b => b.onclick = async () => { if (!confirm(bi("এন্ট্রিটি মুছবেন?", "Delete this entry?"))) return; try { await API.rmLedgerDelete(b.dataset.ld); await invLoad(true); draw(); } catch (z) { toast(ivErr(z), "err"); } });
    }
  }
  pbBind(v, "rmpb", F, draw);
  const op = $("#rm-op", v); if (op) op.onclick = () => modal(`<h2>${bi("Opening ও ব্যাগ সাইজ", "Opening & bag size")}</h2><div class="mut sm">${bi("Opening তারিখের পরের সব দৈনিক এন্ট্রি থেকে স্টক হিসাব হয়।", "Stock is counted from every daily entry after the opening date.")}</div>${INV.rmp.map(p => `<div class="iv-fg rmo" data-c="${p.code}"><div><label class="f">${bi("নাম", "Name")}</label><input class="in" data-k="name" value="${esc(p.name)}"></div><div><label class="f">kg / bag</label><input class="in" type="number" min="1" step="any" data-k="bag_kg" value="${+p.bag_kg}"></div><div><label class="f">${bi("Opening তারিখ", "Opening date")}</label><input class="in" type="date" data-k="opening_date" value="${String(p.opening_date).slice(0, 10)}"></div><div><label class="f">Opening (bag)</label><input class="in" type="number" step="any" data-k="opening_bag" value="${+p.opening_bag}"></div></div>`).join("")}<div class="hint rd iv-err" id="op-e"></div><div class="row iv-mb"><div class="sp"></div><button class="btn" id="op-x">${bi("বাতিল", "Cancel")}</button><button class="btn pri" id="op-s">${bi("সেভ", "Save")}</button></div>`, (root, close) => {
    $("#op-x", root).onclick = close;
    $("#op-s", root).onclick = async () => { try { for (const r of $$("[data-c]", root)) { const o = { code: r.dataset.c }; $$("[data-k]", r).forEach(i => o[i.dataset.k] = i.value); if (!(+o.bag_kg > 0) || !o.opening_date) throw new Error(bi("ব্যাগ সাইজ ও তারিখ ঠিক করে দিন", "Check bag size and date")); await API.rmProductSave(o); } await invLoad(true); close(); draw(); toast(bi("✔ সেভ হয়েছে", "✔ Saved")); } catch (x) { $("#op-e", root).textContent = ivErr(x); } };
  });
  $("#rm-xl", v).onclick = () => {
    const [f, t] = pbRange(F), sh = {};
    INV.rmp.forEach(p => { const L = rmLedgerRows(p.code, f, t); sh[p.name.slice(0, 28)] = [["Date", "Ready (bag)", "Ready (kg)", "Delivery (bag)", "Delivery (kg)", "Stock (bag)", "Stock (kg)", "Remarks"], ["Opening", "", "", "", "", L.open, L.open * p.bag_kg, ""], ...L.rows.map(x => [x.date, x.ready, x.ready * p.bag_kg, x.del, x.del * p.bag_kg, x.stock, x.stock * p.bag_kg, x.remarks])]; });
    rmParties().forEach(pt => sh[pt.slice(0, 28)] = [["Date", "Product", "Receive (bag)", "Return (bag)", "Payable (bag)", "Remarks"], ...rmPartyRows(pt).map(x => [x.date, x.product, +x.receive_bag, +x.return_bag, x.bal, x.remarks || ""])]);
    exportXlsx(sh, `RM_Factory_${f}_${t}.xlsx`);
  };
  draw();
}

/* =================== exceptions (shared by Dashboard + Report) =================== */
function ivExceptions(f, t) {
  const X = [], T0 = today();
  INV.orders.filter(o => ["pending", "today"].includes(o.status) && o.date <= t).forEach(o => { const d = ivDays(o.date, T0); if (d > 7) X.push({ k: "late", d: o.date, txt: `${o.ch === "nir" ? "Niramoy" : esc(ivPname(o))} · ${ivQ(o.total_qty)} ctn · ${d} ${bi("দিন ধরে Pending", "days pending")}`, ch: o.ch, n: d }); });
  INV.rmp.forEach(p => rmLedgerRows(p.code, f, t).rows.filter(x => x.stock < 0).forEach(x => X.push({ k: "neg", d: x.date, txt: `${esc(p.name)} · ${bi("স্টক", "stock")} ${ivQ(x.stock)} bag` })));
  const ms = [...new Set(INV.orders.filter(o => o.date >= f && o.date <= t).map(o => ivMon(o.date)))].filter(m => m >= ivMon(f));
  ms.forEach(m => ["dist", "nir"].forEach(ch => { const dm = ivDemandOf(ch, m); if (!Object.keys(dm).length) return; const tt = ivItemTotals(INV.orders.filter(o => o.ch === ch && ivInPeriod(o, m, ivMonEnd(m)))); Object.entries(dm).forEach(([id, q]) => { const o = tt[id]?.ord || 0; if (o > q) X.push({ k: "over", d: m, txt: `${ivMonName(m)} · ${esc(ivItemName(id))} · Demand ${ivQ(q)}, ${bi("অর্ডার", "ordered")} ${ivQ(o)} (+${ivQ(o - q)})` }); }); }));
  INV.orders.filter(o => o.status === "ok" && o.delivery_date && o.delivery_date < o.date).forEach(o => X.push({ k: "date", d: o.date, txt: `${esc(o.party || o.transport || "")} · ${bi("ডেলিভারির তারিখ অর্ডারের আগে", "delivery date before order date")}` }));
  return X.sort((a, b) => (a.d < b.d ? 1 : -1));
}
const IV_XK = { late: ["দেরিতে Pending", "Late pending", "#d97706"], neg: ["স্টক মাইনাস", "Negative stock", "#dc2626"], over: ["Demand-এর বেশি অর্ডার", "Over demand", "#7c3aed"], date: ["তারিখে ভুল", "Date error", "#0ea5e9"] };

/* =================== Inventory Dashboard =================== */
async function vInvDash(v) {
  const F = pbInit("month");
  v.innerHTML = head(ROUTES[CUR].t, `<a class="btn" href="#/ivrep">${ico("chart")} ${bi("রিপোর্ট", "Reports")}</a>${ivCan().edit ? `<a class="btn pri" href="#/ivdist">${ico("plus")} ${bi("অর্ডার", "Order")}</a>` : ""}`) + `<div class="card tbar noprint">${pbBar("idpb", F)}</div><div id="id-out"></div>`;
  const out = $("#id-out", v);
  function draw() {
    const [f, t] = pbRange(F), inR = o => ivInPeriod(o, f, t) && o.status !== "cancel";
    const D = INV.orders.filter(o => o.ch === "dist" && inR(o)), N = INV.orders.filter(o => o.ch === "nir" && inR(o));
    const Dok = D.filter(o => ivDelIn(o, f, t)), Dop = INV.orders.filter(o => o.ch === "dist" && o.status !== "cancel" && o.date <= t && !(o.status === "ok" && (o.delivery_date || o.date) <= t));
    const ms = F.m === "month" ? [ivMon(f)] : [], dem = ms.reduce((s, m) => s + Object.values(ivDemandOf("dist", m)).reduce((a, b) => a + (+b || 0), 0), 0);
    const stk = INV.rmp.map(p => ({ p, b: rmStockAt(p.code, t) })), pay = rmParties().map(pt => ({ pt, b: rmPartyRows(pt).filter(x => x.date <= t).at(-1)?.bal || 0 }));
    const X = ivExceptions(f, t), oq = ivSum(D, o => o.total_qty), dq = ivSum(Dok, o => o.total_qty);
    const pct = dem ? Math.min(100, Math.round(dq / dem * 100)) : 0;
    /* daily delivered value (both channels) */
    const days = []; for (let d = f; d <= t && days.length < 62; d = addDays(d, 1)) days.push(d);
    const dv = days.map(d => ivSum(INV.orders.filter(o => o.status === "ok" && (o.delivery_date || o.date) === d), o => o.value)), mx = Math.max(1, ...dv);
    const bars = F.m === "day" ? "" : `<div class="card iv-dc"><div class="ch"><h3>${bi("দৈনিক ডেলিভারি মূল্য", "Daily delivered value")}</h3><span class="mut sm">৳ ${money0(dv.reduce((a, b) => a + b, 0))}</span></div><div class="iv-bw"><span class="iv-bm">৳ ${money0(mx)}</span><div class="iv-bars">${dv.map((x, i) => `<span title="${dmy(days[i])} · ৳ ${money0(x)}" style="height:${Math.max(2, x / mx * 100)}%" class="${x ? "" : "z"}"></span>`).join("")}</div></div><div class="iv-bx"><span>${pbFmt(days[0])}</span><span>${pbFmt(days.at(-1))}</span></div></div>`;
    const dm = ms.length ? ivDemandOf("dist", ms[0]) : {}, it = ivItemTotals(D, f, t), top = Object.keys(dm).length ? Object.keys(dm).sort((a, b) => dm[b] - dm[a]).slice(0, 8) : Object.keys(it).sort((a, b) => it[b].ord - it[a].ord).slice(0, 8);
    const prog = `<div class="card iv-dc"><div class="ch"><h3>${Object.keys(dm).length ? bi("আইটেম: Demand বনাম ডেলিভারি", "Items: demand vs delivered") : bi("সবচেয়ে বেশি অর্ডার হওয়া আইটেম", "Top ordered items")}</h3><a class="mut sm" href="#/ivdist">${bi("সব দেখুন", "See all")} ›</a></div>${top.length ? top.map(id => { const tg = +dm[id] || it[id]?.ord || 0, dl = it[id]?.del || 0, od = it[id]?.ord || 0, w = tg ? Math.min(100, dl / tg * 100) : 0, w2 = tg ? Math.min(100, od / tg * 100) : 0; return `<div class="iv-pr"><div class="iv-prl"><span>${esc(ivItemName(id))}</span><b class="num">${ivQ(dl)} / ${ivQ(tg)}</b></div><div class="iv-prb"><i class="o" style="width:${w2}%"></i><i style="width:${w}%"></i></div></div>`; }).join("") + `<div class="iv-lg"><span><i></i>${bi("ডেলিভারি", "Delivered")}</span><span><i class="o"></i>${bi("অর্ডার", "Ordered")}</span></div>` : ivEmpty(bi("কিছু নেই", "Nothing yet"))}</div>`;
    const late = Dop.filter(o => ivDays(o.date, today()) > 3).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
    out.innerHTML = `<div class="iv-gl">${bi("ডিস্ট্রিবিউশন ও নিরাময়", "Distribution & Niramoy")}</div><div class="ksum iv-ks iv-dk">
        ${ivTile("#4f46e5", "ivcart", bi("ডিস্ট্রিবিউশন অর্ডার", "Distribution orders"), D.length, `${ivQ(oq)} ctn · ৳ ${money0(ivSum(D, o => o.value))}`)}
        ${ivTile("#059669", "check", bi("ডেলিভারি হয়েছে", "Delivered"), "৳ " + money0(ivSum(Dok, o => o.value)), `${ivQ(dq)} ctn${dem ? ` · Demand-এর ${pct}%`.replace("Demand-এর", bi("Demand-এর", "of demand")) : ""}`)}
        ${ivTile("#d97706", "clock", bi("ডেলিভারি বাকি", "Pending delivery"), ivQ(ivSum(Dop, o => o.total_qty)) + " ctn", `${Dop.length} ${bi("অর্ডার", "orders")} · ৳ ${money0(ivSum(Dop, o => o.value))}`)}
        ${ivTile("#0ea5e9", "ivtruck", bi("নিরাময়", "Niramoy"), "৳ " + money0(ivSum(N, o => o.value)), `${N.length} ${bi("ট্রিপ", "trips")} · ${ivQ(ivSum(N, o => o.total_qty))} ctn · ${bi("ভাড়া", "rent")} ৳ ${money0(ivSum(N, o => o.rent))}`)}
        </div><div class="iv-gl">${bi("ফ্যাক্টরি স্টক ও পাওনা", "Factory stock & payable")}</div><div class="ksum iv-ks iv-dk iv-f">
        ${stk.map(x => ivTile(x.b < 0 ? "#dc2626" : "#7c3aed", "ivfac", esc(x.p.name), ivQ(x.b) + " bag", `${ivQ(x.b * x.p.bag_kg)} kg · ${dmy(t > today() ? today() : t)}`)).join("")}
        ${pay.map(x => ivTile("#64748b", "users", esc(x.pt), ivQ(x.b) + " bag", bi("বাকি (Receive − Return)", "Payable (receive − return)"))).join("")}
      </div>
      ${dem ? `<div class="card iv-goal"><div class="iv-prl"><span>${bi("মাসের Demand পূরণ", "Monthly demand met")} · ${ivMonName(f)}</span><b class="num">${ivQ(dq)} / ${ivQ(dem)} ctn · ${pct}%</b></div><div class="iv-prb big"><i class="o" style="width:${Math.min(100, oq / dem * 100)}%"></i><i style="width:${pct}%"></i></div></div>` : ""}
      <div class="iv-dg"><div class="iv-col">${bars}<div class="card iv-dc"><div class="ch"><h3>${bi("পুরনো Pending অর্ডার", "Oldest pending orders")}</h3><a class="mut sm" href="#/ivrep">${bi("সব", "All")} ›</a></div>${late.length ? `<div class="iv-ll">${late.map(o => `<a href="#/ivdist" class="iv-li"><span><b>${esc(ivPname(o))}</b><small class="mut">${dmy(o.date)} · ${esc(o.asm || "")}</small></span><span class="r"><b class="num">${ivQ(o.total_qty)}</b><small class="iv-age ${ivDays(o.date, today()) > 7 ? "late" : ""}">${ivDays(o.date, today())} ${bi("দিন", "days")}</small></span></a>`).join("")}</div>` : ivEmpty(bi("৩ দিনের বেশি পুরনো Pending নেই", "No pending orders older than 3 days"))}</div></div><div class="iv-col">${prog}<div class="card iv-dc"><div class="ch"><h3>${bi("সতর্কতা", "Alerts")}</h3><span class="tag">${X.length}</span></div>${X.length ? `<div class="iv-ll">${X.slice(0, 8).map(x => `<div class="iv-xi" style="--xc:${IV_XK[x.k][2]}"><i></i><span><small>${bi(IV_XK[x.k][0], IV_XK[x.k][1])} · ${x.d.length > 7 ? dmy(x.d) : x.d}</small>${x.txt}</span></div>`).join("")}</div>` : ivEmpty(bi("সব ঠিক আছে ✓", "All clear ✓"))}</div></div>
      </div>`;
    labelTables(out);
  }
  pbBind(v, "idpb", F, draw); await ivBoot(draw, e => out.innerHTML = `<div class="alert rd">${esc(ivErr(e))}</div>`);
}

/* =================== Status & Report (A4 sheets) + month lock =================== */
async function vInvRep(v) {
  const C = ivCan(), F = Object.assign(pbInit("month"), { r: "status" });
  v.innerHTML = head(ROUTES[CUR].t, `${repBtns("ir")}<button class="btn" id="ir-xl">${ico("dl")} Excel</button>`) +
    `<div class="card tbar noprint">${pbBar("irpb", F)}</div>${ivSeg("ir-tab", [["status", bi("Pending অবস্থা", "Pending status")], ["dist", bi("ডিস্ট্রিবিউশন", "Distribution")], ["nir", bi("নিরাময়", "Niramoy")], ["rm", bi("আরএম ফ্যাক্টরি", "RM Factory")], ["exc", bi("সতর্কতা", "Alerts")]], F.r)}
    <div class="card rep-wrap"><div class="rep-scroll"><div id="ir-out"></div></div></div>${C.admin ? `<div class="card noprint" id="ir-lock"></div>` : ""}`;
  const out = $("#ir-out", v); let cur = null;
  try { await invLoad(); dpLoad().catch(() => { }); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(ivErr(e))}</div>`; return; }
  const tr2 = (cells, cls = "") => `<tr class="${cls}">${cells.map((c, i) => `<td class="${i ? "r num" : ""}">${c}</td>`).join("")}</tr>`;
  function build() {
    const [f, t] = pbRange(F), inR = o => ivInPeriod(o, f, t);
    if (F.r === "status") {
      const P = INV.orders.filter(o => ["pending", "today"].includes(o.status) && o.date <= t).sort((a, b) => a.date.localeCompare(b.date));
      const age = o => ivDays(o.date, today()), b = [[0, 3], [4, 7], [8, 15], [16, 9999]], bl = ["0–3", "4–7", "8–15", "15+"];
      const ib = ivItemTotals(P);
      cur = { name: "Pending_Status", xl: { Pending: [["Order date", "Channel", "Party", "Location", "ASM", "Items", "Qty", "Value", "Status", "Days"], ...P.map(o => [o.date, o.ch, ivPname(o), o.location, o.asm, Object.entries(o.lines).map(([k, l]) => `${ivItemName(k)} ${l.q}`).join(", "), o.total_qty, o.value, o.status, age(o)])] } };
      return repSheet("ir-in", "Inventory · Pending Status (as of " + dmy(t > today() ? today() : t) + ")", f, t,
        repKpi([["Pending orders", P.length, "k1"], ["Pending qty (ctn)", ivQ(ivSum(P, o => o.total_qty)), "k2"], ["Pending value", "৳ " + money0(ivSum(P, o => o.value)), "k3"], ["Older than 7 days", P.filter(o => age(o) > 7).length, ""]]),
        repTwo(repBox("By age (days)", ["Days", "Orders", "Qty", "Value"], b.map(([a, z], i) => { const g = P.filter(o => age(o) >= a && age(o) <= z); return tr2([bl[i], g.length, ivQ(ivSum(g, o => o.total_qty)), money0(ivSum(g, o => o.value))]); }).join("")),
          repBox("By item", ["Item", "Pending qty", "Value"], Object.keys(ib).sort((a, b) => ib[b].pend - ib[a].pend).map(id => tr2([esc(ivItemName(id)), ivQ(ib[id].pend), money0(ib[id].val)])).join(""))) +
        repOne(repBox("Pending orders — oldest first", ["~Order date", "~Party", "~ASM", "Qty", "Value", "Days"], P.map(o => `<tr><td>${dmy(o.date)}</td><td>${esc(ivPname(o))}${o.location ? ` <small>· ${esc(o.location)}</small>` : ""}</td><td>${esc(o.asm || "")}</td><td class="r num">${ivQ(o.total_qty)}</td><td class="r num">${money0(o.value)}</td><td class="r num ${age(o) > 7 ? "b" : ""}">${age(o)}</td></tr>`).join(""), P.length ? `<tr class="tot"><td colspan="3">TOTAL</td><td class="r num">${ivQ(ivSum(P, o => o.total_qty))}</td><td class="r num">${money0(ivSum(P, o => o.value))}</td><td></td></tr>` : "")));
    }
    if (F.r === "dist" || F.r === "nir") {
      const ch = F.r, nir = ch === "nir", L = INV.orders.filter(o => o.ch === ch && inR(o)), live = L.filter(o => o.status !== "cancel"), ok = live.filter(o => ivDelIn(o, f, t)), it = ivItemTotals(L, f, t);
      const g = key => { const m = {}; live.forEach(o => { const k = (key === "party" ? ivPname(o) : o[key]) || "—", x = m[k] ||= { n: 0, q: 0, v: 0, dv: 0, r: 0 }; x.n++; x.q += o.total_qty; x.v += o.value; x.r += +o.rent || 0; if (ivDelIn(o, f, t)) x.dv += o.value; }); return Object.entries(m).sort((a, b) => b[1].v - a[1].v); };
      const ms = F.m === "month" ? [ivMon(f)] : [], dm = ms.length ? ivDemandOf(ch, ms[0]) : {};
      const ids = [...new Set([...Object.keys(it), ...Object.keys(dm)])].sort((a, b) => (INV.byId[a]?.sort ?? 100) - (INV.byId[b]?.sort ?? 100) || a - b);
      cur = { name: nir ? "Niramoy_Report" : "Distribution_Report", xl: { Items: [["Item", "Demand", "Ordered", "Delivered", "Pending", "Delivered value"], ...ids.map(id => [ivItemName(id), +dm[id] || 0, it[id]?.ord || 0, it[id]?.del || 0, it[id]?.pend || 0, it[id]?.dval || 0])], [nir ? "Transport" : "Party"]: [[nir ? "Transport" : "Party", "Count", "Qty", "Value", nir ? "Rent" : "Delivered value"], ...g(nir ? "transport" : "party").map(([k, x]) => [k, x.n, x.q, x.v, nir ? x.r : x.dv])] } };
      if (!nir) cur.xl.ASM = [["ASM", "Orders", "Qty", "Value", "Delivered value"], ...g("asm").map(([k, x]) => [k, x.n, x.q, x.v, x.dv])];
      return repSheet("ir-in", nir ? "Inventory · Niramoy Delivery Report" : "Inventory · Distribution Report", f, t,
        repKpi(nir ? [["Trips", live.length, "k1"], ["Qty (ctn)", ivQ(ivSum(live, o => o.total_qty)), "k2"], ["Value", "৳ " + money0(ivSum(live, o => o.value)), "k3"], ["Rent", "৳ " + money0(ivSum(live, o => o.rent)), ""]]
          : [["Orders", live.length, "k1"], ["Ordered (ctn)", ivQ(ivSum(live, o => o.total_qty)), "k2"], ["Delivered", "৳ " + money0(ivSum(ok, o => o.value)), "k3"], ["Pending (ctn)", ivQ(ivSum(live.filter(o => !ivDelIn(o, f, t)), o => o.total_qty)), ""]]),
        repOne(repBox("By item", ["Item", ...(ms.length ? ["Demand"] : []), "Ordered", "Delivered", "Pending", "Delivered ৳"], ids.map(id => tr2([esc(ivItemName(id)), ...(ms.length ? [dm[id] ? ivQ(dm[id]) : "—"] : []), ivQ(it[id]?.ord || 0), ivQ(it[id]?.del || 0), ivQ(it[id]?.pend || 0), money0(it[id]?.dval || 0)])).join(""),
          ids.length ? `<tr class="tot"><td>TOTAL</td>${ms.length ? `<td class="r num">${ivQ(Object.values(dm).reduce((a, b) => a + (+b || 0), 0))}</td>` : ""}<td class="r num">${ivQ(ivSum(ids, id => it[id]?.ord))}</td><td class="r num">${ivQ(ivSum(ids, id => it[id]?.del))}</td><td class="r num">${ivQ(ivSum(ids, id => it[id]?.pend))}</td><td class="r num">${money0(ivSum(ids, id => it[id]?.dval))}</td></tr>` : "")) +
        (nir ? repOne(repBox("By transport", ["Transport", "Trips", "Qty", "Value", "Rent"], g("transport").map(([k, x]) => tr2([esc(k), x.n, ivQ(x.q), money0(x.v), money0(x.r)])).join("")))
          : repTwo(repBox("Top parties", ["Party", "Orders", "Qty", "Value"], g("party").slice(0, 25).map(([k, x]) => tr2([esc(k), x.n, ivQ(x.q), money0(x.v)])).join("")), repBox("By ASM / RSM", ["ASM", "Orders", "Qty", "Value"], g("asm").map(([k, x]) => tr2([esc(k), x.n, ivQ(x.q), money0(x.v)])).join("")))));
    }
    if (F.r === "rm") {
      const Ls = INV.rmp.map(p => ({ p, L: rmLedgerRows(p.code, f, t) }));
      cur = { name: "RM_Factory_Report", xl: Object.fromEntries(Ls.map(({ p, L }) => [p.name.slice(0, 28), [["Date", "Ready", "Delivery", "Stock", "Stock kg", "Remarks"], ["Opening", "", "", L.open, L.open * p.bag_kg, ""], ...L.rows.map(x => [x.date, x.ready, x.del, x.stock, x.stock * p.bag_kg, x.remarks])]])) };
      const sm = Ls.map(({ p, L }) => { const R = ivSum(L.rows, x => x.ready), D = ivSum(L.rows, x => x.del), c = L.open + R - D; return { p, L, R, D, c }; });
      return repSheet("ir-in", "Inventory · RM Factory (Bulta, Rupganj)", f, t,
        repKpi(sm.map(x => [x.p.name + " stock", `${ivQ(x.c)} bag · ${ivQ(x.c * x.p.bag_kg)} kg`, x.c < 0 ? "k2" : "k3"]).concat([["Total stock (kg)", ivQ(ivSum(sm, x => x.c * x.p.bag_kg)), "k1"]])),
        repOne(repBox("Summary (bags)", ["Product", "Opening", "Ready", "Delivery", "Closing", "Closing kg"], sm.map(x => tr2([esc(x.p.name), ivQ(x.L.open), ivQ(x.R), ivQ(x.D), ivQ(x.c), ivQ(x.c * x.p.bag_kg)])).join(""))) +
        repTwo(...sm.map(x => repBox(x.p.name + " — daily", ["~Date", "Ready", "Delivery", "Stock"], x.L.rows.map(r => `<tr><td>${dmy(r.date)}</td><td class="r num">${r.ready || ""}</td><td class="r num">${r.del || ""}</td><td class="r num ${r.stock < 0 ? "b" : ""}">${ivQ(r.stock)}</td></tr>`).join("")))) +
        rmParties().map(pt => { const rows = rmPartyRows(pt).filter(x => x.date <= t); return repOne(repBox(pt + " — payable ledger", ["~Date", "Receive", "Return", "Payable"], rows.map(r => `<tr><td>${dmy(r.date)}</td><td class="r num">${+r.receive_bag || ""}</td><td class="r num">${+r.return_bag || ""}</td><td class="r num b">${ivQ(r.bal)}</td></tr>`).join(""))); }).join(""));
    }
    const X = ivExceptions(f, t);
    cur = { name: "Inventory_Alerts", xl: { Alerts: [["Type", "Date", "Detail"], ...X.map(x => [IV_XK[x.k][1], x.d, x.txt.replace(/<[^>]+>/g, "")])] } };
    return repSheet("ir-in", "Inventory · Alerts & exceptions", f, t, repKpi(Object.keys(IV_XK).map(k => [IV_XK[k][1], X.filter(x => x.k === k).length, ""])),
      repOne(repBox("Alerts", ["~Type", "~Date", "~Detail"], X.map(x => `<tr><td>${IV_XK[x.k][1]}</td><td>${x.d.length > 7 ? dmy(x.d) : x.d}</td><td>${x.txt}</td></tr>`).join(""))));
  }
  function locks() {
    const box = $("#ir-lock", v); if (!box) return;
    const ms = [...new Set([...INV.orders.map(o => ivMon(o.date)), ...INV.rmd.map(x => ivMon(String(x.date))), ...INV.locks.map(l => String(l.month).slice(0, 10))])].sort().reverse().slice(0, 12);
    box.innerHTML = `<div class="ch"><h3>${ico("ivlock")} ${bi("মাস Lock", "Month lock")}</h3></div><div class="mut sm">${bi("Lock করা মাসে কেউ (admin-ও) নতুন এন্ট্রি, বদল বা মুছতে পারবে না। ভুল ঠিক করতে আগে Unlock করুন।", "Nobody (admins included) can add, change or delete anything in a locked month. Unlock it first to correct a mistake.")}</div><div class="iv-locks">${ms.map(m => { const L = INV.locks.find(l => String(l.month).slice(0, 10) === m); return `<div class="iv-lki ${L ? "on" : ""}"><span><b>${ivMonName(m)}</b><small class="mut">${L ? bi("Lock করেছেন ", "Locked by ") + esc(L.locked_by || "") : bi("খোলা", "Open")}</small></span><button class="btn sm ${L ? "" : "pri"}" data-lm="${m}" data-on="${L ? 1 : 0}">${L ? bi("Unlock", "Unlock") : bi("Lock", "Lock")}</button></div>`; }).join("")}</div>`;
    $$("[data-lm]", box).forEach(b => b.onclick = async () => { const m = b.dataset.lm, on = b.dataset.on === "1"; if (!confirm(on ? bi(`${ivMonName(m)} Unlock করবেন?`, `Unlock ${ivMonName(m)}?`) : bi(`${ivMonName(m)} Lock করবেন? এরপর এই মাসে কিছু বদলানো যাবে না।`, `Lock ${ivMonName(m)}? Nothing in this month can be changed afterwards.`))) return; try { on ? await API.invUnlock(m) : await API.invLock(m); await invLoad(true); toast(on ? bi("✔ Unlock হয়েছে", "✔ Unlocked") : bi("✔ Lock হয়েছে", "✔ Locked")); locks(); } catch (e) { toast(ivErr(e), "err"); } });
  }
  function draw() { out.innerHTML = build(); dcFit(v, "ir-in"); locks(); }
  pbBind(v, "irpb", F, draw); ivSegBind(v, "ir-tab", F, "r", draw);
  const unb = repBind(v, "ir", "ir-in", () => `${cur?.name || "Inventory"}_${pbRange(F).join("_")}`, () => cur?.name.replace(/_/g, " ") || "");
  $("#ir-xl", v).onclick = () => cur && exportXlsx(cur.xl, `${cur.name}_${pbRange(F).join("_")}.xlsx`);
  draw(); return unb;
}

Object.assign(AU_T, { inv_orders: "ইনভেন্টরি অর্ডার", inv_items: "ইনভেন্টরি আইটেম", inv_demand: "ইনভেন্টরি Demand", rm_daily: "আরএম দৈনিক", rm_products: "আরএম পণ্য", rm_ledger: "আরএম খাতা", inv_locks: "ইনভেন্টরি Lock" });
/* if app.js already drew the shell before this file loaded, redraw so the new group shows */
if (typeof S !== "undefined" && S.me && $("#view")) { shell(); route(); }
