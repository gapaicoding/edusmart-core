import { createFileRoute } from "@tanstack/react-router";
import { ParentBilling } from "@/components/finance/finance-ui";

export const Route = createFileRoute("/_authenticated/portal/billing")({
  component: ParentBilling,
});
