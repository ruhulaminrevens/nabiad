# Admin module access

Apply `schema_module_access.sql` in Supabase after the existing v6 schema on staging, then production. Apply the optional statement verification schema first when both are installed together. The migration is transactional and can be rerun. Existing users keep their role defaults until an Admin saves custom access. With custom access, an omitted module has both write actions disabled.

## Grant access

In **Admin Panel → Users → Module access**, select **Custom module access**, choose **Entry**, **Edit** or both per module, then save. **Allow all** selects every displayed action. **Role defaults** clears custom rules. Users can reload to refresh their menu. Database checks use the saved policy on the next write, including queued writes when they sync.

| Module | Entry | Edit |
| --- | --- | --- |
| Cheque | Post new cheques | Edit cheques and append status events |
| Bank | Create a day’s closing | Edit existing closing balances |
| Cash | Enter and finalize new days or drafts | Edit existing Cash Book and Cash Checker days |
| Collection | Add pending collections | Edit pending collections and act on eligible statuses |
| Inventory | Add orders, demand and RM daily stock | Edit existing orders, demand and RM daily stock |

Existing record-state rules continue to apply, including Inventory month locks and Collection status transitions. Staff cheque entry edits require ownership and the Admin-approved posting window, including with custom Cheque Edit. Apply `schema_cheque_edit_window.sql` after the module access schema to enforce this in the database. Admin-only destructive actions, master configuration and user management continue to use their existing rules. Read access follows the user’s role.

Register a future module in the UI capability list, the SQL configuration validator and the relevant table/API bindings. Add an allow/deny test for its write operations before enabling it for users.

## Release check

Verify a user with selected Entry and Edit grants from a separate session on staging. Include one permitted write, one denied write, one revoked grant while the user is still signed in, and one user on Role defaults. Give production users access only after those checks.
