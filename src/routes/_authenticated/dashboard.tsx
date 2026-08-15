import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, CalendarRange, School, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PermissionGate, useAppContext } from "@/lib/app-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — EduSmart SchoolOS" },
      { name: "description", content: "Your EduSmart SchoolOS workspace: active organization, school, academic year and term." },
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
    error,
    refetch,
    organizations,
    activeOrganization,
    activeSchool,
    activeAcademicYear,
    activeTerm,
    academicYears,
    academicLoading,
    permissions,
  } = useAppContext();

  useEffect(() => {
    if (isLoading || error) return;
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
  }, [isLoading, error, organizations, activeOrganization, activeSchool, navigate]);

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

  if (isLoading || !activeOrganization) {
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
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Foundation shell — module screens arrive in later batches.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Organization
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
                School
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{activeSchool?.name ?? "No school selected"}</p>
              <p className="text-xs text-muted-foreground">{activeSchool?.code ?? "—"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <CalendarRange className="h-4 w-4 text-muted-foreground" />
                Academic context
              </CardTitle>
            </CardHeader>
            <CardContent>
              {academicLoading ? (
                <Skeleton className="h-6 w-32" />
              ) : academicYears.length === 0 ? (
                <p className="text-sm text-muted-foreground">No academic year visible for this school.</p>
              ) : (
                <>
                  <p className="text-lg font-semibold">{activeAcademicYear?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{activeTerm?.name ?? "No term selected"}</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              Your access
            </CardTitle>
            <CardDescription>
              Role grants and permissions shown here drive UI visibility only — the database enforces access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1">
              {activeOrganization.roles.map((role, index) => (
                <Badge key={`${role.code}-${index}`} variant="secondary">
                  {role.name} · {role.scopeType}
                </Badge>
              ))}
              {activeOrganization.roles.length === 0 && (
                <p className="text-sm text-muted-foreground">No active role grants.</p>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <PermissionGate
                permission="membership.read"
                fallback={
                  <Alert>
                    <AlertDescription className="text-xs">
                      People &amp; memberships are hidden — membership.read not granted.
                    </AlertDescription>
                  </Alert>
                }
              >
                <Alert>
                  <AlertDescription className="text-xs">
                    People &amp; memberships area unlocked (membership.read).
                  </AlertDescription>
                </Alert>
              </PermissionGate>

              <PermissionGate
                permission="membership.invite"
                fallback={
                  <Alert>
                    <AlertDescription className="text-xs">
                      Invitations are hidden — membership.invite not granted.
                    </AlertDescription>
                  </Alert>
                }
              >
                <Alert>
                  <AlertDescription className="text-xs">
                    Invitation issuance unlocked (membership.invite).
                  </AlertDescription>
                </Alert>
              </PermissionGate>
            </div>

            <div className="flex flex-wrap gap-1">
              {permissions.slice(0, 24).map((code) => (
                <Badge key={code} variant="outline" className="text-[10px] font-normal">
                  {code}
                </Badge>
              ))}
              {permissions.length > 24 && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  +{permissions.length - 24} more
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
