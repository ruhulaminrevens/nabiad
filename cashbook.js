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
const cbRegisterMoney = n => n == null ? "—" : (Math.abs(n) < 0.5 ? 0 : Number(n))
  .toLocaleString("en-IN", {maximumFractionDigits: 0});
const cbRegisterDate = at => at ? new Date(at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }) + " (Dhaka)" : "—";
async function cbRegisterSummary(date, allowPartial = false, saved = null) {
  const sources = [API.balancesOn(date), API.dcolRange(date, date)];
  const [balances, collections] = await (allowPartial
    ? Promise.allSettled(sources).then(results => results.map(result => result.value))
    : Promise.all(sources));
  const bank = balances == null ? saved?.bank ?? null : cashBankTotal(Object.fromEntries(
    S.accounts.filter(a => a.daily && balances[a.code]).map(a => [a.code, balances[a.code]])
  ));
  const approved = collections?.filter(c => c.date === date && c.status === "approved");
  const sum = (rows, amount) => rows.reduce((t, row) => t + Math.round(Number(amount(row)) * 100), 0) / 100;
  return {
    at: new Date().toISOString(),
    bank,
    collection: approved == null ? saved?.collection ?? null : sum(approved, c => c.amount),
    cash: approved == null ? null : sum(approved.filter(c => String(c.account || "").trim().toLowerCase() === "cash"), c => c.amount)
  };
}
function cbRegisterReferences(snapshot) {
  return [
    [bi("মোট ব্যাংক ক্লোজিং", "Total Bank Closing"), snapshot?.bank ?? null],
    [bi("ডিস্ট্রিবিউশন কালেকশন", "Distribution Collection"), snapshot?.collection ?? null]
  ];
}
const cbIsTallyReport = book => book?.source === "tally" && !book.importedForCashBook;
const cbRegisterSource = book => cbIsTallyReport(book)
  ? bi("Tally ভাউচার", "Tally vouchers") : bi("ক্যাশ খাতা", "Cash Book");
const cbHasSavedLines = lines => !!(lines?.r?.length || lines?.p?.length);
async function cbActivitySnapshot(source, nativeBook, loadTally) {
  if (source === "tally") return loadTally();
  if (cbHasSavedLines(nativeBook.lines)) return nativeBook;
  try {
    const tally = await loadTally();
    return cbHasSavedLines(tally.lines) ? { ...tally, importedForCashBook: true } : nativeBook;
  } catch {
    return { ...nativeBook, importedVouchersUnavailable: true };
  }
}
const cbRegisterFilename = book => "Nabiad_Cash_Register_" + book.date + (cbIsTallyReport(book) ? "_Tally" : "");
const cbMissingColumn = error => ["42703", "PGRST204"].includes(error?.code);
async function cbTallyReportDetails(date, forCashBook) {
  if (DEMO) return {rows: [], editable: false};
  const columns = "type,ref,report_ledger";
  const read = select => sb.from("cash_tally_vouchers").select(select).eq("date", date)
    .order("type").order("ref");
  const rows = [];
  let editable = forCashBook, fields = columns + (editable ? ",cashbook_edit" : "");
  for (let offset = 0; ; offset += 1000) {
    let {data, error} = await read(fields).range(offset, offset + 999);
    if (offset === 0 && editable && cbMissingColumn(error)) {
      editable = false;
      fields = columns;
      ({data, error} = await read(fields).range(0, 999));
    }
    if (cbMissingColumn(error)) return {rows: [], editable: false};
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return {rows, editable};
  }
}
function cbTallyRegister(date, vouchers, ledgerList, details, cash, references, previousCash) {
  const ledgers = new Map(ledgerList.map(ledger => [tallyLedgerKey(ledger.name), ledger]));
  const metadata = new Map(details.rows.map(row => [row.type + ":" + row.ref, row]));
  const lines = {r: [], p: [], register: references};
  for (const voucher of vouchers) {
    const side = voucher.type === "receipt" ? "r" : "p";
    const category = tallyPurpose(voucher, ledgers);
    const ledger = ledgers.get(tallyLedgerKey(voucher.led));
    const meta = metadata.get(voucher.type + ":" + voucher.ref);
    const edit = details.editable ? meta?.cashbook_edit : null;
    const reportLedger = edit?.n?.trim() || meta?.report_ledger?.trim();
    const controlLedger = tallyLedgerKey(voucher.led);
    const needsPartyName = side === "r" && controlLedger === "nabiad-chawkbazar-2026"
      && (!reportLedger || tallyLedgerKey(reportLedger) === controlLedger);
    lines[side].push({n: voucher.led, a: edit?.a ?? voucher.a, k: category, reportLedger, needsPartyName,
      c: CB_BANK.includes(category) ? ledger?.bank_code : undefined,
      ref: edit?.ref, note: edit?.note, sourceRef: voucher.ref, editVersion: edit?.updated_at});
  }
  const carriedOpening = cash?.opening_cash == null && previousCash?.cash_in_hand != null;
  return {date, source: "tally", lines, importedEditable: details.editable,
    opening_cash: carriedOpening ? previousCash.cash_in_hand : cash?.opening_cash,
    opening_source_date: carriedOpening ? previousCash.date : null,
    cash_in_hand: cash?.cash_in_hand};
}
function cbRegisterTotals(book) {
  const tally = book.source === "tally";
  const { R, P, exp } = cbTot(book);
  const round = n => Math.round(n * 100) / 100;
  const counted = book.cash_in_hand == null ? null : Number(book.cash_in_hand);
  const opening = tally && book.opening_cash == null ? null : Number(book.opening_cash) || 0;
  const movement = round(R - P);
  const expected = opening == null || (tally && !book.lines.r.length && !book.lines.p.length) ? null : round(exp);
  return [
    [bi("শুরুর নগদ", "Opening cash"), opening],
    [bi("মোট প্রাপ্তি", "Total receipts"), R],
    [bi("মোট পরিশোধ", "Total payment"), P],
    [bi("হাতে থাকার কথা", "Expected cash"), expected],
    [bi("গুনে পাওয়া নগদ", "Counted cash"), counted],
    [bi("পার্থক্য", "Difference"), counted == null || expected == null ? null : round(counted - expected)],
    [bi("নিট নগদ প্রবাহ", "Net cash movement"), movement]
  ];
}
const cbRegisterTitle = () => bi("দৈনিক ক্যাশ রেজিস্টার", "Daily Cash Register");
const cbVoucherLabel = t => t === "r" ? bi("মানি রিসিট নং", "Money Receipt No.") : bi("ক্যাশ ভাউচার নং", "Cash Voucher No.");
const cbSideLabel = t => t === "r" ? bi("প্রাপ্তি", "Receipt") : bi("পরিশোধ", "Payment");
const cbNarrationLabel = () => bi("নোট / Tally Narration", "Note / Tally Narration");
const cbRegisterSigners = () => [
  bi("দাখিলকারী", "Submitted By"),
  bi("যাচাইকারী", "Reviewed By"),
  bi("অনুমোদনকারী", "Authorized By")
];
const cbRegisterLineLabel = (line, rawTally = false) =>
  (!rawTally && String(line?.reportLedger || "").trim()) || String(line?.n || "").trim();

const cbPendingParty = () => bi("পার্টির নাম যাচাই বাকি", "Party name pending");
const cbPendingReceipts = book => book?.importedForCashBook
  ? (book.lines?.r || []).filter(line => line.needsPartyName) : [];
function cbPartyWarning(book) {
  const count = cbPendingReceipts(book).length;
  return count ? bi(
    `${count}টি প্রাপ্তির পার্টির নাম যাচাই বাকি। ভাউচার নম্বর দিয়ে মূল রেকর্ড মিলিয়ে নিন।`,
    `${count} receipt(s) need party names. Check the original records using the voucher numbers.`
  ) : "";
}
function cbPendingReceiptsModal(book) {
  const rows = cbPendingReceipts(book);
  if (!rows.length) return;
  modal(`<h2>${bi("পার্টির নাম যাচাই বাকি", "Receipts needing party names")}</h2>
    <div class="modal-body">
      <p class="mut sm">${esc(dmy(book.date))} · ${bi("ভাউচার নম্বর দিয়ে মূল রেকর্ড মিলিয়ে নিন।", "Check the original records using the voucher numbers.")}</p>
      <table class="cb-party-vouchers">
        <thead><tr><th scope="col">${bi("ভাউচার নম্বর", "Voucher no.")}</th><th scope="col">${bi("অঙ্ক", "Amount")}</th></tr></thead>
        <tbody>${rows.map(row => `<tr><td>${esc(row.sourceRef)}</td><td>৳ ${money(row.a)}</td></tr>`).join("")}</tbody>
      </table>
    </div>
    <div class="modal-actions"><button type="button" class="btn" id="cb-party-close">${bi("বন্ধ", "Close")}</button></div>`, (root, close) => {
    $(".modal", root).classList.add("cb-party-dialog");
    $("#cb-party-close", root).onclick = close;
  });
}
const cbRegisterWarning = book => book.importedVouchersUnavailable
  ? bi("আমদানি করা Tally ভাউচার লোড হয়নি।", "Imported Tally vouchers could not load.") : cbPartyWarning(book);
const cbPendingPartyRef = (line, rawTally) =>
  !rawTally && line?.needsPartyName ? cbPendingParty() + " · " + line.sourceRef : "";
const cbRegisterNoteTitle = () => bi("নোট", "Note");
const cbRegisterNoteRows = Array.from({length: 5}, (_, i) => [i + 1, i + 6]);
const cbNotesPrefix = "cash-book-notes:v1:";
function cbReadNotes(remarks) {
  let values = [remarks || ""];
  if (typeof remarks === "string" && remarks.startsWith(cbNotesPrefix)) {
    try {
      const stored = JSON.parse(remarks.slice(cbNotesPrefix.length));
      if (Array.isArray(stored)) values = stored;
    } catch { /* Preserve unrecognized remarks as the first note. */ }
  }
  return Array.from({length: 10}, (_, i) => typeof values[i] === "string" ? values[i] : "");
}
function cbWriteNotes(values) {
  const notes = values.map(value => value.trim());
  return notes.some(Boolean) ? cbNotesPrefix + JSON.stringify(notes) : "";
}
function cbNotesText(remarks) {
  if (typeof remarks !== "string") return "";
  if (!remarks.startsWith(cbNotesPrefix)) return remarks;
  return cbReadNotes(remarks).map((note, i) => note ? `${i + 1}. ${note}` : "").filter(Boolean).join("\n");
}

function cbRegisterSheet(book, paper = false) {
  const lines = book.lines || {}, receipts = lines.r || [], payments = lines.p || [], ref = lines.register;
  const [[, opening], [, receipt], [, payment], [, expected], [, counted], [, difference], [movementLabel, movement]] = cbRegisterTotals(book);
  const tally = book.source === "tally";
  const openingLabel = bi("শুরুর নগদ", "Opening cash");
  const totalReceipt = bi("মোট প্রাপ্তি", "Total receipts");
  const totalPayment = bi("মোট পরিশোধ", "Total payments");
  const rawTally = cbIsTallyReport(book), notes = cbReadNotes(book.remarks);
  const label = (line, side) => line ? `<strong>${esc(cbRegisterLineLabel(line, rawTally))}</strong>
    ${line.c ? `<small>${esc(line.c)}</small>` : ""}
    ${line.ref && !rawTally ? `<small>${cbVoucherLabel(side)} · ${esc(line.ref)}</small>` : ""}
    ${cbPendingPartyRef(line, rawTally) ? `<small>${esc(cbPendingPartyRef(line, rawTally))}</small>` : ""}
    ${line.note ? `<small class="cb-narr">${esc(line.note)}</small>` : ""}` : "";
  const amt = line => line ? cbRegisterMoney(line.a) : "";
  const rows = Array.from({ length: Math.max(5, receipts.length + 1, payments.length) }, (_, i) => {
    const r = receipts[i - 1], p = payments[i];
    return `<tr><td class="cb-reg-number">${i + 1}</td><td${i === 0 ? ' class="cb-reg-opening"' : ""}>${i === 0 ? `<strong>${openingLabel}</strong>` : label(r, "r")}</td>
      <td class="cb-reg-amount${i === 0 ? " cb-reg-opening" : ""}">${i === 0 ? cbRegisterMoney(opening) : amt(r)}</td>
      <td>${label(p, "p")}</td><td class="cb-reg-amount">${amt(p)}</td></tr>`;
  }).join("");
  const totals = values => values.map(([key, amount]) => `<div class="cb-reg-total"><span>${esc(key)}</span><b>${cbRegisterMoney(amount)}</b></div>`).join("");
  const weekday = new Date(book.date + "T12:00:00+06:00").toLocaleDateString(LANG === "en" ? "en-GB" : "bn-BD", {weekday:"long", timeZone:"Asia/Dhaka"});
  const status = tally ? cbRegisterSource(book) : book.status === "final" ? bi("ফাইনাল", "Final") : bi("দিন খোলা", "Day open");
  const warning = cbRegisterWarning(book);
  return `<div class="rep cb-register${paper ? " cb-register-paper" : ""}">
    <header class="cb-reg-head"><img src="icon-192.png" alt=""><div><b>NABIAD GROUP</b><h2>${cbRegisterTitle()}</h2></div></header>
    <div class="cb-reg-day"><strong>${cbRegisterSource(book)}</strong><span>${esc(weekday)} · <b>${dmy(book.date)}</b></span></div>
    ${warning || !(receipts.length || payments.length) ? `<p class="cb-reg-message">${esc(warning || bi("এই তারিখে কোনো লেনদেন নেই।", "No transactions for this date."))}</p>` : ""}
    <table class="rep-t cb-reg-table"><colgroup><col class="cb-reg-col-index"><col class="cb-reg-col-name"><col class="cb-reg-col-amount"><col class="cb-reg-col-name"><col class="cb-reg-col-amount"></colgroup>
    <thead><tr><th scope="col">#</th><th scope="col">${cbSideLabel("r")}</th><th scope="col" class="cb-reg-amount">${bi("টাকা", "Amount (Tk.)")}</th><th scope="col">${cbSideLabel("p")}</th><th scope="col" class="cb-reg-amount">${bi("টাকা", "Amount (Tk.)")}</th></tr></thead>
    <tbody>${rows}</tbody>
    <tbody class="cb-reg-totals">
      <tr><td></td><th scope="row">${totalReceipt}</th><td class="cb-reg-amount">${cbRegisterMoney(receipt)}</td><th scope="row">${totalPayment}</th><td class="cb-reg-amount">${cbRegisterMoney(payment)}</td></tr>
      <tr><td></td><th scope="row">${bi("শুরুর নগদসহ মোট", "Opening cash + receipts")}</th><td class="cb-reg-amount">${cbRegisterMoney(opening == null ? null : Math.round((opening + receipt) * 100) / 100)}</td>
      <th scope="row">${bi("দিনশেষে হাতে নগদ", "Closing cash · counted")}</th><td class="cb-reg-amount">${cbRegisterMoney(counted)}</td></tr>
    </tbody></table>
    ${rawTally ? "" : `<section class="cb-reg-block cb-reg-notes"><h3>${cbRegisterNoteTitle()}</h3>
      <ol>${cbRegisterNoteRows.flat().map(n => `<li><span>${n}.</span><span class="cb-note-line">${esc(notes[n - 1])}</span></li>`).join("")}</ol>
    </section>`}
    <div class="cb-reg-end">
    <section class="cb-reg-block cb-reg-closing"><h3>${bi("দিনশেষের সারাংশ", "Closing summary")}</h3><div class="cb-reg-closing-grid">${totals([
      [movementLabel, movement],
      [bi("হিসাব অনুযায়ী হাতে নগদ", "Expected closing cash"), expected],
      [bi("গুনে পাওয়া নগদ", "Counted cash"), counted],
      [bi("গুনে পাওয়া নগদের পার্থক্য", "Counted cash difference"), difference],
      ...cbRegisterReferences(ref)
    ])}</div></section>
    ${rawTally ? "" : `<div class="cb-reg-signatures">
      ${cbRegisterSigners().map(label => `<div>${esc(label)}</div>`).join("")}
    </div>`}
    <div class="rep-ft"><span>${[status, book.updated_at && cbRegisterDate(book.updated_at), esc(book.entered_by || "")].filter(Boolean).join(" · ")}</span><span>NABIAD Smart Finance Suite</span></div></div></div>`;
}
async function cbRegisterExcel(book) {
  await loadScript("vendor/xlsx.min.js");
  const lines = book.lines || {}, ref = lines.register;
  const rawTally = cbIsTallyReport(book), notes = cbReadNotes(book.remarks);
  const noteCell = n => `${n}. ${notes[n - 1] || "____________________________________"}`;
  const entry = l => [cbRegisterLineLabel(l, rawTally), l?.a ?? null,
    ...(!rawTally ? [l?.ref || (l?.needsPartyName ? l.sourceRef : "")] : []),
    [cbPendingPartyRef(l, rawTally), l?.note].filter(Boolean).join(" · ")];
  const headings = side => [cbSideLabel(side), "৳", ...(!rawTally ? [cbVoucherLabel(side)] : []), cbNarrationLabel()];
  const rows = Array.from({ length: Math.max(lines.r?.length || 0, lines.p?.length || 0) }, (_, i) => [i + 1, ...entry(lines.r?.[i]), ...entry(lines.p?.[i])]);
  const cells = [
    [cbRegisterTitle(), book.date, cbRegisterSource(book), cbRegisterDate(book.updated_at), book.entered_by || ""],
    ["#", ...headings("r"), ...headings("p")],
    ...rows, [],
    ...(rawTally ? [] : [[cbRegisterNoteTitle()], ...cbRegisterNoteRows.map(([left, right]) =>
      [noteCell(left), null, null, null, null, noteCell(right)]), []]),
    [bi("দিনশেষের সারাংশ", "Closing summary")], ...cbRegisterTotals(book), ...cbRegisterReferences(ref),
    ...(cbRegisterWarning(book) ? [[cbRegisterWarning(book)]] : [])
  ];
  const signers = rawTally ? [] : cbRegisterSigners();
  const signatureRow = cells.length + 3;
  if (signers.length) {
    const spread = values => values.flatMap(value => [value, null, null]);
    cells.push([], [], [], spread(signers.map(() => "____________________")), spread(signers));
  }
  const ws = XLSX.utils.aoa_to_sheet(cells);
  const summaryTitleRow = rows.length + 3 + (rawTally ? 0 : cbRegisterNoteRows.length + 2);
  const summaryEnd = summaryTitleRow + cbRegisterTotals(book).length + cbRegisterReferences(ref).length;
  const formatAmount = (r, c) => {
    const cell = ws[XLSX.utils.encode_cell({r, c})];
    if (cell?.t === "n") cell.z = "#,##0";
  };
  for (let r = 2; r < rows.length + 2; r++) {
    formatAmount(r, 2);
    formatAmount(r, rawTally ? 5 : 6);
  }
  for (let r = summaryTitleRow + 1; r <= summaryEnd; r++) formatAmount(r, 1);
  if (signers.length) {
    const noteStart = rows.length + 4;
    ws["!rows"] = [];
    for (let i = 0; i < cbRegisterNoteRows.length; i++) ws["!rows"][noteStart + i] = {hpt: 24};
    ws["!merges"] = cbRegisterNoteRows.flatMap((_, i) => [[0, 3], [5, 8]].map(([first, last]) =>
      ({s: {r: noteStart + i, c: first}, e: {r: noteStart + i, c: last}})));
    ws["!merges"].push(...[signatureRow, signatureRow + 1].flatMap(r => signers.map((_, i) =>
      ({s: {r, c: i * 3}, e: {r, c: i * 3 + 2}}))));
  }
  const widths = rawTally ? [6, 38, 16, 42, 38, 16, 42] : [6, 38, 16, 22, 42, 38, 16, 22, 42];
  ws["!cols"] = widths.map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cash Register");
  return new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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
    const page = 3 + i * 3, w = Math.min(555, 802 * width / height), h = w * height / width;
    const left = (595 - w) / 2;
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Register ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`);
    const commands = `q\n${w.toFixed(4)} 0 0 ${h.toFixed(4)} ${left.toFixed(4)} ${(822 - h).toFixed(4)} cm\n/Register Do\nQ\n`;
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
  // Use the same export width on phones and desktops. PDF uses the compact paper layout.
  const stage = document.createElement("div"), paper = el.cloneNode(true);
  stage.className = "cb-export-stage";
  stage.setAttribute("aria-hidden", "true");
  if (format === "pdf") paper.classList.add("cb-register-paper");
  stage.append(paper);
  document.body.append(stage);
  try {
    await document.fonts?.ready;
    if (format === "png") return cbCanvasBlob(await dcCanvas(paper), "image/png");
    const pages = [];
    const capture = async () => {
      const canvas = await dcCanvas(paper);
      const bytes = new Uint8Array(await (await cbCanvasBlob(canvas, "image/jpeg")).arrayBuffer());
      pages.push({bytes, width: canvas.width, height: canvas.height});
    };
    const fits = () => {
      const {width, height} = paper.getBoundingClientRect();
      return height <= width * 802 / (555 * 0.90);
    };
    if (fits()) {
      await capture();
      return cbRegisterPdf(pages);
    }

    const table = $(".cb-reg-table", paper), body = table.tBodies[0];
    const totals = $(".cb-reg-totals", table), notes = $(".cb-reg-notes", paper), end = $(".cb-reg-end", paper);
    const rows = [...body.rows];
    const addCashTotals = () => {
      table.append(totals);
      if (notes) paper.append(notes);
    };
    const removeCashTotals = () => {
      totals.remove();
      notes?.remove();
    };
    body.replaceChildren();
    removeCashTotals();
    end.remove();
    for (const row of rows) {
      body.append(row);
      if (body.rows.length > 1 && !fits()) {
        row.remove();
        await capture();
        body.replaceChildren(row);
      }
    }

    // Keep the handwritten notes on the same page as the cash totals.
    addCashTotals();
    if (body.rows.length && !fits()) {
      const remaining = [...body.rows];
      const last = remaining.at(-1);
      body.replaceChildren(last);
      const carryLast = remaining.length > 1 && fits();
      removeCashTotals();
      body.replaceChildren(...(carryLast ? remaining.slice(0, -1) : remaining));
      await capture();
      body.replaceChildren(...(carryLast ? [last] : []));
      addCashTotals();
    }

    paper.append(end);
    if (!fits()) {
      end.remove();
      await capture();
      table.remove();
      notes?.remove();
      paper.append(end);
    }
    await capture();
    return cbRegisterPdf(pages);
  } finally {
    stage.remove();
  }
}
function cbRegisterModal(book) {
  const name = cbRegisterFilename(book), sheet = cbRegisterSheet(book);
  const closeLabel = bi("বন্ধ", "Close");
  const formats = [["xlsx", "table", "Excel"], ["pdf", "list", "PDF"], ["png", "img", bi("ছবি", "Image")]];
  modal(`<h2 aria-label="${cbRegisterTitle()}"><span>${cbRegisterTitle()}</span>
    <button type="button" class="cb-register-close" data-register-close aria-label="${closeLabel}" title="${closeLabel}">${ico("x")}</button></h2>
    <div class="modal-body cb-register-preview">${sheet}</div>
    <div class="modal-actions cb-register-actions">
      ${formats.map(([format, icon, label]) => `<button type="button" class="btn cb-action" data-register-format="${format}">${ico(icon)}<span>${label}</span></button>`).join("")}
      <button type="button" class="btn cb-action" data-register-print>${ico("print")}<span>${bi("প্রিন্ট", "Print")}</span></button>
      <button type="button" class="btn cb-action" data-register-share hidden>${ico("share")}<span>${bi("ফাইল শেয়ার", "Share file")}</span></button>
      <span class="mut sm" data-register-status role="status"></span>
    </div>`, (root, close) => {
    root.querySelector(".modal").classList.add("cb-register-dialog");
    let file = null, loading = false;
    const exports = $$("[data-register-format], [data-register-print]", root);
    const share = $("[data-register-share]", root), status = $("[data-register-status]", root);
    $("[data-register-close]", root).onclick = close;
    $("[data-register-print]", root).onclick = () => printSheet(cbRegisterSheet(book, true), name);
    share.onclick = async () => {
      try { if (file) await navigator.share({ files: [file], title: name }); }
      catch (e) { if (e.name !== "AbortError") toast(e.message, "err"); }
    };
    $$("[data-register-format]", root).forEach(btn => btn.onclick = async () => {
      if (loading) return;
      loading = true; exports.forEach(control => { control.disabled = true; }); share.hidden = true; file = null;
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
      finally { loading = false; exports.forEach(control => { control.disabled = false; }); }
    });
  });
}

/* ---------- the Cash Book page ---------- */
function cbWorkflowError(error) {
  const message = error.message || String(error);
  if (/cashbook_conflict/.test(message)) return bi("অন্য কেউ হিসাব বদলেছেন। তারিখটি আবার খুলে মিলিয়ে নিন।", "Another user updated this day. Reopen the date and review before retrying.");
  if (/cashbook_permission/.test(message)) return bi("এই এন্ট্রি বদলানোর অনুমতি বা সময়সীমা নেই।", "Permission denied or the edit window has closed.");
  if (/cashbook_write|cashbook_edit_imported|PGRST202/.test(message)) return bi("Cash Book-এর database update এখনো প্রয়োগ করা হয়নি।", "The Cash Book database update is required.");
  if (/cashbook_invalid_line/.test(message)) return bi("বিবরণ, অঙ্ক, রেফারেন্স ও নোট যাচাই করুন।", "Check the particulars, amount, reference and note.");
  return message;
}

Object.assign(SbAPI, {
  async lastCashActivityDates(through) {
    const results = await Promise.allSettled(["cashbook_days", "cash_records", "cash_tally_vouchers"].map(async table => {
      const {data, error} = await sb.from(table).select("date").lte("date", through)
        .order("date", {ascending: false}).limit(1);
      if (error) throw error;
      return data?.[0]?.date;
    }));
    return results.map(result => result.value).filter(Boolean);
  },
  async cbEditImported(date, side, item, data) {
    const {data: saved, error} = await sb.rpc("cashbook_edit_imported", {
      p_date: date, p_type: side === "r" ? "receipt" : "payment", p_ref: item.sourceRef,
      p_version: item.editVersion ?? null, p_data: {n: data.n, a: data.a, ref: data.ref, note: data.note}
    });
    if (error) throw error;
    return saved;
  },
  async cbMutate(date, version, action, side, index, data) {
    const result = await sb.rpc("cashbook_write", { p_date: date, p_version: version, p_action: action, p_side: side, p_index: index, p_data: data });
    if (result.error) throw result.error;
    return Array.isArray(result.data) ? result.data[0] : result.data;
  }
});

Object.assign(DemoAPI, {
  async lastCashActivityDates(through) {
    const [books, records, vouchers] = await Promise.all([
      this.cbRange("0001-01-01", through), this.cashRange("0001-01-01", through),
      this.cashTallyRange("0001-01-01", through)
    ]);
    return [books, records, vouchers].map(rows => rows.map(row => row.date).sort().pop()).filter(Boolean);
  },
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
  const localDay = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Dhaka" });
  const handoff = sessionStorage.getItem("nabiad_cash_date");
  const [latest] = await Promise.all([handoff ? [] : API.lastCashActivityDates(localDay), cashGroupLoad()]);
  if (token !== ROUTE_TOK) return;
  const last = [...latest, S.lastBook, S.lastCash].filter(date => date && date <= localDay).sort().pop();
  const initial = handoff || last || localDay;
  sessionStorage.removeItem("nabiad_cash_date");
  v.innerHTML = head(ROUTES[CUR].t, `<button type="button" class="btn cb-action" id="cb-led">${ico("list")}<span>${bi("লেজার", "Ledgers")}</span></button>
    <a class="btn cb-action" href="#/cashchk" id="cb-checker">${ico("check")}<span>${bi("ক্যাশ চেকার", "Cash Checker")}</span></a>
    <a class="btn cb-action cb-summary-link" href="#/cashsum">${ico("chart")}<span>${bi("সামারি", "Summary")}</span></a>`, "tc cb-page-head") +
    `<div class="card tbar navcard cb-date-card"><div class="cb-date-row">
      ${dateNav("cb", initial > localDay ? localDay : initial)}
      <dl class="cb-date-stats" aria-label="${bi("দিনের সারাংশ", "Daily totals")}">
        <div><dt>${bi("মোট ব্যাংক ক্লোজিং", "Total Bank Closing")}</dt><dd id="cb-bank-total">—</dd></div>
        <div><dt>${bi("ডিস্ট্রিবিউশন কালেকশন", "Distribution Collection")}</dt><dd id="cb-collection-total">—</dd></div>
        <div><dt>${bi("নগদের পার্থক্য", "Cash Difference")}</dt><dd id="cb-df">—</dd></div>
      </dl></div><div id="cb-msg"></div></div><div id="cb-body"></div>`;
  const body = $("#cb-body", v), dateInput = $("#cb-d", v), msg = $("#cb-msg", v);
  dateInput.max = localDay;
  let revision = 0, activitySide = "r", reportMode = "app", saving = false, canSwitchDate = () => true;
  const dateStat = key => $("#cb-" + key, v);
  const sides = ["r", "p"];
  $("#cb-led", v).onclick = () => cbLedgerModal();
  $("#cb-checker", v).onclick = () => sessionStorage.setItem("nabiad_cash_date", dateInput.value);
  async function draw(focusSide = null, reopenNotes = false) {
    const date = dateInput.value, drawId = ++revision;
    canSwitchDate = () => true;
    for (const key of ["bank-total", "collection-total", "df"]) {
      dateStat(key).textContent = "—";
      dateStat(key).className = "";
    }
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
    const openingDraft = String(pending.balance?.opening_cash ?? "").trim();
    const draftAmount = /\d/.test(openingDraft) ? evalAmt(openingDraft) : NaN;
    const openingInput = fmtIn(Number.isFinite(draftAmount) ? draftAmount : opening);
    const moneyText = amount => amount == null ? "—" : "৳ " + money(amount);
    const references = cbRegisterSummary(date, true, lines.register);
    const savedRemarks = book?.remarks ?? "";
    const notes = pending.notes || cbReadNotes(pending.balance?.remarks ?? savedRemarks);
    let tallyRequest;
    const tallyVouchers = () => tallyRequest ||= API.cashTallyRange(date, date)
      .catch(error => { tallyRequest = null; throw error; });
    const tallySnapshot = async forCashBook => {
      const [vouchers, ledgers, details, legacy, savedReferences] = await Promise.all([
        tallyVouchers(), cbLedLoad(), cbTallyReportDetails(date, forCashBook), API.cashOn(date).catch(() => null),
        references
      ]);
      const cash = cashUseBook(book, legacy) ? book : legacy;
      return cbTallyRegister(date, vouchers, ledgers.list, details, cash, savedReferences, previous);
    };
    const controls = (side, cls) => `<section class="card csec ${cls}" data-cb-form="${side}" hidden><div class="csh"><h3>${cbSideLabel(side)}</h3><b id="cb-T${side}"></b></div>
      <form class="cb-compose"><label>${bi("বিবরণ", "Particulars")}<input class="in cbname" autocomplete="off" required></label>
        <label>${bi("অঙ্ক", "Amount")}<input class="in cbamt2" inputmode="decimal" required></label>
        <label>${cbVoucherLabel(side)}<input class="in cbref" autocomplete="off"></label>
        <label class="cb-compose-account" hidden>${bi("ব্যাংক A/C", "Bank account")}<select class="in cbac"><option value="">${bi("A/C বাছুন", "Select A/C")}</option>
        ${S.accounts.map(a => `<option value="${esc(a.code)}">${esc(a.code)} · ${esc(a.holder || "")}</option>`).join("")}</select></label>
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
        <div class="cb-opening-field"><span aria-hidden="true">৳</span><input id="cb-oc" class="cell cbopen" aria-labelledby="cb-opening-label" inputmode="decimal" value="${esc(openingInput)}" ${admin ? "" : "disabled"}></div></div></section>
      <div class="cb-entry-sides">${controls("r", "c-rec")}${controls("p", "c-pay")}</div>
      ${recoverable.length && mayAdd ? `<details class="card cb-recovery"><summary>${bi("এই ডিভাইসের আগের অসম্পূর্ণ লাইন", "Previous unsaved lines on this device")} (${recoverable.length})</summary>
        <ul>${recoverable.map(({side, item}, index) => `<li><span>${cbSideLabel(side)} · ${esc(item.n)} · ${moneyText(item.a)}</span><button type="button" class="btn sm" data-cb-recover="${index}">${bi("ফর্মে নিন", "Load into form")}</button></li>`).join("")}</ul></details>` : ""}
      <section class="card csec"><div class="csh"><h3>${bi("খাত অনুযায়ী যোগফল", "Totals by category")}</h3></div><div id="cb-sum"></div></section>
      <section class="card csec c-close"><div class="csh"><h3>${bi("হিসাব মেলানো", "Balance")}</h3></div>
        <div class="crow hl"><label for="cb-ch">${bi("হাতে ক্যাশ (গুনে লিখুন)", "Cash in hand (count and enter)")}</label><div class="cb-count-input">
          <input class="cell" id="cb-ch" inputmode="decimal" aria-describedby="cb-inline-closing cb-inline-diff" value="${esc(pending.balance?.cash_in_hand ?? (book?.cash_in_hand == null ? "" : fmtIn(book.cash_in_hand)))}" ${mayBalance ? "" : "disabled"}>
          <div class="cb-inline-balance"><strong id="cb-inline-closing"></strong><strong id="cb-inline-diff"></strong></div></div></div>
        <details class="cb-day-notes"${reopenNotes ? " open" : ""}>
          <summary>${ico("list")} <span>${cbRegisterNoteTitle()}</span></summary>
          <div class="cb-note-fields">
            ${notes.map((note, i) => `<label><span>${i + 1}</span><textarea class="in" rows="2" id="cb-note-${i + 1}" aria-label="${cbRegisterNoteTitle()} ${i + 1}" ${mayBalance ? "" : "readonly"}>${esc(note)}</textarea></label>`).join("")}
          </div>
          ${mayBalance ? `<div class="cb-row-actions"><button type="button" class="btn" id="cb-note-save" disabled>${ico("save")} ${bi("নোট সেভ করুন", "Save notes")}</button></div>` : ""}
        </details>
        ${mayBalance ? `<div class="cb-row-actions">${final
          ? `<button type="button" class="btn" id="cb-balance">${bi("নগদের হিসাব আপডেট", "Update cash count")}</button>`
          : `<button type="button" class="btn pri" id="cb-close-day">${ico("check")} ${bi("দিন বন্ধ করুন", "Close day")}</button>`}</div>` : ""}
      </section>
      <div class="hint rd" id="cb-err" role="alert"></div>
      </div><div class="cb-review"><section class="card flush cb-activity" aria-labelledby="cb-activity-title">
        <div class="ch cb-activity-head"><h3 id="cb-activity-title">${bi("দিনের ক্যাশ লেনদেন", "Cash Book activity")}</h3><time datetime="${date}">${dmy(date)}</time></div>
        <div class="cb-activity-body">
          <div class="cb-report-controls">
            <div class="cb-activity-filters" role="group" aria-label="${bi("লেনদেনের ধরন", "Transaction type")}">
              ${sides.map(side => `<button type="button" class="btn sm" data-cb-side="${side}" aria-controls="cb-activity-lines" aria-pressed="false">${cbSideLabel(side)} <span class="cb-side-count">${(lines[side] || []).length}</span></button>`).join("")}
            </div>
            <label class="cb-report-source">${bi("রিপোর্টের উৎস", "Report source")}
              <select class="in" id="cb-report-source">
                <option value="app">${bi("ক্যাশ খাতা", "Cash Book")}</option>
                <option value="tally">${bi("Tally ভাউচার", "Tally vouchers")}</option>
              </select>
            </label>
            <button type="button" id="cb-register" class="btn pri">${ico("table")}<span>${bi("দেখুন / Export", "View / Export")}</span></button>
          </div>
          <div class="cb-activity-status">
            <p id="cb-activity-source" class="mut sm" role="status"></p>
            <button type="button" class="btn sm cb-party-open" id="cb-party-open" aria-haspopup="dialog"
              aria-label="${bi("যাচাই বাকি ভাউচার দেখুন", "View receipts needing party names")}"
              title="${bi("যাচাই বাকি ভাউচার দেখুন", "View receipts needing party names")}" hidden>${ico("list")}</button>
          </div>
          <dl class="cb-activity-totals"><div class="cb-stat-wide"><dt>${bi("শুরুর নগদ", "Opening cash")}</dt><dd id="cb-x1"></dd></div></dl>
          <ol id="cb-activity-lines" class="cb-activity-lines" role="list"></ol><p id="cb-activity-empty" class="mut sm" hidden></p>
          <dl class="cb-activity-totals">
            <div class="cb-stat-receipt"><dt>${bi("মোট প্রাপ্তি", "Total Receipt")}</dt><dd id="cb-x2"></dd></div>
            <div class="cb-stat-payment"><dt>${bi("মোট পরিশোধ", "Total Payment")}</dt><dd id="cb-x3"></dd></div>
            <div class="cb-stat-wide"><dt>${bi("নিট নগদ প্রবাহ", "Net cash movement")}</dt><dd id="cb-movement"></dd></div>
            <div><dt>${bi("হাতে থাকার কথা", "Expected cash")}</dt><dd id="cb-x4"></dd></div>
            <div class="cb-stat-counted"><dt>${bi("হাতে ক্যাশ", "Cash in hand")}</dt><dd id="cb-counted"></dd></div>
          </dl>
        </div></section>
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
    const post = async (action, side = null, index = null, data = {}, onSuccess, importedItem = null) => {
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
      try {
        changed = importedItem
          ? await API.cbEditImported(date, side, importedItem, data)
          : await API.cbMutate(date, book?.updated_at ?? null, action, side, index, data);
      }
      catch (error) { if (current()) fail(error); }
      finally { buttons.forEach((button, i) => { button.disabled = disabled[i]; }); saving = false; }
      if (!changed) return;
      onSuccess?.();
      storePending();
      if (!current()) return;
      if (changed.status === "final" && (!S.lastBook || date > S.lastBook)) { S.lastBook = date; refreshBadges(); }
      cbLearn(true);
      toast(action === "close" ? bi("দিনের হিসাব বন্ধ হয়েছে", "Day closed") : bi("আপডেট হয়েছে", "Cash Book updated"));
      const reopen = !!$(".cb-day-notes[open]", body);
      await draw(action === "add" && matchMedia("(pointer:fine)").matches ? side : null, reopen);
    };

    let activityBook = null;
    const mayUpdateImported = () => admin && activityBook?.importedForCashBook && activityBook.importedEditable;
    const drawActivity = () => {
      const imported = activityBook?.source === "tally";
      const rawTally = cbIsTallyReport(activityBook);
      for (const button of $$("[data-cb-side]", body)) {
        button.setAttribute("aria-pressed", String(button.dataset.cbSide === activitySide));
        $(".cb-side-count", button).textContent = activityBook ? (activityBook.lines[button.dataset.cbSide]?.length || 0) : "—";
      }
      const entries = activityBook?.lines[activitySide] || [];
      get("activity-lines").innerHTML = entries.map((item, index) => `<li><div class="cb-activity-entry"><span class="cb-entry-number" aria-hidden="true">${index + 1}.</span><div><strong>${esc(cbRegisterLineLabel(item, rawTally))}</strong>
        ${item.ref || item.c ? `<small>${esc([item.ref && cbVoucherLabel(activitySide) + " " + item.ref, item.c].filter(Boolean).join(" · "))}</small>` : ""}
        ${cbPendingPartyRef(item, rawTally) ? `<small class="am">${esc(cbPendingPartyRef(item, rawTally))}</small>` : ""}
        ${item.note ? `<small class="cb-narr">${esc(item.note)}</small>` : ""}</div></div>
        <div class="cb-record-actions"><b class="num">${moneyText(item.a)}</b>
          ${(imported ? mayUpdateImported() : mayUpdate(item)) ? `<button type="button" class="btn sm" data-cb-edit="${index}">${bi("এডিট", "Edit")}</button>` : ""}
          ${!imported && admin ? `<button type="button" class="btn sm" data-cb-delete="${index}">${bi("মুছুন", "Delete")}</button>` : ""}
        </div></li>`).join("");
      get("activity-lines").hidden = !entries.length;
      get("activity-empty").hidden = !activityBook || !!entries.length;
      const values = activityBook ? cbRegisterTotals(activityBook).map(row => row[1]) : [];
      const [open, receipts, payments, expected, counted, diff, movement] = values;
      for (const [id, value] of Object.entries({x1: open, x2: receipts, x3: payments, x4: expected, counted, movement})) get(id).textContent = moneyText(value);
      get("movement").className = movement == null ? "" : movement < 0 ? "rd" : movement > 0 ? "gr" : "";
      dateStat("df").className = diff == null ? "mut" : diff === 0 ? "gr" : diff > 0 ? "am" : "rd";
      dateStat("df").textContent = diff == null ? "—" : diff === 0 ? bi("৳ ০ · মিলেছে", "৳ 0 · Matches")
        : moneyText(Math.abs(diff)) + " · " + (diff > 0 ? bi("ক্যাশ বেশি", "Cash over") : bi("ক্যাশ কম", "Cash short"));
      get("activity-empty").textContent = activitySide === "r" ? bi("কোনো প্রাপ্তি নেই।", "No receipts.") : bi("কোনো পরিশোধ নেই।", "No payments.");
    };
    const loadForm = (side, item = {}, index = null, focus = false, importedItem = null) => {
      const state = formState[side];
      state.index = index;
      state.importedItem = importedItem;
      state.dirtyEdit = false;
      state.section.hidden = !mayAdd && index == null;
      state.name.value = item.n || "";
      state.amount.value = item.x ?? (item.a == null ? "" : fmtIn(item.a));
      state.ref.value = item.ref ?? importedItem?.sourceRef ?? "";
      state.note = item.note ?? "";
      state.category = importedItem ? "" : item.k || cbGuess(item.n, side)?.k || "";
      state.account.value = item.c || "";
      state.account.parentElement.hidden = !CB_BANK.includes(state.category);
      state.cancel.hidden = index == null;
      $("button[type=submit] span", state.section).textContent = index == null ? bi("যোগ করুন", "Add") : bi("আপডেট", "Update");
      if (focus) state.name.focus();
    };
    for (const side of sides) {
      const section = $(`[data-cb-form="${side}"]`, body), form = $("form", section);
      const state = formState[side] = {section, name: $(".cbname", form), amount: $(".cbamt2", form), ref: $(".cbref", form), account: $(".cbac", form), cancel: $(".cb-cancel", form)};
      const guess = () => {
        if (state.importedItem) return;
        const mapping = cbGuess(state.name.value, side), oldCategory = state.category;
        state.category = mapping?.k || "";
        state.account.parentElement.hidden = !CB_BANK.includes(state.category);
        state.account.value = mapping?.c || (oldCategory === state.category ? state.account.value : "");
      };
      suggest(state.name, () => cbLedItems(side), guess, { free: true, max: 30 });
      state.name.addEventListener("picked", () => state.amount.focus());
      state.name.oninput = guess;
      const read = () => ({ n: state.name.value.trim(), x: state.amount.value.trim(), ref: state.ref.value.trim(), note: state.note, k: state.category, c: state.account.value });
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
        const { index, importedItem } = state, amount = Math.round(value * 100) / 100;
        if (importedItem) {
          if (!admin) return;
          if (amount <= 0) return fail(new Error(bi("শূন্যের বেশি অঙ্ক লিখুন।", "Enter an amount greater than zero.")));
        } else if (index == null ? !mayAdd : !mayUpdate(lines[side]?.[index])) return;
        activitySide = side;
        post(index == null ? "add" : "edit", side, index, { ...data, a: amount }, () => {
          if (index == null) delete pending[side];
        }, importedItem);
      };
      state.cancel.onclick = () => loadForm(side, pending[side]);
      loadForm(side, pending[side], null, side === focusSide && mayAdd);
    }
    for (const button of $$("[data-cb-side]", body)) button.onclick = () => { activitySide = button.dataset.cbSide; drawActivity(); };
    get("activity-lines").onclick = event => {
      const target = event.target.closest("[data-cb-edit], [data-cb-delete]");
      if (!target || !activityBook || cbIsTallyReport(activityBook)) return;
      const side = activitySide, imported = activityBook.importedForCashBook;
      const index = Number(target.dataset.cbEdit ?? target.dataset.cbDelete);
      const item = activityBook.lines[side]?.[index];
      if (!item) return;
      if (target.hasAttribute("data-cb-edit")) {
        if (imported ? !mayUpdateImported() : !mayUpdate(item)) return;
        if (hasEditedLine()) return fail(new Error(bi("চলতি এডিট আগে আপডেট বা বাতিল করুন।", "Update or cancel the current edit first.")));
        loadForm(side, imported ? { ...item, n: cbRegisterLineLabel(item) } : item, index, true, imported ? item : null);
      } else if (!imported && admin && ask(bi("এই লেনদেনটি মুছে ফেলবেন?", "Delete this transaction?"))) post("delete", side, index);
    };
    for (const button of $$("[data-cb-recover]", body)) button.onclick = () => {
      const {side, item} = recoverable[Number(button.dataset.cbRecover)];
      if (pending[side]?.n && !ask(bi("ফর্মের বর্তমান লাইন বদলাবেন?", "Replace the current unsaved line in the form?"))) return;
      pending[side] = item; storePending(); loadForm(side, item, null, true);
    };
    const nativeGrouping = cbGroup({lines});
    const nativeBook = { ...book, date, opening_cash: opening, lines: { ...lines } };
    let cashBookActivity = cbHasSavedLines(lines) ? nativeBook : null;
    const drawCategoryTotals = () => {
      const grouped = cbGroup(cashBookActivity);
      get("sum").innerHTML = `<div class="cbsg">${sides.map(side => `<div><h4>${cbSideLabel(side)}</h4>${CB_CAT[side].filter(key => grouped.items[key]?.a).map(key =>
      `<div class="cbs"><span>${esc(cbCatName(key))}</span><b>${moneyText(grouped.items[key].a)}</b></div>`).join("") || "—"}</div>`).join("")}</div>`
        + (grouped.warn.un ? `<p class="mut sm">${bi("ম্যাপ করা হয়নি এমন লাইন Others-এ ধরা হয়েছে।", "Unmapped lines are counted under Others.")}</p>` : "");
    };
    const preview = () => {
      const openingValue = get("oc").value;
      const open = admin ? (/\d/.test(openingValue) ? evalAmt(openingValue) : NaN) : +opening;
      const counted = get("ch").value.trim() ? evalAmt(get("ch").value) : null;
      const hasActivity = cashBookActivity && !cashBookActivity.importedVouchersUnavailable;
      const {R, P, exp} = hasActivity ? cbTot({ opening_cash: open, lines: cashBookActivity.lines }) : {};
      const diff = counted == null || !Number.isFinite(open) || !Number.isFinite(counted) || !Number.isFinite(exp) ? null : Math.round((counted - exp) * 100) / 100;
      const direction = diff == null ? "—" : diff > 0 ? moneyText(diff) + " · " + bi("ক্যাশ বেশি", "Cash over")
        : diff < 0 ? moneyText(Math.abs(diff)) + " · " + bi("ক্যাশ কম", "Cash short") : bi("৳ ০ · মিলেছে", "৳ 0 · Matches");
      const tone = diff === 0 ? "gr" : diff > 0 ? "am" : diff < 0 ? "rd" : "mut";
      for (const [id, value] of Object.entries({Tr: R, Tp: P})) get(id).textContent = moneyText(value);
      get("inline-closing").textContent = bi("ক্যাশ ক্লোজিং", "Cash Closing") + " = " + (Number.isFinite(open) && Number.isFinite(exp) ? moneyText(exp) : "—");
      get("inline-diff").textContent = bi("পার্থক্য", "Diff.") + " = " + direction;
      get("inline-diff").className = tone;
      return {open, counted, diff};
    };
    const currentNotes = () => notes.map((_, i) => get("note-" + (i + 1)).value);
    const remarks = () => cbWriteNotes(currentNotes());
    const noteSave = get("note-save");
    if (noteSave) {
      noteSave.disabled = remarks() === cbWriteNotes(cbReadNotes(savedRemarks));
      $$(".cb-note-fields textarea", body).forEach(field => field.oninput = () => {
        pending.notes = currentNotes();
        noteSave.disabled = remarks() === cbWriteNotes(cbReadNotes(savedRemarks));
        storePending();
      });
      noteSave.onclick = () => post("balance", null, null, {remarks: remarks()}, () => {
        delete pending.notes;
        if (pending.balance) delete pending.balance.remarks;
      });
    }
    for (const id of ["oc", "ch"]) get(id).oninput = () => {
      if (noteSave) pending.notes = currentNotes();
      pending.balance = { opening_cash: get("oc").value, cash_in_hand: get("ch").value };
      storePending();
      preview();
    };
    const saveBalance = async close => {
      if (saving || !current()) return;
      if (close && (!cashBookActivity || cashBookActivity.importedVouchersUnavailable)) {
        return fail(new Error(bi("দিন বন্ধ করার আগে ক্যাশ লেনদেন লোড করুন।", "Load the Cash Book transactions before closing the day.")));
      }
      const {open, counted, diff} = preview();
      if (!Number.isFinite(open) || counted !== null && !Number.isFinite(counted) || (close || final) && counted == null) {
        get(!Number.isFinite(open) ? "oc" : "ch").focus();
        return fail(new Error(bi("সঠিক শুরুর নগদ ও হাতে ক্যাশ লিখুন।", "Enter valid opening and counted cash amounts.")));
      }
      if (sides.some(side => formState[side].index != null || ["n", "x", "ref", "note"].some(key => pending[side]?.[key])) && close) {
        return fail(new Error(bi("দিন বন্ধ করার আগে অসম্পূর্ণ লাইন যোগ বা বাতিল করুন।", "Add or clear any unsaved lines before closing the day.")));
      }
      if (close && !ask(diff ? bi("ক্যাশে পার্থক্য আছে। দিন বন্ধ করবেন?", "Cash differs from the expected amount. Close this day?") : bi("দিনের হিসাব বন্ধ করবেন?", "Close this Cash Book day?"))) return;
      if (close && nativeGrouping.warn.noAc) return fail(new Error(bi("ব্যাংকের লাইনগুলোতে A/C নির্বাচন করুন।", "Choose an account on each bank line before closing.")));
      const data = { ...(admin ? {opening_cash: open} : {}), cash_in_hand: counted, remarks: remarks() };
      await post(close ? "close" : "balance", null, null, data, () => { delete pending.balance; delete pending.notes; });
    };
    if (get("balance")) get("balance").onclick = () => saveBalance(false);
    if (get("close-day")) get("close-day").onclick = () => saveBalance(true);
    const reportSource = get("report-source");
    reportSource.value = reportMode;
    references.then(result => {
      if (!current()) return;
      dateStat("bank-total").textContent = moneyText(result.bank);
      dateStat("collection-total").textContent = moneyText(result.collection);
    }, () => {});
    let cashBookRequest;
    const loadCashBookActivity = () => cashBookRequest ||= cbActivitySnapshot("app", nativeBook, () => tallySnapshot(true)).then(snapshot => {
      if (snapshot.importedVouchersUnavailable) cashBookRequest = null;
      if (current()) {
        cashBookActivity = snapshot;
        drawCategoryTotals();
        preview();
      }
      return snapshot;
    });
    const partyButton = get("party-open");
    partyButton.onclick = () => cbPendingReceiptsModal(activityBook);
    let sourceRequest;
    const loadActivity = () => {
      partyButton.hidden = true;
      activityBook = null;
      drawActivity();
      const note = get("activity-source");
      note.textContent = bi("ভাউচার লোড হচ্ছে…", "Loading vouchers…");
      const source = reportSource.value;
      const requested = Promise.all([source === "app" ? loadCashBookActivity() : tallySnapshot(false), references])
        .then(([snapshot, register]) => ({ ...snapshot, lines: { ...snapshot.lines, register } }));
      sourceRequest = requested;
      requested.then(snapshot => {
        if (!current() || sourceRequest !== requested) return;
        activityBook = snapshot;
        partyButton.hidden = !cbPendingReceipts(snapshot).length;
        note.textContent = cbIsTallyReport(snapshot) ? bi("আমদানি করা Tally ভাউচার", "Imported Tally vouchers")
          : snapshot.importedVouchersUnavailable ? bi("আমদানি করা লেনদেন লোড হয়নি।", "Imported transactions could not load.")
          : admin && snapshot.importedForCashBook && !snapshot.importedEditable
            ? bi("এই লেনদেন এডিট করতে ডাটাবেস আপডেট প্রয়োজন।", "A database update is required to edit these entries.") : cbPartyWarning(snapshot);
        drawActivity();
      }, () => {
        if (!current() || sourceRequest !== requested) return;
        note.textContent = bi("ভাউচার লোড হয়নি। অন্য উৎস বেছে নিয়ে আবার চেষ্টা করুন।", "Vouchers could not load. Switch sources and try again.");
      });
    };
    reportSource.onchange = () => { reportMode = reportSource.value; loadActivity(); };
    const withReport = (button, action) => async () => {
      button.disabled = true;
      try {
        const requested = sourceRequest;
        const snapshot = await requested;
        if (current() && requested === sourceRequest) await action(snapshot);
      } catch (error) { if (current()) toast(cashErr(error), "err"); }
      finally { button.disabled = false; }
    };
    get("register").onclick = withReport(get("register"), snapshot =>
      cbRegisterModal({ ...snapshot, remarks: remarks() }));
    drawCategoryTotals();
    preview();
    if (reportMode === "tally") loadCashBookActivity();
    loadActivity();
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
   ${mappingOnly ? `<p class="mut sm">${bi("Tally voucher ও নতুন Cash Book এন্ট্রির Receipt এবং Payment খাত নির্ধারণ করুন। কোনো খাতে একটিমাত্র সক্রিয় লেজার ম্যাপ করা থাকলে Cash Checker-এর খাতের মোটে সেই নাম দেখা যাবে।","Set receipt and payment groups for Tally vouchers and future Cash Book entries. Cash Checker category totals show a ledger label where one active ledger is mapped.")}</p>` : `<p class="mut sm">${bi("এখানে ক্যাশ এন্ট্রির লেজার, প্রাপ্তি ও পরিশোধের খাত এবং ব্যাংক অ্যাকাউন্ট নির্ধারণ করুন।", "Set up the ledgers, receipt and payment categories, and bank accounts used for Cash Book entry.")}</p>`}
   <div id="lg-err" aria-live="polite"></div>
   ${mappingOnly && canEdit ? `<fieldset class="cblg-group-editor" id="lg-head-editor" hidden disabled>
     <legend>${bi("খাতের নাম", "Purpose / Group name")}</legend>
     <div class="cblg-filters-map"><label class="f">${bi("খাত", "Group")}<select class="in" id="lg-head"></select></label>
     <label class="f">${bi("প্রদর্শিত নাম", "Display name")}<input class="in" id="lg-head-name" maxlength="120" autocomplete="off"></label></div>
   </fieldset>` : ""}
   ${canAdd ? `<div class="cblg-new"><input class="in" id="lg-n" placeholder="${bi("নতুন লেজারের নাম", "New ledger name")}" autocomplete="off"><select class="in" id="lg-r">${cbLgOpts("r")}</select><select class="in" id="lg-p">${cbLgOpts("p")}</select><button class="btn pri" id="lg-add">${ico("plus")} ${bi("লেজার যোগ করুন", "Add ledger")}</button></div>` : ""}
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
