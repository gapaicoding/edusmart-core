import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read(
  "supabase/migrations/20260922100000_b17_academic_period_closing_runtime.sql",
);
const validator = read("supabase/validation/validate_b17_academic_period_closing.sql");
const functions = read("src/lib/academic-period.functions.ts");
const ui = read("src/components/academic/period-closure-panel.tsx");
const yearRoute = read("src/routes/_authenticated/academic/years.tsx");
const termRoute = read("src/routes/_authenticated/academic/terms.tsx");

test("B17 readiness is database-owned and emits structured blockers and warnings", () => {
  assert.match(
    migration,
    /b17_term_readiness_internal[\s\S]*?ready',jsonb_array_length\(v_blockers\)=0/,
  );
  assert.match(migration, /b17_year_readiness_internal[\s\S]*?PROGRESSION_UNRESOLVED/);
  for (const code of [
    "ATTENDANCE_NOT_FINAL",
    "ASSESSMENTS_NOT_FINAL",
    "PUBLISHED_ASSESSMENT_SCORES_INCOMPLETE",
    "REPORT_CARDS_INCOMPLETE",
    "TERMS_NOT_CLOSED",
  ]) {
    assert.ok(migration.includes(code), `missing readiness rule ${code}`);
  }
  assert.match(migration, /ENROLLMENTS_WITHOUT_PUBLISHED_REPORT_CARD/);
  assert.match(migration, /severity','blocker/);
  assert.match(migration, /severity','warning/);
});

test("term/year close commands recheck readiness, validate state/CAS, lock rows, and audit", () => {
  assert.match(
    migration,
    /b17_close_term[\s\S]*?for update[\s\S]*?b17_term_readiness_internal[\s\S]*?B17_PERIOD_BLOCKED/,
  );
  assert.match(
    migration,
    /b17_close_academic_year[\s\S]*?for update[\s\S]*?b17_year_readiness_internal[\s\S]*?B17_PERIOD_BLOCKED/,
  );
  assert.match(migration, /B17_STALE_PERIOD/);
  assert.match(migration, /B17_INVALID_TRANSITION/);
  assert.match(migration, /academic_term_closed/);
  assert.match(migration, /academic_year_closed/);
  assert.match(migration, /closed_by_profile_id=auth\.uid\(\)/);
  assert.match(migration, /is_current=false/);
});

test("period command ledger provides actor/command/request replay and payload conflict", () => {
  assert.match(migration, /unique\(actor_profile_id,command_name,request_id\)/);
  assert.match(migration, /payload_fingerprint/);
  assert.match(migration, /B17_REQUEST_CONFLICT/);
  assert.match(migration, /status='completed'/);
  assert.match(migration, /result_payload jsonb/);
  assert.match(migration, /result_size_check/);
  assert.match(migration, /force row level security/);
  assert.match(
    migration,
    /revoke all on public\.academic_period_command_requests from public,anon,authenticated,service_role/,
  );
});

test("close/reopen authority uses canonical scoped capabilities, never caller role", () => {
  for (const permission of [
    "term.close",
    "term.reopen",
    "academic_year.close",
    "academic_year.reopen",
  ]) {
    assert.ok(migration.includes(`'${permission}'`));
  }
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /public\.has_permission\(p_permission,v_org,p_school_id,null\)/);
  assert.doesNotMatch(migration, /p_actor|p_role|role_name|role_code/i);
  assert.match(migration, /B17_REOPEN_REASON_REQUIRED/);
  assert.match(migration, /academic_term_reopened/);
  assert.match(migration, /academic_year_reopened/);
});

test("closed-period guards cover existing operational tables and preserve trusted correction paths", () => {
  const insertHardening = read(
    "supabase/migrations/20260922110000_b17_period_insert_lifecycle_hardening.sql",
  );
  const exceptionHardening = read(
    "supabase/migrations/20260922130000_b17_report_card_revision_exception_runtime.sql",
  );
  for (const table of [
    "timetable_entries",
    "timetable_periods",
    "teaching_assignments",
    "attendance_sessions",
    "student_attendance_records",
    "assessments",
    "student_scores",
    "report_cards",
    "report_card_subject_entries",
    "report_card_narratives",
    "progression_batches",
    "progression_decisions",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `trg_b17_period_lock_[a-z_]+ before insert or update or delete on public\\.${table}`,
      ),
    );
  }
  assert.match(migration, /B17_TERM_CLOSED/);
  assert.match(migration, /B17_ACADEMIC_YEAR_CLOSED/);
  assert.match(migration, /attendance_command_requests[\s\S]*command_kind='correct'/);
  assert.match(migration, /assessment_command_requests[\s\S]*command_name='correct_final_score'/);
  assert.match(
    exceptionHardening,
    /correct_final_score'\s+and c\.status='processing'\s+and mod\(txid_current\(\),4294967296\)=c\.xmin::text::bigint/,
  );
  assert.match(exceptionHardening, /report_card_revision_created/);
  assert.match(
    exceptionHardening,
    /command_name='create_report_card_revision' and c\.status='started'/,
  );
  assert.match(exceptionHardening, /publish_report_card/);
  assert.match(insertHardening, /tg_op='INSERT'[\s\S]*?new\.status not in \('draft','active'\)/);
  assert.match(insertHardening, /before insert or update or delete on public\.academic_years/);
  assert.match(insertHardening, /before insert or update or delete on public\.terms/);
});

test("app RPCs are security-definer with explicit authenticated ACL and safe search path", () => {
  for (const name of [
    "b17_get_term_close_readiness",
    "b17_get_academic_year_close_readiness",
    "b17_close_term",
    "b17_close_academic_year",
    "b17_reopen_term",
    "b17_reopen_academic_year",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `create or replace function public\\.${name}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`,
      ),
    );
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(`));
  }
  assert.match(validator, /RLS_NOT_FORCED/);
  assert.match(validator, /VALIDATION_RPC_ACL/);
});

test("typed server boundary maps safe commands and validates request identity/reason", () => {
  assert.match(functions, /requireSupabaseAuth/);
  for (const rpc of [
    "b17_get_term_close_readiness",
    "b17_get_academic_year_close_readiness",
    "b17_close_term",
    "b17_close_academic_year",
    "b17_reopen_term",
    "b17_reopen_academic_year",
  ]) {
    assert.ok(functions.includes(`"${rpc}"`));
  }
  assert.match(read("src/lib/academic-period.schemas.ts"), /requestId/);
  assert.match(read("src/lib/academic-period.schemas.ts"), /min\(3/);
  assert.match(read("src/lib/academic-period.server.ts"), /B17_PERIOD_BLOCKED/);
  assert.doesNotMatch(functions, /service_role|SERVICE_ROLE/);
});

test("academic UI has deliberate close confirmation, readiness details, reasoned reopen and same-request retry", () => {
  assert.match(ui, /AlertDialogTitle>Close/);
  assert.match(ui, /server will recheck readiness/);
  assert.match(ui, /Confirm close/);
  assert.match(ui, /Retry same request/);
  assert.match(ui, /requestId: crypto\.randomUUID\(\)/);
  assert.match(ui, /retry: false/);
  assert.match(ui, /expectedUpdatedAt: props\.updatedAt/);
  assert.match(ui, /reason is mandatory and audited/);
  assert.match(ui, /allowed=\{hasPermission\(reopenPermission\)\}/);
  assert.match(ui, /readiness\.warnings\.map\(\(item, index\) =>/);
  assert.match(ui, /key=\{`\$\{item\.code\}-\$\{index\}`\}/);
  assert.match(yearRoute, /PeriodClosurePanel/);
  assert.match(termRoute, /PeriodClosurePanel/);
  assert.match(yearRoute, /EDITABLE_ACADEMIC_PERIOD_STATUSES/);
  assert.match(termRoute, /EDITABLE_ACADEMIC_PERIOD_STATUSES/);
  assert.doesNotMatch(yearRoute, /ACADEMIC_YEAR_STATUSES\.map/);
  assert.doesNotMatch(termRoute, /TERM_STATUSES\.map/);
});

test("historical period pages retain read/query paths and readiness is permission-gated", () => {
  assert.match(yearRoute, /listAcademicYears/);
  assert.match(termRoute, /listTerms/);
  assert.match(ui, /enabled: hasPermission\(readPermission\) && props\.status === "active"/);
  assert.match(yearRoute, /hasPermission\("academic_year\.read"\)/);
  assert.match(termRoute, /hasPermission\("term\.read"\)/);
});
