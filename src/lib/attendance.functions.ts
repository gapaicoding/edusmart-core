import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  callB11Rpc,
  readB11RosterSnapshot,
  type B11RpcArgs,
  type B11RpcName,
} from "./attendance-b11-db";
import {
  attendanceCommandError,
  translateAttendanceError,
  unexpectedAttendanceShape,
} from "./attendance.server";
import {
  attendanceCorrectionsInput,
  attendanceHistoryInput,
  attendanceLifecycleInput,
  attendanceListInput,
  attendanceOptionsInput,
  attendanceScopeInput,
  attendanceSessionInput,
  openAttendanceSessionInput,
  saveAttendanceRecordInput,
  saveAttendanceDraftInput,
  staffStudentAttendanceHistoryInput,
} from "./attendance.schemas";

const uuidResult = z.string().uuid();
const timestampResult = z.string().datetime({ offset: true });
const openResultSchema = z
  .array(
    z.object({
      session_id: uuidResult,
      session_status: z.string(),
      roster_count: z.coerce.number().int().nonnegative(),
      school_timezone: z.string().min(1),
      calendar_warning: z.boolean(),
      collision_warning: z.boolean(),
    }),
  )
  .length(1);
const saveResultSchema = z
  .array(z.object({ session_id: uuidResult, saved_count: z.number().int().nonnegative() }))
  .length(1);
const submitResultSchema = z
  .array(
    z.object({ session_id: uuidResult, session_status: z.string(), submitted_at: timestampResult }),
  )
  .length(1);
const lockResultSchema = z
  .array(
    z.object({ session_id: uuidResult, session_status: z.string(), locked_at: timestampResult }),
  )
  .length(1);
const correctionResultSchema = z
  .array(
    z.object({
      record_id: uuidResult,
      record_status: z.string(),
      record_updated_at: timestampResult,
    }),
  )
  .length(1);
const rosterSnapshotSchema = z.array(
  z.object({ student_enrollment_id: uuidResult, student_id: uuidResult }),
);
const historyRowSchema = z.object({
  session_id: uuidResult,
  session_date: z.string(),
  classroom_id: uuidResult,
  classroom_name: z.string(),
  origin: z.enum(["manual", "timetable"]),
  lifecycle: z.string(),
  roster_count: z.coerce.number().int().nonnegative(),
  marked_count: z.coerce.number().int().nonnegative(),
  present_count: z.coerce.number().int().nonnegative(),
  late_count: z.coerce.number().int().nonnegative(),
  excused_count: z.coerce.number().int().nonnegative(),
  sick_count: z.coerce.number().int().nonnegative(),
  absent_count: z.coerce.number().int().nonnegative(),
  other_count: z.coerce.number().int().nonnegative(),
  teaching_assignment_id: uuidResult.nullable(),
  timetable_entry_id: uuidResult.nullable(),
});
const studentHistoryRowSchema = z.object({
  record_id: uuidResult,
  session_id: uuidResult,
  session_date: z.string(),
  classroom_id: uuidResult,
  classroom_name: z.string(),
  status: z.string(),
  note: z.string().nullable(),
  was_corrected: z.boolean(),
  origin: z.enum(["manual", "timetable"]),
  updated_at: timestampResult,
});
const correctionHistoryRowSchema = z.object({
  record_id: uuidResult,
  session_id: uuidResult,
  student_id: uuidResult,
  student_name: z.string(),
  old_status: z.string().nullable(),
  new_status: z.string().nullable(),
  reason: z.string(),
  actor_profile_id: uuidResult.nullable(),
  actor_name: z.string().nullable(),
  changed_at: timestampResult,
});
const timezoneSchema = z.string().min(1);

function commandRequestId(value?: string): string {
  return value ?? crypto.randomUUID();
}

async function checkedRpc<N extends B11RpcName, T>(
  client: Db,
  name: N,
  args: B11RpcArgs<N>,
  schema: z.ZodType<T>,
  subject: string,
): Promise<T> {
  const result = await callB11Rpc(client, name, args, schema);
  if (result.error) throw attendanceCommandError(result.error, subject);
  if (result.shapeError || result.data === null) throw unexpectedAttendanceShape(subject);
  return result.data;
}

export type AttendanceSessionSummary = {
  id: string;
  classroomId: string;
  classroomName: string;
  sessionDate: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  origin: "timetable" | "manual";
  manualReason: string | null;
  subjectName: string | null;
  teacherName: string | null;
  updatedAt: string;
};
export type AttendanceOption = { id: string; label: string; hint?: string | null };
export type AttendanceOptions = {
  classrooms: AttendanceOption[];
  timetable: Array<AttendanceOption & { classroomId: string; startsAt: string; endsAt: string }>;
};
export type AttendanceRosterRow = {
  studentEnrollmentId: string;
  studentId: string;
  studentName: string;
  studentNumber: string | null;
  recordId: string | null;
  status: string | null;
  note: string | null;
  correctionReason: string | null;
  updatedAt: string | null;
};
export type AttendanceSessionDetail = AttendanceSessionSummary & {
  roster: AttendanceRosterRow[];
  submittedAt: string | null;
  lockedAt: string | null;
};
export type AttendanceHistoryRow = z.infer<typeof historyRowSchema>;
export type StaffStudentAttendanceHistoryRow = z.infer<typeof studentHistoryRowSchema>;
export type AttendanceCorrectionHistoryRow = z.infer<typeof correctionHistoryRowSchema>;

type Db = SupabaseClient<Database>;
type SessionRow = Database["public"]["Tables"]["attendance_sessions"]["Row"];
type AssignmentBrief = Pick<
  Database["public"]["Tables"]["teaching_assignments"]["Row"],
  "id" | "subject_id" | "staff_school_assignment_id"
>;

async function decorateSessions(
  supabase: Db,
  rows: SessionRow[],
): Promise<AttendanceSessionSummary[]> {
  const classroomIds = [...new Set(rows.map((row) => row.classroom_id))];
  const assignmentIds = [
    ...new Set(rows.map((row) => row.teaching_assignment_id).filter(Boolean)),
  ] as string[];
  const [classrooms, assignments] = await Promise.all([
    classroomIds.length
      ? supabase.from("classrooms").select("id, name").in("id", classroomIds)
      : { data: [], error: null },
    assignmentIds.length
      ? supabase
          .from("teaching_assignments")
          .select("id, subject_id, staff_school_assignment_id")
          .in("id", assignmentIds)
      : { data: [], error: null },
  ]);
  if (classrooms.error) throw new Error(translateAttendanceError(classrooms.error, "Classrooms"));
  if (assignments.error)
    throw new Error(translateAttendanceError(assignments.error, "Teaching assignments"));
  const subjectIds = [
    ...new Set((assignments.data ?? []).map((row) => row.subject_id)),
  ] as string[];
  const ssaIds = [
    ...new Set((assignments.data ?? []).map((row) => row.staff_school_assignment_id)),
  ] as string[];
  const [subjects, ssas] = await Promise.all([
    subjectIds.length
      ? supabase.from("subjects").select("id, name").in("id", subjectIds)
      : { data: [], error: null },
    ssaIds.length
      ? supabase.from("staff_school_assignments").select("id, staff_member_id").in("id", ssaIds)
      : { data: [], error: null },
  ]);
  if (subjects.error) throw new Error(translateAttendanceError(subjects.error, "Subjects"));
  if (ssas.error) throw new Error(translateAttendanceError(ssas.error, "Staff assignments"));
  const staffIds = [...new Set((ssas.data ?? []).map((row) => row.staff_member_id))] as string[];
  const staff = staffIds.length
    ? await supabase.from("staff_members").select("id, full_name").in("id", staffIds)
    : { data: [], error: null };
  if (staff.error) throw new Error(translateAttendanceError(staff.error, "Teachers"));
  const maps = {
    classrooms: new Map<string, string>((classrooms.data ?? []).map((row) => [row.id, row.name])),
    assignments: new Map<string, AssignmentBrief>(
      (assignments.data ?? []).map((row) => [row.id, row]),
    ),
    subjects: new Map<string, string>((subjects.data ?? []).map((row) => [row.id, row.name])),
    ssas: new Map<string, string>((ssas.data ?? []).map((row) => [row.id, row.staff_member_id])),
    staff: new Map<string, string>((staff.data ?? []).map((row) => [row.id, row.full_name])),
  };
  return rows.map((row) => {
    const assignment = row.teaching_assignment_id
      ? maps.assignments.get(row.teaching_assignment_id)
      : null;
    const staffId = assignment ? maps.ssas.get(assignment.staff_school_assignment_id) : null;
    return {
      id: row.id,
      classroomId: row.classroom_id,
      classroomName: maps.classrooms.get(row.classroom_id) ?? "Classroom",
      sessionDate: row.session_date,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      origin: row.timetable_entry_id ? "timetable" : "manual",
      manualReason: row.manual_reason,
      subjectName: assignment ? (maps.subjects.get(assignment.subject_id) ?? null) : null,
      teacherName: staffId ? (maps.staff.get(staffId) ?? null) : null,
      updatedAt: row.updated_at,
    };
  });
}

export const listAttendanceSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => attendanceListInput.parse(input))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("attendance_sessions")
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId)
      .eq("academic_year_id", data.academicYearId)
      .eq("term_id", data.termId);
    if (data.sessionDate) query = query.eq("session_date", data.sessionDate);
    if (data.classroomId) query = query.eq("classroom_id", data.classroomId);
    if (data.status) query = query.eq("status", data.status);
    const { data: rows, error } = await query
      .order("session_date", { ascending: false })
      .order("starts_at");
    if (error) throw new Error(translateAttendanceError(error, "Attendance sessions"));
    return decorateSessions(context.supabase, rows ?? []);
  });

export const getAttendanceOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => attendanceOptionsInput.parse(input))
  .handler(async ({ data, context }): Promise<AttendanceOptions> => {
    const weekday = new Date(`${data.sessionDate}T12:00:00Z`).getUTCDay() || 7;
    const [classrooms, timetable, existing] = await Promise.all([
      context.supabase
        .from("classrooms")
        .select("id, name, code")
        .eq("organization_id", data.organizationId)
        .eq("school_id", data.schoolId)
        .eq("academic_year_id", data.academicYearId)
        .order("name"),
      context.supabase
        .from("timetable_entries")
        .select("id, teaching_assignment_id, start_time, end_time, room_label")
        .eq("organization_id", data.organizationId)
        .eq("school_id", data.schoolId)
        .eq("academic_year_id", data.academicYearId)
        .eq("term_id", data.termId)
        .eq("status", "published")
        .eq("weekday", weekday)
        .lte("effective_from", data.sessionDate)
        .or(`effective_to.is.null,effective_to.gte.${data.sessionDate}`),
      context.supabase
        .from("attendance_sessions")
        .select("timetable_entry_id")
        .eq("organization_id", data.organizationId)
        .eq("school_id", data.schoolId)
        .eq("session_date", data.sessionDate)
        .not("timetable_entry_id", "is", null),
    ]);
    for (const [result, label] of [
      [classrooms, "Classrooms"],
      [timetable, "Timetable"],
      [existing, "Existing sessions"],
    ] as const)
      if (result.error) throw new Error(translateAttendanceError(result.error, label));
    const assignmentIds = (timetable.data ?? []).map((row) => row.teaching_assignment_id);
    const assignments = assignmentIds.length
      ? await context.supabase
          .from("teaching_assignments")
          .select("id, classroom_id, subject_id, staff_school_assignment_id")
          .in("id", assignmentIds)
      : { data: [], error: null };
    if (assignments.error)
      throw new Error(translateAttendanceError(assignments.error, "Teaching assignments"));
    const subjectIds = (assignments.data ?? []).map((row) => row.subject_id);
    const subjects = subjectIds.length
      ? await context.supabase.from("subjects").select("id, name").in("id", subjectIds)
      : { data: [], error: null };
    if (subjects.error) throw new Error(translateAttendanceError(subjects.error, "Subjects"));
    const classroomMap = new Map((classrooms.data ?? []).map((row) => [row.id, row.name]));
    const assignmentMap = new Map((assignments.data ?? []).map((row) => [row.id, row]));
    const subjectMap = new Map((subjects.data ?? []).map((row) => [row.id, row.name]));
    const used = new Set((existing.data ?? []).map((row) => row.timetable_entry_id));
    return {
      classrooms: (classrooms.data ?? []).map((row) => ({
        id: row.id,
        label: row.name,
        hint: row.code,
      })),
      timetable: (timetable.data ?? [])
        .filter((row) => !used.has(row.id))
        .map((row) => {
          const assignment = assignmentMap.get(row.teaching_assignment_id)!;
          return {
            id: row.id,
            classroomId: assignment?.classroom_id ?? "",
            label: `${subjectMap.get(assignment?.subject_id) ?? "Subject"} · ${classroomMap.get(assignment?.classroom_id) ?? "Classroom"}`,
            hint: `${row.start_time.slice(0, 5)}–${row.end_time.slice(0, 5)}${row.room_label ? ` · ${row.room_label}` : ""}`,
            startsAt: row.start_time,
            endsAt: row.end_time,
          };
        })
        .filter((row) => row.classroomId),
    };
  });

export const openAttendanceSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => openAttendanceSessionInput.parse(input))
  .handler(async ({ data, context }) => {
    const rows = await checkedRpc(
      context.supabase,
      "open_attendance_session",
      {
        p_request_id: commandRequestId(data.requestId),
        p_session_date: data.sessionDate,
        ...(data.origin === "timetable"
          ? { p_timetable_entry_id: data.timetableEntryId }
          : {
              p_classroom_id: data.classroomId,
              p_term_id: data.termId,
              ...(data.teachingAssignmentId
                ? { p_teaching_assignment_id: data.teachingAssignmentId }
                : {}),
              ...(data.startsAt ? { p_starts_at: data.startsAt } : {}),
              ...(data.endsAt ? { p_ends_at: data.endsAt } : {}),
              p_manual_reason: data.manualReason,
            }),
        p_acknowledge_non_instructional: data.acknowledgeCalendarImpact ?? false,
        p_acknowledge_collision: data.acknowledgeCollision ?? false,
      },
      openResultSchema,
      "Attendance session",
    );
    const row = rows[0]!;
    return {
      id: row.session_id,
      status: row.session_status,
      rosterCount: row.roster_count,
      schoolTimezone: row.school_timezone,
      calendarWarning: row.calendar_warning,
      collisionWarning: row.collision_warning,
    };
  });

export const getAttendanceSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => attendanceSessionInput.parse(input))
  .handler(async ({ data, context }): Promise<AttendanceSessionDetail> => {
    const { data: session, error } = await context.supabase
      .from("attendance_sessions")
      .select("*")
      .eq("id", data.id)
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId)
      .eq("academic_year_id", data.academicYearId)
      .eq("term_id", data.termId)
      .maybeSingle();
    if (error) throw new Error(translateAttendanceError(error, "Attendance session"));
    if (!session)
      throw new Error(
        "This attendance session does not exist or is outside your permission scope.",
      );
    const snapshot = await readB11RosterSnapshot(
      context.supabase,
      { organizationId: data.organizationId, schoolId: data.schoolId, sessionId: session.id },
      rosterSnapshotSchema,
    );
    if (snapshot.error)
      throw new Error(translateAttendanceError(snapshot.error, "Attendance roster"));
    if (snapshot.shapeError || snapshot.data === null)
      throw unexpectedAttendanceShape("Attendance roster");
    const enrollmentIds = snapshot.data.map((row) => row.student_enrollment_id);
    const enrollments = enrollmentIds.length
      ? await context.supabase
          .from("student_enrollments")
          .select("id, student_id, student_number")
          .in("id", enrollmentIds)
      : { data: [], error: null };
    if (enrollments.error)
      throw new Error(translateAttendanceError(enrollments.error, "Student enrolments"));
    const studentIds = snapshot.data.map((row) => row.student_id);
    const [students, records] = await Promise.all([
      studentIds.length
        ? context.supabase
            .from("students")
            .select("id, full_name, preferred_name")
            .in("id", studentIds)
        : { data: [], error: null },
      context.supabase
        .from("student_attendance_records")
        .select("id, student_enrollment_id, status, note, correction_reason, updated_at")
        .eq("attendance_session_id", session.id)
        .eq("organization_id", data.organizationId)
        .eq("school_id", data.schoolId),
    ]);
    if (students.error) throw new Error(translateAttendanceError(students.error, "Students"));
    if (records.error)
      throw new Error(translateAttendanceError(records.error, "Attendance records"));
    const studentMap = new Map((students.data ?? []).map((row) => [row.id, row]));
    const recordMap = new Map((records.data ?? []).map((row) => [row.student_enrollment_id, row]));
    const enrollmentMap = new Map((enrollments.data ?? []).map((row) => [row.id, row]));
    const roster = snapshot.data
      .map((member) => {
        const enrollment = enrollmentMap.get(member.student_enrollment_id);
        const student = studentMap.get(member.student_id);
        const record = recordMap.get(member.student_enrollment_id);
        return {
          studentEnrollmentId: member.student_enrollment_id,
          studentId: member.student_id,
          studentName: student?.preferred_name || student?.full_name || "Student",
          studentNumber: enrollment?.student_number ?? null,
          recordId: record?.id ?? null,
          status: record?.status ?? null,
          note: record?.note ?? null,
          correctionReason: record?.correction_reason ?? null,
          updatedAt: record?.updated_at ?? null,
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
    const decorated = (await decorateSessions(context.supabase, [session]))[0];
    if (!decorated) throw new Error("This attendance session could not be resolved.");
    return { ...decorated, roster, submittedAt: session.submitted_at, lockedAt: session.locked_at };
  });

export const saveStudentAttendanceRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveAttendanceRecordInput.parse(input))
  .handler(async ({ data, context }) => {
    const requestId = commandRequestId(data.requestId);
    if (data.sessionStatus !== "open") {
      if (!data.recordId || !data.expectedUpdatedAt || !data.correctionReason)
        throw new Error("Finalized attendance requires a current record and correction reason.");
      const rows = await checkedRpc(
        context.supabase,
        "correct_attendance_record",
        {
          p_record_id: data.recordId,
          p_expected_updated_at: data.expectedUpdatedAt,
          p_request_id: requestId,
          p_status: data.status,
          p_note: data.note ?? "",
          p_correction_reason: data.correctionReason,
        },
        correctionResultSchema,
        "Attendance correction",
      );
      return { id: rows[0]!.record_id, updatedAt: rows[0]!.record_updated_at };
    }
    const rows = await checkedRpc(
      context.supabase,
      "save_attendance_draft",
      {
        p_session_id: data.sessionId,
        p_expected_session_updated_at: data.expectedSessionUpdatedAt,
        p_request_id: requestId,
        p_records: [
          {
            student_enrollment_id: data.studentEnrollmentId,
            status: data.status,
            note: data.note ?? null,
            ...(data.expectedUpdatedAt ? { expected_updated_at: data.expectedUpdatedAt } : {}),
          },
        ],
      },
      saveResultSchema,
      "Attendance draft",
    );
    return { id: rows[0]!.session_id, savedCount: rows[0]!.saved_count };
  });

export const saveAttendanceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveAttendanceDraftInput.parse(input))
  .handler(async ({ data, context }) => {
    const rows = await checkedRpc(
      context.supabase,
      "save_attendance_draft",
      {
        p_session_id: data.sessionId,
        p_expected_session_updated_at: data.expectedSessionUpdatedAt,
        p_request_id: data.requestId,
        p_records: data.records.map((record) => ({
          student_enrollment_id: record.studentEnrollmentId,
          status: record.status,
          note: record.note ?? null,
          ...(record.expectedUpdatedAt ? { expected_updated_at: record.expectedUpdatedAt } : {}),
        })),
      },
      saveResultSchema,
      "Attendance draft",
    );
    return { id: rows[0]!.session_id, savedCount: rows[0]!.saved_count };
  });

export const changeAttendanceSessionLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => attendanceLifecycleInput.parse(input))
  .handler(async ({ data, context }) => {
    const requestId = commandRequestId(data.requestId);
    if (data.action === "submit") {
      const rows = await checkedRpc(
        context.supabase,
        "submit_attendance_session",
        {
          p_session_id: data.id,
          p_expected_updated_at: data.expectedUpdatedAt,
          p_request_id: requestId,
        },
        submitResultSchema,
        "Attendance submission",
      );
      return { id: rows[0]!.session_id, status: rows[0]!.session_status };
    }
    const rows = await checkedRpc(
      context.supabase,
      "lock_attendance_session",
      {
        p_session_id: data.id,
        p_expected_updated_at: data.expectedUpdatedAt,
        p_request_id: requestId,
      },
      lockResultSchema,
      "Attendance locking",
    );
    return { id: rows[0]!.session_id, status: rows[0]!.session_status };
  });

export const listAttendanceHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => attendanceHistoryInput.parse(input))
  .handler(async ({ data, context }) =>
    checkedRpc(
      context.supabase,
      "list_attendance_history",
      {
        p_school_id: data.schoolId,
        p_from: data.from,
        p_to: data.to,
        ...(data.classroomId ? { p_classroom_id: data.classroomId } : {}),
        ...(data.status ? { p_status: data.status } : {}),
        ...(data.studentId ? { p_student_id: data.studentId } : {}),
        p_offset: data.offset,
        p_page_size: data.pageSize,
      },
      z.array(historyRowSchema),
      "Attendance history",
    ),
  );

export const listStaffStudentAttendanceHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffStudentAttendanceHistoryInput.parse(input))
  .handler(async ({ data, context }) =>
    checkedRpc(
      context.supabase,
      "list_staff_student_attendance_history",
      {
        p_student_id: data.studentId,
        p_from: data.from,
        p_to: data.to,
        p_offset: data.offset,
        p_page_size: data.pageSize,
      },
      z.array(studentHistoryRowSchema),
      "Student attendance history",
    ),
  );

export const listAttendanceCorrections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => attendanceCorrectionsInput.parse(input))
  .handler(async ({ data, context }) =>
    checkedRpc(
      context.supabase,
      "list_attendance_corrections",
      {
        p_record_id: data.recordId,
        p_offset: data.offset,
        p_page_size: data.pageSize,
      },
      z.array(correctionHistoryRowSchema),
      "Attendance correction history",
    ),
  );

export const getAttendanceSchoolTimezone = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => attendanceScopeInput.parse(input))
  .handler(async ({ data, context }) =>
    checkedRpc(
      context.supabase,
      "attendance_school_timezone",
      {
        p_school_id: data.schoolId,
      },
      timezoneSchema,
      "School timezone",
    ),
  );
