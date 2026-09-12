import { createFileRoute } from "@tanstack/react-router";
import { StudentAttendancePage } from "@/components/student-portal/student-portal-ui";

export const Route = createFileRoute("/_authenticated/student/attendance")({
  component: StudentAttendancePage,
  head: () => ({
    meta: [
      { title: "Attendance · Student Portal · EduSmart SchoolOS" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
