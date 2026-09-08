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
