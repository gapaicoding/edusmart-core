# Batch 29 Implementation Audit

## Baseline

- Canonical baseline fetched from `origin/main`: `91fcead8d8b43c653f1f72b1ef581826aa2f58ed`.
- Worktree: `D:\edusmart-worktrees\edusmart-core-b29`.
- Branch: `feat/b29-communication-delivery-worker-runtime`.
- Development migration count before B29: 106 local / 106 remote.

## Approved Scope

B29 adds a supervised Bun worker around the existing B22/B25 Postgres delivery queue. It does not add a provider, a second queue, a browser worker, or a Production dispatch path.

## Approved Product Decisions

- Worker home: separate repo-native Bun process.
- Defaults: 5 second poll, 10 claims per cycle, concurrency 2, 15 second heartbeat, 30 second maximum drain.
- Retry contract: B25 three attempts with 30 / 60 second backoff.
- Ambiguous dispatch results: persist `unknown`, do not retry automatically.
- Provider: Development fake adapter only; Production startup is rejected.
- Fairness: deterministic school round robin, bounded to one claim per school per round.

## Architecture

`bun run worker:communication` starts `src/workers/communication-delivery-worker.ts`. The worker uses server-only Supabase RPCs and the existing `communication_delivery_jobs`, `communication_delivery_recipients`, and `communication_delivery_attempts` tables. B25's public/server claim function delegates to one shared atomic claim implementation; no parallel queue or claim lifecycle was introduced.

## Reused B22/B25 Contracts

- B22 delivery job / recipient / attempt tables and tenant keys.
- B25 `FOR UPDATE SKIP LOCKED`, claim token, lease, attempt history, contact eligibility resolver, pause behavior, operator retry boundary, and three-attempt retry schedule.
- The B25 Development test adapter is reused. B29's deterministic fault signals do not issue HTTP requests.

## Migrations

Added `20261006100000_b29_communication_delivery_worker_runtime.sql`. It adds a worker identity/heartbeat registry and a recipient dispatch-start marker, then adds service-role-only lifecycle, health, fair-list, claim, dispatch-marker, and finalize RPCs. The B25 claim wrapper delegates to the shared core. Expired work without a dispatch marker can follow bounded retry; an expired claim after dispatch started becomes non-retryable `unknown` to avoid an automatic duplicate send.

The Development migration was applied. Current parity: **107 local = 107 remote**, with no missing or unexpected entries.

## Worker Runtime

- Validates configuration before startup and requires explicit `COMMUNICATION_WORKER_ENABLED=true`.
- Accepts only the approved Development Supabase project URL or a local Supabase URL. Production is rejected.
- Polls continuously with abortable sleep, bounded claim count, bounded concurrency, exception isolation, and school round robin.
- A shutdown request stops new claims and drains already claimed work up to the configured maximum; after timeout the B25 lease recovery remains authoritative.
- Worker logs contain instance identity, lifecycle, counts, and safe error categories; no recipient destinations or message bodies are logged.

## Heartbeat / Health

The server-only aggregate health RPC reports worker identity, `RUNNING` / `DRAINING` / `STOPPED` / computed `STALE`, heartbeat/cycle timestamps, counters, eligible queue depth, oldest eligible age, and stale count. The health RPC is not exposed to authenticated browser roles. No fleet health UI was added.

## Concurrency

Database claims use row locks with `SKIP LOCKED`, unique B25 attempt-start history, and claim-token/lease checks. Independent live workers each claimed and accepted bounded work. Database audit found zero duplicate attempt starts and zero duplicate accepted recipients. Expired and superseded ownership was rejected during live fencing tests.

## Fairness

The worker sorts and rotates eligible school IDs after a persisted per-worker cursor and claims at most one recipient per school per round. Live two-school workload (A four, B two) processed in A/B/A/B/A/A order; B received service before A drained.

## Retry / Recovery

B25's maximum of three attempts and 30 / 60 second schedule is retained. Live retry fixtures exhausted at attempt 3, with observed retry intervals approximately 33 / 60 seconds. Independent crash processes proved expired pre-dispatch recovery, post-dispatch unknown outcome, and stale-token rejection. See the live reliability report for exact timings and fixture limitations.

## Ambiguous Outcome Handling

The worker durably marks dispatch start before invoking the fake adapter. A returned ambiguous result or a stale lease after dispatch is recorded as `unknown` / `DELIVERY_OUTCOME_UNKNOWN`, with retry disabled. This avoids claiming exactly-once delivery and prevents automatic resend. The operator projection can identify the failure; no provider reconciliation flow exists in B29.

## Authorization / Security

- Worker registry table has RLS and FORCE RLS with direct grants revoked.
- Worker lifecycle, claim, health, dispatch, and finalization RPCs are service-role only; authenticated and anonymous browser roles cannot execute them.
- Human operations remain on B25 capability-checked interfaces.
- The service credential remains in the server process; it is not returned in validated configuration, logs, health, or browser payloads.
- The worker is pinned to the Development project URL and cannot start under `NODE_ENV=production`.

## Fake Adapter / Zero Network

The adapter reuses the deterministic B25 Development adapter and supports accepted, retryable, permanent, safe-skip, pre-send timeout, and ambiguous-after-possible-accept cases. A fetch spy test confirms zero adapter network calls. No real communication provider is configured or invoked.

## Development Migration Parity

Before: 106 / 106. After: **107 / 107**. Production was not accessed.

## Validators

- B18 foundation: PASS.
- B18 phase 2: PASS.
- B22: PASS.
- B25: PASS.
- B26: PASS.
- B29: PASS.

## Focused Tests

B20 / B22 / B25 / B29 communication suite: **36 passed, 0 failed** across six files. B29 runtime tests: **12 passed, 0 failed**.

## Full Regression

**736 passed, 0 failed** across 79 files.

## TypeScript / Lint / Prettier

- TypeScript: PASS (`bunx tsc --noEmit`).
- Changed-scope ESLint: PASS.
- Changed handwritten TypeScript / JavaScript / JSON Prettier: PASS.
- SQL files are not supported by the repository's Prettier parser configuration; SQL validators and `git diff --check` provide SQL checks.

## Production Build

PASS (`bun run build`). Existing TanStack Start deprecation notices in unrelated attendance functions remain outside B29 scope.

## Live Worker UAT

Bounded synthetic fixtures were prepared through normal authenticated domain flows across two existing schools. Live accepted, retryable, permanent, safe-skip, pre-send-timeout, and ambiguous outcomes were exercised. Heartbeat and stale detection passed. A normal interactive terminal Ctrl+C produced `worker_stopped`, and Development persisted STOPPED for worker `cb11fb90-32ca-44c2-84b0-16fabba2fb95`. Earlier automated terminal wrapper failures remain QA tooling history; they do not establish a product defect.

## Two-Worker Concurrency UAT

PASS. Two independent processes registered, heartbeated, and each accepted one recipient under contention. Duplicate attempt-start and duplicate accepted checks returned zero.

## Crash Recovery UAT

PASS. Independent child-process crash before dispatch recovered safely to an accepted second attempt; a crash after the durable dispatch marker became unknown without resend. Expired and replaced claim-token continuation/finalization was denied. No direct queue-row fabrication was used.

## Operations Browser UAT

PASS. Existing operations UI exercised Indonesian/dark mobile and English/light desktop, localized safe outcome text, masked contacts, keyboard navigation/activation, and no horizontal overflow. Authorized console/network counts were zero. Browser B29 worker registration, health, claim, and finalize calls were denied (403/42501) with no returned data; expected denial traffic was separate.

## Secret / PII Verification

No credential, destination, message body, or provider secret is present in the new runtime logs, health projection, or documentation. The fake adapter test asserts zero `fetch` calls. Repository change-scope scans are recorded with the final check results.

## Production Safety

- Production database/Auth/data changes: 0.
- Real external communication: 0.
- Provider calls: 0.
- Payment / Midtrans changes: 0.
- Production dispatch: disabled by startup validation and Development URL pinning.

## Findings

BLOCKER **0**; HIGH **0**. Former empty-queue and shutdown/browser verification gaps are closed by `B29_LIVE_RELIABILITY_UAT_REPORT.md`. They remain historical QA prerequisites/tooling incidents, not current unresolved findings. No product code, tests, SQL, or configuration changed during the live closure; engineering evidence is retained.

## Release Decision

**READY FOR PR.** Engineering and live reliability gates pass. Final Development state: 11 worker identities (2 STOPPED, 9 computed STALE), 19 jobs, 30 recipients, no eligible work, and zero duplicate starts/accepted recipients or retry-enabled unknown recipients. Development parity remains **107 = 107**. Stage 2 remains OPEN. Batch 29 is NOT PERMANENTLY CLOSED; PR, merge, and post-merge verification remain required. Batch 30 is NOT STARTED.
