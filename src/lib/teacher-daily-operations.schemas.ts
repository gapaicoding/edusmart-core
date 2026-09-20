import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().date();
const page = z.number().int().min(1).default(1);
const pageSize = z.number().int().min(1).max(100).default(20);
const text = (max: number) => z.string().max(max).nullable().optional();

export const journalCreateInput = z
  .object({
    requestId: uuid,
    timetableEntryId: uuid,
    journalDate: date,
    materialTaught: text(10000),
    obstacles: text(5000),
    followUp: text(5000),
    teacherNote: text(5000),
  })
  .strict();

export const journalUpdateInput = z
  .object({
    requestId: uuid,
    journalId: uuid,
    expectedVersion: z.number().int().positive(),
    materialTaught: text(10000),
    obstacles: text(5000),
    followUp: text(5000),
    teacherNote: text(5000),
  })
  .strict();

export const journalSubmitInput = z
  .object({ requestId: uuid, journalId: uuid, expectedVersion: z.number().int().positive() })
  .strict();
export const journalListInput = z
  .object({
    academicYearId: uuid.nullable().optional(),
    termId: uuid.nullable().optional(),
    from: date.nullable().optional(),
    to: date.nullable().optional(),
    status: z.enum(["draft", "submitted"]).nullable().optional(),
    page,
    pageSize,
  })
  .strict();
export const journalDetailInput = z.object({ journalId: uuid }).strict();
export const staffJournalListInput = z
  .object({
    schoolId: uuid,
    teacherProfileId: uuid.nullable().optional(),
    classroomId: uuid.nullable().optional(),
    subjectId: uuid.nullable().optional(),
    status: z.enum(["draft", "submitted"]).nullable().optional(),
    from: date.nullable().optional(),
    to: date.nullable().optional(),
    page,
    pageSize,
  })
  .strict();
export const occurrenceListInput = z.object({ from: date, to: date, page, pageSize }).strict();
export const staffAttendanceManageInput = z
  .object({
    requestId: uuid,
    staffMemberId: uuid,
    attendanceDate: date,
    status: z.enum(["present", "late", "excused", "sick", "absent", "leave", "other"]),
    checkInAt: z.string().datetime({ offset: true }).nullable().optional(),
    checkOutAt: z.string().datetime({ offset: true }).nullable().optional(),
    note: z.string().max(5000).nullable().optional(),
    expectedVersion: z.number().int().positive().nullable().optional(),
  })
  .strict();
export const staffAttendanceListInput = z
  .object({
    schoolId: uuid,
    from: date.nullable().optional(),
    to: date.nullable().optional(),
    status: z
      .enum(["present", "late", "excused", "sick", "absent", "leave", "other"])
      .nullable()
      .optional(),
    staffMemberId: uuid.nullable().optional(),
    page,
    pageSize,
  })
  .strict();
export const selfAttendanceListInput = z
  .object({
    from: date.nullable().optional(),
    to: date.nullable().optional(),
    status: z
      .enum(["present", "late", "excused", "sick", "absent", "leave", "other"])
      .nullable()
      .optional(),
    page,
    pageSize,
  })
  .strict();

export type JournalCreateInput = z.infer<typeof journalCreateInput>;
export type JournalUpdateInput = z.infer<typeof journalUpdateInput>;
export type JournalSubmitInput = z.infer<typeof journalSubmitInput>;
export type JournalListInput = z.infer<typeof journalListInput>;
export type StaffJournalListInput = z.infer<typeof staffJournalListInput>;
export type OccurrenceListInput = z.infer<typeof occurrenceListInput>;
export type StaffAttendanceManageInput = z.infer<typeof staffAttendanceManageInput>;
export type StaffAttendanceListInput = z.infer<typeof staffAttendanceListInput>;
export type SelfAttendanceListInput = z.infer<typeof selfAttendanceListInput>;
