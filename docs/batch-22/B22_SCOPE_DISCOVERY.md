# EduSmart Batch 22 — Scope Discovery

## Current Main Baseline

- Verified `origin/main`: `73c5ba4dcec9e59c0f119319d8b4dd124db1b534` (B21 merge, PR #16).
- B21 feature commit `ccd7f84753e5e4e05dccf81e39a8985533497bed` is the merged feature ancestry.
- This discovery was performed in the clean `feat/b22-external-communication-delivery` worktree based on that main.
- The checked-in Supabase migration history and generated database types are the schema/RLS evidence available here. A live linked-project inspection was attempted with `supabase migration list --linked`; the CLI returned `ProjectRefNotLinkedError`. Therefore deployed Development migration state, live policies, and runtime RPC definitions could not be independently queried. No live database mutation was made.

## PRD Alignment

The current PRD explicitly puts Communication Center (WhatsApp), WhatsApp broadcasts, transactional WhatsApp notifications, and email fallback in Stage 2. It separately recommends background jobs for broadcasts at scale and calls out WhatsApp approval/integration complexity. B20 delivered the internal announcement and inbox foundation, not external delivery. External delivery groundwork therefore remains a direct Stage 2 dependency. The PRD does not make a particular provider mandatory for this next batch.

## Existing B20 Communication Architecture

Source of truth: `supabase/migrations/20260926180000_b20_communication_center_core.sql`, `src/lib/communication.{server,functions,schemas}.ts`, communication routes/components, and `src/lib/b20-communication-center*.test.js`.

- `communication_announcements` belong to `(organization_id, school_id)` and have only `draft` and `published` states. Publishing records actor/time and makes the announcement immutable.
- `communication_announcement_targets` store school/classroom scope and one or more audience types (`staff`, `student`, `guardian`). Published targets are immutable.
- At publish, `b20_publish_announcement` locks the announcement, checks `notification.send`, validates expected version/idempotency, resolves the target audience, and inserts distinct recipient profiles into `communication_announcement_recipients`. A unique `(announcement_id, recipient_profile_id)` prevents duplicates. This is the publication-time immutable snapshot; it is not recomputed on later reads or retries.
- The same transaction creates/reuses one `notifications` row keyed `announcement:<id>:published`, creates `notification_recipients` for the snapshot, marks the announcement published, and completes the command ledger. Provider outage is not part of this transaction or state machine.
- B20 tables have organization/school composite foreign keys. RLS is enabled and forced on announcement, target, recipient, and command tables. Direct table privileges are revoked; security-definer RPCs are the write boundary and call `b20_require_staff`/`has_staff_scope_permission`.
- Staff announcement read/manage is capability-scoped using `notification.send`; announcement detail is also readable by a profile that is an in-app notification recipient. The recipient snapshot itself is staff-capability-only.

## Existing Notification Architecture

Source of truth: `supabase/migrations/20260915160000_b12_notifications_parent_permission_foundation.sql` plus B12 runtime fix migrations and notification server/UI modules.

- `notifications` represents an in-app event; immutable semantic-event dedupe is enforced by unique `(organization_id, school_id, dedupe_key)`.
- `notification_recipients` represents per-profile inbox/read state, unique per `(notification_id, recipient_profile_id)`, with `read_at`.
- RLS grants notification reads only when the current profile is a recipient; recipient rows are own-profile-only. Writes are through domain RPCs, not general table CRUD.
- B20 reuses this exact inbox/read domain. B22 must not create another in-app inbox or reinterpret read as external delivery.

## Current Database/RLS Model

- Existing tenant boundaries are explicit organization and school IDs with composite foreign keys. Communication rows use these keys; RPCs derive organization from the selected school/announcement and perform capability checks.
- Existing authorization is capability based. `notification.send` is seeded for organization owner, school admin, principal, and vice principal roles and currently means authorized in-app notification/announcement sending. Reusing it for real external delivery would silently expand privilege to a higher-impact, PII-bearing action. The discovery recommendation is a narrowly granted `communication.delivery.manage` capability for enqueue/retry/manage, without raw-role checks at runtime.
- Existing parent/student notification access is recipient-bound; delivery metadata must be staff-capability-only. Parent and student must not be able to enumerate jobs, destinations, or attempts.
- B20 recipient profile IDs are immutable, but destination addresses are not part of that snapshot.
- Identity schema contains `profiles.phone`; guardian records contain `guardians.phone` and `guardians.email`. Auth email exists in Supabase Auth, not in the ordinary app profile contract. No explicit destination verification/consent state was found in the reviewed source migration. Full phone/email must not be exposed in delivery UI or logs.
- Live Development RLS/schema equivalence remains unverified because this worktree is not linked to a Supabase project. This is a later migration dry-run/release validation requirement, not an excuse to claim remote verification.

## Problem Statement

An announcement can be published to an immutable in-app audience, but there is no provider-neutral durable request/recipient/attempt model for external channels. Adding direct provider calls to B20 publication would couple two lifecycles, turn a provider failure into publication risk, and create synchronous fan-out. B20 recipient snapshots also intentionally identify profiles rather than freezing their mutable contact addresses.

## Candidate Scope

Provider-neutral External Communication Delivery Foundation. Separate an external delivery request from publication and in-app inbox state; attach it to B20’s immutable publication recipient set; make queueing and per-recipient progress auditable and idempotent; provide a non-network deterministic test adapter. No real message is transmitted in this batch.

## Alternatives Considered

1. **Provider-neutral foundation only (recommended).** Delivers durable contracts, security, idempotency, lifecycle, and safe tests without vendor or credential coupling.
2. **Foundation plus WhatsApp/email provider.** Rejected for this batch: no provider is selected or configured in the repository, destination consent/verification is not modeled, and a real integration brings templates, provider approval, PII, webhook and operational concerns beyond a foundation.
3. **Another scope.** Not indicated by current main/PRD. Stage 2 explicitly calls for WhatsApp communication, while B20 internal communication is already complete. No more urgent in-repository dependency was found in this bounded discovery.

## Explicit In-Scope

- Additive provider-neutral external-delivery request/job, recipient state, and append-only attempt history attached to a published B20 communication and its immutable recipient profiles.
- Unique enqueue identity per `(announcement, channel)` and request idempotency; repeated/concurrent enqueue returns the existing request or a safe conflict, never duplicate recipient rows.
- Separate job/recipient lifecycle and append-only attempt model; deterministic retryable/permanent classification and a finite three-attempt eligibility contract. Actual attempts/retry dispatch remain disabled until a real provider and isolated worker are separately approved.
- Enqueue/management protected by a new least-privilege delivery capability; read/write enforced in the database/RPC boundary and tenant/school scoped.
- Development/test-only deterministic provider exercising success, retryable, permanent, and missing-destination results without network access. It must fail closed in production.
- Minimal, localized (ID default/EN) Light/Dark delivery status UI; safe aggregate counts only (no destinations are available in this batch).
- Tests for publication prerequisite, repeat/concurrent enqueue, recipient dedupe/isolation, retry classifications, tenant/school/actor denial, parent/student denial, UI locale/theme/responsive behavior.

## Explicit Out-of-Scope

- WhatsApp Cloud API, Twilio, Qontak, WATI, Meta templates, provider account setup, real email/SMS/push providers, webhooks, inbound/two-way chat, billing, campaigns, scheduling/marketing automation, CRM, and actual external sends.
- Replacing or duplicating B20 publication, audience selection, recipient snapshot, notification inbox, read state, or deep links.
- Contact data cleanup, consent capture/verification, or changing B20 audience rules. No real personal data is invented or sent.
- Long-running recipient fan-out inside browser-triggered request/response; no new heavyweight queue vendor or scheduler unless repository evidence justifies it.

## Domain Model

Proposed additive concepts (final names follow repo convention):

- **Delivery job**: organization/school, announcement, channel, provider adapter key, enqueue actor/time, lifecycle/aggregate state, stable idempotency key, attempt/retry policy version. Composite FK to the same tenant/school announcement.
- **Delivery recipient**: job and immutable B20 announcement-recipient row/profile reference, status, attempt count, next-eligible time, safe failure class/code, timestamps. Unique `(job_id, announcement_recipient_id)`; no broad client table access.
- **Delivery attempt**: append-only ordinal, claimed/started/finished timestamps, outcome, retryability/failure class, provider message ID when available, and minimized response metadata. No raw provider payload or secrets.
- Job status is aggregate (`queued`, `processing`, `completed`, `completed_with_errors`, `cancelled`); recipient status is independently `queued`, `processing`, `sent`, `delivered` only when provable, `failed`, `skipped`, or `cancelled`. For the test adapter, `sent` means adapter accepted the deterministic operation; it must not be represented as read or provider-delivered.

## Delivery Lifecycle

Published immutable B20 communication → authorized idempotent external-delivery enqueue → create one job and recipient rows from the existing B20 snapshot. A future worker may claim recipients, append attempts, classify outcomes and derive aggregate status. Failure of a recipient/channel must never roll back publication or in-app inbox delivery. No production worker/provider exists in this scope; production requests remain safely queued and are not dispatched. Development tests use only the deterministic adapter.

## Idempotency Model

- Enqueue uniqueness is database-enforced per announcement/channel; request key/fingerprint binds actor and operation. Concurrent duplicate enqueue cannot create another job or recipient set.
- Recipient identity derives from the immutable B20 recipient ID, not mutable audience queries.
- Attempt ordinal is unique per delivery recipient; only a lease/claim winner may start the next attempt.
- A stable attempt idempotency key is derived from delivery-recipient ID plus attempt ordinal and passed to adapters that support idempotency. Database uniqueness alone cannot prove that a remote provider did not accept a request just before worker crash. A future real provider must support idempotency or expose reconciliation; ambiguous outcomes must not be blindly retried. The deterministic test adapter is idempotent on that key.

## Retry Model

- Finite maximum of three attempts; no unbounded retry. Exponential/backoff timing and jitter belong to a future worker implementation.
- Retryable examples: transient connection/provider outage, throttling. Permanent examples: invalid/unsupported destination, provider rejection requiring operator correction. Credentials/configuration failures stop the batch rather than marking every recipient permanently invalid.
- Retry eligibility is limited to retryable failures below the finite attempt bound; permanent failures require corrected contact/configuration and explicit eligibility before retry. Prior attempts are append-only. No “send all again” operation.
- Actual manual/automatic dispatch and retry execution are out of scope absent a configured provider and reliable job runtime; this foundation defines durable state and retry eligibility only.

## Recipient Snapshot Strategy

Always copy/foreign-key the immutable B20 publication recipient identity. Never resolve target classrooms/enrollments/guardians again on enqueue or retry. A later student movement or guardian relationship change therefore cannot silently change the original recipient set. Only the announcement publisher can change audience by creating/publishing another announcement under B20 rules.

## Destination Snapshot Strategy

Do not infer or snapshot an address at B20 publication: B20 has no destination consent/verification semantics. For this foundation, recipient identity is snapshotted and production dispatch is disabled. Before any real provider is introduced, add an explicit eligibility/consent and destination-resolution policy. Once dispatch is enabled, the proposed privacy-safe rule is to freeze the normalized destination at the first authorized enqueue/attempt boundary, restrict it to worker-only access, encrypt or otherwise protect it using an approved server-side key-management design, retain only a masked display/fingerprint for operators, and use the same frozen destination for retries. Never silently switch to a newly edited phone/email on retry.

## Provider Boundary

Provider-neutral server-side adapter contract (`send(request) -> accepted/failed classification`, stable idempotency key, opaque provider reference). Channel and provider are separate values. No provider credential or real outbound implementation is added. Development deterministic adapter is explicit allow-listed and cannot be selected in production. In-app remains B12/B20 and is not forced into this external adapter.

## Security Model

- Keep `requireSupabaseAuth` on server functions, derive actor from verified auth context, and let RPC derive org/school from persisted announcement rather than trusting client tenant IDs.
- Add a narrowly granted delivery capability instead of expanding `notification.send` silently. Runtime authorization is capability-based, not raw role-name based.
- No service-role ordinary CRUD. RPC/table privileges are explicit; RLS remains authoritative. Parent/student and ordinary notification recipients cannot read job/recipient/attempt metadata.
- Composite tenant/school foreign keys, unique ownership keys, server checks on published communication, and tests against tampered IDs/cross-tenant access.
- Destination PII is outside this batch’s production behavior. Future storage requires a key-management/retention decision and worker-only retrieval.

## RLS Model

Enable and force RLS on every new delivery table. No direct authenticated insert/update/delete. Staff reads are gated by delivery capability and exact organization/school scope. Recipient and attempt rows inherit tenant/school ownership through composite foreign keys. Enqueue/retry/claim execute via tightly scoped RPCs with explicit auth/capability checks. Worker elevation, if later required, is isolated to a dedicated worker credential/function and does not grant broad client access.

## UI Impact

Minimal “External delivery” section on published announcement detail: create/view delivery request, channel, aggregate state/counts, and eligible retry action. No full destinations, provider payloads, or recipient directory. Explain that no production provider is configured and do not show a misleading “sent” state. Hide/manage controls by capability, but server/RPC remains authoritative. Provide safe empty/error/already-enqueued/no-eligible states.

## Localization / Theme

Use existing B21 preference/i18n helpers, Indonesian default and English alternative. All new labels, statuses, confirmations, errors, and empty states localized. Use semantic theme tokens; test Light/Dark and 375/768/1440 widths; retain keyboard/accessibility conventions.

## Migration Plan

One or more append-only migrations only after implementation design review. Add tables/indexes/FKs/uniqueness/RLS/RPCs and a least-privilege capability seed without editing historical migrations. Regenerate typed schema artifacts using repository convention. Live Development migration dry-run is mandatory before applying; the current worktree is not linked, so that release check is presently unavailable. No Production migration or mutation.

## Test Strategy

| Scenario                                  | Expected invariant                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| Draft announcement enqueue                | Denied; publication is prerequisite                                       |
| Published announcement enqueue once       | One job and exactly the immutable B20 recipients                          |
| Repeated/concurrent enqueue               | Same job/replay or safe conflict; no duplicate rows                       |
| Duplicate recipient in targets            | B20 snapshot and delivery recipient each remain unique                    |
| Student/guardian membership changes later | Existing snapshot is unchanged                                            |
| Missing/unverified destination            | No real send; explicit skipped/ineligible result when dispatch is enabled |
| Test adapter success                      | One accepted attempt, not claimed delivered/read                          |
| Retryable/permanent failure               | Correct classification; retry only eligible failure                       |
| Retry                                     | New append-only attempt; same frozen destination and idempotency boundary |
| Retry limit reached                       | No further attempt                                                        |
| School/tenant ID tampering                | Safe denial/no data disclosure                                            |
| Actor lacks delivery capability           | Safe denial                                                               |
| Parent/student request delivery metadata  | Denied                                                                    |
| Adapter unavailable                       | Publication remains published; recipient outcomes isolated                |
| ID/EN, Light/Dark, responsive             | Localized, theme-correct, no unintended overflow                          |
| Production provider selection             | Deterministic test adapter rejected                                       |

## Risks

- Live Supabase project is not linked; deployed schema/RLS drift is not independently observable here.
- B20 snapshots profiles, while phone/email and consent are mutable/not represented consistently. No external send should be enabled before explicit consent/contact policy and secure destination handling exist.
- A database queue without a reliable worker only guarantees durable eligibility, not delivery. This scope will not misrepresent queued as sent.
- Provider acceptance followed by worker crash is an inherently ambiguous external side-effect boundary unless provider idempotency/reconciliation is available.
- Child/family PII and retention obligations make broad destination exposure or verbose provider logs unacceptable.

## Open Questions

1. Which Development Supabase project should be linked for schema introspection and migration dry-run? This does not change the scope decision, but is required before release migration validation.
2. Future provider batch must choose consent, contact verification, retention, encryption/key management, and channel eligibility policy before enabling real dispatch.
3. A future operational delivery batch must select the supported worker/scheduler and provider idempotency/reconciliation contract.

## Recommended Batch 22 Scope

**Batch 22 — External Communication Delivery Foundation (provider-neutral; no real provider).** Add durable, tenant-safe delivery request and per-recipient state/attempt contracts anchored to B20’s immutable recipient snapshot, idempotent enqueue and safe retry eligibility, development-only deterministic adapter/tests, and minimal status UI. Production external transmission, destination PII handling, consent policy, and provider/runtime integration remain explicitly disabled/deferred.

## Decision

**BATCH 22 SCOPE CONFIRMED: YES** for the bounded provider-neutral foundation above. Evidence: Stage 2 PRD explicitly lists external WhatsApp/email communication; current main has only B20 in-app publication/inbox and no external delivery domain/provider/worker; an add-on foundation fills that identified gap without duplicating B20 or prematurely selecting a vendor. No live database was queried or mutated because this checkout has no linked Supabase project; exact live migration parity remains a release gate.

**Implementation boundary:** additive database/RPC domain plus authenticated capability-gated server operations and minimal localized delivery-status UI; deterministic test adapter only; no production sends, external provider credentials, or real-world recipients. Continue implementation in this existing B22 worktree.
