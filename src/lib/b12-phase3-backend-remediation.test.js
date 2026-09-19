import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const phase2 = readFileSync(
  "supabase/migrations/20260915180000_b12_permission_commands_read_projections.sql",
  "utf8",
);
const remediation = readFileSync(
  "supabase/migrations/20260918100000_b12_phase3_uat_backend_remediation.sql",
  "utf8",
);
const wrappers = readFileSync("src/lib/notifications-parent-permissions.functions.ts", "utf8");

describe("B12 Phase 3 backend remediation migration", () => {
  test("proves the old create RPC omitted due_at and the forward fix persists it", () => {
    expect(phase2).toMatch(
      /insert into public\.parent_permission_requests\(id,organization_id,school_id,request_type,title,description,target_mode,target_classroom_id,created_by_profile_id\)/,
    );
    expect(remediation).toContain(
      "id,organization_id,school_id,request_type,title,description,target_mode,target_classroom_id,due_at,created_by_profile_id",
    );
    expect(remediation).toContain("p_target_classroom_id,p_due_at,auth.uid());");
  });

  test("preserves nullable draft due_at and fingerprints due_at for replay", () => {
    expect(remediation).toContain("p_due_at timestamptz default null");
    expect(remediation).toContain("'due_at',p_due_at");
  });

  test("fixes cancel's exact deployed ambiguity without changing its signature", () => {
    expect(phase2).toContain("version=version+1");
    expect(remediation).toContain("version=public.parent_permission_requests.version+1");
    expect(remediation).toContain("returning public.parent_permission_requests.version into n");
    expect(remediation).toContain("cancel_permission_request(uuid,uuid,uuid,bigint,uuid)");
  });

  test("preserves cancel authorization, lifecycle, replay, ledger, and audit behavior", () => {
    for (const token of [
      "b12_require_staff('permission_request.close'",
      "if public.b12_replay_command(p_command_request_id,fp) is not null",
      "if v.status='closed'",
      "if v.status='cancelled'",
      "if v.version<>p_expected_version",
      "'cancel',p_request_id,fp,result,true",
      "'request_cancelled'",
    ]) {
      expect(remediation).toContain(token);
    }
  });

  test("keeps the authenticated server wrapper's cancel payload unchanged", () => {
    expect(wrappers).toContain('"cancel_permission_request"');
    expect(wrappers).toContain("p_request_id: data.requestId");
    expect(wrappers).toContain("p_organization_id: data.organizationId");
    expect(wrappers).toContain("p_school_id: data.schoolId");
    expect(wrappers).toContain("p_expected_version: data.expectedVersion");
    expect(wrappers).toContain("p_command_request_id: data.commandRequestId");
  });

  test("does not introduce direct browser DML or service-role CRUD", () => {
    expect(remediation).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(wrappers).not.toContain("parent_permission_requests').update");
    expect(wrappers).not.toContain("parent_permission_requests').insert");
  });
});
