# EduSmart Batch 26 — Browser UAT Report

## Runtime

Development Vite runtime: `http://127.0.0.1:5181/`, run from the B26 implementation worktree. The server was stopped before the serial production build. No Production site was used.

## Staff Readiness Surface

An existing synthetic School Admin signed in through the normal UI. The school-scoped Pilot Readiness navigation and route appeared, and the live report loaded. Observed overall state: `WARNING`; counts shown included 16 ready checks, 3 warnings, 0 blockers, and 2 manual fallbacks. Refresh returned current canonical aggregates.

## READY / WARNING / BLOCKER / MANUAL_FALLBACK

The live synthetic Development report exercised `WARNING` and `MANUAL_FALLBACK`. Pure engine tests exercise `READY`, `WARNING`, `BLOCKER`, and `MANUAL_FALLBACK`, as well as aggregate precedence. A live synthetic school state for `READY` and `BLOCKER` was not produced; no shared fixture was destructively changed.

## School Scope

The server request selected the active school and verified scoped capability. A Teacher without readiness capability saw the denial state. Direct requests using a valid foreign-school identifier and an unknown UUID produced the same safe unavailable error. No foreign-school readiness facts were returned.

## Minimal Data Exposure

The authorized readiness response and visible page were inspected. They contained safe school display metadata, aggregate counts, check/action/status codes, route hints, and generated time. No student/guardian names, personal contact fields, invoice/payment detail, application body, or auth identity appeared in the readiness projection.

## Navigation / Action Links

Readiness is placed under the existing School Operations navigation group and shown only when the capability is present. The page has a refresh control and setup links; no repair or mutation controls are present.

## Manual Payment Fallback

UI reported online payment as `MANUAL_FALLBACK`, directing operators to the existing B19 manual payment path. No payment was created or processed.

## Communication Fallback

UI reported external delivery as `MANUAL_FALLBACK`, directing operators to B20 in-app communication. No message was sent externally.

## Teacher Boundary

Teacher login succeeded. The Pilot Readiness nav item was absent, direct route displayed the access-denied state, and direct B26 server calls with same-school, foreign-school, and unknown school IDs returned safe denial. **Pass for Teacher.**

## Parent Boundary

An existing synthetic Parent signed in through the normal UI. The readiness nav item was absent, direct `/pilot-readiness` navigation displayed the access-denied state, and direct server-function invocation using the real Development school ID returned `PILOT_READINESS_UNAVAILABLE`. No readiness facts were returned. **Pass for Parent.**

## Student Boundary

An existing synthetic Student signed in through the normal UI. The readiness nav item was absent, direct `/pilot-readiness` navigation displayed the access-denied state, and direct server-function invocation using the real Development school ID returned `PILOT_READINESS_UNAVAILABLE`. The same denial applied to an unknown ID. No readiness facts were returned. **Pass for Student.**

## Anonymous Boundary

Anonymous protected-route navigation redirected to `/auth`; no readiness data was observed. The existing generic Vite `/auth` preference-provider/hydration message remains a known unrelated low-severity issue. No B26 data was exposed.

## ID / EN

Indonesian was observed on the authorized report. English was selected and representative title/status/fallback strings rendered without raw translation keys.

## Light / Dark

Authorized surface was inspected in dark mode with status text visible; light mode was previously seen during the initial authorized session. Full contrast/accessibility validation in both themes remains limited.

## Responsive

The authorized readiness-card surface was measured at each target width. The page had no horizontal overflow; the summary, domain checks, status labels, action links, refresh, and fallback content remained present.

| Viewport | Document scroll width | Body scroll width | Visual result                                                                                                                                         |
| -------: | --------------------: | ----------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
|      375 |                   360 |               360 | Header controls stack; title/summary wrap; summary count cards form two columns; domain cards remain in viewport with normal vertical page scrolling. |
|      768 |                   753 |               753 | Content fits without page-wide horizontal scrolling; cards and action links remain reachable.                                                         |
|     1440 |                  1425 |              1425 | Main content is centered within the shell; domain cards use a two-column layout; no accidental overflow.                                              |

## Accessibility

The page has one H1 (“Kesiapan pilot sekolah”) and section H2s (“Ringkasan kesiapan”, “Pemeriksaan per domain”). Refresh is named “Perbarui pemeriksaan”; setup links are named “Tinjau pengaturan” and point to the relevant existing route. Ready, review-needed, blocker, and manual-fallback statuses are rendered as text, not color alone. Fallback explanations are plain text.

Keyboard traversal reached the mobile navigation, notifications, account menu, organization/school/year/term selectors, Refresh, and all visible setup links. Focus-visible styling was present on the 29 interactive controls in the traversal (the observed wrap also passed through the document body). Enter activated Refresh and a representative setup link; Refresh updated the generated time, and the setup link navigated to `/settings`. No keyboard trap was observed. The page uses no dialog, so there is no dialog focus-return case. This is a practical check, not a formal WCAG certification.

## Console / Network

After clearing local/session storage and accessible cookies, a fresh authorized sign-in loaded Pilot Readiness and executed one manual Refresh. Console query: 0 errors, 0 warnings, one informational React DevTools notice. No page error was observed. Six relevant non-static application/auth requests were captured during the route and refresh accounting; all returned HTTP 200. Failed requests: 0. Unexpected 401/403/500: 0. Repeated readiness request loop: 0; one initial projection and one explicit Refresh projection were observed. The existing anonymous `/auth` hydration issue is outside this authorized happy path.

The readiness response was inspected from the actual refresh request. It contained school ID/display name, overall status, timestamp, aggregate summary, domain/check/action/status codes, safe counts, and route hints. Structured response inspection found zero email/phone values and zero prohibited PII/security field names (student/guardian name, contact, invoice/payment detail, application payload, auth token/password, provider destination). Response size was approximately 6.3 KB. Readiness projection is a read-only GET; no product mutation request was made by page load or Refresh.

## Security Negative Tests

- Teacher route and direct server denial: observed.
- Foreign and unknown school ID equivalent denial: observed.
- Parent and Student route and direct server denial: observed.
- Authorized response payload minimization: observed.
- Authenticated anonymous/raw direct RPC persona matrix: not fully exercised.

## Cross-Domain Acceptance Evidence

The authorized aggregate surface evaluated existing data only. No record was created or changed.

| Domain                                 | Live result                                                                                          | Existing workflow/fallback                                    | Mutation |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------: |
| SIS / Academic                         | 1 active year, 1 term, 18 classrooms, 54 active enrollments; 53 placements and an associated warning | Academic, student, and classroom setup                        |        0 |
| Teacher operations                     | 31 active assignments                                                                                | Teaching assignments                                          |        0 |
| Student portal prerequisites           | 3 linked active enrollment/account rows; Student readiness access denied                             | Existing Student path; no school-wide readiness data returned |        0 |
| Parent/Guardian prerequisites          | 41 active guardian links; Parent readiness access denied                                             | Existing Guardian/Parent path                                 |        0 |
| Admissions / B23                       | 1 open cycle, 1 open follow-up                                                                       | Admissions and follow-up                                      |        0 |
| Finance / parent billing prerequisites | 1 fee definition, 0 billing plans; counts only                                                       | B19 manual billing/payment path                               |        0 |
| In-app Communication                   | 7 published announcements                                                                            | B20 Communication Center                                      |        0 |
| Online payment                         | `MANUAL_FALLBACK`                                                                                    | B19 manual payment; no online gateway claim                   |        0 |
| External communication                 | `MANUAL_FALLBACK`                                                                                    | B20 in-app announcement/notification; no provider claim       |        0 |

The live state variation was `WARNING` plus `MANUAL_FALLBACK`; deterministic engine tests cover `READY`, `WARNING`, `BLOCKER`, `MANUAL_FALLBACK`, and precedence. No live school was reconfigured to manufacture additional states.

## Mutation Accounting

The B26 readiness page is read-only and performed no product data changes. No synthetic fixtures, announcements, payments, messages, or provider requests were created by this browser run. One existing synthetic School Admin credential was normalized in Development Auth to enable UI login; no new account was created.

## Residual Limitations

Final authorized-surface responsive, accessibility, localization/theme, refresh, payload, and console/network checks passed. Parent, Student, and Teacher boundaries were previously exercised with existing synthetic accounts and are consolidated above. Development QA proves software behavior only and does not mean a real school accepted a pilot.

## Final Release-UAT Decision

**PASS.** The authorized readiness surface and requested final UAT evidence are complete. The synthetic workflow validates system support only; real school acceptance remains external and unclaimed.
