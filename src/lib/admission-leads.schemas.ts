import { z } from "zod";

const uuid = z.string().uuid();
export const admissionLeadListInput = z.object({
  schoolId: uuid,
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "CLOSED"]).optional(),
  source: z.enum(["WALK_IN", "REFERRAL", "SOCIAL_MEDIA", "WEBSITE", "EVENT", "OTHER"]).optional(),
  channel: z.enum(["WHATSAPP", "PHONE", "EMAIL", "IN_PERSON", "OTHER"]).optional(),
  assigneeId: uuid.optional(),
  unassigned: z.boolean().default(false),
  actionFilter: z.enum(["OVERDUE", "UPCOMING"]).optional(),
  search: z.string().trim().min(2).max(100).optional(),
});
export const admissionLeadIdInput = z.object({ leadId: uuid });
export const admissionLeadSchoolInput = z.object({ schoolId: uuid });
export const admissionLeadDuplicateInput = z.object({
  schoolId: uuid,
  phone: z.string().max(64).optional(),
  email: z.string().email().max(320).optional(),
  excludeLeadId: uuid.optional(),
});
export const admissionLeadCreateInput = z.object({
  schoolId: uuid,
  requestId: uuid,
  payload: z.object({
    admission_cycle_id: uuid.optional().nullable(),
    prospect_name: z.string().trim().min(1).max(200),
    contact_name: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(64).optional(),
    email: z.string().trim().email().max(320).or(z.literal("")).optional(),
    source: z.enum(["WALK_IN", "REFERRAL", "SOCIAL_MEDIA", "WEBSITE", "EVENT", "OTHER"]),
    source_other: z.string().trim().max(80).optional(),
    contact_channel: z.enum(["WHATSAPP", "PHONE", "EMAIL", "IN_PERSON", "OTHER"]),
    channel_other: z.string().trim().max(80).optional(),
    assigned_profile_id: uuid.optional().nullable(),
    next_action_at: z.string().datetime({ offset: true }).optional().nullable(),
  }),
});
export const admissionLeadCommandInput = z.object({
  leadId: uuid,
  expectedRowVersion: z.number().int().positive(),
  requestId: uuid,
  command: z.enum(["update", "contact", "qualify", "close", "assign", "next_action", "note"]),
  payload: z.record(z.unknown()).default({}),
});
export const admissionLeadConvertInput = z.object({
  leadId: uuid,
  expectedRowVersion: z.number().int().positive(),
  requestId: uuid,
  application: z.object({
    admission_cycle_id: uuid,
    target_grade_level_id: uuid,
    guardian_name: z.string().trim().min(1).max(200),
    guardian_relationship: z.string().trim().min(1).max(80),
    policy_version: z.string().trim().min(1).max(128),
    consent_confirmed: z.literal(true),
  }),
});
