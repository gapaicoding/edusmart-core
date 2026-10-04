import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";
import {
  createMidtransSandboxClient,
  getMidtransFinanceAvailability,
  MidtransError,
  readMidtransSandboxConfig,
} from "./midtrans-qris.server";
import { callOnlinePaymentRpc } from "./online-payments.server";

const uuid = z.string().uuid();
const createInput = z.object({ invoiceId: uuid, requestId: uuid });
const invoiceInput = z.object({ invoiceId: uuid });
const orderInput = z.object({ orderId: uuid });

async function adminRpc<T extends Json = Json>(
  name: string,
  args: Record<string, unknown>,
  label: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return callOnlinePaymentRpc<T>(supabaseAdmin, name, args, label);
}

function assertSandboxEnabled() {
  if (process.env["NODE_ENV"] === "production") throw new Error("Sandbox payments are disabled.");
  return readMidtransSandboxConfig();
}

export const createParentMidtransQris = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((x: unknown) => createInput.parse(x))
  .handler(async ({ data, context }) => {
    const config = assertSandboxEnabled();
    await adminRpc(
      "b27_expire_parent_midtrans_qris",
      {
        p_actor_id: context.userId,
        p_invoice_id: data.invoiceId,
      },
      "Refresh expired sandbox QRIS state",
    );
    const reservation = await adminRpc<{
      order_id: string;
      intent_id: string;
      external_id: string;
      amount_idr: number;
      expires_at: string;
      status: string;
      qr_content: string | null;
      should_create: boolean;
    }>(
      "b27_reserve_parent_midtrans_qris",
      {
        p_actor_id: context.userId,
        p_invoice_id: data.invoiceId,
        p_request_id: data.requestId,
      },
      "Create sandbox QRIS payment",
    );
    if (!reservation.should_create) {
      return {
        order_id: reservation.order_id,
        intent_id: reservation.intent_id,
        amount_idr: reservation.amount_idr,
        expires_at: reservation.expires_at,
        status: reservation.status,
        qr_content: reservation.qr_content,
      };
    }
    try {
      const client = createMidtransSandboxClient(config);
      const created = await client.createQrisOrder({
        externalId: reservation.external_id,
        amountIdr: reservation.amount_idr,
        expiresAt: reservation.expires_at,
      });
      return adminRpc(
        "b27_save_midtrans_qris_result",
        {
          p_order_id: reservation.order_id,
          p_provider_reference: created.referenceNo,
          p_qr_content: created.qrContent,
        },
        "Save sandbox QRIS order",
      );
    } catch (error) {
      await adminRpc(
        "b27_mark_midtrans_qris_ambiguous",
        {
          p_order_id: reservation.order_id,
          p_safe_error_code:
            error instanceof MidtransError
              ? error.code === "PROVIDER_UNAVAILABLE"
                ? "PROVIDER_UNAVAILABLE"
                : error.code === "INVALID_RESPONSE"
                  ? "INVALID_RESPONSE"
                  : "PROVIDER_REJECTED"
              : "PROVIDER_UNAVAILABLE",
        },
        "Record sandbox QRIS status",
      );
      throw new Error("Sandbox QRIS is temporarily unavailable. Use the manual payment option.");
    }
  });

export const getParentMidtransQris = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((x: unknown) => invoiceInput.parse(x))
  .handler(async ({ data, context }) => {
    if (process.env["NODE_ENV"] === "production") return null;
    return adminRpc(
      "b27_get_parent_midtrans_qris",
      {
        p_actor_id: context.userId,
        p_invoice_id: data.invoiceId,
      },
      "Read sandbox QRIS status",
    );
  });

export const getParentMidtransQrisOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((x: unknown) => orderInput.parse(x))
  .handler(async ({ data, context }) => {
    if (process.env["NODE_ENV"] === "production") return null;
    return adminRpc(
      "b27_get_midtrans_order_for_parent",
      {
        p_actor_id: context.userId,
        p_order_id: data.orderId,
      },
      "Read sandbox QRIS status",
    );
  });

export const refreshParentMidtransQris = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((x: unknown) => orderInput.parse(x))
  .handler(async ({ data, context }) => {
    const config = assertSandboxEnabled();
    const check = await adminRpc<{
      should_query: boolean;
      external_id?: string;
      provider_reference?: string | null;
      amount_idr?: number;
      expires_at?: string;
    }>(
      "b27_claim_parent_midtrans_qris_status_check",
      {
        p_actor_id: context.userId,
        p_order_id: data.orderId,
      },
      "Refresh sandbox QRIS status",
    );
    if (check.should_query && check.external_id) {
      const result = await createMidtransSandboxClient(config).queryQrisOrder({
        externalId: check.external_id,
        ...(check.provider_reference ? { referenceNo: check.provider_reference } : {}),
      });
      const status = result.latestTransactionStatus;
      const amount = result.amount;
      const providerReference = result.originalReferenceNo;
      if (status && status !== "07" && status !== "04" && amount && providerReference) {
        await receiveVerifiedMidtransNotification({
          external_id: check.external_id,
          provider_reference: providerReference,
          status,
          amount_value: amount.value,
          currency: amount.currency,
          occurred_at: new Date().toISOString(),
        });
      }
    }
    const current = await adminRpc<{ invoice_id: string }>(
      "b27_get_midtrans_order_for_parent",
      {
        p_actor_id: context.userId,
        p_order_id: data.orderId,
      },
      "Read sandbox QRIS status",
    );
    return adminRpc(
      "b27_get_parent_midtrans_qris",
      {
        p_actor_id: context.userId,
        p_invoice_id: current.invoice_id,
      },
      "Read sandbox QRIS status",
    );
  });

export const listInvoiceMidtransQris = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((x: unknown) => z.object({ schoolId: uuid, invoiceId: uuid }).parse(x))
  .handler(async ({ data, context }) => {
    const orders = await adminRpc(
      "b27_list_invoice_midtrans_qris",
      {
        p_actor_id: context.userId,
        p_school_id: data.schoolId,
        p_invoice_id: data.invoiceId,
      },
      "Read invoice sandbox QRIS operations",
    );
    return {
      orders,
      providerAvailability: getMidtransFinanceAvailability(),
    };
  });

export async function receiveVerifiedMidtransNotification(input: Record<string, unknown>) {
  return adminRpc(
    "b27_receive_midtrans_qris_notification",
    { p_input: input },
    "Receive Midtrans QRIS notification",
  );
}

export async function recordUnsupportedMidtransNotification(input: Record<string, unknown>) {
  return adminRpc(
    "b27_record_unsupported_midtrans_qris_notification",
    { p_input: input },
    "Record unsupported Midtrans QRIS status",
  );
}
