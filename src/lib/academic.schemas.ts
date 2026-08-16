import { z } from "zod";

/**
 * Batch 1 — Academic Setup validation schemas.
 *
 * These mirror the live Supabase constraints (status enums, date ordering,
 * positive capacity/sequence). They are UX validation only — the database
 * CHECK constraints, triggers and RLS remain authoritative.
 */

export const ACADEMIC_YEAR_STATUSES = ["draft", "active", "closed", "archived"] as const;
export const TERM_STATUSES = ["draft", "active", "closed", "archived"] as const;
export const LIFECYCLE_STATUSES = ["draft", "active", "inactive", "archived"] as const;
export const EDUCATION_STAGES = ["paud", "tk", "sd", "smp", "sma", "smk", "other"] as const;
export const CALENDAR_EVENT_TYPES = [
  "holiday",
  "exam",
  "event",
  "training",
  "special_schedule",
  "other",
] as const;

const uuid = z.string().uuid("A valid record id is required");
const code = z.string().trim().min(1, "Code is required").max(40, "Code is too long");
const name = z.string().trim().min(1, "Name is required").max(160, "Name is too long");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

export const academicYearInput = z
  .object({
    id: uuid.optional(),
    schoolId: uuid,
    code,
    name,
    startsOn: isoDate,
    endsOn: isoDate,
    status: z.enum(ACADEMIC_YEAR_STATUSES),
    isCurrent: z.boolean(),
  })
  .refine((v) => v.startsOn < v.endsOn, {
    message: "The end date must be after the start date",
    path: ["endsOn"],
  });

export const termInput = z
  .object({
    id: uuid.optional(),
    schoolId: uuid,
    academicYearId: uuid,
    code,
    name,
    sequence: z.coerce.number().int().min(1, "Sequence must be 1 or higher"),
    startsOn: isoDate,
    endsOn: isoDate,
    status: z.enum(TERM_STATUSES),
  })
  .refine((v) => v.startsOn <= v.endsOn, {
    message: "The end date must be on or after the start date",
    path: ["endsOn"],
  });

export const gradeLevelInput = z.object({
  id: uuid.optional(),
  schoolId: uuid,
  code,
  name,
  sequence: z.coerce.number().int().min(1, "Sequence must be 1 or higher"),
  educationStage: z.enum(EDUCATION_STAGES),
  isActive: z.boolean(),
});

export const classroomInput = z.object({
  id: uuid.optional(),
  schoolId: uuid,
  academicYearId: uuid,
  gradeLevelId: uuid,
  code,
  name,
  capacity: z
    .union([z.coerce.number().int(), z.literal("")])
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || v >= 1, { message: "Capacity must be 1 or higher" })
    .nullable(),
  status: z.enum(LIFECYCLE_STATUSES),
});

export const subjectInput = z.object({
  id: uuid.optional(),
  schoolId: uuid,
  code,
  name,
  category: z.string().trim().max(80).optional().nullable(),
  isActive: z.boolean(),
});

export const curriculumInput = z.object({
  id: uuid.optional(),
  schoolId: uuid,
  code,
  name,
  version: z.string().trim().max(40).optional().nullable(),
  status: z.enum(LIFECYCLE_STATUSES),
});

export const calendarEventInput = z
  .object({
    id: uuid.optional(),
    schoolId: uuid,
    academicYearId: uuid,
    termId: uuid.nullable().optional(),
    title: name,
    eventType: z.string().trim().min(1, "Event type is required").max(40),
    startsOn: isoDate,
    endsOn: isoDate.nullable().optional(),
    affectsInstruction: z.boolean(),
  })
  .refine((v) => !v.endsOn || v.startsOn <= v.endsOn, {
    message: "The end date must be on or after the start date",
    path: ["endsOn"],
  });

export type AcademicYearInput = z.infer<typeof academicYearInput>;
export type TermInput = z.infer<typeof termInput>;
export type GradeLevelInput = z.infer<typeof gradeLevelInput>;
export type ClassroomInput = z.infer<typeof classroomInput>;
export type SubjectInput = z.infer<typeof subjectInput>;
export type CurriculumInput = z.infer<typeof curriculumInput>;
export type CalendarEventInput = z.infer<typeof calendarEventInput>;

export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please review the highlighted fields";
}
