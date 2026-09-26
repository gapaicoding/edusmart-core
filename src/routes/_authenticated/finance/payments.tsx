import { createFileRoute } from "@tanstack/react-router";
import { FinancePayments } from "@/components/finance/finance-ui";

export const Route = createFileRoute("/_authenticated/finance/payments")({
  component: FinancePayments,
});
