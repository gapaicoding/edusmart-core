# EduSmart Batch 28 Scope Discovery

**Discovery only. No implementation, migrations, fixture changes, Auth changes, provider calls, or Production access were performed.** The recommendation below is a proposal for product-owner scope approval; Batch 28 implementation has not started.

## Executive Summary

Current `origin/main` is `10ed4bfff7ec37baa1519e3d65769a85aeb93a75`, equal to canonical `main`. B27 is permanently closed. The linked Development database is current with 104 local and 104 remote migrations.

Stage 2 has substantial foundations: formal admissions processing (B18), admissions follow-up after application (B23), finance/billing and manual payments (B19), payment intent/reconciliation (B24), sandbox-only Midtrans Dynamic QRIS code (B27), in-app communications (B20), provider-neutral external-delivery queue/operations (B22/B25), and school-scoped readiness projection (B26). Material gaps remain in pre-application admissions CRM, actual external communication delivery, production delivery execution, external Midtrans sandbox verification, and real-school acceptance.

**Primary B28 recommendation: Batch 28 — School-Scoped Pre-Application Inquiry & Lead Management.** It addresses the explicit Stage 2 PPDB/CRM gap without choosing an external provider or requiring live customer data. B18/B23 do not represent or manage pre-application prospects. This scope must wait for product decisions about the lead lifecycle, ownership, duplicate handling, and conversion/consent semantics; those rules cannot be inferred from current source.

Do not turn unavailable Midtrans credentials/callback into an implementation batch. Do not ship a communications provider integration before provider/channel, sender, consent, and callback requirements are decided and available. Real-school pilot acceptance remains an operational activity, not a code gate that B28 can claim on a school’s behalf.

## Current Main Baseline

- Canonical repository: `D:\edusmart-core`; branch `main`.
- Discovery worktree: `D:\edusmart-worktrees\edusmart-core-b28-discovery`; detached at exact `origin/main` `10ed4bfff7ec37baa1519e3d65769a85aeb93a75`.
- Canonical `main` and `origin/main`: equal. Recent first-parent history includes merge PRs #18 (B23), #19 (B24), #20 (B25), #21 (B26), #22 (B27), followed by the B27 post-merge closure documentation commit.
- B27 closure report is present at `docs/batch-27/B27_POST_MERGE_VERIFICATION_REPORT.md`; it records B27 permanent closure and the external sandbox limitation.
- Linked Development migration ledger, queried read-only from canonical configuration: **104 local = 104 remote**, with no local-only or remote-only versions. Latest remote versions are `20261004120000` through `20261004160000` (the final five of the seven B27 migrations); latest migration file is `20261004160000_b27_unsupported_status_visibility.sql`.
- Current test baseline from the exact merged LF-preserving B27 verification: focused B19/B24/B27 30 passed, 0 failed; full suite 718 passed, 0 failed, 77 files. These were not rerun for this discovery.
- Repository quality baseline: B27’s baseline comparison found identical pre-B27 and merged results: ESLint 8,089 errors / 13 warnings; Prettier reports 70 files. B27 changed-scope checks passed and introduced zero lint/format violations. Windows CRLF sensitivity caused three B9 failures in the canonical Windows checkout; the exact merged LF checkout passed the 17 targeted B9 tests and full suite. This is inherited tooling/format debt, not a reason to expand B28.
- Current tracked secret status: `.env.local` is ignored and not tracked. B27’s final tracked credential/PII scan reported zero matches. No secret values were inspected during this discovery.
- B27: PERMANENTLY CLOSED. Midtrans credentials and authorized public HTTPS callback remain unavailable; live sandbox QR, simulator, and remote callback were not executed. Production payments remain disabled.

## Current Stage 2 Capability Map

| Capability                              | Status                                                                       | Current evidence and boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admissions Core                         | COMPLETE                                                                     | B18 admission cycles, applications, guardian records, consent evidence, state history, decisions, and accepted-application conversion to Student, Guardian links, and StudentEnrollment. `supabase/migrations/20260925100000_b18_ppdb_admissions_foundation.sql:29-240`; `20260925120000_b18_ppdb_admissions_commands_runtime.sql:5-234`.                                                                                                                                                   |
| Admissions Funnel                       | PARTIAL                                                                      | B23 counts formal application statuses and operates follow-up tasks after an application exists. No prospect/pre-application stage is counted. `supabase/migrations/20260928130000_b23_admissions_followup_funnel.sql:231-255`; `src/lib/b23-admissions-followup-funnel.test.js:24-121`.                                                                                                                                                                                                    |
| Admissions CRM / Lead Management        | MISSING                                                                      | B18 foundation test explicitly excludes prospects/campaigns; B23 explicitly excludes CRM/lead stages. No lead/prospect entity, source/owner pipeline, or lead-to-application workflow was found in current source. `src/lib/b18-ppdb-admissions-foundation.test.js:23-40`; `src/lib/b23-admissions-followup-funnel.test.js:24-37`.                                                                                                                                                          |
| Finance Core                            | COMPLETE                                                                     | Fees, versioned billing plans, IDR invoices/items, payment allocations, correction ledger, command idempotency, status history, and scoped finance RPCs. `supabase/migrations/20260926100000_b19_finance_billing_foundation.sql:48-430`; `supabase/migrations/20260926110000_b19_finance_billing_runtime.sql:5-58`.                                                                                                                                                                         |
| Manual Payments                         | COMPLETE                                                                     | Cash/bank-transfer/other recording is finance-authorized, invoice-locked, bounded by canonical outstanding, and allocated to one invoice. Reversal is a separate immutable correction; void is blocked after a valid payment. `supabase/migrations/20260926110000_b19_finance_billing_runtime.sql:231-253`; `supabase/migrations/20260926160000_b19_finance_void_payment_concurrency_hardening.sql:34-103`.                                                                                 |
| Online Payment Foundation               | COMPLETE                                                                     | B24 intent, event, and reconciliation records with one active intent per invoice/provider/channel, unique provider event identity, one settlement effect, and review-required exceptions. B19 remains the accounting record. `supabase/migrations/20260929110000_b24_online_payment_reconciliation.sql:29-138`.                                                                                                                                                                             |
| First Gateway Adapter (code)            | COMPLETE — SANDBOX ONLY                                                      | B27 implements the Midtrans BI-SNAP fixed sandbox host and dynamic QRIS create/query, authenticated notification verification, idempotent provider order, safe availability projection, and fail-closed Production behavior. `src/lib/midtrans-qris.server.ts:9-95,176-218`; `src/lib/midtrans-qris.functions.ts:27-105`; `supabase/migrations/20261004100000_b27_midtrans_qris_sandbox.sql:12-63`.                                                                                         |
| Gateway Sandbox E2E                     | EXTERNAL DEPENDENCY                                                          | The B27 closure report records no merchant sandbox credentials or authorized public HTTPS callback; QR creation, simulator, and remote callback were not executed. This is not a known code gap. `docs/batch-27/B27_POST_MERGE_VERIFICATION_REPORT.md`.                                                                                                                                                                                                                                     |
| Communication Center                    | COMPLETE — IN-APP                                                            | B20 creates school/classroom-targeted announcements and snapshots recipients into the existing in-app notification/read path. The stored content is an announcement, not a reusable channel/provider template. `supabase/migrations/20260926180000_b20_communication_center_core.sql:3-104`; `src/lib/communication.functions.ts:19-110`.                                                                                                                                                   |
| External Delivery Foundation            | COMPLETE — PROVIDER-NEUTRAL                                                  | B22 enqueues email/WhatsApp jobs against the immutable B20 recipient snapshot. `provider_key` is constrained to `unconfigured`; destination addresses are not stored in the job recipient table. `supabase/migrations/20260928120000_b22_external_communication_delivery.sql:3-112`.                                                                                                                                                                                                        |
| Delivery Operations                     | COMPLETE — TEST ADAPTER                                                      | B25 records purpose/channel consent and contact verification, applies scoped eligibility, offers masked operator projection, claim/lease, pause, retry, attempt/result tracking, and safe failure categories. Claim/finalization RPCs are service-role-only. `supabase/migrations/20261002100000_b25_communication_delivery_operations.sql:3-110,235-389`; `src/lib/communication-operations.server.ts:24-93`.                                                                              |
| First External Communication Provider   | MISSING                                                                      | Only a deterministic non-network Development adapter exists; it accepts synthetic destinations and is disabled in Production. No real outbound provider adapter/API or provider account is configured. `src/lib/communication-delivery.adapters.server.ts:32-84`; `src/lib/communication-operations.server.ts:30-45`.                                                                                                                                                                       |
| Production Communication Worker Runtime | MISSING                                                                      | A server operation can manually run the B25 claim/execute/finalize cycle outside Production. It deliberately rejects Production until a provider is configured; no deployed production worker/scheduler is present in source. `src/lib/communication.functions.ts:144-150`; `src/lib/communication-operations.server.ts:24-45`.                                                                                                                                                             |
| Communication Provider Callback         | MISSING                                                                      | B22/B25 persist attempt/status fields but no external communication webhook route, callback authentication, or provider-event normalization path exists. This differs from the B27 Midtrans callback code.                                                                                                                                                                                                                                                                                  |
| Pilot Readiness                         | COMPLETE FOR DEFINED MANUAL/IN-APP PILOT; PARTIAL FOR INTEGRATION VISIBILITY | B26 is a read-only school-scoped status/count projection with READY/WARNING/BLOCKER/MANUAL_FALLBACK and route guidance, not an operations service or acceptance signoff. Its current schema retains manual-payment and in-app fallbacks; it does not query B27 QRIS availability or B25 delivery-job health. `src/lib/pilot-readiness.schemas.ts:7-25,273-330`; `src/lib/pilot-readiness.functions.ts:9-31`; `supabase/migrations/20261003110000_b26_pilot_readiness_projection.sql:3-112`. |
| Real-School Acceptance                  | EXTERNAL DEPENDENCY                                                          | B26 runbook requires school-owner agreement, scope, training/support ownership, nominated accounts, and operational review. A technical readiness status is explicitly not school acceptance. `docs/batch-26/B26_PILOT_SUPPORT_RUNBOOK.md:5-20,30-43`; `docs/batch-26/B26_PILOT_READINESS_RULES.md:36-43`.                                                                                                                                                                                  |

Stage 2 remains **OPEN**. The PRD describes Stage 2 as Monetization & Retention and lists Finance/Billing, PPDB & CRM, and Communication Center; its broader product roadmap includes WhatsApp communication. `docs/PRD_EduSmart_School_Management_System.md:523-525`.

## Admissions Current State

B18 is a formal application system, not a lead CRM. It has school/year-bound cycles (`draft/open/closed/archived`), submitted applications (`submitted/under_review/accepted/rejected/withdrawn/converted`), applicant and guardian details, explicit policy-version consent, append-only status history, and command request fingerprints/row versions. Public submission is restricted to a valid open cycle. Staff actions resolve school-scoped capabilities (`admission.read`, `admission.manage_cycle`, `admission.review`, `admission.decide`, `admission.convert`). The accepted application conversion transaction creates a Student, one or more Guardians and links, a draft StudentEnrollment, a conversion record, stage history, and audit evidence; it checks NISN duplicates and prevents repeat conversion (`supabase/migrations/20260925120000_b18_ppdb_admissions_commands_runtime.sql:168-198`).

B23 adds application-linked follow-up, not pre-application CRM. A task has one active assignee, due time, status, and bounded completion outcome; a partial unique index permits one open task per application. Append-only activity records changes but intentionally does not store call/chat transcript text. The funnel counts current B18 statuses. Staff assignees must be active and assigned to the same school. `supabase/migrations/20260928130000_b23_admissions_followup_funnel.sql:4-70,197-255,354-488`.

Not found in current implementation: pre-application lead/prospect, lead source/campaign attribution, pre-application contact channel, lead owner, lead-specific status/qualification, lead activity notes, next action for an unsubmitted prospect, school-scoped duplicate handling, lead search/filter, or explicit lead-to-B18-application conversion. B23’s task FK is to `admission_applications`; it cannot safely be repurposed for a prospect without an intentional model change.

## Communication Current State

B20 publishes in-app announcements to school or classroom audiences and uses notification/read-state infrastructure. There is no reusable message-template registry, external template-approval mapping, or channel-specific rendering contract. B22 separates publication from external delivery and creates durable jobs/recipients/attempt rows without sending or persisting raw destinations. Channels are `email` and `whatsapp`; the provider key remains `unconfigured`.

B25 adds operator eligibility and retry/recovery semantics: consent state (`unknown/granted/revoked`), contact state (`unverified/verified_by_school/disabled`), source evidence, guardian-school relationship checks, server-local destination resolution, masked projections, lease claims, pauses, bounded retries, and attempt outcomes. The Development adapter is deterministic and non-network; `runCommunicationDeliveryCycle` rejects Production. The current production gap is therefore not another queue schema: it is a chosen provider and credential boundary, actual sender/content contract, provider execution runtime, and (if supported) authenticated callback/status reconciliation.

The PRD and B22 discovery docs mention WhatsApp as a Stage 2 channel, but neither current implementation nor the provider-neutral contract selects a vendor. Current channel support is not evidence of a selected provider. Provider credentials, sender identity, approved templates/content constraints, public callback, opt-out handling, and deployment environment are not available in this repository’s verified state.

## Payments Current State

B19 is canonical for fees/plans, immutable issued invoice documents, payments, allocations, corrections, outstanding amount, and settlement status. Payment reversal uses separate correction evidence; invoice void is a distinct command and cannot proceed while a valid payment remains. B24 stores payment intents, normalized provider events and reconciliation outcomes; it quarantines mismatches and makes B19 settlement only through its reconciliation path. B27 adds one Midtrans BI-SNAP Dynamic QRIS sandbox adapter; it does not replace B19/B24, add another method/provider, or enable Production.

Code capabilities include a fixed sandbox host, server-derived invoice amount, safe `CONFIGURED/NOT_CONFIGURED/DISABLED` availability, request/order idempotency, query/recovery, callback signature/freshness verification, replay identity, and fail-closed Production behavior. The outstanding B27 item is operational: credentials, public callback availability, and official sandbox E2E. No additional payment implementation is recommended for B28 absent a newly demonstrated code defect. Do not add VA or claim Production readiness.

## Pilot Readiness Current State

B26 authorizes `school.readiness.read` for organization owner, school admin, and principal roles, then reads one school through authenticated/RLS context and returns safe aggregates gated by domain capabilities. It reports school, academic/SIS, teaching, portal, admissions, finance, and communication setup with statuses/actions; it does not return student/guardian names, contacts, invoice facts, or payment records. It performs no repair or write.

Its `ONLINE_PAYMENT_PROVIDER` and `EXTERNAL_COMMUNICATION_PROVIDER` checks remain `MANUAL_FALLBACK`. That remains the safe real-school pilot posture: B27 is sandbox-only and external communication has no Production adapter. B26 does not establish a real school’s acceptance, scope, training, named support owner, or data-quality signoff. Its readiness projection could later add explicit non-production diagnostics if operators need them, but this is not a blocker to a bounded CRM batch.

## Security / Authorization Baseline

- Tenant ownership is carried by organization/school columns, composite foreign keys, forced RLS, and purpose-built `SECURITY DEFINER` RPCs with explicit permission checks and restricted execute grants (for example B18 and B23 migrations). B20/B22/B25 use school-scoped policies and authorization. B26’s school ID is only a selector; the server reads and checks the school before returning scoped aggregates.
- `PermissionGate` and route visibility are user experience only. A B28 lead feature must enforce capability and tenant scope inside server/domain commands and at the database/RLS boundary; no trusting browser-supplied organization, school, status, owner, or conversion facts.
- Admissions contains applicant/guardian PII. Keep access limited to the active school; do not reveal whether a duplicate exists in another school. Define purpose, consent, retention, correction/erasure, and safe export policy before collecting more lead data.
- If B28 introduces lead records, preserve command request/idempotency and optimistic concurrency patterns from B18/B23, append-only history/audit, school-scoped assignment validation, bounded text, and safe error translation. Keep public/anonymous intake out of the proposed first scope unless abuse/rate limiting and consent requirements are explicitly decided.
- B19/B24/B27 payment mutations are server/database-authoritative; service-role calls remain server-only. Midtrans callbacks are verified before B24 reconciliation. Production provider origin is not client-selectable.
- External communication must retain B25 consent/contact eligibility checks, secret isolation, server-only destination access, provider callback authentication/replay control, and delivery idempotency. A successful queue claim is not proof a message was sent.

## Stage 2 Gap Matrix

| Area                            | Classification                 | Why                                                                                                    |
| ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Admissions Core                 | COMPLETE                       | Formal intake, review/decision, consent/history, and SIS conversion exist in B18.                      |
| Admissions Funnel               | PARTIAL                        | B23 counts applications and post-application follow-up; it does not model prospective leads.           |
| Admissions CRM                  | MISSING                        | No pre-application lead, assignment/source pipeline, duplicate workflow, or lead conversion.           |
| Finance Core                    | COMPLETE                       | B19 is the canonical billing/accounting implementation.                                                |
| Manual Payments                 | COMPLETE                       | B19 records and allocates manual payments with correction/reversal boundaries.                         |
| Online Payment Foundation       | COMPLETE                       | B24 intent/event/reconciliation architecture is implemented.                                           |
| First Gateway Adapter           | COMPLETE — SANDBOX CODE        | B27 implements one fixed-host sandbox QRIS method. No production gateway is enabled.                   |
| Gateway Sandbox E2E             | EXTERNAL DEPENDENCY            | Midtrans merchant credentials/public callback/simulator execution unavailable; no known code gap.      |
| Communication Center            | COMPLETE — IN-APP              | B20 announcement and notification/read path exists.                                                    |
| Delivery Foundation             | COMPLETE — PROVIDER-NEUTRAL    | B22 durable delivery job/recipient/attempt model exists.                                               |
| Delivery Operations             | COMPLETE — DEV ADAPTER         | B25 consent, contact eligibility, lease, retry, recovery, pause, and safe operator views exist.        |
| First External Provider         | MISSING                        | No real external sender/API adapter is selected or configured.                                         |
| Production Worker Runtime       | MISSING                        | Production delivery is intentionally blocked; no deployed production executor is in source.            |
| Midtrans Provider Callback      | COMPLETE IN CODE; E2E EXTERNAL | Signed callback path and processing exist; remote callback has not been exercised.                     |
| Communication Provider Callback | MISSING                        | No external communication provider webhook/authentication/normalization path exists.                   |
| Pilot Readiness                 | COMPLETE FOR CURRENT SAFE PATH | Read-only manual-payment/in-app readiness checks are implemented; integration-health depth is partial. |
| Real-School Acceptance          | EXTERNAL DEPENDENCY            | Requires school-specific scope, owner confirmation, operational readiness, and acceptance evidence.    |

## B28 Candidate Scopes

### Candidate #1 — School-Scoped Pre-Application Inquiry & Lead Management

**Value HIGH; Stage 2 impact HIGH; complexity HIGH; security risk HIGH; external dependency risk LOW.** Primary persona: admissions staff/lead owner, with school leadership reviewing pipeline. It closes the missing PPDB/CRM boundary before a formal B18 application and can be tested using synthetic Development records without a provider account or real school data.

**Existing seam:** B18 `admission_cycles`, `admission_applications`, consent/history/conversion and `admission.*` capabilities; B23 application follow-up/funnel. Do not attach leads to B23’s application-only FK or merge lead stages into B18 application statuses.

**Likely data impact:** one school-scoped pre-application lead/inquiry record, one append-only lead activity history, and an idempotent command ledger. Likely fields include channel/source, bounded prospect/guardian contact, owner, agreed lifecycle status, next action date, and optional link to a B18 application after conversion. New enum or controlled source table and a dedicated least-privilege capability may be needed. Avoid a campaign builder/table until usage rules require it.

**Likely UI:** extend the authenticated Admissions workspace with a school-scoped inquiry queue and detail/activity panel. The proposed first scope is staff-entered leads only; no new public intake route.

**Dependencies:** B18 school/cycle/applicant model and B23 scoped staff assignment are AVAILABLE. Product lifecycle/consent/duplicate rules are UNKNOWN and must be approved. No provider credential, Production access, or real applicant is required.

**Security/test feasibility:** force RLS, composite tenant FKs, same-school owner validation, explicit server authorization, no cross-school duplicate oracle, bounded PII projection, audit/history and idempotent conversion. Test state transitions, duplicate warning behavior, cross-school/anonymous denial, concurrent create/convert, link-to-B18 invariants, browser localization/responsiveness/accessibility/network payload, validators, and synthetic-only mutation accounting. Deterministic permanent closure is feasible without an external account once process decisions are frozen.

### Candidate #2 — First External Communication Provider Path

**Value HIGH; Stage 2 impact HIGH; complexity HIGH; security risk HIGH; external dependency risk HIGH.** Primary personas: school communication operator and guardian/student recipient. It would extend B22/B25 jobs and the adapter seam with one selected channel/provider, real outbound request, safe provider reference/status mapping, and callback/retry contract.

**Likely impact:** provider adapter/config secret boundary; possibly a callback event identity/inbox if the chosen vendor supports callbacks; content/template mapping; provider message reference/status projection; an actual worker invocation path. Existing B25 tables/RPCs should be reused where the chosen provider’s semantics fit.

**Dependencies:** provider/vendor decision UNKNOWN; account credentials, approved sender identity, opt-in/contact eligibility policy, template/approval IDs for templated channels, callback HTTPS endpoint and production worker/secret deployment are UNKNOWN or EXTERNAL BLOCKERS. PRD mentions WhatsApp and email, but source does not lock a vendor. Without a sandbox account, a real-delivery definition of done cannot pass.

**Test feasibility:** deterministic adapter/callback contract and adversarial auth/replay tests are possible locally, but complete provider UAT needs external sandbox/sender setup. Defer until provider and operational prerequisites are confirmed; do not silently pick WhatsApp/vendor.

### Candidate #3 — Production Communication Worker Runtime

**Value MEDIUM; Stage 2 impact MEDIUM; complexity HIGH; security risk HIGH; external deployment dependency MEDIUM/HIGH.** It would provide a scheduled/service-owned executor over B25 claim/lease/finalize/recovery RPCs, telemetry and safe shutdown/recovery behavior, with the real provider still behind the adapter boundary.

**Existing seam:** `runCommunicationDeliveryCycle`, `b25_claim_delivery_batch`, `b25_resolve_claimed_delivery`, `b25_finalize_delivery_attempt`, and recovery/lease operations. Existing Production guard must remain until approved configuration exists.

**Dependencies:** runtime host/scheduler, service credential delivery, monitoring/alert ownership, deployment/release process are UNKNOWN. A worker with only the deterministic Development adapter cannot deliver school value. This should follow provider/channel decisions and adapter contract, or be intentionally limited to an independently testable non-Production worker package.

**Test feasibility:** local concurrency/lease-expiry/idempotency/recovery tests can close code semantics; deployed runtime reliability needs an agreed non-production environment. Defer behind provider definition to avoid deploying a no-op production executor.

### Candidate #4 — In-Product Pilot Support Exception Workflow

**Value MEDIUM; Stage 2 impact MEDIUM; complexity MEDIUM/HIGH; security risk MEDIUM; external dependency risk LOW.** It would turn B26’s manual issue/escalation guidance into school-scoped support case ownership, status, and resolution history.

**Existing seam:** B26 readiness statuses/actions and the support categories/runbook. This is not implemented as a case/ticket system; B26 intentionally remains read-only.

**Dependencies:** product/support decision on who owns cases, severity/SLA, school-visible vs internal notes, escalation path, retention, and whether an in-product case system is desired are UNKNOWN. B26’s runbook may be sufficient for initial pilot operations. Defer until actual school support feedback demonstrates repeated in-product need.

**Test feasibility:** synthetic case lifecycle and school isolation could be tested, but defining a new support workflow without operational feedback risks codifying the wrong process.

## Candidate Comparison

| Rank | Candidate                                   | Business value | Complexity  | Security risk | External dependency | Can close without external account?                   | Decision                                                                  |
| ---- | ------------------------------------------- | -------------- | ----------- | ------------- | ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| 1    | Pre-Application Inquiry & Lead Management   | HIGH           | HIGH        | HIGH          | LOW                 | YES, with approved process rules                      | Recommend; clear product-code gap in a named Stage 2 domain.              |
| 2    | First External Communication Provider Path  | HIGH           | HIGH        | HIGH          | HIGH                | NO for full delivery acceptance                       | Defer pending vendor/channel, credentials, sender, callback, and runtime. |
| 3    | Production Communication Worker Runtime     | MEDIUM         | HIGH        | HIGH          | MEDIUM/HIGH         | Only for code-level contract, not deployed operations | Defer until there is a selected provider and runtime owner.               |
| 4    | In-Product Pilot Support Exception Workflow | MEDIUM         | MEDIUM/HIGH | MEDIUM        | LOW                 | YES                                                   | Defer until real pilot operations show the runbook is insufficient.       |

Midtrans sandbox operationalization is a separate **external prerequisite**, not a B28 implementation candidate: the B27 code batch is closed and there is no known code gap; sandbox credentials and callback remain unavailable.

## Dependency / External Blocker Analysis

| Dependency                                                                          | State                                        | Candidate effect                                                                                            |
| ----------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| B18 applications, school-scoped admission permissions, conversion                   | AVAILABLE in current main/Development ledger | Enables a lead model to attach to the formal admissions process.                                            |
| B23 same-school active staff assignment and task/funnel contracts                   | AVAILABLE                                    | Reuse authorization semantics; its application FK means lead tasks need an intentional extension/model.     |
| CRM lifecycle, source taxonomy, assignment, dedupe, consent and conversion rules    | UNKNOWN / PRODUCT DECISION REQUIRED          | Blocks safe implementation scope freeze, not technical feasibility.                                         |
| Communication provider/channel/vendor                                               | UNKNOWN                                      | Blocks selection of adapter contract and provider-specific callback semantics.                              |
| Communication credentials/sender/template approvals/verified consent/callback HTTPS | UNKNOWN / EXTERNAL BLOCKER                   | Blocks actual provider delivery UAT and Production activation.                                              |
| Production worker host/scheduler/secret-management/monitoring owner                 | UNKNOWN                                      | Blocks Production worker release; not required for local CRM batch.                                         |
| Midtrans merchant sandbox credentials/public HTTPS callback                         | NOT AVAILABLE at B27 closure                 | Blocks B27 remote sandbox verification only; does not create a B28 code scope.                              |
| Real-school pilot owner, agreed workflow scope, training/support acceptance         | EXTERNAL OPERATIONAL DEPENDENCY              | B26 reports technical readiness only. Do alongside bounded code work; do not claim it from synthetic tests. |

## Recommended B28 Scope

### Batch 28 — School-Scoped Pre-Application Inquiry & Lead Management

**Why now:** after B18 and B23, formal applicant processing and post-submission follow-up exist, but the PRD’s PPDB/CRM intent still lacks the pre-application inquiry stage. A school-scoped CRM foundation provides value to admissions staff and uses the existing admissions domain rather than adding a parallel product. It has no external-provider dependency and can be validated with synthetic data.

**Canonical existing seams:** B18 admission cycle/application/guardian/consent/history/conversion model and `admission.*` authorization; B23 school-scoped assignee validation, append-only activity, idempotent commands, optimistic concurrency, and funnel UI. B23 tasks are application-bound and must not be reused for a lead by weakening their FK or invariants.

**Primary personas:** admissions staff operating within an authorized school; school leadership with read/review scope. Prospective applicants are represented as protected records, not authenticated app users in this first scope.

#### Explicit In-Scope Proposal

- Authenticated staff create and manage pre-application inquiry records within the active authorized school.
- A product-approved minimal lifecycle, source/channel taxonomy, optional same-school owner, and next-action date.
- Append-only, bounded activity history suitable for short operational notes; no call recordings or full chat transcripts.
- School-local search/filter and safe pipeline counts.
- Duplicate warning or review flow using only same-school authorized records; no cross-school existence disclosure or automatic merges.
- A product-approved conversion path that links/creates the corresponding B18 application without changing B18 decision states or SIS conversion behavior.
- Audit, request idempotency, concurrency handling, localization, and authorized browser/operator surface.

#### Explicit Out-of-Scope Proposal

- Public/anonymous lead form or a replacement for B18 public application submission.
- Marketing automation, lead scoring, campaign management/attribution dashboard, bulk imports, or cross-school lead sharing.
- External email, WhatsApp, SMS, templates, or automated outreach.
- Changing B18 application review/decision or accepted-application conversion to Student/Guardian/StudentEnrollment.
- B19/B24/B27 payment changes, Midtrans sandbox execution, Production payment activation, or new gateway/method.
- B26 readiness redesign, real-school acceptance, Production deployment, or Stage 2 completion claim.

Scope can be narrowed further if product-owner decisions favor a staff-only inquiry register before conversion behavior is defined. Do not implement until those choices are approved.

## Product Decisions Required

1. **Lead lifecycle:** choose a small state machine and terminal states. Options: minimal `new → contacted → qualified → converted/closed`, or a more detailed pipeline. Default recommendation: minimal states; do not duplicate B18 application statuses.
2. **Ownership:** optional individual assignee vs required owner vs unassigned school queue. Default: school queue with optional active staff assignee restricted to that school, matching B23 validation style.
3. **Source and contact channel:** controlled source/channel choices vs free text and whether campaign attribution is needed now. Default: small controlled source/channel set plus a bounded “other” value; defer campaign management.
4. **Duplicate policy:** warn, block, or merge based on same-school phone/email/guardian signals. Default: advisory same-school duplicate review; never automatic merge and never cross-school lookup.
5. **Conversion and consent:** whether staff can create a B18 application directly from a lead, required applicant/guardian fields, when/how policy-version consent is recorded, and how duplicate applicants are handled. Default: create/link a formal B18 application only through a new explicit idempotent command and its existing consent contract; do not create Student/Guardian/Enrollment until the existing B18 accepted-application conversion step.
6. **Contact purpose/retention:** inquiry follow-up purpose, retention window, correction/deletion path, and permitted note content. Default: operational purpose only, short bounded notes, defined retention before collecting any new personal fields.

These are product-process choices, not questions that source inspection can settle. No provider/vendor decision is needed for the recommended B28 scope.

## Suggested Release Gates

- Product decisions above are approved and encoded in a finite state transition table before migration/API work begins.
- Append-only migrations only; a B28 validator checks schema, RLS/FORCE RLS, grants, policies, tenant FKs, constraints, and no unsafe direct table writes.
- Server functions authenticate; database commands derive actor/school scope and check explicit capabilities. UI `PermissionGate` is not treated as authorization.
- Adversarial tests cover cross-school IDs, unknown IDs without an existence oracle, unauthorized roles, stale version, duplicate request/replay, concurrent create/convert, duplicate advisory policy, and no mutation of B18 lifecycle outside the approved conversion.
- PII review covers least-data capture, safe projection, no contact exposure to other schools, note bounds, audit/retention, and whether consent is required at capture or conversion.
- Deterministic unit/contract/SQL validation passes; targeted and full suite, TypeScript, lint/changed-scope format, build, migration parity, diff and credential/PII scans pass.
- Browser UAT uses existing synthetic Development personas and synthetic leads only: authorized Admissions operator, foreign-school denial, anonymous denial, conversion review, responsive widths, ID/EN, Light/Dark, keyboard focus, safe payload, console/network, and zero external provider calls.
- Release claims remain limited to the approved code capability. No real-school acceptance, external message, payment, or Production readiness is inferred.

## Recommended Follow-On Sequence

1. Obtain the CRM product decisions and approve/narrow B28 scope.
2. Implement and close B28 pre-application lead management against B18/B23 boundaries.
3. In parallel as operational discovery (not a code batch), select the external communication channel/provider and secure sender, consent, credentials, sandbox, callback, and runtime ownership. Then scope the first real delivery path as its own batch.
4. Close B27 Midtrans sandbox E2E when its external merchant credentials and authorized HTTPS callback are available; open a new implementation issue only if that execution reveals a genuine code defect.
5. Run a real-school pilot under B26’s manual-payment/in-app-communication fallbacks, record school-owner acceptance and operational feedback, and create code batches only for evidenced gaps.
6. Add a production communication worker after a provider contract and a non-production deployment target are selected; do not deploy a production no-op worker.

## Stage 2 Completion After B28

**NO.** B28 as recommended would close a CRM code gap, but the first external communication provider/runtime, Midtrans sandbox E2E, and real-school acceptance remain open. Real-school acceptance is operational and external; it should not be claimed as a software implementation result. Stage 2 stays open until those product and operational objectives are explicitly accepted or scoped out by the product owner.

## Discovery Mutation Accounting

- Source/product code changes: 0.
- Database migrations/schema changes: 0.
- Development product-data changes: 0.
- Development Auth changes: 0.
- Production access or changes: 0.
- Provider calls: 0.
- Real payments: 0.
- External messages: 0.
- Only discovery-worktree file added: `docs/batch-28/B28_SCOPE_DISCOVERY_REPORT.md`.
- Batch 28 implementation: NOT STARTED. No implementation branch created. Awaiting product-owner scope approval.
