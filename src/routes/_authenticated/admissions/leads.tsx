import { createFileRoute } from "@tanstack/react-router";
import { AdmissionLeadsWorkspace } from "@/components/admissions/admission-leads-ui";

export const Route = createFileRoute("/_authenticated/admissions/leads")({
  component: AdmissionLeadsWorkspace,
});
