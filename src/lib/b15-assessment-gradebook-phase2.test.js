import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260921110000_b15_assessment_gradebook_commands_projections.sql",
  ),
  "utf8",
);
const hardening = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260921120000_b15_assessment_gradebook_phase2_hardening.sql",
  ),
  "utf8",
);
const runtimeHardening = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260921130000_b15_assessment_gradebook_phase2_runtime_hardening.sql",
  ),
  "utf8",
);
const validator = readFileSync(
  join(process.cwd(), "supabase/validation/validate_b15_assessment_gradebook_phase2.sql"),
  "utf8",
);
const ui = readFileSync(join(process.cwd(), "src/components/assessment/assessment-ui.tsx"), "utf8");
const functions = readFileSync(
  join(process.cwd(), "src/lib/assessment-gradebook.functions.ts"),
  "utf8",
);
const server = readFileSync(join(process.cwd(), "src/lib/assessment-gradebook.server.ts"), "utf8");

describe("B15 assessment and gradebook Phase 2 command/projection contract", () => {
  test("contains the bounded command and projection inventory", () => {
    for (const name of [
      "b15_assessment_create",
      "b15_assessment_update_draft",
      "b15_assessment_transition",
      "b15_assessment_save_scores",
      "b15_correct_final_score",
      "b15_list_assessments",
      "b15_get_assessment",
      "b15_get_gradebook",
    ]) {
      expect(migration).toContain(`function public.${name}`);
    }
    expect(migration).toContain("assessment_command_requests");
    expect(migration).toContain("b15_assessment_request_fingerprint");
    expect(hardening).toContain("can_manage_assessment_context");
    expect(runtimeHardening).toContain("current_date");
  });

  test("preserves actor, ACL, CAS, lifecycle, and safe-error contracts", () => {
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("expected_version");
    expect(migration).toContain("B15_ASSESSMENT_STALE_VERSION");
    expect(migration).toContain("B15_ASSESSMENT_REQUEST_CONFLICT");
    expect(migration).toContain("B15_ASSESSMENT_PUBLISHED_IMMUTABLE");
    expect(migration).toContain("B15_ASSESSMENT_CORRECTION_REASON_REQUIRED");
    expect(migration).toContain("v.status='draft' and target='open'");
    expect(migration).toContain("v.status='closed' and target='published'");
    expect(migration).toContain("score.enter");
    expect(migration).toContain("score.update_locked");
    expect(migration).toContain("revoke all on function public.b15_assessment_create");
    expect(migration).toContain("grant execute on function public.b15_assessment_create");
    expect(validator).toContain("B15_PHASE2_PUBLIC_ANON_EXECUTE");
    expect(validator).toContain("B15_PHASE2_SCORE_ASSIGNMENT_SCOPE_MISSING");
  });

  test("enforces atomic roster-bound scores and separate correction", () => {
    expect(migration).toContain("jsonb_array_elements(p_entries)");
    expect(migration).toContain("B15_ASSESSMENT_INVALID_ROSTER");
    expect(migration).toContain("B15_ASSESSMENT_FINAL_IMMUTABLE");
    expect(migration).toContain("correct_final_score");
    expect(migration).toContain("audit_logs");
    expect(migration).toContain("'reason',btrim(p_reason)");
    expect(migration).not.toContain("report_card_subject_entries");
  });

  test("keeps production UI on the legacy path while Phase 3 remains deferred", () => {
    expect(ui).toContain("changeAssessmentLifecycle");
    expect(ui).not.toContain("b15_assessment_create");
    expect(ui).not.toContain("b15_assessment_save_scores");
    expect(ui).toContain('<PermissionGate permission="assessment.publish">');
  });

  test("provides a typed authenticated server boundary without UI conversion", () => {
    for (const name of [
      "createAssessmentCommand",
      "updateAssessmentDraftCommand",
      "transitionAssessmentCommand",
      "saveAssessmentScoresCommand",
      "correctFinalScoreCommand",
      "listAssessmentProjection",
      "getAssessmentProjection",
      "getGradebookProjection",
    ]) {
      expect(functions).toContain(`export const ${name}`);
    }
    expect(functions).toContain("requireSupabaseAuth");
    expect(server).toContain("AssessmentGradebookDomainError");
    expect(server).toContain("B15_ASSESSMENT_REQUEST_CONFLICT");
  });
});
