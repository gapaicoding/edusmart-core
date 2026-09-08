import { createServerFn } from "@tanstack/react-start";
import type { PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  reportCardIdInput,
  reportCardListInput,
  generateReportCardInput,
  listReportCardGenerationCandidatesInput,
  findExistingReportCardInput,
  transitionReportCardInput,
  reportCardMutationInput,
  updateHomeroomCommentInput,
  updateSubjectNarrativeInput,
  upsertNarrativeInput,
  deleteNarrativeInput,
} from "./reporting.schemas";
import { translateReportingError } from "./reporting.server";

type RpcResult = PromiseLike<{ data: unknown; error: PostgrestError | null }>;
type ReportCardRow = Database["public"]["Tables"]["report_cards"]["Row"];
type RpcCaller = (name: string, args: Record<string, unknown>) => RpcResult;
function rpc(context: { supabase: { rpc: unknown } }, name: string, args: Record<string, unknown>) {
  return (context.supabase.rpc as RpcCaller).call(context.supabase, name, args);
}
function fail(error: PostgrestError | null, action: string) {
  if (error) throw new Error(translateReportingError(error, action));
}

export const listReportCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => reportCardListInput.parse(x))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("report_cards")
      .select(
        "id,student_enrollment_id,academic_year_id,term_id,version,status,updated_at,published_at",
      );
    if (data.schoolId) query = query.eq("school_id", data.schoolId);
    if (data.academicYearId) query = query.eq("academic_year_id", data.academicYearId);
    if (data.termId) query = query.eq("term_id", data.termId);
    if (data.status) query = query.eq("status", data.status);
    const { data: cards, error } = await query.order("updated_at", { ascending: false });
    fail(error, "load report cards");
    const enrollmentIds = [...new Set((cards ?? []).map((x) => x.student_enrollment_id))];
    const { data: enrollments, error: e } = enrollmentIds.length
      ? await context.supabase
          .from("student_enrollments")
          .select("id,student_id,school_id,grade_level_id")
          .in("id", enrollmentIds)
      : { data: [], error: null };
    fail(e, "load enrollment context");
    const studentIds = [...new Set((enrollments ?? []).map((x) => x.student_id))];
    const { data: students, error: s } = studentIds.length
      ? await context.supabase.from("students").select("id,full_name").in("id", studentIds)
      : { data: [], error: null };
    fail(s, "load students");
    const gradeIds = [
      ...new Set(
        (enrollments ?? []).map((x) => x.grade_level_id).filter((x): x is string => Boolean(x)),
      ),
    ];
    const [years, terms, grades, classEnrollments] = await Promise.all([
      context.supabase
        .from("academic_years")
        .select("id,name")
        .in("id", [...new Set((cards ?? []).map((x) => x.academic_year_id))]),
      context.supabase
        .from("terms")
        .select("id,name")
        .in("id", [...new Set((cards ?? []).map((x) => x.term_id))]),
      gradeIds.length
        ? context.supabase.from("grade_levels").select("id,name").in("id", gradeIds)
        : Promise.resolve({ data: [], error: null }),
      context.supabase
        .from("class_enrollments")
        .select("student_enrollment_id,classroom_id")
        .in("student_enrollment_id", enrollmentIds)
        .eq("is_primary", true),
    ]);
    for (const result of [years, terms, grades, classEnrollments])
      fail(result.error, "load report card list context");
    const classroomIds = [...new Set((classEnrollments.data ?? []).map((x) => x.classroom_id))];
    const classrooms = classroomIds.length
      ? await context.supabase.from("classrooms").select("id,name").in("id", classroomIds)
      : { data: [], error: null };
    fail(classrooms.error, "load classrooms");
    const em = new Map((enrollments ?? []).map((x) => [x.id, x]));
    const sm = new Map((students ?? []).map((x) => [x.id, x.full_name]));
    const ym = new Map((years.data ?? []).map((x) => [x.id, x.name]));
    const tm = new Map((terms.data ?? []).map((x) => [x.id, x.name]));
    const gm = new Map((grades.data ?? []).map((x) => [x.id, x.name]));
    const cem = new Map(
      (classEnrollments.data ?? []).map((x) => [x.student_enrollment_id, x.classroom_id]),
    );
    const cm = new Map((classrooms.data ?? []).map((x) => [x.id, x.name]));
    const search = data.search?.toLowerCase();
    return {
      rows: (cards ?? [])
        .map((c) => ({
          ...c,
          studentName: sm.get(em.get(c.student_enrollment_id)?.student_id ?? "") ?? "Student",
          academicYearName: ym.get(c.academic_year_id) ?? "Academic year",
          termName: tm.get(c.term_id) ?? "Term",
          gradeLevelName: gm.get(em.get(c.student_enrollment_id)?.grade_level_id ?? "") ?? null,
          classroomName: cm.get(cem.get(c.student_enrollment_id) ?? "") ?? null,
        }))
        .filter((c) => !search || c.studentName.toLowerCase().includes(search)),
    };
  });

export const getReportCard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => reportCardIdInput.parse(x))
  .handler(async ({ data, context }) => {
    const [card, entries, narratives] = await Promise.all([
      context.supabase.from("report_cards").select("*").eq("id", data.reportCardId).maybeSingle(),
      context.supabase
        .from("report_card_subject_entries")
        .select("id,subject_id,final_score,predicate,narrative,updated_at")
        .eq("report_card_id", data.reportCardId),
      context.supabase
        .from("report_card_narratives")
        .select("id,section_code,title,content,sequence,updated_at")
        .eq("report_card_id", data.reportCardId)
        .order("sequence"),
    ]);
    fail(card.error, "load report card");
    fail(entries.error, "load subject snapshots");
    fail(narratives.error, "load narratives");
    if (!card.data) return null;
    const enrollment = await context.supabase
      .from("student_enrollments")
      .select("id,student_id,grade_level_id")
      .eq("id", card.data.student_enrollment_id)
      .maybeSingle();
    fail(enrollment.error, "load enrollment context");
    if (!enrollment.data) return null;
    const [student, school, year, term, grade, classEnrollment, history] = await Promise.all([
      context.supabase
        .from("students")
        .select("id,full_name")
        .eq("id", enrollment.data.student_id)
        .maybeSingle(),
      context.supabase
        .from("schools")
        .select("id,name")
        .eq("id", card.data.school_id)
        .maybeSingle(),
      context.supabase
        .from("academic_years")
        .select("id,name")
        .eq("id", card.data.academic_year_id)
        .maybeSingle(),
      context.supabase.from("terms").select("id,name").eq("id", card.data.term_id).maybeSingle(),
      enrollment.data.grade_level_id
        ? context.supabase
            .from("grade_levels")
            .select("id,name")
            .eq("id", enrollment.data.grade_level_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      context.supabase
        .from("class_enrollments")
        .select("classroom_id")
        .eq("student_enrollment_id", enrollment.data.id)
        .eq("is_primary", true)
        .maybeSingle(),
      context.supabase
        .from("report_cards")
        .select("id,version,status,updated_at,published_at")
        .eq("student_enrollment_id", card.data.student_enrollment_id)
        .eq("term_id", card.data.term_id)
        .order("version", { ascending: false }),
    ]);
    for (const result of [student, school, year, term, grade, classEnrollment, history])
      fail(result.error, "load report card context");
    let classroomName: string | null = null;
    if (classEnrollment.data?.classroom_id) {
      const classroom = await context.supabase
        .from("classrooms")
        .select("name")
        .eq("id", classEnrollment.data.classroom_id)
        .maybeSingle();
      fail(classroom.error, "load classroom");
      classroomName = classroom.data?.name ?? null;
    }
    const subjectIds = [...new Set((entries.data ?? []).map((x) => x.subject_id))];
    const subjects = subjectIds.length
      ? await context.supabase.from("subjects").select("id,name").in("id", subjectIds)
      : { data: [], error: null };
    fail(subjects.error, "load subjects");
    const names = new Map((subjects.data ?? []).map((x) => [x.id, x.name]));
    return {
      card: card.data,
      entries: (entries.data ?? []).map((x) => ({
        ...x,
        subjectName: names.get(x.subject_id) ?? "Subject",
      })),
      narratives: narratives.data ?? [],
      context: {
        studentName: student.data?.full_name ?? "Student",
        schoolName: school.data?.name ?? "School",
        academicYearName: year.data?.name ?? "Academic year",
        termName: term.data?.name ?? "Term",
        gradeLevelName: grade.data?.name ?? null,
        classroomName,
      },
      history: history.data ?? [],
    };
  });

export const listReportCardGenerationCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => listReportCardGenerationCandidatesInput.parse(x))
  .handler(async ({ data, context }) => {
    let enrollmentQuery = context.supabase
      .from("student_enrollments")
      .select("id,student_id,academic_year_id,grade_level_id,school_id,status")
      .eq("school_id", data.schoolId)
      .eq("status", "active");
    if (data.academicYearId)
      enrollmentQuery = enrollmentQuery.eq("academic_year_id", data.academicYearId);
    const { data: enrollments, error } = await enrollmentQuery.order("enrolled_on", {
      ascending: false,
    });
    fail(error, "load generation candidates");
    const rows = enrollments ?? [];
    if (!rows.length) return { rows: [] };
    const studentIds = [...new Set(rows.map((r) => r.student_id))];
    const yearIds = [...new Set(rows.map((r) => r.academic_year_id))];
    const gradeIds = [...new Set(rows.map((r) => r.grade_level_id).filter(Boolean))];
    const enrollmentIds = rows.map((r) => r.id);
    const [students, years, grades, classEnrollments] = await Promise.all([
      context.supabase.from("students").select("id,full_name").in("id", studentIds),
      context.supabase.from("academic_years").select("id,name").in("id", yearIds),
      gradeIds.length
        ? context.supabase.from("grade_levels").select("id,name").in("id", gradeIds)
        : Promise.resolve({ data: [], error: null }),
      context.supabase
        .from("class_enrollments")
        .select("student_enrollment_id,classroom_id")
        .in("student_enrollment_id", enrollmentIds)
        .eq("is_primary", true),
    ]);
    for (const result of [students, years, grades, classEnrollments])
      fail(result.error, "load candidate context");
    const classroomIds = [...new Set((classEnrollments.data ?? []).map((x) => x.classroom_id))];
    const classrooms = classroomIds.length
      ? await context.supabase.from("classrooms").select("id,name").in("id", classroomIds)
      : { data: [], error: null };
    fail(classrooms.error, "load classrooms");
    const sm = new Map((students.data ?? []).map((x) => [x.id, x.full_name]));
    const ym = new Map((years.data ?? []).map((x) => [x.id, x.name]));
    const gm = new Map((grades.data ?? []).map((x) => [x.id, x.name]));
    const cem = new Map(
      (classEnrollments.data ?? []).map((x) => [x.student_enrollment_id, x.classroom_id]),
    );
    const cm = new Map((classrooms.data ?? []).map((x) => [x.id, x.name]));
    const search = data.search?.toLowerCase();
    return {
      rows: rows
        .map((r) => ({
          studentEnrollmentId: r.id,
          studentId: r.student_id,
          studentName: sm.get(r.student_id) ?? "Student",
          academicYearId: r.academic_year_id,
          academicYearName: ym.get(r.academic_year_id) ?? "Academic year",
          gradeLevelName: gm.get(r.grade_level_id ?? "") ?? null,
          classroomName: cm.get(cem.get(r.id) ?? "") ?? null,
        }))
        .filter((r) => !search || r.studentName.toLowerCase().includes(search)),
    };
  });

export const findExistingReportCard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => findExistingReportCardInput.parse(x))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("report_cards")
      .select("id,version,status")
      .eq("student_enrollment_id", data.studentEnrollmentId)
      .eq("term_id", data.termId)
      .order("version", { ascending: false })
      .limit(1);
    fail(error, "look up existing report card");
    return { card: (rows ?? [])[0] ?? null };
  });

export const generateReportCardDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => generateReportCardInput.parse(x))
  .handler(async ({ data, context }) => {
    const r = await rpc(context, "generate_report_card_draft", {
      p_student_enrollment_id: data.studentEnrollmentId,
      p_term_id: data.termId,
      p_expected_updated_at: data.expectedUpdatedAt ?? null,
    });
    fail(r.error, "generate report card");
    return { id: r.data as string };
  });
export const transitionReportCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => transitionReportCardInput.parse(x))
  .handler(async ({ data, context }) => {
    const r = await rpc(context, "transition_report_card", {
      p_report_card_id: data.reportCardId,
      p_expected_updated_at: data.expectedUpdatedAt,
      p_action: data.action,
    });
    fail(r.error, "change report card status");
    return { card: r.data as ReportCardRow };
  });
export const createReportCardRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => reportCardMutationInput.parse(x))
  .handler(async ({ data, context }) => {
    const r = await rpc(context, "create_report_card_revision", {
      p_published_report_card_id: data.reportCardId,
      p_expected_updated_at: data.expectedUpdatedAt,
    });
    fail(r.error, "create report card revision");
    return { id: r.data as string };
  });
export const publishReportCardVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => reportCardMutationInput.parse(x))
  .handler(async ({ data, context }) => {
    const r = await rpc(context, "publish_report_card", {
      p_report_card_id: data.reportCardId,
      p_expected_updated_at: data.expectedUpdatedAt,
    });
    fail(r.error, "publish report card");
    return { card: r.data as ReportCardRow };
  });

export const updateReportCardComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => updateHomeroomCommentInput.parse(x))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("report_cards")
      .update({ homeroom_comment: data.homeroomComment })
      .eq("id", data.reportCardId)
      .eq("status", "draft")
      .eq("updated_at", data.expectedUpdatedAt)
      .select("id,updated_at");
    fail(error, "save homeroom comment");
    if ((rows ?? []).length !== 1) throw new Error("This report card changed. Refresh and retry.");
    return rows![0];
  });
export const updateReportSubjectNarrative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => updateSubjectNarrativeInput.parse(x))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("report_card_subject_entries")
      .update({ narrative: data.narrative })
      .eq("id", data.entryId)
      .eq("report_card_id", data.reportCardId)
      .eq("updated_at", data.expectedUpdatedAt)
      .select("id,updated_at");
    fail(error, "save subject narrative");
    if ((rows ?? []).length !== 1)
      throw new Error("This subject snapshot changed. Refresh and retry.");
    return rows![0];
  });
export const saveReportNarrative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => upsertNarrativeInput.parse(x))
  .handler(async ({ data, context }) => {
    if (data.narrativeId) {
      const { data: rows, error } = await context.supabase
        .from("report_card_narratives")
        .update({
          section_code: data.sectionCode,
          title: data.title,
          content: data.content,
          sequence: data.sequence,
        })
        .eq("id", data.narrativeId)
        .eq("report_card_id", data.reportCardId)
        .eq("updated_at", data.expectedUpdatedAt)
        .select("id,updated_at");
      fail(error, "save narrative");
      if ((rows ?? []).length !== 1) throw new Error("This narrative changed. Refresh and retry.");
      return rows![0];
    }
    const card = await context.supabase
      .from("report_cards")
      .select("organization_id,school_id,status,updated_at")
      .eq("id", data.reportCardId)
      .single();
    fail(card.error, "load report card");
    if (!card.data) throw new Error("Report card not found.");
    if (card.data.status !== "draft" || card.data.updated_at !== data.expectedUpdatedAt)
      throw new Error("This report card changed. Refresh and retry.");
    const result = await context.supabase
      .from("report_card_narratives")
      .insert({
        organization_id: card.data.organization_id,
        school_id: card.data.school_id,
        report_card_id: data.reportCardId,
        section_code: data.sectionCode,
        title: data.title,
        content: data.content,
        sequence: data.sequence,
      })
      .select("id,updated_at")
      .single();
    fail(result.error, "create narrative");
    return result.data;
  });
export const deleteReportNarrative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => deleteNarrativeInput.parse(x))
  .handler(async ({ data, context }) => {
    const card = await context.supabase
      .from("report_cards")
      .select("status,updated_at")
      .eq("id", data.reportCardId)
      .single();
    fail(card.error, "load report card");
    if (!card.data) throw new Error("Report card not found.");
    if (card.data.status !== "draft" || card.data.updated_at !== data.expectedUpdatedAt)
      throw new Error("This report card changed. Refresh and retry.");
    const { data: rows, error } = await context.supabase
      .from("report_card_narratives")
      .delete()
      .eq("id", data.narrativeId)
      .eq("report_card_id", data.reportCardId)
      .select("id");
    fail(error, "delete narrative");
    if ((rows ?? []).length !== 1) throw new Error("This narrative changed. Refresh and retry.");
    return { id: rows![0]!.id };
  });
