import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const readValidator = (name) =>
  readFileSync(new URL(`../../supabase/validation/${name}`, import.meta.url), "utf8");
const withoutComments = (sql) => sql.replace(/--.*$/gm, "");
const phase1 = readValidator("validate_b10_phase1_sis_import_foundation.sql");
const phase3a = readValidator("validate_b10_phase3a_auth_rpc.sql");
const phase3b = readValidator("validate_b10_phase3b_atomic_commit.sql");
const phase3c = readValidator("validate_b10_phase3c_server_transport.sql");

// JavaScript model of the SQL predicate used against unnested proconfig.
// Keeping representative values executable prevents a source-only,
// self-fulfilling assertion from accepting a non-empty path.
const hasExplicitEmptySearchPath = (proconfig) =>
  (proconfig ?? []).some((cfg) => {
    const separator = cfg.indexOf("=");
    const key = separator < 0 ? cfg : cfg.slice(0, separator);
    const value = separator < 0 ? cfg : cfg.slice(separator + 1);
    return key === "search_path" && (value === "" || value === '\"\"');
  });

describe("B10 postdeploy validator contracts", () => {
  test("Phase 1 FKs do not depend on pg_get_constraintdef rendering", () => {
    expect(withoutComments(phase1)).not.toContain("pg_get_constraintdef");
    expect(withoutComments(phase1)).not.toMatch(/references\s+public\.(students|file_assets)/i);
  });

  test("Phase 1 source-file FK proves ordered relation, columns, and RESTRICT semantics", () => {
    const sql = withoutComments(phase1);
    expect(sql).toContain("c.conrelid = 'public.sis_import_jobs'::regclass");
    expect(sql).toContain("c.confrelid = 'public.file_assets'::regclass");
    expect(sql).toContain("c.confdeltype = 'r'");
    expect(sql).toContain("array['source_file_asset_id','organization_id']::name[]");
    expect(sql).toContain("array['id','organization_id']::name[]");
    expect(sql).toMatch(/pg_index[\s\S]*indisunique[\s\S]*indisvalid[\s\S]*indnkeyatts\s*=\s*2/i);
  });

  test("Phase 3A is monotonic and does not reject the approved commit RPC", () => {
    const sql = withoutComments(phase3a);
    expect(sql).not.toMatch(/proname\s+in\s*\([^)]*commit_sis_import_job[^)]*\)\s*\)\s*=\s*0/i);
    expect(sql).not.toContain("No Phase-3B final commit RPC may exist yet");
  });

  test("Phase 3A retains its authentication and attestation security invariants", () => {
    const sql = withoutComments(phase3a);
    expect(sql).toContain("verify_sis_import_plan_attestation");
    expect(sql).toContain("persist_sis_import_validation");
    expect(sql).toContain("create_sis_import_job(uuid,uuid,text,text,text)");
    expect(sql).toContain("create_sis_import_job(uuid,uuid,text,text,text,uuid)");
    expect(sql).toContain("sis_import_entity_refs must still have zero grants to authenticated");
    expect(sql).toMatch(/not has_function_privilege\('authenticated',[\s\S]*verify_sis_import_plan_attestation/i);
  });

  test('Phase 3B accepts PostgreSQL search_path="" rendering semantically', () => {
    expect(hasExplicitEmptySearchPath(['search_path=""'])).toBe(true);
    expect(phase3b).toMatch(/split_part\(cfg,'=',1\)='search_path'/);
    expect(phase3b).not.toMatch(/proconfig\s*@>/);
  });

  test("Phase 3C uses the same semantic empty-search-path logic", () => {
    expect(hasExplicitEmptySearchPath(["search_path="])).toBe(true);
    expect(phase3c).toMatch(/split_part\(cfg,'=',1\)='search_path'/);
    expect(phase3c).not.toMatch(/proconfig\s*@>/);
  });

  test("non-empty or missing search_path cannot satisfy the hardened predicate", () => {
    expect(hasExplicitEmptySearchPath(["search_path=public"])).toBe(false);
    expect(hasExplicitEmptySearchPath([])).toBe(false);
    expect(hasExplicitEmptySearchPath(null)).toBe(false);
  });
});
