import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260926100000_b19_finance_billing_foundation.sql";
const migration = readFileSync(migrationPath, "utf8");

const tables = [
  "finance_fee_definitions",
  "finance_billing_plans",
  "finance_billing_plan_versions",
  "finance_billing_plan_targets",
  "finance_invoice_number_counters",
  "finance_invoices",
  "finance_invoice_items",
  "finance_invoice_status_history",
  "finance_payments",
  "finance_payment_allocations",
  "finance_payment_corrections",
  "finance_command_requests",
];

const capabilities = [
  "finance.read",
  "finance.manage_fees",
  "finance.manage_billing",
  "finance.issue",
  "finance.record_payment",
  "finance.adjust",
  "finance.portal_read",
];

test("B19 Phase 1 defines the bounded Finance foundation", () => {
  for (const table of tables) {
    assert.match(migration, new RegExp(`create table public\\.${table}\\s*\\(`, "i"));
  }

  for (const capability of capabilities) {
    assert.match(migration, new RegExp(`['"]${capability.replace(".", "\\.")}['"]`));
  }
  assert.doesNotMatch(
    migration,
    /finance\.admin|finance\.gateway|finance\.refund|finance\.delete|finance\.\*/i,
  );
  assert.doesNotMatch(migration, /create\s+(role|user)|BENDahara|BURSAR|FINANCE_ROLE/i);

  assert.match(migration, /default_amount_idr\s+bigint/i);
  assert.match(migration, /amount_idr\s+bigint/i);
  assert.doesNotMatch(migration, /\b(real|double\s+precision|float)\b/i);
  assert.match(migration, /currency\s+text\s+not null default 'IDR' check \(currency = 'IDR'\)/i);

  assert.match(
    migration,
    /document_status\s+text\s+not null default 'draft' check \(document_status in \('draft','issued','void'\)\)/i,
  );
  assert.doesNotMatch(migration, /document_status[^\n]*\b(overdue|paid|partially_paid)\b/i);
  assert.match(
    migration,
    /finance_invoice_generation_key[\s\S]*where billing_plan_version_id is not null/i,
  );
  assert.match(migration, /finance_allocations_one_per_payment unique \(payment_id\)/i);
  assert.match(
    migration,
    /finance_payment_corrections_one_reversal unique \(original_payment_id\)/i,
  );
  assert.match(
    migration,
    /correction_type\s+text not null default 'reversal' check \(correction_type = 'reversal'\)/i,
  );

  assert.match(
    migration,
    /student_enrollments\(id, student_id, academic_year_id, organization_id, school_id\)/i,
  );
  assert.match(migration, /finance_plan_targets_enrollment_fk/i);
  assert.match(migration, /finance_invoices_plan_version_fk/i);

  for (const table of tables) {
    assert.match(migration, new RegExp(`['"]${table}['"]`, "i"));
  }
  assert.match(migration, /alter table public\.%I enable row level security/i);
  assert.match(migration, /alter table public\.%I force row level security/i);
  assert.match(
    migration,
    /revoke all on public\.%I from public, anon, authenticated, service_role/i,
  );
  assert.match(migration, /grant select on[\s\S]*to authenticated/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all)\s+on[\s\S]*finance_/i);

  for (const helper of [
    "finance_guard_plan_version_immutable",
    "finance_guard_invoice_document",
    "finance_guard_invoice_item_immutable",
    "finance_guard_payment_immutable",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${helper}\\(`, "i"));
  }
  assert.match(migration, /set search_path = ''/i);
  assert.doesNotMatch(migration, /create\s+(or replace\s+)?function\s+public\.b19_/i);

  assert.doesNotMatch(
    migration,
    /midtrans|xendit|qris|virtual account|webhook|gateway|provider_transaction/i,
  );
  assert.doesNotMatch(
    migration,
    /insert\s+into\s+public\.(students|guardians|student_guardians|student_enrollments|class_enrollments|admission_applications)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /\b(update|delete\s+from)\s+public\.(students|guardians|student_guardians|student_enrollments|class_enrollments|academic_years|terms)\b/i,
  );
});

test("B19 Phase 1 keeps the implementation boundary free of Phase 2/UI scope", () => {
  assert.doesNotMatch(
    migration,
    /create\s+(or replace\s+)?function\s+public\.(finance_generate|finance_issue|finance_void|finance_record|finance_allocate|finance_reverse|finance_list|finance_get)/i,
  );
  assert.doesNotMatch(
    migration,
    /create table public\.(notifications|finance_gateway|finance_webhooks|general_ledger|journal_entries)/i,
  );
});
