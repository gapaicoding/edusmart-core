import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260926180000_b20_communication_center_core.sql"),
  "utf8",
).toLowerCase();

describe("B20 Communication Center database contract", () => {
  test("defines the additive announcement and immutable recipient foundation", () => {
    for (const table of [
      "communication_announcements",
      "communication_announcement_targets",
      "communication_announcement_recipients",
      "communication_command_requests",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
    }
    expect(migration).toContain("status in ('draft','published')");
    expect(migration).toContain("unique (announcement_id, recipient_profile_id)");
    expect(migration).toContain("guard_b20_recipient_snapshot_immutable");
    expect(migration).toContain("source_announcement_id");
    expect(migration).toContain("on conflict(notification_id,recipient_profile_id) do nothing");
  });

  test("keeps targeting bounded, school-scoped, and profile-deduplicated", () => {
    expect(migration).toContain("jsonb_array_length(p_targets) > 100");
    expect(migration).toContain("b20_foreign_classroom");
    expect(migration).toContain("select distinct v.organization_id,v.school_id,v.id");
    expect(migration).toContain("student_guardians");
    expect(migration).toContain("can_receive_notification");
    expect(migration).toContain("target_scope in ('school','classroom')");
  });

  test("uses atomic, replay-safe publish semantics", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("b20_start_command");
    expect(migration).toContain("b20_finish_command");
    expect(migration).toContain("b20_idempotency_conflict");
    expect(migration).toContain("b20_announcement_already_published");
    expect(migration).toContain("insert into public.notifications");
    expect(migration).toContain("announcement_published");
    expect(migration).toContain("'/communications/'||v.id");
  });

  test("preserves database authorization boundaries", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("has_staff_scope_permission('notification.send'");
    expect(migration).toContain("revoke all on function public.b20_create_announcement");
    expect(migration).toContain("grant execute on function public.b20_create_announcement");
    expect(migration).not.toMatch(/roles*=s*['"]|school_admin|org_owner/i);
    expect(migration).not.toMatch(/midtrans|xendit|qris|virtual account|general ledger|webhook/i);
  });
});
