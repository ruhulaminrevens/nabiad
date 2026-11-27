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

## Distribution posting pilot

Local task branch: `ai/distribution-tally-posting`, based on setup commit `b5b5051`.
The local Journal preparation code checks approval, rollout eligibility, company,
ledger mappings, and amount. Its fourteen focused tests pass, including repeat sends, lost replies, and duplicate or conflicting Tally references. The wider Windows Bridge
suite ran 71 tests with seven skipped, one failure in the updater test, and one
error in the encrypted secret test. No posting was attempted.

The owner confirmed there is no separate Tally test company and selected Nabiad Distribution Ltd. as the target. The posting guard was tested with a mock transport and an in-memory reservation. The opt-in approval queue and persistent send reservation are drafted in schema_distribution_posting_queue.sql. The import sender and strict response checks are implemented and tested with mocked replies. Company-scoped Day Book lookup now validates the exact reference, date, voucher type, active state, and ledger amounts against mock replies. Verified lookup now returns the Tally GUID and voucher number. The SQL draft can save those identifiers after a send reservation. The pilot processor runs lookup, reservation, send, verification and the status-save callback for one explicitly enabled reference. The Collection Entry admin view reads the pilot status and voucher number via an admin-only status RPC. Local JavaScript syntax and rendering checks passed. The pilot caller uses the existing Bridge login and RPCs scoped to one selected Bridge account and collection. The separate pilot command requires explicit live confirmation, one collection UUID, and a mapped party ledger. Its help and refusal without confirmation were verified locally. The SQL draft ran twice in an isolated PGlite PostgreSQL instance with synthetic records and simulated roles. Disabled defaults, historical exclusion, Bridge account scoping, stale snapshot rejection, one send reservation, and idempotent verification passed. The Admin Collection Entry view passed a Chromium browser check with synthetic records and a mocked status API. It showed the verified voucher number and verification-pending state, with no Tally label on a historical row. For posted collections cancelled in Nabiad, admins can record manual Tally completion. PostgreSQL tests verified admin-only, idempotent completion and the audit actor. The browser showed the manual-pending button. Correction preview and approval validation now require the original Tally identity and unchanged alteration revision. Correction approvals persist the previous and approved values, Tally revision, approval actor and timestamp. Isolated PostgreSQL checks passed for role access, stale previews, repeated approval, and recorded values. The Admin correction preview and approval button passed a Chromium flow with a mocked approval API. The preview RPC passed isolated PostgreSQL scoping and snapshot checks. The correction transport builds an Alter request targeting the original Tally Master ID and checks that the same voucher returns with a changed revision. Mock transport tests passed. The queue persists the verified Master ID and provides one atomic correction reservation per Tally revision. Isolated PostgreSQL checks passed. The pilot command can load an approved correction, reserve its send, and store the verified revision. A mock test recovered a reserved correction by reading Tally without resending. The updated SQL installed twice in isolated PostgreSQL. Release candidate 6.182 includes the deployed Collection Edit fix from PR #167. The combined browser test passed for editing an approved collection and approving a Tally correction. Live validation remains pending. Production activation is still pending.

Next: verify the target company and ledger mappings with read-only access. Ask the owner to approve the exact first live voucher before any production posting.
