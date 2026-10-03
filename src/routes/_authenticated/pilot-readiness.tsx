import { createFileRoute } from "@tanstack/react-router";
import { PilotReadinessPage } from "@/components/pilot-readiness/pilot-readiness-page";

export const Route = createFileRoute("/_authenticated/pilot-readiness")({
  component: PilotReadinessPage,
});
