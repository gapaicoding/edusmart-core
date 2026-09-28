import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8").toLowerCase();
const migration = read(
  "supabase/migrations/20260928120000_b22_external_communication_delivery.sql",
);
const functions = read("src/lib/communication.functions.ts");
const ui = read("src/components/communications/communication-center-ui.tsx");
const preferences = read("src/lib/app-preferences.tsx");

describe("B22 provider-neutral external delivery foundation", () => {
  test("uses additive delivery tables with tenant scope and unique enqueue/recipient identity", () => {
    for (const table of [
      "communication_delivery_jobs",
      "communication_delivery_recipients",
      "communication_delivery_attempts",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
    }
    expect(migration).toContain("unique (announcement_id, channel)");
    expect(migration).toContain("unique (job_id, announcement_recipient_id)");
    expect(migration).toContain(
      "communication_announcement_recipients(id, organization_id, school_id, announcement_id)",
    );
    expect(migration).toContain("foreign key (announcement_id, organization_id, school_id)");
    expect(migration).toContain(
      "foreign key (job_id, organization_id, school_id, announcement_id)",
    );
  });

  test("enqueues only a published communication and copies its immutable B20 snapshot", () => {
    expect(migration).toContain("v.status <> 'published'");
    expect(migration).toContain("from public.communication_announcement_recipients r");
    expect(migration).toContain("on conflict (announcement_id, channel) do nothing");
    expect(migration).toContain("already_queued");
    expect(migration).not.toContain("from public.student_enrollments");
    expect(migration).not.toContain("from public.student_guardians");
  });

  test("keeps provider execution and personal destination data out of this foundation", () => {
    expect(migration).toContain("default 'unconfigured'");
    expect(migration).toContain("check (provider_key = 'unconfigured')");
    expect(migration).not.toMatch(/create (or replace )?function public\.b22_.*send/);
    expect(migration).not.toMatch(
      /\b(phone|email_address|destination|access_token|secret_key)\s+text\b/,
    );
    expect(migration).not.toMatch(/https?:\/\//);
  });

  test("protects management with a dedicated capability and server-authenticated functions", () => {
    expect(migration).toContain("communication.delivery.manage");
    expect(migration).toContain("public.has_staff_scope_permission(");
    expect(migration).toContain("auth.uid() is null");
    expect(migration).toContain("revoke all on table public.communication_delivery_jobs");
    expect(migration).toContain("revoke all on table public.communication_delivery_jobs,");
    expect(migration).not.toContain("grant all");
    expect(functions).toContain("requiresupabaseauth");
    expect(functions).toContain('"b22_enqueue_external_delivery"');
    expect(functions).toContain('"b22_list_delivery_jobs"');
    expect(ui).toContain('haspermission("communication.delivery.manage")');
    expect(ui).not.toMatch(/role\s*===|role\s*!==/);
  });

  test("makes queued versus sent semantics explicit and localizes both locales", () => {
    expect(ui).toContain("communication.deliverynotsent");
    expect(preferences).toContain('"communication.deliverynotsent"');
    expect(preferences).toContain("no provider is connected");
    expect(preferences).toContain("belum ada penyedia yang terhubung");
    expect(preferences).toContain('"communication.deliverytitle"');
  });

  test("does not redefine the B20 publication or in-app notification contract", () => {
    expect(migration).not.toContain("create or replace function public.b20_publish_announcement");
    expect(migration).not.toContain("insert into public.notifications");
    expect(migration).not.toContain("insert into public.notification_recipients");
  });
});
