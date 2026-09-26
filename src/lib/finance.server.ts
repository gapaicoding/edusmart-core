import type { Json, Database } from "@/integrations/supabase/types";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

export type FinanceRpcClient = Pick<SupabaseClient<Database>, "rpc">;

const SAFE_ERRORS: Record<string, string> = {
  B19_FINANCE_FORBIDDEN: "You do not have permission to perform this Finance action.",
  B19_FINANCE_NOT_FOUND: "The Finance record is unavailable.",
  B19_FINANCE_STALE: "This Finance record changed in another session. Reload and try again.",
  B19_FINANCE_REQUEST_CONFLICT: "This request ID was already used with different details.",
  B19_FINANCE_INVALID_STATE: "The Finance record is not in a valid state for this action.",
  B19_FINANCE_INVALID_ENROLLMENT: "The student enrollment is not valid for this Finance action.",
  B19_FINANCE_CLOSED_PERIOD: "The academic period is closed for new Finance obligations.",
  B19_FINANCE_OVER_ALLOCATION: "The payment exceeds the invoice outstanding balance.",
  B19_FINANCE_ALREADY_REVERSED: "This payment has already been reversed.",
};

export function financeRuntimeError(error: PostgrestError, label: string): Error {
  const match = Object.keys(SAFE_ERRORS).find((code) => error.message.includes(code));
  if (match) return new Error(SAFE_ERRORS[match]);
  if (error.code === "42501") return new Error(SAFE_ERRORS["B19_FINANCE_FORBIDDEN"]);
  return new Error(`${label} could not be completed. Reload and try again.`);
}

export async function callFinanceRpc<T extends Json = Json>(
  supabase: FinanceRpcClient,
  name: string,
  args: Record<string, unknown>,
  label: string,
): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw financeRuntimeError(error, label);
  return data as T;
}
