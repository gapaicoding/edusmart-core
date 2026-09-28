export type DevelopmentDeliveryOutcome =
  | { kind: "accepted"; providerMessageId: string }
  | { kind: "retryable_failure"; failureCode: "TEST_TEMPORARY_FAILURE" }
  | {
      kind: "permanent_failure";
      failureCode: "TEST_INVALID_DESTINATION" | "TEST_MISSING_DESTINATION";
    };

export type DeliveryAdapterRequest = {
  destination: string;
  idempotencyKey: string;
};

export interface ExternalDeliveryAdapter {
  send(request: DeliveryAdapterRequest): Promise<DevelopmentDeliveryOutcome>;
}

export function isDeliveryRetryEligible(
  outcome: DevelopmentDeliveryOutcome,
  completedAttempts: number,
  maximumAttempts = 3,
): boolean {
  return (
    outcome.kind === "retryable_failure" &&
    Number.isInteger(completedAttempts) &&
    completedAttempts >= 1 &&
    completedAttempts < maximumAttempts
  );
}

/**
 * Deterministic, non-network adapter for tests/development only. It accepts
 * synthetic invalid-domain destinations and rejects all other addresses.
 */
export function createDevelopmentTestDeliveryAdapter(
  runtimeEnvironment: string | undefined = process.env["NODE_ENV"],
): ExternalDeliveryAdapter {
  if (runtimeEnvironment === "production") {
    throw new Error("The development delivery adapter is disabled in production.");
  }

  const outcomesByKey = new Map<string, DevelopmentDeliveryOutcome>();
  return {
    async send({ destination, idempotencyKey }) {
      const previous = outcomesByKey.get(idempotencyKey);
      if (previous) return previous;

      let outcome: DevelopmentDeliveryOutcome;
      switch (destination) {
        case "test+success@invalid":
          outcome = { kind: "accepted", providerMessageId: `test-${idempotencyKey}` };
          break;
        case "test+retryable@invalid":
          outcome = { kind: "retryable_failure", failureCode: "TEST_TEMPORARY_FAILURE" };
          break;
        case "test+permanent@invalid":
          outcome = { kind: "permanent_failure", failureCode: "TEST_INVALID_DESTINATION" };
          break;
        case "":
          outcome = { kind: "permanent_failure", failureCode: "TEST_MISSING_DESTINATION" };
          break;
        default:
          throw new Error("The development adapter only accepts synthetic test destinations.");
      }

      outcomesByKey.set(idempotencyKey, outcome);
      return outcome;
    },
  };
}
