/* Optional bank statement verification. Statement files are parsed on the device. */
"use strict";

const statementAmount = value => chequeAmount(chequeDigits(value).replace(/^[-−]\s*/, ""));
const statementAccountKey = value => chequeDigits(value).toLowerCase().replace(/[\s-]/g, "");
function statementCents(amount) {
  const cents = Math.round(amount * 100);
  return amount > 0 && Number.isSafeInteger(cents) && cents / 100 === amount ? cents : null;
}
function statementVerification(c) {
  const row = c.statementVerification;
  return row && !row.invalidated_at && row.code === c.code && Number(row.cheque_no) === c.no
    && Number(row.amount) === c.amount ? row : null;
}
const statementLabel = c => statementVerification(c) ? "Verified" : (S.statementReady ? "Unverified" : "Unavailable");
function statementBadge(c) {
  return statementVerification(c) ? '<span class="tag ok stmt-badge" title="Bank statement verified">✓ Verified</span>' : "";
}
function statementSummary(rows) {
  const verified = rows.filter(statementVerification);
  return { verified, count: verified.length, amount: sumAmt(verified), rest: rows.length - verified.length };
}
function statementExport(c) {
  const v = statementVerification(c);
  return [statementLabel(c), v?.statement_date || "", v?.verifier_name || "", v?.verified_at || ""];
}
function statementColumns(head) {
  return {
    no: colOf(head, ["Cheque No", "Chq No", "Cheque Number", "Instrument No", "চেক নং", "চেক নম্বর"]),
    amount: colOf(head, ["Amount", "Transaction Amount", "টাকা", "পরিমাণ"]),
    debit: colOf(head, ["Debit", "Debit Amount", "Withdrawal", "Withdrawals", "ডেবিট"]),
    ac: colOf(head, ["A/C Code", "Account Code", "A/C No", "Account No", "Account Number"]),
    date: colOf(head, ["Date", "Transaction Date", "Value Date", "তারিখ"])
  };
}
function matchStatementRows(sheet, account, cheques) {
  const header = sheet.findIndex(row => {
    const c = statementColumns(row);
    return c.no >= 0 && (c.debit >= 0 || c.amount >= 0);
  });
  if (header < 0) throw new Error(bi("Cheque No এবং Amount বা Debit কলাম দিন।", "Add Cheque No and Amount or Debit columns."));
  const columns = statementColumns(sheet[header]);
  const list = sheet.slice(header + 1);
  if (list.length > 5000) throw new Error(bi("এক ফাইলে সর্বোচ্চ ৫,০০০টি সারি দিন।", "Use at most 5,000 rows per file."));
  const register = new Map(cheques.filter(c => c.code === account.code).map(c => [c.no, c]));
  const seen = new Set();
  const keys = [account.code, account.acno].map(statementAccountKey).filter(Boolean);
  return list.flatMap((cells, i) => {
    if (cells.every(cell => !chequeDigits(cell))) return [];
    const amount = statementAmount(cells[columns.debit >= 0 ? columns.debit : columns.amount]);
    const no = chequeNumber(cells[columns.no]);
    // Lines without a cheque number (e.g. transfers or fees) do not need reconciliation here.
    if (!chequeDigits(cells[columns.no])) return [];
    const sourceAccount = statementAccountKey(cells[columns.ac]);
    const suppliedDate = chequeDigits(cells[columns.date]);
    const date = suppliedDate ? toIsoDate(cells[columns.date]) : "";
    const line = header + i + 2;
    const c = register.get(no);
    const cents = statementCents(amount);
    let result;
    if (sourceAccount && !keys.includes(sourceAccount)) result = "account";
    else if (!no || cents === null || (suppliedDate && !date)) result = "invalid";
    else if (!c) result = "missing";
    else if (cents !== statementCents(c.amount)) result = "amount";
    else if (statementVerification(c)) result = "verified";
    else if (seen.has(c.id)) result = "duplicate";
    else { result = "match"; seen.add(c.id); }
    return [{ line, code: account.code, no, amount, date, cheque: c, result }];
  });
}
function statementPayload(row) {
  return {
    cheque_id: row.cheque.id, code: row.code, cheque_no: row.no,
    amount: row.amount, statement_date: row.date || null
  };
}
async function saveStatementMatches(rows) {
  const payload = rows.map(statementPayload);
  if (DEMO) {
    if (!["admin", "staff"].includes(S.me.role)) throw new Error("Only admin or staff can verify cheques.");
    demoStore.statementVerifications ||= {};
    for (const row of rows) {
      const c = S.cheques.find(ch => ch.id === row.cheque.id);
      if (!c || c.code !== row.code || c.no !== row.no || c.amount !== row.amount) throw new Error("A cheque has changed. Refresh the register.");
    }
    const result = payload.map(p => {
      const old = demoStore.statementVerifications[p.cheque_id];
      if (statementVerification({ code: p.code, no: p.cheque_no, amount: p.amount, statementVerification: old })) return old;
      const next = { ...p, verified_at: new Date().toISOString(), verifier_name: S.me.name };
      demoStore.statementVerifications[p.cheque_id] = next;
      return next;
    });
    DemoAPI.save();
    return result;
  }
  if (!navigator.onLine) throw new Error(bi("সংযোগ ফিরে এলে যাচাই নিশ্চিত করুন।", "Reconnect before confirming verification."));
  const { data, error } = await sb.rpc("verify_cheques_against_statement", { matches: payload });
  if (error) throw error;
  return data;
}
function statementModal(after) {
  const words = {
    match: bi("সম্ভাব্য মিল", "Exact match"), verified: "Verified",
    missing: bi("রেজিস্টারে নেই", "Not in register"), amount: bi("অঙ্ক ভিন্ন", "Amount differs"),
    account: bi("A/C ভিন্ন", "A/C differs"), invalid: bi("সারি ঠিক করুন", "Invalid row"),
    duplicate: bi("ফাইলে পুনরাবৃত্তি", "Duplicate row")
  };
  modal(`<h2>${bi("ব্যাংক স্টেটমেন্ট যাচাই", "Bank Statement Verification")}</h2>
    <div class="stmt-inputs"><div><label class="f" for="stmt-ac">${bi("স্টেটমেন্টের A/C", "Statement account")}</label>
    <select class="in" id="stmt-ac"><option value="">${bi("A/C বাছুন", "Select account")}</option>${S.accounts.map(a => `<option value="${esc(a.code)}">${esc([a.code, a.holder, a.bank].filter(Boolean).join(" · "))}</option>`).join("")}</select></div>
    <div><label class="f" for="stmt-file">${bi("স্টেটমেন্ট (Excel বা CSV)", "Statement (Excel or CSV)")}</label><input class="in" type="file" id="stmt-file" accept=".xlsx,.xls,.csv" disabled></div></div>
    <div class="stmt-controls"><button class="btn sm" id="stmt-template" type="button">${ico("dl")} ${bi("টেমপ্লেট", "Template")}</button>
    <button class="btn sm" id="stmt-page-select" type="button" hidden>${bi("এই পাতার মিল বাছুন", "Select page matches")}</button></div>
    <div id="stmt-message" class="hint" role="status"></div>
    <div id="stmt-rows"></div>
    <div id="stmt-pager" class="cq-pager" hidden><button class="btn" id="stmt-prev" type="button">‹</button><span id="stmt-page"></span><button class="btn" id="stmt-next" type="button">›</button></div>
    <div class="modal-actions"><button class="btn" id="stmt-close" type="button">${bi("বন্ধ", "Close")}</button>
    <button class="btn pri" id="stmt-save" type="button" disabled>${bi("Verified করুন", "Mark verified")}</button></div>`, (root, close) => {
    const get = id => $("#stmt-" + id, root);
    const account = get("ac"), file = get("file"), list = get("rows"), message = get("message"), save = get("save"), selectPage = get("page-select");
    const prev = get("prev"), next = get("next"), pager = get("pager");
    let rows = [], selected = new Set(), page = 0, reading = 0, saving = false;
    const size = 30, part = () => rows.slice(page * size, (page + 1) * size);
    const selection = () => {
      save.disabled = saving || !selected.size;
      save.textContent = `${bi("Verified করুন", "Mark verified")}${selected.size ? " (" + selected.size + ")" : ""}`;
    };
    const draw = () => {
      const pages = Math.max(1, Math.ceil(rows.length / size)), current = part();
      pager.hidden = pages === 1;
      get("page").textContent = `${page + 1} / ${pages}`;
      prev.disabled = saving || !page;
      next.disabled = saving || page >= pages - 1;
      selectPage.hidden = !current.some(r => r.result === "match");
      selectPage.disabled = saving;
      list.innerHTML = current.map(r => `<label class="stmt-row">
        ${r.result === "match" ? `<input type="checkbox" data-stmt-line="${r.line}" aria-label="${esc(bi("চেক", "Cheque") + " " + r.no)}" ${selected.has(r.line) ? "checked" : ""} ${saving ? "disabled" : ""}>` : '<span aria-hidden="true"></span>'}
        <span><b>${r.no || "—"}</b> <small class="mut">#${r.line} ${r.date ? "· " + dmy(r.date) : ""}</small><br><small>${bi("স্টেটমেন্ট", "Statement")} ৳ ${money(r.amount) || "—"}${r.cheque ? " · " + bi("রেজিস্টার", "Register") + " ৳ " + money(r.cheque.amount) : ""}</small></span>
        <span class="tag ${r.result === "verified" ? "ok" : ""}">${words[r.result]}</span></label>`).join("");
      selection();
    };
    get("close").onclick = () => { if (!saving) close(); };
    get("template").onclick = () => exportXlsx({ Statement: [["A/C Code", "Cheque No", "Amount", "Date"]] }, "NABIAD_Statement_Template.xlsx");
    prev.setAttribute("aria-label", bi("আগের পাতা", "Previous page"));
    next.setAttribute("aria-label", bi("পরের পাতা", "Next page"));
    prev.onclick = () => { page--; draw(); };
    next.onclick = () => { page++; draw(); };
    account.onchange = () => {
      reading++; file.value = ""; rows = []; page = 0; selected.clear();
      file.disabled = !account.value; message.textContent = ""; draw();
    };
    file.onchange = async () => {
      const source = file.files[0], current = S.accounts.find(a => a.code === account.value), token = ++reading;
      rows = []; page = 0; selected.clear(); draw();
      if (!source || !current) return;
      message.textContent = bi("স্টেটমেন্ট পড়া হচ্ছে…", "Reading statement…");
      try {
        if (source.size > 8 * 1024 * 1024) throw new Error(bi("ফাইল সর্বোচ্চ ৮ MB দিন।", "Use a file of up to 8 MB."));
        const sheet = await readSheetFile(source);
        if (token !== reading || !list.isConnected) return;
        rows = matchStatementRows(sheet, current, S.cheques);
        const count = rows.filter(r => r.result === "match").length;
        message.textContent = rows.length ? bi(`${rows.length}টি চেক সারি · ${count}টি নতুন মিল`, `${rows.length} cheque rows · ${count} new matches`) : bi("স্টেটমেন্টে চেক নম্বরসহ কোনো সারি পাওয়া যায়নি।", "No statement rows with a cheque number.");
        draw();
      } catch (err) { if (token === reading && list.isConnected) message.textContent = err.message || String(err); }
    };
    list.onchange = event => {
      const input = event.target, line = Number(input.dataset.stmtLine);
      if (!line || saving) return;
      if (!input.checked) selected.delete(line);
      else if (selected.size < 200) selected.add(line);
      else { input.checked = false; message.textContent = bi("একবারে ২০০টি পর্যন্ত মিল নিশ্চিত করুন।", "Confirm up to 200 matches at a time."); }
      selection();
    };
    selectPage.onclick = () => {
      for (const row of part()) if (row.result === "match" && selected.size < 200) selected.add(row.line);
      draw();
    };
    save.onclick = async () => {
      if (saving || !selected.size) return;
      const batch = rows.filter(r => r.result === "match" && selected.has(r.line));
      if (!ask(bi(`${batch.length}টি চেক স্টেটমেন্টের সঙ্গে মিলেছে?`, `Confirm ${batch.length} verified statement matches?`))) return;
      saving = true; account.disabled = file.disabled = true; draw();
      try {
        const result = await saveStatementMatches(batch);
        const records = new Map(result.map(r => [r.cheque_id, r]));
        for (const c of S.cheques) if (records.has(c.id)) c.statementVerification = records.get(c.id);
        for (const row of rows) if (row.cheque && records.has(row.cheque.id) && ["match", "duplicate"].includes(row.result)) row.result = "verified";
        selected.clear(); saveCache(); after?.();
        message.textContent = bi(`${records.size}টি চেক Verified হয়েছে।`, `${records.size} cheques verified.`);
      } catch (err) { message.textContent = err.message || String(err); }
      finally { saving = false; account.disabled = false; file.disabled = !account.value; draw(); }
    };
  });
}

function statementDetail(c) {
  const v = statementVerification(c);
  if (!v) return "";
  const details = [
    v.statement_date && bi("স্টেটমেন্টের তারিখ", "Statement date") + " " + dmy(v.statement_date),
    v.verifier_name,
    v.verified_at && new Date(v.verified_at).toLocaleString(LANG === "en" ? "en-GB" : "bn-BD")
  ].filter(Boolean);
  return `<p class="mut sm">${bi("স্টেটমেন্ট যাচাই", "Statement verification")} · ${esc(details.join(" · "))}</p>`;
}
function statementSummaryExport(rows) {
  if (!S.statementReady) return [["Statement verification", "Unavailable"]];
  const v = statementSummary(rows);
  return [["Statement verification", "Count", "Amount"], ["Verified", v.count, v.amount], ["Unverified", v.rest]];
}
function statementReportBlock(rows) {
  if (!S.statementReady) return "";
  const v = statementSummary(rows);
  return repOne(repBox("Bank Statement Verification", ["~Verification", "Cheques", "Verified Amount"],
    `<tr><td>Verified</td><td class="r">${v.count}</td><td class="r num">৳ ${money(v.amount)}</td></tr><tr><td>Unverified</td><td class="r">${v.rest}</td><td class="r">—</td></tr>`));
}
