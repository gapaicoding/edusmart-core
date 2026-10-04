import { Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PermissionGate, useAppContext } from "@/lib/app-context";
import {
  formatPreferredDate,
  formatPreferredNumber,
  translateUiText,
  useAppPreferences,
} from "@/lib/app-preferences";
import {
  archiveFinanceFeeDefinition,
  createFinanceBillingPlan,
  createFinanceBillingPlanVersion,
  createFinanceFeeDefinition,
  generateFinanceInvoice,
  getFinanceBillingPlan,
  getFinanceInvoice,
  getFinanceSummary,
  issueFinanceInvoice,
  listFinanceBillingPlanTargets,
  listFinanceBillingPlanVersions,
  listFinanceBillingPlans,
  listFinanceFees,
  listFinanceInvoices,
  listFinancePayments,
  listParentBilling,
  recordFinancePayment,
  reverseFinancePayment,
  updateFinanceFeeDefinition,
  voidFinanceInvoice,
} from "@/lib/finance.functions";
import {
  listInvoiceOnlinePaymentIntents,
  simulateDevelopmentPaymentEvent,
} from "@/lib/online-payments.functions";
import {
  createParentMidtransQris,
  getParentMidtransQris,
  listInvoiceMidtransQris,
  refreshParentMidtransQris,
} from "@/lib/midtrans-qris.functions";

// Runtime projections are normalized at this boundary because the RPC payloads are versioned database projections.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value : []);
const row = (value: unknown): Row => (value && typeof value === "object" ? (value as Row) : {});
const idr = (value: unknown) => "Rp" + formatPreferredNumber(Number(value ?? 0));
const requestId = () => crypto.randomUUID();
const errorText = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Finance request failed.";
  if (/FORBIDDEN|forbidden/i.test(message)) return "You do not have access to this Finance action.";
  if (/STALE|stale/i.test(message))
    return "This record changed since it was loaded. Refresh and try again.";
  if (/OVER|ALLOCATION|already paid/i.test(message))
    return "The payment exceeds the current outstanding balance.";
  if (/CLOSED_PERIOD|closed period/i.test(message))
    return "This billing period is closed and cannot accept a new charge.";
  if (/DUPLICATE|CONFLICT/i.test(message))
    return "This request was already processed or conflicts with an earlier request.";
  if (/INVALID_STATE|already/i.test(message))
    return "This Finance record is no longer in a valid state for that action.";
  return "Finance could not complete the request. Please try again.";
};

function Page({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { locale } = useAppPreferences();
  return (
    <AppShell>
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold">{translateUiText(title, locale)}</h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{translateUiText(description, locale)}</p>
          ) : null}
        </div>
        {children}
      </div>
    </AppShell>
  );
}

function StaffGate({ children }: { children: ReactNode }) {
  const { hasPermission } = useAppContext();
  const { t } = useAppPreferences();
  if (!hasPermission("finance.read"))
    return (
      <Page title={t("finance.title")}>
        <Card>
          <CardContent className="p-6">
            You do not have Finance visibility for the active school.
          </CardContent>
        </Card>
      </Page>
    );
  return <>{children}</>;
}

function useSchool() {
  const { activeSchool } = useAppContext();
  return activeSchool?.id ?? "";
}

function AsyncError({ error }: { error: unknown }) {
  const { locale } = useAppPreferences();
  return error ? (
    <p className="text-sm text-destructive">{translateUiText(errorText(error), locale)}</p>
  ) : null;
}

function InvoiceTable({ schoolId, rows: initialRows }: { schoolId: string; rows: Row[] }) {
  const { locale } = useAppPreferences();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">{translateUiText("Invoice", locale)}</th>
            <th className="p-2">{translateUiText("Student", locale)}</th>
            <th className="p-2">{translateUiText("Total", locale)}</th>
            <th className="p-2">{translateUiText("Outstanding", locale)}</th>
            <th className="p-2">{translateUiText("Status", locale)}</th>
          </tr>
        </thead>
        <tbody>
          {initialRows.map((item) =>
            (() => {
              const settlement = row(item.settlement);
              return (
                <tr className="border-b" key={String(item.id ?? item.invoice_id)}>
                  <td className="p-2">
                    <Link
                      className="text-primary underline"
                      to="/finance/invoices/$invoiceId"
                      params={{ invoiceId: String(item.id ?? item.invoice_id) }}
                    >
                      {String(item.invoice_number ?? item.invoiceNumber ?? "—")}
                    </Link>
                  </td>
                  <td className="p-2">
                    {String(item.student_name ?? item.student_display_name ?? "—")}
                  </td>
                  <td className="p-2">
                    {idr(settlement.invoice_total ?? item.invoice_total ?? item.total_amount)}
                  </td>
                  <td className="p-2">
                    {idr(settlement.outstanding ?? item.outstanding_amount ?? item.outstanding)}
                  </td>
                  <td className="p-2">
                    <Badge variant="outline">
                      {String(
                        item.document_status === "void"
                          ? "void"
                          : (settlement.settlement ??
                              item.settlement_status ??
                              item.document_status ??
                              "—"),
                      )}
                    </Badge>
                  </td>
                </tr>
              );
            })(),
          )}
        </tbody>
      </table>
      {initialRows.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No invoices for this school or period.</p>
      ) : null}
    </div>
  );
}

export function FinanceDashboard() {
  const schoolId = useSchool();
  const { t } = useAppPreferences();
  const summaryFn = useServerFn(getFinanceSummary);
  const invoicesFn = useServerFn(listFinanceInvoices);
  const summaryQuery = useQuery({
    queryKey: ["b19-finance-summary", schoolId],
    queryFn: () => summaryFn({ data: { schoolId } }),
    enabled: Boolean(schoolId),
  });
  const invoicesQuery = useQuery({
    queryKey: ["b19-finance-invoices", schoolId],
    queryFn: () => invoicesFn({ data: { schoolId, limit: 50, offset: 0 } }),
    enabled: Boolean(schoolId),
  });
  const summary = row(summaryQuery.data);
  const invoiceRows = rows(invoicesQuery.data);
  const error = summaryQuery.error ?? invoicesQuery.error;
  return (
    <StaffGate>
      <Page title={t("finance.title")} description={t("finance.description")}>
        <AsyncError error={error} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              t("finance.issued"),
              summary.issued_total ?? summary.issued_amount ?? summary.issuedAmount,
            ],
            [
              t("finance.collected"),
              summary.collected_total ?? summary.collected_amount ?? summary.collectedAmount,
            ],
            [
              t("finance.outstanding"),
              summary.outstanding_total ?? summary.outstanding_amount ?? summary.outstanding,
            ],
            [t("finance.overdue"), summary.overdue_amount ?? summary.overdueAmount],
          ].map(([label, value]) => (
            <Card key={String(label)}>
              <CardHeader>
                <CardTitle className="text-sm">{label}</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">{idr(value)}</CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("finance.receivables")}</CardTitle>
          </CardHeader>
          <CardContent>
            <InvoiceTable schoolId={schoolId} rows={invoiceRows} />
          </CardContent>
        </Card>
      </Page>
    </StaffGate>
  );
}

export function FinanceFees() {
  const { locale } = useAppPreferences();
  const schoolId = useSchool();
  const { activeAcademicYear } = useAppContext();
  const listFeesFn = useServerFn(listFinanceFees);
  const listPlansFn = useServerFn(listFinanceBillingPlans);
  const createFeeFn = useServerFn(createFinanceFeeDefinition);
  const archiveFeeFn = useServerFn(archiveFinanceFeeDefinition);
  const createPlanFn = useServerFn(createFinanceBillingPlan);
  const createVersionFn = useServerFn(createFinanceBillingPlanVersion);
  const feesQuery = useQuery({
    queryKey: ["b19-finance-fees", schoolId],
    queryFn: () => listFeesFn({ data: { schoolId, limit: 100, offset: 0 } }),
    enabled: Boolean(schoolId),
  });
  const plansQuery = useQuery({
    queryKey: ["b19-finance-plans", schoolId],
    queryFn: () => listPlansFn({ data: { schoolId, limit: 100, offset: 0 } }),
    enabled: Boolean(schoolId),
  });
  const fees = rows(feesQuery.data);
  const plans = rows(plansQuery.data);
  const [mutationError, setMutationError] = useState<unknown>(null);
  const error = feesQuery.error ?? plansQuery.error ?? mutationError;
  const [feeForm, setFeeForm] = useState({ code: "", name: "", amount: "", frequency: "monthly" });
  const [planForm, setPlanForm] = useState({ code: "", name: "", feeId: "" });
  const reload = () => {
    void Promise.all([feesQuery.refetch(), plansQuery.refetch()]);
  };
  const createFee = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createFeeFn({
        data: {
          requestId: requestId(),
          schoolId,
          code: feeForm.code,
          name: feeForm.name,
          amountIdr: Number(feeForm.amount),
          chargeKind: feeForm.frequency as "monthly" | "one_time",
        },
      });
      setFeeForm({ code: "", name: "", amount: "", frequency: "monthly" });
      reload();
    } catch (e) {
      setMutationError(e);
    }
  };
  const createPlan = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createPlanFn({
        data: {
          requestId: requestId(),
          schoolId,
          code: planForm.code,
          name: planForm.name,
        },
      });
      setPlanForm({ code: "", name: "", feeId: "" });
      reload();
    } catch (e) {
      setMutationError(e);
    }
  };
  return (
    <StaffGate>
      <Page
        title="Fees & billing plans"
        description="Manage school fee definitions and immutable billing rule versions."
      >
        <AsyncError error={error} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>New fee</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={createFee}>
                <Input
                  aria-label="Fee code"
                  placeholder="Code"
                  value={feeForm.code}
                  onChange={(e) => setFeeForm({ ...feeForm, code: e.target.value })}
                />
                <Input
                  aria-label="Fee name"
                  placeholder="Name"
                  value={feeForm.name}
                  onChange={(e) => setFeeForm({ ...feeForm, name: e.target.value })}
                />
                <Input
                  aria-label="Amount in rupiah"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Amount (IDR)"
                  value={feeForm.amount}
                  onChange={(e) => setFeeForm({ ...feeForm, amount: e.target.value })}
                />
                <select
                  className="h-10 w-full rounded-md border bg-background px-3"
                  aria-label={translateUiText("Frequency", locale)}
                  value={feeForm.frequency}
                  onChange={(e) => setFeeForm({ ...feeForm, frequency: e.target.value })}
                >
                  <option value="monthly">{translateUiText("Monthly", locale)}</option>
                  <option value="one_time">{translateUiText("One-time", locale)}</option>
                </select>
                <PermissionGate permission="finance.manage_fees">
                  <Button type="submit">Create fee</Button>
                </PermissionGate>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>New billing plan</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={createPlan}>
                <Input
                  aria-label="Plan code"
                  placeholder="Plan code"
                  value={planForm.code}
                  onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })}
                />
                <Input
                  aria-label="Plan name"
                  placeholder="Plan name"
                  value={planForm.name}
                  onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                />
                <select
                  className="h-10 w-full rounded-md border bg-background px-3"
                  aria-label={translateUiText("Source fee", locale)}
                  value={planForm.feeId}
                  onChange={(e) => setPlanForm({ ...planForm, feeId: e.target.value })}
                >
                  <option value="">{translateUiText("Select source fee", locale)}</option>
                  {fees.map((fee) => (
                    <option key={String(fee.id ?? fee.fee_id)} value={String(fee.id ?? fee.fee_id)}>
                      {String(fee.code ?? fee.fee_code)} — {String(fee.name ?? fee.fee_name)}
                    </option>
                  ))}
                </select>
                <PermissionGate permission="finance.manage_billing">
                  <Button type="submit">Create plan</Button>
                </PermissionGate>
              </form>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Fee catalog</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {fees.map((fee) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-3"
                  key={String(fee.id ?? fee.fee_id)}
                >
                  <div>
                    <p className="font-medium">
                      {String(fee.name ?? fee.fee_name)}{" "}
                      <span className="text-xs text-muted-foreground">
                        {String(fee.code ?? fee.fee_code)}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {idr(
                        fee.amount_idr ??
                          fee.default_amount_idr ??
                          fee.amount ??
                          fee.default_amount,
                      )}{" "}
                      · {String(fee.frequency ?? fee.charge_kind)}
                    </p>
                  </div>
                  <PermissionGate permission="finance.manage_fees">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void archiveFeeFn({
                          data: {
                            requestId: requestId(),
                            schoolId,
                            feeId: String(fee.id ?? fee.fee_id),
                            expectedRowVersion: Number(fee.row_version ?? 1),
                          },
                        })
                          .then(reload)
                          .catch(setMutationError)
                      }
                    >
                      Archive
                    </Button>
                  </PermissionGate>
                </div>
              ))}
              {fees.length === 0 ? (
                <p className="text-sm text-muted-foreground">No fees configured.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Billing plans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {plans.map((plan) => (
                <PlanCard
                  key={String(plan.id ?? plan.billing_plan_id)}
                  schoolId={schoolId}
                  plan={plan}
                  fees={fees}
                  academicYearId={activeAcademicYear?.id ?? ""}
                  createVersionFn={createVersionFn}
                />
              ))}
            </div>
            {plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No billing plans configured.</p>
            ) : null}
          </CardContent>
        </Card>
      </Page>
    </StaffGate>
  );
}

function PlanCard({
  schoolId,
  plan,
  fees,
  academicYearId,
  createVersionFn,
}: {
  schoolId: string;
  plan: Row;
  fees: Row[];
  academicYearId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createVersionFn: any;
}) {
  const { locale } = useAppPreferences();
  const planId = String(plan.id ?? plan.billing_plan_id);
  const versionsFn = useServerFn(listFinanceBillingPlanVersions);
  const targetsFn = useServerFn(listFinanceBillingPlanTargets);
  const versionsQuery = useQuery({
    queryKey: ["b19-finance-plan-versions", schoolId, planId],
    queryFn: () => versionsFn({ data: { schoolId, billingPlanId: planId, limit: 20, offset: 0 } }),
    enabled: Boolean(schoolId && planId),
  });
  const versions = rows(versionsQuery.data);
  const targetsQuery = useQuery({
    queryKey: [
      "b19-finance-plan-targets",
      schoolId,
      versions[0]?.id ?? versions[0]?.billing_plan_version_id,
    ],
    queryFn: () =>
      targetsFn({
        data: {
          schoolId,
          billingPlanVersionId: String(versions[0]?.id ?? versions[0]?.billing_plan_version_id),
          limit: 20,
          offset: 0,
        },
      }),
    enabled: Boolean(versions[0]?.id ?? versions[0]?.billing_plan_version_id),
  });
  const targets = rows(targetsQuery.data);
  const [message, setMessage] = useState("");
  const [feeDefinitionId, setFeeDefinitionId] = useState(
    String(fees[0]?.id ?? fees[0]?.fee_id ?? ""),
  );
  const reload = () => {
    void versionsQuery.refetch();
    void targetsQuery.refetch();
  };
  const addVersion = async () => {
    if (!academicYearId) return;
    try {
      await createVersionFn({
        data: {
          requestId: requestId(),
          schoolId,
          billingPlanId: planId,
          feeDefinitionId,
          academicYearId,
          targetType: "school",
        },
      });
      setMessage("Version created");
      reload();
    } catch (e) {
      setMessage(errorText(e));
    }
  };
  return (
    <div className="rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {String(plan.name ?? plan.plan_name)}{" "}
            <span className="text-xs text-muted-foreground">
              {String(plan.code ?? plan.plan_code)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {translateUiText("Stable plan identity", locale)} · {versions.length}{" "}
            {translateUiText("version(s)", locale)}
          </p>
        </div>
        <PermissionGate permission="finance.manage_billing">
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label={translateUiText("Version source fee", locale)}
            value={feeDefinitionId}
            onChange={(event) => setFeeDefinitionId(event.target.value)}
          >
            <option value="">{translateUiText("Select fee", locale)}</option>
            {fees.map((fee) => (
              <option key={String(fee.id ?? fee.fee_id)} value={String(fee.id ?? fee.fee_id)}>
                {String(fee.code ?? fee.fee_code)}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={!feeDefinitionId}
            onClick={() => void addVersion()}
          >
            {translateUiText("Create version", locale)}
          </Button>
        </PermissionGate>
      </div>
      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
      <div className="mt-3 space-y-2">
        {versions.map((version) => (
          <div
            className="rounded border bg-muted/30 p-3 text-sm"
            key={String(version.id ?? version.billing_plan_version_id)}
          >
            <div className="flex flex-wrap justify-between gap-2">
              <span>
                {translateUiText("Version", locale)}{" "}
                {String(version.version_number ?? version.version_no ?? "—")}
              </span>
              <span>
                {idr(version.amount_idr ?? version.amount ?? version.snapshot_amount)} ·{" "}
                {String(
                  version.charge_kind ?? version.frequency ?? version.snapshot_frequency ?? "—",
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {translateUiText("Target", locale)}:{" "}
              {translateUiText(String(version.target_type ?? "school"), locale)} ·{" "}
              {translateUiText("immutable snapshot", locale)}
            </p>
            <p className="text-xs text-muted-foreground">
              {translateUiText("Bounded target rows:", locale)} {targets.length}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinanceBilling() {
  const { locale } = useAppPreferences();
  const schoolId = useSchool();
  const plansFn = useServerFn(listFinanceBillingPlans);
  const versionsFn = useServerFn(listFinanceBillingPlanVersions);
  const generateFn = useServerFn(generateFinanceInvoice);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [selectedVersion, setSelectedVersion] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [period, setPeriod] = useState("");
  const [message, setMessage] = useState("");
  const plansQuery = useQuery({
    queryKey: ["b19-finance-billing-plans", schoolId],
    queryFn: () => plansFn({ data: { schoolId, limit: 100, offset: 0 } }),
    enabled: Boolean(schoolId),
  });
  const versionsQuery = useQuery({
    queryKey: ["b19-finance-billing-versions", schoolId, selectedPlan],
    queryFn: () =>
      versionsFn({ data: { schoolId, billingPlanId: selectedPlan, limit: 100, offset: 0 } }),
    enabled: Boolean(schoolId && selectedPlan),
  });
  const plans = rows(plansQuery.data);
  const versions = rows(versionsQuery.data);
  const [mutationError, setMutationError] = useState<unknown>(null);
  const error = plansQuery.error ?? versionsQuery.error ?? mutationError;
  const generate = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    try {
      const result = await generateFn({
        data: {
          requestId: requestId(),
          schoolId,
          planVersionId: selectedVersion,
          studentEnrollmentId: enrollmentId,
          billingPeriodKey: period,
        },
      });
      setMessage(
        "Invoice generated successfully. " +
          String(row(result).invoice_number ?? row(result).invoiceNumber ?? ""),
      );
    } catch (e) {
      setMutationError(e);
    }
  };
  return (
    <StaffGate>
      <Page
        title="Billing generation"
        description="Generate one bounded invoice from an immutable plan version."
      >
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-muted-foreground">
              The server resolves the student, school, amount, and invoice number. This screen does
              not loop in the browser.
            </p>
            <AsyncError error={error} />
            <form className="space-y-4" onSubmit={generate}>
              <div>
                <Label htmlFor="billing-plan-select">
                  {translateUiText("Billing plan", locale)}
                </Label>
                <select
                  id="billing-plan-select"
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                  value={selectedPlan}
                  onChange={(e) => {
                    setSelectedPlan(e.target.value);
                    setSelectedVersion("");
                  }}
                >
                  <option value="">{translateUiText("Select plan", locale)}</option>
                  {plans.map((p) => (
                    <option
                      key={String(p.id ?? p.billing_plan_id)}
                      value={String(p.id ?? p.billing_plan_id)}
                    >
                      {String(p.name ?? p.plan_name)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="billing-plan-version-select">
                  {translateUiText("Immutable plan version", locale)}
                </Label>
                <select
                  id="billing-plan-version-select"
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                  value={selectedVersion}
                  onChange={(e) => setSelectedVersion(e.target.value)}
                >
                  <option value="">{translateUiText("Select version", locale)}</option>
                  {versions.map((v) => (
                    <option
                      key={String(v.id ?? v.billing_plan_version_id)}
                      value={String(v.id ?? v.billing_plan_version_id)}
                    >
                      v{String(v.version_number ?? v.version_no)} ·{" "}
                      {idr(v.amount ?? v.snapshot_amount)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Canonical StudentEnrollment ID</Label>
                <Input
                  value={enrollmentId}
                  onChange={(e) => setEnrollmentId(e.target.value)}
                  placeholder="UUID from the bounded QA/approved roster"
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Only the server-authorized enrollment is used; tenant and student identity are not
                  caller-controlled.
                </p>
              </div>
              <div>
                <Label>Billing period</Label>
                <Input
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  placeholder="YYYY-MM or ONE_TIME"
                  required
                />
              </div>
              <PermissionGate permission="finance.manage_billing">
                <Button type="submit" disabled={!selectedVersion}>
                  Generate invoice
                </Button>
              </PermissionGate>
            </form>
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          </CardContent>
        </Card>
      </Page>
    </StaffGate>
  );
}

function PaymentForm({
  invoice,
  schoolId,
  onDone,
}: {
  invoice: Row;
  schoolId: string;
  onDone: () => void;
}) {
  const paymentFn = useServerFn(recordFinancePayment);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await paymentFn({
        data: {
          requestId: requestId(),
          schoolId,
          invoiceId: String(invoice.id ?? invoice.invoice_id),
          amountIdr: Number(amount),
          receivedAt: new Date().toISOString(),
          method: "bank_transfer",
          manualReference: undefined,
          note: undefined,
        },
      });
      setMessage("Payment recorded");
      setAmount("");
      onDone();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Record manual payment</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          This records an offline payment received by the school. It is not a gateway or online
          checkout.
        </p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
          <div>
            <Label>Amount (IDR)</Label>
            <Input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <PermissionGate permission="finance.record_payment">
            <Button type="submit">Record payment</Button>
          </PermissionGate>
        </form>
        <AsyncError error={error} />
        {message ? <p className="mt-2 text-sm text-emerald-700">{message}</p> : null}
      </CardContent>
    </Card>
  );
}

function onlineStatusKey(status: string) {
  switch (status) {
    case "pending":
      return "payment.online.pending";
    case "settled":
      return "payment.online.settled";
    case "expired":
      return "payment.online.expired";
    case "failed":
      return "payment.online.failedStatus";
    case "cancelled":
      return "payment.online.cancelled";
    case "review_required":
      return "payment.online.reviewRequired";
    default:
      return "payment.online.unavailable";
  }
}

function ParentOnlinePaymentPanel({
  invoiceId,
  documentStatus,
  outstanding,
}: {
  invoiceId: string;
  documentStatus: string;
  outstanding: number;
}) {
  const { t } = useAppPreferences();
  const getFn = useServerFn(getParentMidtransQris);
  const createFn = useServerFn(createParentMidtransQris);
  const refreshFn = useServerFn(refreshParentMidtransQris);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const developmentMode = import.meta.env.DEV;
  const query = useQuery({
    queryKey: ["b27-parent-midtrans-qris", invoiceId],
    queryFn: () => getFn({ data: { invoiceId } }),
    enabled: developmentMode && Boolean(invoiceId),
  });
  const intent = row(query.data);
  const status = String(intent.status ?? "");
  const hasExpired = Boolean(
    intent.expires_at && Date.parse(String(intent.expires_at)) <= Date.now(),
  );
  const displayStatus = status === "pending" && hasExpired ? "expired" : status;
  const canRetry = !status || hasExpired || ["expired", "failed", "cancelled"].includes(status);
  const canCreate = developmentMode && documentStatus === "issued" && outstanding > 0 && canRetry;

  const createIntent = async () => {
    setBusy(true);
    setError(false);
    try {
      await createFn({ data: { invoiceId, requestId: requestId() } });
      await query.refetch();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const refreshStatus = async () => {
    setBusy(true);
    setError(false);
    try {
      if (typeof intent.order_id === "string") {
        await refreshFn({ data: { orderId: intent.order_id } });
      }
      await query.refetch();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="w-full min-w-0 border-t pt-3"
      aria-labelledby={`online-payment-${invoiceId}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`online-payment-${invoiceId}`} className="font-medium">
            {t("payment.qris.title")}
          </h3>
          {developmentMode ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t("payment.qris.sandbox")}</Badge>
              <p className="text-xs text-muted-foreground">{t("payment.qris.noRealMoney")}</p>
            </div>
          ) : null}
          {status ? (
            <p className="break-words text-sm" aria-live="polite">
              {t(
                displayStatus === "settled"
                  ? "payment.online.settled"
                  : onlineStatusKey(displayStatus),
              )}
              {intent.amount_idr != null ? ` · ${idr(intent.amount_idr)}` : ""}
            </p>
          ) : null}
          {intent.expires_at ? (
            <p className="break-words text-xs text-muted-foreground">
              {t("payment.online.expires")}:{" "}
              {formatPreferredDate(String(intent.expires_at), {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {t("payment.online.createError")}
            </p>
          ) : null}
          {typeof intent.qr_content === "string" && status === "pending" && !hasExpired ? (
            <div className="mt-3 grid w-fit gap-2 rounded-md border bg-background p-3">
              <QRCodeSVG
                value={intent.qr_content}
                size={192}
                level="M"
                title={t("payment.qris.qrAccessibleName")}
              />
              <p className="max-w-48 break-words text-xs text-muted-foreground">
                {t("payment.qris.scanSandbox")}
              </p>
            </div>
          ) : null}
          {developmentMode ? (
            <p className="mt-2 text-xs text-muted-foreground">{t("payment.qris.manualFallback")}</p>
          ) : null}
        </div>
        {canCreate ? (
          <Button onClick={() => void createIntent()} disabled={busy || query.isFetching}>
            {busy ? t("common.saving") : t("payment.qris.pay")}
          </Button>
        ) : null}
        {developmentMode && status && !canCreate ? (
          <Button
            variant="outline"
            onClick={() => void refreshStatus()}
            disabled={busy || query.isFetching}
          >
            {busy ? t("common.saving") : t("payment.qris.refresh")}
          </Button>
        ) : null}
        {!developmentMode ? (
          <Badge variant="outline">{t("payment.qris.disabledOutsideDevelopment")}</Badge>
        ) : null}
      </div>
    </section>
  );
}

function StaffOnlinePaymentPanel({
  schoolId,
  invoiceId,
  onDone,
}: {
  schoolId: string;
  invoiceId: string;
  onDone: () => void;
}) {
  const { t } = useAppPreferences();
  const { hasPermission } = useAppContext();
  const listFn = useServerFn(listInvoiceOnlinePaymentIntents);
  const listQrisFn = useServerFn(listInvoiceMidtransQris);
  const eventFn = useServerFn(simulateDevelopmentPaymentEvent);
  const [busyIntent, setBusyIntent] = useState("");
  const [error, setError] = useState(false);
  const developmentMode = import.meta.env.DEV;
  const canRead = hasPermission("finance.read");
  const canManage = hasPermission("finance.record_payment");
  const query = useQuery({
    queryKey: ["b24-finance-invoice-payment-intents", schoolId, invoiceId],
    queryFn: () => listFn({ data: { schoolId, invoiceId } }),
    enabled: Boolean(developmentMode && canManage && schoolId && invoiceId),
  });
  const qrisQuery = useQuery({
    queryKey: ["b27-finance-invoice-qris", schoolId, invoiceId],
    queryFn: () => listQrisFn({ data: { schoolId, invoiceId } }),
    enabled: Boolean(canRead && schoolId && invoiceId),
  });
  const intents = rows(query.data);
  const qrisProjection = row(qrisQuery.data);
  const qrisOrders = rows(qrisProjection.orders);
  const providerAvailability = String(qrisProjection.providerAvailability ?? "DISABLED");

  const recordEvent = async (
    intent: Row,
    eventType: "pending" | "settled" | "expired" | "failed",
  ) => {
    const intentId = String(intent.intent_id ?? "");
    setBusyIntent(intentId);
    setError(false);
    try {
      await eventFn({
        data: { intentId, eventType, requestId: requestId() },
      });
      await query.refetch();
      onDone();
    } catch {
      setError(true);
    } finally {
      setBusyIntent("");
    }
  };

  if (!canRead) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("payment.online.title")}</CardTitle>
        {developmentMode ? (
          <p className="text-sm text-muted-foreground">{t("payment.online.developmentOnly")}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {t("payment.online.operationError")}
          </p>
        ) : null}
        {intents.map((intent) => {
          const intentId = String(intent.intent_id ?? "");
          const status = String(intent.status ?? "");
          return (
            <div className="min-w-0 space-y-2 border-b pb-3" key={intentId}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="outline">{t(onlineStatusKey(status))}</Badge>
                <span className="font-medium">{idr(intent.amount_idr)}</span>
              </div>
              {intent.provider_reference ? (
                <p className="break-all text-xs text-muted-foreground">
                  {String(intent.provider_reference)}
                </p>
              ) : null}
              {intent.exception_code ? (
                <p className="text-sm text-destructive">{t("payment.online.reviewRequired")}</p>
              ) : null}
              {developmentMode && status === "pending" ? (
                <div className="flex flex-wrap gap-2">
                  {(["pending", "settled", "expired", "failed"] as const).map((eventType) => (
                    <Button
                      key={eventType}
                      size="sm"
                      variant={eventType === "settled" ? "default" : "outline"}
                      disabled={busyIntent === intentId}
                      onClick={() => void recordEvent(intent, eventType)}
                    >
                      {t(`payment.online.event.${eventType}`)}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {qrisOrders.map((order) => (
          <div className="min-w-0 space-y-2 border-t pt-3" key={String(order.order_id)}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t("payment.qris.sandbox")}</Badge>
              <Badge variant="outline">{t(onlineStatusKey(String(order.status ?? "")))}</Badge>
              <span className="font-medium">{idr(order.amount_idr)}</span>
            </div>
            {order.expires_at ? (
              <p className="text-xs text-muted-foreground">
                {t("payment.online.expires")}:{" "}
                {formatPreferredDate(String(order.expires_at), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            ) : null}
            {order.exception_code || order.safe_error_code ? (
              <p className="text-sm text-muted-foreground">{t("payment.online.reviewRequired")}</p>
            ) : null}
          </div>
        ))}
        {qrisOrders.length === 0 ? (
          <div className="space-y-1 rounded-md border p-3 text-sm" role="status">
            <Badge variant="outline">{t("payment.qris.sandbox")}</Badge>
            <p className="font-medium">
              {t(
                providerAvailability === "CONFIGURED"
                  ? "payment.qris.configured"
                  : providerAvailability === "DISABLED"
                    ? "payment.qris.disabledOutsideDevelopment"
                    : "payment.qris.notConfigured",
              )}
            </p>
            <p className="text-muted-foreground">{t("payment.qris.noRealMoney")}</p>
            <p className="text-muted-foreground">{t("payment.qris.manualFallback")}</p>
          </div>
        ) : null}
        {intents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("payment.online.noIntent")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function FinanceInvoiceDetail() {
  const { locale } = useAppPreferences();
  const schoolId = useSchool();
  const { invoiceId } = useParams({ strict: false }) as { invoiceId: string };
  const getFn = useServerFn(getFinanceInvoice);
  const issueFn = useServerFn(issueFinanceInvoice);
  const voidFn = useServerFn(voidFinanceInvoice);
  const reverseFn = useServerFn(reverseFinancePayment);
  const invoiceQuery = useQuery({
    queryKey: ["b19-finance-invoice", schoolId, invoiceId],
    queryFn: () => getFn({ data: { schoolId, invoiceId } }),
    enabled: Boolean(schoolId && invoiceId),
  });
  const invoiceResult = row(invoiceQuery.data);
  const invoice = row(invoiceResult.invoice ?? invoiceResult);
  const settlement = row(invoiceResult.settlement ?? invoice.settlement);
  const [mutationError, setMutationError] = useState<unknown>(null);
  const error = invoiceQuery.error ?? mutationError;
  const [message, setMessage] = useState("");
  const reload = () => {
    void invoiceQuery.refetch();
  };
  const transition = async (kind: "issue" | "void") => {
    try {
      const data = {
        requestId: requestId(),
        schoolId,
        invoiceId,
        expectedRowVersion: Number(invoice.row_version ?? invoice.rowVersion ?? 1),
        ...(kind === "void" ? { reason: "Invoice voided by authorized staff" } : {}),
      };
      if (kind === "issue") await issueFn({ data });
      else await voidFn({ data });
      setMessage(kind === "issue" ? "Invoice issued" : "Invoice voided");
      reload();
    } catch (e) {
      setMutationError(e);
    }
  };
  const payments = rows(invoiceResult.payments ?? invoice.payments ?? invoice.payment_history);
  const items = rows(invoiceResult.items ?? invoice.items ?? invoice.invoice_items);
  return (
    <StaffGate>
      <Page title="Invoice detail">
        <AsyncError error={error} />
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                {String(invoice.invoice_number ?? invoice.invoiceNumber ?? "Invoice")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <p>
                  Student:{" "}
                  <strong>
                    {String(
                      invoice.student_name ??
                        invoice.student_display_name ??
                        invoice.student_id ??
                        "—",
                    )}
                  </strong>
                </p>
                <p>
                  Period:{" "}
                  <strong>
                    {String(invoice.billing_period_key ?? invoice.billingPeriodKey ?? "—")}
                  </strong>
                </p>
                <p>
                  Total:{" "}
                  <strong>
                    {idr(settlement.invoice_total ?? invoice.invoice_total ?? invoice.total_amount)}
                  </strong>
                </p>
                <p>
                  {translateUiText("Paid", locale)}:{" "}
                  <strong>
                    {idr(settlement.paid ?? invoice.valid_paid ?? invoice.paid_amount)}
                  </strong>
                </p>
                <p>
                  {translateUiText("Outstanding", locale)}:{" "}
                  <strong>
                    {idr(
                      settlement.outstanding ?? invoice.outstanding_amount ?? invoice.outstanding,
                    )}
                  </strong>
                </p>
                <div>
                  {translateUiText("Document:", locale)}{" "}
                  <Badge variant="outline">{String(invoice.document_status ?? "—")}</Badge>{" "}
                  <Badge variant="secondary">
                    {String(settlement.settlement ?? invoice.settlement_status ?? "unpaid")}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <PermissionGate permission="finance.issue">
                  {String(invoice.document_status) === "draft" ? (
                    <Button onClick={() => void transition("issue")}>Issue invoice</Button>
                  ) : null}
                  {String(invoice.document_status) === "issued" &&
                  Number(settlement.paid ?? invoice.valid_paid ?? invoice.paid_amount ?? 0) ===
                    0 ? (
                    <Button variant="outline" onClick={() => void transition("void")}>
                      Void invoice
                    </Button>
                  ) : null}
                </PermissionGate>
              </div>
              {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
              <h2 className="font-medium">Snapshot items</h2>
              <ul className="space-y-2 text-sm">
                {items.map((item) => (
                  <li
                    className="flex justify-between border-b pb-2"
                    key={String(item.id ?? item.invoice_item_id)}
                  >
                    <span>
                      {String(item.name_snapshot ?? item.name ?? item.fee_name ?? "Item")}
                    </span>
                    <span>{idr(item.line_amount_idr ?? item.line_amount ?? item.amount)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <div className="space-y-6">
            <StaffOnlinePaymentPanel schoolId={schoolId} invoiceId={invoiceId} onDone={reload} />
            <PaymentForm invoice={invoice} schoolId={schoolId} onDone={reload} />
            <Card>
              <CardHeader>
                <CardTitle>Payment history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {payments.map((payment) => (
                  <div
                    className="border-b pb-2 text-sm"
                    key={String(payment.id ?? payment.payment_id)}
                  >
                    <div className="flex justify-between">
                      <span>{idr(payment.amount_idr ?? payment.amount)}</span>
                      <span>
                        {payment.reversed ? "Reversed" : String(payment.method ?? "manual")}
                      </span>
                    </div>
                    {payment.reversed ? (
                      <span className="text-xs text-muted-foreground">
                        Original payment preserved; balance recalculated.
                      </span>
                    ) : (
                      <PermissionGate permission="finance.adjust">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const reason = window.prompt("Reason for full payment reversal");
                            if (reason)
                              void reverseFn({
                                data: {
                                  requestId: requestId(),
                                  schoolId,
                                  paymentId: String(payment.id ?? payment.payment_id),
                                  reason,
                                },
                              })
                                .then(reload)
                                .catch(setMutationError);
                          }}
                        >
                          Reverse payment
                        </Button>
                      </PermissionGate>
                    )}
                  </div>
                ))}
                {payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments recorded.</p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </Page>
    </StaffGate>
  );
}

export function FinancePayments() {
  const { locale } = useAppPreferences();
  const schoolId = useSchool();
  const paymentsFn = useServerFn(listFinancePayments);
  const paymentsQuery = useQuery({
    queryKey: ["b19-finance-payments", schoolId],
    queryFn: () => paymentsFn({ data: { schoolId, limit: 100, offset: 0 } }),
    enabled: Boolean(schoolId),
  });
  const payments = rows(paymentsQuery.data);
  const error = paymentsQuery.error;
  return (
    <StaffGate>
      <Page title="Payments" description="Manual/offline payment history for the active school.">
        <AsyncError error={error} />
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-3">{translateUiText("Received", locale)}</th>
                    <th className="p-3">{translateUiText("Reference", locale)}</th>
                    <th className="p-3">{translateUiText("Amount", locale)}</th>
                    <th className="p-3">{translateUiText("Method", locale)}</th>
                    <th className="p-3">{translateUiText("State", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr className="border-b" key={String(payment.id ?? payment.payment_id)}>
                      <td className="p-3">
                        {(payment.received_at ?? payment.receivedAt)
                          ? formatPreferredDate(String(payment.received_at ?? payment.receivedAt), {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td className="p-3">
                        {String(payment.reference ?? payment.manual_reference ?? "—")}
                      </td>
                      <td className="p-3">{idr(payment.amount_idr ?? payment.amount)}</td>
                      <td className="p-3">
                        {translateUiText(String(payment.method ?? "manual"), locale)}
                      </td>
                      <td className="p-3">
                        {translateUiText(payment.reversed ? "Reversed" : "Valid", locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {payments.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No payments recorded.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </Page>
    </StaffGate>
  );
}

export function ParentBilling() {
  const { hasPermission } = useAppContext();
  const { locale } = useAppPreferences();
  const listFn = useServerFn(listParentBilling);
  const billingQuery = useQuery({
    queryKey: ["b19-parent-billing"],
    queryFn: () => listFn({ data: { limit: 50, offset: 0 } }),
    enabled: hasPermission("finance.portal_read"),
  });
  const invoices = rows(billingQuery.data);
  const error = billingQuery.error;
  if (!hasPermission("finance.portal_read"))
    return (
      <Page title="Billing">
        <Card>
          <CardContent className="p-6">
            {translateUiText("Billing is available only to an authorized related parent.", locale)}
          </CardContent>
        </Card>
      </Page>
    );
  return (
    <Page title="Billing" description="Read-only billing for children related to your account.">
      <AsyncError error={error} />
      <Card>
        <CardHeader>
          <CardTitle>Your children’s invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {invoices.map((item) => {
              const settlement = row(item.settlement);
              return (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"
                  key={String(item.id ?? item.invoice_id)}
                >
                  <div>
                    <p className="font-medium">
                      {String(item.student_name ?? item.child_name ?? "Child")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {String(item.invoice_number ?? "Invoice")} ·{" "}
                      {String(item.billing_period_key ?? "—")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {idr(settlement.outstanding ?? item.outstanding_amount ?? item.outstanding)}
                    </p>
                    <Badge variant="outline">
                      {String(
                        settlement.settlement ??
                          item.settlement_status ??
                          item.document_status ??
                          "—",
                      )}
                    </Badge>
                  </div>
                  <ParentOnlinePaymentPanel
                    invoiceId={String(item.id ?? item.invoice_id ?? "")}
                    documentStatus={String(item.document_status ?? "")}
                    outstanding={Number(
                      settlement.outstanding ?? item.outstanding_amount ?? item.outstanding ?? 0,
                    )}
                  />
                </div>
              );
            })}
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No billing records for your children.</p>
            ) : null}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            This view is read only. Payments, reversals, and staff controls are not available here.
          </p>
        </CardContent>
      </Card>
    </Page>
  );
}
