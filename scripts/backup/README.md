# Nabiad off-site backup (Step 1 — Database, Step 2 — Storage ছবি)

প্রতিদিন রাত ০১:০০ (ঢাকা) GitHub Actions Supabase DB dump করে, যাচাই করে, **age দিয়ে encrypt** করে একটা **private** repo-র Release-এ রাখে। Public repo বা workflow artifact-এ কখনো নয়।

| ফাইল | কাজ |
|---|---|
| `scripts/backup/offsite-backup.sh` | dump → verify → encrypt (লোকালেও চলে) |
| `.github/workflows/offsite-backup.yml` | দৈনিক schedule + manual run, upload, পুরনো মোছা (৩০ দিন daily, ১৩ মাস monthly) |

**কী কী ব্যাকআপ হয়:** `public` schema (table, data, function, policy, trigger) + `auth.users`/`auth.identities` (লগইন)।
**Storage ছবি (`cheque-photos`):** Step 2 — নিচে।
**হয় না:** Supabase Secrets, Edge Function সোর্স, pg_cron job — Restore → C-তে হাতে বসানোর তালিকা আছে।

**Safety alarm (workflow ব্যর্থ হয় → GitHub ইমেইল পাঠায়):** dump খুব ছোট; `accounts/balances/profiles` খালি; আগের backup-এর চেয়ে কোনো table ২০%-এর বেশি কমে গেছে (ডেটা হারানোর সংকেত); decrypt অযোগ্য key।

---

## একবারের সেটআপ (আপনি করবেন — ১৫ মিনিট)

> কোনো password/token/private key এই chat-এ পেস্ট করবেন না।

1. **Private repo বানান:** GitHub → New repository → নাম `nabiad-backups` → **Private** → "Add a README" টিক দিন (খালি repo-তে release হয় না)।
2. **age key বানান (আপনার PC-তে):**
   ```bash
   age-keygen -o nabiad-backup.key
   ```
   - Terminal-এ `Public key: age1...` লাইন দেখাবে → এটা Secret-এ যাবে।
   - `nabiad-backup.key` ফাইল (private) **কমপক্ষে ২ জায়গায়** রাখুন (password manager + পেনড্রাইভ)। হারালে সব backup অপাঠ্য; চুরি গেলে কেউ পড়তে পারবে। এটা GitHub-এ দেবেন না।
3. **Fine-grained token:** GitHub → Settings → Developer settings → Fine-grained tokens → Repository access: **শুধু `nabiad-backups`** → Permissions: **Contents: Read and write** → মেয়াদ ১ বছর (ক্যালেন্ডারে রিমাইন্ডার)।
4. **Supabase connection string:** Dashboard → Connect → **Session pooler** (port 5432, IPv4-সমর্থিত; GitHub runner IPv6 পায় না, তাই direct string চলবে না; Transaction pooler 6543-ও চলবে না) → `postgresql://postgres.<ref>:<password>@aws-…pooler.supabase.com:5432/postgres`।
5. **Secrets যোগ করুন:** `ruhulaminrevens/nabiad` → Settings → Secrets and variables → Actions → New repository secret:
   | Name | Value |
   |---|---|
   | `SUPABASE_DB_URL` | ধাপ ৪-এর string |
   | `BACKUP_AGE_RECIPIENT` | `age1…` (public key) |
   | `BACKUP_REPO` | `ruhulaminrevens/nabiad-backups` |
   | `BACKUP_REPO_TOKEN` | ধাপ ৩-এর token |
6. **প্রথম run:** Actions → "Off-site backup" → Run workflow। সবুজ হলে `nabiad-backups` → Releases-এ `backup-YYYYMMDD-HHMM` দেখবেন (৩টি ফাইল: `.tar.age`, `.sha256`, `manifest.json`)।
7. **প্রথম restore পরীক্ষা** (নিচে) — backup তখনই "আছে" বলা যায় যখন একবার ফেরত আনা গেছে।

> Hardening (ঐচ্ছিক, 🔎 Supabase-এ যাচাই হয়নি): `postgres` role-এর বদলে আলাদা read-only role। RLS-এর কারণে `pg_dump` তখন `BYPASSRLS` ছাড়া ব্যর্থ হতে পারে; তাই শুরুতে `postgres` role ব্যবহার করুন এবং password পরিবর্তনের পর secret হালনাগাদ করুন।

---

## Restore (ফেরত আনা)

### A. Decrypt
```bash
# Release থেকে nabiad-<stamp>.tar.age ডাউনলোড করুন
sha256sum -c nabiad-<stamp>.tar.age.sha256
age -d -i nabiad-backup.key nabiad-<stamp>.tar.age | tar -xf -
# → public.dump, auth.dump, manifest.json
```

### B. পরীক্ষা (মাসে একবার, **staging** project-এ)
1. নতুন একটা Supabase project (staging) খুলুন; তার Session pooler string `STAGING_URL`।
2. ```bash
   pg_restore -d "$STAGING_URL" --no-owner --no-privileges --clean --if-exists public.dump
   ```
   (`schema "public" already exists` সতর্কতা ঠিক আছে।)
3. Auth ডেটা (staging-এর `auth.users` খালি/পরীক্ষামূলক হলে):
   ```bash
   pg_restore -d "$STAGING_URL" --data-only --no-owner auth.dump
   ```
4. **মেলান:** `manifest.json`-এর প্রতিটি সংখ্যা বনাম staging-এ `select count(*)`; সাথে বিজনেস-চেক: সর্বশেষ cash closing, balances-এর শেষ তারিখ, collection মোট, inventory মোট ৳। চেকলিস্টে তারিখ ও সই রাখুন।

### C. আসল বিপর্যয়ে (নতুন project)
1. নতুন Supabase project (Singapore) → B-এর ধাপ ২–৩।
2. হাতে বসান: **Auth settings** (Site URL `https://app.nabiad.com`, sign-up বন্ধ, password ≥১০, MFA), **Storage bucket** `cheque-photos` (private, ৩MB, image) ও ফাইল (Step 2), **Edge Function `notify`** + Secrets (`VAPID_*`, `CRON_SECRET`, ঐচ্ছিক Resend/WhatsApp), **pg_cron** job (`nabiad-daily-backup` `0 18 * * *`, `nabiad-daily-summary` `0 14 * * *`) ও Vault secret `notify_cron_secret`।
3. `config.js`-এ নতুন `SUPABASE_URL` ও anon key → version bump → push; DNS অপরিবর্তিত (GitHub Pages)।
4. সব ইউজারকে একবার আবার লগইন; 2FA factor থাকলে `auth.factor*` সারি আলাদা — না থাকলে Admin → Users → 🛡 থেকে reset।

> 🔎 সীমা: Supabase-এ `auth` schema-র restore (বিশেষ করে `auth.mfa_factors`/sessions) এবং নতুন project-এ পূর্ণ drill এখনো করা হয়নি। প্রথম staging drill-এই এটা যাচাই হবে।

---

## Step 2 — Storage ছবি (`cheque-photos`)

`offsite-storage-backup.yml` প্রতি সোমবার ০২:০০ (ঢাকা) bucket-টা Supabase-এর S3-compatible endpoint দিয়ে sync করে, প্রতিটি ফাইলের SHA-256 সহ manifest বানায়, একই age key দিয়ে encrypt করে একই private repo-তে রাখে (`storage-*` release; ৫টি সাপ্তাহিক + ১৩ মাসের মাসের প্রথম রবিবারের কপি)। সময় বদলাতে workflow-র `cron` দিন (দৈনিক চাইলে `0 20 * * *`)।

**Alarm:** bucket খালি; ফাইল সংখ্যা ১০%-এর বেশি কমেছে; আগের কোনো ছবির content বদলেছে (ছবি write-once, তাই এটা অস্বাভাবিক)। আলাদা মোছা ছবি শুধু log-এ জানায়।

**সেটআপ (আপনি — ৫ মিনিট):**
1. Supabase Dashboard → Storage → **S3 Connection**: Endpoint ও Region কপি করুন; **New access key** বানান (service_role key নয়, এই আলাদা key-ই যথেষ্ট)।
2. GitHub Secrets যোগ করুন (`ruhulaminrevens/nabiad`):
   | Name | Value |
   |---|---|
   | `SUPABASE_S3_ENDPOINT` | যেমন `https://<ref>.storage.supabase.co/storage/v1/s3` |
   | `SUPABASE_S3_REGION` | যেমন `ap-southeast-1` |
   | `SUPABASE_S3_ACCESS_KEY_ID` | access key id |
   | `SUPABASE_S3_SECRET_ACCESS_KEY` | secret |
   (`BACKUP_AGE_RECIPIENT`, `BACKUP_REPO`, `BACKUP_REPO_TOKEN` Step 1-এর একই।)
3. Actions → "Off-site storage backup" → Run workflow।

> 🔎 আসল Supabase S3 endpoint-এ এখনো চালানো হয়নি (লোকালে fake S3 দিয়ে পরীক্ষিত)। প্রথম run ব্যর্থ হলে error log দেখে endpoint/region মিলিয়ে নিন; Supabase-এর S3 endpoint path-style ব্যবহার করে।
> প্রথম run-এ bucket খালি হলে (`ALLOW_EMPTY`) workflow ব্যর্থ হবে — সেটা ইচ্ছাকৃত।

**Restore (ছবি):**
```bash
sha256sum -c nabiad-storage-<stamp>.tar.age.sha256
age -d -i nabiad-backup.key nabiad-storage-<stamp>.tar.age | tar -xf -   # → files/…, manifest.json
# ফাইল যাচাই: manifest.json-এর sha256 বনাম sha256sum files/<path>
# নতুন bucket-এ ফেরত (S3 key দিয়ে):
aws s3 sync files s3://cheque-photos --endpoint-url "$S3_ENDPOINT"
```
ছবির path DB-র `cheques.photo`, `reminders.photo`, `accounts.book_photo`, `leaf_marks.photo`-এ আছে, তাই একই path-এ ফেরত দিলে সব লিংক আবার কাজ করবে।

---

## Step 3 — Registry একীকরণ ও Backup পাতার KPI

- **Table registry:** `app.js`-এর `BACKUP_TABLES` এখন DB snapshot (`nabiad_restore_tables()` + `profiles`, `leaf_marks`) ও off-site script-এর তালিকার সঙ্গে মিলে। `python3 scripts/check-backup-tables.py` না মিললে fail করে (CI-তে চলে)। নতুন table যোগ করলে তিন জায়গাতেই যোগ করুন।
- **Stable paging:** `fetchAll` এখন একাধিক order column নেয় (যেমন `balances` → `date, code`), তাই 1000-row পাতায় row বাদ/দ্বিগুণ হয় না।
- **Run log:** `schema_offsite_backup_runs.sql` একবার Supabase SQL editor-এ চালান (admin/boss শুধু দেখতে পারে; লেখে workflow)। না চালালে workflow ব্যর্থ হয় না, শুধু Backup পাতায় "Not set up" দেখায়।
- **Backup পাতা:** "Last off-site (database/photos)" কার্ড। DB ৩৬ ঘণ্টা, photos ৯ দিনের বেশি পুরনো বা শেষ run ব্যর্থ হলে লাল সতর্কতা।
- **CI:** `.github/workflows/checks.yml` — JS syntax, shell syntax, registry ও version check।

## পরের ধাপ
- Outbox dead-letter + IndexedDB, admin/boss-এর জন্য 2FA বাধ্যতামূলক, restore drill।
