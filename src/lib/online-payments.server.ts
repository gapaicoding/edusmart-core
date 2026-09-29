import type { Database, Json } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type AdminRpcClient = Pick<SupabaseClient<Database>, "rpc">;

const SAFE_ERRORS: Record<string, string> = {
  B24_FORBIDDEN: "You do not have access to online payment for this invoice.",
  B24_NOT_FOUND: "The online payment record is unavailable.",
  B24_NOT_ELIGIBLE: "This invoice is not eligible for online payment.",
  B24_REQUEST_CONFLICT: "This request ID was already used with different details.",
  B24_EVENT_CONFLICT: "This provider event identity conflicts with a prior event.",
  B24_INVALID_EVENT: "The test payment event is invalid.",
  B19_FINANCE_FORBIDDEN: "You do not have permission to reconcile this payment.",
};

export function onlinePaymentError(
  error: { message: string; code?: string },
  label: string,
): Error {
  const match = Object.keys(SAFE_ERRORS).find((code) => error.message.includes(code));
  if (match) return new Error(SAFE_ERRORS[match]);
  if (error.code === "42501") return new Error(SAFE_ERRORS["B24_FORBIDDEN"]);
  return new Error(`${label} could not be completed. Reload and try again.`);
}

export async function callOnlinePaymentRpc<T extends Json = Json>(
  client: AdminRpcClient,
  name: string,
  args: Record<string, unknown>,
  label: string,
): Promise<T> {
  const { data, error } = await client.rpc(name as never, args as never);
  if (error) throw onlinePaymentError(error, label);
  return data as T;
}

export type B24IntentForAdapter = {
  id: string;
  amountIdr: number;
  createdAt: string;
  expiresAt: string;
};

export type DevelopmentPaymentEvent = {
  intent_id: string;
  event_id: string;
  event_type: "pending" | "settled" | "expired" | "failed";
  settlement_reference: string | null;
  amount_idr: number;
  currency: "IDR";
  occurred_at: string;
  failure_code: "TEST_DECLINED" | null;
};

/** Deterministic, non-network event source. It only emits synthetic test identities. */
export function createDevelopmentPaymentAdapter(
  runtimeEnvironment: string | undefined = process.env["NODE_ENV"],
) {
  if (runtimeEnvironment === "production") {
    throw new Error("The development payment adapter is disabled in production.");
  }

  return {
    normalizeEvent(input: {
      intent: B24IntentForAdapter;
      eventType: DevelopmentPaymentEvent["event_type"];
      requestId: string;
      settlementRequestId?: string;
    }): DevelopmentPaymentEvent {
      const stable = input.requestId.replaceAll("-", "");
      const settlementStable = (input.settlementRequestId ?? input.requestId).replaceAll("-", "");
      const occurredAt = new Date(
        input.eventType === "expired"
          ? new Date(input.intent.expiresAt).getTime() + 1000
          : new Date(input.intent.createdAt).getTime() + 1000,
      ).toISOString();
      return {
        intent_id: input.intent.id,
        event_id: `test-event-${stable}`,
        event_type: input.eventType,
        settlement_reference:
          input.eventType === "settled" ? `test-settlement-${settlementStable}` : null,
        amount_idr: input.intent.amountIdr,
        currency: "IDR",
        occurred_at: occurredAt,
        failure_code: input.eventType === "failed" ? "TEST_DECLINED" : null,
      };
    },
  };
}
