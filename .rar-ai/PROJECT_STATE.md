# Project checkpoint

- Status: Setup documentation updated locally
- Updated UTC: 2026-11-27 16:16
- Repository / default branch: `ruhulaminrevens/nabiad` / `main`
- Task / owner / scope: RAR AI Project OS setup. Project owner approved updating the brief and checkpoint.
- Work branch: `ai/setup-rar-os`. PR and issue status unverified.
- Observed base SHA: `13d0a772cbdc8d4bed493512f2d550869a2138b6`
- Observed setup HEAD before documentation edits: `aafd00f3294b36cd9d5a6df5b8796adb29164c01`
- Remote refs: `git ls-remote` confirmed both branch tips at the commits above.
- Local status: Two documentation edits and existing untracked `Nabiad.txt`.
- Current objective: Record agreed posting rules and prepare a scoped Distribution collection pilot.

## Completed / verified

- Read the repository instructions, application source and CI definitions. The current Bridge reads TallyPrime data into Supabase.
- Matched three existing Nabiad collections dated 16 November 2026 (BDT 500,000 total) to three separate Distribution Journal vouchers in the supplied screenshots. The Distribution intercompany ledger shows the debit side. The owner confirmed the corresponding party-ledger credit and the manual process for the separate Cash & Bank company.
- The owner confirmed first-send approval, permission for subsequent updates, manual cancellation handling, and a completion marker in Nabiad.

## Pending / dependencies

- Check open issues and PRs for overlap. Agree the pilot owner, task branch and isolated Tally test company.
- Verify exact Tally company and ledger mappings, the collection-to-party mapping, and how to persist and retrieve a unique voucher reference. Confirm which roles can approve changes and record manual completion.
- Design handling for an uncertain response, historical approved collections and vouchers already entered manually. Verify that existing collections cannot be sent as new postings during rollout.
- Confirm the separate requirements for later Cash Book and inventory delivery automation.

## Tests and evidence

Application tests and live posting tests were not run during documentation setup. Evidence so far is repository inspection, Git ref verification, the supplied screenshots and owner confirmation. Record pilot test commands, environment, UTC time, and results when available.

## Production / rollback

Live version, current backup health, and rollback evidence remain unverified. Posting implementation, migration and deployment await separate approval.

## Next safe action

Review these documents, then agree an isolated test-company pilot for one Distribution bank deposit. Check preview, approval, duplicate prevention, authorized correction and manual cancellation completion before considering rollout.

## Handoff

Local documentation edits await review. The remote branch verification above applies to the setup commit that existed before these edits.
