import { z } from "zod";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const page = z.number().int().min(0).default(0);
const pageSize = z.number().int().min(1).max(100).default(50);
const dueAt = z.string().datetime({ offset: true }).nullable().optional();
const text = (max: number) => z.string().trim().min(1).max(max);

export const permissionRequestDraftInput = z
  .object({
    organizationId: uuid,
    schoolId: uuid,
    requestId: uuid,
    commandRequestId: uuid,
    requestType: text(60),
    title: text(200),
    description: z.string().trim().max(5000).nullable().optional(),
    targetMode: z.enum(["students", "classroom"]),
    targetClassroomId: uuid.nullable().optional(),
    studentIds: z.array(uuid).max(500).default([]),
    dueAt,
  })
  .strict();

export const permissionRequestUpdateInput = permissionRequestDraftInput
  .extend({ expectedVersion: version })
  .strict();
export const permissionRequestLifecycleInput = z
  .object({
    requestId: uuid,
    organizationId: uuid,
    schoolId: uuid,
    expectedVersion: version,
    commandRequestId: uuid,
  })
  .strict();
export const publishPermissionRequestInput = permissionRequestLifecycleInput;
export const parentDecisionInput = z
  .object({
    requestId: uuid,
    requestRecipientId: uuid,
    decision: z.enum(["approved", "rejected"]),
    expectedVersion: version.nullable().optional(),
    commandRequestId: uuid,
  })
  .strict();
export const reminderInput = z
  .object({ requestId: uuid, organizationId: uuid, schoolId: uuid, commandRequestId: uuid })
  .strict();
export const readNotificationInput = z.object({ notificationRecipientId: uuid }).strict();
export const staffRequestListInput = z
  .object({
    organizationId: uuid,
    schoolId: uuid,
    status: z.enum(["draft", "open", "closed", "cancelled"]).optional(),
    pageSize,
    offset: page,
  })
  .strict();
export const staffRequestDetailInput = z
  .object({ requestId: uuid, organizationId: uuid, schoolId: uuid })
  .strict();
export const responsesInput = z.object({ requestId: uuid, pageSize, offset: page }).strict();
export const parentRequestListInput = z.object({ pageSize, offset: page }).strict();
export const parentRequestDetailInput = z.object({ requestId: uuid }).strict();
export const historyInput = z
  .object({
    requestId: uuid,
    requestRecipientId: uuid.nullable().optional(),
    pageSize,
    offset: page,
  })
  .strict();
export const notificationsListInput = z.object({ pageSize, offset: page }).strict();
