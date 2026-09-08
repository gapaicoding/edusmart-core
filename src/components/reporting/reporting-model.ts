export const REPORT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  reviewed: "Reviewed",
  published: "Published",
  revised: "Revised / Historical",
  archived: "Archived",
};

export type ReportAction =
  "save" | "regenerate" | "submit" | "archive" | "review" | "return" | "publish" | "revision";

const ACTION_PERMISSIONS: Record<ReportAction, string> = {
  save: "report_card.edit_narrative",
  regenerate: "report_card.generate",
  submit: "report_card.submit",
  archive: "report_card.generate",
  review: "report_card.review",
  return: "report_card.review",
  publish: "report_card.publish",
  revision: "report_card.revise_published",
};

const STATUS_ACTIONS: Record<string, ReportAction[]> = {
  draft: ["save", "regenerate", "submit", "archive"],
  submitted: ["review", "return"],
  reviewed: ["publish", "return"],
  published: ["revision"],
  revised: [],
  archived: [],
};

export function reportActions(status: string, permissions: readonly string[]) {
  return (STATUS_ACTIONS[status] ?? []).filter((action) =>
    permissions.includes(ACTION_PERMISSIONS[action]),
  );
}

export function canGenerateReportCard(permissions: readonly string[]) {
  return permissions.includes("report_card.generate");
}

export function eligibleTermsForEnrollment<T extends { id: string; academicYearId: string }>(
  terms: readonly T[],
  enrollmentAcademicYearId: string | null | undefined,
) {
  if (!enrollmentAcademicYearId) return [] as T[];
  return terms.filter((t) => t.academicYearId === enrollmentAcademicYearId);
}

export function displaySnapshotScore(score: number | null) {
  return score === null ? "No published result" : String(score);
}

export function orderReportHistory<T extends { version: number }>(rows: readonly T[]) {
  return [...rows].sort((a, b) => b.version - a.version);
}

export function formatReportingMutationError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/changed|stale|refresh/i.test(message))
    return "This report card changed in another session. Reload the latest version before continuing.";
  return message || "We couldn't complete that report card action right now.";
}

export function safeAttendance(value: unknown) {
  const blank = {
    finalizedSessionCount: 0,
    counts: { present: 0, late: 0, excused: 0, sick: 0, absent: 0, other: 0 },
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return blank;
  const source = value as Record<string, unknown>;
  const counts =
    source["counts"] && typeof source["counts"] === "object" && !Array.isArray(source["counts"])
      ? (source["counts"] as Record<string, unknown>)
      : {};
  const number = (key: string) => (typeof counts[key] === "number" ? (counts[key] as number) : 0);
  return {
    finalizedSessionCount:
      typeof source["finalizedSessionCount"] === "number" ? source["finalizedSessionCount"] : 0,
    counts: {
      present: number("present"),
      late: number("late"),
      excused: number("excused"),
      sick: number("sick"),
      absent: number("absent"),
      other: number("other"),
    },
  };
}
