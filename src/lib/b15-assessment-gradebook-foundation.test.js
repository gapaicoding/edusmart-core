import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const assessmentUi = readFileSync(
  join(process.cwd(), "src/components/assessment/assessment-ui.tsx"),
  "utf8",
);
const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260921100000_b15_assessment_gradebook_runtime_foundation.sql",
  ),
  "utf8",
);
const validator = readFileSync(
  join(process.cwd(), "supabase/validation/validate_b15_assessment_gradebook_foundation.sql"),
  "utf8",
);
const preflight = readFileSync(
  join(process.cwd(), "supabase/validation/preflight_b15_assessment_gradebook.sql"),
  "utf8",
);

describe("B15 assessment and gradebook Phase 1 foundation contract", () => {
  test("gates publish by capability while retaining lifecycle-driven applicability", () => {
    expect(assessmentUi).toContain('<PermissionGate permission="assessment.publish">');
    expect(assessmentUi).toContain('next === "publish"');
    expect(assessmentUi).toContain('a.status === "closed"');
    expect(assessmentUi).not.toMatch(/role\s*===\s*["'](?:TEACHER|PRINCIPAL)["']/);
    expect(assessmentUi).not.toMatch(/role\s*!==\s*["'](?:TEACHER|PRINCIPAL)["']/);
  });

  test("preserves the exact lifecycle and score status domains", () => {
    expect(migration).toContain("assessment.publish");
    expect(validator).toContain("B15_ASSESSMENT_STATUS_DOMAIN_CHANGED");
    expect(validator).toContain("B15_SCORE_STATUS_DOMAIN_CHANGED");
    expect(assessmentUi).toContain('a.status === "closed"');
  });

  test("defines dedicated replay-safe ledger and version foundation", () => {
    expect(migration).toContain("create table public.assessment_command_requests");
    expect(migration).toContain("assessment_command_requests_actor_request_key");
    expect(migration).toContain("payload_fingerprint");
    expect(migration).toContain("result_payload");
    expect(migration).toContain("assessment_command_requests_result_privacy_check");
    expect(migration).toContain("alter table public.assessments");
    expect(migration).toContain("alter table public.student_scores");
    expect(migration).toContain("version bigint not null default 1");
    expect(migration).toContain("b15_increment_assessment_gradebook_version");
    expect(migration).toContain("revoke all on public.assessment_command_requests");
  });

  test("reuses bounded audit infrastructure and preserves report-card/privacy boundaries", () => {
    expect(migration).toContain("Existing audit_logs already captures before_data/after_data");
    expect(preflight).toContain("report_card_published_source_review");
    expect(migration).not.toContain("correct_final_score");
    expect(migration).toContain("teacher_private_notes");
    expect(migration).toContain("assessment_command_requests_result_privacy_check");
    expect(assessmentUi).not.toContain("student_private_note");
  });

  test("validator is future-safe and enforces the authority transfer", () => {
    expect(validator).toContain("B15_PRINCIPAL_PUBLISH_MISSING");
    expect(validator).toContain("B15_TEACHER_PUBLISH_PRESENT");
    expect(validator).toContain("B15_SCHOOL_ADMIN_PUBLISH_PRESENT");
    expect(validator).not.toMatch(/latest\s+migration|latest_migration/);
    expect(migration).not.toMatch(
      /create function public\.(create|save|publish|open|close|archive)_assessment/,
    );
  });
});
