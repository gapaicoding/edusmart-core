# Batch 28 Implementation Audit

## Final security-boundary closure (2026-10-06) — current result

**Release decision: READY FOR PR. BLOCKER 0; HIGH 0.** This section is the current release evidence and supersedes the earlier incomplete security-boundary conclusions below, which remain only as historical attempt records.

- **Foreign-school fixture:** exactly one synthetic B28 lead was created through the authenticated normal UI in the existing B19 Concurrency QA School by its existing authorized synthetic operator. Status remains `NEW`; no application is linked. No Auth, role, membership, capability, or school-access record was changed.
- **School A list isolation:** `SD EduSmart Indonesia` Leads list did not contain the foreign fixture name or reserved test contact. No foreign row/activity/application was visible.
- **Direct foreign-school access:** the authenticated B28 `getAdmissionLead` server projection returned the safe unavailable result. No foreign lead, contact, lifecycle, assignment, next-action, activity, linked-application, or school detail was disclosed.
- **Cross-school duplicate oracle:** the authenticated `findAdmissionLeadDuplicates` server projection was called with School A scope and the existing foreign fixture’s synthetic contact. It returned **0 candidates** and disclosed no School B identifier/contact/lead detail. Same-school advisory evidence remains the earlier successful UI run.
- **Persona boundary:** the existing synthetic Parent, Teacher, and Student accounts each completed normal UI login. Direct navigation to `/admissions/leads` showed the access-denied state; no B28 list/detail server projection request was issued and no B28 data was visible.
- **Development accounting:** 15 leads, 41 append-only activities, 2 converted leads, and 2 B18-linked leads. This closure added 1 foreign-school lead plus 1 creation activity and 0 applications. Earlier final happy-path conversion added 1 application. Auth repairs in this closure: 0. Production Auth/data/migrations: 0; external calls/messages/payments: 0.
- **Migration parity:** 106 local = 106 remote. No product source/test/config/SQL changes were required for this closure. The retained engineering results are B18 foundation/phase-2, B23, and B28 validators PASS; focused 28/0; full 724/0; TypeScript PASS; changed-scope ESLint PASS; Prettier PASS; `git diff --check` PASS; production build PASS.

The successful foreign-school direct-access response was a safe denial (“This admissions inquiry is unavailable.”) with zero protected-field disclosure. Initial malformed browser-harness probes returned generic errors before the authenticated server-function headers were captured; they made no mutation and are not counted as product happy-path failures. Final results are based on the subsequent correctly authenticated server-function calls and normal UI persona flows.

## Latest final-UAT status (2026-10-05)

**Release decision: NOT READY FOR PR.** The fresh-state probe and main Admissions lifecycle now have browser evidence, but two required adversarial groups remain unverified: foreign-school lead denial/cross-school duplicate oracle, and Parent/Teacher/Student denial. No source or migration changes were made during this UAT, and no commit or push was made.

- Reused a synthetic `CONTACTED` lead. On a fresh authenticated load, school context and effective lead-manage projection matched; assignment and next-action controls were enabled at once and after five seconds, with no mutation in flight. Previous disabled-control symptom is classified as QA session/runner synchronization artifact, not a demonstrated product defect.
- Confirmed an existing note and same-school assignment persisted. Set next action; after reload it persisted in local-time display. Qualified the lead and converted once using the B18 staff-entry consent contract. The lead is terminal `CONVERTED` and has one B18 application link.
- The B18 application opened from the lead and remains `Submitted`, not accepted. The conversion review stated that conversion creates/links a formal application and does not accept a student or create student/enrollment entities. No direct B28 SIS creation was observed.
- English/Indonesian, Light/Dark, responsive widths 375/768/1440, and practical keyboard traversal passed in the observed UI paths. Anonymous direct-route access redirected to auth with zero visible lead/pipeline/contact data.
- A fresh Admissions page network capture recorded 230 HTTP 200 responses, no failed requests, no page/console errors or warnings, no unexpected 401/403/500, no Midtrans or external provider requests. One expected Supabase auth user check was present. Inspected authorized projections contained no credentials, tokens, or service-role values.
- Same-school duplicate advisory remains supported by earlier valid evidence. No new duplicate fixture was created. Foreign-school denial/no-oracle and Parent/Teacher/Student denials were not tested in this run because the current authorized School A session had no known School B record/context, and no separate persona login was established. These remain release gates, not product defects.
- Active-school pipeline after conversion: 8 NEW, 3 CONTACTED, 1 QUALIFIED, 2 CONVERTED, 0 CLOSED (14 leads). This UAT created 0 leads and 1 B18 application. Current Development-wide activity total is not established through the supported read-only UI path; at least the next-action, qualification, and conversion events were shown in lead history.
- Development QA Auth normalization 21/21 is based on Product Owner confirmation; this UAT performed 0 Auth repairs. Production mutations, external provider calls/messages, and payments: 0.

**Findings:** BLOCKER 0 known; HIGH 1 — required foreign-school and non-admissions persona browser denials remain unverified. B28 remains **NOT READY FOR PR**. No commit or push.

## Final security-boundary closure attempt (2026-10-06)

The existing authenticated browser exposed only the current school in its school selector, and no existing School B lead identifier was available through the authorized product projection. The foreign-school denial and cross-school duplicate-oracle tests therefore remain unverified. No foreign identifier was guessed. Parent, Teacher, and Student browser-denial flows also remain unverified because no authenticated sessions for those personas were available. No credentials/Auth, roles, memberships, capabilities, or Development records were changed in this attempt. No commit or push was made; the single HIGH finding remains open.

## Read-only Development count and persona follow-up (2026-10-06)

A read-only query against the linked Development project recorded 14 B28 leads, 40 append-only activity rows, 2 converted leads, 2 lead-to-application links, and 106 migration versions; local migration files also count to 106. The school-grouped aggregate showed all B28 leads belong to the active `SD EduSmart Indonesia` school; other QA schools had 0 B28 leads. There is no existing foreign-school B28 lead/contact record to support direct foreign-ID denial or duplicate-oracle testing. Do not treat the absence of a fixture as proof of isolation behavior.

Normal login attempts for Parent, Teacher, and Student remained on the auth route; no persona reached the B28 route and no B28 payload was returned. Their denial gates remain unverified. No credential resets, Auth changes, role/capability/membership changes, or Development data mutations occurred. Exact Development activity count is recorded as 40. BLOCKER 0 known; HIGH 1 remains for the unverified foreign-school and persona-denial gates. No commit or push.

## Release decision

**NOT READY FOR PR — final browser UAT is incomplete.** Do not commit or push until the remaining UI and adversarial authorization evidence is captured.

## Baseline and scope

- Baseline: `10ed4bfff7ec37baa1519e3d65769a85aeb93a75` (`origin/main` at implementation start).
- Branch/worktree: `feat/b28-preapplication-lead-management` / `D:\edusmart-worktrees\edusmart-core-b28`.
- Scope implemented: school-scoped staff-entered admissions inquiries, separate lead lifecycle, same-school duplicate advisory, optional same-school staff owner, append-only activity, and explicit conversion to a B18 formal application.
- Product decisions follow the approved B28 prompt. No public intake, messaging, campaign objects, hard-delete, retention purge, or direct B28 Student/Guardian/Enrollment creation was added.

## Schema, authorization, and command boundaries

- Append-only Development migrations: `20261005100000_b28_preapplication_lead_management.sql` and `20261005110000_b28_lead_contract_hardening.sql`.
- Tables: school-scoped leads, append-only activities, and bounded idempotency records. Leads use same-organization/school composite references, generated normalized contact signals, status/source/channel constraints, and row versions.
- RLS and FORCE RLS are enabled. Browser table grants are revoked; access is through authenticated server functions and scoped RPCs. Anonymous access is not granted.
- Capabilities: `admission.lead.read`, `admission.lead.manage`, and `admission.lead.convert`; the B28 validator checks their grants and RPC boundary.
- Assignment checks active staff, active membership, and active same-school access. Duplicate matching includes the authorized school in every lookup; the result is advisory.
- Conversion requires a qualified lead, a valid open B18 cycle/grade and the B18 staff-entry consent contract. It links one canonical B18 application and marks the lead converted. B28 does not create SIS entities directly.
- B18 validator allowlists were extended for the three additive B28 capabilities. B18 lifecycle/capability checks remain in place; the B28 validator separately checks the new grants and boundaries.

## Development and engineering evidence

- Development migration count: **106 local = 106 remote**. The linked migration-list CLI path returned a login-role password error; an independent read-only query of `supabase_migrations.schema_migrations` confirmed the remote count.
- B18 foundation validator: PASS.
- B18 phase-2 validator: PASS.
- B23 follow-up/funnel validator: PASS.
- B28 validator: PASS.
- Focused B18/B23/B28 tests: 28 passed, 0 failed.
- Full suite: 724 passed, 0 failed, 78 files.
- TypeScript: PASS.
- Changed-scope ESLint: PASS, 0 warnings after correction.
- Changed handwritten-file Prettier: PASS.
- `git diff --check`: PASS.
- Production build: PASS.
- Repository-wide lint was not used as the gate because pre-existing repository-wide format debt is documented; only changed scope was checked.

## Browser UAT

Local Playwright/Chrome and normal UI login work. The synthetic admissions operator can open the new workspace and perform lead creation, duplicate advisory, NEW→CONTACTED→QUALIFIED, and a note action in an earlier run. Captures reported 0 page errors, 0 console errors, 0 failed requests, 0 unexpected HTTP statuses, 0 direct Midtrans requests, and 0 detected browser-secret leakage.

The latest stable-runner attempt logged in normally and loaded the Indonesian Admissions workspace. Its clean capture recorded 0 page errors, console errors/warnings, failed requests, unexpected HTTP statuses, Midtrans requests, and detected browser-secret leakage. It found no existing unconverted `QUALIFIED` synthetic lead in the operator's authorized school, then stopped before making lead/activity/application mutations. Thus note, assignment, next-action, and final conversion outcomes remain unverified. A previous QA record shows one converted lead linked to one B18 application, but this closure did not capture the full conversion flow.

Therefore these gates remain **UNVERIFIED**: conversion browser flow, cross-school denial/no duplicate oracle, anonymous denial, non-admissions personas, ID/EN matrix, Light/Dark, 375/768/1440, keyboard/focus, and complete clean console/network pass across the full flow.

## Development mutation accounting

- B28 migrations applied to Development: 2.
- Synthetic lead rows present after QA: 14; activity rows: 32; one lead is converted and linked to one formal application. These totals include earlier B28 QA attempts; browser harness runs during the current resumed verification created 8 additional synthetic leads. No real applicant data was used.
- Formal applications created by browser conversion during the current verification: 0 confirmed. One linked B18 application predates the current reruns.
- Synthetic admissions Auth repairs during this resumed verification: 4. The aggregate count from earlier B28 QA attempts was not independently reconciled and is not represented as an exact cumulative total.
- Additional synthetic credential repairs in the final stable-runner attempt: 4 existing Development synthetic accounts; no new account. Across the two most recent resumed attempts, 8 repairs are observed; earlier B28 repairs remain unreconciled. Parent/Teacher/Student login-denial checks were not completed after these repairs.
- Final stable-runner attempt mutations: 0 leads, 0 activities, 0 B18 applications; observed totals remain 14 leads, 32 activities, and one linked application.
- Production migrations/data/Auth: 0.
- Provider calls, external messages, payments, and Production mutations: 0.

## Findings

- **HIGH — Browser UAT incomplete.** No eligible unconverted `QUALIFIED` lead was available in the authorized school, so the mutation-limited final run could not complete note/assignment/next-action/conversion evidence or the remaining browser matrix. Minimal remediation: provide an existing synthetic unconverted `QUALIFIED` lead in that school, or authorize one synthetic lead fixture; then resume using the current runner/session without further credential resets.
- **MEDIUM — Verification tooling.** The temporary Playwright runner required selector/query corrections; its incomplete runs created additional synthetic test leads. Clean up or retain only the needed synthetic QA records according to the Development data policy; do not treat them as product fixtures.
- **EXTERNAL / NOT IN SCOPE.** No external provider is used by B28.

## Final status

- Blockers: 0 known.
- High findings: 1 (browser UAT evidence incomplete).
- B28: **NOT READY FOR PR**.
- No commit or push performed.

## Final synthetic-fixture closure attempt

The stable Playwright runner established a fresh normal UI Admissions login and loaded the Indonesian workspace. The clean capture recorded 0 page errors, console errors/warnings, failed requests, unexpected statuses, Midtrans requests, and detected secret leakage. The runner stopped at the normal UI lead-creation step before it could confirm creation. Its failure output contained only a generic error class, so the exact selector/action failure was not captured. No lead, activity, or B18 application was created during this attempt; the one authorized final fixture remains unused. One existing synthetic Development Admissions credential repair was performed to establish the login; no Parent, Teacher, or Student credential was changed during this attempt.

Current observed Development totals remain 14 leads, 32 activities, and one linked B18 application. Conversion, note, assignment, next action, terminal replay, English/Dark, responsive, keyboard, anonymous, foreign-school, and Parent/Teacher/Student denial gates remain unverified. The latest ephemeral runner credential was discarded at process exit; no further credential reset was attempted.

**Current decision: NOT READY FOR PR.** The remaining HIGH is final browser UAT incompleteness. Minimal remediation: capture and correct the normal UI create-step failure, then use the single authorized fixture for the remaining lifecycle checks in one persistent runner process so its credential is not lost between attempts.

## Follow-up create-step diagnosis

The previous generic create-step failure was traced to a harness assertion: the runner expected the Create button to be enabled before required fields were filled, while the product correctly disables it in the empty form. That check was corrected. The subsequent attempt stopped at `CHECKPOINT_04_LEAD_WORKSPACE_READY` because a preflight direct REST read of the B28 lead table returned HTTP 403 through the runner's service-role helper. The create control was not inspected or clicked, and this attempt made no lead, activity, or application mutation. This is a test-harness access-method failure, not evidence of a product defect. Use the authorized school-scoped UI/server projection for read-only lead discovery.

One existing synthetic Admissions account credential repair was performed in this attempt. The one-shot runner exited after the safe preflight error; the ephemeral credential is no longer available, and the required single persistent run did not complete. No additional persona credentials were changed. Observed Development totals remain 14 leads, 32 activities, and one linked B18 application.

**Current release decision remains NOT READY FOR PR.** Minimal remediation: make lead discovery use the authenticated school-scoped projection and preserve the runner process and temporary credential through the entire UAT; then complete all remaining browser gates.

## Final runner attempt

The next attempt failed before application login. Last successful checkpoint was runner setup/operator selection; it failed at `CHECKPOINT_01_LOGIN_PAGE_READY` navigating to `http://127.0.0.1:5191/auth` with `net::ERR_CONNECTION_REFUSED`. The local Vite runtime was not running, no authenticated product request fired, and no product data changed. One existing synthetic Development Admissions credential repair occurred before navigation; the runner exited and that temporary credential was lost. This uses the one repair authorized for the attempt; no further credential reset was made. The runner was inadvertently executed by a Bun command intended for syntax checking. This is an automation/environment failure, not evidence of a product defect.

Observed totals remain 14 leads, 32 activities, and one lead linked to a B18 application. The one authorized final lead fixture remains unused. **B28 remains NOT READY FOR PR** with HIGH — final browser UAT incomplete.

## Credential-free runtime and persistent-run evidence

Before the full runner, port 5191 was confirmed reachable and bound to a command line referencing the B28 worktree; `/auth` returned HTTP 200. A credential-free local Playwright probe navigated successfully and confirmed hydrated visible, enabled, focusable email/password inputs (password type masked; page errors 0). The full runner started after direct B28 lead-table REST preflight calls were removed. It remains active, but the terminal wrapper did not preserve an interaction/output handle or final JSON/checkpoint output. Consequently final lead state and any data mutations from that run are unknown and are not claimed. The runner code performed one authorized synthetic Admissions credential repair; the temporary credential remains only in the active process. No retry or further credential mutation was performed.

**Current release decision remains NOT READY FOR PR.** The final authenticated lifecycle and browser matrix do not have recoverable evidence; no commit or push was performed.

## Durable final UAT retry — superseding current status

The latest durable runner performed its own runtime and hydrated-login health gate before making one authorized credential repair for the existing synthetic Admissions operator. It then completed normal UI login and loaded the authenticated Leads workspace. Lead discovery used the product UI; no direct service-role lead-table preflight was used. A visible synthetic lead was reused, and no new lead or formal application was created.

The normal UI note action completed and the note appeared. The run then timed out during next-action control interaction (`nextActionControl=false`). The assignment control was visible, but assignment persistence was not established. This is a QA selector/postcondition failure; there is no captured product error response or evidence of a backend defect. Browser lifecycle, conversion, persona-denial, responsive, keyboard, localization/theme, and clean final network gates remain incomplete. The captured initial happy-path counters were all zero for errors, failed requests, unexpected statuses, Midtrans requests, and detected secret leakage.

Development mutation accounting for this attempt: leads 0; applications 0; one note visibly added; assignment/activity delta unresolved; Admissions synthetic credential repair 1; Parent/Teacher/Student repairs 0; Production mutations, provider calls, messages, and payments 0. The durable artifacts are at `D:\edusmart-temp\b28-playwright\final-run\`. The result is `failed`, with one unresolved HIGH for browser UAT. No source changes, commit, or push were made. No further credential repair was attempted.

## Assignment selector correction — latest status

The prior lookup failure was an **ASSIGNMENT_POSTCONDITION_SELECTOR_MISMATCH**: the runner queried an `aria-label` absent from the correctly labelled select. The runner was corrected to use the label-associated locator. This was a QA harness defect; it did not demonstrate a product or accessibility defect.

The subsequent durable run passed runtime/login/workspace checks and confirmed the prior note on a reused `CONTACTED` synthetic lead. It then stopped because the visible assignment select was disabled before selection. No assignment request or Development product mutation occurred in that run; the next-action control was not reached. The UI source disables both assignment and next-action for missing manage permission, pending mutation, or terminal lead state. Given the displayed Qualify action, terminal status is not indicated, but the current authorization/pending condition was not recorded; product defect status is therefore **UNDETERMINED**. Assignment, next action, conversion, and the remaining browser matrix remain incomplete. The run performed one Admissions credential repair and no other persona repairs.

**Current release decision: NOT READY FOR PR.** One HIGH remains: final browser UAT is incomplete. No product source change, commit, or push was made, and no further credential repair or browser run was performed.
