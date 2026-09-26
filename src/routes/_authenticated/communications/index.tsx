import { createFileRoute } from "@tanstack/react-router";
import { CommunicationListPage } from "@/components/communications/communication-center-ui";

export const Route = createFileRoute("/_authenticated/communications/")({
  component: CommunicationListPage,
  head: () => ({ meta: [{ title: "Communication Center · EduSmart SchoolOS" }] }),
});
