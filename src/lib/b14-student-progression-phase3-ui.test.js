import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const ui = readFileSync(
  new URL("../components/student-progression/student-progression-ui.tsx", import.meta.url),
  "utf8",
);
const shell = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const listRoute = readFileSync(
  new URL("../routes/_authenticated/student-progression/index.tsx", import.meta.url),
  "utf8",
);
const detailRoute = readFileSync(
  new URL("../routes/_authenticated/student-progression/$batchId.tsx", import.meta.url),
  "utf8",
);

describe("B14 Phase 3 UI contract", () => {
  test("routes and permission-gated navigation exist", () => {
    expect(listRoute).toContain("/_authenticated/student-progression/");
    expect(detailRoute).toContain("/_authenticated/student-progression/$batchId");
    expect(shell).toContain('to: "/student-progression"');
    expect(shell).toContain('permission: "progression.read"');
    expect(ui).toContain("PermissionGate");
  });

  test("uses server functions and exact frozen outcomes", () => {
    expect(ui).toContain("createProgressionBatch");
    expect(ui).toMatch(/onClick=\{\(\) => void createBatch\(\)\}/);
    expect(ui).toContain("applyProgressionBatch");
    expect(ui).toContain('const outcomes = ["promoted", "retained", "graduated"]');
    expect(ui).not.toContain("transferred_out");
    expect(ui).not.toContain("withdrawn");
    expect(ui).not.toMatch(/from\(["']progression_(batches|decisions)["']\)/);
  });

  test("covers warning, CAS, lifecycle, and applied immutability UX", () => {
    expect(ui).toContain("Readiness warning");
    expect(ui).toContain("Exception reason");
    expect(ui).toContain("Reload latest data");
    expect(ui).toContain("Submit for Review");
    expect(ui).toContain("Cancel Batch");
    expect(ui).toContain("Reject");
    expect(ui).toContain("Approve");
    expect(ui).toContain("Apply Progression");
    expect(ui).toContain("Applied and immutable");
    expect(ui).toContain("preserves historical source enrollment");
  });

  test("renders a reload-persistent applied result summary from projection data", () => {
    expect(ui).toContain('data-testid="progression-applied-summary"');
    expect(ui).toContain("Applied result");
    expect(ui).toContain("Promoted");
    expect(ui).toContain("Retained");
    expect(ui).toContain("Graduated");
    expect(ui).toContain("Created target enrollments");
    expect(ui).toContain("Created target class placements");
    expect(ui).toContain("Applied at");
    expect(ui).toContain("batch.outcomes");
    expect(ui).not.toMatch(/promotedCount\s*=\s*1/);
    expect(ui).not.toMatch(/retainedCount\s*=\s*1/);
    expect(ui).not.toMatch(/graduatedCount\s*=\s*1/);
  });

  test("gates protected queries and renders a finite permission-denied state", () => {
    expect(ui).toContain("PermissionDeniedState");
    expect(ui).toContain("Access unavailable");
    expect(ui).toContain('hasPermission("progression.read")');
    expect(ui).toMatch(/enabled:\s*!!activeSchool\?\.id && hasPermission\("progression\.read"\)/);
    expect(ui).not.toContain("setTimeout");
    expect(ui).not.toMatch(/supabase\s*\.from\s*\(\s*["']progression_/);
  });
});
