import { describe, expect, test } from "bun:test";
import {
  calculateSubjectSnapshot,
  summarizeAttendance,
  canTransitionReportCard,
  assertExpectedUpdatedAt,
  WORKING_REPORT_STATUSES,
  canEditSnapshot,
  canApplySubjectEdit,
  nextReportCardVersion,
  guardianCanReadPublishedReport,
} from "./reporting.server.ts";

describe("reporting snapshot rules", () => {
  test("normalizes and averages multiple published assessments with provenance", () => {
    const r = calculateSubjectSnapshot([
      { assessmentId: "a", score: 80, minScore: 0, maxScore: 100, published: true },
      { assessmentId: "b", score: 15, minScore: 10, maxScore: 20, published: true },
      { assessmentId: "draft", score: 100, minScore: 0, maxScore: 100, published: false },
    ]);
    expect(r.finalScore).toBe(65);
    expect(r.sourceCalculation.sourceCount).toBe(2);
    expect(r.sourceCalculation.assessmentIds).toEqual(["a", "b"]);
  });
  test("zero usable scores produces null", () =>
    expect(
      calculateSubjectSnapshot([
        { assessmentId: "a", score: null, minScore: 0, maxScore: 100, published: true },
      ]).finalScore,
    ).toBeNull());
  test("rejects invalid score ranges rather than clamping", () =>
    expect(() =>
      calculateSubjectSnapshot([
        { assessmentId: "a", score: 110, minScore: 0, maxScore: 100, published: true },
      ]),
    ).toThrow());
  test("summarizes only canonical attendance outcomes", () =>
    expect(summarizeAttendance(["present", "late", "present"])).toEqual({
      finalizedSessionCount: 3,
      counts: { present: 2, late: 1, excused: 0, sick: 0, absent: 0, other: 0 },
    }));
});
describe("reporting workflow model", () => {
  test("allows only deterministic normal transitions", () => {
    expect(canTransitionReportCard("draft", "submitted")).toBeTrue();
    expect(canTransitionReportCard("submitted", "reviewed")).toBeTrue();
    expect(canTransitionReportCard("reviewed", "published")).toBeTrue();
    expect(canTransitionReportCard("draft", "published")).toBeFalse();
    expect(canTransitionReportCard("published", "draft")).toBeFalse();
  });
  test("working set excludes immutable history", () => {
    expect([...WORKING_REPORT_STATUSES]).toEqual(["draft", "submitted", "reviewed"]);
  });
  test("stale expected timestamp is rejected", () =>
    expect(() => assertExpectedUpdatedAt("new", "old")).toThrow("Refresh"));
  test("non-draft snapshots and generated subject fields are immutable", () => {
    expect(canEditSnapshot("draft")).toBe(true);
    expect(canEditSnapshot("submitted")).toBe(false);
    expect(canApplySubjectEdit("draft", ["narrative"])).toBe(true);
    expect(canApplySubjectEdit("draft", ["narrative", "finalScore"])).toBe(false);
    expect(canApplySubjectEdit("submitted", ["narrative"])).toBe(false);
  });
  test("revision increments the maximum historical version", () => {
    expect(nextReportCardVersion([1, 3, 2])).toBe(4);
  });
  test("guardian access requires exact active academic relationship", () => {
    const access = {
      reportStatus: "published",
      guardianProfileId: "guardian-profile",
      actorProfileId: "guardian-profile",
      guardianStatus: "active",
      relationshipStatus: "active",
      canViewAcademic: true,
      relationshipStudentId: "student-a",
      reportStudentId: "student-a",
      relationshipOrganizationId: "org-a",
      reportOrganizationId: "org-a",
    };
    expect(guardianCanReadPublishedReport(access)).toBe(true);
    expect(guardianCanReadPublishedReport({ ...access, reportStudentId: "student-b" })).toBe(false);
    expect(guardianCanReadPublishedReport({ ...access, canViewAcademic: false })).toBe(false);
    expect(guardianCanReadPublishedReport({ ...access, reportStatus: "draft" })).toBe(false);
  });
});
