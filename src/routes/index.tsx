import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EduSmart SchoolOS" },
      {
        name: "description",
        content:
          "EduSmart SchoolOS — a unified school operating system. Application shell ready for configuration.",
      },
      { property: "og:title", content: "EduSmart SchoolOS" },
      {
        property: "og:description",
        content:
          "EduSmart SchoolOS — a unified school operating system. Application shell ready for configuration.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              E
            </div>
            <span className="text-lg font-semibold tracking-tight">
              EduSmart <span className="text-muted-foreground">SchoolOS</span>
            </span>
          </div>
          <Button variant="outline" size="sm" asChild>
            Sign in
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-20">
        <div className="mb-3 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          Application shell
        </div>
        <h1 className="max-w-2xl text-center text-4xl font-bold tracking-tight sm:text-5xl">
          EduSmart SchoolOS
        </h1>
        <p className="mt-4 max-w-xl text-center text-base text-muted-foreground">
          A unified school operating system. The project shell is set up and
          ready to be configured with modules, authentication, and data.
        </p>

        <div className="mt-12 grid w-full gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Configured</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              React · TypeScript · Tailwind · shadcn/ui
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Connected</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Existing Supabase project
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Next steps</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Authentication, modules, and features
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-6 text-center text-xs text-muted-foreground">
          EduSmart SchoolOS — minimal shell
        </div>
      </footer>
    </div>
  );
}
