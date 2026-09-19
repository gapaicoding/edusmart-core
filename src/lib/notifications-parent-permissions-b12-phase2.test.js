import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const migration = readFileSync(
  resolve(
    import.meta.dir,
    "../../supabase/migrations/20260915180000_b12_permission_commands_read_projections.sql",
  ),
  "utf8",
);
const phase1Migration = readFileSync(
  resolve(
    import.meta.dir,
    "../../supabase/migrations/20260915160000_b12_notifications_parent_permission_foundation.sql",
  ),
  "utf8",
);
const functions = readFileSync(
  resolve(import.meta.dir, "notifications-parent-permissions.functions.ts"),
  "utf8",
);
const schemas = readFileSync(
  resolve(import.meta.dir, "notifications-parent-permissions.schemas.ts"),
  "utf8",
);
const server = readFileSync(
  resolve(import.meta.dir, "notifications-parent-permissions.server.ts"),
  "utf8",
);

describe("B12 Phase 2 server commands and projections", () => {
  test("adds referentially safe draft targeting and bounded projections", () => {
    expect(migration).toContain("parent_permission_request_draft_targets");
    expect(migration).toContain("unique (request_id, student_id)");
    for (const name of [
      "list_staff_permission_requests",
      "get_staff_permission_request",
      "list_permission_request_responses",
      "list_parent_permission_requests",
      "get_parent_permission_request",
      "list_permission_decision_history",
      "list_my_notifications",
    ])
      expect(migration).toContain(`function public.${name}`);
    expect(migration).toContain("least(greatest(p_page_size,1),100)");
  });

  test("commands derive auth, enforce permissions, CAS and idempotency", () => {
    for (const name of [
      "create_permission_request",
      "update_permission_request",
      "publish_permission_request",
      "submit_parent_permission_decision",
      "close_permission_request",
      "cancel_permission_request",
      "send_permission_request_reminder",
      "mark_notification_read",
    ])
      expect(migration).toContain(`function public.${name}`);
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("b12_command_fingerprint");
    expect(migration).toContain("b12_replay_command");
    expect(migration).toContain("B12_STALE_VERSION");
    expect(migration).toContain("B12_DECISION_OWNED_BY_OTHER_GUARDIAN");
    expect(migration).toContain("B12_PARENT_RELATION_REQUIRED");
  });

  test("publish snapshots recipients and deduplicates notification fan-out", () => {
    expect(migration).toContain("B12_NO_ELIGIBLE_RECIPIENTS");
    expect(migration).toContain("classroom_snapshot");
    expect(migration).toContain("explicit_student");
    expect(migration).toContain("permission-request:'||p_request_id||':published");
    expect(migration).toContain("can_manage_permissions and sg.can_receive_notification");
    expect(migration).toContain("on conflict(notification_id,recipient_profile_id) do nothing");
    expect(migration).toContain("request_published");
  });

  test("wrappers validate strict inputs and never use service-role CRUD", () => {
    expect(schemas).toContain(".strict()");
    expect(schemas).toContain('z.enum(["approved", "rejected"])');
    expect(schemas).toContain("max(100)");
    expect(functions).toContain("requireSupabaseAuth");
    expect(functions).toContain("context.supabase");
    expect(functions).not.toContain("SERVICE_ROLE");
    expect(functions).not.toContain("guardianId");
    expect(server).toContain("translateB12Error");
    expect(server).toContain("B12DomainError");
  });

  test("critical writes are authenticated RPCs and direct DML remains revoked", () => {
    expect(migration).toContain(
      "revoke all on table public.parent_permission_request_draft_targets",
    );
    expect(migration).toContain("revoke all on function public.create_permission_request");
    expect(migration).toContain("grant execute on function public.create_permission_request");
    expect(migration).toContain("from public,anon,service_role");
    expect(migration).not.toContain("grant insert on table public.parent_permission");
    expect(migration).not.toContain("grant update on table public.parent_permission");
  });

  test("every parent permission path requires an active profile", () => {
    const parentFunctions = [
      "submit_parent_permission_decision",
      "list_parent_permission_requests",
      "get_parent_permission_request",
      "list_permission_decision_history",
    ];
    for (const name of parentFunctions) {
      const start = migration.indexOf(`function public.${name}`);
      const end = migration.indexOf("$$;", start);
      expect(start).toBeGreaterThanOrEqual(0);
      const body = migration.slice(start, end);
      expect(body).toContain("public.profiles");
      expect(body).toContain("p.status='active'");
      expect(body).toContain("g.profile_id=auth.uid()");
      expect(body).toContain("sg.can_manage_permissions");
    }
  });

  test("reminders require both notification and request-read scope", () => {
    const start = migration.indexOf("function public.send_permission_request_reminder");
    const end = migration.indexOf("$$;", start);
    const body = migration.slice(start, end);
    expect(body).toContain("b12_require_staff('notification.send'");
    expect(body).toContain("b12_require_staff('permission_request.read'");
    expect(body.indexOf("r.target_classroom_id")).toBeGreaterThanOrEqual(0);
    expect(body.match(/b12_require_staff\(/g)?.length).toBe(2);
  });

  test("update replays completed commands before stale-version rejection", () => {
    const start = migration.indexOf("function public.update_permission_request");
    const end = migration.indexOf("$$;", start);
    const body = migration.slice(start, end);
    const replay = body.indexOf("b12_replay_command");
    const stale = body.indexOf("B12_STALE_VERSION");
    expect(replay).toBeGreaterThanOrEqual(0);
    expect(stale).toBeGreaterThanOrEqual(0);
    expect(replay).toBeLessThan(stale);
    expect(migration).toContain("B12_IDEMPOTENCY_CONFLICT");
    expect(body).toContain("request_edited");
  });

  test("replaces the authoritative Phase-1 command-kind check fail-closed", () => {
    const phase1Constraint = "permission_request_command_requests_command_kind_check";
    const wrongLegacyConstraint = "permission_request_commands_command_kind_check";
    expect(phase1Migration).toContain(
      "command_kind text not null check (command_kind in ('publish','decision','reminder','close','cancel'))",
    );
    expect(migration).toContain(`drop constraint ${phase1Constraint};`);
    expect(migration).toContain(`add constraint ${phase1Constraint}`);
    expect(migration).not.toContain(wrongLegacyConstraint);
    expect(migration).not.toContain("drop constraint if exists");
    const replacement = migration.slice(
      migration.indexOf(`add constraint ${phase1Constraint}`),
      migration.indexOf(";", migration.indexOf(`add constraint ${phase1Constraint}`)),
    );
    for (const kind of ["create", "update", "publish", "decision", "reminder", "close", "cancel"])
      expect(replacement).toContain(`'${kind}'`);
  });
});
