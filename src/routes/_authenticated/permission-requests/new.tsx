import { createFileRoute } from "@tanstack/react-router";
import { PermissionRequestFormPage } from "@/components/permission-requests/permission-requests-ui";

export const Route = createFileRoute("/_authenticated/permission-requests/new")({
  component: () => <PermissionRequestFormPage />,
  head: () => ({ meta: [{ title: "Create Permission Request · EduSmart SchoolOS" }] }),
});
