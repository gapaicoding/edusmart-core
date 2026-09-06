import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
const decimal = z.coerce.number().finite().multipleOf(0.01, "Use at most two decimal places.");

export const ASSESSMENT_STATUSES = ["draft", "open", "closed", "published", "archived"] as const;
export const SCORE_STATUSES = ["missing", "submitted", "excused", "final"] as const;

export const assessmentScopeInput = z.object({
  organizationId: uuid,
  schoolId: uuid,
  academicYearId: uuid,
  termId: uuid,
});

export const assessmentListInput = assessmentScopeInput.extend({
  status: z.enum(ASSESSMENT_STATUSES).optional(),
});

export const assessmentRecordInput = assessmentScopeInput.extend({ id: uuid });

export const assessmentInput = assessmentScopeInput
  .extend({
    id: uuid.optional(),
    teachingAssignmentId: uuid,
    assessmentTypeId: uuid,
    title: z.string().trim().min(1, "Enter an assessment title.").max(160),
    description: z.string().trim().max(2000).nullable().optional(),
    assessmentDate: date,
    minScore: decimal,
    maxScore: decimal,
    weight: z.coerce.number().finite().min(0).nullable().optional(),
    expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((value, context) => {
    if (value.maxScore <= value.minScore)
      context.addIssue({
        code: "custom",
        path: ["maxScore"],
        message: "Maximum score must exceed minimum score.",
      });
    if (value.id && !value.expectedUpdatedAt)
      context.addIssue({
        code: "custom",
        path: ["expectedUpdatedAt"],
        message: "Refresh this assessment before editing.",
      });
  });

export const assessmentLifecycleInput = assessmentRecordInput.extend({
  action: z.enum(["open", "close", "publish", "archive"]),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

export const scoreSaveInput = assessmentRecordInput.extend({
  rows: z
    .array(
      z
        .object({
          scoreId: uuid.optional(),
          studentEnrollmentId: uuid,
          score: decimal.nullable(),
          status: z.enum(SCORE_STATUSES),
          feedback: z.string().trim().max(1000).nullable().optional(),
          expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
        })
        .superRefine((row, context) => {
          if (["submitted", "final"].includes(row.status) && row.score === null)
            context.addIssue({
              code: "custom",
              path: ["score"],
              message: "Enter a score for submitted or final results.",
            });
          if (["missing", "excused"].includes(row.status) && row.score !== null)
            context.addIssue({
              code: "custom",
              path: ["score"],
              message: "Missing or excused results cannot have a score.",
            });
          if (row.scoreId && !row.expectedUpdatedAt)
            context.addIssue({
              code: "custom",
              path: ["expectedUpdatedAt"],
              message: "Refresh this score before editing.",
            });
        }),
    )
    .min(1)
    .max(100),
});
