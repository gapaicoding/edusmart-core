# EduSmart Batch 23 — Scope Discovery

## Current Main Baseline

- Discovery worktree: `feat/b23-scope-discovery`, clean at the start of discovery.
- `HEAD` and fetched `origin/main`: `e1cace3553e1c7c9f6dc237812d904623df1e513` (PR #17, B22 merge). Main had not advanced beyond that merge when checked.
- This is a repository/checked-in migration discovery. No live Supabase query or schema-parity assertion was made in this phase. Development and Production data were not mutated.
- Source precedence: current main and checked-in contracts over the [PRD](../PRD_EduSmart_School_Management_System.md) and older reports. The PRD's framework recommendation is historical; the application currently uses TanStack Start/Vite and Supabase.

## Approved Decisions

The user approved the proposed post-submission Admissions Follow-up & Funnel Foundation. The implementation constraints now lock: one open task per application; an active same-school staff/profile assignee; coded outcomes without free-text notes or copied contact PII; counts only for canonical B18 statuses; `admission.read` for reads and `admission.review` for commands where the actual grants are semantically suitable; no parallel application lifecycle.

## Closed Capability Baseline

| Domain                | Current checked-in capability                                                                                                                                                 | Boundary                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| B18 Admissions        | Public PPDB submission, cycles, application review/decision, stage history, processing consent, and accepted-application conversion to Student/Guardian plus draft enrollment | No staff follow-up task/ownership or funnel dashboard                  |
| B19 Finance           | Fee definitions, billing plans, invoices, offline payment recording/allocation, reversals, derived settlement, command idempotency                                            | No payment gateway, intent, or callback reconciliation                 |
| B20 Communication     | Draft/edit/publish, school/classroom audiences, immutable deduplicated profile-recipient snapshot, and B12 inbox notification at publication                                  | Publication is not an external send                                    |
| B21 UI                | Indonesian/English preference, Light/Dark theme and shared UI conventions                                                                                                     | Applies to all new surfaces                                            |
| B22 External delivery | Queued job, immutable B20-recipient linkage, per-recipient state, append-only attempt contract, idempotent enqueue, capability/RLS boundary, Development/test adapter         | No destination, production provider, worker, webhook, or real dispatch |

Evidence: [B18 foundation](../../supabase/migrations/20260925100000_b18_ppdb_admissions_foundation.sql), [B18 command runtime](../../supabase/migrations/20260925120000_b18_ppdb_admissions_commands_runtime.sql), [B19 foundation](../../supabase/migrations/20260926100000_b19_finance_billing_foundation.sql), [B19 runtime](../../supabase/migrations/20260926110000_b19_finance_billing_runtime.sql), [B20 core](../../supabase/migrations/20260926180000_b20_communication_center_core.sql), and [B22 delivery](../../supabase/migrations/20260928120000_b22_external_communication_delivery.sql). These are code/schema observations, not a claim that the live database was revalidated for B23.

## PRD / Roadmap Gap Analysis

The [Stage 2 roadmap](../PRD_EduSmart_School_Management_System.md) calls for PPDB/CRM, Finance with QRIS/VA, and a Communication Center including WhatsApp. Detailed PRD sections call for a lead-to-enrollment pipeline and funnel/conversion dashboard; online payment reconciliation; and external messaging. Comparing those requirements with the checked-in implementation:

| Requirement                                                              | Classification         | Evidence / qualification                                                                                                                |
| ------------------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Online PPDB form, admission review/decision, conversion to SIS           | Implemented            | B18 public submission, scoped commands, conversion record and draft enrollment                                                          |
| CRM follow-up ownership, due tasks, operational activity, funnel metrics | Not implemented        | B18 stores canonical application status/history but has no follow-up domain or funnel UI                                                |
| Pre-application leads, open-house/trial/interview stages                 | Not implemented        | B18 statuses are `submitted`, `under_review`, `accepted`, `rejected`, `withdrawn`, `converted`; they must not be silently reinterpreted |
| Offline billing, invoices, partial allocation, corrections               | Implemented            | B19 records offline cash/bank-transfer/other payments and derives settlement                                                            |
| QRIS/VA payment intent, provider callback and automatic reconciliation   | Not implemented        | No provider transaction/callback identity or gateway boundary in B19                                                                    |
| School/classroom announcement and in-app inbox                           | Implemented            | B20 publishes once, snapshots recipients, and creates notification recipients                                                           |
| Durable external-delivery request and retry/attempt _contract_           | Implemented            | B22 schema and UI; queued does not mean sent                                                                                            |
| Real WhatsApp/email delivery, consent/eligibility, webhook, worker       | Intentionally deferred | B22 `provider_key` is constrained to `unconfigured`; no production dispatch                                                             |
| Push notifications and email fallback                                    | Not implemented        | PRD direction, not a B12/B20/B22 capability                                                                                             |

This matrix treats the old PRD's broad Stage 2 labels as product intent, not proof that their vendor-dependent pieces exist.

## Current Architecture Inventory

- Admissions uses [server functions](../../src/lib/admissions.functions.ts), [domain server code](../../src/lib/admissions.server.ts), [schemas](../../src/lib/admissions.schemas.ts), [staff UI](../../src/components/admissions/admissions-ui.tsx), and B18 scoped `SECURITY DEFINER` commands. Applications carry organization/school/cycle/year/grade ownership; composite FKs and forced RLS protect dependent rows. `admission.read`, `admission.review`, `admission.decide`, `admission.convert`, and `admission.manage_cycle` are distinct capabilities. B18 command requests and row versioning protect retries/concurrent decisions. `admission_stage_history` records transitions; conversion is one per application.
- Finance uses [server functions](../../src/lib/finance.functions.ts), [domain server code](../../src/lib/finance.server.ts), and B19 invoices/payments/allocations/corrections. `b19_record_finance_payment` is an offline receipt command with command-key replay handling and invoice locking. It is not a gateway transaction.
- Communication uses [server functions](../../src/lib/communication.functions.ts) and [UI](../../src/components/communications/communication-center-ui.tsx). B20 profiles are immutable recipient identities after publication; B22 recipient rows FK to those snapshot rows. B22 uniqueness on `(announcement_id, channel)` prevents a second logical enqueue. Its recipient/attempt constraints and forced RLS do not constitute a production sending engine.
- B12 notifications remain the in-app inbox/read domain, not an external-provider queue. Organization, school, actor, and recipient boundaries are enforced in database contracts as well as server-side auth/capability checks. No raw role-name check should replace those boundaries.
- Searches of checked-in application/server code and repository infrastructure found no production background delivery runner, queue consumer, Supabase Edge Function, scheduler, or webhook endpoint. Current server functions are request-response oriented. This is a repository observation, not an assertion about separately deployed infrastructure.

## Remaining Stage 2 Capability Gaps

The clearest independently useful gap is staff operation of the existing admissions pipeline: who follows up, when, what outcome was recorded, and how each cycle is progressing. The other major gaps are online payment collection/reconciliation and safe external-message execution. Both are materially larger, provider-dependent side-effect domains.

## Candidate A — External Communication

**Value:** turns B22's durable requests into actual outbound messages. **But a production send is not one adapter call.** B20/B22 snapshot _profile identity_, not contact destinations. Current potential sources include optional `profiles.phone`, `guardians.phone/email`, admission contact fields, and auth email. Their presence does not establish normalization, ownership, verification, currentness, channel/purpose consent, or opt-out. `student_guardians.can_receive_notification` is not WhatsApp/email consent; B18 `admission_consents` covers application processing, not a general external broadcast.

A safe provider path needs destination eligibility and provenance; channel/purpose-specific consent and withdrawal; a publication-time versus send-time destination policy; templates and variable governance; server-only credentials; bounded worker and rate limits; durable provider-request idempotency; ambiguous-outcome reconciliation; provider IDs; verified/deduplicated/out-of-order webhooks; masked logs/retention. Provider acceptance, device delivery, and read are different states. A failed provider send must never roll back B20 publication. [Meta's official WhatsApp policy](https://business.whatsapp.com/policy/preview?lang=id_ID) requires a supplied number and opt-in, honoring opt-out, and approved templates for business-initiated messages. Those are external policy dependencies, not facts implied by a phone column.

Possible prerequisite batches are (1) External Destination Eligibility & Consent Foundation, then (2) outbound execution/provider adapter, then (3) webhook reconciliation where provider semantics require it. A production WhatsApp integration is too broad for B23 without policy decisions, approved templates, provider sandbox, and an operational worker. A standalone eligibility/consent foundation is coherent but has no immediately executable delivery in this cycle and introduces new child/family PII governance. It remains a strong later candidate once product/legal choices are made.

## Candidate B — External Payment

B19 supports invoice lifecycle and auditable offline payment recording, including partial allocation and reversal. It does not have a payment intent, provider transaction ID, QRIS/VA expiry, settlement record, or signed callback ingestion. A gateway increment would need invoice-to-intent cardinality, amount/partial/overpayment policy, expiry/cancellation/refund boundaries, provider-secret handling, signature verification, event replay/out-of-order deduplication, settlement and bank reconciliation, and tenant-safe audit trails. Existing B19 manual payment must not be rewritten as gateway truth. [Midtrans webhook documentation](https://docs.midtrans.com/docs/https-notification-webhooks) illustrates signed asynchronous notifications; [its invoice API](https://docs.midtrans.com/reference/create-invoice) illustrates provider-specific request idempotency. These are examples of dependencies, not a provider selection. Financial correctness plus vendor sandbox and policy choices make this higher-risk than the proposed B23 increment.

## Candidate C — PPDB / CRM

B18 already stores scoped applications, stage transitions, guardian contact details, processing consent, and conversion to SIS. It lacks staff follow-up assignment/due work and cycle funnel metrics. A bounded **post-submission follow-up and funnel** increment can operate on existing applications, use canonical B18 status/history rather than inventing parallel application states, and be verified with synthetic Development applications without an external vendor. It unlocks usable CRM operation and later lead acquisition/automation. It does not itself send messages or authorize marketing contact.

## Other Candidate if Found

No more fundamental Stage 2 blocker was found in the checked-in modules. The absence of a general worker is important for future integrations, but a generic queue platform without a defined first external side effect would be premature. Generated Supabase types and live schema parity should be checked at implementation start; neither changes the choice of product increment here.

## Dependency Analysis

| Candidate                                   | Hard / security dependencies                                                                                                                                | Operational / testing dependencies                                                         | Decision for B23                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Real communication provider                 | Verified/eligible destination, purpose-specific consent/opt-out, template policy, worker, secrets, provider request and webhook identity, scoped PII access | Provider account/sandbox, synthetic destinations, webhook simulator, rate/retention policy | Defer; too many unresolved prerequisites                             |
| External destination/consent foundation     | Contact provenance, verified/normalized endpoint model, guardian/student ownership and revocation rules, destination snapshot decision                      | Product/legal consent wording and retention decision                                       | Coherent future prerequisite, but not chosen before policy decisions |
| Payment gateway                             | Intent/invoice model, signed/replayed callback handling, settlement accounting, refund/overpayment policy, tenant isolation                                 | Gateway contract/sandbox and financial reconciliation owner                                | Defer; high financial and vendor coupling                            |
| Post-submission admissions follow-up/funnel | Existing B18 applications/capabilities/RLS; scoped staff assignment; auditable commands; child/contact minimization                                         | Synthetic B18 cycle/applications and deterministic clock/concurrency tests                 | Recommend; bounded and testable without provider                     |

## Security & PII Analysis

- Admissions already holds minor/applicant and guardian PII. B23 should reference application IDs and scoped assignee profile IDs, not duplicate phone/email. Funnel output should aggregate by school/cycle/status and not expose applicant identities. Staff task detail should disclose no more than the B18 application read contract already permits.
- The exact staff assignment rule must verify active school membership/capability, not accept a client-supplied profile ID blindly. `admission.read` may authorize view and `admission.review` may authorize operational follow-up commands if semantic review confirms this; use a new capability only if those grants are too broad. Parent/student/anonymous actors must not read tasks or funnel details.
- New tables, if approved later, need organization/school/application composite ownership, forced RLS, minimal direct grants, authenticated scoped RPCs, and no service-role ordinary CRUD shortcut. Use safe denial messages and test guessed IDs across school/organization boundaries.
- Avoid free-form contact transcripts in the first increment; they invite sensitive child/guardian disclosures and retention ambiguity. If an outcome note is necessary, bound its length and define retention/access before implementation.
- For future messaging, raw contact and provider payloads must not enter browser bundles, broad UI projections, or logs. Mask destination data and decide retention/encryption/key management before any real send.

## Idempotency / Concurrency Analysis

- Proposed follow-up commands should have stable actor/request keys, command fingerprint/replay handling, and row-level serialization or version checks for concurrent complete/reassign operations. One active task per application/purpose may be appropriate, but uniqueness must be decided against real workflow (multiple sequential contacts should remain auditable). Completed activity must not be overwritten. Funnel counts derive from canonical B18 status/history, not a second editable status.
- B22 protects enqueue identity with `(announcement_id, channel)` and snapshot-recipient uniqueness, but provider attempts are not a proof of exactly-once external side effect after network ambiguity. A future worker needs a durable claim lease, provider idempotency key if supported, unknown-outcome reconciliation, bounded retries, and no resend of confirmed success.
- A future payment path needs stable invoice/intent/provider-event keys and transactionally deduplicated callbacks; callback order must not regress an already-settled invoice.

## External Integration / Webhook Analysis

No external integration is proposed for B23. Future provider callbacks need signature verification, bounded parsing, replay/event deduplication, out-of-order state transition rules, safe tenant/provider routing, audit history, and a defined raw-payload retention policy. Domain statuses must distinguish provider acceptance from delivered/read or settled. Vendor payload/authentication formats belong behind adapters, not in generic B20/B22 or B19 UI.

## Operational Runtime Analysis

No checked-in production worker, cron processor, Edge Function, or webhook ingress was found. A browser/TanStack server request must not synchronously broadcast to hundreds of recipients or perform bulk gateway reconciliation. Future side-effect batches need a bounded, observable asynchronous execution/deployment boundary. The recommended B23 follow-up/funnel scope can use ordinary authenticated commands and read projections without adding such infrastructure.

## UI / UX Impact

- Proposed: a school/cycle-scoped follow-up queue and small funnel summary on existing Admissions pages; application detail shows assignment, due date, coded outcome/activity and history. Keep B18 status/decision controls separate.
- Follow B21 patterns: Indonesian default and English alternate, Light/Dark semantic tokens, static page identity during loading, safe empty/error/success states, accessible labels/focus, and 375/768/1440 layouts. Overdue indicators are derived from due time and active state, not a new application status.
- Future provider/payment UI would need explicit queued-versus-sent and pending-versus-settled wording, plus masked PII; none is in the proposed B23 UI.

## Testability

The proposed increment can use synthetic Development cycles/applications and staff identities: task create/assign/reassign/complete/replay, due/overdue boundary, concurrent commands, funnel counts across canonical statuses and conversion, school/tenant tampering, unauthorized/parent/student denial, locale/theme/responsive/accessibility, and B18 conversion regression. No real messages or payment transactions are needed. Any eventual live Development fixture mutation should be separately authorized and accounted for during implementation, not discovery.

## Explicit Non-Goals

No implementation in this discovery; no schema change or seed. Proposed B23 would not add pre-application lead capture, a second application stage machine, outbound WhatsApp/email/SMS/push, automated reminders, provider credentials, payment gateway, marketing segmentation, AI, or a generic background-task platform. B18 decision/conversion and B20/B22 publication/delivery semantics remain unchanged.

## Recommended Batch 23 Scope

**Batch 23 — Admissions Follow-up & Funnel Foundation (post-submission).** This is the highest-cohesion next increment because the PRD calls for CRM follow-up and funnel visibility, while B18 already supplies authoritative school-scoped applications, status history, and conversion. It delivers operational value without pretending that B22 is ready to send or that B19 can accept online payments. It unlocks later lead intake, workflow automation, and consent-aware communication triggers without coupling those concerns now.

## Proposed In-Scope

1. Staff follow-up tasks attached only to existing B18 submitted applications, with scoped assignee, due time, bounded coded outcome, timestamps, and append-only activity/audit.
2. Idempotent, concurrency-safe create/assign/complete commands behind authenticated capability and forced-RLS boundaries; retain B18 status and decision ownership.
3. School/cycle-scoped queue and overdue filter plus funnel counts from canonical B18 statuses and conversion, not duplicated stage state.
4. Localized, themed, responsive, accessible UI and focused security/domain/browser regression tests.

## Proposed Out-of-Scope

Pre-application leads or new PRD stages; free-form marketing CRM; automatic messages/reminders; WhatsApp/email provider; worker/webhook; payment gateway; changes to B18 conversion semantics; cross-domain contact copying. No Production mutation or external side effect as a release test.

## Migration Impact

**Expected: YES, only after scope approval.** Likely append-only follow-up task/activity tables, scoped composite FKs, uniqueness/indexes, forced RLS and authenticated command/read RPCs. Exact DDL, capability reuse versus a new permission, and retention policy must be designed and validated during implementation. No migration was created during discovery.

## Security Model

B18 school/organization ownership remains authoritative; use `requireSupabaseAuth` or the current equivalent at server boundaries, scoped capability checks, and database RLS/RPC enforcement. Staff assignee eligibility must be verified server/database-side. No raw role authorization, client-trusted school ID, service-role shortcut, or new broad contact projection. Deny parent/student/anonymous access and cross-tenant/school ID tampering. Maintain safe user-facing errors.

## Test Strategy

Start with B18 contract tests; add task lifecycle, immutable activity, replay/concurrency, invalid assignee, due-date boundaries, funnel projections, privilege and tenant isolation tests. Re-run B18–B22 and B12 regressions, full tests/typecheck/build/lint/format, migration dry-run/Development validator, and four-persona browser security smoke. Verify ID/EN, Light/Dark, 375/768/1440, keyboard/focus, console/network, and zero external/Production mutations.

## Risks

- Follow-up assignment could leak applicant PII if scoped only in UI; enforce database-side ownership/capability.
- Concurrent completion/reassignment could lose audit data without command keys/versioning.
- A free-text note or copied contact field could broaden sensitive-data retention; defer unless explicitly governed.
- Funnel metrics can mislead if status history and current status are mixed; define counts and conversion denominator by admission cycle before implementation.
- `admission.review` may be too broad or too narrow for task management; inspect existing grants before finalizing permission design.

## Questions Resolved by Scope Approval

1. Assignees must be active, eligible staff with same-school assignment and active organization/school membership. Task changes use the existing review capability; implementation verified the checked-in B18 grants and adds no permission.
2. At most one open task per application. Terminal task history remains, and a later task may be created.
3. Due time is stored as `timestamptz`; overdue is derived. Completion outcomes are bounded codes. Notes and copied applicant/guardian contact data are excluded.
4. Funnel shows counts for total, submitted, under review, accepted, rejected, withdrawn, and converted from current B18 application status. Percentages and a parallel stage system are excluded.

These approved decisions govern implementation. Live Development migration validation and browser/security UAT remain release gates.

## Decision

**BATCH 23 SCOPE DISCOVERY COMPLETE**

**Recommended Batch 23:** Admissions Follow-up & Funnel Foundation (post-submission).

**BATCH 23 SCOPE LOCK: APPROVED BY USER.** Implementation began in `feat/b23-admissions-followup-funnel` after approval. The scope remains post-submission follow-up and counts-only funnel for existing B18 applications. No Development/Production mutation or external transaction occurred during discovery.
