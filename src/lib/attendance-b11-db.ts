import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

/** Runtime validation boundary over the canonical generated B11 schema. */
type Db = SupabaseClient<Database>;

export type B11RpcName =
  | "open_attendance_session"
  | "save_attendance_draft"
  | "submit_attendance_session"
  | "lock_attendance_session"
  | "correct_attendance_record"
  | "attendance_school_timezone"
  | "list_attendance_history"
  | "list_staff_student_attendance_history"
  | "list_attendance_corrections";

export type B11RpcArgs<N extends B11RpcName> = Database["public"]["Functions"][N]["Args"];

export async function callB11Rpc<N extends B11RpcName, T>(
  client: Db,
  name: N,
  args: B11RpcArgs<N>,
  schema: z.ZodType<T>,
): Promise<{ data: T | null; error: PostgrestError | null; shapeError: boolean }> {
  const result = await client.rpc(name, args);
  if (result.error) return { data: null, error: result.error, shapeError: false };
  const parsed = schema.safeParse(result.data);
  return parsed.success
    ? { data: parsed.data, error: null, shapeError: false }
    : { data: null, error: null, shapeError: true };
}

export async function readB11RosterSnapshot(
  client: Db,
  filters: { organizationId: string; schoolId: string; sessionId: string },
  schema: z.ZodType<Array<{ student_enrollment_id: string; student_id: string }>>,
) {
  const result = await client.from("attendance_session_roster_members")
    .select("student_enrollment_id, student_id")
    .eq("organization_id", filters.organizationId)
    .eq("school_id", filters.schoolId)
    .eq("attendance_session_id", filters.sessionId);
  if (result.error) return { data: null, error: result.error, shapeError: false };
  const parsed = schema.safeParse(result.data);
  return parsed.success
    ? { data: parsed.data, error: null, shapeError: false }
    : { data: null, error: null, shapeError: true };
}
