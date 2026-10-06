export type CommunicationWorkerConfig = {
  enabled: true;
  environment: "development" | "test";
  adapter: "development-test";
  pollIntervalMs: number;
  claimBatchSize: number;
  concurrency: number;
  heartbeatIntervalMs: number;
  staleAfterMs: number;
  shutdownDrainMs: number;
};

export class CommunicationWorkerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommunicationWorkerConfigError";
  }
}

function boundedInteger(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new CommunicationWorkerConfigError(`${name} must be an integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new CommunicationWorkerConfigError(`${name} must be between ${min} and ${max}.`);
  }
  return value;
}

export function readCommunicationWorkerConfig(
  env: Record<string, string | undefined> = process.env,
): CommunicationWorkerConfig {
  const environment = env["NODE_ENV"];
  if (environment === "production") {
    throw new CommunicationWorkerConfigError(
      "Communication worker startup is disabled in Production until an approved provider is configured.",
    );
  }
  if (environment !== "development" && environment !== "test") {
    throw new CommunicationWorkerConfigError("NODE_ENV must be development or test.");
  }
  if (env["COMMUNICATION_WORKER_ENABLED"] !== "true") {
    throw new CommunicationWorkerConfigError(
      "Set COMMUNICATION_WORKER_ENABLED=true to start the Development worker.",
    );
  }
  const adapter = env["COMMUNICATION_WORKER_ADAPTER"] ?? "development-test";
  if (adapter !== "development-test") {
    throw new CommunicationWorkerConfigError("Only the development-test adapter is available.");
  }
  const supabaseUrl = env["SUPABASE_URL"]?.trim();
  const serviceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new CommunicationWorkerConfigError(
      "Development Supabase server configuration is required.",
    );
  }
  try {
    const parsed = new URL(supabaseUrl);
    const isLocal =
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
    const isApprovedDevelopmentProject =
      parsed.protocol === "https:" && parsed.hostname === "sqwdhcobkutozareivcq.supabase.co";
    if (!isLocal && !isApprovedDevelopmentProject) {
      throw new Error("invalid protocol");
    }
  } catch {
    throw new CommunicationWorkerConfigError("SUPABASE_URL must be a valid Development URL.");
  }

  const pollIntervalMs = boundedInteger(
    env,
    "COMMUNICATION_WORKER_POLL_INTERVAL_MS",
    5_000,
    1_000,
    60_000,
  );
  const claimBatchSize = boundedInteger(env, "COMMUNICATION_WORKER_BATCH_SIZE", 10, 1, 10);
  const concurrency = boundedInteger(env, "COMMUNICATION_WORKER_CONCURRENCY", 2, 1, 2);
  const heartbeatIntervalMs = boundedInteger(
    env,
    "COMMUNICATION_WORKER_HEARTBEAT_INTERVAL_MS",
    15_000,
    5_000,
    60_000,
  );
  const shutdownDrainMs = boundedInteger(
    env,
    "COMMUNICATION_WORKER_DRAIN_TIMEOUT_MS",
    30_000,
    1_000,
    30_000,
  );

  return {
    enabled: true,
    environment,
    adapter,
    pollIntervalMs,
    claimBatchSize,
    concurrency,
    heartbeatIntervalMs,
    staleAfterMs: heartbeatIntervalMs * 3,
    shutdownDrainMs,
  };
}
