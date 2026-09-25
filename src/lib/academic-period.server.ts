import type { PostgrestError } from "@supabase/supabase-js";

const SAFE_ERRORS: Record<string, string> = {
  B17_AUTH_REQUIRED: "Sign in again to continue.",
  B17_FORBIDDEN: "You do not have permission to manage this academic period.",
  B17_PERIOD_NOT_FOUND: "This academic period is unavailable in the selected school.",
  B17_INVALID_TRANSITION: "This academic period cannot make that lifecycle transition.",
  B17_STALE_PERIOD: "This period changed in another session. Reload the latest status.",
  B17_PERIOD_BLOCKED: "This period still has closure blockers. Refresh readiness and review them.",
  B17_TERM_CLOSED: "This term is closed. Normal academic changes are locked.",
  B17_ACADEMIC_YEAR_CLOSED: "This academic year is closed. Normal academic changes are locked.",
  B17_PERIOD_CLOSED: "This academic period is closed and cannot be edited.",
  B17_REOPEN_REASON_REQUIRED: "Enter a reason of at least 3 characters to reopen this period.",
  B17_REQUEST_CONFLICT: "This action request was already used with different details.",
  B17_INVALID_REQUEST: "Review the period action details and try again.",
};

export function academicPeriodRuntimeError(error: PostgrestError, label: string): Error {
  const match = Object.keys(SAFE_ERRORS).find((code) => error.message.includes(code));
  if (match) return new Error(SAFE_ERRORS[match]);
  if (error.code === "42501")
    return new Error("You do not have permission to manage this academic period.");
  if (error.code === "40001")
    return new Error("This period changed in another session. Reload the latest status.");
  return new Error(`${label} could not be completed. Reload the page and try again.`);
}
