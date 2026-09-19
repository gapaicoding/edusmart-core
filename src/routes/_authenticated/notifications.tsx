import { createFileRoute } from "@tanstack/react-router";
import { NotificationInboxPage } from "@/components/notifications/notification-inbox-ui";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationInboxPage,
  head: () => ({ meta: [{ title: "Notifications · EduSmart SchoolOS" }] }),
});
