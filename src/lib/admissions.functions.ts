import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  admissionApplicationCommandInput,
  admissionApplicationIdInput,
  admissionApplicationListInput,
  admissionCommandInput,
  admissionCycleIdInput,
  admissionSchoolInput,
} from "./admissions.schemas";
import { callAdmissionsRpc } from "./admissions.server";

const call = (supabase: unknown, name: string, args: Record<string, unknown>, label: string) =>
  callAdmissionsRpc(supabase as never, name, args, label);

export const listAdmissionCycles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => admissionSchoolInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b18_list_admission_cycles",
      { p_school_id: data.schoolId ?? null },
      "List admission cycles",
    ),
  );

export const getAdmissionCycle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => admissionCycleIdInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b18_get_admission_cycle",
      { p_cycle_id: data.cycleId },
      "Get admission cycle",
    ),
  );

export const listAdmissionApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => admissionApplicationListInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b18_list_admission_applications",
      {
        p_cycle_id: data.cycleId,
        p_status: data.status ?? null,
        p_grade_level_id: data.gradeLevelId ?? null,
        p_limit: data.limit,
        p_offset: data.offset,
      },
      "List admission applications",
    ),
  );

export const getAdmissionApplication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => admissionApplicationIdInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b18_get_admission_application",
      { p_application_id: data.applicationId },
      "Get admission application",
    ),
  );

export const openAdmissionCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => admissionCommandInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b18_open_admission_cycle",
      {
        p_cycle_id: data.cycleId,
        p_expected_row_version: data.expectedRowVersion,
        p_request_id: data.requestId,
      },
      "Open admission cycle",
    ),
  );
export const closeAdmissionCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => admissionCommandInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b18_close_admission_cycle",
      {
        p_cycle_id: data.cycleId,
        p_expected_row_version: data.expectedRowVersion,
        p_request_id: data.requestId,
      },
      "Close admission cycle",
    ),
  );
export const reopenAdmissionCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    admissionCommandInput.extend({ reason: z.string().trim().min(1).max(2000) }).parse(x),
  )
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b18_reopen_admission_cycle",
      {
        p_cycle_id: data.cycleId,
        p_expected_row_version: data.expectedRowVersion,
        p_request_id: data.requestId,
        p_reason: data.reason,
      },
      "Reopen admission cycle",
    ),
  );
export const archiveAdmissionCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => admissionCommandInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b18_archive_admission_cycle",
      {
        p_cycle_id: data.cycleId,
        p_expected_row_version: data.expectedRowVersion,
        p_request_id: data.requestId,
      },
      "Archive admission cycle",
    ),
  );

export const startAdmissionReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => admissionApplicationCommandInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b18_start_admission_review",
      {
        p_application_id: data.applicationId,
        p_expected_row_version: data.expectedRowVersion,
        p_request_id: data.requestId,
      },
      "Start admission review",
    ),
  );

export const acceptAdmissionApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => admissionApplicationCommandInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b18_accept_admission_application",
      {
        p_application_id: data.applicationId,
        p_expected_row_version: data.expectedRowVersion,
        p_request_id: data.requestId,
        p_reason: data.reason ?? null,
      },
      "Accept admission application",
    ),
  );

export const rejectAdmissionApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => admissionApplicationCommandInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b18_reject_admission_application",
      {
        p_application_id: data.applicationId,
        p_expected_row_version: data.expectedRowVersion,
        p_request_id: data.requestId,
        p_reason: data.reason ?? null,
      },
      "Reject admission application",
    ),
  );

export const withdrawAdmissionApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => admissionApplicationCommandInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b18_withdraw_admission_application",
      {
        p_application_id: data.applicationId,
        p_expected_row_version: data.expectedRowVersion,
        p_request_id: data.requestId,
        p_reason: data.reason ?? null,
      },
      "Withdraw admission application",
    ),
  );

export const convertAdmissionApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => admissionApplicationCommandInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b18_convert_admission_application",
      {
        p_application_id: data.applicationId,
        p_expected_row_version: data.expectedRowVersion,
        p_request_id: data.requestId,
      },
      "Convert admission application",
    ),
  );
