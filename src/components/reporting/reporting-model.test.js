import { describe, expect, test } from "bun:test";
import {
  canGenerateReportCard,
  displaySnapshotScore,
  eligibleTermsForEnrollment,
  formatReportingMutationError,
  orderReportHistory,
  reportActions,
  safeAttendance,
} from "./reporting-model.ts";

describe("report card UI model", () => {
  test("maps lifecycle states to legal permission-backed actions", () => {
    const all = [
      "report_card.edit_narrative",
      "report_card.generate",
      "report_card.submit",
      "report_card.review",
      "report_card.publish",
      "report_card.revise_published",
    ];
    expect(reportActions("draft", all)).toEqual(["save", "regenerate", "submit", "archive"]);
    expect(reportActions("submitted", all)).toEqual(["review", "return"]);
    expect(reportActions("reviewed", all)).toEqual(["publish", "return"]);
    expect(reportActions("published", all)).toEqual(["revision"]);
    expect(reportActions("revised", all)).toEqual([]);
    expect(reportActions("draft", ["report_card.read"])).toEqual([]);
  });

  test("distinguishes a missing result from an actual zero", () => {
    expect(displaySnapshotScore(null)).toBe("No published result");
    expect(displaySnapshotScore(0)).toBe("0");
  });

  test("orders history newest version first without dropping revised rows", () => {
    expect(
      orderReportHistory([
        { version: 1, status: "revised" },
        { version: 3, status: "draft" },
        { version: 2, status: "published" },
      ]),
    ).toEqual([
      { version: 3, status: "draft" },
      { version: 2, status: "published" },
      { version: 1, status: "revised" },
    ]);
  });

  test("turns stale errors into a reload instruction", () => {
    expect(
      formatReportingMutationError(new Error("This report card changed. Refresh and retry.")),
    ).toContain("another session");
  });

  test("generation entry point is gated on report_card.generate permission", () => {
    expect(canGenerateReportCard(["report_card.generate"])).toBe(true);
    expect(canGenerateReportCard(["report_card.read"])).toBe(false);
    expect(canGenerateReportCard([])).toBe(false);
  });

  test("term picker exposes only terms in the enrollment's academic year", () => {
    const terms = [
      { id: "t1", academicYearId: "y1" },
      { id: "t2", academicYearId: "y1" },
      { id: "t3", academicYearId: "y2" },
    ];
    expect(eligibleTermsForEnrollment(terms, "y1").map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(eligibleTermsForEnrollment(terms, "y2").map((t) => t.id)).toEqual(["t3"]);
    expect(eligibleTermsForEnrollment(terms, null)).toEqual([]);
  });

  test("attendance view model exposes only canonical safe counts", () => {
    expect(
      safeAttendance({
        finalizedSessionCount: 2,
        counts: { present: 1, absent: 1 },
        staff_notes: "secret",
      }),
    ).toEqual({
      finalizedSessionCount: 2,
      counts: { present: 1, late: 0, excused: 0, sick: 0, absent: 1, other: 0 },
    });
  });
});
