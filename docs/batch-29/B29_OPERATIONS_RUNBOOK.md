# Batch 29 Operations Runbook

## Development worker start

From the B29 worktree, configure the Development environment through the existing ignored local environment file, then explicitly opt in:

```powershell
$env:NODE_ENV = "development"
$env:COMMUNICATION_WORKER_ENABLED = "true"
bun run worker:communication
```

Startup rejects Production, missing server configuration, invalid bounds, unsupported adapters, and Supabase URLs outside the approved Development project or local Supabase. Do not pass secrets on command-line arguments.

Defaults are poll 5 seconds, claim batch 10, concurrency 2, heartbeat 15 seconds, stale threshold 45 seconds, and graceful drain 30 seconds. Overrides use `COMMUNICATION_WORKER_POLL_INTERVAL_MS`, `COMMUNICATION_WORKER_BATCH_SIZE`, `COMMUNICATION_WORKER_CONCURRENCY`, `COMMUNICATION_WORKER_HEARTBEAT_INTERVAL_MS`, and `COMMUNICATION_WORKER_DRAIN_TIMEOUT_MS`; invalid values fail startup.

## Stop gracefully

Send SIGINT or SIGTERM to the worker process. It stops taking new claims, updates health to DRAINING, waits up to 30 seconds for already claimed work, records STOPPED, and exits. If drain expires, it exits non-zero and relies on the existing B25 lease recovery path. Never manually finalize a claim whose external outcome is uncertain.

On Windows, use a normal interactive terminal and press Ctrl+C once. The live verified direct invocation is `bun src/workers/communication-delivery-worker.ts` after setting the Development environment above. Wait for `worker_stopped` and confirm persisted STOPPED; do not close the window first. Automated terminal wrappers that exit 130 or terminate their process tree are not proof of graceful shutdown. If PowerShell blocks a local QA launcher script, a process-local execution-policy override can be used for that reviewed launcher; no machine-wide policy change is required.

The final live reliability report records a successful interactive Ctrl+C/STOPPED run, alongside earlier wrapper failures and stale probes. Keep hard-stop/stale detection distinct from graceful-stop evidence.

## Health interpretation

The service-role-only RPC `b29_get_delivery_worker_health()` returns aggregate worker state and queue metrics without recipient destinations or message content. `STALE` means no heartbeat within three configured heartbeat intervals. The RPC is not a browser endpoint. Use the approved Development database operations channel to inspect it; never run against Production.

`queue_depth=0` means no eligible work was visible at that snapshot. A non-zero depth with no new cycles suggests a worker/polling or database connectivity issue. Compare heartbeat, last cycle, stale count, and oldest eligible age.

## Queue not draining

1. Confirm the Development worker is RUNNING and its heartbeat is fresh.
2. Check that the job is not paused and recipients are eligible under B25 contact/consent rules.
3. Check eligible age and safe aggregate outcomes.
4. Do not inspect or log raw destinations or message bodies.
5. Expired leases are recovered on later claim polling; a separate sweeper is not required.

## Retryable and permanent failures

B25 allows at most three attempts. Automatic retry delays are 30 seconds after attempt one and 60 seconds after attempt two. Permanent failures are terminal. Existing authorized B25 operator retry behavior remains the only manual retry path.

## Ambiguous outcomes

`DELIVERY_OUTCOME_UNKNOWN` means dispatch may have occurred but no definitive result was persisted. It is non-retryable. Reconcile through approved evidence before any future resolution; B29 provides no provider callback or automatic resend. Do not reset this state to queued or use manual retry to bypass the unknown outcome.

## Expired leases and multiple workers

Expired pre-dispatch leases may retry according to B25 bounds. Expired leases after the dispatch marker become unknown and do not resend. Multiple worker instances share atomic Postgres claims and use independent cursors. School operators cannot inspect another school's queue; the fleet health projection remains server-only.

## Zero real provider guarantee

B29 only selects the Development test adapter. It performs no external HTTP call and Production startup is rejected. No WhatsApp, email, SMS, provider callback, or payment integration is configured. B29 does not prove Production deployment readiness or real-provider delivery.
