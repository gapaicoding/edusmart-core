import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { ParentPermissionRequestListPage } from "@/components/portal/parent-permission-requests-ui";

export const Route = createFileRoute("/_authenticated/portal/permission-requests")({
  component: ParentPermissionRequestRoute,
  head: () => ({ meta: [{ title: "Permission Requests · Parent Portal · EduSmart SchoolOS" }] }),
});

function ParentPermissionRequestRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return pathname === "/portal/permission-requests" ? (
    <ParentPermissionRequestListPage />
  ) : (
    <Outlet />
  );
}
