import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260915160000_b12_notifications_parent_permission_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);
const normalized = migration.toLowerCase().replace(/\s+/g, " ");
const b11 = readFileSync(
  new URL(
    "../../supabase/migrations/20260914120000_b11_attendance_completion_foundation.sql",
    import.meta.url,
  ),
  "utf8",
)
  .toLowerCase()
  .replace(/\s+/g, " ");

describe("B12 Notifications and Parent Permission foundation", () => {
  test("creates separate authoritative tables", () => {
    for (const table of [
      "parent_permission_requests",
      "parent_permission_request_recipients",
      "parent_permission_decisions",
      "parent_permission_decision_history",
      "notifications",
      "notification_recipients",
      "permission_request_command_requests",
    ])
      expect(normalized).toContain("create table public." + table);
    expect(normalized).not.toContain("attendance_command_requests");
  });
  test("enforces tenant-safe relationships and uniqueness", () => {
    expect(normalized).toContain("foreign key (school_id, organization_id)");
    expect(normalized).toContain("unique (request_id, student_id)");
    expect(normalized).toContain("unique (request_recipient_id)");
    expect(normalized).toContain("unique (id, organization_id, school_id, request_id, student_id)");
    expect(normalized).toContain(
      "foreign key (request_recipient_id, organization_id, school_id, request_id, student_id)",
    );
    expect(normalized).toContain(
      "unique (id, organization_id, school_id, request_id, request_recipient_id, student_id)",
    );
    expect(normalized).toContain(
      "foreign key (decision_id, organization_id, school_id, request_id, request_recipient_id, student_id)",
    );
    expect(normalized).toContain(
      "foreign key (student_enrollment_id, student_id, organization_id, school_id)",
    );
    expect(normalized).toContain(
      "foreign key (source_permission_request_id, organization_id, school_id)",
    );
    expect(normalized).toContain("unique (notification_id, recipient_profile_id)");
    expect(normalized).toContain("dedupe_key text not null");
    expect(normalized).toContain("unique (organization_id, school_id, dedupe_key)");
  });
  test("enforces lifecycle, due date, decisions and fingerprints", () => {
    expect(normalized).toContain("status in ('draft','open','closed','cancelled')");
    expect(normalized).toContain("target_mode in ('students','classroom')");
    expect(normalized).toContain("due_at is not null");
    expect(normalized).toContain("decision in ('approved','rejected')");
    expect(normalized).toContain(
      "request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$')",
    );
    expect(normalized).toContain("unique (actor_profile_id, request_key)");
  });
  test("protects recipient, history and notification content", () => {
    expect(normalized).toContain("guard_b12_published_recipient_immutable");
    expect(normalized).toContain("guard_b12_decision_history_immutable");
    expect(normalized).toContain("guard_b12_notification_immutable");
    expect(normalized).toContain(
      "before update or delete on public.parent_permission_request_recipients",
    );
    expect(normalized).toContain(
      "before update or delete on public.parent_permission_decision_history",
    );
    expect(normalized).toContain("before update or delete on public.notifications");
  });
  test("binds guardian owner profile and preserves reminder/multi-profile semantics", () => {
    expect(normalized).toContain(
      "guardians_id_profile_org_key unique (id, profile_id, organization_id)",
    );
    expect(normalized).toContain(
      "foreign key (decided_by_guardian_id, decided_by_profile_id, organization_id)",
    );
    expect(normalized).toContain(
      "dedupe_key text not null check (length(btrim(dedupe_key)) between 1 and 200)",
    );
    expect(normalized).not.toContain("unique (source_permission_request_id, notification_type)");
    expect(normalized).toContain("unique (actor_profile_id, request_key)");
  });
  test("handles the pre-existing enrollment key by semantic definition", () => {
    expect(b11).toContain("unique (id, student_id, organization_id, school_id)");
    expect(normalized).toContain("do $b12_enrollment_key$");
    expect(normalized).toContain("pg_catalog.pg_constraint");
    expect(normalized).toContain("pg_catalog.pg_index");
    expect(normalized).toContain("idx.indisunique and idx.indisvalid and idx.indisready");
    expect(normalized).toContain("idx.indpred is null and idx.indexprs is null");
    expect(normalized).toContain("incompatible definition");
    expect(normalized).toContain(
      "add constraint student_enrollments_id_student_org_school_key unique",
    );
    expect(migration).not.toMatch(
      /\nalter table public\.student_enrollments\s+add constraint student_enrollments_id_student_org_school_key unique/i,
    );
  });
  test("enables RLS and denies authenticated direct critical DML", () => {
    for (const table of [
      "parent_permission_requests",
      "parent_permission_request_recipients",
      "parent_permission_decisions",
      "parent_permission_decision_history",
      "notifications",
      "notification_recipients",
      "permission_request_command_requests",
    ])
      expect(normalized).toContain("alter table public." + table + " enable row level security");
    expect(normalized).toContain("revoke all on table public.parent_permission_requests");
    expect(normalized).toContain("grant select on table public.parent_permission_requests");
    expect(normalized).not.toContain("grant insert on table public.parent_permission");
    expect(normalized).not.toContain("grant update on table public.parent_permission");
    expect(normalized).not.toContain("grant delete on table public.parent_permission");
  });
  test("parent RLS binds active relationship, permission and own recipient", () => {
    expect(normalized).toContain("g.profile_id=auth.uid()");
    expect(normalized).toContain("sg.status='active'");
    expect(normalized).toContain("sg.can_manage_permissions");
    expect(normalized).toContain("recipient_profile_id=auth.uid()");
  });
  test("permission registry is minimal and staff-scoped", () => {
    for (const code of [
      "notification.read",
      "notification.send",
      "permission_request.read",
      "permission_request.create",
      "permission_request.update",
      "permission_request.publish",
      "permission_request.close",
    ])
      expect(normalized).toContain("'" + code + "'");
    expect(normalized).not.toContain("'permission_request.respond'");
    expect(normalized).toContain(
      "r.code in ('org_owner','school_admin','principal','vice_principal_curriculum')",
    );
  });
  test("migration is forward-only and contains no Phase-2 command or UI", () => {
    expect(normalized).toContain("begin;");
    expect(normalized).toContain("commit;");
    expect(normalized).not.toContain(
      "create or replace function public.publish_permission_request",
    );
    expect(normalized).not.toContain("supabase_service_role_key");
  });
});
