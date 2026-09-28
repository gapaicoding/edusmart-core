import type { ReactNode } from "react";
import { translateUiNode, useOptionalAppPreferences } from "@/lib/app-preferences";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const preferences = useOptionalAppPreferences();
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {preferences ? translateUiNode(title, preferences.locale) : title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {preferences ? translateUiNode(description, preferences.locale) : description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  const preferences = useOptionalAppPreferences();
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
      <p className="font-medium text-foreground">
        {preferences ? translateUiNode(title, preferences.locale) : title}
      </p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {preferences ? translateUiNode(description, preferences.locale) : description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
