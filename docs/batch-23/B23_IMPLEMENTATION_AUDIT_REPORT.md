# EduSmart Batch 23 — Implementation Audit Report

## Executive result

Batch 23 implements the approved post-submission Admissions Follow-up & Funnel Foundation. Live Development lifecycle and browser validation is complete for the available synthetic topology. Source, database, and fresh automated gates pass. The feature branch is ready for PR after commit/push; it is not merged or permanently closed.

## Scope and authorization

The implementation adds one-open-task-per-application follow-up, bounded completion outcomes, append-only activity, request replay protection, same-school staff eligibility, and cycle-scoped counts derived from canonical B18 states. B18 remains authoritative for application status, decisions, withdrawal, and conversion. No messaging, payments, external contacts, free-form follow-up notes, or generic CRM pipeline was added.

Authorization reuses `admission.read` for queue/funnel/detail projections and `admission.review` for task commands/assignee lookup. No new capability or role-name authorization was introduced. Direct table privileges remain revoked; forced RLS and authenticated capability-checked RPCs are authoritative.

## Development migrations and validator

Both append-only migrations are applied to the intended Development database and Local = Remote:

- `20260928130000_b23_admissions_followup_funnel.sql` — B23 tables, constraints, RPCs, RLS, and command boundary.
- `20260929100000_b23_followup_staff_employment_category_fix.sql` — corrective eligibility predicate. The original migration incorrectly treated `employment_status` as the literal activity state `active`; B18 actually stores employment category as free text. This append-only correction retains active staff/profile, active same-school assignment, employment date validity, active organization membership, and school access. Neither applied migration was edited.

The read-only `supabase/validation/validate_b23_admissions_followup_funnel.sql` passes after deployment. It checks RLS enabled/forced, grants, ownership constraints, one-open-task uniqueness, status/outcome constraints, append-only activity contract, RPC ACL/security, capability checks, and funnel contract. No further migration was created.

## Development fixture and mutation accounting

Development-only QA setup and resulting artifacts:

- Auth inventory: 21 supplied QA identities inspected read-only; 4 accounts needed password normalization for the B23 persona tests, 0 unresolved. The remaining identities were not password-reset. The credential is intentionally omitted from this report.
- Admission cycle: 1 synthetic active B23 cycle, using the existing active Academic Year and existing Grade Level.
- Application: 1 synthetic submitted B18 application, created via the normal public PPDB flow; application status remains `submitted`.
- Applicant/guardian support: 1 synthetic applicant, 1 synthetic guardian record, consent and canonical B18 submission history as required by the normal flow. No real contact data was added.
- Staff: reused existing synthetic active QA teacher/profile, staff-school assignment, organization membership, and school access. New staff/profile/auth/membership/access rows: 0.
- Follow-up lifecycle: 3 tasks total (2 completed, 1 open), 9 activities, 9 command records. Exactly one task is currently open. No task command changed the B18 application status.
- Production schema/data mutation: 0. External messages: 0. Payment transactions: 0. Provider credentials: 0.

No fixture audit records were hard-deleted to conceal QA mutations. One temporary, empty QA cycle created during initial context correction was removed before application submission; the final topology contains one synthetic B23 cycle.

## Live lifecycle and integrity evidence

- First task creation succeeded for the synthetic submitted application, with the eligible same-school QA staff assignee and due time. The task, ownership, command record, and activity were persisted transactionally.
- Exact create/update/completion replay returned the same logical result without duplicate tasks or activity. Reusing an existing request key with a changed payload was safely denied with localized user-facing conflict copy.
- A second open task was denied. After a task became terminal, a subsequent task was allowed; terminal tasks and their activity remained visible.
- Completion with bounded outcomes (`contacted`, `no_response`) set terminal state/timestamp and appended activity. The B18 application remained `submitted` throughout.
- A real near-simultaneous pair of distinct first-open-task requests was exercised through the authenticated server-function boundary after the prior task was terminal. One request succeeded; the competing request received a safe active-task conflict. Exactly one active task and one corresponding creation event resulted; no database exception leaked.
- A tampered/nonexistent assignee was rejected with safe copy (“Choose an active staff member assigned to this school.”); the task row/version and history remained unchanged.
- Same-school eligibility is proven by the successful task assignment. Invalid/non-staff and inactive-assignee rejection are also covered by source/automated DB contracts. No safe foreign-school eligible staff fixture existed, so a true cross-school assignee attempt was not run.
- Activity is append-only by database trigger and direct authenticated table writes are revoked. Live schema/grant validator confirms tasks, activities, and command-request tables have RLS enabled and forced and no authenticated/anon direct CRUD grants.

## Funnel and B18 compatibility

The active B23 cycle returned factual counts: total 1, submitted 1, under review 0, accepted 0, rejected 0, withdrawn 0, converted 0. The count matched the canonical B18 application state; stage history did not inflate totals. No percentage or second editable stage model is present.

The synthetic application was created through B18's normal public submission, including its canonical submitted status, submission timestamp, consent, and stage history. B23 task create/update/complete operations left B18 status unchanged and did not make a decision, withdraw, or convert the application. Full and focused B18 tests pass. B12 and B18–B23 regression coverage is included in the fresh full suite.

## Authorization and privacy

- Staff/Admin: actual `admission.read`/`admission.review` capabilities allowed the queue, funnel, detail, and task commands.
- Teacher: actual capability inventory had no admissions read/review grants; Admissions navigation and internal management UI/data were unavailable. No role-name inference was used.
- Parent and Student: internal admissions/follow-up controls and synthetic application/task data were not exposed by normal navigation or guessed detail route; application read resolved safely unavailable. Forced RLS, revoked table rights, RPC checks, and automated security contracts deny staff follow-up access.
- Anonymous: the internal route redirected to authentication; public PPDB submission remained separately usable for the synthetic B18 flow.
- Tampered application/task/assignee identifiers are covered by safe-denial contracts. No suitable second-school published/synthetic resource existed for a true live cross-school resource attempt. No second tenant/school was manufactured.
- Follow-up task/activity/funnel data contains no copied applicant/guardian contact fields or free-form transcript.

## Fresh engineering gates

- Full suite: 687 passed, 0 failed, 73 files.
- Focused B23 + B18: 22 passed, 0 failed, 4 files.
- TypeScript: PASS (`bunx tsc --noEmit`).
- Production build: PASS. Existing repository TanStack `inputValidator` deprecation notices are warnings only.
- Changed-scope ESLint: PASS, 0 issues.
- Changed-scope Prettier: PASS.
- `git diff --check`: PASS.
- Development migration ledger: PASS, both B23 migrations aligned.
- B23 SQL validator: PASS.

## Browser UAT and accessibility

Actual runtime: `http://127.0.0.1:8081` (8080 was occupied). Staff/Admin normal authentication opened the synthetic B23 cycle, counts-only funnel, follow-up queue, application detail, task actions, localized outcomes, and history. English/Indonesian and Light/Dark preference persistence were verified. Representative 375/768/1440 widths had no page-wide horizontal overflow. Teacher, Parent, Student, and anonymous denial boundaries were exercised as described above.

Keyboard testing found and fixed a focus-return defect: closing the follow-up dialog with Escape previously left focus on `BODY`. The dialog now returns focus to the follow-up panel. A post-fix browser retest confirmed the dialog closes and focus lands on `#b23-followup-panel`. Labels, dialog title/description, named actions, and visible focus were verified; this is a practical review, not a formal WCAG certification.

On a fresh authenticated application-detail reload, there were no console errors, page errors, hydration errors, or failed network responses. Earlier invalid sign-in attempts during QA produced expected Auth 400 responses and a hydration warning while on the sign-in route; those did not recur on the clean authenticated B23 route reload. No duplicate command or unexpected 401/403/500 occurred in the authorized happy path.

## Residual coverage limitations

- True live cross-school assignee/resource denial was not directly executed because Development has no safe eligible foreign-school staff/resource fixture. DB ownership, forced RLS, RPC capability checks, tampered-ID behavior, and automated contracts provide structural evidence; no contradictory evidence was found.
- Concurrent reassignment versus completion was not directly raced. The live competing first-task creation race and duplicate command replay passed; row-version/locking contracts cover conflicting updates.
- The UI does not expose a supported cycle-creation or profile-to-staff-linkage flow. The one cycle was created as an authorized synthetic Development fixture; staff topology was reused rather than fabricated.
- Remaining legacy English strings in the B18 application summary are outside the B23 follow-up UI and were not broadly rewritten in this batch.

## Finding matrix

| Severity | Finding                                                                                                                | Disposition                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| BLOCKER  | None                                                                                                                   | 0 unresolved                                                                                       |
| HIGH     | None                                                                                                                   | 0 unresolved                                                                                       |
| MEDIUM   | True foreign-school live resource/assignee case and reassignment-vs-completion race lack suitable Development topology | Documented non-blocking coverage limits; structural and automated isolation/conflict controls pass |
| LOW      | Legacy B18 summary includes some English-only strings in Indonesian mode                                               | Existing B18 surface; B23 follow-up labels remain localized; no B18 scope expansion                |

## Decision

Implementation and pre-PR gates pass with the stated non-blocking coverage limits. Ready for PR after the current B23 changes and reports are committed and pushed. Batch 23 is not yet merged or permanently closed. No Batch 24 work has started.
