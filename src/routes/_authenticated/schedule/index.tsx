import { createFileRoute } from "@tanstack/react-router";
import { SchedulePage } from "@/components/schedule/schedule-ui";

export const Route = createFileRoute("/_authenticated/schedule/")({
  component: SchedulePage,
  head: () => ({ meta: [{ title: "Schedule · EduSmart SchoolOS" }, { name: "description", content: "Classroom and teacher weekly schedule planning and publication." }] }),
});
