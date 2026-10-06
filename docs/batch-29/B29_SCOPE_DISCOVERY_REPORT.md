# Batch 29 Scope Discovery

Discovery only. No product source, database schema, authorization data, or migrations were changed. Batch 29 implementation has not started.

## Current Main Baseline

- Canonical checkout: `D:\edusmart-core`, branch `main`; working tree was clean before discovery and remained unchanged except for this report.
- `origin/main` and local `main`: `91fcead8d8b43c653f1f72b1ef581826aa2f58ed`.
- B28 merge `427311cc4df6615122b886cae77fef808542347b` and closure documentation commit `91fcead8d8b43c653f1f72b1ef581826aa2f58ed` are ancestors of current `origin/main`.
- Current Development project was read through the linked Supabase CLI. Local migrations: 106; Development migration ledger: 106; latest: `20261005110000` (106 = 106).
- Read-only Development snapshot: seven delivery jobs, all `provider_key='unconfigured'` (one WhatsApp and six email); 12 recipient rows were skipped, two are `sent`, and two are `failed`. “Sent” here is the Development executor's adapter-accepted state, not evidence of a real communication provider send. There is no `cron.job` relation. This snapshot is operational evidence only and does not replace code review.

## Stage 2 Current State

| Stage 2 capability     | Current state                | Evidence / remaining gap                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finance and billing    | PARTIAL                      | B19 provides billing and manual payment records. B24 adds provider-neutral online-payment intent and reconciliation contracts. B27 implements Midtrans BI-SNAP dynamic QRIS in sandbox only. Production credentials and a verified remote provider lifecycle are not established; VA is absent. |
| PPDB and CRM           | PARTIAL (core present)       | B18 owns application intake/review/conversion; B23 provides follow-up and funnel; B28 adds school-scoped pre-application leads and conversion to B18. PRD's basic pipeline is substantially represented. Richer school-custom intake/CRM workflows remain beyond these batches.                 |
| Communication Center   | PARTIAL                      | B20 provides school/class-targeted in-app announcements that feed the existing notification inbox. B22/B25 add external delivery queue and Development operations. Actual WhatsApp/email execution is not available.                                                                            |
| QRIS / Virtual Account | PARTIAL                      | QRIS sandbox integration exists. No VA method appears in B27's allowed order method or in the Finance UI; the B27 regression contract expressly excludes VA.                                                                                                                                    |
| Broadcast WhatsApp     | PARTIAL / external-dependent | Announcement and audience domain plus a WhatsApp delivery queue exist. The provider is fixed to `unconfigured`; no actual WhatsApp send, provider template model, or communication delivery receipt path exists.                                                                                |

Stage 2 is OPEN. These delivered foundations do not mean Stage 2 is complete: its advertised online payment and WhatsApp broadcast outcomes still have external execution gaps.

## B20 Communication Center Audit

**Implemented:** `communication_announcements` and immutable published snapshots (`communication_announcement_targets`, `communication_announcement_recipients`) provide school-scoped drafts and publication. Targets represent school/classroom scope and audience selection. `b20_publish_announcement` creates/reuses canonical B12 `notifications` and `notification_recipients`; the notification inbox/read model is reused rather than duplicated. Announcement states are `draft` and `published`. Staff actions use `notification.send`, school/organization scope checks, server RPCs, and RLS; recipients can read only their own published notification.

**Channels and user flows:** in-app notifications are the functioning B20 channel. Staff can create/edit/publish announcements and target a school/class audience; recipients see/read them in the established inbox. B20 itself does not deliver email, WhatsApp, SMS, or mobile push. A push preference or in-app inbox is not push delivery.

**Classification:** announcement authoring and in-app publication: COMPLETE for this batch's stated scope; school/audience isolation: COMPLETE in the implemented boundary; external delivery: MISSING in B20 and added only as a later queue foundation. B20 migration: `supabase/migrations/20260926180000_b20_communication_center_core.sql` (tables at lines 7, 32, 60; publish path around line 301; B12 notification fanout around line 364). UI/routes: `src/components/communications/communication-center-ui.tsx`, `src/routes/_authenticated/communications/`.

## B22 Delivery Foundation Audit

B22 adds `communication_delivery_jobs`, `communication_delivery_recipients`, and append-only `communication_delivery_attempts`. Jobs link to the immutable B20 recipient snapshot, have one unique logical job per announcement/channel, and accept `whatsapp` or `email`. Provider key is constrained to `unconfigured`. Recipient status, bounded attempt metadata, next-attempt time, failure classification, attempt identity, and immutable event history are persisted. RPCs enqueue and list jobs; capability and organization/school scope are checked. Tables are RLS/forced-RLS protected and ordinary browser table access is revoked.

This is primarily **durable delivery orchestration data and a command contract**, not external execution. It intentionally does not persist a copied recipient address, contact the network, or integrate a provider. Foundation source: `supabase/migrations/20260928120000_b22_external_communication_delivery.sql`; validator: `supabase/validation/validate_b22_external_communication_delivery.sql`; tests: `src/lib/b22-external-communication-delivery.test.js` and `src/lib/b22-delivery-adapter.test.js`.

## B25 Delivery Operations Audit

B25 materially extends the B22 foundation and already implements much of the proposed worker's **database lifecycle**, so B29 must not rebuild it:

- Operational contact preference/consent and append-only preference evidence are school scoped; the trusted resolver reads a current, eligible guardian contact only at execution time. Raw destinations are not returned to the operator projection.
- `b25_claim_delivery_batch` validates actor/school capability, uses row locks with `FOR UPDATE ... SKIP LOCKED`, limits batch and lease duration, creates claim tokens, and records attempt-start events. Claim RPCs are revoked from browser roles and granted only to `service_role`.
- Claim tokens and expiring leases gate resolution/finalization. Expired leases are converted to an immutable unknown/worker-expired attempt and bounded retry state on a later claim cycle.
- Attempts are append-only with unique start/final events per recipient/attempt. Outcomes are accepted, retryable failure, permanent failure, or safe skip. Maximum attempts are three. Retry delays are persisted using a bounded exponential expression (30 seconds, then 60 seconds for the first two retry windows).
- Pause/resume and capability-authorized, request-idempotent manual retry/requeue are available. Terminal, non-retryable, exhausted, active-lease, or ineligible work is not an allowed operator retry target.
- An operations projection exposes status counts, retry eligibility, lease-age/stuck indicators, and masked destination; a Communication Center UI button can invoke a bounded Development execution cycle.
- `runCommunicationDeliveryCycle` in `src/lib/communication-operations.server.ts` validates the operator using the caller's scoped client, then uses a server-only admin client for service-role RPCs and the deterministic Development adapter. It explicitly throws when `NODE_ENV='production'`. The current adapter in `src/lib/communication-delivery.adapters.server.ts` performs no network I/O and accepts only synthetic/test destinations.

Thus B25 includes a manually initiated, server-side Development worker **cycle**, not a persistent asynchronous worker service. The worker cycle and controls exist, but are gated from Production. B25's runbook states no provider adapter, provider credential, production scheduler, or production external dispatch, and warns that a remote send may be duplicated if a provider accepted it before a worker crashed before finalization (`docs/batch-25/B25_OPERATIONS_RUNBOOK.md`, especially lines 25–41).

## Existing Worker / Queue Runtime

Statuses use IMPLEMENTED / PARTIAL / MISSING. “Implemented” means the code behavior exists; it does not imply an always-on production process or third-party exactly-once delivery.

| Capability                                | State                          | Current evidence / boundary                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Atomic job/recipient claim             | IMPLEMENTED                    | B25 claim RPC selects eligible recipient rows with `FOR UPDATE ... SKIP LOCKED`.                                                                                                                                                           |
| B. Concurrency-safe worker ownership      | IMPLEMENTED                    | Transactional row lock plus unique active claim token and lease state.                                                                                                                                                                     |
| C. Lease/lock expiration                  | IMPLEMENTED                    | Claim token, `lease_expires_at`, and constrained lease duration.                                                                                                                                                                           |
| D. Duplicate-worker prevention            | IMPLEMENTED (claim boundary)   | Competing claimers skip locked rows; active claim token uniqueness. Does not guarantee provider exactly-once.                                                                                                                              |
| E. Idempotent execution                   | PARTIAL                        | Enqueue identity, operator request identity, and DB attempt uniqueness exist. Test adapter idempotency is an in-memory `Map`; there is no durable provider idempotency contract, and a crash after remote acceptance can duplicate a send. |
| F. Retry scheduling                       | IMPLEMENTED (bounded)          | Failed retryable rows use `next_attempt_at`; claim checks due time.                                                                                                                                                                        |
| G. Exponential/backoff policy             | IMPLEMENTED (simple bounded)   | SQL sets 30s/60s retry delays (`least(900, 30 * 2^(attempt-1))`); no randomized jitter is present.                                                                                                                                         |
| H. Transient/permanent classification     | IMPLEMENTED (adapter contract) | Typed accepted/retryable/permanent outcomes and safe failure codes. Provider-specific mapping is absent.                                                                                                                                   |
| I. Maximum attempts                       | IMPLEMENTED                    | Three attempts enforced in table constraints and claim/finalize rules.                                                                                                                                                                     |
| J. Terminal failure/dead letter           | PARTIAL                        | Exhausted/permanent outcomes become terminal failed/completed-with-errors and are visible. There is no separate dead-letter queue or distinct operator workflow.                                                                           |
| K. Stuck-job recovery                     | IMPLEMENTED (claim-triggered)  | Expired lease is recovered on a subsequent claim invocation. There is no independent sweeper, so recovery requires a future cycle.                                                                                                         |
| L. Worker heartbeat/health                | MISSING                        | No worker registry, heartbeat, liveness endpoint, or runtime health alert. B26 readiness reports provider unavailability, not a running worker.                                                                                            |
| M. Safe manual retry/requeue              | IMPLEMENTED                    | `b25_request_delivery_retry` checks operator capability, eligibility, attempt bound, and idempotent request ID.                                                                                                                            |
| N. Delivery attempt audit                 | IMPLEMENTED                    | Append-only start/final/unknown events with safe codes and optional provider message reference. No separate retention/rotation policy found.                                                                                               |
| O. School/tenant isolation                | IMPLEMENTED (DB boundary)      | Actor capability and selected school are checked; job/recipient/attempt records carry composite school/org relationships; ops are school-scoped.                                                                                           |
| P. Graceful worker crash recovery         | PARTIAL                        | Expired leases restore queue eligibility; result ambiguity after provider accepted but before DB finalization remains unsolved without provider idempotency/reconciliation.                                                                |
| Q. Deterministic Development test adapter | IMPLEMENTED                    | `createDevelopmentTestDeliveryAdapter`; rejects non-synthetic destinations and does no network I/O.                                                                                                                                        |
| R. Worker observability/metrics           | PARTIAL                        | Operator UI/projection exposes job and recipient counts plus stale leases. No worker heartbeat, latency/throughput/error metrics, alerting, or multi-school fleet health.                                                                  |
| S. Scheduler/trigger                      | PARTIAL                        | Staff can click a Development-only “Run Development executor” action. No scheduled trigger or queue poller is present. Development DB check found no `cron.job` relation.                                                                  |
| T. Production execution entrypoint        | MISSING                        | The only cycle is a browser-requested server function, production explicitly fails closed, and no persistent worker entrypoint, deployment service, or scheduler exists. No `supabase/functions` directory is present.                     |

Evidence: B25 migrations `20261002100000_b25_communication_delivery_operations.sql`, `20261002110000_b25_delivery_projection_and_recovery.sql`, `20261002120000_b25_delivery_contact_operator_projection.sql`, and `20261002130000_b25_contact_preference_event_evidence_replay_fix.sql`; server functions in `src/lib/communication-operations.server.ts` and `src/lib/communication.functions.ts`; tests `src/lib/b25-communication-delivery-operations.test.js`; operations UI in `src/components/communications/communication-center-ui.tsx`.

## External Communication Provider State

- Real communication provider implemented: **NO**.
- Production-capable communication adapter: **NO**. The only adapter is test/Development-only.
- Production worker: **NO**; production execution is explicitly fail-closed.
- External send execution: **NO**. Development “accepted/sent” records are simulated by the non-network adapter.
- Communication webhook/callback: **NO**.
- Communication provider delivery receipt handling: **NO**. B22 has status vocabulary for future provider events, but no receipt ingress or provider-event normalization for communication.
- Communication provider credentials/configuration: **NO**. Delivery rows require `provider_key='unconfigured'`.
- Production communication-provider configuration: **NO**.
- Do not confuse B27: it is a Midtrans **payment** sandbox client and QRIS payment notification handler, not a communication provider.

## Payment / VA State

Virtual Account implemented: **NO**. B27 SQL constrains the new order method to `qris`; Finance UI exposes a QRIS Sandbox option, and tests prohibit Virtual Account/Xendit/refund labels. B27 payment callbacks are payment-specific only. Current payment state is **PARTIAL** against Stage 2: manual B19 billing/payment remains; B24 provides provider-neutral online intent/reconciliation; B27 supports dynamic QRIS in sandbox, while live sandbox end-to-end verification was blocked by unavailable credentials/callback setup and Production is disabled. PRD names QRIS and VA together (`docs/PRD_EduSmart_School_Management_System.md`, Stage 2 around lines 523–531; B27 contract, `docs/batch-27/B27_MIDTRANS_INTEGRATION_CONTRACT.md`).

Should VA be B29: **NO**. VA is a material Stage 2 gap, but it is a separate payment method/provider contract, with provider sandbox/credential and reconciliation decisions. It does not close the missing communication dispatch path and should be a later payment-specific batch after the product owner prioritizes gateway breadth and confirms provider prerequisites. It would not be deterministic to claim a real provider lifecycle without those dependencies.

## WhatsApp Broadcast State

| Capability                      | State                               | Notes                                                                                                                                                                                                                                                   |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign/broadcast domain       | PARTIAL                             | School/class announcement domain exists; there is no separate marketing-campaign lifecycle.                                                                                                                                                             |
| Target audience                 | IMPLEMENTED (announcement snapshot) | B20 school/class targets resolve to immutable recipient snapshots and B12 notifications.                                                                                                                                                                |
| Provider-neutral delivery queue | IMPLEMENTED                         | B22 creates channel jobs/recipient rows linked to announcement recipients.                                                                                                                                                                              |
| Actual WhatsApp send            | MISSING                             | Provider remains unconfigured; no external request is made.                                                                                                                                                                                             |
| WhatsApp template model         | MISSING                             | No provider template/approval/version/language fields or template selection flow.                                                                                                                                                                       |
| Provider message ID             | PARTIAL                             | Schema can store a bounded message reference; deterministic adapter emits test references. No real provider IDs are obtained.                                                                                                                           |
| Delivery receipt/status         | MISSING                             | No WhatsApp webhook/callback or normalized receipt ingestion.                                                                                                                                                                                           |
| Opt-out/consent boundary        | PARTIAL / foundational              | B25 tracks purpose/channel consent and verified contact before resolving guardian destinations. Consent policy, legal basis, template consent, and provider-specific opt-out handling need a product/provider decision before real WhatsApp activation. |

## Candidate B29 Scopes

Ratings are relative to current source, not generic SaaS estimates.

| Candidate                                                          | Current gap and dependencies                                                                                                                                                                                                                                                   | Deterministic tests                                                                                          | Security / complexity / closure risk                                                                                                                      | Value and overlap                                                                                                                                            | Assessment                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| A. Communication Delivery Worker & Execution Runtime               | B25 has DB claim/lease/retry and an invoked Development cycle, but no persistent scheduler/worker, heartbeat, or Production entrypoint. Reuse B25; no provider account required if the adapter stays fake.                                                                     | HIGH. Fake adapter, local/Development DB, claim contention, injected crash and fake clock are deterministic. | Complexity MEDIUM–LARGE; high concurrency/duplicate-send and service-role risk; closure LOW–MEDIUM if explicitly no-real-send and deployment-independent. | Makes existing queue actually drain in a controlled runtime and prepares Stage 2 broadcast. Overlaps B25 foundations but not its missing persistent runtime. | **BEST NEXT BATCH**, with narrow scope: operationalize runtime and reliability boundary; do not rebuild B25 or promise real messages. |
| B. First external communication provider (e.g. WhatsApp Cloud API) | No adapter, account, credential, template lifecycle, or production config. Needs Meta/partner onboarding, business/phone setup, templates, secrets and provider rate-limit/error mapping.                                                                                      | MEDIUM; adapter unit tests deterministic, remote acceptance and messaging policy are not.                    | Complexity LARGE; high credential, PII, duplicate-send and consent risk; closure HIGH-risk due external approvals.                                        | Highest direct broadcast value, but depends on stable execution/ambiguity handling. Low overlap with current actual send because none exists.                | Valid later scope; lower next-step priority unless provider onboarding is already complete and scheduled.                             |
| C. Communication webhook / delivery receipt runtime                | No communication receipt endpoint, signature verification, event identity, or provider status normalization. Depends on provider selection and public HTTPS ingress/secret rotation.                                                                                           | Medium-high for signed synthetic payloads; live callback proof needs public endpoint/provider test account.  | Complexity MEDIUM–LARGE; high spoof/replay/privacy risk; closure HIGH without public callback.                                                            | Needed after provider sends for delivered/read/failure reporting. Little value before provider.                                                              | Valid but order after first provider contract or jointly designed with it.                                                            |
| D. Admissions CRM extension beyond B28                             | B18/B23/B28 cover formal applications, follow-up, funnel, and inquiry leads. Potential later needs include intake customization, segmentation, nurture, reporting. No concrete material blocker surfaced in current Stage 2 code compared with absent communication execution. | High for domain/UI scope.                                                                                    | Complexity MEDIUM–LARGE; medium PII and school-policy risk; closure MEDIUM.                                                                               | Product value depends on pilot feedback; overlaps B18/B23/B28.                                                                                               | Lower priority until real school feedback identifies a specific gap.                                                                  |
| E. Payment provider hardening / Midtrans production or VA          | QRIS code exists sandbox-only; no verified provider lifecycle/production config, and VA is absent. Requires provider credentials, public callback, merchant approval and finance reconciliation decisions.                                                                     | Moderate: deterministic contract tests; remote sandbox needed for end-to-end.                                | Complexity LARGE; high money movement/reconciliation risk; closure HIGH without provider.                                                                 | Strong monetization value; B19/B24/B27 foundations overlap intentionally.                                                                                    | Important Stage 2 gap, but external prerequisites make it a risky deterministic B29. Scope VA separately after provider decision.     |
| F. Support/pilot operational gap                                   | B26 read-only readiness checklist, school-scoped projection, manual fallback guidance and runbook exist. It intentionally reports unavailable provider operations rather than running them.                                                                                    | High for readiness rules.                                                                                    | Complexity SMALL–MEDIUM if telemetry/runbook refinements only; low risk; low closure risk.                                                                | Useful operational polish but overlaps B26 and cannot make external delivery available.                                                                      | Not the highest product gap; take only from pilot evidence.                                                                           |
| G. Another material discovered gap                                 | The clear current Stage 2 gap is actual outbound communication delivery; no stronger independent unimplemented domain was evidenced in this audit.                                                                                                                             | N/A                                                                                                          | N/A                                                                                                                                                       | Worker provides a deterministic step toward the explicit PRD broadcast goal.                                                                                 | No stronger alternative identified.                                                                                                   |

## Recommended B29

**Recommended Batch 29:** Communication Delivery Worker Runtime & Reliability

**Recommendation classification:** BEST NEXT BATCH.

### Why This Scope

Communication is the clearest remaining Stage 2 execution gap: B20 can publish in-app, B22 can enqueue external jobs, and B25 can run one manually invoked deterministic Development cycle, but there is no persistent worker/scheduler and all jobs use an unconfigured provider. A worker/runtime batch is a prerequisite that can be delivered and closed without provider accounts or real messages. The work should focus on a supervised execution entrypoint, durable operational health, deterministic crash/retry behavior, and deployment/runbook contracts; atomic DB claim, bounded retries, operator retry, and the existing fake adapter are reuse items, not rebuild scope.

This recommendation assumes Product Owner priority remains Stage 2 broadcast readiness and no provider has already completed onboarding outside the repository. If an approved provider account and test endpoint are already available, reconsider sequencing before implementation; source currently provides no evidence of that readiness.

### Primary Objective

Add a server-side, supervised and observable communication delivery worker that repeatedly processes only eligible, school-scoped B22/B25 jobs through the existing adapter interface, reuses the atomic B25 claim/lease and audit contract, safely recovers process interruptions, and can be exercised with zero-network deterministic adapters. Keep external communication disabled until a separately approved real provider adapter and its idempotency/receipt contract are implemented.

### In Scope

- A repo-native worker process/entrypoint for Development/test and a production-ready but fail-closed execution wiring that cannot send until a real adapter is explicitly configured.
- Poll/trigger, bounded batch size and cadence, graceful shutdown, bounded concurrency, and process liveness/heartbeat or health projection.
- Reuse `communication_delivery_jobs`, `communication_delivery_recipients`, `communication_delivery_attempts`, B25 RPCs, server-only admin boundary, contact preference/eligibility resolver, retry schedule, and operator retry.
- Durable execution idempotency/ambiguity policy around adapter calls; explicitly distinguish DB claim-once from provider exactly-once semantics.
- Safe stale lease recovery, attempt audit, failure codes, queue health/latency metrics, school fairness and starvation controls.
- Deterministic fake provider adapter with controllable success/transient/permanent/timeout/ambiguous outcomes.
- Operations visibility/runbook and least-privilege deployment/configuration decisions.

### Out of Scope

- Real WhatsApp Cloud API, Twilio, Fonnte, Wablas, email transport or any other provider.
- Provider credentials, Meta/WhatsApp business onboarding, phone-number verification, Meta template approval, actual external messages, or Production dispatch enablement.
- Communication webhook/callback and provider delivery receipts; design only a forward-compatible status seam if necessary.
- New campaign/marketing segmentation or AI messaging.
- Payment, QRIS, VA, Midtrans, finance, B18/B23/B28 CRM changes.
- Redis/BullMQ absent evidence that Supabase/Postgres claims cannot meet the initial load; stack rewrite; Production deployment or external account setup.
- Claim that Stage 2 is complete.

## Existing Components To Reuse

- B20 announcement and target snapshots, and B12 notifications/inbox.
- B22 durable job/recipient/attempt records, channel and idempotent enqueue.
- B25 atomic claim with `SKIP LOCKED`, lease token/expiry, max-three attempts, 30/60-second backoff, append-only attempt events, crash-expiry recovery, scoped resolver, contact preferences, pause/resume and safe manual retry.
- `runCommunicationDeliveryCycle` and the server-only Supabase admin client boundary as implementation references (while replacing the user-click invocation with a supervised process contract).
- `ExternalDeliveryAdapter` and Development fake adapter, localized Communication Operations UI, B25 validators/tests, operations runbook, and B26 read-only readiness projection/manual-fallback surface.

## Missing Components

- A continuously scheduled/long-lived worker and deployment/runtime entrypoint.
- Worker instance registry/heartbeat, liveness and readiness signal, operational alert thresholds, throughput/latency/oldest-queued metrics, and shutdown/drain behavior.
- Durable cross-process adapter idempotency or an explicit ambiguous-outcome reconciliation policy. The current fake adapter's `Map` is process-local and the current audit/runbook recognizes the send/finalize crash window.
- Jitter/rate-limit control and fairness policy for many schools/jobs.
- Provider-neutral transport timeout/cancellation semantics, secret-safe structured logs, and fault-injection harness across the full DB/worker loop.
- Explicit deployment secret/role scoping and operational separation between an authenticated school operator action and a trusted worker identity.

High-level migration expectation only: likely additive tables/columns for worker instances/heartbeats or lease generation/dispatch dedupe only if existing fields cannot express them; reuse current job tables and avoid a parallel queue. No SQL/schema design is approved in this discovery.

## Product Decisions Requiring Approval

There are **8 unresolved product/operations decisions** to lock before implementation; current DB contracts already set core state vocabulary, three-attempt maximum, 30/60-second backoff, safe manual retry, pause/resume, and lease-driven recovery and those should not be re-opened casually:

1. Worker deployment home and ownership: a separate Bun process/service vs scheduled invocation in the chosen host; who operates it.
2. Initial execution environment: Development-only worker through B29, or deployable production worker shell that remains disabled until a provider batch.
3. Poll cadence, batch size/concurrency, shutdown drain window, and liveness/heartbeat interval.
4. School fairness and queue starvation policy (round-robin per school vs bounded global pull, per-school rate caps).
5. Ambiguous outcome after adapter timeout/crash: hold for reconciliation, retry with stable provider idempotency key, or terminal manual review. Never promise exactly-once without provider support.
6. Worker retry policy changes, if any: retain existing 3 attempts and 30/60s delays or add jitter/provider retry-after/rate-limit controls.
7. Which operational metrics/alerts and retention periods are required, and whether existing school operators or only platform support can see fleet-level health.
8. Boundary with later provider/callback batches: keep all real providers, WhatsApp templates/consent specifics, and signed callbacks out of B29 (recommended), then define a separate provider-specific approval gate.

## Security Boundaries

- Keep service-role credentials exclusively in server worker runtime; never in browser bundles, client RPC, logs, health responses, or report artifacts.
- Worker claims must remain atomic and scoped. Do not accept arbitrary school IDs from untrusted clients as worker authority; derive/validate tenant scope and use a narrow machine identity.
- Normal users cannot claim/resolve/finalize jobs. Keep operator pause/retry functions capability-authorized and school scoped; worker-only functions remain unavailable to `anon`/`authenticated`.
- A unique claim prevents concurrent DB ownership but not duplicate external sends after provider acceptance and a worker crash. Use provider idempotency keys where supported; otherwise preserve ambiguous state for reconciliation rather than silently retrying.
- Maintain contact eligibility/consent checks at send time; only resolve current contact on the trusted server immediately before adapter call; never include raw contact in projections or ordinary logs.
- Bound attempts, timeouts, concurrency, batch work, and per-school rate to avoid retry storms and one tenant starving another. Respect paused jobs and terminal states.
- Do not silently reset terminal failures; manual requeue creates an auditable, idempotent operator request and obeys approved policy.
- Normalize provider errors into safe codes; redact destination, message body, tokens, and credentials from exception logs and append-only audit.
- Worker health must expose aggregate status only; do not leak message content or one school's recipient facts into another school's operations view.

## Expected Test Strategy

- Happy-path worker execution through Development fake adapter with accepted, retryable, permanent, ineligible, and synthetic timeout/ambiguous outcomes.
- Concurrent claim race: two independent workers contend for same eligible rows; prove one active claim/attempt start per recipient.
- Duplicate invocation and durable idempotency/replay behavior across separate worker processes, not just one in-memory adapter instance.
- Crash before send; crash during send; provider accepted then process dies before finalize; expired lease recovery and ambiguous-state reconciliation.
- Bounded batch/concurrency; pause during active claim; graceful shutdown/drain; worker heartbeat expiration and restart.
- Retry scheduling and fake-clock backoff; transient vs permanent failures; retry-after/jitter if approved; maximum-attempt terminal behavior.
- Safe manual retry/requeue, request replay/conflict, unauthorized retry denial, terminal denial, and operator audit.
- Cross-school and cross-organization claim isolation, invalid machine identity, browser role denial for worker RPCs, contact/consent revocation race and no cross-school starvation.
- Secret/PII redaction in logs, payloads, error paths, metrics, and runbooks.
- Fake adapter sends zero network traffic; assert zero real external sends and Production remain disabled.
- Operations browser smoke only if B29 changes its panel/health projection; verify role scope, ID/EN, Light/Dark and safe aggregate health.

## External Dependencies

For the recommended B29: no provider account, API credential, Meta approval, WhatsApp Business account, real phone number, public HTTPS callback, payment sandbox credential, Production deployment, or third-party approval is required to implement and close the Development/test runtime.

The deployment host still must be selected and an operator must provision/monitor a worker process before any production scheduling. Do not claim Production execution without deployment evidence. A future WhatsApp provider batch will require an approved provider/business account, verified sender, credential management, and possibly Meta-approved templates. A receipt batch requires a public HTTPS callback endpoint. VA/payment work requires provider sandbox/merchant setup and callback verification.

## Deterministic Closure Assessment

- Deterministic closure possible: **YES**, for the worker/runtime code and Development fake-adapter execution using controlled clocks, independent worker processes, and Development DB concurrency tests.
- External account required: **NO**.
- Public callback required: **NO**.
- Production deployment required: **NO** for B29 closure; production operation must remain disabled/unclaimed until later approved deployment/provider work.
- Zero real messages: **YES**, enforced with the synthetic-only adapter and network-deny test.

This is more closeable than starting with a real provider or VA integration. Do not describe local worker tests as proof of an always-on Production service.

## Risk Register

| Risk                                              | Rank       | Reason / control                                                                                                                   |
| ------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate send after remote accept + worker crash | HIGH       | Lease protects database ownership, not remote side effects. Provider idempotency or manual reconciliation is required.             |
| Concurrency / stale lease ownership               | HIGH       | Claim token fencing and expiry must be enforced on every resolve/finalize path; race-tested across independent processes.          |
| Tenant isolation                                  | HIGH       | Global polling can cross schools if the machine scope is broad; enforce school/org predicates and test foreign job identifiers.    |
| Authorization / service-role misuse               | HIGH       | Worker needs server credentials; separate machine identity from human operator controls and keep raw RPCs closed to browser roles. |
| Secret or recipient leakage                       | HIGH       | Current resolver briefly handles destination server-side; provider errors/logging/metrics must redact it.                          |
| Retry storm / provider throttling                 | MEDIUM     | Current fixed exponential delay has no jitter/rate cap; later provider responses may require Retry-After handling.                 |
| Queue starvation / noisy tenant                   | MEDIUM     | Current claim is school-scoped and ordered by creation; a global poller needs explicit fairness and limits.                        |
| Crash recovery / ambiguous attempt cleanup        | MEDIUM     | Existing expired lease recovery can retry unknown outcome; runtime must distinguish safe retry from send ambiguity.                |
| Insufficient worker observability                 | MEDIUM     | B25 offers queue counters but no fleet heartbeat, alerts, or latency metrics.                                                      |
| Provider coupling                                 | MEDIUM     | Preserve provider-neutral adapter outcome and failure-code seam; defer provider templates/webhooks.                                |
| Cleanup and audit retention                       | LOW–MEDIUM | Append-only attempts/preferences need a retention and archival policy at expected scale.                                           |

## Expected Stage 2 State After B29

If B29 closes as recommended, Communication Delivery Orchestration becomes more operationally complete for deterministic/test execution, while actual outbound communication remains unavailable until a provider is separately integrated and approved. Stage 2 remains **OPEN** because real WhatsApp broadcast and Virtual Account/production payment paths remain partial/external-dependent.

Likely sequence, subject to provider onboarding and Product Owner reprioritization:

- **B30 (likely):** First external communication provider, preferably WhatsApp for the explicit Stage 2 broadcast goal; include account/template/consent/error/idempotency decisions and only claim actual send after sandbox/UAT evidence. If provider onboarding is not ready, keep this TBD and advance pilot-feedback CRM gaps instead.
- **B31 (likely):** Payment breadth and production readiness: Midtrans Virtual Account (or approved gateway method), with verified provider callbacks/reconciliation and explicit sandbox/production separation. Could precede B30 if revenue/payment priority or provider readiness is higher.

WhatsApp delivery receipts may be an independent B31/B32 slice if not included with the selected provider and public callback environment; sequence must follow provider contract. No batch after B29 is started here.

## Final Recommendation

Choose **Communication Delivery Worker Runtime & Reliability** as B29, classified **BEST NEXT BATCH**, with a strict reuse boundary around B22/B25. The material gap is no persistent/scheduled execution runtime: today the only execution is a human-triggered Development cycle, provider key is unconfigured, and Production execution deliberately throws. B25 already supplies DB-level claim/lease, retry, audit, scoped recovery and operational retry, so B29 should operationalize and observe this lifecycle rather than implement a second queue. Close B29 deterministically against Development with fake adapters, concurrency/crash tests and zero external messages; keep real provider, webhook, VA, and Production dispatch out of scope.
