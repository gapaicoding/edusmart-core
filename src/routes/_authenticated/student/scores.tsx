import { createFileRoute } from "@tanstack/react-router";
import { StudentScoresPage } from "@/components/student-portal/student-portal-ui";

export const Route = createFileRoute("/_authenticated/student/scores")({
  component: StudentScoresPage,
  head: () => ({
    meta: [
      { title: "Scores · Student Portal · EduSmart SchoolOS" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
