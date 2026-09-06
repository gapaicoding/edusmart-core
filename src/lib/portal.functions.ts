import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { translatePortalError } from "./portal.server";
import {
  childIdInput,
  portalAttendanceInput,
  portalScheduleInput,
  portalScoresInput,
} from "./portal.schemas";

/**
 * Batch 7 — Parent Portal server functions.
 *
 * Every read is issued via `context.supabase` (caller-authenticated); RLS is
 * authoritative. Parents can only see rows for children they are actively
 * related to (student_guardians.status = 'active'; guardians.profile_id =
 * auth.uid()) and only where the underlying record is publicly visible per its
 * canonical lifecycle (published assessments/timetable; outcome-visible
 * attendance sessions).
 *
 * These handlers do not accept a student id as authorization proof: they call
 * the RLS-backed canonical relations, so an unrelated / non-existent student
 * id simply returns an empty result.
 */

export type PortalChild = {
  studentId: string;
  organizationId: string;
  fullName: string;
  status: string;
  relationship: string;
  isPrimary: boolean;
  canViewAcademic: boolean;
  canViewAttendance: boolean;
};

export const listPortalChildren = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ children: PortalChild[] }> => {
    // student_guardians_select permits: guardians.profile_id = auth.uid()
    // → returns exactly the caller's active guardian rows (with their students).
    const { data, error } = await context.supabase
      .from("student_guardians")
      .select(
        "student_id, organization_id, relationship_type, is_primary, can_view_academic, can_view_attendance, status, students(id, full_name, status)",
      )
      .eq("status", "active");
    if (error) throw new Error(translatePortalError(error, "your children"));
    const rows = (data ?? []) as Array<{
      student_id: string;
      organization_id: string;
      relationship_type: string;
      is_primary: boolean;
      can_view_academic: boolean;
      can_view_attendance: boolean;
      students: { id: string; full_name: string; status: string } | null;
    }>;
    const children: PortalChild[] = rows
      .filter((r) => r.students && r.students.status !== "archived")
      .map((r) => ({
        studentId: r.student_id,
        organizationId: r.organization_id,
        fullName: r.students!.full_name,
        status: r.students!.status,
        relationship: r.relationship_type,
        isPrimary: r.is_primary,
        canViewAcademic: r.can_view_academic,
        canViewAttendance: r.can_view_attendance,
      }))
      .sort((a, b) =>
        a.isPrimary === b.isPrimary ? a.fullName.localeCompare(b.fullName) : a.isPrimary ? -1 : 1,
      );
    return { children };
  });

export type PortalChildOverview = {
  studentId: string;
  fullName: string;
  status: string;
  organizationId: string;
  schoolId: string | null;
  schoolName: string | null;
  academicYearId: string | null;
  academicYearName: string | null;
  gradeLevelName: string | null;
  classroomId: string | null;
  classroomName: string | null;
  enrollmentStatus: string | null;
  enrolledOn: string | null;
};

export const getPortalChildOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => childIdInput.parse(x))
  .handler(async ({ data, context }): Promise<PortalChildOverview | null> => {
    // students_select (can_access_student) is RLS-authoritative: an unrelated
    // student id resolves to no row.
    const { data: student, error } = await context.supabase
      .from("students")
      .select("id, full_name, status, organization_id")
      .eq("id", data.studentId)
      .maybeSingle();
    if (error) throw new Error(translatePortalError(error, "child details"));
    if (!student) return null;

    // Active enrollment (RLS: can_access_enrollment RELATED with exact student id).
    const { data: enrollments, error: enrollErr } = await context.supabase
      .from("student_enrollments")
      .select("id, school_id, academic_year_id, status, enrolled_on, ended_on, grade_level_id")
      .eq("student_id", data.studentId)
      .in("status", ["active", "leave"])
      .order("enrolled_on", { ascending: false })
      .limit(1);
    if (enrollErr) throw new Error(translatePortalError(enrollErr, "enrollment"));
    const enrollment = enrollments?.[0] ?? null;

    let schoolName: string | null = null;
    let yearName: string | null = null;
    let gradeName: string | null = null;
    let classroomId: string | null = null;
    let classroomName: string | null = null;

    if (enrollment) {
      const [schoolRes, yearRes, gradeRes, classEnroll] = await Promise.all([
        context.supabase
          .from("schools")
          .select("name")
          .eq("id", enrollment.school_id)
          .maybeSingle(),
        context.supabase
          .from("academic_years")
          .select("name")
          .eq("id", enrollment.academic_year_id)
          .maybeSingle(),
        enrollment.grade_level_id
          ? context.supabase
              .from("grade_levels")
              .select("name")
              .eq("id", enrollment.grade_level_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        context.supabase
          .from("class_enrollments")
          .select("classroom_id, is_primary, status")
          .eq("student_enrollment_id", enrollment.id)
          .eq("status", "active")
          .eq("is_primary", true)
          .maybeSingle(),
      ]);
      schoolName = (schoolRes.data as { name: string } | null)?.name ?? null;
      yearName = (yearRes.data as { name: string } | null)?.name ?? null;
      gradeName = (gradeRes.data as { name: string } | null)?.name ?? null;
      const cls = classEnroll.data as { classroom_id: string } | null;
      if (cls) {
        classroomId = cls.classroom_id;
        const { data: classroom } = await context.supabase
          .from("classrooms")
          .select("name")
          .eq("id", cls.classroom_id)
          .maybeSingle();
        classroomName = (classroom as { name: string } | null)?.name ?? null;
      }
    }

    return {
      studentId: student.id,
      fullName: student.full_name,
      status: student.status,
      organizationId: student.organization_id,
      schoolId: enrollment?.school_id ?? null,
      schoolName,
      academicYearId: enrollment?.academic_year_id ?? null,
      academicYearName: yearName,
      gradeLevelName: gradeName,
      classroomId,
      classroomName,
      enrollmentStatus: enrollment?.status ?? null,
      enrolledOn: enrollment?.enrolled_on ?? null,
    };
  });

export type PortalAttendanceRow = {
  recordId: string;
  sessionId: string;
  sessionDate: string;
  sessionStatus: string;
  status: string;
};

export const listPortalAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => portalAttendanceInput.parse(x))
  .handler(async ({ data, context }): Promise<{ rows: PortalAttendanceRow[] }> => {
    // SECURITY DEFINER helper enforces guardian binding + safe session filter.
    const rpc = context.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: Array<{
        record_id: string;
        session_id: string;
        session_date: string;
        session_status: string;
        status: string;
      }> | null;
      error: import("@supabase/supabase-js").PostgrestError | null;
    }>;
    const { data: rows, error } = await rpc("list_parent_student_attendance", {
      p_student_id: data.studentId,
      p_from: data.from ?? null,
      p_to: data.to ?? null,
    });
    if (error) throw new Error(translatePortalError(error, "attendance"));
    return {
      rows: (rows ?? []).map((r) => ({
        recordId: r.record_id,
        sessionId: r.session_id,
        sessionDate: r.session_date,
        sessionStatus: r.session_status,
        status: r.status,
      })),
    };
  });

export type PortalScoreRow = {
  scoreId: string;
  assessmentId: string;
  assessmentTitle: string;
  assessmentDate: string;
  score: number | null;
  status: string;
  minScore: number;
  maxScore: number;
  subjectName: string | null;
  typeName: string | null;
  termName: string | null;
};

export const listPortalScores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => portalScoresInput.parse(x))
  .handler(async ({ data, context }): Promise<{ rows: PortalScoreRow[] }> => {
    // Find the student's enrollments (RLS: can_access_enrollment binds exact
    // student id; unrelated student → no rows).
    let seQ = context.supabase
      .from("student_enrollments")
      .select("id, academic_year_id")
      .eq("student_id", data.studentId);
    if (data.academicYearId) seQ = seQ.eq("academic_year_id", data.academicYearId);
    const { data: enrollments, error: eErr } = await seQ;
    if (eErr) throw new Error(translatePortalError(eErr, "enrollment"));
    const seIds = (enrollments ?? []).map((r) => r.id);
    if (seIds.length === 0) return { rows: [] };

    // student_scores_select allows published assessments + RELATED bound to
    // st.id → parent sees only their child's scores on published assessments.
    const { data: scores, error: sErr } = await context.supabase
      .from("student_scores")
      .select(
        "id, assessment_id, score, status, student_enrollment_id, assessments(id, title, assessment_date, min_score, max_score, status, term_id, teaching_assignment_id, assessment_type_id)",
      )
      .in("student_enrollment_id", seIds);
    if (sErr) throw new Error(translatePortalError(sErr, "scores"));

    const rows = (
      (scores ?? []) as Array<{
        id: string;
        assessment_id: string;
        score: number | null;
        status: string;
        assessments: {
          id: string;
          title: string;
          assessment_date: string;
          min_score: number;
          max_score: number;
          status: string;
          term_id: string | null;
          teaching_assignment_id: string;
          assessment_type_id: string;
        } | null;
      }>
    ).filter((r) => r.assessments && r.assessments.status === "published");

    const taIds = [...new Set(rows.map((r) => r.assessments!.teaching_assignment_id))];
    const typeIds = [...new Set(rows.map((r) => r.assessments!.assessment_type_id))];
    const termIds = [
      ...new Set(rows.map((r) => r.assessments!.term_id).filter((v): v is string => !!v)),
    ];

    const [tas, types, terms] = await Promise.all([
      taIds.length
        ? context.supabase.from("teaching_assignments").select("id, subject_id").in("id", taIds)
        : Promise.resolve({ data: [], error: null }),
      typeIds.length
        ? context.supabase.from("assessment_types").select("id, name").in("id", typeIds)
        : Promise.resolve({ data: [], error: null }),
      termIds.length
        ? context.supabase.from("terms").select("id, name").in("id", termIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (tas.error) throw new Error(translatePortalError(tas.error, "subjects"));
    if (types.error) throw new Error(translatePortalError(types.error, "assessment types"));
    if (terms.error) throw new Error(translatePortalError(terms.error, "terms"));

    const subjIds = [
      ...new Set(((tas.data ?? []) as Array<{ subject_id: string }>).map((r) => r.subject_id)),
    ];
    const subjects = subjIds.length
      ? await context.supabase.from("subjects").select("id, name").in("id", subjIds)
      : { data: [], error: null };
    if (subjects.error) throw new Error(translatePortalError(subjects.error, "subjects"));

    const taMap = new Map(
      ((tas.data ?? []) as Array<{ id: string; subject_id: string }>).map((r) => [
        r.id,
        r.subject_id,
      ]),
    );
    const subjMap = new Map(
      ((subjects.data ?? []) as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]),
    );
    const typeMap = new Map(
      ((types.data ?? []) as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]),
    );
    const termMap = new Map(
      ((terms.data ?? []) as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]),
    );

    return {
      rows: rows
        .map((r) => {
          const a = r.assessments!;
          const subjectId = taMap.get(a.teaching_assignment_id) ?? null;
          return {
            scoreId: r.id,
            assessmentId: a.id,
            assessmentTitle: a.title,
            assessmentDate: a.assessment_date,
            score: r.score,
            status: r.status,
            minScore: a.min_score,
            maxScore: a.max_score,
            subjectName: subjectId ? (subjMap.get(subjectId) ?? null) : null,
            typeName: typeMap.get(a.assessment_type_id) ?? null,
            termName: a.term_id ? (termMap.get(a.term_id) ?? null) : null,
          } satisfies PortalScoreRow;
        })
        .sort((a, b) => (a.assessmentDate < b.assessmentDate ? 1 : -1)),
    };
  });

export type PortalScheduleRow = {
  entryId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  subjectName: string | null;
  classroomName: string | null;
  teacherName: string | null;
};

export const listPortalSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => portalScheduleInput.parse(x))
  .handler(async ({ data, context }): Promise<{ rows: PortalScheduleRow[] }> => {
    // Discover the child's active primary classroom via RLS-bound enrollment.
    const { data: enrollments, error: eErr } = await context.supabase
      .from("student_enrollments")
      .select("id, school_id")
      .eq("student_id", data.studentId)
      .in("status", ["active", "leave"])
      .order("enrolled_on", { ascending: false })
      .limit(1);
    if (eErr) throw new Error(translatePortalError(eErr, "enrollment"));
    const enrollment = enrollments?.[0];
    if (!enrollment) return { rows: [] };

    const { data: ce, error: ceErr } = await context.supabase
      .from("class_enrollments")
      .select("classroom_id")
      .eq("student_enrollment_id", enrollment.id)
      .eq("status", "active")
      .eq("is_primary", true)
      .maybeSingle();
    if (ceErr) throw new Error(translatePortalError(ceErr, "classroom"));
    const classroomId = (ce as { classroom_id: string } | null)?.classroom_id;
    if (!classroomId) return { rows: [] };

    // Teaching assignments for that classroom, then their published timetable
    // entries. RLS on timetable_entries permits published + RELATED-scoped read.
    const { data: tas, error: taErr } = await context.supabase
      .from("teaching_assignments")
      .select("id, subject_id, staff_school_assignment_id")
      .eq("classroom_id", classroomId);
    if (taErr) throw new Error(translatePortalError(taErr, "schedule"));
    const taIds = (tas ?? []).map((r) => r.id);
    if (taIds.length === 0) return { rows: [] };

    const { data: entries, error: enErr } = await context.supabase
      .from("timetable_entries")
      .select("id, weekday, start_time, end_time, teaching_assignment_id, status")
      .eq("status", "published")
      .in("teaching_assignment_id", taIds);
    if (enErr) throw new Error(translatePortalError(enErr, "schedule"));

    const subjIds = [
      ...new Set(((tas ?? []) as Array<{ subject_id: string }>).map((r) => r.subject_id)),
    ];
    const ssaIds = [
      ...new Set(
        ((tas ?? []) as Array<{ staff_school_assignment_id: string }>).map(
          (r) => r.staff_school_assignment_id,
        ),
      ),
    ];
    const [subjects, ssas, classroom] = await Promise.all([
      subjIds.length
        ? context.supabase.from("subjects").select("id, name").in("id", subjIds)
        : Promise.resolve({ data: [], error: null }),
      ssaIds.length
        ? context.supabase
            .from("staff_school_assignments")
            .select("id, staff_member_id")
            .in("id", ssaIds)
        : Promise.resolve({ data: [], error: null }),
      context.supabase.from("classrooms").select("id, name").eq("id", classroomId).maybeSingle(),
    ]);
    if (subjects.error) throw new Error(translatePortalError(subjects.error, "subjects"));
    if (ssas.error) throw new Error(translatePortalError(ssas.error, "staff"));

    const smIds = [
      ...new Set(
        ((ssas.data ?? []) as Array<{ staff_member_id: string }>).map((r) => r.staff_member_id),
      ),
    ];
    const staff = smIds.length
      ? await context.supabase.from("staff_members").select("id, full_name").in("id", smIds)
      : { data: [], error: null };
    if (staff.error) throw new Error(translatePortalError(staff.error, "staff"));

    const subjMap = new Map(
      ((subjects.data ?? []) as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]),
    );
    const ssaMap = new Map(
      ((ssas.data ?? []) as Array<{ id: string; staff_member_id: string }>).map((r) => [
        r.id,
        r.staff_member_id,
      ]),
    );
    const staffMap = new Map(
      ((staff.data ?? []) as Array<{ id: string; full_name: string }>).map((r) => [
        r.id,
        r.full_name,
      ]),
    );
    const taMap = new Map(
      (
        (tas ?? []) as Array<{
          id: string;
          subject_id: string;
          staff_school_assignment_id: string;
        }>
      ).map((r) => [r.id, r]),
    );
    const classroomName = (classroom.data as { name: string } | null)?.name ?? null;

    const rows: PortalScheduleRow[] = (
      (entries ?? []) as Array<{
        id: string;
        weekday: number;
        start_time: string;
        end_time: string;
        teaching_assignment_id: string;
      }>
    )
      .map((e) => {
        const ta = taMap.get(e.teaching_assignment_id);
        const smId = ta ? ssaMap.get(ta.staff_school_assignment_id) : undefined;
        return {
          entryId: e.id,
          dayOfWeek: e.weekday,
          startsAt: e.start_time,
          endsAt: e.end_time,
          subjectName: ta ? (subjMap.get(ta.subject_id) ?? null) : null,
          classroomName,
          teacherName: smId ? (staffMap.get(smId) ?? null) : null,
        };
      })
      .sort((a, b) =>
        a.dayOfWeek === b.dayOfWeek
          ? a.startsAt.localeCompare(b.startsAt)
          : a.dayOfWeek - b.dayOfWeek,
      );

    return { rows };
  });
