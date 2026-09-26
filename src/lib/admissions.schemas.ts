import { z } from "zod";

const uuid = z.string().uuid();

export const admissionCycleIdInput = z.object({ cycleId: uuid });
export const admissionSchoolInput = z.object({ schoolId: uuid.optional() });
export const admissionApplicationIdInput = z.object({ applicationId: uuid });
export const admissionApplicationListInput = z.object({
  cycleId: uuid,
  status: z.string().trim().min(1).optional(),
  gradeLevelId: uuid.optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const admissionCommandInput = z.object({
  cycleId: uuid,
  expectedRowVersion: z.number().int().positive(),
  requestId: uuid,
  reason: z.string().trim().max(2000).optional().nullable(),
});

export const admissionApplicationCommandInput = z.object({
  applicationId: uuid,
  expectedRowVersion: z.number().int().positive(),
  requestId: uuid,
  reason: z.string().trim().max(2000).optional().nullable(),
});

export const publicAdmissionCycleInput = z.object({ cycleId: uuid });
export const publicAdmissionSubmissionInput = z.object({
  cycleId: uuid,
  requestId: uuid,
  payload: z.record(z.unknown()),
});

export type AdmissionCommandInput = z.infer<typeof admissionCommandInput>;
export type AdmissionApplicationCommandInput = z.infer<typeof admissionApplicationCommandInput>;
