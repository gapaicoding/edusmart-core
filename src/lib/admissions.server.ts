import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

export type AdmissionsRpcClient = Pick<SupabaseClient<Database>, "rpc">;

const SAFE_ERRORS: Record<string, string> = {
  B18_ADMISSION_FORBIDDEN: "You do not have permission to manage this admission.",
  B18_ADMISSION_NOT_FOUND: "This admission record is unavailable.",
  B18_ADMISSION_INVALID_STATE: "This admission is not in a valid state for that action.",
  B18_ADMISSION_STALE_VERSION:
    "This admission changed in another session. Reload the latest status.",
  B18_ADMISSION_REQUEST_CONFLICT: "This request ID was already used with different details.",
  B18_ADMISSION_CYCLE_NOT_OPEN: "This admission cycle is not accepting submissions.",
  B18_ADMISSION_PERIOD_CLOSED: "The target academic year is closed and cannot accept this action.",
  B18_ADMISSION_POSSIBLE_DUPLICATE:
    "This applicant may already exist in the SIS and requires review.",
  B18_ADMISSION_ALREADY_CONVERTED: "This admission application has already been converted.",
  B18_ADMISSION_VALIDATION_FAILED: "Review the admission details and try again.",
};

export function admissionsRuntimeError(error: PostgrestError, label: string): Error {
  const match = Object.keys(SAFE_ERRORS).find((code) => error.message.includes(code));
  if (match) return new Error(SAFE_ERRORS[match]);
  if (error.code === "42501") return new Error(SAFE_ERRORS["B18_ADMISSION_FORBIDDEN"]);
  return new Error(`${label} could not be completed. Reload and try again.`);
}

export async function callAdmissionsRpc<T extends Json = Json>(
  supabase: AdmissionsRpcClient,
  name: string,
  args: Record<string, unknown>,
  label: string,
): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw admissionsRuntimeError(error, label);
  return data as T;
}

export async function submitPublicAdmissionApplication(
  supabase: AdmissionsRpcClient,
  input: { cycleId: string; requestId: string; payload: Record<string, unknown> },
) {
  return callAdmissionsRpc(
    supabase,
    "b18_submit_admission_application",
    {
      p_admission_cycle_id: input.cycleId,
      p_request_id: input.requestId,
      p_payload: input.payload,
    },
    "Admission submission",
  );
}

export async function getPublicAdmissionCycle(supabase: AdmissionsRpcClient, cycleId: string) {
  return callAdmissionsRpc(
    supabase,
    "b18_get_public_admission_cycle",
    { p_admission_cycle_id: cycleId },
    "Admission cycle",
  );
}
