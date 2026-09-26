import { createFileRoute } from "@tanstack/react-router";
import { FinanceDashboard } from "@/components/finance/finance-ui";

export const Route = createFileRoute("/_authenticated/finance/")({ component: FinanceDashboard });
