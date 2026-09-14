/**
 * B10 trusted validation-plan attestation: pure, client-safe helpers.
 *
 * Remediates B10-P3A-SEC-001: without this, any authenticated caller could
 * invoke persist_sis_import_validation directly with fabricated rows/issues/
 * totals and under-declared entity types, and mint a valid confirmation
 * token for a plan the trusted Phase-2 buildSisValidationPlan() pipeline
 * never produced. CHECK constraints on insert only prove syntax, never
 * provenance.
 *
 * This module contains ONLY the canonical payload builder -- deterministic,
 * side-effect-free, safe to import from any bundle (client or server). The
 * actual HMAC signing (which touches a server-only secret) lives in
 * sis-import.attestation.server.ts and must never be imported here.
 *
 * The digest contract mirrors B8's report-card document attestation pattern
 * (concat_ws-joined payload, HMAC-SHA256, hex-encoded) but uses a SEPARATE
 * B10-specific secret/verifier -- B10 and B8 attestation secrets are never
 * interchanged (Gate 21/2 of the remediation).
 *
 * Canonical rows/issues/totals text: rather than re-serializing a jsonb
 * value inside Postgres (which reorders/reformats and would silently break
 * byte-for-byte digest parity), the exact JSON TEXT produced here is what
 * both the SQL persist RPC hashes AND what it parses into jsonb for
 * persistence -- so the attested bytes and the persisted bytes are always
 * identical by construction.
 */
import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export interface PersistedValidationPlanRow {
  sheet: string;
  rowNumber: number;
  entityType: string;
  action: "create" | "update" | "unchanged" | "skip" | "error";
  matchKey?: Record<string, unknown> | null;
  /** Authoritative validation-time DB snapshot used by Phase 3B stale revalidation.
   * It is nested into the HMAC-attested matchKey payload as `expectedState`. */
  expectedState?: Record<string, unknown> | null;
  resolvedEntityId?: string | null;
  raw?: Record<string, unknown> | null;
  normalized?: Record<string, unknown> | null;
}

export interface PersistedValidationPlanIssue {
  rowIndex: number;
  severity: "error" | "warning" | "info";
  code: string;
  field?: string | null;
  rawValue?: string | null;
  normalizedValue?: string | null;
  message: string;
}

export interface CanonicalizedValidationPlan {
  rowsJson: string;
  issuesJson: string;
  totalsJson: string;
}

/**
 * Produces the exact canonical JSON text for rows/issues/totals that both
 * the attestation payload and the persist_sis_import_validation RPC call
 * must use verbatim (as p_rows_json/p_issues_json/p_totals_json). Row order
 * is semantically meaningful (Gate 6's dependency order) and is preserved
 * exactly as given -- only object keys are canonicalized (sorted), never
 * array order.
 */
export function canonicalizePersistedValidationPlan(input: {
  rows: PersistedValidationPlanRow[];
  issues: PersistedValidationPlanIssue[];
  totals: Record<string, unknown>;
}): CanonicalizedValidationPlan {
  const rows = input.rows.map((row) => {
    if (row.expectedState === undefined) return row;
    const { expectedState, ...rest } = row;
    return {
      ...rest,
      matchKey: { identity: row.matchKey ?? null, expectedState: expectedState ?? null },
    };
  });
  return {
    rowsJson: JSON.stringify(rows.map(canonicalize)),
    issuesJson: JSON.stringify(input.issues.map(canonicalize)),
    totalsJson: JSON.stringify(canonicalize(input.totals)),
  };
}

export interface SisImportPlanAttestationInput {
  actorId: string;
  jobId: string;
  expectedPreviousPreviewVersion: number;
  normalizedPlanFingerprint: string | null;
  rowsJson: string;
  issuesJson: string;
  totalsJson: string;
  expiresAtEpochSeconds: number;
}

/**
 * The exact newline-joined payload that gets HMAC-signed server-side and
 * re-derived independently inside verify_sis_import_plan_attestation. Binds
 * job id + expected previous preview version (so an attestation cannot be
 * replayed against a later preview version of the SAME job, nor reused
 * against a DIFFERENT job) and the sha256 digests of the exact rows/issues/
 * totals JSON text about to be persisted (so the caller cannot attest one
 * payload and submit another).
 */
export function sisImportPlanAttestationPayload(input: SisImportPlanAttestationInput): string {
  return [
    "edusmart-sis-import-plan-v1",
    input.actorId,
    input.jobId,
    String(input.expectedPreviousPreviewVersion),
    input.normalizedPlanFingerprint ?? "",
    createHash("sha256").update(input.rowsJson, "utf8").digest("hex"),
    createHash("sha256").update(input.issuesJson, "utf8").digest("hex"),
    createHash("sha256").update(input.totalsJson, "utf8").digest("hex"),
    String(input.expiresAtEpochSeconds),
  ].join("\n");
}
