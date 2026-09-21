import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260920100000_b14_student_progression_foundation.sql"),
  "utf8",
);
const validator = readFileSync(
  join(process.cwd(), "supabase/validation/validate_b14_student_progression.sql"),
  "utf8",
);

describe("B14 student progression Phase 1 foundation contract", () => {
  test("defines the three durable foundation tables with tenant keys", () => {
    for (const table of [
      "progression_batches",
      "progression_decisions",
      "progression_command_requests",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toMatch(
        new RegExp(`${table}[\\s\\S]{0,2200}organization_id uuid not null`),
      );
      expect(migration).toMatch(new RegExp(`${table}[\\s\\S]{0,2200}school_id uuid not null`));
    }
  });

  test("freezes the V1 outcome domain exactly", () => {
    expect(migration).toContain(
      "outcome is null or outcome in ('promoted','retained','graduated')",
    );
    expect(migration).not.toMatch(/outcome[^\n]*transferred_out/);
    expect(migration).not.toMatch(/outcome[^\n]*withdrawn/);
  });

  test("defines lifecycle, CAS, and replacement-safe active uniqueness", () => {
    expect(migration).toContain(
      "status in ('draft','in_review','approved','rejected','applied','cancelled')",
    );
    expect(migration).toContain("version bigint not null default 1");
    expect(migration).toContain("uq_progression_batches_active_scope");
    expect(migration).toContain("where status in ('draft','in_review','approved','applied')");
    expect(migration).toContain("uq_progression_decisions_batch_source_enrollment");
  });

  test("supports tenant-safe source/target relationships and graduation semantics", () => {
    expect(migration).toContain("progression_batches_source_year_fk");
    expect(migration).toContain("progression_batches_target_year_fk");
    expect(migration).toContain("progression_decisions_source_enrollment_fk");
    expect(migration).toContain("progression_decisions_target_grade_fk");
    expect(migration).toContain("progression_decisions_target_classroom_fk");
    expect(migration).toContain("B14_GRADUATED_TARGET_CONTEXT_FORBIDDEN");
    expect(migration).toContain("B14_TARGET_ACADEMIC_YEAR_NOT_LATER");
    expect(migration).toContain("B14_STUDENT_SOURCE_ENROLLMENT_MISMATCH");
  });

  test("has bounded readiness exception, idempotency, and audit foundations", () => {
    expect(migration).toContain("readiness_snapshot jsonb not null");
    expect(migration).toContain("B14_READINESS_EXCEPTION_REASON_REQUIRED");
    expect(migration).toContain("progression_command_requests_actor_request_key");
    expect(migration).toContain("payload_fingerprint text not null");
    expect(migration).toContain("trg_progression_batches_audit");
    expect(migration).toContain("trg_progression_decisions_audit");
  });

  test("establishes applied and historical enrollment immutability", () => {
    expect(migration).toContain("B14_APPLIED_BATCH_IMMUTABLE");
    expect(migration).toContain("B14_APPLIED_DECISION_IMMUTABLE");
    expect(migration).toContain("B14_APPLIED_SOURCE_ENROLLMENT_IMMUTABLE");
    expect(migration).toContain("trg_student_enrollments_progression_immutability");
    expect(migration).toContain(
      "revoke all on public.progression_batches from public, anon, authenticated, service_role",
    );
    expect(migration).toContain(
      "revoke all on public.progression_decisions from public, anon, authenticated, service_role",
    );
  });

  test("registers the approved permission namespace without hardcoded role IDs", () => {
    for (const permission of [
      "progression.read",
      "progression.create",
      "progression.update",
      "progression.submit",
      "progression.review",
      "progression.approve",
      "progression.apply",
      "progression.cancel",
      "progression.audit",
    ])
      expect(migration).toContain(`'${permission}'`);
    expect(migration).toContain("r.code = 'SCHOOL_ADMIN'");
    expect(migration).toContain("r.code = 'PRINCIPAL'");
    expect(migration).toContain("r.code in ('TEACHER','HOMEROOM_TEACHER')");
    expect(migration).not.toMatch(/role_id\s*=\s*'[0-9a-f-]{36}'/i);
    expect(migration).not.toMatch(/profile_id\s*=\s*'[0-9a-f-]{36}'/i);
  });

  test("validator covers secure deny posture and migration presence", () => {
    expect(validator).toContain("B14_VALIDATION_RLS_DISABLED");
    expect(validator).toContain("B14_VALIDATION_BROWSER_WRITE_PRIVILEGE");
    expect(validator).toContain("B14_VALIDATION_PUBLIC_WRITE_PRIVILEGE");
    expect(validator).toContain("B14_VALIDATION_MIGRATION_NOT_PRESENT");
    expect(validator).not.toContain("latest migration ==");
  });
});
