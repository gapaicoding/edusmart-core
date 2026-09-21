import type { PostgrestError } from "@supabase/supabase-js";

export type B14ProgressionErrorCode =
  | "B14_PROGRESSION_UNAUTHENTICATED"
  | "B14_PROGRESSION_FORBIDDEN"
  | "B14_PROGRESSION_SCHOOL_SCOPE_INVALID"
  | "B14_PROGRESSION_ACADEMIC_YEAR_INVALID"
  | "B14_PROGRESSION_BATCH_NOT_FOUND"
  | "B14_PROGRESSION_BATCH_STATUS_INVALID"
  | "B14_PROGRESSION_DECISION_NOT_FOUND"
  | "B14_PROGRESSION_SOURCE_ENROLLMENT_INVALID"
  | "B14_PROGRESSION_TARGET_CONTEXT_INVALID"
  | "B14_PROGRESSION_READINESS_EXCEPTION_REQUIRED"
  | "B14_PROGRESSION_STALE_VERSION"
  | "B14_PROGRESSION_REQUEST_CONFLICT"
  | "B14_PROGRESSION_DUPLICATE_ACTIVE_BATCH"
  | "B14_PROGRESSION_UNRESOLVED_DECISIONS"
  | "B14_PROGRESSION_BATCH_NOT_APPROVED"
  | "B14_PROGRESSION_APPLY_CONFLICT"
  | "B14_PROGRESSION_ALREADY_APPLIED";

const messages: Record<B14ProgressionErrorCode, string> = {
  B14_PROGRESSION_UNAUTHENTICATED: "Sign in is required.",
  B14_PROGRESSION_FORBIDDEN: "You are not authorized for this progression operation.",
  B14_PROGRESSION_SCHOOL_SCOPE_INVALID: "The selected school is not available.",
  B14_PROGRESSION_ACADEMIC_YEAR_INVALID: "The academic-year pair is not a valid progression range.",
  B14_PROGRESSION_BATCH_NOT_FOUND: "The progression batch was not found.",
  B14_PROGRESSION_BATCH_STATUS_INVALID:
    "The progression batch is not in a state for this operation.",
  B14_PROGRESSION_DECISION_NOT_FOUND: "The progression candidate was not found.",
  B14_PROGRESSION_SOURCE_ENROLLMENT_INVALID: "The source enrollment is not valid for this batch.",
  B14_PROGRESSION_TARGET_CONTEXT_INVALID: "The selected target grade or classroom is not valid.",
  B14_PROGRESSION_READINESS_EXCEPTION_REQUIRED:
    "Record an exception reason before proceeding with readiness warnings.",
  B14_PROGRESSION_STALE_VERSION: "This record changed elsewhere. Reload before saving.",
  B14_PROGRESSION_REQUEST_CONFLICT:
    "This request ID was already used with different data or is still processing.",
  B14_PROGRESSION_DUPLICATE_ACTIVE_BATCH:
    "An active progression batch already exists for this year pair.",
  B14_PROGRESSION_UNRESOLVED_DECISIONS: "Complete every progression candidate before submission.",
  B14_PROGRESSION_BATCH_NOT_APPROVED: "Only an approved batch can be applied.",
  B14_PROGRESSION_APPLY_CONFLICT:
    "The annual rollover conflicts with an existing target enrollment.",
  B14_PROGRESSION_ALREADY_APPLIED: "This progression batch has already been applied.",
};

export class B14ProgressionError extends Error {
  readonly code: B14ProgressionErrorCode | "UNKNOWN_SAFE_FAILURE";
  constructor(code: B14ProgressionErrorCode | "UNKNOWN_SAFE_FAILURE", message: string) {
    super(message);
    this.name = "B14ProgressionError";
    this.code = code;
  }
}

export function translateB14ProgressionError(
  error: PostgrestError,
  subject: string,
): B14ProgressionError {
  const code = error.message.match(/B14_PROGRESSION_[A-Z_]+/)?.[0] as
    B14ProgressionErrorCode | undefined;
  return new B14ProgressionError(
    code ?? "UNKNOWN_SAFE_FAILURE",
    code ? messages[code] : `${subject} could not be completed.`,
  );
}

export type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: PostgrestError | null }>;
};

export type ProgressionJson =
  string | number | boolean | null | ProgressionJson[] | { [key: string]: ProgressionJson };

export async function callProgressionRpc<T extends ProgressionJson>(
  client: RpcClient,
  name: string,
  args: Record<string, unknown>,
  subject: string,
): Promise<T> {
  const result = await client.rpc(name, args);
  if (result.error) throw translateB14ProgressionError(result.error, subject);
  return result.data as T;
}
