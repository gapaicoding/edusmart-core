import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { insertWithoutReturning } from "./sis.server";
import { translateAttendanceError } from "./attendance.server";
import {
  attendanceLifecycleInput,
  attendanceListInput,
  attendanceOptionsInput,
  attendanceScopeInput,
  attendanceSessionInput,
  openAttendanceSessionInput,
  saveAttendanceRecordInput,
} from "./attendance.schemas";

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
    let payload: Record<string, unknown> = {
      organization_id: data.organizationId,
      school_id: data.schoolId,
      academic_year_id: data.academicYearId,
      term_id: data.termId,
      session_date: data.sessionDate,
      status: "open",
    };
    if (data.origin === "timetable") {
      const { data: entry, error } = await context.supabase
        .from("timetable_entries")
        .select("id, teaching_assignment_id, start_time, end_time")
        .eq("id", data.timetableEntryId)
        .eq("organization_id", data.organizationId)
        .eq("school_id", data.schoolId)
        .maybeSingle();
      if (error) throw new Error(translateAttendanceError(error, "Timetable entry"));
      if (!entry) throw new Error("That timetable entry is unavailable in the selected scope.");
      const { data: assignment, error: assignmentError } = await context.supabase
        .from("teaching_assignments")
        .select("classroom_id")
        .eq("id", entry.teaching_assignment_id)
        .maybeSingle();
      if (assignmentError)
        throw new Error(translateAttendanceError(assignmentError, "Teaching assignment"));
      if (!assignment) throw new Error("That teaching assignment is unavailable.");
      payload = {
        ...payload,
        timetable_entry_id: entry.id,
        teaching_assignment_id: entry.teaching_assignment_id,
        classroom_id: assignment.classroom_id,
        starts_at: new Date(`${data.sessionDate}T${entry.start_time}+07:00`).toISOString(),
        ends_at: new Date(`${data.sessionDate}T${entry.end_time}+07:00`).toISOString(),
      };
    } else
      payload = {
        ...payload,
        classroom_id: data.classroomId,
        teaching_assignment_id: data.teachingAssignmentId ?? null,
        starts_at: data.startsAt || null,
        ends_at: data.endsAt || null,
        manual_reason: data.manualReason,
      };
    return insertWithoutReturning(
      context.supabase,
      "attendance_sessions",
      payload,
      "Attendance session",
    );
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
    const { data: placements, error: placementError } = await context.supabase
      .from("class_enrollments")
      .select("student_enrollment_id")
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId)
      .eq("classroom_id", session.classroom_id)
      .eq("is_primary", true)
      .lte("starts_on", session.session_date)
      .or(`ends_on.is.null,ends_on.gte.${session.session_date}`);
    if (placementError) throw new Error(translateAttendanceError(placementError, "Class roster"));
    const enrollmentIds = [...new Set((placements ?? []).map((row) => row.student_enrollment_id))];
    const enrollments = enrollmentIds.length
      ? await context.supabase
          .from("student_enrollments")
          .select("id, student_id, student_number")
          .in("id", enrollmentIds)
          .eq("academic_year_id", data.academicYearId)
          .lte("enrolled_on", session.session_date)
          .or(`ended_on.is.null,ended_on.gte.${session.session_date}`)
      : { data: [], error: null };
    if (enrollments.error)
      throw new Error(translateAttendanceError(enrollments.error, "Student enrolments"));
    const studentIds = (enrollments.data ?? []).map((row) => row.student_id);
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
    const roster = (enrollments.data ?? [])
      .map((enrollment) => {
        const student = studentMap.get(enrollment.student_id);
        const record = recordMap.get(enrollment.id);
        return {
          studentEnrollmentId: enrollment.id,
          studentId: enrollment.student_id,
          studentName: student?.preferred_name || student?.full_name || "Student",
          studentNumber: enrollment.student_number,
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
    const payload = {
      status: data.status,
      note: data.note ?? null,
      correction_reason: data.correctionReason ?? null,
    };
    if (!data.recordId)
      return insertWithoutReturning(
        context.supabase,
        "student_attendance_records",
        {
          ...payload,
          organization_id: data.organizationId,
          school_id: data.schoolId,
          attendance_session_id: data.sessionId,
          student_enrollment_id: data.studentEnrollmentId,
        },
        "Student attendance",
      );
    if (!data.expectedUpdatedAt)
      throw new Error(
        "Updating an existing attendance record requires the current updated_at token.",
      );
    const { data: rows, error } = await context.supabase
      .from("student_attendance_records")
      .update(payload)
      .eq("id", data.recordId)
      .eq("attendance_session_id", data.sessionId)
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId)
      .eq("updated_at", data.expectedUpdatedAt)
      .select("id");
    if (error) throw new Error(translateAttendanceError(error, "Student attendance"));
    if (!rows?.[0])
      throw new Error(
        "This attendance record was modified by another user. Refresh and retry.",
      );
    return { id: rows[0].id };
  });

export const changeAttendanceSessionLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => attendanceLifecycleInput.parse(input))
  .handler(async ({ data, context }) => {
    const status = data.action === "submit" ? "submitted" : "locked";
    const { data: rows, error } = await context.supabase
      .from("attendance_sessions")
      .update({ status })
      .eq("id", data.id)
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId)
      .eq("academic_year_id", data.academicYearId)
      .eq("term_id", data.termId)
      .eq("updated_at", data.expectedUpdatedAt)
      .select("id");
    if (error) throw new Error(translateAttendanceError(error, "Attendance session"));
    if (!rows?.[0])
      throw new Error(
        "This session changed after it loaded or your permission scope does not allow this action. Refresh and retry.",
      );
    return { id: rows[0].id };
  });
