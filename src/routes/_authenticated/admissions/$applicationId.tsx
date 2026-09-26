import { createFileRoute } from "@tanstack/react-router";
import { AdmissionsWorkspace } from "@/components/admissions/admissions-ui";

export const Route = createFileRoute("/_authenticated/admissions/$applicationId")({
  component: AdmissionDetailRoute,
  head: () => ({ meta: [{ title: "Admission Application · EduSmart SchoolOS" }] }),
});

function AdmissionDetailRoute() {
  const { applicationId } = Route.useParams();
  return <AdmissionsWorkspace applicationId={applicationId} />;
}
