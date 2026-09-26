import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "bun:test";

const root = join(import.meta.dir, "..", "..");
const migration = readFileSync(
  join(root, "supabase/migrations/20260926110000_b19_finance_billing_runtime.sql"),
  "utf8",
).toLowerCase();
const schemas = readFileSync(join(root, "src/lib/finance.schemas.ts"), "utf8");
const server = readFileSync(join(root, "src/lib/finance.server.ts"), "utf8");
const functions = readFileSync(join(root, "src/lib/finance.functions.ts"), "utf8");
const validator = readFileSync(
  join(root, "supabase/validation/validate_b19_finance_billing_phase2.sql"),
  "utf8",
).toLowerCase();
const aclHardening = readFileSync(
  join(root, "supabase/migrations/20260926120000_b19_finance_parent_acl_hardening.sql"),
  "utf8",
).toLowerCase();
const runtimeCorrection = readFileSync(
  join(root, "supabase/migrations/20260926130000_b19_finance_runtime_ambiguity_fix.sql"),
  "utf8",
).toLowerCase();

const concurrencyFix = readFileSync(
  join(
    root,
    "supabase/migrations/20260926160000_b19_finance_void_payment_concurrency_hardening.sql",
  ),
  "utf8",
).toLowerCase();
const executableFix = concurrencyFix.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
const planReadMigration = readFileSync(
  join(root, "supabase/migrations/20260926170000_b19_finance_plan_read_projections.sql"),
  "utf8",
).toLowerCase();

test("B19 void serializes invoice before CAS and valid settlement", () => {
  const lock = executableFix.indexOf("for update;");
  const cas = executableFix.indexOf("r.row_version is distinct from");
  const settlement = executableFix.indexOf("select coalesce(sum(a.amount_idr)");
  const reject = executableFix.indexOf("if paid <> 0 then");
  const transition = executableFix.indexOf("update public.finance_invoices set");
  expect(lock).toBeGreaterThan(0);
  expect(executableFix.slice(0, lock)).toMatch(
    /from public\.finance_invoices i where i\.id = .*and i\.organization_id = o and i\.school_id =/,
  );
  expect(cas).toBeGreaterThan(lock);
  expect(settlement).toBeGreaterThan(cas);
  expect(reject).toBeGreaterThan(settlement);
  expect(transition).toBeGreaterThan(reject);
  expect(executableFix).toContain("where c.original_payment_id = p.id");
  expect(executableFix).toContain("r.document_status <> 'issued'");
  expect(executableFix).toContain("'b19_finance_stale'");
});

test("B19 concurrency fix preserves replay, scope, audit, and least privilege", () => {
  expect(executableFix).toContain("security definer set search_path = ''");
  expect(executableFix).toContain("b19_finance_authorize('finance.issue'");
  expect(executableFix.indexOf("if existing is not null then return existing;")).toBeLessThan(
    executableFix.indexOf("for update;"),
  );
  expect(executableFix).toContain("public.b19_finance_command_complete(");
  expect(executableFix).toContain("insert into public.finance_invoice_status_history(");
  expect(executableFix).toContain("insert into public.audit_logs(");
  expect(executableFix).toContain("auth.uid()");
  expect(executableFix).toContain(
    "revoke all on function public.b19_void_finance_invoice(jsonb) from public, anon;",
  );
  expect(executableFix).toContain(
    "grant execute on function public.b19_void_finance_invoice(jsonb) to authenticated;",
  );
  expect(executableFix.match(/create or replace function/g)).toHaveLength(1);
  expect(executableFix).not.toMatch(/alter table|set transaction|pg_sleep|create policy/);
});

test("B19 payment keeps invoice lock before settlement and atomic inserts", () => {
  const payment = migration
    .split("create or replace function public.b19_record_finance_payment")[1]
    .split("create or replace function")[0];
  const lock = payment.indexOf("for update;");
  expect(lock).toBeGreaterThan(0);
  expect(payment.indexOf("select coalesce(sum(line_amount_idr)")).toBeGreaterThan(lock);
  expect(payment.indexOf("insert into public.finance_payments")).toBeGreaterThan(lock);
  expect(payment.indexOf("insert into public.finance_payment_allocations")).toBeGreaterThan(lock);
  expect(validator).toContain("b19_phase2_void_lock_order");
});

test("B19 Phase 2 exposes the bounded runtime command/projection inventory", () => {
  for (const name of [
    "b19_create_finance_fee_definition",
    "b19_update_finance_fee_definition",
    "b19_archive_finance_fee_definition",
    "b19_create_finance_billing_plan",
    "b19_create_finance_billing_plan_version",
    "b19_add_finance_billing_plan_target",
    "b19_generate_finance_invoice",
    "b19_generate_finance_invoices",
    "b19_issue_finance_invoice",
    "b19_void_finance_invoice",
    "b19_record_finance_payment",
    "b19_reverse_finance_payment",
    "b19_list_finance_invoices",
    "b19_get_finance_invoice",
    "b19_get_finance_summary",
    "b19_list_finance_payments",
    "b19_list_parent_billing",
    "b19_get_parent_invoice",
  ])
    expect(migration).toContain(name);
  expect(migration).toContain("limit 501");
  expect(migration).toContain("finance_payment_allocations");
  expect(migration).toContain("payment_record");
  expect(migration).toContain("payment_reverse");
});

test("B19 Phase 2 preserves security, money, state, and retry contracts", () => {
  expect(migration).toContain("security definer set search_path = ''");
  expect(migration).toContain("revoke all on function");
  expect(migration).toContain("grant execute");
  expect(migration).toContain("auth.uid()");
  expect(migration).toContain("b19_finance_command_begin");
  expect(migration).toContain("b19_finance_command_complete");
  expect(migration).toContain("b19_finance_assert_open_year");
  expect(migration).toContain("b19_finance_over_allocation");
  expect(migration).toContain("not exists(select 1 from public.finance_payment_corrections");
  expect(migration).not.toContain("document_status in ('paid','partially_paid','overdue')");
  expect(migration).not.toContain("payment gateway");
  expect(migration).not.toContain("midtrans");
  expect(migration).not.toContain("xendit");
  expect(schemas).toContain("MAX_SAFE_INTEGER");
  expect(functions).toContain("createServerFn");
  expect(functions).toContain("requestId");
  expect(server).not.toContain("service_role");
  expect(functions).not.toMatch(/\.from\(["']finance_/);
  expect(validator).toContain("b19_finance_phase2_validation_pass");
  expect(validator).toContain("b19_phase2_anon_functions");
  expect(aclHardening).toContain("revoke all on function public.b19_list_parent_billing");
  expect(aclHardening).toContain("revoke all on function public.b19_get_parent_invoice");
  expect(runtimeCorrection).toContain("where fi.id=v_invoice_id");
});

test("B19 plan reads are bounded, scoped Finance projections", () => {
  for (const name of [
    "b19_list_finance_billing_plans",
    "b19_get_finance_billing_plan",
    "b19_list_finance_billing_plan_versions",
    "b19_get_finance_billing_plan_version",
    "b19_list_finance_billing_plan_targets",
  ]) {
    expect(planReadMigration).toContain("create or replace function public." + name);
    expect(planReadMigration).toContain("revoke all on function public." + name);
  }
  expect(planReadMigration).toContain("security definer set search_path = ''");
  expect(planReadMigration).toContain("b19_finance_authorize('finance.read', p_school_id)");
  expect(planReadMigration).toContain("limit least(greatest(coalesce(p_limit, 50), 1), 100)");
  expect(planReadMigration).toContain("p.school_id = p_school_id");
  expect(planReadMigration).toContain("v.school_id = p_school_id");
  expect(planReadMigration).toContain("t.school_id = p_school_id");
  expect(planReadMigration).not.toContain("organization_id',");
  expect(planReadMigration).toContain("to authenticated;");
  expect(functions).toContain("listFinanceBillingPlans");
  expect(functions).toContain("getFinanceBillingPlan");
  expect(functions).toContain("listFinanceBillingPlanVersions");
  expect(functions).toContain("getFinanceBillingPlanVersion");
  expect(functions).toContain("listFinanceBillingPlanTargets");
  expect(schemas).toContain("financeBillingPlanVersionListInput");
  expect(validator).toContain("b19_phase2_plan_read");
});
