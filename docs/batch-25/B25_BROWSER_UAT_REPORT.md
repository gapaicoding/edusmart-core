# EduSmart Batch 25 — Browser UAT Report

## Runtime

- Worktree: `D:\edusmart-worktrees\edusmart-core-b25`
- Runtime: `http://127.0.0.1:8081` (final runtime pass; 8080 was occupied)
- Persona: authorized synthetic Development Principal with `communication.delivery.manage`.
- Provider/network transmission: none.

## Staff/Admin

- Communication detail and delivery operations panel loaded.
- A guardian-only, single-recipient synthetic announcement was enqueued.
- Operational consent was recorded with a synthetic evidence reference.
- Masked destination rendered as `t•••@invalid`; raw destination was not present in visible text.
- One deterministic Development adapter acceptance was shown as adapter acceptance, not delivery/read receipt.
- An earlier broad synthetic announcement was mistakenly published with staff recipients. Its ten unsupported recipient rows were safely skipped by the bounded executor without adapter invocation. This Development-only audience mistake is recorded as a medium finding; no second broad announcement was created.

## Teacher / Parent / Student / Anonymous

- Teacher, Parent, and Student authenticated normally and received safe denial on `/communications`; no B25 operations terms or data appeared. Teacher Finance route was also denied.
- Anonymous navigation redirected to `/auth`; no B25 delivery/status/destination data appeared. Vite emitted a generic React hydration page error on the auth redirect. Record as LOW app-shell debt; protected access remained denied.
- Principal's capability was separately verified from Development membership-role permissions: capability present for demo school; Teacher capability absent. Direct authenticated client probes are recorded below.

## Eligibility UI

Consent-required state was visible before recording the synthetic operational preference; eligible/current-contact state was visible after. Purpose/channel evidence was entered through the authorized Staff flow.

## Masked Destination

The operator UI showed only a masked value. A browser body scan found no synthetic raw email or QA login identity on the authorized route.

## Pause/Resume

Pause prevented a new claim for a one-recipient synthetic job. Resume allowed the worker cycle to reach one Development adapter acceptance. Pause behavior for an already active lease was not tested.

## Retry

Retryable synthetic failure progressed through three attempts; after the configured cap no fourth retry control/eligibility remained. Permanent failure completed once and showed a safe failure state without a retry control. Direct operator command tests replayed the same request ID/recipient with the same `ALREADY_ACCEPTED` result; changing recipient under the same ID returned `B25_IDEMPOTENCY_CONFLICT`. Retry calls for success, permanent failure, attempt cap, and skipped/ineligible recipient returned safe `ALREADY_ACCEPTED` or `NOT_RETRYABLE` results.

## Localization

Indonesian default and English alternate were exercised on the settings and B25 detail surface. B25 labels/status strings changed language; no raw translation key was observed.

## Theme

Light and Dark settings were exercised. The dark class and dark background token were applied. Practical full contrast review across failure states was not completed.

## Responsive

- 375px: document scroll width did not exceed viewport width.
- 768px: no horizontal overflow.
- 1440px: no horizontal overflow.

## Accessibility

- B25 delivery panel has a semantic level-two heading.
- The evidence input has a programmatic label.
- All inspected visible buttons had accessible names.
- Tab moved to a visible focusable control (`:focus-visible` matched). Full keyboard operation through pause/retry/dialog controls was not exercised.

## Console/Network

- Authorized fresh Staff detail page: zero console errors; 6 observed requests, all successful, with no request loop. The response projection contained only masked `t•••@invalid`.
- Teacher/Parent/Student denied routes were exercised. Anonymous `/auth` produced the generic hydration error above.
- Full independent fresh-context request accounting across all personas, request-loop accounting, and network body review are incomplete.
- The executor is deterministic Development-only; no external provider request was observed.

## Security Negative Tests

Direct authenticated PostgREST probes from Principal, Teacher, Parent, and Student returned SQLSTATE `42501` for SELECT/INSERT/UPDATE/DELETE on the three B25 integrity tables; anonymous calls were denied as well. Direct claim/resolve/finalize/skip RPC attempts were denied to each persona and anonymous. Teacher/Parent/Student operator actions were denied. Principal had `communication.delivery.manage` for the demo school; Teacher did not. Principal's cross-school scope attempts for projection, stats, pause/resume, retry, claim, preference mutation, and worker cycle returned permission denied or unavailable responses with no data. Real B25 identifiers used under a foreign school scope produced the same denial markers as unknown IDs.

Development contained no B25 delivery object in the second synthetic school (B19 QA); its linked guardian was not confirmed as synthetic, so no new announcement/contact fixture was created. Cross-scope no-leak behavior is verified, but there was no actual second-school B25 row to query.

## Mutation Accounting

- Development migrations: 4 B25 migrations applied; local and remote have 95 migration versions. The linked migration-ledger query confirms all four B25 versions. `migration list --linked` still cannot authenticate its direct CLI database login.
- Synthetic preference/event: 1 preference and 1 event.
- Synthetic destination changes: 1 existing synthetic guardian contact updated to reserved invalid-domain test address; one existing synthetic guardian relationship notification flag enabled.
- Delivery jobs: 2 created for B25 UAT; one prior B22 QA job remained. The broad job was skipped; the guardian job had one deterministic adapter acceptance.
- B25 attempt rows: 22 rows across the two UAT jobs (10 unsupported skips and one acceptance, each with start/final append-only event); total Development attempts across all 3 jobs: 24 rows.
- Internal B20 announcement recipients: 10 from the mistaken broad synthetic draft and 1 from the guardian-only synthetic draft. The first announcement also created internal notifications; no external messages were transmitted.
- Production migrations/data/Auth changes: 0.
- Real messages, provider calls, provider credentials, real contact data: 0.

## Final Runtime Lifecycle Evidence

- Two overlapping claim calls against the same one-recipient synthetic job returned one claim and one empty result.
- Expired lease was reclaimed as `WORKER_LEASE_EXPIRED`; stale-token finalization returned `CLAIM_EXPIRED`.
- Revoking consent after claim made the resolver return ineligible without destination; supported skip completed with no adapter invocation.
- Read-only aggregate: 0 active leases, 0 stuck expired leases, 0 over-limit attempts, 0 orphan attempts, 0 duplicate attempt pairs, 0 tenant mismatches, and 0 forbidden raw destination columns.

## Migration Verification

Fresh runtime replay was not executed because the supported Supabase preview-branch create operation was unavailable under the linked project's plan entitlement. The deterministic ordered migration audit found one Development function-body divergence: the live contact-preference recorder omitted `source_reference` from immutable preference events. Append-only migration `20261002130000_b25_contact_preference_event_evidence_replay_fix` corrected it after a dry-run showing only that migration; the B25 validator then passed. All 11 B25 function body hashes now match the repository's final migration chain, and the reconstructed final contract is materially equivalent to the linked Development catalog. This is static/catalog evidence plus a Development forward correction, not a fresh replay result.

## Residual Limitations

Fresh runtime migration replay was unavailable; deterministic ordered-chain and Development catalog comparison passed. Active-lease pause, contact change after claim, complete failure-state localization/theme, and complete keyboard traversal remain unproven from the earlier UAT. The authorization checks above passed for existing scopes and identifiers. Independent fresh-browser-context accounting for every persona remains incomplete; direct hostile-call permission errors were expected and occurred during a shared Playwright session. See the Implementation Audit Report for the migration evidence level and release decision.
