import type { PostgrestError } from "@supabase/supabase-js";

export type AssessmentGradebookErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "STALE_VERSION"
  | "REQUEST_CONFLICT"
  | "INVALID_ROSTER"
  | "SCORE_INVALID"
  | "PUBLISHED_IMMUTABLE"
  | "FINAL_IMMUTABLE"
  | "CORRECTION_REASON_REQUIRED"
  | "CORRECTION_FORBIDDEN"
  | "UNKNOWN_SAFE_FAILURE";

const CODES: Array<[string, AssessmentGradebookErrorCode]> = [
  ["B15_ASSESSMENT_AUTH_REQUIRED", "UNAUTHENTICATED"],
  ["B15_ASSESSMENT_FORBIDDEN", "FORBIDDEN"],
  ["B15_ASSESSMENT_NOT_FOUND", "NOT_FOUND"],
  ["B15_ASSESSMENT_INVALID_STATE", "INVALID_STATE"],
  ["B15_ASSESSMENT_STALE_VERSION", "STALE_VERSION"],
  ["B15_ASSESSMENT_REQUEST_CONFLICT", "REQUEST_CONFLICT"],
  ["B15_ASSESSMENT_INVALID_ROSTER", "INVALID_ROSTER"],
  ["B15_ASSESSMENT_SCORE_INVALID", "SCORE_INVALID"],
  ["B15_ASSESSMENT_PUBLISHED_IMMUTABLE", "PUBLISHED_IMMUTABLE"],
  ["B15_ASSESSMENT_FINAL_IMMUTABLE", "FINAL_IMMUTABLE"],
  ["B15_ASSESSMENT_CORRECTION_REASON_REQUIRED", "CORRECTION_REASON_REQUIRED"],
  ["B15_ASSESSMENT_CORRECTION_FORBIDDEN", "CORRECTION_FORBIDDEN"],
];

export class AssessmentGradebookDomainError extends Error {
  constructor(
    readonly code: AssessmentGradebookErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AssessmentGradebookDomainError";
  }
}

export function assessmentGradebookCommandError(
  error: PostgrestError,
  subject: string,
): AssessmentGradebookDomainError {
  const text = `${error.message} ${error.details ?? ""}`;
  const code =
    CODES.find(([token]) => text.includes(token))?.[1] ??
    (error.code === "42501" ? "FORBIDDEN" : "UNKNOWN_SAFE_FAILURE");
  return new AssessmentGradebookDomainError(
    code,
    code === "UNAUTHENTICATED"
      ? "Your session expired. Sign in again and retry."
      : code === "STALE_VERSION"
        ? "This assessment changed. Refresh and retry."
        : code === "REQUEST_CONFLICT"
          ? "This request identifier was already used for different assessment data."
          : `We couldn't complete ${subject.toLowerCase()}.`,
  );
}
