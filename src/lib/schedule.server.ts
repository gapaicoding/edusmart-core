import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { translateSisError } from "./sis.server";

type Db = SupabaseClient<Database>;

const FRIENDLY_ERRORS: Array<[string, string]> = [
  ["Teacher has an overlapping published timetable entry", "This teacher already has a published class in that period and date range."],
  ["Classroom has an overlapping published timetable entry", "This classroom already has a published class in that period and date range."],
  ["TeachingAssignment already has an overlapping published timetable entry", "This teaching assignment already has a published entry in that period and date range."],
  ["Missing schedule.publish permission", "Your current permission scope does not allow publishing this schedule entry."],
  ["Missing schedule.archive permission", "Your current permission scope does not allow archiving this schedule entry."],
  ["TimetableEntry stale row version", "This entry changed after you opened it. Refresh the schedule and try again."],
  ["TimetableEntry is no longer published and replaceable", "This published entry has already changed. Refresh the schedule and try again."],
  ["TimetableEntry TeachingAssignment must be active for publication", "Only an active teaching assignment can be used for a new publication or material rewrite."],
  ["Published or inactive TimetableEntry history cannot be deleted", "Published schedule history cannot be deleted."],
  ["Inactive TimetableEntry history cannot be updated", "Archived schedule history is read-only."],
  ["Published TimetableEntry cannot return to draft", "A published entry cannot return to draft. Replace or archive it instead."],
  ["TimetableEntry AcademicYear mismatch", "The entry and teaching assignment must use the same academic year."],
  ["TimetableEntry Term mismatch", "The entry and teaching assignment must use the same term."],
  ["TimetableEntry TimetablePeriod mismatch", "The selected period belongs to a different school or academic year."],
  ["TimetableEntry effective range", "The effective dates are outside the selected academic year, term, or teaching assignment."],
  ["TimetableEntry replacement", "The published entry could not be replaced with those values."],
];

const CONSTRAINT_ERRORS: Record<string, string> = {
  timetable_entries_dates_check: "The effective end date must be on or after the start date.",
  timetable_entries_time_check: "The timetable period must end after it starts.",
  timetable_entries_status_check: "That schedule lifecycle state is not supported.",
  timetable_entries_weekday_check: "Choose a valid weekday.",
  timetable_entries_period_fk: "That timetable period is not available in this academic context.",
  timetable_entries_assignment_fk: "That teaching assignment is not available in this school.",
  timetable_entries_term_fk: "That term is not available in this school.",
};

export function translateScheduleError(error: PostgrestError, subject: string): string {
  const text = `${error.message} ${error.details ?? ""}`;
  for (const [constraint, message] of Object.entries(CONSTRAINT_ERRORS)) {
    if (text.includes(constraint)) return message;
  }
  for (const [fragment, message] of FRIENDLY_ERRORS) {
    if (text.includes(fragment)) return message;
  }
  return translateSisError(error, subject);
}

export async function assertScheduleReferences(
  supabase: Db,
  input: {
    organizationId: string;
    schoolId: string;
    academicYearId: string;
    termId: string | null;
    teachingAssignmentId: string;
    timetablePeriodId: string;
  },
) {
  const [school, assignment, period, term] = await Promise.all([
    supabase.from("schools").select("id, organization_id").eq("id", input.schoolId).maybeSingle(),
    supabase
      .from("teaching_assignments")
      .select("id, organization_id, school_id, academic_year_id, term_id, status")
      .eq("id", input.teachingAssignmentId)
      .maybeSingle(),
    supabase
      .from("timetable_periods")
      .select("id, organization_id, school_id, academic_year_id, start_time, end_time, status")
      .eq("id", input.timetablePeriodId)
      .maybeSingle(),
    input.termId
      ? supabase
          .from("terms")
          .select("id, organization_id, school_id, academic_year_id")
          .eq("id", input.termId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
  ]);
  for (const [result, label] of [
    [school, "School"],
    [assignment, "Teaching assignment"],
    [period, "Timetable period"],
    [term, "Term"],
  ] as const) {
    if (result.error) throw new Error(translateScheduleError(result.error, label));
  }
  if (!school.data || school.data.organization_id !== input.organizationId) {
    throw new Error("The active school is not available in this organization.");
  }
  if (!assignment.data) throw new Error("That teaching assignment does not exist, or you cannot access it.");
  if (
    assignment.data.organization_id !== input.organizationId ||
    assignment.data.school_id !== input.schoolId ||
    assignment.data.academic_year_id !== input.academicYearId
  ) {
    throw new Error("That teaching assignment belongs to a different academic context.");
  }
  if ((assignment.data.term_id ?? null) !== input.termId) {
    throw new Error("That teaching assignment belongs to a different term.");
  }
  if (!period.data) throw new Error("That timetable period does not exist, or you cannot access it.");
  if (
    period.data.organization_id !== input.organizationId ||
    period.data.school_id !== input.schoolId ||
    period.data.academic_year_id !== input.academicYearId
  ) {
    throw new Error("That timetable period belongs to a different academic context.");
  }
  return { assignment: assignment.data, period: period.data };
}
