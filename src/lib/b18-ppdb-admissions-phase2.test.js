import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const migration = readFileSync(
  "supabase/migrations/20260925120000_b18_ppdb_admissions_commands_runtime.sql",
  "utf8",
);
const aclHardening = readFileSync(
  "supabase/migrations/20260925170000_b18_ppdb_staff_rpc_acl_hardening.sql",
  "utf8",
);
const boundary = readFileSync("src/lib/admissions.functions.ts", "utf8");
const server = readFileSync("src/lib/admissions.server.ts", "utf8");

describe("B18 PPDB Phase 2 commands/projections contract", () => {
  test("defines public projection/submission and authenticated staff boundaries", () => {
    for (const name of [
      "b18_get_public_admission_cycle",
      "b18_submit_admission_application",
      "b18_open_admission_cycle",
      "b18_close_admission_cycle",
      "b18_reopen_admission_cycle",
      "b18_archive_admission_cycle",
      "b18_start_admission_review",
      "b18_accept_admission_application",
      "b18_reject_admission_application",
      "b18_withdraw_admission_application",
      "b18_convert_admission_application",
      "b18_list_admission_cycles",
      "b18_get_admission_cycle",
      "b18_list_admission_applications",
      "b18_get_admission_application",
    ]) {
      expect(migration).toContain(`function public.${name}`);
    }
    expect(migration.match(/security definer/gi)?.length).toBeGreaterThanOrEqual(15);
    expect(migration.match(/set search_path\s*=\s*''/gi)?.length).toBeGreaterThanOrEqual(15);
    expect(migration).toContain(
      "grant execute on function public.b18_submit_admission_application(uuid,uuid,jsonb) to anon,authenticated",
    );
    expect(migration).toMatch(
      /grant execute on function public\.b18_list_admission_applications\(uuid,text,uuid,integer,integer\) to authenticated/,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.b18_list_admission_applications\([^)]*\) to anon/,
    );
  });

  test("enforces frozen lifecycle, capability, CAS, ledger and consent contracts", () => {
    for (const capability of [
      "admission.manage_cycle",
      "admission.review",
      "admission.decide",
      "admission.convert",
    ])
      expect(migration).toContain(`'${capability}'`);
    for (const command of [
      "submit_application",
      "open_cycle",
      "close_cycle",
      "reopen_cycle",
      "archive_cycle",
      "start_review",
      "accept_application",
      "reject_application",
      "withdraw_application",
      "convert_application",
    ])
      expect(migration).toContain(`'${command}'`);
    expect(migration).toContain("B18_ADMISSION_STALE_VERSION");
    expect(migration).toContain("B18_ADMISSION_REQUEST_CONFLICT");
    expect(migration).toContain("policy_version");
    expect(migration).toContain("admission_consents");
    expect(migration).toContain("admission_stage_history");
    expect(migration).toContain("admission_command_requests");
  });

  test("uses exact deterministic duplicate protection and atomic SIS conversion", () => {
    expect(migration).toContain("s.nisn=a.applicant_nisn");
    expect(migration).toContain("B18_ADMISSION_POSSIBLE_DUPLICATE");
    expect(migration).toContain("insert into public.students");
    expect(migration).toContain("insert into public.guardians");
    expect(migration).toContain("insert into public.student_guardians");
    expect(migration).toContain("insert into public.student_enrollments");
    expect(migration).toContain("insert into public.admission_conversions");
    expect(migration).not.toContain("class_enrollments");
    expect(migration).not.toContain("create user");
    expect(migration).not.toMatch(/similarity\(|levenshtein|fuzzy|soundex/i);
  });

  test("does not add Phase 3 UI, CRM, finance, communications or document scope", () => {
    expect(migration).not.toMatch(
      /create table public\.(finance|invoice|payment|communication|message|admission_documents)/i,
    );
    expect(migration).not.toMatch(/whatsapp|campaign|lead scoring|document upload/i);
    expect(migration).not.toMatch(/role_name|role\s*=|ADMISSIONS_OFFICER/i);
  });

  test("keeps the typed server boundary separate from Phase 3 UI", () => {
    expect(boundary).toContain("requireSupabaseAuth");
    expect(boundary).toContain("b18_list_admission_applications");
    expect(boundary).toContain("b18_convert_admission_application");
    expect(server).toContain("submitPublicAdmissionApplication");
    expect(boundary).not.toMatch(/service[_-]?role/i);
  });

  test("hardens the anonymous B18 RPC allowlist without removing staff access", () => {
    expect(aclHardening).toContain(
      "revoke execute on function public.b18_transition_admission_application(uuid,bigint,uuid,text,text) from public",
    );
    expect(aclHardening).toContain(
      "revoke execute on function public.b18_transition_admission_application(uuid,bigint,uuid,text,text) from anon",
    );
    expect(aclHardening).toContain(
      "grant execute on function public.b18_transition_admission_application(uuid,bigint,uuid,text,text) to authenticated",
    );
    expect(aclHardening).toContain(
      "revoke execute on function public.b18_cycle_transition(uuid,bigint,uuid,text,text) from public",
    );
    expect(aclHardening).toContain(
      "revoke execute on function public.b18_bump_row_version() from public",
    );
    expect(aclHardening).toContain(
      "revoke execute on function public.b18_set_updated_at() from public",
    );
    expect(aclHardening).not.toMatch(/grant execute[^;]+to anon/i);
    expect(aclHardening).not.toMatch(/create\s+(or replace\s+)?function/i);
  });

  test("preserves the applied migration boundary", () => {
    for (const version of [
      "20260925100000",
      "20260925110000",
      "20260925120000",
      "20260925130000",
      "20260925140000",
      "20260925150000",
      "20260925160000",
    ]) {
      expect(aclHardening).not.toContain(`alter migration ${version}`);
    }
    expect(aclHardening).toContain("B18 forward-only ACL hardening");
  });
});
