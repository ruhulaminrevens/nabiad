<div align="center">

<img src="icon.svg" width="72" alt="Nabiad logo">

# NABIAD Smart Finance Suite

**চেক রেজিস্টার · ব্যাংক ক্লোজিং · ক্যাশ খাতা · কালেকশন · ইনভেন্টরি — এক জায়গায়**

A fast, mobile-first web app for NABIAD Group's accounts and distribution teams. Every cheque leaf is tracked, the daily bank and cash closing takes minutes, collections are approved against the bank statement, inventory orders are recorded in the app, and management gets live reports.

[![Live](https://img.shields.io/badge/Live-app.nabiad.com-4f46e5?style=for-the-badge)](https://app.nabiad.com)
&nbsp;
![Version](https://img.shields.io/badge/version-6.104-0ea5e9?style=for-the-badge)
![PWA](https://img.shields.io/badge/PWA-offline_ready-10b981?style=for-the-badge)
![Supabase](https://img.shields.io/badge/Supabase-Postgres_+_RLS_+_2FA-3ecf8e?style=for-the-badge&logo=supabase&logoColor=white)
![Language](https://img.shields.io/badge/বাংলা_|_English-toggle-f59e0b?style=for-the-badge)

<img src="docs/screenshots/hero.jpg" alt="Nabiad dashboard on desktop and mobile, light and dark" width="100%">

<sub>All screenshots use made-up sample data.</sub>

</div>

---

## Contents

- [Highlights](#highlights)
- [Modules](#modules)
- [Screenshots](#screenshots)
- [Who can do what](#who-can-do-what)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Setup](#setup)
- [Local demo](#local-demo)
- [Security & backup](#security--backup)
- [Quality checks](#quality-checks)
- [Design rules](#design-rules)
- [Release notes](#release-notes)

---

## Highlights

| | |
|---|---|
| 🏠 **Smart dashboard** | A "today" strip (collection, cash book net, pending cheque value, reminders due), KPI cards, balance trend, cash flow chart, daily-task progress and a streak counter. Every tile opens the page behind it. |
| 🧾 **Cheque register** | Smart A/C search, next leaf filled in automatically, duplicate leaves blocked, cheque photo with optional OCR, status history, missing-leaf alerts per cheque book, and **bank statement verification** (XLSX/CSV matched against the register in the browser). |
| 🏦 **Daily bank closing** | Previous balances pre-filled, edited cells turn blue, debit / credit / expected balance worked out from linked cash and collection data, draft save then a locked final save. |
| 📒 **Cash Book** | The daily cash record, written the way the paper book is kept: opening cash, grouped receipts and payments, party ledgers, Tally voucher import, **View / Export** register (Excel, PDF, image, print) with a signing footer. Cash Checker, Summary, Reports and a full Cash Register follow from it. |
| 💰 **Collection** | Party-wise daily collection with ASM / salesman and bank account, pending → approved / hold / cancelled flow, summary and report pages, and the same **View / Export** register as the Cash Book. |
| 📦 **Inventory** | Niramoy, Distribution and RM Factory orders and stock, quick entry, order vs delivery balance per party, monthly lock, A4 status reports. |
| 📊 **Reports** | Bank balance trend, change over a period, totals by bank and holder, biggest movers, cheque reports by purpose, account, day and month. Everything exports to Excel, PDF or image. |
| ⏰ **Reminders & notifications** | One-off or repeating reminders with a photo and "pick days"; the board groups them as *Due now / Today / Tomorrow / This week / Later*. Browser notifications plus a calendar file so the alarm works with the app closed. |
| 🛡 **Audit & security** | Every change logged (who, when, before → after). Mandatory 2-step verification for Admin and Boss, session control, a security score, nightly in-database backup and an encrypted off-site copy. |
| ⚙️ **Admin panel** | Overview with live team, backup health and recent activity panels, then Accounts, Users with per-module access, Setup, Audit log, Backup & Restore, Security. |
| 📱 **Works everywhere** | Installable PWA. Offline entry with auto-sync (rejected entries are parked, never lost). Bottom bar and card tables on phones, light / dark theme, বাংলা / English switch. |

---

## Modules

| Module | Pages |
|---|---|
| **Cheque** | Cheque Posting · Cheque Status · Cheque Register · Cheque Books and leaf register |
| **Bank** | Bank Closing · Balance Snapshot · Bank Reports · Account Finder |
| **Cash** | Cash Book · Cash Checker · Cash Summary · Cash Reports · Cash Ledger |
| **Collection** | Collection Entry · Collection Summary · Collection Reports · Party list |
| **Inventory** | Dashboard · Niramoy · Distribution · RM Factory · Status & Report |
| **Platform** | Dashboard · Reminders · Settings · Audit & Security · Admin Panel |

---

## Screenshots

### Desktop

| Dashboard | Cash Book |
|---|---|
| ![Dashboard](docs/screenshots/desktop-dashboard.jpg) | ![Cash Book](docs/screenshots/desktop-cash-book.jpg) |
| **Bank closing** | **Cheque register** |
| ![Bank closing](docs/screenshots/desktop-bank-closing.jpg) | ![Cheque register](docs/screenshots/desktop-cheque-register.jpg) |
| **Collection summary** | **Bank reports** |
| ![Collection summary](docs/screenshots/desktop-collection-summary.jpg) | ![Bank reports](docs/screenshots/desktop-bank-reports.jpg) |
| **Balance snapshot (one A4 page)** | **Account finder (bank colours)** |
| ![Balance snapshot](docs/screenshots/desktop-balance-snapshot.jpg) | ![Account finder](docs/screenshots/desktop-accounts.jpg) |
| **Reminders & notifications** | **Settings** |
| ![Reminders](docs/screenshots/desktop-reminders.jpg) | ![Settings](docs/screenshots/desktop-settings.jpg) |
| **Admin panel** | **Dark theme** |
| ![Admin panel](docs/screenshots/desktop-admin.jpg) | ![Dark dashboard](docs/screenshots/desktop-dashboard-dark.jpg) |
| **Cash Book (dark)** | **Admin panel (dark)** |
| ![Cash Book dark](docs/screenshots/desktop-cash-book-dark.jpg) | ![Admin dark](docs/screenshots/desktop-admin-dark.jpg) |

### Mobile

| Dashboard | Cheque posting | Cash Book | Collection |
|:---:|:---:|:---:|:---:|
| <img src="docs/screenshots/mobile-dashboard.jpg" width="220"> | <img src="docs/screenshots/mobile-cheque-posting.jpg" width="220"> | <img src="docs/screenshots/mobile-cash-book.jpg" width="220"> | <img src="docs/screenshots/mobile-collection.jpg" width="220"> |
| **Reminders** | **Settings** | **Admin panel** | **Dark theme** |
| <img src="docs/screenshots/mobile-reminders.jpg" width="220"> | <img src="docs/screenshots/mobile-settings.jpg" width="220"> | <img src="docs/screenshots/mobile-admin.jpg" width="220"> | <img src="docs/screenshots/mobile-dashboard-dark.jpg" width="220"> |

---

## Who can do what

Rules are enforced by the database itself through PostgreSQL Row Level Security, not just by hiding buttons.

| Action | Admin | Staff | Boss |
|---|:---:|:---:|:---:|
| Add cheques, closings, cash, collections, inventory entries | ✅ | ✅ (per module access) | — |
| Edit own entries | ✅ | ✅ (own entries, inside the edit window) | — |
| Change anything after final save | ✅ | — | — |
| Approve, hold or cancel collections | ✅ | per module access | — |
| Delete records | ✅ | — | — |
| View all pages & reports, export | ✅ | ✅ | ✅ |
| Audit log | ✅ | — | ✅ |
| Users, module access, backups, accounts, cheque books | ✅ | — | — |

**Module access:** an Admin can give each user *Entry* and *Edit* rights per module (Cheque, Bank, Cash, Collection, Inventory). Details are in [docs/module-access.md](docs/module-access.md).

---

## Tech stack

- **Frontend:** plain HTML + CSS + JavaScript. There is no framework and no build step.
- **Backend:** [Supabase](https://supabase.com), which provides Postgres, Auth (password + TOTP 2FA), Storage, RLS, `pg_cron`, RPC functions and an Edge Function for notifications.
- **Hosting:** GitHub Pages (static), with a custom domain.
- **Offline:** Service Worker app shell plus a local outbox that syncs automatically.
- **Libraries (vendored):** `supabase-js`, `SheetJS` and `ExcelJS` (Excel), `html2canvas` (report images), `Tesseract.js` (cheque OCR, loaded only when used).

---

## Project structure

```
├── index.html               App shell (fonts, theme, PWA registration, cache-busting ?v=)
├── app.js                   Data layer, router, dashboard, cheque, bank, collection, admin pages
├── cashbook.js / .css       Cash Book, ledgers, Tally import, register export
├── inv.js / .css            Inventory module
├── cheque-verification.js   Bank statement verification
├── i18n.js                  বাংলা → English dictionary and live translator
├── style.css                Design system, responsive layout, print styles
├── config.js                Supabase URL + public (anon) key, app settings
├── sw.js                    Service worker (offline cache)
├── manifest.json            PWA manifest + icons
├── history.enc              Old balance history (AES-GCM encrypted; key lives in the DB)
├── schema*.sql              Database: base schema, v2–v6, then feature migrations
├── UI_BUTTONS.md            Button roles: same purpose, same look, everywhere
├── UI_TOKENS.md             Motion, focus, depth and dark-mode rules
├── scripts/                 check-version.py, check-backup-tables.py, backup/ (off-site)
├── vendor/                  supabase.js · xlsx · exceljs · html2canvas · ocr
├── docs/                    module-access.md and README screenshots
└── .github/workflows/       checks.yml · offsite-backup.yml · offsite-storage-backup.yml
```

---

## Setup

<details>
<summary><b>1. Supabase (one time, ~10 minutes)</b></summary>

1. Create a project at [supabase.com](https://supabase.com) (region: Singapore).
2. **SQL Editor:** run, in order, `schema.sql` → `schema_v2.sql` → … → `schema_v6.sql`, then the feature migrations (`schema_module_access.sql`, `schema_cashbook_workflow.sql`, `schema_cheque_verification.sql`, `schema_cheque_edit_window.sql`, `schema_offsite_backup_runs.sql`, `schema_admin_restore.sql` and the other `schema_*.sql` files). Each file is written to be safe to run again. Do the same on a staging project first.
3. **Authentication → Providers → Email:** turn **off** "Allow new users to sign up".
4. **Authentication → Users → Add user:** enter email + password and tick *Auto Confirm*. Then open the app's **Admin → Users** page, give the user a name and role, and activate them. Admin and Boss accounts must enrol in 2-step verification on first sign-in.
5. **Project Settings → API:** copy the *Project URL* and the *anon public* key into `config.js`.

> Never put the `service_role` key in `config.js`. The anon key is safe to publish, because nothing can be read without logging in.

> `schema_mfa_required_admin.sql` makes the database refuse Admin and Boss sessions that have no 2FA. Run it only after every Admin and Boss has enrolled, and take a manual backup first.

</details>

<details>
<summary><b>2. Hosting</b></summary>

The app is a static site, so any static host works:

- **GitHub Pages:** Settings → Pages → *Deploy from a branch* → `main` / root.
- **Custom domain:** add a `CNAME` DNS record `app → <user>.github.io`, enter the domain in Pages, then tick **Enforce HTTPS**. Production runs at `https://app.nabiad.com` (the `CNAME` file in the repo must stay).
- **Supabase → Authentication → URL Configuration:** set *Site URL* to the production domain and add it under *Redirect URLs*, otherwise password-reset links point to the wrong place. Minimum password length is 10; public sign-ups stay disabled.

HTTPS is required, both for login security and because offline mode and encryption only run on secure pages. To install on a phone, open the site in Chrome and choose **Add to Home screen**. After a deploy, users press **Update now** when the app offers the new version.

</details>

<details>
<summary><b>3. First run</b></summary>

1. Log in as Admin. Open **Admin → Users** and set names, roles and module access.
2. Open **Admin → Old data** and import the encrypted balance history (once).
3. Open **Cheque Books** and add each active book, so that missing leaves are detected.
4. On the first day of the **Cash Book**, enter the opening cash and bank amounts by hand.

</details>

<details>
<summary><b>4. Bank statement verification</b></summary>

Apply `schema_cheque_verification.sql` in the Supabase SQL Editor first. Admin and staff can then open **Cheque Register → Verify statement**, select the statement account, and choose an XLSX, XLS or CSV file. Use the first sheet, with columns `Cheque No` and `Amount` or `Debit`. `A/C Code` and `Date` are optional.

The preview compares the selected A/C, cheque number and exact amount against the register. Review and select the matches, then confirm. The file stays in the browser, and only verification metadata is saved. Cheque status keeps using the existing workflow, including records without a statement. Verification shows in the register, its Excel and print exports, and the cheque report summary and details. If the A/C, number or amount of a cheque changes, its verification is cleared.

</details>

---

## Local demo

If `SUPABASE_URL` in `config.js` is empty, the app runs in **DEMO mode**. All data then stays in that browser, and you can log in as admin, staff or boss with one click.

```bash
# optional: put sample data in dev/accounts.json and dev/history.json, then:
python -m http.server 8765
# open http://localhost:8765
```

> Real account data must never be committed. `dev/` and any plaintext exports are git-ignored.

---

## Security & backup

- **Row Level Security** on every table. Writes go through the module access rules, and only Admin can change finalized records or delete.
- **2-step verification (TOTP)** is required for Admin and Boss. The app enforces enrolment, and the database enforces it once the staged SQL is applied.
- **Audit log** written by database triggers. It records who changed what, and what it was before.
- **Private storage** for cheque photos, served through short-lived signed URLs.
- **Encrypted history file** (`history.enc`). The decryption key is stored in the database and is readable only by active users.
- **Nightly backup** at 12:00 AM (Bangladesh time) using `pg_cron`, with automatic and manual snapshots that can be downloaded as JSON or Excel from **Admin → Backup & Restore**.
- **Off-site backup:** a daily GitHub Action dumps the database (and the cheque photos), checks it, encrypts it with `age` and stores it in a private repository. See [scripts/backup/README.md](scripts/backup/README.md). The Admin overview shows the latest run.
- **Offline outbox with a dead-letter list:** an entry the server rejects is parked for review instead of being dropped.
- **Sign out other devices** and a **security score** are on the Security tab.

---

## Quality checks

Every pull request and every push to `main` runs [`checks.yml`](.github/workflows/checks.yml):

- JavaScript syntax check on all scripts
- Shell syntax check on the backup scripts
- `scripts/check-version.py`, which makes sure `index.html` and `sw.js` carry the same version
- `scripts/check-backup-tables.py`, which makes sure the backup table lists agree

Each UI change bumps the version in `index.html` (`?v=`) and `sw.js`, so phones never keep a stale copy.

---

## Design rules

- **Buttons:** [UI_BUTTONS.md](UI_BUTTONS.md). A button with the same purpose looks the same on every page.
- **Motion, focus and depth:** [UI_TOKENS.md](UI_TOKENS.md). Hover lift is 1 px, press scale is 0.97, the focus ring uses one glow token, and nothing animates longer than 0.2 s. Reduced-motion is respected, and dark mode raises depth with a faint accent tint.
- **Language:** every label is written for both বাংলা and English with `bi(bn, en)`, so the English mode has no Bangla text.

---

## Release notes

| Version | What's new |
|---|---|
| **v6.104** | README rewritten with fresh screenshots; three Bank Closing notices now translate fully in English mode |
| **v6.103** | Dashboard "today" strip, Reminders grouped by day, Settings summary and section navigation, Admin overview with live team, backup and activity panels |
| **v6.102** | UI polish on every page (motion, focus glow, depth, dark cards), `UI_TOKENS.md`, Collection Entry *Clear* button fix |
| **v6.100** | Collection Entry **View / Export** (register preview with Excel, PDF, image and print) |
| **v6.99** | Register PDF and print: more signing space and a page footer on every page |
| **v6.94–v6.98** | Cash Book activity uses the same table style as cheque activity, cheque view actions grouped |
| **v6.88–v6.91** | Button role system, ledger list modal, Account Finder fixes, CODE · HOLDER account labels |
| **v6.80–v6.87** | Party ledger suggestions in the Cash Book, 2FA enforcement for Admin and Boss, offline dead-letter list, encrypted off-site backup, cheque posting redesign |
| **v6.71–v6.72** | Inventory module (Niramoy, Distribution, RM Factory), order vs delivery balance, monthly lock |
| **v6.15–v6.70** | Collection module, Cash Book and Tally import, statement verification, module access, unified page headers |
| **v6.2** | Audit log rebuilt (download Excel/CSV/PDF), backup and security pages |
| **v6.1** | Lighter cash record, easy-close menu, redesigned Admin |
| **v6** | New dashboard, CASH module, bank balance reports, settings, nightly backup |
| **v5** | Bank closing overhaul (pre-fill, blue edits, drafts), reminders, audit log, cheque photos, bank colours |
| **v4** | Offline mode with auto-sync, fast cache, design v3 |

---

<div align="center">
<sub>Built for <b>NABIAD Group</b> · Kaliganj, Dhaka · by Ruhul Amin</sub>
</div>
