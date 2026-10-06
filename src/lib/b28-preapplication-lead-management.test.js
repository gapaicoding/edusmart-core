import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const migration = readFileSync(
  "supabase/migrations/20261005100000_b28_preapplication_lead_management.sql",
  "utf8",
);
const validator = readFileSync(
  "supabase/validation/validate_b28_preapplication_lead_management.sql",
  "utf8",
);
const functions = readFileSync("src/lib/admission-leads.functions.ts", "utf8");
const schemas = readFileSync("src/lib/admission-leads.schemas.ts", "utf8");
const ui = readFileSync("src/components/admissions/admission-leads-ui.tsx", "utf8");
const b18 = readFileSync(
  "supabase/migrations/20260925100000_b18_ppdb_admissions_foundation.sql",
  "utf8",
);

describe("B28 school-scoped pre-application lead contracts", () => {
  test("separates lead lifecycle from B18 application lifecycle", () => {
    expect(migration).toContain("'NEW','CONTACTED','QUALIFIED','CONVERTED','CLOSED'");
    expect(migration).toContain(
      "if l.status<>'QUALIFIED' then raise exception 'B28_LEAD_INVALID_STATE'",
    );
    expect(migration).toContain("if l.status in ('CONVERTED','CLOSED') then");
    expect(b18).toContain(
      "'submitted','under_review','accepted','rejected','withdrawn','converted'",
    );
    expect(migration).not.toMatch(/alter table public\.admission_applications[\s\S]{0,200}status/i);
  });

  test("enforces tenant scope, RLS, least privilege, and no direct table writes", () => {
    for (const table of [
      "admission_leads",
      "admission_lead_activities",
      "admission_lead_command_requests",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
    }
    expect(migration).toContain("foreign key (school_id, organization_id)");
    expect(migration).toContain("has_permission('admission.lead.read'");
    expect(migration).toContain("has_permission('admission.lead.manage'");
    expect(migration).toContain("has_permission('admission.lead.convert'");
    expect(migration).toContain("from public,anon,authenticated,service_role");
    expect(validator).toContain("B28_DIRECT_WRITE");
    expect(migration).not.toContain(
      "grant execute on function public.b28_" +
        "create_admission_lead" +
        "(uuid,uuid,jsonb) to anon",
    );
  });

  test("keeps duplicate review school-local and advisory", () => {
    const body = migration.slice(
      migration.indexOf("create or replace function public.b28_find_lead_duplicates"),
      migration.indexOf("create or replace function public.b28_create_admission_lead"),
    );
    expect(body).toContain("school_id=p_school_id");
    expect(body).toContain("phone_normalized=v_phone");
    expect(body).toContain("email_normalized=v_email");
    expect(body).toContain("limit 10");
    expect(body).not.toContain("raise exception 'B28_LEAD_DUPLICATE'");
  });

  test("uses idempotent authorized commands and optimistic row versions", () => {
    for (const name of [
      "b28_list_admission_leads",
      "b28_find_lead_duplicates",
      "b28_create_admission_lead",
      "b28_admission_lead_command",
      "b28_convert_admission_lead",
    ]) {
      expect(migration).toContain(`function public.${name}`);
      expect(functions).toContain(`"${name}"`);
    }
    expect(migration).toContain("semantic_fingerprint");
    expect(migration).toContain("B28_LEAD_REQUEST_CONFLICT");
    expect(migration).toContain("B28_LEAD_STALE_VERSION");
    expect(migration).toContain("for update");
    expect(schemas).toContain("expectedRowVersion: z.number().int().positive()");
  });

  test("conversion preserves formal B18 consent and does not create SIS entities", () => {
    const body = migration.slice(
      migration.indexOf("create or replace function public.b28_convert_admission_lead"),
    );
    expect(body).toContain("b18_submit_staff_admission_application");
    expect(body).toContain("linked_application_id=v_app_id");
    expect(body).not.toContain("insert into public.students");
    expect(body).not.toContain("insert into public.student_enrollments");
    expect(body).not.toContain("insert into public.guardians");
    const staffSubmit = migration.slice(
      migration.indexOf("create or replace function public.b18_submit_staff_admission_application"),
      migration.indexOf("create or replace function public.b28_convert_admission_lead"),
    );
    expect(staffSubmit).toContain("consent_confirmed");
    expect(staffSubmit).toContain("'staff_entry'");
    expect(staffSubmit).toContain("admission_stage_history");
  });

  test("history is append-only, notes bounded, and UI provides bilingual accessible state", () => {
    expect(migration).toContain("B28_LEAD_ACTIVITY_APPEND_ONLY");
    expect(migration).toContain("char_length(btrim(note)) between 1 and 1000");
    expect(ui).toContain('title: "Pertanyaan Penerimaan"');
    expect(ui).toContain('title: "Admissions Inquiries"');
    expect(ui).toContain("focus-visible:ring-2");
    expect(ui).toContain("aria-label");
  });
});
