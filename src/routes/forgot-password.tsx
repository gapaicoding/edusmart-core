import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset your password — EduSmart SchoolOS" },
      { name: "description", content: "Request a password reset link for your EduSmart SchoolOS account." },
      { property: "og:title", content: "Reset your password — EduSmart SchoolOS" },
      { property: "og:description", content: "Request a password reset link for your EduSmart SchoolOS account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = parseEmail(email);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsed.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Forgot password</CardTitle>
          <CardDescription>We'll email you a reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <Alert>
              <AlertDescription>
                If an account exists for {email}, a reset link is on its way. Check your inbox and spam folder.
              </AlertDescription>
            </Alert>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}

          <div className="mt-4 text-sm">
            <Link to="/auth" className="text-muted-foreground underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
