import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { AssessmentsPage } from "@/components/assessment/assessment-gradebook-ui";

export const Route = createFileRoute("/_authenticated/assessments/")({
  component: AssessmentListRoute,
  head: () => ({ meta: [{ title: "Assessments · EduSmart SchoolOS" }] }),
});

function AssessmentListRoute() {
  return (
    <AppShell>
      <AssessmentsPage />
    </AppShell>
  );
}
