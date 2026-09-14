import { SIS_CODES } from "./sis-import.constants";
import type {
  ExistingClassEnrollment,
  ExistingGuardian,
  ExistingStaff,
  ExistingStaffSchoolAssignment,
  ExistingStudent,
  ExistingStudentEnrollment,
  IdentitySnapshot,
  SisIssue,
} from "./sis-import.types";

export interface MatchResult<TId> {
  existingId: TId | null;
  conflict: boolean;
  conflictCode?: string;
}

/**
 * Student identity precedence: durable ref -> org-scoped NISN -> CREATE.
 * ref and NISN resolving to different students is a hard conflict.
 */
export function matchStudent(
  refCanonical: string | null,
  nisn: string | null,
  identity: IdentitySnapshot,
): MatchResult<string> {
  const byRef = refCanonical
    ? identity.students.find((s: ExistingStudent) => s.ref === refCanonical) ?? null
    : null;
  const byNisn = nisn ? identity.students.find((s) => s.nisn === nisn) ?? null : null;

  if (byRef && byNisn && byRef.id !== byNisn.id) {
    return { existingId: null, conflict: true, conflictCode: SIS_CODES.STUDENT_IDENTITY_CONFLICT };
  }
  return { existingId: byRef?.id ?? byNisn?.id ?? null, conflict: false };
}

/** Guardian identity: guardian_ref ONLY. No phone/email/name fallback, ever. */
export function matchGuardian(refCanonical: string | null, identity: IdentitySnapshot): MatchResult<string> {
  const byRef = refCanonical
    ? identity.guardians.find((g: ExistingGuardian) => g.ref === refCanonical) ?? null
    : null;
  return { existingId: byRef?.id ?? null, conflict: false };
}

/** Staff identity precedence: staff_ref -> selected-school employee_number -> CREATE. */
export function matchStaff(
  refCanonical: string | null,
  employeeNumber: string | null,
  identity: IdentitySnapshot,
): MatchResult<string> {
  const byRef = refCanonical
    ? identity.staff.find((s: ExistingStaff) => s.ref === refCanonical) ?? null
    : null;
  const byEmployee = employeeNumber
    ? identity.staff.find((s) => s.employeeNumber === employeeNumber) ?? null
    : null;

  if (byRef && byEmployee && byRef.id !== byEmployee.id) {
    return { existingId: null, conflict: true, conflictCode: SIS_CODES.STAFF_IDENTITY_CONFLICT };
  }
  return { existingId: byRef?.id ?? byEmployee?.id ?? null, conflict: false };
}

export function findStudentGuardian(
  studentId: string,
  guardianId: string,
  identity: IdentitySnapshot,
) {
  return (
    identity.studentGuardians.find((sg) => sg.studentId === studentId && sg.guardianId === guardianId) ??
    null
  );
}

/** Logical key: student + school (selected job school) + academic year. */
export function findStudentEnrollment(
  studentId: string,
  schoolId: string,
  academicYearId: string,
  identity: IdentitySnapshot,
): ExistingStudentEnrollment | null {
  return (
    identity.studentEnrollments.find(
      (e) => e.studentId === studentId && e.schoolId === schoolId && e.academicYearId === academicYearId,
    ) ?? null
  );
}

/**
 * Frozen temporal key: (student_enrollment_id, classroom_id, starts_on).
 * Same key => UPDATE candidate. Overlapping active-primary interval with a
 * different starts_on => B10_CLASS_ENROLLMENT_OVERLAP.
 */
export function matchClassEnrollment(
  studentEnrollmentId: string,
  classroomId: string,
  startsOn: string,
  endsOn: string | null,
  isPrimary: boolean,
  identity: IdentitySnapshot,
): { existingId: string | null; overlap: boolean } {
  const sameKey = identity.classEnrollments.find(
    (c) =>
      c.studentEnrollmentId === studentEnrollmentId &&
      c.classroomId === classroomId &&
      c.startsOn === startsOn,
  );
  if (sameKey) return { existingId: sameKey.id, overlap: false };

  if (isPrimary) {
    const overlap = identity.classEnrollments.some((c: ExistingClassEnrollment) => {
      if (c.studentEnrollmentId !== studentEnrollmentId || c.classroomId !== classroomId) return false;
      if (!c.isPrimary || !c.isActive) return false;
      const existingEnd = c.endsOn ?? "9999-12-31";
      const newEnd = endsOn ?? "9999-12-31";
      // inclusive interval overlap check, consistent with DB daterange(..., '[]')
      return startsOn <= existingEnd && c.startsOn <= newEnd;
    });
    if (overlap) return { existingId: null, overlap: true };
  }

  return { existingId: null, overlap: false };
}

/** Match by school + employee_number when present, else resolved staff identity + school. */
export function matchStaffSchoolAssignment(
  staffId: string,
  schoolId: string,
  employeeNumber: string | null,
  identity: IdentitySnapshot,
): { existingId: string | null; duplicateActive: boolean; identityConflict: boolean } {
  const byEmployee = employeeNumber
    ? identity.staffSchoolAssignments.find(
        (a: ExistingStaffSchoolAssignment) => a.schoolId === schoolId && a.employeeNumber === employeeNumber,
      )
    : identity.staffSchoolAssignments.find((a) => a.schoolId === schoolId && a.staffId === staffId);

  if (byEmployee && byEmployee.staffId !== staffId) {
    return { existingId: null, duplicateActive: false, identityConflict: true };
  }
  if (byEmployee) return { existingId: byEmployee.id, duplicateActive: false, identityConflict: false };

  const duplicateActive = identity.staffSchoolAssignments.some(
    (a) => a.schoolId === schoolId && a.staffId === staffId && a.isActive,
  );
  return { existingId: null, duplicateActive, identityConflict: false };
}

export function issueFor(
  code: string,
  message: string,
  base: Pick<SisIssue, "sheet" | "entityType" | "rowNumber" | "field">,
  severity: SisIssue["severity"] = "error",
): SisIssue {
  return { severity, code, message, ...base };
}
