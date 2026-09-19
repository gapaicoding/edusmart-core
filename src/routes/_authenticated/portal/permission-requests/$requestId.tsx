import { createFileRoute } from "@tanstack/react-router";
import { ParentPermissionRequestDetailPage } from "@/components/portal/parent-permission-requests-ui";

export const Route = createFileRoute("/_authenticated/portal/permission-requests/$requestId")({
  component: ParentPermissionRequestDetailRoute,
  head: () => ({ meta: [{ title: "Permission Request · Parent Portal · EduSmart SchoolOS" }] }),
});

function ParentPermissionRequestDetailRoute() {
  const { requestId } = Route.useParams();
  return <ParentPermissionRequestDetailPage requestId={requestId} />;
}
