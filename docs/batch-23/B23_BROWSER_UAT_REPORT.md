# EduSmart Batch 23 — Browser UAT Report

## Result

Development browser UAT was executed against the current B23 worktree at `http://127.0.0.1:8081` (port 8080 was occupied). A synthetic B18 application and active cycle were used; no real applicant contact data was introduced.

## Staff/Admin

Normal sign-in as the supplied Development Staff/Admin account succeeded. The user had the actual `admission.read` and `admission.review` capabilities and could access Admissions, the synthetic cycle, the factual funnel, follow-up queue, application detail, and task actions.

The normal B18 public PPDB form created one synthetic application, `QA Applicant B23 Followup`, in canonical `submitted` state. The cycle dashboard showed total 1 / submitted 1, with under-review, accepted, rejected, withdrawn, and converted all 0. No conversion percentage appeared. The B18 stage history had one submission event and did not inflate the funnel.

The follow-up panel showed the active task, eligible same-school synthetic QA staff assignee, due time, bounded outcome, and append-only history. Two earlier tasks remained completed and auditable; exactly one task is open. Completing follow-up left B18 application status `submitted`.

## Lifecycle, replay, and concurrency

- Exact request replay reused its result and did not add a task/activity.
- Reusing a request identity with a changed payload returned safe conflict copy and made no state change.
- A second open task was denied; a new task was allowed after completion.
- Duplicate completion replay did not duplicate completion activity.
- Two near-simultaneous distinct first-task requests were sent through the authenticated server-function boundary while no task was open. Exactly one task was created; the competitor received the safe active-task conflict; no unique-constraint details or partial state appeared.
- A tampered assignee UUID was rejected with safe user-facing copy; existing task ownership/version and history remained unchanged.

## Persona authorization

- Teacher: actual capability inspection showed no `admission.read` or `admission.review`; Admissions navigation and internal detail/task controls were unavailable.
- Parent: no admissions/follow-up navigation or synthetic application/task data was exposed; guessed detail access returned a safe unavailable result.
- Student: same denial boundary as Parent.
- Anonymous: staff detail redirected to `/auth`. The public PPDB submission flow remained separate and functional.

Forced RLS, direct table grant revocation, RPC capability checks, and automated security contracts were also verified. The test did not claim a successful browser-side raw table write attempt.

## Localization, theme, responsive, accessibility

- Indonesian and English were exercised on the funnel, queue, follow-up states, outcomes, labels, and explanatory copy. `document.documentElement.lang` and stored locale updated and survived refresh.
- Light and Dark preference changes persisted across refresh.
- At 375, 768, and 1440 CSS pixels, representative B23 pages had no page-wide horizontal overflow; controls and labels remained usable.
- Keyboard focus was visible; dialog title/description, labels, and accessible button names were present. Initial Escape testing found that focus fell to the body after closing the dialog. A narrow fix returns focus to the follow-up panel; post-fix retest verified the dialog closed and `#b23-followup-panel` received focus. Practical accessibility review only; no formal WCAG claim.

## Console and network

A fresh reload of the authenticated synthetic application detail after the focus fix produced no console errors, page errors, hydration errors, or failed network responses. The authorized happy path had no unexpected 401/403/500 and no duplicate command submission. Earlier invalid sign-in attempts created expected Auth 400 responses and a hydration warning on the sign-in route; they did not recur on the clean authenticated detail reload. These sign-in-attempt artifacts are not classified as a B23 follow-up regression.

## Development artifacts and safety

- B23 migrations applied/aligned: 2.
- Synthetic B23 cycle: 1.
- Synthetic B18 application: 1 submitted.
- Synthetic applicant and guardian support rows: 1 each, with required consent/submission history.
- New staff/profile/auth/membership/access rows: 0; existing synthetic QA staff topology reused.
- B23 follow-up tasks: 3 (2 completed, 1 open).
- B23 activities: 9; command records: 9.
- Production migrations/data mutations: 0.
- External messages: 0; payment transactions: 0; provider credentials: 0.
- QA Auth inventory: 21 identities inspected; 4 B23 persona accounts normalized for the shared Development QA credential after initial login failure; 0 unresolved. Credential omitted.

## Residual limitations

- No safe eligible staff or published application in a second school was available for a true live cross-school resource/assignee request. No extra school was created. Composite ownership, forced RLS, RPC checks, tampered-ID tests, and automated contracts remain passing.
- The concurrent first-task creation race was directly exercised. A live race between reassignment and completion was not directly executed; row-version and locking contracts plus duplicate completion replay were verified.
- Existing B18 detail summary has some legacy English strings in Indonesian mode; B23 follow-up UI itself is localized. This was not expanded into a B18 rewrite.

## Production safety

Production Auth/database were not touched. No external message or payment operation occurred. No provider credentials were added.
