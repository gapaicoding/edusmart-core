import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260912110000_b9_student_schedule_enrollment_selection_fix.sql", import.meta.url),
  "utf8",
);
const candidate = migration.match(/join lateral \([\s\S]*?limit 1/)?.[0] ?? "";
const returns = migration.match(/returns table \([\s\S]*?\)\nlanguage sql/)?.[0] ?? "";

describe("B9 round-3 Student schedule enrollment selection", () => {
  test("establishes active primary classroom eligibility before candidate LIMIT", () => {
    expect(candidate).toContain("join public.class_enrollments ce");
    expect(candidate).toContain("ce.student_enrollment_id = se.id");
    expect(candidate).toContain("ce.status = 'active'");
    expect(candidate).toContain("ce.is_primary");
    expect(candidate).toContain("join public.classrooms c");
    expect(candidate.indexOf("join public.class_enrollments ce")).toBeLessThan(candidate.indexOf("limit 1"));
  });

  test("a newer classless enrollment cannot suppress an eligible enrollment", () => {
    expect(candidate).toContain("se.status in ('active', 'leave')");
    expect(candidate).toContain("ay.is_current desc");
    expect(candidate).toContain("current_date between ay.starts_on and ay.ends_on");
    expect(candidate.indexOf("ce.is_primary")).toBeLessThan(candidate.indexOf("order by"));
  });

  test("selection uses current academic context before enrollment timestamps", () => {
    const order = candidate.slice(candidate.indexOf("order by"));
    expect(order.indexOf("ay.is_current desc")).toBeLessThan(order.indexOf("se.enrolled_on desc"));
    expect(order.indexOf("ay.starts_on desc")).toBeLessThan(order.indexOf("se.created_at desc"));
  });

  test("identity derives only from auth.uid and has no Student parameter", () => {
    expect(migration).toContain("st.profile_id = auth.uid()");
    expect(migration).not.toContain("p_student_id");
  });

  test("returns published rows only for the selected classroom and academic year", () => {
    expect(migration).toContain("te.status = 'published'");
    expect(migration).toContain("ta.classroom_id = selected.classroom_id");
    expect(migration).toContain("ta.academic_year_id = selected.academic_year_id");
  });

  test("teacher display follows the timetable teaching assignment", () => {
    expect(migration).toContain("ssa.id = ta.staff_school_assignment_id");
    expect(migration).toContain("sm.id = ssa.staff_member_id");
    expect(migration).toContain("sm.full_name");
  });

  test("RPC returns only safe schedule display fields", () => {
    for (const field of ["entry_id", "day_of_week", "starts_at", "ends_at", "subject_name", "classroom_name", "teacher_name"])
      expect(returns).toContain(field);
    for (const field of ["email", "phone", "employee_number", "employment_status", "profile_id", "role_id"])
      expect(returns).not.toContain(field);
  });

  test("RPC remains SECURITY DEFINER with blank search_path and authenticated-only execution", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toMatch(/revoke all[\s\S]*from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/grant execute[\s\S]*to authenticated/i);
  });

  test("does not restore raw teaching-assignment permission or broaden staff RLS", () => {
    expect(migration).not.toContain("teaching_assignment.read");
    expect(migration).not.toMatch(/create policy|alter policy|grant select on public\.staff/i);
  });

  test("leaves attendance, scores, report cards, and Parent authorization untouched", () => {
    for (const token of [
      "list_student_own_attendance",
      "list_parent_student_attendance",
      "student_scores_select",
      "can_access_report_card",
      "has_scoped_permission_exact_subject",
    ]) expect(migration).not.toContain(`create or replace function public.${token}`);
  });
});
