import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  communicationCreateInput,
  communicationDetailInput,
  communicationDeliveryInput,
  communicationDeliveryListInput,
  communicationDeliveryCycleInput,
  communicationDeliveryJobActionInput,
  communicationDeliveryRetryInput,
  communicationContactPreferenceInput,
  communicationListInput,
  communicationPublishInput,
  communicationUpdateInput,
} from "./communication.schemas";
import { callCommunicationRpc } from "./communication.server";
import { runCommunicationDeliveryCycle } from "./communication-operations.server";

export const createCommunicationAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => communicationCreateInput.parse(x))
  .handler(({ data, context }) =>
    callCommunicationRpc(
      context.supabase,
      "b20_create_announcement",
      {
        p_input: {
          request_id: data.requestId,
          school_id: data.schoolId,
          title: data.title,
          body: data.body,
          targets: data.targets.map((target) => ({
            scope: target.scope,
            classroom_id: target.classroomId ?? null,
            audiences: target.audiences,
          })),
        },
      },
      "Create announcement",
    ),
  );

export const updateCommunicationAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => communicationUpdateInput.parse(x))
  .handler(({ data, context }) =>
    callCommunicationRpc(
      context.supabase,
      "b20_update_announcement",
      {
        p_input: {
          request_id: data.requestId,
          school_id: data.schoolId,
          announcement_id: data.announcementId,
          expected_version: data.expectedVersion,
          title: data.title,
          body: data.body,
          targets: data.targets.map((target) => ({
            scope: target.scope,
            classroom_id: target.classroomId ?? null,
            audiences: target.audiences,
          })),
        },
      },
      "Update announcement",
    ),
  );

export const publishCommunicationAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => communicationPublishInput.parse(x))
  .handler(({ data, context }) =>
    callCommunicationRpc(
      context.supabase,
      "b20_publish_announcement",
      {
        p_input: {
          request_id: data.requestId,
          school_id: data.schoolId,
          announcement_id: data.announcementId,
          expected_version: data.expectedVersion,
        },
      },
      "Publish announcement",
    ),
  );

export const listCommunicationAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => communicationListInput.parse(x))
  .handler(({ data, context }) =>
    callCommunicationRpc(
      context.supabase,
      "b20_list_announcements",
      { p_school_id: data.schoolId, p_page_size: data.pageSize, p_offset: data.offset },
      "List announcements",
    ),
  );

export const getCommunicationAnnouncement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => communicationDetailInput.parse(x))
  .handler(({ data, context }) =>
    callCommunicationRpc(
      context.supabase,
      "b20_get_announcement",
      { p_announcement_id: data.announcementId, p_school_id: data.schoolId },
      "Get announcement",
    ),
  );

export const enqueueExternalCommunicationDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => communicationDeliveryInput.parse(x))
  .handler(({ data, context }) =>
    callCommunicationRpc(
      context.supabase,
      "b22_enqueue_external_delivery",
      {
        p_input: {
          school_id: data.schoolId,
          announcement_id: data.announcementId,
          channel: data.channel,
        },
      },
      "Queue external communication",
    ),
  );

export const listExternalCommunicationDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => communicationDeliveryListInput.parse(x))
  .handler(({ data, context }) =>
    callCommunicationRpc(
      context.supabase,
      // B22's historical "b22_list_delivery_jobs" RPC remains intact; B25 exposes
      // its privacy-safe recipient projection through the replacement below.
      "b25_list_delivery_operations",
      { p_announcement_id: data.announcementId, p_school_id: data.schoolId },
      "Read external communication status",
    ),
  );

export const runExternalCommunicationDeliveryCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => communicationDeliveryCycleInput.parse(x))
  .handler(({ data, context }) =>
    runCommunicationDeliveryCycle({
      actorProfileId: context.userId,
      schoolId: data.schoolId,
      limit: data.limit,
      userClient: context.supabase,
    }),
  );

export const setExternalCommunicationDeliveryPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => communicationDeliveryJobActionInput.parse(x))
  .handler(({ data, context }) =>
    callCommunicationRpc(
      context.supabase,
      "b25_set_delivery_job_paused",
      { p_job_id: data.jobId, p_school_id: data.schoolId, p_paused: data.paused },
      "Update delivery job",
    ),
  );

export const retryExternalCommunicationDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => communicationDeliveryRetryInput.parse(x))
  .handler(({ data, context }) =>
    callCommunicationRpc(
      context.supabase,
      "b25_request_delivery_retry",
      {
        p_recipient_id: data.recipientId,
        p_school_id: data.schoolId,
        p_request_id: data.requestId,
      },
      "Request delivery retry",
    ),
  );

export const recordExternalContactPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => communicationContactPreferenceInput.parse(x))
  .handler(({ data, context }) =>
    callCommunicationRpc(
      context.supabase,
      "b25_record_contact_preference",
      {
        p_input: {
          school_id: data.schoolId,
          recipient_profile_id: data.recipientProfileId,
          channel: data.channel,
          purpose: "operational",
          consent_state: data.consentState,
          contact_state: data.contactState,
          source: data.source,
          source_reference: data.sourceReference ?? null,
        },
      },
      "Record contact eligibility",
    ),
  );
