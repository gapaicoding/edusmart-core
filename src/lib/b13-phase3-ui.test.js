import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("Batch 13 Phase 3 UI contracts", () => {
  test("routes and shell navigation are present", () => {
    expect(read("src/routes/_authenticated/teaching-journals/index.tsx")).toContain(
      "/_authenticated/teaching-journals/",
    );
    expect(read("src/routes/_authenticated/teaching-journals/manage.tsx")).toContain(
      "/_authenticated/teaching-journals/manage",
    );
    expect(read("src/routes/_authenticated/staff-attendance/index.tsx")).toContain(
      "/_authenticated/staff-attendance/",
    );
    const shell = read("src/components/app-shell.tsx");
    expect(shell).toContain('to: "/teaching-journals"');
    expect(shell).toContain('to: "/staff-attendance"');
    expect(shell).toContain('"teaching_journal.read"');
    expect(shell).toContain('"staff_attendance.self.read"');
    expect(shell).not.toMatch(/user\.role|profile\.role/);
  });

  test("journal UI starts from an occurrence and keeps submitted records read-only", () => {
    const ui = read("src/components/teacher-daily-operations/teaching-journal-ui.tsx");
    expect(ui).toContain("listMyTeachingOccurrences");
    expect(ui).toContain("timetableEntryId: id(occurrence?.timetable_entry_id)");
    expect(ui).toContain("This journal is read-only after submission.");
    expect(ui).toContain("B13_TDO_STALE_VERSION");
    expect(ui).toContain("crypto.randomUUID");
    expect(ui).not.toMatch(/supabase\.(from|rpc)\(/);
  });

  test("manager monitor has no authoring commands and self attendance is read-only", () => {
    const journal = read("src/components/teacher-daily-operations/teaching-journal-ui.tsx");
    const manager = journal.slice(journal.indexOf("export function TeachingJournalManagerPage"));
    expect(manager).not.toContain("createTeachingJournal");
    expect(manager).not.toContain("submitTeachingJournal");
    const attendance = read("src/components/teacher-daily-operations/staff-attendance-ui.tsx");
    expect(attendance).toContain("listMyStaffAttendance");
    expect(attendance).toContain("manageStaffAttendance");
    expect(attendance).not.toMatch(/self.*manageStaffAttendance/s);
    expect(attendance).not.toMatch(/user\.role|profile\.role/);
  });
});
