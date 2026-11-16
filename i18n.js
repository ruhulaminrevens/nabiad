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
  "অফলাইন": "Offline", "অনলাইন": "Online", "সিঙ্ক বাকি": "Sync pending", "সিঙ্ক হচ্ছে…": "Syncing…", "⏳ সিঙ্ক বাকি": "⏳ Sync pending", "সার্ভারে যাওয়া বাকি": "Not yet on the server",
  "ইন্টারনেট নেই — এন্ট্রি এই ডিভাইসে জমা থাকবে, নেট এলে নিজে থেকে সিঙ্ক হবে": "No internet — entries are kept on this device and sync automatically when online",
  "এন্ট্রি সার্ভারে যাওয়া বাকি — চাপলে এখনই সিঙ্ক": "entries waiting for the server — click to sync now", "সব ডাটা সার্ভারে সেভ আছে": "All data is saved on the server",
  "ইন্টারনেট ফিরে এসেছে — সিঙ্ক হচ্ছে": "Back online — syncing", "ইন্টারনেট নেই — অফলাইনে এন্ট্রি চালিয়ে যান, পরে নিজে সিঙ্ক হবে": "No internet — keep entering offline; it will sync automatically",
  "ইন্টারনেট নেই — নেট এলে নিজে থেকে সিঙ্ক হবে": "No internet — will sync automatically when online", "অফলাইন এন্ট্রি সিঙ্ক হয়েছে": "offline entries synced",
  "সিঙ্ক হয়নি:": "Sync failed:", "— আগেই অন্য কেউ এন্ট্রি করেছে": "— already entered by someone else", "ব্যালেন্স — আগেই সেভ করা আছে": "balances — already saved",
  "✔ অফলাইনে জমা হয়েছে:": "✔ Saved offline:", "— নেট এলে সিঙ্ক হবে": "— will sync when online", "✔ অফলাইনে জমা হয়েছে — নেট এলে সিঙ্ক হবে": "✔ Saved offline — will sync when online",
  "ইন্টারনেট নেই এবং আগের দিনের ব্যালেন্স এই ডিভাইসে জমা নেই। একবার অনলাইনে ক্লোজিং পাতা খুললে পরে অফলাইনেও চলবে।": "No internet and the previous day's balances are not stored on this device. Open the closing page once while online and it will work offline afterwards.",
  "রিফ্রেশ ব্যর্থ:": "Refresh failed:", "ত্রুটি:": "Error:", "যোগ": "Add",
  // ---- v5: closing / report / reminders / audit / photos
  "‹ আগের": "‹ Prev", "পরের ›": "Next ›", "আগের দিন (শুক্রবার বাদ)": "Previous day (skips Friday)", "পরের দিন (শুক্রবার বাদ)": "Next day (skips Friday)",
  "A/C খুঁজুন — কোড, হোল্ডার, ব্যাংক, A/C নং…": "Search A/C — code, holder, bank, A/C no…", "রিপোর্টে খুঁজুন — কোড, হোল্ডার, ব্যাংক…": "Search report — code, holder, bank…",
  "সব অ্যাকাউন্ট": "All accounts", "শুধু আপডেট করা": "Updated only", "শুধু অপরিবর্তিত": "Unchanged only", "আজ লেনদেন আছে": "Has activity today",
  "আপডেট": "Updated", "আপডেট করা": "Updated", "অপরিবর্তিত": "Unchanged", "লেনদেন": "Activity",
  "🔒 এই তারিখের ব্যালেন্স ফাইনাল সেভ হয়েছে। বদলাতে Admin কে বলুন।": "🔒 This date is final-saved. Ask Admin to change it.",
  "⚠ এই তারিখ আগেই ফাইনাল সেভ আছে — সেভ করলে Admin হিসেবে নতুন মান বসবে।": "⚠ This date is already final-saved — saving will overwrite as Admin.",
  "কর্মদিবসের ডাটা নেই)": "working days without data)", "(মাঝে": "(gap of",
  "· আগের দিনের ক্লোজিং নিজে থেকে বসানো আছে — শুধু যেগুলো বদলেছে সেগুলো লিখুন।": "· Previous closing is pre-filled — type only the ones that changed.",
  "ড্রাফট লোড হয়েছে —": "Draft loaded —", "(এই ডিভাইস)": "(this device)", "ড্রাফট বাদ দিন": "Discard draft",
  "এই তারিখের ড্রাফট মুছে আগের দিনের ক্লোজিং থেকে নতুন করে শুরু করবেন?": "Delete this date's draft and start again from the previous closing?",
  "শুক্রবার — সাধারণত ব্যাংক বন্ধ থাকে। দরকার না হলে \"পরের ›\" চাপুন।": "Friday — banks are usually closed. Press \"Next ›\" if not needed.",
  "আজ অ্যাপে লেনদেন আছে — যাচাই করুন": "Activity recorded in the app today — please verify",
  "ড্রাফট সেভ": "Save draft", "ব্যালেন্স ফাইনাল সেভ": "balance final save",
  "নীল = আপডেট করা": "Blue = updated", "কালো = আগের দিনের মতোই": "Black = same as previous day", "আজ অ্যাপে লেনদেন আছে": "Activity in app today", "খরচ": "Debit", "জমা": "Credit",
  "ফাইনাল সেভের পর Staff আর বদলাতে পারবে না। মাঝপথে থামতে \"ড্রাফট সেভ\" চাপুন — এই ডিভাইসে নিজে থেকেও জমা হয়। Diff ≠ 0 হলে মন্তব্য বাধ্যতামূলক।": "After final save, Staff cannot change it. To pause midway press \"Save draft\" — it also auto-saves on this device. Remarks are required when Diff ≠ 0.",
  "✓ এই ডিভাইসে অটো-সেভ": "✓ Auto-saved on this device", "✔ ড্রাফট সেভ হয়েছে — পরে যেকোনো ডিভাইস থেকে চালিয়ে যেতে পারবেন": "✔ Draft saved — continue later from any device",
  "ইন্টারনেট নেই — ড্রাফট শুধু এই ডিভাইসে জমা আছে": "No internet — draft kept on this device only", "সার্ভারে ড্রাফট সেভ হয়নি (এই ডিভাইসে জমা আছে):": "Draft not saved on server (kept on this device):",
  "— ফাইনাল সেভ": "— final save", "মোট ক্লোজিং ৳": "Total closing ৳", "টি অ্যাকাউন্ট আপডেট,": " accounts updated,", "টি আগের মতো।": " unchanged.",
  "সেভের পর আর বদলানো যাবে না (শুধু Admin পারবে)।": "Cannot be changed after saving (Admin only).", "✔ ব্যালেন্স ফাইনাল সেভ হয়েছে": "✔ Balance final-saved",
  "ক্লোজিং সেভ হয়েছে।": "closing saved.", "রিপোর্ট দেখুন ও Boss-কে পাঠান": "View report & send to Boss",
  "শেয়ার": "Share", "Boss-কে ইমেইল": "Email Boss", "খোঁজার সাথে কিছু মেলেনি": "Nothing matches the search", "শেয়ার করা যায়নি:": "Could not share:",
  // reminders
  "রিমাইন্ডার": "Reminders", "রিমাইন্ডার ও সতর্কতা": "Reminders & alerts", "নতুন রিমাইন্ডার": "New reminder", "⏰ নতুন রিমাইন্ডার": "⏰ New reminder", "রিমাইন্ডার এডিট": "Edit reminder",
  "কী মনে করাবে *": "Remind me to *", "যেমন: PBL-483 চেক পাস হয়েছে কিনা দেখুন": "e.g. Check whether PBL-483 cheque has cleared", "বিস্তারিত": "Details",
  "১ ঘণ্টা পরে": "In 1 hour", "কাল সকাল ১০টা": "Tomorrow 10 AM", "৩ দিন পরে": "In 3 days", "১ সপ্তাহ পরে": "In 1 week", "সময়": "Time", "পুনরাবৃত্তি": "Repeat", "কার জন্য": "For whom",
  "একবার": "Once", "প্রতি ঘণ্টা": "Hourly", "প্রতিদিন": "Daily", "প্রতি সপ্তাহ": "Weekly", "প্রতি মাস": "Monthly", "শুধু আমি": "Only me", "সবাই": "Everyone", "শুধু Admin": "Admin only",
  "কী মনে করাবে লিখুন": "Enter what to remind", "তারিখ/সময় ঠিক করুন": "Fix the date/time", "✔ রিমাইন্ডার সেভ হয়েছে": "✔ Reminder saved",
  "রিমাইন্ডার টেবিল নেই — Supabase-এ schema_v2.sql চালাতে হবে": "Reminders table missing — run schema_v2.sql in Supabase",
  "সিস্টেম সতর্কতা": "System alerts", "✔ কোনো সতর্কতা নেই": "✔ No alerts", "দেখুন →": "Open →", "চালু": "Active", "সম্পন্ন": "Done", "সব": "All", "✓ সম্পন্ন": "✓ Done",
  "১০ মিনিট": "10 min", "১ ঘণ্টা": "1 hour", "কাল ১০টা": "Tomorrow 10", "ক্যালেন্ডার": "Calendar", "সব রিমাইন্ডার": "All reminders", "চেক": "Cheque",
  "ফোনের ক্যালেন্ডারে অ্যালার্ম সহ যোগ করুন": "Add to phone calendar with alarm", "এই রিমাইন্ডার মুছবেন?": "Delete this reminder?",
  "কোনো রিমাইন্ডার নেই — \"+ নতুন রিমাইন্ডার\" চাপুন। চেকের পাতা থেকেও রিমাইন্ডার দেওয়া যায়।": "No reminders — press \"+ New reminder\". You can also set one from a cheque.",
  "💡 অ্যাপ পুরো বন্ধ থাকলেও অ্যালার্ম চাইলে \"ক্যালেন্ডার\" চাপুন — ফোনের ক্যালেন্ডারে অ্যালার্মসহ যোগ হবে।": "💡 For an alarm even when the app is closed, press \"Calendar\" — it is added to your phone calendar with an alarm.",
  "ফোন/কম্পিউটারে নোটিফিকেশন পেতে অনুমতি দিন (অ্যাপ খোলা বা background-এ থাকলে আসবে)।": "Allow notifications on this phone/computer (shown while the app is open or in the background).",
  "নোটিফিকেশন চালু": "Enable notifications", "ব্রাউজারে নোটিফিকেশন বন্ধ করা আছে — ব্রাউজারের সাইট সেটিং থেকে চালু করুন। অ্যাপের ভিতরে রিমাইন্ডার তবুও আসবে।": "Notifications are blocked in the browser — enable them in site settings. In-app reminders still work.",
  "✔ নোটিফিকেশন চালু হয়েছে": "✔ Notifications enabled", "রিমাইন্ডারের সময় এখানে জানাবে": "You'll be alerted here at reminder time", "⏰ পরে মনে করিয়ে দেবে": "⏰ Will remind you later",
  "✔ পরের রিমাইন্ডার:": "✔ Next reminder:", "আজকের দৈনিক ক্লোজিং এখনো সেভ হয়নি": "Today's daily closing is not saved yet", "কর্মদিবসের ক্লোজিং বাকি (শেষ সেভ:": "working days of closing pending (last saved:",
  "ড্রাফট আছে, ফাইনাল সেভ বাকি:": "Draft exists, final save pending:", "টি অফলাইন এন্ট্রি সিঙ্ক বাকি": " offline entries waiting to sync", "দিনের বেশি Pending": "days+ pending", "মিসিং চেক পাতা আছে:": "Missing cheque leaves:",
  "মিনিট": "min", "ঘণ্টা": "h", "আগে": "ago", "পরে": "later", "এখন": "now",
  "চেক পাস হয়েছে কিনা দেখুন": "check whether it has cleared",
  // photos / entry
  "চেকের ছবি": "Cheque photo", "(ঐচ্ছিক)": "(optional)", "ছবি তুলুন / বাছুন": "Take / choose photo", "ছবি বাদ": "Remove photo", "পাস হওয়ার রিমাইন্ডার": "Clearing reminder", "(ঐচ্ছিক — যেমন পার্টি চেক)": "(optional — e.g. party cheque)",
  "দিন বাছুন": "Pick days", "২ দিন পরে": "In 2 days", "৭ দিন পরে": "In 7 days", "১৫ দিন পরে": "In 15 days", "রিমাইন্ডারের তারিখ চেকের তারিখের আগে হতে পারে না": "Reminder date cannot be before the cheque date",
  "ছবি আছে": "Has photo", "রিমাইন্ডার আছে": "Has reminder", "ছবি যোগ": "Add photo", "ছবি বদলান": "Replace photo", "ছবি বাছুন": "Choose a photo", "✔ ছবি সেভ হয়েছে": "✔ Photo saved", "ছবি সেভ হয়নি:": "Photo not saved:",
  "ছবি লোড হয়নি:": "Photo failed to load:", "ছবি পড়া যায়নি": "Could not read the image", "ছবি আপলোড হয়নি — আবার চেষ্টা করুন": "Photo upload failed — try again", "ছবি সেভ হয়নি": "photo not saved", "রিমাইন্ডার সেভ হয়নি:": "reminder not saved:",
  "ইন্টারনেট নেই, তাই ছবি সেভ হয়নি (পরে চেকের পাতা থেকে যোগ করুন)": "no internet so the photo was not saved (add it later from the cheque)",
  // audit
  "Audit log · এডিট ইতিহাস": "Audit log · change history", "খুঁজুন (কে, A/C, চেক নং, তারিখ)": "Search (who, A/C, cheque no, date)", "কোথায়": "Where", "কাজ": "Action", "কে": "Who", "কী": "What", "পরিবর্তন": "Change",
  "যোগ": "Added", "বদল": "Changed", "মুছে ফেলা": "Deleted", "টি পরিবর্তন": " changes", "এই সময়ে কোনো পরিবর্তন নেই": "No changes in this period", "(সর্বশেষ ৫০০টি — তারিখ ছোট করুন)": "(latest 500 — narrow the dates)",
  "Audit log টেবিল নেই — Supabase-এ schema_v2.sql চালাতে হবে": "Audit log table missing — run schema_v2.sql in Supabase", "ব্যালেন্স": "Balance", "ব্যবহারকারী": "Users",
  // ---- v6
  "ক্যাশ": "Cash", "ব্যাংক": "Bank", "হোম": "Home", "দৈনিক ক্যাশ রেকর্ড": "Daily Cash Record", "ক্যাশ সামারি": "Cash Summary", "ক্যাশ রিপোর্ট": "Cash Reports", "ক্যাশ রেজিস্টার": "Cash Register", "সেটিংস": "Settings", "Audit ও Security": "Audit & Security",
  "ক্যাশ সামারি ও ইতিহাস": "Cash Summary & History", "ব্যাংক রিপোর্ট": "Bank report", "শুভ সকাল": "Good morning", "শুভ দুপুর": "Good afternoon", "শুভ সন্ধ্যা": "Good evening", "· শুক্রবার (সাপ্তাহিক বন্ধ)": "· Friday (weekly off)",
  "দৈনিক ব্যাংক ক্লোজিং": "Daily Bank Closing", "ব্যাংক ক্লোজিং": "Bank closing", "ক্যাশ রেকর্ড": "Cash record", "আজ সেভ হয়েছে": "Saved today", "শেষ:": "Last:", "এখনো নেই": "None yet", "টি সময় হয়েছে": " due", "টি আসছে": " upcoming", "দেখা হচ্ছে…": "Checking…",
  "ব্যাংক ব্যালেন্স": "Bank balance", "ব্যবহারযোগ্য (Usable)": "Usable", "ক্যাশ ক্লোজিং": "Cash closing", "চেক · এই মাস": "Cheques · this month", "ব্যাংক ব্যালেন্স ট্রেন্ড": "Bank balance trend", "৩০ দিন": "30 days", "১৪ দিন": "14 days", "রিপোর্ট →": "Report →", "সামারি →": "Summary →",
  "ক্যাশ: আয় বনাম ব্যয়": "Cash: receipts vs payments", "ট্রেন্ড দেখাতে আরও ডাটা লাগবে": "More data needed for a trend", "এই সময়ে কোনো রেকর্ড নেই": "No records in this period", "— আগের মতো": "— unchanged",
  "সর্বশেষ চেক এন্ট্রি": "Latest cheque entries", "সব →": "All →", "আসন্ন রিমাইন্ডার": "Upcoming reminders", "কোনো রিমাইন্ডার নেই": "No reminders", "রিমাইন্ডার দিন": "Add reminder", "পুরনো Pending চেক": "Old pending cheques", "প্রথম চেক এন্ট্রি": "First cheque entry",
  "এখনো কোনো ক্যাশ রেকর্ড নেই": "No cash record yet", "হাতে ক্যাশ": "cash in hand", "SQL v3 চালানো বাকি": "SQL v3 not run yet", "সেটআপ বাকি": "Setup pending", "এখনো হয়নি": "Not yet",
  "🏦 ব্যাংক ব্যালেন্স": "🏦 Bank balance", "🧾 চেক": "🧾 Cheques", "৭ দিন": "7 days", "ক্লোজিং ব্যালেন্স": "Closing balance", "এই সময়ে পরিবর্তন": "Change in period", "সর্বোচ্চ / সর্বনিম্ন": "Highest / lowest", "দৈনিক মোট ব্যালেন্স": "Daily total balance",
  "ব্যাংক অনুযায়ী (ক্লোজিং)": "By bank (closing)", "হোল্ডার অনুযায়ী (ক্লোজিং)": "By holder (closing)", "সবচেয়ে বেশি পরিবর্তন": "Biggest changes", "সব অ্যাকাউন্ট": "All accounts", "শুরু": "Opening", "শেষ": "Closing", "এই সময়ে কোনো ব্যালেন্স সেভ নেই": "No balances saved in this period",
  "ইন্টারনেট নেই — ব্যাংক রিপোর্টের জন্য অনলাইন থাকতে হবে": "No internet — bank report needs to be online", "এই সময়ে কোনো চেক এন্ট্রি নেই।": "No cheque entries in this period.", "খাত অনুযায়ী": "By purpose", "কে তুলেছে (ক্যাশ)": "Cash taken by", "ব্যাংক অনুযায়ী": "By bank", "অ্যাকাউন্ট অনুযায়ী": "By account", "দিন অনুযায়ী": "By day", "মাস অনুযায়ী": "By month",
  "From তারিখ To-এর পরে হতে পারে না": "From date cannot be after To", "দিন": "days",
  // entry
  "চেকের ছবি": "Cheque photo", "নোট / মন্তব্য / সাপ্লায়ার / অন্যান্য": "Note / Remarks / Supplier / Others", "যেমন: সাপ্লায়ারের নাম — বিলের বিবরণ": "e.g. supplier name — bill details",
  // cash
  "আজকের রেকর্ড": "Today's record", "সামারি": "Summary", "ক্যাশ টেবিল নেই — Supabase-এ schema_v3.sql চালাতে হবে": "Cash table missing — run schema_v3.sql in Supabase",
  "🔒 এই তারিখের ক্যাশ রেকর্ড ফাইনাল সেভ হয়েছে।": "🔒 This date's cash record is final-saved.", "⚠ ফাইনাল সেভ করা আছে — Admin হিসেবে বদলাতে পারবেন।": "⚠ Final-saved — you can change it as Admin.", "ড্রাফট লোড হয়েছে": "Draft loaded",
  "Opening নেওয়া হয়েছে": "Opening taken from", "-এর ক্লোজিং থেকে": " closing", "কর্মদিবসের রেকর্ড নেই": "working days without a record", "এটা প্রথম রেকর্ড — Opening Cash ও Bank নিজে লিখুন।": "This is the first record — enter Opening Cash and Bank yourself.",
  "এই তারিখের ড্রাফট মুছবেন?": "Delete this date's draft?", "নোট": "Note", "একাধিক অংক যোগ করতে + লিখুন, যেমন 5000+12000+800": "To add several amounts type +, e.g. 5000+12000+800",
  "(গুনে লিখুন)": "(count and enter)", "হাতে নগদ": "Cash in hand", "(Closing − Cash)": "(Closing − Cash)", "ক্যাশ ফাইনাল সেভ": "cash final save", "ভুল অংক:": "Invalid amount:", "— শুধু সংখ্যা আর + / − লিখুন": "— use only digits and + / −",
  "Cash in hand লিখুন (হাতে কত নগদ আছে)": "Enter Cash in hand", "✔ ক্যাশ রেকর্ড ফাইনাল সেভ হয়েছে": "✔ Cash record final-saved", "ইন্টারনেট নেই — এই ডিভাইসে জমা আছে, নেট এলে আবার সেভ করুন": "No internet — kept on this device, save again when online",
  "দিনের ফাইনাল রেকর্ড": "days of final records", "টি ড্রাফট": " drafts", "মোট Receipt": "Total receipt", "মোট Payment": "Total payment", "দৈনিক গড়": "Daily avg", "নিট (Receipt − Payment)": "Net (Receipt − Payment)", "সর্বশেষ Closing": "Latest closing", "রেকর্ড নেই": "No record",
  "দৈনিক Receipt বনাম Payment": "Daily receipt vs payment", "Closing ও হাতে নগদ": "Closing & cash in hand", "দৈনিক ইতিহাস": "Daily history", "অবস্থা": "Status", "ফাইনাল": "Final", "ড্রাফট": "Draft",
  "এই সময়ে কোনো ক্যাশ রেকর্ড নেই": "No cash records in this period", "ক্যাশ রেকর্ড শুরু করুন": "Start a cash record", "এই সময়ে কোনো ফাইনাল ক্যাশ রেকর্ড নেই": "No final cash records in this period",
  "Receipt — খাত অনুযায়ী": "Receipts by category", "Payment — খাত অনুযায়ী": "Payments by category", "নিট": "Net", "খুঁজুন (নোট, খাত, অংক)": "Search (note, category, amount)", "ধরন": "Type", "টি লাইন": " lines", "৩০ দিন ": "30 days ",
  // reminders
  "যেমন: পার্টির চেক জমা দিন / পাস হয়েছে কিনা দেখুন": "e.g. deposit party cheque / check if cleared", "বিস্তারিত (পার্টি, টাকা, ব্যাংক…)": "Details (party, amount, bank…)", "চেক / কাগজের ছবি": "Cheque / document photo",
  "ছবি আছে — নতুন দিলে বদলাবে": "Has photo — a new one will replace it", "কত দিন পরে (Pick days)": "In how many days (Pick days)", "আমাদের চেকের সাথে যুক্ত করুন": "Link to one of our cheques", "A/C বা চেক নং লিখুন": "Type A/C or cheque no",
  "ছবি সেভ করতে ইন্টারনেট লাগবে": "Internet needed to save a photo", "✔ রিমাইন্ডার:": "✔ Reminder:", "নোটিফিকেশন চালু করলে সময় হলে ফোনে জানাবে।": "Turn on notifications to be alerted on your phone.", "চালু করুন": "Turn on",
  "টির সময় হয়েছে": " due now", "পার্টির চেক, পেমেন্ট, অডিট বা যেকোনো কাজ — ছবি ও দিন বেছে দিন": "Party cheque, payment, audit or any task — add a photo and pick days",
  "কোনো সম্পন্ন রিমাইন্ডার নেই": "No completed reminders", "এখনো কোনো রিমাইন্ডার নেই — উপরের \"নতুন রিমাইন্ডার\" চাপুন।": "No reminders yet — press \"New reminder\" above.", "খুলুন →": "Open →",
  "আজকের দৈনিক ক্যাশ রেকর্ড এখনো সেভ হয়নি": "Today's daily cash record is not saved yet",
  // settings
  "👤 প্রোফাইল": "👤 Profile", "আপনার নাম": "Your name", "(চেক/ক্লোজিং-এ \"কে এন্ট্রি করেছে\" হিসেবে বসে)": "(shown as \"entered by\")", "নতুন পাসওয়ার্ড": "New password", "কমপক্ষে ৮ অক্ষর": "At least 8 characters", "বদলান": "Change",
  "🎨 দেখতে কেমন": "🎨 Appearance", "লাইট": "Light", "ডার্ক": "Dark", "লেখার আকার": "Text size", "ছোট": "Small", "স্বাভাবিক": "Normal", "বড়": "Large", "টেবিল": "Tables", "আরামদায়ক": "Comfortable", "ঘন (বেশি সারি)": "Compact (more rows)", "অ্যাপ খুললে কোন পাতা": "Start page",
  "🔔 রিমাইন্ডার ও সতর্কতা": "🔔 Reminders & alerts", "ব্যাংক ক্লোজিং বাকি থাকলে সতর্কতা": "Alert if bank closing pending at", "ক্যাশ রেকর্ড বাকি থাকলে সতর্কতা": "Alert if cash record pending at", "কত দিন Pending হলে সতর্কতা": "Pending alert after", "শব্দ": "Sound", "বন্ধ": "Off",
  "শুক্রবার": "Friday", "বন্ধ দিন (আগের/পরের বাটনে বাদ)": "Day off (skipped by prev/next)", "কর্মদিবস": "Working day", "✓ নোটিফিকেশন চালু আছে": "✓ Notifications on", "নোটিফিকেশন ব্রাউজারে বন্ধ": "Blocked in browser", "নোটিফিকেশন চালু করুন": "Enable notifications", "পরীক্ষা করুন": "Test",
  "📱 অ্যাপ ও ডাটা": "📱 App & data", "সংস্করণ": "Version", "ইন্টারনেট": "Internet", "অনলাইন": "Online", "অফলাইন": "Offline", "সিঙ্ক বাকি": "Pending sync", "এই ডিভাইসে জমা ডাটা": "Data stored on this device", "এখনই সিঙ্ক": "Sync now", "↻ আপডেট দেখুন": "↻ Check for update", "⬇ অ্যাপ ইনস্টল": "⬇ Install app", "ক্যাশ মুছে রিলোড": "Clear cache & reload",
  "\"ক্যাশ মুছে রিলোড\" শুধু এই ডিভাইসের জমা কপি মোছে — সার্ভারের ডাটা ঠিক থাকে। সিঙ্ক বাকি থাকলে আগে সিঙ্ক করুন।": "\"Clear cache\" only removes this device's copy — server data is safe. Sync first if anything is pending.",
  "🛡 Admin শর্টকাট": "🛡 Admin shortcuts", "ব্যবহারকারী ও অ্যাকাউন্ট": "Users & accounts", "Audit ও Backup": "Audit & Backup", "✔ নাম সেভ হয়েছে": "✔ Name saved", "✔ পাসওয়ার্ড বদলানো হয়েছে": "✔ Password changed", "পাসওয়ার্ড কমপক্ষে ৮ অক্ষর": "Password must be at least 8 characters",
  "✔ সিঙ্ক ও রিফ্রেশ হয়েছে": "✔ Synced and refreshed", "নতুন সংস্করণ থাকলে রিলোড হচ্ছে…": "Reloading if a new version exists…", "পরীক্ষার নোটিফিকেশন পাঠানো হয়েছে": "Test notification sent",
  // backup / security
  "এখনই Backup": "Backup now", "পুরো ডাটা ডাউনলোড (Excel)": "Download all data (Excel)", "Backup তালিকা": "Backup list", "শেষ স্বয়ংক্রিয়:": "Last automatic:", "এখনো হয়নি — আজ রাত ১২টায় প্রথমটি হবে": "None yet — the first runs tonight at 12 AM",
  "স্বয়ংক্রিয়": "Automatic", "হাতে": "Manual", "রেকর্ড": "Records", "এখনো কোনো Backup নেই": "No backups yet", "✔ Backup নেওয়া হয়েছে": "✔ Backup taken", "Backup টেবিল নেই — Supabase-এ schema_v3.sql চালাতে হবে": "Backup table missing — run schema_v3.sql in Supabase",
  "ডাটা আনা হচ্ছে… (ব্যালেন্স ইতিহাস বড়, একটু সময় লাগবে)": "Fetching data… (balance history is large, please wait)", "🔐 নিরাপত্তা ব্যবস্থা": "🔐 Security measures", "💻 এই সেশন": "💻 This session", "লগইন ইমেইল": "Signed in as", "ডিভাইস": "Device",
  "অন্য সব ডিভাইস থেকে লগআউট": "Sign out all other devices", "👥 ব্যবহারকারী": "👥 Users", "সক্রিয়": "Active", "নিষ্ক্রিয়": "Inactive", "ব্যবহারকারী বদলাতে Admin →": "Manage users in Admin →", "✔ অন্য ডিভাইস থেকে লগআউট হয়েছে": "✔ Signed out other devices",
  "💡 অ্যাপ পুরো বন্ধ থাকলেও অ্যালার্ম চাইলে": "💡 For an alarm even when the app is closed, press", "বাটন চাপুন — ফোনের ক্যালেন্ডারে অ্যালার্মসহ যোগ হবে।": "— it is added to your phone calendar with an alarm.", "শেষ:": "Last:", "আজ": "Today",
  "সব পাতা": "All pages", "মেনু": "Menu", "বন্ধ": "Close", "পুরনো ডাটা": "Old data", "কোড, হোল্ডার, ব্যাংক, A/C নং…": "Code, holder, bank, A/C no…", "নতুন": "New", "টি অ্যাকাউন্ট": " accounts", "দৈনিক ক্লোজিং-এ": "in daily closing", "দৈনিক": "Daily",
  "এটা আপনি": "This is you", "➕ নতুন ব্যবহারকারী কীভাবে যোগ করবেন": "➕ How to add a new user", "ইমেইল ও পাসওয়ার্ড দিন,": "Enter email and password, tick", "টিক দিন": "",
  "এই পাতা রিফ্রেশ করুন — নতুন ব্যবহারকারী নিষ্ক্রিয় অবস্থায় আসবে": "Refresh this page — the new user appears as inactive", "নাম ও Role ঠিক করে সক্রিয় করুন, তারপর সেভ": "Set name and role, activate, then save",
  "নাম চেক/ক্লোজিং/ক্যাশে \"কে এন্ট্রি করেছে\" হিসেবে বসে।": "The name is shown as \"entered by\" on cheques, closing and cash.", "নিজের Admin অধিকার সরিয়ে দিলে আর অ্যাডমিন পাতায় আসতে পারবেন না। নিশ্চিত?": "Removing your own Admin rights locks you out of Admin. Sure?",
  "📥 পুরনো ব্যাংক ব্যালেন্স ইতিহাস": "📥 Old bank balance history", "ডাটাবেসে রেকর্ড": "Records in database", "ফাইলে রেকর্ড": "Records in file", "✔ পুরনো ডাটা ইতিমধ্যে import হয়ে গেছে — আর কিছু করতে হবে না।": "✔ Old data is already imported — nothing more to do.",
  "আবার import করতে চাইলে": "Import again", "⬆ আবার import": "⬆ Import again", "এখনো import হয়নি।": "Not imported yet.", "একই তারিখ+A/C আবার তুললে আগেরটার জায়গায় বসবে — ডুপ্লিকেট হয় না।": "Same date+A/C replaces the old row — no duplicates.",
  "সিস্টেম পরীক্ষা হচ্ছে…": "Checking system…", "🩺 সিস্টেম অবস্থা": "🩺 System status", "ডাটাবেস সংযোগ": "Database connection", "v2: ড্রাফট · রিমাইন্ডার · Audit · ছবি": "v2: drafts · reminders · audit · photos", "v3: ক্যাশ · Backup · নিজের নাম": "v3: cash · backup · own name",
  "schema_v2.sql চালাতে হবে": "run schema_v2.sql", "schema_v3.sql চালাতে হবে": "run schema_v3.sql", "রাত ১২টার Backup": "12 AM backup", "অফলাইন মোড (PWA)": "Offline mode (PWA)", "রিলোড দিলে চালু হবে": "Active after reload",
  "👮 কে কী পারে": "👮 Who can do what", "চেক / ক্লোজিং / ক্যাশ যোগ": "Add cheque / closing / cash", "ফাইনাল সেভের পর বদলানো": "Change after final save", "মুছে ফেলা": "Delete", "রিপোর্ট দেখা": "View reports", "Backup ও ব্যবহারকারী": "Backup & users",
  "ভুল স্ট্যাটাস দিলে নতুন স্ট্যাটাস দিন — ইতিহাস থেকে যায়। এই নিয়ম ডাটাবেস (RLS) নিজেই আটকায়।": "If a status is wrong, add a new one — history is kept. The database (RLS) enforces these rules.", "⚡ দ্রুত লিংক": "⚡ Quick links", "Supabase ড্যাশবোর্ড ↗": "Supabase dashboard ↗", "GitHub কোড ↗": "GitHub code ↗",
  "💡 একই খাতে কয়েকটা অংক থাকলে + দিয়ে লিখুন, যেমন 5000+12000": "💡 Several amounts in one category? Type them with +, e.g. 5000+12000",
  "ডাউনলোড ▾": "Download ▾", "প্রিন্ট / PDF": "Print / PDF", "লগ পরিষ্কার": "Clear log", "তারিখ": "Date", "খুঁজুন — A/C, চেক নং, ইমেইল…": "Search — A/C, cheque no, email…", "সব জায়গা": "All places", "সব কাজ": "All actions", "সবাই": "Everyone",
  "মোট পরিবর্তন": "Total changes", "সবচেয়ে বেশি:": "Most:", "আরও লোড করুন": "Load more", "৯০ দিন": "90 days",
  "🧹 Audit log পরিষ্কার": "🧹 Clear audit log", "পুরনো লগ মুছে জায়গা খালি করুন। মোছার পরেও \"কে কখন পরিষ্কার করেছে\" তার একটা রেকর্ড থেকে যাবে।": "Delete old log entries to free space. A record of who cleared it, and when, is always kept.",
  "৯০ দিনের বেশি পুরনো": "Older than 90 days", "৩০ দিনের বেশি পুরনো": "Older than 30 days", "৭ দিনের বেশি পুরনো": "Older than 7 days", "সব লগ": "Entire log", "মোছার আগে Excel কপি ডাউনলোড করুন": "Download an Excel copy before deleting",
  "নিশ্চিত করতে": "To confirm, type", "লিখুন": "", "পরিষ্কার করুন": "Clear", "CLEAR লিখুন": "Type CLEAR", "টি পুরনো লগ মুছে ফেলা হয়েছে": " old log entries deleted", "schema_v4.sql চালানো বাকি": "schema_v4.sql not run yet",
  "পুরো ডাটা (Excel)": "All data (Excel)", "শেষ স্বয়ংক্রিয়": "Last automatic", "আজ রাতে প্রথমটি হবে": "First one tonight", "পরের Backup": "Next backup", "মোট Backup": "Total backups", "শেষ হাতে-নেওয়া": "Last manual",
  "ℹ️ Backup কীভাবে কাজ করে": "ℹ️ How backup works", "🕛 প্রতি রাত ১২টায় (বাংলাদেশ সময়) ডাটাবেস নিজে থেকে Backup নেয় — কাউকে কিছু করতে হয় না।": "🕛 Every night at 12 AM (Bangladesh time) the database backs itself up — nobody needs to do anything.",
  "🗂 স্বয়ংক্রিয় Backup শেষ ১৪ দিনের রাখা হয়, হাতে নেওয়া Backup শেষ ১০টি।": "🗂 Automatic backups are kept for 14 days; the last 10 manual ones are kept.",
  "⬇ যেকোনো Backup JSON বা Excel হিসেবে ডাউনলোড করে নিজের কম্পিউটার / Google Drive-এ রাখুন — মাসে অন্তত একবার।": "⬇ Download any backup as JSON or Excel and keep it on your computer / Google Drive — at least once a month.",
  "♻ ডাটা ফেরত আনতে হলে Admin ডাউনলোড করা ফাইল দিয়ে Supabase-এ restore করতে পারে।": "♻ To recover data, Admin can restore from a downloaded file in Supabase.", "এখনো কোনো Backup নেই — \"এখনই Backup\" চাপুন": "No backups yet — press \"Backup now\"",
  "এই হাতে-নেওয়া Backup মুছবেন?": "Delete this manual backup?", "✔ মুছে ফেলা হয়েছে": "✔ Deleted", "ডাটা আনা হচ্ছে… একটু সময় লাগবে": "Fetching data… please wait",
  "ডাটাবেস নিরাপত্তা (RLS) চালু": "Database security (RLS) on", "Staff শুধু যোগ করতে পারে; বদলানো ও মোছা শুধু Admin": "Staff can only add; only Admin can change or delete", "নতুন কেউ নিজে অ্যাকাউন্ট খুলতে পারে না": "Nobody can sign themselves up", "শুধু Admin ব্যবহারকারী যোগ করে": "Only Admin adds users",
  "নিরাপদ সংযোগ (HTTPS)": "Secure connection (HTTPS)", "দৈনিক Backup": "Daily backup", "এখনো স্বয়ংক্রিয় Backup হয়নি": "No automatic backup yet", "সব পরিবর্তনের রেকর্ড (Audit log)": "Record of every change (Audit log)", "কে, কখন, আগে কী ছিল": "Who, when, what it was before",
  "চেকের ছবি সুরক্ষিত": "Cheque photos protected", "লগইন ছাড়া দেখা যায় না": "Not visible without login", "এই ডিভাইসে নোটিফিকেশন": "Notifications on this device", "সেটিংস থেকে চালু করুন": "Turn on in Settings", "সব ব্যবহারকারীর নাম দেওয়া": "All users have names", "জনের নাম ঠিক করা বাকি": "users still need a name", "ঠিক আছে": "OK",
  "নিরাপত্তা স্কোর": "Security score", "💻 এই ডিভাইস": "💻 This device", "পাসওয়ার্ড বদলান": "Change password", "ফোন হারালে বা পাসওয়ার্ড অন্য কেউ জানলে আগে \"অন্য সব ডিভাইস থেকে লগআউট\" চাপুন, তারপর পাসওয়ার্ড বদলান।": "If a phone is lost or someone knows the password, first press \"Sign out all other devices\", then change the password.",
  "🗑 গত ৭ দিনে মুছে ফেলা": "🗑 Deleted in the last 7 days", "✔ গত ৭ দিনে কিছু মোছা হয়নি": "✔ Nothing deleted in the last 7 days", "সব দেখুন →": "View all →", "👥 ব্যবহারকারী ও শেষ লগইন": "👥 Users & last sign-in", "বদলান →": "Manage →", "শেষ লগইন": "Last sign-in",
  "শেষ লগইনের সময় দেখাতে schema_v4.sql চালাতে হবে।": "Run schema_v4.sql to show last sign-in times.", "ক্যাশ": "Cash",
  "নতুন আপডেট এসেছে": "A new update is available", "এখনই আপডেট": "Update now", "পরে": "Later", "এই পাতায় লেখা কিছু সেভ হয়নি — আপডেট করলে তা হারাতে পারে (ক্লোজিং/ক্যাশের ড্রাফট নিরাপদ থাকবে)। আপডেট করবেন?": "Something typed on this page is not saved and may be lost (closing/cash drafts are safe). Update now?",
  // v6.5 accounts
  "মোবাইল ব্যাংকিং": "Mobile banking", "📱 মোবাইল ব্যাংকিং": "📱 Mobile banking", "📱 মোবাইল ব্যাংকিং (শাখা/Routing/SWIFT প্রযোজ্য নয়)": "📱 Mobile banking (branch/routing/SWIFT not applicable)",
  "✕ বন্ধ": "✕ Close",
  "অ্যাকাউন্ট এডিট": "Edit account", "কোড, নাম, ব্যাংক, শাখা, A/C বা Routing নং — যেমন: 483, pubali": "Code, name, bank, branch, A/C or routing — e.g. 483, pubali", "ব্যাংক *": "Bank *", "Routing নং": "Routing No", "(৯ ডিজিট)": "(9 digits)", "চেকের নিচে / স্টেটমেন্টে থাকে": "Printed on cheques / statements", "(বিদেশি লেনদেনে)": "(for foreign transfers)", "হোল্ডার (অ্যাকাউন্টের নাম) *": "Holder (account name) *", "A/C নং *": "A/C No *", "অথবা লিখুন": "or type", "আসবে": "Included", "প্রিভিউ": "Preview", "হোল্ডারের নাম": "Holder name", "বাকি:": "Missing:", "পার্টিকে শেয়ার করার জন্য প্রস্তুত": "Ready to share with parties", "ডিজিট": "digits", "ব্যাংক থেকে নিশ্চিত হয়ে নিন": "confirm with the bank", "বসান": "use", "ব্যাংক বাছুন": "Choose a bank", "Routing নং ৯ ডিজিট নয়। তবুও সেভ করবেন?": "Routing No is not 9 digits. Save anyway?", "নতুন ঘর (Routing/SWIFT/নোট) সেভ করতে schema_v5.sql চালাতে হবে": "Run schema_v5.sql to save the new fields (Routing/SWIFT/Note)", "ব্যাংক তথ্য শেয়ার": "Share bank details", "সব তথ্য": "Full details", "শুধু নাম ও A/C নং": "Name & A/C only", "যা পাঠানো হবে": "Text to send", "(চাইলে বদলাতে পারেন)": "(you can edit it)", "কিছু তথ্য বাকি আছে": "Some details are missing", "অন্য অ্যাপে": "Other apps", "কপি হয়েছে — যেখানে খুশি paste করুন": "Copied — paste anywhere", "ছবি ডাউনলোড হয়েছে": "Image downloaded", "ছবি বানানো যায়নি": "Couldn't create image", "কোড, নাম, ব্যাংক, শাখা, A/C বা Routing নং — যেমন: 483, pubali": "Code, name, bank, branch, A/C or routing — e.g. 483, pubali", "তথ্য অসম্পূর্ণ": "Incomplete", "সম্পূর্ণ": "Complete", "A/C নং নেই": "No A/C No", "Routing নেই": "No routing", "শাখা নেই": "No branch", "ধরন নেই": "No type", "টি নির্বাচিত": "selected", "সব নির্বাচন": "Select all", "পূরণ করুন": "Fill in", "নির্বাচিত অ্যাকাউন্টের তথ্য কপি হয়েছে": "Selected account details copied", "নির্বাচন": "Select", "এখনো চেক নেই": "No cheques yet", "দেখুন": "View", "তথ্য": "Info", "যেমন: Gulshan Branch, Dhaka": "e.g. Gulshan Branch, Dhaka", "টাইপ করুন: brac, dbbl, pubali…": "Type: brac, dbbl, pubali…", "যেমন: OD limit 1.5 Cr, signatory…": "e.g. OD limit, signatory…", "এই A/C নং আগেই আছে": "This A/C No already exists", "সম্পূর্ণ ": "complete ",
  // v6.6 account photos
  "A/C with Cheque": "A/C with Cheque", "ছবিসহ শেয়ার": "Share with photo", "ছবি কপি": "Copy photo", "ছবি ডাউনলোড": "Download photo", "কার্ড ছবি": "Card image", "Cheque book-এর ছবি": "Cheque book photo", "(পার্টিকে পাঠানোর জন্য)": "(to send to parties)", "ছবি ইমপোর্ট": "Import photos", "📷 ছবি নেই": "📷 No photo", "Cheque ছবি": "Cheque photo", "Cheque book ছবি ইমপোর্ট": "Import cheque book photos", "ছবি বাছুন (একাধিক)": "Choose photos (multiple)", "যাদের ছবি আছে তাদেরটাও বদলান": "Also replace existing photos", "ডুপ্লিকেট — বাদ": "Duplicate — skipped", "একাধিক মিলেছে": "Multiple matches", "অ্যাকাউন্ট মেলেনি": "No matching account", "(ছবি আছে)": "(has photo)", "আপলোড": "Upload", "হয়ে গেছে": "Done", "schema_v5.sql চালাতে হবে": "Run schema_v5.sql first", "নতুন ঘর (Routing/SWIFT/নোট/ছবি) সেভ করতে schema_v5.sql চালাতে হবে": "Run schema_v5.sql to save the new fields (Routing/SWIFT/Note/Photo)", "ছবি ডাউনলোড হয়েছে — WhatsApp-এ ছবি attach করে টেক্সট paste করুন": "Photo downloaded — attach it in WhatsApp and paste the text", "টেক্সট কপি হয়েছে": "Text copied", "ছবি কপি হয়েছে — chat-এ paste করুন": "Photo copied — paste it in the chat", "প্রথম ছবিটি কপি হয়েছে (বাকিগুলো ডাউনলোড করুন)": "First photo copied (download the rest)", "ছবি লোড হয়নি": "Photo failed to load", "অ্যাকাউন্ট এডিটে ছবি যোগ করুন": "add a photo in Edit account", "Cheque book-এর ছবি নেই": "No cheque book photo", "ফাইলের নাম": "File name", "একসাথে অনেক ছবি বাছুন": "Select many photos at once"
};
Object.assign(I18N, {
  "ফাইনাল সেভ": "Final save", "আজকের": "Today",
  // v6.28 — audit fixes: split text nodes that missed translation
  "শুধু Enter চাপুন: পার্টি → Account → টাকা → যোগ হবে · টাকার ঘরে ": "Just press Enter: Party → Account → Amount → added · in the amount box you can type ", " লেখা যায়": "", "কিছু নেই": "Nothing", " — \"+ নতুন বই\" চাপুন": " — press \"+ New book\"", "জেলায় বাকিরা": "districts among the rest",
  "২ দিন": "2 days", "৩ দিন": "3 days", "৫ দিন": "5 days", "৭ দিন": "7 days",
  "Audit Log · পরিবর্তনের লগ": "Audit Log · Change log", "এই চেকের": "This cheque has", "টি স্ট্যাটাস রেকর্ড আছে — মুছা যাবে না। ভুল এন্ট্রি হলে \"Cancelled\" স্ট্যাটাস দিন": " status record(s) — cannot be deleted. For a wrong entry set status \"Cancelled\"", "এই বইয়ের": "This book has", "টি পাতায় চেক এন্ট্রি আছে — মুছা যাবে না। এর বদলে বইয়ের স্ট্যাটাস Finished বা Lost দিন": " leaf/leaves with cheque entries — cannot be deleted. Set the book status to Finished or Lost instead",
    // v6.24 — cheque entry: camera/gallery, add purpose
  "তুলুন": "Camera", "বাছুন": "Gallery", "ছবি তুলুন": "Take photo", "গ্যালারি": "Gallery", "＋ নতুন": "＋ New", "নতুন খাত (Purpose)": "New purpose", "খাতের নাম লিখুন (যেমন: Salary)": "Enter purpose name (e.g. Salary)", "এই খাত আগেই আছে": "This purpose already exists", "✔ নতুন খাত যোগ হয়েছে": "✔ New purpose added", "সেভ করুন": "Save", "পরিষ্কার": "Clear",
  // v6.19 — party record, ASM master, delete protection
  "শুধু Enter চাপুন: পার্টি → Account → টাকা → যোগ হবে · টাকার ঘরে <b>50000+300</b> লেখা যায়": "Just press Enter: Party → Account → Amount → added · amount box accepts <b>50000+300</b>",
  "Account খুঁজুন — DBBL-17": "Search account — DBBL-17",
  "Account লিখুন বা বাছুন": "Type or pick an account",
  "— বাছুন —": "— Select —", "＋ নতুন ASM যোগ করুন…": "＋ Add new ASM…", "নতুন ASM-এর নাম": "New ASM name", "নতুন ASM": "New ASM", "নতুন ASM / Salesman": "New ASM / Salesman",
  "নাম লিখুন (যেমন: Rahim-ASM-Bogura)": "Enter name (e.g. Rahim-ASM-Bogura)", "নাম লিখুন": "Enter a name", "নতুন নাম": "New name", "ASM-এর নাম বদলান": "Rename ASM",
  "(বন্ধ করলে নতুন এন্ট্রির সাজেশনে আসবে না; আগের রেকর্ড যেমন আছে থাকবে)": "(if off, not suggested in new entries; earlier records stay as they are)",
  "নাম বদলান": "Rename", "নিষ্ক্রিয়": "Inactive", "সক্রিয়": "Active", "কোনো ASM নেই": "No ASM yet", "✔ ASM যোগ হয়েছে": "✔ ASM added",
  "✔ নিষ্ক্রিয় করা হয়েছে": "✔ Deactivated", "✔ সক্রিয় করা হয়েছে": "✔ Activated", "এই নামে ASM আগেই আছে": "An ASM with this name already exists", "নতুন ASM-এর নাম লিখুন": "Enter the new ASM name",
  "আগের রেকর্ড আছে — মুছা যাবে না। এর বদলে নিষ্ক্রিয় করুন": "Has earlier records — cannot be deleted. Deactivate instead",
  "পার্টি, ASM, জেলা, ফোন, ঠিকানা…": "Party, ASM, district, phone, address…", "বন্ধ": "Close",
  // v6.18 — distribution collection redesign
  "নতুন এন্ট্রি": "New entry", "পার্টির নাম লিখুন…": "Type party name…", "অটো বসবে": "auto-filled", "এই তারিখের কালেকশন": "Collections of this date",
  "খুঁজুন — পার্টি, ASM, Account, টাকা…": "Search — party, ASM, account, amount…", "ফিল্টার মুছুন": "Clear filters", "ফিল্টার বা সার্চ বদলে দেখুন": "Try changing the filter or search",
  "এই তারিখে এখনো কোনো এন্ট্রি নেই": "No entries on this date yet", "উপরের ফর্ম থেকে প্রথম কালেকশনটি যোগ করুন": "Add the first collection from the form above",
  "খোঁজার সাথে কিছু মেলেনি": "Nothing matches your search", "অন্য সময় বেছে দেখুন": "Try another period", "রিপোর্টে দেখাও:": "Show in report:",
  "যোগ করুন": "Add", "আগের": "Prev", "পরের": "Next", "ফিল্টারের সাথে কোনো এন্ট্রি মেলেনি": "No entries match the filters", "এই সময়ে কোনো এন্ট্রি নেই": "No entries in this period",
  // v6.17 — district / division
  "জেলা": "District", "বিভাগ": "Division", "সব বিভাগ": "All divisions", "সব জেলা": "All districts", "বিভাগ নেই": "No division", "জেলা নেই": "No district",
  "জেলা কলাম": "District column", "এলাকা অনুযায়ী": "By area", "এলাকা অনুযায়ী পার্টি": "Parties by area", "বিভাগ / জেলা": "Division / District",
  "জেলা ঠিক করা নেই": "District not set", "নাম থেকে নিজে বসে": "auto-filled from name", "জেলার নাম লিস্ট থেকে বাছুন": "Pick the district from the list",
  // v6.16 — account finder filters
  "সব ব্যাংক": "All banks", "সব হোল্ডার": "All holders",
  // v6.15 — Distribution Collection
  "ডিস্ট্রিবিউশন কালেকশন": "Distribution Collection", "দৈনিক কালেকশন": "Daily Collection", "কালেকশন সামারি": "Collection Summary", "কালেকশন রিপোর্ট": "Collection Report",
  "ডিস্ট্রিবিউশন পার্টি": "Distribution Parties", "কালেকশন টেবিল নেই — Supabase-এ schema_v6.sql চালাতে হবে": "Collection tables missing — run schema_v6.sql in Supabase",
  "v6: ডিস্ট্রিবিউশন কালেকশন": "v6: Distribution Collection", "schema_v6.sql চালাতে হবে": "run schema_v6.sql",
  "কালেকশন": "Collection", "কে সিদ্ধান্ত দিল": "Decided by", "কারণ": "Reason", "ফোন": "Phone", "ইন্টারনেট এলে সেভ হবে": "Will save when online", "⏳ সিঙ্ক বাকি": "⏳ Sync pending",
  "এই নামে পার্টি আগেই আছে": "A party with this name already exists", "টি রো বদলানো যায়নি (অনুমতি নেই)": " row(s) could not be changed (not allowed)", "করা হয়েছে": "done",
  "Hold — ধরে রাখুন": "Hold — keep aside", "Cancel — বাতিল": "Cancel — void", "কারণ / মন্তব্য": "Reason / remarks", "(ঐচ্ছিক)": "(optional)", "যেমন: স্টেটমেন্টে নেই / স্লিপ আসেনি": "e.g. not on statement / slip not received",
  "নিশ্চিত করুন": "Confirm", "নতুন পার্টি": "New party", "পার্টি এডিট": "Edit party", "পার্টির নাম *": "Party name *", "(নাম-এলাকা, যেমন: Alam Store-Nawabagonj, Dinajpur)": "(name-area, e.g. Alam Store-Nawabagonj, Dinajpur)",
  "সাধারণত যে Account-এ জমা দেয়": "Usual deposit account", "সক্রিয় পার্টি": "Active party", "(বন্ধ করলে এন্ট্রির সাজেশনে আসবে না)": "(if off, not suggested in entry)", "পার্টির নাম লিখুন": "Enter the party name",
  "পার্টি মুছে ফেলবেন?": "Delete party?", "মুছে ফেলবেন? (আগের কালেকশন রেকর্ড থেকে যাবে)": "delete? (earlier collection records stay)", "✔ পার্টি সেভ হয়েছে": "✔ Party saved", "✔ মুছে ফেলা হয়েছে": "✔ Deleted", "✔ সেভ হয়েছে": "✔ Saved",
  "কালেকশন এডিট": "Edit collection", "পার্টির নাম দিন": "Enter the party name", "টাকার অংক ঠিক নেই": "Amount is not valid", "তারিখ দিন": "Enter the date", "অংক ঠিক নেই": "Invalid amount",
  "পার্টি *": "Party *", "(টাইপ করুন, লিস্ট থেকে বাছুন)": "(type, pick from the list)", "পার্টির নাম…": "Party name…", "পার্টির নাম টাইপ করুন…": "Type party name…", "টাকা *": "Amount *", "(50000+300 চলবে)": "(50000+300 works)",
  "মন্তব্য (ঐচ্ছিক)": "Remarks (optional)", "স্লিপ নং / নোট": "Slip no / note", "যোগ করুন": "Add", "আজকের কালেকশন লিস্ট": "Collection list for the day", "খুঁজুন — পার্টি, ASM, Account, টাকা, মন্তব্য…": "Search — party, ASM, account, amount, remarks…",
  "নতুন পার্টি তৈরি করুন": "create new party", "পার্টি বাছুন": "Pick a party", "পার্টি তালিকায় নেই। নতুন পার্টি তৈরি করবেন?": "is not in the party list. Create a new party?", "Account লিখুন (যেমন DBBL-17)": "Enter the account (e.g. DBBL-17)",
  "এই তারিখে একই পার্টি, একই টাকা আগেই আছে। আবার যোগ করবেন?": "Same party and same amount already exist on this date. Add again?", "যোগ হয়েছে": "added", "মোট কালেকশন": "Total collection", "টি এন্ট্রি": " entries", "টি Cancelled": " cancelled",
  "Pending (স্টেটমেন্ট মেলানো বাকি)": "Pending (statement check due)", "সব বাছুন": "Select all", "Pending-এ ফেরত": "Back to Pending", "Approve (ঠিক আছে)": "Approve (OK)", "টি, Cancelled বাদে)": " entries, excl. Cancelled)", "মোট (": "Total (",
  "এই তারিখে এখনো কোনো কালেকশন এন্ট্রি নেই — উপরের ফর্ম থেকে যোগ করুন": "No collection entry on this date yet — add from the form above", "খোঁজার সাথে কিছু মেলেনি": "Nothing matches the search",
  "টি নির্বাচিত": " selected", "টি · ৳": " · ৳", "আজ": "Today", "নির্দিষ্ট তারিখ": "Specific date", "যেকোনো তারিখ": "Any date range", "All (Cancelled বাদে)": "All (excl. Cancelled)",
  "স্ক্রিনশট": "Screenshot", "কোন Status ধরব": "Status to include", "০ টাকার Account/ASM-ও দেখাও": "Also show accounts/ASM with 0", "এই সময়ে": "In this period", "কোনো কালেকশন নেই": "no collection",
  "কোনো এন্ট্রি নেই": "no entry", "ASM কলাম": "ASM column", "Status কলাম": "Status column", "দিন অনুযায়ী সাবটোটাল": "Per-day subtotal", "পার্টি খুঁজুন": "Search party", "পার্টির নাম / টাকা / মন্তব্য": "Party name / amount / remarks",
  "ASM তালিকা": "ASM list", "ASM নেই": "No ASM", "সব ASM": "All ASM", "সব Account": "All accounts", "মোট পার্টি": "Total parties", "সক্রিয়": "Active", "নিষ্ক্রিয়": "Inactive", "ASM / Salesman": "ASM / Salesman", "জন": "people", "ASM ঠিক করা নেই": "ASM not set", "Account ঠিক করা নেই": "Account not set",
  "পার্টি তালিকা": "Party list", "কোনো পার্টি পাওয়া যায়নি": "No party found", "পার্টি, ASM, Account, ফোন…": "Party, ASM, account, phone…", "ASM / Salesman তালিকা": "ASM / Salesman list", "নাম বদলান": "Rename", "নতুন নাম": "New name",
  "✔ ASM-এর নাম বদলানো হয়েছে": "✔ ASM renamed", "নাম বদলালে ওই ASM-এর সব পার্টির ASM বদলে যাবে (আগের কালেকশন রেকর্ড আগের নামেই থাকবে)।": "Renaming changes the ASM of all that ASM's parties (earlier collection records keep the old name).",
  "আরও ": "Show ", "টি দেখান": " more", "এই সময়ে ": "In this period ", "Note: এই তারিখে আরও": "Note: this period also has", "টি এন্ট্রি (৳": " entries (৳", "অন্য Status-এ আছে — এখানে ধরা হয়নি।": "in another status — not counted here.",
  "ডিস্ট্রিবিউশন কালেকশন সামারি": "Distribution Collection Summary", "পার্টি": "Party", "সাবটোটাল": "Subtotal", "ইন্টারনেট নেই": "No internet", "ঠিক আছে": "OK", "কাজ": "Actions", "অবস্থা": "Status", "মন্তব্য": "Remarks",
  "মুছে ফেলবেন?": "Delete?", "নতুন": "New", "লিস্ট": "List", "ডাটা নেই": "No data", "এডিট": "Edit", "মুছুন": "Delete", "সেভ": "Save", "বন্ধ": "Close", "বাতিল": "Cancel", "সামারি": "Summary",
  // v6.30 — page names + Old data import
  "নতুন চেক": "New Cheque", "চেক স্ট্যাটাস": "Cheque Status", "চেক রেজিস্টার": "Cheque Register",
  "ব্যাংক ক্লোজিং": "Bank Closing", "ব্যালেন্স স্ন্যাপশট": "Balance Snapshot", "ব্যাংক রিপোর্ট": "Bank Reports",
  "ক্যাশ এন্ট্রি": "Cash Entry", "ক্যাশ সামারি": "Cash Summary", "ক্যাশ রিপোর্ট": "Cash Reports",
  "কালেকশন এন্ট্রি": "Collection Entry", "কালেকশন সামারি": "Collection Summary", "কালেকশন রিপোর্ট": "Collection Reports",
  "অ্যাকাউন্ট ফাইন্ডার": "Account Finder", "ক্যাশ খাতা": "Cash Ledger", "পার্টি তালিকা": "Parties",
  "অডিট ও সিকিউরিটি": "Audit & Security", "অ্যাডমিন প্যানেল": "Admin Panel",
  "সবচেয়ে পুরনো তারিখ": "Oldest date", "সর্বশেষ তারিখ": "Latest date",
  "২০২৬ ডাটা পুনরুদ্ধার": "Restore 2026 data",
  "২০২৬-এর সব রেকর্ড + ২০২৬-এর ঠিক আগের শেষ দিনটি (ওটাই ১ জানুয়ারির Opening)": "All 2026 records + the last day before 2026 (it becomes the 1 January Opening)",
  "⬆ শুধু ২০২৬": "⬆ 2026 only", "সম্পূর্ণ ইতিহাস": "Full history",
  "০২-০৯-২০২৩ (প্রথম দিন) থেকে ফাইলের শেষ তারিখ পর্যন্ত সব": "Everything from 02-09-2023 (first day) to the last date in the file",
  "⬆ সম্পূর্ণ import": "⬆ Import everything",
  "শুধু যে তারিখ+A/C ডাটাবেসে নেই সেগুলোই যোগ হয় — আপনার app-এ সেভ/এডিট করা কোনো ব্যালেন্স বদলায় না, ডুপ্লিকেটও হয় না।": "Only date + A/C rows missing from the database are added — balances you saved or edited in the app never change, and no duplicates are created.",
  // v6.31 — dashboard
  "ট্রেন্ড দেখাতে আরও ডাটা লাগবে": "More data is needed to show a trend",
  "৭ দিন": "7 days", "১৫ দিন": "15 days", "৩০ দিন": "30 days", "গড়": "avg", "সর্বোচ্চ": "Max", "সর্বনিম্ন": "Min",
  "আঙুল/মাউস দিয়ে দেখুন": "Touch / hover the chart",
  "ব্যাংক-ওয়াইজ ব্যালেন্স": "Balance by bank", "বিস্তারিত": "Details", "আরও": "+", "টি ব্যাংক": "more banks", "সব দেখুন": "see all",
  "চেক পাইপলাইন · এই মাস": "Cheque pipeline · this month", "এই মাসে এখনো কোনো চেক নেই": "No cheques this month yet",
  "সব Pending (মোট)": "All Pending (total)", "আজকের চেক": "Today's cheques", "Clear হয়েছে": "Cleared",
  "আজকের সব কাজ সম্পন্ন 🎉": "All of today's tasks are done 🎉", "আজকের কাজ": "Today's tasks", "সম্পন্ন": "done",
  "দারুণ! সব কিছু আপ-টু-ডেট আছে": "Great! Everything is up to date", "বাকি:": "Left:", "পুরনো Pending": "Old Pending",
  "টানা": "", "কর্মদিবস ব্যাংক ক্লোজিং সম্পন্ন": "working days of bank closing in a row",
  "ডিস্ট্রিবিউশন কালেকশন": "Distribution collection", "আজ": "Today", "৭ দিনে মোট": "7-day total", "এন্ট্রি": "entries",
  "গত ৭ দিনে কোনো কালেকশন এন্ট্রি নেই": "No collection entries in the last 7 days", "কালেকশন ডাটা পাওয়া যায়নি": "Collection data not available",
  "মনোযোগ দরকার": "Needs attention", "সব ঠিক আছে!": "All good!", "কোনো জরুরি কাজ বা সতর্কতা নেই — দারুণ চলছে।": "No urgent tasks or alerts — going great.",
  "দেখুন": "View", "খুলুন →": "Open →", "Pending/Hold": "Pending/Hold"
});
const I18N_KEYS = Object.keys(I18N).filter(k => k.length >= 6).sort((a, b) => b.length - a.length);
const BN_DIG = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };
const HAS_BN = /[ঀ-৿]/;
/* replace a phrase only when it is a whole word — never inside a longer Bangla word ("পরিবর্তনের" must not become "Changeের") */
const BNL = /[\u0980-\u09FF]/;
function subBound(s, k, v) {
  let i = 0, o = "", j; const kb = BNL.test(k[0]), ke = BNL.test(k[k.length - 1]);
  while ((j = s.indexOf(k, i)) !== -1) { const a = s[j - 1], b = s[j + k.length]; const ok = !(kb && a && BNL.test(a)) && !(ke && b && BNL.test(b)); o += s.slice(i, j) + (ok ? v : k); i = j + k.length; }
  return o + s.slice(i);
}
function tr(str) {
  if (LANG !== "en" || !str || !HAS_BN.test(str)) return str;
  const t = str.trim();
  if (I18N[t] !== undefined) return str.replace(t, I18N[t]);
  let out = str;
  for (const k of I18N_KEYS) if (out.includes(k)) { out = subBound(out, k, I18N[k]); if (!HAS_BN.test(out)) break; }
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
