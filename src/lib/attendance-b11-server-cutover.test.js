import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const server = readFileSync(join(root, "src/lib/attendance.functions.ts"), "utf8");
const adapter = readFileSync(join(root, "src/lib/attendance-b11-db.ts"), "utf8");
const schemas = readFileSync(join(root, "src/lib/attendance.schemas.ts"), "utf8");
const errors = readFileSync(join(root, "src/lib/attendance.server.ts"), "utf8");
const ui = readFileSync(join(root, "src/components/attendance/attendance-ui.tsx"), "utf8");

describe("B11 Phase 2 Attendance server cutover", () => {
  test("routes every authoritative mutation through its B11 command RPC", () => {
    for (const name of [
      "open_attendance_session",
      "save_attendance_draft",
      "submit_attendance_session",
      "lock_attendance_session",
      "correct_attendance_record",
    ]) expect(server).toContain(`"${name}"`);
    expect(server).not.toMatch(/insertWithoutReturning[\s\S]*attendance_(sessions|records)/);
    expect(server).not.toMatch(/\.from\("attendance_sessions"\)[\s\S]{0,400}?\.(insert|update|upsert|delete)\(/);
    expect(server).not.toMatch(/\.from\("student_attendance_records"\)[\s\S]{0,400}?\.(insert|update|upsert|delete)\(/);
  });

  test("uses the caller-JWT client and canonical generated B11 types", () => {
    expect(server).toContain("context.supabase");
    expect(server).not.toMatch(/service[_-]?role/i);
    expect(adapter).toContain("Runtime validation boundary over the canonical generated B11 schema");
    expect(adapter).toContain('Database["public"]["Functions"][N]["Args"]');
    expect(adapter).not.toContain("as unknown as");
    expect(server).not.toContain("as any");
  });

  test("makes immutable snapshot membership authoritative", () => {
    expect(server).toContain("readB11RosterSnapshot");
    expect(adapter).toContain('from("attendance_session_roster_members")');
    expect(server).not.toContain('.from("class_enrollments")');
    expect(adapter).toContain("student_enrollment_id, student_id");
  });

  test("preserves exact optimistic versions and one-member draft mapping", () => {
    expect(schemas).toContain("expectedSessionUpdatedAt: postgresTimestampSchema");
    expect(server).toContain("p_expected_session_updated_at: data.expectedSessionUpdatedAt");
    expect(server).toContain("expected_updated_at: data.expectedUpdatedAt");
    expect(ui).toContain("expectedSessionUpdatedAt: session.data!.updatedAt");
    expect(server).not.toMatch(/status:\s*["']present["']/);
  });

  test("uses real correction reasons and never changes lifecycle to corrected", () => {
    expect(server).toContain("p_correction_reason: data.correctionReason");
    expect(server).not.toMatch(/correctionReason:\s*["'](correction|updated|N\/A)["']/i);
    expect(server).not.toMatch(/status:\s*["']corrected["']/);
    expect(ui).toContain("correctionReason: reason ?? null");
  });

  test("plumbs supplied UUID request IDs and documents compatibility generation", () => {
    expect(schemas.match(/requestId: uuid\.optional\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(server).toContain("value ?? crypto.randomUUID()");
    expect(server).toContain("p_request_id: commandRequestId(data.requestId)");
    expect(server).toContain("const requestId = commandRequestId(data.requestId)");
  });

  test("maps stable database codes without leaking raw database messages", () => {
    for (const token of [
      "B11_ATTENDANCE_ROSTER_INCOMPLETE",
      "B11_ATTENDANCE_STALE_SESSION",
      "B11_ATTENDANCE_CALENDAR_IMPACT_ACK_REQUIRED",
      "B11_ATTENDANCE_COLLISION_ACK_REQUIRED",
      "B11_ATTENDANCE_LOGICAL_SESSION_CONFLICT",
      "B11_ATTENDANCE_NOTE_TOO_LONG",
      "B11_ATTENDANCE_SCOPE_DENIED",
      "B11_ATTENDANCE_IDEMPOTENCY_CONFLICT",
    ]) expect(errors).toContain(token);
    expect(errors).not.toContain("return `${subject}: ${error.message}`");
  });

  test("uses hardened RPC projections for all staff history APIs", () => {
    expect(server).toContain('"list_attendance_history"');
    expect(server).toContain('"list_staff_student_attendance_history"');
    expect(server).toContain('"list_attendance_corrections"');
    expect(server).not.toContain('.from("audit_logs")');
    expect(schemas).toContain("pageSize: z.number().int().min(1).max(100)");
  });

  test("contains no hard-coded Jakarta timezone in the B11 command path", () => {
    expect(server).not.toContain("+07:00");
    expect(server.toLowerCase()).not.toContain("asia/jakarta");
    expect(server).toContain("schoolTimezone: row.school_timezone");
    expect(server).toContain('"attendance_school_timezone"');
  });
});
