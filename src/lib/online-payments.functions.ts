import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  parentPaymentIntentInput,
  parentPaymentStatusInput,
  simulateDevelopmentPaymentEventInput,
  staffInvoicePaymentIntentsInput,
} from "./online-payments.schemas";
import { callOnlinePaymentRpc } from "./online-payments.server";

async function adminRpc<T extends Json = Json>(
  name: string,
  args: Record<string, unknown>,
  label: string,
): Promise<T> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return callOnlinePaymentRpc<T>(supabaseAdmin, name, args, label);
}

export const createParentOnlinePaymentIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => parentPaymentIntentInput.parse(x))
  .handler(async ({ data, context }) => {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("Online payment is not configured.");
    }
    return adminRpc(
      "b24_create_parent_payment_intent",
      {
        p_actor_id: context.userId,
        p_invoice_id: data.invoiceId,
        p_request_id: data.requestId,
      },
      "Create online payment intent",
    );
  });

export const getParentOnlinePaymentIntent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => parentPaymentStatusInput.parse(x))
  .handler(async ({ data, context }) => {
    if (process.env["NODE_ENV"] === "production") return null;
    return adminRpc(
      "b24_get_parent_payment_intent",
      {
        p_actor_id: context.userId,
        p_invoice_id: data.invoiceId,
      },
      "Read online payment status",
    );
  });

export const listInvoiceOnlinePaymentIntents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => staffInvoicePaymentIntentsInput.parse(x))
  .handler(({ data, context }) =>
    adminRpc(
      "b24_list_invoice_payment_intents",
      {
        p_actor_id: context.userId,
        p_school_id: data.schoolId,
        p_invoice_id: data.invoiceId,
      },
      "Read invoice online payment status",
    ),
  );

export const simulateDevelopmentPaymentEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => simulateDevelopmentPaymentEventInput.parse(x))
  .handler(async ({ data, context }) => {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("The development payment adapter is disabled in production.");
    }
    const { createDevelopmentPaymentAdapter } = await import("./online-payments.server");
    const adapter = createDevelopmentPaymentAdapter(process.env["NODE_ENV"]);
    const intent = await adminRpc<{
      intent_id: string;
      amount_idr: number;
      created_at: string;
      expires_at: string;
    }>(
      "b24_find_intent_for_test_event",
      {
        p_actor_id: context.userId,
        p_intent_id: data.intentId,
      },
      "Read payment intent",
    );
    const event = adapter.normalizeEvent({
      intent: {
        id: intent.intent_id,
        amountIdr: intent.amount_idr,
        createdAt: intent.created_at,
        expiresAt: intent.expires_at,
      },
      eventType: data.eventType,
      requestId: data.requestId,
      ...(data.settlementRequestId ? { settlementRequestId: data.settlementRequestId } : {}),
    });
    return adminRpc(
      "b24_simulate_development_payment_event",
      {
        p_actor_id: context.userId,
        p_input: event,
      },
      "Process development payment event",
    );
  });
