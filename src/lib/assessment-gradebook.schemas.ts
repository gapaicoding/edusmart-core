import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
const decimal = z.coerce.number().finite();

export const assessmentGradebookCreateInput = z.object({
  organizationId: uuid,
  schoolId: uuid,
  academicYearId: uuid,
  termId: uuid,
  teachingAssignmentId: uuid,
  assessmentTypeId: uuid,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable(),
  assessmentDate: date,
  minScore: decimal,
  maxScore: decimal,
  weight: decimal.nullable(),
  requestId: uuid,
});

export const assessmentGradebookUpdateDraftInput = assessmentGradebookCreateInput
  .omit({ academicYearId: true, termId: true, teachingAssignmentId: true, requestId: true })
  .extend({
    assessmentId: uuid,
    expectedVersion: z.number().int().min(1),
    requestId: uuid,
  });

export const assessmentGradebookTransitionInput = z.object({
  assessmentId: uuid,
  organizationId: uuid,
  schoolId: uuid,
  action: z.enum(["open", "close", "publish", "archive"]),
  expectedVersion: z.number().int().min(1),
  requestId: uuid,
});

export const assessmentGradebookScoreEntry = z.object({
  studentEnrollmentId: uuid,
  score: decimal.nullable(),
  status: z.enum(["missing", "submitted", "excused", "final"]),
  feedback: z.string().trim().max(1000).nullable(),
  expectedScoreVersion: z.number().int().min(1).nullable(),
});

export const assessmentGradebookSaveScoresInput = z.object({
  assessmentId: uuid,
  organizationId: uuid,
  schoolId: uuid,
  expectedAssessmentVersion: z.number().int().min(1).nullable(),
  entries: z.array(assessmentGradebookScoreEntry).min(1).max(500),
  requestId: uuid,
});

export const assessmentGradebookCorrectionInput = z.object({
  assessmentId: uuid,
  scoreId: uuid,
  organizationId: uuid,
  schoolId: uuid,
  expectedScoreVersion: z.number().int().min(1),
  newScore: decimal,
  newStatus: z.enum(["submitted", "final"]),
  reason: z.string().trim().min(1).max(500),
  requestId: uuid,
});

export const assessmentGradebookListInput = z.object({
  organizationId: uuid,
  schoolId: uuid,
  academicYearId: uuid.nullable(),
  termId: uuid.nullable(),
  status: z.enum(["draft", "open", "closed", "published", "archived"]).nullable(),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0),
});

export const assessmentGradebookResourceInput = z.object({
  organizationId: uuid,
  schoolId: uuid,
  assessmentId: uuid,
});

export type AssessmentGradebookCreateInput = z.infer<typeof assessmentGradebookCreateInput>;
export type AssessmentGradebookUpdateDraftInput = z.infer<
  typeof assessmentGradebookUpdateDraftInput
>;
export type AssessmentGradebookTransitionInput = z.infer<typeof assessmentGradebookTransitionInput>;
export type AssessmentGradebookSaveScoresInput = z.infer<typeof assessmentGradebookSaveScoresInput>;
export type AssessmentGradebookCorrectionInput = z.infer<typeof assessmentGradebookCorrectionInput>;
