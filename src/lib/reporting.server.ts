import type { PostgrestError } from "@supabase/supabase-js";

export const WORKING_REPORT_STATUSES = new Set(["draft", "submitted", "reviewed"]);
export const ALLOWED_REPORT_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  draft: new Set(["submitted", "archived"]),
  submitted: new Set(["reviewed", "draft"]),
  reviewed: new Set(["draft", "published"]),
  published: new Set(["revised"]),
  revised: new Set(),
  archived: new Set(),
};
export function canTransitionReportCard(from: string, to: string) {
  return ALLOWED_REPORT_TRANSITIONS[from]?.has(to) ?? false;
}
export type ScoreSource = {
  assessmentId: string;
  score: number | null;
  minScore: number;
  maxScore: number;
  published: boolean;
};
export function calculateSubjectSnapshot(sources: ScoreSource[]) {
  const inputs = sources
    .filter((x) => x.published && x.score !== null)
    .map((x) => {
      if (!(x.maxScore > x.minScore) || x.score! < x.minScore || x.score! > x.maxScore)
        throw new Error("Invalid score source range");
      return {
        assessmentId: x.assessmentId,
        normalizedPercent: ((x.score! - x.minScore) / (x.maxScore - x.minScore)) * 100,
      };
    });
  const result = inputs.length
    ? Math.round((inputs.reduce((s, x) => s + x.normalizedPercent, 0) / inputs.length) * 100) / 100
    : null;
  return {
    finalScore: result,
    predicate: null,
    sourceCalculation: {
      algorithm: "mean-normalized-percent-v1",
      assessmentIds: inputs.map((x) => x.assessmentId),
      inputs,
      sourceCount: inputs.length,
      result,
    },
  };
}
export function summarizeAttendance(statuses: string[]) {
  const counts: Record<string, number> = {
    present: 0,
    late: 0,
    excused: 0,
    sick: 0,
    absent: 0,
    other: 0,
  };
  for (const status of statuses)
    if (status in counts) counts[status] = (counts[status] ?? 0) + 1;
    else throw new Error("Invalid attendance status");
  return { finalizedSessionCount: statuses.length, counts };
}
export function assertExpectedUpdatedAt(actual: string, expected: string) {
  if (actual !== expected) throw new Error("This report card changed. Refresh and retry.");
}
export function canEditSnapshot(status: string) {
  return status === "draft";
}
export function canApplySubjectEdit(
  status: string,
  changed: ReadonlyArray<"narrative" | "finalScore" | "predicate" | "sourceCalculation">,
) {
  return status === "draft" && changed.every((field) => field === "narrative");
}
export function nextReportCardVersion(versions: number[]) {
  return (versions.length ? Math.max(...versions) : 0) + 1;
}
export function guardianCanReadPublishedReport(input: {
  reportStatus: string;
  guardianProfileId: string;
  actorProfileId: string;
  guardianStatus: string;
  relationshipStatus: string;
  canViewAcademic: boolean;
  relationshipStudentId: string;
  reportStudentId: string;
  relationshipOrganizationId: string;
  reportOrganizationId: string;
}) {
  return (
    input.reportStatus === "published" &&
    input.guardianProfileId === input.actorProfileId &&
    input.guardianStatus === "active" &&
    input.relationshipStatus === "active" &&
    input.canViewAcademic &&
    input.relationshipStudentId === input.reportStudentId &&
    input.relationshipOrganizationId === input.reportOrganizationId
  );
}
export function translateReportingError(error: PostgrestError, action: string) {
  const text = `${error.message} ${error.details ?? ""}`;
  if (/stale/i.test(text)) return "This report card changed. Refresh and retry.";
  if (error.code === "42501" || /permission/i.test(text))
    return "Your permission scope does not allow this report card action.";
  if (error.code === "23505") return "A working or published version already exists.";
  if (
    /versioned revision of the published|existing working reportcard is not draft|expected updated_at is required for regeneration/i.test(
      text,
    )
  )
    return "A working or published Report Card already exists for this student and term.";
  return `We couldn't ${action.toLowerCase()} right now.`;
}
