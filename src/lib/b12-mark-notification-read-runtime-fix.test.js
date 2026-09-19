import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const migration = readFileSync(
  resolve(
    import.meta.dir,
    "../../supabase/migrations/20260919040000_b12_mark_notification_read_runtime_fix.sql",
  ),
  "utf8",
).toLowerCase();

describe("B12 mark notification read runtime remediation", () => {
  test("preserves the authenticated recipient-only RPC contract", () => {
    expect(migration).toContain(
      "create or replace function public.mark_notification_read(p_notification_recipient_id uuid)",
    );
    expect(migration).toContain(
      "returns table(notification_recipient_id uuid,read_at timestamptz)",
    );
    expect(migration).toContain("security definer set search_path=public");
    expect(migration).toContain(
      "where nr.id=p_notification_recipient_id and nr.recipient_profile_id=auth.uid()",
    );
    expect(migration).toContain("b12_notification_not_found");
  });

  test("qualifies table columns that overlap return variables", () => {
    expect(migration).toContain("set read_at=coalesce(nr.read_at,transaction_timestamp())");
    expect(migration).toContain(
      "returning nr.id,nr.read_at into notification_recipient_id,read_at",
    );
    expect(migration).not.toContain("coalesce(read_at,transaction_timestamp())");
    expect(migration).not.toContain(
      "returning id,notification_recipients.read_at into notification_recipient_id,read_at",
    );
  });

  test("keeps notification state separate from decision state", () => {
    expect(migration).not.toContain("parent_permission_decisions");
    expect(migration).not.toContain("parent_permission_decision_history");
    expect(migration).not.toContain("parent_permission_requests");
  });
});
