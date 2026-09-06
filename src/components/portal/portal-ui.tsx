import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  UserRound,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppContext } from "@/lib/app-context";
import {
  getPortalChildOverview,
  listPortalAttendance,
  listPortalChildren,
  listPortalScores,
  listPortalSchedule,
  type PortalChild,
} from "@/lib/portal.functions";

const CHILD_STORAGE_KEY = "edusmart.portal.activeChildId";

/**
 * Selected-child state.
 *
 * The stored id is UX convenience only; it is validated against the RLS-backed
 * children list every time the portal loads. It is never accepted as
 * authorization proof by any server function.
 */
function useSelectedChild(children: PortalChild[] | undefined) {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(CHILD_STORAGE_KEY);
  });
  useEffect(() => {
    if (!children) return;
    const isValid = selectedId && children.some((c) => c.studentId === selectedId);
    if (!isValid) {
      const next = children[0]?.studentId ?? null;
      setSelectedId(next);
      if (typeof window !== "undefined") {
        if (next) window.localStorage.setItem(CHILD_STORAGE_KEY, next);
        else window.localStorage.removeItem(CHILD_STORAGE_KEY);
      }
    }
  }, [children, selectedId]);
  const update = (id: string) => {
    setSelectedId(id);
    if (typeof window !== "undefined") window.localStorage.setItem(CHILD_STORAGE_KEY, id);
  };
  return [selectedId, update] as const;
}

const PORTAL_TABS = [
  { to: "/portal", label: "Overview", icon: UserRound, exact: true },
  { to: "/portal/schedule", label: "Schedule", icon: CalendarClock, exact: false },
  { to: "/portal/attendance", label: "Attendance", icon: CalendarDays, exact: false },
  { to: "/portal/scores", label: "Scores", icon: ClipboardCheck, exact: false },
];

function PortalTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-wrap gap-2 border-b border-border pb-2">
      {PORTAL_TABS.map((t) => {
        const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ChildHeader({
  children,
  selectedId,
  onSelect,
}: {
  children: PortalChild[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const active = children.find((c) => c.studentId === selectedId) ?? null;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Viewing child</p>
        <h2 className="truncate text-lg font-semibold">{active?.fullName ?? "—"}</h2>
        {active && (
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-[10px]">
              {active.relationship}
            </Badge>
            {active.isPrimary && (
              <Badge variant="outline" className="text-[10px]">
                Primary
              </Badge>
            )}
          </div>
        )}
      </div>
      {children.length > 1 && (
        <div className="w-full sm:w-[240px]">
          <Select value={selectedId ?? ""} onValueChange={onSelect}>
            <SelectTrigger className="h-10" aria-label="Choose child">
              <SelectValue placeholder="Choose child" />
            </SelectTrigger>
            <SelectContent>
              {children.map((c) => (
                <SelectItem key={c.studentId} value={c.studentId}>
                  {c.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function EmptyPortal({ title, description }: { title: string; description: string }) {
  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

function PortalShell({
  activeChild,
  children: content,
  childListState,
}: {
  activeChild: PortalChild | null;
  childListState: ReturnType<typeof useChildrenQuery>;
  children: (child: PortalChild) => ReactNode;
}) {
  const { data, isLoading, error, refetch, selectedId, setSelectedId } = childListState;
  const { snapshot } = useAppContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (snapshot && !snapshot.profile) {
      navigate({ to: "/auth", replace: true });
    }
  }, [snapshot, navigate]);

  return (
    <AppShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <header>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Parent Portal</p>
          <h1 className="text-2xl font-semibold">Family workspace</h1>
          <p className="text-sm text-muted-foreground">
            Read-only view of your child's academic record. What you see here is what has been
            published by the school.
          </p>
        </header>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>We couldn't load your children</AlertTitle>
            <AlertDescription>
              {(error as Error).message}
              <button className="ml-2 underline" onClick={() => void refetch()}>
                Try again
              </button>
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !data || data.children.length === 0 ? (
          <EmptyPortal
            title="No children linked to this account"
            description="Your school hasn't linked a student to this login yet. Contact the school office to complete the guardian setup."
          />
        ) : (
          <>
            <ChildHeader
              children={data.children}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <PortalTabs />
            <div>{activeChild ? content(activeChild) : null}</div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function useChildrenQuery() {
  const fn = useServerFn(listPortalChildren);
  const query = useQuery({
    queryKey: ["portal-children"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });
  const [selectedId, setSelectedId] = useSelectedChild(query.data?.children);
  return {
    ...query,
    selectedId,
    setSelectedId,
    activeChild: query.data?.children.find((c) => c.studentId === selectedId) ?? null,
  };
}

function OverviewSection({ child }: { child: PortalChild }) {
  const fn = useServerFn(getPortalChildOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-child-overview", child.studentId],
    queryFn: () => fn({ data: { studentId: child.studentId } }),
    staleTime: 60_000,
  });
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>We couldn't load this child's overview</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data) {
    return (
      <EmptyPortal
        title="Child not currently accessible"
        description="This child's academic record is not available right now. If you believe this is a mistake, contact the school office."
      />
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{data.fullName}</CardTitle>
          <CardDescription>{data.status}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">School</span>
            <span className="text-right">{data.schoolName ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Grade</span>
            <span className="text-right">{data.gradeLevelName ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Classroom</span>
            <span className="text-right">{data.classroomName ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Academic year</span>
            <span className="text-right">{data.academicYearName ?? "—"}</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-4 w-4" /> Portal permissions
          </CardTitle>
          <CardDescription>Set by the school on your guardian record.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            Academic:{" "}
            <span className="font-medium">{child.canViewAcademic ? "Visible" : "Hidden"}</span>
          </p>
          <p>
            Attendance:{" "}
            <span className="font-medium">{child.canViewAttendance ? "Visible" : "Hidden"}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AttendanceSection({ child }: { child: PortalChild }) {
  const fn = useServerFn(listPortalAttendance);
  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-attendance", child.studentId],
    queryFn: () => fn({ data: { studentId: child.studentId } }),
    staleTime: 60_000,
  });
  if (!child.canViewAttendance) {
    return (
      <EmptyPortal
        title="Attendance not shared with this guardian"
        description="Your guardian record does not include attendance visibility. Contact the school if this needs to change."
      />
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>We couldn't load attendance</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  const rows = data?.rows ?? [];
  if (rows.length === 0) {
    return (
      <EmptyPortal
        title="No attendance to show yet"
        description="Once your child's teachers submit their attendance sessions, they will appear here."
      />
    );
  }
  return (
    <div className="grid gap-2">
      {rows.map((r) => (
        <Card key={r.recordId}>
          <CardContent className="flex items-center justify-between p-3 text-sm">
            <div>
              <p className="font-medium">{new Date(r.sessionDate).toLocaleDateString()}</p>
              <p className="text-xs text-muted-foreground capitalize">
                Session {r.sessionStatus}
                {r.minutesLate ? ` · ${r.minutesLate} min late` : ""}
              </p>
            </div>
            <Badge
              variant={r.status === "present" ? "secondary" : "outline"}
              className="capitalize"
            >
              {r.status}
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ScoresSection({ child }: { child: PortalChild }) {
  const fn = useServerFn(listPortalScores);
  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-scores", child.studentId],
    queryFn: () => fn({ data: { studentId: child.studentId } }),
    staleTime: 60_000,
  });
  if (!child.canViewAcademic) {
    return (
      <EmptyPortal
        title="Academic results not shared with this guardian"
        description="Your guardian record does not include academic visibility. Contact the school if this needs to change."
      />
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>We couldn't load results</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  const rows = data?.rows ?? [];
  if (rows.length === 0) {
    return (
      <EmptyPortal
        title="No published results yet"
        description="Only assessments the school has published appear here."
      />
    );
  }
  return (
    <div className="grid gap-2">
      {rows.map((r) => (
        <Card key={r.scoreId}>
          <CardContent className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.assessmentTitle}</p>
              <p className="text-xs text-muted-foreground">
                {r.subjectName ? `${r.subjectName} · ` : ""}
                {r.typeName ? `${r.typeName} · ` : ""}
                {new Date(r.assessmentDate).toLocaleDateString()}
                {r.termName ? ` · ${r.termName}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {r.score !== null ? (
                <p className="text-base font-semibold">
                  {r.score}
                  <span className="text-xs font-normal text-muted-foreground"> / {r.maxScore}</span>
                </p>
              ) : (
                <Badge variant="outline" className="capitalize">
                  {r.status}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ScheduleSection({ child }: { child: PortalChild }) {
  const fn = useServerFn(listPortalSchedule);
  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-schedule", child.studentId],
    queryFn: () => fn({ data: { studentId: child.studentId } }),
    staleTime: 60_000,
  });
  const rows = data?.rows ?? [];
  const grouped = useMemo(() => {
    const map = new Map<number, typeof rows>();
    for (const r of rows) {
      const arr = map.get(r.dayOfWeek) ?? [];
      arr.push(r);
      map.set(r.dayOfWeek, arr);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);
  if (!child.canViewAcademic) {
    return (
      <EmptyPortal
        title="Schedule not shared with this guardian"
        description="Your guardian record does not include academic visibility. Contact the school if this needs to change."
      />
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>We couldn't load the schedule</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (rows.length === 0) {
    return (
      <EmptyPortal
        title="No published schedule yet"
        description="Once the school publishes your child's timetable, classes will appear here."
      />
    );
  }
  return (
    <div className="space-y-3">
      {grouped.map(([day, items]) => (
        <div key={day}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {DAYS[day] ?? `Day ${day}`}
          </p>
          <div className="grid gap-2">
            {items.map((r) => (
              <Card key={r.entryId}>
                <CardContent className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <p className="font-medium">{r.subjectName ?? "Class"}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.teacherName ?? ""}
                      {r.classroomName ? ` · ${r.classroomName}` : ""}
                    </p>
                  </div>
                  <p className="tabular-nums text-muted-foreground">
                    {r.startsAt.slice(0, 5)}–{r.endsAt.slice(0, 5)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PortalOverviewPage() {
  const state = useChildrenQuery();
  return (
    <PortalShell activeChild={state.activeChild} childListState={state}>
      {(child) => <OverviewSection child={child} />}
    </PortalShell>
  );
}

export function PortalAttendancePage() {
  const state = useChildrenQuery();
  return (
    <PortalShell activeChild={state.activeChild} childListState={state}>
      {(child) => <AttendanceSection child={child} />}
    </PortalShell>
  );
}

export function PortalScoresPage() {
  const state = useChildrenQuery();
  return (
    <PortalShell activeChild={state.activeChild} childListState={state}>
      {(child) => <ScoresSection child={child} />}
    </PortalShell>
  );
}

export function PortalSchedulePage() {
  const state = useChildrenQuery();
  return (
    <PortalShell activeChild={state.activeChild} childListState={state}>
      {(child) => <ScheduleSection child={child} />}
    </PortalShell>
  );
}
