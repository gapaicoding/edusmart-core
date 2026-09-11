import { createFileRoute } from "@tanstack/react-router";
import { ReportCardsPage } from "@/components/reporting/reporting-ui";

export const Route = createFileRoute("/_authenticated/report-cards/")({
  component: ReportCardsPage,
  head: () => ({ meta: [{ title: "Report Cards · EduSmart SchoolOS" }] }),
});
