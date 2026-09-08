import { createFileRoute } from "@tanstack/react-router";
import { PortalOverviewPage } from "@/components/portal/portal-ui";

export const Route = createFileRoute("/_authenticated/portal/")({
  component: PortalOverviewPage,
  head: () => ({
    meta: [{ title: "Parent Portal · EduSmart SchoolOS" }, { name: "robots", content: "noindex" }],
  }),
});
