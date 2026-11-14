# Nabiad — Cheque & Bank Control (Web App)

চেক এন্ট্রি, স্ট্যাটাস, দৈনিক ব্যাংক ক্লোজিং, রিপোর্ট, Boss enquiry ও মিসিং-পাতা অ্যালার্ট — মোবাইল ও PC দুটোতেই।

## ১. Supabase সেটআপ (একবার, ~১০ মিনিট)
1. https://supabase.com → New project (Region: Singapore)। Database password লিখে রাখুন।
2. **SQL Editor** → New query → `schema.sql` এর পুরো লেখা paste → Run।
3. অ্যাকাউন্টগুলো ডাটাবেসে আগেই তোলা আছে; নতুন অ্যাকাউন্ট অ্যাপের Admin থেকে যোগ করুন।
4. **Authentication → Providers → Email**: "Allow new users to sign up" **বন্ধ** করুন (বাইরের কেউ যেন একাউন্ট খুলতে না পারে)।
5. **Authentication → Users → Add user → Create new user**: ইমেইল + পাসওয়ার্ড দিন, "Auto Confirm User" টিক দিন।
   - `ruhulaminrevens@gmail.com` → নিজে Admin হবে। `nabiadoffice@gmail.com` → Boss (শুধু দেখা)।
   - Staff দের জন্য যেকোনো ইমেইল (যেমন foysal@nabiad.com)।
6. **Project Settings → API**: `Project URL` ও `anon public` key কপি করে `config.js` এ বসান।

## ২. হোস্টিং (যেকোনো একটা)
এটা সাধারণ static সাইট — কোনো build লাগে না। পুরো ফোল্ডার আপলোড করলেই হয়:
- **Netlify Drop** (app.netlify.com/drop) — ফোল্ডার drag করুন, সাথে সাথে লিংক পাবেন।
- অথবা Vercel / GitHub Pages / `nabiad.com` এর cPanel এ একটা subfolder (যেমন `/bank`)।
HTTPS থাকতে হবে (এই সব সার্ভিসে নিজে থেকেই থাকে)। মোবাইলে Chrome মেনু → "Add to Home screen"।

## ৩. প্রথমবার
1. Admin হিসেবে লগইন → **অ্যাডমিন → ব্যবহারকারী**: প্রতিটা Staff এর **নাম** (যেমন Foysal) বসান, **সক্রিয়** টিক দিন, Role ঠিক করুন। এই নামই "কে এন্ট্রি করেছে" হিসেবে যাবে।
2. **অ্যাডমিন → পুরনো ডাটা import** → বাটন চাপুন (৩৯,৪৭৯ ব্যালেন্স রেকর্ড; ~১ মিনিট)।
3. **চেক বই** পাতায় প্রতিটা বই যোগ করুন (প্রথম/শেষ পাতা, "ট্র্যাক শুরু") — তাহলে মিসিং পাতা ধরা পড়বে।

## নিয়ম ও নিরাপত্তা
- Staff শুধু **যোগ** করতে পারে। পুরনো এন্ট্রি বদলানো/মোছা শুধু Admin — এটা ডাটাবেসের নিয়ম (RLS), শুধু বাটন লুকানো নয়।
- একই A/C + চেক নং দ্বিতীয়বার সেভ হয় না (ডাটাবেস আটকায়)।
- দৈনিক ক্লোজিং একবার সেভ হলে Staff বদলাতে পারে না; Diff ≠ 0 হলে মন্তব্য বাধ্যতামূলক।
- ভুল স্ট্যাটাস দিলে নতুন স্ট্যাটাস দিন — ইতিহাস থাকবে।
- `anon` key প্রকাশ্য হলেও সমস্যা নেই; লগইন ছাড়া কিছুই দেখা যায় না। **service_role key কখনো config.js এ দেবেন না।**
- ব্যাকআপ: Supabase → Database → Backups; অথবা চেক তালিকা/রিপোর্ট থেকে Excel export।

## DEMO মোড
`config.js` এ URL খালি থাকলে অ্যাপ DEMO মোডে চলে (ডাটা শুধু ওই ব্রাউজারে, পুরনো ব্যালেন্স আগে থেকে লোড)। `python -m http.server` দিয়ে লোকালে চালিয়ে ঘুরে দেখা যায়।

## ফাইল
`index.html, style.css, app.js, config.js, sw.js, manifest.json` — অ্যাপ | `history.enc` — পুরনো ব্যালেন্স (এনক্রিপ্টেড; কী ডাটাবেসে) | `vendor/` — Supabase, Excel, ছবি লাইব্রেরি | `schema.sql` — ডাটাবেস
