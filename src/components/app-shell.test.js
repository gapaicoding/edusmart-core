import { describe, expect, test } from "bun:test";
import { derivePersonas } from "./app-shell.tsx";

/**
 * B9 Phase 5 — persona-aware navigation.
 *
 * These are UX-only derivations (which sidebar groups render); they never
 * substitute for PermissionGate/RLS. The database enforces access
 * regardless of what derivePersonas returns.
 */
describe("derivePersonas — navigation audience derivation", () => {
  test("pure STUDENT does not receive staff or parent audiences", () => {
    const personas = derivePersonas([{ code: "STUDENT" }]);
    expect(personas).toEqual({ isStaff: false, isParent: false, isStudent: true });
  });

  test("pure PARENT does not receive staff or student audiences", () => {
    const personas = derivePersonas([{ code: "PARENT" }]);
    expect(personas).toEqual({ isStaff: false, isParent: true, isStudent: false });
  });

  test("staff role codes grant the staff audience only", () => {
    for (const code of [
      "ORG_OWNER",
      "SCHOOL_ADMIN",
      "PRINCIPAL",
      "VICE_PRINCIPAL_CURRICULUM",
      "TEACHER",
      "HOMEROOM_TEACHER",
    ]) {
      expect(derivePersonas([{ code }])).toEqual({
        isStaff: true,
        isParent: false,
        isStudent: false,
      });
    }
  });

  test("legitimate multi-role accounts see the union of applicable personas", () => {
    const personas = derivePersonas([{ code: "TEACHER" }, { code: "PARENT" }]);
    expect(personas).toEqual({ isStaff: true, isParent: true, isStudent: false });
  });

  test("an unrecognized role code grants no persona (deterministic, not a silent staff fallback)", () => {
    const personas = derivePersonas([{ code: "SOME_FUTURE_ROLE" }]);
    expect(personas).toEqual({ isStaff: false, isParent: false, isStudent: false });
  });
});
