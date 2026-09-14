import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../../supabase/migrations/20260912140000_b10_sis_import_atomic_commit.sql", import.meta.url), "utf8");
const body = sql.slice(sql.indexOf("create or replace function public.commit_sis_import_job"));

describe("B10 Phase 3B atomic commit SQL contract", () => {
  test("1. public surface is job plus token only", () => {
    expect(sql).toMatch(/commit_sis_import_job\(\s*p_job_id uuid,\s*p_confirmation_token text\s*\)/i);
    expect(sql).not.toMatch(/commit_sis_import_job\([^)]*(organization|school|plan|rows|resolved)/i);
  });
  test("2. hardened definer and ACL", () => {
    expect(body).toMatch(/security definer\s+set search_path = ''/i);
    expect(sql).toMatch(/revoke all on function public\.commit_sis_import_job\(uuid,text\) from public, anon, service_role/i);
    expect(sql).toMatch(/grant execute on function public\.commit_sis_import_job\(uuid,text\) to authenticated/i);
  });
  test("3. caller, lock, row-derived permissions", () => {
    expect(body).toContain("auth.uid()"); expect(body).toMatch(/for update/i);
    expect(body).toMatch(/array_agg\(distinct r\.entity_type\)/i);
    expect(body).toContain("assert_sis_import_permissions_for_entities");
  });
  test("4. completed is idempotent and importing conflicts", () => {
    expect(body).toMatch(/status = 'completed'[\s\S]*return query[\s\S]*return;/i);
    expect(body).toContain("B10_CONFIRM_ALREADY_PROCESSING");
  });
  test("5. token is job/version bound and errors are rechecked", () => {
    expect(body).toContain("hash_sis_confirmation_token");
    expect(body).toContain("v_job.preview_version");
    expect(body).toContain("v_job.normalized_plan_fingerprint");
    expect(body).toMatch(/action='error'/); expect(body).toMatch(/severity='error'/);
  });
  test("6. validated transitions to importing and consumes token", () => {
    expect(body).toMatch(/status='importing'/); expect(body).toMatch(/confirmation_token_hash=null/);
  });
  test("7. inner exception boundary persists sanitized failed state", () => {
    expect(body).toMatch(/begin[\s\S]*exception when exclusion_violation/);
    expect(body).toMatch(/status='failed'/); expect(body).toContain("B10_IMPORT_COMMIT_FAILED");
  });
  test("8. success completes with authoritative totals", () => {
    expect(body).toMatch(/jsonb_build_object\('created'/); expect(body).toMatch(/status='completed'/);
  });
  test("9. every frozen domain writer exists", () => {
    for (const table of ["staff_members","students","guardians","staff_school_assignments","student_guardians","student_enrollments","class_enrollments"])
      expect(body).toContain(`insert into public.${table}`);
  });
  test("10. durable refs are minted for base entities", () => {
    expect((body.match(/mint_sis_entity_ref/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  test("11. expected state gates updates and unchanged rows", () => {
    expect(body).toContain("expected_state"); expect(body).toContain("B10_STALE_PREVIEW");
  });
  test("12. Guardian has no phone/email/name identity matching", () => {
    const lookup = body.match(/select r\.guardian_id[\s\S]*?if v_row\.action='create'/i)?.[0] ?? "";
    expect(lookup).toContain("external_ref"); expect(lookup).not.toMatch(/phone|email|full_name/i);
  });
  test("13. no fuzzy matching or generic mutation helper", () => {
    expect(body).not.toMatch(/levenshtein|similarity|fuzzy|update_any_entity|insert_any_entity|set_job_status/i);
  });
  test("14. no destructive or identity/RBAC mutation", () => {
    expect(body).not.toMatch(/\b(delete from|truncate|drop table)\b/i);
    expect(body).not.toMatch(/(insert|update|delete)[\s\S]{0,40}(auth\.users|memberships|roles|role_permissions|school_access)/i);
  });
  test("15. no service-role or internal-helper grant", () => {
    expect(sql).not.toMatch(/grant execute[^;]+service_role/i);
    expect(sql).not.toMatch(/grant execute on function public\.(hash_sis_confirmation_token|mint_sis_entity_ref)[^;]+authenticated/i);
  });
  test("16. class overlap protection is not weakened", () => {
    expect(sql).not.toMatch(/drop constraint\s+class_enrollments_no_primary_overlap/i);
    expect(sql).not.toMatch(/disable trigger/i);
  });
  test("17. no caller plan or resolved UUID parameter", () => {
    const sig=sql.match(/commit_sis_import_job\([\s\S]*?\)\s*returns table/i)?.[0] ?? "";
    expect(sig).not.toMatch(/json|resolved|entity_id|fingerprint|preview/i);
  });
  test("18. dependency order is explicit", () => {
    const names=["entity_type='staff'","entity_type='student'","entity_type='guardian'","entity_type='staff_school_assignment'","entity_type='student_guardian'","entity_type='student_enrollment'","entity_type='class_enrollment'"];
    let at=-1; for(const name of names){const next=body.indexOf(name,at+1); expect(next).toBeGreaterThan(at); at=next;}
  });
});
