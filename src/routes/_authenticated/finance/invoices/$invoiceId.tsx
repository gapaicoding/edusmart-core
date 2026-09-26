import { createFileRoute } from "@tanstack/react-router";
import { FinanceInvoiceDetail } from "@/components/finance/finance-ui";

export const Route = createFileRoute("/_authenticated/finance/invoices/$invoiceId")({
  component: FinanceInvoiceDetail,
});
