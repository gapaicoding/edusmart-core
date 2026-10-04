# EduSmart Batch 27 — Implementation Audit Report

## Executive Result

**READY FOR PR.** The Finance no-order operator surface reports the QRIS sandbox provider as unconfigured using a safe availability enum and retains manual payment. Parent/Finance authorized browser checks, Parent cross-family/unknown-invoice denial, Finance foreign-school denial, keyboard/focus, the changed Finance Indonesian/Dark state, and fresh console/network/payload inspection passed. Previously verified engineering gates remain applicable because no product source, test, configuration, or SQL changed in this browser closure. Midtrans remote sandbox lifecycle remains an external prerequisite and is not claimed as verified.

## Baseline

- Baseline: `8e1abb2df3706e63aa2502c9b406a0d62d034295`.
- Branch: `feat/b27-midtrans-qris-sandbox`.
- Worktree: `D:\edusmart-worktrees\edusmart-core-b27`.
- Development migrations: 104 local = 104 remote; 7 B27 migrations are applied.
- No Production database was linked or modified.

## Locked Scope

Midtrans BI-SNAP Core API, sandbox only, dynamic QRIS only. No Production credentials, live traffic, real payment, Virtual Account, second gateway, or unrelated integration is authorized.

## Midtrans Contract

See [B27_MIDTRANS_INTEGRATION_CONTRACT.md](B27_MIDTRANS_INTEGRATION_CONTRACT.md). Official documentation was reviewed on 2026-10-03. The adapter fixes the sandbox origin and BI-SNAP paths in server code. No provider credentials were found in the local environment; none are included in this report.

## B19/B24 Integration

B19 remains the accounting source of truth. Verified callback events are normalized and passed through B24 reconciliation; callback code does not directly settle an invoice. Parent order creation derives the amount from canonical outstanding invoice state. Manual payment remains available, and conflicts are represented for operator review rather than creating a second settlement.

## Architecture

The server-only BI-SNAP client uses built-in Node crypto and a fixed sandbox HTTPS origin. The public notification route validates request size/content type, timestamp, partner identity, and Midtrans public-key signature before correlation. Raw callback bodies, private keys, client secrets, and bearer tokens are not persisted. QR content is returned only when actually received and is rendered locally.

## Database Impact

Seven append-only B27 migrations were applied to Development before this closure. No migration was added or applied in this closure. They define sandbox QRIS order/idempotency state and narrowly scoped security-definer operations without browser CRUD. B19, B24, B25, B26, and B27 validators all passed. Generated Supabase types were not retained because generation produced unrelated schema/format churn; application RPC calls use the existing server boundary.

## QRIS Order Lifecycle

Order creation is authorized against the linked Parent invoice and uses the server-derived amount. QR generation is not payment success. Parent state distinguishes pending, expired, unavailable, and reconciled states and labels the flow as sandbox/test only. Manual B19 payment is retained.

## Idempotency

Database uniqueness and per-intent reservation maintain one logical provider order and external reference per intent. Repeated create calls reuse local state. Deterministic tests cover replay/concurrency-oriented reservation behavior.

## Timeout / Ambiguity Recovery

Transport ambiguity is not treated as rejection or success. The stored order can be recovered by querying Midtrans with its existing identity; code does not mint a new external identity or blindly retry creation.

## Callback Authentication

BI-SNAP callback verification uses the documented RSA-SHA256 canonical request form, configured public key, strict timestamp parsing/freshness, and partner identity. Production mode fails closed. Deterministic crypto tests use synthetic keys.

## Callback Replay Defense

Normalized provider event identity is database-unique. Duplicate callbacks are handled idempotently through B24. Raw payload retention is not used.

## Status Normalization

Only supported documented statuses are normalized. Unsupported/refund statuses are surfaced as safe operator exceptions and do not reverse or mutate B19 settlement. Pending status or QR creation alone cannot settle an invoice.

## B24 Reconciliation

The notification path submits normalized events to B24 reconciliation, which locks and evaluates canonical invoice state before settlement. SQL changes preserve invoice-first lock ordering. Amount/currency mismatches are quarantined without an accepted B24 event or B19 payment row.

## Manual Payment Race

If manual B19 settlement precedes a later QRIS success, B24 detects a conflict and records review-required state. B27 adds no parallel allocation path. Automated coverage exists; no Development invoice was mutated to exercise a live race.

## Parent Authorization

Server authorization checks the linked-family invoice access contract. Deterministic tests cover cross-family/cross-school authorization. Browser UAT passed normal Parent login, linked-family invoice, canonical displayed amount, sandbox/no-real-money labels, safe no-provider behavior, manual guidance, responsive layout, themes/localization, and payload privacy inspection. This closure substituted an existing foreign-school synthetic invoice and an unknown UUID into the actual Parent `getParentMidtransQris` server request; both received the same generic handled error without echoed ID, financial fields, amount, or provider identity. No second-family issued invoice existed in the same synthetic school. Keyboard-only traversal reached QRIS in logical order with visible focus; Enter produced the safe unavailable state, Shift+Tab returned to the prior control, and no trap was observed. Manual fallback is non-interactive guidance on the read-only Parent screen.

## Finance Authorization

Finance listing requires existing `finance.read` capability and returns a safe projection. Browser UAT passed normal UI login, scoped capability, and foreign-school invoice denial without foreign facts. `getMidtransFinanceAvailability` is a read-only server projection returning only `CONFIGURED`, `NOT_CONFIGURED`, or `DISABLED`; Production reports disabled. The final Finance no-order invoice view showed the Indonesian provider-unconfigured status, sandbox/test and no-real-money text, and manual-payment guidance in Dark mode. The captured TanStack server-function response was decoded and contained `NOT_CONFIGURED` plus an empty orders array, with no secret or foreign-school fields. No force-settlement or B24-bypass control is present. Representative keyboard traversal passed; the diagnostic is static text and adds no focusable element.

## Cross-Tenant Security

SQL/RPC boundaries derive tenant ownership through stored order → B24 intent → invoice relationships; caller-provided school identifiers are not trusted as proof. Deterministic authorization tests and B27 validation pass. Finance foreign-school browser denial and Parent foreign-school/unknown-invoice server-action browser probes returned no foreign financial or provider facts.

## Production Fail-Closed

Runtime configuration rejects production mode; the provider origin is fixed to the sandbox host and cannot be selected by the browser. Production migrations, data, Auth, and provider calls: 0.

## Sandbox Boundary

There is no selectable Production Midtrans endpoint. Live credentials are not authorized or configured. No real money was processed.

## Sandbox Credential Availability

Sandbox account credentials were unavailable in the ignored local environment. An authorized public HTTPS callback target was also unavailable.

## Development Secret Incident

A prior local QA invocation accidentally printed Development `.env.local` values. The owner rotated the affected Development secret categories and replacement Development credentials are operational. Values are not reproduced. Tracked repository leakage: 0. Production exposure was not observed. The incident is closed.

## Sandbox Lifecycle Evidence

Actual QR creation, simulator payment, and remote callback receipt: **NOT EXECUTED — external sandbox account/credential and public callback prerequisites.** Local deterministic adapter and signed-callback tests are not represented as a remote provider lifecycle.

## Authorized Browser UAT

Parent and Finance authorized logins and their scoped pages passed in browser-enabled UAT. Parent cross-family/unknown-invoice server-action denial and keyboard/focus traversal passed. Finance changed-state Indonesian and Dark mode, fresh console/network accounting, and decoded safe availability payload inspection passed; see [B27_BROWSER_UAT_REPORT.md](B27_BROWSER_UAT_REPORT.md). UI authentication diagnosis found that prior automation submitted before React hydration; after waiting for the normal hydrated form, the same existing synthetic Finance persona authenticated successfully. Auth endpoint/project and public key matched Development, session persistence worked, and no application source change was needed.

## Engineering Gates

- Focused B19/B24/B27 tests: 30 passed, 0 failed across 5 files.
- Full suite: 718 passed, 0 failed, 77 files.
- TypeScript: PASS.
- Changed-scope ESLint: PASS.
- Prettier changed source/docs: PASS.
- B19 foundation + phase 2, B24, B25, B26, B27 validators: PASS.
- Development migration parity: 104 = 104.
- Production build: PASS.
- `git diff --check`: PASS after report edits.

## Credential / PII Scan

Prior changed-file scan found zero credential-pattern matches. The final targeted scan of changed Finance source/tests and both updated reports found zero credential-pattern matches; the availability projection returns no configuration metadata. `.env.local` remains ignored and was not copied into repository changes.

## Development Integrity Check

Previously verified read-only aggregate results were zero for duplicate provider external IDs/fingerprints, orphan intents, invalid environment/method/currency orders, accepted amount/currency mismatch, duplicate settled reconciliation, Production orders, and secret/raw-payload columns. No database migration or data mutation was performed in this closure.

## Mutation Accounting

- B27 migrations applied: 7; new migrations in this closure: 0.
- Development product/invoice/payment/provider-event/reconciliation fixture mutations: 0.
- No product data or provider state was mutated. During this Auth-boundary closure, 12 password updates were made to the same existing synthetic Development Finance account across diagnostic runner invocations; one existing synthetic Parent control account received one Development-only password update. No membership, profile, capability, or Production Auth changes were made. Earlier report history recorded Parent 3 / Finance 3 updates; including the separate intervening Finance repair, cumulative known totals are Parent 4 / Finance 16. No password value is recorded and no account was created.
- Production migrations/data/Auth/provider calls: 0.
- External messages and real payments: 0.
- Midtrans API calls / QR orders / simulator payments / remote callbacks: 0.

## Findings

- **EXTERNAL DEPENDENCY — Midtrans sandbox lifecycle not executed.** Merchant sandbox credentials and an authorized public HTTPS callback are prerequisites; this is not an implementation defect for PR readiness.
- **MEDIUM — synthetic Development QA account maintenance.** Existing reserved-domain Finance and Parent QA credentials were updated for controlled UAT only. No Production Auth changes or new accounts.

## Residual Limitations

No actual Midtrans sandbox QR/payment/callback lifecycle was performed. Credentials and an authorized public HTTPS callback remain external prerequisites. Production payment remains disabled and unauthorized.

## Release Decision

**READY FOR PR.** Unresolved BLOCKER: 0. Unresolved HIGH: 0. Actual Midtrans sandbox lifecycle: NOT EXECUTED — external prerequisite pending. Ready for Midtrans Sandbox: NO. Ready for Production payments: NO.
