import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260919100000_b13_teacher_daily_operations_foundation.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const preflight = readFileSync(
  new URL("../../supabase/validation/preflight_b13_teacher_daily_operations.sql", import.meta.url),
  "utf8",
).toLowerCase();
const validator = readFileSync(
  new URL("../../supabase/validation/validate_b13_teacher_daily_operations.sql", import.meta.url),
  "utf8",
).toLowerCase();
const canonicalFoundation = readFileSync(
  new URL(
    "../../supabase/migrations/20260815000000_edusmart_canonical_foundation.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

describe("Batch 13 Phase 1 Teacher Daily Operations foundation", () => {
  test("tracks read-only preflight and postdeploy validator files", () => {
    expect(preflight).toContain("set transaction read only");
    expect(preflight.trimEnd()).toEndWith("rollback;");
    expect(validator).toContain("set transaction read only");
    expect(validator.trimEnd()).toEndWith("rollback;");
    for (const sql of [preflight, validator]) {
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create table|drop)\b/m);
    }
  });

  test("creates one tenant-safe journal occurrence aggregate without display snapshots", () => {
    expect(migration).toContain("create table public.teaching_journals");
    expect(migration).toContain(
      "teaching_journals_occurrence_key unique (school_id, timetable_entry_id, journal_date)",
    );
    expect(migration).toContain("teaching_journals_year_fk");
    expect(migration).toContain("teaching_journals_term_fk");
    expect(migration).toContain("teaching_journals_assignment_fk");
    expect(migration).toContain("teaching_journals_timetable_fk");
    for (const forbidden of ["classroom_name", "subject_name", "teacher_name", "student_scores"]) {
      expect(migration).not.toContain(forbidden);
    }
  });

  test("derives and validates published timetable context and occurrence date", () => {
    expect(migration).toContain("v_timetable.status <> 'published'");
    expect(migration).toContain(
      "extract(isodow from new.journal_date)::smallint <> v_timetable.weekday",
    );
    expect(migration).toContain("v_timetable.effective_from");
    expect(migration).toContain("v_assignment.starts_on");
    expect(migration).toContain("v_year.starts_on");
    expect(migration).toContain("v_term.starts_on");
    expect(migration).toContain("v_timetable.teaching_assignment_id <> new.teaching_assignment_id");
  });

  test("freezes draft-to-submitted lifecycle, metadata, and version CAS", () => {
    expect(migration).toContain("status in ('draft','submitted')");
    expect(migration).toContain("teaching_journals_submission_metadata_check");
    expect(migration).toContain("old.status = 'submitted'");
    expect(migration).toContain("new.version <> old.version + 1");
    expect(migration).toContain("new.submitted_by_profile_id := auth.uid()");
    expect(migration).toContain("btrim(coalesce(new.material_taught, '')) = ''");
    expect(migration).toContain("trg_teaching_journals_no_delete");
  });

  test("denies direct journal writes and exposes only authorized reads", () => {
    expect(migration).toContain(
      "revoke all on public.teaching_journals from public, anon, authenticated",
    );
    expect(migration).toContain("grant select on public.teaching_journals to authenticated");
    expect(migration).toContain(
      "revoke insert, update, delete on public.teaching_journals from authenticated",
    );
    expect(migration).toContain("has_staff_scope_permission(");
    expect(migration).toContain("sm.profile_id = auth.uid()");
    expect(migration).toContain("teaching_journal.read");
  });

  test("reuses and hardens canonical staff attendance", () => {
    expect(migration).not.toContain("create table public.teacher_attendance_records");
    expect(migration).not.toContain("create table public.staff_daily_attendance");
    expect(migration).toContain("validate_staff_attendance_assignment");
    expect(migration).toContain("staff_attendance.manage");
    expect(migration).toContain("staff_attendance.self.read");
    expect(canonicalFoundation).toContain("staff_attendance_unique_day");
    expect(canonicalFoundation).toContain("staff_attendance_time_check");
    expect(migration).toContain(
      "revoke delete on public.staff_attendance_records from authenticated",
    );
  });

  test("registers the approved permission namespace and role intent without UUID grants", () => {
    for (const code of [
      "teaching_journal.read",
      "teaching_journal.create",
      "teaching_journal.update",
      "teaching_journal.submit",
      "staff_attendance.read",
      "staff_attendance.manage",
      "staff_attendance.self.read",
    ])
      expect(migration).toContain(`'${code}'`);
    for (const role of [
      "org_owner",
      "school_admin",
      "principal",
      "vice_principal_curriculum",
      "teacher",
      "homeroom_teacher",
    ])
      expect(migration).toContain(`'${role}'`);
    expect(migration).not.toMatch(
      /insert into public\.role_permissions\s*\([^)]*\)\s*values\s*\([^)]*'0000|role_id\s*=\s*'[0-9a-f-]{36}'/,
    );
  });

  test("validator covers RLS, ACL, triggers, permissions, drift, and ledger", () => {
    for (const token of [
      "teaching_journals",
      "teaching_journals_occurrence_key",
      "teaching_journals_select",
      "staff_attendance.self.read",
      "audit_teaching_journals",
      "audit_staff_attendance",
      "migration ledger",
    ]) {
      expect(validator).toContain(token);
    }
    expect(validator).toContain("authenticated','public.teaching_journals','insert,update,delete");
    expect(validator).toContain("'20260919100000'");
  });
});
