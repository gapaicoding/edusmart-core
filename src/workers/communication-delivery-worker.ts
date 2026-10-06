import { randomUUID } from "node:crypto";
import { readCommunicationWorkerConfig } from "../lib/communication-worker-config";
import { runCommunicationWorker } from "../lib/communication-worker-runtime";
import { createCommunicationWorkerDependencies } from "../lib/communication-worker.server";
import { supabaseAdmin } from "../integrations/supabase/client.server";

const config = readCommunicationWorkerConfig();
const instanceId = randomUUID();
const dependencies = createCommunicationWorkerDependencies({
  serviceClient: supabaseAdmin,
  batchSize: config.claimBatchSize,
  concurrency: config.concurrency,
});
const shutdown = new AbortController();
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => shutdown.abort());
}

const runtime = runCommunicationWorker(
  instanceId,
  { ...dependencies, sleep },
  {
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    staleAfterMs: config.staleAfterMs,
    pollIntervalMs: config.pollIntervalMs,
    drainTimeoutMs: config.shutdownDrainMs,
  },
  shutdown.signal,
);

runtime
  .then(({ drainTimedOut }) => {
    process.exitCode = drainTimedOut ? 1 : 0;
    if (drainTimedOut) setTimeout(() => process.exit(1), 0);
  })
  .catch(() => {
    process.stderr.write("Communication worker stopped after an initialization/runtime error.\n");
    process.exitCode = 1;
  });
