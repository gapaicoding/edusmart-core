import { createServerFn } from "@tanstack/react-start";
import type { PostgrestError } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { B12DomainError, translateB12Error } from "./notifications-parent-permissions.server";
import {
  permissionRequestDraftInput,
  permissionRequestUpdateInput,
  publishPermissionRequestInput,
  parentDecisionInput,
  reminderInput,
  readNotificationInput,
  staffRequestListInput,
  staffRequestDetailInput,
  responsesInput,
  parentRequestListInput,
  parentRequestDetailInput,
  historyInput,
  notificationsListInput,
} from "./notifications-parent-permissions.schemas";

type RpcName =
  | "create_permission_request"
  | "update_permission_request"
  | "publish_permission_request"
  | "submit_parent_permission_decision"
  | "close_permission_request"
  | "cancel_permission_request"
  | "send_permission_request_reminder"
  | "mark_notification_read"
  | "list_staff_permission_requests"
  | "get_staff_permission_request"
  | "list_permission_request_responses"
  | "list_parent_permission_requests"
  | "get_parent_permission_request"
  | "list_permission_decision_history"
  | "list_my_notifications";
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: PostgrestError | null }>;
};
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type RpcRow = { [key: string]: JsonValue };

async function rpc<T>(
  client: RpcClient,
  name: RpcName,
  args: Record<string, unknown>,
  subject: string,
): Promise<T> {
  const result = await client.rpc(name, args);
  if (result.error) throw translateB12Error(result.error, subject);
  return result.data as T;
}

function first<T>(data: T[], subject: string): T {
  const row = data[0];
  if (!row) throw new B12DomainError("UNKNOWN_SAFE_FAILURE", `${subject} returned no result.`);
  return row;
}

export const createPermissionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => permissionRequestDraftInput.parse(x))
  .handler(async ({ data, context }) =>
    first(
      await rpc<RpcRow[]>(
        context.supabase as unknown as RpcClient,
        "create_permission_request",
        {
          p_organization_id: data.organizationId,
          p_school_id: data.schoolId,
          p_request_id: data.requestId,
          p_request_type: data.requestType,
          p_title: data.title,
          p_description: data.description ?? null,
          p_target_mode: data.targetMode,
          p_target_classroom_id: data.targetClassroomId ?? null,
          p_student_ids: data.studentIds,
          p_due_at: data.dueAt ?? null,
          p_command_request_id: data.commandRequestId,
        },
        "Create permission request",
      ),
      "Create permission request",
    ),
  );
export const updatePermissionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => permissionRequestUpdateInput.parse(x))
  .handler(async ({ data, context }) =>
    first(
      await rpc<RpcRow[]>(
        context.supabase as unknown as RpcClient,
        "update_permission_request",
        {
          p_request_id: data.requestId,
          p_organization_id: data.organizationId,
          p_school_id: data.schoolId,
          p_expected_version: data.expectedVersion,
          p_request_type: data.requestType,
          p_title: data.title,
          p_description: data.description ?? null,
          p_target_mode: data.targetMode,
          p_target_classroom_id: data.targetClassroomId ?? null,
          p_student_ids: data.studentIds,
          p_due_at: data.dueAt ?? null,
          p_command_request_id: data.commandRequestId,
        },
        "Update permission request",
      ),
      "Update permission request",
    ),
  );
export const publishPermissionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => publishPermissionRequestInput.parse(x))
  .handler(async ({ data, context }) =>
    first(
      await rpc<RpcRow[]>(
        context.supabase as unknown as RpcClient,
        "publish_permission_request",
        {
          p_request_id: data.requestId,
          p_organization_id: data.organizationId,
          p_school_id: data.schoolId,
          p_expected_version: data.expectedVersion,
          p_command_request_id: data.commandRequestId,
        },
        "Publish permission request",
      ),
      "Publish permission request",
    ),
  );
export const closePermissionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => publishPermissionRequestInput.parse(x))
  .handler(async ({ data, context }) =>
    first(
      await rpc<RpcRow[]>(
        context.supabase as unknown as RpcClient,
        "close_permission_request",
        {
          p_request_id: data.requestId,
          p_organization_id: data.organizationId,
          p_school_id: data.schoolId,
          p_expected_version: data.expectedVersion,
          p_command_request_id: data.commandRequestId,
        },
        "Close permission request",
      ),
      "Close permission request",
    ),
  );
export const cancelPermissionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => publishPermissionRequestInput.parse(x))
  .handler(async ({ data, context }) =>
    first(
      await rpc<RpcRow[]>(
        context.supabase as unknown as RpcClient,
        "cancel_permission_request",
        {
          p_request_id: data.requestId,
          p_organization_id: data.organizationId,
          p_school_id: data.schoolId,
          p_expected_version: data.expectedVersion,
          p_command_request_id: data.commandRequestId,
        },
        "Cancel permission request",
      ),
      "Cancel permission request",
    ),
  );
export const submitParentPermissionDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => parentDecisionInput.parse(x))
  .handler(async ({ data, context }) =>
    first(
      await rpc<RpcRow[]>(
        context.supabase as unknown as RpcClient,
        "submit_parent_permission_decision",
        {
          p_request_id: data.requestId,
          p_request_recipient_id: data.requestRecipientId,
          p_decision: data.decision,
          p_expected_version: data.expectedVersion ?? null,
          p_command_request_id: data.commandRequestId,
        },
        "Parent decision",
      ),
      "Parent decision",
    ),
  );
export const sendPermissionRequestReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => reminderInput.parse(x))
  .handler(async ({ data, context }) =>
    first(
      await rpc<RpcRow[]>(
        context.supabase as unknown as RpcClient,
        "send_permission_request_reminder",
        {
          p_request_id: data.requestId,
          p_organization_id: data.organizationId,
          p_school_id: data.schoolId,
          p_command_request_id: data.commandRequestId,
        },
        "Permission request reminder",
      ),
      "Permission request reminder",
    ),
  );
export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => readNotificationInput.parse(x))
  .handler(async ({ data, context }) =>
    first(
      await rpc<RpcRow[]>(
        context.supabase as unknown as RpcClient,
        "mark_notification_read",
        { p_notification_recipient_id: data.notificationRecipientId },
        "Mark notification read",
      ),
      "Mark notification read",
    ),
  );

export const listStaffPermissionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => staffRequestListInput.parse(x))
  .handler(async ({ data, context }) =>
    rpc<RpcRow[]>(
      context.supabase as unknown as RpcClient,
      "list_staff_permission_requests",
      {
        p_organization_id: data.organizationId,
        p_school_id: data.schoolId,
        p_status: data.status ?? null,
        p_page_size: data.pageSize,
        p_offset: data.offset,
      },
      "Staff permission requests",
    ),
  );
export const getStaffPermissionRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => staffRequestDetailInput.parse(x))
  .handler(async ({ data, context }) =>
    rpc<RpcRow[]>(
      context.supabase as unknown as RpcClient,
      "get_staff_permission_request",
      {
        p_request_id: data.requestId,
        p_organization_id: data.organizationId,
        p_school_id: data.schoolId,
      },
      "Staff permission request",
    ),
  );

/**
 * Draft target identifiers are intentionally read through the caller-scoped
 * server client. The deployed detail projection returns the request summary,
 * while RLS exposes these identifiers only to permission-scoped Staff. No
 * browser table access or mutation is introduced here.
 */
export const listPermissionRequestDraftTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => staffRequestDetailInput.parse(x))
  .handler(async ({ data, context }): Promise<string[]> => {
    const { data: rows, error } = await context.supabase
      .from("parent_permission_request_draft_targets")
      .select("student_id")
      .eq("request_id", data.requestId)
      .eq("organization_id", data.organizationId)
      .eq("school_id", data.schoolId)
      .order("student_id");
    if (error) throw translateB12Error(error, "Draft permission targets");
    return (rows ?? []).map((row) => row.student_id);
  });
export const listPermissionRequestResponses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => responsesInput.parse(x))
  .handler(async ({ data, context }) =>
    rpc<RpcRow[]>(
      context.supabase as unknown as RpcClient,
      "list_permission_request_responses",
      { p_request_id: data.requestId, p_page_size: data.pageSize, p_offset: data.offset },
      "Permission responses",
    ),
  );
export const listParentPermissionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => parentRequestListInput.parse(x))
  .handler(async ({ data, context }) =>
    rpc<RpcRow[]>(
      context.supabase as unknown as RpcClient,
      "list_parent_permission_requests",
      { p_page_size: data.pageSize, p_offset: data.offset },
      "Parent permission requests",
    ),
  );
export const getParentPermissionRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => parentRequestDetailInput.parse(x))
  .handler(async ({ data, context }) =>
    rpc<RpcRow[]>(
      context.supabase as unknown as RpcClient,
      "get_parent_permission_request",
      { p_request_id: data.requestId },
      "Parent permission request",
    ),
  );
export const listPermissionDecisionHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => historyInput.parse(x))
  .handler(async ({ data, context }) =>
    rpc<RpcRow[]>(
      context.supabase as unknown as RpcClient,
      "list_permission_decision_history",
      {
        p_request_id: data.requestId,
        p_request_recipient_id: data.requestRecipientId ?? null,
        p_page_size: data.pageSize,
        p_offset: data.offset,
      },
      "Decision history",
    ),
  );
export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => notificationsListInput.parse(x))
  .handler(async ({ data, context }) =>
    rpc<RpcRow[]>(
      context.supabase as unknown as RpcClient,
      "list_my_notifications",
      { p_page_size: data.pageSize, p_offset: data.offset },
      "Notifications",
    ),
  );
