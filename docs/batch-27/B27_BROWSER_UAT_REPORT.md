# EduSmart Batch 27 — Browser UAT Report

## Runtime

The authorized UAT used local Playwright with headless Chrome against Vite from `D:\edusmart-worktrees\edusmart-core-b27` at `http://127.0.0.1:5189/`. Built-in browser automation was unavailable; local Playwright recovery passed. Earlier Finance submissions performed before React hydration did not dispatch the form. Waiting for the hydrated UI fixed the test path: the same existing synthetic Finance identity received Auth HTTP 200, stored its normal Supabase session, redirected to `/dashboard`, and opened the scoped Finance route. No product authentication source change was needed.

## UI Authentication Boundary Diagnosis

Read-only Development discovery inspected 20 reserved-domain synthetic QA accounts and found 9 active `finance.read` candidates; the first candidate passed, so no fallback account was needed. Direct Development Auth and the normal UI used the same Development project and public key. The failure was in the earlier automation timing: it submitted the server-rendered form before React hydration, so no submit event or Auth request occurred. After waiting for hydration, the normal form submitted once, Auth returned HTTP 200, the Supabase localStorage key was written, and the authenticated route loaded. The flow stayed on `127.0.0.1` throughout and used a fresh browser context with no cookies. This was an automation timing issue, not a Finance-account or product login defect.

## Parent QRIS Surface

**PASS** for normal UI login, linked-family billing, and the existing invoice view. Only the linked invoice was shown. Canonical outstanding amount displayed as Rp10,000. QRIS sandbox action, test label, no-real-money warning, provider-not-configured safe handling, and manual-payment guidance were observed. No fake QR or success state was shown.

## Sandbox Label

**PASS.** Visible `SANDBOX / TEST PAYMENT` and no-real-money wording were present. No Production or Virtual Account option was presented.

## Amount Integrity

**PASS.** The displayed amount matched the linked invoice’s canonical outstanding projection. The create action submits invoice/request identifiers; server code derives the amount. Browser payload inspection found no client-authoritative amount.

## QR / Instructions

Live Midtrans QR display: **NOT EXECUTED — sandbox credentials unavailable.** QR rendering/projection contract: deterministic test evidence. The provider-unavailable path did not display a fabricated QR.

## Expiry

Live QR expiry in browser: **NOT EXECUTED.** Expiry suppression/state mapping is covered by deterministic tests.

## Pending / Success / Expired

Live provider status transitions in browser: **NOT EXECUTED.** Deterministic state and reconciliation tests cover these contracts.

## Manual Payment Fallback

**PASS.** Parent guidance directs the family to the school-agreed manual-payment process. This page is read-only; manual settlement is staff-operated, so there is no Parent manual-payment control to activate by keyboard.

## Parent Cross-Family Boundary

**PASS.** Starting from the authenticated Parent billing view, the browser intercepted and substituted the actual `getParentMidtransQris` server-action invoice identifier with (1) an existing foreign-school synthetic invoice and (2) an unknown UUID. Both returned the application’s generic handled error response (HTTP 200 TanStack server-function transport; 253-byte serialized result). Neither response echoed the requested identifier or contained financial/amount fields or provider-order identity. No foreign invoice details, amount, status, or QRIS action were shown. No same-school second-family issued invoice was available in the existing synthetic data; no fixture or relationship was created.

## Finance Operator Surface

**PASS.** Normal synthetic Finance login and scoped `finance.read` authorization were confirmed. Foreign-school invoice navigation returned the safe active-school Finance denial without foreign invoice details. No force-settlement or B24-bypass control was present.

## Finance Provider-Unconfigured State

**PASS.** The no-order invoice view explicitly identifies QRIS Sandbox as not configured, marks the flow as sandbox/test with no real money, and retains manual-payment guidance. The final fresh Finance session displayed `NOT_CONFIGURED` and zero provider orders. Indonesian changed-state copy and Dark mode were verified through normal UI controls; all changed-state text remained visible and readable. The decoded server-function projection contained only the expected safe availability state and empty order collection, with no secret fields or foreign-school financial data.

## Finance Cross-School

**PASS.** The foreign-school invoice attempt was denied without foreign invoice/provider facts. Unknown provider-order and intent browser probes were not separately repeated in this micro-closure.

## Unrelated Parent Boundary

No second Parent login was attempted in this closure. Deterministic authorization tests cover unrelated-family denial.

## Teacher Boundary

No new Teacher browser pass was performed. Existing deterministic authorization coverage remains the evidence.

## Student Boundary

No new Student browser pass was performed. No Student payment capability was added; deterministic authorization coverage remains the evidence.

## Anonymous Boundary

**PASS from prior browser-enabled UAT.** Protected Parent billing redirected to authentication and exposed no invoice/provider facts. Direct HTTP route-shell status is not treated as authorization evidence.

## ID / EN

Parent ID/EN: **PASS** from the authorized browser pass. Finance ID/EN: **PASS**. The changed Finance state was rechecked in Indonesian and English; no raw translation keys or English-only changed-state fallback appeared in Indonesian.

## Light / Dark

Parent Light/Dark: **PASS** from the authorized browser pass. Finance Light/Dark: **PASS**. The changed provider-unconfigured state was verified in Dark mode with readable status, warning, and manual-payment guidance; status was expressed in text as well as styling.

## Responsive

Parent and Finance surfaces passed 375 / 768 / 1440 px without page-wide horizontal overflow in the authorized browser pass. The Finance no-order view after the diagnostic change also measured 360/360 at 375 px, 753/753 at 768 px, and 1425/1425 at 1440 px.

## Accessibility Practical

Parent keyboard-only traversal from a fresh authorized billing view followed Dashboard → Notifications → Parent navigation → Billing → School/academic selectors → notification/profile controls → Pay with QRIS (Sandbox). Each focus target was visible and used an outline or focus ring. Enter activated QRIS and showed the safe unavailable message without a fake QR or route change. Shift+Tab returned to the preceding profile control; traversal continued through focusable controls without a trap. Parent manual-payment guidance is text, not an interactive Parent action. Finance had representative named-control visible-focus traversal and reverse navigation on the authorized operator surface. The micro-fix adds only non-interactive status copy and no tab stops or controls, so that traversal remains applicable. No formal WCAG claim is made.

## Console / Network

**PASS — fresh Finance happy-path capture.** Console errors: 0; page errors: 0; unexpected warnings: 0; unexpected failed requests: 0; unexpected 401/403/500: 0; request loops: 0; direct browser Midtrans requests: 0; Production Midtrans requests: 0. Deliberate callback negative probes are excluded from this capture and remain separately classified.

## Payload / Secret Inspection

**PASS.** The final Finance server-function response was decoded with the same Seroval format used by TanStack Start. The projection contained `providerAvailability: NOT_CONFIGURED` and an empty `orders` array. No environment names, credential metadata, tokens, private keys, signatures, raw callback, service-role credential, Parent contact, or foreign-school financial facts were present. Browser secret leakage: 0; foreign-data leakage: 0.

## Sandbox Evidence

Midtrans Sandbox Credentials: **NOT AVAILABLE**. Public HTTPS callback: **NOT AVAILABLE**. Sandbox QR Creation: **NOT EXECUTED**. Official Simulator Payment: **NOT EXECUTED**. Remote Callback: **NOT EXECUTED**. Sandbox Verification: **EXTERNAL PREREQUISITE PENDING**. Ready for Sandbox: **NO**.

## Development Secret Incident

The prior local QA invocation accidentally printed Development `.env.local` values. The owner rotated the affected Development secret categories; replacement Development credentials are operational. Values are not reproduced. Tracked repository leakage: 0. Production exposure was not observed.

## Mutation Accounting

- B27 migrations applied: 7; new migrations in this closure: 0.
- Development product/invoice/payment/provider data mutations: 0.
- No account was created and no product data/provider state was mutated. During this Auth-boundary closure, 12 password updates were made to the same existing synthetic Development Finance account across diagnostic runner invocations; one existing synthetic Parent control account received one Development-only password update. No membership, profile, capability, or Production Auth changes were made. Earlier report history recorded Parent 3 / Finance 3 updates; including the separate intervening Finance repair, cumulative known totals are Parent 4 / Finance 16. No password value is recorded.
- Production migrations/data/Auth/provider calls: 0. Real payments: 0.

## Residual Limitations

Midtrans sandbox credentials and an authorized public HTTPS callback remain external prerequisites. The live QR, simulator, and remote callback were not executed.

## Final Release-UAT Decision

**READY FOR PR.** Parent and Finance authorized browser gates, cross-family/cross-school boundaries, keyboard checks, and the final changed Finance state in Indonesian/Dark passed. Fresh Finance console/network and safe-payload inspection passed with zero findings. Midtrans sandbox lifecycle remains not executed because credentials and an authorized callback target are unavailable; this is an external prerequisite, not a claim of sandbox verification.
