# Batch 28 Browser UAT Report

## Final security-boundary closure (2026-10-06) — current result

**Security closure: PASS.** This section supersedes the earlier incomplete security-boundary conclusions below; those entries remain as historical attempts.

- The authenticated School A operator was `B14 Isolated QA principal`, with active School A context `SD EduSmart Indonesia`. The one authorized foreign-school fixture was created through the normal UI in `B19 Concurrency QA School`; it remains `NEW`.
- School A Leads list isolation: the foreign fixture name and reserved test contact were absent. No foreign-school row, activity, or linked application appeared.
- Direct access used the authenticated `getAdmissionLead` server projection. It returned the safe “This admissions inquiry is unavailable.” response; foreign lead name, contact, status, source, owner, next action, activity, linked application, and school details were not returned.
- Cross-school duplicate advisory used the authenticated `findAdmissionLeadDuplicates` projection with the foreign fixture’s synthetic contact value and School A scope. Result candidate count: **0**; no foreign-school name/contact/lead/school identifier was exposed. Same-school duplicate advisory remains supported by the earlier successful browser evidence.
- Parent (`B14 Isolated QA parent`), Teacher (`B14 Isolated QA teacher`), and Student (`B14 Isolated QA student`) each logged in normally and received the B28 workspace access-denied state. No B28 lead projection request was issued for these personas; visible lead, contact, activity, assignment, next-action, and duplicate data counts were **0** for each.
- Exact linked Development totals after closure: **15 leads**, **41 activities**, **2 converted leads**, **2 leads linked to B18 applications**. The closure added **1** synthetic foreign-school lead and its **1** `CREATED` activity; it created **0** B18 applications and changed **0** Auth users. The prior successful UAT application remains included in the total of 2.
- Migration parity: **106 local = 106 remote**. No source, test, configuration, or migration file changed during this closure. Existing engineering evidence remains focused 28/0, full 724/0, TypeScript/changed-scope ESLint/Prettier/build/validators PASS.
- Production mutations, external provider calls, external messages, and real payments: **0**.

**Release decision: READY FOR PR. BLOCKER 0; HIGH 0.** The shared Playwright history includes expected adversarial denial responses and two initial malformed harness probes; the successful foreign-school checks used the correct authenticated server-function headers and returned the safe results recorded above. The separately captured authorized happy-path console/network evidence remains the accepted clean capture.

## Latest final-UAT evidence (2026-10-05)

**Current decision: INCOMPLETE — NOT READY FOR PR.** The existing authenticated Admissions session completed the fresh-state probe and the main lifecycle through B18 conversion. The required foreign-school and Parent/Teacher/Student denial evidence is still missing, so the browser HIGH remains open. No commit or push was made.

- Fresh-state probe before this run's mutations: existing synthetic `CONTACTED` lead, Qualify action visible, active school matches the lead, membership/capability projection valid, and both assignment and next-action controls enabled immediately and after five seconds with no command request in flight. Previous disabled-control report was a QA session/runner synchronization artifact; no product UI-state defect was demonstrated.
- Reused an existing synthetic lead; created no lead. Its pre-existing bounded note was visible in activity history; no duplicate note was added. Existing same-school assignee was visible and persisted on reload; no assignment mutation was needed.
- Set next action in the UI. The date-time persisted after reload; the browser displayed the expected local-time conversion. The initial assertion compared the submitted wall-clock text to the normalized display string and timed out, a test assertion mismatch rather than a failed save.
- Advanced the same lead from `CONTACTED` to `QUALIFIED`, then used the conversion review with an open B18 cycle, valid grade, synthetic guardian details, and the existing `staff_entry` consent contract. One conversion was submitted. The lead reached terminal `CONVERTED`, showed conversion activity, and exposed one formal-application link.
- Opened the linked B18 application: it is in `Submitted` state, not accepted. The conversion review explicitly states it does not accept a student or create student/enrollment records; no direct B28 SIS creation path was observed.
- English and Indonesian were observed. Dark and Light themes were observed. At 375, 768, and 1440 CSS-pixel widths, document/body widths remained within the viewport and the critical formal-application action remained visible. Keyboard checks covered search/filter focus traversal, Shift+Tab, and Space activation of a lead row.
- Anonymous direct-route check redirected to `/auth` and exposed no lead/pipeline/contact content.
- Clean instrumented fresh Admissions page capture: workspace and converted lead/formal-application link loaded; 230 responses were HTTP 200; request failures 0; page errors 0; console errors 0; warnings 0; unexpected 401/403/500 responses 0; Midtrans requests 0; external provider requests 0. One expected Supabase auth user check occurred. Payload inspection did not expose credentials, tokens, or service-role values in the inspected authorized projection.
- Same-school duplicate advisory is retained from prior valid browser evidence; no duplicate fixture was created. Foreign-school direct denial and cross-school duplicate oracle were not re-exercised because no authorized School B lead identifier/school context was available in this session. Parent, Teacher, and Student denial flows were not run; no credentials were reset in this run.
- Visible pipeline totals after conversion: New 8, Contacted 3, Qualified 1, Converted 2, Closed 0 (14 leads in the active school). The final UAT added 0 leads and 1 linked B18 application. Next-action, qualification, and conversion history were visible; an exact Development-wide activity-table total was not established through the supported read-only UI path.
- Product source and migrations were not changed by this UAT. Existing engineering evidence remains focused 28/0, full 724/0, TypeScript/ESLint/Prettier/build/validators PASS, and migration parity 106=106. Development QA Auth normalization 21/21 is Product-Owner reported; no Auth change was made during this UAT. Production mutations, provider calls, external messages, and payments: 0.

**Release gate remains HIGH / INCOMPLETE.** Required remediation: perform School B denial/no-oracle checks using an authorized existing foreign-school synthetic record and complete Parent/Teacher/Student denial flows using the existing normalized accounts. Do not infer these browser gates from the database validator alone.

## Final security-boundary closure attempt (2026-10-06)

- The existing browser page remained authenticated to the Admissions workspace. The active School selector exposed only `SD EduSmart Indonesia`; no second school or known foreign-school lead identifier was available through the current product context. No foreign identifier was guessed and no lead lookup/mutation was attempted.
- Parent, Teacher, and Student denial were not exercised because no authenticated browser session for those personas was available. No credentials were entered or repaired, and no role, membership, capability, Auth, or Development data was changed.
- Development mutations in this boundary-check attempt: 0. The foreign-school denial/oracle and three persona-denial gates remain **UNVERIFIED**; release remains **HIGH / INCOMPLETE**. No commit or push.

## Read-only Development count and persona follow-up (2026-10-06)

- A read-only Supabase Management API aggregate query against the linked Development project recorded **14** B28 leads, **40** B28 activity rows, **2** converted leads, **2** leads linked to B18 applications, and **106** remote migration versions. Local migration files also count to 106.
- School grouping showed all 14 B28 leads belong to the active `SD EduSmart Indonesia` school. Other QA schools returned by the aggregate had 0 B28 leads. This is **not** a direct foreign-ID denial or duplicate-oracle test; no foreign B28 lead/contact fixture exists in Development to exercise those checks.
- One normal login attempt was made for each existing synthetic Parent, Teacher, and Student persona in isolated browser contexts. Each remained on the auth route; no B28 route was reached and no lead data was returned. These persona-denial gates remain **UNVERIFIED** because authentication did not complete. No password was reset and no Auth, membership, capability, role, or product data was changed.
- Exact activity count is now recorded: **40**. Development mutations during this security/count follow-up: **0**. Release remains **HIGH / INCOMPLETE**; no commit or push.

## Decision

**INCOMPLETE — not ready for PR.** Local Playwright and normal synthetic admissions login work, but the full browser UAT matrix was not completed.

## Captured evidence

- Runtime: B28 worktree Vite on localhost; local headless Chrome/Playwright.
- Authentication: normal UI login succeeded after the hydrated form became interactive. The account was an existing synthetic Development admissions operator with the lead-management capability.
- Workspace: authenticated Admissions inquiry workspace rendered in Indonesian.
- Lead create: PASS in the exercised flow.
- Same-school duplicate advisory: PASS; creation remained available after review.
- Status: NEW→CONTACTED and CONTACTED→QUALIFIED were accepted in the exercised flow.
- Note: one earlier run observed a note appended; the latest replay stopped before confirming the note result.
- Assignment and next-action controls: visible in an earlier run; mutation results were not conclusively recorded.
- Browser checks from captured runs: page errors 0; console errors 0; failed requests 0; unexpected 401/403/500 0; direct browser Midtrans requests 0; detected secret leakage 0.
- Final stable-runner retry: normal UI login and the Indonesian Admissions workspace both passed; captured page errors, console errors/warnings, failed requests, unexpected HTTP statuses, Midtrans requests, and detected browser-secret leakage were all 0.
- The selected authorized school had no existing unconverted `QUALIFIED` synthetic lead. The runner stopped before note, assignment, next-action, or conversion actions to respect the mutation budget; no lead, activity, or application was created in this final attempt.

## Not verified

- Full conversion review and final link to the B18 application in a complete browser run.
- English localization and Dark theme.
- Responsive widths 375/768/1440 and page overflow.
- Practical keyboard/focus traversal and dialog behavior.
- Anonymous direct-route denial.
- Foreign-school lead denial and absence of a duplicate-existence oracle.
- Parent, Teacher, and Student CRM denial.
- Complete final happy-path console/network/payload accounting for all of the above.

The temporary runner first waited for a nonexistent button label where the UI exposes a heading; after that selector was corrected, a subsequent run reached qualification but ended before recording the remaining steps. These are test-harness results, not grounds to claim the remaining product gates passed.

## Mutation accounting

- Synthetic Development leads created by browser reruns in this resumed verification: 8.
- Development database totals observed after those runs: 14 leads and 32 append-only activity rows, including earlier B28 QA data; one lead is linked to one B18 application.
- New B18 application confirmed in this verification: 0.
- Synthetic Development account credential repairs during this resumed verification: 4; cumulative earlier B28 QA repairs were not independently reconciled.
- Additional synthetic credential repairs in the final stable-runner attempt: 4 (one Admissions operator and three existing persona candidates). Their persona browser-denial checks did not run. Across the two most recent resumed attempts, 8 repairs are observed; earlier B28 repairs remain unreconciled.
- Final stable-runner attempt additions: leads 0; activities 0; B18 applications 0. Observed totals remain 14 leads, 32 activities, and one lead linked to one B18 application.
- Development Auth changes outside synthetic QA maintenance: 0.
- Production changes, provider calls, external messages, payments: 0.

## Final synthetic-fixture closure attempt

- The stable Playwright runner authenticated normally as the existing synthetic Admissions operator and loaded the Indonesian Leads workspace. Captured page errors, console errors/warnings, failed requests, unexpected statuses, Midtrans requests, and detected secret leakage were all 0.
- The runner stopped in the lead-workspace phase before confirming the normal UI create action. Its safe output recorded only a generic `Error` and did not retain the action/selector detail. No lead, activity, or application was created; the one authorized synthetic fixture remains unused.
- This attempt did not verify note, assignment, next action, conversion, English/Dark, responsive, keyboard, anonymous, foreign-school, or Parent/Teacher/Student denial flows.
- One existing synthetic Development Admissions credential was repaired for this attempt so the normal UI login could be performed. No other persona credentials were changed in this attempt.
- Current observed Development totals remain 14 leads, 32 activities, and one lead linked to one B18 application. Product data additions in this attempt: 0.

**Decision remains INCOMPLETE — not ready for PR.** The browser release gate remains HIGH until the normal UI fixture creation and remaining required browser checks are completed.

## Follow-up create-step diagnosis

- The earlier create-step harness failure was caused by asserting that the Create button must be enabled before required fields were filled. The UI correctly disables it in the empty form; this was a test-harness validation mistake, not evidence of a product defect.
- After correcting that check, the next runner stopped at `CHECKPOINT_04_LEAD_WORKSPACE_READY`. A read-only preflight query to the B28 lead table through the runner's service-role REST helper returned HTTP 403 before it inspected the create control. No create click/request was issued and no lead/activity/application mutation occurred in this attempt.
- This is a harness access-method failure. Lead discovery must use the authenticated school-scoped UI/server projection rather than the denied direct REST query.
- One existing synthetic Admissions credential repair was performed for this attempt. The runner exited after the preflight failure, so this ephemeral credential cannot be reused. No Parent/Teacher/Student credential changes occurred.
- Current observed totals remain 14 leads, 32 activities, and one linked B18 application.

The required single persistent end-to-end browser session was not completed. Browser UAT remains **HIGH / INCOMPLETE**; no release claim is made.

## Final runner attempt

- Last successful checkpoint: runner setup and existing synthetic operator selection.
- Failed checkpoint: `CHECKPOINT_01_LOGIN_PAGE_READY` while navigating to `http://127.0.0.1:5191/auth`.
- Failure category: local runtime unavailable. Chromium reported `net::ERR_CONNECTION_REFUSED`; the login page did not load and no authenticated application request fired.
- One existing synthetic Admissions credential repair was performed before navigation. The runner exited, so the temporary credential was lost. This consumes the one repair authorized for this attempt; no further reset was performed.
- Product-data mutations: 0 leads, 0 activities, 0 applications. Development totals remain 14 leads, 32 activities, and one linked application.
- The runner was accidentally executed by a Bun command intended as a syntax check. No source or database authorization changes were made. Final browser closure remains incomplete.

## Credential-free runtime and persistent-run evidence

- Port 5191 was verified reachable, its listener command line was verified to reference the B28 worktree, and `GET /auth` returned HTTP 200 with expected form markers.
- A separate credential-free Playwright probe successfully navigated to `/auth`; hydrated email/password inputs were visible, enabled, focusable, and the password control was type `password`; page errors: 0.
- The full runner was started after removing direct B28 lead-table REST preflight calls. It remains active, but the terminal wrapper did not preserve an interaction/output handle or final JSON/checkpoint output. The final lead state and any product-data mutations therefore cannot be verified from this attempt.
- The runner code performed one authorized existing synthetic Admissions credential repair. Its temporary credential remains only in the active process; no further repair or browser rerun was performed.
- Release decision remains **INCOMPLETE / NOT READY FOR PR**. No commit or push was made.

No credentials, tokens, cookies, or storage-state values are included in this report.

## Durable final UAT retry

- Runtime verification inside the durable runner passed: TCP/HTTP access to `127.0.0.1:5191`, `/auth` returned HTTP 200, browser navigation succeeded, and hydrated email/password controls were visible and enabled before the single authorized synthetic Admissions credential repair.
- Normal UI authentication and the authenticated B28 Leads workspace passed. The runner found and reused a visible synthetic lead; no lead was created.
- The runner confirmed the note was visible after the normal UI note action. It timed out while locating/filling the next-action control: `nextActionControl=false`; the reportable failure class is a Playwright selector/postcondition timeout. Assignment control was visible, but assignment persistence was not confirmed. No conversion or application was attempted.
- Durable evidence is in `D:\edusmart-temp\b28-playwright\final-run\` (`runner.log`, `result.json`, `stdout.log`, `stderr.log`). The runner exited with `status=failed`; its last safely recorded checkpoint was `CHECKPOINT_06_REUSABLE_LEAD_SELECTED_OR_CREATE_OPENED`. It did not retain sufficiently granular action checkpoints to prove the exact failing control beyond the captured `nextActionControl=false` state.
- Captured login/workspace happy-path counters: page errors 0, console errors 0, console warnings 0, failed requests 0, unexpected statuses 0, Midtrans requests 0, detected secret leakage 0. These do not constitute the required fresh final-path capture.
- Mutation accounting for this attempt: leads created 0; applications created 0; one note was visibly added; assignment may have been attempted but its persistence and exact activity delta were not verified. The starting aggregate (14 leads, 32 activities, 1 linked application) is therefore not updated to a new exact activity total. Admissions synthetic credential repairs in this attempt: 1. No other persona repair occurred.
- Final UAT remains **INCOMPLETE / NOT READY FOR PR**. No source change, commit, or push was made. The one authorized Admissions repair for this attempt has been consumed; no further credential reset was performed.

## Assignment selector correction and resumed run

- The earlier `NEXT_ACTION_CONTROL_LOOKUP_OR_FILL` interpretation is corrected: execution had stopped at the assignment postcondition, which incorrectly queried `select[aria-label="Penanggung jawab (opsional)"]`. The control is labelled through `Label htmlFor`/`id`; this was a QA harness selector defect. The runner selector was changed to use the label-associated locator. No product or accessibility defect was demonstrated by that selector mismatch.
- In the subsequent run, runtime health, hydrated login, normal Admissions login, workspace load, visible synthetic lead reuse, and prior note visibility passed. The lead detail showed the Qualify action, consistent with `CONTACTED` state.
- The corrected run stopped at `ASSIGNMENT_CONTROL_ENABLED_CHECK`: the visible assignee control was disabled before selection. No assignment selection/request, next-action interaction, lead creation, new note, or application creation occurred in this run. Source inspection shows the assignee and next-action controls are disabled when the actor lacks `admission.lead.manage`, a lead mutation is pending, or the lead is `CLOSED`/`CONVERTED`; this run did not capture which condition applied. Product defect classification is **UNDETERMINED** pending permission/current-school-context evidence.
- No next-action control was inspected during this run. Assignment, next-action, qualification, conversion, and the remainder of the browser matrix are still incomplete. This run performed one synthetic Admissions credential repair; no other persona repairs were made. No Development product mutation occurred in this run.
- The corrected runner stopped with **HIGH / INCOMPLETE**. No product source change, commit, or push was made. No further credential repair or browser run was performed.
