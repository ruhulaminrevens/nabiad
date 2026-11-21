/* NABIAD — CASH BOOK / ক্যাশ খাতা (v6.76)
   Daily paper-book style entry: Cash in Hand (opening) → Receipt lines → Payment lines → counted cash in hand.
   Every line = a name + an amount; its category (Cosmetics / Food / Bank A/C / Suppliers …) is guessed from the name
   (from the ledger mapping or earlier entries). The Cash Checker (old Cash Entry page) groups these lines into
   its categories and compares everything. Loaded after app.js; uses its helpers (head, dateNav, evalAmt, CASH, bi …). */
"use strict";

/* API (cbOn / cbPrev / cbSave / cbRange / lastBookDate) lives in app.js — boot() needs it before this file loads */

/* ---------- categories, guessing, grouping ---------- */
const CB_CAT = { r: CASH.receipt.flatMap(g => g.items.map(i => i[0])), p: CASH.payment.flatMap(g => g.items.map(i => i[0])) };
const CB_BANK = ["bank_in", "bank_out"];
const cbCatName = k => k === "bank_in" ? cashHead(k, bi("Bank — উত্তোলন", "Bank — withdrawal")) : k === "bank_out" ? cashHead(k, bi("Bank — জমা", "Bank — deposit")) : cashLabel(k);
const cashGroupDefaults = new Map(Object.values(CASH).flatMap(groups => groups.flatMap(group => group.items)));
let cashGroupRead = 0;

async function cashGroupLoad() {
  const read = ++cashGroupRead;
  try {
    const rows = await API.cashGroupNames();
    if (read !== cashGroupRead) return;
    cashGroupNames.clear();
    rows.forEach(row => cashGroupNames.set(row.group_key, row.label));
    return true;
  } catch {
    return false;
  }
}

Object.assign(SbAPI, {
  async cashGroupNames() {
    return fetchAll("cash_group_names", "group_key", "group_key,label");
  },
  async cashGroupSave(rows) {
    const { error } = await sb.from("cash_group_names").upsert(rows);
    if (error) throw error;
  }
});
Object.assign(DemoAPI, {
  async cashGroupNames() {
    return Object.entries(demoStore.cashGroupNames || {}).map(([group_key, label]) => ({ group_key, label }));
  },
  async cashGroupSave(rows) {
    const names = demoStore.cashGroupNames ||= {};
    rows.forEach(({group_key, label}) => names[group_key] = label);
    this.save();
  }
});
const cbNorm = s => String(s || "").toLowerCase().replace(/[\s.,\-_()\/]+/g, "");
const CB_DRAFT = d => "nabiad_cb_draft_" + d;
const CB_KW = {
  r: [[/niramoy|নিরাময়/i, "niramoy"], [/nabiad\s*dist|নাবিয়াদ\s*ডিস্ট|ডিস্ট্রিবিউশন|distribution|\bdist\b/i, "dist"], [/food|ফুড/i, "cz_food"], [/chem|কেমিক/i, "cz_chem"], [/cash\s*sale|counter|কাউন্টার|ক্যাশ\s*সেল/i, "cz_oth"], [/suspense|সাসপেন্স/i, "suspense"]],
  p: [[/\bl\/?c\b|\bcc\b|\bod\b|এলসি/i, "lc"], [/loan|bill|লোন|বিল/i, "loans"], [/supplier|সাপ্লায়ার|সাপ্লাইয়ার/i, "supp"]]
};
let CBL = null;   /* what earlier days taught us: name → category (+ bank A/C) */
async function cbLearn(force) {
  if (CBL && !force && Date.now() - CBL.t < 300000) return CBL;
  const L = { r: new Map(), p: new Map(), nm: { r: new Map(), p: new Map() }, t: Date.now() };
  try {
    const rows = await API.cbRange(addDays(today(), -240), today());
    rows.forEach(d => ["r", "p"].forEach(t => (d.lines?.[t] || []).forEach(l => { const n = cbNorm(l.n); if (!n) return; if (l.k) L[t].set(n, { k: cashCategory(l.k), ...(l.c ? { c: l.c } : {}) }); L.nm[t].set(n, { n: l.n, c: (L.nm[t].get(n)?.c || 0) + 1 }); })));
  } catch { }
  return CBL = L;
}
/* ---------- ledger master (v6.77): the Tally ledger names offered in the Cash Book dropdown ---------- */
Object.assign(SbAPI, {
  async cbLedgers() { return fetchAll("cashbook_ledgers", "id").then(rows => rows.sort((a,b) => a.name.localeCompare(b.name))); },
  async cbLedgerGroupSave(id, patch) {
    const {data,error} = await sb.from("cashbook_ledgers").update({...patch,updated_at:new Date().toISOString()}).eq("id",id).select().single();
    if (error) throw error;
    return data;
  },
  async cbLedgerSave(r) {
    const row = { name: r.name, kind: r.kind || "both", cat_r: r.cat_r || null, cat_p: r.cat_p || null, bank_code: r.bank_code || null, active: r.active !== false, updated_at: new Date().toISOString() };
    if (r.id) { const { data, error } = await sb.from("cashbook_ledgers").update(row).eq("id", r.id).select().single(); if (error) throw error; return data; }
    const { data, error } = await sb.from("cashbook_ledgers").insert({ ...row, created_by: S.me.name }).select().single(); if (error) throw error; return data;
  },
  async cbLedgerDel(id) { const { error } = await sb.from("cashbook_ledgers").delete().eq("id", id).select("id").single(); if (error) throw error; }
});
Object.assign(DemoAPI, {
  _cbl() { return demoStore.cbl ||= [["Demo Cosmetics Store", "r", "cz_cos", null], ["Demo Food Store", "r", "cz_food", null], ["Niramoy Traders", "both", "niramoy", "supp"], ["Demo Supplier Ltd", "p", null, "supp"], ["Office Expenses", "p", null, "p_oth"], ["Demo Bank Main", "both", "bank_in", "bank_out"]].map(([name, kind, cat_r, cat_p], i) => ({ id: i + 1, name, kind, cat_r, cat_p, bank_code: null, active: true })); },
  async cbLedgers() { return this._cbl().map(x => ({ ...x })); },
  async cbLedgerGroupSave(id, patch) {
    const row = this._cbl().find(entry => entry.id === id);
    if (!row) throw new Error("Ledger unavailable");
    Object.assign(row, patch, { updated_at: new Date().toISOString() }); this.save(); return {...row};
  },
  async cbLedgerSave(r) {
    const L = this._cbl(), dup = L.find(x => x.id !== r.id && x.name.toLowerCase() === String(r.name).toLowerCase()); if (dup) throw new Error('duplicate key value violates unique constraint "cashbook_ledgers_name_u"');
    const row = { name: r.name, kind: r.kind || "both", cat_r: r.cat_r || null, cat_p: r.cat_p || null, bank_code: r.bank_code || null, active: r.active !== false, updated_at: new Date().toISOString() };
    if (r.id) { const i = L.findIndex(x => x.id === r.id); L[i] = { ...L[i], ...row }; this.save(); return { ...L[i] }; }
    const n = { id: Math.max(0, ...L.map(x => x.id)) + 1, ...row, created_at: row.updated_at }; L.push(n); this.save(); return { ...n };
  },
  async cbLedgerDel(id) { const L = this._cbl(), i = L.findIndex(x => x.id === id); if (i >= 0) L.splice(i, 1); this.save(); }
});
let CBLED = null;
async function cbLedLoad(force) {
  if (CBLED && !force && Date.now() - CBLED.t < 300000) return CBLED;
  const L = { list: [], byNorm: new Map(), t: Date.now(), err: null };
  try { L.list = await API.cbLedgers(); } catch (e) { L.err = e; }
  L.list.forEach(m => L.byNorm.set(cbNorm(m.name), m));
  return CBLED = L;
}
const cbLedCat = (m, t) => cashCategory(t === "r" ? m.cat_r : m.cat_p);
/* dropdown items for one side: this side's ledgers first, then the rest, then names typed on earlier days that are not in the list */
function cbLedItems(t) {
  const used = CBL?.nm?.[t], seen = new Set(), out = [], other = t === "r" ? "p" : "r";
  (CBLED?.list || []).filter(m => m.active !== false).forEach(m => {
    const nn = cbNorm(m.name), side = m.kind === "both" || m.kind === t, k = cbLedCat(m, t); seen.add(nn);
    out.push({ value: m.name, label: "", sub: "", c: (used?.get(nn)?.c || 0) + (side ? 1e6 : 0), html: `<span class="sgn"><b>${esc(m.name)}</b>${k ? `<em>${esc(cbCatName(k))}${CB_BANK.includes(k) && m.bank_code ? " · " + esc(m.bank_code) : ""}</em>` : ""}</span>` });
  });
  used?.forEach((x, nn) => { if (!seen.has(nn)) out.push({ value: x.n, label: "", sub: "", c: x.c + 5e5, html: `<span class="sgn"><b>${esc(x.n)}</b><em>${bi("আগের এন্ট্রি থেকে", "from earlier entries")}</em></span>` }); });
  return out.sort((a, b) => b.c - a.c || a.value.localeCompare(b.value));
}
function cbBank(name) {
  const m = String(name || "").match(/([A-Za-z]{2,6})\s*[-–. ]?\s*(\d{1,6})/); if (!m) return null;
  const pre = m[1].toUpperCase(), dg = m[2], pa = c => { const x = String(c || "").toUpperCase().match(/^([A-Z]{2,6})[-\s]?(\d+)\s*$/); return x ? { p: x[1], d: x[2] } : null; };
  const cand = (S.accounts || []).filter(a => { const z = pa(a.code); return z && z.p === pre && (+z.d === +dg || z.d.endsWith(dg)); });
  const ex = cand.filter(a => +pa(a.code).d === +dg), list = ex.length ? ex : cand, act = list.filter(a => a.status === "Active");
  return list.length === 1 ? list[0].code : act.length === 1 ? act[0].code : null;
}
function cbGuess(name, t) {
  const n = cbNorm(name); if (!n) return null;
  const L = CBL?.[t]?.get(n);
  const M = CBLED?.byNorm.get(n), mk = M?.active !== false && M && cbLedCat(M,t);
  if (mk && CB_CAT[t].includes(mk)) {
    const c = CB_BANK.includes(mk) ? M.bank_code || (L?.k === mk ? L.c : null) || cbBank(name) : null;
    return c ? {k:mk,c} : {k:mk};
  }
  if (L && CB_CAT[t].includes(L.k)) return L;
  const b = cbBank(name); if (b) return { k: t === "r" ? "bank_in" : "bank_out", c: b };
  for (const [re, k] of CB_KW[t]) if (re.test(name)) return { k };
  return null;
}
/* lines → the Cash Checker's items ({key:{a, n, accs}}); unassigned lines go to Others and are counted */
function cbGroup(bk) {
  const items = {}, warn = { un: 0, noAc: 0 };
  [["r", "cz_oth"], ["p", "p_oth"]].forEach(([t, dflt]) => (bk?.lines?.[t] || []).forEach(l => {
    const a = +l.a || 0; if (!a) return;
    let k = cashCategory(l.k); if (!k || !CB_CAT[t].includes(k)) { k = dflt; warn.un++; }
    const it = items[k] ||= { a: 0, _n: [] }; it.a += a; if (l.n) it._n.push(l.n);
    if (CB_BANK.includes(k)) { if (!l.c) warn.noAc++; const accs = it.accs ||= []; const z = accs.find(q => q.c === (l.c || "")); z ? z.a += a : accs.push({ c: l.c || "", a }); }
  }));
  Object.values(items).forEach(it => { it.a = Math.round(it.a * 100) / 100; if (it.accs) it.accs.forEach(z => z.a = Math.round(z.a * 100) / 100); const n = [...new Set(it._n)].join(", "); delete it._n; if (n) it.n = n.slice(0, 240); });
  return { items, warn };
}
const cbTot = bk => { const s = t => (bk?.lines?.[t] || []).reduce((q, l) => q + (+l.a || 0), 0), R = s("r"), P = s("p"); return { R, P, exp: (+bk?.opening_cash || 0) + R - P }; };
const cbSigned = n => (n > 0 ? "+" : n < 0 ? "−" : "") + money0(Math.abs(n));

/* ---------- Cash Checker: problems & differences ---------- */
function cbChecks(row, bk, prevBk) {
  const L = [], add = (lv, t) => L.push({ lv, t }), R = cashItems(row.items), m = money0;
  const sumAll = t => CASH_KEYS(t).reduce((s, k) => s + (+R[k]?.a || 0), 0), allR = sumAll("receipt"), allP = sumAll("payment");
  if (row.cash_in_hand != null) {
    const exp = row.opening_cash + allR - allP, d = row.cash_in_hand - exp;
    if (Math.abs(d) > 0.5) add("err", bi(`হাতে ক্যাশ মেলে না — Opening ${m(row.opening_cash)} + Receipt (Bank সহ) ${m(allR)} − Payment (Bank সহ) ${m(allP)} = ${m(exp)} হওয়ার কথা, লেখা ${m(row.cash_in_hand)} → পার্থক্য ${cbSigned(d)}`, `Cash in hand does not tally — Opening ${m(row.opening_cash)} + Receipt (incl. Bank) ${m(allR)} − Payment (incl. Bank) ${m(allP)} = ${m(exp)} expected, entered ${m(row.cash_in_hand)} → difference ${cbSigned(d)}`));
    else add("ok", bi("হাতে ক্যাশের হিসাব মিলেছে", "Cash in hand tallies"));
    if (row.closing != null && row.closing - row.cash_in_hand < -0.5) add("err", bi(`Total Bank ঋণাত্মক হচ্ছে (${m(row.closing - row.cash_in_hand)}) — Cash in hand Closing-এর চেয়ে বেশি`, `Total Bank is negative (${m(row.closing - row.cash_in_hand)}) — Cash in hand is more than Closing`));
  } else add("warn", bi("Cash in hand এখনো লেখা হয়নি", "Cash in hand is not entered yet"));
  if (!bk) { add("info", bi("এই তারিখের ক্যাশ খাতা এন্ট্রি নেই — খাতার সাথে মেলানোর কিছু নেই", "No Cash Book entry for this date — nothing to compare with")); return L; }
  const g = cbGroup(bk), T = cbTot(bk);
  if (bk.status !== "final") add("warn", bi("ক্যাশ খাতা এখনো ড্রাফট — ফাইনাল সেভ হয়নি", "Cash Book is still a draft — not finalised"));
  if (bk.cash_in_hand == null) add("warn", bi("ক্যাশ খাতায় হাতে ক্যাশ (গুনে) লেখা নেই", "Counted cash in hand is missing in the Cash Book"));
  else if (Math.abs(bk.cash_in_hand - T.exp) > 0.5) add("err", bi(`খাতার নিজের হিসাব মেলে না — Opening ${m(bk.opening_cash)} + Receipt ${m(T.R)} − Payment ${m(T.P)} = ${m(T.exp)}, লেখা ${m(bk.cash_in_hand)} → পার্থক্য ${cbSigned(bk.cash_in_hand - T.exp)}`, `The Cash Book itself does not tally — Opening ${m(bk.opening_cash)} + Receipt ${m(T.R)} − Payment ${m(T.P)} = ${m(T.exp)}, entered ${m(bk.cash_in_hand)} → difference ${cbSigned(bk.cash_in_hand - T.exp)}`));
  if (prevBk) { const pc = prevBk.cash_in_hand == null ? cbTot(prevBk).exp : +prevBk.cash_in_hand; if (Math.abs((+bk.opening_cash || 0) - pc) > 0.5) add("err", bi(`খাতার Opening ${m(bk.opening_cash)} ≠ আগের দিনের (${dmy(prevBk.date)}) হাতে ক্যাশ ${m(pc)} (পার্থক্য ${cbSigned(bk.opening_cash - pc)})`, `Book opening ${m(bk.opening_cash)} ≠ previous day's (${dmy(prevBk.date)}) cash in hand ${m(pc)} (difference ${cbSigned(bk.opening_cash - pc)})`)); }
  if (Math.abs(row.opening_cash - (+bk.opening_cash || 0)) > 0.5) add("warn", bi(`Opening Cash: ফর্ম ${m(row.opening_cash)} ≠ খাতা ${m(bk.opening_cash)}`, `Opening cash: form ${m(row.opening_cash)} ≠ book ${m(bk.opening_cash)}`));
  if (g.warn.un) add("warn", bi(`${g.warn.un}টি লাইনের খাত বাছা হয়নি — Others ধরা হয়েছে (ক্যাশ খাতায় গিয়ে ঠিক করুন)`, `${g.warn.un} line(s) have no category — counted under Others (fix in the Cash Book)`));
  if (g.warn.noAc) add("err", bi(`${g.warn.noAc}টি Bank লাইনে A/C বাছা নেই`, `${g.warn.noAc} Bank line(s) have no A/C selected`));
  let bad = 0;
  [...new Set([...Object.keys(R), ...Object.keys(g.items)])].forEach(k => {
    const fa = +R[k]?.a || 0, ba = +g.items[k]?.a || 0; if (!fa && !ba) return;
    if (Math.abs(fa - ba) > 0.5) { bad++; add("err", bi(`${cbCatName(k)}: খাতা ${m(ba)} ≠ ফর্ম ${m(fa)} (পার্থক্য ${cbSigned(fa - ba)})`, `${cbCatName(k)}: book ${m(ba)} ≠ form ${m(fa)} (difference ${cbSigned(fa - ba)})`)); }
    if (CB_BANK.includes(k)) {
      const fm = {}, bm = {}; (R[k]?.accs || []).forEach(z => fm[z.c || ""] = (fm[z.c || ""] || 0) + (+z.a || 0)); (g.items[k]?.accs || []).forEach(z => bm[z.c || ""] = (bm[z.c || ""] || 0) + (+z.a || 0));
      [...new Set([...Object.keys(fm), ...Object.keys(bm)])].forEach(c => { if (Math.abs((fm[c] || 0) - (bm[c] || 0)) > 0.5) { bad++; add("err", bi(`${cbCatName(k)} · ${c || "A/C নেই"}: খাতা ${m(bm[c] || 0)} ≠ ফর্ম ${m(fm[c] || 0)}`, `${cbCatName(k)} · ${c || "no A/C"}: book ${m(bm[c] || 0)} ≠ form ${m(fm[c] || 0)}`)); } });
    }
  });
  if (!bad) add("ok", bi("খাতার সাথে প্রতিটি খাত মিলেছে", "Every category matches the Cash Book"));
  if (bk.cash_in_hand != null && row.cash_in_hand != null && Math.abs(bk.cash_in_hand - row.cash_in_hand) > 0.5) add("err", bi(`Cash in hand: ফর্ম ${m(row.cash_in_hand)} ≠ খাতা ${m(bk.cash_in_hand)}`, `Cash in hand: form ${m(row.cash_in_hand)} ≠ book ${m(bk.cash_in_hand)}`));
  return L;
}
function cbChecksHtml(L) {
  const n = lv => L.filter(x => x.lv === lv).length, e = n("err"), w = n("warn");
  const ord = { err: 0, warn: 1, info: 2, ok: 3 }, ic = { err: "✖", warn: "⚠", info: "ℹ", ok: "✔" };
  return `<div class="cbchk-h"><b>🔎 ${bi("ক্যাশ চেকার — সমস্যা ও পার্থক্য", "Cash Checker — problems & differences")}</b><span class="cbchip ${e ? "err" : w ? "warn" : "ok"}">${e ? `${e} ${bi("সমস্যা", "problem(s)")}` : w ? `${w} ${bi("সতর্কতা", "warning(s)")}` : bi("সব ঠিক", "All OK")}</span>${e && w ? `<span class="cbchip warn">${w} ${bi("সতর্কতা", "warning(s)")}</span>` : ""}</div><ul class="cbchk-l">${[...L].sort((a, b) => ord[a.lv] - ord[b.lv]).map(x => `<li class="${x.lv}"><i>${ic[x.lv]}</i><span>${esc(x.t)}</span></li>`).join("")}</ul>`;
}

/* ---------- daily register: source totals are references, never cash lines ---------- */
const cbRegisterMoney = n => n == null ? "—" : Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cbRegisterDate = at => at ? new Date(at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }) + " (Dhaka)" : "—";
async function cbRegisterSummary(date) {
  const [balances, collections] = await Promise.all([API.balancesOn(date), API.dcolRange(date, date)]);
  const codes = S.accounts.filter(a => a.daily).map(a => a.code);
  const bank = codes.map(code => balances[code]?.total).filter(n => n != null);
  const approved = collections.filter(c => c.date === date && c.status === "approved");
  const sum = (rows, amount) => rows.reduce((t, row) => t + Math.round(Number(amount(row)) * 100), 0) / 100;
  return {
    at: new Date().toISOString(),
    bank: bank.length ? sum(bank, n => n) : null,
    collection: sum(approved, c => c.amount),
    cash: sum(approved.filter(c => String(c.account || "").trim().toLowerCase() === "cash"), c => c.amount)
  };
}
function cbRegisterReferences(snapshot) {
  return [
    [bi("মোট ব্যাংক ক্লোজিং", "Total Bank Closing"), snapshot?.bank ?? null],
    [bi("নাবিয়াদ ডিস্ট্রিবিউশন · মোট অনুমোদিত কালেকশন", "Nabiad Distribution · All approved collections"), snapshot?.collection ?? null],
    [bi("এর মধ্যে অনুমোদিত Cash", "Of which approved Cash"), snapshot?.cash ?? null]
  ];
}
function cbRegisterTotals(book) {
  const { R, P, exp } = cbTot(book);
  const counted = book.cash_in_hand == null ? null : Number(book.cash_in_hand);
  return [
    [bi("শুরুর নগদ", "Opening cash"), Number(book.opening_cash) || 0],
    [bi("মোট প্রাপ্তি", "Total receipts"), R],
    [bi("মোট পরিশোধ", "Total payment"), P],
    [bi("হাতে থাকার কথা", "Expected cash"), exp],
    [bi("গুনে পাওয়া নগদ", "Counted cash"), counted],
    [bi("পার্থক্য", "Difference"), counted == null ? null : Math.round((counted - exp) * 100) / 100]
  ];
}
const cbRegisterTitle = () => bi("দৈনিক ক্যাশ রেজিস্টার", "Daily Cash Register");
const cbVoucherLabel = t => t === "r" ? bi("মানি রিসিট নং", "Money Receipt No.") : bi("ক্যাশ ভাউচার নং", "Cash Voucher No.");
const cbSideLabel = t => t === "r" ? bi("প্রাপ্তি", "Receipt") : bi("পরিশোধ", "Payment");
const cbNarrationLabel = () => bi("নোট / Tally Narration", "Note / Tally Narration");
function cbRegisterSheet(book) {
  const lines = book.lines || {}, ref = lines.register;
  const label = (l, t) => l ? `<b>${esc(l.n)}</b>${l.ref ? `<small>${cbVoucherLabel(t)}: ${esc(l.ref)}</small>` : ""}${l.note ? `<small class="cb-narr">${esc(l.note)}</small>` : ""}` : "";
  const row = (r, p, i) => `<tr><td>${i + 1}</td><td>${label(r, "r")}</td><td class="r">${cbRegisterMoney(r?.a)}</td><td>${label(p, "p")}</td><td class="r">${cbRegisterMoney(p?.a)}</td></tr>`;
  const totals = values => values.map(([k, n]) => `<div class="cb-reg-total"><span>${esc(k)}</span><b>${cbRegisterMoney(n)}</b></div>`).join("");
  const records = Array.from({ length: Math.max(lines.r?.length || 0, lines.p?.length || 0) }, (_, i) => row(lines.r?.[i], lines.p?.[i], i)).join("");
  return `<div class="rep cb-register">${dcHead(cbRegisterTitle(), book.date, book.date)}
    <table class="rep-t cb-reg-table"><colgroup><col style="width:5%"><col style="width:32%"><col style="width:15.5%"><col style="width:32%"><col style="width:15.5%"></colgroup>
    <thead><tr><th>#</th><th>${bi("প্রাপ্তি", "Receipt")}</th><th class="r">৳</th><th>${bi("পরিশোধ", "Payment")}</th><th class="r">৳</th></tr></thead>
    <tbody>${records || `<tr><td colspan="5">${bi("কোনো লেনদেন নেই", "No transactions")}</td></tr>`}</tbody></table>
    <section class="cb-reg-block"><h3>${bi("নগদ হিসাব", "Cash reconciliation")}</h3>${totals(cbRegisterTotals(book))}</section>
    <section class="cb-reg-block"><h3>${bi("অন্যান্য সারাংশ", "Reference totals")}</h3>${totals(cbRegisterReferences(ref))}
    <small>${ref ? bi("সারাংশ নেওয়া হয়েছে", "Summary captured") + " · " + cbRegisterDate(ref.at) : bi("এই রেকর্ডে সংরক্ষিত সারাংশ নেই", "This record has no saved reference totals")}</small></section>
    ${book.remarks ? `<section class="cb-reg-block cb-narr">${esc(book.remarks)}</section>` : ""}
    <div class="rep-ft"><span>${bi("ফাইনাল", "Final")} · ${cbRegisterDate(book.updated_at)} · ${esc(book.entered_by || "")}</span><span>NABIAD Smart Finance Suite</span></div></div>`;
}
async function cbRegisterExcel(book) {
  await loadScript("vendor/xlsx.min.js");
  const lines = book.lines || {}, ref = lines.register;
  const entry = l => l ? [l.n, l.a, l.ref || "", l.note || ""] : ["", null, "", ""];
  const rows = Array.from({ length: Math.max(lines.r?.length || 0, lines.p?.length || 0) }, (_, i) => [i + 1, ...entry(lines.r?.[i]), ...entry(lines.p?.[i])]);
  const ws = XLSX.utils.aoa_to_sheet([
    [cbRegisterTitle(), book.date, bi("ফাইনাল", "Final"), cbRegisterDate(book.updated_at), book.entered_by || ""],
    ["#", bi("প্রাপ্তি", "Receipt"), "৳", cbVoucherLabel("r"), cbNarrationLabel(), bi("পরিশোধ", "Payment"), "৳", cbVoucherLabel("p"), cbNarrationLabel()],
    ...rows, [], ...cbRegisterTotals(book), [], ...cbRegisterReferences(ref),
    [bi("সারাংশ নেওয়া হয়েছে", "Summary captured"), cbRegisterDate(ref?.at)],
    [bi("মন্তব্য", "Remarks"), book.remarks || ""]
  ]);
  ws["!cols"] = [6, 28, 16, 22, 42, 28, 16, 22, 42].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cash Register");
  return new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
const cbCanvasBlob = (canvas, type) => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(bi("রেজিস্টার ফাইল তৈরি হয়নি", "Could not render the register file"))), type, 0.92));

/* A4 PDF pages embed the same rasterized Bengali sheet as the PNG. */
function cbRegisterPdf(pages) {
  const encoder = new TextEncoder(), parts = [], offsets = [0];
  let length = 0;
  const add = data => { const bytes = typeof data === "string" ? encoder.encode(data) : data; parts.push(bytes); length += bytes.length; };
  const obj = (id, value) => { offsets[id] = length; add(`${id} 0 obj\n`); [].concat(value).forEach(add); add("\nendobj\n"); };
  add("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`);
  pages.forEach(({ bytes, width, height }, i) => {
    const page = 3 + i * 3, w = 555, h = w * height / width;
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Register ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`);
    const commands = `q\n${w} 0 0 ${h.toFixed(4)} 20 ${(822 - h).toFixed(4)} cm\n/Register Do\nQ\n`;
    obj(page + 1, `<< /Length ${commands.length} >>\nstream\n${commands}endstream`);
    obj(page + 2, [`<< /Type /XObject /Subtype /Image /ColorSpace /DeviceRGB /BitsPerComponent 8 /Width ${width} /Height ${height} /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`, bytes, "\nendstream"]);
  });
  const xref = length;
  add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach(offset => add(`${String(offset).padStart(10, "0")} 00000 n \n`));
  add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}
async function cbRegisterVisual(el, format) {
  await document.fonts?.ready;
  const canvas = await dcCanvas(el);
  if (format === "png") return cbCanvasBlob(canvas, "image/png");
  const scale = canvas.height / el.getBoundingClientRect().height, top = el.getBoundingClientRect().top;
  const ends = $$("tr, .cb-reg-total, .rep-ft", el).map(node => Math.round((node.getBoundingClientRect().bottom - top) * scale));
  const pages = [], maxHeight = Math.floor(canvas.width * 802 / 555);
  for (let y = 0; y < canvas.height;) {
    const limit = Math.min(y + maxHeight, canvas.height);
    const end = limit === canvas.height ? limit : Math.max(y, ...ends.filter(e => e > y && e <= limit));
    const slice = document.createElement("canvas"); slice.width = canvas.width; slice.height = (end > y ? end : limit) - y;
    slice.getContext("2d").drawImage(canvas, 0, y, slice.width, slice.height, 0, 0, slice.width, slice.height);
    const bytes = new Uint8Array(await (await cbCanvasBlob(slice, "image/jpeg")).arrayBuffer());
    pages.push({ bytes, width: slice.width, height: slice.height }); y += slice.height;
  }
  return cbRegisterPdf(pages);
}
function cbRegisterModal(book) {
  const name = "Nabiad_Cash_Register_" + book.date, sheet = cbRegisterSheet(book);
  modal(`<h2>${cbRegisterTitle()}</h2><div class="modal-actions cb-register-actions">
    ${["xlsx", "pdf", "png"].map((f, i) => `<button type="button" class="btn" data-register-format="${f}">${["Excel", "PDF", "Image"][i]}</button>`).join("")}
    <button type="button" class="btn" data-register-print>${bi("প্রিন্ট", "Print")}</button>
    <button type="button" class="btn" data-register-share hidden>${bi("ফাইল শেয়ার", "Share file")}</button>
    <button type="button" class="btn" data-register-close>${bi("বন্ধ", "Close")}</button>
    <span class="mut sm" data-register-status role="status"></span></div><div class="rep-scroll">${sheet}</div>`, (root, close) => {
    root.querySelector(".modal").classList.add("cb-register-dialog");
    let file = null, loading = false;
    const share = $("[data-register-share]", root), status = $("[data-register-status]", root);
    $("[data-register-close]", root).onclick = close;
    $("[data-register-print]", root).onclick = () => printSheet(sheet, name);
    share.onclick = async () => {
      try { if (file) await navigator.share({ files: [file], title: name }); }
      catch (e) { if (e.name !== "AbortError") toast(e.message, "err"); }
    };
    $$("[data-register-format]", root).forEach(btn => btn.onclick = async () => {
      if (loading) return;
      loading = true; btn.disabled = true; share.hidden = true; file = null;
      status.textContent = bi("ফাইল তৈরি হচ্ছে…", "Preparing file…");
      try {
        const format = btn.dataset.registerFormat;
        const blob = await (format === "xlsx" ? cbRegisterExcel(book) : cbRegisterVisual($(".cb-register", root), format));
        if (!btn.isConnected) return;
        file = new File([blob], name + "." + format, { type: blob.type });
        dlBlob(file, file.name);
        share.hidden = !navigator.canShare?.({ files: [file] });
        status.textContent = file.name;
      } catch (e) { status.textContent = e.message; }
      finally { loading = false; btn.disabled = false; }
    });
  });
}

/* ---------- the Cash Book page ---------- */
async function vCashBook(v) {
  const routeToken = ROUTE_TOK;
  await cashGroupLoad();
  if (routeToken !== ROUTE_TOK) return;
  const t0 = today(), last = [S.lastBook, S.lastCash].filter(Boolean).sort().pop();
  let date = sessionStorage.getItem("nabiad_cash_date") || (last && last < t0 ? stepDay(last, 1) : t0); sessionStorage.removeItem("nabiad_cash_date"); if (date > t0) date = t0;
  v.innerHTML = head(ROUTES[CUR].t, `<button type="button" class="btn" id="cb-led" title="${bi("লেজার তালিকা", "Ledger list")}">${ico("list")}<span class="lb">${bi("লেজার", "Ledgers")}</span></button><a class="btn" href="#/cashchk" title="${bi("ক্যাশ চেকার", "Cash Checker")}">${ico("check")}<span class="lb">${bi("ক্যাশ চেকার", "Cash Checker")}</span></a><a class="btn" href="#/cashsum" title="${bi("সামারি", "Summary")}">${ico("chart")}<span class="lb">${bi("সামারি", "Summary")}</span></a>`, "tc") + `<div class="card tbar navcard">${dateNav("cb", date)}<div id="cb-msg" style="margin-top:10px"></div></div><div id="cb-body"><div class="card empty">${bi("লোড হচ্ছে…", "Loading…")}</div></div>`;
  const body = $("#cb-body", v); let activitySide = "r", autoT = null, drawId = 0, pendingDraft = null, saving = false, focusout = null;
  const flushDraft = () => { clearTimeout(autoT); const fn = pendingDraft; pendingDraft = null; fn?.(); };
  async function draw() {
    if (saving) return;
    flushDraft();
    if (focusout) body.removeEventListener("focusout", focusout);
    const id = ++drawId, date = $("#cb-d", v).value;
    if (!date) return;
    body.innerHTML = `<div class="card empty">${bi("লোড হচ্ছে…", "Loading…")}</div>`;
    let ex = null, pB = null, pC = null;
    try { [ex, pB, pC] = await Promise.all([API.cbOn(date), API.cbPrev(date), API.cashPrev(date).catch(() => null)]); } catch (e) {
      if (id !== drawId || !body.isConnected) return;
      body.innerHTML = `<div class="alert rd">${/relation|does not exist|schema cache|not find/i.test(e.message || "") ? bi("ক্যাশ খাতার টেবিল নেই — Supabase-এ schema_v6.sql-এর v6.76 অংশ চালাতে হবে", "Cash Book table is missing — run the v6.76 part of schema_v6.sql in Supabase") : isNetErr(e) ? bi("ইন্টারনেট নেই — ক্যাশ খাতার জন্য অনলাইন থাকতে হবে", "Offline — the Cash Book needs an internet connection") : esc(e.message)}</div>`; return;
    }
    await Promise.all([cbLearn(), cbLedLoad()]);
    if (id !== drawId || !body.isConnected) return;
    const final = ex?.status === "final", admin = S.me.role === "admin", locked = final ? !moduleCan("cash", "edit", false) : !moduleCan("cash", "entry") && !(ex && moduleCan("cash", "edit", false));
    let local = null; try { local = JSON.parse(localStorage.getItem(CB_DRAFT(date)) || "null"); } catch { }
    let src = ex, fromLocal = false;
    if (!final && local && (!ex || new Date(local.updated_at) > new Date(ex.updated_at))) { src = local; fromLocal = true; }
    /* Opening cash = previous finalised day's counted cash (Cash Book first, else the Cash Checker record) */
    let po = null, pdate = null, psrc = "";
    if (pB && (!pC || pB.date >= pC.date)) { po = pB.cash_in_hand == null ? cbTot(pB).exp : +pB.cash_in_hand; pdate = pB.date; psrc = "book"; }
    else if (pC) { po = +pC.cash_in_hand || 0; pdate = pC.date; psrc = "chk"; }
    const useStored = final || po == null, oc = useStored ? (src ? +src.opening_cash || 0 : 0) : po, oLocked = locked || (po != null ? true : !admin);
    let pend = null; try { if (!final) pend = (await API.cbRange(addDays(date, -60), addDays(date, -1))).filter(r => r.status !== "final" && (!pB || r.date > pB.date)).pop() || null; } catch { }
    if (id !== drawId || !body.isConnected) return;
    const msgs = [];
    if (final) msgs.push(`<div class="alert ${locked ? "rd" : "am"}">${locked ? "🔒 " + bi("এই তারিখের ক্যাশ খাতা ফাইনাল সেভ হয়েছে।", "This date's Cash Book is final.") : "⚠ " + bi("ফাইনাল সেভ আছে। সেভ করলে পরিবর্তন কার্যকর হবে।", "This day is final. Saving will apply your changes.")} <span class="mut sm">${esc(ex.entered_by || "")}</span></div>`);
    else if (src) msgs.push(`<div class="alert vi">📝 <span>${bi("ড্রাফট লোড হয়েছে", "Draft loaded")}${fromLocal ? bi(" (এই ডিভাইস)", " (this device)") : ""} — ${esc(src.entered_by || S.me.name)} · ${new Date(src.updated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>${!locked ? `<button class="btn sm" id="cb-dd" style="margin-left:auto">${bi("ড্রাফট বাদ দিন", "Discard draft")}</button>` : ""}</div>`);
    if (po != null && !final) msgs.push(`<div class="mut sm">🔗 ${bi("Opening নিজে এসেছে", "Opening is automatic")}: <b>${dmy(pdate)}</b> ${psrc === "book" ? bi("-এর ক্যাশ খাতার হাতে ক্যাশ থেকে", "cash in hand of the Cash Book") : bi("-এর ক্যাশ চেকার রেকর্ড থেকে", "cash in hand of the Cash Checker record")}${workGap(pdate, date) ? ` · <b class="am">${bi(`মাঝে ${workGap(pdate, date)} কর্মদিবসের রেকর্ড নেই`, `${workGap(pdate, date)} working day(s) without a record in between`)}</b>` : ""}</div>`);
    if (po == null && !final) msgs.push(`<div class="mut sm">${admin ? bi("এটা প্রথম রেকর্ড — শুরুর Cash in Hand একবারই লিখুন। এরপর প্রতিদিন নিজে আসবে।", "This is the first record — enter the starting Cash in Hand once. After that it carries over automatically.") : bi("শুরুর Opening এখনো বসানো হয়নি — Admin কে বসাতে বলুন।", "The starting Opening has not been set yet — ask the Admin to set it.")}</div>`);
    if (pend) msgs.push(`<div class="alert am">⚠ <b>${dmy(pend.date)}</b> ${bi("-এর ক্যাশ খাতা এখনো ড্রাফট — ফাইনাল না করলে তার হাতে ক্যাশ এখানে Opening-এ আসবে না।", "Cash Book is still a draft — until it is finalised its cash will not carry into this Opening.")} <button class="btn sm" id="cb-pd" style="margin-left:auto">${bi("খুলুন", "Open")}</button></div>`);
    $("#cb-msg", v).innerHTML = msgs.join("");
    $("#cb-dd", v) && ($("#cb-dd", v).onclick = async () => { if (!ask(bi("এই তারিখের ড্রাফট মুছবেন?", "Discard this date's draft?"))) return; clearTimeout(autoT); pendingDraft = null; localStorage.removeItem(CB_DRAFT(date)); if (ex && !final) { try { await API.cbSave({ date, opening_cash: oc, lines: { r: [], p: [] }, total_receipt: 0, total_payment: 0, cash_in_hand: null, remarks: null, status: "draft" }); } catch { } } draw(); });
    const dis = locked ? "disabled" : "", lines = src?.lines || { r: [], p: [] };
    const acOpts = `<option value="">${bi("A/C বাছুন", "Select A/C")}</option>` + (S.accounts || []).map(a => `<option value="${esc(a.code)}">${esc(a.code)} · ${esc(a.holder || "")}</option>`).join("");
    const rowHtml = (t, i, l = {}) => {
      const stored = cashCategory(l.k), mapped = CB_CAT[t].includes(stored) ? {k:stored,c:l.c} : cbGuess(l.n,t);
      const k = mapped?.k || "", c = mapped?.c || "";
      const particulars = bi("বিবরণ","Particulars"), amount = bi("টাকা","Amount");
      return `<div class="cbr" data-t="${t}" data-category="${esc(k)}"${CB_CAT[t].includes(stored) ? " data-stored-category" : ""}><span class="cbi">${i + 1}</span><div class="cbnm"><input class="cell cbname" autocomplete="off" aria-label="${particulars}" placeholder="${t === "r" ? bi("কার কাছ থেকে / কী", "From whom / what") : bi("কাকে / কী খরচ", "To whom / what for")}" value="${esc(l.n || "")}" ${dis}></div><div class="cbav"><input class="cell cbamt2" inputmode="decimal" aria-label="${amount}" placeholder="0" value="${esc(l.x ?? (l.a ? fmtIn(l.a) : ""))}" ${dis}><span class="cbval num"></span></div><input class="cell cbref" autocomplete="off"
        aria-label="${cbVoucherLabel(t)} (${bi("ঐচ্ছিক", "optional")})"
        placeholder="${t === "r" ? bi("রিসিট নং", "Receipt no.") : bi("ভাউচার নং", "Voucher no.")}"
        value="${esc(l.ref || "")}" ${dis}>${locked ? "" : `<button type="button" class="cbx2" aria-label="${bi("লাইন মুছুন","Remove line")}">×</button>`}<select class="in cbac" aria-label="${bi("ব্যাংক A/C","Bank account")}" ${dis} ${CB_BANK.includes(k) ? "" : "hidden"}>${acOpts.replace(`value="${esc(c) || "-"}"`, `value="${esc(c)}" selected`)}</select>
        <details class="cb-line-details" ${l.note ? "open" : ""}><summary>${cbNarrationLabel()}</summary>
          <label><span>${cbNarrationLabel()}</span><textarea class="in cbnote" rows="2" ${dis}>${esc(l.note || "")}</textarea></label>
        </details></div>`;
    };
    const side = (t, title, cls) => {
      const saved = lines[t] || [], entries = saved.length || locked ? saved : [{}];
      return `<div class="card csec ${cls}"><div class="csh"><h3>${title}</h3><b class="num" id="cb-T${t}">0</b></div>
        <div class="cbh"><span>#</span><span>${bi("বিবরণ", "Particulars")}</span><span>${bi("টাকা", "Amount")}</span><span>${cbVoucherLabel(t)} <span class="cb-ref-opt">(${bi("ঐচ্ছিক", "optional")})</span></span></div>
        <div class="cbrows" data-t="${t}">${entries.map((entry,i) => rowHtml(t,i,entry)).join("")}</div>${locked ? "" : `<button type="button" class="btn sm cbadd" data-t="${t}">+ ${bi("লাইন", "Line")}</button>`}</div>`;
    };
    body.innerHTML = `<div class="cb-workspace"><div class="cb-entry"><div class="card csec c-open"><div class="csh"><h3 id="cb-opening-label">${bi("শুরুর নগদ", "Opening cash")}</h3><div class="cbopening-controls">${po != null && !locked && admin ? `<button type="button" class="btn sm" id="cb-ounlock">✎ ${bi("বদলান", "Edit")}</button>` : ""}<input class="cell cbopen" id="cb-oc" aria-labelledby="cb-opening-label" value="${fmtIn(oc)}" inputmode="decimal" ${oLocked ? "disabled" : ""}></div></div></div>
      <div class="cb-entry-sides">${side("r", cbSideLabel("r"), "c-rec")}${side("p", cbSideLabel("p"), "c-pay")}</div>
      <div class="card csec"><div class="csh"><h3>${bi("খাত অনুযায়ী যোগফল (অটো গ্রুপ)", "Totals by category (auto-grouped)")}</h3></div><div id="cb-sum"></div></div>
      <div class="card csec c-close"><div class="csh"><h3>${bi("হিসাব মেলানো", "Balance")}</h3></div>
       <div class="crow hl"><label for="cb-ch">${bi("হাতে ক্যাশ", "Cash in hand")} <span class="mut xs">(${bi("গুনে লিখুন", "count and enter")})</span></label><input class="cell" id="cb-ch" value="${src?.cash_in_hand == null ? "" : fmtIn(src.cash_in_hand)}" inputmode="decimal" placeholder="${bi("হাতে নগদ", "cash in hand")}" ${dis}></div>
       <div class="crow"><label for="cb-rm">${bi("মন্তব্য", "Remarks")}</label><input class="cell t" id="cb-rm" value="${esc(src?.remarks || "")}" ${dis}></div></div>
      ${locked ? "" : `<div class="cbar entry-actions"><button class="btn lg fix" id="cb-draft">${ico("edit")} ${bi("ড্রাফট সেভ", "Save draft")}</button><button class="btn pri lg fix" id="cb-save">${ico("save")} <span class="bl">${bi("ফাইনাল সেভ", "Final save")}<small>${dmy(date)}</small></span></button><div class="hint" id="cb-err"></div><div class="sp"></div><span class="mut sm" id="cb-auto"></span></div>`}
      </div>
      <div class="cb-review">
        <section class="card flush cb-activity" aria-labelledby="cb-activity-title">
          <div class="ch cb-activity-head"><h3 id="cb-activity-title">${bi("দিনের ক্যাশ লেনদেন", "Cash Book activity")}</h3><time datetime="${date}">${dmy(date)}</time></div>
          <div class="cb-activity-body">
            <dl class="cb-activity-totals">
              <div class="cb-stat-wide"><dt>${bi("শুরুর নগদ", "Opening cash")}</dt><dd id="cb-x1" class="num"></dd></div>
            </dl>
            <div class="cb-activity-filters" role="group" aria-label="${bi("লেনদেনের ধরন", "Transaction type")}">
              ${["r", "p"].map(t => `<button type="button" class="btn sm" data-cb-side="${t}" aria-controls="cb-activity-lines" aria-pressed="false">${cbSideLabel(t)} <span class="cb-side-count"></span></button>`).join("")}
            </div>
            <ul id="cb-activity-lines" class="cb-activity-lines" aria-label="${bi("দিনের লেনদেন", "Daily transactions")}" tabindex="0"></ul>
            <p id="cb-activity-empty" class="mut sm" hidden></p>
            <dl class="cb-activity-totals">
              <div class="cb-stat-receipt"><dt>${bi("মোট প্রাপ্তি", "Total Receipt")}</dt><dd id="cb-x2" class="num"></dd></div>
              <div class="cb-stat-payment"><dt>${bi("মোট পরিশোধ", "Total Payment")}</dt><dd id="cb-x3" class="num"></dd></div>
              <div class="cb-stat-wide"><dt>${bi("মোট ব্যাংক ক্লোজিং", "Total Bank Closing")}</dt><dd id="cb-bank-total" class="num">—</dd></div>
              <div><dt>${bi("হাতে থাকার কথা", "Expected cash")}</dt><dd id="cb-x4" class="num"></dd></div>
              <div class="cb-stat-counted"><dt>${bi("হাতে ক্যাশ", "Cash in hand")}</dt><dd id="cb-counted" class="num"></dd></div>
              <div class="cb-stat-wide cb-stat-difference"><dt>${bi("পার্থক্য", "Difference")}</dt><dd id="cb-df" class="num">—</dd></div>
            </dl>
          </div>
        </section>
      <div class="card csec cb-references"><div class="csh"><h3>${bi("দৈনিক রেজিস্টার", "Daily register")}</h3>
        ${final ? `<button type="button" id="cb-register" class="btn sm">${ico("book")} ${bi("দেখুন / Export", "View / Export")}</button>` : ""}</div>
        <div id="cb-refs" role="status"></div></div>
      </div></div>`;
    const refs = $("#cb-refs", body), bankTotal = $("#cb-bank-total", body);
    const showRefs = (snapshot, error = false) => {
      bankTotal.textContent = snapshot?.bank == null ? "—" : "৳ " + money(snapshot.bank);
      refs.innerHTML = cbRegisterReferences(snapshot).slice(1).map(([label, value]) => `<div class="cb-reg-total"><span>${esc(label)}</span><b>${cbRegisterMoney(value)}</b></div>`).join("")
        + `<small class="mut">${error ? bi("সারাংশ আনা যায়নি। ফাইনাল সেভে আবার চেষ্টা হবে।", "Reference totals unavailable. Final save will retry.") : final
          ? snapshot ? bi("ফাইনাল সেভের সারাংশ", "Saved final summary") + " · " + cbRegisterDate(snapshot.at) : bi("এই পুরনো রেকর্ডে সংরক্ষিত সারাংশ নেই", "This older record has no saved reference totals")
          : bi("বর্তমান সারাংশ। ফাইনাল সেভের সময় সংরক্ষিত হবে।", "Current reference totals. Captured on final save.")}</small>`;
    };
    if (final) {
      showRefs(ex.lines?.register);
      $("#cb-register", body).onclick = () => cbRegisterModal(ex);
    } else {
      refs.textContent = bi("সারাংশ আনা হচ্ছে…", "Loading reference totals…");
      cbRegisterSummary(date).then(summary => showRefs(summary), () => showRefs(null, true));
    }
    const guessRow = (r, keepAccount = false) => {
      const mapped = cbGuess($(".cbname",r).value,r.dataset.t), ac = $(".cbac",r);
      const previous = keepAccount && r.dataset.category === mapped?.k ? ac.value : "";
      r.dataset.category = mapped?.k || "";
      ac.value = mapped?.c || previous;
      ac.hidden = !CB_BANK.includes(r.dataset.category);
    };
    const collect = (draft = false) => {
      const out = { r: [], p: [] }; let bad = null, noName = 0, noCat = 0, noAc = 0, noAmount = 0;
      ["r", "p"].forEach(t => $$(`.cbr[data-t="${t}"]`, body).forEach((r, i) => {
        const n = $(".cbname", r).value.trim(), x = $(".cbamt2", r).value.trim(), a = evalAmt(x), nan = isNaN(a), cat = r.dataset.category, ac = $(".cbac", r).value;
        const ref = $(".cbref", r).value.trim(), note = $(".cbnote", r).value.trim();
        r.classList.toggle("cb-occupied", !!(n || x || ref || note));
        r.classList.toggle("err", nan); $(".cbi", r).textContent = i + 1; $(".cbamt2", r).classList.toggle("chg", !!a && !nan);
        $(".cbval", r).textContent = /[+-]/.test(x.replace(/^[-+]/, "")) && !nan ? "= " + money0(a) : "";
        $(".cbac", r).hidden = !CB_BANK.includes(cat); $(".cbac", r).classList.toggle("unk", CB_BANK.includes(cat) && !!a && !ac);
        if (nan) { bad ||= cbSideLabel(t) + " #" + (i + 1); return; }
        if (!a) {
          if (n || ref || note) noAmount++;
          if (!draft || !(n || ref || note)) return;
        } else { if (!n) noName++; if (!cat) noCat++; if (CB_BANK.includes(cat) && !ac) noAc++; }
        out[t].push({ n, a, ...(ref ? { ref } : {}), ...(note ? { note } : {}), ...(/[+-]/.test(x.replace(/^[-+]/, "")) ? { x } : {}), ...(cat ? { k: cat } : {}), ...(CB_BANK.includes(cat) && ac ? { c: ac } : {}) });
      }));
      const oc = num($("#cb-oc", body).value), chv = $("#cb-ch", body).value.trim(), R = out.r.reduce((s, l) => s + l.a, 0), P = out.p.reduce((s, l) => s + l.a, 0);
      return { bad, noName, noCat, noAc, noAmount, row: { date, opening_cash: oc, lines: out, total_receipt: R, total_payment: P, cash_in_hand: chv === "" ? null : num(chv), remarks: $("#cb-rm", body).value.trim() || null } };
    };
    const activityButtons = $$("[data-cb-side]", body), activityList = $("#cb-activity-lines", body), activityEmpty = $("#cb-activity-empty", body);
    const amountLabel = amount => amount == null ? "—" : "৳ " + money(amount);
    let previewLines, shownLines = "";
    const showActivity = () => {
      for (const button of activityButtons) {
        const side = button.dataset.cbSide;
        button.setAttribute("aria-pressed", String(side === activitySide));
        $(".cb-side-count", button).textContent = previewLines[side].length;
      }
      const entries = previewLines[activitySide];
      const html = entries.map(({n, a, ref, c, note}) => `<li><div><strong>${esc(n || bi("বিবরণ বাকি", "Particulars needed"))}</strong>
        ${ref || c ? `<small>${[ref && cbVoucherLabel(activitySide) + " " + ref, c].filter(Boolean).map(esc).join(" · ")}</small>` : ""}
        ${note ? `<small class="cb-narr">${esc(note)}</small>` : ""}</div><b class="num">${amountLabel(a)}</b></li>`).join("");
      if (shownLines !== html) activityList.innerHTML = shownLines = html;
      activityList.hidden = !entries.length;
      activityEmpty.hidden = !!entries.length;
      activityEmpty.textContent = activitySide === "r" ? bi("দেখানোর মতো কোনো প্রাপ্তি নেই।", "No receipt entries to show.") : bi("দেখানোর মতো কোনো পরিশোধ নেই।", "No payment entries to show.");
    };
    activityButtons.forEach(button => button.onclick = () => {
      activitySide = button.dataset.cbSide;
      showActivity();
      activityList.scrollTop = 0;
    });
    const calc = () => {
      const { row: r } = collect(), exp = r.opening_cash + r.total_receipt - r.total_payment;
      previewLines = r.lines;
      showActivity();
      $("#cb-Tr", body).textContent = money(r.total_receipt); $("#cb-Tp", body).textContent = money(r.total_payment);
      $("#cb-x1", body).textContent = amountLabel(r.opening_cash); $("#cb-x2", body).textContent = amountLabel(r.total_receipt); $("#cb-x3", body).textContent = amountLabel(r.total_payment); $("#cb-x4", body).textContent = amountLabel(exp);
      $("#cb-counted", body).textContent = amountLabel(r.cash_in_hand);
      const df = $("#cb-df", body); if (r.cash_in_hand == null) { df.textContent = "—"; df.className = "num"; } else { const d = r.cash_in_hand - exp; df.textContent = Math.abs(d) < 0.5 ? "✔ " + bi("মিলেছে", "matches") : cbSigned(d); df.className = "num b " + (Math.abs(d) < 0.5 ? "gr" : "rd"); }
      const g = cbGroup({ lines: r.lines }), sum = $("#cb-sum", body), chip = (k, a) => `<div class="cbs ${CB_BANK.includes(k) ? "memo" : ""}"><span>${esc(cbCatName(k))}</span><b class="num">${money0(a)}</b></div>`;
      const mk = t => CB_CAT[t].filter(k => g.items[k]?.a).map(k => chip(k, g.items[k].a)).join("") || `<span class="mut sm">—</span>`;
      sum.innerHTML = `<div class="cbsg"><div><h4 class="gr">${cbSideLabel("r")}</h4>${mk("r")}</div><div><h4 class="rd">${cbSideLabel("p")}</h4>${mk("p")}</div></div>` +
        (g.warn.un ? `<div class="alert am" style="margin-top:10px">⚠ ${bi(`${g.warn.un}টি লাইনের খাত মেলেনি। Cash Checker-এ Others ধরা হবে।`, `${g.warn.un} line(s) have no matching group. Cash Checker will count them as Others.`)}</div>` : "") +
        (g.warn.noAc ? `<div class="alert rd" style="margin-top:10px">${bi(`${g.warn.noAc}টি Bank লাইনে A/C বাছুন`, `Select an A/C on ${g.warn.noAc} Bank line(s)`)}</div>` : "");
      return r;
    };
    const autosave = () => {
      if (locked || saving || final) return;
      clearTimeout(autoT);
      const { row, bad } = collect(true), enteredBy = S.me.name;
      pendingDraft = () => {
        if (bad) return;
        try {
          localStorage.setItem(CB_DRAFT(date), JSON.stringify({ ...row, status: "draft", entered_by: enteredBy, updated_at: new Date().toISOString() }));
          const label = $("#cb-auto", body);
          if (label) label.textContent = bi("✓ এই ডিভাইসে অটো-সেভ হয়েছে", "✓ Auto-saved on this device");
        } catch {
          const label = $("#cb-auto", body);
          if (label) label.textContent = bi("ডিভাইসে ড্রাফট সেভ হয়নি", "Device draft could not be saved");
        }
      };
      autoT = setTimeout(flushDraft, 700);
    };
    const addLedger = async (r, name) => {
      const t = r.dataset.t, k = r.dataset.category, c = $(".cbac", r).value;
      try { const row = await API.cbLedgerSave({ name, kind: t, ...(t === "r" ? { cat_r: k } : { cat_p: k }), bank_code: CB_BANK.includes(k) ? c : "" }); CBLED.list.push(row); CBLED.byNorm.set(cbNorm(name), row); toast(bi("✔ লেজার তালিকায় যোগ হয়েছে: ", "✔ Added to the ledger list: ") + name); }
      catch (e) { toast(/duplicate|unique/i.test(e.message || "") ? bi("এই নামে লেজার আগেই আছে", "A ledger with this name already exists") : /relation|does not exist|schema cache/i.test(e.message || "") ? bi("লেজার টেবিল নেই — schema_v6.sql-এর v6.77 অংশ চালাতে হবে", "Ledger table is missing — run the v6.77 part of schema_v6.sql") : e.message || String(e), "err"); }
    };
    const bindRow = r => {
      if (locked) return; const t = r.dataset.t, nm = $(".cbname", r);
      suggest(nm, () => {
        const arr = cbLedItems(t), q = nm.value.trim();
        if (q && moduleCan("cash","entry") && CBLED && !CBLED.err && !arr.some(x => cbNorm(x.value) === cbNorm(q))) arr.push({ value: q, label: "", sub: "", last: true, add: true, html: `<span class="sgn"><b>＋ ${esc(q)}</b><em>${bi("লেজার তালিকায় নতুন যোগ করুন", "Add to the ledger list as new")}</em></span>` });
        return arr;
      }, it => {
        if (!it) return;
        delete r.dataset.storedCategory;
        guessRow(r); calc(); autosave();
        if (it.add) addLedger(r,it.value);
      }, { free: true, max: 30 });
      nm.addEventListener("picked", () => $(".cbamt2", r).focus());
    };
    const addRow = t => {
      const box = $(`.cbrows[data-t="${t}"]`,body);
      box.insertAdjacentHTML("beforeend",rowHtml(t,box.children.length));
      bindRow(box.lastElementChild);
      return box.lastElementChild;
    };
    body.oninput = e => {
      const row = e.target.closest(".cbr");
      if (row) activitySide = row.dataset.t;
      if (e.target.classList.contains("cbname")) {
        delete row.dataset.storedCategory;
        guessRow(row);
      }
      calc(); autosave();
    };
    body.onchange = e => {
      if (!e.target.classList.contains("cbac")) return;
      const r = e.target.closest(".cbr"), name = cbNorm($(".cbname",r).value), k = r.dataset.category;
      if (name && k && CBL) CBL[r.dataset.t].set(name,{k,c:e.target.value});
      calc(); autosave();
    };
    body.onfocusin = e => { if (e.target.matches("input.cell") && !e.target.matches(".cbname")) e.target.select(); };
    focusout = e => { const i = e.target; if (i.classList?.contains("cbamt2") || i.id === "cb-oc" || i.id === "cb-ch") { if (/[+-]/.test(i.value.replace(/^[-+]/, ""))) return; if (i.value.trim() !== "" && !isNaN(evalAmt(i.value))) i.value = fmtIn(evalAmt(i.value)); calc(); } };
    body.addEventListener("focusout", focusout);
    const goNext = r => {
      const next = r.nextElementSibling || addRow(r.dataset.t);
      $(".cbname",next).focus();
    };
    body.onkeydown = e => {
      if (e.key !== "Enter" || e.defaultPrevented || e.isComposing || e.repeat) return;
      const r = e.target.closest?.(".cbr");
      if (r && e.target.classList.contains("cbname")) {
        e.preventDefault();
        if (e.target.value.trim()) $(".cbamt2",r).focus();
        return;
      }
      if (r && e.target.classList.contains("cbamt2")) {
        e.preventDefault();
        if (!$(".cbname",r).value.trim()) $(".cbname",r).focus();
        else if (evalAmt(e.target.value)) $(".cbref",r).focus();
        return;
      }
      if (r && e.target.classList.contains("cbref")) {
        e.preventDefault();
        if (!$(".cbname",r).value.trim()) return $(".cbname",r).focus();
        if (!evalAmt($(".cbamt2",r).value)) return $(".cbamt2",r).focus();
        const account = $(".cbac",r);
        if (!account.hidden && !account.value) account.focus();
        else goNext(r);
        return;
      }
      if (r && e.target.classList.contains("cbac") && e.target.value) {
        e.preventDefault(); goNext(r); return;
      }
      if (e.target.id === "cb-oc") { e.preventDefault(); $(".cbname", body)?.focus(); } else if (e.target.id === "cb-ch") { e.preventDefault(); $("#cb-save", body)?.focus(); }
    };
    body.onclick = e => {
      if (locked) return;
      const add = e.target.closest(".cbadd"); if (add) { $(".cbname", addRow(add.dataset.t)).focus(); return; }
      const rm = e.target.closest(".cbx2"); if (rm) { const r = rm.closest(".cbr"), t = r.dataset.t; r.remove(); if (!$(`.cbr[data-t="${t}"]`, body)) addRow(t); calc(); autosave(); }
    };
    const ou = $("#cb-ounlock", body); if (ou) ou.onclick = () => { if (!ask(bi("Opening আগের দিনের হাতে ক্যাশ থেকে নিজে আসে। তবুও হাতে বদলাবেন?", "Opening carries over automatically from the previous day's cash. Edit it manually anyway?"))) return; $("#cb-oc", body).disabled = false; ou.remove(); $("#cb-oc", body).focus(); };
    const pdb = $("#cb-pd", v); if (pdb) pdb.onclick = () => { $("#cb-d", v).value = pend.date; draw(); };
    $$(".cbr", body).forEach(bindRow); calc(); if (locked) return;
    const ledBtn = $("#cb-led", v);
    if (ledBtn) ledBtn.onclick = () => cbLedgerModal(() => {
      if (id !== drawId || !body.isConnected) return;
      $$(".cbr:not([data-stored-category])",body).forEach(row => guessRow(row,true));
      calc(); autosave();
    });
    if (matchMedia("(pointer:fine)").matches) { const f = $$('.cbr[data-t="r"] .cbname', body).find(i => !i.value) || $(".cbname", body); f && f.focus(); }
    const save = async status => {
      if (saving || id !== drawId || $("#cb-d", v).value !== date) return;
      const { row, bad, noName, noCat, noAc, noAmount } = collect(status === "draft"), err = $("#cb-err", body); err.className = "hint rd"; err.textContent = "";
      if (bad) { err.textContent = bi(`ভুল অঙ্ক: ${bad} — শুধু সংখ্যা আর + / − লিখুন`, `Invalid amount: ${bad} — only numbers and + / −`); return; }
      if (status === "final") {
        if (noAmount) { err.textContent = bi("বিবরণ, রিসিট, ভাউচার বা নোট দেওয়া লাইনের টাকা লিখুন।", "Enter an amount for each line with particulars, a reference or a note."); return; }
        if (noName) { err.textContent = bi(`${noName}টি লাইনে বিবরণ (নাম) নেই`, `${noName} line(s) have no particulars`); return; }
        if (noAc) { err.textContent = bi(`${noAc}টি Bank লাইনে A/C বাছুন`, `Select an A/C on ${noAc} Bank line(s)`); return; }
        if (row.cash_in_hand == null) { err.textContent = bi("হাতে ক্যাশ লিখুন (গুনে)", "Enter the counted cash in hand"); $("#cb-ch", body).focus(); return; }
        const exp = row.opening_cash + row.total_receipt - row.total_payment, d = row.cash_in_hand - exp;
        if (Math.abs(d) > 0.5 && !ask(bi(`হিসাব মেলেনি!\nOpening ${money0(row.opening_cash)} + Receipt ${money0(row.total_receipt)} − Payment ${money0(row.total_payment)} = ${money0(exp)}\nহাতে ক্যাশ লেখা ${money0(row.cash_in_hand)} → পার্থক্য ${cbSigned(d)}\n\nতবুও ফাইনাল সেভ করবেন?`, `Does not tally!\nOpening ${money0(row.opening_cash)} + Receipt ${money0(row.total_receipt)} − Payment ${money0(row.total_payment)} = ${money0(exp)}\nCash in hand entered ${money0(row.cash_in_hand)} → difference ${cbSigned(d)}\n\nSave as final anyway?`))) return;
        if (noCat && !ask(bi(`${noCat}টি লাইনের খাত মেলেনি — Cash Checker-এ Others ধরা হবে। তবুও সেভ করবেন?`, `${noCat} line(s) have no category — the Cash Checker will count them as Others. Save anyway?`))) return;
        if (!ask(bi(`${dmy(date)} — ক্যাশ খাতা ফাইনাল সেভ\nReceipt ৳ ${money0(row.total_receipt)} · Payment ৳ ${money0(row.total_payment)}\nহাতে ক্যাশ ৳ ${money0(row.cash_in_hand)}${!moduleCan("cash", "edit", false) ? "\n\nফাইনাল সেভের পর সম্পাদনার অনুমতি লাগবে।" : ""}`, `${dmy(date)} — Cash Book final save\nReceipt ৳ ${money0(row.total_receipt)} · Payment ৳ ${money0(row.total_payment)}\nCash in hand ৳ ${money0(row.cash_in_hand)}${!moduleCan("cash", "edit", false) ? "\n\nEditing after final save requires Edit access." : ""}`))) return;
      }
      const buttons = $$("#cb-save, #cb-draft", body);
      flushDraft();
      saving = true;
      buttons.forEach(b => b.disabled = true);
      try {
        if (status === "final") {
          try { row.lines.register = ex?.lines?.register || await cbRegisterSummary(date); }
          catch (e) { throw new Error(bi("Collection বা Bank Closing-এর সারাংশ যাচাই করা যায়নি। আবার চেষ্টা করুন।", "Could not verify the Collection or Bank Closing summary. Try again."), { cause: e }); }
        }
        await API.cbSave({ ...row, status }); localStorage.removeItem(CB_DRAFT(date)); cbLearn(true);
        if (status === "final") { S.lastBook = await API.lastBookDate().catch(() => date); refreshBadges(); toast(bi("✔ ক্যাশ খাতা ফাইনাল সেভ হয়েছে", "✔ Cash Book saved as final")); } else toast(bi("✔ ড্রাফট সেভ হয়েছে", "✔ Draft saved"));
      } catch (e) {
        toast(e.message || String(e), "err");
        return;
      } finally {
        saving = false;
        buttons.forEach(b => b.disabled = final && b.id === "cb-draft");
        if (body.isConnected && $("#cb-d", v)?.value !== date) draw();
      }
      if (body.isConnected && id === drawId) await draw();
    };
    $("#cb-draft", body).disabled = final;
    $("#cb-draft", body).onclick = () => save("draft"); $("#cb-save", body).onclick = () => save("final");
  }
  bindDateNav(v, "cb", draw); await draw(); return () => { ++drawId; flushDraft(); };
}

/* ---------- ledger list manager (v6.77) ---------- */
function cbLedgerModal(after, {mappingOnly = false} = {}) {
  const admin = S.me.role === "admin";
  const canAdd = !mappingOnly || moduleCan("cash","entry"), canEdit = !mappingOnly || moduleCan("cash","edit");
  const title = mappingOnly ? bi("লেজার খাত নির্ধারণ", "Ledger → Purpose/Group") : bi("লেজার তালিকা", "Ledger list");
  modal(`<h2>📒 ${title}</h2>
   ${mappingOnly ? `<p class="mut sm">${bi("Tally voucher ও নতুন Cash Book এন্ট্রির Receipt এবং Payment খাত নির্ধারণ করুন। কোনো খাতে একটিমাত্র সক্রিয় লেজার ম্যাপ করা থাকলে Cash Checker-এর খাতের মোটে সেই নাম দেখা যাবে।","Set receipt and payment groups for Tally vouchers and future Cash Book entries. Cash Checker category totals show a ledger label where one active ledger is mapped.")}</p>` : ""}
   <div id="lg-err" aria-live="polite"></div>
   ${mappingOnly && canEdit ? `<fieldset class="cblg-group-editor" id="lg-head-editor" hidden disabled>
     <legend>${bi("খাতের নাম", "Purpose / Group name")}</legend>
     <div class="cblg-filters-map"><label class="f">${bi("খাত", "Group")}<select class="in" id="lg-head"></select></label>
     <label class="f">${bi("প্রদর্শিত নাম", "Display name")}<input class="in" id="lg-head-name" maxlength="120" autocomplete="off"></label></div>
   </fieldset>` : ""}
   ${canAdd ? `<div class="cblg-new"><input class="in" id="lg-n" placeholder="${bi("নতুন লেজারের নাম", "New ledger name")}" autocomplete="off"><select class="in" id="lg-r">${cbLgOpts("r")}</select><select class="in" id="lg-p">${cbLgOpts("p")}</select><button class="btn pri" id="lg-add">${ico("plus")} ${bi("যোগ", "Add")}</button></div>` : ""}
   <div class="cblg-filters${mappingOnly ? " cblg-filters-map" : ""}">
     <div>${mappingOnly ? `<label class="f" for="lg-q">${bi("লেজার খুঁজুন", "Search ledgers")}</label>` : ""}<input class="in" id="lg-q" type="search" placeholder="${bi("খুঁজুন…", "Search…")}" autocomplete="off"></div>
     ${mappingOnly ? `<div><label class="f" for="lg-group">${bi("খাত", "Purpose / Group")}</label><select class="in" id="lg-group">
       <option value="">${bi("সব খাত", "All groups")}</option>
       ${[["r", "Receipt"], ["p", "Payment"]].map(([side, label]) => `<optgroup label="${label}">${CB_CAT[side].map(k => `<option value="${side}:${k}">${esc(cbCatName(k))}</option>`).join("")}</optgroup>`).join("")}
       <option value="unmapped">${bi("খাত নির্ধারিত নয়", "Unmapped")}</option>
     </select></div>` : ""}
   </div>
   <div class="cblg-h ${mappingOnly ? "cblg-map" : ""}"><span>${bi("লেজার", "Ledger")}</span><span>Receipt ${bi("খাত", "group")}</span><span>Payment ${bi("খাত", "group")}</span>${mappingOnly ? `<span>${bi("স্ট্যাটাস ও অ্যাকশন", "Status & actions")}</span>` : "<span>Bank A/C</span><span></span>"}</div>
   <div class="mut sm" id="lg-c"></div><div class="cblg" id="lg-l"></div>
   ${mappingOnly ? `<div class="modal-actions"><span id="lg-status" class="mut sm" role="status"></span><button type="button" class="btn" id="lg-close">${bi("বন্ধ", "Close")}</button>${canEdit ? `<button type="button" class="btn" id="lg-edit" disabled>${ico("edit")} ${bi("এডিট", "Edit")}</button><button type="button" class="btn pri" id="lg-save" disabled>${ico("save")} ${bi("সেভ", "Save")}</button>` : ""}</div>` : ""}`, async (root, close) => {
    const panel = $(".modal", root), g = id => $("#" + id, panel);
    panel.classList.add("wide");
    if (mappingOnly) g("lg-close").onclick = close;
    const [, namesReady] = await Promise.all([cbLedLoad(true), mappingOnly ? cashGroupLoad() : true]);
    if (!panel.isConnected) return;
    let changed = false, editing = false, saving = false;
    const deleting = new Set();
    const mappings = new Map(), names = new Map();
    const headEditor = g("lg-head-editor"), head = g("lg-head"), headName = g("lg-head-name");
    const status = g("lg-status"), saveButton = g("lg-save"), editButton = g("lg-edit");
    const controls = () => {
      if (!editButton) return;
      editButton.disabled = editing || saving || !!CBLED.err;
      saveButton.disabled = saving || deleting.size > 0 || (!mappings.size && !names.size);
      g("lg-close").disabled = saving;
      if (g("lg-add")) g("lg-add").disabled = saving;
      headEditor.disabled = saving || !namesReady;
    };
    const refreshHeads = () => {
      if (!head) return;
      const selected = head.value;
      head.innerHTML = [["r", "Receipt"], ["p", "Payment"]].map(([side, label]) => `<optgroup label="${label}">${CB_CAT[side].map(key => `<option value="${key}">${esc(cbCatName(key))}</option>`).join("")}</optgroup>`).join("");
      if (selected) head.value = selected;
      headName.value = names.get(head.value) ?? cashHead(head.value, cashGroupDefaults.get(head.value));
    };
    const notify = () => { changed = true; if (mappingOnly) after?.(); };
    if (CBLED.err) g("lg-err").innerHTML = `<div class="alert rd">${/relation|does not exist|schema cache|not find/i.test(CBLED.err.message || "") ? bi("লেজার টেবিল নেই — Supabase-এ schema_v6.sql-এর v6.77 অংশ চালাতে হবে", "Ledger table is missing — run the v6.77 part of schema_v6.sql in Supabase") : esc(CBLED.err.message || "")}</div>`;
    const acOpts = c => `<option value="">—</option>` + (S.accounts || []).map(a => `<option value="${esc(a.code)}" ${a.code === c ? "selected" : ""}>${esc(a.code)} · ${esc(a.holder || "")}</option>`).join("");
    const group = g("lg-group");
    const refreshGroups = () => {
      if (!group) return;
      for (const option of group.options) {
        const key = option.value.split(":")[1];
        if (key) option.textContent = cbCatName(key);
      }
      for (const side of ["r", "p"]) {
        const select = g("lg-" + side);
        if (select) select.innerHTML = cbLgOpts(side, select.value);
      }
    };
    if (mappingOnly && !CBLED.err) after?.();
    function mappingActions(ledger) {
      const pending = mappings.get(ledger.id)?.active;
      const active = pending ?? (ledger.active !== false);
      const state = active ? bi("সক্রিয়", "Active") : bi("নিষ্ক্রিয়", "Inactive");
      const action = active ? bi("নিষ্ক্রিয় করুন", "Disable") : bi("সক্রিয় করুন", "Activate");
      const busy = saving || deleting.has(ledger.id) ? "disabled" : "";
      return `<div class="cblg-actions">
        <span class="tag ${active ? "au-insert" : "au-delete"}">${state}${pending !== undefined ? ` · ${bi("সেভ হয়নি", "Unsaved")}` : ""}</span>
        ${canEdit ? `<button type="button" class="btn sm lg-toggle" aria-label="${esc(action + " · " + ledger.name)}" ${busy}>${action}</button>` : ""}
        ${admin ? `<button type="button" class="btn sm ld" aria-label="${esc(bi("মুছুন", "Delete") + " · " + ledger.name)}" ${busy}>${bi("মুছুন", "Delete")}</button>` : ""}
      </div>`;
    }
    const draw = () => {
      const q = norm(g("lg-q").value), selected = group?.value || "";
      const [side, category] = selected.split(":");
      const matches = CBLED.list.filter(m => {
        if (q && !norm(m.name).includes(q)) return false;
        if (selected === "unmapped") return !cbLedCat(m, "r") && !cbLedCat(m, "p");
        return !selected || cbLedCat(m, side) === category;
      });
      const shown = matches.slice(0, 150);
      const selectable = canEdit && (!mappingOnly || (editing && !saving));
      g("lg-c").textContent = bi(`${CBLED.list.length}টি লেজার · দেখানো হচ্ছে ${shown.length}`, `${CBLED.list.length} ledgers · showing ${shown.length}`);
      g("lg-l").innerHTML = shown.map(m => `<div class="cblg-r ${mappingOnly ? "cblg-map" : ""} ${!mappingOnly && m.active === false ? "off" : ""}" data-id="${m.id}">
        <span class="nm" title="${esc(m.name)}">${mappingOnly ? esc(m.name) : `<input class="cell ln" value="${esc(m.name)}">`}</span>
        <select class="in lr" aria-label="${esc(m.name)} · Receipt group" ${selectable ? "" : "disabled"}>${cbLgOpts("r", cbLedCat({ ...m, ...mappings.get(m.id) }, "r"))}</select>
        <select class="in lp" aria-label="${esc(m.name)} · Payment group" ${selectable ? "" : "disabled"}>${cbLgOpts("p", cbLedCat({ ...m, ...mappings.get(m.id) }, "p"))}</select>
        ${mappingOnly ? mappingActions(m) : `<select class="in la">${acOpts(m.bank_code)}</select><span class="act"><label class="chk" title="${bi("চালু","Active")}"><input type="checkbox" class="lo" ${m.active === false ? "" : "checked"}></label>${admin ? `<button type="button" class="cbx2 ld" title="${bi("মুছুন","Delete")}">×</button>` : ""}</span>`}
      </div>`).join("") || `<div class="empty">${bi("কোনো লেজার মেলেনি", "No ledgers match")}</div>`;
    };
    const save = async (el, patch) => {
      const m = CBLED.list.find(x => x.id === +el.closest(".cblg-r").dataset.id); if (!m) return;
      if (!canEdit) return;
      const parent = el.closest(".cblg-r");
      el.disabled = true;
      try {
        const row = await API.cbLedgerSave({...m, ...patch});
        Object.assign(m, row);
        CBLED.byNorm = new Map(CBLED.list.map(x => [cbNorm(x.name), x]));
        notify();
        parent.classList.toggle("off", m.active === false);
      } catch (e) {
        toast(/duplicate|unique/i.test(e.message || "") ? bi("এই নামে লেজার আগেই আছে","A ledger with this name already exists") : e.message || String(e), "err");
        draw();
      } finally { el.disabled = false; }
    };
    function stage(ledger, field, value) {
      const draft = { ...mappings.get(ledger.id) };
      const original = field === "active" ? ledger.active !== false : ledger[field] || null;
      if (value === original) delete draft[field];
      else draft[field] = value;
      if (Object.keys(draft).length) mappings.set(ledger.id, draft);
      else mappings.delete(ledger.id);
      controls();
    }
    if (editButton) {
      editButton.onclick = () => {
        editing = true;
        headEditor.hidden = false;
        refreshHeads();
        status.textContent = namesReady
          ? bi("নাম বা ম্যাপিং বদলে সেভ করুন।", "Change group names or mappings, then select Save.")
          : bi("খাতের নাম পরিবর্তনের জন্য ডাটাবেস সেটআপ প্রয়োজন।", "Group name editing requires the database setup.");
        controls();
        draw();
      };
      head.onchange = refreshHeads;
      headName.oninput = () => {
        const key = head.value, label = headName.value.trim();
        const original = cashHead(key, cashGroupDefaults.get(key));
        if (label === original) names.delete(key);
        else names.set(key, label);
        controls();
      };
      saveButton.onclick = async () => {
        if (saving || deleting.size) return;
        if ([...names.values()].some(label => !label)) {
          status.textContent = bi("খাতের নাম খালি রাখা যাবে না।", "Enter a display name for every edited group.");
          return;
        }
        saving = true;
        controls();
        draw();
        let saved = false;
        try {
          if (names.size) {
            await API.cashGroupSave([...names].map(([group_key, label]) => ({ group_key, label })));
            ++cashGroupRead;
            names.forEach((label, key) => cashGroupNames.set(key, label));
            names.clear();
            saved = true;
          }
          for (const [id, patch] of mappings) {
            const ledger = CBLED.list.find(row => row.id === id);
            const row = await API.cbLedgerGroupSave(id, patch);
            Object.assign(ledger, row);
            mappings.delete(id);
            saved = true;
          }
          editing = false;
          headEditor.hidden = true;
          status.textContent = bi("পরিবর্তন সেভ হয়েছে।", "Changes saved.");
        } catch (error) {
          status.textContent = (saved ? bi("কিছু পরিবর্তন সেভ হয়েছে। ", "Some changes were saved. ") : "") + (error.message || String(error));
        } finally {
          saving = false;
          if (saved) notify();
          if (panel.isConnected) {
            refreshHeads();
            refreshGroups();
            controls();
            draw();
          }
        }
      };
    }
    g("lg-q").oninput = draw;
    if (group) group.onchange = draw;
    g("lg-l").onchange = e => {
      const t = e.target;
      if (mappingOnly) {
        if (!editing || saving || !canEdit) return;
        const field = t.classList.contains("lr") ? "cat_r" : t.classList.contains("lp") ? "cat_p" : null;
        if (!field) return;
        const id = Number(t.closest(".cblg-r").dataset.id), ledger = CBLED.list.find(row => row.id === id);
        if (ledger && !deleting.has(id)) stage(ledger, field, t.value || null);
      } else if (t.classList.contains("ln")) {
        const name = t.value.trim(); if (!name) return draw();
        save(t, { name });
      } else if (t.classList.contains("lr")) save(t, { cat_r: t.value || null });
      else if (t.classList.contains("lp")) save(t, { cat_p: t.value || null });
      else if (t.classList.contains("la")) save(t, { bank_code: t.value || null });
      else if (t.classList.contains("lo")) save(t, { active: t.checked });
    };
    g("lg-l").onclick = async e => {
      const button = e.target.closest(".ld, .lg-toggle");
      if (!button || saving) return;
      const id = Number(button.closest(".cblg-r").dataset.id);
      const ledger = CBLED.list.find(row => row.id === id);
      if (!ledger || deleting.has(id)) return;
      if (button.classList.contains("lg-toggle")) {
        if (!mappingOnly || !canEdit) return;
        const active = mappings.get(id)?.active ?? (ledger.active !== false);
        stage(ledger, "active", !active);
        status.textContent = bi("স্ট্যাটাস পরিবর্তন কার্যকর করতে সেভ করুন।", "Select Save to apply the status change.");
        draw();
        $(`.cblg-r[data-id="${id}"] .lg-toggle`, panel)?.focus({ preventScroll: true });
        return;
      }
      if (!admin || !ask(bi(
        `"${ledger.name}" লেজার স্থায়ীভাবে মুছবেন? এর Tally গ্রুপ ম্যাপিং সরবে। ভাউচার এবং Cash Book এন্ট্রি থাকবে।`,
        `Permanently delete "${ledger.name}"? Its Tally group mapping will be removed. Voucher and Cash Book entries will be kept.`
      ))) return;
      deleting.add(id);
      controls();
      draw();
      try {
        await API.cbLedgerDel(id);
        CBLED.list = CBLED.list.filter(row => row.id !== id);
        CBLED.byNorm.delete(cbNorm(ledger.name));
        mappings.delete(id);
        notify();
        if (status) status.textContent = bi("লেজার মুছে ফেলা হয়েছে।", "Ledger deleted.");
      } catch (error) {
        toast(esc(error.message || String(error)), "err");
      } finally {
        deleting.delete(id);
        if (panel.isConnected) {
          controls();
          draw();
        }
      }
    };
    if (canAdd) g("lg-add").onclick = async () => {
      if (saving) return;
      const name = g("lg-n").value.trim(); if (!name) return g("lg-n").focus(), toast(bi("লেজারের নাম লিখুন", "Enter the ledger name"), "err");
      const cr = g("lg-r").value, cp = g("lg-p").value;
      try { const row = await API.cbLedgerSave({ name, kind: cr && !cp ? "r" : cp && !cr ? "p" : "both", cat_r: cr, cat_p: cp }); CBLED.list.push(row); CBLED.list.sort((a, b) => a.name.localeCompare(b.name)); CBLED.byNorm.set(cbNorm(name), row); notify(); g("lg-n").value = ""; g("lg-q").value = ""; draw(); g("lg-n").focus(); }
      catch (e) { toast(/duplicate|unique/i.test(e.message || "") ? bi("এই নামে লেজার আগেই আছে", "A ledger with this name already exists") : e.message || String(e), "err"); }
    };
    if (canAdd) g("lg-n").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); g("lg-add").click(); } };
    if (mappingOnly) {
      refreshGroups();
      controls();
      draw();
      return;
    }
    const done = () => { close(); changed && !mappingOnly && after?.(); };
    const bk = $(".mback", root); bk.addEventListener("mousedown", e => { if (e.target === bk && changed && !mappingOnly) after?.(); });
    root.addEventListener("keydown", e => { if (e.key === "Escape") done(); });
    draw();
  });
}
const cbLgOpts = (t, sel) => `<option value="">${bi("— খাত নেই —", "— none —")}</option>` + CB_CAT[t].map(k => `<option value="${k}" ${k === sel ? "selected" : ""}>${esc(cbCatName(k))}</option>`).join("");
