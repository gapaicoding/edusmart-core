import { SIS_CODES } from "./sis-import.constants";
import {
  matchClassEnrollment,
  matchGuardian,
  matchStaff,
  matchStudent,
} from "./sis-import.matching";
import { normalizeExternalRef } from "./sis-import.normalize";
import type {
  FieldDiff,
  SisIssue,
  SisPlanRow,
  SisValidationContext,
  SisValidationPlan,
} from "./sis-import.types";

const TERMINAL_STUDENT_STATUSES = new Set(["archived", "alumni"]);
const TERMINAL_ENROLLMENT_STATUSES = new Set(["withdrawn", "graduated"]);
const TERMINAL_CLASS_STATUSES = new Set(["ended"]);
const TERMINAL_ASSIGNMENT_STATUSES = new Set(["ended", "archived"]);

function mkIssue(
  code: string,
  message: string,
  sheet: string,
  entityType: SisPlanRow["entityType"],
  rowNumber: number,
  severity: SisIssue["severity"] = "error",
  field?: string,
): SisIssue {
  const issue: SisIssue = { severity, code, message, sheet, entityType, rowNumber };
  if (field !== undefined) issue.field = field;
  return issue;
}

/** Validate a single normalized Student row against context. Pure, DB-independent. */
export function validateStudentRow(
  row: { sheet: string; rowNumber: number; normalized: Record<string, unknown> },
  ctx: SisValidationContext,
): SisPlanRow {
  const issues: SisIssue[] = [];
  const refResult = normalizeExternalRef(row.normalized["student_ref"]);
  const refCanonical = refResult.ok ? refResult.value.canonical : null;
  if (!refResult.ok) {
    issues.push(mkIssue(refResult.code, refResult.message, row.sheet, "student", row.rowNumber, "error", "student_ref"));
  }

  const nisn = (row.normalized["nisn"] as string | null) ?? null;
  const match = matchStudent(refCanonical, nisn, ctx.identity);
  if (match.conflict) {
    issues.push(
      mkIssue(match.conflictCode!, "student_ref and nisn resolve to different students", row.sheet, "student", row.rowNumber),
    );
  }

  const status = row.normalized["status"] as string | undefined;
  const action = match.existingId ? "update" : "create";
  if (action === "create" && status && TERMINAL_STUDENT_STATUSES.has(status)) {
    issues.push(
      mkIssue(
        SIS_CODES.CREATE_AS_TERMINAL_STATUS,
        `Creating a new student directly in terminal status "${status}"`,
        row.sheet,
        "student",
        row.rowNumber,
        "warning",
        "status",
      ),
    );
  }

  // Immutable NISN: existing student already has a non-null NISN and row supplies a different one.
  if (match.existingId) {
    const existing = ctx.identity.students.find((s) => s.id === match.existingId);
    if (existing?.nisn && nisn && existing.nisn !== nisn) {
      issues.push(
        mkIssue(SIS_CODES.IDENTITY_FIELD_IMMUTABLE, "nisn cannot be changed once set", row.sheet, "student", row.rowNumber, "error", "nisn"),
      );
    }
  }

  const hasError = issues.some((i) => i.severity === "error");
  return {
    entityType: "student",
    sheet: row.sheet,
    rowNumber: row.rowNumber,
    normalized: row.normalized,
    matchIdentity: match.existingId ? { kind: "existing", id: match.existingId } : refCanonical ? { kind: "new-ref", entityType: "student", ref: refCanonical } : { kind: "new-row", entityType: "student", sheet: row.sheet, rowNumber: row.rowNumber },
    resolvedEntityId: match.existingId,
    action: hasError ? "error" : action,
    diff: [],
    issues,
  };
}

export function validateGuardianRow(
  row: { sheet: string; rowNumber: number; normalized: Record<string, unknown> },
  ctx: SisValidationContext,
): SisPlanRow {
  const issues: SisIssue[] = [];
  const refResult = normalizeExternalRef(row.normalized["guardian_ref"]);
  const refCanonical = refResult.ok ? refResult.value.canonical : null;
  if (!refResult.ok) {
    issues.push(mkIssue(refResult.code, refResult.message, row.sheet, "guardian", row.rowNumber, "error", "guardian_ref"));
  }

  const match = matchGuardian(refCanonical, ctx.identity);
  const hasError = issues.some((i) => i.severity === "error");
  const action = hasError ? "error" : match.existingId ? "update" : "create";

  return {
    entityType: "guardian",
    sheet: row.sheet,
    rowNumber: row.rowNumber,
    normalized: row.normalized,
    matchIdentity: match.existingId ? { kind: "existing", id: match.existingId } : refCanonical ? { kind: "new-ref", entityType: "guardian", ref: refCanonical } : { kind: "new-row", entityType: "guardian", sheet: row.sheet, rowNumber: row.rowNumber },
    resolvedEntityId: match.existingId,
    action,
    diff: [],
    issues,
  };
}

export function validateStaffRow(
  row: { sheet: string; rowNumber: number; normalized: Record<string, unknown> },
  ctx: SisValidationContext,
  employeeNumber: string | null = null,
): SisPlanRow {
  const issues: SisIssue[] = [];
  const refResult = normalizeExternalRef(row.normalized["staff_ref"]);
  const refCanonical = refResult.ok ? refResult.value.canonical : null;
  if (!refResult.ok) {
    issues.push(mkIssue(refResult.code, refResult.message, row.sheet, "staff", row.rowNumber, "error", "staff_ref"));
  }

  const match = matchStaff(refCanonical, employeeNumber, ctx.identity);
  if (match.conflict) {
    issues.push(
      mkIssue(match.conflictCode!, "staff_ref and employee_number resolve to different staff", row.sheet, "staff", row.rowNumber),
    );
  }
  const hasError = issues.some((i) => i.severity === "error");
  const action = hasError ? "error" : match.existingId ? "update" : "create";

  return {
    entityType: "staff",
    sheet: row.sheet,
    rowNumber: row.rowNumber,
    normalized: row.normalized,
    matchIdentity: match.existingId ? { kind: "existing", id: match.existingId } : refCanonical ? { kind: "new-ref", entityType: "staff", ref: refCanonical } : { kind: "new-row", entityType: "staff", sheet: row.sheet, rowNumber: row.rowNumber },
    resolvedEntityId: match.existingId,
    action,
    diff: [],
    issues,
  };
}

/** Validate school_code column against the single authorized job school. */
export function validateRowSchool(
  schoolCode: string | null,
  ctx: SisValidationContext,
  sheet: string,
  entityType: SisPlanRow["entityType"],
  rowNumber: number,
): SisIssue | null {
  if (!schoolCode) return null;
  if (schoolCode.trim().toLowerCase() !== ctx.selectedSchoolCode.trim().toLowerCase()) {
    return mkIssue(
      SIS_CODES.ROW_SCHOOL_MISMATCH,
      `Row school "${schoolCode}" does not match the selected job school`,
      sheet,
      entityType,
      rowNumber,
      "error",
      "school_code",
    );
  }
  return null;
}

/** StudentEnrollment: AY/grade must exist, be active (for create), and never change once set. */
export function validateStudentEnrollmentRow(
  row: { sheet: string; rowNumber: number; normalized: Record<string, unknown> },
  ctx: SisValidationContext,
  existingEnrollmentId: string | null,
): SisIssue[] {
  const issues: SisIssue[] = [];
  const schoolMismatch = validateRowSchool(
    row.normalized["school_code"] as string | null,
    ctx,
    row.sheet,
    "student_enrollment",
    row.rowNumber,
  );
  if (schoolMismatch) issues.push(schoolMismatch);

  const ayCode = row.normalized["academic_year_code"] as string | undefined;
  const ay = ctx.reference.academicYears.find((a) => a.code === ayCode && a.schoolId === ctx.reference.school.id);
  if (!ay) {
    issues.push(mkIssue(SIS_CODES.REFERENCE_NOT_FOUND, `Academic year "${ayCode}" not found`, row.sheet, "student_enrollment", row.rowNumber, "error", "academic_year_code"));
  } else if (!ay.isActive && !existingEnrollmentId) {
    issues.push(mkIssue(SIS_CODES.REFERENCE_INACTIVE_FOR_CREATE, `Academic year "${ayCode}" is inactive`, row.sheet, "student_enrollment", row.rowNumber, "error", "academic_year_code"));
  }

  const gradeCode = row.normalized["grade_level_code"] as string | undefined;
  const grade = ctx.reference.gradeLevels.find((g) => g.code === gradeCode && g.schoolId === ctx.reference.school.id);
  if (!grade) {
    issues.push(mkIssue(SIS_CODES.REFERENCE_NOT_FOUND, `Grade level "${gradeCode}" not found`, row.sheet, "student_enrollment", row.rowNumber, "error", "grade_level_code"));
  }

  if (existingEnrollmentId && ay && grade) {
    const existing = ctx.identity.studentEnrollments.find((e) => e.id === existingEnrollmentId);
    if (existing && (existing.academicYearId !== ay.id || existing.gradeLevelId !== grade.id)) {
      issues.push(
        mkIssue(
          SIS_CODES.ENROLLMENT_YEAR_OR_GRADE_IMMUTABLE,
          "academic_year_code / grade_level_code cannot be changed on an existing enrollment",
          row.sheet,
          "student_enrollment",
          row.rowNumber,
        ),
      );
    }
  }

  const status = row.normalized["status"] as string | undefined;
  if (!existingEnrollmentId && status && TERMINAL_ENROLLMENT_STATUSES.has(status)) {
    issues.push(
      mkIssue(SIS_CODES.CREATE_AS_TERMINAL_STATUS, `Creating enrollment directly in terminal status "${status}"`, row.sheet, "student_enrollment", row.rowNumber, "warning", "status"),
    );
  }

  return issues;
}

/** ClassEnrollment: classroom must match enrollment's school/AY/grade; temporal overlap enforced. */
export function validateClassEnrollmentRow(
  row: { sheet: string; rowNumber: number; normalized: Record<string, unknown> },
  ctx: SisValidationContext,
  studentEnrollmentId: string,
  studentEnrollmentAcademicYearId: string,
  studentEnrollmentGradeLevelId: string,
): SisIssue[] {
  const issues: SisIssue[] = [];
  const schoolMismatch = validateRowSchool(
    row.normalized["school_code"] as string | null,
    ctx,
    row.sheet,
    "class_enrollment",
    row.rowNumber,
  );
  if (schoolMismatch) issues.push(schoolMismatch);

  const classroomCode = row.normalized["classroom_code"] as string | undefined;
  const classroom = ctx.reference.classrooms.find(
    (c) => c.code === classroomCode && c.schoolId === ctx.reference.school.id,
  );
  if (!classroom) {
    issues.push(mkIssue(SIS_CODES.REFERENCE_NOT_FOUND, `Classroom "${classroomCode}" not found`, row.sheet, "class_enrollment", row.rowNumber, "error", "classroom_code"));
    return issues;
  }
  if (classroom.academicYearId !== studentEnrollmentAcademicYearId || classroom.gradeLevelId !== studentEnrollmentGradeLevelId) {
    issues.push(mkIssue(SIS_CODES.AY_GRADE_MISMATCH, "Classroom academic year/grade does not match the student enrollment", row.sheet, "class_enrollment", row.rowNumber));
    return issues;
  }

  const startsOn = row.normalized["starts_on"] as string | undefined;
  const endsOn = (row.normalized["ends_on"] as string | null) ?? null;
  const isPrimaryResult = row.normalized["is_primary"];
  const isPrimary = isPrimaryResult === true;
  if (startsOn) {
    const { overlap } = matchClassEnrollment(studentEnrollmentId, classroom.id, startsOn, endsOn, isPrimary, ctx.identity);
    if (overlap) {
      issues.push(mkIssue(SIS_CODES.CLASS_ENROLLMENT_OVERLAP, "Overlapping primary-active class placement", row.sheet, "class_enrollment", row.rowNumber));
    }
  }

  const status = row.normalized["status"] as string | undefined;
  if (status && TERMINAL_CLASS_STATUSES.has(status)) {
    issues.push(mkIssue(SIS_CODES.CREATE_AS_TERMINAL_STATUS, `Creating class enrollment directly in terminal status "${status}"`, row.sheet, "class_enrollment", row.rowNumber, "warning", "status"));
  }

  return issues;
}

export function validateStaffAssignmentDuplicates(
  duplicateActive: boolean,
  sheet: string,
  rowNumber: number,
): SisIssue[] {
  if (!duplicateActive) return [];
  return [mkIssue(SIS_CODES.DUPLICATE_ACTIVE_ASSIGNMENT, "Staff already has an active assignment at this school", sheet, "staff_school_assignment", rowNumber)];
}

export function computeFieldDiff(
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  mutableFields: string[],
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const field of mutableFields) {
    const oldValue = oldValues[field] ?? null;
    const newValue = newValues[field] ?? null;
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      diffs.push({ field, oldValue, newValue });
    }
  }
  return diffs;
}

export function buildPlan(
  rows: SisPlanRow[],
  organizationId: string,
  schoolId: string,
  templateVersion: string,
): SisValidationPlan {
  const issues = rows.flatMap((r) => r.issues);
  const hasBlockingError = issues.some((i) => i.severity === "error");
  return { organizationId, schoolId, templateVersion, rows, issues, hasBlockingError };
}

export const TERMINAL_STATUS_SETS = {
  student: TERMINAL_STUDENT_STATUSES,
  student_enrollment: TERMINAL_ENROLLMENT_STATUSES,
  class_enrollment: TERMINAL_CLASS_STATUSES,
  staff_school_assignment: TERMINAL_ASSIGNMENT_STATUSES,
};
