import type { PostgrestError } from "@supabase/supabase-js";

export type B12DomainErrorCode =
  | "REQUEST_NOT_FOUND"
  | "REQUEST_NOT_DRAFT"
  | "REQUEST_NOT_OPEN"
  | "REQUEST_CLOSED"
  | "REQUEST_CANCELLED"
  | "REQUEST_EXPIRED"
  | "NOT_RECIPIENT"
  | "PARENT_RELATION_REQUIRED"
  | "DECISION_NOT_ALLOWED"
  | "DECISION_OWNED_BY_OTHER_GUARDIAN"
  | "STALE_VERSION"
  | "IDEMPOTENCY_CONFLICT"
  | "PERMISSION_DENIED"
  | "INVALID_TARGET_SET"
  | "NO_ELIGIBLE_RECIPIENTS"
  | "NOTIFICATION_NOT_FOUND"
  | "UNKNOWN_SAFE_FAILURE";

export class B12DomainError extends Error {
  constructor(
    readonly code: B12DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "B12DomainError";
  }
}

const codes: Array<[string, B12DomainErrorCode, string]> = [
  ["B12_REQUEST_NOT_FOUND", "REQUEST_NOT_FOUND", "That permission request is unavailable."],
  ["B12_REQUEST_NOT_DRAFT", "REQUEST_NOT_DRAFT", "Only a draft permission request can be edited."],
  [
    "B12_REQUEST_NOT_OPEN",
    "REQUEST_NOT_OPEN",
    "That permission request is not open for this action.",
  ],
  ["B12_REQUEST_CLOSED", "REQUEST_CLOSED", "That permission request is closed."],
  ["B12_REQUEST_CANCELLED", "REQUEST_CANCELLED", "That permission request is cancelled."],
  ["B12_REQUEST_EXPIRED", "REQUEST_EXPIRED", "The permission request deadline has passed."],
  ["B12_NOT_RECIPIENT", "NOT_RECIPIENT", "You are not an eligible recipient for this request."],
  [
    "B12_PARENT_RELATION_REQUIRED",
    "PARENT_RELATION_REQUIRED",
    "An active permission relationship is required.",
  ],
  ["B12_DECISION_NOT_ALLOWED", "DECISION_NOT_ALLOWED", "This decision cannot be submitted."],
  [
    "B12_DECISION_OWNED_BY_OTHER_GUARDIAN",
    "DECISION_OWNED_BY_OTHER_GUARDIAN",
    "Another eligible Guardian owns this decision.",
  ],
  ["B12_STALE_VERSION", "STALE_VERSION", "This record changed. Refresh and try again."],
  [
    "B12_IDEMPOTENCY_CONFLICT",
    "IDEMPOTENCY_CONFLICT",
    "This request identifier was already used for a different action.",
  ],
  [
    "B12_PERMISSION_DENIED",
    "PERMISSION_DENIED",
    "Your current permission scope does not allow this action.",
  ],
  ["B12_INVALID_TARGET_SET", "INVALID_TARGET_SET", "The selected request targets are invalid."],
  [
    "B12_NO_ELIGIBLE_RECIPIENTS",
    "NO_ELIGIBLE_RECIPIENTS",
    "The request has no eligible recipients.",
  ],
  ["B12_NOTIFICATION_NOT_FOUND", "NOTIFICATION_NOT_FOUND", "That notification is unavailable."],
];

export function translateB12Error(error: PostgrestError, subject: string): B12DomainError {
  console.error(`[EduSmart B12] ${subject} failed`, { code: error.code, message: error.message });
  const text = `${error.message} ${error.details ?? ""}`;
  const match = codes.find(([token]) => text.includes(token));
  if (match) return new B12DomainError(match[1], match[2]);
  if (error.code === "42501")
    return new B12DomainError(
      "PERMISSION_DENIED",
      "Your current permission scope does not allow this action.",
    );
  if (error.code === "40001" || error.code === "23505")
    return new B12DomainError("STALE_VERSION", "This record changed. Refresh and try again.");
  return new B12DomainError(
    "UNKNOWN_SAFE_FAILURE",
    `${subject} could not be completed. Refresh and try again.`,
  );
}
