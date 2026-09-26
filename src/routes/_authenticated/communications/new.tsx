import { createFileRoute } from "@tanstack/react-router";
import { CommunicationNewPage } from "@/components/communications/communication-center-ui";

export const Route = createFileRoute("/_authenticated/communications/new")({
  component: CommunicationNewPage,
  head: () => ({ meta: [{ title: "New Announcement · EduSmart SchoolOS" }] }),
});
