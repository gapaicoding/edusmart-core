const SAFE_FILENAME = /[^a-zA-Z0-9._-]+/g;

export function downloadBinaryResponse(response: Response, fallbackFilename: string) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const supplied = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const filename = (supplied ?? fallbackFilename).replace(SAFE_FILENAME, "-").slice(0, 160);
  return response.blob().then((blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename || fallbackFilename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  });
}

export function sisErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.match(/B10_[A-Z0-9_]+/)?.[0] ?? "B10_IMPORT_COMMIT_FAILED";
}

const SIS_ERROR_MESSAGES: Record<string, string> = {
  B10_AUTHORIZATION_DENIED: "You are not authorized for this school workflow.",
  B10_FILE_INVALID: "Choose a valid .xlsx file created from the latest template.",
  B10_FILE_TOO_LARGE: "The workbook is larger than the 10 MB limit.",
  B10_FILE_CORRUPT_OR_UNSAFE: "The workbook is corrupt or failed the safety checks.",
  B10_JOB_NOT_FOUND: "This import job was not found or is outside your access.",
  B10_JOB_STATE_CONFLICT: "The import state changed. Refresh before continuing.",
  B10_IMPORT_HAS_ERRORS: "Resolve every blocking workbook error before confirming.",
  B10_CONFIRMATION_TOKEN_INVALID: "Confirmation authorization expired. Revalidate the workbook.",
  B10_STALE_PREVIEW: "School data changed after validation. Revalidate before confirming.",
  B10_EXTERNAL_REF_CONFLICT: "A durable reference changed after validation. Revalidate first.",
  B10_CLASS_ENROLLMENT_OVERLAP: "A class placement now overlaps another placement. Revalidate first.",
  B10_AY_GRADE_MISMATCH: "Academic year, grade, or classroom data changed. Revalidate first.",
  B10_EXPORT_REFERENCES_NOT_READY: "Prepare durable references before exporting.",
  B10_IMPORT_COMMIT_FAILED: "The operation could not be completed safely.",
};

export function sisErrorMessage(error: unknown) {
  const code = sisErrorCode(error);
  return `${SIS_ERROR_MESSAGES[code] ?? SIS_ERROR_MESSAGES["B10_IMPORT_COMMIT_FAILED"]} (${code})`;
}
