import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const migration = readFileSync(
  resolve(
    import.meta.dir,
    "../../supabase/migrations/20260919050000_b12_mark_notification_read_return_contract_fix.sql",
  ),
  "utf8",
).toLowerCase();

describe("B12 mark notification read return contract", () => {
  test("preserves the public security and recipient contract", () => {
    expect(migration).toContain(
      "create or replace function public.mark_notification_read(p_notification_recipient_id uuid)",
    );
    expect(migration).toContain(
      "returns table(notification_recipient_id uuid,read_at timestamptz)",
    );
    expect(migration).toContain("language plpgsql security definer set search_path=public");
    expect(migration).toContain(
      "where nr.id=p_notification_recipient_id and nr.recipient_profile_id=auth.uid()",
    );
    expect(migration).toContain("b12_notification_not_found");
    expect(migration).not.toContain("parent_permission_decisions");
    expect(migration).not.toContain("parent_permission_decision_history");
    expect(migration).not.toContain("parent_permission_requests");
  });

  test("emits the populated RETURNS TABLE row after a successful update", () => {
    const notFound = migration.indexOf("if not found");
    const returnNext = migration.indexOf("return next", notFound);
    const returnStatement = migration.indexOf("return;", returnNext);

    expect(notFound).toBeGreaterThanOrEqual(0);
    expect(returnNext).toBeGreaterThan(notFound);
    expect(returnStatement).toBeGreaterThan(returnNext);
    expect(migration).toContain(
      "returning nr.id,nr.read_at into notification_recipient_id,read_at",
    );
  });

  test("preserves qualified idempotent read semantics", () => {
    expect(migration).toContain("set read_at=coalesce(nr.read_at,transaction_timestamp())");
    expect(migration).toContain("returning nr.id,nr.read_at");
    expect(migration).not.toContain("coalesce(read_at,transaction_timestamp())");
    expect(migration).not.toContain(
      "returning id,notification_recipients.read_at into notification_recipient_id,read_at",
    );
  });
});
