/**
 * B10 trusted validation-plan attestation: server-only HMAC signer.
 *
 * Split out of sis-import.attestation.ts specifically so this file -- the
 * only one that touches SIS_IMPORT_PLAN_ATTESTATION_SECRET -- never reaches
 * a client bundle. Phase 3C's server orchestration function is the only
 * intended caller: it builds the canonical plan via
 * canonicalizePersistedValidationPlan(), computes the attestation here, and
 * passes rowsJson/issuesJson/totalsJson + the attestation + its expiry to
 * persist_sis_import_validation.
 *
 * Deployment prerequisite (B10-D): SIS_IMPORT_PLAN_ATTESTATION_SECRET must
 * be configured (>= 32 bytes) wherever this server code runs, and a matching
 * secret named b10_sis_import_plan_attestation_hmac must exist in Supabase
 * Vault -- separate from B8's report-card secret. No secret value is
 * created or printed by this module.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  sisImportPlanAttestationPayload,
  type SisImportPlanAttestationInput,
} from "./sis-import.attestation";

export const SIS_IMPORT_PLAN_ATTESTATION_SECRET_ENV = "SIS_IMPORT_PLAN_ATTESTATION_SECRET";
export const SIS_IMPORT_PLAN_ATTESTATION_TTL_SECONDS = 120;

function planAttestationSecret() {
  const secret = process.env[SIS_IMPORT_PLAN_ATTESTATION_SECRET_ENV];

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("SIS import plan attestation authority is not configured.");
  }

  return secret;
}

export function signSisImportPlanAttestation(
  input: SisImportPlanAttestationInput,
  secret = planAttestationSecret(),
) {
  return createHmac("sha256", secret)
    .update(sisImportPlanAttestationPayload(input), "utf8")
    .digest("hex");
}

/** Test-only local verification mirror of the DB-side check; never used at runtime. */
export function verifySisImportPlanAttestationForTest(
  input: SisImportPlanAttestationInput,
  attestation: string,
  secret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
) {
  if (
    input.expiresAtEpochSeconds <= nowEpochSeconds ||
    input.expiresAtEpochSeconds > nowEpochSeconds + 300
  ) {
    return false;
  }

  if (!/^[0-9a-f]{64}$/.test(attestation)) {
    return false;
  }

  const expected = Buffer.from(signSisImportPlanAttestation(input, secret), "hex");
  const supplied = Buffer.from(attestation, "hex");

  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
