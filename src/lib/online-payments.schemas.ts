import { z } from "zod";

const uuid = z.string().uuid();

export const parentPaymentIntentInput = z.object({
  invoiceId: uuid,
  requestId: uuid,
});

export const parentPaymentStatusInput = z.object({ invoiceId: uuid });

export const staffInvoicePaymentIntentsInput = z.object({
  schoolId: uuid,
  invoiceId: uuid,
});

export const simulateDevelopmentPaymentEventInput = z.object({
  intentId: uuid,
  eventType: z.enum(["pending", "settled", "expired", "failed"]),
  requestId: uuid,
  settlementRequestId: uuid.optional(),
});

export type ParentPaymentIntentInput = z.infer<typeof parentPaymentIntentInput>;
export type SimulateDevelopmentPaymentEventInput = z.infer<
  typeof simulateDevelopmentPaymentEventInput
>;
