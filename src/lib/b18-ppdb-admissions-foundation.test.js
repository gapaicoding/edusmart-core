import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const migration = readFileSync(
  "supabase/migrations/20260925100000_b18_ppdb_admissions_foundation.sql",
  "utf8",
);
const grantHardening = readFileSync(
  "supabase/migrations/20260925110000_b18_ppdb_admissions_capability_grant_hardening.sql",
  "utf8",
);

const tables = [
  "admission_cycles",
  "admission_applications",
  "admission_application_guardians",
  "admission_consents",
  "admission_stage_history",
  "admission_conversions",
  "admission_command_requests",
];

describe("B18 PPDB Admissions Phase 1 foundation contract", () => {
  test("defines only the frozen foundation tables and lifecycle states", () => {
    for (const table of tables) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
      expect(migration).toContain(
        `revoke all on public.${table} from public, anon, authenticated, service_role`,
      );
    }
    expect(migration).toContain("check (status in ('draft','open','closed','archived'))");
    expect(migration).toContain(
      "check (status in ('submitted','under_review','accepted','rejected','withdrawn','converted'))",
    );
    expect(migration).not.toMatch(
      /create table public\.(admission_documents|prospects|campaigns|payments|messages)/i,
    );
  });

  test("keeps tenant and SIS conversion integrity explicit", () => {
    expect(migration).toContain("admission_cycles_year_fk");
    expect(migration).toContain("admission_applications_cycle_year_fk");
    expect(migration).toContain("admission_applications_grade_scope_fk");
    expect(migration).toContain("admission_conversions_student_fk");
    expect(migration).toContain("admission_conversions_enrollment_fk");
    expect(migration).toContain(
      "constraint admission_conversions_application_key unique (application_id)",
    );
    expect(migration).not.toContain("insert into public.students");
    expect(migration).not.toContain("insert into public.guardians");
    expect(migration).not.toContain("insert into public.student_enrollments");
  });

  test("provides consent, stage history, CAS and bounded idempotency foundations", () => {
    expect(migration).toContain("policy_version");
    expect(migration).toContain("consent_source");
    expect(migration).toContain("admission_stage_history");
    expect(migration).toContain(
      "actor_kind text not null check (actor_kind in ('staff','public','system'))",
    );
    expect(migration).toContain("row_version bigint not null default 1");
    expect(migration).toContain("new.row_version := old.row_version + 1");
    expect(migration).toContain("request_id uuid not null unique");
    expect(migration).toContain("octet_length(result_payload::text) <= 16384");
    expect(migration).toContain("semantic_fingerprint text not null");
  });

  test("registers the exact capability namespace and approved grants", () => {
    for (const capability of [
      "admission.read",
      "admission.manage_cycle",
      "admission.review",
      "admission.decide",
      "admission.convert",
    ]) {
      expect(migration).toContain(`'${capability}'`);
    }
    expect(migration).toContain("r.code in ('ORG_OWNER','PRINCIPAL','SCHOOL_ADMIN')");
    expect(migration).toContain("r.code='VICE_PRINCIPAL_CURRICULUM'");
    expect(migration).toContain("p.code='admission.read'");
    expect(migration).not.toContain("ADMISSIONS_OFFICER");
    expect(migration).not.toContain("admission.*");
    expect(grantHardening).toContain("VICE_PRINCIPAL_CURRICULUM");
    expect(grantHardening).toContain("admission.review");
  });

  test("does not expose Phase 2 commands, public RPCs, or UI", () => {
    expect(migration).not.toMatch(
      /create\s+(or replace\s+)?function\s+public\.(submit|transition|convert|open|close|reopen)_/i,
    );
    expect(migration).not.toMatch(/grant\s+execute\s+on\s+function/i);
    expect(migration).not.toMatch(/create\s+policy/i);
  });
});
