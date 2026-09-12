import { createFileRoute } from "@tanstack/react-router";
import { StudentOverviewPage } from "@/components/student-portal/student-portal-ui";

export const Route = createFileRoute("/_authenticated/student/")({
  component: StudentOverviewPage,
  head: () => ({
    meta: [{ title: "Student Portal · EduSmart SchoolOS" }, { name: "robots", content: "noindex" }],
  }),
});
