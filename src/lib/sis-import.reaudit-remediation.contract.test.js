import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260912150000_b10_sis_import_server_transport.sql", import.meta.url),
  "utf8",
);
const authMigration = readFileSync(
  new URL("../../supabase/migrations/20260912130000_b10_sis_import_auth_rpc.sql", import.meta.url),
  "utf8",
);
const validator = readFileSync(
  new URL("../../supabase/validation/validate_b10_phase3c_server_transport.sql", import.meta.url),
  "utf8",
);
const storage = readFileSync(new URL("./sis-import.storage.server.ts", import.meta.url), "utf8");

function body(name) {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

function policy(name) {
  const start = migration.indexOf(`create policy ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(";", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("B10 re-audit remediation contracts", () => {
  test("Storage policies use only dedicated authenticated-callable predicates", () => {
    const insert = policy("sis_import_objects_insert");
    const select = policy("sis_import_objects_select");
    expect(insert).toContain("can_insert_sis_import_storage_object(name)");
    expect(select).toContain("can_select_sis_import_storage_object(name)");
    expect(insert + select).not.toContain("has_sis_permission_for_school");
  });

  test("Storage predicates are boolean-only hardened object checks", () => {
    const insert = body("can_insert_sis_import_storage_object");
    const select = body("can_select_sis_import_storage_object");
    for (const value of [insert, select]) {
      expect(value).toContain("returns boolean");
      expect(value).toContain("security definer set search_path='' ");
      expect(value).not.toMatch(/p_(organization|school|job|profile|caller)_id/);
    }
    expect(insert).toContain("p_name=j.organization_id::text||'/'||j.school_id::text");
    expect(insert).toContain("j.created_by_profile_id=auth.uid()");
    expect(select).toContain("fa.id=j.source_file_asset_id");
    expect(select).toContain("public.can_read_sis_import_job(j.id)");
  });

  test("Storage predicate ACL is intentional while generic helper remains internal", () => {
    for (const name of ["can_insert_sis_import_storage_object(text)", "can_select_sis_import_storage_object(text)"]) {
      expect(migration).toContain(`revoke all on function public.${name} from public,anon,service_role`);
      expect(migration).toContain(`grant execute on function public.${name} to authenticated`);
    }
    expect(authMigration).toContain(
      "revoke all on function public.has_sis_permission_for_school(text, uuid, uuid) from public, anon, authenticated, service_role",
    );
    expect(migration).not.toContain("grant execute on function public.has_sis_permission_for_school");
  });

  test("validator detects policy/helper ACL incompatibility", () => {
    expect(validator).toContain("Storage policy directly calls an authenticated-denied internal helper");
    expect(validator).toContain("Storage policy cannot execute its predicate");
    expect(validator).toContain("generic permission helper exposed");
  });

  test("ZIP security uses absolute actual-output bounds, not metadata ratio", () => {
    expect(storage).toContain("actual > limits.maxSingleUncompressed");
    expect(storage).toContain("total > limits.maxTotalUncompressed");
    expect(storage).not.toMatch(/maxCompressionRatio|compressedSize\s*\*/);
  });

  test("ExcelJS remains downstream of awaited ZIP preflight", () => {
    const server = readFileSync(new URL("./sis-import.server.ts", import.meta.url), "utf8");
    expect(server.indexOf("await inspectXlsxZip(bytes)")).toBeLessThan(server.indexOf("await parseSisWorkbook(bytes)"));
  });
});
