import { createFileRoute } from "@tanstack/react-router";
import { AttendanceSessionPage } from "@/components/attendance/attendance-ui";

export const Route = createFileRoute("/_authenticated/attendance/session/$id")({
  component: AttendanceSessionRoute,
  head: () => ({ meta: [{ title: "Attendance Session · EduSmart SchoolOS" }] }),
});

function AttendanceSessionRoute() {
  const { id } = Route.useParams();
  return <AttendanceSessionPage id={id} />;
}
