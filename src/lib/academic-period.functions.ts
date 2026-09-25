import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { academicPeriodRuntimeError } from "./academic-period.server";
import {
  periodCommandInput,
  periodReadinessInput,
  periodReopenInput,
} from "./academic-period.schemas";

function fail(error: Parameters<typeof academicPeriodRuntimeError>[0], label: string): never {
  throw academicPeriodRuntimeError(error, label);
}

export const getTermCloseReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => periodReadinessInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b17_get_term_close_readiness", {
      p_school_id: data.schoolId,
      p_term_id: data.periodId,
    });
    if (error) fail(error, "Term readiness");
    return result;
  });

export const getAcademicYearCloseReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => periodReadinessInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "b17_get_academic_year_close_readiness",
      {
        p_school_id: data.schoolId,
        p_academic_year_id: data.periodId,
      },
    );
    if (error) fail(error, "Academic year readiness");
    return result;
  });

export const closeTermCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => periodCommandInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b17_close_term", {
      p_request_id: data.requestId,
      p_school_id: data.schoolId,
      p_term_id: data.periodId,
      p_expected_updated_at: data.expectedUpdatedAt,
      p_reason: data.reason ?? null,
    });
    if (error) fail(error, "Term closure");
    return result;
  });

export const closeAcademicYearCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => periodCommandInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b17_close_academic_year", {
      p_request_id: data.requestId,
      p_school_id: data.schoolId,
      p_academic_year_id: data.periodId,
      p_expected_updated_at: data.expectedUpdatedAt,
      p_reason: data.reason ?? null,
    });
    if (error) fail(error, "Academic year closure");
    return result;
  });

export const reopenTermCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => periodReopenInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b17_reopen_term", {
      p_request_id: data.requestId,
      p_school_id: data.schoolId,
      p_term_id: data.periodId,
      p_expected_updated_at: data.expectedUpdatedAt,
      p_reason: data.reason,
    });
    if (error) fail(error, "Term reopening");
    return result;
  });

export const reopenAcademicYearCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => periodReopenInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("b17_reopen_academic_year", {
      p_request_id: data.requestId,
      p_school_id: data.schoolId,
      p_academic_year_id: data.periodId,
      p_expected_updated_at: data.expectedUpdatedAt,
      p_reason: data.reason,
    });
    if (error) fail(error, "Academic year reopening");
    return result;
  });
