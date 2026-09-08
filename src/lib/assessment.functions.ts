import { createServerFn } from "@tanstack/react-start";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertWriteApplied, insertWithoutReturning } from "./sis.server";
import { translateAssessmentError } from "./assessment.server";
import {
  assessmentInput,
  assessmentLifecycleInput,
  assessmentListInput,
  assessmentRecordInput,
  scoreSaveInput,
} from "./assessment.schemas";

export type AssessmentListRow = {
  id: string;
  title: string;
  assessmentDate: string;
  status: string;
  minScore: number;
  maxScore: number;
  weight: number | null;
  updatedAt: string;
  classroomName: string;
  subjectName: string;
  typeName: string;
};
export type AssessmentOptions = {
  assignments: Array<{ id: string; label: string }>;
  types: Array<{ id: string; name: string; defaultWeight: number | null }>;
};

type Db = SupabaseClient<Database>;
type LabelRow = Pick<
  Database["public"]["Tables"]["assessments"]["Row"],
  | "id"
  | "title"
  | "assessment_date"
  | "status"
  | "min_score"
  | "max_score"
  | "weight"
  | "updated_at"
  | "teaching_assignment_id"
  | "assessment_type_id"
>;
type AssignmentBrief = { id: string; classroom_id: string; subject_id: string };

async function labels(supabase: Db, rows: LabelRow[]): Promise<AssessmentListRow[]> {
  const aids = [...new Set(rows.map((r) => r.teaching_assignment_id))];
  const tids = [...new Set(rows.map((r) => r.assessment_type_id).filter(Boolean))];
  const assignments = aids.length
    ? await supabase
        .from("teaching_assignments")
        .select("id, classroom_id, subject_id")
        .in("id", aids)
    : { data: [], error: null };
  if (assignments.error)
    throw new Error(translateAssessmentError(assignments.error, "Teaching assignments"));
  const cids = [...new Set((assignments.data ?? []).map((r) => r.classroom_id))];
  const sids = [...new Set((assignments.data ?? []).map((r) => r.subject_id))];
  const [classes, subjects, types] = await Promise.all([
    cids.length
      ? supabase.from("classrooms").select("id, name").in("id", cids)
      : { data: [], error: null },
    sids.length
      ? supabase.from("subjects").select("id, name").in("id", sids)
      : { data: [], error: null },
    tids.length
      ? supabase.from("assessment_types").select("id, name").in("id", tids)
      : { data: [], error: null },
  ]);
  for (const x of [classes, subjects, types])
    if (x.error) throw new Error(translateAssessmentError(x.error, "Assessment context"));
  const am = new Map((assignments.data ?? []).map((r) => [r.id, r]));
  const cm = new Map((classes.data ?? []).map((r) => [r.id, r.name]));
  const sm = new Map((subjects.data ?? []).map((r) => [r.id, r.name]));
  const tm = new Map((types.data ?? []).map((r) => [r.id, r.name]));
  return rows.map((r) => {
    const a: AssignmentBrief | undefined = am.get(r.teaching_assignment_id);
    return {
      id: r.id,
      title: r.title,
      assessmentDate: r.assessment_date,
      status: r.status,
      minScore: r.min_score,
      maxScore: r.max_score,
      weight: r.weight,
      updatedAt: r.updated_at,
      classroomName: (a ? cm.get(a.classroom_id) : undefined) || "Classroom",
      subjectName: (a ? sm.get(a.subject_id) : undefined) || "Subject",
      typeName: (tm.get(r.assessment_type_id) as string) || "Assessment",
    };
  });
}

export const listAssessments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => assessmentListInput.parse(x))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("assessments")
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId)
      .eq("academic_year_id", data.academicYearId)
      .eq("term_id", data.termId);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q.order("assessment_date", { ascending: false });
    if (error) throw new Error(translateAssessmentError(error, "Assessments"));
    return { rows: await labels(context.supabase, rows ?? []) };
  });

export const getAssessmentOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => assessmentListInput.parse(x))
  .handler(async ({ data, context }): Promise<AssessmentOptions> => {
    const [a, t] = await Promise.all([
      context.supabase
        .from("teaching_assignments")
        .select("id, classroom_id, subject_id")
        .eq("organization_id", data.organizationId)
        .eq("school_id", data.schoolId)
        .eq("academic_year_id", data.academicYearId)
        .eq("term_id", data.termId)
        .eq("status", "active"),
      context.supabase
        .from("assessment_types")
        .select("id, name, default_weight")
        .eq("organization_id", data.organizationId)
        .eq("school_id", data.schoolId)
        .eq("is_active", true)
        .order("name"),
    ]);
    if (a.error) throw new Error(translateAssessmentError(a.error, "Teaching assignments"));
    if (t.error) throw new Error(translateAssessmentError(t.error, "Assessment types"));
    const decorated = await labels(
      context.supabase,
      (a.data ?? []).map((r) => ({
        id: r.id,
        title: "",
        assessment_date: "",
        status: "",
        min_score: 0,
        max_score: 0,
        weight: null,
        updated_at: "",
        teaching_assignment_id: r.id,
        assessment_type_id: "",
      })),
    );
    return {
      assignments: decorated.map((r, i) => ({
        id: (a.data ?? [])[i]!.id,
        label: `${r.subjectName} · ${r.classroomName}`,
      })),
      types: (t.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        defaultWeight: r.default_weight,
      })),
    };
  });

export const saveAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => assessmentInput.parse(x))
  .handler(async ({ data, context }) => {
    const payload = {
      organization_id: data.organizationId,
      school_id: data.schoolId,
      academic_year_id: data.academicYearId,
      term_id: data.termId,
      teaching_assignment_id: data.teachingAssignmentId,
      assessment_type_id: data.assessmentTypeId,
      title: data.title,
      description: data.description ?? null,
      assessment_date: data.assessmentDate,
      min_score: data.minScore,
      max_score: data.maxScore,
      weight: data.weight ?? null,
    };
    if (!data.id)
      return insertWithoutReturning(
        context.supabase,
        "assessments",
        { ...payload, status: "draft" },
        "Assessment",
      );
    const { data: rows, error } = await context.supabase
      .from("assessments")
      .update(payload)
      .eq("id", data.id)
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId)
      .eq("status", "draft")
      .eq("updated_at", data.expectedUpdatedAt!)
      .select("id");
    if (error) throw new Error(translateAssessmentError(error, "Assessment"));
    return { id: assertWriteApplied(rows, "Updating this assessment").id };
  });

export const changeAssessmentLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => assessmentLifecycleInput.parse(x))
  .handler(async ({ data, context }) => {
    const status = { open: "open", close: "closed", publish: "published", archive: "archived" }[
      data.action
    ];
    const { data: rows, error } = await context.supabase
      .from("assessments")
      .update({ status })
      .eq("id", data.id)
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId)
      .eq("academic_year_id", data.academicYearId)
      .eq("term_id", data.termId)
      .eq("updated_at", data.expectedUpdatedAt)
      .select("id");
    if (error) throw new Error(translateAssessmentError(error, "Assessment lifecycle"));
    return { id: assertWriteApplied(rows, "Changing this assessment").id };
  });

export const getAssessment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => assessmentRecordInput.parse(x))
  .handler(async ({ data, context }) => {
    const { data: a, error } = await context.supabase
      .from("assessments")
      .select("*")
      .eq("id", data.id)
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId)
      .eq("academic_year_id", data.academicYearId)
      .eq("term_id", data.termId)
      .maybeSingle();
    if (error) throw new Error(translateAssessmentError(error, "Assessment"));
    if (!a) throw new Error("This assessment is unavailable in your permission scope.");
    const { data: ta, error: te } = await context.supabase
      .from("teaching_assignments")
      .select("classroom_id, subject_id")
      .eq("id", a.teaching_assignment_id)
      .maybeSingle();
    if (te || !ta) throw new Error("The assessment teaching context is unavailable.");
    const { data: ce, error: ceError } = await context.supabase
      .from("class_enrollments")
      .select("student_enrollment_id")
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId)
      .eq("classroom_id", ta.classroom_id)
      .eq("is_primary", true)
      .lte("starts_on", a.assessment_date)
      .or(`ends_on.is.null,ends_on.gte.${a.assessment_date}`);
    if (ceError) throw new Error(translateAssessmentError(ceError, "Assessment roster"));
    const ids = [...new Set((ce ?? []).map((r) => r.student_enrollment_id))];
    const enrollments = ids.length
      ? await context.supabase
          .from("student_enrollments")
          .select("id, student_id, student_number")
          .in("id", ids)
          .eq("academic_year_id", data.academicYearId)
          .lte("enrolled_on", a.assessment_date)
          .or(`ended_on.is.null,ended_on.gte.${a.assessment_date}`)
      : { data: [], error: null };
    if (enrollments.error)
      throw new Error(translateAssessmentError(enrollments.error, "Student enrolments"));
    const studentIds = (enrollments.data ?? []).map((r) => r.student_id);
    const [students, scores] = await Promise.all([
      studentIds.length
        ? context.supabase
            .from("students")
            .select("id, full_name, preferred_name")
            .in("id", studentIds)
        : { data: [], error: null },
      context.supabase.from("student_scores").select("*").eq("assessment_id", a.id),
    ]);
    if (students.error || scores.error) throw new Error("We couldn't load the assessment roster.");
    const sm = new Map((students.data ?? []).map((r) => [r.id, r]));
    const rm = new Map((scores.data ?? []).map((r) => [r.student_enrollment_id, r]));
    return {
      assessment: a,
      classroomId: ta.classroom_id,
      subjectId: ta.subject_id,
      roster: (enrollments.data ?? [])
        .map((e) => {
          const s = sm.get(e.student_id);
          const r = rm.get(e.id);
          return {
            studentEnrollmentId: e.id,
            studentName: s?.preferred_name || s?.full_name || "Student",
            studentNumber: e.student_number,
            scoreId: r?.id ?? null,
            score: r?.score ?? null,
            status: r?.status ?? "missing",
            feedback: r?.feedback ?? null,
            updatedAt: r?.updated_at ?? null,
          };
        })
        .sort((x, y) => x.studentName.localeCompare(y.studentName)),
    };
  });

export const saveScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => scoreSaveInput.parse(x))
  .handler(async ({ data, context }) => {
    const results = [] as Array<{ studentEnrollmentId: string; ok: boolean; message?: string }>;
    for (const row of data.rows) {
      const payload = { score: row.score, status: row.status, feedback: row.feedback ?? null };
      let error: PostgrestError | null = null;
      if (row.scoreId) {
        const res = await context.supabase
          .from("student_scores")
          .update(payload)
          .eq("id", row.scoreId)
          .eq("assessment_id", data.id)
          .eq("organization_id", data.organizationId)
          .eq("school_id", data.schoolId)
          .eq("updated_at", row.expectedUpdatedAt!)
          .select("id");
        error = res.error;
        if (!error && !res.data?.[0])
          results.push({
            studentEnrollmentId: row.studentEnrollmentId,
            ok: false,
            message: "This score changed after loading. Refresh and retry.",
          });
      } else {
        const id = crypto.randomUUID();
        const res = await context.supabase.from("student_scores").insert({
          id,
          ...payload,
          organization_id: data.organizationId,
          school_id: data.schoolId,
          assessment_id: data.id,
          student_enrollment_id: row.studentEnrollmentId,
        });
        error = res.error;
      }
      if (error)
        results.push({
          studentEnrollmentId: row.studentEnrollmentId,
          ok: false,
          message: translateAssessmentError(error, "Score"),
        });
      else if (!results.some((r) => r.studentEnrollmentId === row.studentEnrollmentId))
        results.push({ studentEnrollmentId: row.studentEnrollmentId, ok: true });
    }
    return { results };
  });
