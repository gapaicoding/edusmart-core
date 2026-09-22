import { z } from "zod";

const uuid = z.string().uuid();
const rowVersion = z.number().int().min(1);

export const reportCardGenerationInput = z.object({
  studentEnrollmentId: uuid,
  termId: uuid,
  requestId: uuid,
  expectedRowVersion: rowVersion.nullable().optional(),
});

export const reportCardContentInput = z.object({
  reportCardId: uuid,
  expectedRowVersion: rowVersion,
  content: z.object({
    homeroom_comment: z.string().max(5000).nullable().optional(),
    subject_entries: z
      .array(
        z.object({
          id: uuid,
          narrative: z.string().max(5000).nullable(),
          expected_row_version: rowVersion,
        }),
      )
      .max(100)
      .optional(),
    narratives: z
      .array(
        z.object({
          id: uuid.nullable().optional(),
          section_code: z.string().min(1).max(100),
          title: z.string().max(300),
          content: z.string().max(5000),
          sequence: z.number().int().min(0),
          expected_row_version: rowVersion.optional(),
        }),
      )
      .max(100)
      .optional(),
  }),
  requestId: uuid,
});

export const reportCardTransitionInput = z.object({
  reportCardId: uuid,
  action: z.enum(["submit", "review", "return", "archive"]),
  expectedRowVersion: rowVersion,
  requestId: uuid,
});

export const reportCardPublishInput = z.object({
  reportCardId: uuid,
  expectedRowVersion: rowVersion,
  requestId: uuid,
});

export const reportCardRevisionInput = z.object({
  sourceReportCardId: uuid,
  expectedSourceRowVersion: rowVersion,
  reason: z.string().trim().min(1).max(1000),
  requestId: uuid,
});

export const reportCardListInput = z.object({
  schoolId: uuid,
  academicYearId: uuid.nullable().optional(),
  termId: uuid.nullable().optional(),
  status: z
    .enum(["draft", "submitted", "reviewed", "published", "revised", "archived"])
    .nullable()
    .optional(),
  limit: z.number().int().min(1).max(200).default(100),
  offset: z.number().int().min(0).default(0),
});

export const reportCardResourceInput = z.object({ reportCardId: uuid });
export const reportCardCandidateInput = z.object({
  schoolId: uuid,
  academicYearId: uuid.nullable().optional(),
});

export type ReportCardGenerationInput = z.infer<typeof reportCardGenerationInput>;
export type ReportCardContentInput = z.infer<typeof reportCardContentInput>;
export type ReportCardTransitionInput = z.infer<typeof reportCardTransitionInput>;
export type ReportCardPublishInput = z.infer<typeof reportCardPublishInput>;
export type ReportCardRevisionInput = z.infer<typeof reportCardRevisionInput>;
