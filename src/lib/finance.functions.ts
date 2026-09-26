import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  financeBulkGenerateInput,
  financeBillingPlanDetailInput,
  financeBillingPlanTargetListInput,
  financeBillingPlanVersionDetailInput,
  financeBillingPlanVersionListInput,
  financeDraftUpdateInput,
  financeFeeArchiveInput,
  financeFeeCreateInput,
  financeFeeUpdateInput,
  financeInvoiceDetailInput,
  financeInvoiceGenerateInput,
  financeInvoiceListInput,
  financeInvoiceTransitionInput,
  financeParentDetailInput,
  financeParentListInput,
  financePaymentInput,
  financePaymentReversalInput,
  financePlanCreateInput,
  financePlanTargetInput,
  financePlanUpdateInput,
  financePlanVersionInput,
  financeSchoolListInput,
  financeSummaryInput,
  financeVoidInput,
} from "./finance.schemas";
import { callFinanceRpc } from "./finance.server";

export const createFinanceFeeDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeFeeCreateInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_create_finance_fee_definition",
      {
        p_input: {
          request_id: data.requestId,
          school_id: data.schoolId,
          code: data.code,
          name: data.name,
          description: data.description ?? null,
          amount_idr: data.amountIdr,
          charge_kind: data.chargeKind,
          grade_level_id: data.gradeLevelId ?? null,
          academic_year_id: data.academicYearId ?? null,
        },
      },
      "Create Finance fee",
    ),
  );
export const updateFinanceFeeDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeFeeUpdateInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_update_finance_fee_definition",
      {
        p_input: {
          ...data,
          request_id: data.requestId,
          school_id: data.schoolId,
          fee_id: data.feeId,
          expected_row_version: data.expectedRowVersion,
          amount_idr: data.amountIdr,
          charge_kind: data.chargeKind,
        },
      },
      "Update Finance fee",
    ),
  );
export const archiveFinanceFeeDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeFeeArchiveInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_archive_finance_fee_definition",
      {
        p_input: {
          request_id: data.requestId,
          school_id: data.schoolId,
          fee_id: data.feeId,
          expected_row_version: data.expectedRowVersion,
        },
      },
      "Archive Finance fee",
    ),
  );
export const createFinanceBillingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financePlanCreateInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_create_finance_billing_plan",
      { p_input: { ...data, request_id: data.requestId, school_id: data.schoolId } },
      "Create billing plan",
    ),
  );
export const updateFinanceBillingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financePlanUpdateInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_update_finance_billing_plan",
      {
        p_input: {
          ...data,
          request_id: data.requestId,
          school_id: data.schoolId,
          plan_id: data.planId,
          expected_row_version: data.expectedRowVersion,
        },
      },
      "Update billing plan",
    ),
  );
export const createFinanceBillingPlanVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financePlanVersionInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_create_finance_billing_plan_version",
      {
        p_input: {
          ...data,
          request_id: data.requestId,
          school_id: data.schoolId,
          billing_plan_id: data.billingPlanId,
          fee_definition_id: data.feeDefinitionId,
          academic_year_id: data.academicYearId,
          target_type: data.targetType,
          grade_level_id: data.gradeLevelId ?? null,
          due_day: data.dueDay ?? null,
        },
      },
      "Create billing plan version",
    ),
  );
export const addFinanceBillingPlanTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financePlanTargetInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_add_finance_billing_plan_target",
      {
        p_input: {
          request_id: data.requestId,
          school_id: data.schoolId,
          plan_version_id: data.planVersionId,
          student_enrollment_id: data.studentEnrollmentId,
        },
      },
      "Add billing target",
    ),
  );
export const generateFinanceInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeInvoiceGenerateInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_generate_finance_invoice",
      {
        p_input: {
          request_id: data.requestId,
          school_id: data.schoolId,
          plan_version_id: data.planVersionId,
          student_enrollment_id: data.studentEnrollmentId,
          billing_period_key: data.billingPeriodKey,
        },
      },
      "Generate invoice",
    ),
  );
export const generateFinanceInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeBulkGenerateInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_generate_finance_invoices",
      {
        p_input: {
          request_id: data.requestId,
          school_id: data.schoolId,
          plan_version_id: data.planVersionId,
          billing_period_key: data.billingPeriodKey,
        },
      },
      "Generate invoices",
    ),
  );
export const updateFinanceDraftInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeDraftUpdateInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_update_finance_draft_invoice",
      {
        p_input: {
          request_id: data.requestId,
          school_id: data.schoolId,
          invoice_id: data.invoiceId,
          due_date: data.dueDate,
          expected_row_version: data.expectedRowVersion,
        },
      },
      "Update draft invoice",
    ),
  );
export const issueFinanceInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeInvoiceTransitionInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_issue_finance_invoice",
      {
        p_input: {
          request_id: data.requestId,
          school_id: data.schoolId,
          invoice_id: data.invoiceId,
          expected_row_version: data.expectedRowVersion,
        },
      },
      "Issue invoice",
    ),
  );
export const voidFinanceInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeVoidInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_void_finance_invoice",
      {
        p_input: {
          request_id: data.requestId,
          school_id: data.schoolId,
          invoice_id: data.invoiceId,
          expected_row_version: data.expectedRowVersion,
          reason: data.reason,
        },
      },
      "Void invoice",
    ),
  );
export const recordFinancePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financePaymentInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_record_finance_payment",
      {
        p_input: {
          request_id: data.requestId,
          school_id: data.schoolId,
          invoice_id: data.invoiceId,
          amount_idr: data.amountIdr,
          received_at: data.receivedAt ?? null,
          method: data.method,
          manual_reference: data.manualReference ?? null,
          note: data.note ?? null,
        },
      },
      "Record payment",
    ),
  );
export const reverseFinancePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financePaymentReversalInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_reverse_finance_payment",
      {
        p_input: {
          request_id: data.requestId,
          school_id: data.schoolId,
          payment_id: data.paymentId,
          reason: data.reason,
        },
      },
      "Reverse payment",
    ),
  );
export const listFinanceFees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeSchoolListInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_list_finance_fees",
      { p_school_id: data.schoolId, p_limit: data.limit, p_offset: data.offset },
      "List Finance fees",
    ),
  );
export const listFinanceBillingPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeSchoolListInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_list_finance_billing_plans",
      { p_school_id: data.schoolId, p_limit: data.limit, p_offset: data.offset },
      "List Finance billing plans",
    ),
  );
export const getFinanceBillingPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeBillingPlanDetailInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_get_finance_billing_plan",
      { p_school_id: data.schoolId, p_billing_plan_id: data.billingPlanId },
      "Get Finance billing plan",
    ),
  );
export const listFinanceBillingPlanVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeBillingPlanVersionListInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_list_finance_billing_plan_versions",
      {
        p_school_id: data.schoolId,
        p_billing_plan_id: data.billingPlanId,
        p_limit: data.limit,
        p_offset: data.offset,
      },
      "List Finance billing plan versions",
    ),
  );
export const getFinanceBillingPlanVersion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeBillingPlanVersionDetailInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_get_finance_billing_plan_version",
      { p_school_id: data.schoolId, p_billing_plan_version_id: data.billingPlanVersionId },
      "Get Finance billing plan version",
    ),
  );
export const listFinanceBillingPlanTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeBillingPlanTargetListInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_list_finance_billing_plan_targets",
      {
        p_school_id: data.schoolId,
        p_billing_plan_version_id: data.billingPlanVersionId,
        p_limit: data.limit,
        p_offset: data.offset,
      },
      "List Finance billing plan targets",
    ),
  );
export const listFinanceInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeInvoiceListInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_list_finance_invoices",
      {
        p_school_id: data.schoolId,
        p_limit: data.limit,
        p_offset: data.offset,
        p_billing_period_key: data.billingPeriodKey ?? null,
        p_document_status: data.documentStatus ?? null,
      },
      "List Finance invoices",
    ),
  );
export const getFinanceInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeInvoiceDetailInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_get_finance_invoice",
      { p_school_id: data.schoolId, p_invoice_id: data.invoiceId },
      "Get Finance invoice",
    ),
  );
export const getFinanceSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeSummaryInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_get_finance_summary",
      { p_school_id: data.schoolId, p_billing_period_key: data.billingPeriodKey ?? null },
      "Get Finance summary",
    ),
  );
export const listFinancePayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeSchoolListInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_list_finance_payments",
      { p_school_id: data.schoolId, p_limit: data.limit, p_offset: data.offset },
      "List Finance payments",
    ),
  );
export const listParentBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeParentListInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_list_parent_billing",
      { p_limit: data.limit, p_offset: data.offset },
      "List parent billing",
    ),
  );
export const getParentInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => financeParentDetailInput.parse(x))
  .handler(({ data, context }) =>
    callFinanceRpc(
      context.supabase,
      "b19_get_parent_invoice",
      { p_invoice_id: data.invoiceId },
      "Get parent invoice",
    ),
  );
