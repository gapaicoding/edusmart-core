import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/app-shell";
import { useAppContext } from "@/lib/app-context";
import { useAppPreferences } from "@/lib/app-preferences";
import { getPilotReadiness } from "@/lib/pilot-readiness.functions";
import type { ReadinessStatus } from "@/lib/pilot-readiness.schemas";

const statusStyles: Record<ReadinessStatus, string> = {
  READY: "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  WARNING: "border-amber-600/30 bg-amber-600/10 text-amber-900 dark:text-amber-300",
  BLOCKER: "border-destructive/40 bg-destructive/10 text-destructive",
  MANUAL_FALLBACK: "border-sky-600/30 bg-sky-600/10 text-sky-900 dark:text-sky-300",
};

export function PilotReadinessPage() {
  return (
    <AppShell>
      <PilotReadinessContent />
    </AppShell>
  );
}

function PilotReadinessContent() {
  const { activeSchool, contextLoading, hasPermission } = useAppContext();
  const { t, formatDate, formatNumber } = useAppPreferences();
  const translate = (key: string, values?: Record<string, string>) =>
    t(key as Parameters<typeof t>[0], values);
  const fetchReadiness = useServerFn(getPilotReadiness);
  const permitted = hasPermission("school.readiness.read");
  const query = useQuery({
    queryKey: ["pilot-readiness", activeSchool?.id],
    queryFn: () => fetchReadiness({ data: { schoolId: activeSchool!.id } }),
    enabled: Boolean(activeSchool?.id && permitted),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  if (!permitted) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-semibold">{t("pilotReadiness.title")}</h1>
        <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">
          {t("pilotReadiness.denied")}
        </p>
      </div>
    );
  }
  if (contextLoading) return <p role="status">{t("common.loading")}</p>;
  if (!activeSchool) {
    return (
      <p role="status" className="rounded-lg border p-4">
        {t("common.selectSchoolFirst")}
      </p>
    );
  }
  if (query.isPending) return <p role="status">{t("common.loading")}</p>;
  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-semibold">{t("pilotReadiness.title")}</h1>
        <div role="alert" className="rounded-lg border border-destructive/40 p-4">
          <p className="font-medium">{t("pilotReadiness.error")}</p>
          <Button className="mt-3" variant="outline" onClick={() => void query.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      </div>
    );
  }

  const report = query.data;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{report.school.name}</p>
          <h1 className="text-2xl font-semibold">{t("pilotReadiness.title")}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t("pilotReadiness.description")}
          </p>
        </div>
        <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("pilotReadiness.refresh")}
        </Button>
      </header>

      <section aria-labelledby="readiness-summary" className="space-y-3">
        <h2 id="readiness-summary" className="text-lg font-semibold">
          {t("pilotReadiness.overall")}
        </h2>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-muted-foreground">
                {t("pilotReadiness.overallExplanation")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("pilotReadiness.generatedAt", {
                  date: formatDate(report.generatedAt, { dateStyle: "medium", timeStyle: "short" }),
                })}
              </p>
            </div>
            <StatusBadge status={report.overallStatus} t={translate} />
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["READY", "WARNING", "BLOCKER", "MANUAL_FALLBACK"] as const).map((status) => (
            <Card key={status}>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  {translate(`pilotReadiness.status.${status}`)}
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {formatNumber(report.summary[status])}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="readiness-domains" className="space-y-3">
        <h2 id="readiness-domains" className="text-lg font-semibold">
          {t("pilotReadiness.domains")}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {report.domains.map((domain) => (
            <Card key={domain.domainCode}>
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-base">
                  {translate(`pilotReadiness.domain.${domain.domainCode}`)}
                </CardTitle>
                <StatusBadge status={domain.status} t={translate} />
              </CardHeader>
              <CardContent className="space-y-3">
                {domain.checks.map((check) => (
                  <div
                    key={check.checkCode}
                    className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">
                        {translate(`pilotReadiness.check.${check.checkCode}`)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {translate(`pilotReadiness.action.${check.actionCode}`)}
                      </p>
                      {check.count !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          {t("pilotReadiness.count", { count: formatNumber(check.count) })}
                        </p>
                      )}
                      {check.routeHint && (
                        <Link
                          className="inline-flex min-h-8 items-center rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          to={check.routeHint as never}
                        >
                          {t("pilotReadiness.reviewLink")}
                        </Link>
                      )}
                    </div>
                    <StatusBadge status={check.status} t={translate} />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        {t("pilotReadiness.syntheticDisclaimer")}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: ReadinessStatus;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  return (
    <Badge variant="outline" className={statusStyles[status]}>
      {t(`pilotReadiness.status.${status}`)}
    </Badge>
  );
}
