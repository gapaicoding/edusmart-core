import { z } from "zod";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const boundedReason = z.string().trim().min(3).max(1000);

export const progressionListInput = z
  .object({
    schoolId: uuid,
    limit: z.number().int().min(1).max(250).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();

export const progressionBatchDetailInput = z.object({ schoolId: uuid, batchId: uuid }).strict();

export const progressionCreateInput = z
  .object({
    requestId: uuid,
    schoolId: uuid,
    sourceAcademicYearId: uuid,
    targetAcademicYearId: uuid,
  })
  .strict();

export const progressionDecisionInput = z
  .object({
    requestId: uuid,
    schoolId: uuid,
    batchId: uuid,
    sourceStudentEnrollmentId: uuid,
    outcome: z.enum(["promoted", "retained", "graduated"]),
    targetGradeLevelId: uuid.nullable().optional(),
    targetClassroomId: uuid.nullable().optional(),
    exceptionReason: z.string().trim().max(1000).nullable().optional(),
    operatorNote: z.string().trim().max(2000).nullable().optional(),
    expectedVersion: version,
  })
  .strict();

export const progressionTransitionInput = z
  .object({
    requestId: uuid,
    schoolId: uuid,
    batchId: uuid,
    expectedVersion: version,
  })
  .strict();

export const progressionReasonTransitionInput = progressionTransitionInput
  .extend({
    reason: boundedReason,
  })
  .strict();
