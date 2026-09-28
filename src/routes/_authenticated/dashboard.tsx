import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, CalendarRange, School } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAppContext } from "@/lib/app-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useAppPreferences } from "@/lib/app-preferences";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — EduSmart SchoolOS" },
      {
        name: "description",
        content:
          "Your EduSmart SchoolOS workspace: active organization, school, academic year and term.",
      },
      { property: "og:title", content: "Dashboard — EduSmart SchoolOS" },
      { property: "og:description", content: "Your EduSmart SchoolOS workspace overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const {
    isLoading,
    contextLoading,
    error,
    refetch,
    organizations,
    activeOrganization,
    activeSchool,
    activeAcademicYear,
    activeTerm,
    academicYears,
    academicLoading,
  } = useAppContext();
  const { t } = useAppPreferences();

  useEffect(() => {
    if (contextLoading || error) return;
    if (organizations.length === 0) {
      navigate({ to: "/access-pending", replace: true });
      return;
    }
    if (!activeOrganization) {
      navigate({ to: "/select-organization", replace: true });
      return;
    }
    if (!activeSchool && activeOrganization.schools.length !== 1) {
      navigate({ to: "/select-school", replace: true });
    }
  }, [contextLoading, error, organizations, activeOrganization, activeSchool, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>We couldn't load your workspace</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={refetch}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || contextLoading || !activeOrganization) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />
        <div className="rounded-lg border border-border bg-card px-5 py-4">
          <p className="text-sm font-medium text-foreground">
            {t("dashboard.welcome")}, {activeOrganization.name}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.workspaceReady")}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {t("dashboard.organization")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{activeOrganization.name}</p>
              <p className="text-xs text-muted-foreground">{activeOrganization.code ?? "—"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <School className="h-4 w-4 text-muted-foreground" />
                {t("dashboard.school")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">
                {activeSchool?.name ?? t("dashboard.noSchool")}
              </p>
              <p className="text-xs text-muted-foreground">{activeSchool?.code ?? "—"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <CalendarRange className="h-4 w-4 text-muted-foreground" />
                {t("dashboard.academicContext")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {academicLoading ? (
                <Skeleton className="h-6 w-32" />
              ) : academicYears.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("dashboard.noYear")}</p>
              ) : (
                <>
                  <p className="text-lg font-semibold">{activeAcademicYear?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeTerm?.name ?? "No term selected"}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
