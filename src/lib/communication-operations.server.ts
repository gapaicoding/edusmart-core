import {
  createDevelopmentTestDeliveryAdapter,
  type DevelopmentDeliveryOutcome,
} from "./communication-delivery.adapters.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type RpcClient = Pick<SupabaseClient<Database>, "rpc">;
type Claim = { recipient_id: string; job_id: string; claim_token: string; attempt_number: number };
type Resolved = {
  eligible: boolean;
  reason?: string;
  destination?: string;
  channel?: "email" | "whatsapp";
  attempt_number?: number;
};

async function rpc<T>(client: RpcClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name as never, args as never);
  if (error) throw new Error("Communication delivery operation could not be completed.");
  return data as T;
}

export async function runCommunicationDeliveryCycle(input: {
  actorProfileId: string;
  schoolId: string;
  limit: number;
  userClient: RpcClient;
}) {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "External communication execution is disabled until a production provider is configured.",
    );
  }
  await rpc<boolean>(input.userClient, "b25_assert_delivery_operator", {
    p_school_id: input.schoolId,
  });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const adapter = createDevelopmentTestDeliveryAdapter(process.env["NODE_ENV"]);
  const claims = await rpc<Claim[]>(supabaseAdmin, "b25_claim_delivery_batch", {
    p_actor: input.actorProfileId,
    p_school_id: input.schoolId,
    p_limit: input.limit,
    p_lease_seconds: 90,
  });
  const result = {
    claimed: claims.length,
    accepted: 0,
    retryableFailures: 0,
    permanentFailures: 0,
    skipped: 0,
  };

  for (const claim of claims) {
    const resolved = await rpc<Resolved>(supabaseAdmin, "b25_resolve_claimed_delivery", {
      p_recipient_id: claim.recipient_id,
      p_claim_token: claim.claim_token,
    });
    if (!resolved.eligible || !resolved.destination || !resolved.channel) {
      await rpc(supabaseAdmin, "b25_skip_claimed_delivery", {
        p_recipient_id: claim.recipient_id,
        p_claim_token: claim.claim_token,
        p_reason: resolved.reason ?? "INELIGIBLE",
      });
      result.skipped += 1;
      continue;
    }

    // Raw destination exists only in this server-local variable and the trusted
    // resolver response. It is never returned or logged.
    let outcome: DevelopmentDeliveryOutcome;
    try {
      outcome = await adapter.send({
        destination: resolved.destination,
        idempotencyKey: `${claim.recipient_id}:${claim.attempt_number}`,
      });
    } catch {
      // Never propagate an adapter exception that might contain a destination.
      outcome = { kind: "permanent_failure", failureCode: "TEST_UNSUPPORTED_DESTINATION" };
    }
    await rpc(supabaseAdmin, "b25_finalize_delivery_attempt", {
      p_recipient_id: claim.recipient_id,
      p_claim_token: claim.claim_token,
      p_outcome: outcome.kind,
      p_failure_code: outcome.kind === "accepted" ? null : outcome.failureCode,
      p_message_reference: outcome.kind === "accepted" ? outcome.providerMessageId : null,
    });
    if (outcome.kind === "accepted") result.accepted += 1;
    else if (outcome.kind === "retryable_failure") result.retryableFailures += 1;
    else result.permanentFailures += 1;
  }
  return result;
}
