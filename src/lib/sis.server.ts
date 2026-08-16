import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only helpers for Batch 2 SIS.
 *
 * Everything here runs on the caller-scoped Supabase client built from the
 * request bearer token, so `auth.uid()` is real and RLS stays authoritative.
 * No service-role credential is used anywhere in SIS.
 */

type Db = SupabaseClient<any, "public", any>;

const FRIENDLY_UNIQUE: Record<string, string> = {
  uq_students_org_nisn: "A student with this NISN already exists in this organization.",
  uq_guardians_org_profile: "This login is already linked to another guardian record.",
  uq_staff_members_org_profile: "This login is already linked to another staff record.",
  student_guardians_pair_key: "This guardian is already linked to this student.",
  student_enrollments_student_year_key:
    "This student already has an enrolment in this school for this academic year.",
};

const FRIENDLY_CHECK: Record<string, string> = {
  students_status_check: "That student status is not supported.",
  students_gender_check: "That gender value is not supported.",
  guardians_status_check: "That guardian status is not supported.",
  student_guardians_status_check: "That relationship status is not supported.",
  student_enrollments_status_check: "That enrolment status is not supported.",
  student_enrollments_dates_check: "The enrolment end date must be on or after the enrolment date.",
  class_enrollments_status_check: "That classroom placement status is not supported.",
  class_enrollments_dates_check: "The placement end date must be on or after the start date.",
  staff_members_status_check: "That staff status is not supported.",
  staff_members_staff_kind_check: "That staff kind is not supported.",
  staff_school_assignments_status_check: "That assignment status is not supported.",
  staff_school_assignments_dates_check: "The leaving date must be on or after the joining date.",
};

export function translateSisError(error: PostgrestError, subject: string): string {
  console.error(`[EduSmart SIS] ${subject} query failed`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });

  const text = `${error.message} ${error.details ?? ""}`;
  for (const [constraint, friendly] of Object.entries(FRIENDLY_UNIQUE)) {
    if (text.includes(constraint)) return friendly;
  }
  for (const [constraint, friendly] of Object.entries(FRIENDLY_CHECK)) {
    if (text.includes(constraint)) return friendly;
  }

  if (error.code === "P0001") return error.message;
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Your current role is not allowed to perform this action (rejected by the database).";
  }
  if (error.code === "23505") return "That record already exists.";
  if (error.code === "23503") {
    return "A related record referenced here does not exist, belongs to another school, or is not accessible to you.";
  }
  if (error.code === "23514") return "The values submitted violate a database rule.";

  return `${subject}: ${error.message}`;
}

/** Zero rows back from a write means RLS filtered it out — never a success. */
export function assertWriteApplied<T>(rows: T[] | null, action: string): T {
  const row = rows?.[0];
  if (!row) {
    throw new Error(
      `${action} was rejected by the database. Your role may not manage this record in the selected scope.`,
    );
  }
  return row;
}

/**
 * The client-side active organization is filtering context, never authorization.
 * This read runs under RLS, so an organization the caller cannot see simply
 * does not come back.
 */
export async function assertOrganizationAccess(supabase: Db, organizationId: string): Promise<void> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw new Error(translateSisError(error, "Organization"));
  if (!data) throw new Error("You do not have access to this organization, or it no longer exists.");
}

export async function resolveSchoolOrganization(supabase: Db, schoolId: string): Promise<string> {
  const { data, error } = await supabase
    .from("schools")
    .select("id, organization_id")
    .eq("id", schoolId)
    .maybeSingle();
  if (error) throw new Error(translateSisError(error, "School"));
  if (!data) throw new Error("You do not have access to this school, or it no longer exists.");
  return data.organization_id as string;
}

export type EnrollmentContext = {
  id: string;
  organizationId: string;
  schoolId: string;
  academicYearId: string;
  gradeLevelId: string;
  studentId: string;
};

export async function loadEnrollmentContext(
  supabase: Db,
  enrollmentId: string,
): Promise<EnrollmentContext> {
  const { data, error } = await supabase
    .from("student_enrollments")
    .select("id, organization_id, school_id, academic_year_id, grade_level_id, student_id")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (error) throw new Error(translateSisError(error, "Student enrolment"));
  if (!data) throw new Error("That enrolment does not exist, or you cannot access it.");
  return {
    id: data.id,
    organizationId: data.organization_id,
    schoolId: data.school_id,
    academicYearId: data.academic_year_id,
    gradeLevelId: data.grade_level_id,
    studentId: data.student_id,
  };
}

/**
 * Classroom placement integrity.
 *
 * The database composite FK only guarantees the classroom shares the
 * organization + school of the enrolment. Academic-year and grade-level
 * agreement is NOT guaranteed by any live constraint or trigger (reported as
 * finding B2-F01), so the check runs here, on the server, under the caller's
 * RLS-scoped client.
 */
export async function assertClassroomMatchesEnrollment(
  supabase: Db,
  enrollment: EnrollmentContext,
  classroomId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, name, organization_id, school_id, academic_year_id, grade_level_id")
    .eq("id", classroomId)
    .maybeSingle();
  if (error) throw new Error(translateSisError(error, "Classroom"));
  if (!data) throw new Error("That classroom does not exist, or you cannot access it.");

  if (data.organization_id !== enrollment.organizationId || data.school_id !== enrollment.schoolId) {
    throw new Error("That classroom belongs to a different school than this enrolment.");
  }
  if (data.academic_year_id !== enrollment.academicYearId) {
    throw new Error("That classroom belongs to a different academic year than this enrolment.");
  }
  if (data.grade_level_id !== enrollment.gradeLevelId) {
    throw new Error("That classroom belongs to a different grade level than this enrolment.");
  }
}
