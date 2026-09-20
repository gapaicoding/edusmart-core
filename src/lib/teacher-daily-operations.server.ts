import type { PostgrestError } from "@supabase/supabase-js";

export type B13ErrorCode =
  | "B13_TDO_AUTH_REQUIRED"
  | "B13_TDO_SCOPE_DENIED"
  | "B13_TDO_ASSIGNMENT_DENIED"
  | "B13_TDO_TIMETABLE_INVALID"
  | "B13_TDO_OCCURRENCE_INVALID"
  | "B13_TDO_DUPLICATE_JOURNAL"
  | "B13_TDO_NOT_FOUND"
  | "B13_TDO_STALE_VERSION"
  | "B13_TDO_INVALID_STATE"
  | "B13_TDO_MATERIAL_REQUIRED"
  | "B13_TDO_REQUEST_CONFLICT"
  | "B13_TDO_STAFF_ASSIGNMENT_INVALID"
  | "B13_TDO_ATTENDANCE_INVALID"
  | "B13_TDO_RESULT_SHAPE_INVALID";

export class B13DomainError extends Error {
  readonly code: B13ErrorCode | "UNKNOWN_SAFE_FAILURE";
  constructor(code: B13ErrorCode | "UNKNOWN_SAFE_FAILURE", message: string) {
    super(message);
    this.name = "B13DomainError";
    this.code = code;
  }
}

const messages: Record<B13ErrorCode, string> = {
  B13_TDO_AUTH_REQUIRED: "Sign in is required.",
  B13_TDO_SCOPE_DENIED: "You are not authorized for this school record.",
  B13_TDO_ASSIGNMENT_DENIED: "The teaching assignment does not authorize this operation.",
  B13_TDO_TIMETABLE_INVALID: "The timetable occurrence is not available.",
  B13_TDO_OCCURRENCE_INVALID: "The selected teaching occurrence is invalid.",
  B13_TDO_DUPLICATE_JOURNAL: "A journal already exists for this teaching occurrence.",
  B13_TDO_NOT_FOUND: "The requested record was not found.",
  B13_TDO_STALE_VERSION: "This record changed elsewhere. Reload before saving.",
  B13_TDO_INVALID_STATE: "This record is no longer editable.",
  B13_TDO_MATERIAL_REQUIRED: "Material taught is required before submission.",
  B13_TDO_REQUEST_CONFLICT: "This request was already used with different data.",
  B13_TDO_STAFF_ASSIGNMENT_INVALID: "The staff school assignment is not valid for this date.",
  B13_TDO_ATTENDANCE_INVALID: "The staff attendance data is invalid.",
  B13_TDO_RESULT_SHAPE_INVALID: "The server returned an invalid result.",
};

export function translateB13Error(error: PostgrestError, subject: string): B13DomainError {
  const code = error.message.match(/B13_TDO_[A-Z_]+/)?.[0] as B13ErrorCode | undefined;
  return new B13DomainError(
    code ?? "UNKNOWN_SAFE_FAILURE",
    code ? messages[code] : `${subject} could not be completed.`,
  );
}
