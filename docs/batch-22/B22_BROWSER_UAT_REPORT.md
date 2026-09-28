# EduSmart Batch 22 — Browser UAT Report

## Result

**PASS for the provider-neutral Development queue workflow.** No external provider was connected or invoked. All browser flows used normal application authentication at `http://localhost:8080`; no session/token/cookie was injected.

## Environment and Persona

- Staff/Admin: synthetic B14 operator; application showed SCHOOL_ADMIN · SCHOOL and the active Development school.
- Teacher: synthetic Teacher; actual capability check for `communication.delivery.manage` returned false.
- Parent: synthetic Parent; Parent-only navigation and the localized unlinked-child state rendered.
- Student: existing synthetic B14 Student authenticated normally and accepted the supported Student Portal invitation for the new synthetic fixture. The application identified the Student persona and displayed Student-only navigation.

No real identity was used. No password, invite token, access token, cookie, or browser session material is included in this report.

## Fixture and B20 Publication

The existing dedicated QA draft `B22 QA External Delivery Fixture` was used (announcement ID `da43d8c7-ff33-452c-b9d5-598c7b6ab010`), targeted to `QA-B13-P2` for the student audience. One synthetic Student, active enrollment, and class placement were added through the normal SIS import workflow; the existing synthetic Student identity was linked using the supported invite/accept flow.

Before publication, read-only eligibility evidence showed exactly one active eligible profile and that it was the intended synthetic Student. The normal B20 publish control was used. B20 created one immutable recipient snapshot row and one notification with one notification-recipient row. The pre-existing unrelated draft was not touched. No B22 job existed until the queue action.

## Queue and Safety

The authorized Staff/Admin opened the published announcement and observed the External Delivery panel. The copy says no provider is connected and explicitly distinguishes a queued request from a sent message.

One WhatsApp-channel enqueue produced one job (`queued`, provider `unconfigured`), one recipient, and zero attempts. The UI displayed one pending recipient and zero provider-accepted/sent, failed, or skipped outcomes. It exposed aggregate counts only—no phone/email destination or provider payload.

Exact source-set check:

- B20 snapshot recipient count: 1.
- B22 delivery recipient count: 1.
- B20 source IDs missing from B22: 0.
- B22 source IDs not present in B20: 0.
- Matched source was the intended synthetic Student: 1.

The same authenticated application enqueue was repeated and returned the existing job. Two concurrent repeated enqueue calls also returned the same queued job. Final counts remained one job and one recipient, with zero attempts. This was a concurrent duplicate request against an existing job, not a first-insert race.

An attempt to enqueue an unrelated, unchanged draft was denied as unpublished. It remained a draft and produced no job.

## Authorization / Isolation UAT

| Persona or case          | Actual check                                                                                                        | Result                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Staff/Admin manager      | B20 publish, B22 list, queue through UI/server boundary                                                             | PASS                                 |
| Teacher                  | capability resolver false; authenticated B22 list/enqueue denied; no management panel                               | PASS                                 |
| Parent                   | authenticated B22 list/enqueue denied; Parent UI has no B22 controls                                                | PASS                                 |
| Student                  | authenticated B22 list/enqueue denied; direct read of each B22 table denied with 42501 and no rows                  | PASS                                 |
| Unpublished draft        | authenticated email-channel enqueue attempt                                                                         | Safely denied; no job                |
| Tampered announcement ID | manager list/enqueue requests with a valid but nonexistent UUID                                                     | Safely denied; no counts             |
| Foreign school context   | actual Development school in another organization supplied with the B22 announcement ID                             | Safely denied; no counts or mutation |
| Direct B22 table access  | catalog: authenticated SELECT/INSERT/UPDATE/DELETE all false for jobs, recipients, attempts; RLS enabled and forced | PASS                                 |

The Development project has multiple synthetic organizations but no published communication in another organization and only one active school in the B14 organization. A request against an existing foreign published B22 record was therefore unavailable; no second fixture was fabricated. Cross-scope tampering was denied.

## Locale, Theme, and Responsive

- Bahasa Indonesia: External Delivery heading, queue/status labels, counts, provider-unavailable/no-send explanation, and already-queued state rendered in Indonesian.
- English: corresponding B22 UI copy rendered coherently in English.
- Locale persistence: `document.documentElement.lang` matched `id`/`en` and remained selected across navigation and refresh.
- Light and Dark: both tested; semantic card/badge/control surfaces remained readable; preference persisted across routes and refresh.
- Responsive B22 detail: tested at 375px, 768px, and 1440px in both themes. No page-wide horizontal overflow; mobile controls remained reachable and labels wrapped.
- Keyboard: tab navigation reached the enabled “Antrekan email” control; its visible focus ring was confirmed. Queue controls expose accessible names, and the already-queued action is disabled.

## Console and Network

- Staff/Admin detail after publication, queue, refresh, locale/theme, and viewport changes: no console errors or warnings.
- Browser network review: no unexpected 401, 403, 404, or 500 responses, request loop, duplicate new job, or provider network call. Deliberate unauthorized calls were denied through the application boundary; direct table denial was expected.
- Historical pre-mount React warning was not reproduced during this controlled B22 smoke; no claim that it was fixed or proven pre-existing is made.

## Development Mutation Accounting

- B22 schema migration: 1.
- Synthetic Student: 1; enrollment: 1; QA-B13-P2 placement: 1.
- Existing synthetic Student profile/Auth identity reused; invitation created and accepted: 1; no new Auth user/profile.
- B20 announcement: existing dedicated draft published; snapshot: 1; notification: 1; notification-recipient: 1.
- B22 delivery job: 1; recipient: 1; attempts: 0.
- Guardians created: 0; destination phone/email data created: 0.
- Production mutation: 0. External messages sent: 0. Provider credentials: 0.

## Final Browser Decision

**B22 browser UAT: PASS** for the provider-neutral queue foundation and available persona/security scope. Real delivery, provider dispatch, and post-send statuses remain intentionally untested and out of scope.
