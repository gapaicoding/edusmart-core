import { describe, expect, test } from "bun:test";
import {
  createDevelopmentTestDeliveryAdapter,
  isDeliveryRetryEligible,
} from "./communication-delivery.adapters.server";

describe("B22 development delivery adapter", () => {
  test("is deterministic and idempotent for a stable attempt key", async () => {
    const adapter = createDevelopmentTestDeliveryAdapter("test");
    const request = { destination: "test+success@invalid", idempotencyKey: "attempt-1" };
    const first = await adapter.send(request);
    const replay = await adapter.send(request);

    expect(first).toEqual(replay);
    expect(first.kind).toBe("accepted");
  });

  test("models retryable, permanent, and missing-destination outcomes without network I/O", async () => {
    const adapter = createDevelopmentTestDeliveryAdapter("test");
    expect(
      await adapter.send({ destination: "test+retryable@invalid", idempotencyKey: "retry" }),
    ).toEqual({ kind: "retryable_failure", failureCode: "TEST_TEMPORARY_FAILURE" });
    expect(
      await adapter.send({ destination: "test+permanent@invalid", idempotencyKey: "permanent" }),
    ).toEqual({ kind: "permanent_failure", failureCode: "TEST_INVALID_DESTINATION" });
    expect(await adapter.send({ destination: "", idempotencyKey: "missing" })).toEqual({
      kind: "permanent_failure",
      failureCode: "TEST_MISSING_DESTINATION",
    });
  });

  test("refuses production construction and rejects real-looking destinations", async () => {
    expect(() => createDevelopmentTestDeliveryAdapter("production")).toThrow(
      "disabled in production",
    );
    const adapter = createDevelopmentTestDeliveryAdapter("test");
    await expect(
      adapter.send({ destination: "someone@example.com", idempotencyKey: "not-a-test" }),
    ).rejects.toThrow("synthetic test destinations");
  });

  test("allows only bounded retries for retryable outcomes", () => {
    const retryable = { kind: "retryable_failure", failureCode: "TEST_TEMPORARY_FAILURE" };
    const permanent = { kind: "permanent_failure", failureCode: "TEST_INVALID_DESTINATION" };
    expect(isDeliveryRetryEligible(retryable, 1)).toBe(true);
    expect(isDeliveryRetryEligible(retryable, 2)).toBe(true);
    expect(isDeliveryRetryEligible(retryable, 3)).toBe(false);
    expect(isDeliveryRetryEligible(permanent, 1)).toBe(false);
  });
});
