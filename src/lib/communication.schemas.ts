import { z } from "zod";

const uuid = z.string().uuid();
const request = z.object({ requestId: uuid });

export const communicationTargetInput = z
  .object({
    scope: z.enum(["school", "classroom"]),
    classroomId: uuid.nullable().optional(),
    audiences: z
      .array(z.enum(["staff", "student", "guardian"]))
      .min(1)
      .max(3),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "school" && value.classroomId) {
      ctx.addIssue({
        code: "custom",
        path: ["classroomId"],
        message: "School targets cannot include a classroom.",
      });
    }
    if (value.scope === "classroom" && !value.classroomId) {
      ctx.addIssue({
        code: "custom",
        path: ["classroomId"],
        message: "Choose a classroom target.",
      });
    }
  });

const content = z.object({
  schoolId: uuid,
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  targets: z.array(communicationTargetInput).min(1).max(100),
});

export const communicationCreateInput = request.extend(content.shape);
export const communicationUpdateInput = request
  .extend(content.shape)
  .extend({ announcementId: uuid, expectedVersion: z.number().int().positive() });
export const communicationPublishInput = request.extend({
  schoolId: uuid,
  announcementId: uuid,
  expectedVersion: z.number().int().positive(),
});
export const communicationListInput = z.object({
  schoolId: uuid,
  pageSize: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});
export const communicationDetailInput = z.object({ schoolId: uuid, announcementId: uuid });

export type CommunicationTargetInput = z.infer<typeof communicationTargetInput>;
