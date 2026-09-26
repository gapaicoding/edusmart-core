import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const ui = readFileSync("src/components/admissions/admissions-ui.tsx", "utf8");
const functions = readFileSync("src/lib/admissions.functions.ts", "utf8");
const server = readFileSync("src/lib/admissions.server.ts", "utf8");
const publicRoute = readFileSync("src/routes/ppdb/$cycleId.tsx", "utf8");
const staffRoute = readFileSync("src/routes/_authenticated/admissions/index.tsx", "utf8");
const detailRoute = readFileSync("src/routes/_authenticated/admissions/$applicationId.tsx", "utf8");

describe("B18 Phase 3 UI contract", () => {
  test("registers public and authenticated routes without direct table DML", () => {
    expect(publicRoute).toContain("/ppdb/$cycleId");
    expect(staffRoute).toContain("/_authenticated/admissions/");
    expect(detailRoute).toContain("/_authenticated/admissions/$applicationId");
    expect(server).toContain("b18_get_public_admission_cycle");
    expect(server).toContain("b18_submit_admission_application");
    expect(ui).not.toMatch(/\.from\(['\"]admission_/i);
    expect(ui).not.toMatch(/service[_-]?role/i);
  });

  test("uses capabilities and the frozen lifecycle boundary", () => {
    for (const capability of [
      "admission.read",
      "admission.manage_cycle",
      "admission.review",
      "admission.decide",
      "admission.convert",
    ])
      expect(ui).toContain(capability);
    for (const action of ["Start review", "Accept", "Reject", "Withdraw", "Convert to SIS"])
      expect(ui).toContain(action);
    expect(ui).toContain("This creates a Student, Guardian linkage, and Student Enrollment");
    expect(ui).toMatch(/Classroom placement\s+is not created/);
    expect(ui).toContain("A student with the same canonical student identifier already exists");
    expect(functions).toContain("requestId");
  });

  test("keeps out-of-scope product surfaces and role-name authorization absent", () => {
    expect(ui).not.toMatch(/ADMISSIONS_OFFICER|role\s*===|role_name/i);
    expect(ui).not.toMatch(/finance|whatsapp|campaign|document upload/i);
    expect(ui).not.toContain("admission_command_requests");
  });
});
