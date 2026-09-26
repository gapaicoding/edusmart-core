import { createFileRoute } from "@tanstack/react-router";
import { FinanceFees } from "@/components/finance/finance-ui";

export const Route = createFileRoute("/_authenticated/finance/fees")({ component: FinanceFees });
