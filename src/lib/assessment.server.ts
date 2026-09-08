import type { PostgrestError } from "@supabase/supabase-js";

const FRIENDLY: Array<[string, string]> = [
  [
    "outside the selected academic context",
    "The selected assignment, year, or term does not match.",
  ],
  ["active TeachingAssignment", "Choose an active teaching assignment."],
  ["date must fall within", "The assessment date must fall inside the selected term."],
  [
    "outside the dated assessment roster",
    "That student is not eligible for this assessment roster.",
  ],
  ["outside the Assessment score range", "The score is outside this assessment's allowed range."],
  ["status and value are inconsistent", "The result status and score do not match."],
  ["lifecycle transition is forbidden", "That assessment lifecycle change is not allowed."],
  ["context is immutable", "Assessment context cannot be changed after it is opened."],
];

export function translateAssessmentError(error: PostgrestError, subject: string) {
  console.error(`[EduSmart Assessment] ${subject} failed`, {
    code: error.code,
    message: error.message,
    details: error.details,
  });
  const text = `${error.message} ${error.details ?? ""}`;
  for (const [fragment, message] of FRIENDLY) if (text.includes(fragment)) return message;
  if (error.code === "23505") return "A result already exists for this student and assessment.";
  if (error.code === "42501") return "Your permission scope does not allow this assessment action.";
  if (error.code === "23503" || error.code === "23514")
    return "The assessment conflicts with its academic context or scoring rules.";
  if (error.code === "PGRST301" || /jwt/i.test(error.message))
    return "Your session expired. Sign in again and retry.";
  return `We couldn't complete ${subject.toLowerCase()}.`;
}
