import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { PermissionRequestDetailPage } from "@/components/permission-requests/permission-requests-ui";

export const Route = createFileRoute("/_authenticated/permission-requests/$requestId")({
  component: PermissionRequestDetailRoute,
  head: () => ({ meta: [{ title: "Permission Request · EduSmart SchoolOS" }] }),
});

function PermissionRequestDetailRoute() {
  const { requestId } = Route.useParams();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname.endsWith("/edit")) return <Outlet />;
  return <PermissionRequestDetailPage requestId={requestId} />;
}
