import { createFileRoute } from "@tanstack/react-router";
import { AssessmentsPage } from "@/components/assessment/assessment-gradebook-ui";

export const Route = createFileRoute("/_authenticated/assessments/")({
  component: AssessmentsPage,
  head: () => ({ meta: [{ title: "Assessments · EduSmart SchoolOS" }] }),
});
