import { describe, expect, test } from "bun:test";
import {
  buildSisValidationPlan,
  buildWorkbookIndexes,
  detectWorkbookDuplicates,
  resolveDownstreamRef,
} from "./sis-import.plan";

function baseCtx(overrides = {}) {
  return {
    organizationId: "org1",
    selectedSchoolCode: "SCH-A",
    selectedSchoolId: "sch1",
    templateVersion: "1",
    reference: {
      school: { id: "sch1", code: "SCH-A", organizationId: "org1", isActive: true },
      academicYears: [{ id: "ay1", code: "2026", schoolId: "sch1", isActive: true }],
      gradeLevels: [{ id: "gr1", code: "G1", schoolId: "sch1", isActive: true }],
      classrooms: [],
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

function emptyWorkbook(overrides = {}) {
  return {
    students: [],
    guardians: [],
    staff: [],
    studentGuardians: [],
    staffSchoolAssignments: [],
    ...overrides,
  };
}

function row(sheet, rowNumber, normalized) {
  return { sheet, rowNumber, normalized };
}

describe("duplicate durable ref detection (Gate 2)", () => {
  test("1. student_ref duplicate exact-case -> B10_EXTERNAL_REF_DUPLICATE on both rows", () => {
    const wb = emptyWorkbook({
      students: [
        row("Students", 2, { student_ref: "STU-001" }),
        row("Students", 3, { student_ref: "STU-001" }),
      ],
    });
    const indexes = buildWorkbookIndexes(wb);
    const dupes = detectWorkbookDuplicates(wb, indexes);
    expect(dupes.get("Students#2")?.some((i) => i.code === "B10_EXTERNAL_REF_DUPLICATE")).toBe(
      true,
    );
    expect(dupes.get("Students#3")?.some((i) => i.code === "B10_EXTERNAL_REF_DUPLICATE")).toBe(
      true,
    );
  });

  test("2. student_ref duplicate mixed-case still collides (case-insensitive)", () => {
    const wb = emptyWorkbook({
      students: [
        row("Students", 2, { student_ref: "STU-001" }),
        row("Students", 3, { student_ref: "stu-001" }),
      ],
    });
    const indexes = buildWorkbookIndexes(wb);
    const dupes = detectWorkbookDuplicates(wb, indexes);
    expect(dupes.get("Students#2")).toBeDefined();
    expect(dupes.get("Students#3")).toBeDefined();
  });

  test("3. guardian_ref duplicate -> B10_EXTERNAL_REF_DUPLICATE", () => {
    const wb = emptyWorkbook({
      guardians: [
        row("Guardians", 2, { guardian_ref: "GRD-1" }),
        row("Guardians", 5, { guardian_ref: "grd-1" }),
      ],
    });
    const dupes = detectWorkbookDuplicates(wb, buildWorkbookIndexes(wb));
    expect(dupes.get("Guardians#2")?.[0].code).toBe("B10_EXTERNAL_REF_DUPLICATE");
    expect(dupes.get("Guardians#5")?.[0].code).toBe("B10_EXTERNAL_REF_DUPLICATE");
  });

  test("4. staff_ref duplicate -> B10_EXTERNAL_REF_DUPLICATE", () => {
    const wb = emptyWorkbook({
      staff: [row("Staff", 2, { staff_ref: "STF-1" }), row("Staff", 3, { staff_ref: "STF-1" })],
    });
    const dupes = detectWorkbookDuplicates(wb, buildWorkbookIndexes(wb));
    expect(dupes.get("Staff#2")?.[0].code).toBe("B10_EXTERNAL_REF_DUPLICATE");
  });

  test("5. duplicate nonblank Student NISN -> B10_DUPLICATE_IN_FILE", () => {
    const wb = emptyWorkbook({
      students: [
        row("Students", 2, { student_ref: "STU-001", nisn: "1234567890" }),
        row("Students", 3, { student_ref: "STU-002", nisn: "1234567890" }),
      ],
    });
    const dupes = detectWorkbookDuplicates(wb, buildWorkbookIndexes(wb));
    expect(
      dupes
        .get("Students#2")
        ?.some((i) => i.code === "B10_DUPLICATE_IN_FILE" && i.field === "nisn"),
    ).toBe(true);
    expect(
      dupes
        .get("Students#3")
        ?.some((i) => i.code === "B10_DUPLICATE_IN_FILE" && i.field === "nisn"),
    ).toBe(true);
  });

  test("blank NISN never counts as duplicate", () => {
    const wb = emptyWorkbook({
      students: [
        row("Students", 2, { student_ref: "STU-001", nisn: null }),
        row("Students", 3, { student_ref: "STU-002", nisn: "" }),
      ],
    });
    const dupes = detectWorkbookDuplicates(wb, buildWorkbookIndexes(wb));
    expect(dupes.size).toBe(0);
  });

  test("duplicate employee_number in StaffSchoolAssignments -> B10_DUPLICATE_IN_FILE", () => {
    const wb = emptyWorkbook({
      staffSchoolAssignments: [
        row("StaffSchoolAssignments", 2, { employee_number: "EMP-001" }),
        row("StaffSchoolAssignments", 3, { employee_number: "EMP-001" }),
      ],
    });
    const dupes = detectWorkbookDuplicates(wb, buildWorkbookIndexes(wb));
    expect(dupes.get("StaffSchoolAssignments#2")?.[0].code).toBe("B10_DUPLICATE_IN_FILE");
  });

  test("6. Guardian same phone/email but DIFFERENT refs does NOT duplicate-match", () => {
    const wb = emptyWorkbook({
      guardians: [
        row("Guardians", 2, { guardian_ref: "GRD-1", phone: "0812", email: "a@x.com" }),
        row("Guardians", 3, { guardian_ref: "GRD-2", phone: "0812", email: "a@x.com" }),
      ],
    });
    const dupes = detectWorkbookDuplicates(wb, buildWorkbookIndexes(wb));
    expect(dupes.size).toBe(0);
  });
});

describe("downstream cross-sheet resolution (Gates 4-5)", () => {
  test("7/8. downstream guardian_ref resolves same-workbook Guardian", () => {
    const wb = emptyWorkbook({ guardians: [row("Guardians", 2, { guardian_ref: "GRD-1" })] });
    const indexes = buildWorkbookIndexes(wb);
    const { handle, ambiguous } = resolveDownstreamRef(
      "grd-1",
      indexes.guardianRefIndex,
      () => null,
      "guardian",
    );
    expect(ambiguous).toBe(false);
    expect(handle).toEqual({ kind: "new-ref", entityType: "guardian", ref: "grd-1" });
  });

  test("downstream ref resolves to existing DB identity when not defined in this workbook", () => {
    const wb = emptyWorkbook();
    const indexes = buildWorkbookIndexes(wb);
    const { handle, ambiguous } = resolveDownstreamRef(
      "grd-9",
      indexes.guardianRefIndex,
      (canonical) => (canonical === "grd-9" ? "guardian-db-id" : null),
      "guardian",
    );
    expect(ambiguous).toBe(false);
    expect(handle).toEqual({ kind: "existing", id: "guardian-db-id" });
  });

  test("9. Staff ref resolution follows the same same-workbook-first principle", () => {
    const wb = emptyWorkbook({ staff: [row("Staff", 2, { staff_ref: "STF-1" })] });
    const indexes = buildWorkbookIndexes(wb);
    const { handle } = resolveDownstreamRef("STF-1", indexes.staffRefIndex, () => null, "staff");
    expect(handle).toEqual({ kind: "new-ref", entityType: "staff", ref: "stf-1" });
  });

  test("10. unresolved downstream ref -> null handle, not ambiguous", () => {
    const wb = emptyWorkbook();
    const indexes = buildWorkbookIndexes(wb);
    const { handle, ambiguous } = resolveDownstreamRef(
      "grd-missing",
      indexes.guardianRefIndex,
      () => null,
      "guardian",
    );
    expect(handle).toBeNull();
    expect(ambiguous).toBe(false);
  });

  test("11. ambiguous duplicate ref -> dependent row cannot resolve, even if a DB mapping exists", () => {
    const wb = emptyWorkbook({
      guardians: [
        row("Guardians", 2, { guardian_ref: "GRD-1" }),
        row("Guardians", 3, { guardian_ref: "grd-1" }),
      ],
    });
    const indexes = buildWorkbookIndexes(wb);
    const { handle, ambiguous } = resolveDownstreamRef(
      "GRD-1",
      indexes.guardianRefIndex,
      () => "some-existing-id",
      "guardian",
    );
    expect(ambiguous).toBe(true);
    expect(handle).toBeNull();
  });
});

describe("full plan orchestrator (Gate 6-7)", () => {
  test("12. row with ERROR issue is classified error, never create/update/unchanged/skip", () => {
    const wb = emptyWorkbook({
      students: [
        row("Students", 2, { student_ref: "STU-001" }),
        row("Students", 3, { student_ref: "stu-001" }),
      ],
    });
    const plan = buildSisValidationPlan(wb, baseCtx());
    for (const r of plan.rows) {
      expect(r.action).toBe("error");
    }
    expect(plan.hasBlockingError).toBe(true);
  });

  test("13. buildSisValidationPlan is deterministic across repeated calls on identical input", () => {
    const wb = emptyWorkbook({
      students: [row("Students", 2, { student_ref: "STU-001", status: "active" })],
      guardians: [row("Guardians", 2, { guardian_ref: "GRD-1", status: "active" })],
      studentGuardians: [row("StudentGuardians", 2, { guardian_ref: "GRD-1" })],
    });
    const ctx = baseCtx();
    const plan1 = buildSisValidationPlan(wb, ctx);
    const plan2 = buildSisValidationPlan(wb, ctx);
    expect(plan1.rows.map((r) => r.action)).toEqual(plan2.rows.map((r) => r.action));
    expect(plan1.hasBlockingError).toBe(plan2.hasBlockingError);
  });

  test("clean workbook: StudentGuardians.guardian_ref resolves to same-workbook Guardian as create", () => {
    const wb = emptyWorkbook({
      students: [row("Students", 2, { student_ref: "STU-1", status: "active" })],
      guardians: [row("Guardians", 2, { guardian_ref: "GRD-1", status: "active" })],
      studentGuardians: [
        row("StudentGuardians", 2, { student_ref_or_nisn: "STU-1", guardian_ref: "GRD-1" }),
      ],
    });
    const plan = buildSisValidationPlan(wb, baseCtx());
    const sgRow = plan.rows.find((r) => r.entityType === "student_guardian");
    expect(sgRow.action).toBe("create");
    expect(sgRow.issues.length).toBe(0);
  });

  test("unresolved StudentGuardians.guardian_ref -> B10_CROSS_REF_UNRESOLVED and action error", () => {
    const wb = emptyWorkbook({
      students: [row("Students", 2, { student_ref: "STU-1", status: "active" })],
      studentGuardians: [
        row("StudentGuardians", 2, { student_ref_or_nisn: "STU-1", guardian_ref: "GRD-MISSING" }),
      ],
    });
    const plan = buildSisValidationPlan(wb, baseCtx());
    const sgRow = plan.rows.find((r) => r.entityType === "student_guardian");
    expect(sgRow.action).toBe("error");
    expect(sgRow.issues.some((i) => i.code === "B10_CROSS_REF_UNRESOLVED")).toBe(true);
  });

  test("ambiguous same-workbook guardian_ref -> dependent StudentGuardians row is error, not create", () => {
    const wb = emptyWorkbook({
      students: [row("Students", 2, { student_ref: "STU-1", status: "active" })],
      guardians: [
        row("Guardians", 2, { guardian_ref: "GRD-1" }),
        row("Guardians", 3, { guardian_ref: "grd-1" }),
      ],
      studentGuardians: [
        row("StudentGuardians", 2, { student_ref_or_nisn: "STU-1", guardian_ref: "GRD-1" }),
      ],
    });
    const plan = buildSisValidationPlan(wb, baseCtx());
    const sgRow = plan.rows.find((r) => r.entityType === "student_guardian");
    expect(sgRow.action).toBe("error");
    expect(sgRow.issues.some((i) => i.code === "B10_CROSS_REF_DUPLICATE")).toBe(true);
  });
});

describe("B10-P2-RESOLVE-001: full same-workbook dependency chain resolution", () => {
  test("1. new Student + StudentGuardian in same workbook resolves Student parent", () => {
    const wb = emptyWorkbook({
      students: [row("Students", 2, { student_ref: "STU-1", status: "active" })],
      guardians: [row("Guardians", 2, { guardian_ref: "GRD-1", status: "active" })],
      studentGuardians: [
        row("StudentGuardians", 2, { student_ref_or_nisn: "STU-1", guardian_ref: "GRD-1" }),
      ],
    });
    const plan = buildSisValidationPlan(wb, baseCtx());
    const sgRow = plan.rows.find((r) => r.entityType === "student_guardian");
    expect(sgRow.issues.length).toBe(0);
    expect(sgRow.action).toBe("create");
  });

  test("2. new Guardian + StudentGuardian resolves Guardian parent (already covered above)", () => {
    const wb = emptyWorkbook({
      students: [row("Students", 2, { student_ref: "STU-1", status: "active" })],
      guardians: [row("Guardians", 2, { guardian_ref: "GRD-1", status: "active" })],
      studentGuardians: [
        row("StudentGuardians", 2, { student_ref_or_nisn: "STU-1", guardian_ref: "GRD-1" }),
      ],
    });
    const plan = buildSisValidationPlan(wb, baseCtx());
    const sgRow = plan.rows.find((r) => r.entityType === "student_guardian");
    expect(sgRow.matchIdentity).toEqual({ kind: "new-ref", entityType: "guardian", ref: "grd-1" });
  });

  test("3. new Student + StudentEnrollment resolves same-workbook Student", () => {
    const wb = emptyWorkbook({
      students: [row("Students", 2, { student_ref: "STU-1", status: "active" })],
      studentEnrollments: [
        row("StudentEnrollments", 2, {
          student_ref_or_nisn: "STU-1",
          school_code: "SCH-A",
          academic_year_code: "2026",
          grade_level_code: "G1",
          status: "active",
        }),
      ],
    });
    const plan = buildSisValidationPlan(wb, baseCtx());
    const seRow = plan.rows.find((r) => r.entityType === "student_enrollment");
    expect(seRow.issues.filter((i) => i.severity === "error").length).toBe(0);
    expect(seRow.action).toBe("create");
    expect(seRow.matchIdentity).toEqual({
      kind: "new-row",
      entityType: "student_enrollment",
      sheet: "StudentEnrollments",
      rowNumber: 2,
    });
  });

  test("4. new Student + new StudentEnrollment + ClassEnrollment resolves the NEW same-workbook enrollment", () => {
    const ctx = baseCtx({
      reference: {
        school: { id: "sch1", code: "SCH-A", organizationId: "org1", isActive: true },
        academicYears: [{ id: "ay1", code: "2026", schoolId: "sch1", isActive: true }],
        gradeLevels: [{ id: "gr1", code: "G1", schoolId: "sch1", isActive: true }],
        classrooms: [
          {
            id: "cls1",
            code: "1A",
            schoolId: "sch1",
            academicYearId: "ay1",
            gradeLevelId: "gr1",
            isActive: true,
          },
        ],
      },
    });
    const wb = emptyWorkbook({
      students: [row("Students", 2, { student_ref: "STU-1", status: "active" })],
      studentEnrollments: [
        row("StudentEnrollments", 2, {
          student_ref_or_nisn: "STU-1",
          school_code: "SCH-A",
          academic_year_code: "2026",
          grade_level_code: "G1",
          status: "active",
        }),
      ],
      classEnrollments: [
        row("ClassEnrollments", 2, {
          student_ref_or_nisn: "STU-1",
          school_code: "SCH-A",
          academic_year_code: "2026",
          classroom_code: "1A",
          starts_on: "2026-01-01",
          is_primary: true,
          status: "active",
        }),
      ],
    });
    const plan = buildSisValidationPlan(wb, ctx);
    const ceRow = plan.rows.find((r) => r.entityType === "class_enrollment");
    expect(ceRow.issues.filter((i) => i.severity === "error").length).toBe(0);
    expect(ceRow.action).toBe("create");
    expect(ceRow.matchIdentity).toEqual({
      kind: "new-row",
      entityType: "student_enrollment",
      sheet: "StudentEnrollments",
      rowNumber: 2,
    });
  });

  test("5. existing StudentEnrollment + ClassEnrollment (no workbook row) resolves the existing enrollment", () => {
    const ctx = baseCtx({
      reference: {
        school: { id: "sch1", code: "SCH-A", organizationId: "org1", isActive: true },
        academicYears: [{ id: "ay1", code: "2026", schoolId: "sch1", isActive: true }],
        gradeLevels: [{ id: "gr1", code: "G1", schoolId: "sch1", isActive: true }],
        classrooms: [
          {
            id: "cls1",
            code: "1A",
            schoolId: "sch1",
            academicYearId: "ay1",
            gradeLevelId: "gr1",
            isActive: true,
          },
        ],
      },
      identity: {
        students: [{ id: "stu-db-1", ref: "stu-1", nisn: null, isActive: true }],
        guardians: [],
        staff: [],
        studentGuardians: [],
        studentEnrollments: [
          {
            id: "se-db-1",
            studentId: "stu-db-1",
            schoolId: "sch1",
            academicYearId: "ay1",
            gradeLevelId: "gr1",
          },
        ],
        classEnrollments: [],
        staffSchoolAssignments: [],
      },
    });
    const wb = emptyWorkbook({
      classEnrollments: [
        row("ClassEnrollments", 2, {
          student_ref_or_nisn: "STU-1",
          school_code: "SCH-A",
          academic_year_code: "2026",
          classroom_code: "1A",
          starts_on: "2026-01-01",
          is_primary: true,
          status: "active",
        }),
      ],
    });
    const plan = buildSisValidationPlan(wb, ctx);
    const ceRow = plan.rows.find((r) => r.entityType === "class_enrollment");
    expect(ceRow.issues.filter((i) => i.severity === "error").length).toBe(0);
    expect(ceRow.matchIdentity).toEqual({ kind: "existing", id: "se-db-1" });
    expect(ceRow.action).toBe("create");
  });

  test("6. new Staff + StaffSchoolAssignment resolves same-workbook Staff", () => {
    const wb = emptyWorkbook({
      staff: [row("Staff", 2, { staff_ref: "STF-1", status: "active" })],
      staffSchoolAssignments: [
        row("StaffSchoolAssignments", 2, {
          staff_ref_or_employee_number: "STF-1",
          school_code: "SCH-A",
          status: "active",
        }),
      ],
    });
    const plan = buildSisValidationPlan(wb, baseCtx());
    const asRow = plan.rows.find((r) => r.entityType === "staff_school_assignment");
    expect(asRow.issues.filter((i) => i.severity === "error").length).toBe(0);
    expect(asRow.action).toBe("create");
    expect(asRow.matchIdentity).toEqual({ kind: "new-ref", entityType: "staff", ref: "stf-1" });
  });

  test("7. duplicate Student ref causes dependent StudentEnrollment row ERROR", () => {
    const wb = emptyWorkbook({
      students: [
        row("Students", 2, { student_ref: "STU-1", status: "active" }),
        row("Students", 3, { student_ref: "stu-1", status: "active" }),
      ],
      studentEnrollments: [
        row("StudentEnrollments", 2, {
          student_ref_or_nisn: "STU-1",
          school_code: "SCH-A",
          academic_year_code: "2026",
          grade_level_code: "G1",
          status: "active",
        }),
      ],
    });
    const plan = buildSisValidationPlan(wb, baseCtx());
    const seRow = plan.rows.find((r) => r.entityType === "student_enrollment");
    expect(seRow.action).toBe("error");
    expect(seRow.issues.some((i) => i.code === "B10_CROSS_REF_DUPLICATE")).toBe(true);
  });

  test("8. duplicate Guardian ref causes dependent StudentGuardian row ERROR", () => {
    const wb = emptyWorkbook({
      students: [row("Students", 2, { student_ref: "STU-1", status: "active" })],
      guardians: [
        row("Guardians", 2, { guardian_ref: "GRD-1" }),
        row("Guardians", 3, { guardian_ref: "grd-1" }),
      ],
      studentGuardians: [
        row("StudentGuardians", 2, { student_ref_or_nisn: "STU-1", guardian_ref: "GRD-1" }),
      ],
    });
    const plan = buildSisValidationPlan(wb, baseCtx());
    const sgRow = plan.rows.find((r) => r.entityType === "student_guardian");
    expect(sgRow.action).toBe("error");
  });

  test("9. duplicate Staff ref causes dependent StaffSchoolAssignment row ERROR", () => {
    const wb = emptyWorkbook({
      staff: [
        row("Staff", 2, { staff_ref: "STF-1", status: "active" }),
        row("Staff", 3, { staff_ref: "stf-1", status: "active" }),
      ],
      staffSchoolAssignments: [
        row("StaffSchoolAssignments", 2, {
          staff_ref_or_employee_number: "STF-1",
          school_code: "SCH-A",
          status: "active",
        }),
      ],
    });
    const plan = buildSisValidationPlan(wb, baseCtx());
    const asRow = plan.rows.find((r) => r.entityType === "staff_school_assignment");
    expect(asRow.action).toBe("error");
    expect(asRow.issues.some((i) => i.code === "B10_CROSS_REF_DUPLICATE")).toBe(true);
  });

  test("10. ambiguous StudentEnrollment logical parent causes dependent ClassEnrollment ERROR", () => {
    const ctx = baseCtx({
      reference: {
        school: { id: "sch1", code: "SCH-A", organizationId: "org1", isActive: true },
        academicYears: [{ id: "ay1", code: "2026", schoolId: "sch1", isActive: true }],
        gradeLevels: [{ id: "gr1", code: "G1", schoolId: "sch1", isActive: true }],
        classrooms: [
          {
            id: "cls1",
            code: "1A",
            schoolId: "sch1",
            academicYearId: "ay1",
            gradeLevelId: "gr1",
            isActive: true,
          },
        ],
      },
    });
    const wb = emptyWorkbook({
      students: [row("Students", 2, { student_ref: "STU-1", status: "active" })],
      studentEnrollments: [
        row("StudentEnrollments", 2, {
          student_ref_or_nisn: "STU-1",
          school_code: "SCH-A",
          academic_year_code: "2026",
          grade_level_code: "G1",
          status: "active",
        }),
        row("StudentEnrollments", 3, {
          student_ref_or_nisn: "STU-1",
          school_code: "SCH-A",
          academic_year_code: "2026",
          grade_level_code: "G1",
          status: "active",
        }),
      ],
      classEnrollments: [
        row("ClassEnrollments", 4, {
          student_ref_or_nisn: "STU-1",
          school_code: "SCH-A",
          academic_year_code: "2026",
          classroom_code: "1A",
          starts_on: "2026-01-01",
          is_primary: true,
          status: "active",
        }),
      ],
    });
    const plan = buildSisValidationPlan(wb, ctx);
    const ceRow = plan.rows.find((r) => r.entityType === "class_enrollment");
    expect(ceRow.action).toBe("error");
    expect(ceRow.issues.some((i) => i.code === "B10_CROSS_REF_DUPLICATE")).toBe(true);
  });

  test("11. no test path requires a fabricated UUID for a new same-workbook entity", () => {
    const wb = emptyWorkbook({
      students: [row("Students", 2, { student_ref: "STU-1", status: "active" })],
      staff: [row("Staff", 2, { staff_ref: "STF-1", status: "active" })],
      guardians: [row("Guardians", 2, { guardian_ref: "GRD-1", status: "active" })],
      studentGuardians: [
        row("StudentGuardians", 2, { student_ref_or_nisn: "STU-1", guardian_ref: "GRD-1" }),
      ],
      staffSchoolAssignments: [
        row("StaffSchoolAssignments", 2, {
          staff_ref_or_employee_number: "STF-1",
          school_code: "SCH-A",
          status: "active",
        }),
      ],
    });
    const plan = buildSisValidationPlan(wb, baseCtx());
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const r of plan.rows) {
      expect(r.resolvedEntityId === null || !UUID_RE.test(r.resolvedEntityId)).toBe(true);
      if (r.matchIdentity && r.matchIdentity.kind !== "existing") {
        expect("id" in r.matchIdentity).toBe(false);
      }
    }
  });

  test("12. buildSisValidationPlan is fully deterministic across repeated runs (all seven entities)", () => {
    const wb = emptyWorkbook({
      students: [row("Students", 2, { student_ref: "STU-1", status: "active" })],
      guardians: [row("Guardians", 2, { guardian_ref: "GRD-1", status: "active" })],
      staff: [row("Staff", 2, { staff_ref: "STF-1", status: "active" })],
      studentGuardians: [
        row("StudentGuardians", 2, { student_ref_or_nisn: "STU-1", guardian_ref: "GRD-1" }),
      ],
      staffSchoolAssignments: [
        row("StaffSchoolAssignments", 2, {
          staff_ref_or_employee_number: "STF-1",
          school_code: "SCH-A",
          status: "active",
        }),
      ],
      studentEnrollments: [
        row("StudentEnrollments", 2, {
          student_ref_or_nisn: "STU-1",
          school_code: "SCH-A",
          academic_year_code: "2026",
          grade_level_code: "G1",
          status: "active",
        }),
      ],
      classEnrollments: [],
    });
    const ctx = baseCtx();
    const plan1 = buildSisValidationPlan(wb, ctx);
    const plan2 = buildSisValidationPlan(wb, ctx);
    expect(plan1.rows.map((r) => r.action)).toEqual(plan2.rows.map((r) => r.action));
    expect(plan1.rows.map((r) => r.matchIdentity)).toEqual(plan2.rows.map((r) => r.matchIdentity));
    expect(plan1.hasBlockingError).toBe(plan2.hasBlockingError);
  });
});
