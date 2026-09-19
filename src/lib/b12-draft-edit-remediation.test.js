import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const fix = readFileSync(
  "supabase/migrations/20260918120000_b12_permission_request_update_fix.sql",
  "utf8",
);
const phase2 = readFileSync(
  "supabase/migrations/20260915180000_b12_permission_commands_read_projections.sql",
  "utf8",
);
const appliedVersionFix = readFileSync(
  "supabase/migrations/20260918120000_b12_permission_request_update_fix.sql",
  "utf8",
);
const residualFix = readFileSync(
  "supabase/migrations/20260918130000_b12_permission_request_update_ambiguity_fix.sql",
  "utf8",
);
const wrappers = readFileSync("src/lib/notifications-parent-permissions.functions.ts", "utf8");

function updateBody(source) {
  const start = source.indexOf("function public.update_permission_request");
  const end = source.indexOf("$$;", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function dangerousBareOutputReferences(body) {
  return [
    /\bversion\s*=\s*version\s*\+\s*1\b/i,
    /\bselect\s+version\s+into\b/i,
    /\bwhere\s+request_id\s*=/i,
    /\bwhere\s+status\s*=/i,
    /\bwhere\s+version\s*=/i,
    /\bselect\s+(?:request_id|status|version)\s+into\b/i,
  ].filter((pattern) => pattern.test(body));
}

describe("B12 Phase 3 draft edit remediation", () => {
  test("binds the forward migration to the canonical update signature", () => {
    expect(fix).toContain("create or replace function public.update_permission_request(");
    expect(fix).toContain(
      "p_request_id uuid, p_organization_id uuid, p_school_id uuid, p_expected_version bigint",
    );
    expect(fix).toContain("returns table(request_id uuid,status text,version bigint)");
    expect(fix).toContain("security definer set search_path=public");
  });

  test("proves the old ambiguity and qualifies every update version reference", () => {
    expect(updateBody(phase2)).toContain("version=version+1");
    const body = updateBody(fix);
    expect(body).toContain("version=public.parent_permission_requests.version+1");
    expect(body).toContain(
      "select public.parent_permission_requests.version into v_new from public.parent_permission_requests",
    );
    expect(body).not.toContain("version=version+1");
  });

  test("detects the residual request_id defect and requires the qualified target predicate", () => {
    const appliedBody = updateBody(appliedVersionFix);
    expect(appliedBody).toMatch(
      /delete from public\.parent_permission_request_draft_targets where request_id=p_request_id/i,
    );
    const body = updateBody(residualFix);
    expect(body).toContain(
      "delete from public.parent_permission_request_draft_targets as dt where dt.request_id=p_request_id",
    );
    expect(body).not.toMatch(
      /delete from public\.parent_permission_request_draft_targets\s+where\s+request_id\s*=/i,
    );
  });

  test("performs a fail-closed complete output-variable collision scan", () => {
    const body = updateBody(residualFix);
    expect(dangerousBareOutputReferences(body)).toEqual([]);
    expect(body).toContain("returns table(request_id uuid,status text,version bigint)");
    expect(body).toContain("version=public.parent_permission_requests.version+1");
    expect(body).toContain(
      "select public.parent_permission_requests.version into v_new from public.parent_permission_requests",
    );
    expect(body).toContain("dt.request_id=p_request_id");
  });

  test("preserves description, due date, target replacement, CAS, replay, audit, and atomicity", () => {
    const body = updateBody(residualFix);
    for (const token of [
      "description=p_description",
      "due_at=p_due_at",
      "target_mode=p_target_mode",
      "target_classroom_id=p_target_classroom_id",
      "delete from public.parent_permission_request_draft_targets",
      "insert into public.parent_permission_request_draft_targets",
      "b12_require_staff('permission_request.update'",
      "b12_replay_command(p_command_request_id,v_fp)",
      "if v.status <> 'draft'",
      "if v.version <> p_expected_version",
      "'request_edited'",
      "b12_claim_command(p_command_request_id",
    ])
      expect(body).toContain(token);
    expect(residualFix).toContain("begin;");
    expect(residualFix).toContain("commit;");
    expect(residualFix).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  test("keeps the authenticated wrapper contract exact and direct DML-free", () => {
    for (const token of [
      '"update_permission_request"',
      "p_request_id: data.requestId",
      "p_organization_id: data.organizationId",
      "p_school_id: data.schoolId",
      "p_expected_version: data.expectedVersion",
      "p_description: data.description ?? null",
      "p_target_mode: data.targetMode",
      "p_target_classroom_id: data.targetClassroomId ?? null",
      "p_student_ids: data.studentIds",
      "p_due_at: data.dueAt ?? null",
      "p_command_request_id: data.commandRequestId",
    ])
      expect(wrappers).toContain(token);
    expect(wrappers).not.toContain("parent_permission_requests').update");
    expect(wrappers).not.toContain("parent_permission_requests').insert");
  });

  test("preserves non-draft denial and the existing error-safe command surface", () => {
    const body = updateBody(residualFix);
    expect(body).toContain("B12_REQUEST_NOT_DRAFT");
    expect(body).toContain("B12_STALE_VERSION");
    expect(body).toContain("B12_INVALID_TARGET_SET");
    expect(wrappers).toContain("translateB12Error");
  });
});
