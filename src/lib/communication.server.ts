import type { Json, Database } from "@/integrations/supabase/types";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

type CommunicationRpcClient = Pick<SupabaseClient<Database>, "rpc">;

const SAFE_ERRORS: Record<string, string> = {
  B20_PERMISSION_DENIED: "You do not have permission to manage school communications.",
  B20_ANNOUNCEMENT_NOT_FOUND: "The announcement is unavailable.",
  B20_ANNOUNCEMENT_NOT_DRAFT: "Only draft announcements can be edited.",
  B20_ANNOUNCEMENT_ALREADY_PUBLISHED: "This announcement has already been published.",
  B20_INVALID_TARGET_SCOPE: "The selected audience scope is invalid.",
  B20_FOREIGN_CLASSROOM: "The selected classroom is not in the active school.",
  B20_INVALID_AUDIENCE: "The selected audience is invalid.",
  B20_NO_AUDIENCE: "Select at least one audience.",
  B20_NO_ELIGIBLE_RECIPIENTS: "No eligible recipients were found for this audience.",
  B20_STALE_VERSION: "This announcement changed in another session. Reload and try again.",
  B20_IDEMPOTENCY_CONFLICT: "This request ID was already used for another action.",
};

export function communicationRuntimeError(error: PostgrestError, label: string): Error {
  const match = Object.keys(SAFE_ERRORS).find((code) => error.message.includes(code));
  if (match) return new Error(SAFE_ERRORS[match]);
  if (error.code === "42501") return new Error(SAFE_ERRORS["B20_PERMISSION_DENIED"]);
  return new Error(`${label} could not be completed. Reload and try again.`);
}

export async function callCommunicationRpc<T extends Json = Json>(
  supabase: CommunicationRpcClient,
  name: string,
  args: Record<string, unknown>,
  label: string,
): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw communicationRuntimeError(error, label);
  return data as T;
}
