import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { acceptInvitation } from "@/lib/invitations.functions";
import { parseEmail } from "@/lib/email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

type InviteSearch = { token?: string | undefined };

export const Route = createFileRoute("/accept-invite")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): InviteSearch => ({
    token: typeof search['token'] === "string" ? search['token'] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Accept invitation — EduSmart SchoolOS" },
      { name: "description", content: "Accept your EduSmart SchoolOS invitation and join your school workspace." },
      { property: "og:title", content: "Accept invitation — EduSmart SchoolOS" },
      { property: "og:description", content: "Accept your EduSmart SchoolOS invitation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accept = useServerFn(acceptInvitation);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [signupNotice, setSignupNotice] = useState(false);

  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [acceptBusy, setAcceptBusy] = useState(false);
  const [acceptedOrg, setAcceptedOrg] = useState<string | null>(null);

  async function handleAuth(event: React.FormEvent) {
    event.preventDefault();
    setAuthError(null);
    setSignupNotice(false);
    const parsed = parseEmail(email);
    if (parsed.error) {
      setAuthError(parsed.error);
      return;
    }
    setAuthBusy(true);

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: parsed.email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/accept-invite?token=${token ?? ""}` },
      });
      setAuthBusy(false);
      if (error) return setAuthError(error.message);
      if (!data.session) setSignupNotice(true);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);
    if (error) setAuthError(error.message);
  }

  async function handleAccept() {
    if (!token) return;
    setAcceptBusy(true);
    setAcceptError(null);
    try {
      const result = await accept({ data: { token } });
      setAcceptedOrg(result.organizationName);
      await queryClient.invalidateQueries();
    } catch (error) {
      setAcceptError(error instanceof Error ? error.message : "Could not accept this invitation.");
    } finally {
      setAcceptBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
          <CardDescription>Join an EduSmart SchoolOS organization.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!token ? (
            <Alert variant="destructive">
              <AlertDescription>
                This link has no invitation token. Ask your administrator to resend the invitation.
              </AlertDescription>
            </Alert>
          ) : loading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : acceptedOrg !== null ? (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  You have joined {acceptedOrg ?? "the organization"}. Your access is now active.
                </AlertDescription>
              </Alert>
              <Button className="w-full" onClick={() => navigate({ to: "/dashboard", replace: true })}>
                Go to dashboard
              </Button>
            </div>
          ) : session ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Signed in as <span className="font-medium text-foreground">{session.user.email}</span>. The
                invitation is validated on the server against its intended email, expiry and status.
              </p>
              {acceptError && (
                <Alert variant="destructive">
                  <AlertDescription>{acceptError}</AlertDescription>
                </Alert>
              )}
              <Button className="w-full" onClick={() => void handleAccept()} disabled={acceptBusy}>
                {acceptBusy ? "Accepting…" : "Accept invitation"}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={async () => {
                  await supabase.auth.signOut();
                }}
              >
                Use a different account
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleAuth}>
              <p className="text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Sign in with the email your invitation was sent to."
                  : "Create an account with the email your invitation was sent to."}
              </p>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {signupNotice && (
                <Alert>
                  <AlertDescription>
                    Check your email to confirm the account, then reopen this invitation link.
                  </AlertDescription>
                </Alert>
              )}
              {authError && (
                <Alert variant="destructive">
                  <AlertDescription>{authError}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={authBusy}>
                {authBusy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin" ? "I don't have an account yet" : "I already have an account"}
              </Button>
            </form>
          )}

          <div className="text-sm">
            <Link to="/auth" className="text-muted-foreground underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
