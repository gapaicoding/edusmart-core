import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  staffTeachingInput,
  teachingAssignmentFilterInput,
  teachingAssignmentInput,
  teachingOptionsInput,
} from "./teaching.schemas";
import {
  assertAssignmentReferences,
  assertSchoolScope,
  translateTeachingError,
} from "./teaching.server";
import { assertWriteApplied, insertWithoutReturning } from "./sis.server";

/**
 * Batch 3 — Teacher Assignment server functions.
 *
 * Reads and writes run through `context.supabase`, built from the caller's
 * access token, so RLS decides everything. Query errors surface as errors and
 * are never converted into empty result sets.
 */

export type TeachingAssignmentRow = {
  id: string;
  organizationId: string;
  schoolId: string;
  academicYearId: string;
  academicYearName: string | null;
  termId: string | null;
  termName: string | null;
  classroomId: string;
  classroomName: string | null;
  classroomCode: string | null;
  gradeLevelId: string | null;
  gradeLevelName: string | null;
  subjectId: string;
  subjectName: string | null;
  subjectCode: string | null;
  staffSchoolAssignmentId: string;
  staffMemberId: string | null;
  staffName: string | null;
  staffPositionTitle: string | null;
  staffEmployeeNumber: string | null;
  staffAssignmentStatus: string | null;
  role: string;
  status: string;
  startsOn: string;
  endsOn: string | null;
};

export type TeachingOption = { id: string; label: string; hint?: string | null };

export type TeachingOptions = {
  academicYears: TeachingOption[];
  terms: Array<TeachingOption & { academicYearId: string }>;
  classrooms: Array<TeachingOption & { academicYearId: string; gradeLevelId: string | null }>;
  subjects: TeachingOption[];
  gradeLevels: TeachingOption[];
  staff: Array<TeachingOption & { staffMemberId: string }>;
};

type Row = Record<string, any>;

/** Batched enrichment: one query per related table, never one per row. */
async function enrichAssignments(
  supabase: any,
  rows: Row[],
): Promise<TeachingAssignmentRow[]> {
  if (rows.length === 0) return [];

  const uniq = (values: Array<string | null | undefined>) =>
    Array.from(new Set(values.filter((v): v is string => Boolean(v))));

  const classroomIds = uniq(rows.map((r) => r.classroom_id));
  const subjectIds = uniq(rows.map((r) => r.subject_id));
  const yearIds = uniq(rows.map((r) => r.academic_year_id));
  const termIds = uniq(rows.map((r) => r.term_id));
  const ssaIds = uniq(rows.map((r) => r.staff_school_assignment_id));

  const [classrooms, subjects, years, terms, ssas] = await Promise.all([
    supabase.from("classrooms").select("id, name, code, grade_level_id").in("id", classroomIds),
    supabase.from("subjects").select("id, name, code").in("id", subjectIds),
    supabase.from("academic_years").select("id, name").in("id", yearIds),
    termIds.length > 0
      ? supabase.from("terms").select("id, name").in("id", termIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("staff_school_assignments")
      .select("id, staff_member_id, position_title, employee_number, status")
      .in("id", ssaIds),
  ]);

  for (const [result, label] of [
    [classrooms, "Classrooms"],
    [subjects, "Subjects"],
    [years, "Academic years"],
    [terms, "Terms"],
    [ssas, "Staff assignments"],
  ] as const) {
    if (result.error) throw new Error(translateTeachingError(result.error, label));
  }

  const staffMemberIds = uniq((ssas.data ?? []).map((r: Row) => r.staff_member_id));
  const gradeLevelIds = uniq((classrooms.data ?? []).map((r: Row) => r.grade_level_id));

  const [staffMembers, gradeLevels] = await Promise.all([
    staffMemberIds.length > 0
      ? supabase.from("staff_members").select("id, full_name").in("id", staffMemberIds)
      : Promise.resolve({ data: [], error: null }),
    gradeLevelIds.length > 0
      ? supabase.from("grade_levels").select("id, name").in("id", gradeLevelIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (staffMembers.error) throw new Error(translateTeachingError(staffMembers.error, "Staff"));
  if (gradeLevels.error) throw new Error(translateTeachingError(gradeLevels.error, "Grade levels"));

  const byId = (list: Row[] | null) => new Map((list ?? []).map((r) => [r.id as string, r]));
  const classroomMap = byId(classrooms.data);
  const subjectMap = byId(subjects.data);
  const yearMap = byId(years.data);
  const termMap = byId(terms.data);
  const ssaMap = byId(ssas.data);
  const staffMap = byId(staffMembers.data);
  const gradeMap = byId(gradeLevels.data);

  return rows.map((r) => {
    const classroom = classroomMap.get(r.classroom_id);
    const ssa = ssaMap.get(r.staff_school_assignment_id);
    const staff = ssa ? staffMap.get(ssa.staff_member_id) : undefined;
    const grade = classroom?.grade_level_id ? gradeMap.get(classroom.grade_level_id) : undefined;
    const subject = subjectMap.get(r.subject_id);
    return {
      id: r.id,
      organizationId: r.organization_id,
      schoolId: r.school_id,
      academicYearId: r.academic_year_id,
      academicYearName: yearMap.get(r.academic_year_id)?.name ?? null,
      termId: r.term_id ?? null,
      termName: r.term_id ? (termMap.get(r.term_id)?.name ?? null) : null,
      classroomId: r.classroom_id,
      classroomName: classroom?.name ?? null,
      classroomCode: classroom?.code ?? null,
      gradeLevelId: classroom?.grade_level_id ?? null,
      gradeLevelName: grade?.name ?? null,
      subjectId: r.subject_id,
      subjectName: subject?.name ?? null,
      subjectCode: subject?.code ?? null,
      staffSchoolAssignmentId: r.staff_school_assignment_id,
      staffMemberId: ssa?.staff_member_id ?? null,
      staffName: staff?.full_name ?? null,
      staffPositionTitle: ssa?.position_title ?? null,
      staffEmployeeNumber: ssa?.employee_number ?? null,
      staffAssignmentStatus: ssa?.status ?? null,
      role: r.role,
      status: r.status,
      startsOn: r.starts_on,
      endsOn: r.ends_on ?? null,
    } satisfies TeachingAssignmentRow;
  });
}

const ASSIGNMENT_COLUMNS =
  "id, organization_id, school_id, academic_year_id, term_id, classroom_id, subject_id, staff_school_assignment_id, role, status, starts_on, ends_on";

export const listTeachingAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => teachingAssignmentFilterInput.parse(input))
  .handler(async ({ data, context }): Promise<{
    rows: TeachingAssignmentRow[];
    total: number;
    page: number;
    pageSize: number;
  }> => {
    const { supabase } = context;

    // Free-text search matches staff names; resolve the ids first so the main
    // query stays a single filtered page request.
    let ssaFilter: string[] | null = null;
    if (data.search) {
      const term = `%${data.search.replace(/[%,]/g, "")}%`;
      const { data: staffRows, error: staffError } = await supabase
        .from("staff_members")
        .select("id")
        .eq("organization_id", data.organizationId)
        .ilike("full_name", term);
      if (staffError) throw new Error(translateTeachingError(staffError, "Staff"));
      const staffIds = (staffRows ?? []).map((r: Row) => r.id);
      if (staffIds.length === 0) {
        return { rows: [], total: 0, page: data.page, pageSize: data.pageSize };
      }
      const { data: ssaRows, error: ssaError } = await supabase
        .from("staff_school_assignments")
        .select("id")
        .eq("school_id", data.schoolId)
        .in("staff_member_id", staffIds);
      if (ssaError) throw new Error(translateTeachingError(ssaError, "Staff assignments"));
      ssaFilter = (ssaRows ?? []).map((r: Row) => r.id);
      if (ssaFilter.length === 0) {
        return { rows: [], total: 0, page: data.page, pageSize: data.pageSize };
      }
    }

    // Grade level is a classroom attribute; translate it into classroom ids.
    let classroomFilter: string[] | null = null;
    if (data.gradeLevelId) {
      let q = supabase
        .from("classrooms")
        .select("id")
        .eq("school_id", data.schoolId)
        .eq("grade_level_id", data.gradeLevelId);
      if (data.academicYearId) q = q.eq("academic_year_id", data.academicYearId);
      const { data: classroomRows, error } = await q;
      if (error) throw new Error(translateTeachingError(error, "Classrooms"));
      classroomFilter = (classroomRows ?? []).map((r: Row) => r.id);
      if (classroomFilter.length === 0) {
        return { rows: [], total: 0, page: data.page, pageSize: data.pageSize };
      }
    }

    let query = supabase
      .from("teaching_assignments")
      .select(ASSIGNMENT_COLUMNS, { count: "exact" })
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId);

    if (data.academicYearId) query = query.eq("academic_year_id", data.academicYearId);
    if (data.termId) query = query.eq("term_id", data.termId);
    if (data.classroomId) query = query.eq("classroom_id", data.classroomId);
    if (data.subjectId) query = query.eq("subject_id", data.subjectId);
    if (data.role) query = query.eq("role", data.role);
    if (data.status) query = query.eq("status", data.status);
    if (ssaFilter) query = query.in("staff_school_assignment_id", ssaFilter);
    if (classroomFilter) query = query.in("classroom_id", classroomFilter);

    const from = (data.page - 1) * data.pageSize;
    const { data: rows, error, count } = await query
      .order("starts_on", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(translateTeachingError(error, "Teaching assignments"));

    return {
      rows: await enrichAssignments(supabase, rows ?? []),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

export const getTeachingOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => teachingOptionsInput.parse(input))
  .handler(async ({ data, context }): Promise<TeachingOptions> => {
    const { supabase } = context;

    const [years, terms, classrooms, subjects, grades, ssas] = await Promise.all([
      supabase
        .from("academic_years")
        .select("id, name, code, status")
        .eq("school_id", data.schoolId)
        .order("starts_on", { ascending: false }),
      supabase
        .from("terms")
        .select("id, name, code, academic_year_id")
        .eq("school_id", data.schoolId)
        .order("sequence", { ascending: true }),
      supabase
        .from("classrooms")
        .select("id, name, code, academic_year_id, grade_level_id, status")
        .eq("school_id", data.schoolId)
        .order("name", { ascending: true }),
      supabase
        .from("subjects")
        .select("id, name, code, is_active")
        .eq("school_id", data.schoolId)
        .order("name", { ascending: true }),
      supabase
        .from("grade_levels")
        .select("id, name, code, sequence")
        .eq("school_id", data.schoolId)
        .order("sequence", { ascending: true }),
      // Eligibility comes from StaffSchoolAssignment, never from staff identity.
      supabase
        .from("staff_school_assignments")
        .select("id, staff_member_id, position_title, employee_number, status")
        .eq("school_id", data.schoolId)
        .eq("status", "active"),
    ]);

    for (const [result, label] of [
      [years, "Academic years"],
      [terms, "Terms"],
      [classrooms, "Classrooms"],
      [subjects, "Subjects"],
      [grades, "Grade levels"],
      [ssas, "Staff assignments"],
    ] as const) {
      if (result.error) throw new Error(translateTeachingError(result.error, label));
    }

    const staffIds = Array.from(
      new Set((ssas.data ?? []).map((r: Row) => r.staff_member_id as string)),
    );
    const { data: staffRows, error: staffError } =
      staffIds.length > 0
        ? await supabase
            .from("staff_members")
            .select("id, full_name, status")
            .in("id", staffIds)
        : { data: [], error: null };
    if (staffError) throw new Error(translateTeachingError(staffError, "Staff"));
    const staffMap = new Map((staffRows ?? []).map((r: Row) => [r.id as string, r]));

    return {
      academicYears: (years.data ?? []).map((r: Row) => ({
        id: r.id,
        label: r.name,
        hint: r.code ?? null,
      })),
      terms: (terms.data ?? []).map((r: Row) => ({
        id: r.id,
        label: r.name,
        hint: r.code ?? null,
        academicYearId: r.academic_year_id,
      })),
      classrooms: (classrooms.data ?? []).map((r: Row) => ({
        id: r.id,
        label: r.name,
        hint: r.code ?? null,
        academicYearId: r.academic_year_id,
        gradeLevelId: r.grade_level_id ?? null,
      })),
      subjects: (subjects.data ?? [])
        .filter((r: Row) => r.is_active !== false)
        .map((r: Row) => ({ id: r.id, label: r.name, hint: r.code ?? null })),
      gradeLevels: (grades.data ?? []).map((r: Row) => ({
        id: r.id,
        label: r.name,
        hint: r.code ?? null,
      })),
      staff: (ssas.data ?? [])
        .map((r: Row) => {
          const staff = staffMap.get(r.staff_member_id);
          return {
            id: r.id as string,
            staffMemberId: r.staff_member_id as string,
            label: (staff?.full_name as string) ?? "Unnamed staff member",
            hint: [r.position_title, r.employee_number].filter(Boolean).join(" · ") || null,
          };
        })
        .filter((option) => option.label !== "Unnamed staff member" || true)
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  });

export const saveTeachingAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => teachingAssignmentInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    const scope = await assertSchoolScope(supabase, data.organizationId, data.schoolId);
    await assertAssignmentReferences(supabase, scope, {
      academicYearId: data.academicYearId,
      termId: data.termId,
      classroomId: data.classroomId,
      subjectId: data.subjectId,
      staffSchoolAssignmentId: data.staffSchoolAssignmentId,
    });

    const payload = {
      organization_id: scope.organizationId,
      school_id: scope.schoolId,
      academic_year_id: data.academicYearId,
      term_id: data.termId,
      classroom_id: data.classroomId,
      subject_id: data.subjectId,
      staff_school_assignment_id: data.staffSchoolAssignmentId,
      role: data.role,
      status: data.status,
      starts_on: data.startsOn,
      ends_on: data.endsOn,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("teaching_assignments")
        .update(payload)
        .eq("id", data.id)
        .eq("organization_id", scope.organizationId)
        .eq("school_id", scope.schoolId)
        .select("id");
      if (error) throw new Error(translateTeachingError(error, "Teaching assignment"));
      return { id: assertWriteApplied(rows, "Updating this teaching assignment").id };
    }

    // B2-F03 pattern: the SELECT policy calls can_access_teaching_assignment(),
    // a STABLE SECURITY DEFINER helper that cannot see the row being inserted,
    // so INSERT ... RETURNING would fail with 42501 even when WITH CHECK passes.
    try {
      return await insertWithoutReturning(
        supabase,
        "teaching_assignments",
        payload,
        "Teaching assignment",
      );
    } catch (error) {
      throw error instanceof Error ? error : new Error("We couldn't save this teaching assignment.");
    }
  });

export const listStaffTeachingAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffTeachingInput.parse(input))
  .handler(async ({ data, context }): Promise<{ rows: TeachingAssignmentRow[] }> => {
    const { supabase } = context;

    const { data: ssaRows, error: ssaError } = await supabase
      .from("staff_school_assignments")
      .select("id")
      .eq("staff_member_id", data.staffMemberId)
      .eq("organization_id", data.organizationId);
    if (ssaError) throw new Error(translateTeachingError(ssaError, "Staff assignments"));

    const ssaIds = (ssaRows ?? []).map((r: Row) => r.id);
    if (ssaIds.length === 0) return { rows: [] };

    const { data: rows, error } = await supabase
      .from("teaching_assignments")
      .select(ASSIGNMENT_COLUMNS)
      .in("staff_school_assignment_id", ssaIds)
      .order("starts_on", { ascending: false });
    if (error) throw new Error(translateTeachingError(error, "Teaching assignments"));

    return { rows: await enrichAssignments(supabase, rows ?? []) };
  });
