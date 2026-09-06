import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Server-only helpers for Batch 7 Parent Portal.
 *
 * All Portal reads run through the caller-scoped supabase client (RLS is
 * authoritative). No service-role credential is used anywhere in the portal.
 */

export function translatePortalError(error: PostgrestError, subject: string): string {
  console.error(`[EduSmart Portal] ${subject} failed`, {
    code: error.code,
    message: error.message,
    details: error.details,
  });
  if (error.code === "42501") return "Your account does not have access to this information.";
  if (error.code === "PGRST301" || /jwt/i.test(error.message))
    return "Your session expired. Sign in again and retry.";
  if (error.code === "PGRST116") return `No ${subject.toLowerCase()} to display.`;
  return `We couldn't load ${subject.toLowerCase()} right now.`;
}
