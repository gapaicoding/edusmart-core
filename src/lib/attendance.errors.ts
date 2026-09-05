type ValidationIssue = {
  message?: unknown;
  path?: unknown;
};

function validationIssues(message: string): ValidationIssue[] | null {
  try {
    const value: unknown = JSON.parse(message);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function attendanceErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "An unexpected attendance error occurred.";

  const issues = validationIssues(error.message);
  if (!issues) return error.message;

  const paths = issues.flatMap((issue) => (Array.isArray(issue.path) ? issue.path : []));
  if (paths.includes("manualReason")) return "Manual session reason must be at least 3 characters.";
  if (paths.includes("correctionReason")) return "Correction reason must be at least 3 characters.";
  if (paths.includes("expectedUpdatedAt"))
    return "Attendance data could not be updated. Refresh and try again.";

  const firstMessage = issues.find((issue) => typeof issue.message === "string")?.message;
  return typeof firstMessage === "string"
    ? firstMessage
    : "Check the attendance details and try again.";
}
