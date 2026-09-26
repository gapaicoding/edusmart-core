import { createFileRoute } from "@tanstack/react-router";
import { PublicAdmissionPage } from "@/components/admissions/admissions-ui";

export const Route = createFileRoute("/ppdb/$cycleId")({
  component: PublicAdmissionRoute,
  head: () => ({ meta: [{ title: "Admissions · EduSmart SchoolOS" }] }),
});

function PublicAdmissionRoute() {
  const { cycleId } = Route.useParams();
  return <PublicAdmissionPage cycleId={cycleId} />;
}
