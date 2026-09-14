import { createHash } from "node:crypto";

/**
 * Deterministic JSON canonicalization: object keys sorted recursively, arrays
 * preserved in order (row order is made explicit by callers before hashing).
 */
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

export interface FingerprintInput {
  templateVersion: string;
  organizationId: string;
  schoolId: string;
  /** Sheet name -> normalized rows, in file row order (order is semantically meaningful and preserved). */
  rowsBySheet: Record<string, Array<Record<string, unknown>>>;
}

/**
 * Diagnostic-only duplicate-job signal. NOT an identity mechanism — see
 * B10_DISCOVERY_ARCHITECTURE_IMPORT_CONTRACT.md. Two structurally identical
 * normalized plans hash identically regardless of object-key insertion order;
 * any normalized value change produces a different hash.
 */
export function computeNormalizedPlanFingerprint(input: FingerprintInput): string {
  const sortedSheetNames = Object.keys(input.rowsBySheet).sort();
  const canonical = {
    templateVersion: input.templateVersion,
    organizationId: input.organizationId,
    schoolId: input.schoolId,
    sheets: sortedSheetNames.map((sheet) => ({
      sheet,
      rows: (input.rowsBySheet[sheet] ?? []).map(canonicalize),
    })),
  };
  const json = JSON.stringify(canonical);
  return createHash("sha256").update(json, "utf8").digest("hex");
}
