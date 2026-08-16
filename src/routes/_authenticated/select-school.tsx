import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { School } from "lucide-react";
import { useAppContext } from "@/lib/app-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/select-school")({
  head: () => ({
    meta: [
      { title: "Select school — EduSmart SchoolOS" },
      { name: "description", content: "Choose which school workspace to open inside your EduSmart organization." },
      { property: "og:title", content: "Select school — EduSmart SchoolOS" },
      { property: "og:description", content: "Choose which school workspace to open." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SelectSchoolPage,
});

function SelectSchoolPage() {
  const { isLoading, contextLoading, error, organizations, activeOrganization, activeSchool, setSchool } =
    useAppContext();
  const navigate = useNavigate();
  const schools = activeOrganization?.schools ?? [];

  useEffect(() => {
    if (contextLoading || error) return;
    if (organizations.length === 0) navigate({ to: "/access-pending", replace: true });
    else if (!activeOrganization) navigate({ to: "/select-organization", replace: true });
    else if (activeSchool) navigate({ to: "/dashboard", replace: true });
  }, [contextLoading, error, organizations, activeOrganization, activeSchool, navigate]);


  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Select school</CardTitle>
          <CardDescription>
            {activeOrganization
              ? `Schools you can access in ${activeOrganization.name}.`
              : "Pick an organization first."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <p className="text-sm text-destructive">We couldn't load your school access: {error.message}</p>
          ) : isLoading ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : !activeOrganization ? (
            <Button variant="outline" onClick={() => navigate({ to: "/select-organization", replace: true })}>
              Choose organization
            </Button>
          ) : schools.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Your membership has no active school access yet. Ask an administrator to grant school access.
              </p>
              <Button variant="outline" onClick={() => navigate({ to: "/dashboard", replace: true })}>
                Back to dashboard
              </Button>
            </div>
          ) : (
            schools.map((school) => (
              <button
                key={school.id}
                onClick={() => {
                  setSchool(school.id);
                  navigate({ to: "/dashboard", replace: true });
                }}
                className="flex w-full items-center gap-3 rounded-md border border-border p-4 text-left transition-colors hover:bg-accent"
              >
                <School className="h-4 w-4 text-muted-foreground" />
                <span>
                  <span className="block text-sm font-medium">{school.name}</span>
                  <span className="block text-xs text-muted-foreground">{school.code}</span>
                </span>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
