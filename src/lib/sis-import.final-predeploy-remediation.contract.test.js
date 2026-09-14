import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260912150000_b10_sis_import_server_transport.sql", import.meta.url),
  "utf8",
);
const server = readFileSync(new URL("./sis-import.server.ts", import.meta.url), "utf8");

function functionDefinition(name) {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + 3);
}

describe("B10 final predeploy migration compile remediation", () => {
  test("get_sis_import_job_payload declares and consumes its entity-type array", () => {
    const fn = functionDefinition("get_sis_import_job_payload");
    expect(fn).toContain("language plpgsql");
    const declaration = fn.match(/\bdeclare\s+([\s\S]*?)\bbegin\b/i)?.[1] ?? "";
    expect(declaration).toMatch(/(?:^|;)\s*types\s+text\[\]\s*;/i);
    expect(fn).toMatch(/\binto\s+types\b/i);
    expect(fn).toContain(
      "public.assert_sis_import_permissions_for_entities(j.organization_id,j.school_id,types)",
    );
  });

  test("every simple INTO target in migration 150000 PL/pgSQL is declared or a parameter", () => {
    const functionNames = [
      "register_sis_import_source_file",
      "fail_sis_import_upload",
      "get_sis_import_job_payload",
      "list_sis_import_jobs",
      "get_sis_import_validation_snapshot",
      "get_sis_export_projection",
    ];
    for (const name of functionNames) {
      const fn = functionDefinition(name);
      expect(fn).toContain("language plpgsql");
      const parameters = fn.match(/^[\s\S]*?\(([\s\S]*?)\)\s*returns/i)?.[1] ?? "";
      const body = fn.match(/as \$\$([\s\S]*?)\$\$;/i)?.[1] ?? "";
      const parameterNames = new Set([...parameters.matchAll(/\b(p_[a-z0-9_]+)\s+[a-z]/gi)].map((match) => match[1].toLowerCase()));
      const declaration = body.match(/^\s*declare\s+([\s\S]*?)\bbegin\b/i)?.[1] ?? "";
      const declaredNames = new Set(
        declaration
          .split(";")
          .map((entry) => entry.trim().match(/^([a-z_][a-z0-9_]*)\s+/i)?.[1]?.toLowerCase())
          .filter(Boolean),
      );
      const targets = [...body.matchAll(/\binto\s+([a-z_][a-z0-9_]*)\b/gi)]
        .map((match) => match[1].toLowerCase())
        .filter((target) => target !== "public"); // Exclude INSERT INTO public.<table>.
      for (const target of targets) {
        expect(declaredNames.has(target) || parameterNames.has(target), `${name}: undeclared INTO target ${target}`).toBe(true);
      }
    }
  });

  test("function signature, ACL, and server caller contract remain unchanged", () => {
    expect(migration).toContain("revoke all on function public.get_sis_import_job_payload(uuid) from public,anon,service_role");
    expect(migration).toContain("grant execute on function public.get_sis_import_job_payload(uuid) to authenticated");
    expect(server).toContain('rpc("get_sis_import_job_payload",{p_job_id:jobId})');
  });
});
