import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { useAppContext } from "@/lib/app-context";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export { QueryState, StatusBadge, FormDialog, Field } from "@/components/academic/academic-ui";

/**
 * Shared SIS page shell.
 *
 * SIS identity records (students, guardians, staff) live at the ORGANIZATION
 * level, so this shell requires an organization rather than a school. The
 * permission check is UX only — RLS remains the real boundary.
 */
export function SisPage({
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
  const { activeOrganization, activeSchool, hasPermission, contextLoading, error } = useAppContext();

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
            Viewing this data requires the <code className="font-mono">{readPermission}</code>{" "}
            permission in the active organization.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  } else if (!activeOrganization) {
    body = (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select an organization first</CardTitle>
          <CardDescription>
            Student, guardian and staff records are scoped to one organization. Choose an
            organization in the top bar to continue.
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
            {activeOrganization && (
              <p className="mt-1 text-xs text-muted-foreground">
                Organization: {activeOrganization.organizationName}
                {activeSchool ? ` · School filter: ${activeSchool.name}` : ""}
              </p>
            )}
          </div>
          {activeOrganization && hasPermission(readPermission) ? actions : null}
        </div>
        {body}
      </div>
    </AppShell>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
      <p className="text-xs text-muted-foreground">
        {total} record{total === 1 ? "" : "s"} · page {page} of {pages}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
