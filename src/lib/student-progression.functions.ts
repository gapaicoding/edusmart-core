import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  progressionBatchDetailInput,
  progressionCreateInput,
  progressionDecisionInput,
  progressionListInput,
  progressionReasonTransitionInput,
  progressionTransitionInput,
} from "./student-progression.schemas";
import {
  callProgressionRpc,
  type ProgressionJson,
  type RpcClient,
} from "./student-progression.server";

const rpc = (supabase: unknown) => supabase as RpcClient;
const call = (supabase: unknown, name: string, args: Record<string, unknown>, subject: string) =>
  callProgressionRpc<ProgressionJson>(rpc(supabase), name, args, subject);

export const createProgressionBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => progressionCreateInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "create_progression_batch",
      {
        p_request_id: data.requestId,
        p_school_id: data.schoolId,
        p_source_academic_year_id: data.sourceAcademicYearId,
        p_target_academic_year_id: data.targetAcademicYearId,
      },
      "Create progression batch",
    ),
  );
export const listProgressionBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => progressionListInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "list_progression_batches",
      { p_school_id: data.schoolId, p_limit: data.limit ?? 50, p_offset: data.offset ?? 0 },
      "List progression batches",
    ),
  );
export const getProgressionBatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => progressionBatchDetailInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "get_progression_batch",
      { p_school_id: data.schoolId, p_batch_id: data.batchId },
      "Get progression batch",
    ),
  );
export const listProgressionCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    progressionBatchDetailInput
      .merge(progressionListInput.pick({ limit: true, offset: true }))
      .parse(x),
  )
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "list_progression_candidates",
      {
        p_school_id: data.schoolId,
        p_batch_id: data.batchId,
        p_limit: data.limit ?? 100,
        p_offset: data.offset ?? 0,
      },
      "List progression candidates",
    ),
  );
export const saveProgressionDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => progressionDecisionInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "save_progression_decision",
      {
        p_request_id: data.requestId,
        p_school_id: data.schoolId,
        p_batch_id: data.batchId,
        p_source_student_enrollment_id: data.sourceStudentEnrollmentId,
        p_outcome: data.outcome,
        p_target_grade_level_id: data.targetGradeLevelId ?? null,
        p_target_classroom_id: data.targetClassroomId ?? null,
        p_exception_reason: data.exceptionReason ?? null,
        p_operator_note: data.operatorNote ?? null,
        p_expected_version: data.expectedVersion,
      },
      "Save progression decision",
    ),
  );
export const submitProgressionBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => progressionTransitionInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "submit_progression_batch",
      {
        p_request_id: data.requestId,
        p_school_id: data.schoolId,
        p_batch_id: data.batchId,
        p_expected_version: data.expectedVersion,
      },
      "Submit progression batch",
    ),
  );
export const rejectProgressionBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => progressionReasonTransitionInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "reject_progression_batch",
      {
        p_request_id: data.requestId,
        p_school_id: data.schoolId,
        p_batch_id: data.batchId,
        p_expected_version: data.expectedVersion,
        p_reason: data.reason,
      },
      "Reject progression batch",
    ),
  );
export const approveProgressionBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => progressionTransitionInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "approve_progression_batch",
      {
        p_request_id: data.requestId,
        p_school_id: data.schoolId,
        p_batch_id: data.batchId,
        p_expected_version: data.expectedVersion,
      },
      "Approve progression batch",
    ),
  );
export const cancelProgressionBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => progressionReasonTransitionInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "cancel_progression_batch",
      {
        p_request_id: data.requestId,
        p_school_id: data.schoolId,
        p_batch_id: data.batchId,
        p_expected_version: data.expectedVersion,
        p_reason: data.reason,
      },
      "Cancel progression batch",
    ),
  );
export const applyProgressionBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => progressionTransitionInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "apply_progression_batch",
      {
        p_request_id: data.requestId,
        p_school_id: data.schoolId,
        p_batch_id: data.batchId,
        p_expected_version: data.expectedVersion,
      },
      "Apply progression batch",
    ),
  );
