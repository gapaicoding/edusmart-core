import { z } from "zod";

const uuid = z.string().uuid();
const optionalUuid = z.preprocess((value) => (value === "" ? undefined : value), uuid.optional());
const nullableUuid = z.preprocess((value) => (value === "" ? null : value), uuid.nullable());
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");

export const scheduleFilterInput = z.object({
  organizationId: uuid,
  schoolId: uuid,
  academicYearId: uuid,
  termId: nullableUuid,
  classroomId: optionalUuid,
  staffMemberId: optionalUuid,
  mine: z.boolean().default(false),
});

export const scheduleOptionsInput = z.object({
  organizationId: uuid,
  schoolId: uuid,
  academicYearId: uuid,
});

const timetableEntryObject = z.object({
    id: optionalUuid,
    rowVersion: z.number().int().positive().optional(),
    organizationId: uuid,
    schoolId: uuid,
    academicYearId: uuid,
    termId: nullableUuid,
    teachingAssignmentId: uuid,
    timetablePeriodId: uuid,
    weekday: z.number().int().min(1).max(7),
    roomLabel: z.string().trim().max(120).nullable(),
    effectiveFrom: date,
    effectiveTo: date.nullable(),
  });

export const timetableEntryInput = timetableEntryObject.superRefine((value, context) => {
    if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effectiveTo"],
        message: "The end date must be on or after the start date.",
      });
    }
    if (value.id && !value.rowVersion) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rowVersion"],
        message: "A row version is required when editing an entry.",
      });
    }
  });

export const timetableLifecycleInput = z.object({
  id: uuid,
  rowVersion: z.number().int().positive(),
  organizationId: uuid,
  schoolId: uuid,
  action: z.enum(["publish", "archive"]),
});

export const replaceTimetableEntryInput = timetableEntryObject.extend({
  id: uuid,
  rowVersion: z.number().int().positive(),
  cutoverDate: date,
}).superRefine((value, context) => {
  if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["effectiveTo"], message: "The end date must be on or after the start date." });
  }
});

export type ScheduleFilterInput = z.infer<typeof scheduleFilterInput>;
export type TimetableEntryInput = z.infer<typeof timetableEntryInput>;
export type ReplaceTimetableEntryInput = z.infer<typeof replaceTimetableEntryInput>;
