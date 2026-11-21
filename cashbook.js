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

/* ---------- Cash Checker: problems & differences ---------- */
function cbChecksHtml(L) {
  const n = lv => L.filter(x => x.lv === lv).length, e = n("err"), w = n("warn");
  const ord = { err: 0, warn: 1, info: 2, ok: 3 }, ic = { err: "✖", warn: "⚠", info: "ℹ", ok: "✔" };
  return `<div class="cbchk-h"><b>🔎 ${bi("ক্যাশ চেকার — সমস্যা ও পার্থক্য", "Cash Checker — problems & differences")}</b><span class="cbchip ${e ? "err" : w ? "warn" : "ok"}">${e ? `${e} ${bi("সমস্যা", "problem(s)")}` : w ? `${w} ${bi("সতর্কতা", "warning(s)")}` : bi("তথ্য", "Info")}</span>${e && w ? `<span class="cbchip warn">${w} ${bi("সতর্কতা", "warning(s)")}</span>` : ""}</div><ul class="cbchk-l">${[...L].sort((a, b) => ord[a.lv] - ord[b.lv]).map(x => `<li class="${x.lv}"><i>${ic[x.lv]}</i><span>${esc(x.t)}</span></li>`).join("")}</ul>`;
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
  const groups = cbGroup(book).items;
  const grouped = side => CB_CAT[side].filter(key => groups[key]?.a).map(key => [cbCatName(key), groups[key].a]);
  const weekday = new Date(book.date + "T12:00:00+06:00").toLocaleDateString(LANG === "en" ? "en-GB" : "bn-BD", {weekday:"long",timeZone:"Asia/Dhaka"});
  return `<div class="rep cb-register">${dcHead(cbRegisterTitle(), book.date, book.date)}
    <div class="cb-reg-day">${esc(weekday)} · ${dmy(book.date)}</div>
    <table class="rep-t cb-reg-table"><colgroup><col style="width:5%"><col style="width:32%"><col style="width:15.5%"><col style="width:32%"><col style="width:15.5%"></colgroup>
    <thead><tr><th>#</th><th>${bi("প্রাপ্তি", "Receipt")}</th><th class="r">৳</th><th>${bi("পরিশোধ", "Payment")}</th><th class="r">৳</th></tr></thead>
    <tbody>${records || `<tr><td colspan="5">${bi("কোনো লেনদেন নেই", "No transactions")}</td></tr>`}</tbody></table>
    <div class="cb-reg-groups"><section class="cb-reg-block"><h3>${bi("প্রাপ্তির খাত", "Receipt groups")}</h3>${totals(grouped("r"))}</section>
    <section class="cb-reg-block"><h3>${bi("পরিশোধের খাত", "Payment groups")}</h3>${totals(grouped("p"))}</section></div>
    <section class="cb-reg-block"><h3>${bi("নগদ হিসাব", "Cash reconciliation")}</h3>${totals(cbRegisterTotals(book))}</section>
    <section class="cb-reg-block"><h3>${bi("অন্যান্য সারাংশ", "Reference totals")}</h3>${totals(cbRegisterReferences(ref))}
    <small>${ref ? bi("সারাংশ নেওয়া হয়েছে", "Summary captured") + " · " + cbRegisterDate(ref.at) : bi("এই রেকর্ডে সংরক্ষিত সারাংশ নেই", "This record has no saved reference totals")}</small></section>
    ${book.remarks ? `<section class="cb-reg-block cb-narr">${esc(book.remarks)}</section>` : ""}
    <div class="rep-ft"><span>${book.status === "final" ? bi("ফাইনাল", "Final") : bi("দিন খোলা", "Day open")} · ${cbRegisterDate(book.updated_at)} · ${esc(book.entered_by || "")}</span><span>NABIAD Smart Finance Suite</span></div></div>`;
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
function cbWorkflowError(error) {
  const message = error.message || String(error);
  if (/cashbook_conflict/.test(message)) return bi("অন্য কেউ হিসাব বদলেছেন। তারিখটি আবার খুলে মিলিয়ে নিন।", "Another user updated this day. Reopen the date and review before retrying.");
  if (/cashbook_permission/.test(message)) return bi("এই এন্ট্রি বদলানোর অনুমতি বা সময়সীমা নেই।", "Permission denied or the edit window has closed.");
  if (/cashbook_write|PGRST202/.test(message)) return bi("Cash Book-এর database update এখনো প্রয়োগ করা হয়নি।", "The Cash Book database update is required.");
  return message;
}

Object.assign(SbAPI, {
  async cbMutate(date, version, action, side, index, data) {
    const result = await sb.rpc("cashbook_write", { p_date: date, p_version: version, p_action: action, p_side: side, p_index: index, p_data: data });
    if (result.error) throw result.error;
    return Array.isArray(result.data) ? result.data[0] : result.data;
  }
});

Object.assign(DemoAPI, {
  async cbMutate(date, version, action, side, index, data) {
    const previous = await this.cbOn(date);
    if ((previous?.updated_at ?? null) !== version) throw new Error("cashbook_conflict");
    const book = previous ? structuredClone(previous) : { date, user_id: S.me.id, opening_cash: (await this.cbPrev(date))?.cash_in_hand ?? 0, lines: { r: [], p: [] }, status: "draft" };
    if (action === "add") (book.lines[side] ||= []).push({ ...data, uid: S.me.id, created_at: new Date().toISOString() });
    if (action === "edit") Object.assign(book.lines[side][index], data);
    if (action === "delete") book.lines[side].splice(index, 1);
    if (action === "balance" || action === "close") {
      Object.assign(book, data);
      if (action === "close") {
        book.lines.register = await cbRegisterSummary(date);
        book.status = "final";
      }
    }
    const {R, P} = cbTot(book);
    await this.cbSave({ ...book, total_receipt: R, total_payment: P });
    return this.cbOn(date);
  }
});

async function vCashBook(v) {
  const token = ROUTE_TOK;
  await cashGroupLoad();
  if (token !== ROUTE_TOK) return;
  const localDay = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Dhaka" });
  const last = [S.lastBook, S.lastCash].filter(Boolean).sort().pop();
  const initial = sessionStorage.getItem("nabiad_cash_date") || (last && last < localDay ? stepDay(last, 1) : localDay);
  sessionStorage.removeItem("nabiad_cash_date");
  v.innerHTML = head(ROUTES[CUR].t, `<button type="button" class="btn" id="cb-led">${ico("list")} ${bi("লেজার", "Ledgers")}</button>
    <a class="btn" href="#/cashchk" id="cb-checker">${ico("check")} ${bi("ক্যাশ চেকার", "Cash Checker")}</a>
    <a class="btn" href="#/cashsum">${ico("chart")} ${bi("সামারি", "Summary")}</a>`, "tc") +
    `<div class="card tbar navcard">${dateNav("cb", initial > localDay ? localDay : initial)}<div id="cb-msg"></div></div><div id="cb-body"></div>`;
  const body = $("#cb-body", v), dateInput = $("#cb-d", v), msg = $("#cb-msg", v);
  dateInput.max = localDay;
  let revision = 0, activitySide = "r", saving = false, canSwitchDate = () => true;
  const sides = ["r", "p"];
  $("#cb-led", v).onclick = () => cbLedgerModal();
  $("#cb-checker", v).onclick = () => sessionStorage.setItem("nabiad_cash_date", dateInput.value);
  async function draw(focusSide = null) {
    const date = dateInput.value, drawId = ++revision;
    canSwitchDate = () => true;
    if (!date || date > localDay) {
      msg.textContent = bi("আজ অথবা আগের একটি তারিখ বাছুন।", "Choose today or an earlier date.");
      body.replaceChildren();
      return;
    }
    const current = () => drawId === revision && body.isConnected && dateInput.value === date;
    body.innerHTML = `<div class="card empty">${bi("লোড হচ্ছে…", "Loading…")}</div>`;
    msg.textContent = "";
    let book, pBook, pCash, earlier;
    try {
      [book, pBook, pCash, earlier] = await Promise.all([
        API.cbOn(date), API.cbPrev(date), API.cashPrev(date).catch(() => null),
        API.cbRange(addDays(date, -60), addDays(date, -1)).catch(() => []), cbLearn(), cbLedLoad()
      ]);
    } catch (error) {
      if (current()) body.textContent = error.message || String(error);
      return;
    }
    if (!current()) return;
    const admin = S.me.role === "admin", staff = S.me.role === "staff", editDays = S.me.edit_days || 0;
    const final = book?.status === "final", inWindow = date >= addDays(localDay, -editDays);
    const mayEnter = moduleCan("cash", "entry"), mayEdit = moduleCan("cash", "edit");
    const mayAdd = admin || staff && mayEnter && inWindow;
    const mayBalance = admin || staff && inWindow && (!book || book.user_id === S.me.id) && (final ? mayEdit : mayEnter || !!book && mayEdit);
    const mayUpdate = item => !!item && (admin || staff && mayEdit && editDays > 0 && item.uid === S.me.id
      && Date.parse(item.created_at) > Date.now() - editDays * 86400000);
    const previous = pBook && (!pCash || pBook.date >= pCash.date) ? pBook : pCash;
    const opening = book?.opening_cash ?? previous?.cash_in_hand ?? (previous === pBook && pBook ? cbTot(pBook).exp : 0);
    const lines = book?.lines || { r: [], p: [] };
    const recoveryKey = "nabiad_cb_entry_" + S.me.id + "_" + date;
    let pending = {}, legacy;
    try {
      pending = JSON.parse(localStorage.getItem(recoveryKey) || "{}") || {};
      legacy = JSON.parse(localStorage.getItem(CB_DRAFT(date)) || "null");
    } catch { }
    const storePending = () => {
      try { localStorage.setItem(recoveryKey, JSON.stringify(pending)); } catch { }
    };
    const recoverable = [];
    if (legacy?.entered_by === S.me.name) {
      if (!book && !pending.balance) pending.balance = {
        opening_cash: admin ? legacy.opening_cash : undefined, cash_in_hand: legacy.cash_in_hand, remarks: legacy.remarks
      };
      for (const side of sides) {
        const signature = item => JSON.stringify([item.n, Number(item.a), item.ref || "", item.note || "", item.c || ""]);
        const remaining = (lines[side] || []).map(signature);
        for (const item of legacy.lines?.[side] || []) {
          const match = remaining.indexOf(signature(item));
          if (match >= 0) remaining.splice(match, 1);
          else recoverable.push({side, item});
        }
      }
    }
    const moneyText = amount => amount == null ? "—" : "৳ " + money(amount);
    const reference = { value: lines.register || null };
    const controls = (side, cls) => `<section class="card csec ${cls}" data-cb-form="${side}" hidden><div class="csh"><h3>${cbSideLabel(side)}</h3><b id="cb-T${side}"></b></div>
      <form class="cb-compose"><label>${bi("বিবরণ", "Particulars")}<input class="in cbname" autocomplete="off" required></label>
        <label>${bi("অঙ্ক", "Amount")}<input class="in cbamt2" inputmode="decimal" required></label>
        <label>${cbVoucherLabel(side)}<input class="in cbref" autocomplete="off"></label>
        <label class="cb-compose-account" hidden>${bi("ব্যাংক A/C", "Bank account")}<select class="in cbac"><option value="">${bi("A/C বাছুন", "Select A/C")}</option>
        ${S.accounts.map(a => `<option value="${esc(a.code)}">${esc(a.code)} · ${esc(a.holder || "")}</option>`).join("")}</select></label>
        <details class="cb-compose-note"><summary>${cbNarrationLabel()}</summary><textarea class="in cbnote" aria-label="${cbNarrationLabel()}" rows="2"></textarea></details>
        <div class="cb-row-actions"><button type="button" class="btn cb-cancel" hidden>${bi("বাতিল", "Cancel")}</button>
          <button type="submit" class="btn pri cbadd">${ico("plus")} <span>${bi("যোগ করুন", "Add")}</span></button></div>
      </form></section>`;
    const waiting = earlier.filter(day => day.status !== "final" && (!previous || day.date > previous.date)).pop();
    msg.textContent = [final ? bi("দিন বন্ধ হয়েছে", "Day closed") : bi("দিন খোলা আছে", "Day open"),
      previous?.date && !book ? bi("শুরুর নগদের উৎস", "Opening cash source") + " " + dmy(previous.date) : "",
      !final && waiting ? bi("আগের দিনের হিসাব এখনো খোলা", "Earlier day still open") + " " + dmy(waiting.date) : ""
    ].filter(Boolean).join(" · ");
    body.innerHTML = `<div class="cb-workspace"><div class="cb-entry">
      <section class="card csec c-open"><div class="csh"><h3 id="cb-opening-label">${bi("শুরুর নগদ", "Opening cash")}</h3>
        <input id="cb-oc" class="cell cbopen" aria-labelledby="cb-opening-label" inputmode="decimal" value="${fmtIn(pending.balance?.opening_cash ?? opening)}" ${admin ? "" : "disabled"}></div></section>
      <div class="cb-entry-sides">${controls("r", "c-rec")}${controls("p", "c-pay")}</div>
      ${recoverable.length && mayAdd ? `<details class="card cb-recovery"><summary>${bi("এই ডিভাইসের আগের অসম্পূর্ণ লাইন", "Previous unsaved lines on this device")} (${recoverable.length})</summary>
        <ul>${recoverable.map(({side, item}, index) => `<li><span>${cbSideLabel(side)} · ${esc(item.n)} · ${moneyText(item.a)}</span><button type="button" class="btn sm" data-cb-recover="${index}">${bi("ফর্মে নিন", "Load into form")}</button></li>`).join("")}</ul></details>` : ""}
      <section class="card csec"><div class="csh"><h3>${bi("খাত অনুযায়ী যোগফল", "Totals by category")}</h3></div><div id="cb-sum"></div></section>
      <section class="card csec c-close"><div class="csh"><h3>${bi("হিসাব মেলানো", "Balance")}</h3></div>
        <div class="crow hl"><label for="cb-ch">${bi("হাতে ক্যাশ (গুনে লিখুন)", "Cash in hand (count and enter)")}</label><div class="cb-count-input">
          <input class="cell" id="cb-ch" inputmode="decimal" aria-describedby="cb-inline-closing cb-inline-diff" value="${esc(pending.balance?.cash_in_hand ?? (book?.cash_in_hand == null ? "" : fmtIn(book.cash_in_hand)))}" ${mayBalance ? "" : "disabled"}>
          <div class="cb-inline-balance"><strong id="cb-inline-closing"></strong><strong id="cb-inline-diff"></strong></div></div></div>
        <div class="crow"><label for="cb-rm">${bi("মন্তব্য", "Remarks")}</label><input class="cell t" id="cb-rm" value="${esc(pending.balance?.remarks ?? book?.remarks ?? "")}" ${mayBalance ? "" : "disabled"}></div>
        ${mayBalance ? `<div class="cb-row-actions">${final
          ? `<button type="button" class="btn" id="cb-balance">${bi("নগদের হিসাব আপডেট", "Update cash count")}</button>`
          : `<button type="button" class="btn pri" id="cb-close-day">${ico("check")} ${bi("দিন বন্ধ করুন", "Close day")}</button>`}</div>` : ""}
      </section>
      <div class="hint rd" id="cb-err" role="alert"></div>
      </div><div class="cb-review"><section class="card flush cb-activity" aria-labelledby="cb-activity-title">
        <div class="ch cb-activity-head"><h3 id="cb-activity-title">${bi("দিনের ক্যাশ লেনদেন", "Cash Book activity")}</h3><time datetime="${date}">${dmy(date)}</time></div>
        <div class="cb-activity-body">
          <div class="cb-export-actions" role="group" aria-label="${bi("ক্যাশ খাতা এক্সপোর্ট", "Cash Book export")}">
            ${[["png", "img", bi("স্ক্রিনশট", "Screenshot")], ["print", "print", bi("প্রিন্ট", "Print")], ["share", "share", bi("শেয়ার", "Share")]].map(([key, icon, label]) => `<button type="button" class="btn" data-cb-export="${key}">${ico(icon)} <span>${label}</span></button>`).join("")}
          </div>
          <dl class="cb-activity-totals"><div class="cb-stat-wide"><dt>${bi("শুরুর নগদ", "Opening cash")}</dt><dd id="cb-x1"></dd></div></dl>
          <div class="cb-activity-filters" role="group" aria-label="${bi("লেনদেনের ধরন", "Transaction type")}">
            ${sides.map(side => `<button type="button" class="btn sm" data-cb-side="${side}" aria-controls="cb-activity-lines" aria-pressed="false">${cbSideLabel(side)} <span class="cb-side-count">${(lines[side] || []).length}</span></button>`).join("")}
          </div>
          <ul id="cb-activity-lines" class="cb-activity-lines" tabindex="0"></ul><p id="cb-activity-empty" class="mut sm" hidden></p>
          <dl class="cb-activity-totals">
            <div class="cb-stat-receipt"><dt>${bi("মোট প্রাপ্তি", "Total Receipt")}</dt><dd id="cb-x2"></dd></div>
            <div class="cb-stat-payment"><dt>${bi("মোট পরিশোধ", "Total Payment")}</dt><dd id="cb-x3"></dd></div>
            <div class="cb-stat-wide"><dt>${bi("মোট ব্যাংক ক্লোজিং", "Total Bank Closing")}</dt><dd id="cb-bank-total">—</dd></div>
            <div><dt>${bi("হাতে থাকার কথা", "Expected cash")}</dt><dd id="cb-x4"></dd></div>
            <div class="cb-stat-counted"><dt>${bi("হাতে ক্যাশ", "Cash in hand")}</dt><dd id="cb-counted"></dd></div>
            <div class="cb-stat-wide cb-stat-difference"><dt>${bi("পার্থক্য", "Difference")}</dt><dd id="cb-df"></dd></div>
          </dl>
        </div></section>
        <section class="card csec cb-references"><div class="csh"><h3>${bi("দৈনিক রেজিস্টার", "Daily register")}</h3>
          ${final ? `<button type="button" id="cb-register" class="btn sm">${bi("দেখুন / Export", "View / Export")}</button>` : ""}</div><div id="cb-refs" role="status"></div></section>
      </div></div>`;
    const get = key => $("#cb-" + key, body);
    const fail = error => { get("err").textContent = cbWorkflowError(error); toast(get("err").textContent, "err"); };
    const formState = {};
    const hasEditedLine = except => sides.some(side => side !== except && formState[side]?.dirtyEdit);
    canSwitchDate = () => {
      if (!hasEditedLine() || ask(bi("অসম্পূর্ণ পরিবর্তন বাদ দিয়ে তারিখ বদলাবেন?", "Discard the unsaved edit and switch dates?"))) return true;
      dateInput.value = date;
      return false;
    };
    const post = async (action, side = null, index = null, data = {}, onSuccess) => {
      if (saving || !current()) return;
      if (hasEditedLine(action === "edit" ? side : null)) {
        return fail(new Error(bi("চলতি এডিট আগে আপডেট বা বাতিল করুন।", "Update or cancel the current edit first.")));
      }
      const buttons = $$("button, input, textarea, select", body).concat($$("button, input", $(".navcard", v)));
      const disabled = buttons.map(button => button.disabled);
      buttons.forEach(button => { button.disabled = true; });
      saving = true;
      get("err").textContent = "";
      let changed;
      try { changed = await API.cbMutate(date, book?.updated_at ?? null, action, side, index, data); }
      catch (error) { if (current()) fail(error); }
      finally { buttons.forEach((button, i) => { button.disabled = disabled[i]; }); saving = false; }
      if (!changed) return;
      onSuccess?.();
      storePending();
      if (!current()) return;
      if (changed.status === "final" && (!S.lastBook || date > S.lastBook)) { S.lastBook = date; refreshBadges(); }
      cbLearn(true);
      toast(action === "close" ? bi("দিনের হিসাব বন্ধ হয়েছে", "Day closed") : bi("আপডেট হয়েছে", "Cash Book updated"));
      await draw(action === "add" && matchMedia("(pointer:fine)").matches ? side : null);
    };

    const drawActivity = () => {
      for (const button of $$("[data-cb-side]", body)) button.setAttribute("aria-pressed", String(button.dataset.cbSide === activitySide));
      const entries = lines[activitySide] || [];
      get("activity-lines").innerHTML = entries.map((item, index) => `<li><div><strong>${esc(item.n)}</strong>
        ${item.ref || item.c ? `<small>${esc([item.ref && cbVoucherLabel(activitySide) + " " + item.ref, item.c].filter(Boolean).join(" · "))}</small>` : ""}
        ${item.note ? `<small class="cb-narr">${esc(item.note)}</small>` : ""}</div>
        <div class="cb-record-actions"><b class="num">${moneyText(item.a)}</b>
          <div>${mayUpdate(item) ? `<button type="button" class="btn sm" data-cb-edit="${index}">${bi("এডিট", "Edit")}</button>` : ""}
          ${admin ? `<button type="button" class="btn sm" data-cb-delete="${index}">${bi("মুছুন", "Delete")}</button>` : ""}</div>
        </div></li>`).join("");
      get("activity-lines").hidden = !entries.length;
      get("activity-empty").hidden = !!entries.length;
      get("activity-empty").textContent = activitySide === "r" ? bi("কোনো প্রাপ্তি নেই।", "No receipts.") : bi("কোনো পরিশোধ নেই।", "No payments.");
    };
    const loadForm = (side, item = {}, index = null, focus = false) => {
      const state = formState[side];
      state.index = index;
      state.dirtyEdit = false;
      state.section.hidden = !mayAdd && index == null;
      state.name.value = item.n || "";
      state.amount.value = item.x ?? (item.a == null ? "" : fmtIn(item.a));
      state.ref.value = item.ref || "";
      state.note.value = item.note || "";
      state.note.closest("details").open = !!item.note;
      state.category = item.k || cbGuess(item.n, side)?.k || "";
      state.account.value = item.c || "";
      state.account.parentElement.hidden = !CB_BANK.includes(state.category);
      state.cancel.hidden = index == null;
      $("button[type=submit] span", state.section).textContent = index == null ? bi("যোগ করুন", "Add") : bi("আপডেট", "Update");
      if (focus) state.name.focus();
    };
    for (const side of sides) {
      const section = $(`[data-cb-form="${side}"]`, body), form = $("form", section);
      const state = formState[side] = {section, name: $(".cbname", form), amount: $(".cbamt2", form), ref: $(".cbref", form), note: $(".cbnote", form), account: $(".cbac", form), cancel: $(".cb-cancel", form)};
      const guess = () => {
        const mapping = cbGuess(state.name.value, side), oldCategory = state.category;
        state.category = mapping?.k || "";
        state.account.parentElement.hidden = !CB_BANK.includes(state.category);
        state.account.value = mapping?.c || (oldCategory === state.category ? state.account.value : "");
      };
      suggest(state.name, () => cbLedItems(side), guess, { free: true, max: 30 });
      state.name.addEventListener("picked", () => state.amount.focus());
      state.name.oninput = guess;
      const read = () => ({ n: state.name.value.trim(), x: state.amount.value.trim(), ref: state.ref.value.trim(), note: state.note.value.trim(), k: state.category, c: state.account.value });
      form.oninput = form.onchange = () => {
        if (!current()) return;
        if (state.index == null) { pending[side] = read(); storePending(); }
        else state.dirtyEdit = true;
      };
      form.onkeydown = event => {
        if (event.key !== "Enter" || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
        const { target } = event;
        const { name, amount, ref, account } = state;
        if (![name, amount, ref, account].includes(target) || (target === account && !account.value)) return;
        event.preventDefault();
        if (event.repeat) return;
        if (!name.value.trim()) return name.focus();
        if (target === name) return amount.focus();
        const value = evalAmt(amount.value);
        if (!Number.isFinite(value) || !value) return amount.focus();
        if (target === amount) return ref.focus();
        if (!account.parentElement.hidden && !account.value) return account.focus();
        form.requestSubmit();
      };
      form.onsubmit = event => {
        event.preventDefault();
        const data = read(), value = evalAmt(data.x);
        if (!data.n || !Number.isFinite(value) || !value) return fail(new Error(bi("বিবরণ ও সঠিক অঙ্ক লিখুন।", "Enter particulars and a valid nonzero amount.")));
        if (CB_BANK.includes(data.k) && !data.c) { state.account.focus(); return fail(new Error(bi("ব্যাংক A/C বাছুন।", "Select a bank account."))); }
        const index = state.index;
        if (index == null ? !mayAdd : !mayUpdate(lines[side]?.[index])) return;
        activitySide = side;
        post(index == null ? "add" : "edit", side, index, { ...data, a: Math.round(value * 100) / 100 }, () => {
          if (index == null) delete pending[side];
        });
      };
      state.cancel.onclick = () => loadForm(side, pending[side]);
      loadForm(side, pending[side], null, side === focusSide && mayAdd);
    }
    for (const button of $$("[data-cb-side]", body)) button.onclick = () => { activitySide = button.dataset.cbSide; drawActivity(); };
    get("activity-lines").onclick = event => {
      const target = event.target.closest("[data-cb-edit], [data-cb-delete]");
      if (!target) return;
      const side = activitySide;
      const index = Number(target.dataset.cbEdit ?? target.dataset.cbDelete), item = lines[side]?.[index];
      if (!item) return;
      if (target.hasAttribute("data-cb-edit") && mayUpdate(item)) {
        if (hasEditedLine()) return fail(new Error(bi("চলতি এডিট আগে আপডেট বা বাতিল করুন।", "Update or cancel the current edit first.")));
        loadForm(side, item, index, true);
      } else if (admin && ask(bi("এই লেনদেনটি মুছে ফেলবেন?", "Delete this transaction?"))) post("delete", side, index);
    };
    for (const button of $$("[data-cb-recover]", body)) button.onclick = () => {
      const {side, item} = recoverable[Number(button.dataset.cbRecover)];
      if (pending[side]?.n && !ask(bi("ফর্মের বর্তমান লাইন বদলাবেন?", "Replace the current unsaved line in the form?"))) return;
      pending[side] = item; storePending(); loadForm(side, item, null, true);
    };
    const grouped = cbGroup({lines});
    get("sum").innerHTML = `<div class="cbsg">${sides.map(side => `<div><h4>${cbSideLabel(side)}</h4>${CB_CAT[side].filter(key => grouped.items[key]?.a).map(key =>
      `<div class="cbs"><span>${esc(cbCatName(key))}</span><b>${moneyText(grouped.items[key].a)}</b></div>`).join("") || "—"}</div>`).join("")}</div>`
      + (grouped.warn.un ? `<p class="mut sm">${bi("ম্যাপ করা হয়নি এমন লাইন Others-এ ধরা হয়েছে।", "Unmapped lines are counted under Others.")}</p>` : "");
    const preview = () => {
      const open = admin ? evalAmt(get("oc").value) : +opening;
      const counted = get("ch").value.trim() ? evalAmt(get("ch").value) : null;
      const {R, P, exp} = cbTot({ opening_cash: open, lines });
      const diff = counted == null || !Number.isFinite(open) || !Number.isFinite(counted) ? null : Math.round((counted - exp) * 100) / 100;
      const direction = diff == null ? "—" : diff > 0 ? moneyText(diff) + " · " + bi("ক্যাশ বেশি", "Cash over")
        : diff < 0 ? moneyText(Math.abs(diff)) + " · " + bi("ক্যাশ কম", "Cash short") : bi("৳ ০ · মিলেছে", "৳ 0 · Matches");
      const tone = diff === 0 ? "gr" : diff > 0 ? "am" : diff < 0 ? "rd" : "mut";
      for (const [id, value] of Object.entries({Tr: R, Tp: P, x1: open, x2: R, x3: P, x4: exp, counted})) get(id).textContent = moneyText(value);
      get("inline-closing").textContent = bi("ক্যাশ ক্লোজিং", "Cash Closing") + " = " + (Number.isFinite(open) ? moneyText(exp) : "—");
      get("inline-diff").textContent = bi("পার্থক্য", "Diff.") + " = " + direction;
      get("inline-diff").className = get("df").className = tone;
      get("df").textContent = direction;
      return {open, counted, diff};
    };
    for (const id of ["oc", "ch", "rm"]) get(id).oninput = () => {
      pending.balance = { opening_cash: get("oc").value, cash_in_hand: get("ch").value, remarks: get("rm").value };
      storePending();
      preview();
    };
    const saveBalance = async close => {
      if (saving || !current()) return;
      const {open, counted, diff} = preview();
      if (!Number.isFinite(open) || counted !== null && !Number.isFinite(counted) || (close || final) && counted == null) {
        get("ch").focus();
        return fail(new Error(bi("সঠিক শুরুর নগদ ও হাতে ক্যাশ লিখুন।", "Enter valid opening and counted cash amounts.")));
      }
      if (sides.some(side => formState[side].index != null || ["n", "x", "ref", "note"].some(key => pending[side]?.[key])) && close) {
        return fail(new Error(bi("দিন বন্ধ করার আগে অসম্পূর্ণ লাইন যোগ বা বাতিল করুন।", "Add or clear any unsaved lines before closing the day.")));
      }
      if (close && !ask(diff ? bi("ক্যাশে পার্থক্য আছে। দিন বন্ধ করবেন?", "Cash differs from the expected amount. Close this day?") : bi("দিনের হিসাব বন্ধ করবেন?", "Close this Cash Book day?"))) return;
      if (close && grouped.warn.noAc) return fail(new Error(bi("ব্যাংকের লাইনগুলোতে A/C নির্বাচন করুন।", "Choose an account on each bank line before closing.")));
      const data = { ...(admin ? {opening_cash: open} : {}), cash_in_hand: counted, remarks: get("rm").value };
      await post(close ? "close" : "balance", null, null, data, () => { delete pending.balance; });
    };
    if (get("balance")) get("balance").onclick = () => saveBalance(false);
    if (get("close-day")) get("close-day").onclick = () => saveBalance(true);
    const showReferences = () => {
      get("bank-total").textContent = moneyText(reference.value?.bank);
      get("refs").innerHTML = cbRegisterReferences(reference.value).slice(1).map(([label, value]) =>
        `<div class="cb-reg-total"><span>${esc(label)}</span><b>${moneyText(value)}</b></div>`).join("") +
        (final && !reference.value ? `<small class="mut">${bi("এই পুরনো দিনের সংরক্ষিত সারাংশ নেই।", "This older day has no saved reference totals.")}</small>` : "");
    };
    if (final) get("register").onclick = () => cbRegisterModal(book);
    if (!reference.value && !final) cbRegisterSummary(date).then(result => {
      if (!current()) return;
      reference.value = result;
      showReferences();
    }, () => { if (current()) get("refs").textContent = bi("সারাংশ পাওয়া যায়নি।", "Reference totals unavailable."); });

    for (const button of $$("[data-cb-export]", body)) button.onclick = async () => {
      const snapshot = { ...book, date, opening_cash: opening, lines: { ...lines, register: reference.value } };
      const sheet = cbRegisterSheet(snapshot), filename = "Nabiad_Cash_Register_" + date;
      if (button.dataset.cbExport === "print") { printSheet(sheet, filename); return; }
      const stage = document.createElement("div");
      stage.className = "cb-export-stage";
      stage.innerHTML = sheet;
      document.body.append(stage);
      button.disabled = true;
      try {
        const blob = await cbRegisterVisual($(".cb-register", stage), "png");
        const file = new File([blob], filename + ".png", { type: "image/png" });
        if (button.dataset.cbExport === "share" && navigator.canShare?.({ files: [file] })) {
          try { await navigator.share({ files: [file], title: cbRegisterTitle() }); }
          catch (error) {
            if (error.name !== "AbortError") {
              modal(`<h2>${cbRegisterTitle()}</h2><div class="modal-actions"><button type="button" class="btn pri" id="cb-share-file">${bi("শেয়ার করুন", "Share image")}</button></div>`, root => {
                $("#cb-share-file", root).onclick = async () => {
                  try { await navigator.share({ files: [file], title: cbRegisterTitle() }); }
                  catch (e) { if (e.name !== "AbortError") dlBlob(file, file.name); }
                };
              });
            }
          }
        } else dlBlob(file, file.name);
      } catch (error) { fail(error); }
      finally { stage.remove(); button.disabled = false; }
    };
    preview(); drawActivity(); showReferences();
  }
  bindDateNav(v, "cb", () => { if (!saving && canSwitchDate()) draw(); });
  await draw();
  return () => { ++revision; };
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
   <div class="cblg-filters cblg-filters-map">
     <div><label class="f" for="lg-q">${bi("লেজার খুঁজুন", "Search ledgers")}</label><input class="in" id="lg-q" type="search" placeholder="${bi("খুঁজুন…", "Search…")}" autocomplete="off"></div>
     <div><label class="f" for="lg-group">${bi("খাত", "Purpose / Group")}</label><select class="in" id="lg-group">
       <option value="">${bi("সব খাত", "All groups")}</option>
       <option value="mapped">${bi("খাত নির্ধারিত", "Mapped")}</option>
       <option value="unmapped">${bi("খাত নির্ধারিত নয়", "Unmapped")}</option>
       ${[["r", "Receipt"], ["p", "Payment"]].map(([side, label]) => `<optgroup label="${label}">${CB_CAT[side].map(k => `<option value="${side}:${k}">${esc(cbCatName(k))}</option>`).join("")}</optgroup>`).join("")}
     </select></div>
   </div>
   <div class="cblg-h ${mappingOnly ? "cblg-map" : ""}"><span>${bi("লেজার", "Ledger")}</span><span>Receipt ${bi("খাত", "group")}</span><span>Payment ${bi("খাত", "group")}</span>${mappingOnly ? `<span>${bi("স্ট্যাটাস ও অ্যাকশন", "Status & actions")}</span>` : "<span>Bank A/C</span><span></span>"}</div>
   <div class="mut sm" id="lg-c" role="status"></div><div class="cblg" id="lg-l"></div>
   <button class="btn sm" type="button" id="lg-more" hidden>${bi("আরও দেখুন", "Show more")}</button>
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
    const group = g("lg-group"), more = g("lg-more");
    const groupLabels = new Map([...group.options].map(option => [option.value, option.textContent]));
    let limit = 150;
    const refreshGroups = () => {
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
    const visibleLedgers = () => {
      const q = norm(g("lg-q").value), selected = group.value;
      const counts = new Map([...groupLabels.keys()].map(key => [key, 0]));
      const matches = [];
      for (const ledger of CBLED.list) {
        if (q && !norm(ledger.name).includes(q)) continue;
        const groups = ["r", "p"].flatMap(side => {
          const key = `${side}:${cbLedCat(ledger, side)}`;
          return counts.has(key) ? [key] : [];
        });
        const filters = ["", groups.length ? "mapped" : "unmapped", ...groups];
        for (const key of filters) counts.set(key, counts.get(key) + 1);
        if (filters.includes(selected)) matches.push(ledger);
      }
      for (const option of group.options) {
        const key = option.value.split(":")[1];
        option.textContent = `${key ? cbCatName(key) : groupLabels.get(option.value)} (${counts.get(option.value)})`;
      }
      const shown = matches.slice(0, limit);
      more.hidden = shown.length === matches.length;
      g("lg-c").textContent = bi(`${shown.length} / ${matches.length}টি দেখানো হচ্ছে · মোট ${CBLED.list.length}`, `Showing ${shown.length} of ${matches.length} matches · ${CBLED.list.length} ledgers total`);
      return shown;
    };
    const draw = (shown = visibleLedgers()) => {
      const selectable = canEdit && (!mappingOnly || (editing && !saving));
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
      const redraw = "cat_r" in patch || "cat_p" in patch || "name" in patch;
      try {
        const row = await API.cbLedgerSave({...m, ...patch});
        Object.assign(m, row);
        CBLED.byNorm = new Map(CBLED.list.map(x => [cbNorm(x.name), x]));
        notify();
        parent.classList.toggle("off", m.active === false);
        if (redraw && panel.isConnected) {
          const shown = visibleLedgers(), rows = $$(".cblg-r", panel);
          if (shown.length !== rows.length || shown.some((row, index) => String(row.id) !== rows[index].dataset.id)) {
            draw(shown);
          }
        }
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
    g("lg-q").oninput = group.onchange = () => { limit = 150; draw(); };
    more.onclick = () => {
      const firstNew = limit;
      limit += 150;
      draw();
      $$(".cblg-r", panel)[firstNew]?.scrollIntoView({ block: "nearest" });
    };
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
