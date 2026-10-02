# Batch 25 Communication Delivery Operations Runbook

## Scope and safety boundary

B25 provides an operator-triggered, bounded executor over the B22 delivery queue. It is provider-neutral. The Development adapter accepts only synthetic test destinations and makes no network calls. Production external dispatch remains disabled and fails closed. Do not describe adapter acceptance as delivery, read, or exactly-once external transmission.

## Job lifecycle

1. B20 publication creates an immutable recipient snapshot. B22 enqueue creates channel delivery rows idempotently.
2. A school-scoped operator with `communication.delivery.manage` can inspect safe counts and masked contact status, pause/resume a job, request a bounded retry, and invoke a Development executor cycle.
3. Each executor cycle claims a finite batch (maximum 25) using database row locks with `SKIP LOCKED`, a claim token, and an expiring lease.
4. Before adapter execution, the server resolver rechecks school/guardian linkage, channel contact state, operational-purpose consent, and current canonical contact. Ineligible rows are skipped without adapter invocation.
5. Attempt events are append-only. Retry eligibility is bounded to three attempts. Successful and terminal rows cannot be reclaimed through the normal path.

## Consent and contact eligibility

Preferences are purpose and channel specific. B25 sends only the operational purpose. Marketing consent is not inferred from admission consent, guardian relationship, or contact presence and is not enabled by this executor. School-recorded consent requires an evidence reference. Revocation is checked again at execution time. The Development UAT fixture used only a reserved invalid-domain email and a synthetic guardian identity.

## Pause and resume

Pausing prevents new claims for the job. A claim already in progress is resolved under its existing lease; pause does not cancel an adapter call already started. Resume makes otherwise eligible queued/retry rows claimable again.

## Retry and recovery

Only a retryable failed row below the attempt limit may be retried. A successful, permanent-failure, ineligible, leased, or exhausted row is not a valid operator retry target. Retry command IDs are idempotent. If a worker exits with a lease outstanding, the next claim cycle can recover the expired lease into a safe unknown/retry outcome, subject to the attempt bound. Preserve previous attempt events; never edit them to make a retry appear successful.

## Development execution

Use the Communication Center Development executor control only against synthetic Development fixtures. Verify the intended school/job and recipient scope before running a cycle: a cycle claims eligible work in its school, not only the currently open card. Do not enqueue a broad audience for executor tests. Inspect masked projections and safe failure codes after each bounded cycle. Development QA must not use routable phone numbers or email domains.

## Production boundary

There is no provider adapter, provider credential, production scheduler, or production external dispatch in B25. Do not configure or invoke an external provider through this executor. A future provider batch must separately define signed webhook ingress, provider idempotency and ambiguity handling, credential storage/rotation, rate limits, reconciliation, and operational monitoring. Database lease semantics do not guarantee exactly-once delivery to a remote provider.

## Runtime validation evidence and limitations

Development runtime validation exercised overlapping same-recipient claims (one claim, one empty result), expired lease recovery, stale-token rejection (`CLAIM_EXPIRED`), consent revocation after claim (ineligible resolver result and supported skip with no adapter call), three retryable attempts with no fourth, one permanent failure, and pause/resume (pause blocked a new claim; resume allowed progress). Read-only aggregate checks found no active or stuck lease, over-limit attempt, orphan/duplicate attempt pair, tenant mismatch, or forbidden raw destination column. The deterministic adapter made no network calls.

Development migration and validator status: 95 repository migration files and 95 Development ledger versions, including all four B25 migrations; the linked B25 validator passes. The standard `migration list --linked` command could not authenticate its CLI database login, so version counts were checked with a read-only migration-ledger query. A disposable Supabase preview branch could not be created because the linked project's plan returned `entitlement_required` for branching. Fresh runtime replay was not executed. A function-body comparison found that Development's contact-preference recorder did not copy `source_reference` into its immutable event. After reviewing the SQL and confirming the dry-run contained only migration `20261002130000_b25_contact_preference_event_evidence_replay_fix`, that append-only migration was applied to Development; the B25 validator passed and all 11 B25 function bodies now hash-match the final repository chain. The deterministic ordered audit found no remaining dependency or contract divergence. This is not represented as a fresh database replay.

Authenticated hostile calls verified direct table/RPC denial, operator command replay/conflict, terminal retry denials, and cross-scope safe responses. Development had no B25 object in the second synthetic school, and its existing guardian was not confirmed synthetic; no new audience fixture was created. Active-lease pause behavior, contact change between claim and execution, separate-recipient parallelism, and complete browser failure-state/accessibility checks remain unverified. Development validation and static migration review do not replace a deployed worker/provider runbook. Production external dispatch remains fail-closed.
