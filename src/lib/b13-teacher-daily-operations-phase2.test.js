import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "../..");
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260919110000_b13_teacher_daily_operations_commands_projections.sql",
  ),
  "utf8",
);
const validator = fs.readFileSync(
  path.join(root, "supabase/validation/validate_b13_teacher_daily_operations_phase2.sql"),
  "utf8",
);
const aclRemediation = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260919120000_b13_teacher_daily_operations_rpc_acl_remediation.sql",
  ),
  "utf8",
);
const runtimeHardening = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260919130000_b13_teacher_daily_operations_plpgsql_runtime_hardening.sql",
  ),
  "utf8",
);

describe("B13 Phase 2 command and projection foundation", () => {
  test("uses a dedicated actor-bound command ledger", () => {
    expect(migration).toContain("create table public.teacher_daily_operation_command_requests");
    expect(migration).toContain("unique (actor_profile_id, request_id, command_name)");
    expect(migration).toContain("payload_fingerprint");
    expect(migration).toContain("B13_TDO_REQUEST_CONFLICT");
  });

  test("keeps application mutation on authenticated RPC commands", () => {
    for (const name of [
      "create_teaching_journal",
      "update_teaching_journal",
      "submit_teaching_journal",
      "manage_staff_attendance",
    ]) {
      expect(migration).toContain(`create or replace function public.${name}`);
      expect(migration).toContain("security definer");
    }
    expect(migration).toContain(
      "revoke insert, update, delete on public.staff_attendance_records from authenticated",
    );
  });

  test("freezes journal authority, lifecycle, CAS, and safe read surfaces", () => {
    expect(migration).toContain("public.has_permission('teaching_journal.create'");
    expect(migration).toContain("public.has_permission('teaching_journal.update'");
    expect(migration).toContain("public.has_permission('teaching_journal.submit'");
    expect(migration).toContain("B13_TDO_STALE_VERSION");
    expect(migration).toContain("B13_TDO_MATERIAL_REQUIRED");
    expect(migration).toContain("list_my_teaching_occurrences");
    expect(migration).toContain("list_staff_teaching_journals");
    expect(migration).toContain("list_my_teaching_journals");
  });

  test("preserves staff attendance invariants and self-read boundary", () => {
    expect(migration).toContain("staff_attendance_records_version_check");
    expect(migration).toContain("staff_attendance.manage");
    expect(migration).toContain("staff_attendance.self.read");
    expect(migration).toContain("sm.profile_id=auth.uid()");
    expect(migration).toContain("B13_TDO_STAFF_ASSIGNMENT_INVALID");
  });

  test("tracks a live post-deploy validator", () => {
    expect(
      fs.existsSync(
        path.join(root, "supabase/validation/preflight_b13_teacher_daily_operations.sql"),
      ),
    ).toBe(true);
    expect(validator).toContain("teacher_daily_operation_command_requests");
    expect(validator).toContain("direct authenticated Staff Attendance mutation remains");
    expect(validator).toContain("B13 TEACHER DAILY OPERATIONS PHASE 2 VALIDATION PASSED");
  });

  test("closes PUBLIC/anon/service-role execution and hardens result emission", () => {
    expect(aclRemediation).toContain("revoke all on function public.create_teaching_journal");
    expect(aclRemediation).toContain("from public, anon, service_role");
    expect(runtimeHardening).toContain("returning public.teaching_journals.id into v_journal");
    expect(runtimeHardening).toContain("returning r.id,r.status,r.version,r.attendance_date");
  });

  test("keeps application wrappers authenticated and RPC-only", () => {
    const functions = fs.readFileSync(
      path.join(root, "src/lib/teacher-daily-operations.functions.ts"),
      "utf8",
    );
    expect(functions).toContain("requireSupabaseAuth");
    expect(functions).toContain("context.supabase");
    expect(functions).toContain('"create_teaching_journal"');
    expect(functions).toContain('"manage_staff_attendance"');
    expect(functions).not.toContain('from("teaching_journals")');
    expect(functions).not.toContain('from("staff_attendance_records")');
  });
});
