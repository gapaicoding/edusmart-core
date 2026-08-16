import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  academicYearInput,
  calendarEventInput,
  classroomInput,
  curriculumInput,
  gradeLevelInput,
  subjectInput,
  termInput,
} from "./academic.schemas";
import {
  assertEventWithinAcademicYear,
  assertWriteApplied,
  resolveOrganizationId,
  translateDbError,
} from "./academic.server";
import { schoolScopeInput, yearScopeInput } from "./academic.validators";

/**
 * Batch 1 — Academic Setup server functions.
 *
 * All reads and writes execute through `context.supabase`, built from the
 * caller's access token. RLS + database constraints are authoritative;
 * query errors are never converted into empty lists.
 */

export type AcademicYearRow = {
  id: string;
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: string;
  isCurrent: boolean;
};

export type TermRow = {
  id: string;
  academicYearId: string;
  code: string;
  name: string;
  sequence: number;
  startsOn: string;
  endsOn: string;
  status: string;
};

export type GradeLevelRow = {
  id: string;
  code: string;
  name: string;
  sequence: number;
  educationStage: string;
  isActive: boolean;
};

export type ClassroomRow = {
  id: string;
  academicYearId: string;
  gradeLevelId: string;
  code: string;
  name: string;
  capacity: number | null;
  status: string;
};

export type SubjectRow = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  isActive: boolean;
};

export type CurriculumRow = {
  id: string;
  code: string;
  name: string;
  version: string | null;
  status: string;
};

export type CalendarEventRow = {
  id: string;
  academicYearId: string;
  termId: string | null;
  title: string;
  eventType: string;
  startsOn: string | null;
  endsOn: string | null;
  affectsInstruction: boolean;
};

export const listAcademicYears = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(schoolScopeInput)
  .handler(async ({ data, context }): Promise<AcademicYearRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("academic_years")
      .select("id, code, name, starts_on, ends_on, status, is_current")
      .eq("school_id", data.schoolId)
      .order("starts_on", { ascending: false });
    if (error) throw new Error(translateDbError(error, "Academic years"));
    return (rows ?? []).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      status: r.status,
      isCurrent: r.is_current,
    }));
  });

export const saveAcademicYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => academicYearInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    const organizationId = await resolveOrganizationId(supabase, data.schoolId);
    const payload = {
      organization_id: organizationId,
      school_id: data.schoolId,
      code: data.code,
      name: data.name,
      starts_on: data.startsOn,
      ends_on: data.endsOn,
      status: data.status,
      is_current: data.isCurrent,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("academic_years")
        .update(payload)
        .eq("id", data.id)
        .eq("school_id", data.schoolId)
        .select("id");
      if (error) throw new Error(translateDbError(error, "Academic year"));
      return { id: assertWriteApplied(rows, "Updating this academic year").id };
    }

    const { data: rows, error } = await supabase.from("academic_years").insert(payload).select("id");
    if (error) throw new Error(translateDbError(error, "Academic year"));
    return { id: assertWriteApplied(rows, "Creating this academic year").id };
  });

export const listTerms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(yearScopeInput)
  .handler(async ({ data, context }): Promise<TermRow[]> => {
    let query = context.supabase
      .from("terms")
      .select("id, academic_year_id, code, name, sequence, starts_on, ends_on, status")
      .eq("school_id", data.schoolId);
    if (data.academicYearId) query = query.eq("academic_year_id", data.academicYearId);

    const { data: rows, error } = await query.order("sequence", { ascending: true });
    if (error) throw new Error(translateDbError(error, "Terms"));
    return (rows ?? []).map((r) => ({
      id: r.id,
      academicYearId: r.academic_year_id,
      code: r.code,
      name: r.name,
      sequence: r.sequence,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      status: r.status,
    }));
  });

export const saveTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => termInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    const organizationId = await resolveOrganizationId(supabase, data.schoolId);
    const payload = {
      organization_id: organizationId,
      school_id: data.schoolId,
      academic_year_id: data.academicYearId,
      code: data.code,
      name: data.name,
      sequence: data.sequence,
      starts_on: data.startsOn,
      ends_on: data.endsOn,
      status: data.status,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("terms")
        .update(payload)
        .eq("id", data.id)
        .eq("school_id", data.schoolId)
        .select("id");
      if (error) throw new Error(translateDbError(error, "Term"));
      return { id: assertWriteApplied(rows, "Updating this term").id };
    }

    const { data: rows, error } = await supabase.from("terms").insert(payload).select("id");
    if (error) throw new Error(translateDbError(error, "Term"));
    return { id: assertWriteApplied(rows, "Creating this term").id };
  });

export const listGradeLevels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(schoolScopeInput)
  .handler(async ({ data, context }): Promise<GradeLevelRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("grade_levels")
      .select("id, code, name, sequence, education_stage, is_active")
      .eq("school_id", data.schoolId)
      .order("sequence", { ascending: true });
    if (error) throw new Error(translateDbError(error, "Grade levels"));
    return (rows ?? []).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      sequence: r.sequence,
      educationStage: r.education_stage,
      isActive: r.is_active,
    }));
  });

export const saveGradeLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => gradeLevelInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    const organizationId = await resolveOrganizationId(supabase, data.schoolId);
    const payload = {
      organization_id: organizationId,
      school_id: data.schoolId,
      code: data.code,
      name: data.name,
      sequence: data.sequence,
      education_stage: data.educationStage,
      is_active: data.isActive,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("grade_levels")
        .update(payload)
        .eq("id", data.id)
        .eq("school_id", data.schoolId)
        .select("id");
      if (error) throw new Error(translateDbError(error, "Grade level"));
      return { id: assertWriteApplied(rows, "Updating this grade level").id };
    }

    const { data: rows, error } = await supabase.from("grade_levels").insert(payload).select("id");
    if (error) throw new Error(translateDbError(error, "Grade level"));
    return { id: assertWriteApplied(rows, "Creating this grade level").id };
  });

export const listClassrooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(yearScopeInput)
  .handler(async ({ data, context }): Promise<ClassroomRow[]> => {
    let query = context.supabase
      .from("classrooms")
      .select("id, academic_year_id, grade_level_id, code, name, capacity, status")
      .eq("school_id", data.schoolId);
    if (data.academicYearId) query = query.eq("academic_year_id", data.academicYearId);

    const { data: rows, error } = await query.order("code", { ascending: true });
    if (error) throw new Error(translateDbError(error, "Classrooms"));
    return (rows ?? []).map((r) => ({
      id: r.id,
      academicYearId: r.academic_year_id,
      gradeLevelId: r.grade_level_id,
      code: r.code,
      name: r.name,
      capacity: r.capacity,
      status: r.status,
    }));
  });

export const saveClassroom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => classroomInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    const organizationId = await resolveOrganizationId(supabase, data.schoolId);
    const payload = {
      organization_id: organizationId,
      school_id: data.schoolId,
      academic_year_id: data.academicYearId,
      grade_level_id: data.gradeLevelId,
      code: data.code,
      name: data.name,
      capacity: data.capacity,
      status: data.status,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("classrooms")
        .update(payload)
        .eq("id", data.id)
        .eq("school_id", data.schoolId)
        .select("id");
      if (error) throw new Error(translateDbError(error, "Classroom"));
      return { id: assertWriteApplied(rows, "Updating this classroom").id };
    }

    const { data: rows, error } = await supabase.from("classrooms").insert(payload).select("id");
    if (error) throw new Error(translateDbError(error, "Classroom"));
    return { id: assertWriteApplied(rows, "Creating this classroom").id };
  });

export const listSubjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(schoolScopeInput)
  .handler(async ({ data, context }): Promise<SubjectRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("subjects")
      .select("id, code, name, category, is_active")
      .eq("school_id", data.schoolId)
      .order("code", { ascending: true });
    if (error) throw new Error(translateDbError(error, "Subjects"));
    return (rows ?? []).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      category: r.category,
      isActive: r.is_active,
    }));
  });

export const saveSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => subjectInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    const organizationId = await resolveOrganizationId(supabase, data.schoolId);
    const payload = {
      organization_id: organizationId,
      school_id: data.schoolId,
      code: data.code,
      name: data.name,
      category: data.category?.trim() ? data.category.trim() : null,
      is_active: data.isActive,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("subjects")
        .update(payload)
        .eq("id", data.id)
        .eq("school_id", data.schoolId)
        .select("id");
      if (error) throw new Error(translateDbError(error, "Subject"));
      return { id: assertWriteApplied(rows, "Updating this subject").id };
    }

    const { data: rows, error } = await supabase.from("subjects").insert(payload).select("id");
    if (error) throw new Error(translateDbError(error, "Subject"));
    return { id: assertWriteApplied(rows, "Creating this subject").id };
  });

export const listCurricula = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(schoolScopeInput)
  .handler(async ({ data, context }): Promise<CurriculumRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("curricula")
      .select("id, code, name, version, status")
      .eq("school_id", data.schoolId)
      .order("code", { ascending: true });
    if (error) throw new Error(translateDbError(error, "Curricula"));
    return (rows ?? []).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      version: r.version,
      status: r.status,
    }));
  });

export const saveCurriculum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => curriculumInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    const organizationId = await resolveOrganizationId(supabase, data.schoolId);
    const payload = {
      organization_id: organizationId,
      school_id: data.schoolId,
      code: data.code,
      name: data.name,
      version: data.version?.trim() ? data.version.trim() : null,
      status: data.status,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("curricula")
        .update(payload)
        .eq("id", data.id)
        .eq("school_id", data.schoolId)
        .select("id");
      if (error) throw new Error(translateDbError(error, "Curriculum"));
      return { id: assertWriteApplied(rows, "Updating this curriculum").id };
    }

    const { data: rows, error } = await supabase.from("curricula").insert(payload).select("id");
    if (error) throw new Error(translateDbError(error, "Curriculum"));
    return { id: assertWriteApplied(rows, "Creating this curriculum").id };
  });

export const listCalendarEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(yearScopeInput)
  .handler(async ({ data, context }): Promise<CalendarEventRow[]> => {
    let query = context.supabase
      .from("academic_calendar_events")
      .select("id, academic_year_id, term_id, title, event_type, starts_on, ends_on, affects_instruction")
      .eq("school_id", data.schoolId);
    if (data.academicYearId) query = query.eq("academic_year_id", data.academicYearId);

    const { data: rows, error } = await query.order("starts_on", { ascending: true });
    if (error) throw new Error(translateDbError(error, "Academic calendar"));
    return (rows ?? []).map((r) => ({
      id: r.id,
      academicYearId: r.academic_year_id,
      termId: r.term_id,
      title: r.title,
      eventType: r.event_type,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      affectsInstruction: r.affects_instruction,
    }));
  });

export const saveCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => calendarEventInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    const organizationId = await resolveOrganizationId(supabase, data.schoolId);
    await assertEventWithinAcademicYear(supabase, {
      schoolId: data.schoolId,
      academicYearId: data.academicYearId,
      startsOn: data.startsOn,
      endsOn: data.endsOn ?? null,
    });
    const payload = {
      organization_id: organizationId,
      school_id: data.schoolId,
      academic_year_id: data.academicYearId,
      term_id: data.termId ?? null,
      title: data.title,
      event_type: data.eventType,
      starts_on: data.startsOn,
      ends_on: data.endsOn ?? null,
      starts_at: null,
      ends_at: null,
      affects_instruction: data.affectsInstruction,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("academic_calendar_events")
        .update(payload)
        .eq("id", data.id)
        .eq("school_id", data.schoolId)
        .select("id");
      if (error) throw new Error(translateDbError(error, "Calendar event"));
      return { id: assertWriteApplied(rows, "Updating this calendar event").id };
    }

    const { data: rows, error } = await supabase
      .from("academic_calendar_events")
      .insert(payload)
      .select("id");
    if (error) throw new Error(translateDbError(error, "Calendar event"));
    return { id: assertWriteApplied(rows, "Creating this calendar event").id };
  });
