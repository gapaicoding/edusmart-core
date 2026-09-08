import { createFileRoute } from "@tanstack/react-router";
import { PortalSchedulePage } from "@/components/portal/portal-ui";

export const Route = createFileRoute("/_authenticated/portal/schedule")({
  component: PortalSchedulePage,
  head: () => ({
    meta: [
      { title: "Schedule · Parent Portal · EduSmart SchoolOS" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
