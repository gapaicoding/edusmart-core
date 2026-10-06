import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  readCommunicationWorkerConfig,
  CommunicationWorkerConfigError,
} from "./communication-worker-config";
import {
  rotateAfter,
  runCommunicationWorker,
  runFairDeliveryCycle,
} from "./communication-worker-runtime";
import { createDevelopmentWorkerAdapter } from "./communication-worker-adapter.server";
import { safeWorkerHealthSnapshot } from "./communication-worker.server";

const migration = readFileSync(
  "supabase/migrations/20261006100000_b29_communication_delivery_worker_runtime.sql",
  "utf8",
);
const b25 = readFileSync(
  "supabase/migrations/20261002100000_b25_communication_delivery_operations.sql",
  "utf8",
);

const env = {
  NODE_ENV: "development",
  COMMUNICATION_WORKER_ENABLED: "true",
  SUPABASE_URL: "https://sqwdhcobkutozareivcq.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "in-memory-only-test-value",
};

describe("B29 communication worker runtime", () => {
  test("uses the approved bounded Development defaults", () => {
    const config = readCommunicationWorkerConfig(env);
    expect(config.pollIntervalMs).toBe(5_000);
    expect(config.claimBatchSize).toBe(10);
    expect(config.concurrency).toBe(2);
    expect(config.heartbeatIntervalMs).toBe(15_000);
    expect(config.staleAfterMs).toBe(45_000);
    expect(config.shutdownDrainMs).toBe(30_000);
  });

  test("fails safely for Production, disabled, invalid, and unsafe adapter configuration", () => {
    expect(() => readCommunicationWorkerConfig({ ...env, NODE_ENV: "production" })).toThrow(
      CommunicationWorkerConfigError,
    );
    expect(() =>
      readCommunicationWorkerConfig({ ...env, COMMUNICATION_WORKER_ENABLED: "false" }),
    ).toThrow(/COMMUNICATION_WORKER_ENABLED/);
    expect(() =>
      readCommunicationWorkerConfig({ ...env, COMMUNICATION_WORKER_BATCH_SIZE: "11" }),
    ).toThrow(/BATCH_SIZE/);
    expect(() =>
      readCommunicationWorkerConfig({ ...env, COMMUNICATION_WORKER_CONCURRENCY: "3" }),
    ).toThrow(/CONCURRENCY/);
    expect(() =>
      readCommunicationWorkerConfig({ ...env, COMMUNICATION_WORKER_ADAPTER: "http" }),
    ).toThrow(/adapter/);
    expect(() =>
      readCommunicationWorkerConfig({
        ...env,
        SUPABASE_URL: "https://another-project.supabase.co",
      }),
    ).toThrow(/Development URL/);
  });

  test("rotates deterministically after the persisted school cursor", () => {
    expect(rotateAfter(["c", "a", "b"], "a")).toEqual(["b", "c", "a"]);
    expect(rotateAfter(["c", "a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  test("round-robins schools before taking another recipient from a busy school", async () => {
    const remaining = new Map([
      ["a", 20],
      ["b", 1],
      ["c", 1],
    ]);
    const served = [];
    let cursor = null;
    await runFairDeliveryCycle(
      {
        eligibleSchools: async () =>
          [...remaining.keys()].filter((school) => remaining.get(school) > 0),
        getCursor: async () => cursor,
        setCursor: async (school) => {
          cursor = school;
        },
        claimOne: async (school) => {
          if (remaining.get(school) === 0) return [];
          remaining.set(school, remaining.get(school) - 1);
          return [
            {
              recipient_id: `${school}-recipient`,
              job_id: `${school}-job`,
              claim_token: "opaque",
              attempt_number: 1,
            },
          ];
        },
        processClaim: async (claim) => {
          served.push(claim.recipient_id.split("-")[0]);
          return {
            completed: 1,
            retryableFailures: 0,
            permanentFailures: 0,
            ambiguous: 0,
            safeSkipped: 0,
          };
        },
      },
      { maxClaims: 5, concurrency: 2 },
    );
    expect(served.slice(0, 3)).toEqual(["a", "b", "c"]);
    expect(served).toHaveLength(5);
  });

  test("bounds concurrent recipient execution", async () => {
    let active = 0;
    let maxActive = 0;
    let nextId = 0;
    let claimed = 0;
    await runFairDeliveryCycle(
      {
        eligibleSchools: async () => ["a"],
        getCursor: async () => null,
        setCursor: async () => {},
        claimOne: async () =>
          claimed < 4
            ? [
                {
                  recipient_id: `recipient-${nextId++}`,
                  job_id: "j",
                  claim_token: "t",
                  attempt_number: 1,
                },
              ].map((claim) => {
                claimed += 1;
                return claim;
              })
            : [],
        processClaim: async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          return {
            completed: 1,
            retryableFailures: 0,
            permanentFailures: 0,
            ambiguous: 0,
            safeSkipped: 0,
          };
        },
      },
      { maxClaims: 4, concurrency: 2 },
    );
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  test("isolates recipient failures, drains the bounded batch, and marks the unknown result ambiguous", async () => {
    const claims = ["first", "second"].map((recipient_id) => ({
      recipient_id,
      job_id: "job",
      claim_token: "token",
      attempt_number: 1,
    }));
    let processed = 0;
    const result = await runFairDeliveryCycle(
      {
        eligibleSchools: async () => ["school"],
        getCursor: async () => null,
        setCursor: async () => {},
        claimOne: async () => claims.splice(0, 1),
        processClaim: async (claim) => {
          processed += 1;
          if (claim.recipient_id === "first") throw new Error("safe error is not exposed");
          return {
            completed: 1,
            retryableFailures: 0,
            permanentFailures: 0,
            ambiguous: 0,
            safeSkipped: 0,
          };
        },
      },
      { maxClaims: 2, concurrency: 1 },
    );
    expect(processed).toBe(2);
    expect(result.claimed).toBe(2);
    expect(result.ambiguous).toBe(1);
    expect(result.completed).toBe(1);
  });

  test("starts, heartbeats, drains, and stops on graceful shutdown", async () => {
    const events = [];
    const controller = new AbortController();
    let cycles = 0;
    const deps = {
      register: async () => events.push("registered"),
      heartbeat: async (_id, state) => events.push(`heartbeat:${state}`),
      runCycle: async () => {
        cycles += 1;
        return {
          claimed: 0,
          completed: 0,
          retryableFailures: 0,
          permanentFailures: 0,
          ambiguous: 0,
          safeSkipped: 0,
        };
      },
      stop: async () => events.push("stopped"),
      sleep: async () => controller.abort(),
      log: (event) => events.push(event),
    };
    const result = await runCommunicationWorker(
      "worker-1",
      deps,
      { heartbeatIntervalMs: 50, staleAfterMs: 150, pollIntervalMs: 5, drainTimeoutMs: 10 },
      controller.signal,
    );
    expect(result.drainTimedOut).toBe(false);
    expect(cycles).toBe(1);
    expect(events).toContain("heartbeat:DRAINING");
    expect(events.at(-1)).toBe("worker_stopped");
  });

  test("bounds shutdown drain and leaves active lease recovery authoritative", async () => {
    const controller = new AbortController();
    let resolveCycle;
    const deps = {
      register: async () => {},
      heartbeat: async () => {},
      runCycle: () =>
        new Promise((resolve) => {
          resolveCycle = resolve;
        }),
      stop: async () => {},
      sleep: async () => {},
      log: () => {},
    };
    const running = runCommunicationWorker(
      "worker-2",
      deps,
      { heartbeatIntervalMs: 50, staleAfterMs: 150, pollIntervalMs: 5, drainTimeoutMs: 5 },
      controller.signal,
    );
    await new Promise((resolve) => setTimeout(resolve, 1));
    controller.abort();
    const result = await running;
    expect(result.drainTimedOut).toBe(true);
    resolveCycle?.({
      claimed: 0,
      completed: 0,
      retryableFailures: 0,
      permanentFailures: 0,
      ambiguous: 0,
      safeSkipped: 0,
    });
  });

  test("Development adapter handles deterministic outcomes without fetch/network", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("unexpected provider network");
    };
    try {
      const adapter = createDevelopmentWorkerAdapter("development");
      expect(
        (await adapter.send({ destination: "test+success@invalid", idempotencyKey: "logical-1" }))
          .kind,
      ).toBe("accepted");
      expect(
        (
          await adapter.send({
            destination: "test+timeout-before-send@invalid",
            idempotencyKey: "logical-2",
          })
        ).kind,
      ).toBe("retryable_failure");
      expect(
        (await adapter.send({ destination: "test+permanent@invalid", idempotencyKey: "logical-3" }))
          .kind,
      ).toBe("permanent_failure");
      expect(
        (
          await adapter.send({
            destination: "test+ambiguous-after-possible-accept@invalid",
            idempotencyKey: "logical-4",
          })
        ).kind,
      ).toBe("unknown");
      expect(
        (await adapter.send({ destination: "test+safe-skip@invalid", idempotencyKey: "logical-5" }))
          .kind,
      ).toBe("safe_skip");
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("health projection allowlists aggregate fields and rejects PII or secrets", () => {
    const safe = {
      workers: [
        {
          instance_id: "123e4567-e89b-12d3-a456-426614174000",
          status: "RUNNING",
          queue_depth: 2,
          last_heartbeat_at: "2026-10-06T00:00:00Z",
        },
      ],
      stale_worker_count: 0,
    };
    expect(safeWorkerHealthSnapshot(safe)).toEqual(safe);
    expect(() =>
      safeWorkerHealthSnapshot({
        ...safe,
        workers: [{ ...safe.workers[0], recipient_email: "x@example.invalid" }],
      }),
    ).toThrow();
    expect(safeWorkerHealthSnapshot({ ...safe, access_token: "never" })).not.toHaveProperty(
      "access_token",
    );
  });

  test("uses the existing B22/B25 queue, caps attempts, and never exposes machine RPC to browser roles", () => {
    expect(migration).toContain("public.communication_delivery_recipients");
    expect(migration).toContain("for update of r skip locked");
    expect(migration).toContain("create or replace function public.b25_claim_delivery_batch(");
    expect(migration).toContain(
      "return public.b29_claim_delivery_batch_core(null,p_actor,p_school_id,p_limit,p_lease_seconds)",
    );
    expect(migration).toContain("last_failure_retryable");
    expect(migration).toContain("DELIVERY_OUTCOME_UNKNOWN");
    expect(migration).toContain("dispatch_started_at");
    expect(migration).toMatch(
      /revoke all on function public\.b29_register_delivery_worker[\s\S]*from public,anon,authenticated,service_role/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.b29_register_delivery_worker[\s\S]*to service_role/,
    );
    expect(migration).toContain("force row level security");
    expect(b25).toContain("b25_request_delivery_retry");
    expect(b25).toContain("v_attempt<3");
    expect(b25).toContain("30*(2^(v_attempt-1))");
    expect(migration).toContain("least(900,30*(2^(v_attempt-1))::integer)");
  });

  test("fences dispatch and records ambiguous outcomes as terminal non-retryable", () => {
    expect(migration).toContain("v_row.dispatch_started_at is null and v_attempt<3");
    expect(migration).toContain(
      "when v_row.dispatch_started_at is null then 'permanent_failure' else 'unknown'",
    );
    expect(migration).toContain("'DELIVERY_OUTCOME_UNKNOWN'");
    expect(migration).toContain("last_failure_retryable=v_retry");
    expect(migration).toMatch(
      /where r\.id=p_recipient_id and r\.status='processing' and r\.claim_token=p_claim_token and r\.lease_expires_at>pg_catalog\.clock_timestamp\(\) and r\.dispatch_started_at is not null/,
    );
  });
});
