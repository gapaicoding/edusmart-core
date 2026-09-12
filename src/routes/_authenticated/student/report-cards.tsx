import { createFileRoute } from "@tanstack/react-router";
import { StudentReportCardsPage } from "@/components/student-portal/student-portal-ui";

export const Route = createFileRoute("/_authenticated/student/report-cards")({
  component: StudentReportCardsPage,
  head: () => ({
    meta: [
      { title: "Report Cards · Student Portal · EduSmart SchoolOS" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
