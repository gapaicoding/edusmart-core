import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  createDevelopmentTestDeliveryAdapter,
  isDeliveryRetryEligible,
} from "./communication-delivery.adapters.server";

const migration = readFileSync(
  "supabase/migrations/20261002100000_b25_communication_delivery_operations.sql",
  "utf8",
);
const followup = readFileSync(
  "supabase/migrations/20261002110000_b25_delivery_projection_and_recovery.sql",
  "utf8",
);
const operatorProjection = readFileSync(
  "supabase/migrations/20261002120000_b25_delivery_contact_operator_projection.sql",
  "utf8",
);
const operations = readFileSync("src/lib/communication-operations.server.ts", "utf8");
const functions = readFileSync("src/lib/communication.functions.ts", "utf8");
const ui = readFileSync("src/components/communications/communication-center-ui.tsx", "utf8");
const validator = readFileSync(
  "supabase/validation/validate_b25_communication_delivery_operations.sql",
  "utf8",
);

describe("B25 communication delivery operations contract", () => {
  test("models channel and purpose separately and records revocation evidence", () => {
    expect(migration).toContain("channel text not null check (channel in ('whatsapp','email'))");
    expect(migration).toContain(
      "purpose text not null check (purpose in ('operational','marketing'))",
    );
    expect(migration).toContain("v_purpose<>'operational'");
    expect(migration).toContain(
      "consent_state text not null check (consent_state in ('unknown','granted','revoked'))",
    );
    expect(migration).toContain("communication_contact_preference_events");
    expect(migration).toContain("B25_CONSENT_EVIDENCE_REQUIRED");
  });

  test("uses current guardian contact and never returns raw destination in operator projection", () => {
    expect(migration).toContain("public.b25_resolve_claimed_delivery");
    expect(migration).toContain("v_g.email");
    expect(migration).toContain("v_g.phone");
    expect(followup).toContain("'masked_destination'");
    expect(migration).not.toMatch(/'destination'\s*,\s*g\.(email|phone)/i);
    expect(operatorProjection).toContain("'recipient_profile_id'");
    expect(operations).toContain("Raw destination exists only in this server-local variable");
    expect(operations).not.toContain("console.log");
  });

  test("rechecks eligibility at execution and skips unsupported or opted-out recipients", () => {
    expect(migration).toContain("v_pref.consent_state<>'granted'");
    expect(migration).toContain("v_pref.contact_state<>'verified_by_school'");
    expect(migration).toContain("ar.recipient_type<>'guardian'");
    expect(migration).toContain("b25_skip_claimed_delivery");
    expect(operations).toContain("b25_resolve_claimed_delivery");
  });

  test("uses DB-level skip-locked claims, expiring leases and append-only attempt events", () => {
    expect(migration).toMatch(/for update of r skip locked/i);
    expect(migration).toContain("lease_expires_at");
    expect(migration).toContain("WORKER_LEASE_EXPIRED");
    expect(migration).toContain("b25_delivery_attempt_start_once_idx");
    expect(migration).toContain("b25_delivery_attempt_final_once_idx");
    expect(migration).toContain("communication_delivery_attempts_number_key");
  });

  test("limits retries and supports pause and idempotent operator retry", () => {
    expect(migration).toContain("v_attempt<3");
    expect(migration).toContain("b25_operator_request_once");
    expect(migration).toContain("b25_set_delivery_job_paused");
    expect(functions).toContain("b25_request_delivery_retry");
    expect(ui).toContain("setExternalCommunicationDeliveryPaused");
    expect(ui).toContain("retryExternalCommunicationDelivery");
  });

  test("keeps raw claim and resolver RPCs out of authenticated browser ACLs", () => {
    expect(migration).toContain("to service_role");
    expect(migration).toMatch(
      /revoke all on function public\.b25_claim_delivery_batch[\s\S]*from public,anon,authenticated/,
    );
    expect(validator).toContain("B25_COMMUNICATION_DELIVERY_OPERATIONS_VALIDATION_PASS");
  });

  test("Development adapter has deterministic outcomes and fails closed in Production", async () => {
    const adapter = createDevelopmentTestDeliveryAdapter("test");
    expect(
      await adapter.send({ destination: "test+success@invalid", idempotencyKey: "b25-a" }),
    ).toEqual(await adapter.send({ destination: "test+success@invalid", idempotencyKey: "b25-a" }));
    expect((await adapter.send({ destination: "+0000000002", idempotencyKey: "b25-b" })).kind).toBe(
      "retryable_failure",
    );
    expect(
      (
        await adapter.send({
          destination: "b14.isolated.parent@edusmart.invalid",
          idempotencyKey: "b25-c",
        })
      ).kind,
    ).toBe("accepted");
    expect(() => createDevelopmentTestDeliveryAdapter("production")).toThrow(
      "disabled in production",
    );
    await expect(
      adapter.send({ destination: "guardian@external.invalid", idempotencyKey: "b25-real" }),
    ).rejects.toThrow("synthetic test destinations");
    expect(
      isDeliveryRetryEligible(
        { kind: "retryable_failure", failureCode: "TEST_TEMPORARY_FAILURE" },
        2,
      ),
    ).toBe(true);
    expect(
      isDeliveryRetryEligible(
        { kind: "retryable_failure", failureCode: "TEST_TEMPORARY_FAILURE" },
        3,
      ),
    ).toBe(false);
  });
});
