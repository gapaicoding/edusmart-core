import { createServerFn } from "@tanstack/react-start";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assessmentGradebookCommandError } from "./assessment-gradebook.server";
import {
  assessmentGradebookCorrectionInput,
  assessmentGradebookCreateInput,
  assessmentGradebookListInput,
  assessmentGradebookResourceInput,
  assessmentGradebookSaveScoresInput,
  assessmentGradebookTransitionInput,
  assessmentGradebookUpdateDraftInput,
} from "./assessment-gradebook.schemas";

function raise(
  error: Parameters<typeof assessmentGradebookCommandError>[0],
  subject: string,
): never {
  throw assessmentGradebookCommandError(error, subject);
}

export const createAssessmentCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => assessmentGradebookCreateInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b15_assessment_create", {
      p_academic_year_id: data.academicYearId ?? undefined,
      p_assessment_date: data.assessmentDate,
      p_assessment_type_id: data.assessmentTypeId,
      p_description: data.description as never,
      p_max_score: data.maxScore,
      p_min_score: data.minScore,
      p_organization_id: data.organizationId,
      p_request_id: data.requestId,
      p_school_id: data.schoolId,
      p_teaching_assignment_id: data.teachingAssignmentId,
      p_term_id: data.termId,
      p_title: data.title,
      p_weight: data.weight as never,
    });
    if (error) raise(error, "assessment creation");
    return result?.[0] ?? null;
  });

export const updateAssessmentDraftCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => assessmentGradebookUpdateDraftInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b15_assessment_update_draft", {
      p_assessment_date: data.assessmentDate,
      p_assessment_id: data.assessmentId,
      p_assessment_type_id: data.assessmentTypeId,
      p_description: data.description as never,
      p_expected_version: data.expectedVersion,
      p_max_score: data.maxScore,
      p_min_score: data.minScore,
      p_organization_id: data.organizationId,
      p_request_id: data.requestId,
      p_school_id: data.schoolId,
      p_title: data.title,
      p_weight: data.weight as never,
    });
    if (error) raise(error, "assessment update");
    return result?.[0] ?? null;
  });

export const transitionAssessmentCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => assessmentGradebookTransitionInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b15_assessment_transition", {
      p_action: data.action,
      p_assessment_id: data.assessmentId,
      p_expected_version: data.expectedVersion,
      p_organization_id: data.organizationId,
      p_request_id: data.requestId,
      p_school_id: data.schoolId,
    });
    if (error) raise(error, "assessment lifecycle transition");
    return result?.[0] ?? null;
  });

export const saveAssessmentScoresCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => assessmentGradebookSaveScoresInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b15_assessment_save_scores", {
      p_assessment_id: data.assessmentId,
      p_entries: data.entries.map((entry) => ({
        student_enrollment_id: entry.studentEnrollmentId,
        score: entry.score,
        status: entry.status,
        feedback: entry.feedback,
        expected_score_version: entry.expectedScoreVersion,
      })) as Database["public"]["Functions"]["b15_assessment_save_scores"]["Args"]["p_entries"],
      p_expected_assessment_version: data.expectedAssessmentVersion as never,
      p_organization_id: data.organizationId,
      p_request_id: data.requestId,
      p_school_id: data.schoolId,
    });
    if (error) raise(error, "score save");
    return result?.[0] ?? null;
  });

export const correctFinalScoreCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => assessmentGradebookCorrectionInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b15_correct_final_score", {
      p_assessment_id: data.assessmentId,
      p_expected_score_version: data.expectedScoreVersion,
      p_new_score: data.newScore,
      p_new_status: data.newStatus,
      p_organization_id: data.organizationId,
      p_reason: data.reason,
      p_request_id: data.requestId,
      p_school_id: data.schoolId,
      p_score_id: data.scoreId,
    });
    if (error) raise(error, "final score correction");
    return result?.[0] ?? null;
  });

export const listAssessmentProjection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => assessmentGradebookListInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b15_list_assessments", {
      ...(data.academicYearId === null ? {} : { p_academic_year_id: data.academicYearId }),
      p_limit: data.limit,
      p_offset: data.offset,
      p_organization_id: data.organizationId,
      p_school_id: data.schoolId,
      ...(data.status === null ? {} : { p_status: data.status }),
      ...(data.termId === null ? {} : { p_term_id: data.termId }),
    });
    if (error) raise(error, "assessment list");
    return result ?? [];
  });

export const getAssessmentProjection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => assessmentGradebookResourceInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b15_get_assessment", {
      p_assessment_id: data.assessmentId,
      p_organization_id: data.organizationId,
      p_school_id: data.schoolId,
    });
    if (error) raise(error, "assessment detail");
    return result?.[0] ?? null;
  });

export const getGradebookProjection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => assessmentGradebookResourceInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b15_get_gradebook", {
      p_assessment_id: data.assessmentId,
      p_organization_id: data.organizationId,
      p_school_id: data.schoolId,
    });
    if (error) raise(error, "gradebook");
    return result ?? [];
  });
