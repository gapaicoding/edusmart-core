import {
  createDevelopmentTestDeliveryAdapter,
  type DevelopmentDeliveryOutcome,
} from "./communication-delivery.adapters.server";

export type WorkerAdapterOutcome =
  | DevelopmentDeliveryOutcome
  | { kind: "unknown"; failureCode: "DELIVERY_OUTCOME_UNKNOWN" }
  | { kind: "safe_skip" };

export type WorkerAdapter = {
  send(input: {
    destination: string;
    idempotencyKey: string;
    signal?: AbortSignal;
  }): Promise<WorkerAdapterOutcome>;
};

/** Deterministic, zero-network adapter. Only reserved synthetic values control faults. */
export function createDevelopmentWorkerAdapter(
  environment = process.env["NODE_ENV"],
): WorkerAdapter {
  if (environment === "production") {
    throw new Error("The Development communication adapter is disabled in Production.");
  }
  const base = createDevelopmentTestDeliveryAdapter(environment);
  return {
    async send({ destination, idempotencyKey }) {
      switch (destination) {
        case "test+timeout-before-send@invalid":
          return { kind: "retryable_failure", failureCode: "TEST_TEMPORARY_FAILURE" };
        case "test+ambiguous-after-possible-accept@invalid":
          return { kind: "unknown", failureCode: "DELIVERY_OUTCOME_UNKNOWN" };
        case "test+safe-skip@invalid":
          return { kind: "safe_skip" };
        default:
          try {
            return await base.send({ destination, idempotencyKey });
          } catch {
            return { kind: "permanent_failure", failureCode: "TEST_UNSUPPORTED_DESTINATION" };
          }
      }
    },
  };
}
