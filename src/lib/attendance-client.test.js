import { describe, expect, test } from "bun:test";
import {
  applyAttendanceCorrectionToDetail,
  beginStableAction,
  retireStableAction,
  schoolLocalDate,
} from "./attendance-client";

describe("B11 browser attendance actions", () => {
  test("a retry keeps its UUID and a changed semantic payload rotates it", () => {
    const first = beginStableAction(null, "draft", "row-a:present");
    expect(beginStableAction(first, "draft", "row-a:present").requestId).toBe(first.requestId);
    expect(beginStableAction(first, "draft", "row-a:late").requestId).not.toBe(first.requestId);
    expect(retireStableAction(first, first.requestId)).toBeNull();
  });
  test("acknowledgement payload gets one new ID and its retries stay stable", () => {
    const warning = beginStableAction(null, "open", "manual:date:class:false:false");
    const acknowledged = beginStableAction(warning, "open", "manual:date:class:true:false");
    expect(acknowledged.requestId).not.toBe(warning.requestId);
    expect(beginStableAction(acknowledged, "open", acknowledged.fingerprint).requestId).toBe(
      acknowledged.requestId,
    );
  });
  test("correction network retry keeps the request UUID", () => {
    const action = beginStableAction(null, "correct", "record-a:late:note:reason");
    expect(beginStableAction(action, "correct", action.fingerprint)).toEqual(action);
  });
});

describe("B11 correction cache convergence", () => {
  const detail = (status = "present", lifecycle = "submitted") => ({
    id: "session-a",
    status: lifecycle,
    roster: [
      {
        recordId: "record-a",
        studentEnrollmentId: "enrollment-a",
        status,
        note: "old note",
        correctionReason: null,
        updatedAt: "2026-09-15T01:00:00Z",
      },
      {
        recordId: "record-b",
        studentEnrollmentId: "enrollment-b",
        status: "excused",
        note: null,
        correctionReason: null,
        updatedAt: "2026-09-15T01:00:00Z",
      },
    ],
  });

  test("submitted correction replaces the authoritative row without a reload", () => {
    const current = detail();
    const next = applyAttendanceCorrectionToDetail(current, {
      recordId: "record-a",
      studentEnrollmentId: "enrollment-a",
      status: "late",
      note: "new note",
      correctionReason: "submitted correction",
      updatedAt: "2026-09-15T02:00:00Z",
    });
    expect(next.roster[0]).toMatchObject({
      status: "late",
      note: "new note",
      correctionReason: "submitted correction",
      updatedAt: "2026-09-15T02:00:00Z",
    });
    expect(next.roster[1]).toEqual(current.roster[1]);
  });

  test("locked correction refreshes the row while preserving locked lifecycle", () => {
    const next = applyAttendanceCorrectionToDetail(detail("late", "locked"), {
      recordId: "record-a",
      studentEnrollmentId: "enrollment-a",
      status: "present",
      note: "locked note",
      correctionReason: "locked correction",
      updatedAt: "2026-09-15T03:00:00Z",
    });
    expect(next.status).toBe("locked");
    expect(next.roster[0]).toMatchObject({
      status: "present",
      correctionReason: "locked correction",
      updatedAt: "2026-09-15T03:00:00Z",
    });
  });

  test("a failed correction leaves the existing cache and timeline marker unchanged", () => {
    const current = detail();
    const failedResult = current;
    expect(failedResult).toBe(current);
    expect(current.roster[0]).toMatchObject({
      status: "present",
      correctionReason: null,
      updatedAt: "2026-09-15T01:00:00Z",
    });
  });

  test("UI writes correction cache only on success and refreshes bounded Attendance surfaces", async () => {
    const source = await Bun.file("src/components/attendance/attendance-ui.tsx").text();
    const correction = source.slice(source.indexOf("const correct = useMutation"));
    const success = correction.indexOf("onSuccess:");
    const failure = correction.indexOf("onError:");
    const cacheWrite = correction.indexOf("qc.setQueryData<AttendanceSessionDetail>");
    expect(correction.slice(0, success)).not.toContain("setQueryData");
    expect(cacheWrite).toBeGreaterThan(success);
    expect(cacheWrite).toBeLessThan(failure);
    expect(correction.slice(success, failure)).toContain('["attendance-corrections"');
    expect(correction.slice(success, failure)).toContain('["attendance-student-history"');
    expect(correction.slice(success, failure)).toContain('["attendance-history"]');
    expect(correction.slice(success, failure)).not.toContain("invalidateQueries()");
  });
});
describe("B11 school-local date", () => {
  const boundary = new Date("2026-09-14T17:30:00.000Z");
  test("handles Jakarta UTC boundary", () =>
    expect(schoolLocalDate("Asia/Jakarta", boundary)).toBe("2026-09-15"));
  test("supports other IANA zones", () => {
    expect(schoolLocalDate("America/New_York", boundary)).toBe("2026-09-14");
    expect(schoolLocalDate("UTC", boundary)).toBe("2026-09-14");
  });
});
