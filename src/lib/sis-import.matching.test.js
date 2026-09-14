import { describe, expect, test } from "bun:test";
import {
  matchClassEnrollment,
  matchGuardian,
  matchStaff,
  matchStaffSchoolAssignment,
  matchStudent,
} from "./sis-import.matching";

function emptyIdentity(overrides = {}) {
  return {
    students: [],
    guardians: [],
    staff: [],
    studentGuardians: [],
    studentEnrollments: [],
    classEnrollments: [],
    staffSchoolAssignments: [],
    ...overrides,
  };
}

describe("matchStudent", () => {
  test("matches by existing ref", () => {
    const identity = emptyIdentity({ students: [{ id: "s1", ref: "stu-001", nisn: null, isActive: true }] });
    const r = matchStudent("stu-001", null, identity);
    expect(r.existingId).toBe("s1");
    expect(r.conflict).toBe(false);
  });

  test("falls back to org-scoped NISN when ref unknown", () => {
    const identity = emptyIdentity({ students: [{ id: "s1", ref: null, nisn: "1234567890", isActive: true }] });
    const r = matchStudent("stu-999", "1234567890", identity);
    expect(r.existingId).toBe("s1");
  });

  test("ref A and nisn B resolving to different students is a conflict", () => {
    const identity = emptyIdentity({
      students: [
        { id: "s1", ref: "stu-001", nisn: null, isActive: true },
        { id: "s2", ref: null, nisn: "1234567890", isActive: true },
      ],
    });
    const r = matchStudent("stu-001", "1234567890", identity);
    expect(r.conflict).toBe(true);
    expect(r.conflictCode).toBe("B10_STUDENT_IDENTITY_CONFLICT");
  });

  test("blank nisn + unknown ref -> no match (create)", () => {
    const r = matchStudent("stu-999", null, emptyIdentity());
    expect(r.existingId).toBeNull();
    expect(r.conflict).toBe(false);
  });
});

describe("matchGuardian", () => {
  test("matches by guardian_ref only", () => {
    const identity = emptyIdentity({ guardians: [{ id: "g1", ref: "gua-001", isActive: true }] });
    expect(matchGuardian("gua-001", identity).existingId).toBe("g1");
  });

  test("unknown ref -> create, even if a same-phone guardian exists elsewhere", () => {
    // Phone is intentionally not part of the matching interface at all.
    const identity = emptyIdentity({ guardians: [{ id: "g1", ref: "gua-001", isActive: true }] });
    const r = matchGuardian("gua-999", identity);
    expect(r.existingId).toBeNull();
  });
});

describe("matchStaff", () => {
  test("matches by staff_ref", () => {
    const identity = emptyIdentity({ staff: [{ id: "t1", ref: "stf-001", employeeNumber: null, isActive: true }] });
    expect(matchStaff("stf-001", null, identity).existingId).toBe("t1");
  });

  test("falls back to selected-school employee_number", () => {
    const identity = emptyIdentity({ staff: [{ id: "t1", ref: null, employeeNumber: "EMP-1", isActive: true }] });
    expect(matchStaff("stf-999", "EMP-1", identity).existingId).toBe("t1");
  });

  test("ref/employee disagreement is a conflict", () => {
    const identity = emptyIdentity({
      staff: [
        { id: "t1", ref: "stf-001", employeeNumber: null, isActive: true },
        { id: "t2", ref: null, employeeNumber: "EMP-1", isActive: true },
      ],
    });
    const r = matchStaff("stf-001", "EMP-1", identity);
    expect(r.conflict).toBe(true);
    expect(r.conflictCode).toBe("B10_STAFF_IDENTITY_CONFLICT");
  });
});

describe("matchClassEnrollment", () => {
  test("same temporal key -> update candidate", () => {
    const identity = emptyIdentity({
      classEnrollments: [
        { id: "c1", studentEnrollmentId: "se1", classroomId: "cls1", startsOn: "2026-01-01", endsOn: null, isPrimary: true, isActive: true },
      ],
    });
    const r = matchClassEnrollment("se1", "cls1", "2026-01-01", null, true, identity);
    expect(r.existingId).toBe("c1");
    expect(r.overlap).toBe(false);
  });

  test("non-overlapping later starts_on -> create, not overlap", () => {
    const identity = emptyIdentity({
      classEnrollments: [
        { id: "c1", studentEnrollmentId: "se1", classroomId: "cls1", startsOn: "2026-01-01", endsOn: "2026-06-30", isPrimary: true, isActive: true },
      ],
    });
    const r = matchClassEnrollment("se1", "cls1", "2026-07-01", null, true, identity);
    expect(r.existingId).toBeNull();
    expect(r.overlap).toBe(false);
  });

  test("overlapping primary-active interval -> overlap error", () => {
    const identity = emptyIdentity({
      classEnrollments: [
        { id: "c1", studentEnrollmentId: "se1", classroomId: "cls1", startsOn: "2026-01-01", endsOn: "2026-06-30", isPrimary: true, isActive: true },
      ],
    });
    const r = matchClassEnrollment("se1", "cls1", "2026-05-01", null, true, identity);
    expect(r.overlap).toBe(true);
  });
});

describe("matchStaffSchoolAssignment", () => {
  test("matches existing by school+employee_number", () => {
    const identity = emptyIdentity({
      staffSchoolAssignments: [{ id: "a1", staffId: "t1", schoolId: "sch1", employeeNumber: "EMP-1", isActive: true }],
    });
    const r = matchStaffSchoolAssignment("t1", "sch1", "EMP-1", identity);
    expect(r.existingId).toBe("a1");
  });

  test("second active assignment for same staff+school without matching employee_number is flagged duplicate", () => {
    const identity = emptyIdentity({
      staffSchoolAssignments: [{ id: "a1", staffId: "t1", schoolId: "sch1", employeeNumber: "EMP-OLD", isActive: true }],
    });
    const r = matchStaffSchoolAssignment("t1", "sch1", "EMP-NEW", identity);
    expect(r.existingId).toBeNull();
    expect(r.duplicateActive).toBe(true);
  });

  test("staff_ref Staff A plus employee_number Staff B remains a blocking identity conflict", () => {
    const identity = emptyIdentity({
      staffSchoolAssignments: [
        { id: "a2", staffId: "t2", schoolId: "sch1", employeeNumber: "EMP-1", isActive: true },
      ],
    });
    const r = matchStaffSchoolAssignment("t1", "sch1", "EMP-1", identity);
    expect(r.existingId).toBeNull();
    expect(r.identityConflict).toBe(true);
  });
});
