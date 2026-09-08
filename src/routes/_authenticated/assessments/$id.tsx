import { createFileRoute } from "@tanstack/react-router";
import { AssessmentDetailPage } from "@/components/assessment/assessment-ui";

export const Route = createFileRoute("/_authenticated/assessments/$id")({
  component: AssessmentRoute,
  head: () => ({ meta: [{ title: "Score Entry · EduSmart SchoolOS" }] }),
});

function AssessmentRoute() {
  return <AssessmentDetailPage id={Route.useParams().id} />;
}
