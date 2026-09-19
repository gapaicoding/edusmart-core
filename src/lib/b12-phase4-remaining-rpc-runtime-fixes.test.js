import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const sql = readFileSync(
  resolve(
    import.meta.dir,
    "../../supabase/migrations/20260919060000_b12_phase4_remaining_rpc_runtime_fixes.sql",
  ),
  "utf8",
).toLowerCase();

function body(name) {
  const start = sql.indexOf(`function public.${name}`);
  const end = sql.indexOf("$$;", start);
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start, end);
}

describe("B12 Phase 4 remaining write-RPC runtime fixes", () => {
  test("reminder preserves the eligible fanout contract and avoids output-name conflict targets", () => {
    const reminder = body("send_permission_request_reminder");
    expect(reminder).toContain("b12_require_staff('notification.send'");
    expect(reminder).toContain("b12_require_staff('permission_request.read'");
    expect(reminder).toContain("rr.request_id=p_request_id");
    expect(reminder).toContain(
      "not exists(select 1 from public.parent_permission_decisions d where d.request_recipient_id=rr.id)",
    );
    expect(reminder).toContain("on conflict do nothing");
    expect(reminder).toContain("return query select p_request_id,n,c");
    expect(reminder).not.toContain("on conflict(notification_id,recipient_profile_id)");
  });

  test("decision qualifies request and version columns while preserving CAS and row emission", () => {
    const decision = body("submit_parent_permission_decision");
    expect(decision).toContain("where rr.id=p_request_recipient_id and rr.request_id=p_request_id");
    expect(decision).toContain("set decision=p_decision,version=pd.version+1");
    expect(decision).toContain("returning pd.version into v_new");
    expect(decision).toContain("b12_stale_version");
    expect(decision).toContain("return query select (v_result->>'decision_id')::uuid");
  });

  test("close qualifies the version update and keeps stable CAS result shape", () => {
    const close = body("close_permission_request");
    expect(close).toContain("version=pr.version+1");
    expect(close).toContain("returning pr.version into n");
    expect(close).toContain("if v.version<>p_expected_version");
    expect(close).toContain("return query select p_request_id,'closed',n");
  });

  test("does not alter deployed function security or notification/decision boundaries", () => {
    expect(sql.match(/create or replace function public\./g)?.length).toBe(3);
    expect(sql.match(/security definer set search_path=public/g)?.length).toBe(3);
    expect(sql).not.toMatch(
      /create table|alter table|enable row level security|grant execute .*public/,
    );
  });
});
