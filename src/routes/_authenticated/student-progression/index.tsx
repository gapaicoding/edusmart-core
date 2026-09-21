import { createFileRoute } from "@tanstack/react-router";
import { StudentProgressionListPage } from "@/components/student-progression/student-progression-ui";

export const Route = createFileRoute("/_authenticated/student-progression/")({
  component: StudentProgressionListPage,
  head: () => ({ meta: [{ title: "Student Progression · EduSmart SchoolOS" }] }),
});
