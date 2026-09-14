import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const ui = readFileSync(join(root, "components/sis-import/sis-import-ui.tsx"), "utf8");
const nav = readFileSync(join(root, "components/app-shell.tsx"), "utf8");
const tree = readFileSync(join(root, "routeTree.gen.ts"), "utf8");
const download = readFileSync(join(import.meta.dir, "sis-download.ts"), "utf8");
const exportServer = readFileSync(join(import.meta.dir, "sis-export.server.ts"), "utf8");
const route = (name) => readFileSync(join(root, `routes/_authenticated/${name}`), "utf8");

describe("Batch 10 Phase 4 route and navigation contract", () => {
  test("all four authenticated routes exist", () => {
    expect(route("sis-imports/index.tsx")).toContain('createFileRoute("/_authenticated/sis-imports/")');
    expect(route("sis-imports/new.tsx")).toContain('createFileRoute("/_authenticated/sis-imports/new")');
    expect(route("sis-imports/$jobId.tsx")).toContain('createFileRoute("/_authenticated/sis-imports/$jobId")');
    expect(route("sis-export.tsx")).toContain('createFileRoute("/_authenticated/sis-export")');
  });

  test("generated route tree contains all routes", () => {
    for (const path of ["/sis-imports/", "/sis-imports/new", "/sis-imports/$jobId", "/sis-export"])
      expect(tree).toContain(`'${path}'`);
  });

  test("navigation adds import/export only to staff SIS group", () => {
    expect(nav).toContain('to: "/sis-imports"');
    expect(nav).toContain('["student.import", "guardian.import", "staff.import", "enrollment.import"]');
    expect(nav).toContain('to: "/sis-export"');
    expect(nav).toContain('["student.export", "guardian.export", "staff.export"]');
    const parent = nav.slice(nav.indexOf('label: "Parent Portal"'), nav.indexOf('label: "Student Portal"'));
    expect(parent).not.toContain("SIS Import");
    expect(parent).not.toContain("SIS Export");
  });
});

describe("Batch 10 Phase 4 import trust boundary", () => {
  test("history uses the server operation", () => expect(ui).toContain("useServerFn(listSisImportJobs)"));
  test("upload sends a real FormData and File", () => {
    expect(ui).toContain("new FormData()");
    expect(ui).toContain('form.set("file", file)');
    expect(ui).not.toMatch(/base64|readAsDataURL/i);
  });
  test("validation submits job id only", () => {
    expect(ui).toContain("validateFn({ data: { jobId } })");
    expect(ui).not.toMatch(/validateFn\(\{\s*data:\s*\{[^}]*\b(rows|issues|entityTypes|fingerprint|planAttestation)\b/s);
  });
  test("confirmation submits job and ephemeral token only", () => {
    expect(ui).toContain("confirmFn({ data: { jobId, confirmationToken } })");
    expect(ui).not.toMatch(/confirmFn\(\{\s*data:\s*\{[^}]*\b(rows|issues|entityTypes|fingerprint|resolved)/s);
  });
  test("client has no direct B10 table access", () => {
    for (const table of ["sis_import_jobs", "sis_import_job_rows", "sis_import_job_issues", "sis_import_entity_refs"])
      expect(ui).not.toContain(`.from(\"${table}\")`);
  });
  test("client has no direct B10 RPC access", () => {
    expect(ui).not.toMatch(/\.rpc\s*\(/);
    expect(ui).not.toContain("commit_sis_import_job");
    expect(ui).not.toContain("persist_sis_import_validation");
  });
  test("client has no direct private storage access", () => expect(ui).not.toMatch(/\.storage\.from|sis-imports\/source/));
  test("client imports no attestation or service-role material", () => {
    expect(ui).not.toContain("sis-import.attestation.server");
    expect(ui).not.toContain("SIS_IMPORT_PLAN_ATTESTATION_SECRET");
    expect(ui).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
  test("confirmation token is never persisted", () => {
    expect(ui).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    expect(ui).toContain("useState<string | null>(null)");
  });
  test("confirmation token is absent from URLs and logs", () => {
    expect(ui).not.toMatch(/URLSearchParams|searchParams|console\.log/);
    expect(ui).not.toMatch(/navigate\([^)]*confirmationToken|to:[^\n]*confirmationToken/);
  });
  test("token clears after success and school/job changes", () => {
    expect(ui).toMatch(/onSuccess:[\s\S]*setConfirmationToken\(null\)[\s\S]*Import completed/);
    expect(ui).toContain("setConfirmationToken(null); setPageError(null)");
  });
  test("stale and invalid token errors clear the token", () => {
    expect(ui).toContain('"B10_STALE_PREVIEW","B10_CONFIRMATION_TOKEN_INVALID"');
    expect(ui).toMatch(/includes\(code\)\) setConfirmationToken\(null\)/);
  });
  test("confirm is gated by zero errors and a token", () => {
    expect(ui).toContain('job.status==="validated" && errors===0 && confirmationToken');
    expect(ui).toContain("errors>0||!confirmationToken");
  });
  test("lost-token state offers explicit revalidation", () => {
    expect(ui).toContain("Revalidate to generate a new confirmation authorization");
    expect(ui).toContain('"Revalidate"');
  });
  test("terminal completed and failed states are rendered", () => {
    expect(ui).toContain('job.status==="completed"');
    expect(ui).toContain("Import completed");
    expect(ui).toContain("Import failed safely");
  });
  test("preview has bounded rendering and action filters", () => {
    expect(ui).toContain("PREVIEW_PAGE_SIZE = 100");
    expect(ui).toContain("filtered.slice");
    for (const action of ["errors", "warnings", "create", "update", "unchanged", "skip"])
      expect(ui).toContain(`\"${action}\"`);
  });
  test("preview and issue display avoid internal UUID labels", () => {
    expect(ui).not.toMatch(/student_id|guardian_id|staff_member_id|profile_id|storage path|token hash|plan attestation/i);
  });
  test("error report uses the server binary operation", () => {
    expect(ui).toContain("useServerFn(downloadSisImportErrors)");
    expect(ui).toContain("downloadBinaryResponse(response");
  });
});

describe("Batch 10 Phase 4 export and download contract", () => {
  test("readiness is queried through a server function", () => {
    expect(ui).toContain("useServerFn(getSisExportReadiness)");
    expect(exportServer).toContain("export const getSisExportReadiness");
  });
  test("reference preparation requires an explicit dialog action", () => {
    expect(ui).toContain("Prepare durable SIS references?");
    expect(ui).toContain("onClick={()=>prepare.mutate()}");
  });
  test("export does not automatically prepare references", () => {
    const generateBody = ui.slice(ui.indexOf("const generate=useMutation"), ui.indexOf("useEffect", ui.indexOf("const generate=useMutation")));
    expect(generateBody).toContain("exportFn");
    expect(generateBody).not.toContain("prepareFn");
  });
  test("export uses server binary download", () => {
    expect(ui).toContain("useServerFn(exportSisData)");
    expect(ui).toContain('downloadBinaryResponse(response,"edusmart-sis-export.xlsx")');
  });
  test("reference results expose counts, not mappings", () => {
    expect(ui).toContain("mintedCount");
    expect(ui).toContain("alreadyMappedCount");
    expect(ui).not.toMatch(/mappingId|entityRefId/);
  });
  test("binary helper uses object URL and revokes it", () => {
    expect(download).toContain("URL.createObjectURL(blob)");
    expect(download).toContain("URL.revokeObjectURL(url)");
    expect(download).not.toContain("data:");
  });
  test("download filenames are sanitized", () => {
    expect(download).toContain("SAFE_FILENAME");
    expect(download).toContain(".replace(SAFE_FILENAME");
  });
});
