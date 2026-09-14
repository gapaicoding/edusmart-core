import { createFileRoute } from "@tanstack/react-router";
import { SisImportJobPage } from "@/components/sis-import/sis-import-ui";

export const Route = createFileRoute("/_authenticated/sis-imports/$jobId")({
  component: JobRoute,
  head: () => ({ meta: [{ title: "SIS Import · EduSmart SchoolOS" }] }),
});

function JobRoute() {
  const { jobId } = Route.useParams();
  return <SisImportJobPage jobId={jobId} />;
}
