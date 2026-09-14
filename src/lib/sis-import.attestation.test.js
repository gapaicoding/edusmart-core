import { describe, expect, test } from "bun:test";
import {
  canonicalizePersistedValidationPlan,
  sisImportPlanAttestationPayload,
} from "./sis-import.attestation";
import {
  signSisImportPlanAttestation,
  verifySisImportPlanAttestationForTest,
} from "./sis-import.attestation.server";

// TEST-ONLY dummy secret. Never the real SIS_IMPORT_PLAN_ATTESTATION_SECRET
// or Vault b10_sis_import_plan_attestation_hmac value.
const TEST_SECRET = "b10-test-only-attestation-secret-do-not-use-in-prod";

const baseRows = [
  {
    sheet: "Students",
    rowNumber: 2,
    entityType: "student",
    action: "create",
    matchKey: { studentRef: "stu-001" },
    resolvedEntityId: null,
    raw: { student_ref: "STU-001" },
    normalized: { student_ref: "stu-001" },
  },
];
const baseIssues = [
  { rowIndex: 0, severity: "warning", code: "B10_CREATE_AS_TERMINAL_STATUS", message: "test" },
];
const baseTotals = { create: 1, update: 0, unchanged: 0, skip: 0, error: 0, warning: 1 };

function baseAttestationInput() {
  const canonical = canonicalizePersistedValidationPlan({
    rows: baseRows,
    issues: baseIssues,
    totals: baseTotals,
  });
  return {
    actorId: "actor-1",
    jobId: "job-1",
    expectedPreviousPreviewVersion: 0,
    normalizedPlanFingerprint: "fp-abc",
    rowsJson: canonical.rowsJson,
    issuesJson: canonical.issuesJson,
    totalsJson: canonical.totalsJson,
    expiresAtEpochSeconds: Math.floor(Date.now() / 1000) + 60,
  };
}

describe("canonicalizePersistedValidationPlan", () => {
  test("preserves row order but sorts object keys", () => {
    const reorderedRows = [{ ...baseRows[0], normalized: { student_ref: "stu-001" } }];
    const canonicalA = canonicalizePersistedValidationPlan({
      rows: baseRows,
      issues: baseIssues,
      totals: baseTotals,
    });
    const canonicalB = canonicalizePersistedValidationPlan({
      rows: reorderedRows,
      issues: baseIssues,
      totals: { warning: 1, error: 0, skip: 0, unchanged: 0, update: 0, create: 1 },
    });
    expect(canonicalA.rowsJson).toBe(canonicalB.rowsJson);
    expect(canonicalA.totalsJson).toBe(canonicalB.totalsJson);
  });
});

describe("sisImportPlanAttestationPayload / signSisImportPlanAttestation", () => {
  test("same payload twice -> same attestation", () => {
    const input = baseAttestationInput();
    expect(signSisImportPlanAttestation(input, TEST_SECRET)).toBe(
      signSisImportPlanAttestation(input, TEST_SECRET),
    );
  });

  test("row change -> different attestation", () => {
    const input = baseAttestationInput();
    const changedCanonical = canonicalizePersistedValidationPlan({
      rows: [{ ...baseRows[0], normalized: { student_ref: "stu-002" } }],
      issues: baseIssues,
      totals: baseTotals,
    });
    const changed = { ...input, rowsJson: changedCanonical.rowsJson };
    expect(signSisImportPlanAttestation(input, TEST_SECRET)).not.toBe(
      signSisImportPlanAttestation(changed, TEST_SECRET),
    );
  });

  test("issue change -> different attestation", () => {
    const input = baseAttestationInput();
    const changedCanonical = canonicalizePersistedValidationPlan({
      rows: baseRows,
      issues: [{ ...baseIssues[0], severity: "error" }],
      totals: baseTotals,
    });
    const changed = { ...input, issuesJson: changedCanonical.issuesJson };
    expect(signSisImportPlanAttestation(input, TEST_SECRET)).not.toBe(
      signSisImportPlanAttestation(changed, TEST_SECRET),
    );
  });

  test("job id change -> different attestation (no cross-job reuse)", () => {
    const input = baseAttestationInput();
    const changed = { ...input, jobId: "job-2" };
    expect(signSisImportPlanAttestation(input, TEST_SECRET)).not.toBe(
      signSisImportPlanAttestation(changed, TEST_SECRET),
    );
  });

  test("preview version change -> different attestation (no replay across versions)", () => {
    const input = baseAttestationInput();
    const changed = { ...input, expectedPreviousPreviewVersion: 1 };
    expect(signSisImportPlanAttestation(input, TEST_SECRET)).not.toBe(
      signSisImportPlanAttestation(changed, TEST_SECRET),
    );
  });

  test("fingerprint change -> different attestation", () => {
    const input = baseAttestationInput();
    const changed = { ...input, normalizedPlanFingerprint: "fp-xyz" };
    expect(signSisImportPlanAttestation(input, TEST_SECRET)).not.toBe(
      signSisImportPlanAttestation(changed, TEST_SECRET),
    );
  });

  test("payload string is deterministic and newline-joined", () => {
    const input = baseAttestationInput();
    const payload = sisImportPlanAttestationPayload(input);
    expect(payload.startsWith("edusmart-sis-import-plan-v1\n")).toBe(true);
    expect(payload.split("\n")).toHaveLength(9);
  });
});

describe("verifySisImportPlanAttestationForTest", () => {
  test("accepts a valid, unexpired attestation", () => {
    const input = baseAttestationInput();
    const attestation = signSisImportPlanAttestation(input, TEST_SECRET);
    expect(verifySisImportPlanAttestationForTest(input, attestation, TEST_SECRET)).toBe(true);
  });

  test("rejects a forged attestation", () => {
    const input = baseAttestationInput();
    const forged = "0".repeat(64);
    expect(verifySisImportPlanAttestationForTest(input, forged, TEST_SECRET)).toBe(false);
  });

  test("rejects an attestation signed with a different secret", () => {
    const input = baseAttestationInput();
    const attestation = signSisImportPlanAttestation(input, "a-different-32-byte-min-secret!!");
    expect(verifySisImportPlanAttestationForTest(input, attestation, TEST_SECRET)).toBe(false);
  });

  test("rejects an expired attestation", () => {
    const input = {
      ...baseAttestationInput(),
      expiresAtEpochSeconds: Math.floor(Date.now() / 1000) - 10,
    };
    const attestation = signSisImportPlanAttestation(input, TEST_SECRET);
    expect(verifySisImportPlanAttestationForTest(input, attestation, TEST_SECRET)).toBe(false);
  });

  test("rejects an attestation reused for a different job (no cross-job reuse)", () => {
    const input = baseAttestationInput();
    const attestation = signSisImportPlanAttestation(input, TEST_SECRET);
    const otherJob = { ...input, jobId: "job-2" };
    expect(verifySisImportPlanAttestationForTest(otherJob, attestation, TEST_SECRET)).toBe(false);
  });

  test("rejects an attestation replayed after the preview version advances", () => {
    const input = baseAttestationInput();
    const attestation = signSisImportPlanAttestation(input, TEST_SECRET);
    const nextVersion = {
      ...input,
      expectedPreviousPreviewVersion: input.expectedPreviousPreviewVersion + 1,
    };
    expect(verifySisImportPlanAttestationForTest(nextVersion, attestation, TEST_SECRET)).toBe(
      false,
    );
  });
});
