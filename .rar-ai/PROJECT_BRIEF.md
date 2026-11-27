# Project brief

- Repository: `ruhulaminrevens/nabiad`
- Default branch: `main`
- Purpose: Daily finance operations and reconciliation for Nabiad staff, reviewers, and administrators.
- Protocol revision: 1.0

## Daily workflow

- **Cheques.** Record used cheque leaves in Nabiad. Check for missing or spoiled leaves and confirm that related transactions appear in the Cash Book. The cheque register creates no standalone Tally voucher.
- **Cash Book.** Record daily receipts and payments. The daily summary includes Distribution collections, Chawk Bazar Food/Cosmetics/Others, N.Zaman Ch., N.Zaman Veg, Niramoy Traders, and total bank balances. The owner described Niramoy Traders net as Niramoy (N) minus Niramoy (D). N is cash paid by Niramoy itself. D is payment funded by withdrawal from DBBL-17-Distribution, DBBL-68-Niramoy, or IBBL-10-Niramoy. Cash Book postings belong to the Nabiad Cash & Bank Tally company. Exact cross-company links and posting rules for Cash Book need separate verification.
- **Bank Closing.** Use bank statements to record daily closing balances and account debits and credits. Reconcile against Cash Book and collection records.
- **Collection.** Record Distribution party deposits to bank or cash. Use the same collection when reconciling Cash Book and Bank Closing. Count each deposit once in its applicable total.
- **Inventory.** Track stock, orders, deliveries, pending deliveries, and collections. Deliveries post to the relevant Niramoy or Distribution Tally company. Delivery posting rules need separate verification.

## First automation scope

- For each newly approved Distribution collection, approval authorizes one separate Journal voucher in `Nabiad Distribution Ltd.`. Debit `Nabiad-Cash & Bank` and credit the mapped Distribution party ledger for the same amount. Multiple collections in one account on one day each keep their own voucher.
- The owner enters each deposit separately in the `Nabiad Cash & Bank` company after checking the bank statement. Debit the relevant bank ledger and credit `Nabiad Distribution`.
- A correction to a posted collection requires explicit permission to send the update. Show the before and after values. Update the linked voucher and verify the result in Tally.
- When a posted collection is cancelled, retain its voucher reference and show that manual Tally action is pending. The owner handles the voucher in Tally and can mark the action complete in Nabiad. Record who marked it complete and when.
- Cash Book and inventory delivery automation require their own mappings, approval rules, and acceptance checks.

## Stack, checks, and release

Static HTML, CSS and JavaScript PWA with no frontend build step. Supabase provides PostgreSQL, authentication, storage and row-level access controls. The Windows Python Bridge currently reads TallyPrime data into Supabase. The repository documents GitHub Pages deployment from `main` and a separate Windows Bridge installer workflow.

GitHub Actions checks JavaScript and backup shell syntax, version consistency, backup table lists, the performance budget, and Bridge tests using a mock server. Use a local demo and an isolated Tally test company for posting validation. The owner must separately authorize production migrations and deployment. Follow the repository's backup, rollback and Bridge-idle requirements before production database changes. Keep credentials and live finance records out of Git and checkpoints.

## Acceptance checks for the first automation

Verify the target company, exact ledger mapping, date, voucher type and equal debit and credit amounts before sending. Confirm in the test company that approval creates one correctly balanced voucher, retries after an uncertain response recover the original voucher without duplication, and an authorized edit updates that same voucher. Block missing mappings and changes made independently in Tally for review. Verify that cancellation creates a manual follow-up with an auditable completion action. Confirm that existing historical vouchers and the separate Cash & Bank company are outside the automated posting scope.
