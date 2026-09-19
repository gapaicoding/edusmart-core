import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FileUp,
  FileDown,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  School,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAppContext } from "@/lib/app-context";
import { listMyNotifications } from "@/lib/notifications-parent-permissions.functions";
import { useServerFn } from "@tanstack/react-start";
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

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: string | null;
  anyOf?: string[];
};
/**
 * `audience` is UX-only navigation grouping derived from the caller's role
 * codes (activeOrganization.roles). It never replaces PermissionGate/RLS —
 * every item is still hidden unless `permission` also passes, and the
 * database enforces every read/write regardless of what the sidebar shows.
 * `null` means the group is shown to every signed-in persona (Dashboard).
 */
type NavGroup = {
  label: string | null;
  audience: "staff" | "parent" | "student" | null;
  items: NavItem[];
};

/** Staff persona codes: seeing the operational navigation groups. */
const STAFF_ROLE_CODES = [
  "ORG_OWNER",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "VICE_PRINCIPAL_CURRICULUM",
  "TEACHER",
  "HOMEROOM_TEACHER",
];

export function derivePersonas(roles: { code: string }[]) {
  const codes = new Set(roles.map((r) => r.code));
  return {
    isStaff: STAFF_ROLE_CODES.some((code) => codes.has(code)),
    isParent: codes.has("PARENT"),
    isStudent: codes.has("STUDENT"),
  };
}

/** Permission checks here hide navigation only; RLS remains the real boundary. */
const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    audience: null,
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: null },
      { to: "/notifications", label: "Notifications", icon: Bell, permission: null },
      {
        to: "/permission-requests",
        label: "Permission Requests",
        icon: ClipboardList,
        permission: null,
        anyOf: [
          "permission_request.read",
          "permission_request.create",
          "permission_request.update",
          "permission_request.publish",
          "permission_request.close",
        ],
      },
    ],
  },
  {
    label: "Academic Setup",
    audience: "staff",
    items: [
      {
        to: "/academic/years",
        label: "Academic Years",
        icon: CalendarRange,
        permission: "academic_year.read",
      },
      { to: "/academic/terms", label: "Terms", icon: CalendarRange, permission: "term.read" },
      {
        to: "/academic/grade-levels",
        label: "Grade Levels",
        icon: GraduationCap,
        permission: "grade_level.read",
      },
      {
        to: "/academic/classrooms",
        label: "Classrooms",
        icon: School,
        permission: "classroom.read",
      },
      { to: "/academic/subjects", label: "Subjects", icon: BookOpen, permission: "subject.read" },
      {
        to: "/academic/curricula",
        label: "Curricula",
        icon: Library,
        permission: "curriculum.read",
      },
      {
        to: "/academic/calendar",
        label: "Academic Calendar",
        icon: CalendarDays,
        permission: "schedule.read",
      },
    ],
  },
  {
    label: "Student Information",
    audience: "staff",
    items: [
      { to: "/students", label: "Students", icon: Users, permission: "student.read" },
      { to: "/guardians", label: "Guardians", icon: HeartHandshake, permission: "guardian.read" },
      { to: "/staff", label: "Staff", icon: Briefcase, permission: "staff.read" },
      {
        to: "/sis-imports",
        label: "SIS Imports",
        icon: FileUp,
        permission: null,
        anyOf: ["student.import", "guardian.import", "staff.import", "enrollment.import"],
      },
      {
        to: "/sis-export",
        label: "SIS Export",
        icon: FileDown,
        permission: null,
        anyOf: ["student.export", "guardian.export", "staff.export"],
      },
    ],
  },
  {
    label: "Academic Operations",
    audience: "staff",
    items: [
      {
        to: "/teaching-assignments",
        label: "Teacher Assignments",
        icon: ClipboardList,
        permission: "teaching_assignment.read",
      },
      { to: "/schedule", label: "Schedule", icon: CalendarClock, permission: "schedule.read" },
      { to: "/schedule/my", label: "My Schedule", icon: CalendarDays, permission: "schedule.read" },
      {
        to: "/attendance",
        label: "Attendance",
        icon: CalendarCheck,
        permission: "attendance.read",
      },
      {
        to: "/assessments",
        label: "Assessments",
        icon: ClipboardCheck,
        permission: "assessment.read",
      },
      {
        to: "/report-cards",
        label: "Report Cards",
        icon: FileText,
        permission: "report_card.read",
      },
    ],
  },
  {
    label: "Parent Portal",
    audience: "parent",
    items: [
      { to: "/portal", label: "Overview", icon: HeartHandshake, permission: "student.read" },
      {
        to: "/portal/permission-requests",
        label: "Permission Requests",
        icon: ClipboardList,
        permission: "student.read",
      },
      {
        to: "/portal/schedule",
        label: "Schedule",
        icon: CalendarClock,
        permission: "schedule.read",
      },
      {
        to: "/portal/attendance",
        label: "Attendance",
        icon: CalendarCheck,
        permission: "attendance.read",
      },
      { to: "/portal/scores", label: "Scores", icon: ClipboardCheck, permission: "score.read" },
      {
        to: "/portal/report-cards",
        label: "Report Cards",
        icon: FileText,
        permission: "report_card.read",
      },
    ],
  },
  {
    label: "Student Portal",
    audience: "student",
    items: [
      { to: "/student", label: "Overview", icon: UserRound, permission: "student.read" },
      {
        to: "/student/schedule",
        label: "Schedule",
        icon: CalendarClock,
        permission: "schedule.read",
      },
      {
        to: "/student/attendance",
        label: "Attendance",
        icon: CalendarCheck,
        permission: "attendance.read",
      },
      { to: "/student/scores", label: "Scores", icon: ClipboardCheck, permission: "score.read" },
      {
        to: "/student/report-cards",
        label: "Report Cards",
        icon: FileText,
        permission: "report_card.read",
      },
    ],
  },
];

function ContextSwitchers({ compact = false }: { compact?: boolean }) {
  const {
    organizations,
    activeOrganization,
    activeSchool,
    academicYears,
    terms,
    activeAcademicYear,
    activeTerm,
    contextLoading,
    academicYearLoading,
    termLoading,
    error,
    setOrganization,
    setSchool,
    setAcademicYear,
    setTerm,
  } = useAppContext();

  const triggerClass = compact ? "h-9 w-full" : "h-9 w-[190px]";
  const yearClass = compact ? "h-9 w-full" : "h-9 w-[150px]";
  const termClass = compact ? "h-9 w-full" : "h-9 w-[140px]";

  // While context is resolving we show neutral skeletons — never a false
  // "No organization" / "Select school" label. Errors fall through to the
  // real controls so the failure stays visible instead of looking like data.
  if (contextLoading && !error) {
    return (
      <div className={cn("flex gap-2", compact ? "flex-col" : "flex-wrap items-center")}>
        <Skeleton className={cn("rounded-md", triggerClass)} />
        <Skeleton className={cn("rounded-md", yearClass)} />
        <Skeleton className={cn("rounded-md", termClass)} />
      </div>
    );
  }

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

      {academicYearLoading && !error ? (
        <Skeleton className={cn("rounded-md", yearClass)} />
      ) : (
        <Select value={activeAcademicYear?.id ?? ""} onValueChange={setAcademicYear}>
          <SelectTrigger className={yearClass} aria-label="Academic year">
            <SelectValue
              placeholder={academicYears.length === 0 ? "No academic year" : "Academic year"}
            />
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

      {termLoading && !error ? (
        <Skeleton className={cn("rounded-md", termClass)} />
      ) : (
        <Select value={activeTerm?.id ?? ""} onValueChange={setTerm}>
          <SelectTrigger className={termClass} aria-label="Term">
            <SelectValue placeholder={terms.length === 0 ? "No term" : "Term"} />
          </SelectTrigger>
          <SelectContent>
            {terms.map((term) => (
              <SelectItem key={term.id} value={term.id}>
                {term.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { activeOrganization, hasPermission, contextLoading, error } = useAppContext();
  const orgResolving = contextLoading && !error;

  // UX-only persona gate: hides operational groups from PARENT/STUDENT
  // accounts (and vice versa) even when overlapping read permissions would
  // otherwise let the raw permission check pass. RLS remains the real
  // boundary regardless of what this sidebar renders.
  const personas = derivePersonas(activeOrganization?.roles ?? []);
  const groups = NAV_GROUPS.filter((group) => {
    if (!group.audience) return true;
    if (group.audience === "staff") return personas.isStaff;
    if (group.audience === "parent") return personas.isParent;
    return personas.isStudent;
  })
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.permission && !item.anyOf) ||
          Boolean(item.permission && hasPermission(item.permission)) ||
          Boolean(item.anyOf?.some(hasPermission)),
      ),
    }))
    .filter((group) => group.items.length > 0);

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

      <nav className="flex flex-col gap-4 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label ?? "root"} className="flex flex-col gap-1">
            {group.label && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                {group.label}
              </p>
            )}
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                  pathname === item.to
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-2 rounded-md border border-border p-3">
        {orgResolving ? (
          <>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { snapshot, activeOrganization, identityLoading, contextLoading, error } = useAppContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchNotifications = useServerFn(listMyNotifications);
  const notificationsQuery = useQuery({
    queryKey: ["notifications", "inbox", "shell"],
    queryFn: () => fetchNotifications({ data: { pageSize: 1, offset: 0 } }),
    staleTime: 30_000,
  });
  const unreadCount = Array.isArray(notificationsQuery.data)
    ? Number(
        (notificationsQuery.data[0] as { unread_count?: number } | undefined)?.unread_count ?? 0,
      )
    : 0;

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const identityResolving = identityLoading && !error;
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
              <Link
                to="/notifications"
                aria-label={
                  unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"
                }
                className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
              {identityResolving ? (
                <Skeleton className="h-8 w-32 rounded-md" />
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                        {initials}
                      </span>
                      <span className="hidden sm:inline">
                        {snapshot?.profile?.fullName ?? "Account"}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="space-y-1">
                      <p className="text-sm">{snapshot?.profile?.fullName ?? "Account"}</p>
                      <p className="text-xs font-normal text-muted-foreground">
                        {contextLoading && !error
                          ? "Loading workspace…"
                          : (activeOrganization?.name ?? "No active organization")}
                      </p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => void handleSignOut()}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
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
