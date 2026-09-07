import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
export const REPORT_CARD_STATUSES = [
  "draft",
  "submitted",
  "reviewed",
  "published",
  "revised",
  "archived",
] as const;

export const reportCardIdInput = z.object({ reportCardId: uuid });
export const portalReportCardsInput = z.object({ studentId: uuid });
export const portalReportCardInput = portalReportCardsInput.extend({ reportCardId: uuid });
export const reportCardListInput = z.object({
  schoolId: uuid.optional(),
  academicYearId: uuid.optional(),
  termId: uuid.optional(),
  status: z.enum(REPORT_CARD_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
});
export const generateReportCardInput = z.object({
  studentEnrollmentId: uuid,
  termId: uuid,
  expectedUpdatedAt: timestamp.optional(),
});
export const reportCardMutationInput = z.object({
  reportCardId: uuid,
  expectedUpdatedAt: timestamp,
});
export const transitionReportCardInput = reportCardMutationInput.extend({
  action: z.enum(["submit", "review", "return", "archive"]),
});
export const updateHomeroomCommentInput = reportCardMutationInput.extend({
  homeroomComment: z.string().trim().max(4000).nullable(),
});
export const updateSubjectNarrativeInput = reportCardMutationInput.extend({
  entryId: uuid,
  narrative: z.string().trim().max(4000).nullable(),
});
export const upsertNarrativeInput = reportCardMutationInput.extend({
  narrativeId: uuid.optional(),
  sectionCode: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().max(8000),
  sequence: z.number().int().positive(),
});
export const deleteNarrativeInput = reportCardMutationInput.extend({ narrativeId: uuid });
