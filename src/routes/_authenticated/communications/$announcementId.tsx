import { createFileRoute } from "@tanstack/react-router";
import { CommunicationDetailPage } from "@/components/communications/communication-center-ui";

export const Route = createFileRoute("/_authenticated/communications/$announcementId")({
  component: CommunicationDetailPage,
  head: () => ({ meta: [{ title: "Announcement · EduSmart SchoolOS" }] }),
});
