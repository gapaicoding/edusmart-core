import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260912100000_b9_student_schedule_visibility_fix.sql", import.meta.url),
  "utf8",
);
const scheduleSource = readFileSync(new URL("./student-portal.functions.ts", import.meta.url), "utf8");

describe("B9 round-2 Student schedule visibility contract", () => {
  test("removes only the STUDENT raw teaching-assignment read grant", () => {
    expect(migration).toContain("r.code = 'STUDENT'");
    expect(migration).toContain("p.code = 'teaching_assignment.read'");
    expect(migration).not.toMatch(/delete from public\.role_permissions[\s\S]*r\.code\s+in/i);
    expect(migration).not.toContain("PARENT'");
  });

  test("published schedule identity is derived from auth.uid, never a student parameter", () => {
    const signature = migration.match(/list_student_published_schedule\([\s\S]*?\)\nreturns table/)?.[0];
    expect(signature).toContain("p_organization_id uuid");
    expect(signature).not.toContain("p_student_id");
    expect(migration).toContain("st.profile_id = auth.uid()");
  });

  test("returns published own-classroom rows and excludes unpublished timetable", () => {
    expect(migration).toContain("te.status = 'published'");
    expect(migration).toContain("ce.status = 'active'");
    expect(migration).toContain("ce.is_primary");
    expect(migration).toContain("ta.classroom_id = ce.classroom_id");
  });

  test("projects only safe schedule fields and the correct assignment teacher name", () => {
    const returns = migration.match(/returns table \([\s\S]*?\)\nlanguage sql/)?.[0] ?? "";
    for (const field of ["entry_id", "day_of_week", "starts_at", "ends_at", "subject_name", "classroom_name", "teacher_name"])
      expect(returns).toContain(field);
    for (const forbidden of ["email", "phone", "employee_number", "employment_status", "profile_id", "role_id"])
      expect(returns).not.toContain(forbidden);
    expect(migration).toContain("sm.id = ssa.staff_member_id");
    expect(migration).toContain("ssa.id = ta.staff_school_assignment_id");
    expect(migration).toContain("sm.full_name");
  });

  test("RPC ACL is authenticated-only and does not widen staff tables", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toMatch(/revoke all[\s\S]*from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/grant execute[\s\S]*to authenticated/i);
    expect(migration).not.toMatch(/create policy staff_members|alter policy staff_members|grant select on public\.staff/i);
  });

  test("application schedule uses only the safe RPC, not raw staff or assignment tables", () => {
    const handler = scheduleSource.match(/export const listStudentSchedule[\s\S]*?export type StudentAttendanceRow/)?.[0] ?? "";
    expect(handler).toContain("callStudentPublishedScheduleRpc");
    for (const table of ["teaching_assignments", "staff_school_assignments", "staff_members", "timetable_entries"])
      expect(handler).not.toContain(`.from(\"${table}\")`);
  });

  test("migration leaves Staff, Parent, Attendance, Scores, and Report Cards logic untouched", () => {
    for (const token of [
      "can_access_teaching_assignment",
      "has_permission(",
      "has_scoped_permission_exact_subject",
      "list_parent_student_attendance",
      "list_student_own_attendance",
      "student_scores_select",
      "can_access_report_card",
    ]) expect(migration).not.toContain(`create or replace function public.${token}`);
    expect(migration).not.toMatch(/update public\.membership_roles|delete from public\.membership_roles/i);
  });
});
