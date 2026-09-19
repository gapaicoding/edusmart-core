import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const sql = readFileSync(
  resolve(
    import.meta.dir,
    "../../supabase/migrations/20260919030000_b12_permission_request_publish_runtime_fix.sql",
  ),
  "utf8",
).toLowerCase();

describe("B12 successful publish path ambiguity remediation", () => {
  test("preserves the complete atomic publish contract", () => {
    expect(sql).toContain("create or replace function public.publish_permission_request(");
    expect(sql).toContain("security definer set search_path=public");
    expect(sql).toContain("b12_require_staff('permission_request.publish'");
    expect(sql).toContain("v.version<>p_expected_version");
    expect(sql).toContain("b12_replay_command");
    expect(sql).toContain("b12_claim_command");
    expect(sql).toContain("b12_no_eligible_recipients");
    expect(sql).toContain("explicit_student");
    expect(sql).toContain("classroom_snapshot");
    expect(sql).toContain("request_published");
  });

  test("qualifies output-name collisions reached by nonempty recipient publish", () => {
    expect(sql).toContain("where rr.request_id=p_request_id");
    expect(sql).not.toMatch(
      /from public\.parent_permission_request_recipients\s+where request_id=/,
    );
    expect(sql).toContain("version=pr.version+1");
    expect(sql).toContain("returning pr.version into v_version");
    expect(sql).toContain(
      "on conflict on constraint parent_permission_recipients_request_student_key do nothing",
    );
    expect(sql).toContain(
      "on conflict on constraint notification_recipients_unique_delivery do nothing",
    );
    expect(sql).toContain("sg.can_manage_permissions and sg.can_receive_notification");
  });
});
