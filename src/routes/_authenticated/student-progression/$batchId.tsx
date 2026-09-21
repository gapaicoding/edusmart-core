import { createFileRoute } from "@tanstack/react-router";
import { StudentProgressionDetailPage } from "@/components/student-progression/student-progression-ui";

function StudentProgressionDetailRoute() {
  const { batchId } = Route.useParams();
  return <StudentProgressionDetailPage batchId={batchId} />;
}

export const Route = createFileRoute("/_authenticated/student-progression/$batchId")({
  component: StudentProgressionDetailRoute,
});
