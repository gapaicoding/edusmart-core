import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-only helpers for Batch 7 Parent Portal.
 *
 * All Portal reads run through the caller-scoped supabase client (RLS is
 * authoritative). No service-role credential is used anywhere in the portal.
 */

export function translatePortalError(error: PostgrestError, subject: string): string {
  console.error(`[EduSmart Portal] ${subject} failed`, {
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

type PortalGuardian = {
  id: string;
  organization_id: string;
  status: string;
};

export type PortalRelationship = {
  guardian_id: string;
  student_id: string;
  organization_id: string;
  relationship_type: string;
  is_primary: boolean;
  can_view_academic: boolean;
  can_view_attendance: boolean;
  status: string;
  students: { id: string; full_name: string; status: string } | null;
};

export function filterCanonicalPortalRelationships(
  guardians: PortalGuardian[],
  relationships: PortalRelationship[],
  studentId?: string,
): PortalRelationship[] {
  const guardianOrganizations = new Map(
    guardians
      .filter((guardian) => guardian.status === "active")
      .map((guardian) => [guardian.id, guardian.organization_id]),
  );

  return relationships.filter((relationship) => {
    const guardianOrganization = guardianOrganizations.get(relationship.guardian_id);
    return (
      relationship.status === "active" &&
      guardianOrganization !== undefined &&
      guardianOrganization === relationship.organization_id &&
      (!studentId || relationship.student_id === studentId)
    );
  });
}

export async function loadPortalRelationships(
  supabase: SupabaseClient<Database>,
  userId: string,
  studentId?: string,
): Promise<PortalRelationship[]> {
  const { data: guardians, error: guardianError } = await supabase
    .from("guardians")
    .select("id, organization_id, status")
    .eq("profile_id", userId)
    .eq("status", "active");
  if (guardianError) throw new Error(translatePortalError(guardianError, "guardian profile"));

  const activeGuardians = (guardians ?? []) as PortalGuardian[];
  if (activeGuardians.length === 0) return [];

  let relationshipQuery = supabase
    .from("student_guardians")
    .select(
      "guardian_id, student_id, organization_id, relationship_type, is_primary, can_view_academic, can_view_attendance, status, students(id, full_name, status)",
    )
    .in(
      "guardian_id",
      activeGuardians.map((guardian) => guardian.id),
    )
    .eq("status", "active");
  if (studentId) relationshipQuery = relationshipQuery.eq("student_id", studentId);

  const { data: relationships, error: relationshipError } = await relationshipQuery;
  if (relationshipError)
    throw new Error(translatePortalError(relationshipError, "guardian relationships"));

  return filterCanonicalPortalRelationships(
    activeGuardians,
    (relationships ?? []) as PortalRelationship[],
    studentId,
  );
}

export async function getPortalSubjectRelationship(
  supabase: SupabaseClient<Database>,
  userId: string,
  studentId: string,
): Promise<PortalRelationship | null> {
  const relationships = await loadPortalRelationships(supabase, userId, studentId);
  return relationships[0] ?? null;
}

export function filterCurrentPublishedPortalReports<
  T extends { status: string; studentId: string },
>(rows: readonly T[], allowedStudentId: string) {
  return rows.filter((row) => row.status === "published" && row.studentId === allowedStudentId);
}

export type PortalAttendanceRpcRow = {
  record_id: string;
  session_id: string;
  session_date: string;
  session_status: string;
  status: string;
};

type PortalAttendanceRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: PortalAttendanceRpcRow[] | null;
    error: PostgrestError | null;
  }>;
};

export function callParentAttendanceRpc(
  supabase: SupabaseClient<Database>,
  args: Record<string, unknown>,
) {
  const portalSupabase = supabase as unknown as PortalAttendanceRpcClient;
  return portalSupabase.rpc("list_parent_student_attendance", args);
}
