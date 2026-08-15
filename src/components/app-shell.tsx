import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarRange,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  School,
  ShieldCheck,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAppContext } from "@/lib/app-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: null },
] as const;

function ContextSwitchers({ compact = false }: { compact?: boolean }) {
  const {
    organizations,
    activeOrganization,
    activeSchool,
    academicYears,
    terms,
    activeAcademicYear,
    activeTerm,
    academicLoading,
    setOrganization,
    setSchool,
    setAcademicYear,
    setTerm,
  } = useAppContext();

  const triggerClass = compact ? "h-9 w-full" : "h-9 w-[190px]";

  return (
    <div className={cn("flex gap-2", compact ? "flex-col" : "flex-wrap items-center")}>
      {organizations.length > 1 && (
        <Select value={activeOrganization?.organizationId ?? ""} onValueChange={setOrganization}>
          <SelectTrigger className={triggerClass} aria-label="Organization">
            <SelectValue placeholder="Organization" />
          </SelectTrigger>
          <SelectContent>
            {organizations.map((org) => (
              <SelectItem key={org.organizationId} value={org.organizationId}>
                {org.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={activeSchool?.id ?? ""} onValueChange={setSchool}>
        <SelectTrigger className={triggerClass} aria-label="School">
          <SelectValue placeholder="Select school" />
        </SelectTrigger>
        <SelectContent>
          {(activeOrganization?.schools ?? []).map((school) => (
            <SelectItem key={school.id} value={school.id}>
              {school.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {academicLoading ? (
        <Skeleton className={cn("rounded-md", compact ? "h-9 w-full" : "h-9 w-[150px]")} />
      ) : (
        <Select value={activeAcademicYear?.id ?? ""} onValueChange={setAcademicYear}>
          <SelectTrigger
            className={compact ? "h-9 w-full" : "h-9 w-[150px]"}
            aria-label="Academic year"
          >
            <SelectValue placeholder="Academic year" />
          </SelectTrigger>
          <SelectContent>
            {academicYears.map((year) => (
              <SelectItem key={year.id} value={year.id}>
                {year.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={activeTerm?.id ?? ""} onValueChange={setTerm}>
        <SelectTrigger className={compact ? "h-9 w-full" : "h-9 w-[140px]"} aria-label="Term">
          <SelectValue placeholder="Term" />
        </SelectTrigger>
        <SelectContent>
          {terms.map((term) => (
            <SelectItem key={term.id} value={term.id}>
              {term.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { activeOrganization } = useAppContext();

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          E
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">EduSmart</p>
          <p className="text-xs text-muted-foreground">SchoolOS</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
              pathname === item.to ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto space-y-2 rounded-md border border-border p-3">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" />
          {activeOrganization?.name ?? "No organization"}
        </p>
        <div className="flex flex-wrap gap-1">
          {(activeOrganization?.roles ?? []).map((role, index) => (
            <Badge key={`${role.code}-${index}`} variant="secondary" className="text-[10px]">
              {role.code} · {role.scopeType}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { snapshot, activeOrganization } = useAppContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const initials = (snapshot?.profile?.fullName ?? "U")
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-border bg-background lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 bg-background shadow-lg">
            <div className="flex justify-end p-2">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </Button>

            <div className="hidden md:block">
              <ContextSwitchers />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      {initials}
                    </span>
                    <span className="hidden sm:inline">{snapshot?.profile?.fullName ?? "Account"}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="space-y-1">
                    <p className="text-sm">{snapshot?.profile?.fullName ?? "Account"}</p>
                    <p className="text-xs font-normal text-muted-foreground">
                      {activeOrganization?.name ?? "No active organization"}
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void handleSignOut()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="border-t border-border px-4 py-2 md:hidden">
            <ContextSwitchers compact />
          </div>
        </header>

        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

export const ShellIcons = { School, GraduationCap, CalendarRange, ShieldCheck };
