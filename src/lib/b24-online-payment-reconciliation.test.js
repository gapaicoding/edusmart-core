import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDevelopmentPaymentAdapter } from "./online-payments.server.ts";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8").toLowerCase();
const migration = read("supabase/migrations/20260929110000_b24_online_payment_reconciliation.sql");
const createIntentFunction = migration
  .split("create or replace function public.b24_create_parent_payment_intent")[1]
  .split("create or replace function public.b24_list_invoice_payment_intents")[0];
const validator = read("supabase/validation/validate_b24_online_payment_reconciliation.sql");
const functions = read("src/lib/online-payments.functions.ts");
const server = read("src/lib/online-payments.server.ts");
const schemas = read("src/lib/online-payments.schemas.ts");
const preferences = read("src/lib/app-preferences.tsx");

describe("B24 online payment and reconciliation contract", () => {
  test("derives the full IDR intent amount from the canonical issued invoice", () => {
    expect(migration).toContain("i.document_status<>'issued'");
    expect(migration).toContain("sum(line_amount_idr)");
    expect(migration).toContain("sum(a.amount_idr)");
    expect(migration).toContain("outstanding:=total-paid");
    expect(createIntentFunction).toContain("'synthetic',outstanding,'idr','pending'");
    expect(migration).toContain("currency text not null default 'idr' check (currency = 'idr')");
  });

  test("protects exact request replay, conflicting fingerprints and one active intent", () => {
    expect(migration).toContain("unique (actor_profile_id, request_id)");
    expect(migration).toContain("req.semantic_fingerprint<>fp");
    expect(migration).toContain("where status = 'pending'");
    expect(migration).toContain(
      "update public.b24_payment_intent_requests set intent_id=active.id",
    );
    expect(schemas).toContain("requestid: uuid");
  });

  test("binds every intent, event and reconciliation to composite B19 ownership", () => {
    expect(migration).toContain("foreign key (invoice_id, organization_id, school_id)");
    expect(migration).toContain("foreign key (intent_id, organization_id, school_id, invoice_id)");
    expect(migration).toContain("foreign key (provider_event_row_id, organization_id, school_id)");
    expect(migration).toContain("b24_parent_can_access_invoice(p_actor_id,i)");
    expect(migration).toContain("student_guardians");
    expect(migration).toContain("finance.portal_read");
  });

  test("deduplicates event identities and protects settlement identity exactly once", () => {
    expect(migration).toContain("unique (provider_key, provider_event_id)");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("existing.fingerprint<>fp");
    expect(migration).toContain("b24_payment_reconciliations_one_settlement_effect");
    expect(migration).toContain("exception when unique_violation");
    expect(migration).toContain("insert into public.finance_payment_allocations");
  });

  test("preserves B19 manual payment and reversal semantics on manual conflicts", () => {
    expect(migration).toContain("('cash','bank_transfer','other','online_provider')");
    expect(migration).toContain("outstanding_changed");
    expect(migration).toContain("'review_required'");
    expect(migration).toMatch(
      /where[\s\S]{0,100}not exists\(select 1 from public\.finance_payment_corrections/,
    );
    expect(migration).not.toMatch(/update public\.finance_payments\s+set/);
  });

  test("denies direct table/RPC access and requires scoped authenticated server handlers", () => {
    for (const table of [
      "b24_payment_intent_requests",
      "b24_online_payment_intents",
      "b24_provider_events",
      "b24_payment_reconciliations",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`enable row level security`);
      expect(migration).toContain(`force row level security`);
    }
    expect(migration).toContain(
      "revoke all on table public.%i from public, anon, authenticated, service_role",
    );
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      "grant execute on function public.b24_simulate_development_payment_event(uuid,jsonb) to service_role",
    );
    expect(migration).toContain(
      "revoke all on function public.b24_simulate_development_payment_event(uuid,jsonb) from public, anon, authenticated",
    );
    expect(functions).toContain("requiresupabaseauth");
    expect(functions).toContain("context.userid");
    expect(functions).toContain('process.env["node_env"] === "production"');
  });

  test("stores normalized event fields only and exposes safe errors", () => {
    expect(migration).toContain("fingerprint text not null");
    expect(migration).toContain("safe_failure_code");
    expect(migration).not.toMatch(/raw_payload|authorization_header|card_number|cvv/);
    expect(server).toContain("reload and try again");
    expect(validator).toContain("b24_raw_payload_column");
  });

  test("development adapter is deterministic, synthetic-only, network-free, and fail-closed", () => {
    expect(() => createDevelopmentPaymentAdapter("production")).toThrow(/disabled in production/i);
    const adapter = createDevelopmentPaymentAdapter("development");
    const input = {
      intent: {
        id: "intent-1",
        amountIdr: 120000,
        createdAt: "2026-09-29T01:00:00.000Z",
        expiresAt: "2026-09-29T01:30:00.000Z",
      },
      eventType: "settled",
      requestId: "1b470892-ecac-4b9f-bca6-a43fb54ae634",
    };
    expect(adapter.normalizeEvent(input)).toEqual(adapter.normalizeEvent(input));
    expect(adapter.normalizeEvent(input).event_id).toBe(
      "test-event-1b470892ecac4b9fbca6a43fb54ae634",
    );
    expect(adapter.normalizeEvent(input).settlement_reference).toMatch(/^test-settlement-/);
  });

  test("includes localized status labels in the application preference catalog", () => {
    for (const key of [
      "payment.online.title",
      "payment.online.pending",
      "payment.online.settled",
      "payment.online.expired",
      "payment.online.unavailable",
      "payment.online.developmentonly",
      "payment.online.reviewrequired",
    ]) {
      expect(preferences).toContain(`"${key}"`);
    }
  });
});
