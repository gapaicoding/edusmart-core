import { z } from "zod";

export const childIdInput = z.object({
  studentId: z.string().uuid(),
});

export const portalAttendanceInput = z.object({
  studentId: z.string().uuid(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const portalScoresInput = z.object({
  studentId: z.string().uuid(),
  academicYearId: z.string().uuid().optional(),
});

export const portalScheduleInput = z.object({
  studentId: z.string().uuid(),
});

export type ChildIdInput = z.infer<typeof childIdInput>;
export type PortalAttendanceInput = z.infer<typeof portalAttendanceInput>;
export type PortalScoresInput = z.infer<typeof portalScoresInput>;
export type PortalScheduleInput = z.infer<typeof portalScheduleInput>;
