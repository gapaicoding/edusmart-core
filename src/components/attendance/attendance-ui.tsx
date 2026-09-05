import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LockKeyhole, Plus, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  AcademicPage,
  Field,
  FormDialog,
  QueryState,
  StatusBadge,
} from "@/components/academic/academic-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/lib/app-context";
import { ATTENDANCE_SESSION_STATUSES, STUDENT_ATTENDANCE_STATUSES } from "@/lib/attendance.schemas";
import {
  changeAttendanceSessionLifecycle,
  getAttendanceOptions,
  getAttendanceSession,
  listAttendanceSessions,
  openAttendanceSession,
  saveStudentAttendanceRecord,
  type AttendanceRosterRow,
} from "@/lib/attendance.functions";

const ALL = "all";
const STATUS_LABELS: Record<string, string> = {
  present: "Present",
  late: "Late",
  excused: "Excused",
  sick: "Sick",
  absent: "Absent",
  other: "Other",
};
const today = () => new Date().toISOString().slice(0, 10);
const formatTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Jakarta",
      }).format(new Date(value))
    : null;
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "An unexpected attendance error occurred.";

function downloadCsv(rows: Array<Record<string, string | null>>) {
  const headings = Object.keys(rows[0] ?? { date: "", classroom: "", status: "", origin: "" });
  const quote = (value: string | null | undefined) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    headings.join(","),
    ...rows.map((row) => headings.map((key) => quote(row[key])).join(",")),
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance-${today()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function SessionOpener({
  scope,
  open,
  onOpenChange,
  onCreated,
}: {
  scope: { organizationId: string; schoolId: string; academicYearId: string; termId: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [date, setDate] = useState(today());
  const [origin, setOrigin] = useState<"timetable" | "manual">("timetable");
  const [timetableEntryId, setTimetableEntryId] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const options = useQuery({
    queryKey: ["attendance-options", scope, date],
    queryFn: () => getAttendanceOptions({ data: { ...scope, sessionDate: date } }),
    enabled: open && Boolean(date),
  });
  const mutation = useMutation({
    mutationFn: () =>
      openAttendanceSession({
        data:
          origin === "timetable"
            ? { ...scope, origin, sessionDate: date, timetableEntryId }
            : { ...scope, origin, sessionDate: date, classroomId, manualReason: reason },
      }),
    onSuccess: ({ id }) => {
      toast.success("Attendance session opened.");
      onCreated(id);
    },
    onError: (value) => setError(messageOf(value)),
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Open attendance session"
      description="Use today's published timetable, or document why a manual session is required."
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        mutation.mutate();
      }}
      submitLabel="Open session"
      submitting={mutation.isPending}
      error={error}
    >
      <div className="grid gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field label="Session date">
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={origin === "timetable" ? "default" : "outline"}
            onClick={() => setOrigin("timetable")}
          >
            Timetable
          </Button>
          <Button
            type="button"
            variant={origin === "manual" ? "default" : "outline"}
            onClick={() => setOrigin("manual")}
          >
            Manual
          </Button>
        </div>
        {origin === "timetable" ? (
          <Field label="Eligible timetable entry">
            <Select value={timetableEntryId} onValueChange={setTimetableEntryId} required>
              <SelectTrigger>
                <SelectValue placeholder={options.isLoading ? "Loading…" : "Choose a class"} />
              </SelectTrigger>
              <SelectContent>
                {options.data?.timetable.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label} · {item.hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!options.isLoading && !options.error && !options.data?.timetable.length && (
              <p className="text-xs text-muted-foreground">
                No unused published timetable entry is eligible on this date.
              </p>
            )}
          </Field>
        ) : (
          <>
            <Field label="Classroom">
              <Select value={classroomId} onValueChange={setClassroomId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Choose classroom" />
                </SelectTrigger>
                <SelectContent>
                  {options.data?.classrooms.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Manual-session reason">
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={3}
                maxLength={500}
                required
                placeholder="Explain why this session is outside the timetable"
              />
            </Field>
          </>
        )}
      </div>
    </FormDialog>
  );
}

export function AttendancePage() {
  const navigate = useNavigate();
  const { activeOrganization, activeSchool, activeAcademicYear, activeTerm, hasPermission } =
    useAppContext();
  const [date, setDate] = useState(today());
  const [classroomId, setClassroomId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [opener, setOpener] = useState(false);
  const scope =
    activeOrganization && activeSchool && activeAcademicYear && activeTerm
      ? {
          organizationId: activeOrganization.organizationId,
          schoolId: activeSchool.id,
          academicYearId: activeAcademicYear.id,
          termId: activeTerm.id,
        }
      : null;
  const options = useQuery({
    queryKey: ["attendance-options-filter", scope, date],
    queryFn: () => getAttendanceOptions({ data: { ...scope!, sessionDate: date } }),
    enabled: Boolean(scope) && hasPermission("attendance.read"),
  });
  const sessions = useQuery({
    queryKey: ["attendance-sessions", scope, date, classroomId, status],
    queryFn: () =>
      listAttendanceSessions({
        data: {
          ...scope!,
          sessionDate: date,
          classroomId: classroomId === ALL ? undefined : classroomId,
          status:
            status === ALL ? undefined : (status as (typeof ATTENDANCE_SESSION_STATUSES)[number]),
        },
      }),
    enabled: Boolean(scope) && hasPermission("attendance.read"),
  });
  return (
    <AcademicPage
      title="Attendance"
      description={`Operational attendance workspace for ${activeAcademicYear?.name ?? "the active year"} · ${activeTerm?.name ?? "select a term"}.`}
      readPermission="attendance.read"
      actions={
        <div className="flex gap-2">
          {hasPermission("attendance.export") && (
            <Button
              variant="outline"
              disabled={!sessions.data?.length}
              onClick={() =>
                downloadCsv(
                  (sessions.data ?? []).map((row) => ({
                    date: row.sessionDate,
                    classroom: row.classroomName,
                    status: row.status,
                    origin: row.origin,
                    subject: row.subjectName,
                    teacher: row.teacherName,
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
          {hasPermission("attendance.session.create") && (
            <Button onClick={() => setOpener(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Open session
            </Button>
          )}
        </div>
      }
    >
      {!scope ? (
        <Card>
          <CardHeader>
            <CardTitle>Select academic context</CardTitle>
            <CardDescription>
              Choose a school, academic year, and term to manage attendance.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
            <Field label="Session date">
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
            <Field label="Classroom">
              <Select value={classroomId} onValueChange={setClassroomId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All classrooms</SelectItem>
                  {options.data?.classrooms.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Lifecycle">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All states</SelectItem>
                  {ATTENDANCE_SESSION_STATUSES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <QueryState
            isLoading={sessions.isLoading}
            error={sessions.error}
            isEmpty={!sessions.data?.length}
            emptyTitle="No attendance sessions"
            emptyDescription="Open one from an eligible timetable entry or record a documented manual session."
            onRetry={() => sessions.refetch()}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sessions.data?.map((session) => (
                <Link
                  key={session.id}
                  to="/attendance/session/$id"
                  params={{ id: session.id }}
                  className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Card className="h-full transition-colors hover:bg-muted/40">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{session.classroomName}</CardTitle>
                        <StatusBadge status={session.status} />
                      </div>
                      <CardDescription>
                        {session.sessionDate}
                        {session.startsAt
                          ? ` · ${formatTime(session.startsAt)}–${formatTime(session.endsAt)}`
                          : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p>{session.subjectName ?? "Manual attendance"}</p>
                      <p className="text-muted-foreground">
                        {session.teacherName ?? session.manualReason}
                      </p>
                      <Badge variant="outline">{session.origin}</Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </QueryState>
          <SessionOpener
            scope={scope}
            open={opener}
            onOpenChange={setOpener}
            onCreated={(id) => navigate({ to: "/attendance/session/$id", params: { id } })}
          />
        </div>
      )}
    </AcademicPage>
  );
}

function CorrectionDialog({
  row,
  locked,
  open,
  onOpenChange,
  onSave,
}: {
  row: AttendanceRosterRow;
  locked: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (status: string, reason: string) => void;
}) {
  const [status, setStatus] = useState(row.status ?? "present");
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {locked ? "Correct locked attendance" : "Correct submitted attendance"}
          </DialogTitle>
          <DialogDescription>
            This privileged correction is recorded in the database audit trail. The session will not
            be unlocked.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Correct status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STUDENT_ATTENDANCE_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Correction reason">
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={3}
              required
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={reason.trim().length < 3} onClick={() => onSave(status, reason.trim())}>
            Save audited correction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AttendanceSessionPage({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { activeOrganization, activeSchool, activeAcademicYear, activeTerm, hasPermission } =
    useAppContext();
  const [selected, setSelected] = useState<AttendanceRosterRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scope =
    activeOrganization && activeSchool && activeAcademicYear && activeTerm
      ? {
          organizationId: activeOrganization.organizationId,
          schoolId: activeSchool.id,
          academicYearId: activeAcademicYear.id,
          termId: activeTerm.id,
        }
      : null;
  const queryKey = ["attendance-session", scope, id];
  const session = useQuery({
    queryKey,
    queryFn: () => getAttendanceSession({ data: { ...scope!, id } }),
    enabled: Boolean(scope) && hasPermission("attendance.read"),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };
  const record = useMutation({
    mutationFn: ({
      row,
      status,
      reason,
    }: {
      row: AttendanceRosterRow;
      status: string;
      reason?: string;
    }) =>
      saveStudentAttendanceRecord({
        data: {
          ...scope!,
          sessionId: id,
          recordId: row.recordId ?? undefined,
          studentEnrollmentId: row.studentEnrollmentId,
          status: status as (typeof STUDENT_ATTENDANCE_STATUSES)[number],
          note: row.note,
          correctionReason: reason ?? null,
        },
      }),
    onSuccess: async () => {
      setSelected(null);
      setError(null);
      await refresh();
      toast.success("Attendance saved.");
    },
    onError: (value) => setError(messageOf(value)),
  });
  const lifecycle = useMutation({
    mutationFn: (action: "submit" | "lock") =>
      changeAttendanceSessionLifecycle({
        data: { ...scope!, id, action, expectedUpdatedAt: session.data!.updatedAt },
      }),
    onSuccess: async () => {
      setError(null);
      await refresh();
      toast.success("Attendance lifecycle updated.");
    },
    onError: (value) => setError(messageOf(value)),
  });
  const data = session.data;
  const marked = useMemo(() => data?.roster.filter((row) => row.status).length ?? 0, [data]);
  const canDirectEdit = data?.status === "open" && hasPermission("attendance.record");
  const canCorrect =
    data?.status === "submitted"
      ? hasPermission("attendance.correct_open")
      : data?.status === "locked" || data?.status === "corrected"
        ? hasPermission("attendance.correct_locked")
        : false;
  return (
    <AcademicPage
      title="Attendance Session"
      description="Record the dated classroom roster, then submit and lock it through the authoritative lifecycle."
      readPermission="attendance.read"
      actions={
        <Button variant="outline" asChild>
          <Link to="/attendance">Back to attendance</Link>
        </Button>
      }
    >
      {!scope ? (
        <Card>
          <CardHeader>
            <CardTitle>Select academic context</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <QueryState
          isLoading={session.isLoading}
          error={session.error}
          isEmpty={!data}
          emptyTitle="Session unavailable"
          emptyDescription="This session is outside your current context or permission scope."
          onRetry={() => session.refetch()}
        >
          {data && (
            <div className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{data.classroomName}</CardTitle>
                      <CardDescription>
                        {data.sessionDate} · {data.subjectName ?? "Manual session"}
                        {data.teacherName ? ` · ${data.teacherName}` : ""}
                      </CardDescription>
                    </div>
                    <StatusBadge status={data.status} />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{data.origin}</Badge>
                  {data.startsAt && (
                    <span>
                      {formatTime(data.startsAt)}–{formatTime(data.endsAt)}
                    </span>
                  )}
                  {data.manualReason && <span>Reason: {data.manualReason}</span>}
                  {data.lockedAt && <span>Locked {new Date(data.lockedAt).toLocaleString()}</span>}
                </CardContent>
              </Card>
              <div className="grid gap-3">
                {data.roster.map((row) => (
                  <Card key={row.studentEnrollmentId}>
                    <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(180px,1fr)_auto] lg:items-center">
                      <div>
                        <p className="font-medium">{row.studentName}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.studentNumber ?? "No student number"}
                          {row.note ? ` · ${row.note}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {STUDENT_ATTENDANCE_STATUSES.map((value) => (
                          <Button
                            key={value}
                            type="button"
                            size="sm"
                            className="min-h-11 min-w-[76px]"
                            variant={row.status === value ? "default" : "outline"}
                            disabled={record.isPending || (!canDirectEdit && !canCorrect)}
                            onClick={() =>
                              canDirectEdit
                                ? record.mutate({ row, status: value })
                                : setSelected(row)
                            }
                          >
                            {STATUS_LABELS[value]}
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {!data.roster.length && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">No students in the dated roster</CardTitle>
                    <CardDescription>
                      No primary class placement covers this session date.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
              <Card
                className={
                  data.status === "locked" || data.status === "corrected"
                    ? "border-amber-300 bg-amber-50/40"
                    : ""
                }
              >
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">
                      {marked} of {data.roster.length} students marked
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {data.status === "open"
                        ? "Review the roster before submitting. Submission ends ordinary editing."
                        : "This is protected historical attendance."}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {data.status === "open" && hasPermission("attendance.submit") && (
                      <Button
                        disabled={lifecycle.isPending}
                        onClick={() => lifecycle.mutate("submit")}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Submit
                      </Button>
                    )}
                    {data.status === "submitted" && hasPermission("attendance.lock") && (
                      <Button
                        disabled={lifecycle.isPending}
                        onClick={() => lifecycle.mutate("lock")}
                      >
                        <LockKeyhole className="mr-2 h-4 w-4" />
                        Lock
                      </Button>
                    )}
                    {(data.status === "locked" || data.status === "corrected") && (
                      <Badge variant="outline">
                        <ShieldCheck className="mr-1 h-3 w-3" />
                        Locked history
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
              {selected && (
                <CorrectionDialog
                  row={selected}
                  locked={data.status === "locked" || data.status === "corrected"}
                  open
                  onOpenChange={(value) => {
                    if (!value) setSelected(null);
                  }}
                  onSave={(status, reason) => record.mutate({ row: selected, status, reason })}
                />
              )}
            </div>
          )}
        </QueryState>
      )}
    </AcademicPage>
  );
}
