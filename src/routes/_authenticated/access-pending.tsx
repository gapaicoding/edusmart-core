import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppContext } from "@/lib/app-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/access-pending")({
  head: () => ({
    meta: [
      { title: "Access pending — EduSmart SchoolOS" },
      { name: "description", content: "Your EduSmart SchoolOS account has no active organization membership yet." },
      { property: "og:title", content: "Access pending — EduSmart SchoolOS" },
      { property: "og:description", content: "Your account is waiting for an organization membership." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccessPendingPage,
});

function AccessPendingPage() {
  const { isLoading, snapshot, organizations, refetch } = useAppContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Access pending</CardTitle>
          <CardDescription>
            {snapshot?.profile?.fullName
              ? `Hi ${snapshot.profile.fullName}, your account isn't linked to an active organization membership yet.`
              : "Your account isn't linked to an active organization membership yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask your school administrator to send you an invitation. Once you accept it, your workspace
              appears here automatically.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                refetch();
                if (organizations.length > 0) navigate({ to: "/dashboard", replace: true });
              }}
            >
              Check again
            </Button>
            <Button variant="ghost" onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
