# Tally Dashboard (admin only)

Page `#/tallydash` (sidebar: More → Tally Dashboard). Shows whether the read-only TallyPrime → Supabase mirror is healthy:
companies mirrored, voucher rows and unique vouchers, last successful sync, failed runs, per-company status and the last 40 sync runs.

- **Who sees it:** admins only (`roles: "a"`). Staff and boss do not get the menu entry; opening `#/tallydash` falls back to the dashboard. The data function also checks `my_role() = 'admin'` on the server.
- **Data:** one function, `tally_dashboard_summary()` (`schema_tally_dashboard.sql`). It reads `tally_vouchers`, `tally_ledgers`, `tally_sync_runs` and writes nothing.
- **Before the SQL is applied** the page shows an inline notice with the two steps (backup, then run the file) instead of failing.
- **Status rules:** Failed = the latest run for that company failed; Stale = no successful sync for 36 hours; No sync yet; OK.
- **Double counting:** some 2026 vouchers exist in both ChawkBazar-2026 and Cash & Bank (the company was split on 1 Jan 2026). Use the *unique* figure for totals.
- **Demo mode** shows fictional companies so the page can be tried without data.
- **Source of the data:** the NABIAD DATA BRIDGE desktop app (`tools/tally-bridge`, PR #148).

Apply (only after the owner's explicit yes): `select make_backup('manual');` then run `schema_tally_dashboard.sql` in the Supabase SQL Editor. It creates one function and changes no data.
