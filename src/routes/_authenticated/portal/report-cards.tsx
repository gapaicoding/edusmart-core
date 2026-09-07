import { createFileRoute } from "@tanstack/react-router";
import { PortalReportCardsPage } from "@/components/portal/portal-ui";

export const Route = createFileRoute("/_authenticated/portal/report-cards")({
  component: PortalReportCardsPage,
  head: () => ({
    meta: [
      { title: "Report Cards · Parent Portal · EduSmart SchoolOS" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
