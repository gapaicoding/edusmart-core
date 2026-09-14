import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const foundation = migration("20260912120000_b10_sis_import_foundation.sql");
const auth = migration("20260912130000_b10_sis_import_auth_rpc.sql");
const transport = migration("20260912150000_b10_sis_import_server_transport.sql");

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("B10 independent-audit remediation contracts", () => {
  test("FK unique target is created before the referencing table", () => {
    expect(foundation.indexOf("create unique index if not exists uq_file_assets_id_organization")).toBeLessThan(foundation.indexOf("create table public.sis_import_jobs"));
  });
  test("source FK is tenant-composite and cannot null organization on delete", () => {
    const fk = foundation.slice(foundation.indexOf("constraint sis_import_jobs_file_asset_fk"), foundation.indexOf("-- Required unique target for sis_import_entity_refs"));
    expect(fk).toContain("foreign key (source_file_asset_id, organization_id)");
    expect(fk).toContain("references public.file_assets(id, organization_id) on delete restrict");
    expect(fk).not.toContain("on delete set null");
  });
  test("job creation has no asset/path/bucket authority and initializes a null attachment", () => {
    const body = functionBody(auth, "create_sis_import_job");
    const signature = body.slice(0, body.search(/\)\r?\nreturns/));
    expect(signature).not.toMatch(/asset|bucket|object_path/);
    expect(body).toContain("trim(p_source_filename), p_source_file_hash, null");
    expect(auth).not.toContain("create_sis_import_job(uuid, uuid, text, text, text, uuid)");
  });
  test("registration is the sole attachment update and binds exact job path and school", () => {
    const body = functionBody(transport, "register_sis_import_source_file");
    expect(body).toContain("v_job.source_file_asset_id is not null");
    expect(body).toContain("v_job.organization_id,v_job.school_id,'sis-imports',p_object_path");
    expect(body).toContain("/sis-imports/'||v_job.id::text||'/source.xlsx");
    expect((auth + transport).match(/set source_file_asset_id=/g)).toHaveLength(1);
  });
  test("Student ref and NISN candidates require org-wide permission or selected-school enrollment", () => {
    const body = functionBody(transport, "get_sis_import_validation_snapshot");
    const branch = body.slice(body.indexOf("'students'"), body.indexOf("'guardians'"));
    expect(branch).toContain("public.has_permission('student.import',j.organization_id,null)");
    expect(branch).toContain("authorized_se.student_id=s.id and authorized_se.school_id=j.school_id");
    expect(branch).toContain("p_student_refs");
    expect(branch).toContain("p_student_nisns");
  });
  test("Staff ref candidates require org-wide permission or selected-school assignment", () => {
    const body = functionBody(transport, "get_sis_import_validation_snapshot");
    const branch = body.slice(body.indexOf("'staff'"), body.indexOf("'studentGuardians'"));
    expect(branch).toContain("public.has_permission('staff.import',j.organization_id,null)");
    expect(branch).toContain("authorized_a.staff_member_id=s.id and authorized_a.school_id=j.school_id");
    expect(branch).toContain("p_staff_refs");
    expect(branch).toContain("p_employee_numbers");
  });
  test("relationship projections are workbook-relevant rather than school-wide", () => {
    const body = functionBody(transport, "get_sis_import_validation_snapshot");
    for (const input of ["p_student_refs", "p_student_nisns", "p_guardian_refs", "p_staff_refs", "p_employee_numbers"]) expect(body.split(input).length).toBeGreaterThan(2);
    expect(body).not.toContain("from public.student_enrollments se where se.school_id=j.school_id),");
    expect(body).not.toContain("from public.class_enrollments ce where ce.school_id=j.school_id),");
  });
  test("public payload omits private paths and issue-row identifiers", () => {
    const body = functionBody(transport, "get_sis_import_job_payload");
    expect(body).not.toMatch(/objectPath|object_path|'rowId'|'jobRowId'/);
    expect(body).not.toMatch(/'id'\s*,\s*i\.id/);
  });
  test("empty and populated job authorization use complete and entity-derived permission models", () => {
    const payload = functionBody(transport, "get_sis_import_job_payload");
    const list = functionBody(transport, "list_sis_import_jobs");
    expect(payload).toContain("has_any_sis_import_permission_for_school");
    expect(payload).toContain("assert_sis_import_permissions_for_entities");
    expect(list).toContain("sis_entity_import_permission_codes(r.entity_type)");
    expect(transport).toContain("r.entity_type not in ('student','guardian','staff','student_guardian','student_enrollment','class_enrollment','staff_school_assignment')");
    for (const code of ["student.import", "guardian.import", "staff.import", "enrollment.import", "class_enrollment.import", "staff_school_assignment.import"]) expect(transport).toContain(code);
  });
  test("storage policies use exact deterministic path and registered cross-school-safe association", () => {
    expect(transport).toMatch(/fa\.id=j\.source_file_asset_id\s+and fa\.organization_id=j\.organization_id\s+and fa\.school_id=j\.school_id/);
    expect(transport).toContain("p_name=j.organization_id::text||'/'||j.school_id::text||'/sis-imports/'||j.id::text||'/source.xlsx'");
    expect(transport).toContain("public.can_insert_sis_import_storage_object(name)");
    expect(transport).toContain("public.can_select_sis_import_storage_object(name)");
    expect(transport).not.toContain("[0-9a-f-]{36}/source");
  });
});
