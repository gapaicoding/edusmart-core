import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { assertWriteApplied, insertWithoutReturning } from "./sis.server";
import {
  replaceTimetableEntryInput,
  scheduleFilterInput,
  scheduleOptionsInput,
  timetableEntryInput,
  timetableLifecycleInput,
} from "./schedule.schemas";
import { assertScheduleReferences, translateScheduleError } from "./schedule.server";

type EntryRow = Database["public"]["Tables"]["timetable_entries"]["Row"];

export type ScheduleEntry = {
  id: string;
  rowVersion: number;
  termId: string | null;
  teachingAssignmentId: string;
  timetablePeriodId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  roomLabel: string | null;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  classroomId: string;
  classroomName: string;
  subjectName: string;
  teacherName: string;
  staffMemberId: string | null;
};

export type ScheduleOption = { id: string; label: string; hint?: string | null };
export type ScheduleOptions = {
  periods: Array<ScheduleOption & { sequence: number; startTime: string; endTime: string; status: string }>;
  classrooms: ScheduleOption[];
  teachers: ScheduleOption[];
  assignments: Array<ScheduleOption & { classroomId: string; termId: string | null; status: string }>;
};

const ENTRY_COLUMNS =
  "id, organization_id, school_id, academic_year_id, term_id, teaching_assignment_id, timetable_period_id, weekday, start_time, end_time, room_label, status, effective_from, effective_to, row_version, created_at, updated_at";

export const getScheduleOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scheduleOptionsInput.parse(input))
  .handler(async ({ data, context }): Promise<ScheduleOptions> => {
    const { supabase } = context;
    const [periods, classrooms, assignments] = await Promise.all([
      supabase
        .from("timetable_periods")
        .select("id, label, sequence, start_time, end_time, status")
        .eq("organization_id", data.organizationId)
        .eq("school_id", data.schoolId)
        .eq("academic_year_id", data.academicYearId)
        .order("sequence"),
      supabase
        .from("classrooms")
        .select("id, name, code")
        .eq("organization_id", data.organizationId)
        .eq("school_id", data.schoolId)
        .eq("academic_year_id", data.academicYearId)
        .order("name"),
      supabase
        .from("teaching_assignments")
        .select("id, classroom_id, subject_id, staff_school_assignment_id, term_id, role, status")
        .eq("organization_id", data.organizationId)
        .eq("school_id", data.schoolId)
        .eq("academic_year_id", data.academicYearId),
    ]);
    for (const [result, label] of [
      [periods, "Timetable periods"],
      [classrooms, "Classrooms"],
      [assignments, "Teaching assignments"],
    ] as const) {
      if (result.error) throw new Error(translateScheduleError(result.error, label));
    }
    const subjectIds = Array.from(new Set((assignments.data ?? []).map((row) => row.subject_id)));
    const ssaIds = Array.from(new Set((assignments.data ?? []).map((row) => row.staff_school_assignment_id)));
    const [subjects, ssas] = await Promise.all([
      subjectIds.length
        ? supabase.from("subjects").select("id, name, code").in("id", subjectIds)
        : Promise.resolve({ data: [], error: null }),
      ssaIds.length
        ? supabase.from("staff_school_assignments").select("id, staff_member_id").in("id", ssaIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (subjects.error) throw new Error(translateScheduleError(subjects.error, "Subjects"));
    if (ssas.error) throw new Error(translateScheduleError(ssas.error, "Staff assignments"));
    const staffIds = Array.from(new Set((ssas.data ?? []).map((row) => row.staff_member_id)));
    const staff = staffIds.length
      ? await supabase.from("staff_members").select("id, full_name").in("id", staffIds)
      : { data: [], error: null };
    if (staff.error) throw new Error(translateScheduleError(staff.error, "Teachers"));
    const classroomMap = new Map((classrooms.data ?? []).map((row) => [row.id, row]));
    const subjectMap = new Map((subjects.data ?? []).map((row) => [row.id, row]));
    const ssaMap = new Map((ssas.data ?? []).map((row) => [row.id, row]));
    const staffMap = new Map((staff.data ?? []).map((row) => [row.id, row]));
    const teacherIds = new Set<string>();
    const teacherOptions: ScheduleOption[] = [];
    for (const ssa of ssas.data ?? []) {
      if (teacherIds.has(ssa.staff_member_id)) continue;
      teacherIds.add(ssa.staff_member_id);
      const member = staffMap.get(ssa.staff_member_id);
      if (member) teacherOptions.push({ id: member.id, label: member.full_name });
    }
    return {
      periods: (periods.data ?? []).map((row) => ({
        id: row.id,
        label: row.label,
        sequence: row.sequence,
        startTime: row.start_time,
        endTime: row.end_time,
        status: row.status,
      })),
      classrooms: (classrooms.data ?? []).map((row) => ({ id: row.id, label: row.name, hint: row.code })),
      teachers: teacherOptions.sort((a, b) => a.label.localeCompare(b.label)),
      assignments: (assignments.data ?? []).map((row) => {
        const classroom = classroomMap.get(row.classroom_id);
        const subject = subjectMap.get(row.subject_id);
        const ssa = ssaMap.get(row.staff_school_assignment_id);
        const teacher = ssa ? staffMap.get(ssa.staff_member_id) : undefined;
        return {
          id: row.id,
          label: `${subject?.name ?? "Subject"} · ${classroom?.name ?? "Classroom"}`,
          hint: teacher?.full_name ?? null,
          classroomId: row.classroom_id,
          termId: row.term_id,
          status: row.status,
        };
      }),
    };
  });

export const listSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scheduleFilterInput.parse(input))
  .handler(async ({ data, context }): Promise<ScheduleEntry[]> => {
    const { supabase, userId } = context;
    let staffMemberId = data.staffMemberId;
    if (data.mine) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw new Error(translateScheduleError(profileError, "Profile"));
      if (!profile) return [];
      const { data: staff, error: staffError } = await supabase
        .from("staff_members")
        .select("id")
        .eq("organization_id", data.organizationId)
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (staffError) throw new Error(translateScheduleError(staffError, "Teacher profile"));
      if (!staff) return [];
      staffMemberId = staff.id;
    }
    let assignmentIds: string[] | null = null;
    if (staffMemberId) {
      const { data: ssas, error: ssaError } = await supabase
        .from("staff_school_assignments")
        .select("id")
        .eq("school_id", data.schoolId)
        .eq("staff_member_id", staffMemberId);
      if (ssaError) throw new Error(translateScheduleError(ssaError, "Staff assignments"));
      const ssaIds = (ssas ?? []).map((row) => row.id);
      if (!ssaIds.length) return [];
      const { data: assignments, error: assignmentError } = await supabase
        .from("teaching_assignments")
        .select("id")
        .in("staff_school_assignment_id", ssaIds);
      if (assignmentError) throw new Error(translateScheduleError(assignmentError, "Teaching assignments"));
      assignmentIds = (assignments ?? []).map((row) => row.id);
      if (!assignmentIds.length) return [];
    }
    let query = supabase
      .from("timetable_entries")
      .select(ENTRY_COLUMNS)
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId)
      .eq("academic_year_id", data.academicYearId);
    if (data.termId) query = query.eq("term_id", data.termId);
    else query = query.is("term_id", null);
    if (assignmentIds) query = query.in("teaching_assignment_id", assignmentIds);
    const { data: rows, error } = await query.order("weekday").order("start_time");
    if (error) throw new Error(translateScheduleError(error, "Schedule"));
    const typedRows = (rows ?? []) as EntryRow[];
    const taIds = Array.from(new Set(typedRows.map((row) => row.teaching_assignment_id)));
    if (!taIds.length) return [];
    const { data: assignments, error: assignmentError } = await supabase
      .from("teaching_assignments")
      .select("id, classroom_id, subject_id, staff_school_assignment_id")
      .in("id", taIds);
    if (assignmentError) throw new Error(translateScheduleError(assignmentError, "Teaching assignments"));
    const classroomIds = Array.from(new Set((assignments ?? []).map((row) => row.classroom_id)));
    const subjectIds = Array.from(new Set((assignments ?? []).map((row) => row.subject_id)));
    const ssaIds = Array.from(new Set((assignments ?? []).map((row) => row.staff_school_assignment_id)));
    const [classrooms, subjects, ssas] = await Promise.all([
      supabase.from("classrooms").select("id, name").in("id", classroomIds),
      supabase.from("subjects").select("id, name").in("id", subjectIds),
      supabase.from("staff_school_assignments").select("id, staff_member_id").in("id", ssaIds),
    ]);
    for (const [result, label] of [[classrooms, "Classrooms"], [subjects, "Subjects"], [ssas, "Staff assignments"]] as const) {
      if (result.error) throw new Error(translateScheduleError(result.error, label));
    }
    const staffIds = Array.from(new Set((ssas.data ?? []).map((row) => row.staff_member_id)));
    const staff = await supabase.from("staff_members").select("id, full_name").in("id", staffIds);
    if (staff.error) throw new Error(translateScheduleError(staff.error, "Teachers"));
    const assignmentMap = new Map((assignments ?? []).map((row) => [row.id, row]));
    const classroomMap = new Map((classrooms.data ?? []).map((row) => [row.id, row]));
    const subjectMap = new Map((subjects.data ?? []).map((row) => [row.id, row]));
    const ssaMap = new Map((ssas.data ?? []).map((row) => [row.id, row]));
    const staffMap = new Map((staff.data ?? []).map((row) => [row.id, row]));
    return typedRows
      .map((row) => {
        const assignment = assignmentMap.get(row.teaching_assignment_id);
        if (!assignment) return null;
        const ssa = ssaMap.get(assignment.staff_school_assignment_id);
        const teacher = ssa ? staffMap.get(ssa.staff_member_id) : undefined;
        return {
          id: row.id,
          rowVersion: row.row_version,
          termId: row.term_id,
          teachingAssignmentId: row.teaching_assignment_id,
          timetablePeriodId: row.timetable_period_id,
          weekday: row.weekday,
          startTime: row.start_time,
          endTime: row.end_time,
          roomLabel: row.room_label,
          status: row.status,
          effectiveFrom: row.effective_from,
          effectiveTo: row.effective_to,
          classroomId: assignment.classroom_id,
          classroomName: classroomMap.get(assignment.classroom_id)?.name ?? "Classroom",
          subjectName: subjectMap.get(assignment.subject_id)?.name ?? "Subject",
          teacherName: teacher?.full_name ?? "Teacher",
          staffMemberId: ssa?.staff_member_id ?? null,
        } satisfies ScheduleEntry;
      })
      .filter((row): row is ScheduleEntry => row !== null)
      .filter((row) => !data.classroomId || row.classroomId === data.classroomId);
  });

export const saveDraftTimetableEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => timetableEntryInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    const references = await assertScheduleReferences(supabase, data);
    const payload = {
      organization_id: data.organizationId,
      school_id: data.schoolId,
      academic_year_id: data.academicYearId,
      term_id: data.termId,
      teaching_assignment_id: data.teachingAssignmentId,
      timetable_period_id: data.timetablePeriodId,
      weekday: data.weekday,
      start_time: references.period.start_time,
      end_time: references.period.end_time,
      room_label: data.roomLabel,
      status: "draft",
      effective_from: data.effectiveFrom,
      effective_to: data.effectiveTo,
    };
    if (!data.id) return insertWithoutReturning(supabase, "timetable_entries", payload, "Schedule entry");
    const { data: rows, error } = await supabase
      .from("timetable_entries")
      .update(payload)
      .eq("id", data.id)
      .eq("row_version", data.rowVersion!)
      .eq("status", "draft")
      .select("id");
    if (error) throw new Error(translateScheduleError(error, "Schedule entry"));
    if (!rows?.[0]) {
      throw new Error("This draft changed after you opened it, is no longer editable, or your permission scope changed. Refresh the schedule and try again.");
    }
    return { id: rows[0].id };
  });

export const changeTimetableLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => timetableLifecycleInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: rows, error } = await context.supabase
      .from("timetable_entries")
      .update({ status: data.action === "publish" ? "published" : "inactive" })
      .eq("id", data.id)
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId)
      .eq("row_version", data.rowVersion)
      .select("id");
    if (error) throw new Error(translateScheduleError(error, "Schedule entry"));
    if (!rows?.[0]) {
      throw new Error("This entry changed after you opened it, or your permission scope does not allow this lifecycle action. Refresh the schedule and try again.");
    }
    return { id: rows[0].id };
  });

export const replacePublishedTimetableEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => replaceTimetableEntryInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string; mode: string }> => {
    await assertScheduleReferences(context.supabase, data);
    if (!data.termId) {
      throw new Error("Published replacement requires a selected term in the active context.");
    }
    const { data: rows, error } = await context.supabase.rpc("replace_timetable_entry", {
      p_timetable_entry_id: data.id,
      p_organization_id: data.organizationId,
      p_school_id: data.schoolId,
      p_expected_row_version: data.rowVersion,
      p_cutover_date: data.cutoverDate,
      p_term_id: data.termId,
      p_teaching_assignment_id: data.teachingAssignmentId,
      p_timetable_period_id: data.timetablePeriodId,
      p_weekday: data.weekday,
      ...(data.roomLabel === null ? {} : { p_room_label: data.roomLabel }),
      p_inherit_room_label: false,
      ...(data.effectiveTo === null ? {} : { p_successor_effective_to: data.effectiveTo }),
      p_inherit_effective_to: false,
    });
    if (error) throw new Error(translateScheduleError(error, "Schedule entry"));
    const result = assertWriteApplied(rows, "Replacing this published schedule entry");
    return { id: result.timetable_entry_id, mode: result.replacement_mode };
  });
