import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const migration = readFileSync(
  "supabase/migrations/20260928130000_b23_admissions_followup_funnel.sql",
  "utf8",
);
const employmentFix = readFileSync(
  "supabase/migrations/20260929100000_b23_followup_staff_employment_category_fix.sql",
  "utf8",
);
const functions = readFileSync("src/lib/admissions.functions.ts", "utf8");
const schemas = readFileSync("src/lib/admissions.schemas.ts", "utf8");
const ui = readFileSync("src/components/admissions/admission-followup-ui.tsx", "utf8");
const b18Foundation = readFileSync(
  "supabase/migrations/20260925100000_b18_ppdb_admissions_foundation.sql",
  "utf8",
);
const validator = readFileSync(
  "supabase/validation/validate_b23_admissions_followup_funnel.sql",
  "utf8",
);

describe("B23 admissions follow-up and funnel contracts", () => {
  test("attaches tasks to B18 applications and enforces one open task", () => {
    expect(migration).toContain(
      "references public.admission_applications(id, organization_id, school_id)",
    );
    expect(migration).toMatch(
      /create unique index admission_followup_one_open_task_per_application[\s\S]+where status = 'open'/,
    );
    expect(migration).toContain("due_at timestamptz not null");
    expect(migration).toContain("status in ('open','completed','cancelled')");
    expect(migration).not.toMatch(
      /followup_application_status|crm_stage|pipeline_stage|lead_stage/i,
    );
  });

  test("keeps follow-up history append-only and outcomes bounded", () => {
    expect(migration).toContain("trg_admission_followup_activity_append_only");
    expect(migration).toContain("B23_FOLLOWUP_ACTIVITY_APPEND_ONLY");
    for (const outcome of [
      "contacted",
      "no_response",
      "callback_required",
      "documents_pending",
      "followup_not_required",
    ])
      expect(migration).toContain(`'${outcome}'`);
    expect(migration).not.toMatch(
      /contact transcript|guardian_phone|guardian_email|applicant_phone|applicant_email/i,
    );
  });

  test("reuses review/read capabilities and validates same-school active assignees", () => {
    expect(b18Foundation).toContain("('admission.review'");
    expect(b18Foundation).toContain("('admission.read'");
    expect(migration).toContain("has_permission('admission.review'");
    expect(migration).toContain("has_permission('admission.read'");
    expect(migration).toContain("public.staff_school_assignments");
    expect(migration).toContain("public.organization_memberships");
    expect(migration).toContain("public.membership_school_access");
    expect(migration).toContain("ssa.school_id = new.school_id");
    expect(migration).toContain("sm.status = 'active'");
    expect(employmentFix).toContain("ssa.status = 'active'");
    expect(employmentFix).toContain("sm.status = 'active'");
    expect(employmentFix).toContain("pr.status = 'active'");
    expect(employmentFix).not.toMatch(/ssa\.employment_status\s*=/);
  });

  test("uses authenticated RPC commands with request replay and optimistic concurrency", () => {
    for (const rpc of [
      "b23_list_followup_assignees",
      "b23_get_admission_funnel",
      "b23_list_followup_tasks",
      "b23_get_followup_application",
      "b23_followup_command",
    ]) {
      expect(migration).toContain(`function public.${rpc}`);
      expect(functions).toContain(`"${rpc}"`);
    }
    expect(functions).toContain("requireSupabaseAuth");
    expect(migration).toContain("semantic_fingerprint");
    expect(migration).toContain("B23_FOLLOWUP_REQUEST_CONFLICT");
    expect(migration).toContain("B23_FOLLOWUP_STALE_VERSION");
    expect(migration).toContain("B23_FOLLOWUP_NO_CHANGE");
    expect(migration.indexOf("v_existing.semantic_fingerprint <> v_fingerprint")).toBeLessThan(
      migration.indexOf("B23_FOLLOWUP_APPLICATION_TERMINAL"),
    );
    expect(migration).toContain("for update");
    expect(migration).toContain("revoke all on public.admission_followup_tasks");
    expect(migration).toContain("from public, anon, authenticated, service_role");
  });

  test("funnel counts derive only from canonical B18 current statuses", () => {
    for (const status of [
      "submitted",
      "under_review",
      "accepted",
      "rejected",
      "withdrawn",
      "converted",
    ])
      expect(migration).toContain(`a.status = '${status}'`);
    expect(migration).toContain("count(*) filter");
    expect(migration).not.toMatch(
      /conversion_percentage|conversion_rate|stage_history[\s\S]{0,100}count\(/i,
    );
  });

  test("server schemas and localized UI preserve operational boundaries", () => {
    expect(schemas).toContain('z.enum(["open", "overdue", "mine", "all"])');
    expect(schemas).toContain('z.enum(["create", "update", "complete", "cancel"])');
    expect(ui).toContain("Completing a task does not change the admission decision.");
    expect(ui).toContain("Funnel Penerimaan");
    expect(ui).toContain("Antrean Tindak Lanjut");
    expect(ui).toContain('task.status === "completed"');
    expect(ui).toContain('"Cancelled"');
    expect(ui).toContain("formatPreferredDate");
    expect(ui).not.toMatch(/percentage|lead score|whatsapp|payment gateway/i);
  });

  test("ships a read-only validator for deployment ACL and schema contracts", () => {
    expect(validator).toContain("relrowsecurity and c.relforcerowsecurity");
    expect(validator).toContain("admission_followup_one_open_task_per_application");
    expect(validator).toContain("trg_admission_followup_activity_append_only");
    expect(validator).toContain("has_function_privilege('authenticated'");
    expect(validator).not.toMatch(/\b(insert into|update public\.|delete from|alter table)\b/i);
  });
});
