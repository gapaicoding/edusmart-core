import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { useAppContext } from "@/lib/app-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/select-organization")({
  head: () => ({
    meta: [
      { title: "Select organization — EduSmart SchoolOS" },
      { name: "description", content: "Choose which EduSmart SchoolOS organization workspace to open." },
      { property: "og:title", content: "Select organization — EduSmart SchoolOS" },
      { property: "og:description", content: "Choose which organization workspace to open." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SelectOrganizationPage,
});

function SelectOrganizationPage() {
  const { isLoading, error, organizations, activeOrganization, setOrganization } = useAppContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || error) return;
    if (organizations.length === 0) navigate({ to: "/access-pending", replace: true });
    else if (activeOrganization) navigate({ to: "/dashboard", replace: true });
  }, [isLoading, error, organizations, activeOrganization, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Select organization</CardTitle>
          <CardDescription>Only organizations with an active membership are listed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <p className="text-sm text-destructive">We couldn't load your organizations: {error.message}</p>
          ) : isLoading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : organizations.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">No active organization membership found.</p>
              <Button variant="outline" onClick={() => navigate({ to: "/access-pending", replace: true })}>
                View access status
              </Button>
            </div>
          ) : (
            organizations.map((org) => (
              <button
                key={org.organizationId}
                onClick={() => {
                  setOrganization(org.organizationId);
                  navigate({ to: "/dashboard", replace: true });
                }}
                className="flex w-full items-center justify-between rounded-md border border-border p-4 text-left transition-colors hover:bg-accent"
              >
                <span className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>
                    <span className="block text-sm font-medium">{org.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {org.schools.length} school{org.schools.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </span>
                <Badge variant="secondary">{org.roles[0]?.code ?? "MEMBER"}</Badge>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
