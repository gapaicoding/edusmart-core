# EduSmart Batch 24 — Browser UAT Report

## Runtime

- Runtime started from `D:\edusmart-worktrees\edusmart-core-b24` with Vite on `http://127.0.0.1:8080`; it was stopped after UAT and report checks.
- Playwright browser automation was available. The earlier CUA inventory returned no browsers, but Playwright MCP provided a browser surface.
- Finance and Parent browser checks used the B24 worktree and Development project.

## Staff/Admin

**Historical initial result: PARTIAL.** The B14 synthetic Principal authenticated normally after the supplied password failed and the Development identity was normalized through the official Supabase Auth admin API. The app showed the PRINCIPAL · SCHOOL context and loaded the Finance projection, demonstrating effective Finance authorization for its active Demo school scope; it had no invoices. Thus Finance navigation/projection and scoped capability access passed, but B24 invoice-detail/status rendering and staff action keyboard use were not available to exercise. Development Finance RPC behavior also passed on an existing Finance-capable synthetic QA actor: scoped projection succeeded, wrong-school scope was denied, and deterministic event ingestion/settlement succeeded. Later final-staff evidence below supersedes this initial browser status.

An attempt to add the minimum Development-only organization membership, school-access row, and school-scoped Principal grant for the existing synthetic Principal in the B19 QA school was rejected by execution policy. No fixture rows were written. That approach was abandoned; final staff fixture was created inside the Principal's existing authorized school through supported flows.

## Parent

**PASS for linked-parent flow.** Reused the authenticated synthetic QA Parent identity and added the minimum Development-only guardian/relationship/membership fixture for one existing synthetic B19 student. Parent billing showed linked-child invoices only. Parent created an intent through the authenticated application server function; amount was the server-derived outstanding IDR 250,000. Parent saw settled, failed, review-required and unpaid/outstanding states. Provider internals were absent from the Parent view. The listed B14 Parent authenticated but had no linked child and saw an empty billing view.

## Unauthorized Personas

- Anonymous: **PASS.** `/portal/billing` redirected to `/auth`; no invoice content appeared; protected B24 status function was denied.
- Parent acting as Finance staff: **PASS.** Staff intent listing and event simulation were denied. Direct authenticated B24 table read and intent insert returned permission-denied (`42501`).
- Teacher/non-Finance staff: **PASS.** Authenticated B14 Teacher had no Finance navigation; direct `/finance` rendered the safe no-access state.
- Student: **PASS.** Authenticated B14 Student had no Finance navigation; direct `/finance` rendered the safe no-access state, consistent with B19 billing policy.
- Foreign-family invoice: **PASS.** B14 Parent called the app's `getParentOnlinePaymentIntent` server function for an actually issued invoice from the separate B19 synthetic QA school and received the same safe unavailable response as an invalid ID. No invoice or intent data was returned.

## Payment Intent UX

**PASS for Parent flow.** The Parent server function created an intent for the eligible linked invoice, displayed pending status, and replayed the same request to the same intent. A changed invoice under the same request ID returned a safe conflict. Two overlapping create calls for one invoice returned the same single active intent. No B19 payment was created by intent creation.

## Settlement/Reconciliation UX

Parent billing reflected the final canonical B19 state. Live Development RPC cases covered pending event, duplicate pending replay, conflicting event fingerprint rejection, settlement, duplicate settlement replay, a different event ID reusing the same settlement reference, stale pending/expired events after settlement, expiry, failure, manual-payment conflict, concurrent duplicate settlement, and concurrent settlement/expiry. The staff Finance detail panel was not exercised because the authenticated Finance Principal's school had no invoices.

## Localization

**PASS.** B24 labels and lifecycle states displayed in Indonesian and English. Browser QA found and corrected a translation-helper mismatch; B24 components now use the app preference message catalog. The Parent screen showed localized labels rather than translation keys.

## Light/Dark

**PASS.** Settings switched the app between light and dark themes. In dark mode the root applied the semantic dark theme and the page used dark background/light foreground tokens; light mode restored the light theme.

## Responsive

**PASS.** At 375, 768, and 1440 CSS px, the billing page and online-payment sections had no horizontal overflow. Status/reference wrapping stayed within the panels.

## Accessibility

Practical checks: B24 panels use labelled sections/headings, lifecycle messages are visible text and use a polite live region, and controls have translated accessible names. Keyboard Tab on the Finance page showed a visible 1.6px focus outline on the navigation link. No dialog is used in B24. No formal WCAG certification is claimed. Finance action-button keyboard behavior remains untested because no invoice row rendered.

## Console / Network

No new errors appeared on the final authorized browser route. The historical console log contains two expected 403 direct-table denials, two expected 400 login failures before password normalization, and one transient Vite/React startup warning that did not recur after reload. The foreign-invoice status call returned a safe application response without a console error or mutation.

## Security Negative Tests

- Parent status lookup for an invalid invoice ID returned the same safe unavailable message.
- B14 Parent lookup of a real issued invoice in a different synthetic school returned the same safe unavailable message.
- Parent staff projection and event simulation calls were denied.
- Parent direct read of provider events and direct insert into B24 intents were denied.
- Anonymous Parent billing and B24 status calls were denied.
- Finance actor read for an unauthorized school was denied by the existing Finance capability boundary.
- The B14 Principal's active school had no invoices, preventing positive B24 staff-detail rendering despite verified Finance authorization.

## Mutation Accounting

- Development migrations applied: 1 (`20260929110000_b24_online_payment_reconciliation`).
- Synthetic B24 payment intents: 7.
- Synthetic provider events: 11.
- Synthetic reconciliation records: 5.
- Canonical B19 records created during QA: 3 total — 2 online-provider payments (IDR 500,000) and 1 B19 manual cash payment (IDR 100,000).
- Synthetic invoices created: 0.
- Synthetic fixture rows: 1 guardian, 1 guardian-student link, 1 organization membership, 1 school-access row, and 1 scoped Parent role grant.
- Additional Development Auth mutations: official Supabase Auth password normalization for the synthetic Principal and Teacher identities after the supplied password was rejected; no Auth users were created/deleted and no credentials were stored in reports.
- Production migrations/data mutations: 0.
- Real payment, QRIS, and Virtual Account transactions: 0.
- External payment-provider calls: 0.
- Provider credentials introduced: 0.

## Residual Limitations

Finance Staff authorization, invoice detail, scoped B24 read, and intended no-intent state pass in the Principal's existing school. The panel has no intent-creation operation by design; event controls are correctly unavailable without an eligible pending intent. Authorized B24 lifecycle commands are covered separately through live Finance-capable Development RPC evidence. Teacher, Student, linked Parent, foreign-family denial, and anonymous checks passed. Final-source production build passed with a fresh D: copyfile install. Browser event-control activation for the no-intent fixture is a non-defect applicability note.

## Remaining Staff UAT

Historical handoff superseded by the Final Finance Staff Remediation and Final Release-Gate Reassessment above. The Staff no-intent state is expected; no additional identity or fixture is required.

## Earlier UAT History

The first report recorded browser unavailable, no linked guardian, and no live B24 lifecycle data. Recheck found Playwright MCP was available and a synthetic Parent identity could be linked safely in Development. Those earlier observations are retained here as history; the current evidence above supersedes them for Parent/browser and live lifecycle coverage.

## Final Finance Staff Remediation — 2026-09-29

This section supersedes earlier statements that the Finance Principal's school had no invoices. The Finance Principal's existing-school capabilities were confirmed from the live session context, including `finance.read`, `finance.issue`, `finance.manage_billing`, and `finance.record_payment`. Reused an existing active synthetic enrollment and created through supported Finance UI flows: one fee definition, one billing plan, one immutable plan version, and one issued invoice (`INV-2026-09-000001`). No Student, Enrollment, guardian, membership, school-access, or role rows were added. The invoice detail showed IDR 10,000 total and outstanding, zero paid, and issued/unpaid status.

The B24 staff panel rendered and its authorized invoice-scoped intent-list request succeeded. It displayed the localized no-intent state and exposed no provider payload or secrets. Source and the approved scope define intent creation as Parent/relationship-driven; Staff may read scoped intent status and simulate deterministic Development events only for an existing pending intent. No-intent is therefore the correct Staff state, and event-control activation is not applicable here. Finance Staff browser authorization, invoice detail, scoped read, and no-intent state **PASS**. Independently, the permitted event/reconciliation lifecycle was exercised through an authenticated Finance-capable Development server/RPC boundary. No authorization or topology was broadened to manufacture a browser action.

The detail page initially emitted a hydration error because a badge `<div>` was nested in a `<p>`. The wrapper was changed to a `<div>`. A fresh post-fix page showed zero console errors. Keyboard Tab showed a visible 1.6px focus outline. Indonesian and English invoice/B24 copy were checked. Light and dark themes were checked. At 375, 768, and 1440 CSS px, document width equaled viewport width with no horizontal overflow. No staff event button existed to keyboard-activate.

Development mutation counts for this final staff fixture: 1 fee definition, 1 billing plan, 1 plan version, 0 explicit plan target rows, 1 issued invoice, 0 intents, 0 provider events, 0 reconciliations, and 0 canonical B19 payments. Existing student/enrollment records were reused. Production/Auth/provider/financial side effects: 0.

Build evidence after the markup change: primary and earlier clean-room attempts failed with Windows `EBUSY` during Nitro `tslib` tracing. A fresh exact-source D: verification copy installed frozen dependencies with Bun `--backend=copyfile`; the serial production build completed, Nitro traced `tslib`, and generated `.output/nitro.json` without EBUSY. This is final-source production build **PASS**.

## Final Release-Gate Reassessment — 2026-09-29

The Staff lifecycle-action HIGH was not a product requirement: Staff intent creation is intentionally absent, and event simulation requires an existing pending intent. The authorized no-intent invoice detail is the expected reachable Staff browser state; its Finance-scoped read and presentation pass. Finance-capable lifecycle commands have separate live authenticated Development RPC evidence. Browser event-control activation is **NOT APPLICABLE** for this fixture, not an unexecuted required action. The final exact-source production build also passes in the fresh D: copyfile verification directory. No source changes were made for build remediation.

Final Staff browser/action finding: **CLOSED / no HIGH**. Overall unresolved BLOCKER: 0; unresolved HIGH: 0. The no-intent Staff state meets the implemented contract; no Staff create-intent button was clicked or claimed.
