/* NABIAD — INVENTORY (v6.71)
   Dashboard · Niramoy · Distribution · RM Factory (Tamarind + Wood) · Status & Report
   Loaded after app.js; uses its helpers (head, pbBar, repSheet, exportXlsx, modal, suggest, bi …).
   Model: orders / trips with item lines {itemId:{q,r}} (rate kept per order), monthly demand,
   RM daily ready/delivery (bags) with opening per product, month locks. */
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
const ivSearch = value => String(value ?? "").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
const ivPendingAt = (o, date) => o.date <= date && (["pending", "today"].includes(o.status) || (o.status === "ok" && (o.delivery_date || o.date) > date));
const ivMon = d => d.slice(0, 7) + "-01";
const ivMonEnd = m => { const d = new Date(m.slice(0, 7) + "-01T00:00:00"); d.setMonth(d.getMonth() + 1); d.setDate(0); return iso(d); };
const ivMonName = m => new Date(m.slice(0, 7) + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const ivQ = n => (n === null || n === undefined || isNaN(n)) ? "0" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const ivDays = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);
const ivErr = e => /42P01|PGRST205/.test(e.code || "") || /schema cache|relation .* does not exist/i.test(e.message || "")
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
Object.assign(SbAPI, {
  async ovdAll() {
    const [opening, sales] = await Promise.all([fetchAll("dist_opening", "id"), fetchAll("dist_sales_reg", "id")]);
    return { opening: opening.map(o => ({ ...o, opening: Number(o.opening) })), sales: sales.map(x => ({ ...x, amount: Number(x.amount) })) };
  },
  async ovdLink(name, pid) {
    for (const t of ["dist_opening", "dist_sales_reg"]) { const { error } = await sb.from(t).update({ party_id: pid }).eq("party_name", name).is("party_id", null); if (error) throw error; }
  },
  async invAll() {
    const [items, orders, demand, rmp, rmd, locks] = await Promise.all([
      fetchAll("inv_items", "sort"), fetchAll("inv_orders", "date"), fetchAll("inv_demand", "month"),
      fetchAll("rm_products", "sort"), fetchAll("rm_daily", "date"), fetchAll("inv_locks", "month")]);
    return { items, orders: orders.map(ivRow), demand, rmp, rmd, locks };
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
  async invDemandSave(ch, month, lines) { const { error } = await sb.from("inv_demand").upsert({ ch, month, lines, entered_by: S.me.name }, { onConflict: "ch,month" }); if (error) throw error; },
  async rmProductSave(p) { const { error } = await sb.from("rm_products").update({ name: p.name, bag_kg: +p.bag_kg, opening_date: p.opening_date, opening_bag: +p.opening_bag || 0 }).eq("code", p.code); if (error) throw error; },
  async rmDailySave(r) { await this.rmDailySaveMany([r]); },
  async rmDailySaveMany(rows) {
    const data = rows.map(r => ({ ...r, remarks: r.remarks || null, entered_by: S.me.name }));
    const { error } = await sb.from("rm_daily").upsert(data, { onConflict: "date,product" });
    if (error) throw error;
  },
  async rmDailyDelete(date, product) { const { error } = await sb.from("rm_daily").delete().eq("date", date).eq("product", product); if (error) throw error; },
  async invLock(month) { const { error } = await sb.from("inv_locks").insert({ month, locked_by: S.me.name }); if (error && error.code !== "23505") throw error; },
  async invUnlock(month) { const { error } = await sb.from("inv_locks").delete().eq("month", month); if (error) throw error; }
});
/* demo: same rules as the database (role, lock, totals) so the UI behaves the same offline */
Object.assign(DemoAPI, {
  async ivStore() {
    if (!demoStore.inv) {
      let s = null; try { s = await (await fetch("dev/inv/inv_seed.json")).json(); } catch { }
      const st = { items: [], orders: [], demand: [], rmp: [{ code: "tamarind", name: "Tamarind Powder", bag_kg: 50, opening_date: "2026-09-30", opening_bag: 0, sort: 1, active: true }, { code: "wood", name: "Wood Powder", bag_kg: 40, opening_date: "2026-09-30", opening_bag: 0, sort: 2, active: true }], rmd: [], locks: [] };
      if (s) Object.assign(st, { items: s.items, demand: s.demand, rmp: s.rmp, rmd: s.rmd, orders: s.orders.map(o => { const { xl_value, xl_row, src, ...r } = o; return ivCalc({ id: crypto.randomUUID(), vehicle: null, rent: null, entered_by: "Excel import", created_at: o.date + "T09:00:00Z", ...r }); }) });
      demoStore.inv = st; this.save();
    }
    return demoStore.inv;
  },
  ivGuard(dates, staffOk = true, action = "edit") {
    if (!(staffOk ? moduleCan("inventory", action) : S.me.role === "admin")) throw writeDenied();
    const L = demoStore.inv.locks.map(x => x.month); if (dates.some(d => d && L.includes(ivMon(d)))) throw new Error("month_locked");
  },
  async ovdAll() {
    const s = demoStore.ovd ||= (() => { const P = (DPARTY || []).slice(0, 8), op = P.map((p, i) => ({ id: i + 1, party_name: p.name, party_id: p.id, opening: (i + 1) * 25000, note: i === 6 ? "NEW" : "", as_of: "2026-01-01" })); op.push({ id: 99, party_name: "Demo Unlinked Store-Test", party_id: null, opening: 12345, note: "", as_of: "2026-01-01" }); const sales = []; P.forEach((p, i) => { sales.push({ id: i * 2 + 1, sale_date: "2026-03-10", party_name: p.name, party_id: p.id, voucher_no: "D" + i, amount: 100000 + i * 5000 }, { id: i * 2 + 2, sale_date: "2026-11-10", party_name: p.name, party_id: p.id, voucher_no: "E" + i, amount: 40000 }); }); sales.push({ id: 999, sale_date: "2026-11-17", party_name: "Demo Unlinked Store-Test", party_id: null, voucher_no: "U1", amount: 5000 }); return { opening: op, sales }; })();
    return JSON.parse(JSON.stringify(s));
  },
  async ovdLink(name, pid) { const s = demoStore.ovd; this.ivGuard([], false); s.opening.forEach(o => { if (o.party_name === name) o.party_id = pid; }); s.sales.forEach(x => { if (x.party_name === name) x.party_id = pid; }); this.save(); },
  async invAll() { const { items, orders, demand, rmp, rmd, locks } = await this.ivStore(); return JSON.parse(JSON.stringify({ items, orders, demand, rmp, rmd, locks })); },
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
    this.ivGuard([o.date, old?.date], true, old ? "edit" : "entry");
    if (old && S.me.role !== "admin" && old.status === "cancel") throw new Error("policy");
    const row = ivCalc({ ch: o.ch, date: o.date, party: o.party || null, party_id: o.party_id || null, location: o.location || null, asm: o.asm || null, transport: o.transport || null, vehicle: o.vehicle || null, rent: o.rent === "" || o.rent == null ? null : +o.rent, lines: JSON.parse(JSON.stringify(o.lines)), free: o.free || null, remarks: o.remarks || null, status: o.status, delivery_date: o.delivery_date || null });
    const key = r => `${r.ch === "nir" ? "Niramoy" : "Order"} ${r.date} · ${r.party || r.transport || ""} · ${r.value} (${r.status})`;
    if (old) { this.aud("inv_orders", "update", key(row), { ...old }, { ...old, ...row }); Object.assign(old, row, { updated_at: new Date().toISOString() }); this.save(); return { ...old }; }
    const n = { id: crypto.randomUUID(), ...row, entered_by: S.me.name, created_at: new Date().toISOString() }; s.orders.push(n); this.aud("inv_orders", "insert", key(n), null, n); this.save(); return { ...n };
  },
  async invOrderStatus(ids, status, dd) {
    const s = await this.ivStore(), out = [];
    for (const id of ids) { const o = s.orders.find(x => x.id === id); if (!o) continue; this.ivGuard([o.date]); if (S.me.role !== "admin" && o.status === "cancel") continue; const before = { ...o }; o.status = status; o.delivery_date = status === "ok" ? (dd || today()) : null; ivCalc(o); this.aud("inv_orders", "update", `Order ${o.date} · ${o.party || ""} (${status})`, before, { ...o }); out.push({ ...o }); }
    this.save(); return out;
  },
  async invLinkParty(name, loc, pid) { const s = await this.ivStore(); this.ivGuard([], false); const out = []; s.orders.forEach(o => { if (o.ch === "dist" && o.party === name && !o.party_id && (o.location || null) === (loc || null) && !s.locks.some(l => l.month === ivMon(o.date))) { o.party_id = pid; out.push({ ...o }); } }); this.save(); return out; },
  async invOrderDelete(id) { const s = await this.ivStore(), o = s.orders.find(x => x.id === id); this.ivGuard([o?.date], false); s.orders = s.orders.filter(x => x.id !== id); this.aud("inv_orders", "delete", `Order ${o.date} · ${o.party || o.transport || ""}`, o, null); this.save(); },
  async invDemandSave(ch, month, lines) { const s = await this.ivStore(); const d = s.demand.find(x => x.ch === ch && x.month === month); this.ivGuard([month], true, d ? "edit" : "entry"); if (d) d.lines = lines; else s.demand.push({ ch, month, lines }); this.aud("inv_demand", d ? "update" : "insert", `Demand ${ch} ${month}`, null, { ch, month, lines }); this.save(); },
  async rmProductSave(p) { const s = await this.ivStore(); this.ivGuard([], false); Object.assign(s.rmp.find(x => x.code === p.code), { name: p.name, bag_kg: +p.bag_kg, opening_date: p.opening_date, opening_bag: +p.opening_bag || 0 }); this.save(); },
  async rmDailySave(r) { await this.rmDailySaveMany([r]); },
  async rmDailySaveMany(rows) {
    const s = await this.ivStore();
    for (const row of rows) this.ivGuard([row.date], true, s.rmd.some(d => d.date === row.date && d.product === row.product) ? "edit" : "entry");
    for (const row of rows) {
      const old = s.rmd.find(x => x.date === row.date && x.product === row.product);
      this.aud("rm_daily", old ? "update" : "insert", "RM " + row.product + " " + row.date, old ? { ...old } : null, row);
      if (old) Object.assign(old, row);
      else s.rmd.push(row);
    }
    this.save();
  },
  async rmDailyDelete(date, product) { const s = await this.ivStore(); this.ivGuard([date], false); s.rmd = s.rmd.filter(x => !(x.date === date && x.product === product)); this.save(); },
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
async function ivSetStatus(ids, status, date) {
  const orders = INV.orders.filter(o => ids.includes(o.id));
  if (status === "ok" && orders.some(o => date < o.date)) throw new Error(bi("ডেলিভারির তারিখ অর্ডারের আগে হতে পারে না", "Delivery date cannot be before the order date"));
  if (orders.some(o => ivLocked(o.date))) throw new Error("month_locked");
  const result = await API.invOrderStatus(ids, status, date);
  if (result.length !== ids.length) {
    ivPut(result);
    throw new Error(bi("সব নির্বাচিত অর্ডার আপডেট হয়নি। স্ট্যাটাস মিলিয়ে নিন।", "Some selected orders did not update. Check their status."));
  }
  return result;
}
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
function rmPatch(d, code, r, x, m, removed = false) { INV.rmd = INV.rmd.filter(z => !(String(z.date).slice(0, 10) === d && z.product === code)); if (!removed) INV.rmd.push({ date: d, product: code, ready_bag: r, delivery_bag: x, remarks: m || null }); }

/* ---------- shared UI pieces ---------- */
const ivCan = () => ({ admin: S.me.role === "admin", entry: moduleCan("inventory", "entry"), edit: moduleCan("inventory", "edit"), write: moduleOpen("inventory") });
const ivDl = (id, vals) => `<datalist id="${id}">${[...new Set(vals.filter(Boolean))].sort().map(x => `<option value="${esc(x)}">`).join("")}</datalist>`;
const ivTile = (c, ic, lab, val, sub) => `<div class="kc iv-k magic-card" style="--kc:${c}"><span>${ico(ic)} ${lab}</span><div class="kv"><b class="num">${val}</b></div>${sub ? `<small class="mut">${sub}</small>` : ""}</div>`;
const ivSeg = (id, opts, cur) => `<div class="pbm iv-seg" id="${id}">${opts.map(([k, l]) => `<button type="button" class="chip ${k === cur ? "on" : ""}" aria-pressed="${k === cur}" data-k="${esc(k)}">${esc(l)}</button>`).join("")}</div>`;
const ivSegBind = (v, id, F, key, draw) => {
  const buttons = $$(`#${id} .chip`, v);
  buttons.forEach(c => c.onclick = () => {
    F[key] = c.dataset.k;
    buttons.forEach(x => {
      x.classList.toggle("on", x === c);
      x.setAttribute("aria-pressed", String(x === c));
    });
    draw();
    if (!c.isConnected && document.activeElement === document.body) $$(`#${id} .chip`, v).find(x => x.dataset.k === F[key])?.focus({ preventScroll: true });
  });
};
const ivLockNote = d => ivLocked(d) ? `<div class="alert am iv-lk">${ico("ivlock")} ${bi(`${ivMonName(d)} Lock করা — এই মাসে কিছু বদলানো যাবে না`, `${ivMonName(d)} is locked — nothing in this month can be changed`)}</div>` : "";
const ivEmpty = t => `<div class="empty iv-empty">${t}</div>`;
const ivHl = (txt, q) => { q = String(q || "").trim(); if (!q) return esc(txt); const re = new RegExp("(" + q.split(/\s+/).filter(Boolean).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi"); return String(txt ?? "").split(re).map((x, i) => i % 2 ? `<mark>${esc(x)}</mark>` : esc(x)).join(""); };

/* order / trip form (both channels) */
function ivOrderModal(ch, o, done) {
  const C = ivCan(), isNew = !o.id, cur = o.id ? { ...JSON.parse(JSON.stringify(o)), party: ivPname(o) } : { ch, date: today(), status: ch === "nir" ? "ok" : "pending", lines: {}, party: ch === "nir" ? "Niramoy Traders" : "", location: ch === "nir" ? "Naogaon" : "" };
  const staffLock = !isNew && !C.admin && o.status === "cancel";
  const ro = !(isNew ? C.entry : C.edit) || staffLock || ivLocked(cur.date), used = Object.keys(cur.lines);
  const items = ivItemsFor(ch, used), rateOf = it => ch === "nir" ? it.rate_nir : it.rate_dist;
  const past = INV.orders.filter(x => x.ch === ch);
  const F2 = { q: "", only: !isNew }, invalid = new Set();
  const fld = (id, lab, val, type = "text", extra = "") => `<div><label class="f">${lab}</label><input class="in" id="io-${id}" type="${type}" value="${esc(val ?? "")}" ${ro ? "disabled" : ""} ${extra}></div>`;
  const head2 = ch === "nir"
    ? fld("date", bi("তারিখ", "Date"), cur.date, "date") + fld("transport", bi("ট্রান্সপোর্ট", "Transport"), cur.transport, "text", `list="io-dl-tr"`) + fld("vehicle", bi("গাড়ির নম্বর", "Vehicle no."), cur.vehicle) + fld("rent", bi("ভাড়া (৳)", "Rent (৳)"), cur.rent, "number", `min="0" step="1"`)
    : fld("date", bi("অর্ডারের তারিখ", "Order date"), cur.date, "date") + fld("party", bi("পার্টি / দোকান", "Party / shop"), cur.party, "text", `list="io-dl-pa"`) + fld("location", bi("এলাকা", "Location"), cur.location, "text", `list="io-dl-lo"`) + fld("asm", "ASM / RSM", cur.asm, "text", `list="io-dl-asm"`) + fld("transport", bi("ট্রান্সপোর্ট", "Transport"), cur.transport, "text", `list="io-dl-tr"`);
  const stSel = `<div><label class="f">${bi("অবস্থা", "Status")}</label><select class="in" id="io-status" ${ro ? "disabled" : ""}>${Object.keys(IV_ST).map(k => `<option value="${k}" ${k === cur.status ? "selected" : ""}>${bi(IV_ST[k][0], IV_ST[k][1])}</option>`).join("")}</select></div><div id="io-ddw"><label class="f">${bi("ডেলিভারির তারিখ", "Delivery date")}</label><input class="in" id="io-dd" type="date" value="${cur.delivery_date || ""}" ${ro ? "disabled" : ""}></div>`;
  modal(`<h2>${ico(ch === "nir" ? "ivtruck" : "ivcart")} ${isNew ? bi(ch === "nir" ? "নতুন ট্রিপ — নিরাময়" : "নতুন অর্ডার — ডিস্ট্রিবিউশন", ch === "nir" ? "New trip — Niramoy" : "New order — Distribution") : bi(ch === "nir" ? "ট্রিপ" : "অর্ডার", ch === "nir" ? "Trip" : "Order") + " · " + dmy(cur.date)}</h2>
    ${ivLockNote(cur.date)}${staffLock ? `<div class="alert am">${bi("Cancel হওয়া অর্ডার শুধু admin বদলাতে পারেন", "Only an admin can change a cancelled order")}</div>` : ""}
    <div class="iv-fg">${head2}${stSel}</div>
    <div class="iv-lh"><b>${bi("পণ্য ও পরিমাণ", "Items & quantity")}</b><input class="in sm" id="io-q" placeholder="${bi("আইটেম খুঁজুন…", "Find item…")}"><label class="iv-chk"><input type="checkbox" id="io-only" ${F2.only ? "checked" : ""}> ${bi("শুধু পরিমাণ দেওয়া", "Only filled")}</label></div>
    <div class="iv-lines" id="io-lines"></div>
    <div class="iv-ltot" id="io-tot"></div>
    <div class="iv-fg two">${fld("free", bi("ফ্রি / অফার", "Free / offer"), cur.free)}${fld("remarks", bi("মন্তব্য", "Remarks"), cur.remarks)}</div>
    <div class="hint rd iv-err" id="io-e"></div>
    <div class="modal-actions">${!isNew && C.admin && !ivLocked(cur.date) ? `<button class="btn rdo" id="io-del">${ico("trash")} ${bi("মুছুন", "Delete")}</button>` : ""}<button class="btn" id="io-x">${bi("বন্ধ", "Close")}</button>${ro ? "" : `<button class="btn pri" id="io-s">${ico("check")} ${bi("সেভ", "Save")}</button>`}</div>
    ${ivDl("io-dl-tr", past.map(x => x.transport))}${ivDl("io-dl-pa", past.map(x => x.party).concat((typeof DPARTY !== "undefined" && DPARTY || []).map(p => p.name)))}${ivDl("io-dl-lo", past.map(x => x.location))}${ivDl("io-dl-asm", past.map(x => x.asm).concat((typeof DASM !== "undefined" ? DASM : []).map(a => a.name)))}`, (root, close) => {
    root.querySelector(".modal").classList.add("iv-modal");
    const e = m => $("#io-e", root).textContent = m || "";
    const drafts = new Map();
    const lineVal = id => drafts.get(id) || cur.lines[id] || { q: 0, r: rateOf(INV.byId[id]) };
    const tot = () => { let q = 0, val = 0; Object.values(cur.lines).forEach(l => { q += +l.q || 0; val += (+l.q || 0) * (+l.r || 0); }); $("#io-tot", root).innerHTML = `<span>${bi("মোট পরিমাণ", "Total qty")} <b class="num">${ivQ(q)}</b></span><span>${bi("মোট মূল্য", "Total value")} <b class="num">৳ ${money(Math.round(val * 100) / 100)}</b></span>`; };
    const lines = () => {
      const q = ivSearch(F2.q), vis = items.filter(it => (!q || ivSearch(it.name).includes(q)) && (q || !F2.only || +cur.lines[it.id]?.q));
      $("#io-lines", root).innerHTML = vis.length ? vis.map(it => { const l = lineVal(String(it.id)); return `<div class="iv-ln ${+l.q ? "has" : ""}" data-id="${it.id}"><span class="nm">${esc(it.name)}${it.active === false ? ` <i class="tag">${bi("নিষ্ক্রিয়", "inactive")}</i>` : ""}<small class="mut">${esc(it.unit || "ctn")}</small></span><input class="in num q" type="number" min="0" step="any" inputmode="decimal" value="${+l.q || ""}" placeholder="0" ${ro ? "disabled" : ""} aria-label="${esc(it.name)} qty"><input class="in num r" type="number" min="0" step="any" inputmode="decimal" value="${l.r ?? ""}" ${ro || !C.admin ? "disabled" : ""} title="${bi("রেট", "Rate")}" aria-label="${esc(it.name)} rate"><b class="num v">${+l.q ? money0(l.q * l.r) : ""}</b></div>`; }).join("") : `<div class="mut c" style="padding:14px">${bi("কোনো আইটেম নেই", "No items")}</div>`;
      $$(".iv-ln", root).forEach(row => { const id = row.dataset.id, qi = $(".q", row), ri = $(".r", row);
        const upd = () => { drafts.set(id, { q: qi.value, r: ri.value });
          const qv = num(qi.value), rv = num(ri.value), valid = qi.validity.valid && ri.validity.valid && (qv <= 0 || ri.value !== "");
          if (valid) invalid.delete(id); else invalid.add(id);
          if (!valid) { e(bi("পরিমাণ ও রেট ঠিক করুন", "Enter a valid quantity and rate")); return; }
          if (!invalid.size) e("");
          if (qv > 0) cur.lines[id] = { q: qv, r: rv }; else delete cur.lines[id]; row.classList.toggle("has", qv > 0); $(".v", row).textContent = qv > 0 ? money0(qv * rv) : ""; tot(); };
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
      if (invalid.size) return e(bi("পরিমাণ ও রেট ঠিক করুন", "Enter a valid quantity and rate"));
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
    if (matchMedia("(pointer: fine)").matches) (ch === "dist" && isNew ? $("#io-party", root) : $("#io-q", root))?.focus();
  });
}

/* product master (admin edits; others view) */
function ivItemsModal(done) {
  const C = ivCan(), G = { coil: bi("কয়েল", "Coil"), detergent: bi("ডিটারজেন্ট", "Detergent"), cleaner: bi("ক্লিনার", "Cleaner"), other: bi("অন্যান্য", "Other") };
  const IF = { q: "", g: "", f: "" };
  const miss = i => (i.in_nir && i.rate_nir == null) || (i.in_dist && i.rate_dist == null);
  const fit = (i, skip) => (skip === "g" || !IF.g || i.grp === IF.g) && (skip === "f" || !IF.f || (IF.f === "nir" ? i.in_nir : IF.f === "dist" ? i.in_dist : IF.f === "miss" ? miss(i) : i.active === false)) && (!IF.q || ivSearch(i.name + " " + (G[i.grp] || i.grp)).includes(ivSearch(IF.q)));
  const row = i => `<tr class="${i.active === false ? "dim" : ""}${C.admin ? " iv-click" : ""}" ${C.admin ? `data-ie="${i.id}"` : ""}><td class="iv-item-name"><b>${ivHl(i.name, IF.q)}</b> <small class="mut">${esc(i.unit || "ctn")}</small>${miss(i) ? ` <span class="iv-miss" title="${bi("রেট নেই", "Rate missing")}">${bi("রেট নেই", "no rate")}</span>` : ""}</td><td class="iv-item-group">${esc(G[i.grp] || i.grp)}</td><td class="r num iv-item-rate"><span class="iv-item-meta">${bi("নিরাময়", "Niramoy")}</span>${i.rate_nir != null ? money(i.rate_nir) : "—"}</td><td class="r num iv-item-rate"><span class="iv-item-meta">${bi("ডিস্ট্রিবিউশন", "Distribution")}</span>${i.rate_dist != null ? money(i.rate_dist) : "—"}</td><td class="iv-item-use">${[i.in_nir ? bi("নিরাময়", "Niramoy") : "", i.in_dist ? bi("ডিস্ট্রি.", "Dist.") : ""].filter(Boolean).join(" · ") || "—"}${i.active === false ? ` · <i>${bi("নিষ্ক্রিয়", "inactive")}</i>` : ""}</td>${C.admin ? `<td class="r iv-item-edit"><button class="btn sm" aria-label="${bi("আইটেম বদলান", "Edit item")}" data-ie="${i.id}">${ico("edit")}</button></td>` : ""}</tr>`;
  const chips = () => {
    const gs = [["", bi("সব গ্রুপ", "All groups")], ...Object.entries(G)].map(([k, l]) => [k, l, INV.items.filter(i => fit(i, "g") && (!k || i.grp === k)).length]).filter(x => !x[0] || x[2]);
    const fs = [["", bi("সব", "All")], ["nir", bi("নিরাময়", "Niramoy")], ["dist", bi("ডিস্ট্রিবিউশন", "Distribution")], ["miss", bi("রেট নেই", "Missing rate")], ["off", bi("নিষ্ক্রিয়", "Inactive")]].map(([k, l]) => [k, l, INV.items.filter(i => fit(i, "f") && (!k || (k === "nir" ? i.in_nir : k === "dist" ? i.in_dist : k === "miss" ? miss(i) : i.active === false))).length]).filter(x => !x[0] || x[2] || x[0] === IF.f);
    const c = (key, cur, arr) => `<div class="iv-cg" data-ck="${key}">${arr.map(([k, l, n]) => `<button type="button" class="chip sm${k === cur ? " on" : ""}" data-cv="${k}" aria-pressed="${k === cur}">${l} <b>${n}</b></button>`).join("")}</div>`;
    return (gs.length > 2 ? c("g", IF.g, gs) : "") + c("f", IF.f, fs);
  };
  const list = () => { const L = INV.items.filter(i => fit(i)); return `<div class="iv-mcount mut sm">${bi(`${INV.items.length}টির মধ্যে ${L.length}টি`, `Showing ${L.length} of ${INV.items.length}`)}${INV.items.filter(miss).length ? ` · <span class="iv-miss">${INV.items.filter(miss).length} ${bi("টিতে রেট নেই", "missing a rate")}</span>` : ""}</div>` + (L.length ? `<div class="tw"><table class="iv-it"><thead><tr><th>${bi("আইটেম", "Item")}</th><th>${bi("গ্রুপ", "Group")}</th><th class="r">${bi("নিরাময় রেট", "Niramoy rate")}</th><th class="r">${bi("ডিস্ট্রি. রেট", "Dist. rate")}</th><th>${bi("কোথায়", "Used in")}</th>${C.admin ? "<th></th>" : ""}</tr></thead><tbody>${L.map(row).join("")}</tbody></table></div>` : ivEmpty(bi("কোনো আইটেম মেলেনি", "No matching items"))); };
  modal(`<h2>${ico("ivbox")} ${bi("আইটেম ও রেট", "Items & rates")} <span class="tag">${INV.items.length}</span></h2><p class="mut sm iv-mdesc">${bi("প্রতিটি আইটেমের নিরাময় ও ডিস্ট্রিবিউশন রেট। অর্ডারের মূল্য এই রেট দিয়েই হিসাব হয়।", "Niramoy and Distribution rate for each item. Order values are calculated from these rates.")}${C.admin ? " " + bi("সারিতে ক্লিক করে বদলান।", "Click a row to edit.") : ""}</p><div class="iv-mtool"><div class="ivd-find"><span class="ivd-find-i" aria-hidden="true">${ico("search")}</span><input class="in" id="it-q" type="search" autocomplete="off" placeholder="${bi("আইটেম বা গ্রুপ খুঁজুন…", "Search item or group…")}" aria-label="${bi("আইটেম খুঁজুন", "Search items")}"></div><div id="it-c">${chips()}</div></div><div id="it-l">${list()}</div><div class="modal-actions"><button class="btn" id="it-x">${bi("বন্ধ", "Close")}</button>${C.admin ? `<button class="btn pri" id="it-n">${ico("plus")} ${bi("নতুন আইটেম", "New item")}</button>` : ""}</div>`, (root, close) => {
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
        <div class="hint rd iv-err" id="ie-e"></div><div class="modal-actions">${it.id ? `<button class="btn rdo" id="ie-d">${ico("trash")} ${bi("মুছুন", "Delete")}</button>` : ""}<button class="btn" id="ie-x">${bi("বাতিল", "Cancel")}</button><button class="btn pri" id="ie-ok">${bi("সেভ", "Save")}</button></div>`, (r2, c2) => {
      const back = () => ivItemsModal(done);
      $("#ie-x", r2).onclick = back;
      const d = $("#ie-d", r2); if (d) d.onclick = async () => { if (INV.orders.some(o => o.lines[it.id]) || INV.demand.some(x => x.lines[it.id])) { $("#ie-e", r2).textContent = bi("আইটেমটি ব্যবহার হয়েছে — নিষ্ক্রিয় করুন", "This item is in use. Deactivate it instead."); return; } if (!confirm(bi("আইটেমটি মুছবেন?", "Delete this item?"))) return; try { await API.invItemDelete(it.id); await invLoad(true); back(); } catch (x) { $("#ie-e", r2).textContent = /foreign|23503|used/i.test(x.message) ? bi("এই আইটেম অর্ডারে ব্যবহার হয়েছে — মুছা যাবে না, নিষ্ক্রিয় করুন", "This item is used in orders — deactivate it instead") : ivErr(x); } };
      $("#ie-ok", r2).onclick = async () => {
        const g = id => $("#" + id, r2).value.trim(), nb = id => g(id) === "" ? null : num(g(id));
        const row = { id: it.id, name: g("ie-n"), grp: g("ie-g"), rate_nir: nb("ie-rn"), rate_dist: nb("ie-rd"), unit: g("ie-u") || "ctn", sort: num(g("ie-s")) || 100, in_nir: $("#ie-in", r2).checked, in_dist: $("#ie-id", r2).checked, active: $("#ie-a", r2).checked };
        if (!row.name) return $("#ie-e", r2).textContent = bi("নাম দিন", "Enter a name");
        try { await API.invItemSave(row); await invLoad(true); toast(bi("✔ সেভ হয়েছে", "✔ Saved")); back(); } catch (x) { $("#ie-e", r2).textContent = ivErr(x); }
      };
    });
    const n = $("#it-n", root); if (n) n.onclick = () => edit({});
    const paint = () => { $("#it-l", root).innerHTML = list(); $("#it-c", root).innerHTML = chips(); };
    let tq = 0; $("#it-q", root).oninput = e => { clearTimeout(tq); tq = setTimeout(() => { IF.q = e.target.value.trim(); paint(); }, 80); };
    $("#it-c", root).onclick = e => { const b = e.target.closest("[data-cv]"); if (!b) return; IF[b.closest("[data-ck]").dataset.ck] = b.dataset.cv; paint(); };
    $("#it-l", root).onclick = e => { const b = e.target.closest("[data-ie]"); if (b && !getSelection().toString()) edit(INV.items.find(i => String(i.id) === b.dataset.ie)); };
  });
}

/* monthly demand (target) per item */
function ivDemandModal(ch, month, done) {
  const cur = { ...ivDemandOf(ch, month) };
  const items = ivItemsFor(ch, Object.keys(cur));
  const readonly = !(INV.demand.some(d => d.ch === ch && d.month === month) ? ivCan().edit : ivCan().entry) || ivLocked(month);
  const pm = (() => { const d = new Date(month.slice(0, 7) + "-01T00:00:00"); d.setMonth(d.getMonth() - 1); return iso(d).slice(0, 7) + "-01"; })(), prev = ivDemandOf(ch, pm), hasPrev = Object.values(prev).some(x => +x > 0);
  const me = ivMonEnd(month), done0 = ivItemTotals(INV.orders.filter(o => o.ch === ch && ivInPeriod(o, month, me)), month, me);
  const GN = { coil: bi("কয়েল", "Coil"), detergent: bi("ডিটারজেন্ট", "Detergent"), cleaner: bi("ক্লিনার", "Cleaner"), other: bi("অন্যান্য", "Other") };
  const grps = [...new Set(items.map(i => i.grp || "other"))];
  modal(`<h2>${bi("মাসের Demand", "Monthly demand")} · ${ivMonName(month)} · ${bi(...IV_CH[ch])}</h2>${ivLockNote(month)}
    <p class="mut sm iv-mdesc">${bi("এই মাসে প্রতিটি আইটেম কত ctn দরকার তা লিখুন। নিচে এই মাসে এখন পর্যন্ত কত অর্ডার হয়েছে আর গত মাসের Demand দেখাচ্ছে।", "Enter how many cartons of each item are needed this month. Each row shows what has been ordered so far this month and last month's demand.")}</p>
    <div class="iv-mtool"><div class="ivd-find"><span class="ivd-find-i" aria-hidden="true">${ico("search")}</span><input id="dm-find" class="in" type="search" autocomplete="off" placeholder="${bi("পণ্য খুঁজুন…", "Find item…")}" aria-label="${bi("পণ্য খুঁজুন", "Find item")}"></div>
    <div class="iv-cg" id="dm-g"><button type="button" class="chip sm on" data-g="">${bi("সব", "All")}</button>${grps.length > 1 ? grps.map(g => `<button type="button" class="chip sm" data-g="${g}">${GN[g] || g}</button>`).join("") : ""}<button type="button" class="chip sm" data-g="__set">${bi("Demand আছে", "With demand")}</button>${hasPrev && !readonly ? `<button type="button" class="btn sm" id="dm-copy">${ico("copy")} ${bi("গত মাস কপি", "Copy last month")}</button>` : ""}</div></div>
    <div class="iv-demand-list">${items.map(it => { const o = done0[it.id]?.ord || 0, p = +prev[it.id] || 0; return `<div class="iv-demand-row" data-id="${it.id}" data-g="${it.grp || "other"}"><label for="dm-item-${it.id}">${esc(it.name)} <small class="mut">${esc(it.unit || "ctn")}</small><span class="iv-dmh"><span>${bi("অর্ডার হয়েছে", "Ordered")} <b class="num">${ivQ(o)}</b></span>${p ? `<span>${bi("গত মাস", "Last month")} <b class="num">${ivQ(p)}</b></span>` : ""}</span><i class="iv-dmb" data-o="${o}"><s></s></i></label><input id="dm-item-${it.id}" class="in num" type="number" min="0" step="any" inputmode="decimal" value="${esc(cur[it.id] ?? "")}" placeholder="0" ${readonly ? "disabled" : ""}></div>`; }).join("")}</div>
    <div class="empty" id="dm-empty" hidden>${bi("কোনো পণ্য মেলেনি", "No matching items")}</div>
    <div class="modal-actions">
      <div class="iv-demand-total">${bi("মোট Demand", "Total demand")} <b class="num" id="dm-t" aria-live="polite"></b></div>
      <div class="hint rd iv-err" id="dm-e" role="status"></div>
      <button type="button" class="btn" id="dm-x">${bi("বন্ধ", "Close")}</button>${readonly ? "" : `<button type="button" class="btn pri" id="dm-s">${bi("সেভ", "Save")}</button>`}
    </div>`, (root, close) => {
    $(".modal", root).classList.add("iv-modal");
    const rows = $$(".iv-demand-row", root).map(row => ({ row, input: $("input", row), key: ivSearch($("label", row).childNodes[0].textContent), g: row.dataset.g, bar: $(".iv-dmb", row) }));
    let gF = "";
    const search = $("#dm-find", root), empty = $("#dm-empty", root), save = $("#dm-s", root), error = $("#dm-e", root);
    let saving = false;
    const filter = () => {
      const key = ivSearch(search.value);
      let count = 0;
      for (const item of rows) {
        item.row.hidden = !item.key.includes(key) || (gF === "__set" ? !(item.input.valueAsNumber > 0) : gF && item.g !== gF);
        if (!item.row.hidden) count++;
      }
      empty.hidden = count > 0;
    };
    const collect = () => {
      const lines = { ...cur };
      for (const { row, input } of rows) {
        if (!input.validity.valid) return null;
        if (input.valueAsNumber > 0) lines[row.dataset.id] = input.valueAsNumber;
        else delete lines[row.dataset.id];
      }
      return lines;
    };
    const update = () => {
      const lines = collect();
      $("#dm-t", root).textContent = lines ? ivQ(ivSum(Object.values(lines), Number)) : "—";
      for (const { input, bar } of rows) { const d = input.valueAsNumber || 0, o = +bar.dataset.o; bar.hidden = !d; if (d) { bar.firstChild.style.width = Math.min(100, o / d * 100) + "%"; bar.classList.toggle("over", o > d); bar.title = `${ivQ(o)} / ${ivQ(d)}`; } }
      if (save) save.disabled = saving || !lines || !rows.length;
      error.textContent = lines ? "" : bi("শূন্য বা তার বেশি পরিমাণ দিন", "Enter a quantity of zero or more");
    };
    search.oninput = filter;
    $("#dm-g", root).onclick = e => { const b = e.target.closest("[data-g]"); if (!b) return; gF = b.dataset.g; $$("#dm-g [data-g]", root).forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", String(x === b)); }); filter(); };
    const cp = $("#dm-copy", root); if (cp) cp.onclick = () => { let n = 0; for (const { row, input } of rows) { const p = +prev[row.dataset.id] || 0; if (p && !(input.valueAsNumber > 0)) { input.value = p; n++; } } update(); filter(); toast(bi(`${n}টি আইটেমে গত মাসের Demand বসানো হয়েছে — সেভ করতে ভুলবেন না`, `Filled ${n} items from last month — remember to Save`)); };
    $(".iv-demand-list", root).oninput = update;
    filter(); update();
    $("#dm-x", root).onclick = close;
    if (save) save.onclick = async () => {
      const lines = collect(); if (saving || !lines) return;
      saving = save.disabled = true;
      try {
        await API.invDemandSave(ch, month, lines);
        const stored = INV.demand.find(d => d.ch === ch && d.month === month);
        if (stored) stored.lines = lines;
        else INV.demand.push({ ch, month, lines });
        toast(bi("✔ Demand সেভ হয়েছে", "✔ Demand saved"));
        close(); done?.();
      } catch (e) { saving = false; update(); error.textContent = ivErr(e); }
    };
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
    `<div id="${K}-ent" class="iv-mode"></div><div id="${K}-lst" class="iv-mode hide"><div class="card tbar noprint">${pbBar(K + "pb", F, { all: true })}<div class="row pflt iv-flt"><div class="pq"><label class="f">${bi("খুঁজুন", "Search")}</label><input class="in" id="${K}-q" placeholder="${nir ? bi("ট্রান্সপোর্ট, গাড়ি, আইটেম…", "Transport, vehicle, item…") : bi("পার্টি, এলাকা, ASM, আইটেম…", "Party, location, ASM, item…")}"></div><div class="iv-stsel"><label class="f">${bi("অবস্থা", "Status")}</label><select class="in" id="${K}-st"><option value="">${bi("সব", "All")}</option><option value="open">${bi("Pending + আজ যাবে", "Pending + Today")}</option>${Object.keys(IV_ST).map(k => `<option value="${k}">${bi(IV_ST[k][0], IV_ST[k][1])}</option>`).join("")}</select></div>${nir ? "" : `<div><label class="f">ASM / RSM</label><select class="in" id="${K}-asm"></select></div>`}</div></div>
    <div id="${K}-lk"></div><div class="iv-sc noprint" id="${K}-sc" role="group" aria-label="${bi("অবস্থা", "Status")}"></div><div class="ksum iv-ks" id="${K}-kpi"></div>
    ${ivSeg(K + "-tab", [["list", nir ? bi("ট্রিপ তালিকা", "Trips") : bi("অর্ডার তালিকা", "Orders")], ["item", bi("আইটেম অনুযায়ী", "By item")], ...(nir ? [["tr", bi("ট্রান্সপোর্ট অনুযায়ী", "By transport")]] : [["party", bi("পার্টি অনুযায়ী", "By party")], ["asm", bi("ASM অনুযায়ী", "By ASM")]])], F.tab)}
    <p class="iv-desc" id="${K}-desc"></p><div class="card flush"><div class="ch"><h3 id="${K}-h"></h3><span class="tag" id="${K}-cnt">0</span><div class="sp"></div><div id="${K}-bulk" class="iv-bulk hide"></div></div><div id="${K}-out"></div></div></div>${nir ? "" : `<div id="${K}-led" class="iv-mode hide"></div>`}`;
  const out = $(`#${K}-out`, v);
  const entry = $(`#${K}-ent`, v);
  try { await invLoad(); } catch (e) { entry.innerHTML = `<div class="alert rd" role="status">${esc(ivErr(e))}</div>`; return; }
  const range = () => pbRange(F);
  function rows() {
    const [f, t] = range(), q = ivSearch(F.q);
    return INV.orders.filter(o => o.ch === ch && ivInPeriod(o, f, t)
      && (!F.st || (F.st === "open" ? ["pending", "today"].includes(o.status) : o.status === F.st))
      && (!F.asm || (F.asm === "__none" ? !o.asm : o.asm === F.asm))
      && (!q || ivSearch([ivPname(o), o.location, o.asm, o.transport, o.vehicle, o.free, o.remarks, ...Object.keys(o.lines).map(ivItemName)].join(" ")).includes(q)))
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
  const itemsTxt = o => { const L = Object.entries(o.lines).sort((a, b) => b[1].q - a[1].q), more = L.length - 3; return `<div class="iv-ic${more > 0 ? " clip" : ""}">${L.map(([k, l]) => `<span class="iv-chip">${ivHl(ivItemName(k), F.q)}<b class="num">${ivQ(l.q)}</b></span>`).join("")}${more > 0 ? `<button type="button" class="iv-more" data-more aria-expanded="false">+${more} ${bi("আরও", "more")}</button>` : ""}</div>`; };
  const cards = list => { const can = C.edit, chk = o => can && (C.admin || o.status !== "cancel") && !ivLocked(o.date); return `<div class="iv-ocs">${list.map(o => `<article class="iv-oc s-${o.status}" data-ed="${o.id}"><header>${can && !nir && chk(o) ? `<input type="checkbox" data-sel="${o.id}" ${F.sel.has(o.id) ? "checked" : ""} aria-label="${bi("বাছাই", "Select")}">` : ""}<span class="mut sm">${dmy(o.date)}${ivLocked(o.date) ? " 🔒" : ""}</span><span class="sp"></span>${ivSt(o.status)}</header><h4>${ivHl(nir ? o.transport || "—" : ivPname(o), F.q)}</h4><p class="mut xs">${esc((nir ? [o.vehicle, o.rent ? bi("ভাড়া", "Rent") + " ৳ " + money0(o.rent) : ""] : [o.location, o.asm, o.transport]).filter(Boolean).join(" · ") || "—")}</p>${itemsTxt(o)}${o.free || o.remarks ? `<p class="mut xs">${esc([o.free ? bi("ফ্রি", "Free") + ": " + o.free : "", o.remarks].filter(Boolean).join(" · "))}</p>` : ""}<footer><span><b class="num">${ivQ(o.total_qty)}</b> ctn</span><span><b class="num">৳ ${money0(o.value)}</b></span><span class="sp"></span><span class="mut xs">${dd(o)}</span></footer></article>`).join("")}</div>`; };
  function table(list) {
    const can = C.edit, chk = o => can && (C.admin || o.status !== "cancel") && !ivLocked(o.date);
    const tq = ivSum(list.filter(o => o.status !== "cancel"), o => o.total_qty), tv = ivSum(list.filter(o => o.status !== "cancel"), o => o.value);
    return `<div class="tw cards"><table class="iv-ot"><thead><tr>${can && !nir ? `<th class="noprint c"><input type="checkbox" id="${K}-all" aria-label="all"></th>` : ""}<th>${bi("তারিখ", "Date")}</th>${nir ? `<th>${bi("ট্রান্সপোর্ট", "Transport")}</th><th>${bi("গাড়ি", "Vehicle")}</th><th class="r">${bi("ভাড়া", "Rent")}</th>` : `<th>${bi("পার্টি", "Party")}</th><th>ASM</th>`}<th>${bi("আইটেম", "Items")}</th><th class="r">${bi("পরিমাণ", "Qty")}</th><th class="r">${bi("মূল্য ৳", "Value ৳")}</th><th>${bi("অবস্থা", "Status")}</th><th>${bi("ডেলিভারি", "Delivery")}</th><th class="noprint"></th></tr></thead><tbody>${list.map(o => `<tr class="iv-click ${o.status === "cancel" ? "dim" : ""}" data-ed="${o.id}">${can && !nir ? `<td class="noprint c">${chk(o) ? `<input type="checkbox" data-sel="${o.id}" ${F.sel.has(o.id) ? "checked" : ""}>` : ""}</td>` : ""}<td class="nw">${dmy(o.date)}${ivLocked(o.date) ? ` <span title="Locked">${ico("ivlock").replace("<svg", '<svg width="12" height="12"')}</span>` : ""}</td>${nir ? `<td><b>${esc(o.transport || "—")}</b></td><td class="nw">${esc(o.vehicle || "—")}</td><td class="r num">${o.rent ? money0(o.rent) : "—"}</td>` : `<td><b>${esc(ivPname(o))}</b>${o.party_id ? "" : ` <i class="iv-nl" title="${bi("কালেকশনের পার্টির সাথে মেলানো নেই", "Not linked to a collection party")}">!</i>`}${o.location || o.transport ? `<div class="mut xs">${esc([o.location, o.transport].filter(Boolean).join(" · "))}</div>` : ""}</td><td class="nw">${esc(o.asm || "—")}</td>`}<td class="iv-its">${itemsTxt(o)}${o.free ? `<div class="mut xs">${bi("ফ্রি", "Free")}: ${esc(o.free)}</div>` : ""}${o.remarks ? `<div class="mut xs">${esc(o.remarks)}</div>` : ""}</td><td class="r num b">${ivQ(o.total_qty)}</td><td class="r num">${money0(o.value)}</td><td>${ivSt(o.status)}</td><td class="nw">${dd(o)}</td><td class="r noprint"><button class="btn sm" data-ed="${o.id}" title="${bi("খুলুন", "Open")}">${ico(chk(o) || C.admin ? "edit" : "list")}</button></td></tr>`).join("")}</tbody>
      <tfoot><tr class="tot">${can && !nir ? "<td class='noprint'></td>" : ""}<td colspan="${nir ? 3 : 2}">${bi("মোট (Cancel বাদে)", "Total (excl. cancelled)")}</td>${nir ? `<td class="r num">${money0(ivSum(list.filter(o => o.status !== "cancel"), o => o.rent))}</td>` : ""}<td></td><td class="r num">${ivQ(tq)}</td><td class="r num">${money0(tv)}</td><td colspan="3"></td></tr></tfoot></table></div>`;
  }
  function byItem(list) {
    const [f, t0] = range(), dm = F.m === "month" ? ivDemandOf(ch, ivMon(f)) : {}, t = ivItemTotals(list, f, t0);
    const ids = [...new Set([...Object.keys(t), ...Object.keys(dm)])].sort((a, b) => (INV.byId[a]?.sort ?? 100) - (INV.byId[b]?.sort ?? 100) || a - b);
    const S2 = k => ids.reduce((s, id) => s + (k === "dem" ? +dm[id] || 0 : t[id]?.[k] || 0), 0);
    return ids.length ? `<div class="tw cards"><table class="iv-mt"><thead><tr><th>${bi("আইটেম", "Item")}</th>${F.m === "month" ? `<th class="r">Demand</th><th class="r">${bi("অর্ডার বাকি", "To order")}</th>` : ""}<th class="r">${bi("মোট অর্ডার", "Ordered")}</th><th class="r">${bi("ডেলিভারি", "Delivered")}</th><th class="r">${bi("ডেলিভারি বাকি", "Pending")}</th><th class="r">${bi("ডেলিভারি মূল্য ৳", "Delivered ৳")}</th></tr></thead><tbody>${ids.map(id => { const x = t[id] || { ord: 0, del: 0, pend: 0, dval: 0 }, d = +dm[id] || 0, po = d - x.ord; return `<tr><td><b>${esc(ivItemName(id))}</b></td>${F.m === "month" ? `<td class="r num">${d ? ivQ(d) : "—"}</td><td class="r num ${po < 0 ? "iv-over" : ""}" ${po < 0 ? `title="${bi("Demand-এর চেয়ে বেশি অর্ডার", "Ordered more than demand")}"` : ""}>${d ? ivQ(po) : "—"}</td>` : ""}<td class="r num">${ivQ(x.ord)}</td><td class="r num">${ivQ(x.del)}</td><td class="r num ${x.pend ? "b" : "z"}">${ivQ(x.pend)}</td><td class="r num">${money0(x.dval)}</td></tr>`; }).join("")}</tbody><tfoot><tr class="tot"><td>${bi("মোট", "Total")}</td>${F.m === "month" ? `<td class="r num">${ivQ(S2("dem"))}</td><td class="r num">${ivQ(S2("dem") - S2("ord"))}</td>` : ""}<td class="r num">${ivQ(S2("ord"))}</td><td class="r num">${ivQ(S2("del"))}</td><td class="r num">${ivQ(S2("pend"))}</td><td class="r num">${money0(S2("dval"))}</td></tr></tfoot></table></div>` : ivEmpty(bi("এই সময়ে কিছু নেই", "Nothing in this period"));
  }
  function byKey(list, key, lab) {
    const [f, t] = range(), g = Object.create(null); list.filter(o => o.status !== "cancel").forEach(o => { const k = (key === "party" ? ivPname(o) : o[key]) || "—", x = g[k] ||= { n: 0, q: 0, v: 0, dq: 0, dv: 0, pq: 0, rent: 0, last: "" }; x.n++; x.q += o.total_qty; x.v += o.value; x.rent += +o.rent || 0; if (ivDelIn(o, f, t)) { x.dq += o.total_qty; x.dv += o.value; } else x.pq += o.total_qty; if (o.date > x.last) x.last = o.date; });
    const ks = Object.keys(g).sort((a, b) => g[b].v - g[a].v);
    return ks.length ? `<div class="tw cards"><table class="iv-mt"><thead><tr><th>${lab}</th><th class="r">${nir ? bi("ট্রিপ", "Trips") : bi("অর্ডার", "Orders")}</th><th class="r">${bi("পরিমাণ", "Qty")}</th><th class="r">${bi("মূল্য ৳", "Value ৳")}</th><th class="r">${nir ? bi("ভাড়া ৳", "Rent ৳") : bi("ডেলিভারি বাকি", "Pending")}</th><th>${bi("শেষ", "Last")}</th></tr></thead><tbody>${ks.map(k => { const x = g[k]; return `<tr><td><b>${esc(k)}</b></td><td class="r num">${x.n}</td><td class="r num">${ivQ(x.q)}</td><td class="r num">${money0(x.v)}</td><td class="r num ${!nir && x.pq ? "b" : ""}">${nir ? money0(x.rent) : ivQ(x.pq)}</td><td class="nw">${dmy(x.last)}</td></tr>`; }).join("")}</tbody></table></div>` : ivEmpty(bi("এই সময়ে কিছু নেই", "Nothing in this period"));
  }
  function bulkBar() {
    const b = $(`#${K}-bulk`, v); if (!b) return; const n = F.sel.size; b.classList.toggle("hide", !n);
    b.innerHTML = n ? `<span class="mut sm">${n} ${bi("টি বাছাই", "selected")}</span><input class="in sm" type="date" id="${K}-bd" value="${today()}" title="${bi("ডেলিভারির তারিখ", "Delivery date")}"><button class="btn sm pri" data-bs="ok">${ico("check")} Delivered</button><button class="btn sm" data-bs="today">${bi("আজ যাবে", "Today")}</button><button class="btn sm" data-bs="pending">Pending</button>` : "";
    $$("[data-bs]", b).forEach(x => x.onclick = async () => { const st = x.dataset.bs; try { const r = await ivSetStatus([...F.sel], st, $(`#${K}-bd`, v)?.value || today()); F.sel.clear(); ivPut(r); toast(bi(`✔ ${r.length}টি অর্ডার আপডেট হয়েছে`, `✔ ${r.length} orders updated`)); draw(); } catch (e) { toast(ivErr(e), "err"); } });
  }
  function draw() {
    const list = rows(), [f, t] = range();
    $(`#${K}-lk`, v).innerHTML = F.m === "month" ? ivLockNote(f) : "";
    if (!nir) { const a = $(`#${K}-asm`, v), as = [...new Set(INV.orders.filter(o => o.ch === ch && o.asm).map(o => o.asm))].sort(); a.innerHTML = `<option value="">${bi("সব", "All")}</option><option value="__none" ${F.asm === "__none" ? "selected" : ""}>${bi("ASM নেই", "No ASM")}</option>` + as.map(x => `<option ${x === F.asm ? "selected" : ""}>${esc(x)}</option>`).join(""); }
    kpi(list);
    { const [f2, t2] = range(), q2 = ivSearch(F.q), base = INV.orders.filter(o => o.ch === ch && ivInPeriod(o, f2, t2) && (!F.asm || (F.asm === "__none" ? !o.asm : o.asm === F.asm)) && (!q2 || ivSearch([ivPname(o), o.location, o.asm, o.transport, o.vehicle, o.free, o.remarks, ...Object.keys(o.lines).map(ivItemName)].join(" ")).includes(q2)));
      const opts = [["", bi("সব", "All"), base.length], ["open", bi("Pending + আজ", "Pending + Today"), base.filter(o => ["pending", "today"].includes(o.status)).length], ...Object.keys(IV_ST).map(k => [k, bi(IV_ST[k][0], IV_ST[k][1]), base.filter(o => o.status === k).length])].filter(x => !x[0] || x[2] || x[0] === F.st);
      $(`#${K}-sc`, v).innerHTML = opts.map(([k, l, n]) => `<button type="button" class="chip sm${k === F.st ? " on" : ""}${k ? " s-" + k : ""}" data-sc="${k}" aria-pressed="${k === F.st}">${l} <b>${n}</b></button>`).join(""); }
    $(`#${K}-desc`, v).innerHTML = ico("info") + " " + ({ list: nir ? bi("প্রতিটি ট্রিপ — সারি বা কার্ডে ক্লিক করলে খুলবে। আইটেম বেশি হলে “আরও” চাপুন।", "Every trip — click a row or card to open it. Tap “more” to see all items.") : bi("প্রতিটি অর্ডার — সারিতে ক্লিক করলে খুলবে। টিক দিয়ে একসাথে ডেলিভারি অবস্থা বদলান।", "Every order — click a row to open it. Tick several to change delivery status together."), item: bi("প্রতিটি আইটেম কত অর্ডার, কত ডেলিভারি আর কত বাকি — মাসিক হলে Demand-এর সাথে তুলনা।", "Ordered, delivered and pending for each item — compared with demand in monthly view."), party: bi("পার্টি অনুযায়ী অর্ডার ও বাকি ডেলিভারি, বড় থেকে ছোট।", "Orders and pending delivery per party, largest first."), asm: bi("ASM / RSM অনুযায়ী অর্ডার ও বাকি ডেলিভারি।", "Orders and pending delivery per ASM / RSM."), tr: bi("ট্রান্সপোর্ট অনুযায়ী ট্রিপ, পরিমাণ, মূল্য ও ভাড়া।", "Trips, quantity, value and rent per transport.") }[F.tab] || "");
    const T = { list: [nir ? bi("ট্রিপ", "Trips") : bi("অর্ডার", "Orders"), list.length], item: [bi("আইটেম অনুযায়ী", "By item"), Object.keys(ivItemTotals(list)).length], party: [bi("পার্টি অনুযায়ী", "By party"), new Set(list.map(o => o.party)).size], asm: [bi("ASM অনুযায়ী", "By ASM"), new Set(list.map(o => o.asm)).size], tr: [bi("ট্রান্সপোর্ট অনুযায়ী", "By transport"), new Set(list.map(o => o.transport)).size] }[F.tab];
    $(`#${K}-h`, v).textContent = T[0] + (F.m === "all" ? "" : ` · ${dcRangeLabel(f, t)}`); $(`#${K}-cnt`, v).textContent = T[1];
    out.innerHTML = F.tab === "item" ? byItem(list) : F.tab === "party" ? byKey(list, "party", bi("পার্টি", "Party")) : F.tab === "asm" ? byKey(list, "asm", "ASM / RSM") : F.tab === "tr" ? byKey(list, "transport", bi("ট্রান্সপোর্ট", "Transport"))
      : list.length ? `<div class="iv-dk">${table(list)}</div><div class="iv-ph">${cards(list)}</div>` : ivEmpty(F.q || F.st || F.asm ? bi("ফিল্টারে কিছু মেলেনি", "Nothing matches the filters") : bi("এই সময়ে কোনো রেকর্ড নেই", "No records in this period") + (C.entry ? `<div style="margin-top:10px"><button class="btn pri" id="${K}-new2">${ico("plus")} ${nir ? bi("নতুন ট্রিপ", "New trip") : bi("নতুন অর্ডার", "New order")}</button></div>` : ""));
    labelTables(out);
    out.onclick = e => { const t = e.target; if (t.closest("[data-more]")) { const c = t.closest(".iv-ic"), on = c.classList.toggle("open"); t.setAttribute("aria-expanded", String(on)); t.textContent = on ? bi("কম দেখান", "Show less") : "+" + (c.querySelectorAll(".iv-chip").length - 3) + " " + bi("আরও", "more"); return; } if (t.closest("input,select,a,label") || getSelection().toString()) return; const r = t.closest("[data-ed]"); if (r) ivOrderModal(ch, INV.orders.find(o => o.id === r.dataset.ed), draw); };
    $$("[data-sel]", out).forEach(c => c.onchange = () => { c.checked ? F.sel.add(c.dataset.sel) : F.sel.delete(c.dataset.sel); bulkBar(); });
    const all = $(`#${K}-all`, out); if (all) all.onchange = () => { $$("[data-sel]", out).forEach(c => { c.checked = all.checked; all.checked ? F.sel.add(c.dataset.sel) : F.sel.delete(c.dataset.sel); }); bulkBar(); };
    const n2 = $(`#${K}-new2`, out); if (n2) n2.onclick = () => ivOrderModal(ch, {}, draw);
    bulkBar();
  }
  pbBind(v, K + "pb", F, () => { F.sel.clear(); draw(); }, { all: true });
  ivSegBind(v, K + "-tab", F, "tab", draw);
  $(`#${K}-q`, v).oninput = e => { F.q = e.target.value; draw(); };
  $(`#${K}-st`, v).onchange = e => { F.st = e.target.value; F.sel.clear(); draw(); };
  $(`#${K}-sc`, v).onclick = e => { const b = e.target.closest("[data-sc]"); if (!b) return; F.st = b.dataset.sc; $(`#${K}-st`, v).value = F.st; F.sel.clear(); draw(); };
  if (!nir) $(`#${K}-asm`, v).onchange = e => { F.asm = e.target.value; draw(); };
  const nw = $(`#${K}-new`, v); if (nw) nw.onclick = () => ivOrderModal(ch, {}, draw);
  $(`#${K}-it`, v).onclick = () => ivItemsModal(draw);
  $(`#${K}-dm`, v).onclick = () => ivDemandModal(ch, ivMon(F.mode === "ent" ? ($("#ie" + ch + "-d", v)?.value || today()) : F.mode === "lst" && ["month", "day", "week", "custom"].includes(F.m) ? range()[0] : today()), draw);
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
    ${C.entry ? `<div class="card dcx-entry iv-ent"><div class="dcx-et"><h3>${ico("plus")} ${nir ? bi("নতুন ট্রিপ", "New trip") : bi("নতুন অর্ডার", "New order")}</h3></div>
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
     <div class="iv-b entry-actions"><button class="btn big" type="button" id="${K}-cl">${ico("x")} ${bi("পরিষ্কার", "Clear")}</button><button class="btn pri big" type="button" id="${K}-sv">${ico("check")} ${bi("সেভ করুন", "Save")}</button></div>
     <div class="hint rd entry-error" id="${K}-er" role="status"></div>
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
      : "";
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
    if (!C.entry) return;
    if (!nir) {
      let parties = []; try { parties = await dpLoad(); } catch { }
      ivCols(ivMon(date), ivMonEnd(ivMon(date))).then(() => party && ($b("ph").innerHTML = partyInfo(party))).catch(() => { });
      pPick = suggest(pIn, () => (DPARTY || parties).filter(p => p.active !== false).map(p => ({ value: p.name, label: p.asm || "", sub: "", html: `<span class="sgn"><b>${esc(p.name)}</b><em>${esc([p.asm, p.district].filter(Boolean).join(" · "))}</em></span>` })), it => {
        party = it ? (DPARTY || parties).find(p => p.name === it.value) : null;
        if (party) { pIn.value = party.name; aIn.value = party.asm || ""; const lastO = INV.orders.filter(o => o.party_id === party.id).sort((a, b) => b.date.localeCompare(a.date))[0]; if (lastO?.transport && !tIn.value) tIn.value = lastO.transport; }
        $b("ph").innerHTML = partyInfo(party);
      }, { normalize: ivSearch });
      pIn.addEventListener("picked", () => iIn.focus());
      pIn.addEventListener("input", () => { if (!pPick.get()) { party = null; $b("ph").innerHTML = pIn.value.trim() ? `<span class="mut xs">${bi("তালিকা থেকে বাছুন — নতুন পার্টি হলে Collection-এর পার্টি তালিকায় আগে যোগ করুন", "Pick from the list — add a new party in the Collection party list first")}</span>` : ""; } });
      aIn.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); tIn.focus(); } });
      tIn.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); iIn.focus(); } });
    } else {
      [[tIn, vIn], [vIn, rIn], [rIn, iIn]].forEach(([a, b]) => a.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); b.focus(); } }));
      tIn.addEventListener("change", () => { const lo = INV.orders.filter(o => o.ch === "nir" && o.transport === tIn.value.trim()).sort((a, b) => b.date.localeCompare(a.date))[0]; if (lo && !rIn.value) rIn.value = lo.rent || ""; vList(); });
    }
    iPick = suggest(iIn, () => ivItemsFor(ch).map(it => ({ value: it.name, label: "", sub: "", html: `<span class="sgn"><b>${esc(it.name)}</b><em>${rateOf(it) != null ? "৳ " + money(rateOf(it)) : bi("রেট নেই", "no rate")} · ${esc(it.unit || "ctn")}</em></span>` })), it => { if (it) iIn.value = it.value; }, { normalize: ivSearch });
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
    err(""); const name = iIn.value.trim(); if (!name) return err(bi("আইটেম বাছুন", "Pick an item")), iIn.focus();
    const it = ivItemsFor(ch).find(x => ivSearch(x.name) === ivSearch(name));
    if (!it) return err(bi("আইটেম মেলেনি — তালিকা থেকে বাছুন", "Item not found — pick from the list")), iIn.focus();
    const n = evalAmt(qIn.value); if (isNaN(n) || n <= 0) return err(bi("পরিমাণ দিন", "Enter the quantity")), qIn.focus();
    const rate = rateOf(it);
    if (rate == null) { err(bi("এই চ্যানেলের রেট আগে Items & rates-এ দিন", "Set this channel's rate in Items & rates first")); return false; }
    const ex = cart.find(l => l.id === it.id); if (ex) ex.q += n; else cart.push({ id: it.id, q: n, r: +rate });
    iPick?.set(null); iIn.value = ""; qIn.value = ""; drawCart(); iIn.focus(); return true;
  }
  function clear(all) { cart = []; err(""); if (iPick) iPick.set(null); else if (iIn) iIn.value = ""; if (qIn) qIn.value = ""; if ($b("rm")) $b("rm").value = ""; if (all || !nir) { if (pPick) pPick.set(null); party = null; if (pIn) { pIn.value = ""; aIn.value = ""; tIn.value = ""; $b("ph").innerHTML = ""; } } if (nir && all) { tIn.value = ""; vIn.value = ""; rIn.value = ""; } st = nir ? "ok" : "pending"; stBar(); drawCart(); (nir ? tIn : pIn)?.focus(); }
  async function save() {
    if (busy || !C.entry) return; err("");
    if ((iIn.value.trim() || qIn.value.trim()) && addLine() !== true) return;
    const d = $b("d").value; if (!d) return err(bi("তারিখ দিন", "Enter the date"));
    if (ivLocked(d)) return err(ivErr(new Error("month_locked")));
    if (!nir && !party) return err(bi("পার্টি বাছুন (তালিকা থেকে)", "Pick a party from the list")), pIn.focus();
    if (nir && !tIn.value.trim()) return err(bi("ট্রান্সপোর্টের নাম দিন", "Enter the transport name")), tIn.focus();
    const rent = nir ? evalAmt(rIn.value) : null;
    if (nir && (!Number.isFinite(rent) || rent < 0)) return err(bi("ভাড়া ঠিক করে দিন", "Enter a valid non-negative rent")), rIn.focus();
    if (!cart.length) return err(bi("অন্তত একটি আইটেম যোগ করুন", "Add at least one item")), iIn.focus();
    const row = nir ? { ch, date: d, party: "Niramoy Traders", location: "Naogaon", transport: tIn.value.trim(), vehicle: vIn.value.trim(), rent: rent || null, lines: lines(), remarks: $b("rm").value.trim(), status: st, delivery_date: st === "ok" ? d : null }
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
    $$("[data-bs]", el).forEach(b => b.onclick = async () => { if (b.dataset.bs === "x") { sel.clear(); return draw(); } try { const r = await ivSetStatus([...sel], b.dataset.bs, $(`#${K}-bd`, el).value || today()); ivPut(r); sel.clear(); toast(bi(`✔ ${r.length}টি অর্ডার আপডেট`, `✔ ${r.length} orders updated`)); draw(); changed && changed(); } catch (e) { toast(ivErr(e), "err"); } });
  }
  function draw() {
    if (!box.isConnected) return; date = $b("d").value || today();
    const day = INV.orders.filter(o => o.ch === ch && o.date === date), dlv = INV.orders.filter(o => o.ch === ch && o.status === "ok" && o.delivery_date === date), open = INV.orders.filter(o => o.ch === ch && ["pending", "today"].includes(o.status));
    const stat = (cls, ic, lab, arr, sub) => `<div class="dcx-stat ${cls}"><span class="si">${ico(ic)}</span><span class="tx"><small>${lab}</small><b class="num">৳ ${money0(ivSum(arr, o => o.value))}</b><i>${sub}</i></span></div>`;
    $b("kpi").innerHTML = stat("t", nir ? "ivtruck" : "ivcart", nir ? bi("এই দিনের ট্রিপ", "Trips today") : bi("এই দিনের অর্ডার", "Orders this day"), day.filter(o => o.status !== "cancel"), `${day.length} · ${ivQ(ivSum(day, o => o.total_qty))} ctn`)
      + stat("a", "check", bi("এই দিনে ডেলিভারি", "Delivered this day"), dlv, `${dlv.length} · ${ivQ(ivSum(dlv, o => o.total_qty))} ctn`)
      + stat("p", "clock", bi("মোট খোলা অর্ডার", "All open orders"), open, `${open.length} · ${ivQ(ivSum(open, o => o.total_qty))} ctn`);
    const nq = ivSearch(q), base = showOpen ? open.slice().sort((a, b) => a.date.localeCompare(b.date)) : day.slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    const vis = base.filter(o => !nq || ivSearch([ivPname(o), o.asm, o.transport, o.vehicle, o.remarks, ...Object.keys(o.lines).map(ivItemName)].join(" ")).includes(nq));
    $b("lh").textContent = showOpen ? bi("সব খোলা অর্ডার (পুরনো আগে)", "All open orders (oldest first)") : bi(`${dmy(date)} তারিখের ${nir ? "ট্রিপ" : "অর্ডার"}`, `${nir ? "Trips" : "Orders"} on ${dmy(date)}`); $b("cnt").textContent = vis.length;
    const canSt = o => C.edit && (C.admin || o.status !== "cancel") && !ivLocked(o.date);
    $b("ls").innerHTML = vis.length ? `<div class="iv-ol">${vis.map(o => `<div class="iv-or s-${o.status}">${!nir && canSt(o) ? `<input type="checkbox" data-sl="${o.id}" ${sel.has(o.id) ? "checked" : ""} aria-label="select">` : `<span></span>`}
        <div class="iv-om"><div class="iv-ot1"><b>${esc(nir ? (o.transport || "—") : ivPname(o))}</b>${!nir && !o.party_id ? ` <i class="iv-nl" title="${bi("কালেকশনের পার্টির সাথে মেলানো নেই", "Not linked to a collection party")}">!</i>` : ""}<span class="mut xs">${esc([showOpen ? dmy(o.date) : "", nir ? o.vehicle : o.asm, o.transport && !nir ? o.transport : ""].filter(Boolean).join(" · "))}</span></div>
        <div class="iv-ot2">${Object.entries(o.lines).map(([k, l]) => `<span>${esc(ivItemName(k))} <b>${ivQ(l.q)}</b></span>`).join("")}${o.remarks ? `<span class="mut">${esc(o.remarks)}</span>` : ""}</div></div>
        <div class="iv-ov"><b class="num">${ivQ(o.total_qty)}</b><small class="num">৳ ${money0(o.value)}</small></div>
        <div class="iv-oa">${ivSt(o.status)}${o.status === "ok" && o.delivery_date && o.delivery_date !== o.date ? `<small class="mut">${dmy(o.delivery_date)}</small>` : ""}${["pending", "today"].includes(o.status) ? `<small class="iv-age ${ivDays(o.date, today()) > 7 ? "late" : ""}">${ivDays(o.date, today())} ${bi("দিন", "d")}</small>` : ""}</div>
        <div class="iv-ob">${canSt(o) && o.status !== "ok" ? `<button class="btn sm pri" data-ok="${o.id}" title="Delivered">${ico("check")}</button>` : ""}${!nir && moduleCan("collection", "entry") ? `<button class="btn sm" data-col="${o.id}" title="${bi("কালেকশন যোগ", "Add collection")}">৳</button>` : ""}<button class="btn sm" data-ed="${o.id}" title="${bi("খুলুন", "Open")}">${ico("edit")}</button></div></div>`).join("")}</div>`
      : `<div class="empty">${showOpen ? bi("কোনো খোলা অর্ডার নেই ✓", "No open orders ✓") : bi("এই তারিখে কিছু নেই", "Nothing on this date")}</div>`;
    $$("[data-sl]", box).forEach(c => c.onchange = () => { c.checked ? sel.add(c.dataset.sl) : sel.delete(c.dataset.sl); selbar(); });
    $$("[data-ok]", box).forEach(b => b.onclick = async () => { b.disabled = true; try { ivPut(await ivSetStatus([b.dataset.ok], "ok", today())); toast(bi("✔ Delivered", "✔ Delivered")); draw(); changed && changed(); } catch (e) { toast(ivErr(e), "err"); b.disabled = false; } });
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
    <div class="modal-actions"><button class="btn" id="cm-x">${bi("বাতিল", "Cancel")}</button><button class="btn pri" id="cm-s">${bi("যোগ করুন", "Add")}</button></div>`, (root, close) => {
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
  let data = [], cut = "", unT = [], unO = [], show0 = false, qs = "", stF = "", asmF = "", sortF = "bal";
  box.innerHTML = `<div class="card tbar noprint"><div class="row pflt iv-flt"><div class="pq"><label class="f">${bi("খুঁজুন", "Search")}</label><input class="in" id="ov-q" placeholder="${bi("পার্টি বা ASM…", "Party or ASM…")}"></div><div><label class="f">${bi("দেখান", "Show")}</label><label class="iv-chk"><input type="checkbox" id="ov-z"> ${bi("শূন্য হিসাবের পার্টিও", "Also zero-balance parties")}</label></div><div class="sp"></div><button class="btn sm" id="ov-xl">${ico("dl")} Excel</button></div></div><div class="ksum iv-ks" id="ov-kpi"></div><div class="ir-viz noprint" id="ov-viz"></div><div class="card flush"><div class="ch"><h3>${bi("অর্ডার বনাম ডেলিভারি", "Order vs Delivery")}</h3><span class="tag" id="ov-cnt">0</span><div class="sp"></div><label class="ov-sort"><span class="mut xs">${bi("সাজান", "Sort")}</span><select class="in sm" id="ov-sort"><option value="bal">${bi("বাকি বেশি আগে", "Highest balance")}</option><option value="days">${bi("পুরনো Pending আগে", "Oldest pending")}</option><option value="dl">${bi("ডেলিভারি বেশি আগে", "Most delivered")}</option><option value="pct">${bi("কালেকশন হার কম আগে", "Lowest collection rate")}</option><option value="name">${bi("নাম (A–Z)", "Name (A–Z)")}</option></select></label></div><div class="ov-chips noprint" id="ov-chips"></div><div id="ov-nt"></div><div id="ov-out"></div></div>`;
  async function load() {
    const out = $("#ov-out", box), td = today();
    try { await dpLoad(); await invLoad(); var [d, cols] = await Promise.all([ovdLoad(), ivCols(OVD_FROM, td)]); } catch (e) { out.innerHTML = `<div class="alert rd" style="margin:12px">${esc(ivErr(e))}</div>`; return; }
    cut = d.sales.reduce((m, s) => s.sale_date > m ? s.sale_date : m, d.opening.length ? OVD_FROM : "");
    const g = Object.create(null), row = k => g[k] ||= { k, pid: null, name: "", op: 0, reg: 0, app: 0, aq: 0, col: 0, pq: 0, old: "", note: "" };
    const key = (pid, nm) => pid || "n:" + nm;
    d.opening.forEach(o => { const x = row(key(o.party_id, o.party_name)); x.pid = o.party_id; x.name = o.party_name; x.op += o.opening; if (o.note === "NEW" || o.note === "INACTIVE") x.note = o.note; });
    d.sales.forEach(s => { const x = row(key(s.party_id, s.party_name)); x.pid = s.party_id; x.name ||= s.party_name; x.reg += s.amount; });
    unO = []; const L = INV.orders.filter(o => o.ch === "dist" && o.status !== "cancel");
    L.forEach(o => {
      const dd = o.delivery_date || o.date, isOk = o.status === "ok", open = !isOk;
      if (!o.party_id) { if (open || (dd > cut && dd >= OVD_FROM)) unO.push(o); return; }
      const x = row(o.party_id); x.pid = o.party_id;
      if (isOk && dd > cut && dd >= OVD_FROM && dd <= td) { x.app += o.value; x.aq += o.total_qty; }
      if (open) { x.pq += o.total_qty; if (!x.old || o.date < x.old) x.old = o.date; }
    });
    cols.forEach(c => { if (c.party_id && c.status === "approved") { const x = row(c.party_id); x.pid = c.party_id; x.col += c.amount; } });
    data = Object.values(g).map(x => {
      const p = x.pid ? ivParty(x.pid) : null; x.name = p?.name || x.name || x.pid || "—"; x.asm = p?.asm || ""; x.dl = x.reg + x.app; x.bal = x.op + x.dl - x.col; x.days = x.old ? Math.max(0, ivDays(x.old, td)) : 0;
      x.st = Math.abs(x.bal) < 1 ? "clear" : x.bal < 0 ? "adv" : x.col > 0 ? "part" : "due"; x.zero = !x.op && !x.dl && !x.col && !x.pq; return x;
    });
    unT = data.filter(x => !x.pid && (x.op || x.reg));
    draw();
  }
  const ST = { due: ["#dc2626", bi("বাকি", "Due")], part: ["#d97706", bi("আংশিক", "Partial")], clear: ["#059669", bi("পরিশোধিত", "Clear")], adv: ["#4f46e5", bi("অগ্রিম", "Advance")] };
  const owed = x => x.op + x.dl, pct = x => owed(x) > 0 ? Math.min(100, Math.max(0, x.col / owed(x) * 100)) : 100;
  const stPass = (x, k) => !k || (k === "pend" ? x.pq > 0 : k === "old" ? x.pq > 0 && x.days > 7 : x.st === k);
  const base = () => { const q = ivSearch(qs); return data.filter(x => (show0 || !x.zero) && (!q || ivSearch(x.name + " " + x.asm).includes(q))); };
  const SORT = { bal: (a, b) => b.bal - a.bal, days: (a, b) => (b.pq ? b.days : -1) - (a.pq ? a.days : -1) || b.bal - a.bal, dl: (a, b) => b.dl - a.dl, pct: (a, b) => pct(a) - pct(b) || b.bal - a.bal, name: (a, b) => a.name.localeCompare(b.name) };
  const visible = () => base().filter(x => stPass(x, stF) && (!asmF || (x.asm || "—") === asmF)).sort((a, b) => SORT[sortF](a, b) || a.name.localeCompare(b.name));
  function draw() {
    const out = $("#ov-out", box); if (!out) return;
    const L = visible();
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
    { const B = base().filter(x => !asmF || (x.asm || "—") === asmF), c = k => B.filter(x => stPass(x, k)).length;
      const opts = [["", bi("সব", "All")], ["due", ST.due[1]], ["part", ST.part[1]], ["clear", ST.clear[1]], ["adv", ST.adv[1]], ["pend", bi("Pending অর্ডার আছে", "Has pending orders")], ["old", bi("৭+ দিনের Pending", "Pending 7+ days")]].map(([k, l]) => [k, l, c(k)]).filter(x => !x[0] || x[2] || x[0] === stF);
      $("#ov-chips", box).innerHTML = opts.map(([k, l, n]) => `<button type="button" class="chip sm${k === stF ? " on" : ""}" data-ovs="${k}" aria-pressed="${k === stF}">${k && ST[k] ? `<i class="sdot" style="background:${ST[k][0]}"></i>` : ""}${l} <b>${n}</b></button>`).join("") + (asmF ? `<button type="button" class="chip sm on" data-ova="">ASM: ${esc(asmF)} ✕</button>` : "") + `<span class="mut xs ov-hint">${bi("সারিতে চাপলে পার্টির লেজার খুলবে", "Tap a row to open the party ledger")}</span>`;
      const BV = base().filter(x => stPass(x, stF)), am = new Map(); BV.forEach(x => { const k = x.asm || "—", o = am.get(k) || { k, n: 0, amt: 0 }; o.n++; o.amt += Math.max(0, x.bal); am.set(k, o); });
      const arr = [...am.values()].filter(x => x.amt > 0).sort((a, b) => b.amt - a.amt).slice(0, 7), mx = Math.max(1, ...arr.map(x => x.amt));
      const ow = ivSum(L, owed), cl = ivSum(L, x => x.col), rate = ow > 0 ? Math.round(cl / ow * 100) : 0;
      const top = L.filter(x => x.bal >= 1).slice().sort((a, b) => b.bal - a.bal).slice(0, 5), mx2 = Math.max(1, ...top.map(x => x.bal));
      const lk = n => n >= 1e7 ? (n / 1e7).toFixed(2) + bi(" কোটি", " Cr") : n >= 1e5 ? (n / 1e5).toFixed(2) + bi(" লাখ", " L") : money0(n);
      $("#ov-viz", box).innerHTML = `<section class="ir-vc card"><div class="iv-section-head"><div><h3>${bi("কালেকশন হার", "Collection rate")}</h3><p class="mut sm">${bi("(Opening + ডেলিভারি)-এর কত অংশ Approved কালেকশন হয়েছে", "Share of (opening + delivered) collected and approved")}</p></div></div><div class="ivd-dm"><div class="ivd-ring" style="--p:${Math.min(100, rate)}"><b class="num">${rate}%</b></div><div class="ivd-dmi"><p><b class="num">৳ ${lk(cl)}</b> / ৳ ${lk(ow)}</p><p class="mut sm">${bi("বাকি", "Outstanding")} ৳ ${lk(Math.max(0, ow - cl))}</p></div></div></section>`
        + `<section class="ir-vc card"><div class="iv-section-head"><div><h3>${bi("ASM অনুযায়ী বাকি", "Balance by ASM")}</h3><p class="mut sm">${bi("ক্লিক করলে সেই ASM-এর পার্টি", "Click to show that ASM's parties")}</p></div></div><ul class="ir-hb">${arr.map(x => `<li><button type="button" data-ova="${esc(x.k)}" class="${asmF === x.k ? "on" : ""}" title="${esc(x.k)} · ${x.n} · ৳ ${money0(x.amt)}"><span class="ir-hl">${esc(x.k)}</span><i><s style="width:${(x.amt / mx * 100).toFixed(1)}%;background:linear-gradient(90deg,#ef4444,#f97316)"></s></i><b class="num">${lk(x.amt)}</b></button></li>`).join("") || `<li class="mut sm">${bi("কিছু নেই", "Nothing")}</li>`}</ul></section>`
        + `<section class="ir-vc card"><div class="iv-section-head"><div><h3>${bi("সবচেয়ে বেশি বাকি", "Largest balances")}</h3><p class="mut sm">${bi("ক্লিক করলে লেজার খুলবে", "Click to open the ledger")}</p></div></div><ul class="ir-hb">${top.map(x => `<li><button type="button" data-ovp="${esc(x.k)}" title="${esc(x.name)}"><span class="ir-hl">${esc(x.name)}</span><i><s style="width:${(x.bal / mx2 * 100).toFixed(1)}%;background:linear-gradient(90deg,#dc2626,#f43f5e)"></s></i><b class="num">${lk(x.bal)}</b></button></li>`).join("") || `<li class="mut sm">${bi("কিছু নেই", "Nothing")}</li>`}</ul></section>`; }
    out.innerHTML = L.length ? `<div class="tw cards"><table class="iv-mt"><thead><tr><th>${bi("পার্টি", "Party")}</th><th>ASM</th><th class="r">Pending (ctn)</th><th class="r">Pending (${bi("দিন", "days")})</th><th class="r">${bi("ডেলিভারি ৳", "Delivered ৳")}</th><th class="r">${bi("কালেকশন ৳", "Collected ৳")}</th><th>${bi("পেমেন্ট অবস্থা", "Payment status")}</th><th class="r">Balance ৳</th></tr></thead><tbody>${L.map(x => `<tr class="${x.pid ? "iv-click" : ""}" data-ovp="${esc(x.k)}"><td><b>${ivHl(x.name || "?", qs)}</b>${x.pid ? "" : ` <i class="iv-mk">${bi("মেলেনি", "unlinked")}</i>`}${x.note ? ` <i class="iv-mk ${x.note === "NEW" ? "ok" : "no"}">${x.note === "NEW" ? bi("নতুন", "new") : bi("নিষ্ক্রিয়", "inactive")}</i>` : ""}</td><td class="nw">${esc(x.asm)}</td><td class="r num">${x.pq ? ivQ(x.pq) : "—"}</td><td class="r num ${x.days > 7 ? "iv-due" : ""}">${x.pq ? x.days : "—"}</td><td class="r num">${money0(x.dl)}</td><td class="r num">${money0(x.col)}</td><td><i class="iv-mk" style="background:${ST[x.st][0]}1a;color:${ST[x.st][0]}">${ST[x.st][1]}</i><span class="ov-pb" title="${bi("কালেকশন হার", "Collection rate")} ${Math.round(pct(x))}%"><s style="width:${pct(x).toFixed(0)}%;background:${ST[x.st][0]}"></s></span></td><td class="r num b ${x.bal >= 1 ? "iv-due" : x.bal <= -1 ? "iv-adv" : "iv-paid"}" title="Opening ${money0(x.op)} + ${bi("বিক্রয়", "Sales")} ${money0(x.dl)} − ${bi("কালেকশন", "Collected")} ${money0(x.col)}">${money0(x.bal)}</td></tr>`).join("")}</tbody><tfoot><tr class="tot"><td colspan="2">${bi("মোট", "Total")}</td><td class="r num">${ivQ(T("pq"))}</td><td></td><td class="r num">${money0(T("dl"))}</td><td class="r num">${money0(T("col"))}</td><td></td><td class="r num">${money0(T("bal"))}</td></tr></tfoot></table></div>`.replace('<div class="tw cards">', '<div class="iv-dk"><div class="tw cards">') + `</div><div class="iv-ph"><div class="ov-cards">${L.map(x => `<article class="ov-c ${x.pid ? "iv-click" : ""}" data-ovp="${esc(x.k)}" style="--sc:${ST[x.st][0]}"><header><b>${ivHl(x.name || "?", qs)}</b><i class="iv-mk" style="background:${ST[x.st][0]}1a;color:${ST[x.st][0]}">${ST[x.st][1]}</i></header><p class="mut xs">${esc(x.asm || "—")}${x.pid ? "" : " · " + bi("মেলেনি", "unlinked")}</p><div class="ov-bal"><span class="mut xs">Balance</span><b class="num ${x.bal >= 1 ? "iv-due" : x.bal <= -1 ? "iv-adv" : "iv-paid"}">৳ ${money0(x.bal)}</b></div><span class="ov-pb lg"><s style="width:${pct(x).toFixed(0)}%;background:${ST[x.st][0]}"></s></span><footer><span><small>${bi("ডেলিভারি", "Delivered")}</small><b class="num">${money0(x.dl)}</b></span><span><small>${bi("কালেকশন", "Collected")}</small><b class="num">${money0(x.col)}</b></span><span><small>Pending</small><b class="num ${x.days > 7 && x.pq ? "iv-due" : ""}">${x.pq ? `${ivQ(x.pq)} ctn · ${x.days}${bi("দি", "d")}` : "—"}</b></span></footer></article>`).join("")}</div></div>` : ivEmpty(bi("কোনো পার্টি পাওয়া যায়নি", "No parties found"));
    labelTables(out);
  }
  let ovT = 0; $("#ov-q", box).oninput = e => { clearTimeout(ovT); ovT = setTimeout(() => { qs = e.target.value; draw(); }, 90); };
  $("#ov-sort", box).onchange = e => { sortF = e.target.value; draw(); };
  box.addEventListener("click", e => { let b;
    if ((b = e.target.closest("[data-ovs]"))) { stF = b.dataset.ovs; draw(); return; }
    if ((b = e.target.closest("[data-ova]"))) { asmF = asmF === b.dataset.ova ? "" : b.dataset.ova; draw(); return; }
    if ((b = e.target.closest("[data-ovp]")) && !getSelection().toString()) { const x = data.find(y => y.k === b.dataset.ovp), p = x?.pid && ivParty(x.pid); if (p && typeof partyLedgerModal === "function") partyLedgerModal(p); else if (x && !x.pid) toast(bi("এই Tally পার্টি কালেকশন তালিকার সাথে মেলানো নেই", "This Tally party is not linked to the collection list"), "err"); } });
  $("#ov-z", box).onchange = e => { show0 = e.target.checked; draw(); };
  $("#ov-xl", box).onclick = () => { const td = today(); exportXlsx({ "Order vs Delivery": [["Party", "ASM", "Pending (ctn)", "Pending (days)", "Opening 01-01-2026", "Tally sales to " + (cut || "-"), "App deliveries after", "Delivered", "Collected (approved)", "Payment status", "Balance"], ...visible().map(x => [x.name, x.asm, x.pq || 0, x.pq ? x.days : 0, x.op, x.reg, x.app, x.dl, x.col, ({ due: "Due", part: "Partial", clear: "Clear", adv: "Advance" })[x.st], x.bal])] }, `Order_vs_Delivery_${td}.xlsx`); };
  return { draw: load };
}
/* link Tally names (opening / sales register) to the collection party list */
async function ovdMatchModal(done) {
  let parties = []; try { parties = await dpLoad(); } catch (e) { return toast(ivErr(e), "err"); }
  let d; try { d = await ovdLoad(true); } catch (e) { return toast(ivErr(e), "err"); }
  const grp = () => { const g = Object.create(null); d.opening.forEach(o => { if (!o.party_id && o.opening) { const x = g[o.party_name] ||= { name: o.party_name, v: 0 }; x.v += o.opening; } }); d.sales.forEach(s => { if (!s.party_id) { const x = g[s.party_name] ||= { name: s.party_name, v: 0 }; x.v += s.amount; } }); return Object.values(g).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)); };
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
  modal(`<h2>${ico("users")} ${bi("Tally পার্টি মেলান", "Match Tally parties")} <span class="tag" id="mt-n">0</span></h2><div class="mut sm">${bi("Tally-র পার্টির নাম কালেকশন তালিকার পার্টির সাথে মেলান — তাহলে কালেকশন ও ডেলিভারি একই হিসাবে আসবে।", "Link each Tally party name to a party in the collection list so collections and deliveries land in the same balance.")}</div><div class="iv-ml" id="mt-l"></div><div class="modal-actions"><button class="btn" id="mt-x">${bi("বন্ধ", "Close")}</button></div>`, (root, close) => {
    root.querySelector(".modal").classList.add("iv-modal"); $("#mt-x", root).onclick = () => { close(); done && done(); }; draw(root);
  });
}

/* link old (imported) orders to the Collection party list — admin confirms every match */
const IV_STOP = new Set(["ent", "enterprise", "enterprises", "store", "stores", "traders", "trader", "trading", "general", "the", "and", "mart", "shop", "house", "co", "ltd", "bazar", "sadar", "road"]);
const IV_AST = new Set(["asm", "rsm", "sm", "tse", "ho", "vacant", "head", "quarter", "office", "modern", "trade"]);
const ivWords = s => String(s || "").toLowerCase().replace(/[`'’.]/g, "").split(/[^\p{L}\p{M}\p{N}]+/u).filter(w => w.length > 1);
const ivBg = s => { const a = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); a.set(k, (a.get(k) || 0) + 1); } return a; };
const ivDice = (a, b) => { if (!a || !b) return 0; if (a === b) return 1; if (a.length < 2 || b.length < 2) return 0; const A = ivBg(a), B = ivBg(b); let n = 0; for (const [k, v] of A) n += Math.min(v, B.get(k) || 0); return 2 * n / (a.length + b.length - 2); };
const ivWsim = (w, ws) => Math.max(0, ...ws.map(x => x === w ? 1 : (w.length >= 4 && x.length >= 4 && (x.startsWith(w) || w.startsWith(x))) ? 0.9 : ivDice(w, x)));
/* score = whole-name similarity (shop part of the master name) + name words + location words + ASM words; tolerant to spelling (Nawas/Newaz, Uzzail/Uzzal) */
function ivGuess(name, loc, asm, parties) {
  const nw = ivWords(name).filter(w => !IV_STOP.has(w)), lw = ivWords(loc), aw = ivWords(asm).filter(w => !IV_AST.has(w)), on = ivSearch(name);
  return parties.map(p => {
    const parts = String(p.name).split(/\s*[-,:]\s*/).filter(Boolean); let best = 0, shop = parts[0] || "";
    for (let i = 1; i <= Math.min(3, parts.length); i++) { const c = parts.slice(0, i).join(" "), d = ivDice(on, ivSearch(c)); if (d > best) { best = d; shop = c; } }
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
async function ivMatchModal(done, preferred) {
  let parties = []; try { parties = await dpLoad(); } catch (e) { return toast(ivErr(e), "err"); }
  const groups = () => { const g = Object.create(null); INV.orders.filter(o => o.ch === "dist" && !o.party_id && o.party).forEach(o => { const k = o.party + "|" + (o.location || ""); const x = g[k] ||= { name: o.party, loc: o.location || "", asm: o.asm || "", n: 0, v: 0 }; x.n++; x.v += o.value; }); return Object.values(g).sort((a, b) => b.v - a.v); };
  const draw = (root) => {
    const G = groups(); G.forEach(x => { x.g = ivGuess(x.name, x.loc, x.asm, parties); x.ok = ivSure(x.g); }); G.sort((a, b) => (b.ok - a.ok) || (b.v - a.v)); const nSure = G.filter(x => x.ok).length;
    $("#mt-all", root).textContent = bi(`নিশ্চিত প্রস্তাবগুলো একসাথে মেলান (${nSure})`, `Link all sure matches (${nSure})`); $("#mt-all", root).disabled = !nSure; root._G = G;
    $("#mt-l", root).innerHTML = G.length ? G.map((x, i) => `<div class="iv-mr" data-i="${i}"><div class="iv-mn"><b>${esc(x.name)}</b><small class="mut">${esc([x.loc, x.asm].filter(Boolean).join(" · "))} · ${x.n} ${bi("অর্ডার", "orders")} · ৳ ${money0(x.v)}</small></div>
      <div class="iv-mc">${x.ok ? `<i class="iv-mk ok">${bi("নিশ্চিত", "sure")}</i>` : x.g.length ? `<i class="iv-mk">${bi("যাচাই করে বাছুন", "check & pick")}</i>` : `<i class="iv-mk no">${bi("তালিকায় নেই", "not in list")}</i> <a href="#" class="iv-np" data-np="${i}">+ ${bi("নতুন পার্টি তৈরি", "Create party")}</a>`}${x.g.map((c, j) => `<span class="chip ${j === 0 && x.ok ? "on" : ""}" data-p="${c.p.id}">${esc(c.p.name)}<small>${esc(c.p.asm || "")}</small></span>`).join("")}<div class="iv-ms"><input class="in sm" placeholder="${bi("অন্য পার্টি খুঁজুন…", "Search another party…")}" autocomplete="off"></div></div>
      <button class="btn sm pri" data-go="${i}">${bi("মেলান", "Link")}</button></div>`).join("") : `<div class="empty">${bi("সব অর্ডার মেলানো হয়েছে ✓", "All orders are linked ✓")}</div>`;
    $("#mt-n", root).textContent = G.length;
    $$(".iv-mr", root).forEach(r => {
      const x = G[+r.dataset.i];
      const created = preferred?.name === x.name && preferred.loc === x.loc ? preferred.party : null;
      let pid = created?.id || $(".chip.on", r)?.dataset.p || null;
      $$(".chip", r).forEach(c => c.onclick = () => { $$(".chip", r).forEach(z => z.classList.toggle("on", z === c)); pid = c.dataset.p; });
      const inp = $(".iv-ms input", r); const picker = suggest(inp, () => parties.map(p => ({ value: p.name, label: p.asm || "", sub: p.district || "" })), it => { pid = it ? parties.find(p => p.name === it.value)?.id : null; $$(".chip", r).forEach(z => z.classList.remove("on")); }, { normalize: ivSearch });
      if (created) { picker.setSilent({ value: created.name, label: created.asm || "" }); $$(".chip", r).forEach(z => z.classList.remove("on")); }
      const np = $("[data-np]", r); if (np) np.onclick = e => { e.preventDefault(); if (typeof dpartyModal !== "function") return; dpartyModal({ name: [x.name, x.loc].filter(Boolean).join("-") }, saved => { if (!saved) return; toast(bi("✔ পার্টি তৈরি হয়েছে — এখন \"মেলান\" চাপুন", "✔ Party created — now press \"Link\"")); ivMatchModal(done, { name: x.name, loc: x.loc, party: saved }); }); };
      $("[data-go]", r).onclick = async () => { if (!pid) return toast(bi("একটা পার্টি বাছুন", "Pick a party"), "err"); try { const rs = await API.invLinkParty(x.name, x.loc || null, pid); ivPut(rs); toast(bi(`✔ ${rs.length}টি অর্ডার মেলানো হয়েছে`, `✔ ${rs.length} orders linked`)); draw(root); } catch (e) { toast(ivErr(e), "err"); } };
    });
  };
  modal(`<h2>${ico("users")} ${bi("পার্টি মেলান", "Match parties")} <span class="tag" id="mt-n">0</span></h2><div class="mut sm">${bi("পুরনো Excel-এর পার্টির নাম কালেকশনের পার্টি তালিকার সাথে মেলান — তাহলে ডেলিভারি ও কালেকশন একসাথে হিসাব হবে। প্রস্তাবগুলো নামের মিল দেখে; ভুল হলে অন্যটা বাছুন বা খুঁজুন। নতুন অর্ডার তালিকা থেকে বাছলে নিজেই মেলে।", "Link the old Excel party names to the collection party list so delivery and collection add up together. Suggestions come from name similarity; pick or search another if wrong. New orders picked from the list link themselves.")}</div><div class="iv-ml" id="mt-l"></div><div class="modal-actions"><button class="btn pri" id="mt-all"></button><div class="sp"></div><button class="btn" id="mt-x">${bi("বন্ধ", "Close")}</button></div>`, (root, close) => {
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
  const C = ivCan(), F = Object.assign(ivLinkedPeriod(), { tab: ivParams().get("product") || "all" });
  v.innerHTML = head(ROUTES[CUR].t, `<button class="btn" id="rm-xl">${ico("dl")} Excel</button>${C.admin ? `<button class="btn" id="rm-op">${ico("sliders")} ${bi("Opening ও ব্যাগ সাইজ", "Opening & bag size")}</button>` : ""}`) +
    `<div class="card tbar noprint">${pbBar("rmpb", F)}</div><div id="rm-lk"></div><div id="rm-seg"></div><p class="iv-desc" id="rm-desc"></p><div id="rm-out"></div>`;
  let dF = "", dQ = "";
  const out = $("#rm-out", v);
  try { await invLoad(); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(ivErr(e))}</div>`; return; }

  const kg = (p, b) => ivQ(b * (+p.bag_kg || 0));
  const products = INV.rmp.filter(p => p.active !== false);
  if (!products.some(p => p.code === F.tab)) F.tab = "all";
  const seg = () => { $("#rm-seg", v).innerHTML = ivSeg("rm-tab", [["all", bi("একসাথে", "Combined")], ...products.map(p => [p.code, p.name])], F.tab); ivSegBind(v, "rm-tab", F, "tab", draw); };
  function card(code, f, t) {
    const L = rmLedgerRows(code, f, t), p = L.p, R = ivSum(L.rows, x => x.ready), D = ivSum(L.rows, x => x.del), cl = L.open + R - D, neg = L.rows.filter(x => x.stock < 0).length;
    return `<div class="card iv-rmc ${cl < 0 ? "neg" : ""}"><div class="iv-rmh"><b>${esc(p.name)}</b><span class="tag">1 bag = ${ivQ(p.bag_kg)} kg</span></div>
      <div class="iv-rmg"><div><small>${bi("শুরুর স্টক", "Opening")}</small><b class="num">${ivQ(L.open)}</b><i>${kg(p, L.open)} kg</i></div><div class="gr"><small>${bi("প্রস্তুত", "Ready")}</small><b class="num">+${ivQ(R)}</b><i>${kg(p, R)} kg</i></div><div class="am"><small>${bi("ডেলিভারি", "Delivery")}</small><b class="num">−${ivQ(D)}</b><i>${kg(p, D)} kg</i></div><div class="vi"><small>${bi("শেষ স্টক", "Closing stock")}</small><b class="num">${ivQ(cl)}</b><i>${kg(p, cl)} kg</i></div></div>
      ${rmInsight(p, L, R, D, cl, f, t)}
      ${neg ? `<div class="alert rd sm">${bi(`${neg} দিন স্টক মাইনাসে গেছে — রেকর্ড মিলিয়ে দেখুন`, `Stock went below zero on ${neg} day(s) — please check the entries`)}</div>` : ""}</div>`;
  }
  function rmInsight(p, L, R, D, cl, f, t) {
    const vals = [L.open, ...L.rows.map(r => r.stock)], days = Math.max(1, ivDays(f, t < today() ? t : today()) + 1), avgR = R / days, avgD = D / days, cover = avgD > 0 ? Math.floor(Math.max(0, cl) / avgD) : null;
    let svg = "";
    if (vals.length > 1) { const W = 300, H = 56, mx = Math.max(1, ...vals), mn = Math.min(0, ...vals), rg = (mx - mn) || 1, pts = vals.map((v2, i) => [i / (vals.length - 1) * W, H - 4 - (v2 - mn) / rg * (H - 8)]), d = pts.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join(""), zy = (H - 4 - (0 - mn) / rg * (H - 8)).toFixed(1), last = pts.at(-1);
      svg = `<svg class="iv-rms" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${bi("স্টকের গতি", "Stock trend")}"><title>${bi("শুরু", "Start")} ${ivQ(vals[0])} → ${bi("শেষ", "End")} ${ivQ(vals.at(-1))} bag</title><line x1="0" x2="${W}" y1="${zy}" y2="${zy}" class="z"/><path d="${d}L${W} ${H}L0 ${H}Z" class="a"/><path d="${d}" class="l"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5"/></svg>`; }
    const r1 = n => ivQ(Math.round(n * 10) / 10);
    return `${svg}<div class="iv-rmi"><span><small>${bi("গড় প্রস্তুত/দিন", "Avg ready/day")}</small><b class="num">${r1(avgR)}</b></span><span><small>${bi("গড় ডেলিভারি/দিন", "Avg delivery/day")}</small><b class="num">${r1(avgD)}</b></span><span class="${cover !== null && cover < 3 ? "warn" : ""}" title="${bi("আজকের হারে ডেলিভারি চললে বর্তমান স্টক কত দিন চলবে", "How many days the current stock lasts at the average delivery rate")}"><small>${bi("স্টক চলবে", "Stock lasts")}</small><b class="num">${cover === null ? "—" : cover + " " + bi("দিন", "days")}</b></span></div>`;
  }
  function combined(f, t) {
    const ps = INV.rmp.filter(p => p.active !== false), Ls = ps.map(p => rmLedgerRows(p.code, f, t));
    const dates = [...new Set(Ls.flatMap(L => L.rows.map(x => x.date)))].sort();
    const ckg = Ls.reduce((s, L, i) => s + (L.open + ivSum(L.rows, x => x.ready) - ivSum(L.rows, x => x.del)) * ps[i].bag_kg, 0);
    const qf = C.write ? `<div class="card iv-rmq noprint"><div class="dcx-et"><h3>${ico("plus")} ${bi("দৈনিক স্টক এন্ট্রি", "Daily stock entry")}</h3></div>
      <div class="iv-rq" style="--n:${ps.length}"><div><label class="f">${bi("তারিখ", "Date")}</label><input class="in big" type="date" id="rq-d" value="${today() >= f && today() <= t ? today() : t}" max="${today()}"></div>${ps.map(p => `<div class="iv-rqp"><b>${esc(p.name)}</b><div class="iv-rq2"><div><label class="f">Ready (bag)</label><input class="in big num rqi" data-c="${p.code}" data-k="r" inputmode="decimal" autocomplete="off"></div><div><label class="f">Delivery (bag)</label><input class="in big num rqi" data-c="${p.code}" data-k="x" inputmode="decimal" autocomplete="off"></div></div><small class="mut" data-sk="${p.code}"></small><div class="iv-rqn" data-nk="${p.code}" aria-live="polite"></div></div>`).join("")}<div class="wide"><label class="f">${bi("মন্তব্য", "Remarks")}</label><input class="in big rqi" id="rq-m" autocomplete="off"></div><div class="bt"><button class="btn pri big" id="rq-s">${ico("check")} ${bi("সেভ", "Save")}</button></div></div><div class="hint rd iv-err" id="rq-e"></div></div>` : "";
    return qf + `<div class="iv-rm2">${ps.map(p => card(p.code, f, t)).join("")}</div><div class="iv-ckg">${bi("মোট স্টক (দুটো মিলিয়ে)", "Total stock (both)")}: <b class="num">${ivQ(ckg)} kg</b></div>
      <div class="card flush"><div class="ch"><h3>${bi("দৈনিক হিসাব", "Daily")}</h3><span class="tag" id="rm-dn">${dates.length}</span></div>${dates.length ? rmDayTools(dates, Ls) : ""}${dates.length ? `<div class="iv-dk"><div class="tw"><table class="iv-rmt"><thead><tr><th rowspan="2">${bi("তারিখ", "Date")}</th>${ps.map(p => `<th colspan="3" class="c">${esc(p.name)} (bag)</th>`).join("")}</tr><tr>${ps.map(() => `<th class="r">Ready</th><th class="r">Delivery</th><th class="r">${bi("স্টক", "Stock")}</th>`).join("")}</tr></thead><tbody>${dates.slice().reverse().map(d => `<tr class="${C.write ? "iv-click" : ""}" data-day="${d}" data-tags="${rmTags(d, Ls)}">${`<td class="nw">${dmy(d)}${rmNote(d) ? ` <span class="iv-rmn" title="${esc(rmNote(d))}">${ico("note") || "✎"}</span>` : ""}</td>`}${Ls.map(L => { const x = L.rows.find(r => r.date === d); return x ? `<td class="r num gr">${x.ready ? "+" + ivQ(x.ready) : ""}</td><td class="r num am">${x.del ? "−" + ivQ(x.del) : ""}</td><td class="r num b ${x.stock < 0 ? "iv-neg" : ""}">${ivQ(x.stock)}</td>` : `<td></td><td></td><td></td>`; }).join("")}</tr>`).join("")}</tbody></table></div></div>
      <div class="iv-ph"><div class="iv-rdc">${dates.slice().reverse().map(d => `<article class="iv-rd${C.write ? " iv-click" : ""}" data-day="${d}" data-tags="${rmTags(d, Ls)}"><header><b>${dmy(d)}</b>${rmNote(d) ? `<small class="mut">${esc(rmNote(d))}</small>` : ""}</header>${Ls.map((L, i) => { const x = L.rows.find(r => r.date === d); return `<div class="iv-rdp"><span class="mut">${esc(ps[i].name)}</span>${x ? `<span class="gr num">${x.ready ? "+" + ivQ(x.ready) : "·"}</span><span class="am num">${x.del ? "−" + ivQ(x.del) : "·"}</span><b class="num ${x.stock < 0 ? "iv-neg" : ""}">${ivQ(x.stock)}</b>` : `<span></span><span></span><b class="mut">—</b>`}</div>`; }).join("")}</article>`).join("")}</div></div>` : ivEmpty(bi("এই সময়ে কোনো এন্ট্রি নেই", "No entries in this period"))}</div>`;
  }
  function rmNote(d) { return [...new Set(INV.rmd.filter(r => String(r.date).slice(0, 10) === d && r.remarks && (F.tab === "all" || r.product === F.tab)).map(r => r.remarks))].join(" · "); }
  function rmTags(d, Ls) { const xs = Ls.map(L => L.rows.find(r => r.date === d)).filter(Boolean); return [xs.some(x => x.del) ? "del" : "", xs.some(x => x.ready) ? "ready" : "", xs.some(x => x.stock < 0) ? "neg" : "", rmNote(d) ? "note" : ""].join(" "); }
  function rmDayTools(dates, Ls) {
    const c = k => dates.filter(d => rmTags(d, Ls).includes(k)).length;
    const opts = [["", bi("সব দিন", "All days"), dates.length], ["del", bi("ডেলিভারির দিন", "Delivery days"), c("del")], ["ready", bi("উৎপাদনের দিন", "Ready days"), c("ready")], ["note", bi("মন্তব্য আছে", "With remarks"), c("note")], ["neg", bi("স্টক মাইনাস", "Negative stock"), c("neg")]].filter(x => !x[0] || x[2]);
    return `<div class="iv-rmtool noprint"><div class="iv-cg" id="rm-df">${opts.map(([k, l, n]) => `<button type="button" class="chip sm${k === dF ? " on" : ""}" data-df="${k}" aria-pressed="${k === dF}">${l} <b>${n}</b></button>`).join("")}</div><input class="in sm" id="rm-dq" type="search" placeholder="${bi("তারিখ বা মন্তব্য খুঁজুন…", "Find date or remark…")}" value="${esc(dQ)}" aria-label="${bi("দিন খুঁজুন", "Find day")}"></div>${C.write ? `<p class="mut xs iv-rmhint">${bi("কোনো দিনে ক্লিক করলে সেই দিনের সংখ্যা উপরের এন্ট্রি ফর্মে চলে আসবে — বদলে সেভ করুন।", "Click a day to load it into the entry form above — change it and Save.")}</p>` : ""}`;
  }
  function dayFilter() {
    const q = ivSearch(dQ); let n = 0;
    $$("[data-day]", out).forEach(el => { const ok = (!dF || el.dataset.tags.includes(dF)) && (!q || ivSearch(dmy(el.dataset.day) + " " + el.dataset.day + " " + rmNote(el.dataset.day)).includes(q)); el.hidden = !ok; if (ok && el.tagName === "TR") n++; });
    const dn = $("#rm-dn", v); if (dn) dn.textContent = n;
  }
  function product(code, f, t) {
    const L = rmLedgerRows(code, f, t), p = L.p;
    const amount = bags => `<b class="num">${ivQ(bags)} <small>bag</small></b><small class="mut num">${kg(p, bags)} kg</small>`;
    const qty = (key, label) => `<div><label class="f" for="rf-${key}">${label}</label><input class="in num" type="number" min="0" step="0.01" inputmode="decimal" id="rf-${key}"></div>`;
    const form = C.write ? `<section class="card iv-stock-entry noprint" aria-labelledby="rf-title">
      <h3 id="rf-title">${ico("plus")} ${bi("স্টক এন্ট্রি", "Stock entry")}</h3>
      <div class="iv-stock-fields"><div class="iv-stock-date"><label class="f" for="rf-d">${bi("তারিখ", "Date")}</label><input class="in" type="date" id="rf-d" value="${t > today() ? today() : t}" max="${today()}"></div>
      ${qty("r", bi("প্রস্তুত (ব্যাগ)", "Ready (bags)"))}${qty("x", bi("ডেলিভারি (ব্যাগ)", "Delivery (bags)"))}
      <div class="iv-stock-note"><label class="f" for="rf-m">${bi("মন্তব্য", "Remarks")}</label><input class="in" id="rf-m"></div></div>
      <div class="iv-rqn" id="rf-n" aria-live="polite"></div><div class="iv-stock-save"><span class="mut sm" id="rf-h"></span><button class="btn pri" id="rf-s">${ico("check")} ${bi("সেভ", "Save entry")}</button></div><div class="hint rd iv-err" id="rf-e" role="status"></div>
      </section>` : "";
    const heads = [bi("তারিখ", "Date"), bi("প্রস্তুত", "Ready"), bi("ডেলিভারি", "Delivery"), bi("স্টক", "Closing stock"), bi("মন্তব্য", "Remarks")];
    const rows = [...L.rows].reverse().map(x => `<tr class="${x.stock < 0 ? "iv-stock-negative" : ""}${C.write ? " iv-click" : ""}" data-day="${x.date}" data-tags="${rmTags(x.date, [L])}">
      <td><time datetime="${x.date}">${dmy(x.date)}</time></td>
      <td data-label="${heads[1]}">${amount(x.ready)}</td><td data-label="${heads[2]}">${amount(x.del)}</td><td data-label="${heads[3]}">${amount(x.stock)}</td>
      <td class="iv-stock-remarks ${x.remarks ? "" : "iv-no-note"}">${esc(x.remarks || "—")}</td>${C.edit ? `<td class="iv-stock-edit noprint">${ivLocked(x.date) ? ico("ivlock") : `<button type="button" class="btn" data-rd="${x.date}" aria-label="${bi("এডিট করুন", "Edit entry")} ${dmy(x.date)}">${ico("edit")}</button>`}</td>` : ""}</tr>`).join("");
    return card(code, f, t) + form + `<section class="card iv-stock-history">
      <div class="iv-section-head"><div><h3>${bi("দৈনিক স্টক মুভমেন্ট", "Daily stock movements")}</h3><p class="mut sm">${dmy(f)} – ${dmy(t)}</p></div><span class="tag" id="rm-dn">${L.rows.length}</span></div>
      ${rows ? rmDayTools(L.rows.map(x => x.date), [L]) : ""}${rows ? `<div class="iv-ph"><div class="iv-rdc">${[...L.rows].reverse().map(x => `<article class="iv-rd iv-rd1${C.write ? " iv-click" : ""}${x.stock < 0 ? " neg" : ""}" data-day="${x.date}" data-tags="${rmTags(x.date, [L])}"><header><b>${dmy(x.date)}</b>${ivLocked(x.date) ? ico("ivlock") : ""}${x.remarks ? `<small class="mut">${esc(x.remarks)}</small>` : ""}</header><div class="iv-rd3"><span><small>${bi("প্রস্তুত", "Ready")}</small><b class="num ${x.ready ? "gr" : "mut"}">${x.ready ? "+" + ivQ(x.ready) : "0"}</b><i>${kg(p, x.ready)} kg</i></span><span><small>${bi("ডেলিভারি", "Delivery")}</small><b class="num ${x.del ? "am" : "mut"}">${x.del ? "−" + ivQ(x.del) : "0"}</b><i>${kg(p, x.del)} kg</i></span><span class="iv-stc"><small>${bi("স্টক", "Stock")}</small><b class="num ${x.stock < 0 ? "iv-neg" : ""}">${ivQ(x.stock)}</b><i>${kg(p, x.stock)} kg</i></span></div></article>`).join("")}</div></div>` : ""}
      ${rows ? `<div class="iv-dk iv-stock-scroll"><table class="iv-stock-table"><thead><tr>${heads.map(h => `<th scope="col">${h}</th>`).join("")}${C.edit ? `<th scope="col" class="noprint">${bi("এডিট", "Edit")}</th>` : ""}</tr></thead><tbody>${rows}</tbody></table></div>` : ivEmpty(bi("এই সময়ে কোনো এন্ট্রি নেই", "No entries in this period"))}</section>`;
  }
  function draw() {
    const [f, t] = pbRange(F); seg();
    $("#rm-lk", v).innerHTML = F.m === "month" ? ivLockNote(f) : "";
    $("#rm-desc", v).innerHTML = ico("info") + " " + (F.tab === "all" ? bi("দুই পণ্যের দৈনিক উৎপাদন (Ready) ও ডেলিভারি একসাথে লিখুন। লেখার সাথে সাথে নতুন স্টক দেখাবে। স্টক = Opening + Ready − Delivery।", "Enter today’s Ready and Delivery for both products together — the new stock shows as you type. Stock = Opening + Ready − Delivery.") : bi("এই পণ্যের দৈনিক উৎপাদন, ডেলিভারি ও স্টক। লেখার সাথে সাথে নতুন স্টক দেখাবে; নিচে কোনো দিনে চাপলে সেটা ফর্মে চলে আসবে।", "Daily ready, delivery and stock for this product. The new stock shows as you type; tap any day below to load it into the form."));
    out.innerHTML = F.tab === "all" ? combined(f, t) : product(F.tab, f, t);
    if (F.tab !== "all") labelTables(out);
    const df = $("#rm-df", out); if (df) df.onclick = e => { const b = e.target.closest("[data-df]"); if (!b) return; dF = b.dataset.df; $$("[data-df]", df).forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", String(x === b)); }); dayFilter(); };
    const dq = $("#rm-dq", out); if (dq) dq.oninput = () => { dQ = dq.value; dayFilter(); };
    if (F.tab !== "all") dayFilter();
    if (F.tab === "all") { dayFilter(); out.onclick = e => { const r = e.target.closest("[data-day]"); const d0 = $("#rq-d", out); if (!r || !d0 || getSelection().toString()) return; d0.value = r.dataset.day; d0.dispatchEvent(new Event("change")); $(".iv-rmq", out).scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); $(".iv-rmq", out).classList.remove("flash"); void out.offsetWidth; $(".iv-rmq", out).classList.add("flash"); }; } else out.onclick = null;
    if (F.tab !== "all" && C.write) {
      const code = F.tab, fill = () => { const d = $("#rf-d", out).value, x = INV.rmd.find(r => String(r.date).slice(0, 10) === d && r.product === code); $("#rf-r", out).value = x ? +x.ready_bag || "" : ""; $("#rf-x", out).value = x ? +x.delivery_bag || "" : ""; $("#rf-m", out).value = x?.remarks || ""; $("#rf-h", out).textContent = x ? bi("এই তারিখের এন্ট্রি আছে — সেভ করলে বদলে যাবে", "An entry exists for this date — saving will replace it") : ""; $("#rf-e", out).textContent = ivLocked(d) ? ivErr(new Error("month_locked")) : ""; };
      $("#rf-d", out).onchange = fill; fill();
      const sec = $(".iv-stock-entry", out), prev = () => { const d = $("#rf-d", out).value, r = evalAmt($("#rf-r", out).value), x = evalAmt($("#rf-x", out).value), box = $("#rf-n", out), p = INV.rmp.find(z => z.code === code); if (!d) { box.innerHTML = ""; return; } if (!Number.isFinite(r) || !Number.isFinite(x)) { box.innerHTML = `<span class="rd">${bi("সংখ্যা ঠিক নেই", "Check the number")}</span>`; return; } const sb = rmStockAt(code, addDays(d, -1)), ns = sb + r - x, ch = ns - sb; box.className = "iv-rqn" + (ns < 0 ? " neg" : " on"); box.innerHTML = `${bi("আগের দিনের স্টক", "Stock the day before")} <b class="num">${ivQ(sb)}</b> → ${bi("এই দিনের পর", "after this day")} <b class="num">${ivQ(ns)} bag</b> <span class="mut">· ${ivQ(ns * p.bag_kg)} kg</span> <i class="${ch >= 0 ? "gr" : "am"}">${ch >= 0 ? "▲" : "▼"} ${ivQ(Math.abs(ch))}</i>`; };
      $("#rf-d", out).addEventListener("change", prev); ["rf-r", "rf-x"].forEach(id => $("#" + id, out).addEventListener("input", prev)); prev();
      out.onclick = e => { const r = e.target.closest("[data-day]"); if (!r || getSelection().toString() || !sec) return; if (ivLocked(r.dataset.day)) { toast(ivErr(new Error("month_locked")), "err"); return; } $("#rf-d", out).value = r.dataset.day; fill(); prev(); sec.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); sec.classList.remove("flash"); void sec.offsetWidth; sec.classList.add("flash"); if (matchMedia("(pointer: fine)").matches) $("#rf-r", out).focus(); };
      $("#rf-s", out).onclick = async () => {
        const d = $("#rf-d", out).value, r = evalAmt($("#rf-r", out).value), x = evalAmt($("#rf-x", out).value), e = m => $("#rf-e", out).textContent = m;
        if (!d || d > today()) return e(bi("সঠিক তারিখ দিন", "Enter a valid date up to today")); if (ivLocked(d)) return e(ivErr(new Error("month_locked"))); if (!$("#rf-r", out).validity.valid || !$("#rf-x", out).validity.valid || !Number.isFinite(r) || !Number.isFinite(x) || r < 0 || x < 0) return e(bi("শূন্য বা বেশি, সর্বোচ্চ দুই ঘর দশমিক দিন", "Enter non-negative amounts with up to two decimals"));
        const ex = INV.rmd.find(z => String(z.date).slice(0, 10) === d && z.product === code);
        const remarks = $("#rf-m", out).value.trim();
        if (!(ex ? C.edit : C.entry)) return e(writeDenied().message);
        const button = $("#rf-s", out);
        button.disabled = true;
        try {
          if (!r && !x && !remarks) { if (!ex) return e(bi("Ready বা Delivery দিন", "Enter ready or delivery")); if (!C.admin) return e(bi("এন্ট্রি মুছতে পারেন শুধু admin", "Only an admin can remove an entry")); if (!ask(bi("এই দিনের এন্ট্রি মুছবেন?", "Delete this day’s entry?"))) return; await API.rmDailyDelete(d, code); }
          else await API.rmDailySave({ date: d, product: code, ready_bag: r, delivery_bag: x, remarks });
          rmPatch(d, code, r, x, remarks, !r && !x && !remarks); const st = rmStockAt(code, d); toast(bi("✔ সেভ হয়েছে", "✔ Saved") + ` · ${bi("স্টক", "Stock")} ${ivQ(st)} bag`, st < 0 ? "err" : "ok"); if (F.tab === code && button.isConnected) { draw(); const date = $("#rf-d", out); date.value = d; date.dispatchEvent(new Event("change")); }
        } catch (z) { e(ivErr(z)); } finally { button.disabled = false; }
      };
    }
    if (F.tab === "all" && C.write && $("#rq-s", out)) {
      const ps = INV.rmp.filter(p => p.active !== false), ins = $$(".rqi", out);
      const fill = () => { const d = $("#rq-d", out).value; ps.forEach(p => { const x = INV.rmd.find(r => String(r.date).slice(0, 10) === d && r.product === p.code); $(`[data-c="${p.code}"][data-k="r"]`, out).value = x ? +x.ready_bag || "" : ""; $(`[data-c="${p.code}"][data-k="x"]`, out).value = x ? +x.delivery_bag || "" : ""; const sb = rmStockAt(p.code, addDays(d, -1)); $(`[data-sk="${p.code}"]`, out).textContent = bi(`আগের দিনের স্টক ${ivQ(sb)} bag`, `Stock the day before ${ivQ(sb)} bag`) + (x ? bi(" · এই তারিখের এন্ট্রি আছে", " · this date has an entry") : ""); }); const x0 = INV.rmd.find(r => String(r.date).slice(0, 10) === d && r.remarks); $("#rq-m", out).defaultValue = $("#rq-m", out).value = x0?.remarks || ""; $("#rq-e", out).textContent = ivLocked(d) ? ivErr(new Error("month_locked")) : ""; };
      const preview = () => { const d = $("#rq-d", out).value; ps.forEach(p => { const box = $(`[data-nk="${p.code}"]`, out), ex = INV.rmd.find(r => String(r.date).slice(0, 10) === d && r.product === p.code), sb = rmStockAt(p.code, addDays(d, -1)), r = evalAmt($(`[data-c="${p.code}"][data-k="r"]`, out).value), x = evalAmt($(`[data-c="${p.code}"][data-k="x"]`, out).value); if (!Number.isFinite(r) || !Number.isFinite(x)) { box.innerHTML = `<span class="rd">${bi("সংখ্যা ঠিক নেই", "Check the number")}</span>`; return; } const ns = sb + r - x, ch = ns - sb; box.className = "iv-rqn" + (ns < 0 ? " neg" : (r || x) ? " on" : ""); box.innerHTML = (r || x || ex) ? `${bi("এই দিনের পর স্টক", "Stock after this day")} <b class="num">${ivQ(ns)} bag</b> <span class="mut">· ${ivQ(ns * p.bag_kg)} kg</span> <i class="${ch >= 0 ? "gr" : "am"}">${ch >= 0 ? "▲" : "▼"} ${ivQ(Math.abs(ch))}</i>` : ""; }); };
      $("#rq-d", out).onchange = () => { fill(); preview(); }; fill(); preview();
      ins.forEach(el => el.addEventListener("input", preview));
      ins.forEach((el, i) => el.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); i < ins.length - 1 ? ins[i + 1].focus() : $("#rq-s", out).click(); } });
      $("#rq-s", out).onclick = async () => {
        const d = $("#rq-d", out).value, m = $("#rq-m", out).value.trim(), e = t => $("#rq-e", out).textContent = t; if (!d || d > today()) return e(bi("সঠিক তারিখ দিন", "Enter a valid date up to today"));
        if (ivLocked(d)) return e(ivErr(new Error("month_locked")));
        const rows = [], originalNote = $("#rq-m", out).defaultValue;
        for (const p of ps) {
          const read = key => evalAmt($(`[data-c="${p.code}"][data-k="${key}"]`, out).value);
          const ready = read("r"), delivery = read("x");
          if (![ready, delivery].every(Number.isFinite) || ready < 0 || delivery < 0) return e(ivErr(new Error("negative_qty")));
          const ex = INV.rmd.find(z => z.date === d && z.product === p.code);
          if (!ex && !ready && !delivery) continue;
          const remarks = m !== originalNote ? m : ex?.remarks || "";
          if (ex && ready === +ex.ready_bag && delivery === +ex.delivery_bag && remarks === (ex.remarks || "")) continue;
          if (!(ex ? C.edit : C.entry)) return e(writeDenied().message);
          rows.push({ date: d, product: p.code, ready_bag: ready, delivery_bag: delivery, remarks });
        }
        if (!rows.length) return e(bi("কোনো পরিমাণ বা নোট পরিবর্তন হয়নি", "No quantities or remarks changed"));
        const button = $("#rq-s", out);
        button.disabled = true;
        try {
          await API.rmDailySaveMany(rows);
          for (const row of rows) rmPatch(d, row.product, row.ready_bag, row.delivery_bag, row.remarks);
          const msg = ps.map(p => `${p.name.split(" ")[0]} ${ivQ(rmStockAt(p.code, d))}`).join(" · "); toast(bi("✔ সেভ হয়েছে · স্টক ", "✔ Saved · stock ") + msg, ps.some(p => rmStockAt(p.code, d) < 0) ? "err" : "ok"); draw(); setTimeout(() => { const nd = $("#rq-d", out); if (nd) { nd.value = addDays(d, 1) <= today() ? addDays(d, 1) : d; nd.dispatchEvent(new Event("change")); if (matchMedia("(pointer: fine)").matches) $(".rqi", out)?.focus(); } }, 0);
        } catch (z) { e(ivErr(z)); button.disabled = false; }
      };
    }
  }
  pbBind(v, "rmpb", F, draw);
  const op = $("#rm-op", v); if (op) op.onclick = () => modal(`<h2>${bi("Opening ও ব্যাগ সাইজ", "Opening & bag size")}</h2><div class="mut sm">${bi("Opening তারিখের পরের সব দৈনিক এন্ট্রি থেকে স্টক হিসাব হয়।", "Stock is counted from every daily entry after the opening date.")}</div>${INV.rmp.map(p => `<div class="iv-fg rmo" data-c="${p.code}"><div><label class="f">${bi("নাম", "Name")}</label><input class="in" data-k="name" value="${esc(p.name)}"></div><div><label class="f">kg / bag</label><input class="in" type="number" min="1" step="any" data-k="bag_kg" value="${+p.bag_kg}"></div><div><label class="f">${bi("Opening তারিখ", "Opening date")}</label><input class="in" type="date" data-k="opening_date" value="${String(p.opening_date).slice(0, 10)}"></div><div><label class="f">Opening (bag)</label><input class="in" type="number" step="any" data-k="opening_bag" value="${+p.opening_bag}"></div></div>`).join("")}<div class="hint rd iv-err" id="op-e"></div><div class="modal-actions"><button class="btn" id="op-x">${bi("বাতিল", "Cancel")}</button><button class="btn pri" id="op-s">${bi("সেভ", "Save")}</button></div>`, (root, close) => {
    $("#op-x", root).onclick = close;
    $("#op-s", root).onclick = async () => { try { for (const r of $$("[data-c]", root)) { const o = { code: r.dataset.c }; $$("[data-k]", r).forEach(i => o[i.dataset.k] = i.value); if (!(+o.bag_kg > 0) || !o.opening_date) throw new Error(bi("ব্যাগ সাইজ ও তারিখ ঠিক করে দিন", "Check bag size and date")); await API.rmProductSave(o); } await invLoad(true); close(); draw(); toast(bi("✔ সেভ হয়েছে", "✔ Saved")); } catch (x) { $("#op-e", root).textContent = ivErr(x); } };
  });
  $("#rm-xl", v).onclick = () => {
    const [f, t] = pbRange(F), sh = {};
    products.filter(p => F.tab === "all" || p.code === F.tab).forEach(p => { const L = rmLedgerRows(p.code, f, t); sh[p.name.slice(0, 28)] = [["Date", "Ready (bag)", "Ready (kg)", "Delivery (bag)", "Delivery (kg)", "Stock (bag)", "Stock (kg)", "Remarks"], ["Opening", "", "", "", "", L.open, L.open * p.bag_kg, ""], ...L.rows.map(x => [x.date, x.ready, x.ready * p.bag_kg, x.del, x.del * p.bag_kg, x.stock, x.stock * p.bag_kg, x.remarks])]; });
    exportXlsx(sh, `RM_Factory_${f}_${t}.xlsx`);
  };
  draw();
}

/* =================== exceptions (shared by Dashboard + Report) =================== */
function ivExceptions(f, t) {
  const X = [], cutoff = t < today() ? t : today();
  INV.orders.filter(o => ivPendingAt(o, cutoff)).forEach(o => { const d = ivDays(o.date, cutoff); if (d > 7) X.push({ k: "late", d: o.date, txt: `${o.ch === "nir" ? "Niramoy" : esc(ivPname(o))} · ${ivQ(o.total_qty)} ctn · ${d} ${bi("দিন ধরে Pending", "days pending")}`, ch: o.ch, n: d }); });
  INV.rmp.forEach(p => rmLedgerRows(p.code, f, t).rows.filter(x => x.stock < 0).forEach(x => X.push({ k: "neg", d: x.date, txt: `${esc(p.name)} · ${bi("স্টক", "stock")} ${ivQ(x.stock)} bag` })));
  const ms = [...new Set(INV.orders.filter(o => o.date >= f && o.date <= t).map(o => ivMon(o.date)))].filter(m => m >= ivMon(f));
  ms.forEach(m => ["dist", "nir"].forEach(ch => { const dm = ivDemandOf(ch, m); if (!Object.keys(dm).length) return; const tt = ivItemTotals(INV.orders.filter(o => o.ch === ch && ivInPeriod(o, m, ivMonEnd(m)))); Object.entries(dm).forEach(([id, q]) => { const o = tt[id]?.ord || 0; if (o > q) X.push({ k: "over", ch, d: m, txt: `${ivMonName(m)} · ${esc(ivItemName(id))} · Demand ${ivQ(q)}, ${bi("অর্ডার", "ordered")} ${ivQ(o)} (+${ivQ(o - q)})` }); }); }));
  INV.orders.filter(o => o.date >= f && o.date <= t && o.status === "ok" && o.delivery_date && o.delivery_date < o.date).forEach(o => X.push({ k: "date", ch: o.ch, d: o.date, txt: `${esc(o.party || o.transport || "")} · ${bi("ডেলিভারির তারিখ অর্ডারের আগে", "delivery date before order date")}` }));
  return X.sort((a, b) => (a.d < b.d ? 1 : -1));
}
const IV_XK = { late: ["দেরিতে Pending", "Late pending", "#d97706"], neg: ["স্টক মাইনাস", "Negative stock", "#dc2626"], over: ["Demand-এর বেশি অর্ডার", "Over demand", "#7c3aed"], date: ["তারিখে ভুল", "Date error", "#0ea5e9"] };

/* =================== Inventory Dashboard =================== */
/* Dashboard drill-down links carry the displayed period across Inventory pages. */
const ivParams = () => new URLSearchParams(location.hash.split("?")[1] || "");
function ivLinkedPeriod() {
  const params = ivParams(), f = params.get("from"), t = params.get("to");
  const valid = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "") && !isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
  if (!valid(f) || !valid(t) || f > t) return pbInit("month");
  const mode = params.get("period");
  if (mode === "month" && f === ivMon(f) && t === ivMonEnd(f)) return { ...pbInit("month"), d: f };
  if (mode === "day" && f === t) return { ...pbInit("day"), d: f };
  return { ...pbInit("custom"), f, t };
}
function ivDashboardData(f, t, channel, monthly) {
  const cutoff = t < today() ? t : today();
  const orders = INV.orders.filter(o => o.status !== "cancel" && (channel === "all" || o.ch === channel));
  const placed = orders.filter(o => o.date >= f && o.date <= t);
  const delivered = orders.filter(o => ivDelIn(o, f, t));
  const pending = orders.filter(o => ivPendingAt(o, cutoff)).sort((a, b) => a.date.localeCompare(b.date));
  const step = Math.max(1, Math.ceil((ivDays(f, t) + 1) / 31));
  const buckets = [];
  for (let date = f; date <= t; date = addDays(date, step)) {
    const end = addDays(date, step - 1);
    buckets.push({ date, end: end < t ? end : t, qty: 0, value: 0, count: 0, placed: 0, ch: { nir: { qty: 0, value: 0, count: 0 }, dist: { qty: 0, value: 0, count: 0 } }, items: new Map() });
  }
  const at = d => Math.min(buckets.length - 1, Math.max(0, Math.floor(ivDays(f, d) / step)));
  placed.forEach(o => buckets[at(o.date)].placed++);
  const itemTotals = new Map(), itemValue = new Map(), fulfillment = new Map();
  for (const o of delivered) {
    const bucket = buckets[at(o.delivery_date || o.date)], c = bucket.ch[o.ch] || (bucket.ch[o.ch] = { qty: 0, value: 0, count: 0 });
    bucket.qty += o.total_qty; bucket.value += o.value; bucket.count++;
    c.qty += o.total_qty; c.value += o.value; c.count++;
    for (const [id, line] of Object.entries(o.lines)) {
      const qty = Number(line.q) || 0;
      itemTotals.set(id, (itemTotals.get(id) || 0) + qty);
      itemValue.set(id, (itemValue.get(id) || 0) + qty * (Number(line.r) || 0));
      bucket.items.set(id, (bucket.items.get(id) || 0) + qty);
      const key = o.ch + ":" + id;
      fulfillment.set(key, (fulfillment.get(key) || 0) + qty);
    }
  }
  let demand = 0, fulfilled = 0;
  const demandRows = [], demandCh = {};
  if (monthly) {
    for (const ch of channel === "all" ? Object.keys(IV_CH) : [channel]) {
      const c = demandCh[ch] = { demand: 0, done: 0 };
      for (const [id, qty] of Object.entries(ivDemandOf(ch, ivMon(f)))) {
        const target = Number(qty) || 0, done = Math.min(target, fulfillment.get(ch + ":" + id) || 0);
        demand += target; fulfilled += done; c.demand += target; c.done += done;
        demandRows.push({ ch, id, target, done });
      }
    }
  }
  return { cutoff, placed, delivered, pending, buckets, demand, fulfilled, itemTotals, itemValue, demandRows, demandCh };
}

/* Inventory Dashboard v2 — command search, live filters, smart insights, interactive chart & previews */
async function vInvDash(v) {
  const F = pbInit("month");
  let channel = "all", metric = "value", selected = 0, scope = "", ageF = "", qF = "", xF = "", moreQ = false, firstPaint = true, D = null, spinning = false;
  const shown = new Map(), reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  v.innerHTML = head(ROUTES[CUR].t, `<a class="btn" id="ivd-report" href="#/ivrep">${ico("chart")} ${bi("রিপোর্ট", "Reports")}</a><a class="btn" id="ivd-factory" href="#/ivrm">${ico("ivfac")} ${bi("ফ্যাক্টরি স্টক", "Factory stock")}</a>`) +
    `<div class="card tbar noprint">${pbBar("idpb", F)}</div>
    <div class="ivd-cmd noprint"><div class="ivd-find"><span class="ivd-find-i" aria-hidden="true">${ico("search")}</span>
      <input class="in" id="ivd-q" type="search" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="ivd-res" aria-autocomplete="list" placeholder="${bi("অর্ডার, পার্টি, আইটেম, পণ্য বা কমান্ড খুঁজুন…", "Search orders, parties, items, products or commands…")}" aria-label="${bi("ড্যাশবোর্ড সার্চ", "Dashboard search")}"><kbd>/</kbd>
      <div class="ivd-res" id="ivd-res" role="listbox" hidden></div></div>
      <div class="ivd-upd"><span class="mut sm" id="ivd-upd"></span><button type="button" class="btn sm" id="ivd-refresh" title="${bi("এখনই রিফ্রেশ", "Refresh now")}">${ico("refresh")} ${bi("রিফ্রেশ", "Refresh")}</button></div></div>
    <div class="ivd" id="id-out"></div>`;
  const out = $("#id-out", v), qIn = $("#ivd-q", v), res = $("#ivd-res", v);
  const lakh = n => n >= 1e7 ? (n / 1e7).toFixed(2) + bi(" কোটি", " Cr") : n >= 1e5 ? (n / 1e5).toFixed(2) + bi(" লাখ", " L") : money0(n);
  const fmt = (value, key) => key === "qty" ? ivQ(value) + " ctn" : (key === "count" || key === "int") ? ivQ(value) : "৳ " + money0(value);
  const nm = o => o.ch === "nir" ? (o.transport || ivPname(o)) : ivPname(o);
  const chName = ch => bi(...(IV_CH[ch] || [ch, ch]));
  /* ---- search index (rebuilt only when the data changes) ---- */
  let sKey = "", sIdx = new Map();
  const orderText = o => {
    const key = INV_T + ":" + INV.orders.length;
    if (key !== sKey) { sKey = key; sIdx = new Map(); }
    let s = sIdx.get(o.id);
    if (s === undefined) { s = ivSearch([nm(o), ivPname(o), o.transport, o.vehicle, o.date, dmy(o.date), o.status, IV_CH[o.ch]?.join(" "), ...Object.keys(o.lines).map(ivItemName)].join(" ")); sIdx.set(o.id, s); }
    return s;
  };
  const matchQ = o => !qF || orderText(o).includes(ivSearch(qF));
  const link = (page, opts = {}) => { const [f, t] = pbRange(F); return "#/" + page + "?" + new URLSearchParams({ from: f, to: t, period: F.m, ...opts }); };
  /* ---- tiny helpers ---- */
  const delta = (cur, prev, upGood = true) => {
    if (!prev && !cur) return `<em class="ivk-d flat">—</em>`;
    if (!prev) return `<em class="ivk-d up">${bi("নতুন", "new")}</em>`;
    const p = Math.round((cur - prev) / prev * 100);
    if (!p) return `<em class="ivk-d flat">= 0%</em>`;
    return `<em class="ivk-d ${(p > 0) === upGood ? "up" : "dn"}" title="${bi("আগের সময়ের তুলনায়", "vs previous period")}">${p > 0 ? "▲" : "▼"} ${Math.abs(p)}%</em>`;
  };
  const spark = arr => {
    const n = arr.length, mx = Math.max(0, ...arr);
    if (n < 2 || !mx) return `<svg class="ivk-sp" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path class="l" d="M0 28H100"/></svg>`;
    const d = arr.map((x, i) => (i ? "L" : "M") + (i / (n - 1) * 100).toFixed(1) + " " + (28 - x / mx * 25).toFixed(1)).join("");
    return `<svg class="ivk-sp" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${d}L100 30L0 30Z"/><path class="l" d="${d}"/></svg>`;
  };
  const num = (key, value, kind) => `<b class="ivk-v num" data-count="${value}" data-kind="${kind}" data-key="${key}">${fmt(value, kind)}</b>`;
  const animate = () => $$("[data-count]", out).forEach(el => {
    const to = +el.dataset.count, key = el.dataset.key, from = shown.has(key) ? shown.get(key) : (firstPaint ? 0 : to), kind = el.dataset.kind;
    shown.set(key, to);
    if (reduce || from === to) return;
    const t0 = performance.now(), dur = 650;
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3), x = from + (to - from) * e; el.textContent = fmt(kind === "int" ? Math.round(x) : x, kind); if (k < 1 && el.isConnected) requestAnimationFrame(step); else el.textContent = fmt(to, kind); };
    requestAnimationFrame(step);
  });
  /* ---- partial renderers (no full redraw when only a list filter changes) ---- */
  function renderQueue() {
    const box = $("#ivd-queue", out); if (!box || !D) return;
    const { pending, cutoff } = D, age = o => ivDays(o.date, cutoff), base = pending.filter(matchQ);
    const cnt = n => base.filter(o => age(o) > n).length;
    const bands = [["", bi("সব", "All"), base.length], [">3", "> 3 " + bi("দিন", "d"), cnt(3)], [">7", "> 7 " + bi("দিন", "d"), cnt(7)], [">14", "> 14 " + bi("দিন", "d"), cnt(14)]];
    const limit = ageF ? +ageF.slice(1) : -1, rows = base.filter(o => age(o) > limit), cap = moreQ ? 25 : 6, vis = rows.slice(0, cap);
    const cls = a => a > 7 ? "bad" : a > 3 ? "warn" : "ok";
    const prev = o => {
      const ls = Object.entries(o.lines).sort((a, b) => b[1].q - a[1].q), top = ls.slice(0, 4);
      return `<div class="ivd-prev" role="tooltip"><b>${esc(nm(o))}</b><small>${chName(o.ch)} · ${dmy(o.date)} · ${ivSt(o.status)}</small>
        ${top.map(([id, l]) => `<div><span>${esc(ivItemName(id))}</span><i class="num">${ivQ(l.q)} × ${money0(l.r)}</i></div>`).join("")}${ls.length > 4 ? `<small class="mut">+${ls.length - 4} ${bi("আরও আইটেম", "more items")}</small>` : ""}
        <div class="ivd-prev-t"><span>${ivQ(o.total_qty)} ctn</span><b class="num">৳ ${money0(o.value)}</b></div></div>`;
    };
    box.innerHTML = `<div class="iv-section-head"><div><h3>${bi("পুরোনো খোলা অর্ডার", "Oldest open orders & trips")} <span class="tag">${base.length}</span></h3><p class="mut sm">${bi("কত দিন ধরে বাকি — ক্লিক করলে খুলবে, হোভারে প্রিভিউ", "How long each has waited — click to open, hover to preview")}</p></div><a href="${esc(link("ivrep", { channel }))}">${bi("রিপোর্ট", "Report")} ›</a></div>
      <div class="ivd-chips" role="group" aria-label="${bi("বয়স ফিল্টার", "Age filter")}">${bands.map(([k, l, n]) => `<button type="button" class="chip sm${k === ageF ? " on" : ""}" data-age="${k}" aria-pressed="${k === ageF}">${l} <b>${n}</b></button>`).join("")}</div>
      ${vis.length ? `<ul class="ivd-q">${vis.map(o => { const a = age(o); return `<li><button type="button" data-order="${esc(o.id)}"><i class="ivd-dot ${o.ch}"></i><span class="ivd-qn"><b>${esc(nm(o))}</b><small>${chName(o.ch)} · ${dmy(o.date)} · ${ivQ(o.total_qty)} ctn</small></span><strong class="ivd-age ${cls(a)}">${a} ${bi("দিন", "d")}</strong></button>${prev(o)}</li>`; }).join("")}</ul>
        ${rows.length > 6 ? `<button type="button" class="btn sm ivd-more" data-more>${moreQ ? bi("কম দেখান", "Show less") : bi(`আরও ${Math.min(rows.length, 25) - 6}টি দেখান`, `Show ${Math.min(rows.length, 25) - 6} more`)}</button>` : ""}` : ivEmpty(qF || ageF ? bi("ফিল্টারে কিছু মেলেনি", "Nothing matches the filter") : bi("কোনো খোলা অর্ডার নেই ✓", "No open orders or trips ✓"))}`;
  }
  function renderItems() {
    const box = $("#ivd-items", out); if (!box || !D) return;
    const q = ivSearch(qF), all = [...D.itemTotals.entries()].sort((a, b) => b[1] - a[1]), tot = all.reduce((s, x) => s + x[1], 0) || 1;
    const top = all.filter(([id]) => !q || ivSearch(ivItemName(id)).includes(q)).slice(0, 6), mx = Math.max(1, ...top.map(x => x[1]));
    box.innerHTML = `<div class="iv-section-head"><div><h3>${bi("সবচেয়ে বেশি ডেলিভারি", "Most delivered items")}</h3><p class="mut sm">${bi("পরিমাণ, মূল্য ও মোটের অংশ", "Quantity, value and share of the total")}</p></div></div>
      ${top.length ? `<ol class="ivd-items">${top.map(([id, qty], i) => `<li style="--w:${(qty / mx * 100).toFixed(1)}%;--i:${i}"><span class="ivd-in">${esc(ivItemName(id))}</span><b class="num">${ivQ(qty)} ctn</b><small class="mut num">৳ ${money0(D.itemValue.get(id) || 0)} · ${Math.round(qty / tot * 100)}%</small><s></s></li>`).join("")}</ol>` : ivEmpty(bi("এই সময়ে ডেলিভারি নেই", "No deliveries in this period"))}`;
  }
  function renderAlerts() {
    const box = $("#ivd-alerts", out); if (!box || !D) return;
    const [f, t] = pbRange(F), q = ivSearch(qF), all = ivExceptions(f, t).filter(x => (channel === "all" || !x.ch || x.ch === channel) && (!q || ivSearch(x.txt).includes(q)));
    const kinds = Object.keys(IV_XK), rows = all.filter(x => !xF || x.k === xF);
    box.innerHTML = `<div class="iv-section-head"><div><h3>${bi("সতর্কতা", "Alerts")} <span class="tag">${all.length}</span></h3><p class="mut sm">${bi("যেসব বিষয়ে এখনই নজর দেওয়া দরকার", "Things that need attention right now")}</p></div><a href="${esc(link("ivrep", { section: "exc", channel }))}">${bi("সব দেখুন", "View all")} ›</a></div>
      <div class="ivd-chips" role="group" aria-label="${bi("সতর্কতার ধরন", "Alert type")}"><button type="button" class="chip sm${xF ? "" : " on"}" data-xk="" aria-pressed="${!xF}">${bi("সব", "All")} <b>${all.length}</b></button>${kinds.map(k => { const n = all.filter(x => x.k === k).length; return n || xF === k ? `<button type="button" class="chip sm${xF === k ? " on" : ""}" data-xk="${k}" aria-pressed="${xF === k}"><i class="ivd-xd" style="background:${IV_XK[k][2]}"></i>${bi(IV_XK[k][0], IV_XK[k][1])} <b>${n}</b></button>` : ""; }).join("")}</div>
      ${rows.length ? `<ul class="ivd-alerts">${rows.slice(0, 6).map(x => `<li><i class="ivd-xd" style="background:${IV_XK[x.k][2]}"></i><span>${x.txt}</span><small class="mut">${x.d ? dmy(x.d) : ""}</small></li>`).join("")}</ul>${rows.length > 6 ? `<p class="mut sm ivd-hint">+${rows.length - 6} ${bi("আরও — রিপোর্টে দেখুন", "more — see the report")}</p>` : ""}` : ivEmpty(bi("কোনো সতর্কতা নেই ✓", "No alerts ✓"))}`;
  }
  /* ---- main draw ---- */
  function draw() {
    if (!out.isConnected || !INV) return;
    const [f, t] = pbRange(F), focus = document.activeElement, focusKey = out.contains(focus) ? focus.id : "";
    const monthly = F.m === "month";
    D = ivDashboardData(f, t, channel, monthly);
    const len = ivDays(f, t) + 1, pr = monthly ? [ivMon(addDays(f, -1)), addDays(f, -1)] : [addDays(f, -len), addDays(f, -1)];
    const P = ivDashboardData(pr[0], pr[1], channel, false);
    const { cutoff, placed, delivered, pending, buckets, demand, fulfilled, itemTotals } = D;
    const key = [f, t, channel].join("|");
    if (key !== scope) { selected = Math.max(0, buckets.findLastIndex(b => b.count > 0)); scope = key; }
    const age = o => ivDays(o.date, cutoff), delayed = pending.filter(o => age(o) > 7), pDelayed = P.pending.filter(o => ivDays(o.date, P.cutoff) > 7);
    const sumQ = a => ivSum(a, o => o.total_qty), sumV = a => ivSum(a, o => o.value);
    $("#ivd-report", v).href = link("ivrep", { section: channel === "all" ? "status" : channel });
    $("#ivd-factory", v).href = link("ivrm");
    const choice = (group, value, current, label) => `<button type="button" class="chip" id="ivd-${group}-${value}" data-${group}="${value}" aria-pressed="${value === current}">${label}</button>`;
    const controls = `<div class="ivd-tools"><div role="group" aria-label="${bi("চ্যানেল", "Channel")}">${choice("channel", "all", channel, bi("সব চ্যানেল", "All channels"))}${Object.keys(IV_CH).map(ch => choice("channel", ch, channel, chName(ch))).join("")}</div><span class="ivd-range"><b>${bi("সময়কাল", "Period")}</b> ${dmy(f)} – ${dmy(t)} · ${len} ${bi("দিন", "days")}</span></div>`;
    /* --- smart insights --- */
    const peak = buckets.reduce((m, b, i) => b.value > (buckets[m]?.value ?? -1) ? i : m, 0), pb_ = buckets[peak], totV = sumV(delivered), topItem = [...itemTotals.entries()].sort((a, b) => b[1] - a[1])[0];
    const negN = ivExceptions(f, t).filter(x => x.k === "neg").length;
    const pct = demand ? Math.round(fulfilled / demand * 100) : 0;
    const ins = [
      [totV ? "good" : "info", "trend", bi(`ডেলিভারি ৳ ${lakh(totV)}`, `Delivered ৳ ${lakh(totV)}`) + (P.delivered.length ? " · " + delta(totV, sumV(P.delivered)) : ""), bi("আগের সময়ের সাথে তুলনা", "compared with the previous period"), ""],
      pb_ && pb_.value > 0 ? ["info", "cal", bi(`সবচেয়ে ব্যস্ত দিন ${dmy(pb_.date)}`, `Busiest ${buckets.length > 1 && pb_.end !== pb_.date ? "stretch" : "day"} ${dmy(pb_.date)}`), `৳ ${lakh(pb_.value)} · ${pb_.count} ${bi("ডেলিভারি", "deliveries")}`, `peak:${peak}`] : null,
      delayed.length ? ["bad", "flag", bi(`${delayed.length}টি অর্ডার ৭ দিনের বেশি বাকি`, `${delayed.length} open ${delayed.length === 1 ? "order is" : "orders are"} over 7 days old`), bi("ক্লিক করে তালিকা ফিল্টার করুন", "click to filter the list"), "late"] : ["good", "check", bi("কোনো অর্ডার ৭ দিনের বেশি বাকি নেই", "Nothing is open over 7 days"), bi("সব ঠিক আছে", "all on track"), ""],
      monthly && demand ? [pct >= 80 ? "good" : pct >= 50 ? "warn" : "bad", "pie", bi(`Demand ${pct}% পূরণ`, `Demand ${pct}% fulfilled`), `${ivQ(fulfilled)} / ${ivQ(demand)} ctn`, ""] : topItem ? ["info", "ivbox", bi(`শীর্ষ আইটেম ${ivItemName(topItem[0])}`, `Top item ${ivItemName(topItem[0])}`), `${ivQ(topItem[1])} ctn`, ""] : null,
      negN ? ["bad", "bell", bi(`${negN}টি স্টক মাইনাস`, `${negN} negative stock ${negN === 1 ? "entry" : "entries"}`), bi("সতর্কতা দেখুন", "see alerts"), "neg"] : null
    ].filter(Boolean);
    const insights = `<section class="ivd-insights" aria-label="${bi("স্মার্ট ইনসাইট", "Smart insights")}">${ins.map(([tone, ic, t1, t2, act]) => `<${act ? `button type="button" data-ins="${act}"` : "div"} class="ivd-ins ${tone}"><i>${ico(ic)}</i><span><b>${t1}</b><small>${t2}</small></span></${act ? "button" : "div"}>`).join("")}</section>`;
    /* --- KPI tiles --- */
    const bands = [0, 0, 0, 0]; pending.forEach(o => { const a = age(o); bands[a <= 3 ? 0 : a <= 7 ? 1 : a <= 14 ? 2 : 3]++; });
    const bandBar = `<div class="ivk-seg" aria-hidden="true">${bands.map((n, i) => n ? `<i class="b${i}" style="flex:${n}" title="${["≤3", "4–7", "8–14", "15+"][i]} ${bi("দিন", "d")}: ${n}"></i>` : "").join("") || "<i class=\"b0 z\"></i>"}</div>`;
    const tile = (c, ic, lab, help, val, sub, dl, vis, href) => `<a class="ivk" style="--kc:${c}" href="${esc(href)}"><header><i>${ico(ic)}</i><span>${lab}</span>${dl}</header>${val}<small class="ivk-s">${sub}</small>${vis}<p class="ivk-help">${help}</p></a>`;
    const stats = `<div class="ivd-kpis">
      ${tile("#7c3aed", "ivcart", bi("নতুন অর্ডার ও ট্রিপ", "Orders & trips placed"), bi("এই সময়ে তৈরি হওয়া অর্ডার/ট্রিপ", "Created during this period"), num("placed", placed.length, "int"), fmt(sumQ(placed), "qty"), delta(placed.length, P.placed.length), spark(buckets.map(b => b.placed)), link("ivrep", { section: "status" }))}
      ${tile("#059669", "check", bi("ডেলিভারি মূল্য", "Delivered value"), bi("এই সময়ে পৌঁছে যাওয়া মালের মূল্য", "Value of goods delivered in this period"), num("value", totV, "money"), fmt(sumQ(delivered), "qty") + " · " + delivered.length + " " + bi("ডেলিভারি", "deliveries"), delta(totV, sumV(P.delivered)), spark(buckets.map(b => b.value)), link("ivrep", { section: channel === "all" ? "status" : channel }))}
      ${tile("#d97706", "clock", bi("খোলা অর্ডার ও ট্রিপ", "Open orders & trips"), bi(`${dmy(cutoff)} পর্যন্ত বাকি — বয়স অনুযায়ী ভাগ`, `Still open as of ${dmy(cutoff)} — split by age`), num("open", sumQ(pending), "qty"), `${pending.length} ${bi("টি", "orders")} · ${bi("তারিখ", "as of")} ${dmy(cutoff)}`, delta(sumQ(pending), sumQ(P.pending), false), bandBar, link("ivrep", { section: channel === "all" ? "status" : channel }))}
      ${tile("#dc2626", "flag", bi("৭ দিনের বেশি বাকি", "Open over 7 days"), bi("দেরিতে পড়া অর্ডার — আগে এগুলো দেখুন", "Delayed orders — look at these first"), num("late", delayed.length, "int"), fmt(sumQ(delayed), "qty"), delta(delayed.length, pDelayed.length, false), `<div class="ivk-prog" aria-hidden="true"><i style="width:${pending.length ? Math.round(delayed.length / pending.length * 100) : 0}%"></i></div><small class="mut ivk-note">${pending.length ? Math.round(delayed.length / pending.length * 100) : 0}% ${bi("খোলা অর্ডারের", "of open orders")}</small>`, link("ivrep", { section: "exc", channel }))}
    </div>`;
    /* --- trend chart --- */
    const val = b => metric === "qty" ? b.qty : metric === "count" ? b.count : b.value, segv = (b, ch) => { const c = b.ch[ch]; return c ? (metric === "qty" ? c.qty : metric === "count" ? c.count : c.value) : 0; };
    const max = Math.max(1, ...buckets.map(val)), tot = buckets.reduce((s, b) => s + val(b), 0), avg = tot / Math.max(1, buckets.length);
    const chans = channel === "all" ? ["dist", "nir"] : [channel];
    const trend = `<section class="card ivd-trend"><div class="iv-section-head"><div><h3>${bi("ডেলিভারি ট্রেন্ড", "Delivery trend")}</h3><p class="mut sm">${fmt(tot, metric === "qty" ? "qty" : metric === "count" ? "count" : "value")} ${metric === "count" ? bi("ডেলিভারি", "deliveries") : ""} · ${bi("গড়", "avg")} ${fmt(avg, metric === "qty" ? "qty" : metric === "count" ? "count" : "value")} / ${buckets[0] && ivDays(buckets[0].date, buckets[0].end) ? bi("ভাগ", "slot") : bi("দিন", "day")}</p></div>
      <div class="ivd-metrics" role="group" aria-label="${bi("চার্টের একক", "Chart measure")}">${choice("metric", "value", metric, bi("মূল্য", "Value"))}${choice("metric", "qty", metric, bi("পরিমাণ", "Quantity"))}${choice("metric", "count", metric, bi("ডেলিভারি", "Deliveries"))}</div></div>
      <div class="ivd-chart"><div class="ivd-y" aria-hidden="true"><span>${metric === "value" ? lakh(max) : ivQ(max)}</span><span>${metric === "value" ? lakh(max / 2) : ivQ(max / 2)}</span><span>0</span></div>
      <div class="ivd-plot"><div class="ivd-avg" style="bottom:${(avg / max * 100).toFixed(1)}%"><span>${bi("গড়", "avg")}</span></div>
      <div class="ivd-bars" style="--n:${buckets.length}">${buckets.map((b, i) => `<button type="button" data-bucket="${i}" class="${i === peak && val(b) > 0 ? "peak" : ""}" aria-pressed="${i === selected}" style="--i:${i}" aria-label="${dmy(b.date)}${b.end !== b.date ? " – " + dmy(b.end) : ""} · ${fmt(val(b), metric === "qty" ? "qty" : metric === "count" ? "count" : "value")}"><em>${chans.map(ch => `<span class="c-${ch}" style="--h:${(segv(b, ch) / max * 100).toFixed(2)}%"></span>`).join("")}</em></button>`).join("")}</div>
      <div class="ivd-tip" hidden></div></div></div>
      <div class="iv-bx"><span>${pbFmt(f)}</span>${channel === "all" ? `<span class="ivd-lg"><i class="c-dist"></i>${chName("dist")} <i class="c-nir"></i>${chName("nir")}</span>` : ""}<span>${pbFmt(t)}</span></div><div class="ivd-chart-detail" aria-live="polite"></div></section>`;
    /* --- demand ring --- */
    const dch = Object.entries(D.demandCh).filter(([, c]) => c.demand);
    const short = D.demandRows.map(r => ({ ...r, left: r.target - r.done })).filter(r => r.left > 0).sort((a, b) => b.left - a.left).slice(0, 3);
    const target = `<section class="card ivd-demand"><div class="iv-section-head"><div><h3>${bi("মাসিক Demand পূরণ", "Monthly demand fulfilled")}</h3><p class="mut sm">${bi("মাসের লক্ষ্যের বিপরীতে ডেলিভারি", "Deliveries against the month's targets")}</p></div></div>${demand ? `<div class="ivd-dm"><div class="ivd-ring" style="--p:${Math.min(100, pct)}" role="img" aria-label="${pct}%"><b class="num">${pct}%</b></div><div class="ivd-dmi"><p><b class="num">${ivQ(fulfilled)}</b> / ${ivQ(demand)} ctn</p><p class="mut sm">${ivQ(demand - fulfilled)} ctn ${bi("বাকি", "remaining")}</p>${dch.length > 1 ? dch.map(([ch, c]) => `<div class="ivd-mini" title="${chName(ch)} ${Math.round(c.done / c.demand * 100)}%"><span>${chName(ch)}</span><i style="--w:${Math.round(c.done / c.demand * 100)}%"></i><b>${Math.round(c.done / c.demand * 100)}%</b></div>`).join("") : ""}</div></div>
      ${short.length ? `<div class="ivd-short"><small class="mut">${bi("সবচেয়ে বেশি বাকি", "Biggest gaps")}</small>${short.map(r => `<div><span>${esc(ivItemName(r.id))}${dch.length > 1 ? ` <em>${chName(r.ch)}</em>` : ""}</span><b class="num">${ivQ(r.left)} ctn</b></div>`).join("")}</div>` : ""}` : `<p class="mut sm">${bi("এই মাসে Demand সেট করা নেই", "No demand set for this month")}</p>`}</section>`;
    /* --- factory stock --- */
    const products = INV.rmp.filter(p => p.active !== false), stocks = products.map(p => ({ p, qty: rmStockAt(p.code, cutoff) })), smax = Math.max(1, ...stocks.map(s => Math.abs(s.qty)));
    const rmDay = (code, d) => INV.rmd.find(r => String(r.date).slice(0, 10) === d && r.product === code);
    const factory = `<section class="card ivd-factory"><div class="iv-section-head"><div><h3>${bi("ফ্যাক্টরি স্টক", "Factory stock")}</h3><p class="mut sm">${bi("বস্তা ও কেজি — ক্লিক করলে লেজার", "Bags and kg — click for the ledger")}</p></div><span class="mut sm">${dmy(cutoff)}</span></div>
      <div class="ivd-stock">${stocks.map(({ p, qty }) => { const d = rmDay(p.code, cutoff); return `<a href="${esc(link("ivrm", { product: p.code }))}" class="${qty < 0 ? "neg" : ""}"><span>${esc(p.name)}</span><b class="num">${ivQ(qty)} <small>bag</small></b><small class="mut num">${ivQ(qty * p.bag_kg)} kg</small><i class="ivd-sb"><s style="width:${(Math.abs(qty) / smax * 100).toFixed(1)}%"></s></i>${d ? `<small class="ivd-io num"><u>+${ivQ(+d.ready_bag || 0)}</u> <u class="o">−${ivQ(+d.delivery_bag || 0)}</u> ${bi("আজকের", "today")}</small>` : ""}</a>`; }).join("") || ivEmpty(bi("কোনো পণ্য নেই", "No products"))}</div></section>`;
    out.className = "ivd" + (firstPaint ? " first" : "");
    out.innerHTML = controls + insights + stats + `<div class="ivd-primary">${trend}<div class="ivd-side">${monthly ? target : ""}${factory}</div></div>
      <div class="ivd-secondary"><section class="card ivd-list" id="ivd-queue"></section><section class="card ivd-list" id="ivd-items"></section></div><section class="card ivd-list" id="ivd-alerts"></section>`;
    renderQueue(); renderItems(); renderAlerts();
    showBucket(selected);
    animate();
    if (firstPaint) { firstPaint = false; setTimeout(() => out.classList.remove("first"), 1200); }
    if (focusKey) document.getElementById(focusKey)?.focus({ preventScroll: true });
    $("#ivd-upd", v).textContent = bi("আপডেট", "Updated") + " " + new Date(INV_T).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  function showBucket(index) {
    if (!D || !D.buckets[index]) return;
    selected = index;
    const b = D.buckets[index], btns = $$("[data-bucket]", out), val = x => metric === "qty" ? x.qty : metric === "count" ? x.count : x.value;
    btns.forEach((button, i) => { button.tabIndex = i === index ? 0 : -1; button.setAttribute("aria-pressed", String(i === index)); });
    const tot = D.buckets.reduce((s, x) => s + val(x), 0) || 1, avg = tot / D.buckets.length, share = Math.round(val(b) / tot * 100), vs = avg ? Math.round((val(b) - avg) / avg * 100) : 0;
    const top = [...b.items.entries()].sort((a, c) => c[1] - a[1]).slice(0, 3), mx = Math.max(1, ...top.map(x => x[1]));
    const box = $(".ivd-chart-detail", out);
    box.innerHTML = `<div class="ivd-cd-h"><b>${dmy(b.date)}${b.end === b.date ? "" : " – " + dmy(b.end)}</b><span class="num">৳ ${money0(b.value)}</span><span class="num">${ivQ(b.qty)} ctn</span><span>${bi("ডেলিভারি", "Deliveries")} ${ivQ(b.count)}</span><span class="${vs >= 0 ? "up" : "dn"}" title="${bi("গড়ের তুলনায়", "vs average")}">${vs >= 0 ? "▲" : "▼"} ${Math.abs(vs)}% ${bi("গড়ের", "vs avg")}</span><span class="mut">${share}% ${bi("মোটের", "of total")}</span></div>
      ${top.length ? `<div class="ivd-cd-i">${top.map(([id, q]) => `<div style="--w:${(q / mx * 100).toFixed(1)}%"><span>${esc(ivItemName(id))}</span><i><s></s></i><b class="num">${ivQ(q)}</b></div>`).join("")}</div>` : `<p class="mut sm">${bi("এই সময়ে কোনো ডেলিভারি নেই", "No deliveries in this slot")}</p>`}`;
  }
  /* ---- command palette (search dropdown) ---- */
  let items = [], idx = 0, qT = 0;
  const pages = () => [
    ["ivrep", "chart", bi("স্ট্যাটাস ও রিপোর্ট", "Status & Report"), "report status exception alert"],
    ["ivrm", "ivfac", bi("ফ্যাক্টরি স্টক", "Factory stock"), "rm factory tamarind wood stock"],
    ["ivnir", "ivtruck", bi("নিরাময় ডেলিভারি", "Niramoy Delivery"), "niramoy nirmoy delivery trip"],
    ["ivdist", "ivcart", bi("ডিস্ট্রিবিউশন অর্ডার", "Distribution Orders"), "distribution order party"]
  ];
  function cmdItems(raw) {
    const q = ivSearch(raw), list = [];
    const act = (ic, t, s, run) => ({ g: bi("কমান্ড", "Commands"), ic, t, s, run });
    if (!q) {
      list.push(act("ivbox", bi("সব চ্যানেল দেখান", "Show all channels"), "", () => { channel = "all"; draw(); }));
      Object.keys(IV_CH).forEach(ch => list.push(act(ch === "nir" ? "ivtruck" : "ivcart", bi(`শুধু ${IV_CH[ch][0]} দেখান`, `Show ${IV_CH[ch][1]} only`), "", () => { channel = ch; draw(); })));
      list.push(act("flag", bi("৭ দিনের বেশি বাকি অর্ডার", "Open orders over 7 days"), bi("তালিকা ফিল্টার করুন", "filter the list"), () => { ageF = ">7"; renderQueue(); $("#ivd-queue", out)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); }));
      list.push(act("refresh", bi("ডেটা রিফ্রেশ করুন", "Refresh data"), "", refresh));
      pages().forEach(([k, ic, t]) => list.push({ g: bi("পাতায় যান", "Go to"), ic, t, s: "", run: () => location.hash = link(k) }));
      return list;
    }
    INV.orders.filter(o => orderText(o).includes(q)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).forEach(o => list.push({ g: bi("অর্ডার ও ট্রিপ", "Orders & trips"), ic: o.ch === "nir" ? "ivtruck" : "ivcart", t: `<b>${esc(nm(o))}</b> ${ivSt(o.status)}`, s: `${chName(o.ch)} · ${dmy(o.date)} · ${ivQ(o.total_qty)} ctn · ৳ ${money0(o.value)}`, run: () => ivOrderModal(o.ch, o, draw) }));
    INV.items.filter(i => ivSearch(i.name).includes(q)).slice(0, 4).forEach(i => { const dq = D?.itemTotals.get(String(i.id)) || 0; list.push({ g: bi("আইটেম", "Items"), ic: "ivbox", t: `<b>${esc(i.name)}</b>`, s: bi(`এই সময়ে ডেলিভারি ${ivQ(dq)} ctn — ক্লিক করে ফিল্টার করুন`, `${ivQ(dq)} ctn delivered in this period — click to filter`), run: () => { qIn.value = i.name; qF = i.name; renderQueue(); renderItems(); renderAlerts(); } }); });
    INV.rmp.filter(p => ivSearch(p.name + p.code).includes(q)).slice(0, 3).forEach(p => list.push({ g: bi("ফ্যাক্টরি পণ্য", "Factory products"), ic: "ivfac", t: `<b>${esc(p.name)}</b>`, s: `${ivQ(rmStockAt(p.code, D?.cutoff || today()))} bag`, run: () => location.hash = link("ivrm", { product: p.code }) }));
    pages().filter(([, , t, kw]) => ivSearch(t + kw).includes(q)).forEach(([k, ic, t]) => list.push({ g: bi("পাতায় যান", "Go to"), ic, t: `<b>${t}</b>`, s: "", run: () => location.hash = link(k) }));
    return list;
  }
  function paintRes() {
    items = cmdItems(qIn.value); idx = 0; let g = "";
    res.innerHTML = (items.map((it, i) => { const h = it.g !== g ? `<div class="grp">${(g = it.g)}</div>` : ""; return h + `<div class="it${i === 0 ? " on" : ""}" role="option" id="ivd-o${i}" data-i="${i}">${ico(it.ic)}<div class="t"><div>${it.t}</div>${it.s ? `<div class="mut sm">${it.s}</div>` : ""}</div></div>`; }).join("") || `<div class="empty">${bi("কিছু পাওয়া যায়নি", "Nothing found")}</div>`) + (qF ? `<div class="ivd-resf mut sm">${bi("ড্যাশবোর্ড ফিল্টার চালু — Esc চাপলে মুছবে", "Dashboard is filtered live — Esc clears")}</div>` : "");
    res.hidden = false; qIn.setAttribute("aria-expanded", "true");
  }
  const closeRes = () => { res.hidden = true; qIn.setAttribute("aria-expanded", "false"); };
  const pick = i => { const it = items[i]; if (!it) return; closeRes(); it.run(); };
  qIn.addEventListener("focus", paintRes);
  qIn.addEventListener("input", () => {
    paintRes(); clearTimeout(qT);
    qT = setTimeout(() => { qF = qIn.value.trim(); renderQueue(); renderItems(); renderAlerts(); }, 120);
  });
  qIn.addEventListener("keydown", e => {
    if (e.key === "Escape") { if (qIn.value) { qIn.value = ""; qF = ""; renderQueue(); renderItems(); renderAlerts(); paintRes(); } else { closeRes(); qIn.blur(); } return; }
    if (e.key === "Enter") { e.preventDefault(); pick(idx); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); if (res.hidden) paintRes();
      idx = Math.max(0, Math.min(items.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)));
      const els = $$(".it", res); els.forEach((d, i) => d.classList.toggle("on", i === idx)); els[idx]?.scrollIntoView({ block: "nearest" }); qIn.setAttribute("aria-activedescendant", "ivd-o" + idx);
    }
  });
  res.addEventListener("mousedown", e => { e.preventDefault(); const d = e.target.closest("[data-i]"); if (d) pick(+d.dataset.i); });
  qIn.addEventListener("blur", () => setTimeout(closeRes, 120));
  const onKey = e => { if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && !document.querySelector(".mback")) { e.preventDefault(); qIn.focus(); } };
  document.addEventListener("keydown", onKey);
  /* ---- delegated clicks / hovers inside the dashboard ---- */
  const tip = () => $(".ivd-tip", out);
  out.addEventListener("click", e => {
    const t = e.target, el = s => t.closest(s);
    let b;
    if ((b = el("[data-channel]"))) { channel = b.dataset.channel; draw(); }
    else if ((b = el("[data-metric]"))) { metric = b.dataset.metric; draw(); }
    else if ((b = el("[data-bucket]"))) showBucket(+b.dataset.bucket);
    else if ((b = el("[data-order]"))) { const o = INV.orders.find(x => x.id === b.dataset.order); if (o) ivOrderModal(o.ch, o, draw); }
    else if ((b = el("[data-age]"))) { ageF = ageF === b.dataset.age ? "" : b.dataset.age; moreQ = false; renderQueue(); }
    else if ((b = el("[data-xk]"))) { xF = xF === b.dataset.xk ? "" : b.dataset.xk; renderAlerts(); }
    else if (el("[data-more]")) { moreQ = !moreQ; renderQueue(); }
    else if ((b = el("[data-ins]"))) {
      const a = b.dataset.ins;
      if (a === "late") { ageF = ">7"; renderQueue(); $("#ivd-queue", out)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); }
      else if (a === "neg") { xF = "neg"; renderAlerts(); $("#ivd-alerts", out)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); }
      else if (a.startsWith("peak:")) { showBucket(+a.slice(5)); $(".ivd-trend", out)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); }
    }
  });
  const showTip = btn => {
    const tp = tip(), i = +btn.dataset.bucket, b = D?.buckets[i]; if (!tp || !b) return;
    const plot = tp.parentElement, pr = plot.getBoundingClientRect(), br = btn.getBoundingClientRect();
    tp.innerHTML = `<b>${dmy(b.date)}${b.end === b.date ? "" : " – " + dmy(b.end)}</b><span class="num">৳ ${money0(b.value)}</span><span class="num">${ivQ(b.qty)} ctn · ${b.count} ${bi("ডেলিভারি", "deliveries")}</span>`;
    tp.hidden = false;
    const w = tp.offsetWidth, x = br.left - pr.left + br.width / 2 - w / 2;
    tp.style.left = Math.max(0, Math.min(pr.width - w, x)) + "px";
  };
  out.addEventListener("mouseover", e => { const b = e.target.closest("[data-bucket]"); if (b) showTip(b); });
  out.addEventListener("mouseout", e => { if (e.target.closest("[data-bucket]") && tip()) tip().hidden = true; });
  out.addEventListener("focusin", e => { const b = e.target.closest("[data-bucket]"); if (b) showTip(b); });
  out.addEventListener("focusout", e => { if (e.target.closest("[data-bucket]") && tip()) tip().hidden = true; });
  $(".ivd-trend", out); out.addEventListener("keydown", e => {
    if (!e.target.closest(".ivd-bars") || !D) return;
    const last = D.buckets.length - 1, next = { ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: last }[e.key];
    if (!Number.isInteger(next)) return;
    e.preventDefault(); showBucket(Math.max(0, Math.min(last, next))); $$("[data-bucket]", out)[selected]?.focus();
  });
  /* ---- refresh + background poll ---- */
  async function refresh() {
    if (spinning) return; spinning = true; const btn = $("#ivd-refresh", v); btn?.classList.add("spin");
    try { await invLoad(true); draw(); toast(bi("✔ রিফ্রেশ হয়েছে", "✔ Refreshed")); } catch (err) { toast(ivErr(err), "err"); } finally { spinning = false; btn?.classList.remove("spin"); }
  }
  $("#ivd-refresh", v).onclick = refresh;
  const poll = setInterval(() => { if (!out.isConnected) return clearInterval(poll); if (document.hidden || document.querySelector(".mback") || document.activeElement === qIn) return; invLoad(true).then(draw).catch(() => { }); }, 60000);
  pbBind(v, "idpb", F, draw);
  await ivBoot(draw, e => out.innerHTML = `<div class="alert rd">${esc(ivErr(e))}</div>`);
  return () => { clearInterval(poll); clearTimeout(qT); document.removeEventListener("keydown", onKey); };
}

/* =================== Status & Report (A4 sheets) + month lock =================== */
/* shared command-box behaviour (dropdown of jumps/commands while the text also filters the page live) */
function ivCmdBind(qIn, res, getItems, onType, onClear) {
  let items = [], idx = 0, t = 0;
  const close = () => { res.hidden = true; qIn.setAttribute("aria-expanded", "false"); };
  const paint = () => {
    items = getItems(qIn.value); idx = 0; let g = "";
    res.innerHTML = items.map((it, i) => { const h = it.g !== g ? `<div class="grp">${(g = it.g)}</div>` : ""; return h + `<div class="it${i === 0 ? " on" : ""}" role="option" id="${res.id}-o${i}" data-i="${i}">${ico(it.ic)}<div class="t"><div>${it.t}</div>${it.s ? `<div class="mut sm">${it.s}</div>` : ""}</div></div>`; }).join("") || `<div class="empty">${bi("কিছু পাওয়া যায়নি", "Nothing found")}</div>`;
    res.hidden = false; qIn.setAttribute("aria-expanded", "true");
  };
  const pick = i => { const it = items[i]; if (!it) return; close(); it.run(); };
  qIn.addEventListener("focus", paint);
  qIn.addEventListener("input", () => { paint(); clearTimeout(t); t = setTimeout(() => onType(qIn.value.trim()), 120); });
  qIn.addEventListener("keydown", e => {
    if (e.key === "Escape") { if (qIn.value) { qIn.value = ""; onType(""); onClear?.(); paint(); } else { close(); qIn.blur(); } return; }
    if (e.key === "Enter") { e.preventDefault(); pick(idx); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); if (res.hidden) paint();
      idx = Math.max(0, Math.min(items.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)));
      const els = $$(".it", res); els.forEach((d, i) => d.classList.toggle("on", i === idx)); els[idx]?.scrollIntoView({ block: "nearest" }); qIn.setAttribute("aria-activedescendant", `${res.id}-o${idx}`);
    }
  });
  res.addEventListener("mousedown", e => { e.preventDefault(); const d = e.target.closest("[data-i]"); if (d) pick(+d.dataset.i); });
  qIn.addEventListener("blur", () => setTimeout(close, 120));
  return { close, paint, stop: () => clearTimeout(t) };
}

/* Status & Report v2 — same A4 sheets (Screenshot / PDF / Share / Excel), now with command search,
   live filters, clickable insight strip, sortable tables, row preview and a per-tab live summary */
async function vInvRep(v) {
  const params = ivParams(), section = params.get("section");
  const C = ivCan(), F = Object.assign(ivLinkedPeriod(), { r: ["dist", "nir", "rm", "exc"].includes(section) ? section : "status" });
  let chF = ["dist", "nir"].includes(params.get("channel")) ? params.get("channel") : "", qF = "", ageF = "", stF = "", pF = "", xF = "", sortSt = {};
  const TABS = [["status", bi("Pending অবস্থা", "Pending status")], ["dist", bi("ডিস্ট্রিবিউশন", "Distribution")], ["nir", bi("নিরাময়", "Niramoy")], ["rm", bi("আরএম ফ্যাক্টরি", "RM Factory")], ["exc", bi("সতর্কতা", "Alerts")]];
  v.innerHTML = head(ROUTES[CUR].t, `${repBtns("ir")}<button class="btn" id="ir-xl">${ico("dl")} Excel</button>`) +
    `<div class="card tbar noprint">${pbBar("irpb", F)}</div>${ivSeg("ir-tab", TABS, F.r)}
    <div class="ir-cmd card noprint"><div class="ir-desc" id="ir-desc" aria-live="polite"></div><div class="ir-cmd-r"><div class="ivd-find"><span class="ivd-find-i" aria-hidden="true">${ico("search")}</span>
      <input class="in" id="ir-q" type="search" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="ir-res" aria-autocomplete="list" placeholder="${bi("পার্টি, আইটেম খুঁজুন…", "Search party, item…")}" aria-label="${bi("রিপোর্ট সার্চ", "Report search")}"><kbd>/</kbd>
      <div class="ivd-res" id="ir-res" role="listbox" hidden></div></div>
      <button type="button" class="btn sm" id="ir-clear" disabled>${bi("সব মুছুন", "Clear all")}</button></div>
      <div class="ir-cmd-f" id="ir-fl"></div><div class="ir-count mut sm" id="ir-count" role="status"></div></div>
    <div class="ir-viz noprint" id="ir-viz"></div>
    <div class="card rep-wrap"><div class="rep-scroll"><div id="ir-out"></div></div></div>${C.admin ? `<div class="card noprint" id="ir-lock"></div>` : ""}<div class="ir-pop" id="ir-pop" hidden></div>`;
  const out = $("#ir-out", v), viz = $("#ir-viz", v), pop = $("#ir-pop", v), qIn = $("#ir-q", v), res = $("#ir-res", v); let cur = null, counts = { all: 0, shown: 0 }, fl = [];
  try { await invLoad(); dpLoad().catch(() => { }); } catch (e) { out.innerHTML = `<div class="alert rd">${esc(ivErr(e))}</div>`; return; }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tr2 = (cells, cls = "", attr = "") => `<tr class="${cls}"${attr}>${cells.map((c, i) => `<td class="${i ? "r num" : ""}">${c}</td>`).join("")}</tr>`;
  const nq = () => ivSearch(qF);
  let sKey = "", sIdx = new Map();
  const otext = o => {
    const key = INV_T + ":" + INV.orders.length; if (key !== sKey) { sKey = key; sIdx = new Map(); }
    let s = sIdx.get(o.id);
    if (s === undefined) { s = ivSearch([ivPname(o), o.location, o.asm, o.transport, o.vehicle, o.date, dmy(o.date), o.status, ...Object.keys(o.lines).map(ivItemName)].join(" ")); sIdx.set(o.id, s); }
    return s;
  };
  const matchO = o => !qF || otext(o).includes(nq());
  const hl = s => { const q = qF.trim(); if (!q) return esc(s); const re = new RegExp("(" + q.split(/\s+/).filter(Boolean).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi"); return String(s ?? "").split(re).map((x, i) => i % 2 ? `<mark>${esc(x)}</mark>` : esc(x)).join(""); };
  const chName = ch => bi(...(IV_CH[ch] || [ch, ch]));
  const lakh = n => n >= 1e7 ? (n / 1e7).toFixed(2) + bi(" কোটি", " Cr") : n >= 1e5 ? (n / 1e5).toFixed(2) + bi(" লাখ", " L") : money0(n);
  const band = d => d <= 3 ? 0 : d <= 7 ? 1 : d <= 15 ? 2 : 3, BL = ["0–3", "4–7", "8–15", "15+"], BC = ["#10b981", "#f59e0b", "#f97316", "#dc2626"];
  const hbars = (rows, attr = "data-q") => `<ul class="ir-hb">${rows.map(([k, label, val, txt, w, color]) => `<li><button type="button" ${attr}="${esc(k)}" title="${esc(label)}"><span class="ir-hl">${esc(label)}</span><i><s style="width:${w}%;${color ? "background:" + color : ""}"></s></i><b class="num">${txt}</b></button></li>`).join("")}</ul>`;
  const vcard = (title, sub, body, cls = "") => `<section class="ir-vc card ${cls}"><div class="iv-section-head"><div><h3>${title}</h3>${sub ? `<p class="mut sm">${sub}</p>` : ""}</div></div>${body}</section>`;
  function build() {
    const [f, t] = pbRange(F), inR = o => ivInPeriod(o, f, t), q = nq();
    fl = []; const filters = fl; viz.innerHTML = "";
    if (F.r === "status") {
      const cutoff = t < today() ? t : today(), age = o => Math.max(0, ivDays(o.date, cutoff));
      const P0 = INV.orders.filter(o => (!chF || o.ch === chF) && ivPendingAt(o, cutoff)).sort((a, b) => a.date.localeCompare(b.date));
      const P1 = P0.filter(matchO), P = ageF === "" ? P1 : P1.filter(o => band(age(o)) === +ageF);
      counts = { all: P0.length, shown: P.length };
      const bl = BL.map((_, i) => P1.filter(o => band(age(o)) === i));
      const ib = ivItemTotals(P);
      cur = { name: "Pending_Status", xl: { Pending: [["Order date", "Channel", "Party", "Location", "ASM", "Items", "Qty", "Value", "Status", "Days"], ...P.map(o => [o.date, o.ch, ivPname(o), o.location, o.asm, Object.entries(o.lines).map(([k, l]) => `${ivItemName(k)} ${l.q}`).join(", "), o.total_qty, o.value, o.status, age(o)])] } };
      const mxB = Math.max(1, ...bl.map(x => ivSum(x, o => o.value))), val = ivSum(P1, o => o.value) || 1;
      const chv = Object.keys(IV_CH).map(ch => [ch, ivSum(P1.filter(o => o.ch === ch), o => o.value)]);
      const oldest = P.slice(0, 3);
      viz.innerHTML = vcard(bi("বয়স অনুযায়ী Pending", "Pending by age", ""), bi("ব্যান্ডে ক্লিক করলে শীট ফিল্টার হবে", "Click a band to filter the sheet"), hbars(bl.map((g, i) => [String(i), `${BL[i]} ${bi("দিন", "days")} · ${g.length}`, 0, "৳ " + lakh(ivSum(g, o => o.value)), (ivSum(g, o => o.value) / mxB * 100).toFixed(1), BC[i]]), "data-age"), "ir-v1") +
        vcard(bi("চ্যানেল অনুযায়ী মূল্য", "Value by channel", ""), bi("ক্লিক করে চ্যানেল বাছুন", "Click to pick a channel"), `<div class="ir-split">${chv.map(([ch, x]) => `<button type="button" data-ch="${ch}" class="${chF === ch ? "on" : ""}" style="flex:${Math.max(.05, x / val)}"><i class="ivd-dot ${ch}"></i>${chName(ch)}<b class="num">৳ ${lakh(x)}</b></button>`).join("")}</div><p class="mut sm ir-note">${bi("শীর্ষ বাকি আইটেম", "Top pending items")}: ${Object.keys(ib).sort((a, b) => ib[b].pend - ib[a].pend).slice(0, 3).map(id => `<button type="button" class="ir-lk" data-q="${esc(ivItemName(id))}">${esc(ivItemName(id))} <b class="num">${ivQ(ib[id].pend)}</b></button>`).join(" ")}</p>`, "ir-v2") +
        vcard(bi("সবচেয়ে পুরোনো ৩টি", "Oldest three", ""), bi("ক্লিক করলে অর্ডার খুলবে", "Click to open the order"), oldest.length ? `<ul class="ir-old">${oldest.map(o => `<li><button type="button" data-oid="${esc(o.id)}"><i class="ivd-dot ${o.ch}"></i><span><b>${esc(ivPname(o))}</b><small>${dmy(o.date)} · ${ivQ(o.total_qty)} ctn</small></span><strong class="ivd-age ${age(o) > 7 ? "bad" : age(o) > 3 ? "warn" : "ok"}">${age(o)} ${bi("দিন", "d")}</strong></button></li>`).join("")}</ul>` : `<div class="empty iv-empty">${bi("কিছু বাকি নেই ✓", "Nothing pending ✓")}</div>`, "ir-v3");
      filters.push([chF, [["", bi("সব চ্যানেল", "All channels"), P0.length], ...Object.keys(IV_CH).map(ch => [ch, chName(ch), INV.orders.filter(o => o.ch === ch && ivPendingAt(o, cutoff)).length])], "ch"]);
      filters.push([ageF, [["", bi("সব বয়স", "Any age"), P1.length], ...bl.map((g, i) => [String(i), BL[i] + " " + bi("দিন", "d"), g.length])], "age"]);
      return repSheet("ir-in", "Inventory · Pending Status (as of " + dmy(t > today() ? today() : t) + ")", f, t,
        repKpi([["Pending orders", P.length, "k1"], ["Pending qty (ctn)", ivQ(ivSum(P, o => o.total_qty)), "k2"], ["Pending value", "৳ " + money0(ivSum(P, o => o.value)), "k3"], ["Older than 7 days", P.filter(o => age(o) > 7).length, ""]]),
        repTwo(repBox("By age (days)", ["Days", "Orders", "Qty", "Value"], [[0, 3], [4, 7], [8, 15], [16, 9999]].map(([a, z], i) => { const g = P.filter(o => age(o) >= a && age(o) <= z); return tr2([BL[i], g.length, ivQ(ivSum(g, o => o.total_qty)), money0(ivSum(g, o => o.value))]); }).join("")),
          repBox("By item", ["Item", "Pending qty", "Value"], Object.keys(ib).sort((a, b) => ib[b].pend - ib[a].pend).map(id => tr2([hl(ivItemName(id)), ivQ(ib[id].pend), money0(ib[id].val)])).join(""))) +
        repOne(repBox("Pending orders — oldest first", ["~Order date", "~Party", "~ASM", "Qty", "Value", "Days"], P.map(o => `<tr class="ir-row" data-oid="${esc(o.id)}"><td>${dmy(o.date)}</td><td>${hl(ivPname(o))}${o.location ? ` <small>· ${hl(o.location)}</small>` : ""}</td><td>${hl(o.asm || "")}</td><td class="r num">${ivQ(o.total_qty)}</td><td class="r num">${money0(o.value)}</td><td class="r num ${age(o) > 7 ? "b" : ""}">${age(o)}</td></tr>`).join(""), P.length ? `<tr class="tot"><td colspan="3">TOTAL</td><td class="r num">${ivQ(ivSum(P, o => o.total_qty))}</td><td class="r num">${money0(ivSum(P, o => o.value))}</td><td></td></tr>` : "")),
        filtNote());
    }
    if (F.r === "dist" || F.r === "nir") {
      const ch = F.r, nir = ch === "nir", L0 = INV.orders.filter(o => o.ch === ch && inR(o)), live0 = L0.filter(o => o.status !== "cancel");
      const L = L0.filter(o => matchO(o) && (!stF || (o.status !== "cancel" && (stF === "del") === ivDelIn(o, f, t)))), live = L.filter(o => o.status !== "cancel"), ok = live.filter(o => ivDelIn(o, f, t)), it = ivItemTotals(L, f, t);
      counts = { all: live0.length, shown: live.length };
      const g = key => { const m = Object.create(null); live.forEach(o => { const k = (key === "party" ? ivPname(o) : o[key]) || "—", x = m[k] ||= { n: 0, q: 0, v: 0, dv: 0, r: 0 }; x.n++; x.q += o.total_qty; x.v += o.value; x.r += +o.rent || 0; if (ivDelIn(o, f, t)) x.dv += o.value; }); return Object.entries(m).sort((a, b) => b[1].v - a[1].v); };
      const ms = F.m === "month" ? [ivMon(f)] : [], dm = ms.length ? ivDemandOf(ch, ms[0]) : {};
      const ids = [...new Set([...Object.keys(it), ...Object.keys(dm)])].filter(id => !q || ivSearch(ivItemName(id)).includes(q) || L.length).sort((a, b) => (INV.byId[a]?.sort ?? 100) - (INV.byId[b]?.sort ?? 100) || a - b);
      const pty = g(nir ? "transport" : "party"), day = new Map(); ok.forEach(o => { const d = o.delivery_date || o.date; day.set(d, (day.get(d) || 0) + 1); });
      cur = { name: nir ? "Niramoy_Report" : "Distribution_Report", xl: { Items: [["Item", "Demand", "Ordered", "Delivered", "Pending", "Delivered value"], ...ids.map(id => [ivItemName(id), +dm[id] || 0, it[id]?.ord || 0, it[id]?.del || 0, it[id]?.pend || 0, it[id]?.dval || 0])], [nir ? "Transport" : "Party"]: [[nir ? "Transport" : "Party", "Count", "Qty", "Value", nir ? "Rent" : "Delivered value"], ...g(nir ? "transport" : "party").map(([k, x]) => [k, x.n, x.q, x.v, nir ? x.r : x.dv])] } };
      if (!nir) cur.xl.ASM = [["ASM", "Orders", "Qty", "Value", "Delivered value"], ...g("asm").map(([k, x]) => [k, x.n, x.q, x.v, x.dv])];
      /* live summary strip */
      const topI = ids.map(id => [id, it[id]?.ord || 0]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 6), mxI = Math.max(1, ...topI.map(x => x[1]));
      const dTot = Object.values(dm).reduce((a, b) => a + (+b || 0), 0), dDone = ids.reduce((s, id) => s + Math.min(+dm[id] || 0, it[id]?.del || 0), 0), pct = dTot ? Math.round(dDone / dTot * 100) : 0;
      const topP = pty.slice(0, 6), mxP = Math.max(1, ...topP.map(x => x[1].v));
      const days = [...day.entries()].sort((a, b) => a[0].localeCompare(b[0])), mxD = Math.max(1, ...days.map(x => x[1]));
      viz.innerHTML = (dTot ? vcard(bi("Demand পূরণ", "Demand fulfilled", ""), bi("মাসের লক্ষ্যের বিপরীতে ডেলিভারি", "Deliveries against the month's targets"), `<div class="ivd-dm"><div class="ivd-ring" style="--p:${Math.min(100, pct)}"><b class="num">${pct}%</b></div><div class="ivd-dmi"><p><b class="num">${ivQ(dDone)}</b> / ${ivQ(dTot)} ctn</p><p class="mut sm">${ivQ(Math.max(0, dTot - dDone))} ctn ${bi("বাকি", "remaining")}</p></div></div>`, "ir-v1")
        : vcard(bi("ডেলিভারি অবস্থা", "Delivery status", ""), bi("ডেলিভার্ড বনাম বাকি (ctn)", "Delivered vs pending (ctn)"), `<div class="ivd-dm"><div class="ivd-ring" style="--p:${live.length ? Math.round(ok.length / live.length * 100) : 0}"><b class="num">${live.length ? Math.round(ok.length / live.length * 100) : 0}%</b></div><div class="ivd-dmi"><p><b class="num">${ok.length}</b> / ${live.length} ${nir ? bi("ট্রিপ", "trips") : bi("অর্ডার", "orders")}</p><p class="mut sm">${live.length - ok.length} ${bi("বাকি", "pending")}</p></div></div>`, "ir-v1")) +
        vcard(bi("শীর্ষ আইটেম (অর্ডার)", "Top items (ordered)", ""), bi("ক্লিক করলে আইটেম ফিল্টার", "Click to filter by item"), topI.length ? hbars(topI.map(([id, n]) => [ivItemName(id), ivItemName(id), n, ivQ(n) + " ctn", (n / mxI * 100).toFixed(1)])) : `<div class="empty iv-empty">${bi("কিছু নেই", "Nothing")}</div>`, "ir-v2") +
        vcard(nir ? bi("ট্রান্সপোর্ট অনুযায়ী", "By transport", "") : bi("শীর্ষ পার্টি", "Top parties", ""), bi("মূল্য অনুযায়ী — ক্লিক করে ফিল্টার", "By value — click to filter"), topP.length ? hbars(topP.map(([k, x]) => [k, k, x.v, "৳ " + lakh(x.v), (x.v / mxP * 100).toFixed(1)])) : `<div class="empty iv-empty">${bi("কিছু নেই", "Nothing")}</div>`, "ir-v3") +
        (days.length > 1 ? vcard(bi("দিন অনুযায়ী ডেলিভারি", "Deliveries per day", ""), `${days.length} ${bi("দিন", "days")}`, `<div class="ir-cols" style="--n:${days.length}">${days.map(([d, n]) => `<span title="${dmy(d)} · ${n}" style="--h:${(n / mxD * 100).toFixed(1)}%"></span>`).join("")}</div><div class="iv-bx"><span>${dmy(days[0][0])}</span><span>${dmy(days.at(-1)[0])}</span></div>`, "ir-v4") : "");
      filters.push([stF, [["", bi("সব", "All"), live0.length], ["del", bi("ডেলিভার্ড", "Delivered"), live0.filter(o => ivDelIn(o, f, t)).length], ["pend", bi("বাকি", "Pending"), live0.filter(o => !ivDelIn(o, f, t)).length]], "st"]);
      return repSheet("ir-in", nir ? "Inventory · Niramoy Delivery Report" : "Inventory · Distribution Report", f, t,
        repKpi(nir ? [["Trips", live.length, "k1"], ["Qty (ctn)", ivQ(ivSum(live, o => o.total_qty)), "k2"], ["Value", "৳ " + money0(ivSum(live, o => o.value)), "k3"], ["Rent", "৳ " + money0(ivSum(live, o => o.rent)), ""]]
          : [["Orders", live.length, "k1"], ["Ordered (ctn)", ivQ(ivSum(live, o => o.total_qty)), "k2"], ["Delivered", "৳ " + money0(ivSum(ok, o => o.value)), "k3"], ["Pending (ctn)", ivQ(ivSum(live.filter(o => !ivDelIn(o, f, t)), o => o.total_qty)), ""]]),
        repOne(repBox("By item", ["Item", ...(ms.length ? ["Demand"] : []), "Ordered", "Delivered", "Pending", "Delivered ৳"], ids.map(id => tr2([hl(ivItemName(id)), ...(ms.length ? [dm[id] ? ivQ(dm[id]) : "—"] : []), ivQ(it[id]?.ord || 0), ivQ(it[id]?.del || 0), ivQ(it[id]?.pend || 0), money0(it[id]?.dval || 0)])).join(""),
          ids.length ? `<tr class="tot"><td>TOTAL</td>${ms.length ? `<td class="r num">${ivQ(Object.values(dm).reduce((a, b) => a + (+b || 0), 0))}</td>` : ""}<td class="r num">${ivQ(ivSum(ids, id => it[id]?.ord))}</td><td class="r num">${ivQ(ivSum(ids, id => it[id]?.del))}</td><td class="r num">${ivQ(ivSum(ids, id => it[id]?.pend))}</td><td class="r num">${money0(ivSum(ids, id => it[id]?.dval))}</td></tr>` : "")) +
        (nir ? repOne(repBox("By transport", ["Transport", "Trips", "Qty", "Value", "Rent"], g("transport").map(([k, x]) => tr2([hl(k), x.n, ivQ(x.q), money0(x.v), money0(x.r)])).join("")))
          : repTwo(repBox("Top parties", ["Party", "Orders", "Qty", "Value"], g("party").slice(0, 25).map(([k, x]) => tr2([hl(k), x.n, ivQ(x.q), money0(x.v)])).join("")), repBox("By ASM / RSM", ["ASM", "Orders", "Qty", "Value"], g("asm").map(([k, x]) => tr2([hl(k), x.n, ivQ(x.q), money0(x.v)])).join("")))),
        filtNote());
    }
    if (F.r === "rm") {
      const all = INV.rmp.map(p => ({ p, L: rmLedgerRows(p.code, f, t) })), byName = q ? all.filter(x => ivSearch(x.p.name).includes(q)) : [];
      const Ls = all.filter(x => (!pF || x.p.code === pF) && (!byName.length || byName.includes(x))).map(x => ({ ...x, L: { ...x.L, rows: byName.length || !q ? x.L.rows : x.L.rows.filter(r => ivSearch(dmy(r.date) + " " + (r.remarks || "")).includes(q)) } }));
      counts = { all: all.length, shown: Ls.length };
      cur = { name: "RM_Factory_Report", xl: Object.fromEntries(Ls.map(({ p, L }) => [p.name.slice(0, 28), [["Date", "Ready", "Delivery", "Stock", "Stock kg", "Remarks"], ["Opening", "", "", L.open, L.open * p.bag_kg, ""], ...L.rows.map(x => [x.date, x.ready, x.del, x.stock, x.stock * p.bag_kg, x.remarks])]])) };
      const sm = Ls.map(({ p, L }) => { const R = ivSum(L.rows, x => x.ready), D = ivSum(L.rows, x => x.del), c = L.open + R - D; return { p, L, R, D, c }; });
      const nDays = Math.max(1, ivDays(f, t < today() ? t : today()) + 1);
      const chart = (x, color) => {
        const vals = [x.L.open, ...x.L.rows.map(r => r.stock)], mx = Math.max(1, ...vals), mn = Math.min(0, ...vals), W = 300, H = 80, rg = (mx - mn) || 1;
        const pts = vals.map((s, i) => [(i / Math.max(1, vals.length - 1) * W), H - 6 - (s - mn) / rg * (H - 12)]), d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(""), zy = H - 6 - (0 - mn) / rg * (H - 12);
        return `<svg class="ir-line" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(x.p.name)}"><line x1="0" x2="${W}" y1="${zy.toFixed(1)}" y2="${zy.toFixed(1)}" class="z"/><path d="${d}L${W} ${H}L0 ${H}Z" fill="${color}" opacity=".12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
      };
      viz.innerHTML = sm.map((x, i) => { const avgOut = x.D / nDays, cover = avgOut > 0 ? Math.floor(Math.max(0, x.c) / avgOut) : null, col = ["#7c3aed", "#0891b2", "#059669"][i % 3]; return vcard(esc(x.p.name), `${ivQ(x.c)} bag · ${ivQ(x.c * x.p.bag_kg)} kg`, `${chart(x, col)}<div class="ir-mini"><span><small class="mut">${bi("গড় উৎপাদন/দিন", "Avg ready/day")}</small><b class="num">${ivQ(Math.round(x.R / nDays * 10) / 10)}</b></span><span><small class="mut">${bi("গড় ডেলিভারি/দিন", "Avg out/day")}</small><b class="num">${ivQ(Math.round(avgOut * 10) / 10)}</b></span><span><small class="mut">${bi("স্টক চলবে", "Stock cover")}</small><b class="num ${cover !== null && cover < 3 ? "rd" : ""}">${cover === null ? "—" : cover + " " + bi("দিন", "d")}</b></span></div>`, "ir-v" + (i + 1)); }).join("");
      filters.push([pF, [["", bi("সব পণ্য", "All products"), all.length], ...all.map(x => [x.p.code, x.p.name, ""])], "p"]);
      return repSheet("ir-in", "Inventory · RM Factory (Bulta, Rupganj)", f, t,
        repKpi(sm.map(x => [x.p.name + " stock", `${ivQ(x.c)} bag · ${ivQ(x.c * x.p.bag_kg)} kg`, x.c < 0 ? "k2" : "k3"]).concat([["Total stock (kg)", ivQ(ivSum(sm, x => x.c * x.p.bag_kg)), "k1"]])),
        repOne(repBox("Summary (bags)", ["Product", "Opening", "Ready", "Delivery", "Closing", "Closing kg"], sm.map(x => tr2([esc(x.p.name), ivQ(x.L.open), ivQ(x.R), ivQ(x.D), ivQ(x.c), ivQ(x.c * x.p.bag_kg)])).join(""))) +
        repTwo(...sm.map(x => repBox(x.p.name + " — daily", ["~Date", "Ready", "Delivery", "Stock"], x.L.rows.map(r => `<tr><td>${dmy(r.date)}</td><td class="r num">${r.ready || ""}</td><td class="r num">${r.del || ""}</td><td class="r num ${r.stock < 0 ? "b" : ""}">${ivQ(r.stock)}</td></tr>`).join("")))), filtNote());
    }
    const X0 = ivExceptions(f, t).filter(x => !chF || !x.ch || x.ch === chF), X1 = X0.filter(x => !q || ivSearch(x.txt).includes(q)), X = X1.filter(x => !xF || x.k === xF);
    counts = { all: X0.length, shown: X.length };
    cur = { name: "Inventory_Alerts", xl: { Alerts: [["Type", "Date", "Detail"], ...X.map(x => [IV_XK[x.k][1], x.d, x.txt.replace(/<[^>]+>/g, "")])] } };
    const kinds = Object.keys(IV_XK), mxK = Math.max(1, ...kinds.map(k => X1.filter(x => x.k === k).length));
    viz.innerHTML = vcard(bi("সতর্কতার ধরন", "Alert types", ""), bi("ধরনে ক্লিক করলে শীট ফিল্টার হবে", "Click a type to filter the sheet"), hbars(kinds.map(k => { const n = X1.filter(x => x.k === k).length; return [k, bi(IV_XK[k][0], IV_XK[k][1]), n, n, (n / mxK * 100).toFixed(1), IV_XK[k][2]]; }), "data-xk"), "ir-v1") +
      vcard(bi("মেয়াদ অনুযায়ী (দেরিতে Pending)", "Late pending by age", ""), bi("কতদিন ধরে বাকি", "How long they have waited"), (() => { const late = X1.filter(x => x.k === "late"), b = [0, 0, 0, 0]; late.forEach(x => b[x.n > 30 ? 3 : x.n > 15 ? 2 : x.n > 10 ? 1 : 0]++); const m = Math.max(1, ...b); return hbars(b.map((n, i) => ["", ["8–10", "11–15", "16–30", "30+"][i] + " " + bi("দিন", "days"), n, n, (n / m * 100).toFixed(1), BC[i]]), "data-none"); })(), "ir-v2");
    filters.push([xF, [["", bi("সব ধরন", "All types"), X1.length], ...kinds.map(k => [k, bi(IV_XK[k][0], IV_XK[k][1]), X1.filter(x => x.k === k).length])], "xk"]);
    return repSheet("ir-in", "Inventory · Alerts & exceptions", f, t, repKpi(kinds.map(k => [IV_XK[k][1], X1.filter(x => x.k === k).length, ""])),
      repOne(repBox("Alerts", ["~Type", "~Date", "~Detail"], X.map(x => `<tr><td>${IV_XK[x.k][1]}</td><td>${x.d.length > 7 ? dmy(x.d) : x.d}</td><td>${x.txt}</td></tr>`).join(""))), filtNote());
    function filtNote() {
      const bits = [];
      if (qF) bits.push(`${bi("সার্চ", "Search")}: “${esc(qF)}”`);
      if (chF && F.r === "status") bits.push(chName(chF));
      if (ageF !== "" && F.r === "status") bits.push(BL[+ageF] + " " + bi("দিন", "days"));
      if (stF) bits.push(stF === "del" ? bi("ডেলিভার্ড", "Delivered") : bi("বাকি", "Pending"));
      if (pF) bits.push(INV.rmp.find(p => p.code === pF)?.name || pF);
      if (xF) bits.push(bi(IV_XK[xF][0], IV_XK[xF][1]));
      return bits.length ? `${bi("ফিল্টার", "Filtered")}: ${bits.join(" · ")}` : "";
    }
  }
  /* ---- chips under the search box, counts, tab badges ---- */
  const paintFilters = chips => {
    $("#ir-fl", v).innerHTML = chips.map(([cur0, opts, key]) => `<div class="ir-fg" role="group" data-fk="${key}">${opts.map(([k, l, n]) => `<button type="button" class="chip sm${String(k) === String(cur0) ? " on" : ""}" data-fv="${esc(k)}" aria-pressed="${String(k) === String(cur0)}">${esc(l)}${n !== "" ? ` <b>${n}</b>` : ""}</button>`).join("")}</div>`).join("");
    const active = !!(qF || (F.r === "status" && (chF || ageF !== "")) || stF && ["dist", "nir"].includes(F.r) || pF && F.r === "rm" || xF && F.r === "exc");
    $("#ir-clear", v).disabled = !active;
    $("#ir-count", v).textContent = counts.all ? bi(`${counts.all}টির মধ্যে ${counts.shown}টি দেখাচ্ছে`, `Showing ${counts.shown} of ${counts.all}`) : "";
  };
  function setFilter(k, val) { if (k === "ch") chF = val; else if (k === "age") ageF = val; else if (k === "st") stF = val; else if (k === "p") pF = val; else if (k === "xk") xF = val; sortSt = {}; draw(); }
  /* ---- sortable tables (DOM sort: works for every sheet, totals stay last) ---- */
  const cellKey = td => { const s = (td?.textContent || "").trim(); if (!s || s === "—") return -Infinity; const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/); if (m) return +(m[3] + m[2] + m[1]); const n = Number(s.replace(/[,৳\s]/g, "")); return Number.isFinite(n) ? n : s.toLowerCase(); };
  function sortTable(tbl, ti, ci, dir) {
    const body = tbl.tBodies[0], rows = [...body.rows].filter(r => !r.classList.contains("tot") && r.cells.length > ci), tots = [...body.rows].filter(r => r.classList.contains("tot"));
    const dec = rows.map((r, i) => [cellKey(r.cells[ci]), i, r]);
    dec.sort((a, b) => { const x = a[0], y = b[0]; const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)); return (c || a[1] - b[1]) * dir; });
    dec.forEach(([, , r]) => body.appendChild(r)); tots.forEach(r => body.appendChild(r));
    $$("thead th", tbl).forEach((th, i) => { th.classList.toggle("asc", i === ci && dir > 0); th.classList.toggle("desc", i === ci && dir < 0); th.setAttribute("aria-sort", i === ci ? (dir > 0 ? "ascending" : "descending") : "none"); });
  }
  function enhance() {
    $$("#ir-in .rep-t", v).forEach((tbl, ti) => {
      $$("thead th", tbl).forEach((th, ci) => {
        th.classList.add("ir-sort"); th.tabIndex = 0; th.setAttribute("role", "button");
        const go = () => { const s = sortSt[ti], dir = s && s.c === ci ? -s.d : (th.classList.contains("r") ? -1 : 1); sortSt[ti] = { c: ci, d: dir }; sortTable(tbl, ti, ci, dir); };
        th.onclick = go; th.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
      });
      const s = sortSt[ti]; if (s) sortTable(tbl, ti, s.c, s.d);
    });
  }
  const DESC = {
    status: ["clock", bi("আজ পর্যন্ত যেসব অর্ডার ডেলিভারি হয়নি — সবচেয়ে পুরোনোটা আগে। ৭ দিনের বেশি পুরোনোগুলো লাল।", "Orders not yet delivered as of today, oldest first. Anything older than 7 days is flagged.")],
    dist: ["ivcart", bi("এই সময়ের ডিস্ট্রিবিউশন অর্ডার — আইটেম, পার্টি ও ASM অনুযায়ী অর্ডার বনাম ডেলিভারি।", "Distribution orders in this period: ordered vs delivered by item, party and ASM.")],
    nir: ["ivtruck", bi("এই সময়ের নিরাময় ট্রিপ — আইটেম ও ট্রান্সপোর্ট অনুযায়ী পরিমাণ, মূল্য ও ভাড়া।", "Niramoy trips in this period: quantity, value and rent by item and transport.")],
    rm: ["ivbox", bi("বুলতা ফ্যাক্টরির দৈনিক উৎপাদন, ডেলিভারি ও স্টক — স্টক কত দিন চলবে তাও দেখায়।", "Daily ready, delivery and stock at the Bulta factory, with how many days the stock will last.")],
    exc: ["flag", bi("যেসব জিনিস নজর দরকার: দেরিতে Pending, নেগেটিভ স্টক, Demand-এর বেশি অর্ডার, ভুল তারিখ।", "Things that need attention: late pending, negative stock, orders over demand, date errors.")]
  };
  let first = true;
  function draw() {
    const dd = DESC[F.r]; $("#ir-desc", v).innerHTML = `${ico(dd[0])}<span>${dd[1]}</span>`;
    const on = $("#ir-tab .chip.on", v), tb = $("#ir-tab", v); if (on && tb && tb.scrollWidth > tb.clientWidth) tb.scrollTo({ left: on.offsetLeft - 8, behavior: reduce ? "auto" : "smooth" });
    viz.scrollLeft = 0;
    out.innerHTML = build(); dcFit(v, "ir-in"); locks(); enhance();
    paintFilters(fl);
    if (first || !reduce) { viz.classList.remove("go"); void viz.offsetWidth; viz.classList.add("go"); } first = false;
    const pendN = INV.orders.filter(o => ivPendingAt(o, today())).length, excN = ivExceptions(...pbRange(F)).length;
    $$("#ir-tab .ir-bd", v).forEach(x => x.remove());
    [["status", pendN, ""], ["exc", excN, " bad"]].forEach(([k, n, c]) => { const el = $(`#ir-tab [data-k="${k}"]`, v); if (el && n) el.insertAdjacentHTML("beforeend", ` <b class="ir-bd${c}">${n}</b>`); });
  }
  function locks() {
    const box = $("#ir-lock", v); if (!box) return;
    const ms = [...new Set([ivMon(today()), ivMon(pbRange(F)[0]), ...INV.demand.map(x => ivMon(x.month)), ...INV.orders.map(o => ivMon(o.date)), ...INV.rmd.map(x => ivMon(String(x.date))), ...INV.locks.map(l => String(l.month).slice(0, 10))])].sort().reverse().slice(0, 12);
    box.innerHTML = `<div class="ch"><h3>${ico("ivlock")} ${bi("মাস Lock", "Month lock")}</h3></div><div class="mut sm">${bi("Lock করা মাসে কেউ (admin-ও) নতুন এন্ট্রি, বদল বা মুছতে পারবে না। ভুল ঠিক করতে আগে Unlock করুন।", "Nobody (admins included) can add, change or delete anything in a locked month. Unlock it first to correct a mistake.")}</div><div class="iv-locks">${ms.map(m => { const L = INV.locks.find(l => String(l.month).slice(0, 10) === m); return `<div class="iv-lki ${L ? "on" : ""}"><span><b>${ivMonName(m)}</b><small class="mut">${L ? bi("Lock করেছেন ", "Locked by ") + esc(L.locked_by || "") : bi("খোলা", "Open")}</small></span><button class="btn sm ${L ? "" : "pri"}" data-lm="${m}" data-on="${L ? 1 : 0}">${L ? bi("Unlock", "Unlock") : bi("Lock", "Lock")}</button></div>`; }).join("")}</div>`;
    $$("[data-lm]", box).forEach(b => b.onclick = async () => { const m = b.dataset.lm, on = b.dataset.on === "1"; if (!confirm(on ? bi(`${ivMonName(m)} Unlock করবেন?`, `Unlock ${ivMonName(m)}?`) : bi(`${ivMonName(m)} Lock করবেন? এরপর এই মাসে কিছু বদলানো যাবে না।`, `Lock ${ivMonName(m)}? Nothing in this month can be changed afterwards.`))) return; try { on ? await API.invUnlock(m) : await API.invLock(m); await invLoad(true); toast(on ? bi("✔ Unlock হয়েছে", "✔ Unlocked") : bi("✔ Lock হয়েছে", "✔ Locked")); locks(); } catch (e) { toast(ivErr(e), "err"); } });
  }
  /* ---- command palette: jumps + commands (the typed text also filters the sheet live) ---- */
  const goTab = k => { F.r = k; sortSt = {}; $$("#ir-tab .chip", v).forEach(x => { const on = x.dataset.k === k; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); }); draw(); };
  const cmdItems = raw => {
    const q = ivSearch(raw), list = [], cm = (ic, t, s, run) => ({ g: bi("কমান্ড", "Commands"), ic, t, s, run });
    if (!q) {
      TABS.forEach(([k, l]) => list.push({ g: bi("ট্যাবে যান", "Go to tab"), ic: "chart", t: l, s: "", run: () => goTab(k) }));
      list.push(cm("dl", bi("Excel এক্সপোর্ট", "Export to Excel"), "", () => $("#ir-xl", v).click()));
      list.push(cm("print", bi("PDF তৈরি", "Make PDF"), "", () => $("#ir-pdf", v)?.click()));
      list.push(cm("img", bi("স্ক্রিনশট", "Screenshot"), "", () => $("#ir-png", v)?.click()));
      list.push(cm("flag", bi("শুধু ৮+ দিনের Pending", "Only pending 8+ days"), bi("Pending অবস্থা ট্যাবে", "on the Pending status tab"), () => { goTab("status"); ageF = "2"; draw(); }));
      return list;
    }
    INV.orders.filter(o => o.status !== "cancel" && otext(o).includes(q)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).forEach(o => list.push({ g: bi("অর্ডার ও ট্রিপ", "Orders & trips"), ic: o.ch === "nir" ? "ivtruck" : "ivcart", t: `<b>${esc(ivPname(o))}</b> ${ivSt(o.status)}`, s: `${chName(o.ch)} · ${dmy(o.date)} · ${ivQ(o.total_qty)} ctn · ৳ ${money0(o.value)}`, run: () => ivOrderModal(o.ch, o, draw) }));
    INV.items.filter(i => ivSearch(i.name).includes(q)).slice(0, 4).forEach(i => list.push({ g: bi("আইটেম", "Items"), ic: "ivbox", t: `<b>${esc(i.name)}</b>`, s: bi("এই আইটেম দিয়ে শীট ফিল্টার করুন", "filter the sheet by this item"), run: () => { qIn.value = i.name; qF = i.name; draw(); } }));
    TABS.filter(([, l]) => ivSearch(l).includes(q)).forEach(([k, l]) => list.push({ g: bi("ট্যাবে যান", "Go to tab"), ic: "chart", t: `<b>${l}</b>`, s: "", run: () => goTab(k) }));
    return list;
  };
  const cmd = ivCmdBind(qIn, res, cmdItems, val => { qF = val; sortSt = {}; draw(); });
  /* ---- clicks: chips, viz strip, rows ---- */
  v.addEventListener("click", e => {
    const t = e.target; let b;
    if ((b = t.closest("#ir-fl [data-fv]"))) { setFilter(b.closest("[data-fk]").dataset.fk, b.dataset.fv); return; }
    if (!t.closest("#ir-viz,#ir-in")) return;
    if ((b = t.closest("[data-age]"))) setFilter("age", ageF === b.dataset.age ? "" : b.dataset.age);
    else if ((b = t.closest("[data-ch]"))) setFilter("ch", chF === b.dataset.ch ? "" : b.dataset.ch);
    else if ((b = t.closest("[data-xk]"))) setFilter("xk", xF === b.dataset.xk ? "" : b.dataset.xk);
    else if ((b = t.closest("[data-q]"))) { qF = qF === b.dataset.q ? "" : b.dataset.q; qIn.value = qF; sortSt = {}; draw(); }
    else if ((b = t.closest("[data-oid]"))) { const o = INV.orders.find(x => x.id === b.dataset.oid); if (o && !getSelection().toString()) ivOrderModal(o.ch, o, draw); }
  });
  $("#ir-clear", v).onclick = () => { qF = ""; ageF = ""; stF = ""; pF = ""; xF = ""; chF = ""; qIn.value = ""; sortSt = {}; draw(); };
  /* ---- row preview on hover ---- */
  const preview = e => {
    const row = e.target.closest?.("#ir-in .ir-row"); if (!row) { pop.hidden = true; return; }
    const o = INV.orders.find(x => x.id === row.dataset.oid); if (!o) return;
    const ls = Object.entries(o.lines).sort((a, b) => b[1].q - a[1].q), top = ls.slice(0, 5);
    pop.innerHTML = `<b>${esc(ivPname(o))}</b><small>${chName(o.ch)} · ${dmy(o.date)} · ${ivSt(o.status)}${o.asm ? " · " + esc(o.asm) : ""}</small>${top.map(([id, l]) => `<div><span>${esc(ivItemName(id))}</span><i class="num">${ivQ(l.q)} × ${money0(l.r)}</i></div>`).join("")}${ls.length > 5 ? `<small class="mut">+${ls.length - 5} ${bi("আরও আইটেম", "more items")}</small>` : ""}<div class="ir-pop-t"><span>${ivQ(o.total_qty)} ctn</span><b class="num">৳ ${money0(o.value)}</b></div><small class="mut">${bi("ক্লিক করলে খুলবে", "click to open")}</small>`;
    pop.hidden = false; const w = pop.offsetWidth, h = pop.offsetHeight, x = Math.min(innerWidth - w - 12, e.clientX + 16), y = e.clientY + 18 + h > innerHeight ? e.clientY - h - 12 : e.clientY + 18;
    pop.style.left = Math.max(8, x) + "px"; pop.style.top = Math.max(8, y) + "px";
  };
  if (matchMedia("(hover:hover)").matches) { out.addEventListener("mousemove", preview); out.addEventListener("mouseleave", () => pop.hidden = true); }
  const onKey = e => { if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && !document.querySelector(".mback")) { e.preventDefault(); qIn.focus(); } };
  document.addEventListener("keydown", onKey);
  pbBind(v, "irpb", F, draw);
  ivSegBind(v, "ir-tab", F, "r", () => { sortSt = {}; draw(); });
  const unb = repBind(v, "ir", "ir-in", () => `${cur?.name || "Inventory"}_${pbRange(F).join("_")}`, () => cur?.name.replace(/_/g, " ") || "");
  /* sort arrows must not appear in screenshots / PDF */
  ["ir-png", "ir-pdf", "ir-sh"].forEach(id => $("#" + id, v)?.addEventListener("click", () => { const el = $("#ir-in", v); el?.classList.add("nosort"); setTimeout(() => el?.classList.remove("nosort"), 3000); }, true));
  $("#ir-xl", v).onclick = () => cur && exportXlsx(cur.xl, `${cur.name}_${pbRange(F).join("_")}.xlsx`);
  draw();
  return () => { unb?.(); cmd.stop(); document.removeEventListener("keydown", onKey); pop.remove(); };
}

Object.assign(AU_T, { inv_orders: "ইনভেন্টরি অর্ডার", inv_items: "ইনভেন্টরি আইটেম", inv_demand: "ইনভেন্টরি Demand", rm_daily: "আরএম দৈনিক", rm_products: "আরএম পণ্য", rm_ledger: "আরএম খাতা", inv_locks: "ইনভেন্টরি Lock" });
/* if app.js already drew the shell before this file loaded, redraw so the new group shows */
if (typeof S !== "undefined" && S.me && $("#view")) { shell(); route(); }
