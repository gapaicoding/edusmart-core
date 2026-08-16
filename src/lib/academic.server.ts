import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Server-only helpers for Batch 1 Academic Setup.
 *
 * Every call here receives the caller-scoped Supabase client built from the
 * request bearer token, so `auth.uid()` is real and RLS stays authoritative.
 * No service-role credential is used anywhere in Academic Setup.
 */

type Db = SupabaseClient<any, "public", any>;

/**
 * Resolve the organization that owns a school.
 *
 * The read itself runs under RLS: if the caller has no access to the school,
 * no row comes back and the write is refused before it is attempted (the
 * database would refuse it anyway).
 */
export async function resolveOrganizationId(supabase: Db, schoolId: string): Promise<string> {
  const { data, error } = await supabase
    .from("schools")
    .select("id, organization_id")
    .eq("id", schoolId)
    .maybeSingle();

  if (error) throw new Error(translateDbError(error, "school"));
  if (!data) {
    throw new Error("You do not have access to this school, or it no longer exists.");
  }
  return data.organization_id as string;
}

const FRIENDLY_UNIQUE: Record<string, string> = {
  academic_years_school_code_key: "An academic year with this code already exists for this school.",
  terms_year_code_key: "A term with this code already exists in this academic year.",
  grade_levels_school_code_key: "A grade level with this code already exists for this school.",
  classrooms_school_year_code_key:
    "A classroom with this code already exists for this school and academic year.",
  subjects_school_code_key: "A subject with this code already exists for this school.",
  curricula_school_code_version_key:
    "A curriculum with this code and version already exists for this school.",
};

const FRIENDLY_CHECK: Record<string, string> = {
  academic_years_dates_check: "The academic year end date must not be before its start date.",
  terms_dates_check: "The term end date must not be before its start date.",
  classrooms_capacity_check: "Capacity must be a positive number, or left empty.",
  grade_levels_sequence_check: "Sequence must be greater than zero.",
  terms_sequence_check: "Sequence must be greater than zero.",
  grade_levels_education_stage_check: "That education stage is not supported.",
  calendar_date_range_check: "The event end date must not be before its start date.",
  calendar_datetime_range_check: "The event end time must not be before its start time.",
  calendar_time_shape_check: "Provide either all-day dates or a start time, not both.",
};

/**
 * Turn Postgres/PostgREST failures into readable form messages without
 * hiding the underlying cause from server logs.
 */
export function translateDbError(error: PostgrestError, subject: string): string {
  console.error(`[EduSmart academic] ${subject} query failed`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });

  const text = `${error.message} ${error.details ?? ""}`;

  for (const [constraint, friendly] of Object.entries(FRIENDLY_UNIQUE)) {
    if (text.includes(constraint)) return friendly;
  }
  for (const [constraint, friendly] of Object.entries(FRIENDLY_CHECK)) {
    if (text.includes(constraint)) return friendly;
  }

  // Trigger-raised domain rules (e.g. validate_term_within_year) surface as
  // plain exceptions — pass the database wording straight through.
  if (error.code === "P0001") return error.message;

  if (error.code === "42501" || error.code === "PGRST301") {
    return "Your current role is not allowed to perform this action (rejected by the database).";
  }
  if (error.code === "23505") return "That record already exists.";
  if (error.code === "23503") return "A related record referenced here does not exist or is not accessible.";
  if (error.code === "23514") return "The values submitted violate a database rule.";

  return `${subject}: ${error.message}`;
}

/**
 * Writes are refused when RLS silently filters the row out. PostgREST returns
 * zero rows in that case — never treat it as success.
 */
export function assertWriteApplied<T>(rows: T[] | null, action: string): T {
  const row = rows?.[0];
  if (!row) {
    throw new Error(
      `${action} was rejected by the database. Your role may not manage this record in the selected school.`,
    );
  }
  return row;
}

/**
 * B1-R01 — Academic Calendar events must stay inside their academic year.
 *
 * There is no database-level guard for this yet, so the authoritative check
 * runs here, on the server, under the caller's RLS-scoped client: the academic
 * year row is only readable when the caller may see that school.
 */
export async function assertEventWithinAcademicYear(
  supabase: Db,
  params: { schoolId: string; academicYearId: string; startsOn: string; endsOn: string | null },
): Promise<void> {
  const { data, error } = await supabase
    .from("academic_years")
    .select("name, starts_on, ends_on")
    .eq("id", params.academicYearId)
    .eq("school_id", params.schoolId)
    .maybeSingle();

  if (error) throw new Error(translateDbError(error, "Academic year"));
  if (!data) {
    throw new Error("The selected academic year does not exist in this school, or you cannot access it.");
  }

  const start = params.startsOn;
  const end = params.endsOn ?? params.startsOn;

  if (end < start) {
    throw new Error("The event end date must be on or after the start date.");
  }
  if (start < data.starts_on || end > data.ends_on) {
    throw new Error(
      `Event dates must be inside the selected academic year range (${data.starts_on} to ${data.ends_on}).`,
    );
  }
}
