import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Check, Languages, Moon, Sun } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppPreferences, type Locale, type Theme } from "@/lib/app-preferences";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function ChoiceButton({
  selected,
  onClick,
  children,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={selected ? "default" : "outline"}
      className="h-auto min-h-11 justify-start"
      onClick={onClick}
      aria-pressed={selected}
    >
      {icon}
      <span className="flex-1 text-left">{children}</span>
      {selected ? <Check aria-hidden="true" /> : null}
    </Button>
  );
}

function SettingsPage() {
  const { locale, theme, setLocale, setTheme, t } = useAppPreferences();
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title={t("settings.title")} description={t("settings.description")} />
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.preferences")}</CardTitle>
            <CardDescription>{t("settings.savedLocally")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <section aria-labelledby="settings-language-heading" className="space-y-3">
              <h2
                id="settings-language-heading"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <Languages aria-hidden="true" className="h-4 w-4" />
                {t("common.language")}
              </h2>
              <div className="grid gap-2">
                <ChoiceButton
                  selected={locale === "id"}
                  onClick={() => setLocale("id" as Locale)}
                  icon={<span aria-hidden="true">🇮🇩</span>}
                >
                  Bahasa Indonesia
                </ChoiceButton>
                <ChoiceButton
                  selected={locale === "en"}
                  onClick={() => setLocale("en" as Locale)}
                  icon={<span aria-hidden="true">🇬🇧</span>}
                >
                  English
                </ChoiceButton>
              </div>
            </section>
            <section aria-labelledby="settings-theme-heading" className="space-y-3">
              <h2
                id="settings-theme-heading"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <Sun aria-hidden="true" className="h-4 w-4" />
                {t("common.appearance")}
              </h2>
              <div className="grid gap-2">
                <ChoiceButton
                  selected={theme === "light"}
                  onClick={() => setTheme("light" as Theme)}
                  icon={<Sun aria-hidden="true" />}
                >
                  {t("common.light")}
                </ChoiceButton>
                <ChoiceButton
                  selected={theme === "dark"}
                  onClick={() => setTheme("dark" as Theme)}
                  icon={<Moon aria-hidden="true" />}
                >
                  {t("common.dark")}
                </ChoiceButton>
              </div>
            </section>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
