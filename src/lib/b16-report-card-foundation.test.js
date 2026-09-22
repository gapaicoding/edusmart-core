import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\n/g, "\n");

const migration = read("supabase/migrations/20260921140000_b16_report_card_runtime_foundation.sql");
const validator = read("supabase/validation/validate_b16_report_card_foundation.sql");
const preflight = read("supabase/validation/preflight_b16_report_card_runtime.sql");
const reportingServer = read("src/lib/reporting.server.ts");
const reportingFunctions = read("src/lib/reporting.functions.ts");

test("B16 preserves the exact report-card status domain", () => {
  for (const status of ["draft", "submitted", "reviewed", "published", "revised", "archived"]) {
    assert.match(
      read("supabase/migrations/20260815000000_edusmart_canonical_foundation.sql"),
      new RegExp(`'${status}'`),
    );
  }
  assert.doesNotMatch(migration, /create\s+function\s+public\.transition_report_card/i);
});

test("B16 preserves the existing transition contract without adding commands", () => {
  assert.match(reportingServer, /draft:\s*new Set\(\[\"submitted\",\s*\"archived\"\]\)/);
  assert.match(reportingServer, /submitted:\s*new Set\(\[\"reviewed\",\s*\"draft\"\]\)/);
  assert.match(reportingServer, /reviewed:\s*new Set\(\[\"draft\",\s*\"published\"\]\)/);
  assert.match(
    reportingServer,
    /export function canEditSnapshot\(status: string\)[\s\S]*status === \"draft\"/,
  );
  assert.doesNotMatch(migration, /b16_.*(command|projection)|create\s+function\s+public\.b16_/i);
});

test("B16 creates a dedicated bounded report-card command ledger", () => {
  assert.match(migration, /create table public\.report_card_command_requests/i);
  assert.match(migration, /report_card_command_requests_replay_key/);
  assert.match(migration, /payload_fingerprint/);
  assert.match(migration, /result_payload jsonb/);
  assert.match(migration, /pg_column_size\(result_payload\) <= 16384/);
  assert.doesNotMatch(
    migration,
    /create table public\.report_card_command_requests[\s\S]*?(homeroom_comment|before_data|after_data|student_profile|document_contents)/i,
  );
  assert.match(
    migration,
    /revoke all on table public\.report_card_command_requests from public, anon, authenticated, service_role/i,
  );
});

test("B16 separates business revision identity from explicit CAS", () => {
  assert.match(
    migration,
    /comment on column public\.report_cards\.version is[\s\S]*not an optimistic-concurrency CAS field/i,
  );
  for (const table of ["report_cards", "report_card_subject_entries", "report_card_narratives"]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table}[\\s\\S]*add column row_version bigint`, "i"),
    );
    assert.match(migration, new RegExp(`${table}_row_version_positive`));
  }
});

test("B16 uses one database-owned row-version increment trigger per mutable table", () => {
  assert.equal(
    (migration.match(/execute function public\.bump_report_card_row_version\(\)/g) ?? []).length,
    3,
  );
  assert.match(migration, /new\.row_version := old\.row_version \+ 1/);
  assert.doesNotMatch(migration, /row_version\s*=\s*row_version\s*\+/i);
});

test("B16 preserves legacy runtime compatibility and defers UI/Phase-2 cutover", () => {
  assert.match(
    reportingFunctions,
    /transition_report_card|generate_report_card_draft|create_report_card_revision|publish_report_card/,
  );
  assert.match(
    reportingFunctions,
    /updateReportCardComment|updateReportSubjectNarrative|saveReportNarrative/,
  );
  assert.doesNotMatch(migration, /generated_documents|reporting\.documents|pdf|signed_url/i);
  assert.doesNotMatch(migration, /create\s+(or replace\s+)?function\s+public\.b15_/i);
});

test("B16 preserves audit/revision, source, attendance, and portal boundaries", () => {
  assert.match(validator, /audit metadata foundation missing/);
  assert.match(preflight, /generated_document_association_anomaly/);
  assert.match(
    read("supabase/migrations/20260907160000_b8_reporting_integrity.sql"),
    /status='published'/,
  );
  assert.match(
    read("supabase/migrations/20260907160000_b8_reporting_integrity.sql"),
    /max\(rc\.version\)\+1/,
  );
  assert.match(read("src/lib/reporting.server.ts"), /published/);
  assert.doesNotMatch(migration, /create\s+table\s+public\.(generated_documents|portal)/i);
  assert.doesNotMatch(migration, /create\s+function\s+public\.(generate|publish).*document/i);
});

test("B16 validator remains future-safe and B8 remains out of scope", () => {
  assert.doesNotMatch(
    validator,
    /latest migration|20260921140000.*latest|migration.*must.*latest/i,
  );
  assert.match(migration, /Report Card lifecycle\/snapshot runtime foundation only/);
  assert.doesNotMatch(migration, /reporting\.documents|generated_documents|create.*projection/i);
});
