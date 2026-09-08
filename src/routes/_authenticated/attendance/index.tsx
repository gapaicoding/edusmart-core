import { createFileRoute } from "@tanstack/react-router";
import { AttendancePage } from "@/components/attendance/attendance-ui";

export const Route = createFileRoute("/_authenticated/attendance/")({
  component: AttendancePage,
  head: () => ({
    meta: [
      { title: "Attendance · EduSmart SchoolOS" },
      {
        name: "description",
        content: "Open, record, submit, and review academic attendance sessions.",
      },
    ],
  }),
});
