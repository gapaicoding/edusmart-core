import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reportCardRuntimeError } from "./report-card-runtime.server";
import {
  reportCardCandidateInput,
  reportCardContentInput,
  reportCardGenerationInput,
  reportCardListInput,
  reportCardPublishInput,
  reportCardResourceInput,
  reportCardRevisionInput,
  reportCardTransitionInput,
} from "./report-card-runtime.schemas";

function fail(error: Parameters<typeof reportCardRuntimeError>[0], subject: string): never {
  throw reportCardRuntimeError(error, subject);
}

export const generateReportCardDraftCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => reportCardGenerationInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b16_report_card_generate_draft", {
      p_student_enrollment_id: data.studentEnrollmentId,
      p_term_id: data.termId,
      p_request_id: data.requestId,
      p_expected_row_version: data.expectedRowVersion ?? null,
    });
    if (error) fail(error, "report-card draft generation");
    return result?.[0] ?? null;
  });

export const saveReportCardContentCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => reportCardContentInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b16_report_card_save_content", {
      p_report_card_id: data.reportCardId,
      p_expected_row_version: data.expectedRowVersion,
      p_content: data.content,
      p_request_id: data.requestId,
    });
    if (error) fail(error, "report-card content save");
    return result;
  });

export const transitionReportCardCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => reportCardTransitionInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b16_report_card_transition", {
      p_report_card_id: data.reportCardId,
      p_action: data.action,
      p_expected_row_version: data.expectedRowVersion,
      p_request_id: data.requestId,
    });
    if (error) fail(error, "report-card lifecycle transition");
    return result?.[0] ?? null;
  });

export const publishReportCardCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => reportCardPublishInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b16_report_card_publish", {
      p_report_card_id: data.reportCardId,
      p_expected_row_version: data.expectedRowVersion,
      p_request_id: data.requestId,
    });
    if (error) fail(error, "report-card publication");
    return result?.[0] ?? null;
  });

export const createReportCardRevisionCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => reportCardRevisionInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b16_report_card_create_revision", {
      p_source_report_card_id: data.sourceReportCardId,
      p_expected_source_row_version: data.expectedSourceRowVersion,
      p_reason: data.reason,
      p_request_id: data.requestId,
    });
    if (error) fail(error, "report-card revision");
    return result?.[0] ?? null;
  });

export const listReportCardsProjection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => reportCardListInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b16_list_report_cards", {
      p_school_id: data.schoolId,
      p_academic_year_id: data.academicYearId ?? null,
      p_term_id: data.termId ?? null,
      p_status: data.status ?? null,
      p_limit: data.limit,
      p_offset: data.offset,
    });
    if (error) fail(error, "report-card list");
    return result ?? [];
  });

export const getReportCardProjection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => reportCardResourceInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b16_get_report_card", {
      p_report_card_id: data.reportCardId,
    });
    if (error) fail(error, "report-card detail");
    return result;
  });

export const listReportCardCandidatesProjection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => reportCardCandidateInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b16_list_report_card_candidates", {
      p_school_id: data.schoolId,
      p_academic_year_id: data.academicYearId ?? null,
    });
    if (error) fail(error, "report-card candidate list");
    return result ?? [];
  });
