import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { AssessmentDetailPage } from "@/components/assessment/assessment-gradebook-ui";

export const Route = createFileRoute("/_authenticated/assessments/$id")({
  component: AssessmentRoute,
  head: () => ({ meta: [{ title: "Score Entry · EduSmart SchoolOS" }] }),
});

function AssessmentRoute() {
  return (
    <AppShell>
      <AssessmentDetailPage id={Route.useParams().id} />
    </AppShell>
  );
}
