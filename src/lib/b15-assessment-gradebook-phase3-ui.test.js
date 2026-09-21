import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ui = readFileSync(
  join(process.cwd(), "src/components/assessment/assessment-gradebook-ui.tsx"),
  "utf8",
);
const listRoute = readFileSync(
  join(process.cwd(), "src/routes/_authenticated/assessments/index.tsx"),
  "utf8",
);
const detailRoute = readFileSync(
  join(process.cwd(), "src/routes/_authenticated/assessments/$id.tsx"),
  "utf8",
);
const legacyUi = readFileSync(
  join(process.cwd(), "src/components/assessment/assessment-ui.tsx"),
  "utf8",
);

describe("B15 assessment and gradebook Phase 3 UI cutover", () => {
  test("routes use the B15 assessment surface", () => {
    expect(listRoute).toContain("assessment-gradebook-ui");
    expect(detailRoute).toContain("assessment-gradebook-ui");
    expect(listRoute).not.toContain('assessment-ui"');
    expect(detailRoute).not.toContain('assessment-ui"');
  });

  test("uses bounded B15 projections and commands for the active workflow", () => {
    for (const name of [
      "listAssessmentProjection",
      "getAssessmentProjection",
      "getGradebookProjection",
      "createAssessmentCommand",
      "updateAssessmentDraftCommand",
      "transitionAssessmentCommand",
      "saveAssessmentScoresCommand",
      "correctFinalScoreCommand",
    ]) {
      expect(ui).toContain(name);
    }
    expect(ui).toContain("assessment.version");
    expect(ui).toContain("expectedVersion");
    expect(ui).toContain("expectedScoreVersion");
  });

  test("keeps capability gates and finite conflict/error UX", () => {
    expect(ui).toContain('PermissionGate permission="assessment.publish"');
    expect(ui).toContain('hasPermission("score.update_locked")');
    expect(ui).toContain('PermissionGate permission="assessment.create"');
    expect(ui).toContain('PermissionGate permission="assessment.update_own"');
    expect(ui).toContain("Access unavailable.");
    expect(ui).toContain("Reload latest data");
    expect(ui).not.toMatch(/role\s*===\s*["'](TEACHER|PRINCIPAL)["']/);
  });

  test("preserves atomic score and correction privacy boundaries", () => {
    expect(ui).toContain("current_eligible");
    expect(ui).toContain("Historical · read-only");
    expect(ui).toContain("Correction reason");
    expect(ui).toContain("reason");
    expect(ui).not.toContain('.from("student_scores")');
    expect(ui).not.toContain('.from("assessments")');
    expect(ui).not.toContain("report_card");
  });

  test("removes legacy assessment mutation usage from primary routes", () => {
    expect(ui).not.toContain("changeAssessmentLifecycle");
    expect(ui).not.toContain("saveAssessment({");
    expect(ui).not.toContain("changeAssessmentLifecycle({");
    expect(legacyUi).toContain("changeAssessmentLifecycle");
  });
});
