import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { useAppContext } from "@/lib/app-context";
import { translateUiText, useAppPreferences } from "@/lib/app-preferences";
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
  const { activeOrganization, activeSchool, hasPermission, contextLoading, error } =
    useAppContext();
  const { t, locale } = useAppPreferences();

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
          <CardTitle className="text-base">{t("common.accessDenied")}</CardTitle>
          <CardDescription>{t("common.accessDeniedDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  } else if (!activeOrganization) {
    body = (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("common.selectOrganization")}</CardTitle>
          <CardDescription>{t("common.selectOrganizationDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {translateUiText(title, locale)}
            </h1>
            <p className="text-sm text-muted-foreground">{translateUiText(description, locale)}</p>
            {activeOrganization && (
              <p className="mt-1 text-xs text-muted-foreground">
                {locale === "id" ? "Organisasi: " : "Organization: "}
                {activeOrganization.name}
                {activeSchool
                  ? ` · ${locale === "id" ? "Filter sekolah" : "School filter"}: ${activeSchool.name}`
                  : ""}
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
  const { t } = useAppPreferences();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
      <p className="text-xs text-muted-foreground">
        {total} {t("common.records")} · {t("common.page")} {page} / {pages}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t("common.previous")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}
