import { createFileRoute } from "@tanstack/react-router";
import { PortalAttendancePage } from "@/components/portal/portal-ui";

export const Route = createFileRoute("/_authenticated/portal/attendance")({
  component: PortalAttendancePage,
  head: () => ({
    meta: [
      { title: "Attendance · Parent Portal · EduSmart SchoolOS" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
