import { createFileRoute } from "@tanstack/react-router";
import { PortalScoresPage } from "@/components/portal/portal-ui";

export const Route = createFileRoute("/_authenticated/portal/scores")({
  component: PortalScoresPage,
  head: () => ({
    meta: [
      { title: "Scores · Parent Portal · EduSmart SchoolOS" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
