import { createServerFn } from "@tanstack/react-start";
import type { PostgrestError } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { B13DomainError, translateB13Error } from "./teacher-daily-operations.server";
import {
  journalCreateInput,
  journalUpdateInput,
  journalSubmitInput,
  journalListInput,
  journalDetailInput,
  staffJournalListInput,
  occurrenceListInput,
  staffAttendanceManageInput,
  staffAttendanceListInput,
  selfAttendanceListInput,
} from "./teacher-daily-operations.schemas";

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: PostgrestError | null }>;
};
type RpcValue = string | number | boolean | null | RpcValue[] | { [key: string]: RpcValue };
type RpcRow = Record<string, RpcValue>;
const call = async <T>(
  client: RpcClient,
  name: string,
  args: Record<string, unknown>,
  subject: string,
) => {
  const result = await client.rpc(name, args);
  if (result.error) throw translateB13Error(result.error, subject);
  return result.data as T;
};
const first = <T>(rows: T[] | null, subject: string): T => {
  const row = rows?.[0];
  if (!row) throw new B13DomainError("UNKNOWN_SAFE_FAILURE", `${subject} returned no result.`);
  return row;
};

export const createTeachingJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => journalCreateInput.parse(x))
  .handler(async ({ data, context }) =>
    first(
      await call<RpcRow[]>(
        context.supabase as unknown as RpcClient,
        "create_teaching_journal",
        {
          p_request_id: data.requestId,
          p_timetable_entry_id: data.timetableEntryId,
          p_journal_date: data.journalDate,
          p_material_taught: data.materialTaught ?? null,
          p_obstacles: data.obstacles ?? null,
          p_follow_up: data.followUp ?? null,
          p_teacher_note: data.teacherNote ?? null,
        },
        "Create teaching journal",
      ),
      "Create teaching journal",
    ),
  );
export const updateTeachingJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => journalUpdateInput.parse(x))
  .handler(async ({ data, context }) =>
    first(
      await call<RpcRow[]>(
        context.supabase as unknown as RpcClient,
        "update_teaching_journal",
        {
          p_request_id: data.requestId,
          p_journal_id: data.journalId,
          p_expected_version: data.expectedVersion,
          p_material_taught: data.materialTaught ?? null,
          p_obstacles: data.obstacles ?? null,
          p_follow_up: data.followUp ?? null,
          p_teacher_note: data.teacherNote ?? null,
        },
        "Update teaching journal",
      ),
      "Update teaching journal",
    ),
  );
export const submitTeachingJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => journalSubmitInput.parse(x))
  .handler(async ({ data, context }) =>
    first(
      await call<RpcRow[]>(
        context.supabase as unknown as RpcClient,
        "submit_teaching_journal",
        {
          p_request_id: data.requestId,
          p_journal_id: data.journalId,
          p_expected_version: data.expectedVersion,
        },
        "Submit teaching journal",
      ),
      "Submit teaching journal",
    ),
  );
export const listMyTeachingJournals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => journalListInput.parse(x))
  .handler(({ data, context }) =>
    call<RpcRow[]>(
      context.supabase as unknown as RpcClient,
      "list_my_teaching_journals",
      {
        p_academic_year_id: data.academicYearId ?? null,
        p_term_id: data.termId ?? null,
        p_from: data.from ?? null,
        p_to: data.to ?? null,
        p_status: data.status ?? null,
        p_page: data.page,
        p_page_size: data.pageSize,
      },
      "List teaching journals",
    ),
  );
export const getMyTeachingJournal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => journalDetailInput.parse(x))
  .handler(({ data, context }) =>
    call<RpcRow[]>(
      context.supabase as unknown as RpcClient,
      "get_my_teaching_journal",
      { p_journal_id: data.journalId },
      "Get teaching journal",
    ),
  );
export const listStaffTeachingJournals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => staffJournalListInput.parse(x))
  .handler(({ data, context }) =>
    call<RpcRow[]>(
      context.supabase as unknown as RpcClient,
      "list_staff_teaching_journals",
      {
        p_school_id: data.schoolId,
        p_teacher_profile_id: data.teacherProfileId ?? null,
        p_classroom_id: data.classroomId ?? null,
        p_subject_id: data.subjectId ?? null,
        p_status: data.status ?? null,
        p_from: data.from ?? null,
        p_to: data.to ?? null,
        p_page: data.page,
        p_page_size: data.pageSize,
      },
      "List staff teaching journals",
    ),
  );
export const listMyTeachingOccurrences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => occurrenceListInput.parse(x))
  .handler(({ data, context }) =>
    call<RpcRow[]>(
      context.supabase as unknown as RpcClient,
      "list_my_teaching_occurrences",
      { p_from: data.from, p_to: data.to, p_page: data.page, p_page_size: data.pageSize },
      "List teaching occurrences",
    ),
  );
export const manageStaffAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => staffAttendanceManageInput.parse(x))
  .handler(async ({ data, context }) =>
    first(
      await call<RpcRow[]>(
        context.supabase as unknown as RpcClient,
        "manage_staff_attendance",
        {
          p_request_id: data.requestId,
          p_staff_member_id: data.staffMemberId,
          p_attendance_date: data.attendanceDate,
          p_status: data.status,
          p_check_in_at: data.checkInAt ?? null,
          p_check_out_at: data.checkOutAt ?? null,
          p_note: data.note ?? null,
          p_expected_version: data.expectedVersion ?? null,
        },
        "Manage staff attendance",
      ),
      "Manage staff attendance",
    ),
  );
export const listStaffAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => staffAttendanceListInput.parse(x))
  .handler(({ data, context }) =>
    call<RpcRow[]>(
      context.supabase as unknown as RpcClient,
      "list_staff_attendance",
      {
        p_school_id: data.schoolId,
        p_from: data.from ?? null,
        p_to: data.to ?? null,
        p_status: data.status ?? null,
        p_staff_member_id: data.staffMemberId ?? null,
        p_page: data.page,
        p_page_size: data.pageSize,
      },
      "List staff attendance",
    ),
  );
export const listMyStaffAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => selfAttendanceListInput.parse(x))
  .handler(({ data, context }) =>
    call<RpcRow[]>(
      context.supabase as unknown as RpcClient,
      "list_my_staff_attendance",
      {
        p_from: data.from ?? null,
        p_to: data.to ?? null,
        p_status: data.status ?? null,
        p_page: data.page,
        p_page_size: data.pageSize,
      },
      "List my staff attendance",
    ),
  );
