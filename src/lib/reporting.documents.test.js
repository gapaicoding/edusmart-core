import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  generateReportCardPdf,
  reportCardObjectPath,
  reportCardScoreText,
  sha256Hex,
} from "./reporting.pdf.ts";
import {
  REPORT_CARD_SIGNED_URL_TTL_SECONDS,
  canGenerateReportCardDocument,
  isExactReportCardDocument,
  isShortLivedDocumentTtl,
  reportCardDocumentAttestationPayload,
  signReportCardDocumentAttestation,
  verifyReportCardDocumentAttestationForTest,
} from "./reporting.documents.server.ts";
import { reportCardDocumentInput, portalReportCardDocumentInput } from "./reporting.schemas.ts";

const model = {
  reportCardId: "11111111-1111-4111-8111-111111111111",
  version: 2,
  schoolName: "Sekolah Nusa Bangsa",
  studentName: "Nadia José",
  academicYearName: "2026/2027",
  termName: "Semester 1",
  publishedAt: "2026-09-07T12:00:00.000Z",
  subjects: [
    {
      subjectName: "Mathematics",
      finalScore: 0,
      predicate: "Developing",
      narrative: "Keeps improving.",
    },
    { subjectName: "Science", finalScore: null, predicate: null, narrative: null },
  ],
  attendance: {
    finalizedSessionCount: 2,
    counts: { present: 1, late: 0, excused: 0, sick: 0, absent: 1, other: 0 },
  },
  homeroomComment: "A thoughtful learner.",
  narratives: [{ title: "Character", content: "Shows care for classmates." }],
};

describe("Report Card document identity and policy model", () => {
  test("uses attestation-bound random and version-isolated paths", () => {
    const base = {
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      schoolId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      reportCardId: model.reportCardId,
    };
    const generationId = "55555555-5555-4555-8555-555555555555";
    expect(reportCardObjectPath({ ...base, version: 1, generationId })).toBe(
      `${base.organizationId}/${base.schoolId}/report-cards/${base.reportCardId}/v1/${generationId}/report-card.pdf`,
    );
    expect(reportCardObjectPath({ ...base, version: 1, generationId })).not.toBe(
      reportCardObjectPath({ ...base, version: 2, generationId }),
    );
  });

  test("generation accepts published only", () => {
    expect(canGenerateReportCardDocument("published")).toBe(true);
    for (const status of ["draft", "submitted", "reviewed", "revised", "archived"])
      expect(canGenerateReportCardDocument(status)).toBe(false);
  });

  test("metadata must bind exact Report Card, type, bucket, and path", () => {
    const base = {
      reportCardId: model.reportCardId,
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      schoolId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      version: 2,
      entityId: model.reportCardId,
      entityType: "report_card",
      documentType: "report_card_pdf",
      bucket: "report-cards",
    };
    const objectPath = reportCardObjectPath({
      ...base,
      generationId: "55555555-5555-4555-8555-555555555555",
    });
    expect(isExactReportCardDocument({ ...base, objectPath })).toBe(true);
    expect(
      isExactReportCardDocument({
        ...base,
        entityId: "22222222-2222-4222-8222-222222222222",
        objectPath,
      }),
    ).toBe(false);
    expect(isExactReportCardDocument({ ...base, documentType: "other", objectPath })).toBe(false);
    expect(
      isExactReportCardDocument({ ...base, objectPath: objectPath.replace("/v2/", "/v1/") }),
    ).toBe(false);
  });

  test("signed links use a short fixed TTL", () => {
    expect(REPORT_CARD_SIGNED_URL_TTL_SECONDS).toBe(120);
    expect(isShortLivedDocumentTtl(REPORT_CARD_SIGNED_URL_TTL_SECONDS)).toBe(true);
    expect(isShortLivedDocumentTtl(3600)).toBe(false);
  });

  test("download inputs reject unknown and tampered metadata identifiers", () => {
    expect(reportCardDocumentInput.safeParse({ reportCardId: "unknown" }).success).toBe(false);
    expect(
      reportCardDocumentInput.safeParse({
        reportCardId: model.reportCardId,
        fileAssetId: "22222222-2222-4222-8222-222222222222",
      }).success,
    ).toBe(false);
    expect(
      portalReportCardDocumentInput.safeParse({
        studentId: "33333333-3333-4333-8333-333333333333",
        reportCardId: model.reportCardId,
        generatedDocumentId: "44444444-4444-4444-8444-444444444444",
      }).success,
    ).toBe(false);
  });
});

describe("trusted server document attestation", () => {
  const secret = "test-only-authority-secret-with-at-least-32-bytes";
  const input = {
    actorId: "66666666-6666-4666-8666-666666666666",
    reportCardId: model.reportCardId,
    version: 1,
    organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    schoolId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    objectPath:
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/report-cards/11111111-1111-4111-8111-111111111111/v1/55555555-5555-4555-8555-555555555555/report-card.pdf",
    sizeBytes: 2048,
    checksum: "a".repeat(64),
    expiresAtEpochSeconds: 2_000_000_000,
  };
  const proof = signReportCardDocumentAttestation(input, secret);

  test("accepts the exact server-generated contract", () => {
    expect(verifyReportCardDocumentAttestationForTest(input, proof, secret, 1_999_999_900)).toBe(
      true,
    );
    expect(reportCardDocumentAttestationPayload(input)).toContain(input.objectPath);
  });

  test("denies arbitrary PDF self-registration without trusted proof", async () => {
    const arbitrary = new TextEncoder().encode("%PDF- arbitrary attacker bytes");
    const attackerClaim = {
      ...input,
      sizeBytes: arbitrary.length,
      checksum: await sha256Hex(arbitrary),
    };
    expect(
      verifyReportCardDocumentAttestationForTest(
        attackerClaim,
        "0".repeat(64),
        secret,
        1_999_999_900,
      ),
    ).toBe(false);
  });

  test("binds bytes, checksum, size, Report Card, version, and path", () => {
    const changes = [
      { checksum: "b".repeat(64) },
      { sizeBytes: input.sizeBytes + 1 },
      { version: 2 },
      { reportCardId: "22222222-2222-4222-8222-222222222222" },
      { objectPath: input.objectPath.replace("/v1/", "/v2/") },
    ];
    for (const change of changes)
      expect(
        verifyReportCardDocumentAttestationForTest(
          { ...input, ...change },
          proof,
          secret,
          1_999_999_900,
        ),
      ).toBe(false);
  });

  test("denies expired or excessively future-dated proof", () => {
    expect(verifyReportCardDocumentAttestationForTest(input, proof, secret, 2_000_000_000)).toBe(
      false,
    );
    expect(verifyReportCardDocumentAttestationForTest(input, proof, secret, 1_999_999_000)).toBe(
      false,
    );
  });
});

describe("Report Card PDF", () => {
  test("preserves null versus zero score semantics", () => {
    expect(reportCardScoreText(null)).toBe("No published result");
    expect(reportCardScoreText(0)).toBe("0");
  });

  test("SHA-256 is deterministic over actual bytes", async () => {
    const bytes = new TextEncoder().encode("pdf bytes");
    expect(await sha256Hex(bytes)).toBe(await sha256Hex(bytes));
    expect(await sha256Hex(bytes)).toHaveLength(64);
  });

  test("generates a real non-empty PDF using the safe view model", async () => {
    const fontUrl = import.meta
      .resolve("@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff");
    const font = new Uint8Array(await readFile(fileURLToPath(fontUrl)));
    const bytes = await generateReportCardPdf(model, font);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1500);
    expect(Object.keys(model)).not.toContain("source_calculation");
    expect(Object.keys(model.attendance)).toEqual(["finalizedSessionCount", "counts"]);
  });
});

test("R3 migration keeps Storage and function ACLs narrowly scoped", async () => {
  const migrationUrl = new URL(
    "../../supabase/migrations/20260907200000_b8_reporting_documents.sql",
    import.meta.url,
  );
  const sql = await readFile(migrationUrl, "utf8");
  const r1 = await readFile(
    new URL("../../supabase/migrations/20260907160000_b8_reporting_integrity.sql", import.meta.url),
    "utf8",
  );
  const validator = await readFile(
    new URL("../../supabase/validation/validate_b8_reporting_documents.sql", import.meta.url),
    "utf8",
  );
  expect(sql).toContain("values ('report-cards', 'report-cards', false");
  expect(sql).toContain("where entity_type = 'report_card' and document_type = 'report_card_pdf'");
  expect(sql).toContain("create policy report_card_documents_insert");
  expect(sql).toContain("create policy report_card_documents_select");
  expect(sql).not.toMatch(/create policy[\s\S]*for update to authenticated[\s\S]*report-cards/i);
  expect(sql).toContain(
    "revoke all on function public.register_report_card_document(uuid,text,bigint,text,bigint,text) from public, anon, authenticated, service_role",
  );
  expect(sql).not.toMatch(/grant execute[^;]+service_role/i);
  expect(sql).not.toContain(
    "grant execute on function public.report_card_document_object_path(uuid,uuid) to authenticated",
  );
  expect(sql).toContain("public.verify_report_card_document_attestation(");
  expect(sql).toContain("vault.decrypted_secrets");
  const verifier = sql.match(
    /create or replace function public\.verify_report_card_document_attestation\([\s\S]*?\n\$\$;/i,
  )?.[0];
  expect(verifier).toBeDefined();
  expect(verifier).toMatch(
    /select count\(\*\), min\(ds\.decrypted_secret\)[\s\S]*from vault\.decrypted_secrets ds/i,
  );
  expect(verifier).not.toMatch(/select\s+secret\s+into/i);
  expect(verifier).not.toMatch(/(?:min|max)\(ds\.secret\)/i);
  expect(verifier).toContain("v_secret_count <> 1");
  expect(sql).not.toMatch(/length\(secret\)\s*>=\s*32/i);
  expect(validator).toMatch(/length\(decrypted_secret\)\s*>=\s*32/i);
  expect(validator).not.toMatch(/length\(secret\)\s*>=\s*32/i);
  expect(validator).toContain("v_def ilike '%select secret into%'");
  expect(validator).toContain("v_def ilike '%min(ds.secret)%'");
  expect(sql).toContain("extensions.hmac");
  expect(sql).toContain("p_attestation_expires_at");
  expect(sql).toContain("p_object_path");
  expect(sql).toContain("from storage.objects o");
  expect(sql).not.toContain(
    "grant execute on function public.verify_report_card_document_attestation",
  );
  expect(sql).toContain("public.can_access_report_card('report_card.download', rc.id)");
  expect(r1).toContain("sg.status='active' and sg.can_view_academic");
  expect(sql).toContain("v_rc.status <> 'published'");
});

test("browser-facing document functions never return or read authority secrets", async () => {
  const functionsSource = await readFile(
    new URL("./reporting.documents.functions.ts", import.meta.url),
    "utf8",
  );
  expect(functionsSource).not.toContain("REPORT_CARD_DOCUMENT_ATTESTATION_SECRET");
  expect(functionsSource).not.toMatch(/return\s*\{[^}]*attestation/is);
});

test("R3 validator recognizes the escaped canonical path contract and rejects weakened variants", async () => {
  const validator = await readFile(
    new URL("../../supabase/validation/validate_b8_reporting_documents.sql", import.meta.url),
    "utf8",
  );
  const assertion = validator.match(
    /select pg_get_functiondef\('public\.can_write_report_card_document_object\(text\)'::regprocedure\)[\s\S]*?raise exception 'B8 R3 path\/write contract incomplete';/i,
  )?.[0];
  expect(assertion).toBeDefined();
  expect(assertion).toContain("position('/report-card\\.pdf$' in v_def) = 0");
  expect(validator).toContain("select 'B8 reporting document validation passed' as result");
  for (const required of [
    "p_object_path ~",
    "/report-cards/",
    "/v[1-9][0-9]*/",
    "/report-card\\.pdf$",
    "split_part(p_object_path, '/', 4)::uuid",
    "split_part(p_object_path, '/', 6)::uuid",
    "p_object_path = public.report_card_document_object_path",
    "status = 'published'",
    "has_staff_scope_permission%report_card.download",
  ])
    expect(assertion).toContain(required.replaceAll("'", "''"));

  const accepts = (definition) =>
    definition.includes("p_object_path ~") &&
    definition.includes("/report-cards/") &&
    definition.includes("/v[1-9][0-9]*/") &&
    definition.includes("/report-card\\.pdf$") &&
    definition.includes("split_part(p_object_path, '/', 4)::uuid") &&
    definition.includes("split_part(p_object_path, '/', 6)::uuid") &&
    definition.includes("p_object_path = public.report_card_document_object_path") &&
    definition.includes("status = 'published'") &&
    definition.includes("has_staff_scope_permission('report_card.download'");
  const deployedShape = `p_object_path ~ '/report-cards/x/v[1-9][0-9]*/uuid/report-card\\.pdf$'
split_part(p_object_path, '/', 4)::uuid
split_part(p_object_path, '/', 6)::uuid
p_object_path = public.report_card_document_object_path
status = 'published'
has_staff_scope_permission('report_card.download'`;
  expect(accepts(deployedShape)).toBe(true);
  expect(accepts(deployedShape.replace("/report-card\\.pdf$", "/anything\\.pdf$"))).toBe(false);
  expect(accepts(deployedShape.replace("/report-card\\.pdf$", ""))).toBe(false);
  expect(accepts(deployedShape.replace("status = 'published'", ""))).toBe(false);
  expect(accepts(deployedShape.replace("has_staff_scope_permission", "removed_permission"))).toBe(
    false,
  );
});

// --------------------------------------------------------------------------
// B8-LIVE-002: canonical tenant document-path compatibility
// --------------------------------------------------------------------------

// Regression fixtures ONLY (not runtime logic): real Development tenant /
// report-card identifiers whose UUID version + variant nibbles are NOT RFC
// 4122 version 1-5 / variant [89ab] values, plus a trusted UUIDv4 nonce.
const LIVE_002 = {
  organizationId: "a08b610f-9619-ad04-2d76-712dd0d7a537",
  schoolId: "8404d1b7-28be-a36a-9f84-c07d95d37527",
  reportCardV2Id: "9fa196ef-3eba-48cf-b890-2e69c24c8943",
  generationV4: "55555555-5555-4555-8555-555555555555",
};

// Mirror of the corrected SQL structural pre-filter in
// 20260908190000_b8_reporting_document_path_uuid_compatibility.sql.
const CANONICAL_DOCUMENT_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/report-cards\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/v[1-9][0-9]*\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/report-card\.pdf$/;

const live002Path = (o) => {
  const p = {
    org: LIVE_002.organizationId,
    school: LIVE_002.schoolId,
    rc: LIVE_002.reportCardV2Id,
    v: "v2",
    gen: LIVE_002.generationV4,
    file: "report-card.pdf",
    ...o,
  };
  return `${p.org}/${p.school}/report-cards/${p.rc}/${p.v}/${p.gen}/${p.file}`;
};

describe("B8-LIVE-002 canonical tenant document path contract", () => {
  test("accepts valid PostgreSQL UUID tenant/report-card ids without RFC-version bits", () => {
    expect(CANONICAL_DOCUMENT_PATH.test(live002Path())).toBe(true);
    expect(LIVE_002.organizationId[14]).toBe("a");
    expect(LIVE_002.schoolId[14]).toBe("a");
  });

  test("keeps the strict UUIDv4 contract for the trusted generation nonce", () => {
    expect(
      CANONICAL_DOCUMENT_PATH.test(live002Path({ gen: "55555555-5555-1555-8555-555555555555" })),
    ).toBe(false);
    expect(
      CANONICAL_DOCUMENT_PATH.test(live002Path({ gen: "55555555-5555-4555-7555-555555555555" })),
    ).toBe(false);
    expect(CANONICAL_DOCUMENT_PATH.test(live002Path({ gen: "not-a-uuid" }))).toBe(false);
  });

  test("still rejects tampered tenant / card / version / filename / structure", () => {
    expect(CANONICAL_DOCUMENT_PATH.test(live002Path({ org: "not-a-uuid" }))).toBe(false);
    expect(CANONICAL_DOCUMENT_PATH.test(live002Path({ school: "8404d1b7-28be-a36a-9f84" }))).toBe(
      false,
    );
    expect(CANONICAL_DOCUMENT_PATH.test(live002Path({ rc: "" }))).toBe(false);
    expect(CANONICAL_DOCUMENT_PATH.test(live002Path({ v: "v0" }))).toBe(false);
    expect(CANONICAL_DOCUMENT_PATH.test(live002Path({ v: "vx" }))).toBe(false);
    expect(CANONICAL_DOCUMENT_PATH.test(live002Path({ file: "summary.pdf" }))).toBe(false);
    expect(CANONICAL_DOCUMENT_PATH.test(live002Path({ file: "report-card.PDF" }))).toBe(false);
    expect(CANONICAL_DOCUMENT_PATH.test(live002Path() + "/extra")).toBe(false);
    expect(
      CANONICAL_DOCUMENT_PATH.test(live002Path().replace("/report-cards/", "/report-cards/../")),
    ).toBe(false);
    expect(CANONICAL_DOCUMENT_PATH.test(live002Path().replace(`/${LIVE_002.schoolId}`, ""))).toBe(
      false,
    );
    expect(CANONICAL_DOCUMENT_PATH.test(live002Path().toUpperCase())).toBe(false);
  });

  test("server path builder already agrees with the corrected canonical contract", () => {
    const built = reportCardObjectPath({
      organizationId: LIVE_002.organizationId,
      schoolId: LIVE_002.schoolId,
      reportCardId: LIVE_002.reportCardV2Id,
      version: 2,
      generationId: LIVE_002.generationV4,
    });
    expect(CANONICAL_DOCUMENT_PATH.test(built)).toBe(true);
    expect(
      isExactReportCardDocument({
        reportCardId: LIVE_002.reportCardV2Id,
        organizationId: LIVE_002.organizationId,
        schoolId: LIVE_002.schoolId,
        version: 2,
        entityId: LIVE_002.reportCardV2Id,
        entityType: "report_card",
        documentType: "report_card_pdf",
        bucket: "report-cards",
        objectPath: built,
      }),
    ).toBe(true);
  });
});

test("B8-LIVE-002 forward migration replaces path helpers without weakening authority", async () => {
  const sql = await readFile(
    new URL(
      "../../supabase/migrations/20260908190000_b8_reporting_document_path_uuid_compatibility.sql",
      import.meta.url,
    ),
    "utf8",
  );
  expect(sql).not.toMatch(/drop\s+(function|policy|table)/i);
  expect(sql).not.toMatch(/alter\s+table|create\s+table|create\s+policy/i);
  for (const fn of [
    "public.can_write_report_card_document_object(p_object_path text)",
    "public.can_staff_download_report_card_document_object(p_object_path text)",
    "public.can_read_report_card_document_object(p_object_path text)",
    "public.register_report_card_document(",
  ])
    expect(sql).toContain(`create or replace function ${fn}`);
  expect(sql).toContain(
    "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/report-cards/",
  );
  expect(sql).toContain("4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/report-card\\.pdf$");
  expect(sql).not.toContain("[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab]");
  expect(sql).toContain("p_object_path = public.report_card_document_object_path(rc.id");
  expect(sql).toContain("rc.status = 'published'");
  expect(sql).toContain("has_staff_scope_permission('report_card.download'");
  expect(sql).toContain("verify_report_card_document_attestation(");
  expect(sql).toContain(
    "revoke all on function public.register_report_card_document(uuid,text,bigint,text,bigint,text) from public, anon, authenticated, service_role",
  );
  expect(sql).not.toMatch(/grant execute[^;]+service_role/i);
  expect(sql).not.toMatch(/grant execute[^;]+ anon\b/i);
  expect(sql).not.toContain(
    "grant execute on function public.report_card_document_object_path(uuid,uuid) to authenticated",
  );
  for (const g of [
    "public.can_write_report_card_document_object(text) to authenticated",
    "public.can_staff_download_report_card_document_object(text) to authenticated",
    "public.can_read_report_card_document_object(text) to authenticated",
    "public.register_report_card_document(uuid,text,bigint,text,bigint,text) to authenticated",
  ])
    expect(sql).toContain(`grant execute on function ${g}`);
});

test("B8-LIVE-002 validator detects regression to the over-strict tenant UUID regex", async () => {
  const validator = await readFile(
    new URL("../../supabase/validation/validate_b8_reporting_documents.sql", import.meta.url),
    "utf8",
  );
  expect(validator).toContain("B8 LIVE-002 regression");
  expect(validator).toContain("[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/");
  expect(validator).toContain(
    "/v[1-9][0-9]*/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/report-card\\.pdf$",
  );
  expect(validator).toContain("register_report_card_document(uuid,text,bigint,text,bigint,text)");
});

test("applied B8 migrations are byte-for-byte unchanged on this branch", async () => {
  const { execSync } = await import("node:child_process");
  const out = execSync(
    'git diff --stat a887d3427199a21f3197d37b810ca8f8c7045c77 -- "supabase/migrations/20260907160000_b8_reporting_integrity.sql" "supabase/migrations/20260907200000_b8_reporting_documents.sql"',
    { cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8" },
  );
  expect(out.trim()).toBe("");
});
