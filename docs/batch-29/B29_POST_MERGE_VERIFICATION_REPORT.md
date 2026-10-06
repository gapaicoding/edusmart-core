# Batch 29 Post-Merge Verification

## Decision

**BATCH 29 PERMANENTLY CLOSED.** Merge integrity, database/security contracts, engineering gates, and merged-main live worker/browser verification pass. BLOCKER 0; HIGH 0. Stage 2 remains OPEN; Batch 30 NOT STARTED. Real provider delivery and Production worker deployment are not claimed.

## PR / Merge Integrity

- PR: #24, identified from the actual merge commit message.
- Feature SHA: `c82a8c915ad3b8e7fa0929ee0cd8cf65811ca06a`.
- Merge SHA: `68891e90f7bcda0cd13513ca7cf71d778433f068`.
- Verified origin/main: `564ea67d814220a4bc8e2142412637396c692257`.
- Feature and merge commits are ancestors of verified main.
- Source, SQL, and package files are identical to the feature commit. No conflict markers were found in source, Supabase, or B29 docs.

## Baseline

Verified on 6 October 2026 in detached worktree `D:\edusmart-worktrees\edusmart-core-b29-postmerge`. HEAD equals verified origin/main. Canonical checkout was fast-forwarded, the approved historical discovery report was preserved, formatted, committed alone, and pushed as `564ea67d814220a4bc8e2142412637396c692257`. It describes its historical discovery baseline; it is not a current-runtime inventory.

Dependencies installed with frozen lockfile and copyfile backend using D-drive temporary/cache settings. `.env.local` was copied by filesystem only and remains ignored. No product source, test, SQL, or configuration was modified during verification.

## Development Migration Parity

PASS: **107 local = 107 Development**. Timestamp sets were compared: missing local 0, missing remote 0, unexpected remote 0, duplicate local timestamps 0. Latest `20261006100000`. The only migration change since the pre-B29 baseline is the additive B29 migration; older B22/B25 migrations are unchanged. No migration was applied during verification.

## B22 / B25 Compatibility

The existing jobs, recipients, and append-only attempts remain authoritative; no parallel queue exists. B25 claim delegates to the shared core, retaining atomic locking, token/lease fencing, school scope, three attempts, and 30/60-second backoff. Existing capability-authorized manual retry remains intact. Source comparison, focused tests, and B22/B25 validators pass.

## B29 Database Contract

Worker registry, safe health projection, polling, bounded concurrency, school rotation, dispatch-start marker, unknown outcomes, and shutdown are present in merged main. RLS and FORCE RLS are enabled on the worker registry. B29 worker RPC grants to PUBLIC/anon/authenticated: 0. Machine authority remains server-only. Source requires an approved Development/local project and rejects Production startup.

## Validators

| Validator      | Result |
| -------------- | ------ |
| B18 foundation | PASS   |
| B18 phase 2    | PASS   |
| B22            | PASS   |
| B25            | PASS   |
| B26            | PASS   |
| B29            | PASS   |

Validators ran against the approved Development project through the established linked CLI query mechanism.

## Database Anomalies

Read-only checks returned 0 for invalid lifecycle/heartbeat/stopped combinations, malformed active claims, duplicate claim tokens, duplicate attempt starts, unsafe retryable unknown rows, exhausted rows wrongly eligible, cross-school recipient relationships, orphan/cross-school attempt relationships, orphan/cross-school jobs, terminal failures with a next attempt, and dispatch markers without matching attempt starts. Duplicate accepted recipients: 0. Source and automated tests enforce stale-token finalization rejection; no fresh post-merge crash matrix was fabricated.

## Focused Tests

Communication suite: **36 passed, 0 failed, 6 files**. B29 runtime subset independently rerun: **12 passed, 0 failed**.

## Full Regression

**736 passed, 0 failed, 79 files**. Counts match pre-merge evidence.

## TypeScript / Lint / Prettier

TypeScript PASS. B29 changed-scope ESLint PASS, lint regression 0. Handwritten changed scope and B29 Markdown Prettier PASS. `git diff --check` PASS. Inherited repository-wide lint debt was not normalized.

## Production Build

PASS with process-local `UV_THREADPOOL_SIZE=1`. Two default runs encountered Windows `EBUSY` during Nitro external dependency copy into `.output` (duplicate tslib tracing). Serial filesystem worker execution completed the full production build without source/config changes. Existing Vite/TanStack deprecation notices are unrelated to B29. No deployment occurred.

## Post-Merge Worker Runtime

PASS for startup, persisted RUNNING, heartbeat, polling, and safe health. Probe `a6a57c83-2577-43c6-8017-0318e89573c9` registered from the post-merge worktree, advanced cycles, and reported queue depth 0. It was intentionally hard-stopped only for stale detection.

## Live Eligible Delivery

PASS. Existing queue had zero eligible work, so three small announcements were created/published through existing authenticated B20 functions, then enqueued through B22. Existing guardians, contacts, verification, consent, and relationships were reused without changes. School A had four pending recipients; School B had one. No queue table was directly populated.

| Synthetic fixture | Announcement ID                        | Derived recipients |
| ----------------- | -------------------------------------- | -----------------: |
| A1                | `eba0e16e-12d0-4293-8931-5d167bb7f036` |                  2 |
| A2                | `722252cb-92b4-440a-9c19-62d7d59caa95` |                  2 |
| B1                | `fb0a2878-e5b3-407b-908b-290cb010e81e` |                  1 |

Claims, append-only attempt starts, fake-adapter execution, and durable finalization were observed. Three recipients accepted at attempt 1; two retryable synthetic recipients exhausted at attempt 3. Fixture additions: three announcements, three jobs, five recipients, nine attempt starts and nine final outcome events. Four worker registry identities were added during post-merge verification. Students/guardians/contacts/preferences/Auth/permissions/memberships added or changed: 0. Fixtures and audit remain as synthetic Development evidence.

## Two-Worker Contention

PASS. Independent processes `ff47478f-d327-4ccf-914a-0f5ade962c48` and `3478b1ab-0268-4177-a55c-7e18b31c630f` registered at `11:58:34.151 UTC` and `11:58:34.292 UTC`. Both persisted RUNNING, fresh heartbeats, increasing cycles, and successful claims/finalizations. Each first cycle claimed two recipients under configured batch 2/concurrency 1. Database checks returned duplicate active claim tokens 0, duplicate attempt starts 0, duplicate accepted recipients 0. Both processes used the merged-main worktree and the same Development database.

## Fairness

PASS. Initial first-start order was **A → A → B → A → A** under two-worker contention. School B started at `11:58:35.626303 UTC`, before remaining School A starts at `11:58:35.945237 UTC` and `11:58:42.332789 UTC`. School A did not monopolize the workload. Both existing school contexts were read-only verified as authorized for the synthetic operator. Safe opaque IDs/timestamps were inspected; no foreign recipient content was exposed.

## Heartbeat / Stale Detection

PASS. Fresh heartbeat and increasing cycle counts verified. Dedicated hard-stop probe subsequently reported computed STALE after its configured 45-second threshold, with five persisted cycles. Hard stop is not graceful-stop evidence.

## Graceful Shutdown

PASS. A normal interactive PowerShell terminal ran the merged-main worker directly. The Product Owner pressed Ctrl+C once and confirmed `worker_stopped`. Worker `f2d704ea-ff3c-4ca2-83f3-3b17476a4731` persisted RUNNING from `11:59:04.174255 UTC` and STOPPED at `12:00:15.147517 UTC`. It performed one real retryable execution before stopping. The runtime stops claiming on abort, logs DRAINING, awaits the DRAINING heartbeat, drains bounded in-flight work, persists STOPPED, then emits `worker_stopped`; this final event and database state were confirmed. No drain timeout was reported. The run did not use taskkill/Stop-Process as graceful evidence. Earlier pre-merge automated wrapper failures remain QA tooling history.

## Ambiguous Outcome Safety

Source durably marks dispatch before adapter execution. Existing three unknown recipients are failed, non-retryable, and have no next attempt. Unsafe unknown retry rows: 0. No automatic resend path is enabled; manual ambiguity bypass is excluded by the existing contract. No real-provider exactly-once guarantee is claimed.

## Operations Browser Smoke

PASS. Manual login reused the existing normalized synthetic communication operator at `http://127.0.0.1:5193`. Listener process command line points to the post-merge worktree; `/auth` HTTP 200. Existing operations rendered accepted, retryable, permanent, and unknown safely. Indonesian/dark mobile (375px) and English/light desktop (1440px) passed with no page-wide overflow or unreadable critical controls. Tab/Shift+Tab gave visible focus; Enter activated the return navigation link without mutation or trapping focus. No raw translation keys appeared.

Retry eligibility and the simulated temporary-failure label were observed while the new School A recipient still awaited retry; subsequent exhaustion rendered the same safe failure label. Existing permanent and unknown records were inspected read-only. Operations display masked contacts; the authorized B20 announcement body remains in its own detail section and is absent from delivery projections. No password reset or Auth change occurred.

## Browser Worker-RPC Boundary

PASS DENIAL. Normal authenticated browser calls to `b29_register_delivery_worker`, `b29_get_delivery_worker_health`, `b29_claim_delivery_batch`, and `b29_finalize_delivery_attempt` all returned HTTP 403 / SQLSTATE 42501, no data. Database grants and validator also pass. Four expected denial console/status events were recorded separately after freezing the clean authorized capture.

## Console / Network

PASS. Listeners were registered before manual login/navigation. Authorized capture recorded page errors 0, console errors 0, unexpected warnings 0, failed requests 0, unexpected 401/403/500 0, communication-provider requests 0, and Midtrans requests 0. Explicit browser authorization probes produced four expected 403 denials separately. Adapter tests assert zero network calls; merged source uses only the deterministic Development adapter. No real message or provider call was initiated.

## Secret / PII Verification

PASS. Changed-scope secret-pattern scan found no credential values. Server credentials remained in ignored local configuration and were never printed. Health exposes aggregate identity/status/counters only; read-only inspection found no forbidden destination/body/token/credential fields. Authenticated operations response checks found no raw destination, message body, token, Authorization header, or service credential. Screenshots/logs/temporary launcher scripts stayed outside the staged repository. Real PII introduced: 0.

## Production Safety

Production migrations/data/Auth/worker executions 0; real provider calls/messages 0; payment calls/Midtrans changes/public communication callbacks 0. Only the approved Development project was accessed.

Final pre-cleanup Development snapshot: 15 worker instances (2 RUNNING verification processes, 3 STOPPED, 10 computed STALE); 22 jobs; 35 recipients (12 sent, 10 failed, 13 skipped). Both new retryable recipients exhausted safely; no eligible fixture work remains. Historical stale probes and immutable audit are retained. Worker/Vite process cleanup follows report push; the two remaining runtime processes must not be left running.

## Findings

BLOCKER **0**; HIGH **0**. No merge regression or product defect was demonstrated. Required live/manual gates now pass. The Windows build-copy issue was resolved through a process-local execution setting without repository changes. Only this verification report is added after the completed checks; tests are not rerun solely for Markdown edits.

## Permanent Closure Decision

**BATCH 29 PERMANENTLY CLOSED.** The feature and merge are contained in main, migration parity is equal, all six validators and engineering checks pass, database anomalies are zero, live eligible execution/contention/fairness and interactive shutdown pass, and browser boundaries/console/security pass. Stage 2 **OPEN**. Batch 30 **NOT STARTED**. No real WhatsApp/email/SMS delivery, Production worker deployment, or Stage 2 completion is claimed.
