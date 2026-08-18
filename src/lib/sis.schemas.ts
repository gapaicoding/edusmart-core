import { z } from "zod";

/**
 * Batch 2 — SIS validation schemas.
 *
 * Every enum here mirrors a live CHECK constraint in Supabase. No lifecycle
 * value is invented. These schemas are UX/transport validation only; the
 * database constraints, triggers and RLS remain authoritative.
 */

// students_status_check
export const STUDENT_STATUSES = ["active", "inactive", "alumni", "archived"] as const;
// students_gender_check
export const STUDENT_GENDERS = ["male", "female", "other", "unspecified"] as const;
// guardians_status_check / staff_members_status_check
export const PERSON_STATUSES = ["active", "inactive", "archived"] as const;
// student_guardians_status_check
export const STUDENT_GUARDIAN_STATUSES = ["active", "inactive", "revoked"] as const;
// student_enrollments_status_check
export const ENROLLMENT_STATUSES = [
  "draft",
  "active",
  "leave",
  "transferred",
  "withdrawn",
  "graduated",
] as const;
// class_enrollments_status_check
export const CLASS_ENROLLMENT_STATUSES = ["active", "inactive", "moved", "ended"] as const;
// staff_members_staff_kind_check
export const STAFF_KINDS = ["teacher", "non_teacher"] as const;
// staff_school_assignments_status_check
export const STAFF_ASSIGNMENT_STATUSES = ["active", "inactive", "ended", "archived"] as const;

const uuid = z.string().uuid("A valid record id is required");
const fullName = z.string().trim().min(1, "Full name is required").max(160, "Full name is too long");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));
const optionalDate = z
  .union([isoDate, z.literal("")])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const ENROLLMENT_SCOPES = ["all", "enrolled", "unenrolled"] as const;
export const ASSIGNMENT_SCOPES = ["all", "assigned", "unassigned"] as const;

export const studentFilterInput = z.object({
  organizationId: uuid,
  schoolId: uuid.nullable().optional(),
  academicYearId: uuid.nullable().optional(),
  gradeLevelId: uuid.nullable().optional(),
  classroomId: uuid.nullable().optional(),
  status: z.enum(STUDENT_STATUSES).nullable().optional(),
  enrollmentScope: z.enum(ENROLLMENT_SCOPES).default("all"),
  search: z.string().trim().max(120).optional().nullable(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});

export const studentInput = z.object({
  id: uuid.optional(),
  organizationId: uuid,
  fullName,
  preferredName: optionalText(120),
  nisn: optionalText(40),
  gender: z.enum(STUDENT_GENDERS).nullable().optional(),
  birthDate: optionalDate,
  birthPlace: optionalText(120),
  status: z.enum(STUDENT_STATUSES),
});

export const guardianFilterInput = z.object({
  organizationId: uuid,
  status: z.enum(PERSON_STATUSES).nullable().optional(),
  search: z.string().trim().max(120).optional().nullable(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});

export const guardianInput = z.object({
  id: uuid.optional(),
  organizationId: uuid,
  fullName,
  phone: optionalText(40),
  email: optionalText(160),
  occupation: optionalText(120),
  status: z.enum(PERSON_STATUSES),
});

export const studentGuardianInput = z.object({
  id: uuid.optional(),
  organizationId: uuid,
  studentId: uuid,
  guardianId: uuid,
  relationshipType: z.string().trim().min(1, "Relationship is required").max(40),
  isPrimary: z.boolean(),
  canViewAcademic: z.boolean(),
  canViewAttendance: z.boolean(),
  canReceiveNotification: z.boolean(),
  status: z.enum(STUDENT_GUARDIAN_STATUSES),
});

export const enrollmentInput = z
  .object({
    id: uuid.optional(),
    organizationId: uuid,
    studentId: uuid,
    schoolId: uuid,
    academicYearId: uuid,
    gradeLevelId: uuid,
    studentNumber: optionalText(40),
    enrollmentNumber: optionalText(40),
    status: z.enum(ENROLLMENT_STATUSES),
    enrolledOn: isoDate,
    endedOn: optionalDate,
  })
  .refine((v) => !v.endedOn || v.endedOn >= v.enrolledOn, {
    message: "The end date must be on or after the enrolment date",
    path: ["endedOn"],
  });

export const classEnrollmentInput = z
  .object({
    id: uuid.optional(),
    studentEnrollmentId: uuid,
    classroomId: uuid,
    startsOn: isoDate,
    endsOn: optionalDate,
    isPrimary: z.boolean(),
    status: z.enum(CLASS_ENROLLMENT_STATUSES),
  })
  .refine((v) => !v.endsOn || v.endsOn >= v.startsOn, {
    message: "The end date must be on or after the start date",
    path: ["endsOn"],
  });

export const staffFilterInput = z.object({
  organizationId: uuid,
  schoolId: uuid.nullable().optional(),
  staffKind: z.enum(STAFF_KINDS).nullable().optional(),
  status: z.enum(PERSON_STATUSES).nullable().optional(),
  assignmentScope: z.enum(ASSIGNMENT_SCOPES).default("all"),
  search: z.string().trim().max(120).optional().nullable(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});

export const staffInput = z.object({
  id: uuid.optional(),
  organizationId: uuid,
  fullName,
  staffKind: z.enum(STAFF_KINDS),
  status: z.enum(PERSON_STATUSES),
});

export const staffAssignmentInput = z
  .object({
    id: uuid.optional(),
    organizationId: uuid,
    staffMemberId: uuid,
    schoolId: uuid,
    employeeNumber: optionalText(40),
    positionTitle: optionalText(120),
    employmentStatus: z.string().trim().min(1, "Employment status is required").max(40),
    joinedOn: optionalDate,
    leftOn: optionalDate,
    status: z.enum(STAFF_ASSIGNMENT_STATUSES),
  })
  .refine((v) => !v.leftOn || !v.joinedOn || v.leftOn >= v.joinedOn, {
    message: "The leaving date must be on or after the joining date",
    path: ["leftOn"],
  });

export type StudentInput = z.infer<typeof studentInput>;
export type GuardianInput = z.infer<typeof guardianInput>;
export type StudentGuardianInput = z.infer<typeof studentGuardianInput>;
export type EnrollmentInput = z.infer<typeof enrollmentInput>;
export type ClassEnrollmentInput = z.infer<typeof classEnrollmentInput>;
export type StaffInput = z.infer<typeof staffInput>;
export type StaffAssignmentInput = z.infer<typeof staffAssignmentInput>;
