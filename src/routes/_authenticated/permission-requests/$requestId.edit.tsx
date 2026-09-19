import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PermissionRequestFormPage } from "@/components/permission-requests/permission-requests-ui";
import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppContext } from "@/lib/app-context";
import {
  getStaffPermissionRequest,
  listPermissionRequestDraftTargets,
} from "@/lib/notifications-parent-permissions.functions";

export const Route = createFileRoute("/_authenticated/permission-requests/$requestId/edit")({
  component: PermissionRequestEditRoute,
  head: () => ({ meta: [{ title: "Edit Permission Request · EduSmart SchoolOS" }] }),
});

function PermissionRequestEditRoute() {
  const { requestId } = Route.useParams();
  const { activeOrganization, activeSchool } = useAppContext();
  const get = useServerFn(getStaffPermissionRequest);
  const targetReader = useServerFn(listPermissionRequestDraftTargets);
  const detail = useQuery({
    queryKey: [
      "permission-requests",
      "edit",
      requestId,
      activeOrganization?.organizationId,
      activeSchool?.id,
    ],
    queryFn: async () => {
      const value = (await get({
        data: {
          requestId,
          organizationId: activeOrganization!.organizationId,
          schoolId: activeSchool!.id!,
        },
      })) as Array<Record<string, unknown>>;
      const row = value[0];
      if (!row) return null;
      const targetStudentIds =
        row["target_mode"] === "students"
          ? await targetReader({
              data: {
                requestId,
                organizationId: activeOrganization!.organizationId,
                schoolId: activeSchool!.id!,
              },
            })
          : [];
      return {
        id: String(row["id"]),
        title: String(row["title"]),
        description: row["description"] as string | null,
        request_type: String(row["request_type"]),
        target_mode: row["target_mode"] as "students" | "classroom",
        target_classroom_id: row["target_classroom_id"] as string | null,
        status: row["status"] as "draft" | "open" | "closed" | "cancelled",
        due_at: row["due_at"] as string | null,
        published_at: row["published_at"] as string | null,
        created_at: String(row["created_at"]),
        version: Number(row["version"]),
        recipient_count: Number(row["recipient_count"]),
        pending_count: Number(row["pending_count"]),
        approved_count: Number(row["approved_count"]),
        rejected_count: Number(row["rejected_count"]),
        targetStudentIds,
      };
    },
    enabled: Boolean(activeOrganization?.organizationId && activeSchool?.id),
  });
  if (detail.isPending)
    return (
      <AppShell>
        <Skeleton className="h-96 w-full" />
      </AppShell>
    );
  if (!detail.data || detail.data.status !== "draft")
    return (
      <AppShell>
        <Alert>
          <AlertTitle>Cannot edit this request</AlertTitle>
          <AlertDescription>Only draft permission requests can be edited.</AlertDescription>
        </Alert>
      </AppShell>
    );
  return <PermissionRequestFormPage requestId={requestId} initial={detail.data} />;
}
