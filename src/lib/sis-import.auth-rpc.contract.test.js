import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Static/source-level SQL contract tests (Gate 17/18, B10-P3A-QA-001). These
// complement -- never replace -- supabase/validation/validate_b10_phase3a_auth_rpc.sql,
// which asserts live catalog semantics post-deploy. This file inspects the
// actual migration SOURCE, since the migration is unapplied and there is no
// Development database to query against in this test run.
const migrationPath = resolve(
  import.meta.dir,
  "../../supabase/migrations/20260912130000_b10_sis_import_auth_rpc.sql",
);
const sql = readFileSync(migrationPath, "utf8");

function fnBody(name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("B10 Phase 3A auth/RPC migration contract", () => {
  test("1. persist_sis_import_validation requires plan attestation", () => {
    const body = fnBody("persist_sis_import_validation");
    expect(body).toMatch(/verify_sis_import_plan_attestation/);
    expect(body).toMatch(/raise exception 'B10_VALIDATION_PLAN_ATTESTATION_INVALID'/);
  });

  test("2. attestation is verified before any preview mutation (delete/insert/update)", () => {
    const body = fnBody("persist_sis_import_validation");
    const attestIdx = body.indexOf("verify_sis_import_plan_attestation");
    const deleteIdx = body.indexOf("delete from public.sis_import_job_rows");
    const updateIdx = body.indexOf("update public.sis_import_jobs");
    expect(attestIdx).toBeGreaterThan(0);
    expect(deleteIdx).toBeGreaterThan(attestIdx);
    expect(updateIdx).toBeGreaterThan(attestIdx);
  });

  test("3. distinct entity types are derived from the row payload, not a separate parameter", () => {
    const body = fnBody("persist_sis_import_validation");
    expect(body).toMatch(/array_agg\(distinct elem->>'entityType'\)/);
    expect(body).not.toMatch(/p_entity_types/);
  });

  test("4. permission assertion uses the derived entity-type set", () => {
    const body = fnBody("persist_sis_import_validation");
    expect(body).toMatch(
      /assert_sis_import_permissions_for_entities\(v_job\.organization_id, v_job\.school_id, v_entity_types\)/,
    );
  });

  test("5. blocking-error count is derived inside the DB from persisted rows/issues", () => {
    const body = fnBody("persist_sis_import_validation");
    expect(body).toMatch(/v_blocking_errors := v_blocking_errors \+ 1/);
    expect(body).not.toMatch(/p_blocking_error_count/);
    expect(body).not.toMatch(/p_totals->>'error'/);
  });

  test("6. confirmation token is only minted after a valid persisted plan", () => {
    const body = fnBody("persist_sis_import_validation");
    const tokenIdx = body.indexOf("generate_sis_confirmation_token()");
    const attestIdx = body.indexOf("verify_sis_import_plan_attestation");
    expect(tokenIdx).toBeGreaterThan(attestIdx);
  });

  test("7. confirmation token is NULL when blocking errors exist", () => {
    const body = fnBody("persist_sis_import_validation");
    expect(body).toMatch(/if v_blocking_errors = 0 then/);
    expect(body).toMatch(/v_token := null;/);
    expect(body).toMatch(/v_token_hash := null;/);
  });

  test("8. no caller/profile-id authority parameter on job/persist RPCs", () => {
    for (const name of ["create_sis_import_job", "persist_sis_import_validation"]) {
      const body = fnBody(name);
      expect(body).not.toMatch(/p_profile_id/);
      expect(body).not.toMatch(/p_created_by_profile_id/);
      expect(body).not.toMatch(/p_caller_id/);
    }
  });

  test("9. PUBLIC execute revoked on every new B10 function", () => {
    const revokeLines = sql.match(/revoke all on function[^;]+;/g) ?? [];
    const b10Grants =
      sql.match(/grant execute on function public\.[a-z_]+\([^)]*\) to authenticated;/g) ?? [];
    expect(b10Grants.length).toBeGreaterThan(0);
    for (const grant of b10Grants) {
      const fnSig = grant.match(/function (public\.[a-z_]+\([^)]*\))/)[1];
      const hasRevoke = revokeLines.some((line) => line.includes(fnSig) && line.includes("public"));
      expect(hasRevoke).toBe(true);
    }
  });

  test("10. anon execute revoked wherever PUBLIC/anon appear in a revoke list for authenticated-granted functions", () => {
    const b10Grants =
      sql.match(/grant execute on function public\.[a-z_]+\([^)]*\) to authenticated;/g) ?? [];
    const revokeLines = sql.match(/revoke all on function[^;]+;/g) ?? [];
    for (const grant of b10Grants) {
      const fnSig = grant.match(/function (public\.[a-z_]+\([^)]*\))/)[1];
      const revoke = revokeLines.find((line) => line.includes(fnSig));
      expect(revoke).toBeDefined();
      expect(revoke).toMatch(/anon/);
    }
  });

  test("11. service_role execute revoked where required (verifier, and app-facing RPCs generally)", () => {
    const verifierRevoke = sql.match(
      /revoke all on function public\.verify_sis_import_plan_attestation\([^)]*\) from ([^;]+);/,
    );
    expect(verifierRevoke).not.toBeNull();
    expect(verifierRevoke[1]).toMatch(/public/);
    expect(verifierRevoke[1]).toMatch(/anon/);
    expect(verifierRevoke[1]).toMatch(/authenticated/);
    expect(verifierRevoke[1]).toMatch(/service_role/);
  });

  test("12. verifier is never granted directly to authenticated", () => {
    expect(sql).not.toMatch(
      /grant execute on function public\.verify_sis_import_plan_attestation[^;]*to authenticated/,
    );
  });

  test("13. search_path hardened on every new SECURITY DEFINER function", () => {
    const defBlocks = sql.split("security definer").slice(1);
    for (const block of defBlocks) {
      const head = block.slice(0, 200);
      expect(head).toMatch(/set search_path = ''/);
    }
  });

  test("14. auth.uid() is referenced for caller identity in job/persist RPCs", () => {
    for (const name of ["create_sis_import_job", "persist_sis_import_validation"]) {
      expect(fnBody(name)).toMatch(/auth\.uid\(\)/);
    }
  });

  test("15. no direct job table mutation policy/grant is (re)introduced", () => {
    expect(sql).not.toMatch(/create policy[^;]*sis_import_jobs[^;]*for (insert|update|delete)/i);
    expect(sql).not.toMatch(
      /grant (insert|update|delete) on (public\.)?sis_import_jobs to authenticated/i,
    );
  });

  test("16. no direct entity-ref table access grant/policy is introduced", () => {
    expect(sql).not.toMatch(/create policy[^;]*sis_import_entity_refs/i);
    expect(sql).not.toMatch(
      /grant [a-z, ]+ on (public\.)?sis_import_entity_refs to authenticated/i,
    );
  });

  test("17. no final SIS domain commit RPC exists in this migration", () => {
    for (const name of [
      "commit_sis_import_job",
      "fn_commit_sis_import_job",
      "confirm_sis_import_job",
    ]) {
      expect(sql).not.toMatch(new RegExp(`create or replace function public\\.${name}\\(`));
    }
  });

  test("18. no INSERT/UPDATE statements against the seven SIS domain tables", () => {
    const domainTables = [
      "students",
      "guardians",
      "staff_members",
      "student_guardians",
      "student_enrollments",
      "class_enrollments",
      "staff_school_assignments",
    ];
    for (const table of domainTables) {
      expect(sql).not.toMatch(new RegExp(`insert into public\\.${table}\\b`, "i"));
      expect(sql).not.toMatch(new RegExp(`update public\\.${table}\\b`, "i"));
    }
  });

  test("19. legacy bootstrap (prepare_sis_import_references) writes only entity-ref mappings", () => {
    const body = fnBody("prepare_sis_import_references");
    // It may SELECT from domain tables (that's the whole point of bootstrap)
    // but must only ever INSERT into sis_import_entity_refs.
    const inserts = body.match(/insert into public\.([a-z_]+)/g) ?? [];
    for (const stmt of inserts) {
      expect(stmt).toMatch(/sis_import_entity_refs$/);
    }
  });

  test("20. no generic job status setter RPC exists", () => {
    expect(sql).not.toMatch(/create or replace function public\.set_sis_import_job_status/);
    expect(sql).not.toMatch(/create or replace function public\.update_sis_import_job_status/);
  });

  test("PII scrub cannot be called by authenticated", () => {
    const revoke = sql.match(
      /revoke all on function public\.scrub_expired_sis_import_payloads\(\) from ([^;]+);/,
    );
    expect(revoke).not.toBeNull();
    expect(revoke[1]).toMatch(/authenticated/);
  });

  test("attestation payload binds rows/issues/totals as raw text, not re-serialized jsonb", () => {
    const body = fnBody("verify_sis_import_plan_attestation");
    expect(body).toMatch(/p_rows_json/);
    expect(body).toMatch(/p_issues_json/);
    expect(body).toMatch(/p_totals_json/);
    expect(body).not.toMatch(/::jsonb\)::text/);
  });
});
