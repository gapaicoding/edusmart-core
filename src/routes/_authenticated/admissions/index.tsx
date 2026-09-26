import { createFileRoute } from "@tanstack/react-router";
import { AdmissionsWorkspace } from "@/components/admissions/admissions-ui";

export const Route = createFileRoute("/_authenticated/admissions/")({
  component: AdmissionsRoute,
  head: () => ({ meta: [{ title: "Admissions · EduSmart SchoolOS" }] }),
});

function AdmissionsRoute() {
  return <AdmissionsWorkspace />;
}
