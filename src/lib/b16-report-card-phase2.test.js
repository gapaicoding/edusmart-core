import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260921150000_b16_report_card_commands_projections.sql",
    import.meta.url,
  ),
  "utf8",
);
const validator = readFileSync(
  new URL("../../supabase/validation/validate_b16_report_card_phase2.sql", import.meta.url),
  "utf8",
);
const contentHardening = readFileSync(
  new URL(
    "../../supabase/migrations/20260921160000_b16_report_card_phase2_hardening.sql",
    import.meta.url,
  ),
  "utf8",
);
const runtimeHardening = readFileSync(
  new URL(
    "../../supabase/migrations/20260921170000_b16_report_card_phase2_runtime_hardening.sql",
    import.meta.url,
  ),
  "utf8",
);
const replayHardening = readFileSync(
  new URL(
    "../../supabase/migrations/20260921180000_b16_report_card_phase2_replay_hardening.sql",
    import.meta.url,
  ),
  "utf8",
);

test("B16 Phase 2 exposes the bounded command and projection inventory", () => {
  for (const name of [
    "b16_report_card_generate_draft",
    "b16_report_card_save_content",
    "b16_report_card_transition",
    "b16_report_card_publish",
    "b16_report_card_create_revision",
    "b16_list_report_cards",
    "b16_get_report_card",
    "b16_list_report_card_candidates",
  ])
    expect(migration).toContain(name);
});

test("B16 mutation SQL derives authority and uses the dedicated ledger", () => {
  expect(migration).toContain("auth.uid()");
  expect(migration).toContain("report_card_command_requests");
  expect(migration).toContain("B16_REPORT_CARD_REQUEST_CONFLICT");
  expect(migration).toContain("B16_REPORT_CARD_STALE_VERSION");
  expect(migration).toContain("set search_path = ''");
  expect(migration).not.toContain("p_actor_id");
  expect(migration).not.toContain("p_role_id");
});

test("B16 preserves lifecycle, revision authority, and CAS separation", () => {
  for (const action of ["submit", "review", "return", "archive"])
    expect(migration).toContain(action);
  expect(migration).not.toContain("published -> revised");
  expect(migration).toContain("report_card.revise_published");
  expect(migration).toContain("row_version");
  expect(migration).toContain("business_version");
  expect(migration).toContain("p_reason text");
});

test("B16 content save is bounded, atomic, and does not ledger raw narrative text", () => {
  expect(migration).toContain("B16_REPORT_CARD_INVALID_CONTENT");
  expect(migration).toContain("B16_REPORT_CARD_PUBLISHED_IMMUTABLE");
  expect(migration).toContain("jsonb_build_object('report_card_id'");
  expect(migration).not.toContain("result_payload=p_content");
  expect(migration).not.toContain("result_payload = p_content");
});

test("B16 validator is future-safe and protects document and portal boundaries", () => {
  expect(validator).toContain("report_card_command_requests");
  expect(validator).toContain("relforcerowsecurity");
  expect(validator).not.toContain("20260921150000");
  expect(validator).not.toContain("reporting.documents");
});

test("B16 forward-only hardening preserves replay and composite result contracts", () => {
  expect(contentHardening).toContain(
    "if v_existing.status = 'completed' then return v_existing.result_payload",
  );
  expect(contentHardening).toContain("v_card_row_version");
  expect(runtimeHardening).toContain("select * into v_result from public.transition_report_card");
  expect(runtimeHardening).toContain("select * into v_result from public.publish_report_card");
  expect(replayHardening).toContain("if v_existing.status='completed' then return query select");
  expect(replayHardening).toContain("report_card_command_requests");
});
