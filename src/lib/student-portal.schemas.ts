import { z } from "zod";

/**
 * Batch 9 — Student Portal input schemas.
 *
 * None of these accept a client-provided studentId. The authenticated
 * student is always resolved server-side via
 * auth.uid() -> profiles.id -> students.profile_id. Organization/school are
 * accepted only as FILTER context (the caller's active workspace selection),
 * never as authorization proof.
 */

const uuid = z.string().uuid();

export const studentPortalContextInput = z.object({
  organizationId: uuid,
  schoolId: uuid.optional(),
});

export const studentPortalAttendanceInput = z.object({
  organizationId: uuid,
  schoolId: uuid,
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const studentPortalScoresInput = z.object({
  organizationId: uuid,
  academicYearId: uuid.optional(),
});

export const studentPortalReportCardInput = z.object({
  organizationId: uuid,
  reportCardId: uuid,
});

export const studentReportCardDocumentInput = z.object({ reportCardId: uuid }).strict();

export const createStudentPortalInvitationInput = z.object({
  organizationId: uuid,
  schoolId: uuid,
  studentId: uuid,
  email: z.string().trim().email(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

export type StudentPortalContextInput = z.infer<typeof studentPortalContextInput>;
export type StudentPortalAttendanceInput = z.infer<typeof studentPortalAttendanceInput>;
export type StudentPortalScoresInput = z.infer<typeof studentPortalScoresInput>;
export type StudentPortalReportCardInput = z.infer<typeof studentPortalReportCardInput>;
export type StudentReportCardDocumentInput = z.infer<typeof studentReportCardDocumentInput>;
export type CreateStudentPortalInvitationInput = z.infer<typeof createStudentPortalInvitationInput>;
