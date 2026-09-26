import { createFileRoute } from "@tanstack/react-router";
import { FinanceBilling } from "@/components/finance/finance-ui";

export const Route = createFileRoute("/_authenticated/finance/billing")({
  component: FinanceBilling,
});
