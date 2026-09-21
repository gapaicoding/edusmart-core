import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260920110000_b14_student_progression_commands_projections.sql",
  "utf8",
);
const remediation = readFileSync(
  "supabase/migrations/20260920120000_b14_student_progression_phase2_replay_and_revalidation.sql",
  "utf8",
);
const hardening = readFileSync(
  "supabase/migrations/20260920130000_b14_student_progression_safe_error_hardening.sql",
  "utf8",
);
const validator = readFileSync(
  "supabase/validation/validate_b14_student_progression_phase2.sql",
  "utf8",
);
const server = readFileSync("src/lib/student-progression.server.ts", "utf8");
const functions = readFileSync("src/lib/student-progression.functions.ts", "utf8");

describe("B14 Phase 2 command/projection contract", () => {
  test("publishes the complete command and projection surface", () => {
    for (const name of [
      "create_progression_batch",
      "list_progression_batches",
      "get_progression_batch",
      "list_progression_candidates",
      "save_progression_decision",
      "submit_progression_batch",
      "reject_progression_batch",
      "approve_progression_batch",
      "cancel_progression_batch",
      "apply_progression_batch",
    ])
      expect(migration).toContain(`function public.${name}`);
  });

  test("derives identity and school authority server-side", () => {
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("public.has_permission(p_permission, v_org, p_school_id)");
    expect(migration).not.toMatch(/p_actor_(profile|user)_id/);
    expect(server).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  test("enforces exact lifecycle and outcome rules", () => {
    expect(migration).toContain("'promoted','retained','graduated'");
    expect(migration).toContain("status='in_review'");
    expect(migration).toContain("status='approved'");
    expect(migration).toContain("status='cancelled'");
    expect(migration).toContain("status<>'draft'");
    expect(remediation).toContain("public.b14_validate_decision(v_batch,v_decision,true)");
    expect(remediation).toContain("B14_PROGRESSION_ALREADY_APPLIED");
  });

  test("validates promotion, retention, graduation, readiness and atomic apply", () => {
    expect(migration).toContain("v_target_grade.sequence <> v_source_grade.sequence + 1");
    expect(migration).toContain("v_target_grade.sequence <> v_source_grade.sequence");
    expect(migration).toContain("v_source_grade.sequence <> v_terminal_sequence");
    expect(migration).toContain("B14_PROGRESSION_READINESS_EXCEPTION_REQUIRED");
    expect(remediation).toContain("insert into public.student_enrollments");
    expect(remediation).toContain("previous_enrollment_id");
    expect(remediation).not.toMatch(/update public\.student_enrollments\s+set\s+academic_year_id/i);
    expect(remediation).toContain("else v_graduated:=v_graduated+1");
  });

  test("uses idempotency before mutable-state gates and detects conflicts", () => {
    expect(migration).toContain("B14_PROGRESSION_REQUEST_CONFLICT");
    expect(remediation).toContain("v_existing:=public.b14_command_begin");
    expect(remediation).toContain("if v_existing is not null then return v_existing");
    expect(hardening).toContain("B14_PROGRESSION_DUPLICATE_ACTIVE_BATCH");
  });

  test("keeps RPCs hardened and direct DML denied", () => {
    expect(migration).toContain("security definer set search_path = ''");
    expect(migration).toContain("revoke all on function");
    expect(validator).toContain("authenticated");
    expect(validator).toContain("B14_DIRECT_TABLE_MUTATION_PRESENT");
    expect(validator).toContain("B14_RPC_SERVICE_ROLE_EXECUTE_PRESENT");
  });

  test("exposes only the authenticated server boundary", () => {
    expect(functions).toContain("requireSupabaseAuth");
    expect(functions).not.toContain('from("progression_batches")');
    expect(functions).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(server).toContain("translateB14ProgressionError");
  });
});
