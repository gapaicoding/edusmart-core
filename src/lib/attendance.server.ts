import type { PostgrestError } from "@supabase/supabase-js";

const FRIENDLY_ERRORS: Array<[string, string]> = [
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
  return `${subject}: ${error.message}`;
}
