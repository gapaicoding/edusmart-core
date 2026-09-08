import { createFileRoute } from "@tanstack/react-router";
import { SchedulePage } from "@/components/schedule/schedule-ui";

export const Route = createFileRoute("/_authenticated/schedule/my")({
  component: () => <SchedulePage mine />,
  head: () => ({ meta: [{ title: "My Schedule · EduSmart SchoolOS" }, { name: "description", content: "The signed-in teacher's weekly teaching schedule." }] }),
});
