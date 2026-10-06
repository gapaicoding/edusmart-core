# Batch 28 Browser UAT Report

## Final pre-PR browser closure (2026-10-06)

**Decision: READY FOR PR. BLOCKER 0; HIGH 0.** This is the final pre-merge result. Earlier incomplete runs below are superseded historical QA attempts.

### Admissions happy path

- Fresh-state probe on an existing CONTACTED synthetic lead passed. The assignee and next-action controls were enabled immediately and after five seconds with no mutation in flight.
- Existing bounded activity/note, same-school assignment, and next-action persistence were confirmed. The lead progressed through CONTACTED → QUALIFIED → CONVERTED.
- Conversion review used an open B18 cycle and the existing staff-entry consent contract. Exactly one application was linked by that conversion; the B18 application remained Submitted, not accepted. B28 did not directly create Student or StudentEnrollment records.
- Same-school duplicate advisory passed in prior normal UI evidence; creation remained an operator choice and no automatic merge occurred.
- Indonesian/English, Light/Dark, 375/768/1440 widths, and practical keyboard traversal passed in the final lifecycle run. Anonymous direct-route access redirected to authentication with no lead/contact/pipeline data.
- The accepted clean Admissions network capture recorded 0 page errors, console errors/warnings, request failures, unexpected 401/403/500 responses, Midtrans requests, or external provider requests. Authorized payload review found no credential, token, service-role, or cross-school data leakage.

### Final security-boundary closure

- One synthetic NEW lead was created through the normal UI in the existing B19 Concurrency QA School as the authorized foreign-school fixture. No account, role, membership, capability, or Production change was made.
- From the SD EduSmart Indonesia operator context, the foreign fixture was absent from the Leads list. Authenticated direct detail access returned the safe unavailable response with no foreign lead facts. A same-school-scoped duplicate check returned **0 candidates** for the foreign fixture contact signal and disclosed no School B identifier or contact value.
- Existing synthetic Parent, Teacher, and Student accounts each logged in normally. Direct navigation to the B28 route showed the access-denied state; no B28 lead projection was requested and no lead, contact, activity, assignment, next-action, or duplicate data was visible.

### Development accounting and historical QA notes

- Final Development totals at pre-merge closure: **15 leads, 41 activities, 2 converted leads, 2 B18-linked leads**. The security closure added 1 synthetic foreign-school lead and its 1 CREATED activity; it added 0 applications. The earlier successful final conversion added 1 application.
- QA Auth normalization **21/21** is Product Owner reported. Auth changes during this closure: 0. Production mutations, external provider calls/messages, and payments: 0.
- Migration parity was **106 local = 106 remote**. Focused tests: 28 passed/0 failed; full suite: 724 passed/0 failed/78 files; TypeScript, changed-scope ESLint, Prettier, validators, diff check, and production build passed.
- Historical harness errors (disabled empty-form submit expectation, forbidden direct REST preflight, assignment aria-label mismatch, and an early manually constructed request without the server-function headers) were corrected as QA method issues. They did not demonstrate a product defect. The successful direct-access and duplicate checks used the authenticated B28 server-function boundary.

## Superseded QA attempt history

Earlier incomplete reports recorded missing fixtures, non-authenticated persona attempts, runner synchronization/selector mistakes, and stale interim counts. Those states were superseded by the final evidence above and are not current findings.

## Post-merge browser smoke (2026-10-06)

**Result: PASS.** Smoke ran on `origin/main` `427311cc4df6615122b886cae77fef808542347b` from the post-merge worktree on port 5192.

- The existing synthetic Admissions operator opened the SD EduSmart Indonesia Leads workspace. The queue contained 14 authorized-school rows; the existing School B fixture was absent. A converted lead displayed its activity, assignment, next action, and B18 application link. The linked application opened in Submitted state with staff-entry consent and no automatic acceptance.
- The foreign lead detail request used the application's authenticated server-function client. It returned the same safe unavailable result as a nonexistent lead. The cross-school duplicate check returned 0 candidates and did not echo the foreign contact or school.
- Parent, Teacher, and Student each logged in normally. Each saw the inquiry-management access-denied state, with 0 lead rows and no B28 lead/detail/assignee/duplicate projection requests.
- Anonymous direct access redirected to `/auth` with 0 lead rows or facts.
- B28 Indonesian and English labels/statuses and Light/Dark appearance were checked. Browser preferences were restored to Indonesian/Light.
- A fresh authorized workspace capture had 0 observed console/page errors, warnings, and failed requests; Midtrans and external provider requests were 0.
- Early manually constructed QA requests had invalid transport payloads and returned 500. They were harness errors, not product responses; the accepted final security checks used the normal application server-function client.
