# Batch 28 Post-Merge Verification Report

## Decision

**BATCH 28 PERMANENTLY CLOSED — 2026-10-06.** All post-merge release gates passed. BLOCKER: 0. HIGH: 0. Stage 2 remains OPEN; Batch 29 was not started.

## Merge integrity

- PR: #23, `feat(admissions): add pre-application lead management`.
- Feature commit: `4efaf1ee03b52a92b441766da50961385dd5043c`.
- Merge commit and verified `origin/main`: `427311cc4df6615122b886cae77fef808542347b`.
- The feature commit is an ancestor of `origin/main`; the merge commit has the expected pre-merge main and feature parents.
- The detached verification worktree was created from current `origin/main`. B28 schema, activity/history, idempotency, capability contract, RLS/FORCE RLS, scoped RPC boundary, assignment constraints, duplicate advisory, B18 conversion, UI, localization, validators, tests, and documentation are present. No conflict markers or unintended migration edits/removals were found.
- The two append-only B28 migrations are present: `20261005100000_b28_preapplication_lead_management.sql` and `20261005110000_b28_lead_contract_hardening.sql`.

## Development database and security

- Migration parity: **106 local = 106 Development remote**. Missing local: 0; missing remote: 0; unexpected remote: 0; duplicate timestamps: 0.
- B18 foundation validator: PASS. B18 phase-2 validator: PASS. B23 validator: PASS. B28 validator: PASS.
- B28 RLS and FORCE RLS, absence of anonymous table grants, absence of ordinary authenticated direct-write grants, capability contract, same-school assignment, and school-scoped duplicate behavior: PASS.
- Read-only anomaly checks: **0** across lead scope, status/source/channel, assignee scope/activity, converted application links, activity integrity, idempotency, and cross-school relationships.
- Development state at verification: **15 B28 leads, 41 activities, 2 converted leads, 2 leads linked to B18 applications**. Both linked applications are Submitted; none was auto-accepted. The one existing foreign-school fixture remains in its QA school.
- B28 conversion uses the B18 staff-entry application boundary. Direct B28 Student, Guardian, StudentGuardian, and StudentEnrollment creation: **0**.

## Engineering gates

- Focused B18/B23/B28 suite: **28 passed, 0 failed, 5 files**.
- Full suite: **724 passed, 0 failed, 78 files**.
- TypeScript: PASS.
- B28 changed-scope ESLint regression: **0**.
- Prettier: PASS. `git diff --check`: PASS.
- Production build: PASS. No Production deployment was performed.

## Post-merge browser smoke

- Runtime: `http://127.0.0.1:5192`, served by Vite from the post-merge verification worktree at the verified SHA. TCP and `/auth` HTTP 200 passed.
- Admissions operator: existing normalized synthetic `b14.qa.operator@edusmart.invalid`; active school: SD EduSmart Indonesia. The rendered operator identity, school context, active membership, and all three B28 capabilities were verified.
- Authorized positive path: Admissions Leads loaded with 14 School A rows. A converted synthetic lead displayed its activity history, owner, next action, and formal B18 application link. The linked application opened in Submitted state with `staff_entry` consent and no accepted/SIS-converted state.
- Foreign-school list isolation: PASS; the existing School B fixture did not appear in School A's 14-row list.
- Foreign-school direct detail: denied through the authenticated application server-function client. Its safe unavailable result matched the response signature for a nonexistent lead; no foreign lead facts were returned.
- Cross-school duplicate oracle: **0 candidates** for the foreign fixture's synthetic contact signal. The response did not echo the foreign contact or School B identifier.
- Parent, Teacher, and Student: each logged in through the UI and received the B28 inquiry-management access-denied state. Lead rows: 0. No B28 lead/detail/assignee/duplicate projection requests were made for those personas.
- Anonymous direct route: redirected to `/auth`; lead rows and lead facts: 0.
- Indonesian and English B28 labels/statuses: PASS. Light and Dark preference states rendered the workspace and converted detail; the browser preference was restored to Indonesian/Light afterward.
- Fresh authorized workspace capture: B28 and B18 server projections returned successfully; 0 observed console errors, page errors, warnings, or failed requests in the clean positive capture. Midtrans and external provider requests: 0.
- A pair of early hand-built QA server-function probes returned HTTP 500 because their harness payload construction was invalid. They were excluded from the clean product capture; the final foreign-lead test used the application's own server-function client and produced the same safe denial as an absent ID. No product defect or data mutation resulted.

## Leakage and Production safety

- Password, access-token, refresh-token, and service-role leakage: **0**.
- Foreign-school PII and cross-school duplicate disclosure: **0**.
- Production migrations, data changes, and Auth changes: **0**.
- Provider calls, external messages, and real payment attempts: **0**.

## Findings and closure

- BLOCKER: **0**.
- HIGH: **0**.
- No product source, test, configuration, or migration change was needed for post-merge verification.
- **Batch 28: PERMANENTLY CLOSED.** Stage 2 remains OPEN. Batch 29 remains NOT STARTED.
