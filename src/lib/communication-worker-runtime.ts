export type WorkerClaim = {
  recipient_id: string;
  job_id: string;
  claim_token: string;
  attempt_number: number;
};

export type WorkerCycleResult = {
  claimed: number;
  completed: number;
  retryableFailures: number;
  permanentFailures: number;
  ambiguous: number;
  safeSkipped: number;
};

export type FairCycleDependencies = {
  eligibleSchools: () => Promise<string[]>;
  claimOne: (schoolId: string) => Promise<WorkerClaim[]>;
  processClaim: (claim: WorkerClaim) => Promise<Omit<WorkerCycleResult, "claimed">>;
  getCursor: () => Promise<string | null>;
  setCursor: (schoolId: string) => Promise<void>;
  shouldStop?: () => boolean;
};

export function rotateAfter<T extends string>(items: readonly T[], cursor: T | null): T[] {
  const sorted = [...new Set(items)].sort((a, b) => a.localeCompare(b));
  if (sorted.length === 0 || cursor === null) return sorted;
  const splitAt = sorted.findIndex((item) => item.localeCompare(cursor) > 0);
  return splitAt === -1 ? sorted : [...sorted.slice(splitAt), ...sorted.slice(0, splitAt)];
}

async function mapBounded<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
) {
  const results: Array<R | undefined> = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index]!);
      } catch {
        results[index] = undefined;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runFairDeliveryCycle(
  dependencies: FairCycleDependencies,
  options: { maxClaims: number; concurrency: number },
): Promise<WorkerCycleResult> {
  const claims: WorkerClaim[] = [];
  let cursor = await dependencies.getCursor();
  while (claims.length < options.maxClaims) {
    const schools = rotateAfter(await dependencies.eligibleSchools(), cursor);
    if (schools.length === 0) break;
    let progress = false;
    for (const schoolId of schools) {
      if (dependencies.shouldStop?.()) break;
      if (claims.length >= options.maxClaims) break;
      const next = await dependencies.claimOne(schoolId);
      if (next.length === 0) continue;
      progress = true;
      const accepted = next.slice(0, 1);
      claims.push(...accepted);
      cursor = schoolId;
      await dependencies.setCursor(schoolId);
    }
    if (!progress || dependencies.shouldStop?.()) break;
  }

  const result: WorkerCycleResult = {
    claimed: claims.length,
    completed: 0,
    retryableFailures: 0,
    permanentFailures: 0,
    ambiguous: 0,
    safeSkipped: 0,
  };
  const outcomes = await mapBounded(claims, options.concurrency, dependencies.processClaim);
  for (const outcome of outcomes) {
    if (!outcome) {
      // An executor rejection has an unknown side-effect boundary. Leave its
      // lease to the database recovery policy and never auto-send it again here.
      result.ambiguous += 1;
      continue;
    }
    result.completed += outcome.completed;
    result.retryableFailures += outcome.retryableFailures;
    result.permanentFailures += outcome.permanentFailures;
    result.ambiguous += outcome.ambiguous;
    result.safeSkipped += outcome.safeSkipped;
  }
  return result;
}

export type WorkerRuntimeState = "RUNNING" | "DRAINING" | "STOPPED";

export type WorkerRuntimeDependencies = {
  register: (instanceId: string, staleAfterSeconds: number) => Promise<void>;
  heartbeat: (
    instanceId: string,
    state: "RUNNING" | "DRAINING",
    metrics: WorkerCycleResult & { cycles: number },
  ) => Promise<void>;
  runCycle: (claimStop: AbortSignal, execution: AbortSignal) => Promise<WorkerCycleResult>;
  stop: (instanceId: string) => Promise<void>;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  log: (event: string, fields: Record<string, string | number>) => void;
};

const emptyMetrics = (): WorkerCycleResult & { cycles: number } => ({
  claimed: 0,
  completed: 0,
  retryableFailures: 0,
  permanentFailures: 0,
  ambiguous: 0,
  safeSkipped: 0,
  cycles: 0,
});

export async function runCommunicationWorker(
  instanceId: string,
  dependencies: WorkerRuntimeDependencies,
  config: {
    heartbeatIntervalMs: number;
    staleAfterMs: number;
    pollIntervalMs: number;
    drainTimeoutMs: number;
  },
  shutdown: AbortSignal,
): Promise<{ drainTimedOut: boolean; metrics: WorkerCycleResult & { cycles: number } }> {
  const metrics = emptyMetrics();
  await dependencies.register(instanceId, Math.ceil(config.staleAfterMs / 1_000));
  dependencies.log("worker_started", { instanceId });

  let heartbeatBusy = false;
  let lifecycle: "RUNNING" | "DRAINING" = "RUNNING";
  const heartbeatTimer = setInterval(() => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    void dependencies
      .heartbeat(instanceId, lifecycle, metrics)
      .catch(() => dependencies.log("worker_heartbeat_failed", { instanceId }))
      .finally(() => {
        heartbeatBusy = false;
      });
  }, config.heartbeatIntervalMs);

  const active = new AbortController();
  const claimStop = new AbortController();
  let drainTimedOut = false;
  let currentCycle: Promise<WorkerCycleResult> | undefined;
  let resolveShutdown!: () => void;
  const shutdownGate = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });
  const onShutdown = () => {
    claimStop.abort();
    resolveShutdown();
  };
  shutdown.addEventListener("abort", onShutdown, { once: true });
  if (shutdown.aborted) resolveShutdown();
  try {
    while (!shutdown.aborted) {
      try {
        currentCycle = dependencies.runCycle(claimStop.signal, active.signal);
        const result = await Promise.race([
          currentCycle.then(
            (cycle) => ({ kind: "cycle" as const, cycle }),
            () => ({ kind: "failure" as const }),
          ),
          shutdownGate.then(() => ({ kind: "shutdown" as const })),
        ]);
        if (result.kind === "shutdown") break;
        currentCycle = undefined;
        if (result.kind === "failure") throw new Error("Worker cycle failed.");
        const cycle = result.cycle;
        metrics.cycles += 1;
        metrics.claimed += cycle.claimed;
        metrics.completed += cycle.completed;
        metrics.retryableFailures += cycle.retryableFailures;
        metrics.permanentFailures += cycle.permanentFailures;
        metrics.ambiguous += cycle.ambiguous;
        metrics.safeSkipped += cycle.safeSkipped;
        await dependencies.heartbeat(instanceId, "RUNNING", metrics);
        dependencies.log("worker_cycle_completed", {
          instanceId,
          claimed: cycle.claimed,
          completed: cycle.completed,
          retryableFailures: cycle.retryableFailures,
          permanentFailures: cycle.permanentFailures,
          ambiguous: cycle.ambiguous,
          safeSkipped: cycle.safeSkipped,
        });
      } catch {
        currentCycle = undefined;
        dependencies.log("worker_cycle_failed", { instanceId });
      }
      if (shutdown.aborted) break;
      await dependencies.sleep(config.pollIntervalMs, shutdown);
    }
  } finally {
    lifecycle = "DRAINING";
    dependencies.log("worker_draining", { instanceId });
    try {
      await dependencies.heartbeat(instanceId, "DRAINING", metrics);
    } catch {
      dependencies.log("worker_heartbeat_failed", { instanceId });
    }
    if (currentCycle) {
      let drainTimer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<"timeout">((resolve) => {
        drainTimer = setTimeout(() => resolve("timeout"), config.drainTimeoutMs);
      });
      const drained = await Promise.race([
        currentCycle.then(
          () => "drained" as const,
          () => "drained" as const,
        ),
        timeout,
      ]);
      if (drained === "timeout") {
        drainTimedOut = true;
        active.abort();
      } else if (drainTimer) {
        clearTimeout(drainTimer);
      }
    }
    clearInterval(heartbeatTimer);
    shutdown.removeEventListener("abort", onShutdown);
    try {
      await dependencies.stop(instanceId);
    } catch {
      dependencies.log("worker_stop_record_failed", { instanceId });
    }
    dependencies.log("worker_stopped", { instanceId, drainTimedOut: Number(drainTimedOut) });
  }
  return { drainTimedOut, metrics };
}
