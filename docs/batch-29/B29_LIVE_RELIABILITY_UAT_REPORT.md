# Batch 29 Live Reliability UAT

## Baseline and method

Verified on 6 October 2026 in the existing B29 worktree, branch `feat/b29-communication-delivery-worker-runtime`, baseline `91fcead8d8b43c653f1f72b1ef581826aa2f58ed`. This continuation changed documentation only. Previously passing validators, focused tests (36/0), runtime tests (12/0), full suite (736/0, 79 files), TypeScript, changed-scope ESLint, and production build remain valid.

## Development synthetic QA preparation

Two existing independently scoped schools were used: SD EduSmart Indonesia and B19 Concurrency QA School. Existing synthetic students and guardians were reused. Guardian contacts, notification relationship eligibility, and verification/operational consent were established through the existing UI and authenticated domain functions. Eligibility was proven before enqueueing. Announcements were created, published, and enqueued through B20/B22 authenticated product functions. No delivery table was directly populated, and no grants, memberships, Auth users, or passwords were changed.

| Mutation                                        |                      Added / updated |
| ----------------------------------------------- | -----------------------------------: |
| Students added                                  |                                    0 |
| Guardians added                                 |                                    0 |
| Student–guardian relationships added            |                                    0 |
| Existing relationship notification flag updated |                                    1 |
| Guardian contact updates                        | 7 writes across 2 existing guardians |
| Consent / verification preference writes        |                                    3 |
| B20 announcements created and published         |                                   12 |
| B22 jobs created through enqueue                |                                   12 |
| Derived delivery recipients                     |                                   14 |
| Worker identities registered during closure     |                                    8 |

Initial fairness workload was six eligible recipients: School A four, School B two. Additional small fixtures exercised deterministic outcomes, two-process contention, and two crash windows. Synthetic fixtures and append-only audit remain; no evidence was deleted.

## One-worker delivery and outcomes

Worker `1a93191a-cd39-4dc2-bb8b-a6f3d5b3a7e8` registered, heartbeated, polled, and claimed six eligible recipients in its first cycle. Four were accepted and two retryable. Subsequent fixtures exercised permanent failure, safe skip, pre-send timeout, and ambiguous possible acceptance.

| Gate                     | Evidence / result                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Accepted                 | Durable accepted finalization; no duplicate accepted outcome                                                                               |
| Retryable / max attempts | Two School A recipients exhausted at attempt 3 with retry disabled and no next attempt                                                     |
| 30 / 60 second backoff   | Observed completion-to-next-start intervals 33.898 / 60.471 seconds and 33.386 / 60.730 seconds; polling accounts for delay beyond minimum |
| Permanent                | Terminal simulated invalid destination, no automatic retry                                                                                 |
| Safe skip                | Skipped recipient and safe operational presentation                                                                                        |
| Pre-send timeout         | First attempt recorded retryable simulated pre-send timeout with scheduled retry                                                           |
| Ambiguous                | Unknown outcome, retry disabled, no next attempt                                                                                           |
| Manual ambiguity retry   | Authenticated B25 retry returned `retried=false`, `NOT_RETRYABLE`                                                                          |

The contact used by the pre-send-timeout fixture was subsequently changed to the ambiguity signal before its second attempt. That second attempt became unknown. Timeout exhaustion is not claimed; the independent School A retry fixtures prove 30/60 backoff and attempt exhaustion.

## Two-worker contention and fairness

Independent workers `bbea731f-94ec-4054-8cd0-06c4d311ed47` and `d8410d0c-2c68-4ec6-8433-65504ff35572` registered concurrently, heartbeated, and each accepted one recipient using batch/concurrency limits of one. Database audit checks found zero duplicate attempt-start events and zero recipients with duplicate accepted events.

First-start processing order for the initial fairness workload was **A → B → A → B → A → A**. School B received service before School A drained. Safe opaque recipient IDs and database timestamps were inspected; no cross-school recipient content was logged.

## Crash recovery and fencing

A temporary QA harness outside the repository used existing machine RPCs and two independent processes. It created no queue rows. The child claimed two already-enqueued recipients with a 30-second lease, left one before dispatch, marked dispatch for the other, then exited intentionally.

- After lease expiry, claim polling recovered the pre-dispatch recipient as `WORKER_LOST_BEFORE_SEND`, with the retained 30-second retry delay.
- The post-dispatch recipient became non-retryable `DELIVERY_OUTCOME_UNKNOWN`.
- Both expired claim continuations were rejected. After the recovery worker acquired authoritative ownership, the old owner's late finalization was rejected again.
- The pre-dispatch recipient completed accepted on attempt 2. The post-dispatch recipient was not resent.
- A fetch spy around adapter execution observed zero adapter network calls. Database RPC traffic was excluded from this provider-network assertion.

## Heartbeat, stale detection, and graceful shutdown

Hard-stopped/crashed workers correctly became STALE after the configured threshold. Earlier zero-claim stale probes remain as historical QA evidence.

Automated Windows terminal wrappers failed to preserve a complete SIGINT shutdown; those runs are QA signal limitations, not product-defect evidence. A normal interactive PowerShell terminal subsequently ran the worker directly. The Product Owner pressed Ctrl+C and confirmed `worker_stopped`. Database verification confirmed worker `cb11fb90-32ca-44c2-84b0-16fabba2fb95` started at `10:14:59.021214 UTC` and persisted STOPPED at `10:15:31.927807 UTC`. The implementation logs DRAINING, awaits its heartbeat, then persists STOPPED before emitting `worker_stopped`. This run establishes the real interactive graceful-stop path; prior wrapper exit codes are not used as proof.

## Operations browser smoke

The existing authenticated synthetic operator used the B29 runtime at `http://127.0.0.1:5191`. No fleet page was invented. Existing external-delivery operations displayed accepted, permanent, skipped, and unknown outcomes safely. Indonesian/dark at 375px and English/light at 1440px were exercised, with no document overflow or clipped critical operations controls. Tab/Shift+Tab showed visible focus; Enter activated the return navigation link without a mutation or focus trap. Unknown text was localized and warned against resend before reconciliation. Contact values were masked and no raw translation key appeared.

The authenticated operations projection contained no raw destination, message body, token, credential, or service key. The normal authorized B20 announcement body remains visible in its own announcement detail; it is not included in the delivery operations projection. A mismatched school/announcement request was denied without foreign data.

Normal browser-role calls to B29 registration, health, claim, and finalization RPCs were denied with HTTP 403 / SQLSTATE 42501 and no returned data. These four expected denials were captured separately from the authorized clean smoke.

Authorized capture: page errors 0, console errors 0, unexpected warnings 0, request failures 0, unexpected 401/403/500 0, communication-provider requests 0, Midtrans requests 0.

## Final Development snapshot

Read-only Development inspection after closure recorded:

| Object / state                                          |      Count |
| ------------------------------------------------------- | ---------: |
| Worker instances                                        |         11 |
| RUNNING / DRAINING                                      |      0 / 0 |
| STOPPED / computed STALE                                |      2 / 9 |
| Delivery jobs                                           |         19 |
| Delivery recipients                                     |         30 |
| Eligible recipients                                     |          0 |
| Sent / failed / skipped recipients                      | 9 / 8 / 13 |
| Accepted attempt events                                 |          9 |
| Retryable-failure attempt events                        |         11 |
| Permanent-failure attempt events                        |         15 |
| Unknown attempt events                                  |          4 |
| Attempt-start events                                    |         39 |
| B29 synthetic jobs / recipients                         |    12 / 14 |
| Duplicate starts / duplicate accepted recipients        |      0 / 0 |
| Unknown recipients with retry enabled or a next attempt |          0 |

Attempt-event counts are historical events, not current recipient counts. Safe skips use the existing audit contract and are separately visible in recipient status/runtime counters.

## Security and Production safety

No real contact information was introduced. Adapter/provider network calls 0; real messages 0; Production migrations/data/Auth changes 0; capability/membership changes 0; payment calls 0. Machine credentials remained server-side. Temporary scripts, console profiles, screenshots, and logs are outside the staged feature. Production dispatch remains fail-closed. B29 does not establish real-provider exactly-once delivery or Production deployment readiness.

## Final findings and release decision

Both former HIGH verification gaps are superseded by the live evidence above. Report Prettier and `git diff --check` pass; changed-scope credential scans found no secret values. Development migration parity is **107 local = 107 remote**, latest version `20261006100000`. BLOCKER 0; HIGH 0. **READY FOR PR**. Batch 29 is not permanently closed; PR, merge, and post-merge verification remain required. Stage 2 OPEN; Batch 30 NOT STARTED.
