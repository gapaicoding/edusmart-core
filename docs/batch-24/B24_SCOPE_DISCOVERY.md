# EduSmart Batch 24 — Scope Discovery

## Baseline

- Canonical repository: `D:\edusmart-core`.
- B24 branch/worktree: `feat/b24-online-payment-reconciliation` at `D:\edusmart-worktrees\edusmart-core-b24`.
- Baseline: `c141222fcec53311ffd7af1b879e026ef04fdc18`; canonical `main` was clean and equal to `origin/main`.
- B23 feature commit `e187a93adfc3e892c57b8503bd48c884f3724864` is an ancestor of `main`.
- Development migration ledger is readable and matches local migrations through `20260929100000`.
- Remote Development TypeScript schema was generated with `supabase gen types --linked --schema public`; the finance table columns, relationships and RPC signatures match the applied B19 migrations.

## Current B19 Finance Architecture

The authoritative Finance implementation is `finance.functions.ts`, `finance.schemas.ts`, `finance.server.ts`, the B19 Finance UI, and append-only migrations `20260926100000` through `20260926170000`. Mutations use authenticated server functions that call scoped `SECURITY DEFINER` RPCs. Finance authorization is capability based (`finance.read`, `finance.manage_fees`, `finance.manage_billing`, `finance.issue`, `finance.record_payment`, `finance.adjust`, and `finance.portal_read`). RLS is enabled and forced on the B19 financial tables; browser clients do not write them directly.

Invoices, invoice items, payment receipts, one-invoice allocations and reversal records are canonical. Payment rows are immutable. A reversal inserts one correction row and the settlement projection excludes corrected payments. B19's `b19_finance_settlement(invoice_id)` derives total, valid paid amount and outstanding from invoice items, allocations, and corrections.

## Current Payment Model

The live Development schema exposes `finance_invoices` with `organization_id`, `school_id`, student/enrollment/year identity, `currency`, `document_status`, and `row_version`. `finance_payments` stores a positive `bigint amount_idr`, `currency`, `method`, receipt time, actor, and tenant/student context. `finance_payment_allocations` ties a payment to one invoice with composite tenant/student/enrollment/currency relationships. `finance_payment_corrections` uniquely identifies a reversal by original payment.

B19 invoice status is `draft`, `issued`, or `void`. Only `issued` invoices accept payments. Currency is IDR. Payment method is constrained to `cash`, `bank_transfer`, or `other`. Outstanding is computed from invoice-item line amounts less allocations for unreversed receipts. Manual partial payment is supported.

`b19_record_finance_payment` begins an actor/request command-ledger entry, locks the invoice `FOR UPDATE`, checks issued state, re-computes total and paid, rejects over-allocation, validates enrollment, inserts the immutable payment and allocation, and completes the request ledger. `b19_void_finance_invoice` shares the invoice serialization point. B19 reversals lock the payment and insert immutable correction evidence.

## Current Parent Billing Contract

Parents use the existing `/portal/billing` surface and `b19_list_parent_billing` / `b19_get_parent_invoice` RPCs. Those projections are relationship-scoped and intentionally omit staff-only data. `finance.portal_read` is granted based on parent/guardian relationships; student access is not implicitly included. B24 will add an eligible-own-invoice operation that reuses the B19 guardian relationship predicate and does not accept client-supplied organization, school, student, amount, or provider details.

## Existing Idempotency / Concurrency Patterns

B19 uses `finance_command_requests`, keyed by actor, command name, and request ID, with a semantic fingerprint and stored result. Exact replays return the result; a reused key with changed semantics is rejected. B19 obtains the command row before locking finance records and then uses invoice-first financial lock order.

B22 has capability-gated, authenticated command RPCs, immutable provider-neutral records, append-only delivery attempts, and a non-network Development adapter that rejects production. B23 fingerprints semantic requests, checks mismatch before state transitions, locks the application and child task rows, checks row versions, and enforces uniqueness in the database. New work will follow these conventions.

## Existing Authorization / RLS Model

`requireSupabaseAuth` is the current TanStack server-function middleware. B19 and B22 RPCs authenticate `auth.uid()` internally, derive the actor and organization from database state, validate the requested school with `has_permission` / existing Finance authorization helpers, set an empty or explicit safe `search_path`, schema-qualify objects, revoke public execution, and grant only required execution. B19 parent projections validate relationships within the RPC. UI gates are UX only.

## Gap Analysis

B19 has no durable online payment intent, provider event inbox, provider settlement identity, or reconciliation record. Its payment-method check intentionally accepts only manual methods. Reconciliation therefore needs a new narrowly scoped RPC and an additive method constraint extension; it must not alter B19 accounting rules or accept `other` as a disguised online payment.

## Proposed B24 Domain Model

Add three append-only financial-integrity tables: online payment intents, normalized provider events, and reconciliation outcomes. Each carries organization/school ownership and composite relationships to the B19 invoice. Intents snapshot the server-derived full outstanding amount and IDR currency, provider-neutral adapter key, channel, lifecycle status, expiry, request identity/fingerprint, and row version. Events store provider key, external event ID, normalized type, settlement reference, amount/currency, occurred time, safe failure code, and fingerprint; no raw payload or secrets. Reconciliation rows uniquely link one trusted settlement identity to at most one canonical B19 payment and preserve exceptions.

An additive B24 migration may extend the B19 payment method check with a distinct `online_provider` value. All canonical accounting remains in `finance_payments` and `finance_payment_allocations`; no second ledger is introduced.

## Payment Intent Lifecycle

Persist `pending`, `settled`, `expired`, `failed`, `cancelled`, and `review_required` terminal outcomes. The provider's simulated acceptance does not mean money is settled. Only a normalized verified settlement event handled by the internal Development boundary can settle an intent. Terminal outcomes do not regress. No refunds, chargebacks, or reversal events are in this batch.

## Provider Event Model

Events are normalized server-side by a server-only adapter. The Development adapter accepts deterministic synthetic event instructions only, performs no network I/O, creates no real payment instrument/reference, and rejects production. `(provider_key, provider_event_id)` is unique; repeated identical event fingerprints reuse the prior result; a conflicting reuse is denied. The event inbox records safe normalized fields only.

## Reconciliation Model

In one transaction, lock the intent and invoice using a consistent intent-then-invoice order; serialize invoice accounting on the same B19 invoice row used by manual payment and void. Validate the intent snapshot, current invoice status, event amount/currency, and current B19 outstanding. If the invoice is no longer eligible or the snapshot amount exceeds current outstanding after a manual payment, record `review_required` and create no B19 payment. Otherwise insert exactly one immutable B19 payment and matching allocation, mark the intent settled, and persist the reconciliation link. Unique constraints on event identity, intent settlement, and provider settlement identity provide duplicate/concurrent backstops.

## Idempotency Model

Intent creation uses authenticated actor plus request ID and canonical semantic fingerprint. Same request and fingerprint returns the original intent; changed fingerprint is rejected. A partial unique index permits at most one pending intent per invoice/provider/channel. Events use provider event identity plus normalized fingerprint. A separate unique provider settlement reference prevents different event IDs for one settlement from creating two B19 payment effects.

## Concurrency Model

All accounting writes happen inside RPC transactions. Use request-ledger uniqueness, row locks, active-intent partial uniqueness, event identity uniqueness, settlement-reference uniqueness, and invoice row serialization. Reconciliation and B19 manual payment/void contend on the same invoice row and compute outstanding after obtaining that lock. Expiry locks the intent and cannot overwrite settled state. No frontend-only concurrency protection is relied upon.

## Authorization Model

Parents may create/reuse intents and read safe intent state only through a relationship-checked RPC for an invoice already visible under B19. Parent operations do not ingest events or enumerate provider internals. Staff reconciliation/event simulation requires existing `finance.record_payment` or the narrowest existing Finance capability proven semantically sufficient. No role-name checks, direct table writes, or service-role product CRUD. RLS is enabled and forced; direct `anon`/`authenticated` writes are revoked.

## Parent Experience

Integrate status and a create/reuse action into existing parent billing. Show only safe states and server-derived amount. State clearly that the deterministic adapter is a Development test path; no QRIS, VA, bank, card, or real provider branding is displayed.

## Staff Experience

Add minimal status and safe reference/outcome visibility to the existing Finance invoice detail/payment surface. Finance capability checks remain server authoritative. No raw payload or credentials are exposed.

## Security / PII Analysis

Store no card/bank credentials, payer payment credentials, authorization headers, raw provider body, or unnecessary parent PII. Reuse B19 invoice/guardian identity. Persist bounded normalized fields and hashes/fingerprints only. Safe errors map database conditions to localized messages.

## Provider Boundary

No real provider, webhook endpoint, external worker, polling, QRIS, VA, card, or provider credentials. Internal normalized ingestion is not an internet-facing endpoint.

## Development Test Adapter

Deterministic server-only adapter, no network, synthetic identifiers only, stable for the same request/event identity. It supports pending, settled, expired, and safe failure outcomes. It explicitly rejects `NODE_ENV=production` and cannot be selected in production.

## Migration Impact

Append-only migration timestamp must be later than `20260929100000`. It creates B24 tables, composite FKs, checks, indexes, RLS/forced RLS, narrow RPCs, and ACL hardening; it adds no changes to existing migration files. It may extend the B19 payment method constraint additively while preserving all three manual methods and every B19 allocation/reversal invariant. The migration will be dry-run reviewed before Development application.

## Test Strategy

Focused contract tests cover request replay/conflict, amount derivation, active intent uniqueness, event dedupe/conflict, settlement identity uniqueness, out-of-order transitions, expiry/failure, manual-payment conflict, authorization and RLS/ACL, and production fail-closed behavior. Development runtime testing uses only synthetic test events and an existing safe synthetic B19 invoice if available. Re-run relevant B18–B23 regressions, complete test suite, TypeScript, build, changed-scope ESLint, Prettier, migration parity, and SQL validator. Browser UAT requires secure persona sign-in and will be reported without overstating unexecuted scenarios.

## Explicit Non-Goals

Real Midtrans/Xendit/Stripe; QRIS/VA/card processing; provider onboarding, credentials, external webhook or worker; refunds, chargebacks, disputes, payout or bank settlement reconciliation; a general ledger; tax, multi-currency, installment or autopay; communication integration; unrelated domains; Batch 25.

## Risks

- B19 payments accept only manual method labels today; B24 must extend that check additively and use a dedicated RPC so the ordinary manual endpoint cannot impersonate provider settlement.
- A manual payment may reduce outstanding while an online intent is pending. Reconciliation must preserve evidence and require review rather than over-allocate or silently reduce the provider amount.
- Concurrent settlement safety depends on using the same invoice lock and canonical allocation formula as B19.
- The remote schema dump utility requires Docker, which is unavailable in this session. Live Development schema inspection was instead obtained through the linked CLI remote type-generation endpoint and migration ledger; full runtime/fixture checks remain required before release.

## Final Locked Scope

Implement a provider-neutral, Development-only online payment intent and normalized event inbox, with transactional exactly-once reconciliation into B19's canonical immutable payment/allocation records. Full current outstanding only, IDR only, relationship-scoped parent initiation/read, Finance-capability staff event simulation/reconciliation, conflict-to-review behavior, strict RLS/RPC and database uniqueness. No real provider, real payment, or Production mutation. If migration/runtime evidence contradicts the live B19 contract above, stop rather than weaken B19.
