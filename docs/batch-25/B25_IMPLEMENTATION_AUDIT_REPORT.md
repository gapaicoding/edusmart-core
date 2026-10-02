# EduSmart Batch 25 — Implementation Audit Report

## Executive Result

**READY FOR PR — deterministic migration-chain audit passed; fresh runtime replay was not executed.** The provider-neutral Development operations path is implemented. Runtime evidence covers worker lifecycle, authenticated cross-scope denials, direct table denial, raw RPC denial, command replay/conflict, and retry terminal-state denials. A supported Supabase preview-branch command was available, but branch creation was denied by the linked project's plan entitlement. The ordered migration audit and read-only Development contract comparison found no chain defect or material divergence. The historical migration-1 edit remains a MEDIUM process finding.

## Baseline

- Main baseline: `2dd34f36645b15f26098a3ab837df3e22398f0f0`.
- Branch: `feat/b25-communication-delivery-operations`.
- Worktree: `D:\edusmart-worktrees\edusmart-core-b25`.
- Development migration state after the forward-only closure correction: 95 local = 95 remote.
- B24 remains ancestor of baseline.

## Locked Scope

Provider-neutral communication operations; operational purpose only; channel-specific eligibility; deterministic Development adapter; Production fail-closed; no external communication provider.

## B20/B22 Compatibility

B20 announcement publication/snapshot remains the source of recipients. B22 job/recipient/attempt tables are reused. New migrations add contact preferences and immutable preference events, leases/claim state, operator request idempotency, masked operations projection, and recovery functions. B22 attempts remain append-only.

## Consent / Eligibility Model

Preferences encode operational/marketing purpose separately from channel (`whatsapp`/`email`), state, source, actor, and timestamps. The current write path accepts operational preference evidence only. Execution resolver checks current consent and school/guardian linkage before any adapter invocation. Marketing transmission is not implemented.

## Destination Resolution

The server-only claim resolver reads current guardian contact at execution. The operator projection returns masked destination and eligibility state. Raw destination is confined to the server execution boundary and is not returned to browser projection.

## Privacy / Masking

The live Staff route displayed a masked reserved invalid-domain email and no raw destination. Development fixture values were synthetic. No production or external contact was used.

## Worker Claim / Lease

Database claim uses row locks with `SKIP LOCKED`, bounded batch limit, claim token, and expiry. Two overlapping calls for the same one-recipient synthetic job produced one claim and one empty result. A subsequent claim recovered an expired lease; finalization using the old token returned `CLAIM_EXPIRED`. Separate-recipient parallel progress was not tested.

## Retry / Recovery

Schema/functions include a three-attempt bound, lease-expiry recovery, idempotent operator request ledger, pause/resume, and retry eligibility constraints. Live evidence: lease recovery preserved attempt history; an expired token could not finalize; consent revoked after claim caused resolver ineligibility and safe skip; retryable failure progressed through three attempts and then exposed no further retry; permanent failure did not retry; pause prevented claims and resume allowed one acceptance. Same request ID/same recipient replay returned the same `ALREADY_ACCEPTED` response; changed recipient under that ID returned `B25_IDEMPOTENCY_CONFLICT`. Retry calls on successful, permanent, max-attempt, and skipped/ineligible recipients returned `ALREADY_ACCEPTED` or `NOT_RETRYABLE` without requeueing. Active-lease pause semantics and contact change after claim remain untested.

## Operator Operations

Communication detail UI provides masked status, bounded Development cycle, pause/resume, retry affordance, and consent evidence entry. Live runs covered accepted, retryable failure at the three-attempt cap, permanent failure, pause/resume, masked projection, and safe skipped state after consent revocation. UI-hidden retry actions for permanent/max-attempt recipients were observed; adversarial direct RPC denial was not tested.

## Development Adapter

The adapter accepts deterministic synthetic test cases and rejects routable-looking destinations. One reserved synthetic guardian address was accepted in Development. The adapter did not perform network I/O.

## Production Fail-Closed

Source contract and unit tests verify that the Development adapter refuses Production mode. No live Production runtime was touched. The Production fail-closed structural check passed; no deployment was made.

## Authorization / RLS

All three migrations applied and the SQL validator passed. New integrity tables have RLS enabled/forced and direct table access revoked. Actual browser-authenticated PostgREST calls from Principal, Teacher, Parent, Student, and anonymous were denied for SELECT/INSERT/UPDATE/DELETE on all three B25 integrity tables. Direct claim/resolve/finalize/skip RPC calls were denied for each authenticated persona and anonymous. Operator functions denied Teacher/Parent/Student; the Principal's valid own-school worker action returned zero claims, while a School B worker request was denied before claiming. Cross-scope projection/stats/pause/resume/retry/preference/claim calls returned safe errors with no data. No B25 job/announcement exists in the foreign B19 QA school; valid School A B25 identifiers passed with the foreign school ID produced the same unavailable/permission errors as unknown identifiers. Thus the boundary and no-existence-oracle behavior were exercised, but there was no actual School B B25 object available to probe.

## Concurrency / Idempotency

Static SQL contract has `SKIP LOCKED`, per-recipient claim tokens, append-only start/final indexes, and idempotency constraints. Actual overlapping claim calls excluded duplicate ownership for one recipient. Same-ID replay and changed-recipient conflict were exercised; retry terminal states were denied without requeueing. No external delivery exists; do not claim exactly-once external delivery.

## Development Migration

Applied Development-only migrations:

- `20261002100000_b25_communication_delivery_operations`
- `20261002110000_b25_delivery_projection_and_recovery`
- `20261002120000_b25_delivery_contact_operator_projection`
- `20261002130000_b25_contact_preference_event_evidence_replay_fix`

The B25 validator returned `B25_COMMUNICATION_DELIVERY_OPERATIONS_VALIDATION_PASS`; the repository contains 95 migration files and the read-only Development migration ledger contains 95 versions, including all four B25 versions. The standard `migration list --linked` command could not authenticate its CLI database login, so parity was confirmed by comparing local file count and the remote migration ledger query. Migration 1 was amended during Development iteration after its initial application and later SQL deltas were carried forward in migrations 2 and 3; the consent-event evidence discrepancy was corrected in migration 4.

## Deterministic Migration Reproducibility Audit

Fresh runtime replay was not executed because the linked project's Supabase plan returned `entitlement_required` for preview-branch creation. No disposable database was created, no migrations were applied during this audit, and the three applied B25 files remained unchanged. Fresh runtime replay is therefore explicitly **NOT EXECUTED**.

Frozen B25 migration SHA256 values at this audit:

- `20261002100000_b25_communication_delivery_operations.sql`: `9F1A4C756A52703A5D1023C1F59B4E7DE3AED7A6EAE2D919941C6319A2F2C66B`
- `20261002110000_b25_delivery_projection_and_recovery.sql`: `DF4E81138878F573094A922931BD3394CB5B6B6532624EB23EDA31FB726A4461`
- `20261002120000_b25_delivery_contact_operator_projection.sql`: `6BDF338889EEF4424E3664BB46B1E18830F4FC4CD3F25CF9502F0141D8EA0BDC`
- `20261002130000_b25_contact_preference_event_evidence_replay_fix.sql`: `E2D6567667E9FE247EC21C3F8497B8A5A809E8ED3F4D4B3697E7DFEF3137DFE7`

The ordered dependency audit found:

- Before B25, B20 provides immutable announcement recipient snapshots; B22 provides delivery jobs, recipients, attempts, their scope keys, status/attempt constraints, RLS/policies, and the immutable-attempt trigger. The canonical foundation provides `profiles`, `schools`, guardian/enrollment relationships, membership/permission tables, and `has_staff_scope_permission`.
- Migration 1 creates `communication_contact_preferences`, `communication_contact_preference_events`, and `communication_delivery_operator_requests`; then adds the dependent composite recipient key before the operator-request FK; adds pause and lease columns/checks/indexes; replaces the exact B22 job-status and attempt-number constraints; adds append-only attempt indexes; applies forced RLS and scoped policies; and defines the B25 functions and grants.
- Migration 1 drops `communication_delivery_jobs_status_check` and `communication_delivery_attempts_number_key`; both names and compatible definitions exist in B22. It does not drop any B20/B22 table or trigger.
- Migration 2's `ADD COLUMN IF NOT EXISTS source_reference` is safe after the final migration-1 file: migration 1 already creates that nullable `text` column with the same 120-character check. Its `CREATE OR REPLACE` definitions retain the same argument signatures and `jsonb` return types as migration 1.
- Migration 3 replaces only `b25_list_delivery_operations` with the same signature/return type, adding the intended recipient profile identifier to the authorized projection. It does not depend on a Development-only object. PostgreSQL replacement preserves the prior function owner/ACL; live Development shows the expected authenticated execute grant and `search_path=''`.
- No B25 enum/type, trigger, or view is created. The B22 immutable-attempt trigger remains present. The B25 chain has no duplicate table/column/index/policy/type creation; the overlapping source-reference column statement in migration 2 is guarded by `IF NOT EXISTS` and has matching final definition. Migration 4 intentionally replaces the same-signature preference function with the final body to make the existing Development environment converge.

The function-body comparison initially found one material Development divergence: its already-applied `b25_record_contact_preference` did not copy `source_reference` into the append-only event row, although the final migration-1 source did. Migrations 2/3 did not replace that function. This was corrected with the new append-only migration `20261002130000_b25_contact_preference_event_evidence_replay_fix.sql`, dry-run confirmed that it was the only pending migration, and `db push --linked` applied it to Development. No preferences, event fixtures, or other application data were changed. The migration reuses the final migration-1 function body and preserves its existing ACL. After application, MD5 hashes of all 11 B25 function bodies in the repository's final migration chain match the linked Development `pg_proc.prosrc` bodies.

Read-only Development catalogs match the reconstructed final contract: all six affected delivery/preference tables have the expected final columns, defaults, constraints/FKs, indexes (including partial unique indexes), forced RLS, and expected policies; the three new tables have no direct grants to `anon`, `authenticated`, or `service_role`; all 11 B25 functions exist with expected signatures, `SECURITY DEFINER`, empty search path, and role-specific execute ACLs; no B25 view exists. The corrected preference-event function body also matches the repository's final body. This is a material contract comparison from migration definitions to the live Development catalog, not a fresh database execution.

The validator checks required tables, forced RLS, consent revocation and lease constraints, active-claim and append-only attempt indexes, B22 attempt immutability, raw resolver/claim ACLs, and provider fail-closed state. It does not prove migration ordering or every column/FK/index/function-body definition; those were reviewed separately above and through read-only catalogs. The validator passed on linked Development; it was not run against a fresh replay database.

**Migration evidence decision:** Fresh runtime replay was not executed because no supported disposable Supabase environment was available. A deterministic ordered migration-chain audit found no remaining conflicting statements, missing dependencies, undocumented Development-only objects, or final-contract divergence after the append-only correction. Migration Chain Static Reproducibility: **PASS**. Development parity: **95 local / 95 remote**, including all four B25 versions; the linked B25 validator passes. The standard `migration list --linked` direct database login still fails password authentication, so the remote ledger was confirmed with a read-only `supabase db query --linked` catalog query and the local file count. Historical migration edit: **MEDIUM / mitigated by the deterministic chain audit plus forward correction**. No evidence of the original first-applied migration-1 bytes was present in the recovery archive, so no historical contents were reconstructed.

## Live Development QA

Development fixtures used synthetic identities and reserved invalid-domain destinations. The accidental broad job had ten recipients: eight mapped to synthetic QA identities and two classified unknown/non-synthetic. It created ten internal in-app notification rows. Content was generic validation text. All ten delivery recipients ended terminal with `RECIPIENT_NOT_SUPPORTED` before adapter invocation; no recipient remains claimable. No external provider invocation or raw destination disclosure occurred. Preserve this as a **MEDIUM** Development fixture hygiene finding; do not delete immutable history or repeat the audience.

## Browser UAT

Authorized Principal route passed masked status and exercised acceptance, retryable/permanent failures, pause/resume, and safe ineligible state. Indonesian/English success state, Light/Dark practical review, widths 375/768/1440, named controls, and visible keyboard focus were checked. Teacher, Parent, and Student routes safely denied Communication Center; anonymous redirected to `/auth` without B25 data, but Vite emitted the known generic React hydration page error. Staff fresh detail route had zero console errors and successful server-function requests; broad fresh-context/per-persona request accounting and failure-state localization/theme pairings remain incomplete. Responsive measurements: 375 viewport/360 scroll width, 768/768, 1440/1440.

## Engineering Gates

- Focused B12/B20/B22/B25: **45 passed, 0 failed** (8 files).
- Full suite: **703 passed, 0 failed, 75 files**.
- TypeScript: PASS.
- Production build: PASS (serial, after stopping Vite).
- Changed-scope ESLint: PASS.
- Prettier on configured changed TS/JS/MD files: PASS. Generated Supabase types are kept in generator formatting to avoid unrelated format churn; SQL is not supported by the configured Prettier parser and was checked by linked migration validation.
- `git diff --check`: PASS at final check.
- Credential/PII scan: PASS; changed implementation, SQL, tests, and reports contain no QA password, environment file, private token, provider credential, browser storage, or routable destination. Synthetic reserved test values only.

## Mutation Accounting

- Development migrations: 4 (three original B25 migrations plus the append-only preference-event evidence correction).
- Development contact preference/event: 1/1.
- Synthetic contact/relationship changes: 1 destination update; 1 existing synthetic guardian notification-eligibility flag enabled.
- Jobs: 2 new B25 UAT jobs; one older B22 QA job still present.
- Recipients in all Development jobs: 12.
- B25 UAT attempt rows: 22; aggregate rows in Development: 24.
- Final operator retry command records: 7 total; this pass added five rows (one same-ID idempotent request, plus four terminal retry checks; the changed-payload conflict added none).
- Production migrations/data/Auth mutations: 0.
- External provider calls/messages: 0.
- Provider credentials: 0.

## Residual Limitations

Residual verification limits: a disposable runtime migration replay was unavailable, so only deterministic chain/static contract equivalence is claimed. An actual B25 job in a second school was unavailable, so cross-school probes used the real foreign school scope with B25 IDs from the first school plus unknown-ID comparison; active-lease pause semantics; contact change between claim and execution; separate-recipient worker concurrency; complete failure-state ID/EN and Light/Dark review; full keyboard traversal of every control; independent fresh-context console/network accounting across all personas also remain outside this final migration-only pass. Cross-scope function denials, no-existence-oracle comparisons, direct table/RPC denials, request replay/conflict, and terminal retry denials passed. The anonymous Vite `/auth` hydration error is generic app-shell debt (LOW); denial remained safe. The broad announcement is a MEDIUM fixture hygiene issue with terminal skipped history and no external side effect.

## Finding Matrix

| Severity | Finding                                                                                                                                                                                               | Release effect                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| MEDIUM   | Generic Development announcement reached ten staff snapshot recipients, eight synthetic and two unknown; internal notifications created; all external recipients terminally skipped, no adapter call. | Preserve immutable evidence; no further action needed.                        |
| MEDIUM   | First applied migration file was amended during Development iteration; this left the existing Development preference-event function without the source evidence reference until migration 4.          | Process deviation corrected forward; fresh runtime replay remains unexecuted. |
| LOW      | Anonymous Vite `/auth` redirect emits a generic React hydration page error; authorization denial is safe and no B25 data leaked.                                                                      | Existing app-shell backlog; does not block B25.                               |

## Release Decision

**Batch 25: READY FOR PR.** The deterministic migration-chain audit passed after a forward-only Development correction; the reconstructed final B25 contract and all 11 function bodies match Development. A fresh runtime replay was not executed because preview branching is unavailable under the linked project's plan. The focused and full suites, TypeScript, changed-scope ESLint, configured Prettier, diff check, production build, and credential/PII scan all passed after migration 4. Commit and push only the feature branch; do not merge or start B26. The fixture incident is assessed and preserved. No Production deployment, provider connection, or real message occurred.

## Final Runtime / Integrity Addendum

- Overlapping claim calls: one claim / one empty result for the same single recipient; no duplicate adapter effect.
- Lease expiry: first lease recovered as `WORKER_LEASE_EXPIRED`; new token obtained; stale-token finalization safely returned `CLAIM_EXPIRED`.
- Consent revoked after claim: resolver returned ineligible without destination; supported skip transition; no adapter invocation.
- Retry lifecycle: three retryable attempts; no fourth eligibility. Permanent failure ran once. Pause blocked new claim; resume permitted one Development adapter acceptance.
- Read-only aggregate: active leases 0; expired stuck leases 0; over-limit attempts 0; orphan attempts 0; duplicate attempt pairs 0; accepted-but-retryable rows 0; paused-claimed rows 0; tenant mismatches 0; forbidden raw destination columns 0.
- Production mutations 0; external provider calls/messages 0.
- Fresh runtime migration replay: NOT EXECUTED; no supported disposable Supabase environment was available. Deterministic ordered chain audit: PASS; Development final contract: materially equivalent; linked B25 validator: PASS.

## Final Authorization Addendum

- Capability evidence: Principal has `communication.delivery.manage` scoped to the demo school; Teacher does not. Principal's own-school server worker path succeeded with zero claims; Teacher's own-school worker path was denied.
- Authenticated PostgREST direct SELECT/INSERT/UPDATE/DELETE against `communication_contact_preferences`, `communication_contact_preference_events`, and `communication_delivery_operator_requests` returned SQLSTATE `42501` for Principal, Teacher, Parent, and Student. Anonymous received the same denial.
- Sensitive claim/resolve/finalize/skip RPCs returned permission denied for all authenticated personas and anonymous. Teacher/Parent/Student were denied operator projection, stats, pause, retry, and preference commands.
- Principal cross-school calls for projection, stats, pause, resume, retry, claim, preference mutation, and worker cycle returned safe denial or unavailable errors and no data. Real B25 IDs under the foreign school scope returned the same error markers as unknown IDs. Development had no B25 delivery object in the second synthetic school; no real/unknown guardian fixture was created.
- Same operator request ID and same recipient replayed identical `ALREADY_ACCEPTED`; same ID with a changed recipient returned `B25_IDEMPOTENCY_CONFLICT`. Success, permanent failure, attempt-cap, and ineligible retry requests were denied/no-op as `ALREADY_ACCEPTED` or `NOT_RETRYABLE`.
- Final operator request rows: 7; duplicate `(actor, school, request_id)` groups: 0. This pass created five rows for safe terminal retry/idempotency checks; the changed-payload conflict created none.
- Final read-only anomaly aggregate: active leases 0; stuck expired leases 0; attempts over cap 0; orphan attempts 0; duplicate attempt pairs 0; tenant mismatches 0; accepted-but-retryable 0; paused claimed 0; forbidden raw destination columns 0.
