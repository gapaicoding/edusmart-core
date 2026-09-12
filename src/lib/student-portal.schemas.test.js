import { describe, expect, test } from "bun:test";
import {
  createStudentPortalInvitationInput,
  studentPortalAttendanceInput,
  studentPortalContextInput,
  studentPortalReportCardInput,
  studentReportCardDocumentInput,
} from "./student-portal.schemas.ts";

const ORG = "11111111-1111-4111-8111-111111111111";
const SCHOOL = "22222222-2222-4222-8222-222222222222";
const STUDENT = "33333333-3333-4333-8333-333333333333";
const CARD = "44444444-4444-4444-8444-444444444444";

describe("Student Portal input schemas never accept a client studentId as authorization proof", () => {
  test("studentPortalContextInput accepts only organization/school filter context", () => {
    const parsed = studentPortalContextInput.parse({ organizationId: ORG, schoolId: SCHOOL });
    expect(parsed).toEqual({ organizationId: ORG, schoolId: SCHOOL });
    expect(parsed).not.toHaveProperty("studentId");
  });

  test("studentPortalAttendanceInput has no studentId field", () => {
    const parsed = studentPortalAttendanceInput.parse({
      organizationId: ORG,
      schoolId: SCHOOL,
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(parsed).not.toHaveProperty("studentId");
  });

  test("studentPortalReportCardInput takes reportCardId + organizationId only", () => {
    expect(studentPortalReportCardInput.parse({ organizationId: ORG, reportCardId: CARD })).toEqual(
      { organizationId: ORG, reportCardId: CARD },
    );
  });

  test("studentReportCardDocumentInput is strict: reportCardId only, no studentId", () => {
    expect(studentReportCardDocumentInput.parse({ reportCardId: CARD })).toEqual({
      reportCardId: CARD,
    });
    expect(() =>
      studentReportCardDocumentInput.parse({ reportCardId: CARD, studentId: STUDENT }),
    ).toThrow();
  });

  test("createStudentPortalInvitationInput requires an exact student, school, and email", () => {
    expect(
      createStudentPortalInvitationInput.parse({
        organizationId: ORG,
        schoolId: SCHOOL,
        studentId: STUDENT,
        email: "student@example.com",
      }),
    ).toMatchObject({ organizationId: ORG, schoolId: SCHOOL, studentId: STUDENT });

    expect(() =>
      createStudentPortalInvitationInput.parse({
        organizationId: ORG,
        schoolId: SCHOOL,
        email: "student@example.com",
      }),
    ).toThrow();

    expect(() =>
      createStudentPortalInvitationInput.parse({
        organizationId: ORG,
        schoolId: SCHOOL,
        studentId: STUDENT,
        email: "not-an-email",
      }),
    ).toThrow();
  });
});
