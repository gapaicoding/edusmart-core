import { createFileRoute } from "@tanstack/react-router";
import { PermissionRequestListPage } from "@/components/permission-requests/permission-requests-ui";

export const Route = createFileRoute("/_authenticated/permission-requests/")({
  component: PermissionRequestListPage,
  head: () => ({ meta: [{ title: "Permission Requests · EduSmart SchoolOS" }] }),
});
