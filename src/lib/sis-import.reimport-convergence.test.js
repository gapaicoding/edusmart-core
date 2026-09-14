import { describe, expect, test } from "bun:test";
import { convergeSisImportAction } from "./sis-import.convergence";
import { resolveDownstreamRef, resolveRefOrSecondaryIdentifier } from "./sis-import.plan";

const occurrence = (sheet, rowNumber) => [{ sheet, rowNumber }];

describe("B10 exact-workbook reimport convergence", () => {
  test("same-workbook durable refs prefer their existing DB identities", () => {
    const guardian = resolveDownstreamRef(
      "GRD-1",
      new Map([["grd-1", occurrence("Guardians", 2)]]),
      (ref) => (ref === "grd-1" ? "guardian-db" : null),
      "guardian",
    );
    const student = resolveRefOrSecondaryIdentifier(
      "STU-1",
      new Map([["stu-1", occurrence("Students", 2)]]),
      new Map(),
      (ref) => (ref === "stu-1" ? "student-db" : null),
      () => null,
      "student",
    );
    const staff = resolveRefOrSecondaryIdentifier(
      "STF-1",
      new Map([["stf-1", occurrence("Staff", 2)]]),
      new Map(),
      (ref) => (ref === "stf-1" ? "staff-db" : null),
      () => null,
      "staff",
    );

    expect(guardian.handle).toEqual({ kind: "existing", id: "guardian-db" });
    expect(student.handle).toEqual({ kind: "existing", id: "student-db" });
    expect(staff.handle).toEqual({ kind: "existing", id: "staff-db" });
  });

  test("duplicate same-workbook refs remain ambiguous even when a DB mapping exists", () => {
    const result = resolveDownstreamRef(
      "GRD-1",
      new Map([["grd-1", [...occurrence("Guardians", 2), ...occurrence("Guardians", 3)]]]),
      () => "guardian-db",
      "guardian",
    );
    expect(result).toEqual({ handle: null, ambiguous: true });
  });

  test("all seven entity types converge to UNCHANGED for semantically identical state", () => {
    const cases = [
      ["staff", { full_name: "B10 UAT Staff 001", status: "active" }],
      ["student", { full_name: "B10 UAT Student 001", status: "active" }],
      ["guardian", { full_name: "B10 UAT Guardian 001", status: "active" }],
      ["staff_school_assignment", { employee_number: "B10-UAT-EMP-001", status: "active" }],
      ["student_guardian", { relationship_type: "parent", is_primary: true, status: "active" }],
      ["student_enrollment", { student_number: "B10-UAT-STUN-001", status: "active" }],
      ["class_enrollment", { starts_on: "2026-07-01", is_primary: true, status: "active" }],
    ];
    for (const [entityType, normalized] of cases) {
      expect(convergeSisImportAction("update", normalized, { ...normalized }), entityType).toBe(
        "unchanged",
      );
    }
  });

  test("only a semantically changed entity remains UPDATE", () => {
    expect(
      convergeSisImportAction(
        "update",
        { full_name: "B10 UAT Student 001", preferred_name: "Updated" },
        { full_name: "B10 UAT Student 001", preferred_name: "Original" },
      ),
    ).toBe("update");
    expect(
      convergeSisImportAction("update", { status: "active" }, { status: "active" }),
    ).toBe("unchanged");
  });

  test("new relationships remain CREATE when no durable identity exists", () => {
    expect(convergeSisImportAction("create", { status: "active" }, null)).toBe("create");
  });
});
