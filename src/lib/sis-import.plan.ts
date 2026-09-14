/**
 * Pure, DB-independent workbook-wide plan orchestrator (B10-P2-VAL-001,
 * extended by B10-P2-RESOLVE-001).
 *
 * Duplicate detection and same-workbook cross-sheet reference resolution do
 * not require database access — they operate entirely on already-parsed and
 * normalized workbook rows plus the injected ReferenceSnapshot/
 * IdentitySnapshot. Phase 3 must be able to call `buildSisValidationPlan`
 * directly after building its snapshots, without reimplementing any of this
 * duplicate/cross-sheet semantics itself, including translating a logical
 * handle for a brand-new same-workbook entity into a real DB UUID inside the
 * authorized transaction. Phase 3 never re-decides which same-workbook
 * Student/Guardian/Staff/Enrollment a row means — that decision is made here.
 */
import { SIS_CODES } from "./sis-import.constants";
import {
  findStudentGuardian,
  matchClassEnrollment,
  matchStaffSchoolAssignment,
} from "./sis-import.matching";
import { normalizeExternalRef } from "./sis-import.normalize";
import {
  validateClassEnrollmentRow,
  validateGuardianRow,
  validateRowSchool,
  validateStaffAssignmentDuplicates,
  validateStaffRow,
  validateStudentEnrollmentRow,
  validateStudentRow,
} from "./sis-import.validation";
import type {
  LogicalEntityHandle,
  SisIssue,
  SisPlanRow,
  SisValidationContext,
  SisValidationPlan,
} from "./sis-import.types";
import type { SisAction } from "./sis-import.constants";

export interface SisSheetRow {
  sheet: string;
  rowNumber: number;
  normalized: Record<string, unknown>;
}

export interface SisWorkbookRows {
  students: SisSheetRow[];
  guardians: SisSheetRow[];
  staff: SisSheetRow[];
  studentGuardians: SisSheetRow[];
  staffSchoolAssignments: SisSheetRow[];
  studentEnrollments?: SisSheetRow[];
  classEnrollments?: SisSheetRow[];
}

interface RefOccurrence {
  sheet: string;
  rowNumber: number;
}

/** Index every row's canonical external ref value (blank/invalid refs are skipped — reported elsewhere). */
function indexRefField(rows: SisSheetRow[], field: string): Map<string, RefOccurrence[]> {
  const index = new Map<string, RefOccurrence[]>();
  for (const row of rows) {
    const result = normalizeExternalRef(row.normalized[field]);
    if (!result.ok) continue;
    const canonical = result.value.canonical;
    const list = index.get(canonical) ?? [];
    list.push({ sheet: row.sheet, rowNumber: row.rowNumber });
    index.set(canonical, list);
  }
  return index;
}

/** Index a plain (non-ref) secondary identifier, case/whitespace-insensitive, blank values skipped. */
function indexSecondaryField(
  rows: SisSheetRow[],
  extract: (row: SisSheetRow) => string | null | undefined,
): Map<string, RefOccurrence[]> {
  const index = new Map<string, RefOccurrence[]>();
  for (const row of rows) {
    const raw = extract(row);
    if (raw === null || raw === undefined) continue;
    const canonical = String(raw).trim().toLowerCase();
    if (canonical.length === 0) continue;
    const list = index.get(canonical) ?? [];
    list.push({ sheet: row.sheet, rowNumber: row.rowNumber });
    index.set(canonical, list);
  }
  return index;
}

/** Composite (student, school, academic year) key used for StudentEnrollments <-> ClassEnrollments linkage. */
function studentSchoolYearKey(row: SisSheetRow): string {
  const student = String(row.normalized["student_ref_or_nisn"] ?? "")
    .trim()
    .toLowerCase();
  const school = String(row.normalized["school_code"] ?? "")
    .trim()
    .toLowerCase();
  const ay = String(row.normalized["academic_year_code"] ?? "")
    .trim()
    .toLowerCase();
  return `${student}#${school}#${ay}`;
}

function keyOf(occ: RefOccurrence): string {
  return `${occ.sheet}#${occ.rowNumber}`;
}

/**
 * Every row that shares a duplicated canonical value gets the issue — there
 * is no "first wins" silent pick. A downstream reference to an ambiguous ref
 * must never resolve (see resolveDownstreamRef).
 */
function issuesForDuplicates(
  index: Map<string, RefOccurrence[]>,
  code: string,
  entityType: SisPlanRow["entityType"],
  field: string,
  messageFor: (canonical: string, count: number) => string,
): Map<string, SisIssue[]> {
  const byRow = new Map<string, SisIssue[]>();
  for (const [canonical, occurrences] of index) {
    if (occurrences.length <= 1) continue;
    for (const occ of occurrences) {
      const list = byRow.get(keyOf(occ)) ?? [];
      list.push({
        severity: "error",
        code,
        message: messageFor(canonical, occurrences.length),
        sheet: occ.sheet,
        entityType,
        rowNumber: occ.rowNumber,
        field,
      });
      byRow.set(keyOf(occ), list);
    }
  }
  return byRow;
}

function mergeInto(target: Map<string, SisIssue[]>, key: string, issues: SisIssue[]): void {
  if (issues.length === 0) return;
  target.set(key, [...(target.get(key) ?? []), ...issues]);
}

export interface WorkbookIndexes {
  studentRefIndex: Map<string, RefOccurrence[]>;
  guardianRefIndex: Map<string, RefOccurrence[]>;
  staffRefIndex: Map<string, RefOccurrence[]>;
  studentNisnIndex: Map<string, RefOccurrence[]>;
  staffEmployeeNumberIndex: Map<string, RefOccurrence[]>;
  studentEnrollmentKeyIndex: Map<string, RefOccurrence[]>;
}

/** Gate 1: build deterministic same-workbook indexes for every durable ref and secondary identity. */
export function buildWorkbookIndexes(rows: SisWorkbookRows): WorkbookIndexes {
  return {
    studentRefIndex: indexRefField(rows.students, "student_ref"),
    guardianRefIndex: indexRefField(rows.guardians, "guardian_ref"),
    staffRefIndex: indexRefField(rows.staff, "staff_ref"),
    studentNisnIndex: indexSecondaryField(
      rows.students,
      (r) => r.normalized["nisn"] as string | null,
    ),
    staffEmployeeNumberIndex: indexSecondaryField(
      rows.staffSchoolAssignments,
      (r) => r.normalized["employee_number"] as string | null,
    ),
    studentEnrollmentKeyIndex: indexSecondaryField(rows.studentEnrollments ?? [], (r) =>
      studentSchoolYearKey(r),
    ),
  };
}

/** Gates 2-3: duplicate-definition issues per row, keyed by `sheet#rowNumber`. */
export function detectWorkbookDuplicates(
  rows: SisWorkbookRows,
  indexes: WorkbookIndexes,
): Map<string, SisIssue[]> {
  const byRow = new Map<string, SisIssue[]>();

  for (const [key, issues] of issuesForDuplicates(
    indexes.studentRefIndex,
    SIS_CODES.EXTERNAL_REF_DUPLICATE,
    "student",
    "student_ref",
    (ref, n) => `Duplicate student_ref "${ref}" defined ${n} times in this workbook`,
  )) {
    mergeInto(byRow, key, issues);
  }
  for (const [key, issues] of issuesForDuplicates(
    indexes.guardianRefIndex,
    SIS_CODES.EXTERNAL_REF_DUPLICATE,
    "guardian",
    "guardian_ref",
    (ref, n) => `Duplicate guardian_ref "${ref}" defined ${n} times in this workbook`,
  )) {
    mergeInto(byRow, key, issues);
  }
  for (const [key, issues] of issuesForDuplicates(
    indexes.staffRefIndex,
    SIS_CODES.EXTERNAL_REF_DUPLICATE,
    "staff",
    "staff_ref",
    (ref, n) => `Duplicate staff_ref "${ref}" defined ${n} times in this workbook`,
  )) {
    mergeInto(byRow, key, issues);
  }
  for (const [key, issues] of issuesForDuplicates(
    indexes.studentNisnIndex,
    SIS_CODES.DUPLICATE_IN_FILE,
    "student",
    "nisn",
    (nisn, n) => `Duplicate nisn "${nisn}" appears on ${n} Student rows in this workbook`,
  )) {
    mergeInto(byRow, key, issues);
  }
  for (const [key, issues] of issuesForDuplicates(
    indexes.staffEmployeeNumberIndex,
    SIS_CODES.DUPLICATE_IN_FILE,
    "staff_school_assignment",
    "employee_number",
    (num, n) =>
      `Duplicate employee_number "${num}" appears on ${n} rows in this workbook for this school`,
  )) {
    mergeInto(byRow, key, issues);
  }
  for (const [key, issues] of issuesForDuplicates(
    indexes.studentEnrollmentKeyIndex,
    SIS_CODES.DUPLICATE_IN_FILE,
    "student_enrollment",
    "student_ref_or_nisn",
    (_k, n) =>
      `This student/school/academic-year enrollment is defined ${n} times in this workbook`,
  )) {
    mergeInto(byRow, key, issues);
  }

  return byRow;
}

/**
 * Gates 4-5: resolve a downstream durable-ref reference (e.g.
 * StudentGuardians.guardian_ref) to a LogicalEntityHandle. Resolution order:
 * duplicate detection first, then the injected IdentitySnapshot's existing
 * mapping, and finally a same-workbook new-row/new-ref handle. An
 * ambiguous same-workbook definition (duplicate) NEVER resolves, even if an
 * existing DB mapping also exists — the caller must treat this as
 * unresolved/duplicate, not silently pick one candidate.
 */
export function resolveDownstreamRef(
  rawRef: unknown,
  refIndex: Map<string, RefOccurrence[]>,
  existingIdByRef: (canonical: string) => string | null,
  entityType: SisPlanRow["entityType"],
): { handle: LogicalEntityHandle | null; ambiguous: boolean } {
  const result = normalizeExternalRef(rawRef);
  if (!result.ok) {
    return { handle: null, ambiguous: false };
  }
  const canonical = result.value.canonical;
  const occurrences = refIndex.get(canonical) ?? [];
  if (occurrences.length > 1) {
    return { handle: null, ambiguous: true };
  }
  const existingId = existingIdByRef(canonical);
  if (existingId) {
    return { handle: { kind: "existing", id: existingId }, ambiguous: false };
  }
  if (occurrences.length === 1) {
    return { handle: { kind: "new-ref", entityType, ref: canonical }, ambiguous: false };
  }
  return { handle: null, ambiguous: false };
}

/**
 * B10-P2-RESOLVE-001, Gate 5A/C/E: resolve a "student_ref_or_nisn" (or
 * "staff_ref_or_employee_number") dual-purpose column. Precedence: durable
 * ref (existing mapping before a same-workbook new handle) -> secondary
 * identifier (existing mapping before a same-workbook new handle) -> unresolved. An ambiguous
 * match at EITHER stage never falls through to the other — ambiguity always
 * blocks resolution, it is never silently downgraded to a different lookup.
 */
export function resolveRefOrSecondaryIdentifier(
  raw: unknown,
  refIndex: Map<string, RefOccurrence[]>,
  secondaryIndex: Map<string, RefOccurrence[]>,
  existingIdByRef: (canonical: string) => string | null,
  existingIdBySecondary: (value: string) => string | null,
  entityType: SisPlanRow["entityType"],
): { handle: LogicalEntityHandle | null; ambiguous: boolean } {
  const refResult = normalizeExternalRef(raw);
  if (refResult.ok) {
    const canonical = refResult.value.canonical;
    const refOccurrences = refIndex.get(canonical) ?? [];
    if (refOccurrences.length > 1) {
      return { handle: null, ambiguous: true };
    }
    const existingByRef = existingIdByRef(canonical);
    if (existingByRef) {
      return { handle: { kind: "existing", id: existingByRef }, ambiguous: false };
    }
    if (refOccurrences.length === 1) {
      return { handle: { kind: "new-ref", entityType, ref: canonical }, ambiguous: false };
    }
  }

  const secondaryRaw = raw === null || raw === undefined ? "" : String(raw).trim();
  if (secondaryRaw.length === 0) {
    return { handle: null, ambiguous: false };
  }
  const secondaryCanonical = secondaryRaw.toLowerCase();
  const secondaryOccurrences = secondaryIndex.get(secondaryCanonical) ?? [];
  if (secondaryOccurrences.length > 1) {
    return { handle: null, ambiguous: true };
  }
  const existingBySecondary = existingIdBySecondary(secondaryRaw);
  if (existingBySecondary) {
    return { handle: { kind: "existing", id: existingBySecondary }, ambiguous: false };
  }
  const occ = secondaryOccurrences[0];
  if (occ) {
    return {
      handle: { kind: "new-row", entityType, sheet: occ.sheet, rowNumber: occ.rowNumber },
      ambiguous: false,
    };
  }
  return { handle: null, ambiguous: false };
}

/** Attach duplicate-detection issues to a plan row and force its action to "error" if any issue is blocking. */
function applyRowLevelIssues(planRow: SisPlanRow, extraIssues: SisIssue[]): SisPlanRow {
  if (extraIssues.length === 0) return planRow;
  const issues = [...planRow.issues, ...extraIssues];
  const hasError = issues.some((i) => i.severity === "error");
  return { ...planRow, issues, action: hasError ? "error" : planRow.action };
}

function crossRefIssue(
  code: string,
  message: string,
  sheet: string,
  entityType: SisPlanRow["entityType"],
  rowNumber: number,
  field: string,
): SisIssue {
  return { severity: "error", code, message, sheet, entityType, rowNumber, field };
}

/**
 * Gate 6: full pure orchestrator. Runs Phase-2 stages 1-10 for all seven
 * importable entities, entirely from injected snapshots. No database access,
 * no persistence. Phase 3 calls this after building its
 * ReferenceSnapshot/IdentitySnapshot from authoritative DB reads, and must
 * not re-run any workbook duplicate detection, ref semantics, or matching
 * decisions itself — it only realizes the logical handles this function
 * produces into real DB UUIDs inside the authorized commit transaction.
 */
export function buildSisValidationPlan(
  workbook: SisWorkbookRows,
  ctx: SisValidationContext,
): SisValidationPlan {
  const indexes = buildWorkbookIndexes(workbook);
  const duplicateIssuesByRow = detectWorkbookDuplicates(workbook, indexes);

  const studentRows = workbook.students.map((row) =>
    applyRowLevelIssues(validateStudentRow(row, ctx), duplicateIssuesByRow.get(keyOf(row)) ?? []),
  );
  const guardianRows = workbook.guardians.map((row) =>
    applyRowLevelIssues(validateGuardianRow(row, ctx), duplicateIssuesByRow.get(keyOf(row)) ?? []),
  );
  const staffRows = workbook.staff.map((row) => {
    const employeeNumber = (row.normalized["employee_number"] as string | null) ?? null;
    return applyRowLevelIssues(
      validateStaffRow(row, ctx, employeeNumber),
      duplicateIssuesByRow.get(keyOf(row)) ?? [],
    );
  });

  const existingGuardianIdByRef = (canonical: string): string | null =>
    ctx.identity.guardians.find((g) => g.ref === canonical)?.id ?? null;
  const existingStudentIdByRef = (canonical: string): string | null =>
    ctx.identity.students.find((s) => s.ref === canonical)?.id ?? null;
  const existingStudentIdByNisn = (nisn: string): string | null =>
    ctx.identity.students.find((s) => s.nisn === nisn)?.id ?? null;
  const existingStaffIdByRef = (canonical: string): string | null =>
    ctx.identity.staff.find((s) => s.ref === canonical)?.id ?? null;
  const existingStaffIdByEmployeeNumber = (employeeNumber: string): string | null =>
    ctx.identity.staff.find((s) => s.employeeNumber === employeeNumber)?.id ?? null;

  const resolveStudent = (raw: unknown) =>
    resolveRefOrSecondaryIdentifier(
      raw,
      indexes.studentRefIndex,
      indexes.studentNisnIndex,
      existingStudentIdByRef,
      existingStudentIdByNisn,
      "student",
    );
  const resolveStaff = (raw: unknown) =>
    resolveRefOrSecondaryIdentifier(
      raw,
      indexes.staffRefIndex,
      new Map<string, RefOccurrence[]>(), // no same-workbook "new" employee_number-only staff definitions
      existingStaffIdByRef,
      existingStaffIdByEmployeeNumber,
      "staff",
    );

  // --- Gate 5A/B: StudentGuardians -> Student, StudentGuardians -> Guardian ---
  const studentGuardianRows: SisPlanRow[] = workbook.studentGuardians.map((row) => {
    const issues: SisIssue[] = [...(duplicateIssuesByRow.get(keyOf(row)) ?? [])];

    const studentResolution = resolveStudent(row.normalized["student_ref_or_nisn"]);
    if (studentResolution.ambiguous) {
      issues.push(
        crossRefIssue(
          SIS_CODES.CROSS_REF_DUPLICATE,
          "student_ref_or_nisn is defined more than once in this workbook and cannot be resolved",
          row.sheet,
          "student_guardian",
          row.rowNumber,
          "student_ref_or_nisn",
        ),
      );
    } else if (!studentResolution.handle) {
      issues.push(
        crossRefIssue(
          SIS_CODES.CROSS_REF_UNRESOLVED,
          "student_ref_or_nisn does not resolve to any Student in this workbook or existing records",
          row.sheet,
          "student_guardian",
          row.rowNumber,
          "student_ref_or_nisn",
        ),
      );
    }

    const guardianResolution = resolveDownstreamRef(
      row.normalized["guardian_ref"],
      indexes.guardianRefIndex,
      existingGuardianIdByRef,
      "guardian",
    );
    if (guardianResolution.ambiguous) {
      issues.push(
        crossRefIssue(
          SIS_CODES.CROSS_REF_DUPLICATE,
          "guardian_ref is defined more than once in this workbook and cannot be resolved",
          row.sheet,
          "student_guardian",
          row.rowNumber,
          "guardian_ref",
        ),
      );
    } else if (!guardianResolution.handle) {
      issues.push(
        crossRefIssue(
          SIS_CODES.CROSS_REF_UNRESOLVED,
          "guardian_ref does not resolve to any Guardian in this workbook or existing records",
          row.sheet,
          "student_guardian",
          row.rowNumber,
          "guardian_ref",
        ),
      );
    }

    const hasError = issues.some((i) => i.severity === "error");
    let action: SisAction = "create";
    if (
      !hasError &&
      studentResolution.handle?.kind === "existing" &&
      guardianResolution.handle?.kind === "existing"
    ) {
      const existingRelation = findStudentGuardian(
        studentResolution.handle.id,
        guardianResolution.handle.id,
        ctx.identity,
      );
      action = existingRelation ? "update" : "create";
    }

    return {
      entityType: "student_guardian",
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      normalized: row.normalized,
      matchIdentity: guardianResolution.handle,
      resolvedEntityId:
        guardianResolution.handle?.kind === "existing" ? guardianResolution.handle.id : null,
      action: hasError ? "error" : action,
      diff: [],
      issues,
    };
  });

  // --- Gate 5E: StaffSchoolAssignments -> Staff ---
  const staffSchoolAssignmentRows: SisPlanRow[] = workbook.staffSchoolAssignments.map((row) => {
    const issues: SisIssue[] = [...(duplicateIssuesByRow.get(keyOf(row)) ?? [])];
    const schoolMismatch = validateRowSchool(
      row.normalized["school_code"] as string | null,
      ctx,
      row.sheet,
      "staff_school_assignment",
      row.rowNumber,
    );
    if (schoolMismatch) issues.push(schoolMismatch);

    const staffResolution = resolveStaff(row.normalized["staff_ref_or_employee_number"]);
    if (staffResolution.ambiguous) {
      issues.push(
        crossRefIssue(
          SIS_CODES.CROSS_REF_DUPLICATE,
          "staff_ref_or_employee_number is defined more than once in this workbook and cannot be resolved",
          row.sheet,
          "staff_school_assignment",
          row.rowNumber,
          "staff_ref_or_employee_number",
        ),
      );
    } else if (!staffResolution.handle) {
      issues.push(
        crossRefIssue(
          SIS_CODES.CROSS_REF_UNRESOLVED,
          "staff_ref_or_employee_number does not resolve to any Staff in this workbook or existing records",
          row.sheet,
          "staff_school_assignment",
          row.rowNumber,
          "staff_ref_or_employee_number",
        ),
      );
    }

    let action: SisAction = "create";
    let resolvedEntityId: string | null = null;
    if (staffResolution.handle?.kind === "existing") {
      const employeeNumber = (row.normalized["employee_number"] as string | null) ?? null;
      const m = matchStaffSchoolAssignment(
        staffResolution.handle.id,
        ctx.reference.school.id,
        employeeNumber,
        ctx.identity,
      );
      if (m.identityConflict) {
        issues.push(
          crossRefIssue(
            "B10_STAFF_IDENTITY_CONFLICT",
            "staff_ref and employee_number resolve to different Staff identities",
            row.sheet,
            "staff_school_assignment",
            row.rowNumber,
            "employee_number",
          ),
        );
      } else if (m.existingId) {
        resolvedEntityId = m.existingId;
        action = "update";
      } else {
        issues.push(
          ...validateStaffAssignmentDuplicates(m.duplicateActive, row.sheet, row.rowNumber),
        );
      }
    }

    const hasError = issues.some((i) => i.severity === "error");
    return {
      entityType: "staff_school_assignment",
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      normalized: row.normalized,
      matchIdentity: staffResolution.handle,
      resolvedEntityId,
      action: hasError ? "error" : action,
      diff: [],
      issues,
    };
  });

  // --- Gate 5C: StudentEnrollments -> Student ---
  const studentEnrollmentRows: SisPlanRow[] = (workbook.studentEnrollments ?? []).map((row) => {
    const issues: SisIssue[] = [...(duplicateIssuesByRow.get(keyOf(row)) ?? [])];

    const studentResolution = resolveStudent(row.normalized["student_ref_or_nisn"]);
    if (studentResolution.ambiguous) {
      issues.push(
        crossRefIssue(
          SIS_CODES.CROSS_REF_DUPLICATE,
          "student_ref_or_nisn is defined more than once in this workbook and cannot be resolved",
          row.sheet,
          "student_enrollment",
          row.rowNumber,
          "student_ref_or_nisn",
        ),
      );
    } else if (!studentResolution.handle) {
      issues.push(
        crossRefIssue(
          SIS_CODES.CROSS_REF_UNRESOLVED,
          "student_ref_or_nisn does not resolve to any Student in this workbook or existing records",
          row.sheet,
          "student_enrollment",
          row.rowNumber,
          "student_ref_or_nisn",
        ),
      );
    }

    let existingEnrollmentId: string | null = null;
    if (studentResolution.handle?.kind === "existing") {
      const studentId = studentResolution.handle.id;
      const ayCode = row.normalized["academic_year_code"] as string | undefined;
      const ay = ctx.reference.academicYears.find(
        (a) => a.code === ayCode && a.schoolId === ctx.reference.school.id,
      );
      if (ay) {
        const existing = ctx.identity.studentEnrollments.find(
          (e) =>
            e.studentId === studentId &&
            e.schoolId === ctx.reference.school.id &&
            e.academicYearId === ay.id,
        );
        existingEnrollmentId = existing?.id ?? null;
      }
    }

    issues.push(...validateStudentEnrollmentRow(row, ctx, existingEnrollmentId));

    const hasError = issues.some((i) => i.severity === "error");
    const handle: LogicalEntityHandle = existingEnrollmentId
      ? { kind: "existing", id: existingEnrollmentId }
      : {
          kind: "new-row",
          entityType: "student_enrollment",
          sheet: row.sheet,
          rowNumber: row.rowNumber,
        };

    return {
      entityType: "student_enrollment",
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      normalized: row.normalized,
      matchIdentity: hasError ? null : handle,
      resolvedEntityId: existingEnrollmentId,
      action: hasError ? "error" : existingEnrollmentId ? "update" : "create",
      diff: [],
      issues,
    };
  });

  const studentEnrollmentRowByKey = new Map<string, SisPlanRow>();
  (workbook.studentEnrollments ?? []).forEach((row, i) => {
    const planRow = studentEnrollmentRows[i];
    if (planRow) studentEnrollmentRowByKey.set(studentSchoolYearKey(row), planRow);
  });

  // --- Gate 5D: ClassEnrollments -> StudentEnrollment (existing OR same-workbook new) ---
  const classEnrollmentRows: SisPlanRow[] = (workbook.classEnrollments ?? []).map((row) => {
    const issues: SisIssue[] = [...(duplicateIssuesByRow.get(keyOf(row)) ?? [])];
    const key = studentSchoolYearKey(row);
    const sameKeyOccurrences = indexes.studentEnrollmentKeyIndex.get(key) ?? [];

    let parentHandle: LogicalEntityHandle | null = null;
    let parentAyId: string | null = null;
    let parentGradeId: string | null = null;

    if (sameKeyOccurrences.length > 1) {
      issues.push(
        crossRefIssue(
          SIS_CODES.CROSS_REF_DUPLICATE,
          "The referenced student enrollment (student/school/academic year) is defined more than once in this workbook",
          row.sheet,
          "class_enrollment",
          row.rowNumber,
          "student_ref_or_nisn",
        ),
      );
    } else if (sameKeyOccurrences.length === 1) {
      const parentRow = studentEnrollmentRowByKey.get(key);
      if (parentRow) {
        if (parentRow.action === "error") {
          issues.push(
            crossRefIssue(
              SIS_CODES.CROSS_REF_UNRESOLVED,
              "The referenced student enrollment row has blocking errors and cannot be used",
              row.sheet,
              "class_enrollment",
              row.rowNumber,
              "student_ref_or_nisn",
            ),
          );
        } else {
          parentHandle = parentRow.matchIdentity;
          if (parentRow.resolvedEntityId) {
            const existing = ctx.identity.studentEnrollments.find(
              (e) => e.id === parentRow.resolvedEntityId,
            );
            parentAyId = existing?.academicYearId ?? null;
            parentGradeId = existing?.gradeLevelId ?? null;
          } else {
            const ayCode = parentRow.normalized["academic_year_code"] as string | undefined;
            const gradeCode = parentRow.normalized["grade_level_code"] as string | undefined;
            parentAyId =
              ctx.reference.academicYears.find(
                (a) => a.code === ayCode && a.schoolId === ctx.reference.school.id,
              )?.id ?? null;
            parentGradeId =
              ctx.reference.gradeLevels.find(
                (g) => g.code === gradeCode && g.schoolId === ctx.reference.school.id,
              )?.id ?? null;
          }
        }
      }
    } else {
      // No same-workbook StudentEnrollment row for this key — fall back to an existing DB enrollment.
      const studentResolution = resolveStudent(row.normalized["student_ref_or_nisn"]);
      if (studentResolution.ambiguous) {
        issues.push(
          crossRefIssue(
            SIS_CODES.CROSS_REF_DUPLICATE,
            "student_ref_or_nisn is defined more than once in this workbook and cannot be resolved",
            row.sheet,
            "class_enrollment",
            row.rowNumber,
            "student_ref_or_nisn",
          ),
        );
      } else if (!studentResolution.handle) {
        issues.push(
          crossRefIssue(
            SIS_CODES.CROSS_REF_UNRESOLVED,
            "student_ref_or_nisn does not resolve to any Student in this workbook or existing records",
            row.sheet,
            "class_enrollment",
            row.rowNumber,
            "student_ref_or_nisn",
          ),
        );
      } else if (studentResolution.handle.kind === "existing") {
        const studentId = studentResolution.handle.id;
        const ayCode = row.normalized["academic_year_code"] as string | undefined;
        const ay = ctx.reference.academicYears.find(
          (a) => a.code === ayCode && a.schoolId === ctx.reference.school.id,
        );
        const existingEnrollment = ay
          ? ctx.identity.studentEnrollments.find(
              (e) =>
                e.studentId === studentId &&
                e.schoolId === ctx.reference.school.id &&
                e.academicYearId === ay.id,
            )
          : null;
        if (existingEnrollment) {
          parentHandle = { kind: "existing", id: existingEnrollment.id };
          parentAyId = existingEnrollment.academicYearId;
          parentGradeId = existingEnrollment.gradeLevelId;
        } else {
          issues.push(
            crossRefIssue(
              SIS_CODES.CROSS_REF_UNRESOLVED,
              "No matching student enrollment exists for this student/school/academic year",
              row.sheet,
              "class_enrollment",
              row.rowNumber,
              "student_ref_or_nisn",
            ),
          );
        }
      } else {
        // A brand-new same-workbook student with no corresponding StudentEnrollments row at all.
        issues.push(
          crossRefIssue(
            SIS_CODES.CROSS_REF_UNRESOLVED,
            "No matching student enrollment (existing or same-workbook) found for this student/school/academic year",
            row.sheet,
            "class_enrollment",
            row.rowNumber,
            "student_ref_or_nisn",
          ),
        );
      }
    }

    let existingClassEnrollmentId: string | null = null;
    if (parentHandle && parentAyId && parentGradeId) {
      const studentEnrollmentIdForMatch =
        parentHandle.kind === "existing" ? parentHandle.id : `__new__${row.sheet}#${row.rowNumber}`;
      issues.push(
        ...validateClassEnrollmentRow(
          row,
          ctx,
          studentEnrollmentIdForMatch,
          parentAyId,
          parentGradeId,
        ),
      );

      if (parentHandle.kind === "existing") {
        const classroomCode = row.normalized["classroom_code"] as string | undefined;
        const classroom = ctx.reference.classrooms.find(
          (c) => c.code === classroomCode && c.schoolId === ctx.reference.school.id,
        );
        const startsOn = row.normalized["starts_on"] as string | undefined;
        if (classroom && startsOn) {
          const endsOn = (row.normalized["ends_on"] as string | null) ?? null;
          const isPrimary = row.normalized["is_primary"] === true;
          const m = matchClassEnrollment(
            parentHandle.id,
            classroom.id,
            startsOn,
            endsOn,
            isPrimary,
            ctx.identity,
          );
          existingClassEnrollmentId = m.existingId;
        }
      }
    }

    const hasError = issues.some((i) => i.severity === "error");
    return {
      entityType: "class_enrollment",
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      normalized: row.normalized,
      matchIdentity: hasError ? null : parentHandle,
      resolvedEntityId: existingClassEnrollmentId,
      action: hasError ? "error" : existingClassEnrollmentId ? "update" : "create",
      diff: [],
      issues,
    };
  });

  const rows = [
    ...studentRows,
    ...guardianRows,
    ...staffRows,
    ...staffSchoolAssignmentRows,
    ...studentGuardianRows,
    ...studentEnrollmentRows,
    ...classEnrollmentRows,
  ];
  const issues = rows.flatMap((r) => r.issues);
  const hasBlockingError = issues.some((i) => i.severity === "error");

  return {
    organizationId: ctx.organizationId,
    schoolId: ctx.selectedSchoolId ?? "",
    templateVersion: ctx.templateVersion,
    rows,
    issues,
    hasBlockingError,
  };
}
