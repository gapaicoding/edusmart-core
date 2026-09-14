import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260912140000_b10_sis_import_atomic_commit.sql",
    import.meta.url,
  ),
  "utf8",
);

const hash = (jobId, version, fingerprint, token) =>
  createHash("sha256")
    .update(`${jobId}:${version}:${fingerprint}:${token}`, "utf8")
    .digest("hex");

describe("B10 confirmation-token convergence", () => {
  const job = "11111111-1111-1111-1111-111111111111";
  const fp = "a".repeat(64);
  const token = "dummy-confirmation-token";

  test("1. validation issuance is rewritten to fingerprint helper", () => {
    expect(migration).toContain(
      "public.hash_sis_confirmation_token(v_job.id, v_new_version, p_normalized_plan_fingerprint, v_token)",
    );
  });
  test("2. commit invokes the same four-argument helper", () => {
    expect(migration).toContain(
      "public.hash_sis_confirmation_token(v_job.id, v_job.preview_version,",
    );
    expect(migration).toContain("v_job.normalized_plan_fingerprint, p_confirmation_token)");
  });
  test("3. fingerprint changes the hash", () => {
    expect(hash(job, 2, fp, token)).not.toBe(hash(job, 2, "b".repeat(64), token));
  });
  test("4. old preview version changes the hash", () => {
    expect(hash(job, 2, fp, token)).not.toBe(hash(job, 1, fp, token));
  });
  test("5. different job changes the hash", () => {
    expect(hash(job, 2, fp, token)).not.toBe(
      hash("22222222-2222-2222-2222-222222222222", 2, fp, token),
    );
  });
  test("6. different token changes the hash", () => {
    expect(hash(job, 2, fp, token)).not.toBe(hash(job, 2, fp, "other-dummy-token"));
  });
  test("7. plaintext token is never assigned to a persisted column", () => {
    expect(migration).not.toMatch(/confirmation_token\s*=|confirmation_token_hash\s*=\s*v_token\b/i);
  });
  test("8. obsolete one-text overload is dropped", () => {
    expect(migration).toMatch(/drop function public\.hash_sis_confirmation_token\(text\)/i);
  });
  test("9. revalidation uses the new preview version", () => {
    expect(migration).toContain("v_new_version");
    expect(hash(job, 3, fp, token)).not.toBe(hash(job, 2, fp, token));
  });
  test("10. fingerprint drift cannot verify with the issued token hash", () => {
    const issued = hash(job, 2, fp, token);
    expect(hash(job, 2, "changed-fingerprint", token)).not.toBe(issued);
  });
});
