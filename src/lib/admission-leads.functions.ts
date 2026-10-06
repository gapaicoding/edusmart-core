import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAdmissionsRpc } from "./admissions.server";
import {
  admissionLeadCommandInput,
  admissionLeadConvertInput,
  admissionLeadCreateInput,
  admissionLeadDuplicateInput,
  admissionLeadListInput,
  admissionLeadIdInput,
  admissionLeadSchoolInput,
} from "./admission-leads.schemas";

const call = (supabase: unknown, name: string, args: Record<string, unknown>, label: string) =>
  callAdmissionsRpc(supabase as never, name, args, label);

export const listAdmissionLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((x: unknown) => admissionLeadListInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b28_list_admission_leads",
      {
        p_school_id: data.schoolId,
        p_status: data.status ?? null,
        p_source: data.source ?? null,
        p_channel: data.channel ?? null,
        p_assignee: data.assigneeId ?? null,
        p_unassigned: data.unassigned,
        p_search: data.search || null,
        p_limit: 100,
        p_offset: 0,
        p_action_filter: data.actionFilter ?? null,
      },
      "List admissions inquiries",
    ),
  );

export const findAdmissionLeadDuplicates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((x: unknown) => admissionLeadDuplicateInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b28_find_lead_duplicates",
      {
        p_school_id: data.schoolId,
        p_phone: data.phone ?? null,
        p_email: data.email ?? null,
        p_exclude_lead_id: data.excludeLeadId ?? null,
      },
      "Check possible existing inquiries",
    ),
  );

export const getAdmissionLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((x: unknown) => admissionLeadIdInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b28_get_admission_lead",
      { p_lead_id: data.leadId },
      "Get admissions inquiry",
    ),
  );

export const listAdmissionLeadAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((x: unknown) => admissionLeadSchoolInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b28_list_lead_assignees",
      { p_school_id: data.schoolId },
      "List admissions staff",
    ),
  );

export const createAdmissionLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((x: unknown) => admissionLeadCreateInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b28_create_admission_lead",
      {
        p_school_id: data.schoolId,
        p_request_id: data.requestId,
        p_payload: data.payload,
      },
      "Create admissions inquiry",
    ),
  );

export const commandAdmissionLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((x: unknown) => admissionLeadCommandInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b28_admission_lead_command",
      {
        p_lead_id: data.leadId,
        p_expected_row_version: data.expectedRowVersion,
        p_request_id: data.requestId,
        p_command: data.command,
        p_payload: data.payload,
      },
      "Update admissions inquiry",
    ),
  );

export const convertAdmissionLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((x: unknown) => admissionLeadConvertInput.parse(x))
  .handler(({ data, context }) =>
    call(
      context.supabase,
      "b28_convert_admission_lead",
      {
        p_lead_id: data.leadId,
        p_expected_row_version: data.expectedRowVersion,
        p_request_id: data.requestId,
        p_application: data.application,
      },
      "Convert admissions inquiry to an application",
    ),
  );
