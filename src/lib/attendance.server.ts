import type { PostgrestError } from "@supabase/supabase-js";

export type AttendanceDomainErrorCode =
  | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "STALE_VERSION"
  | "INCOMPLETE_ROSTER" | "INVALID_ROSTER_MEMBER" | "NOTE_TOO_LONG"
  | "CALENDAR_ACK_REQUIRED" | "COLLISION_ACK_REQUIRED" | "LOGICAL_SESSION_CONFLICT"
  | "INVALID_TIMEZONE" | "INVALID_ACADEMIC_DATE" | "IDEMPOTENCY_CONFLICT"
  | "VALIDATION_ERROR" | "UNKNOWN_SAFE_FAILURE";

export class AttendanceDomainError extends Error {
  constructor(readonly code: AttendanceDomainErrorCode, message: string) {
    super(message);
    this.name = "AttendanceDomainError";
  }
}

const FRIENDLY_ERRORS: Array<[string, string]> = [
  ["B11_ATTENDANCE_AUTH_REQUIRED", "Your session expired. Sign in again and retry."],
  ["B11_ATTENDANCE_SCOPE_DENIED", "Your current permission scope does not allow this attendance action."],
  ["B11_ATTENDANCE_SCHOOL_UNAVAILABLE", "The selected school is unavailable."],
  ["B11_ATTENDANCE_CONTEXT_UNAVAILABLE", "The selected attendance context is unavailable."],
  ["B11_ATTENDANCE_STALE_SESSION", "This attendance session changed. Refresh and retry."],
  ["B11_ATTENDANCE_STALE_RECORD", "This attendance record changed. Refresh and retry."],
  ["B11_ATTENDANCE_ROSTER_INCOMPLETE", "Record an outcome for every roster member before submitting."],
  ["B11_ATTENDANCE_EMPTY_ROSTER", "An empty attendance roster cannot be submitted."],
  ["B11_ATTENDANCE_OUTSIDER_RECORD", "A supplied student is not a member of this attendance roster."],
  ["B11_ATTENDANCE_NOTE_TOO_LONG", "Attendance notes cannot exceed 500 characters."],
  ["B11_ATTENDANCE_CALENDAR_IMPACT_ACK_REQUIRED", "A calendar event affecting instruction overlaps this attendance session. Confirmation is required."],
  ["B11_ATTENDANCE_COLLISION_ACK_REQUIRED", "Another attendance session overlaps this classroom and date. Confirmation is required."],
  ["B11_ATTENDANCE_LOGICAL_SESSION_CONFLICT", "An attendance session already exists with incompatible details."],
  ["B11_ATTENDANCE_INVALID_SCHOOL_TIMEZONE", "The school's configured timezone is invalid."],
  ["B11_ATTENDANCE_ACADEMIC_DATE_OUT_OF_BOUNDS", "The attendance date is outside the selected academic year or term."],
  ["B11_ATTENDANCE_IDEMPOTENCY_CONFLICT", "This request identifier was already used for a different attendance action."],
  ["B11_ATTENDANCE_CORRECTION_REASON_REQUIRED", "A meaningful correction reason is required."],
  ["B11_ATTENDANCE_CORRECTION_NO_CHANGE", "The correction must change the attendance outcome or note."],
  [
    "Manual AttendanceSession requires a meaningful reason",
    "Explain why this attendance session is manual.",
  ],
  [
    "eligible published TimetableEntry",
    "That timetable entry is not eligible for attendance on this date.",
  ],
  ["dated classroom roster", "That student is not in this classroom roster for the session date."],
  [
    "Submitted attendance correction requires a reason",
    "A reason is required to correct submitted attendance.",
  ],
  [
    "Locked attendance correction requires a reason",
    "A reason is required to correct locked attendance.",
  ],
  [
    "AttendanceSession lifecycle transition is forbidden",
    "This attendance session can no longer make that lifecycle transition.",
  ],
];

export function translateAttendanceError(error: PostgrestError, subject: string): string {
  console.error(`[EduSmart Attendance] ${subject} query failed`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
  const text = `${error.message} ${error.details ?? ""}`;
  for (const [fragment, message] of FRIENDLY_ERRORS) if (text.includes(fragment)) return message;
  if (error.code === "23505")
    return "An attendance session or student record already exists for this context.";
  if (error.code === "42501")
    return "Your current permission scope does not allow this attendance action.";
  if (error.code === "PGRST301" || /jwt/i.test(error.message))
    return "Your session expired. Sign in again and retry.";
  if (error.code === "23503" || error.code === "23514")
    return "The attendance data conflicts with the selected school, class, date, or lifecycle state.";
  return `${subject} could not be completed. Refresh and try again.`;
}

const DOMAIN_CODES: Array<[string, AttendanceDomainErrorCode]> = [
  ["B11_ATTENDANCE_AUTH_REQUIRED", "UNAUTHENTICATED"],
  ["B11_ATTENDANCE_SCOPE_DENIED", "FORBIDDEN"],
  ["B11_ATTENDANCE_RECORD_UNAVAILABLE", "NOT_FOUND"],
  ["B11_ATTENDANCE_STALE_", "STALE_VERSION"],
  ["B11_ATTENDANCE_ROSTER_INCOMPLETE", "INCOMPLETE_ROSTER"],
  ["B11_ATTENDANCE_EMPTY_ROSTER", "INCOMPLETE_ROSTER"],
  ["B11_ATTENDANCE_OUTSIDER_RECORD", "INVALID_ROSTER_MEMBER"],
  ["B11_ATTENDANCE_NOTE_TOO_LONG", "NOTE_TOO_LONG"],
  ["B11_ATTENDANCE_CALENDAR_IMPACT_ACK_REQUIRED", "CALENDAR_ACK_REQUIRED"],
  ["B11_ATTENDANCE_COLLISION_ACK_REQUIRED", "COLLISION_ACK_REQUIRED"],
  ["B11_ATTENDANCE_LOGICAL_SESSION_CONFLICT", "LOGICAL_SESSION_CONFLICT"],
  ["B11_ATTENDANCE_INVALID_SCHOOL_TIMEZONE", "INVALID_TIMEZONE"],
  ["B11_ATTENDANCE_ACADEMIC_DATE_OUT_OF_BOUNDS", "INVALID_ACADEMIC_DATE"],
  ["B11_ATTENDANCE_IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_CONFLICT"],
];

export function attendanceCommandError(error: PostgrestError, subject: string): AttendanceDomainError {
  const text = `${error.message} ${error.details ?? ""}`;
  const code = DOMAIN_CODES.find(([token]) => text.includes(token))?.[1]
    ?? (error.code === "42501" ? "FORBIDDEN" : error.code === "22023" || error.code === "23514" ? "VALIDATION_ERROR" : "UNKNOWN_SAFE_FAILURE");
  return new AttendanceDomainError(code, translateAttendanceError(error, subject));
}

export function unexpectedAttendanceShape(subject: string): Error {
  console.error(`[EduSmart Attendance] ${subject} returned an unexpected database shape`);
  return new Error(`${subject} returned an unexpected response. Refresh and try again.`);
}
