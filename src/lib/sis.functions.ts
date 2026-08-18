import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  classEnrollmentInput,
  enrollmentInput,
  guardianFilterInput,
  guardianInput,
  staffAssignmentInput,
  staffFilterInput,
  staffInput,
  studentFilterInput,
  studentGuardianInput,
  studentInput,
} from "./sis.schemas";
import {
  assertClassroomMatchesEnrollment,
  assertOrganizationAccess,
  assertWriteApplied,
  insertWithoutReturning,
  loadEnrollmentContext,
  resolveSchoolOrganization,
  translateSisError,
} from "./sis.server";
import { orgRecordInput } from "./sis.validators";

/**
 * Batch 2 — SIS server functions.
 *
 * Reads and writes run through `context.supabase`, built from the caller's
 * access token, so RLS is the real boundary. Query errors are surfaced, never
 * converted into empty result sets.
 */

export type StudentRow = {
  id: string;
  fullName: string;
  preferredName: string | null;
  nisn: string | null;
  gender: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  status: string;
};

export type StudentListResult = {
  rows: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Enrolment context for the rows, when a school filter is active. */
  placements: Record<string, { gradeLevelId: string; classroomId: string | null; enrollmentStatus: string }>;
  schoolScoped: boolean;
};

export type EnrollmentRow = {
  id: string;
  studentId: string;
  schoolId: string;
  academicYearId: string;
  gradeLevelId: string;
  studentNumber: string | null;
  enrollmentNumber: string | null;
  status: string;
  enrolledOn: string;
  endedOn: string | null;
};

export type ClassEnrollmentRow = {
  id: string;
  studentEnrollmentId: string;
  classroomId: string;
  startsOn: string;
  endsOn: string | null;
  isPrimary: boolean;
  status: string;
};

export type GuardianRow = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  occupation: string | null;
  status: string;
  hasLogin: boolean;
};

export type StudentGuardianRow = {
  id: string;
  studentId: string;
  guardianId: string;
  relationshipType: string;
  isPrimary: boolean;
  canViewAcademic: boolean;
  canViewAttendance: boolean;
  canReceiveNotification: boolean;
  status: string;
};

export type StaffRow = {
  id: string;
  fullName: string;
  staffKind: string;
  status: string;
  hasLogin: boolean;
};

export type StaffAssignmentRow = {
  id: string;
  staffMemberId: string;
  schoolId: string;
  employeeNumber: string | null;
  positionTitle: string | null;
  employmentStatus: string;
  joinedOn: string | null;
  leftOn: string | null;
  status: string;
};

export const listStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => studentFilterInput.parse(input))
  .handler(async ({ data, context }): Promise<StudentListResult> => {
    const { supabase } = context;
    const placements: StudentListResult["placements"] = {};
    const schoolScoped = Boolean(data.schoolId);

    // Placement lookup is enrichment first: it never becomes an identity predicate
    // unless the caller explicitly asked for an enrolment-derived filter.
    const wantsEnrolmentFilter =
      data.enrollmentScope === "enrolled" ||
      data.enrollmentScope === "unenrolled" ||
      Boolean(data.gradeLevelId) ||
      Boolean(data.classroomId);

    let matchedIds: string[] | null = null;

    if (data.schoolId || wantsEnrolmentFilter) {
      let enrollQuery = supabase
        .from("student_enrollments")
        .select("id, student_id, grade_level_id, status");
      if (data.schoolId) enrollQuery = enrollQuery.eq("school_id", data.schoolId);
      if (data.schoolId && data.academicYearId)
        enrollQuery = enrollQuery.eq("academic_year_id", data.academicYearId);
      if (data.gradeLevelId) enrollQuery = enrollQuery.eq("grade_level_id", data.gradeLevelId);

      const { data: enrollments, error: enrollError } = await enrollQuery;
      if (enrollError) throw new Error(translateSisError(enrollError, "Student enrolments"));

      const enrollmentIds = (enrollments ?? []).map((e) => e.id);
      const classByEnrollment = new Map<string, string>();
      if (enrollmentIds.length > 0) {
        const { data: placementRows, error: placementError } = await supabase
          .from("class_enrollments")
          .select("student_enrollment_id, classroom_id, status, is_primary")
          .in("student_enrollment_id", enrollmentIds)
          .eq("status", "active");
        if (placementError) throw new Error(translateSisError(placementError, "Classroom placements"));
        for (const row of placementRows ?? []) {
          if (row.is_primary || !classByEnrollment.has(row.student_enrollment_id)) {
            classByEnrollment.set(row.student_enrollment_id, row.classroom_id);
          }
        }
      }

      const matched: string[] = [];
      for (const enrollment of enrollments ?? []) {
        const classroomId = classByEnrollment.get(enrollment.id) ?? null;
        if (data.classroomId && classroomId !== data.classroomId) continue;
        matched.push(enrollment.student_id);
        placements[enrollment.student_id] = {
          gradeLevelId: enrollment.grade_level_id,
          classroomId,
          enrollmentStatus: enrollment.status,
        };
      }
      matchedIds = Array.from(new Set(matched));
    }

    let query = supabase
      .from("students")
      .select("id, full_name, preferred_name, nisn, gender, birth_date, birth_place, status", {
        count: "exact",
      })
      .eq("organization_id", data.organizationId);

    if (wantsEnrolmentFilter && matchedIds) {
      if (data.enrollmentScope === "unenrolled") {
        if (matchedIds.length > 0) query = query.not("id", "in", `(${matchedIds.join(",")})`);
      } else {
        if (matchedIds.length === 0) {
          return {
            rows: [],
            total: 0,
            page: data.page,
            pageSize: data.pageSize,
            placements,
            schoolScoped,
          };
        }
        query = query.in("id", matchedIds);
      }
    }

    if (data.status) query = query.eq("status", data.status);
    if (data.search) {
      const term = `%${data.search.replace(/[%,]/g, "")}%`;
      query = query.or(`full_name.ilike.${term},preferred_name.ilike.${term},nisn.ilike.${term}`);
    }

    const from = (data.page - 1) * data.pageSize;
    const { data: rows, error, count } = await query
      .order("full_name", { ascending: true })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(translateSisError(error, "Students"));

    return {
      rows: (rows ?? []).map((r) => ({
        id: r.id,
        fullName: r.full_name,
        preferredName: r.preferred_name,
        nisn: r.nisn,
        gender: r.gender,
        birthDate: r.birth_date,
        birthPlace: r.birth_place,
        status: r.status,
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      placements,
      schoolScoped,
    };
  });

export const saveStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => studentInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    await assertOrganizationAccess(supabase, data.organizationId);

    const payload = {
      organization_id: data.organizationId,
      full_name: data.fullName,
      preferred_name: data.preferredName,
      nisn: data.nisn,
      gender: data.gender ?? null,
      birth_date: data.birthDate,
      birth_place: data.birthPlace,
      status: data.status,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("students")
        .update(payload)
        .eq("id", data.id)
        .eq("organization_id", data.organizationId)
        .select("id");
      if (error) throw new Error(translateSisError(error, "Student"));
      return { id: assertWriteApplied(rows, "Updating this student").id };
    }

    return insertWithoutReturning(supabase, "students", payload, "Student");
  });

export const getStudentDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orgRecordInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, full_name, preferred_name, nisn, gender, birth_date, birth_place, status, profile_id")
      .eq("id", data.id)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (studentError) throw new Error(translateSisError(studentError, "Student"));
    if (!student) throw new Error("That student does not exist, or you cannot access it.");

    const { data: enrollments, error: enrollError } = await supabase
      .from("student_enrollments")
      .select(
        "id, student_id, school_id, academic_year_id, grade_level_id, student_number, enrollment_number, status, enrolled_on, ended_on",
      )
      .eq("student_id", data.id)
      .order("enrolled_on", { ascending: false });
    if (enrollError) throw new Error(translateSisError(enrollError, "Enrolment history"));

    const enrollmentIds = (enrollments ?? []).map((e) => e.id);
    let placements: ClassEnrollmentRow[] = [];
    if (enrollmentIds.length > 0) {
      const { data: rows, error } = await supabase
        .from("class_enrollments")
        .select("id, student_enrollment_id, classroom_id, starts_on, ends_on, is_primary, status")
        .in("student_enrollment_id", enrollmentIds)
        .order("starts_on", { ascending: false });
      if (error) throw new Error(translateSisError(error, "Classroom history"));
      placements = (rows ?? []).map((r) => ({
        id: r.id,
        studentEnrollmentId: r.student_enrollment_id,
        classroomId: r.classroom_id,
        startsOn: r.starts_on,
        endsOn: r.ends_on,
        isPrimary: r.is_primary,
        status: r.status,
      }));
    }

    const { data: links, error: linkError } = await supabase
      .from("student_guardians")
      .select(
        "id, student_id, guardian_id, relationship_type, is_primary, can_view_academic, can_view_attendance, can_receive_notification, status",
      )
      .eq("student_id", data.id);
    if (linkError) throw new Error(translateSisError(linkError, "Guardian relationships"));

    const guardianIds = (links ?? []).map((l) => l.guardian_id);
    let guardians: GuardianRow[] = [];
    if (guardianIds.length > 0) {
      const { data: rows, error } = await supabase
        .from("guardians")
        .select("id, full_name, phone, email, occupation, status, profile_id")
        .in("id", guardianIds);
      if (error) throw new Error(translateSisError(error, "Guardians"));
      guardians = (rows ?? []).map((r) => ({
        id: r.id,
        fullName: r.full_name,
        phone: r.phone,
        email: r.email,
        occupation: r.occupation,
        status: r.status,
        hasLogin: Boolean(r.profile_id),
      }));
    }

    return {
      student: {
        id: student.id,
        fullName: student.full_name,
        preferredName: student.preferred_name,
        nisn: student.nisn,
        gender: student.gender,
        birthDate: student.birth_date,
        birthPlace: student.birth_place,
        status: student.status,
        hasLogin: Boolean(student.profile_id),
      } as StudentRow & { hasLogin: boolean },
      enrollments: (enrollments ?? []).map((r) => ({
        id: r.id,
        studentId: r.student_id,
        schoolId: r.school_id,
        academicYearId: r.academic_year_id,
        gradeLevelId: r.grade_level_id,
        studentNumber: r.student_number,
        enrollmentNumber: r.enrollment_number,
        status: r.status,
        enrolledOn: r.enrolled_on,
        endedOn: r.ended_on,
      })) as EnrollmentRow[],
      placements,
      links: (links ?? []).map((r) => ({
        id: r.id,
        studentId: r.student_id,
        guardianId: r.guardian_id,
        relationshipType: r.relationship_type,
        isPrimary: r.is_primary,
        canViewAcademic: r.can_view_academic,
        canViewAttendance: r.can_view_attendance,
        canReceiveNotification: r.can_receive_notification,
        status: r.status,
      })) as StudentGuardianRow[],
      guardians,
    };
  });

export const saveEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => enrollmentInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    const organizationId = await resolveSchoolOrganization(supabase, data.schoolId);
    if (organizationId !== data.organizationId) {
      throw new Error("That school belongs to a different organization than this student.");
    }

    const payload = {
      organization_id: organizationId,
      school_id: data.schoolId,
      student_id: data.studentId,
      academic_year_id: data.academicYearId,
      grade_level_id: data.gradeLevelId,
      student_number: data.studentNumber,
      enrollment_number: data.enrollmentNumber,
      status: data.status,
      enrolled_on: data.enrolledOn,
      ended_on: data.endedOn,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("student_enrollments")
        .update(payload)
        .eq("id", data.id)
        .eq("student_id", data.studentId)
        .select("id");
      if (error) throw new Error(translateSisError(error, "Enrolment"));
      return { id: assertWriteApplied(rows, "Updating this enrolment").id };
    }

    return insertWithoutReturning(supabase, "student_enrollments", payload, "Enrolment");
  });

export const saveClassEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => classEnrollmentInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    const enrollment = await loadEnrollmentContext(supabase, data.studentEnrollmentId);
    await assertClassroomMatchesEnrollment(supabase, enrollment, data.classroomId);

    const payload = {
      organization_id: enrollment.organizationId,
      school_id: enrollment.schoolId,
      student_enrollment_id: enrollment.id,
      classroom_id: data.classroomId,
      starts_on: data.startsOn,
      ends_on: data.endsOn,
      is_primary: data.isPrimary,
      status: data.status,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("class_enrollments")
        .update(payload)
        .eq("id", data.id)
        .eq("student_enrollment_id", enrollment.id)
        .select("id");
      if (error) throw new Error(translateSisError(error, "Classroom placement"));
      return { id: assertWriteApplied(rows, "Updating this classroom placement").id };
    }

    return insertWithoutReturning(supabase, "class_enrollments", payload, "Classroom placement");
  });

export const listGuardians = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => guardianFilterInput.parse(input))
  .handler(async ({ data, context }): Promise<{ rows: GuardianRow[]; total: number; page: number; pageSize: number }> => {
    let query = context.supabase
      .from("guardians")
      .select("id, full_name, phone, email, occupation, status, profile_id", { count: "exact" })
      .eq("organization_id", data.organizationId);

    if (data.status) query = query.eq("status", data.status);
    if (data.search) {
      const term = `%${data.search.replace(/[%,]/g, "")}%`;
      query = query.or(`full_name.ilike.${term},phone.ilike.${term},email.ilike.${term}`);
    }

    const from = (data.page - 1) * data.pageSize;
    const { data: rows, error, count } = await query
      .order("full_name", { ascending: true })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(translateSisError(error, "Guardians"));

    return {
      rows: (rows ?? []).map((r) => ({
        id: r.id,
        fullName: r.full_name,
        phone: r.phone,
        email: r.email,
        occupation: r.occupation,
        status: r.status,
        hasLogin: Boolean(r.profile_id),
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

export const saveGuardian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => guardianInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    await assertOrganizationAccess(supabase, data.organizationId);

    const payload = {
      organization_id: data.organizationId,
      full_name: data.fullName,
      phone: data.phone,
      email: data.email,
      occupation: data.occupation,
      status: data.status,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("guardians")
        .update(payload)
        .eq("id", data.id)
        .eq("organization_id", data.organizationId)
        .select("id");
      if (error) throw new Error(translateSisError(error, "Guardian"));
      return { id: assertWriteApplied(rows, "Updating this guardian").id };
    }

    return insertWithoutReturning(supabase, "guardians", payload, "Guardian");
  });

export const getGuardianDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orgRecordInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: guardian, error } = await supabase
      .from("guardians")
      .select("id, full_name, phone, email, occupation, status, profile_id")
      .eq("id", data.id)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(translateSisError(error, "Guardian"));
    if (!guardian) throw new Error("That guardian does not exist, or you cannot access it.");

    const { data: links, error: linkError } = await supabase
      .from("student_guardians")
      .select(
        "id, student_id, guardian_id, relationship_type, is_primary, can_view_academic, can_view_attendance, can_receive_notification, status",
      )
      .eq("guardian_id", data.id);
    if (linkError) throw new Error(translateSisError(linkError, "Guardian relationships"));

    const studentIds = (links ?? []).map((l) => l.student_id);
    let students: StudentRow[] = [];
    if (studentIds.length > 0) {
      const { data: rows, error: studentError } = await supabase
        .from("students")
        .select("id, full_name, preferred_name, nisn, gender, birth_date, birth_place, status")
        .in("id", studentIds);
      if (studentError) throw new Error(translateSisError(studentError, "Students"));
      students = (rows ?? []).map((r) => ({
        id: r.id,
        fullName: r.full_name,
        preferredName: r.preferred_name,
        nisn: r.nisn,
        gender: r.gender,
        birthDate: r.birth_date,
        birthPlace: r.birth_place,
        status: r.status,
      }));
    }

    return {
      guardian: {
        id: guardian.id,
        fullName: guardian.full_name,
        phone: guardian.phone,
        email: guardian.email,
        occupation: guardian.occupation,
        status: guardian.status,
        hasLogin: Boolean(guardian.profile_id),
      } as GuardianRow,
      links: (links ?? []).map((r) => ({
        id: r.id,
        studentId: r.student_id,
        guardianId: r.guardian_id,
        relationshipType: r.relationship_type,
        isPrimary: r.is_primary,
        canViewAcademic: r.can_view_academic,
        canViewAttendance: r.can_view_attendance,
        canReceiveNotification: r.can_receive_notification,
        status: r.status,
      })) as StudentGuardianRow[],
      students,
    };
  });

export const saveStudentGuardian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => studentGuardianInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    await assertOrganizationAccess(supabase, data.organizationId);

    const payload = {
      organization_id: data.organizationId,
      student_id: data.studentId,
      guardian_id: data.guardianId,
      relationship_type: data.relationshipType,
      is_primary: data.isPrimary,
      can_view_academic: data.canViewAcademic,
      can_view_attendance: data.canViewAttendance,
      can_receive_notification: data.canReceiveNotification,
      status: data.status,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("student_guardians")
        .update(payload)
        .eq("id", data.id)
        .select("id");
      if (error) throw new Error(translateSisError(error, "Guardian relationship"));
      return { id: assertWriteApplied(rows, "Updating this relationship").id };
    }

    return insertWithoutReturning(supabase, "student_guardians", payload, "Guardian relationship");
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffFilterInput.parse(input))
  .handler(async ({ data, context }): Promise<{
    rows: StaffRow[];
    total: number;
    page: number;
    pageSize: number;
    assignments: Record<string, StaffAssignmentRow[]>;
  }> => {
    const { supabase } = context;

    // Assignment lookup is an explicit filter only; it never gates staff identity.
    const wantsAssignmentFilter =
      data.assignmentScope === "assigned" || data.assignmentScope === "unassigned";
    let assignedIds: string[] | null = null;

    if (wantsAssignmentFilter) {
      let assignmentQuery = supabase
        .from("staff_school_assignments")
        .select("staff_member_id")
        .eq("status", "active");
      if (data.schoolId) assignmentQuery = assignmentQuery.eq("school_id", data.schoolId);
      const { data: assignmentRows, error } = await assignmentQuery;
      if (error) throw new Error(translateSisError(error, "Staff assignments"));
      assignedIds = Array.from(new Set((assignmentRows ?? []).map((r) => r.staff_member_id)));
    }

    let query = supabase
      .from("staff_members")
      .select("id, full_name, staff_kind, status, profile_id", { count: "exact" })
      .eq("organization_id", data.organizationId);

    if (wantsAssignmentFilter && assignedIds) {
      if (data.assignmentScope === "unassigned") {
        if (assignedIds.length > 0) query = query.not("id", "in", `(${assignedIds.join(",")})`);
      } else {
        if (assignedIds.length === 0) {
          return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, assignments: {} };
        }
        query = query.in("id", assignedIds);
      }
    }

    if (data.status) query = query.eq("status", data.status);
    if (data.staffKind) query = query.eq("staff_kind", data.staffKind);
    if (data.search) {
      const term = `%${data.search.replace(/[%,]/g, "")}%`;
      query = query.ilike("full_name", term);
    }

    const from = (data.page - 1) * data.pageSize;
    const { data: rows, error, count } = await query
      .order("full_name", { ascending: true })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(translateSisError(error, "Staff"));

    const staffIds = (rows ?? []).map((r) => r.id);
    const assignments: Record<string, StaffAssignmentRow[]> = {};
    if (staffIds.length > 0) {
      const { data: assignmentRows, error: assignmentError } = await supabase
        .from("staff_school_assignments")
        .select(
          "id, staff_member_id, school_id, employee_number, position_title, employment_status, joined_on, left_on, status",
        )
        .in("staff_member_id", staffIds);
      if (assignmentError) throw new Error(translateSisError(assignmentError, "Staff assignments"));
      for (const r of assignmentRows ?? []) {
        const mapped: StaffAssignmentRow = {
          id: r.id,
          staffMemberId: r.staff_member_id,
          schoolId: r.school_id,
          employeeNumber: r.employee_number,
          positionTitle: r.position_title,
          employmentStatus: r.employment_status,
          joinedOn: r.joined_on,
          leftOn: r.left_on,
          status: r.status,
        };
        (assignments[r.staff_member_id] ??= []).push(mapped);
      }
    }

    return {
      rows: (rows ?? []).map((r) => ({
        id: r.id,
        fullName: r.full_name,
        staffKind: r.staff_kind,
        status: r.status,
        hasLogin: Boolean(r.profile_id),
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      assignments,
    };
  });

export const saveStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    await assertOrganizationAccess(supabase, data.organizationId);

    const payload = {
      organization_id: data.organizationId,
      full_name: data.fullName,
      staff_kind: data.staffKind,
      status: data.status,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("staff_members")
        .update(payload)
        .eq("id", data.id)
        .eq("organization_id", data.organizationId)
        .select("id");
      if (error) throw new Error(translateSisError(error, "Staff member"));
      return { id: assertWriteApplied(rows, "Updating this staff member").id };
    }

    return insertWithoutReturning(supabase, "staff_members", payload, "Staff member");
  });

export const getStaffDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(orgRecordInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: staff, error } = await supabase
      .from("staff_members")
      .select("id, full_name, staff_kind, status, profile_id")
      .eq("id", data.id)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(translateSisError(error, "Staff member"));
    if (!staff) throw new Error("That staff member does not exist, or you cannot access it.");

    const { data: assignmentRows, error: assignmentError } = await supabase
      .from("staff_school_assignments")
      .select(
        "id, staff_member_id, school_id, employee_number, position_title, employment_status, joined_on, left_on, status",
      )
      .eq("staff_member_id", data.id)
      .order("joined_on", { ascending: false });
    if (assignmentError) throw new Error(translateSisError(assignmentError, "Staff assignments"));

    return {
      staff: {
        id: staff.id,
        fullName: staff.full_name,
        staffKind: staff.staff_kind,
        status: staff.status,
        hasLogin: Boolean(staff.profile_id),
      } as StaffRow,
      assignments: (assignmentRows ?? []).map((r) => ({
        id: r.id,
        staffMemberId: r.staff_member_id,
        schoolId: r.school_id,
        employeeNumber: r.employee_number,
        positionTitle: r.position_title,
        employmentStatus: r.employment_status,
        joinedOn: r.joined_on,
        leftOn: r.left_on,
        status: r.status,
      })) as StaffAssignmentRow[],
    };
  });

export const saveStaffAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffAssignmentInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    const organizationId = await resolveSchoolOrganization(supabase, data.schoolId);
    if (organizationId !== data.organizationId) {
      throw new Error("That school belongs to a different organization than this staff member.");
    }

    const payload = {
      organization_id: organizationId,
      school_id: data.schoolId,
      staff_member_id: data.staffMemberId,
      employee_number: data.employeeNumber,
      position_title: data.positionTitle,
      employment_status: data.employmentStatus,
      joined_on: data.joinedOn,
      left_on: data.leftOn,
      status: data.status,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: rows, error } = await supabase
        .from("staff_school_assignments")
        .update(payload)
        .eq("id", data.id)
        .eq("staff_member_id", data.staffMemberId)
        .select("id");
      if (error) throw new Error(translateSisError(error, "School assignment"));
      return { id: assertWriteApplied(rows, "Updating this school assignment").id };
    }

    return insertWithoutReturning(supabase, "staff_school_assignments", payload, "School assignment");
  });
