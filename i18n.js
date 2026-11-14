/* Nabiad — বাংলা / English switch.
   The app is written in Bangla; in English mode every rendered text node, placeholder and title
   is translated from this dictionary (longest phrase first). Short words translate only on exact match. */
"use strict";
let LANG = (() => { try { return localStorage.getItem("nabiad_lang") || "bn"; } catch { return "bn"; } })();
const I18N = {
  // navigation / shell
  "ড্যাশবোর্ড": "Dashboard", "চেক এন্ট্রি": "Cheque Entry", "স্ট্যাটাস": "Status", "চেক তালিকা": "Cheque List", "দৈনিক ক্লোজিং": "Daily Closing",
  "ব্যালেন্স রিপোর্ট": "Balance Report", "রিপোর্ট": "Reports", "অ্যাকাউন্ট খুঁজুন": "Account Finder", "চেক বই": "Cheque Books", "অ্যাডমিন": "Admin",
  "ব্যাংক ও রিপোর্ট": "Bank & Reports", "অন্যান্য": "More", "আরও": "More", "লগআউট": "Logout", "লাইট থিম": "Light theme", "ডার্ক থিম": "Dark theme", "থিম": "Theme",
  "চেক / অ্যাকাউন্ট খুঁজুন…": "Search cheque / account…", "চেক নং, A/C কোড, হোল্ডার, পার্টি, টাকা বা পাতার নাম…": "Cheque no, A/C code, holder, party, amount or page…",
  "পাতা": "Pages", "অ্যাকাউন্ট": "Account", "লোড হচ্ছে…": "Loading…", "ডাটা লোড হচ্ছে…": "Loading data…",
  // login
  "লগইন করুন": "Sign in", "আপনার অফিস ইমেইল ও পাসওয়ার্ড দিন": "Enter your office email and password", "ইমেইল": "Email", "পাসওয়ার্ড": "Password", "লগইন": "Sign in",
  "লগইন হয়নি:": "Sign-in failed:", "প্রোফাইল পাওয়া যায়নি বা নিষ্ক্রিয়": "Profile not found or inactive", "শুরু করা যায়নি:": "Could not start:",
  "চেক রেজিস্টার, দৈনিক ব্যাংক ক্লোজিং আর রিপোর্ট — এক জায়গায়": "Cheque register, daily bank closing and reports — in one place",
  "প্রতিটি চেক পাতার হিসাব, মিসিং পাতা ধরা, আর Boss-এর জন্য তাৎক্ষণিক এনকোয়ারি।": "Every cheque leaf tracked, missing leaves caught, instant enquiry for the Boss.",
  "Staff শুধু যোগ করতে পারে, বদলাতে পারে শুধু Admin": "Staff can only add; only Admin can change",
  "দৈনিক ক্লোজিং রিপোর্ট — ছবি, PDF, Excel, WhatsApp": "Daily closing report — image, PDF, Excel, WhatsApp",
  "মোবাইল ও কম্পিউটার দুটোতেই চলে": "Works on mobile and desktop",
  // dashboard
  "স্বাগতম,": "Welcome,", "নতুন চেক এন্ট্রি": "New cheque entry", "আজকের চেক": "Today's cheques", "Pending চেক": "Pending cheques", "এই মাসের চেক": "This month",
  "সর্বশেষ ব্যাংক ক্লোজিং": "Latest bank closing", "ব্যাংক ক্লোজিং ·": "Bank closing ·", "কোনো ব্যালেন্স সেভ হয়নি": "No balance saved yet", "· পুরনো": "· old",
  "✔ কোনো সতর্কতা নেই — সব ঠিক আছে।": "✔ No alerts — everything is fine.", "সর্বশেষ এন্ট্রি": "Latest entries", "সব দেখুন →": "View all →", "পুরনো Pending": "Old pending",
  "এখনো কোনো চেক এন্ট্রি হয়নি": "No cheque entered yet", "কোনো পুরনো Pending নেই 🎉": "No old pending 🎉", "দিনের বেশি Pending —": "days+ pending —",
  "স্ট্যাটাস দিন →": "Update status →", "মিসিং চেক পাতা:": "Missing cheque leaves:",
  // entry
  "Enter চাপলে পরের ঘরে যাবে · শেষ ঘরে Enter = সেভ": "Enter moves to the next field · Enter on the last field saves",
  "চেকের তারিখ": "Cheque date", "(টাইপ করুন: pbl, 483, nabiad…)": "(type: pbl, 483, nabiad…)", "চেক নং (শুধু সংখ্যা)": "Cheque no (digits only)",
  "টাকা (বাতিল পাতা হলে 0)": "Amount (0 for a cancelled leaf)", "খাত": "Purpose", "কে তুলেছে *": "Withdrawn by *", "কোন A/C তে জমা *": "Deposited to A/C *",
  "যে অ্যাকাউন্টে টাকা গেছে": "Account the money went to", "পার্টি / সাপ্লায়ার": "Party / Supplier", "মন্তব্য": "Remarks", "সেভ করুন": "Save", "পরিষ্কার": "Clear",
  "A/C ও খাত ধরে রাখুন": "Keep A/C & purpose", "আজকের এন্ট্রি": "Today's entries", "আজ এখনো কোনো এন্ট্রি নেই": "No entries today yet",
  "শেষ এন্ট্রি:": "Last entry:", "এই অ্যাকাউন্টে এখনো এন্ট্রি নেই": "No entries for this account yet", "আগেই এন্ট্রি আছে (": "already entered (", "আগেই এন্ট্রি আছে": "already entered",
  "খাত বাছুন": "Choose purpose", "A/C Code বাছুন": "Choose A/C code", "চেক নং দিন": "Enter cheque no", "তারিখ দিন": "Enter date",
  "টাকার অংক দিন (বাতিল পাতা হলে খাত 'বাতিল/নষ্ট পাতা' বাছুন)": "Enter the amount (for a cancelled leaf choose 'Cancelled/Spoiled')",
  "কে তুলেছে — বাছুন": "Choose who withdrew", "কোন A/C তে জমা — বাছুন": "Choose the deposit A/C", "From ও To একই A/C হতে পারে না": "From and To cannot be the same A/C",
  "এই চেক আগেই এন্ট্রি আছে": "This cheque is already entered", "এই চেক নম্বর এই অ্যাকাউন্টে আগেই এন্ট্রি আছে": "This cheque number is already entered for this account",
  "✔ সেভ হয়েছে:": "✔ Saved:", "— আজ থেকে": "— from today", "দিন আগের": "days earlier", "দিন পরের": "days later", "। ঠিক আছে?": ". Is that right?", "— অংক ঠিক আছে?": "— is the amount right?",
  "Cash Withdrawal (ক্যাশ উত্তোলন)": "Cash Withdrawal", "Own A/C Transfer (নিজ অ্যাকাউন্টে জমা)": "Own A/C Transfer", "Supplier/Party Payment (সাপ্লায়ার/পার্টি পেমেন্ট)": "Supplier/Party Payment",
  "Salary (বেতন)": "Salary", "Utility/Bills (বিদ্যুৎ/গ্যাস/বিল)": "Utility/Bills", "Rent (ভাড়া)": "Rent", "Loan/EMI (লোন কিস্তি)": "Loan/EMI", "LC/Import (এলসি)": "LC/Import",
  "Tax/VAT (ট্যাক্স/ভ্যাট)": "Tax/VAT", "Office Expense (অফিস খরচ)": "Office Expense", "Personal (বস/পরিবার)": "Personal", "Cancelled/Spoiled (বাতিল/নষ্ট পাতা)": "Cancelled/Spoiled", "Others (অন্যান্য)": "Others",
  // status
  "চেক স্ট্যাটাস আপডেট": "Cheque Status Update", "খুঁজুন (A/C বা চেক নং — যেমন: pbl 12565)": "Search (A/C or cheque no — e.g. pbl 12565)", "চেক নং / কোড…": "Cheque no / code…",
  "স্ট্যাটাসের তারিখ (Quick বাটনে)": "Status date (quick buttons)", "দেখান": "Show", "শুধু Pending": "Pending only", "সব": "All", "টি চেক": " cheques", "(প্রথম ৮০টি)": "(first 80)",
  "কোনো চেক পাওয়া যায়নি": "No cheque found", "নতুন স্ট্যাটাস": "New status", "মন্তব্য (ঐচ্ছিক)": "Remarks (optional)", "ইতিহাস:": "History:", "সেভ": "Save", "বাতিল": "Cancel",
  // cheque list / modal
  "চেক তালিকা ও এনকোয়ারি": "Cheque List & Enquiry", "খুঁজুন (কোড, চেক নং, পার্টি, মন্তব্য, টাকা)": "Search (code, cheque no, party, remarks, amount)", "যেকোনো কিছু লিখুন…": "Type anything…",
  "প্রিন্ট": "Print", "টি চেক · কার্যকর মোট": " cheques · effective total", "কিছু পাওয়া যায়নি": "Nothing found", "‹ আগের": "‹ Prev", "পরের ›": "Next ›",
  "তারিখ": "Date", "A/C · চেক": "A/C · Cheque", "হোল্ডার": "Holder", "টাকা": "Amount", "খাত / বিবরণ": "Purpose / details", "বিবরণ": "Details", "কে": "By",
  "কে তুলেছে": "Withdrawn by", "পার্টি": "Party", "এন্ট্রি": "Entry", "স্ট্যাটাস ইতিহাস": "Status history", "কোনো আপডেট নেই (ডিফল্ট:": "No updates (default:",
  "স্ট্যাটাস দিন": "Set status", "✎ এডিট": "✎ Edit", "🗑 মুছুন": "🗑 Delete", "বন্ধ": "Close", "মুছুন": "Delete", "এডিট (Admin):": "Edit (Admin):", "এডিট": "Edit",
  "চেক নং": "Cheque no", "এই স্ট্যাটাস এন্ট্রি স্থায়ীভাবে মুছবেন?": "Permanently delete this status entry?", "স্থায়ীভাবে মুছবেন? (ফেরানো যাবে না)": "permanently delete? (cannot be undone)",
  "মুছে ফেলা হয়েছে": "Deleted", "চেক মুছে ফেলা হয়েছে": "Cheque deleted", "আপডেট হয়েছে": "Updated", "সেভ হয়েছে": "Saved",
  // closing
  "দৈনিক ব্যাংক ক্লোজিং": "Daily Bank Closing", "‹ আগের দিন": "‹ Previous day", "পরের দিন ›": "Next day ›", "আগের ডাটা:": "Previous data:", "(মাঝে": "(gap of",
  "দিনের ডাটা নেই)": "days without data)", "আগের ক্লোজিং": "Prev closing", "চেক খরচ": "Cheque debit", "অন্য খরচ": "Other debit", "ট্রান্সফার জমা": "Transfer in",
  "অন্য জমা": "Other deposit", "হিসাব মতে": "Expected", "ব্যাংক ক্লোজিং": "Bank closing", "মোট": "Total", "আজকের": "Today's", "ব্যালেন্স সেভ": "balance save",
  "ব্যাংক ক্লোজিং ঘর খালি রাখলে": "If Bank closing is left blank, the", "অংক ধরা হবে। Diff ≠ 0 হলে মন্তব্য বাধ্যতামূলক।": "amount is used. Remarks are required when Diff ≠ 0.",
  "🔒 এই তারিখের ব্যালেন্স আগেই সেভ হয়েছে। বদলাতে Admin কে বলুন।": "🔒 Balances for this date are already saved. Ask Admin to change them.",
  "⚠ এই তারিখ আগেই সেভ আছে — সেভ করলে Admin হিসেবে নতুন মান বসবে।": "⚠ This date is already saved — saving again (as Admin) will overwrite it.",
  "Diff আছে কিন্তু মন্তব্য নেই:": "Diff without remarks:", "— মোট ক্লোজিং ৳": "— total closing ৳", "।\nসেভ করবেন?": ".\nSave?", "\n(সেভের পর শুধু Admin বদলাতে পারবে)": "\n(after saving only Admin can change it)",
  "✔ ব্যালেন্স সেভ হয়েছে": "✔ Balances saved", "এই তারিখের ব্যালেন্স আগেই সেভ করা আছে — শুধু Admin বদলাতে পারবে": "Balances for this date are already saved — only Admin can change them",
  // closing report
  "ব্যাংক ক্লোজিং রিপোর্ট": "Bank Closing Report", "ছবি": "Image", "WhatsApp টেক্সট": "WhatsApp text", "এই তারিখে কোনো ব্যালেন্স সেভ নেই": "No balances saved for this date",
  "অ্যাকাউন্ট ইতিহাস": "Account history", "কোড টাইপ করুন": "Type a code", "ডাটা নেই": "No data", "সর্বোচ্চ": "Max", "· সর্বনিম্ন": "· Min", "দিন": "days",
  "কপি হয়েছে — WhatsApp এ paste করুন": "Copied — paste into WhatsApp", "কপি করা যায়নি": "Could not copy", "Daily Bank Closing Report · ব্যাংক ক্লোজিং রিপোর্ট": "Daily Bank Closing Report",
  // reports
  "সময়": "Period", "আজ": "Today", "এই মাস": "This month", "গত মাস": "Last month", "এই বছর": "This year", "তারিখ নির্বাচন": "Custom range", "অ্যাকাউন্ট হোল্ডার": "Account holder",
  "Excel (সামারি + ডিটেইলস)": "Excel (summary + details)", "থেকে": "to", "শুরু": "start", "মোট চেক (কার্যকর)": "Total cheques (effective)", "Bounced / বাতিল": "Bounced / Cancelled",
  "১ খাত অনুযায়ী": "1 By purpose", "২ কে তুলেছে (ক্যাশ)": "2 By cash taker", "৩ স্ট্যাটাস": "3 Status", "৪ ব্যাংক অনুযায়ী": "4 By bank", "৫ অ্যাকাউন্ট অনুযায়ী": "5 By account",
  "৬ দিন অনুযায়ী": "6 By day", "৭ মাস অনুযায়ী": "7 By month", "নাম": "Name", "চেক": "Cheques", "ব্যাংক": "Bank", "মাস": "Month",
  // books
  "চেক বই ও মিসিং পাতা": "Cheque Books & Missing Leaves", "নতুন বই": "New book", "✔ কোনো মিসিং পাতা নেই": "✔ No missing leaves", "টি পাতা মিসিং — নিচের লাল তালিকা দেখুন।": " leaves missing — see the red list below.",
  "📚 মোট": "📚 Total", "সিরিজ": "Series", "প্রথম–শেষ": "First–Last", "ট্র্যাক": "Track", "ব্যবহৃত": "Used", "সর্বশেষ": "Latest", "বাকি": "Left", "মিসিং পাতা": "Missing leaves",
  "এখনো কোনো চেক বই যোগ করা হয়নি": "No cheque book added yet", "নতুন চেক বই": "New cheque book", "বই এডিট": "Edit book", "সিরিজ (CD/SB…)": "Series (CD/SB…)", "প্রথম পাতা": "First leaf",
  "শেষ পাতা": "Last leaf", "ট্র্যাক শুরু (ঐচ্ছিক)": "Track from (optional)", "নোট": "Note", "প্রথম পাতা দিন": "Enter first leaf", "এই বই মুছবেন?": "Delete this book?",
  "ট্র্যাক শুরু = সিস্টেম চালুর পর যে পাতা থেকে মিসিং গোনা শুরু হবে (আগের পাতাগুলো এন্ট্রি হয়নি বলে মিসিং ধরা হবে না)।": "Track from = the leaf from which missing leaves are counted after go-live (earlier unentered leaves are not flagged).",
  // accounts
  "নতুন অ্যাকাউন্ট": "New account", "অ্যাকাউন্ট এডিট ·": "Edit account ·", "(লিখলে তালিকা আসবে)": "(type to see the list)", "শাখা": "Branch", "হোল্ডার (অ্যাকাউন্টের নাম)": "Holder (account name)",
  "ধরন": "Type", "A/C নং": "A/C no", "(BANK-শেষ ৩ ডিজিট)": "(BANK-last 3 digits)", "দৈনিক ক্লোজিং এ আসবে?": "Include in daily closing?", "হ্যাঁ": "Yes", "না": "No", "ক্রম": "Order",
  "Code দিন": "Enter a code", "এই Code আগেই আছে": "This code already exists", "এই Code আগেই আছে (": "This code already exists (", "এই A/C নং আগেই আছে:": "This A/C no already exists:",
  "খুঁজুন": "Search", "(কোড, নাম, ব্যাংক, শাখা, A/C নং — ড্যাশ/স্পেস লাগবে না: ibbl203)": "(code, name, bank, branch, A/C no — no dash/space needed: ibbl203)",
  "যেমন: 483, noor, pubali": "e.g. 483, noor, pubali", "টি অ্যাকাউন্ট": " accounts", "A/C নং দেওয়া নেই": "No A/C number", "কপি": "Copy", "A/C নং কপি হয়েছে": "A/C number copied",
  "টি চেক এন্ট্রি ·": " cheque entries ·", "চেক দেখুন": "View cheques", "এখনো চেক এন্ট্রি নেই": "No cheque entries yet", "· দৈনিক ক্লোজিং": "· daily closing",
  // admin
  "ব্যবহারকারী": "Users", "পুরনো ডাটা import": "Old data import", "সেটআপ": "Setup", "সক্রিয়": "Active",
  "নতুন ব্যবহারকারী যোগ: Supabase → Authentication → Users → Add user (ইমেইল + পাসওয়ার্ড)। এখানে এসে নাম ও Role ঠিক করুন।": "Add a user: Supabase → Authentication → Users → Add user (email + password). Then set the name and role here.",
  "চেক এন্ট্রিতে": "it appears on cheque entries as", "কে এন্ট্রি করেছে": "entered by", "হিসেবে বসে।": ".",
  "পুরনো ব্যাংক ব্যালেন্স ইতিহাস": "Old bank balance history", "এখন ডাটাবেসে ব্যালেন্স রেকর্ড:": "Balance records in the database now:", "⬆ পুরনো ডাটা import করুন": "⬆ Import old data",
  "পুরনো ডাটা import করবেন?": "Import the old data?", "✔ import সম্পূর্ণ": "✔ Import complete", "ডাটা কী পাওয়া যায়নি": "Data key not found", "সংক্ষেপে": "In short",
  "শুধু নতুন এন্ট্রি / স্ট্যাটাস / ব্যালেন্স": "can only add new entries / statuses / balances", "করতে পারে — পুরনো এন্ট্রি বদলানো বা মোছা শুধু": "— changing or deleting old entries is only for",
  "(ডাটাবেস নিজেই আটকায়)।": "(enforced by the database).", "শুধু দেখতে ও এনকোয়ারি/রিপোর্ট নিতে পারে।": "can only view, enquire and take reports.",
  "ভুল স্ট্যাটাস দিলে নতুন স্ট্যাটাস দিন — ইতিহাস থেকে যাবে।": "If a status is wrong, add a new one — the history is kept.",
  "নতুন চেক বই যোগ করলে": "When a new cheque book is added, the", "পাতায় মিসিং পাতা নিজে থেকে ধরা পড়বে।": "page flags missing leaves automatically.",
  "রিফ্রেশ ব্যর্থ:": "Refresh failed:", "ত্রুটি:": "Error:", "যোগ": "Add"
};
const I18N_KEYS = Object.keys(I18N).filter(k => k.length >= 6).sort((a, b) => b.length - a.length);
const BN_DIG = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };
const HAS_BN = /[ঀ-৿]/;
function tr(str) {
  if (LANG !== "en" || !str || !HAS_BN.test(str)) return str;
  const t = str.trim();
  if (I18N[t] !== undefined) return str.replace(t, I18N[t]);
  let out = str;
  for (const k of I18N_KEYS) if (out.includes(k)) { out = out.split(k).join(I18N[k]); if (!HAS_BN.test(out)) break; }
  out = out.replace(/(\d)\s?টি/g, "$1 ").replace(/[০-৯]/g, d => BN_DIG[d]);
  const t2 = out.trim(); if (I18N[t2] !== undefined) out = out.replace(t2, I18N[t2]);
  return out;
}
function translateTree(root) {
  if (LANG !== "en" || !root) return;
  if (root.nodeType === 3) { const v = tr(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; return; }
  if (root.nodeType !== 1 || root.closest?.("[data-nt]")) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = root;
  while (n) {
    if (n.nodeType === 3) { if (HAS_BN.test(n.nodeValue)) { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } }
    else { if (n.tagName === "SCRIPT" || n.tagName === "STYLE") { n = w.nextSibling() || w.nextNode(); continue; }
      for (const a of ["placeholder", "title", "data-l"]) { const v = n.getAttribute?.(a); if (v && HAS_BN.test(v)) n.setAttribute(a, tr(v)); } }
    n = w.nextNode();
  }
}
const i18nObserver = new MutationObserver(ms => { if (LANG !== "en") return; for (const m of ms) { if (m.type === "characterData") translateTree(m.target); else m.addedNodes.forEach(translateTree); } });
function startI18n() { document.documentElement.lang = LANG; i18nObserver.observe(document.body, { childList: true, subtree: true, characterData: true }); translateTree(document.body); }
const langToggle = () => `<span class="lang" id="lang" title="ভাষা / Language" data-nt><span class="${LANG === "bn" ? "on" : ""}">বাং</span><span class="${LANG === "en" ? "on" : ""}">EN</span></span>`;
function setLang(l) { LANG = l; try { localStorage.setItem("nabiad_lang", l); } catch { } document.documentElement.lang = l; if (typeof onLangChange === "function") onLangChange(); }
