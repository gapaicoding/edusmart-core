import type { PostgrestError } from "@supabase/supabase-js";

export type ReportCardRuntimeErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "SCOPE_MISMATCH"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "STALE_VERSION"
  | "REQUEST_CONFLICT"
  | "INVALID_CONTENT"
  | "SNAPSHOT_INVALID"
  | "PUBLISHED_IMMUTABLE"
  | "REVISION_REASON_REQUIRED"
  | "REVISION_FORBIDDEN"
  | "REVISION_SOURCE_INVALID"
  | "UNKNOWN_SAFE_FAILURE";

const codes: Array<[string, ReportCardRuntimeErrorCode]> = [
  ["B16_REPORT_CARD_AUTH_REQUIRED", "UNAUTHENTICATED"],
  ["B16_REPORT_CARD_FORBIDDEN", "FORBIDDEN"],
  ["B16_REPORT_CARD_SCOPE_MISMATCH", "SCOPE_MISMATCH"],
  ["B16_REPORT_CARD_NOT_FOUND", "NOT_FOUND"],
  ["B16_REPORT_CARD_INVALID_STATE", "INVALID_STATE"],
  ["B16_REPORT_CARD_STALE_VERSION", "STALE_VERSION"],
  ["B16_REPORT_CARD_REQUEST_CONFLICT", "REQUEST_CONFLICT"],
  ["B16_REPORT_CARD_INVALID_CONTENT", "INVALID_CONTENT"],
  ["B16_REPORT_CARD_SNAPSHOT_INVALID", "SNAPSHOT_INVALID"],
  ["B16_REPORT_CARD_PUBLISHED_IMMUTABLE", "PUBLISHED_IMMUTABLE"],
  ["B16_REPORT_CARD_REVISION_REASON_REQUIRED", "REVISION_REASON_REQUIRED"],
  ["B16_REPORT_CARD_REVISION_FORBIDDEN", "REVISION_FORBIDDEN"],
  ["B16_REPORT_CARD_REVISION_SOURCE_INVALID", "REVISION_SOURCE_INVALID"],
];

export class ReportCardRuntimeError extends Error {
  constructor(
    readonly code: ReportCardRuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReportCardRuntimeError";
  }
}

export function reportCardRuntimeError(error: PostgrestError, subject: string) {
  const text = `${error.message} ${error.details ?? ""}`;
  const code =
    codes.find(([token]) => text.includes(token))?.[1] ??
    (error.code === "42501" ? "FORBIDDEN" : "UNKNOWN_SAFE_FAILURE");
  const message =
    code === "STALE_VERSION"
      ? "This report card changed. Reload the latest data and retry."
      : code === "REQUEST_CONFLICT"
        ? "This request identifier was already used for different report-card data."
        : code === "UNAUTHENTICATED"
          ? "Your session expired. Sign in again and retry."
          : `We couldn't complete ${subject.toLowerCase()}.`;
  return new ReportCardRuntimeError(code, message);
}
