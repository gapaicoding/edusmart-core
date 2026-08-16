import type { FormEvent, ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAppContext } from "@/lib/app-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

/**
 * Shared Academic Setup shell.
 *
 * The read-permission check here is UX only. Every query behind it still runs
 * through RLS, and unauthorized reads/writes are refused by the database.
 */
export function AcademicPage({
  title,
  description,
  readPermission,
  actions,
  children,
}: {
  title: string;
  description: string;
  readPermission: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { activeSchool, hasPermission, contextLoading, error } = useAppContext();

  let body: ReactNode = children;

  if (contextLoading && !error) {
    body = (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );

  } else if (!hasPermission(readPermission)) {
    body = (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">You don't have access to this area</CardTitle>
          <CardDescription>
            Viewing this data requires the <code className="font-mono">{readPermission}</code> permission
            in the active school.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  } else if (!activeSchool) {
    body = (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select a school first</CardTitle>
          <CardDescription>
            Academic Setup data is scoped to one school. Choose a school in the top bar to continue.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
            {activeSchool && (
              <p className="mt-1 text-xs text-muted-foreground">
                Scope: {activeSchool.name} ({activeSchool.code})
              </p>
            )}
          </div>
          {activeSchool && hasPermission(readPermission) ? actions : null}
        </div>
        {body}
      </div>
    </AppShell>
  );
}

/**
 * Distinguishes loading, failed queries and genuinely empty result sets.
 * A failed query is never rendered as an empty state.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyTitle,
  emptyDescription,
  onRetry,
  columns,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  onRetry?: () => void;
  columns?: number;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <Table>
        <TableBody>
          {Array.from({ length: 4 }).map((_, row) => (
            <TableRow key={row}>
              {Array.from({ length: columns ?? 4 }).map((__, col) => (
                <TableCell key={col}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>We couldn't load this data</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{error instanceof Error ? error.message : String(error)}</p>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border p-10 text-center">
        <Inbox className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">{emptyTitle}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{emptyDescription}</p>
      </div>
    );
  }

  return <>{children}</>;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  draft: "secondary",
  inactive: "outline",
  closed: "outline",
  archived: "destructive",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? "secondary"} className="capitalize">
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitting,
  error,
  submitLabel = "Save",
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitting: boolean;
  error: string | null;
  submitLabel?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {children}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
