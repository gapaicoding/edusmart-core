import { describe, expect, test } from "bun:test";
import {
  validateClassEnrollmentRow,
  validateRowSchool,
  validateStaffAssignmentDuplicates,
  validateStudentEnrollmentRow,
  validateStudentRow,
} from "./sis-import.validation";

function baseCtx(overrides = {}) {
  return {
    organizationId: "org1",
    selectedSchoolCode: "SCH-A",
    templateVersion: "1",
    reference: {
      school: { id: "sch1", code: "SCH-A", organizationId: "org1", isActive: true },
      academicYears: [{ id: "ay1", code: "2026", schoolId: "sch1", isActive: true }],
      gradeLevels: [{ id: "gr1", code: "G1", schoolId: "sch1", isActive: true }],
      classrooms: [{ id: "cls1", code: "1A", schoolId: "sch1", academicYearId: "ay1", gradeLevelId: "gr1", isActive: true }],
    },
    identity: {
      students: [],
      guardians: [],
      staff: [],
      studentGuardians: [],
      studentEnrollments: [],
      classEnrollments: [],
      staffSchoolAssignments: [],
    },
    ...overrides,
  };
}

describe("validateRowSchool", () => {
  test("wrong school code -> B10_ROW_SCHOOL_MISMATCH", () => {
    const issue = validateRowSchool("SCH-B", baseCtx(), "Students", "student", 2);
    expect(issue.code).toBe("B10_ROW_SCHOOL_MISMATCH");
  });

  test("matching school code (case-insensitive) -> no issue", () => {
    expect(validateRowSchool("sch-a", baseCtx(), "Students", "student", 2)).toBeNull();
  });
});

describe("validateStudentRow", () => {
  test("new student in terminal status -> warning, not error", () => {
    const row = { sheet: "Students", rowNumber: 2, normalized: { student_ref: "STU-001", status: "archived" } };
    const plan = validateStudentRow(row, baseCtx());
    const w = plan.issues.find((i) => i.code === "B10_CREATE_AS_TERMINAL_STATUS");
    expect(w).toBeDefined();
    expect(w.severity).toBe("warning");
    expect(plan.action).toBe("create");
  });

  test("immutable NISN change on existing student -> error", () => {
    const ctx = baseCtx({ identity: { ...baseCtx().identity, students: [{ id: "s1", ref: "stu-001", nisn: "1111111111", isActive: true }] } });
    const row = { sheet: "Students", rowNumber: 2, normalized: { student_ref: "STU-001", nisn: "2222222222", status: "active" } };
    const plan = validateStudentRow(row, ctx);
    expect(plan.issues.some((i) => i.code === "B10_IDENTITY_FIELD_IMMUTABLE")).toBe(true);
    expect(plan.action).toBe("error");
  });
});

describe("validateStudentEnrollmentRow — academic year / grade", () => {
  test("missing academic year -> B10_REFERENCE_NOT_FOUND", () => {
    const row = { sheet: "StudentEnrollments", rowNumber: 2, normalized: { school_code: "SCH-A", academic_year_code: "9999", grade_level_code: "G1" } };
    const issues = validateStudentEnrollmentRow(row, baseCtx(), null);
    expect(issues.some((i) => i.code === "B10_REFERENCE_NOT_FOUND" && i.field === "academic_year_code")).toBe(true);
  });

  test("inactive academic year on new enrollment -> B10_REFERENCE_INACTIVE_FOR_CREATE", () => {
    const ctx = baseCtx();
    ctx.reference.academicYears[0].isActive = false;
    const row = { sheet: "StudentEnrollments", rowNumber: 2, normalized: { school_code: "SCH-A", academic_year_code: "2026", grade_level_code: "G1" } };
    const issues = validateStudentEnrollmentRow(row, ctx, null);
    expect(issues.some((i) => i.code === "B10_REFERENCE_INACTIVE_FOR_CREATE")).toBe(true);
  });

  test("changing AY/grade on an existing enrollment -> B10_ENROLLMENT_YEAR_OR_GRADE_IMMUTABLE", () => {
    const ctx = baseCtx();
    ctx.reference.academicYears.push({ id: "ay2", code: "2027", schoolId: "sch1", isActive: true });
    ctx.identity.studentEnrollments.push({ id: "e1", studentId: "s1", schoolId: "sch1", academicYearId: "ay1", gradeLevelId: "gr1" });
    const row = { sheet: "StudentEnrollments", rowNumber: 2, normalized: { school_code: "SCH-A", academic_year_code: "2027", grade_level_code: "G1" } };
    const issues = validateStudentEnrollmentRow(row, ctx, "e1");
    expect(issues.some((i) => i.code === "B10_ENROLLMENT_YEAR_OR_GRADE_IMMUTABLE")).toBe(true);
  });

  test("wrong row school -> B10_ROW_SCHOOL_MISMATCH", () => {
    const row = { sheet: "StudentEnrollments", rowNumber: 2, normalized: { school_code: "SCH-B", academic_year_code: "2026", grade_level_code: "G1" } };
    const issues = validateStudentEnrollmentRow(row, baseCtx(), null);
    expect(issues.some((i) => i.code === "B10_ROW_SCHOOL_MISMATCH")).toBe(true);
  });
});

describe("validateClassEnrollmentRow", () => {
  test("classroom AY mismatch -> B10_AY_GRADE_MISMATCH", () => {
    const ctx = baseCtx();
    ctx.reference.classrooms[0].academicYearId = "ay-different";
    const row = { sheet: "ClassEnrollments", rowNumber: 2, normalized: { school_code: "SCH-A", classroom_code: "1A", starts_on: "2026-01-01", is_primary: true } };
    const issues = validateClassEnrollmentRow(row, ctx, "se1", "ay1", "gr1");
    expect(issues.some((i) => i.code === "B10_AY_GRADE_MISMATCH")).toBe(true);
  });

  test("classroom grade mismatch -> B10_AY_GRADE_MISMATCH", () => {
    const ctx = baseCtx();
    const row = { sheet: "ClassEnrollments", rowNumber: 2, normalized: { school_code: "SCH-A", classroom_code: "1A", starts_on: "2026-01-01", is_primary: true } };
    const issues = validateClassEnrollmentRow(row, ctx, "se1", "ay1", "gr-different");
    expect(issues.some((i) => i.code === "B10_AY_GRADE_MISMATCH")).toBe(true);
  });

  test("overlapping primary placement -> B10_CLASS_ENROLLMENT_OVERLAP", () => {
    const ctx = baseCtx();
    ctx.identity.classEnrollments.push({ id: "c1", studentEnrollmentId: "se1", classroomId: "cls1", startsOn: "2026-01-01", endsOn: "2026-06-30", isPrimary: true, isActive: true });
    const row = { sheet: "ClassEnrollments", rowNumber: 2, normalized: { school_code: "SCH-A", classroom_code: "1A", starts_on: "2026-03-01", is_primary: true } };
    const issues = validateClassEnrollmentRow(row, ctx, "se1", "ay1", "gr1");
    expect(issues.some((i) => i.code === "B10_CLASS_ENROLLMENT_OVERLAP")).toBe(true);
  });
});

describe("validateStaffAssignmentDuplicates", () => {
  test("flags duplicate active assignment", () => {
    const issues = validateStaffAssignmentDuplicates(true, "StaffSchoolAssignments", 2);
    expect(issues[0].code).toBe("B10_DUPLICATE_ACTIVE_ASSIGNMENT");
  });

  test("no issue when not duplicate", () => {
    expect(validateStaffAssignmentDuplicates(false, "StaffSchoolAssignments", 2)).toEqual([]);
  });
});
