import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { translateSisError } from "./sis.server";

/**
 * Server-only helpers for Batch 3 Teacher Assignment.
 *
 * Everything runs on the caller-scoped Supabase client built from the request
 * bearer token, so auth.uid() is real and RLS stays authoritative. No
 * service-role credential is used anywhere in this module.
 */

type Db = SupabaseClient<Database>;

/**
 * Live database guards on public.teaching_assignments:
 *  - composite FKs (id, organization_id, school_id) to classrooms / subjects /
 *    terms / academic_years / staff_school_assignments
 *  - validate_teaching_assignment_consistency(): classroom year must equal the
 *    assignment year; term (when present) must belong to that year
 *  - guard_teaching_assignment_transition(): archiving needs
 *    teaching_assignment.archive
 *  - prevent_tenant_boundary_change(): organization/school are immutable
 * The strings below map those raw errors into readable copy.
 */
const FRIENDLY_TRIGGER: Array<[string, string]> = [
  [
    "classroom academic year mismatch",
    "This classroom belongs to a different academic year than the teaching assignment.",
  ],
  [
    "term academic year mismatch",
    "This term belongs to a different academic year than the teaching assignment.",
  ],
  [
    "teaching_assignment.archive",
    "Your current role is not allowed to archive teaching assignments.",
  ],
  [
    "tenant",
    "The organization and school of an existing teaching assignment cannot be changed. End this assignment and create a new one instead.",
  ],
];

const FRIENDLY_CONSTRAINT: Record<string, string> = {
  teaching_assignments_role_check: "That assignment role is not supported.",
  teaching_assignments_status_check: "That assignment status is not supported.",
  teaching_assignments_dates_check: "The end date must be on or after the start date.",
  teaching_assignments_classroom_fk: "That classroom is not available in the selected school.",
  teaching_assignments_subject_fk: "That subject is not available in the selected school.",
  teaching_assignments_term_fk: "That term is not available in the selected school.",
  teaching_assignments_year_fk: "That academic year is not available in the selected school.",
  teaching_assignments_staff_fk:
    "That staff member has no school assignment in the selected school. Assign them to this school first.",
};

export function translateTeachingError(error: PostgrestError, subject: string): string {
  const text = `${error.message} ${error.details ?? ""}`;
  for (const [constraint, friendly] of Object.entries(FRIENDLY_CONSTRAINT)) {
    if (text.includes(constraint)) return friendly;
  }
  for (const [fragment, friendly] of FRIENDLY_TRIGGER) {
    if (text.includes(fragment)) return friendly;
  }
  return translateSisError(error, subject);
}

export type SchoolScope = { organizationId: string; schoolId: string };

/**
 * The client-side active school is filtering context, never authorization.
 * This read runs under RLS, so an inaccessible school simply does not return.
 */
export async function assertSchoolScope(
  supabase: Db,
  organizationId: string,
  schoolId: string,
): Promise<SchoolScope> {
  const { data, error } = await supabase
    .from("schools")
    .select("id, organization_id")
    .eq("id", schoolId)
    .maybeSingle();
  if (error) throw new Error(translateTeachingError(error, "School"));
  if (!data) throw new Error("You do not have access to this school, or it no longer exists.");
  if (data.organization_id !== organizationId) {
    throw new Error("That school belongs to a different organization than the active context.");
  }
  return { organizationId: data.organization_id as string, schoolId: data.id as string };
}

/**
 * Server-side relationship validation. The database is still the final
 * authority (composite FKs + consistency trigger); these reads exist so the
 * user gets a specific message instead of a raw constraint error.
 */
export async function assertAssignmentReferences(
  supabase: Db,
  scope: SchoolScope,
  input: {
    academicYearId: string;
    termId: string | null;
    classroomId: string;
    subjectId: string;
    staffSchoolAssignmentId: string;
  },
): Promise<void> {
  const [year, classroom, subject, staffAssignment, term] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id, organization_id, school_id")
      .eq("id", input.academicYearId)
      .maybeSingle(),
    supabase
      .from("classrooms")
      .select("id, organization_id, school_id, academic_year_id, name")
      .eq("id", input.classroomId)
      .maybeSingle(),
    supabase
      .from("subjects")
      .select("id, organization_id, school_id, is_active, name")
      .eq("id", input.subjectId)
      .maybeSingle(),
    supabase
      .from("staff_school_assignments")
      .select("id, organization_id, school_id, status, staff_member_id")
      .eq("id", input.staffSchoolAssignmentId)
      .maybeSingle(),
    input.termId
      ? supabase
          .from("terms")
          .select("id, organization_id, school_id, academic_year_id")
          .eq("id", input.termId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
  ]);

  for (const [result, label] of [
    [year, "Academic year"],
    [classroom, "Classroom"],
    [subject, "Subject"],
    [staffAssignment, "Staff school assignment"],
    [term, "Term"],
  ] as const) {
    if (result.error) throw new Error(translateTeachingError(result.error, label));
  }

  if (!year.data) throw new Error("That academic year does not exist, or you cannot access it.");
  if (
    year.data.school_id !== scope.schoolId ||
    year.data.organization_id !== scope.organizationId
  ) {
    throw new Error("That academic year belongs to a different school.");
  }

  if (!classroom.data) throw new Error("That classroom does not exist, or you cannot access it.");
  if (
    classroom.data.school_id !== scope.schoolId ||
    classroom.data.organization_id !== scope.organizationId
  ) {
    throw new Error("That classroom belongs to a different school than this assignment.");
  }
  if (classroom.data.academic_year_id !== input.academicYearId) {
    throw new Error(
      "That classroom belongs to a different academic year than this assignment. Pick a classroom in the selected year.",
    );
  }

  if (!subject.data) throw new Error("That subject does not exist, or you cannot access it.");
  if (
    subject.data.school_id !== scope.schoolId ||
    subject.data.organization_id !== scope.organizationId
  ) {
    throw new Error("That subject belongs to a different school than this assignment.");
  }

  if (!staffAssignment.data) {
    throw new Error("That staff school assignment does not exist, or you cannot access it.");
  }
  if (
    staffAssignment.data.school_id !== scope.schoolId ||
    staffAssignment.data.organization_id !== scope.organizationId
  ) {
    throw new Error(
      "That staff member is assigned to a different school. Assign them to this school before giving them a teaching responsibility.",
    );
  }

  if (input.termId) {
    if (!term.data) throw new Error("That term does not exist, or you cannot access it.");
    if (
      term.data.school_id !== scope.schoolId ||
      term.data.organization_id !== scope.organizationId
    ) {
      throw new Error("That term belongs to a different school than this assignment.");
    }
    if (term.data.academic_year_id !== input.academicYearId) {
      throw new Error(
        "That term belongs to a different academic year than this assignment. Pick a term inside the selected year.",
      );
    }
  }
}
