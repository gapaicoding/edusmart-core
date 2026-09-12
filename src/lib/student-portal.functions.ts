import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  callStudentPublishedScheduleRpc,
  callStudentOwnAttendanceRpc,
  getAuthenticatedStudentSubject,
  translateStudentPortalError,
} from "./student-portal.server";
import {
  createStudentPortalInvitationInput,
  studentPortalAttendanceInput,
  studentPortalContextInput,
  studentPortalReportCardInput,
  studentPortalScoresInput,
} from "./student-portal.schemas";

/**
 * Batch 9 — Student Portal server functions.
 *
 * Every handler resolves the authenticated student itself via
 * getAuthenticatedStudentSubject (auth.uid() -> students.profile_id). No
 * handler accepts or trusts a client-provided studentId. This module does
 * not reuse any Parent Portal helper — the Student and Parent authorization
 * models are kept separate by design (see student-portal.server.ts).
 */

export type StudentOverview = {
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

export const getStudentOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => studentPortalContextInput.parse(x))
  .handler(async ({ data, context }): Promise<StudentOverview | null> => {
    const subject = await getAuthenticatedStudentSubject(context.supabase, context.userId, {
      organizationId: data.organizationId,
    });
    if (!subject) return null;

    const { data: enrollments, error: enrollErr } = await context.supabase
      .from("student_enrollments")
      .select("id, school_id, academic_year_id, status, enrolled_on, grade_level_id")
      .eq("student_id", subject.studentId)
      .in("status", ["active", "leave"])
      .order("enrolled_on", { ascending: false })
      .limit(1);
    if (enrollErr) throw new Error(translateStudentPortalError(enrollErr, "enrollment"));
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
      studentId: subject.studentId,
      fullName: subject.fullName,
      status: subject.status,
      organizationId: subject.organizationId,
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

export type StudentScheduleRow = {
  entryId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  subjectName: string | null;
  classroomName: string | null;
  teacherName: string | null;
};

export const listStudentSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => studentPortalContextInput.parse(x))
  .handler(async ({ data, context }): Promise<{ rows: StudentScheduleRow[] }> => {
    const subject = await getAuthenticatedStudentSubject(context.supabase, context.userId, {
      organizationId: data.organizationId,
    });
    if (!subject) return { rows: [] };

    const { data: schedule, error } = await callStudentPublishedScheduleRpc(
      context.supabase,
      subject.organizationId,
    );
    if (error) throw new Error(translateStudentPortalError(error, "schedule"));

    const rows: StudentScheduleRow[] = (schedule ?? []).map((row) => ({
      entryId: row.entry_id,
      dayOfWeek: row.day_of_week,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      subjectName: row.subject_name,
      classroomName: row.classroom_name,
      teacherName: row.teacher_name,
    }));

    return { rows };
  });

export type StudentAttendanceRow = {
  recordId: string;
  sessionId: string;
  sessionDate: string;
  sessionStatus: string;
  status: string;
};

export const listStudentAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => studentPortalAttendanceInput.parse(x))
  .handler(async ({ data, context }): Promise<{ rows: StudentAttendanceRow[] }> => {
    const subject = await getAuthenticatedStudentSubject(context.supabase, context.userId, {
      organizationId: data.organizationId,
      schoolId: data.schoolId,
    });
    if (!subject) return { rows: [] };

    // SECURITY DEFINER RPC derives the student itself; never pass a student id.
    const { data: rows, error } = await callStudentOwnAttendanceRpc(context.supabase, {
      p_organization_id: data.organizationId,
      p_school_id: data.schoolId,
      p_from: data.from ?? null,
      p_to: data.to ?? null,
    });
    if (error) throw new Error(translateStudentPortalError(error, "attendance"));
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

export type StudentScoreRow = {
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

export const listStudentScores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => studentPortalScoresInput.parse(x))
  .handler(async ({ data, context }): Promise<{ rows: StudentScoreRow[] }> => {
    const subject = await getAuthenticatedStudentSubject(context.supabase, context.userId, {
      organizationId: data.organizationId,
    });
    if (!subject) return { rows: [] };

    let seQ = context.supabase
      .from("student_enrollments")
      .select("id, academic_year_id")
      .eq("student_id", subject.studentId);
    if (data.academicYearId) seQ = seQ.eq("academic_year_id", data.academicYearId);
    const { data: enrollments, error: eErr } = await seQ;
    if (eErr) throw new Error(translateStudentPortalError(eErr, "enrollment"));
    const seIds = (enrollments ?? []).map((r) => r.id);
    if (seIds.length === 0) return { rows: [] };

    // student_scores_select RLS: only published assessments + exact OWN
    // subject are visible to a non-staff caller.
    const { data: scores, error: sErr } = await context.supabase
      .from("student_scores")
      .select(
        "id, assessment_id, score, status, student_enrollment_id, assessments(id, title, assessment_date, min_score, max_score, status, term_id, teaching_assignment_id, assessment_type_id)",
      )
      .in("student_enrollment_id", seIds);
    if (sErr) throw new Error(translateStudentPortalError(sErr, "scores"));

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
    if (tas.error) throw new Error(translateStudentPortalError(tas.error, "subjects"));
    if (types.error) throw new Error(translateStudentPortalError(types.error, "assessment types"));
    if (terms.error) throw new Error(translateStudentPortalError(terms.error, "terms"));

    const subjIds = [
      ...new Set(((tas.data ?? []) as Array<{ subject_id: string }>).map((r) => r.subject_id)),
    ];
    const subjects = subjIds.length
      ? await context.supabase.from("subjects").select("id, name").in("id", subjIds)
      : { data: [], error: null };
    if (subjects.error) throw new Error(translateStudentPortalError(subjects.error, "subjects"));

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
          } satisfies StudentScoreRow;
        })
        .sort((a, b) => (a.assessmentDate < b.assessmentDate ? 1 : -1)),
    };
  });

export type StudentReportCardSummary = {
  id: string;
  studentName: string;
  academicYearName: string;
  termName: string;
  version: number;
  publishedAt: string;
};

export const listStudentReportCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => studentPortalContextInput.parse(x))
  .handler(async ({ data, context }): Promise<{ rows: StudentReportCardSummary[] }> => {
    const subject = await getAuthenticatedStudentSubject(context.supabase, context.userId, {
      organizationId: data.organizationId,
    });
    if (!subject) return { rows: [] };

    const enrollments = await context.supabase
      .from("student_enrollments")
      .select("id")
      .eq("student_id", subject.studentId);
    if (enrollments.error)
      throw new Error(translateStudentPortalError(enrollments.error, "report cards"));
    const enrollmentIds = (enrollments.data ?? []).map((row) => row.id);
    if (!enrollmentIds.length) return { rows: [] };

    // Only exact own student's published report cards — no draft/submitted/
    // reviewed/revised-as-current cards, ever.
    const cards = await context.supabase
      .from("report_cards")
      .select("id,academic_year_id,term_id,version,published_at,status")
      .in("student_enrollment_id", enrollmentIds)
      .eq("status", "published")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false });
    if (cards.error) throw new Error(translateStudentPortalError(cards.error, "report cards"));

    const yearIds = [...new Set((cards.data ?? []).map((row) => row.academic_year_id))];
    const termIds = [...new Set((cards.data ?? []).map((row) => row.term_id))];
    const [years, terms] = await Promise.all([
      yearIds.length
        ? context.supabase.from("academic_years").select("id,name").in("id", yearIds)
        : Promise.resolve({ data: [], error: null }),
      termIds.length
        ? context.supabase.from("terms").select("id,name").in("id", termIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (years.error) throw new Error(translateStudentPortalError(years.error, "academic years"));
    if (terms.error) throw new Error(translateStudentPortalError(terms.error, "terms"));
    const yearMap = new Map((years.data ?? []).map((row) => [row.id, row.name]));
    const termMap = new Map((terms.data ?? []).map((row) => [row.id, row.name]));

    return {
      rows: (cards.data ?? []).map((row) => ({
        id: row.id,
        studentName: subject.fullName,
        academicYearName: yearMap.get(row.academic_year_id) ?? "Academic year",
        termName: termMap.get(row.term_id) ?? "Term",
        version: row.version,
        publishedAt: row.published_at!,
      })),
    };
  });

export const getStudentReportCard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => studentPortalReportCardInput.parse(x))
  .handler(async ({ data, context }) => {
    const subject = await getAuthenticatedStudentSubject(context.supabase, context.userId, {
      organizationId: data.organizationId,
    });
    if (!subject) return null;

    const card = await context.supabase
      .from("report_cards")
      .select(
        "id,school_id,academic_year_id,term_id,student_enrollment_id,version,status,published_at,homeroom_comment,attendance_summary",
      )
      .eq("id", data.reportCardId)
      .eq("status", "published")
      .maybeSingle();
    if (card.error) throw new Error(translateStudentPortalError(card.error, "report card"));
    if (!card.data) return null;

    const enrollment = await context.supabase
      .from("student_enrollments")
      .select("student_id")
      .eq("id", card.data.student_enrollment_id)
      .eq("student_id", subject.studentId)
      .maybeSingle();
    if (enrollment.error)
      throw new Error(translateStudentPortalError(enrollment.error, "report card enrollment"));
    if (!enrollment.data) return null;

    const [entries, narratives, school, year, term] = await Promise.all([
      context.supabase
        .from("report_card_subject_entries")
        .select("id,subject_id,final_score,predicate,narrative")
        .eq("report_card_id", card.data.id),
      context.supabase
        .from("report_card_narratives")
        .select("id,section_code,title,content,sequence")
        .eq("report_card_id", card.data.id)
        .order("sequence"),
      context.supabase.from("schools").select("name").eq("id", card.data.school_id).maybeSingle(),
      context.supabase
        .from("academic_years")
        .select("name")
        .eq("id", card.data.academic_year_id)
        .maybeSingle(),
      context.supabase.from("terms").select("name").eq("id", card.data.term_id).maybeSingle(),
    ]);
    for (const result of [entries, narratives, school, year, term])
      if (result.error)
        throw new Error(translateStudentPortalError(result.error, "report card details"));

    const subjectIds = [...new Set((entries.data ?? []).map((row) => row.subject_id))];
    const subjects = subjectIds.length
      ? await context.supabase.from("subjects").select("id,name").in("id", subjectIds)
      : { data: [], error: null };
    if (subjects.error)
      throw new Error(translateStudentPortalError(subjects.error, "report card subjects"));
    const subjectMap = new Map((subjects.data ?? []).map((row) => [row.id, row.name]));

    return {
      card: {
        ...card.data,
        studentName: subject.fullName,
        schoolName: school.data?.name ?? "School",
        academicYearName: year.data?.name ?? "Academic year",
        termName: term.data?.name ?? "Term",
      },
      entries: (entries.data ?? []).map((row) => ({
        ...row,
        subjectName: subjectMap.get(row.subject_id) ?? "Subject",
      })),
      narratives: narratives.data ?? [],
    };
  });

/**
 * createStudentPortalInvitation
 *
 * The ONLY supported way to issue a STUDENT/OWN invitation after B9. The
 * browser may submit the exact student record id, school id, and email; the
 * server independently verifies everything else. Role identity is resolved
 * server-side — the browser never supplies or influences roleId/scope.
 */
export const createStudentPortalInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => createStudentPortalInvitationInput.parse(x))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { hashInvitationToken, generateInvitationToken, normalizeEmail } =
      await import("./invitations.server");

    // 1. Caller must hold membership.invite in the exact organization/school.
    const { data: canInvite, error: inviteErr } = await supabase.rpc("has_permission", {
      p_permission_code: "membership.invite",
      p_organization_id: data.organizationId,
      p_school_id: data.schoolId,
    });
    if (inviteErr) throw new Error(inviteErr.message);
    if (!canInvite) throw new Error("Forbidden: membership.invite is required");

    // 2. Caller must additionally hold student-management authority.
    const { data: canManageStudents, error: manageErr } = await supabase.rpc("has_permission", {
      p_permission_code: "student.read",
      p_organization_id: data.organizationId,
      p_school_id: data.schoolId,
    });
    if (manageErr) throw new Error(manageErr.message);
    if (!canManageStudents) throw new Error("Forbidden: student management authority is required");

    // 3. Student must belong to the organization (RLS-scoped read).
    const { data: student, error: studentErr } = await supabase
      .from("students")
      .select("id, organization_id, profile_id, status")
      .eq("id", data.studentId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (studentErr) throw new Error(studentErr.message);
    if (!student) throw new Error("That student does not exist, or you cannot access it.");

    // 4. Target student must not already be bound to a (different) profile.
    if (student.profile_id) {
      throw new Error(
        "This student already has a linked Student Portal account. Issuing a new invitation would not change the existing binding.",
      );
    }

    // 5. Student must have a valid enrollment in the selected school.
    const { data: enrollment, error: enrollErr } = await supabase
      .from("student_enrollments")
      .select("id")
      .eq("student_id", data.studentId)
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId)
      .in("status", ["active", "leave"])
      .limit(1)
      .maybeSingle();
    if (enrollErr) throw new Error(enrollErr.message);
    if (!enrollment)
      throw new Error("This student has no valid enrollment in the selected school.");

    // 6. Resolve the canonical STUDENT system role server-side (never
    //    trusted from the browser).
    const { data: studentRole, error: roleErr } = await supabase
      .from("roles")
      .select("id")
      .is("organization_id", null)
      .eq("code", "STUDENT")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!studentRole) throw new Error("The STUDENT system role is not configured.");

    const token = generateInvitationToken();
    const tokenHash = await hashInvitationToken(token);
    const expiresAt = new Date(
      Date.now() + (data.expiresInDays ?? 7) * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Privileged write: authorization above was proven with the caller's own
    // token before this admin write happens (existing invitation trust
    // boundary).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("invitations").insert({
      organization_id: data.organizationId,
      school_id: data.schoolId,
      email: normalizeEmail(data.email),
      invited_role_id: studentRole.id,
      invited_scope_type: "OWN",
      invited_scope_id: null,
      target_student_id: data.studentId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      invited_by_profile_id: userId,
    });
    if (error) throw new Error(error.message);

    return { token, expiresAt };
  });
