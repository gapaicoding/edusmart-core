import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationName = "20260914120000_b11_attendance_completion_foundation.sql";
const migration = readFileSync(join(root, "supabase", "migrations", migrationName), "utf8");
const validator = readFileSync(
  join(root, "supabase", "validation", "validate_b11_attendance_completion.sql"),
  "utf8",
);
const legacyServer = readFileSync(join(root, "src", "lib", "attendance.functions.ts"), "utf8");
const preflight = readFileSync(
  join(root, "supabase", "validation", "preflight_b11_attendance_legacy_data.sql"),
  "utf8",
);
const normalized = migration.replace(/\s+/g, " ").toLowerCase();

function functionBody(name) {
  const start = migration.toLowerCase().indexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThan(-1);
  const rest = migration.slice(start);
  const end = rest.indexOf("\n$$;");
  expect(end).toBeGreaterThan(-1);
  return rest.slice(0, end + 4).toLowerCase();
}

describe("B11 forward migration boundary", () => {
  test("is the only B11 forward migration and follows B10", () => {
    const names = readdirSync(join(root, "supabase", "migrations")).filter((x) =>
      x.includes("b11"),
    );
    expect(names).toEqual([migrationName]);
    expect(Number(migrationName.slice(0, 14))).toBeGreaterThan(20260913100000);
    expect(normalized.startsWith("-- edusmart core v1 / batch 11")).toBe(true);
    expect(normalized).toContain("begin;");
    expect(normalized.trimEnd().endsWith("commit;")).toBe(true);
  });

  test("does not rewrite either portal RPC", () => {
    expect(normalized).not.toContain(
      "create or replace function public.list_parent_student_attendance",
    );
    expect(normalized).not.toContain(
      "create or replace function public.list_student_own_attendance",
    );
    expect(validator).toContain("list_parent_student_attendance(uuid,date,date)");
    expect(validator).toContain("list_student_own_attendance(uuid,uuid,date,date)");
  });
});

describe("B11 immutable roster and conservative backfill", () => {
  test("creates identifiers-only roster with exact uniqueness and tenant FKs", () => {
    expect(normalized).toContain("create table public.attendance_session_roster_members");
    expect(normalized).toContain("unique (attendance_session_id, student_enrollment_id)");
    expect(normalized).toContain(
      "references public.attendance_sessions(id, organization_id, school_id) on delete restrict",
    );
    expect(normalized).toContain(
      "references public.student_enrollments(id, student_id, organization_id, school_id) on delete restrict",
    );
    expect(normalized).toContain(
      "references public.students(id, organization_id) on delete restrict",
    );
  });

  test("preserves records first, uses effective-dated primary history, and collapses deterministically", () => {
    expect(normalized).toContain("from public.student_attendance_records r");
    expect(normalized).toContain("join public.class_enrollments ce");
    const backfill = normalized.slice(
      normalized.indexOf("with candidates as ("),
      normalized.indexOf("do $post_backfill$"),
    );
    expect(backfill).toContain("ce.is_primary");
    expect(backfill).toContain("ce.starts_on <= s.session_date");
    expect(backfill).toContain("ce.ends_on is null or ce.ends_on >= s.session_date");
    expect(backfill).not.toMatch(/ce\.status\s*=\s*'active'/);
    expect(normalized).toContain(
      "select distinct on (attendance_session_id, student_enrollment_id)",
    );
    expect(normalized).toContain("order by attendance_session_id, student_enrollment_id, priority");
    expect(normalized).toContain("backfilled_from_record");
    expect(normalized).toContain("backfilled_from_dated_roster");
  });

  test("effective-date fixtures preserve ended/moved history and exclude out-of-range placements", () => {
    const belongsOn = (startsOn, endsOn, sessionDate, primary = true) =>
      primary && startsOn <= sessionDate && (endsOn === null || endsOn >= sessionDate);
    expect(belongsOn("2026-01-01", null, "2026-02-01")).toBe(true);
    expect(belongsOn("2026-01-01", "2026-02-15", "2026-02-01")).toBe(true);
    expect(belongsOn("2026-01-01", "2026-02-01", "2026-01-15")).toBe(true);
    expect(belongsOn("2026-02-02", null, "2026-02-01")).toBe(false);
    expect(belongsOn("2026-01-01", "2026-01-31", "2026-02-01")).toBe(false);
    expect(belongsOn("2026-01-01", null, "2026-02-01", false)).toBe(false);
  });

  test("aborts on orphan/cross-tenant/duplicate legacy rows and never mutates records", () => {
    expect(normalized).toContain(
      "b11_attendance_legacy_integrity: orphan or cross-tenant attendance record",
    );
    expect(normalized).toContain(
      "b11_attendance_legacy_integrity: duplicate logical attendance record",
    );
    expect(normalized).toContain("attendance enrollment academic year does not match session");
    expect(normalized).toContain("attendance enrollment was not effective on session date");
    expect(normalized).toContain("exactly one historical primary classroom placement");
    expect(normalized).toContain("stored attendance record was not preserved");
    const beforeConstraint = normalized.slice(
      0,
      normalized.indexOf(
        "alter table public.student_attendance_records add constraint student_attendance_roster_member_fk",
      ),
    );
    expect(beforeConstraint).not.toContain("delete from public.student_attendance_records");
    expect(beforeConstraint).not.toContain("update public.student_attendance_records");
  });

  test("makes membership immutable and gives browser no write/delete path", () => {
    expect(functionBody("guard_attendance_roster_immutable")).toContain(
      "snapshot membership cannot be changed or deleted",
    );
    expect(normalized).toContain(
      "before update or delete on public.attendance_session_roster_members",
    );
    expect(normalized).toContain(
      "revoke all on table public.attendance_session_roster_members from public, anon, authenticated, service_role",
    );
    expect(normalized).toContain(
      "grant select on table public.attendance_session_roster_members to authenticated",
    );
    expect(normalized).not.toContain("create policy attendance_roster_delete");
  });

  test("enforces record membership declaratively", () => {
    expect(normalized).toContain(
      "constraint student_attendance_roster_member_fk foreign key (attendance_session_id, student_enrollment_id, organization_id, school_id)",
    );
    expect(normalized).toContain("references public.attendance_session_roster_members");
    expect(functionBody("validate_student_attendance_record")).toContain(
      "b11_attendance_outsider_record",
    );
  });
});

describe("B11 transactional commands", () => {
  test("opens a session and snapshots a non-empty dated roster atomically", () => {
    const sql = functionBody("open_attendance_session");
    expect(sql).toContain("attendance.session.create");
    expect(sql).toContain("created_at_session_open");
    expect(sql).toContain("b11_attendance_empty_roster");
    expect(sql).toContain("on conflict (attendance_session_id,student_enrollment_id) do nothing");
    expect(sql).toContain("returning * into v_session");
  });

  test("create retry resolves the existing logical identity", () => {
    const sql = functionBody("open_attendance_session");
    expect(sql).toContain("b11_attendance_request_begin");
    expect(sql).toContain("coalesce(s.teaching_assignment_id");
    expect(sql).toContain("select * into v_session");
    expect(sql).toContain("for update");
    expect(sql).toContain("v_session.term_id<>v_term");
    expect(sql).toContain("v_session.manual_reason is distinct from btrim(p_manual_reason)");
    expect(sql).toContain("b11_attendance_logical_session_conflict");
  });

  test("draft save is atomic, status-enumerated, versioned, and roster-bound", () => {
    const sql = functionBody("save_attendance_draft");
    for (const status of ["present", "late", "excused", "sick", "absent", "other"])
      expect(sql).toContain(`'${status}'`);
    expect(sql).toContain("attendance.record");
    expect(sql).toContain("b11_attendance_stale_session");
    expect(sql).toContain("b11_attendance_stale_record");
    expect(sql).toContain("b11_attendance_outsider_record");
    expect(sql).toContain("length(coalesce(v_item->>'note',''))>500");
    expect(sql).toContain("b11_attendance_note_too_long");
    expect(sql).not.toMatch(/coalesce\([^)]*status[^)]*'present'/);
  });

  test("submit blocks partial, empty, and outsider rosters before transition", () => {
    const sql = functionBody("submit_attendance_session");
    const empty = sql.indexOf("v_roster=0");
    const incomplete = sql.indexOf("v_records<>v_roster");
    const transition = sql.indexOf("set status='submitted'");
    expect(empty).toBeGreaterThan(-1);
    expect(incomplete).toBeGreaterThan(empty);
    expect(transition).toBeGreaterThan(incomplete);
    expect(sql).toContain("b11_attendance_outsider_record");
    expect(sql).not.toMatch(/insert into public\.student_attendance_records/);
    const guard = functionBody("guard_attendance_session_transition");
    expect(guard).toContain("b11_attendance_empty_roster");
    expect(guard).toContain("b11_attendance_roster_incomplete");
  });

  test("lock remains monotonic and retry-ledger backed", () => {
    const sql = functionBody("lock_attendance_session");
    expect(sql).toContain("v_s.status<>'submitted'");
    expect(sql).toContain("set status='locked'");
    expect(sql).not.toContain("set status='open'");
    expect(sql).toContain("b11_attendance_request_begin");
  });

  test("correction is meaningful, reasoned, versioned, and never changes session state", () => {
    const sql = functionBody("correct_attendance_record");
    expect(sql).toContain("attendance.correct_open");
    expect(sql).toContain("attendance.correct_locked");
    expect(sql).toContain("b11_attendance_correction_reason_required");
    expect(sql).toContain("b11_attendance_correction_no_change");
    expect(sql).toContain("b11_attendance_stale_record");
    expect(sql).toContain("length(coalesce(p_note,''))>500");
    expect(sql).not.toContain("update public.attendance_sessions");
  });

  test("idempotency stores fingerprint/minimal result and prevents repeated completion", () => {
    expect(normalized).toContain("create table public.attendance_command_requests");
    expect(normalized).toContain("unique (actor_profile_id, request_id)");
    expect(normalized).toContain("request_fingerprint text not null");
    expect(normalized).toContain("old.completed_at is not null");
    expect(normalized).toContain("b11_attendance_idempotency_conflict");
    expect(normalized).toContain("not (result ?| array['note','student_name','payload'])");
    expect(functionBody("b11_attendance_fingerprint")).toContain("extensions.digest");
    expect(functionBody("b11_attendance_fingerprint")).toContain("'sha256'");
    expect(normalized).not.toContain("md5(");
    expect(normalized).toContain("retained_until timestamptz not null");
  });

  test("open replay is claimed before mutable advisory evaluation", () => {
    const sql = functionBody("open_attendance_session");
    const claim = sql.indexOf("b11_attendance_request_begin");
    const calendar = sql.indexOf("v_calendar := exists");
    const collision = sql.indexOf("v_collision :=");
    expect(claim).toBeGreaterThan(-1);
    expect(calendar).toBeGreaterThan(claim);
    expect(collision).toBeGreaterThan(claim);
  });
});

describe("B11 history, date, and security contracts", () => {
  test("history readers are bounded and staff-scope filtered", () => {
    for (const name of [
      "list_attendance_history",
      "list_staff_student_attendance_history",
      "list_attendance_corrections",
    ]) {
      const sql = functionBody(name);
      expect(sql).toContain("p_page_size");
      expect(sql).toContain("attendance.read");
      expect(sql).not.toContain("return query select a.*");
    }
    expect(functionBody("list_attendance_history")).toContain("p_to-p_from>366");
    expect(functionBody("list_staff_student_attendance_history")).toContain(
      "m.student_id=p_student_id",
    );
  });

  test("correction projection exposes safe fields rather than raw audit JSON", () => {
    const signature = migration.slice(
      migration.indexOf("create or replace function public.list_attendance_corrections"),
      migration.indexOf(
        "language plpgsql stable",
        migration.indexOf("create or replace function public.list_attendance_corrections"),
      ),
    );
    expect(signature).toContain("old_status text");
    expect(signature).toContain("new_status text");
    expect(signature).toContain("reason text");
    expect(signature).not.toContain("jsonb");
  });

  test("academic bounds, calendar acknowledgement, collisions, and IANA timezone are server authoritative", () => {
    const sql = functionBody("open_attendance_session");
    expect(sql).toContain("p_session_date between y.starts_on and y.ends_on");
    expect(sql).toContain("p_session_date between t.starts_on and t.ends_on");
    expect(sql).toContain("affects_instruction");
    expect(sql).toContain("b11_attendance_calendar_impact_ack_required");
    expect(sql).toContain("coalesce(e.ends_at,e.starts_at)");
    expect(sql).toContain("tstzrange(");
    expect(sql).toContain("b11_attendance_collision_ack_required");
    expect(sql).toContain("pg_catalog.pg_timezone_names");
    expect(sql).not.toContain("+07:00");
    expect(sql).not.toContain("asia/jakarta");
  });

  test("freezes coordinated deployment and the Phase 2 command-only boundary", () => {
    expect(normalized).toContain(
      "must not be applied while the legacy direct-write attendance server is active",
    );
    expect(legacyServer).toContain('"open_attendance_session"');
    expect(legacyServer).toContain('"save_attendance_draft"');
    expect(legacyServer).toContain('"submit_attendance_session"');
    expect(legacyServer).toContain('"lock_attendance_session"');
    expect(legacyServer).toContain('"correct_attendance_record"');
  });

  test("predeployment data check is aggregate-only and transactionally read-only", () => {
    const p = preflight.toLowerCase();
    expect(p).toContain("set transaction read only");
    expect(p.trimEnd().endsWith("rollback;")).toBe(true);
    expect(p).toContain("wrong_academic_year");
    expect(p).toContain("missing_historical_primary_class");
    expect(p).toContain("ambiguous_historical_primary_class");
    expect(p).not.toMatch(/\b(insert|update|delete|alter|create table)\b/);
  });

  test("all API RPCs use blank search_path and authenticated-only ACL convergence", () => {
    const apiNames = [
      "attendance_school_timezone",
      "open_attendance_session",
      "save_attendance_draft",
      "submit_attendance_session",
      "lock_attendance_session",
      "correct_attendance_record",
      "list_attendance_history",
      "list_staff_student_attendance_history",
      "list_attendance_corrections",
    ];
    for (const name of apiNames) {
      expect(functionBody(name)).toContain("security definer set search_path = ''");
    }
    expect(normalized).toContain(
      "revoke all on function %s from public, anon, authenticated, service_role",
    );
    expect(normalized).toContain("grant execute on function %s to authenticated");
    expect(normalized).not.toContain("grant execute on function %s to service_role");
    expect(normalized).toContain(
      "revoke insert, update, delete on table public.attendance_sessions from authenticated",
    );
    expect(normalized).toContain(
      "revoke insert, update, delete on table public.student_attendance_records from authenticated",
    );
  });

  test("validator is read-only and checks structural catalogs, ACL, portal and no-delete posture", () => {
    const v = validator.toLowerCase();
    expect(v).toContain("begin;");
    expect(v).toContain("set transaction read only;");
    expect(v.trimEnd().endsWith("rollback;")).toBe(true);
    expect(v).toContain("pg_catalog.pg_constraint");
    expect(v).toContain("has_function_privilege");
    expect(v).toContain("parent/student portal attendance contract changed");
    expect(v).toContain("attendance hard-delete policy exists");
  });
});
