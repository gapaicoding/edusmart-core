import { createFileRoute } from "@tanstack/react-router";
import { ReportCardBuilder } from "@/components/reporting/reporting-ui";

export const Route = createFileRoute("/_authenticated/report-cards/$id")({
  component: ReportCardRoute,
  head: () => ({ meta: [{ title: "Report Card · EduSmart SchoolOS" }] }),
});
function ReportCardRoute() {
  return <ReportCardBuilder id={Route.useParams().id} />;
}
