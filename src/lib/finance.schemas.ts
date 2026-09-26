import { z } from "zod";

const uuid = z.string().uuid();
const amountIdr = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const code = z
  .string()
  .trim()
  .regex(/^[A-Z0-9][A-Z0-9_-]{1,63}$/);
const bounded = z.string().trim().max(1000).nullable().optional();
const request = z.object({ requestId: uuid });

export const financeFeeCreateInput = request.extend({
  schoolId: uuid,
  code,
  name: z.string().trim().min(1).max(160),
  description: bounded,
  amountIdr,
  chargeKind: z.enum(["one_time", "monthly"]),
  gradeLevelId: uuid.nullable().optional(),
  academicYearId: uuid.nullable().optional(),
});
export const financeFeeUpdateInput = financeFeeCreateInput.extend({
  feeId: uuid,
  expectedRowVersion: z.number().int().positive(),
});
export const financeFeeArchiveInput = request.extend({
  schoolId: uuid,
  feeId: uuid,
  expectedRowVersion: z.number().int().positive(),
});
export const financePlanCreateInput = request.extend({
  schoolId: uuid,
  code,
  name: z.string().trim().min(1).max(160),
  description: bounded,
});
export const financePlanUpdateInput = financePlanCreateInput.extend({
  planId: uuid,
  expectedRowVersion: z.number().int().positive(),
});
export const financePlanVersionInput = request.extend({
  schoolId: uuid,
  billingPlanId: uuid,
  feeDefinitionId: uuid,
  academicYearId: uuid,
  targetType: z.enum(["school", "grade", "explicit_enrollment"]),
  gradeLevelId: uuid.nullable().optional(),
  dueDay: z.number().int().min(1).max(28).nullable().optional(),
});
export const financePlanTargetInput = request.extend({
  schoolId: uuid,
  planVersionId: uuid,
  studentEnrollmentId: uuid,
});
export const financeInvoiceGenerateInput = request.extend({
  schoolId: uuid,
  planVersionId: uuid,
  studentEnrollmentId: uuid,
  billingPeriodKey: z.union([z.literal("ONE_TIME"), z.string().regex(/^\d{4}-\d{2}$/)]),
});
export const financeBulkGenerateInput = request.extend({
  schoolId: uuid,
  planVersionId: uuid,
  billingPeriodKey: z.union([z.literal("ONE_TIME"), z.string().regex(/^\d{4}-\d{2}$/)]),
});
export const financeDraftUpdateInput = request.extend({
  schoolId: uuid,
  invoiceId: uuid,
  dueDate: z.string().date(),
  expectedRowVersion: z.number().int().positive(),
});
export const financeInvoiceTransitionInput = request.extend({
  schoolId: uuid,
  invoiceId: uuid,
  expectedRowVersion: z.number().int().positive(),
});
export const financeVoidInput = financeInvoiceTransitionInput.extend({
  reason: z.string().trim().min(3).max(1000),
});
export const financePaymentInput = request.extend({
  schoolId: uuid,
  invoiceId: uuid,
  amountIdr,
  receivedAt: z.string().datetime().optional(),
  method: z.enum(["cash", "bank_transfer", "other"]),
  manualReference: z.string().trim().min(1).max(120).optional(),
  note: z.string().max(1000).optional(),
});
export const financePaymentReversalInput = request.extend({
  schoolId: uuid,
  paymentId: uuid,
  reason: z.string().trim().min(3).max(1000),
});
export const financeSchoolListInput = z.object({
  schoolId: uuid,
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
export const financeInvoiceListInput = financeSchoolListInput.extend({
  billingPeriodKey: z.string().optional(),
  documentStatus: z.enum(["draft", "issued", "void"]).optional(),
});
export const financeInvoiceDetailInput = z.object({ schoolId: uuid, invoiceId: uuid });
export const financeBillingPlanDetailInput = z.object({ schoolId: uuid, billingPlanId: uuid });
export const financeBillingPlanVersionListInput = financeSchoolListInput.extend({
  billingPlanId: uuid,
});
export const financeBillingPlanVersionDetailInput = z.object({
  schoolId: uuid,
  billingPlanVersionId: uuid,
});
export const financeBillingPlanTargetListInput = financeSchoolListInput.extend({
  billingPlanVersionId: uuid,
});
export const financeSummaryInput = z.object({
  schoolId: uuid,
  billingPeriodKey: z.string().optional(),
});
export const financeParentListInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
export const financeParentDetailInput = z.object({ invoiceId: uuid });

export type FinanceFeeCreateInput = z.infer<typeof financeFeeCreateInput>;
export type FinancePaymentInput = z.infer<typeof financePaymentInput>;
