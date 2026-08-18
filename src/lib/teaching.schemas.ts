import { z } from "zod";

/**
 * Batch 3 — Teacher Assignment validation schemas.
 *
 * Every enum mirrors a live CHECK constraint on public.teaching_assignments:
 *   teaching_assignments_role_check   -> role   in (teacher, assistant)
 *   teaching_assignments_status_check -> status in (draft, active, inactive, archived)
 *   teaching_assignments_dates_check  -> ends_on is null or ends_on >= starts_on
 *
 * No value is invented here. These schemas are transport/UX validation only;
 * the database constraints, triggers and RLS remain authoritative.
 */

export const TEACHING_ROLES = ["teacher", "assistant"] as const;
export const TEACHING_STATUSES = ["draft", "active", "inactive", "archived"] as const;

const uuid = z.string().uuid("A valid record id is required");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const optionalDate = z
  .union([isoDate, z.literal("")])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const teachingAssignmentFilterInput = z.object({
  organizationId: uuid,
  schoolId: uuid,
  academicYearId: uuid.nullable().optional(),
  termId: uuid.nullable().optional(),
  gradeLevelId: uuid.nullable().optional(),
  classroomId: uuid.nullable().optional(),
  subjectId: uuid.nullable().optional(),
  role: z.enum(TEACHING_ROLES).nullable().optional(),
  status: z.enum(TEACHING_STATUSES).nullable().optional(),
  search: z.string().trim().max(120).optional().nullable(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});

export const teachingAssignmentInput = z
  .object({
    id: uuid.optional(),
    organizationId: uuid,
    schoolId: uuid,
    academicYearId: uuid,
    termId: uuid.nullable().optional().transform((v) => v ?? null),
    classroomId: uuid,
    subjectId: uuid,
    staffSchoolAssignmentId: uuid,
    role: z.enum(TEACHING_ROLES),
    status: z.enum(TEACHING_STATUSES),
    startsOn: isoDate,
    endsOn: optionalDate,
  })
  .refine((v) => !v.endsOn || v.endsOn >= v.startsOn, {
    message: "The end date must be on or after the start date",
    path: ["endsOn"],
  });

export const teachingOptionsInput = z.object({
  organizationId: uuid,
  schoolId: uuid,
  academicYearId: uuid.nullable().optional(),
});

export const staffTeachingInput = z.object({
  organizationId: uuid,
  staffMemberId: uuid,
});

export type TeachingAssignmentInput = z.infer<typeof teachingAssignmentInput>;
export type TeachingAssignmentFilterInput = z.infer<typeof teachingAssignmentFilterInput>;
