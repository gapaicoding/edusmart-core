import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, CalendarDays, ClipboardCheck, FileText, UserRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useAppContext } from "@/lib/app-context";
import {
  getStudentOverview,
  getStudentReportCard,
  listStudentAttendance,
  listStudentReportCards,
  listStudentSchedule,
  listStudentScores,
} from "@/lib/student-portal.functions";
import {
  getStudentReportCardDocumentStatus,
  getStudentReportCardDownload,
} from "@/lib/reporting.documents.functions";

/**
 * Batch 9 — Student Portal UI.
 *
 * This is NOT the Parent Portal reused with a student pretending to be a
 * "child": there is exactly one authenticated student, resolved server-side,
 * and there is no ChildSwitcher anywhere in this module. Every query below
 * sends only organization/school as FILTER context — never a studentId — the
 * server resolves the exact student itself.
 */

const STUDENT_TABS = [
  { to: "/student", label: "Overview", icon: UserRound, exact: true },
  { to: "/student/schedule", label: "Schedule", icon: CalendarClock, exact: false },
  { to: "/student/attendance", label: "Attendance", icon: CalendarDays, exact: false },
  { to: "/student/scores", label: "Scores", icon: ClipboardCheck, exact: false },
  { to: "/student/report-cards", label: "Report Cards", icon: FileText, exact: false },
];

function StudentTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-wrap gap-2 border-b border-border pb-2">
      {STUDENT_TABS.map((t) => {
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

function EmptyStudentPortal({ title, description }: { title: string; description: string }) {
  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

function useOrganizationSchoolContext() {
  const { activeOrganization, activeSchool } = useAppContext();
  return {
    organizationId: activeOrganization?.organizationId ?? null,
    schoolId: activeSchool?.id ?? null,
  };
}

function StudentShell({ children: content }: { children: React.ReactNode }) {
  const { organizationId } = useOrganizationSchoolContext();
  const fn = useServerFn(getStudentOverview);
  const overviewQuery = useQuery({
    queryKey: ["student-portal", "overview", organizationId],
    queryFn: () => fn({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
  });

  return (
    <AppShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <header>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Student Portal</p>
          <h1 className="text-2xl font-semibold">
            {overviewQuery.data?.fullName ?? "My workspace"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Read-only view of your own academic record. What you see here is exactly what your
            school has published.
          </p>
        </header>

        {overviewQuery.error && (
          <Alert variant="destructive">
            <AlertTitle>We couldn't load your Student Portal</AlertTitle>
            <AlertDescription>
              {(overviewQuery.error as Error).message}
              <button className="ml-2 underline" onClick={() => void overviewQuery.refetch()}>
                Try again
              </button>
            </AlertDescription>
          </Alert>
        )}

        {overviewQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !overviewQuery.data ? (
          <EmptyStudentPortal
            title="No Student Portal account linked"
            description="Your login is not yet linked to a student record in this organization. Contact the school office to complete Student Portal access."
          />
        ) : (
          <>
            <StudentTabs />
            <div>{content}</div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function OverviewSection() {
  const { organizationId } = useOrganizationSchoolContext();
  const fn = useServerFn(getStudentOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["student-portal", "overview", organizationId],
    queryFn: () => fn({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
  });
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>We couldn't load your overview</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data) return null;
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
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Enrollment</span>
            <span className="text-right capitalize">{data.enrollmentStatus ?? "—"}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ScheduleSection() {
  const { organizationId } = useOrganizationSchoolContext();
  const fn = useServerFn(listStudentSchedule);
  const { data, isLoading, error } = useQuery({
    queryKey: ["student-portal", "schedule", organizationId],
    queryFn: () => fn({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
  });
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>We couldn't load your schedule</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  const rows = data?.rows ?? [];
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  if (rows.length === 0) {
    return (
      <EmptyStudentPortal
        title="No published schedule yet"
        description="Once your school publishes the timetable for your classroom, it will appear here."
      />
    );
  }
  return (
    <div className="grid gap-2">
      {rows.map((r) => (
        <Card key={r.entryId}>
          <CardContent className="flex items-center justify-between p-3 text-sm">
            <div>
              <p className="font-medium">{r.subjectName ?? "Subject"}</p>
              <p className="text-xs text-muted-foreground">
                {DAYS[r.dayOfWeek] ?? r.dayOfWeek} · {r.startsAt}–{r.endsAt}
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>{r.classroomName ?? "—"}</p>
              <p>{r.teacherName ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AttendanceSection() {
  const { organizationId, schoolId } = useOrganizationSchoolContext();
  const fn = useServerFn(listStudentAttendance);
  const { data, isLoading, error } = useQuery({
    queryKey: ["student-portal", "attendance", organizationId, schoolId],
    queryFn: () => fn({ data: { organizationId: organizationId!, schoolId: schoolId! } }),
    enabled: Boolean(organizationId) && Boolean(schoolId),
    staleTime: 60_000,
  });
  if (!schoolId) {
    return (
      <EmptyStudentPortal
        title="Select a school"
        description="Choose your active school from the header to view attendance."
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
      <EmptyStudentPortal
        title="No attendance to show yet"
        description="Once your teachers submit their attendance sessions, they will appear here."
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
              <p className="text-xs text-muted-foreground capitalize">Session {r.sessionStatus}</p>
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

function ScoresSection() {
  const { organizationId } = useOrganizationSchoolContext();
  const fn = useServerFn(listStudentScores);
  const { data, isLoading, error } = useQuery({
    queryKey: ["student-portal", "scores", organizationId],
    queryFn: () => fn({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
  });
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
      <EmptyStudentPortal
        title="No published results yet"
        description="Once your teachers publish an assessment, your result will appear here."
      />
    );
  }
  return (
    <div className="grid gap-2">
      {rows.map((r) => (
        <Card key={r.scoreId}>
          <CardContent className="flex items-center justify-between p-3 text-sm">
            <div>
              <p className="font-medium">{r.assessmentTitle}</p>
              <p className="text-xs text-muted-foreground">
                {r.subjectName ?? "Subject"} · {r.typeName ?? "Assessment"}
                {r.termName ? ` · ${r.termName}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold">
                {r.score === null ? (
                  <span className="text-sm font-normal text-muted-foreground">No result</span>
                ) : (
                  `${r.score} / ${r.maxScore}`
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ReportCardsSection() {
  const { organizationId } = useOrganizationSchoolContext();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listFn = useServerFn(listStudentReportCards);
  const listQuery = useQuery({
    queryKey: ["student-portal", "report-cards", organizationId],
    queryFn: () => listFn({ data: { organizationId: organizationId! } }),
    enabled: Boolean(organizationId),
    staleTime: 60_000,
  });

  const detailFn = useServerFn(getStudentReportCard);
  const detailQuery = useQuery({
    queryKey: ["student-portal", "report-card", selectedId],
    queryFn: () =>
      detailFn({ data: { organizationId: organizationId!, reportCardId: selectedId! } }),
    enabled: Boolean(selectedId) && Boolean(organizationId),
  });

  const statusFn = useServerFn(getStudentReportCardDocumentStatus);
  const documentStatus = useQuery({
    queryKey: ["student-portal", "report-card-document", selectedId],
    queryFn: () => statusFn({ data: { reportCardId: selectedId! } }),
    enabled: Boolean(selectedId),
  });

  const downloadFn = useServerFn(getStudentReportCardDownload);
  const documentDownload = useMutation({
    mutationFn: () => downloadFn({ data: { reportCardId: selectedId! } }),
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
    },
  });

  if (error(listQuery)) {
    return (
      <Alert variant="destructive">
        <AlertTitle>We couldn't load report cards</AlertTitle>
        <AlertDescription>{(listQuery.error as Error).message}</AlertDescription>
      </Alert>
    );
  }
  if (listQuery.isLoading) return <Skeleton className="h-40 w-full" />;
  const rows = listQuery.data?.rows ?? [];

  if (selectedId && detailQuery.data) {
    const report = detailQuery.data;
    const attendance =
      report.card.attendance_summary &&
      typeof report.card.attendance_summary === "object" &&
      !Array.isArray(report.card.attendance_summary)
        ? (report.card.attendance_summary as Record<string, unknown>)
        : {};
    const counts =
      attendance["counts"] &&
      typeof attendance["counts"] === "object" &&
      !Array.isArray(attendance["counts"])
        ? (attendance["counts"] as Record<string, unknown>)
        : {};
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setSelectedId(null)}>
          ← Report Cards
        </Button>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>{report.card.studentName}</CardTitle>
                <CardDescription>
                  {report.card.schoolName} · {report.card.academicYearName} · {report.card.termName}
                </CardDescription>
              </div>
              <Badge>Published · Version {report.card.version}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Official frozen Report Card snapshot published{" "}
              {new Date(report.card.published_at!).toLocaleDateString()}.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Official PDF</CardTitle>
            <CardDescription>
              Private download link available briefly for this published version.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {documentStatus.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : documentStatus.data?.state === "available" ? (
              <Button
                disabled={documentDownload.isPending}
                onClick={() => documentDownload.mutate()}
              >
                Download PDF
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">PDF not available yet.</p>
            )}
            {documentDownload.error && (
              <p className="mt-2 text-sm text-destructive">
                {documentDownload.error instanceof Error
                  ? documentDownload.error.message
                  : "Secure download failed."}
              </p>
            )}
          </CardContent>
        </Card>
        <div className="grid gap-3">
          {report.entries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-start">
                <div>
                  <p className="font-semibold">{entry.subjectName}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {entry.narrative || "No subject narrative."}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xl font-semibold">
                    {entry.final_score === null ? (
                      <span className="text-sm font-normal text-muted-foreground">
                        No published result
                      </span>
                    ) : (
                      entry.final_score
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.predicate ?? "No predicate"}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attendance summary</CardTitle>
            <CardDescription>
              {typeof attendance["finalizedSessionCount"] === "number"
                ? attendance["finalizedSessionCount"]
                : 0}{" "}
              finalized sessions
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {["present", "late", "excused", "sick", "absent", "other"].map((key) => (
              <div key={key} className="rounded-md bg-muted p-3">
                <p className="text-xs capitalize text-muted-foreground">{key}</p>
                <p className="text-lg font-semibold">
                  {typeof counts[key] === "number" ? (counts[key] as number) : 0}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Homeroom comment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">
              {report.card.homeroom_comment || "No homeroom comment."}
            </p>
          </CardContent>
        </Card>
        {report.narratives.map((n) => (
          <Card key={n.id}>
            <CardHeader>
              <CardTitle className="text-base">{n.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{n.content}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyStudentPortal
        title="No published report cards yet"
        description="Once your school publishes a Report Card, it will appear here."
      />
    );
  }

  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <button key={row.id} className="text-left" onClick={() => setSelectedId(row.id)}>
          <Card className="transition-colors hover:border-primary/50">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{row.termName}</p>
                <p className="text-sm text-muted-foreground">
                  {row.studentName} · {row.academicYearName}
                </p>
              </div>
              <div className="sm:text-right">
                <Badge>Published · Version {row.version}</Badge>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(row.publishedAt).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  );
}

function error(query: { error: unknown }) {
  return Boolean(query.error);
}

export function StudentOverviewPage() {
  return (
    <StudentShell>
      <OverviewSection />
    </StudentShell>
  );
}

export function StudentSchedulePage() {
  return (
    <StudentShell>
      <ScheduleSection />
    </StudentShell>
  );
}

export function StudentAttendancePage() {
  return (
    <StudentShell>
      <AttendanceSection />
    </StudentShell>
  );
}

export function StudentScoresPage() {
  return (
    <StudentShell>
      <ScoresSection />
    </StudentShell>
  );
}

export function StudentReportCardsPage() {
  return (
    <StudentShell>
      <ReportCardsSection />
    </StudentShell>
  );
}
