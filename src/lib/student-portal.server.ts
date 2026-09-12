import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-only helpers for Batch 9 Student Portal.
 *
 * Every read runs through the caller-scoped Supabase client — RLS remains
 * authoritative and no service-role credential is used for ordinary Student
 * Portal reads. The authenticated student is always resolved server-side via
 * auth.uid() -> profiles.id -> students.profile_id -> exact student. A
 * client-provided studentId is never accepted as authorization proof
 * anywhere in this module.
 *
 * This intentionally does not reuse the Parent Portal helpers
 * (portal.server.ts / student_guardians / guardians.profile_id): the Student
 * and Parent authorization models stay separate by design.
 */

export function translateStudentPortalError(error: PostgrestError, subject: string): string {
  console.error(`[EduSmart Student Portal] ${subject} failed`, {
    code: error.code,
    message: error.message,
    details: error.details,
  });
  if (error.code === "42501") return "Your account does not have access to this information.";
  if (error.code === "PGRST301" || /jwt/i.test(error.message))
    return "Your session expired. Sign in again and retry.";
  if (error.code === "PGRST116") return `No ${subject.toLowerCase()} to display.`;
  return `We couldn't load ${subject.toLowerCase()} right now.`;
}

export type AuthenticatedStudentSubject = {
  studentId: string;
  organizationId: string;
  fullName: string;
  status: string;
};

/**
 * getAuthenticatedStudentSubject
 *
 * Contract: auth.uid() -> students.profile_id -> exact student.
 *
 * `organizationId` is REQUIRED FILTER CONTEXT (the caller's active
 * workspace), not proof of authorization — a profile bound to a student in a
 * *different* organization never leaks through here, because the lookup is
 * always scoped to the requested organization. `schoolId`, when supplied, is
 * validated against an active/leave enrollment for the resolved student in
 * that school; it never widens which student is resolved.
 *
 * Returns null when no bound student exists for this caller in this
 * organization (unbound account, wrong organization, archived student, or
 * RLS denial) — callers must treat null as "no portal access", not as an
 * error to retry with a different id.
 *
 * Never falls back to guardian relations and never uses the service role.
 */
export async function getAuthenticatedStudentSubject(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: { organizationId: string; schoolId?: string },
): Promise<AuthenticatedStudentSubject | null> {
  const { data: student, error } = await supabase
    .from("students")
    .select("id, organization_id, full_name, status")
    .eq("profile_id", userId)
    .eq("organization_id", options.organizationId)
    .maybeSingle();
  if (error) throw new Error(translateStudentPortalError(error, "student profile"));
  if (!student || student.status === "archived") return null;

  if (options.schoolId) {
    const { data: enrollment, error: enrollError } = await supabase
      .from("student_enrollments")
      .select("id")
      .eq("student_id", student.id)
      .eq("organization_id", options.organizationId)
      .eq("school_id", options.schoolId)
      .in("status", ["active", "leave"])
      .limit(1)
      .maybeSingle();
    if (enrollError) throw new Error(translateStudentPortalError(enrollError, "enrollment"));
    if (!enrollment) return null;
  }

  return {
    studentId: student.id,
    organizationId: student.organization_id,
    fullName: student.full_name,
    status: student.status,
  };
}

export type StudentAttendanceRpcRow = {
  record_id: string;
  session_id: string;
  session_date: string;
  session_status: string;
  status: string;
};

export type StudentPublishedScheduleRpcRow = {
  entry_id: string;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  subject_name: string;
  classroom_name: string;
  teacher_name: string;
};

type StudentScheduleRpcClient = {
  rpc: (
    fn: "list_student_published_schedule",
    args: { p_organization_id: string },
  ) => Promise<{
    data: StudentPublishedScheduleRpcRow[] | null;
    error: PostgrestError | null;
  }>;
};

/** Calls the safe published-schedule projection; never accepts a student id. */
export function callStudentPublishedScheduleRpc(
  supabase: SupabaseClient<Database>,
  organizationId: string,
) {
  return (supabase as unknown as StudentScheduleRpcClient).rpc("list_student_published_schedule", {
    p_organization_id: organizationId,
  });
}

type StudentAttendanceRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: StudentAttendanceRpcRow[] | null;
    error: PostgrestError | null;
  }>;
};

/** Calls the SECURITY DEFINER B9 RPC — never accepts a student id argument. */
export function callStudentOwnAttendanceRpc(
  supabase: SupabaseClient<Database>,
  args: {
    p_organization_id: string;
    p_school_id: string;
    p_from?: string | null;
    p_to?: string | null;
  },
) {
  const rpcClient = supabase as unknown as StudentAttendanceRpcClient;
  return rpcClient.rpc("list_student_own_attendance", args);
}
