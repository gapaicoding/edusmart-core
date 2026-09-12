import { createFileRoute } from "@tanstack/react-router";
import { StudentSchedulePage } from "@/components/student-portal/student-portal-ui";

export const Route = createFileRoute("/_authenticated/student/schedule")({
  component: StudentSchedulePage,
  head: () => ({
    meta: [
      { title: "Schedule · Student Portal · EduSmart SchoolOS" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
