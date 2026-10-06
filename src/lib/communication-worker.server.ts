import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  createDevelopmentWorkerAdapter,
  type WorkerAdapter,
} from "./communication-worker-adapter.server";
import {
  runFairDeliveryCycle,
  type WorkerClaim,
  type WorkerCycleResult,
} from "./communication-worker-runtime";

type RpcClient = Pick<SupabaseClient<Database>, "rpc">;

async function rpc<T>(client: RpcClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name as never, args as never);
  if (error) throw new Error("Communication worker operation failed.");
  return data as T;
}

export type WorkerMetrics = WorkerCycleResult & { cycles: number };

export function createCommunicationWorkerDependencies(input: {
  serviceClient: RpcClient;
  adapter?: WorkerAdapter;
  batchSize: number;
  concurrency: number;
}) {
  const adapter = input.adapter ?? createDevelopmentWorkerAdapter();
  let instanceId = "";
  let schoolCursor: string | null = null;
  const log = (event: string, fields: Record<string, string | number> = {}) => {
    process.stdout.write(
      `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields })}\n`,
    );
  };

  return {
    log,
    async register(id: string, staleAfterSeconds: number) {
      instanceId = id;
      await rpc(input.serviceClient, "b29_register_delivery_worker", {
        p_instance_id: id,
        p_instance_name: `worker-${id.slice(0, 12)}`,
        p_stale_after_seconds: staleAfterSeconds,
      });
      schoolCursor = await rpc<string | null>(
        input.serviceClient,
        "b29_get_delivery_worker_cursor",
        { p_instance_id: id },
      );
    },
    async heartbeat(id: string, lifecycleStatus: "RUNNING" | "DRAINING", current: WorkerMetrics) {
      await rpc(input.serviceClient, "b29_heartbeat_delivery_worker", {
        p_instance_id: id,
        p_lifecycle_status: lifecycleStatus,
        p_metrics: {
          cycles: current.cycles,
          claimed: current.claimed,
          completed: current.completed,
          retryableFailures: current.retryableFailures,
          permanentFailures: current.permanentFailures,
          ambiguous: current.ambiguous,
          safeSkipped: current.safeSkipped,
        },
      });
      const snapshot = (await getCommunicationWorkerHealth(input.serviceClient)) as {
        workers: Array<Record<string, unknown>>;
        stale_worker_count: number;
      };
      const own = snapshot.workers.find((worker) => worker["instance_id"] === id);
      if (own) {
        log("worker_health", {
          instanceId: id,
          status: String(own["status"]),
          queueDepth: Number(own["queue_depth"] ?? 0),
          oldestEligibleAgeSeconds: Number(own["oldest_eligible_age_seconds"] ?? 0),
          staleWorkerCount: snapshot.stale_worker_count,
        });
      }
    },
    async stop(id: string) {
      await rpc(input.serviceClient, "b29_stop_delivery_worker", { p_instance_id: id });
    },
    async runCycle(claimStop: AbortSignal, execution: AbortSignal): Promise<WorkerCycleResult> {
      if (claimStop.aborted)
        return {
          claimed: 0,
          completed: 0,
          retryableFailures: 0,
          permanentFailures: 0,
          ambiguous: 0,
          safeSkipped: 0,
        };
      const cycle = await runFairDeliveryCycle(
        {
          eligibleSchools: () =>
            rpc<string[]>(input.serviceClient, "b29_list_delivery_schools", {
              p_instance_id: instanceId,
            }),
          getCursor: async () => schoolCursor,
          setCursor: async (schoolId) => {
            schoolCursor = schoolId;
          },
          shouldStop: () => claimStop.aborted,
          claimOne: async (schoolId) =>
            rpc<WorkerClaim[]>(input.serviceClient, "b29_claim_delivery_batch", {
              p_instance_id: instanceId,
              p_school_id: schoolId,
              p_limit: 1,
              p_lease_seconds: 90,
            }),
          processClaim: async (claim) => {
            const resolved = await rpc<{
              eligible: boolean;
              reason?: string;
              destination?: string;
              channel?: "email" | "whatsapp";
            }>(input.serviceClient, "b25_resolve_claimed_delivery", {
              p_recipient_id: claim.recipient_id,
              p_claim_token: claim.claim_token,
            });
            if (!resolved.eligible || !resolved.destination || !resolved.channel) {
              await rpc(input.serviceClient, "b25_skip_claimed_delivery", {
                p_recipient_id: claim.recipient_id,
                p_claim_token: claim.claim_token,
                p_reason: resolved.reason ?? "INELIGIBLE",
              });
              return {
                completed: 0,
                retryableFailures: 0,
                permanentFailures: 0,
                ambiguous: 0,
                safeSkipped: 1,
              };
            }
            const marked = await rpc<{ marked: boolean }>(
              input.serviceClient,
              "b29_mark_delivery_dispatch_started",
              {
                p_recipient_id: claim.recipient_id,
                p_claim_token: claim.claim_token,
              },
            );
            if (!marked.marked)
              return {
                completed: 0,
                retryableFailures: 0,
                permanentFailures: 0,
                ambiguous: 0,
                safeSkipped: 1,
              };

            let outcome;
            try {
              outcome = await adapter.send({
                destination: resolved.destination,
                idempotencyKey: claim.recipient_id,
                signal: execution,
              });
            } catch {
              outcome = {
                kind: "unknown" as const,
                failureCode: "DELIVERY_OUTCOME_UNKNOWN" as const,
              };
            }
            const finalized = await rpc<{ finalized: boolean }>(
              input.serviceClient,
              "b29_finalize_delivery_attempt",
              {
                p_recipient_id: claim.recipient_id,
                p_claim_token: claim.claim_token,
                p_outcome: outcome.kind,
                p_failure_code: "failureCode" in outcome ? outcome.failureCode : null,
                p_message_reference: outcome.kind === "accepted" ? outcome.providerMessageId : null,
              },
            );
            if (!finalized.finalized)
              return {
                completed: 0,
                retryableFailures: 0,
                permanentFailures: 0,
                ambiguous: 1,
                safeSkipped: 0,
              };
            if (outcome.kind === "accepted")
              return {
                completed: 1,
                retryableFailures: 0,
                permanentFailures: 0,
                ambiguous: 0,
                safeSkipped: 0,
              };
            if (outcome.kind === "retryable_failure")
              return {
                completed: 0,
                retryableFailures: 1,
                permanentFailures: 0,
                ambiguous: 0,
                safeSkipped: 0,
              };
            if (outcome.kind === "unknown")
              return {
                completed: 0,
                retryableFailures: 0,
                permanentFailures: 0,
                ambiguous: 1,
                safeSkipped: 0,
              };
            if (outcome.kind === "safe_skip")
              return {
                completed: 0,
                retryableFailures: 0,
                permanentFailures: 0,
                ambiguous: 0,
                safeSkipped: 1,
              };
            return {
              completed: 0,
              retryableFailures: 0,
              permanentFailures: 1,
              ambiguous: 0,
              safeSkipped: 0,
            };
          },
        },
        { maxClaims: input.batchSize, concurrency: input.concurrency },
      );
      return cycle;
    },
  };
}

export function safeWorkerHealthSnapshot(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid worker health projection.");
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value["workers"]) || typeof value["stale_worker_count"] !== "number") {
    throw new Error("Invalid worker health projection.");
  }
  const allowed = new Set([
    "instance_id",
    "status",
    "started_at",
    "last_heartbeat_at",
    "last_cycle_at",
    "cycle_count",
    "claimed_count",
    "completed_count",
    "retryable_failure_count",
    "permanent_failure_count",
    "ambiguous_count",
    "safe_skipped_count",
    "queue_depth",
    "oldest_eligible_age_seconds",
  ]);
  const workers = value["workers"].map((rawWorker) => {
    if (!rawWorker || typeof rawWorker !== "object" || Array.isArray(rawWorker))
      throw new Error("Invalid worker health projection.");
    const worker = rawWorker as Record<string, unknown>;
    if (Object.keys(worker).some((key) => !allowed.has(key)))
      throw new Error("Worker health contains an unapproved field.");
    if (
      typeof worker["instance_id"] !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(worker["instance_id"]) ||
      !["RUNNING", "DRAINING", "STOPPED", "STALE"].includes(String(worker["status"]))
    ) {
      throw new Error("Worker health contains an invalid identity or status.");
    }
    for (const key of [
      "cycle_count",
      "claimed_count",
      "completed_count",
      "retryable_failure_count",
      "permanent_failure_count",
      "ambiguous_count",
      "safe_skipped_count",
      "queue_depth",
      "oldest_eligible_age_seconds",
    ]) {
      if (key in worker && (typeof worker[key] !== "number" || !Number.isFinite(worker[key]))) {
        throw new Error("Worker health contains an invalid metric.");
      }
    }
    return Object.fromEntries(
      [...allowed].filter((key) => key in worker).map((key) => [key, worker[key]]),
    );
  });
  return { workers, stale_worker_count: value["stale_worker_count"] };
}

export async function getCommunicationWorkerHealth(serviceClient: RpcClient): Promise<unknown> {
  const raw = await rpc<unknown>(serviceClient, "b29_get_delivery_worker_health", {});
  return safeWorkerHealthSnapshot(raw);
}
