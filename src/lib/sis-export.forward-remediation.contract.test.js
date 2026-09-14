import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260913100000_b10_export_student_projection_convergence.sql",
    import.meta.url,
  ),
  "utf8",
);
const oldMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260912150000_b10_sis_import_server_transport.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("B10 export forward remediation contract", () => {
  test("replaces only the export projection with its security posture intact", () => {
    expect(migration).toMatch(
      /create\s+or\s+replace\s+function\s+public\.get_sis_export_projection\s*\(p_school_id\s+uuid\)/i,
    );
    expect(migration).toMatch(/security\s+definer\s+set\s+search_path\s*=\s*''/i);
    expect(migration).toContain("assert_sis_permission_for_school");
    expect(migration).toMatch(/revoke\s+all[\s\S]*from\s+public,anon,service_role/i);
    expect(migration).toMatch(/grant\s+execute[\s\S]*to\s+authenticated/i);
    expect(migration).not.toMatch(/create\s+(table|policy|index)|alter\s+table|drop\s+/i);
  });

  test("uses Student identity cardinality and preserves relation projections", () => {
    const students = migration.match(/'Students',\(select[\s\S]*?\),\n\s*'Guardians'/)?.[0] ?? "";
    expect(students).toContain("from public.students st");
    expect(students).toMatch(/exists\s*\(select\s+1\s+from\s+public\.student_enrollments/i);
    expect(students).not.toMatch(
      /from\s+public\.student_enrollments\s+se\s+join\s+public\.students/i,
    );
    for (const key of [
      "'StudentGuardians'",
      "'StudentEnrollments'",
      "'ClassEnrollments'",
      "'StaffSchoolAssignments'",
    ])
      expect(migration).toContain(key);
  });

  test("old applied migration remains the recorded failing baseline", () => {
    const oldStudents = oldMigration.match(/'Students',\(select[^\n]+/)?.[0] ?? "";
    expect(oldStudents).toContain("from public.student_enrollments se join public.students st");
    expect(migration).not.toContain("jsonb_build_object('student_id'");
  });
});
