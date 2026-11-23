/* NABIAD — BANGLADESH INCOME TAX HELP (v6.126)
   Calculator + yearly rules. Rules are per ASSESSMENT YEAR ("2026-27" = income year 1 Jul 2025 – 30 Jun 2026).
   Source order: built-in TAX_BUILTIN  <  database table public.tax_rules (admin-edited; see schema_tax_rules.sql)
   so every new Finance Act only needs an Admin to add/edit one year — no code change or deploy.
   Estimates only: always confirm with NBR / a tax adviser. */
"use strict";

Object.assign(ROUTES, { tax: { t: "ট্যাক্স হেল্প", ic: "taxi", roles: "asb", sec: "more", f: () => vTax } });
Object.assign(ICON, { taxi: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2"/>' });

/* tax-free thresholds by taxpayer category, slab ladder (width null = rest), minimum tax, investment rebate */
const TAX_CATS = [["general", "সাধারণ করদাতা", "General taxpayer"], ["woman", "নারী / ৬৫+ বছর", "Woman / aged 65+"], ["disabled", "প্রতিবন্ধী / তৃতীয় লিঙ্গ", "Person with disability / third gender"], ["freedom", "গেজেটেড যুদ্ধাহত মুক্তিযোদ্ধা / জুলাই যোদ্ধা", "Gazetted war-wounded freedom fighter / July fighter"]];
const TAX_SLABS = [[300000, 10], [400000, 15], [500000, 20], [2000000, 25], [null, 30]];
const TAX_BUILTIN = {
  "2026-27": {
    thr: { general: 400000, woman: 450000, disabled: 525000, freedom: 550000 }, slabs: TAX_SLABS,
    minTax: 5000, minTaxNew: 1000, reb: { rate: 15, pctIncome: 10, cap: 750000 },
    notes: [
      ["সাধারণ করমুক্ত আয়সীমা ৪,০০,০০০ টাকা; নারী ও ৬৫+ বছর ৪,৫০,০০০; প্রতিবন্ধী ও তৃতীয় লিঙ্গ ৫,২৫,০০০; গেজেটেড যুদ্ধাহত মুক্তিযোদ্ধা ৫,৫০,০০০।", "Tax-free limit: Tk 4,00,000 general; Tk 4,50,000 for women and age 65+; Tk 5,25,000 for persons with disabilities and third gender; Tk 5,50,000 for gazetted war-wounded freedom fighters."],
      ["৫% এর প্রাথমিক স্তর বাতিল — করমুক্ত সীমার পরের প্রথম স্তরই ১০%।", "The 5% entry slab is abolished — the first taxable band above the limit is 10%."],
      ["করমুক্ত সীমার বেশি আয় হলে সারা দেশে ন্যূনতম কর ৫,০০০ টাকা (প্রথমবার রিটার্ন দাতার জন্য ১,০০০)।", "Income above the limit pays at least Tk 5,000 nationwide (Tk 1,000 for first-time filers)."],
      ["বিনিয়োগ রেয়াতের যোগ্য অঙ্ক কমেছে: মোট আয়ের ১৫% থেকে ১০%, সর্বোচ্চ ১০ লাখ থেকে ৭.৫ লাখ। (ক্যালকুলেটরে এভাবে ধরা — আইনের পাঠের সাথে মিলিয়ে নিন)", "The eligible investment for rebate is reduced: 15% to 10% of income, cap Tk 10 lakh to Tk 7.5 lakh. (Modelled this way in the calculator — verify against the Act's text.)"],
      ["সঞ্চয়পত্রের মুনাফায় উৎসে কর আর চূড়ান্ত দায় নয়।", "Tax deducted at source on savings-certificate profit is no longer the final liability."],
      ["কর-বছরের মধ্যে যেকোনো সময় রিটার্ন দেওয়া যায়, তবে সময়ভেদে রেয়াত বা অতিরিক্ত কর লাগতে পারে।", "A return can be filed any time in the tax year, but the filing date may bring a rebate or additional tax."]
    ],
    src: "Finance Act 2026 — PwC Bangladesh summary (Jun 2026)", ver: ""
  }
};
TAX_BUILTIN["2027-28"] = { ...TAX_BUILTIN["2026-27"], src: "Finance Act 2026 — same as 2026-27 (PwC Bangladesh summary)" };

/* assessment year whose income year (1 Jul – 30 Jun) ended most recently */
const taxAyNow = (d = today()) => { const y = +d.slice(0, 4); return +d.slice(5, 7) >= 7 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`; };
const taxAyLabel = ay => { const [a] = ay.split("-"); return `AY ${ay} · ${bi("আয় বছর", "income year")} ${a - 1}-${String(a).slice(2)}`; };

let TAX_DB = null;   /* rows from the table (or demo localStorage), loaded once per visit */
const TAX_LS = "nabiad_tax_rules_demo";
async function taxLoad(force) {
  if (TAX_DB && !force) return TAX_DB;
  TAX_DB = { rows: {}, ok: true };
  try {
    if (DEMO) { TAX_DB.rows = JSON.parse(localStorage.getItem(TAX_LS) || "{}"); }
    else { const { data, error } = await sb.from("tax_rules").select("ay,data,updated_at,updated_by"); if (error) throw error; (data || []).forEach(r => TAX_DB.rows[r.ay] = { ...r.data, upd: r.updated_at, by: r.updated_by }); }
  } catch (e) { TAX_DB.ok = false; TAX_DB.err = e.message || String(e); }
  return TAX_DB;
}
const taxYears = () => [...new Set([...Object.keys(TAX_BUILTIN), ...Object.keys(TAX_DB?.rows || {})])].sort();
const taxRules = ay => TAX_DB?.rows?.[ay] || TAX_BUILTIN[ay] || null;
/* pick the rules for an AY; if none exist yet use the latest earlier year (and say so) */
function taxPick(ay) { const ys = taxYears(); if (taxRules(ay)) return { ay, r: taxRules(ay), exact: true }; const prev = ys.filter(y => y < ay).pop() || ys[ys.length - 1]; return { ay: prev, r: taxRules(prev), exact: false, want: ay }; }

/* slab-wise tax for one person */
function taxCalc(r, o) {
  const thr = r.thr[o.cat] ?? r.thr.general, inc = Math.max(0, o.income || 0); let left = Math.max(0, inc - thr), from = thr; const rows = [{ w: Math.min(inc, thr), rate: 0, tax: 0, from: 0 }]; let gross = 0, marg = 0;
  for (const [w, rate] of r.slabs) { if (left <= 0) break; const take = w == null ? left : Math.min(left, w), tax = take * rate / 100; rows.push({ w: take, rate, tax, from }); gross += tax; left -= take; from += take; marg = rate; }
  const inv = Math.max(0, o.inv || 0), qual = Math.min(inv, inc * (r.reb.pctIncome || 0) / 100, r.reb.cap || Infinity), rebate = Math.min(gross, qual * (r.reb.rate || 0) / 100);
  const after = gross - rebate, minTax = o.first ? r.minTaxNew : r.minTax, taxable = inc > thr, payable = taxable ? Math.max(after, minTax) : 0, minApplied = taxable && payable > after;
  const paid = Math.max(0, o.paid || 0), net = payable - paid;
  return { thr, inc, rows, gross, qual, rebate, after, minTax, minApplied, taxable, payable, paid, net, eff: inc ? payable / inc * 100 : 0, marg: taxable ? marg : 0 };
}

async function vTax(v) {
  const adm = S.me?.role === "admin", tdb = await taxLoad(), now = taxAyNow();
  let ay = taxPick(now).ay, st = { cat: "general", mode: "y", income: "", inv: "", paid: "", first: false };
  const num = id => Math.max(0, parseFloat(String($(id, v)?.value || "").replace(/,/g, "")) || 0);
  v.innerHTML = head(bi("ট্যাক্স হেল্প", "Tax Help"), "", "") + `<div class="tx-grid">
    <div class="card tx-calc"><div class="tx-hh"><div><h3>${bi("আয়কর ক্যালকুলেটর", "Income tax calculator")}</h3><p class="mut sm">${bi("ব্যক্তি করদাতা · আনুমানিক হিসাব", "Individual taxpayer · estimate")}</p></div><div class="tx-ay"><label class="f" for="tx-ay">${bi("কর-বছর", "Assessment year")}</label><select class="in" id="tx-ay"></select></div></div>
      <div id="tx-warn"></div>
      <div class="tx-form">
        <div class="tx-c"><label class="f" for="tx-cat">${bi("করদাতার ধরন", "Taxpayer type")}</label><select class="in" id="tx-cat">${TAX_CATS.map(([k, b, e]) => `<option value="${k}">${bi(b, e)}</option>`).join("")}</select></div>
        <div><label class="f" for="tx-inc">${bi("করযোগ্য আয়", "Taxable income")} <span class="seg" id="tx-mode"><button type="button" class="on" data-m="y">${bi("বার্ষিক", "Yearly")}</button><button type="button" data-m="m">${bi("মাসিক", "Monthly")}</button></span></label><input class="in" id="tx-inc" inputmode="numeric" placeholder="0" autocomplete="off"></div>
        <div><label class="f" for="tx-inv">${bi("বিনিয়োগ (রেয়াতের জন্য)", "Eligible investment (rebate)")}</label><input class="in" id="tx-inv" inputmode="numeric" placeholder="0" autocomplete="off"></div>
        <div><label class="f" for="tx-paid">${bi("ইতিমধ্যে কাটা / পরিশোধিত কর", "Tax already deducted / paid")}</label><input class="in" id="tx-paid" inputmode="numeric" placeholder="0" autocomplete="off"></div>
        <label class="tx-chk"><input type="checkbox" id="tx-first"><span>${bi("প্রথমবার রিটার্ন দাখিলকারী", "First-time return filer")}</span></label>
      </div>
      <div id="tx-out"></div></div>
    <div class="tx-side"><div class="card tx-notes"><h3>${ico("bulb")} ${bi("এই কর-বছরের নোট", "Notes for this year")}</h3><div id="tx-nt"></div></div>${adm ? `<div class="card tx-adm"><h3>${ico("sliders")} ${bi("নিয়ম সম্পাদনা (Admin)", "Edit rules (Admin)")}</h3><p class="mut sm">${bi("নতুন Finance Act এলে এখানে সেই বছরের হার ও সীমা দিন — কোড বদলাতে হবে না।", "When a new Finance Act passes, enter that year's limits and rates here — no code change needed.")}</p><div id="tx-ed"></div></div>` : ""}</div></div>`;
  const sel = $("#tx-ay", v);
  function fillYears() { const ys = taxYears(); if (!ys.includes(now) && !ys.includes(ay)) ys.push(now); sel.innerHTML = [...new Set(ys.concat(now))].sort().map(y => `<option value="${y}"${y === ay ? " selected" : ""}>${taxAyLabel(y)}${y === now ? " · " + bi("চলমান", "current") : ""}${taxRules(y) ? "" : " · " + bi("নিয়ম নেই", "no rules")}</option>`).join(""); }
  const fmt = n => money0(Math.round(n));
  function draw() {
    const pk = taxPick(ay), r = pk.r; if (!r) return;
    $("#tx-warn", v).innerHTML = (!pk.exact ? `<div class="alert am">${ico("alert")} <span>${bi(`AY ${ay}-এর নিয়ম এখনো যোগ হয়নি — AY ${pk.ay}-এর নিয়ম দিয়ে হিসাব দেখানো হচ্ছে।${adm ? " নিচে Admin থেকে নতুন বছর যোগ করুন।" : " Admin-কে জানান।"}`, `Rules for AY ${ay} are not added yet — showing AY ${pk.ay} rules.${adm ? " Add the new year below." : " Please ask an admin."}`)}</span></div>` : "") + (tdb.ok ? "" : `<div class="alert am">${ico("alert")} <span>${bi("নিয়মের ডাটাবেস টেবিল পাওয়া যায়নি — বিল্ট-ইন নিয়ম ব্যবহার হচ্ছে।", "Rules table not found — using built-in rules.")}</span></div>`);
    const income = num("#tx-inc") * (st.mode === "m" ? 12 : 1), c = taxCalc(r, { cat: st.cat, income, inv: num("#tx-inv"), paid: num("#tx-paid"), first: st.first });
    $("#tx-out", v).innerHTML = !income ? `<div class="sn-hmsg">${ico("table")}<b>${bi("আয় লিখুন", "Enter your income")}</b><span>${bi("হিসাব সাথে সাথে দেখা যাবে", "The result appears instantly")}</span></div>` :
      `<div class="tx-res"><div class="tx-big ${c.taxable ? "" : "ok"}"><span>${bi("মোট প্রদেয় কর", "Total tax payable")}</span><b>৳ ${fmt(c.payable)}</b><em>${c.taxable ? bi(`কার্যকর হার ${c.eff.toFixed(1)}% · প্রান্তিক হার ${c.marg}%`, `Effective ${c.eff.toFixed(1)}% · marginal ${c.marg}%`) : bi("করমুক্ত আয়সীমার মধ্যে — কর নেই", "Within the tax-free limit — no tax")}</em></div>
      <div class="tx-kp"><div><span>${bi("করমুক্ত সীমা", "Tax-free limit")}</span><b>${fmt(c.thr)}</b></div><div><span>${bi("বার্ষিক আয়", "Yearly income")}</span><b>${fmt(c.inc)}</b></div><div class="${c.paid ? (c.net > 0 ? "dn" : "up") : ""}"><span>${c.net < 0 ? bi("ফেরতযোগ্য", "Refundable") : bi("আরও দিতে হবে", "Still to pay")}</span><b>${fmt(Math.abs(c.net))}</b></div></div>
      <div class="tw tx-t"><table><thead><tr><th>${bi("আয়ের অংশ", "Income band")}</th><th class="r">${bi("টাকা", "Amount")}</th><th class="r">${bi("হার", "Rate")}</th><th class="r">${bi("কর", "Tax")}</th></tr></thead><tbody>${c.rows.map(x => `<tr><td>${x.rate ? bi("পরবর্তী", "Next") : bi("করমুক্ত", "Tax-free")}</td><td class="r num">${fmt(x.w)}</td><td class="r num">${x.rate}%</td><td class="r num">${fmt(x.tax)}</td></tr>`).join("")}</tbody><tfoot><tr><td colspan="3">${bi("স্ল্যাব অনুযায়ী মোট কর", "Tax per slabs")}</td><td class="r num">${fmt(c.gross)}</td></tr>${c.rebate ? `<tr><td colspan="3">${bi("বিনিয়োগ রেয়াত", "Investment rebate")} <small class="mut">(${bi("যোগ্য", "eligible")} ${fmt(c.qual)})</small></td><td class="r num up">− ${fmt(c.rebate)}</td></tr>` : ""}${c.minApplied ? `<tr><td colspan="3">${bi("ন্যূনতম কর প্রযোজ্য", "Minimum tax applied")}</td><td class="r num">${fmt(c.minTax)}</td></tr>` : ""}<tr class="tot"><td colspan="3">${bi("প্রদেয় কর", "Tax payable")}</td><td class="r num">${fmt(c.payable)}</td></tr>${c.paid ? `<tr><td colspan="3">${bi("পরিশোধিত / কাটা", "Already paid / deducted")}</td><td class="r num">− ${fmt(c.paid)}</td></tr><tr class="tot"><td colspan="3">${c.net < 0 ? bi("ফেরতযোগ্য", "Refundable") : bi("আরও দিতে হবে", "Still to pay")}</td><td class="r num ${c.net > 0 ? "dn" : "up"}">${fmt(Math.abs(c.net))}</td></tr>` : ""}</tfoot></table></div></div>`;
    const ns = r.notes || []; $("#tx-nt", v).innerHTML = (ns.length ? `<ul>${ns.map(n => `<li>${Array.isArray(n) ? bi(esc(n[0]), esc(n[1])) : esc(n)}</li>`).join("")}</ul>` : `<p class="mut sm">${bi("কোনো নোট নেই", "No notes")}</p>`) + `<p class="tx-src mut sm">${bi("সূত্র", "Source")}: ${esc(r.src || "—")}${r.upd ? ` · ${bi("হালনাগাদ", "updated")} ${esc(String(r.upd).slice(0, 10))}` : ""}</p><p class="tx-dis">${bi("এটি আনুমানিক হিসাব। চূড়ান্ত রিটার্নের আগে NBR-এর সর্বশেষ বিজ্ঞপ্তি বা কর উপদেষ্টার সাথে মিলিয়ে নিন।", "This is an estimate. Confirm against the latest NBR notice or a tax adviser before filing.")}</p>`;
  }
  /* ---------- admin: edit / add a year ---------- */
  function drawEd() {
    const box = $("#tx-ed", v); if (!box) return; const r = taxRules(ay) || taxPick(ay).r, T = r.thr;
    box.innerHTML = `<div class="tx-ef"><div class="tx-er"><label class="f">${bi("কর-বছর", "Assessment year")}</label><input class="in" id="te-ay" value="${esc(ay)}" placeholder="2028-29" maxlength="7"></div>${TAX_CATS.map(([k, b, e]) => `<div><label class="f">${bi(b, e)}</label><input class="in" data-th="${k}" inputmode="numeric" value="${T[k]}"></div>`).join("")}</div>
      <label class="f">${bi("স্ল্যাব (প্রতি লাইনে: প্রস্থ, হার%; শেষ লাইনে প্রস্থ ফাঁকা = বাকি সব)", "Slabs (one per line: width, rate%; leave the last width empty = the rest)")}</label><textarea class="in" id="te-sl" rows="6">${r.slabs.map(([w, p]) => `${w ?? ""}, ${p}`).join("\n")}</textarea>
      <div class="tx-ef"><div><label class="f">${bi("ন্যূনতম কর", "Minimum tax")}</label><input class="in" id="te-mt" inputmode="numeric" value="${r.minTax}"></div><div><label class="f">${bi("প্রথমবার ন্যূনতম কর", "First-time minimum tax")}</label><input class="in" id="te-mn" inputmode="numeric" value="${r.minTaxNew}"></div><div><label class="f">${bi("রেয়াত হার %", "Rebate rate %")}</label><input class="in" id="te-rr" inputmode="decimal" value="${r.reb.rate}"></div><div><label class="f">${bi("যোগ্য বিনিয়োগ: আয়ের %", "Eligible investment: % of income")}</label><input class="in" id="te-rp" inputmode="decimal" value="${r.reb.pctIncome}"></div><div><label class="f">${bi("যোগ্য বিনিয়োগের সর্বোচ্চ", "Eligible investment cap")}</label><input class="in" id="te-rc" inputmode="numeric" value="${r.reb.cap}"></div></div>
      <label class="f">${bi("নোট (প্রতি লাইনে একটি; দুই ভাষায় দিতে: বাংলা || English)", "Notes (one per line; for both languages: Bangla || English)")}</label><textarea class="in" id="te-nt" rows="6">${esc((r.notes || []).map(n => Array.isArray(n) ? n.join(" || ") : n).join("\n"))}</textarea>
      <label class="f">${bi("সূত্র", "Source")}</label><input class="in" id="te-src" value="${esc(r.src || "")}" placeholder="Finance Act 2027 — NBR SRO …">
      <div class="tx-eb"><button type="button" class="btn pri" id="te-save">${ico("save")}<span>${bi("সেভ", "Save")}</span></button><span class="mut sm" id="te-msg"></span></div>`;
    $("#te-save", v).onclick = async () => {
      const nay = $("#te-ay", v).value.trim(), msg = $("#te-msg", v);
      if (!/^\d{4}-\d{2}$/.test(nay) || +nay.slice(5) !== (+nay.slice(0, 4) + 1) % 100) return toast(bi("কর-বছর এভাবে লিখুন: 2028-29", "Write the year like: 2028-29"), "err");
      const thr = {}; $$("[data-th]", v).forEach(i => thr[i.dataset.th] = Math.max(0, parseFloat(i.value) || 0));
      const slabs = $("#te-sl", v).value.split("\n").map(l => l.trim()).filter(Boolean).map(l => { const [w, p] = l.split(",").map(x => x.trim()); return [w === "" || w == null ? null : +w, +p]; });
      if (!slabs.length || slabs.some(([w, p], i) => isNaN(p) || p < 0 || p > 100 || (w != null && (isNaN(w) || w <= 0)) || (w == null && i !== slabs.length - 1))) return toast(bi("স্ল্যাব ঠিক নেই — শুধু শেষ লাইনের প্রস্থ ফাঁকা থাকতে পারে", "Slabs are invalid — only the last line may have an empty width"), "err");
      const data = { thr, slabs, minTax: +$("#te-mt", v).value || 0, minTaxNew: +$("#te-mn", v).value || 0, reb: { rate: +$("#te-rr", v).value || 0, pctIncome: +$("#te-rp", v).value || 0, cap: +$("#te-rc", v).value || 0 }, notes: $("#te-nt", v).value.split("\n").map(x => x.trim()).filter(Boolean).map(x => x.includes("||") ? x.split("||").map(y => y.trim()) : x), src: $("#te-src", v).value.trim() };
      try {
        if (DEMO) { const all = JSON.parse(localStorage.getItem(TAX_LS) || "{}"); all[nay] = { ...data, upd: new Date().toISOString() }; localStorage.setItem(TAX_LS, JSON.stringify(all)); }
        else { const { error } = await sb.from("tax_rules").upsert({ ay: nay, data, updated_by: S.me.name, updated_at: new Date().toISOString() }, { onConflict: "ay" }); if (error) throw error; }
        await taxLoad(true); ay = nay; fillYears(); draw(); drawEd(); toast(bi("নিয়ম সেভ হয়েছে", "Rules saved"), "ok");
      } catch (e) { const m = /tax_rules|relation|does not exist|schema cache/i.test(e.message || "") ? bi("ডাটাবেসে tax_rules টেবিল নেই — আগে schema_tax_rules.sql চালাতে হবে", "The tax_rules table does not exist yet — run schema_tax_rules.sql first") : (e.message || String(e)); msg.textContent = m; toast(m, "err"); }
    };
  }
  sel.onchange = () => { ay = sel.value; draw(); drawEd(); };
  $("#tx-cat", v).onchange = e => { st.cat = e.target.value; draw(); };
  $("#tx-first", v).onchange = e => { st.first = e.target.checked; draw(); };
  $("#tx-mode", v).onclick = e => { const b = e.target.closest("[data-m]"); if (!b) return; st.mode = b.dataset.m; $$("#tx-mode button", v).forEach(x => x.classList.toggle("on", x === b)); draw(); };
  ["#tx-inc", "#tx-inv", "#tx-paid"].forEach(id => $(id, v).addEventListener("input", e => { const raw = e.target.value.replace(/[^\d]/g, ""); e.target.value = raw ? Number(raw).toLocaleString("en-IN") : ""; draw(); }));
  fillYears(); draw(); drawEd();
}
