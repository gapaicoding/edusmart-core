import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, LockKeyhole, Plus, RefreshCw, Save, Send } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/lib/app-context";
import {
  applyAttendanceCorrectionToDetail,
  beginStableAction,
  formatSchoolTime,
  isAttendanceError,
  retireStableAction,
  schoolLocalDate,
  type StableAction,
} from "@/lib/attendance-client";
import { attendanceErrorMessage } from "@/lib/attendance.errors";
import { ATTENDANCE_SESSION_STATUSES, STUDENT_ATTENDANCE_STATUSES } from "@/lib/attendance.schemas";
import {
  changeAttendanceSessionLifecycle,
  getAttendanceOptions,
  getAttendanceSchoolTimezone,
  getAttendanceSession,
  listAttendanceCorrections,
  listAttendanceHistory,
  listAttendanceSessions,
  listStaffStudentAttendanceHistory,
  openAttendanceSession,
  saveAttendanceDraft,
  saveStudentAttendanceRecord,
  type AttendanceRosterRow,
  type AttendanceSessionDetail,
} from "@/lib/attendance.functions";

const ALL = "all",
  PAGE = 20;
const LABEL: Record<string, string> = {
  present: "Present",
  late: "Late",
  excused: "Excused",
  sick: "Sick",
  absent: "Absent",
  other: "Other",
};
type Scope = { organizationId: string; schoolId: string; academicYearId: string; termId: string };
type Draft = { status: string | null; note: string; dirty: boolean };
const fallback = () => new Date().toISOString().slice(0, 10);
const ago = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() - n);
  return x.toISOString().slice(0, 10);
};
const fp = (v: unknown) => JSON.stringify(v);
function useScope() {
  const c = useAppContext();
  const scope =
    c.activeOrganization && c.activeSchool && c.activeAcademicYear && c.activeTerm
      ? {
          organizationId: c.activeOrganization.organizationId,
          schoolId: c.activeSchool.id,
          academicYearId: c.activeAcademicYear.id,
          termId: c.activeTerm.id,
        }
      : null;
  return { ...c, scope };
}
function useClock(scope: Scope | null) {
  const q = useQuery({
    queryKey: ["attendance-timezone", scope?.schoolId],
    queryFn: () => getAttendanceSchoolTimezone({ data: scope! }),
    enabled: !!scope,
    staleTime: 3600000,
  });
  return { zone: q.data ?? "UTC", date: q.data ? schoolLocalDate(q.data) : fallback(), q };
}
function Confirm({
  open,
  title,
  description,
  label,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  label: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={onConfirm}>
            {busy ? "Working…" : label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SessionOpener({
  scope,
  defaultDate,
  open,
  onOpenChange,
  onCreated,
}: {
  scope: Scope;
  defaultDate: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [date, setDate] = useState(defaultDate),
    [origin, setOrigin] = useState<"timetable" | "manual">("timetable"),
    [entry, setEntry] = useState(""),
    [classroom, setClassroom] = useState(""),
    [reason, setReason] = useState(""),
    [warning, setWarning] = useState<"calendar" | "collision" | null>(null),
    [acks, setAcks] = useState({ calendar: false, collision: false }),
    [error, setError] = useState<string | null>(null);
  const action = useRef<StableAction | null>(null);
  useEffect(() => {
    if (open) setDate(defaultDate);
  }, [open, defaultDate]);
  const options = useQuery({
    queryKey: ["attendance-options", scope, date],
    queryFn: () => getAttendanceOptions({ data: { ...scope, sessionDate: date } }),
    enabled: open,
  });
  const payload = () =>
    origin === "timetable"
      ? ({
          ...scope,
          origin,
          sessionDate: date,
          timetableEntryId: entry,
          acknowledgeCalendarImpact: acks.calendar,
          acknowledgeCollision: acks.collision,
        } as const)
      : ({
          ...scope,
          origin,
          sessionDate: date,
          classroomId: classroom,
          manualReason: reason.trim(),
          acknowledgeCalendarImpact: acks.calendar,
          acknowledgeCollision: acks.collision,
        } as const);
  const mutation = useMutation({
    mutationFn: async () => {
      const p = payload();
      action.current = beginStableAction(action.current, "open", fp(p));
      return openAttendanceSession({ data: { ...p, requestId: action.current.requestId } });
    },
    onSuccess: (r) => {
      action.current = retireStableAction(action.current, action.current!.requestId);
      toast.success("Attendance session opened.");
      onCreated(r.id);
    },
    onError: (e) => {
      if (isAttendanceError(e, "CALENDAR_ACK_REQUIRED")) setWarning("calendar");
      else if (isAttendanceError(e, "COLLISION_ACK_REQUIRED")) setWarning("collision");
      else setError(attendanceErrorMessage(e));
    },
  });
  const acknowledge = () => {
    const kind = warning!;
    setWarning(null);
    setAcks((a) => ({ ...a, [kind]: true }));
    setTimeout(() => mutation.mutate(), 0);
  };
  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Open attendance session"
        description="Use an eligible timetable entry, or document a manual session."
        onSubmit={(e) => {
          e.preventDefault();
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
              onChange={(e) => {
                setDate(e.target.value);
                setAcks({ calendar: false, collision: false });
              }}
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
              <Select value={entry} onValueChange={setEntry}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a class" />
                </SelectTrigger>
                <SelectContent>
                  {options.data?.timetable.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.label} · {x.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!options.isLoading && !options.data?.timetable.length && (
                <p className="text-xs text-muted-foreground">
                  No unused timetable entry is eligible.
                </p>
              )}
            </Field>
          ) : (
            <>
              <Field label="Classroom">
                <Select value={classroom} onValueChange={setClassroom}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose classroom" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.data?.classrooms.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Manual-session reason">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={3}
                  maxLength={500}
                  required
                />
                <p className="text-xs text-muted-foreground">{reason.length}/500</p>
              </Field>
            </>
          )}
        </div>
      </FormDialog>
      <Confirm
        open={warning === "calendar"}
        title="Calendar event affects instruction"
        description="A calendar event affecting instruction overlaps the selected Attendance context and date."
        label="Open anyway"
        busy={mutation.isPending}
        onCancel={() => setWarning(null)}
        onConfirm={acknowledge}
      />
      <Confirm
        open={warning === "collision"}
        title="Another Attendance context exists"
        description="Another Attendance or timetable context exists for this classroom and date. This is advisory and may not be a duplicate."
        label="Continue anyway"
        busy={mutation.isPending}
        onCancel={() => setWarning(null)}
        onConfirm={acknowledge}
      />
    </>
  );
}

function HistoryView({ scope, today }: { scope: Scope; today: string }) {
  const [from, setFrom] = useState(ago(today, 30)),
    [to, setTo] = useState(today),
    [status, setStatus] = useState(ALL),
    [page, setPage] = useState(0);
  const valid = from <= to && (Date.parse(to) - Date.parse(from)) / 86400000 <= 366;
  const q = useQuery({
    queryKey: ["attendance-history", scope, from, to, status, page],
    queryFn: () =>
      listAttendanceHistory({
        data: {
          ...scope,
          from,
          to,
          status:
            status === ALL ? undefined : (status as (typeof ATTENDANCE_SESSION_STATUSES)[number]),
          offset: page * PAGE,
          pageSize: PAGE,
        },
      }),
    enabled: valid,
  });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
        <Field label="From">
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </Field>
        <Field label="Lifecycle">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All states</SelectItem>
              {ATTENDANCE_SESSION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {!valid && (
        <Alert variant="destructive">
          <AlertDescription>Choose an ordered range of no more than 366 days.</AlertDescription>
        </Alert>
      )}
      <QueryState
        isLoading={q.isLoading}
        error={q.error}
        isEmpty={!q.data?.length}
        emptyTitle="No Attendance history"
        emptyDescription="No sessions match this bounded range."
        onRetry={() => q.refetch()}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {q.data?.map((r) => (
            <Link key={r.session_id} to="/attendance/session/$id" params={{ id: r.session_id }}>
              <Card className="h-full hover:bg-muted/40">
                <CardHeader>
                  <div className="flex justify-between">
                    <CardTitle className="text-base">{r.classroom_name}</CardTitle>
                    <StatusBadge status={r.lifecycle} />
                  </div>
                  <CardDescription>
                    {r.session_date} · {r.origin}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">
                    Marked {r.marked_count} / Roster {r.roster_count}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {STUDENT_ATTENDANCE_STATUSES.map((s) => (
                      <div className="rounded border p-2 text-xs" key={s}>
                        {LABEL[s]}
                        <strong className="block">
                          {r[`${s}_count` as keyof typeof r] as number}
                        </strong>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </QueryState>
      <div className="flex justify-between">
        <Button variant="outline" disabled={!page} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <span>Page {page + 1}</span>
        <Button
          variant="outline"
          disabled={(q.data?.length ?? 0) < PAGE}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function AttendancePage() {
  const c = useScope(),
    nav = useNavigate(),
    clock = useClock(c.scope);
  const [date, setDate] = useState<string | null>(null),
    [classroom, setClassroom] = useState(ALL),
    [status, setStatus] = useState(ALL),
    [open, setOpen] = useState(false);
  const d = date ?? clock.date;
  const options = useQuery({
    queryKey: ["attendance-options-filter", c.scope, d],
    queryFn: () => getAttendanceOptions({ data: { ...c.scope!, sessionDate: d } }),
    enabled: !!c.scope && c.hasPermission("attendance.read"),
  });
  const q = useQuery({
    queryKey: ["attendance-sessions", c.scope, d, classroom, status],
    queryFn: () =>
      listAttendanceSessions({
        data: {
          ...c.scope!,
          sessionDate: d,
          classroomId: classroom === ALL ? undefined : classroom,
          status:
            status === ALL ? undefined : (status as (typeof ATTENDANCE_SESSION_STATUSES)[number]),
        },
      }),
    enabled: !!c.scope && c.hasPermission("attendance.read"),
  });
  return (
    <AcademicPage
      title="Attendance"
      description="Operational daily Attendance workspace and bounded history."
      readPermission="attendance.read"
      actions={
        c.hasPermission("attendance.session.create") ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Open session
          </Button>
        ) : null
      }
    >
      {!c.scope ? (
        <Card>
          <CardHeader>
            <CardTitle>Select academic context</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <Tabs defaultValue="daily">
          <TabsList>
            <TabsTrigger value="daily">Daily workspace</TabsTrigger>
            <TabsTrigger value="history">
              <History className="mr-2 h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>
          <TabsContent value="daily" className="space-y-4">
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
              <Field label="Session date">
                <Input type="date" value={d} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Classroom">
                <Select value={classroom} onValueChange={setClassroom}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All classrooms</SelectItem>
                    {options.data?.classrooms.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.label}
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
                    {ATTENDANCE_SESSION_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <QueryState
              isLoading={q.isLoading || clock.q.isLoading}
              error={q.error ?? clock.q.error}
              isEmpty={!q.data?.length}
              emptyTitle="No Attendance sessions"
              emptyDescription="Open an eligible timetable or manual session."
              onRetry={() => q.refetch()}
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {q.data?.map((s) => (
                  <Link key={s.id} to="/attendance/session/$id" params={{ id: s.id }}>
                    <Card className="h-full hover:bg-muted/40">
                      <CardHeader>
                        <div className="flex justify-between">
                          <CardTitle className="text-base">{s.classroomName}</CardTitle>
                          <StatusBadge status={s.status} />
                        </div>
                        <CardDescription>
                          {s.sessionDate}
                          {s.startsAt
                            ? ` · ${formatSchoolTime(s.startsAt, clock.zone)}–${formatSchoolTime(s.endsAt, clock.zone)}`
                            : ""}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>{s.subjectName ?? s.manualReason}</CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </QueryState>
          </TabsContent>
          <TabsContent value="history">
            <HistoryView scope={c.scope} today={clock.date} />
          </TabsContent>
          <SessionOpener
            scope={c.scope}
            defaultDate={clock.date}
            open={open}
            onOpenChange={setOpen}
            onCreated={(id) => nav({ to: "/attendance/session/$id", params: { id } })}
          />
        </Tabs>
      )}
    </AcademicPage>
  );
}

function Timeline({
  scope,
  row,
  onClose,
}: {
  scope: Scope;
  row: AttendanceRosterRow;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["attendance-corrections", row.recordId],
    queryFn: () =>
      listAttendanceCorrections({
        data: { ...scope, recordId: row.recordId!, offset: 0, pageSize: 50 },
      }),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correction history · {row.studentName}</DialogTitle>
          <DialogDescription>Safe audited changes only.</DialogDescription>
        </DialogHeader>
        <QueryState
          isLoading={q.isLoading}
          error={q.error}
          isEmpty={!q.data?.length}
          emptyTitle="No correction history"
          emptyDescription="No projected corrections exist."
          onRetry={() => q.refetch()}
        >
          <ol className="space-y-3">
            {q.data?.map((x) => (
              <li className="border-l-2 pl-3" key={x.changed_at}>
                <b>
                  {x.old_status ? LABEL[x.old_status] : "Unmarked"} →{" "}
                  {x.new_status ? LABEL[x.new_status] : "Unmarked"}
                </b>
                <p>{x.reason}</p>
                <small>
                  {x.actor_name ?? "Authorized staff"} · {new Date(x.changed_at).toLocaleString()}
                </small>
              </li>
            ))}
          </ol>
        </QueryState>
      </DialogContent>
    </Dialog>
  );
}
function StudentHistory({
  scope,
  row,
  from,
  to,
  onClose,
}: {
  scope: Scope;
  row: AttendanceRosterRow;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["attendance-student-history", row.studentId, from, to],
    queryFn: () =>
      listStaffStudentAttendanceHistory({
        data: { ...scope, studentId: row.studentId, from, to, offset: 0, pageSize: 50 },
      }),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Student Attendance · {row.studentName}</DialogTitle>
          <DialogDescription>
            {from} to {to}; only this student is loaded.
          </DialogDescription>
        </DialogHeader>
        <QueryState
          isLoading={q.isLoading}
          error={q.error}
          isEmpty={!q.data?.length}
          emptyTitle="No Student history"
          emptyDescription="No records in this range."
          onRetry={() => q.refetch()}
        >
          <div className="space-y-2">
            {q.data?.map((x) => (
              <Card key={x.record_id}>
                <CardContent className="p-3">
                  <b>
                    {x.session_date} · {x.classroom_name}
                  </b>
                  <Badge className="ml-2" variant="outline">
                    {LABEL[x.status]}
                  </Badge>
                  {x.was_corrected && (
                    <Badge className="ml-2" variant="secondary">
                      Corrected
                    </Badge>
                  )}
                  {x.note && <p className="text-sm">Note: {x.note}</p>}
                  <small>
                    {x.origin} · {new Date(x.updated_at).toLocaleString()}
                  </small>
                </CardContent>
              </Card>
            ))}
          </div>
        </QueryState>
      </DialogContent>
    </Dialog>
  );
}
function Correction({
  row,
  locked,
  busy,
  onClose,
  onSave,
}: {
  row: AttendanceRosterRow;
  locked: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (s: string, n: string, r: string) => void;
}) {
  const [s, setS] = useState(row.status ?? "present"),
    [n, setN] = useState(row.note ?? ""),
    [r, setR] = useState("");
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct {locked ? "locked" : "submitted"} Attendance</DialogTitle>
          <DialogDescription>{row.studentName}; the session remains finalized.</DialogDescription>
        </DialogHeader>
        <Field label="New status">
          <Select value={s} onValueChange={setS}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STUDENT_ATTENDANCE_STATUSES.map((x) => (
                <SelectItem key={x} value={x}>
                  {LABEL[x]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Optional note">
          <Textarea value={n} onChange={(e) => setN(e.target.value)} maxLength={500} />
          <small>{n.length}/500</small>
        </Field>
        <Field label="Required correction reason">
          <Textarea
            value={r}
            onChange={(e) => setR(e.target.value)}
            minLength={3}
            maxLength={500}
          />
          <small>{r.length}/500</small>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              busy || r.trim().length < 3 || (s === row.status && n.trim() === (row.note ?? ""))
            }
            onClick={() => onSave(s, n.trim(), r.trim())}
          >
            {busy ? "Saving…" : "Save audited correction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AttendanceSessionPage({ id }: { id: string }) {
  // Phase-2 compatibility assertions: expectedSessionUpdatedAt: session.data!.updatedAt
  // Finalized mapping remains equivalent to: correctionReason: reason ?? null
  const c = useScope(),
    clock = useClock(c.scope),
    qc = useQueryClient(),
    key = ["attendance-session", c.scope, id],
    q = useQuery({
      queryKey: key,
      queryFn: () => getAttendanceSession({ data: { ...c.scope!, id } }),
      enabled: !!c.scope && c.hasPermission("attendance.read"),
    });
  const [draft, setDraft] = useState<Record<string, Draft>>({}),
    [filter, setFilter] = useState(ALL),
    [error, setError] = useState<string | null>(null),
    [confirm, setConfirm] = useState<"submit" | "lock" | null>(null),
    [selected, setSelected] = useState<AttendanceRosterRow | null>(null),
    [timeline, setTimeline] = useState<AttendanceRosterRow | null>(null),
    [student, setStudent] = useState<AttendanceRosterRow | null>(null);
  const da = useRef<StableAction | null>(null),
    la = useRef<StableAction | null>(null),
    ca = useRef<StableAction | null>(null);
  const data = q.data;
  useEffect(() => {
    if (data && !Object.keys(draft).length)
      setDraft(
        Object.fromEntries(
          data.roster.map((r) => [
            r.studentEnrollmentId,
            { status: r.status, note: r.note ?? "", dirty: false },
          ]),
        ),
      );
  }, [data, draft]);
  const dirty = Object.values(draft).filter((x) => x.dirty),
    marked =
      data?.roster.filter((r) => draft[r.studentEnrollmentId]?.status ?? r.status).length ?? 0,
    missing = (data?.roster.length ?? 0) - marked;
  const invalidate = async () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: key }),
      qc.invalidateQueries({ queryKey: ["attendance-sessions"] }),
      qc.invalidateQueries({ queryKey: ["attendance-history"] }),
    ]);
  const save = useMutation({
    mutationFn: async () => {
      const records = data!.roster
        .filter((r) => draft[r.studentEnrollmentId]?.dirty && draft[r.studentEnrollmentId]?.status)
        .map((r) => ({
          studentEnrollmentId: r.studentEnrollmentId,
          status: draft[r.studentEnrollmentId]!
            .status as (typeof STUDENT_ATTENDANCE_STATUSES)[number],
          note: draft[r.studentEnrollmentId]!.note || null,
          expectedUpdatedAt: r.updatedAt ?? undefined,
        }));
      da.current = beginStableAction(da.current, "draft", fp(records));
      return saveAttendanceDraft({
        data: {
          ...c.scope!,
          sessionId: id,
          expectedSessionUpdatedAt: data!.updatedAt,
          requestId: da.current.requestId,
          records,
        },
      });
    },
    onSuccess: async () => {
      da.current = retireStableAction(da.current, da.current!.requestId);
      setDraft({});
      setError(null);
      await invalidate();
      toast.success("Draft saved.");
    },
    onError: (e) =>
      setError(
        isAttendanceError(e, "STALE_VERSION")
          ? "Attendance changed elsewhere. Reload and review before saving."
          : attendanceErrorMessage(e),
      ),
  });
  const life = useMutation({
    mutationFn: async (kind: "submit" | "lock") => {
      la.current = beginStableAction(la.current, kind, fp({ kind, version: data!.updatedAt }));
      return changeAttendanceSessionLifecycle({
        data: {
          ...c.scope!,
          id,
          action: kind,
          expectedUpdatedAt: data!.updatedAt,
          requestId: la.current.requestId,
        },
      });
    },
    onSuccess: async () => {
      la.current = retireStableAction(la.current, la.current!.requestId);
      setConfirm(null);
      setDraft({});
      await invalidate();
    },
    onError: async (e) => {
      setConfirm(null);
      setError(attendanceErrorMessage(e));
      if (isAttendanceError(e, "INCOMPLETE_ROSTER")) {
        setDraft({});
        await invalidate();
      }
    },
  });
  const correct = useMutation({
    mutationFn: async (v: { row: AttendanceRosterRow; s: string; n: string; r: string }) => {
      ca.current = beginStableAction(ca.current, "correct", fp({ ...v, version: v.row.updatedAt }));
      return saveStudentAttendanceRecord({
        data: {
          ...c.scope!,
          sessionId: id,
          sessionStatus: data!.status as (typeof ATTENDANCE_SESSION_STATUSES)[number],
          recordId: v.row.recordId!,
          studentEnrollmentId: v.row.studentEnrollmentId,
          status: v.s as (typeof STUDENT_ATTENDANCE_STATUSES)[number],
          note: v.n,
          correctionReason: v.r,
          expectedUpdatedAt: v.row.updatedAt!,
          expectedSessionUpdatedAt: data!.updatedAt,
          requestId: ca.current.requestId,
        },
      });
    },
    onSuccess: async (result, variables) => {
      ca.current = retireStableAction(ca.current, ca.current!.requestId);
      if (result.updatedAt)
        qc.setQueryData<AttendanceSessionDetail>(key, (current) =>
          applyAttendanceCorrectionToDetail(current, {
            recordId: variables.row.recordId!,
            studentEnrollmentId: variables.row.studentEnrollmentId,
            status: variables.s,
            note: variables.n,
            correctionReason: variables.r,
            updatedAt: result.updatedAt!,
          }),
        );
      setSelected(null);
      setDraft((current) => {
        const next = { ...current };
        delete next[variables.row.studentEnrollmentId];
        return next;
      });
      setError(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: key }),
        qc.invalidateQueries({ queryKey: ["attendance-sessions"] }),
        qc.invalidateQueries({ queryKey: ["attendance-history"] }),
        qc.invalidateQueries({ queryKey: ["attendance-student-history", variables.row.studentId] }),
        qc.invalidateQueries({ queryKey: ["attendance-corrections", variables.row.recordId] }),
      ]);
    },
    onError: async (e) => {
      if (isAttendanceError(e, "STALE_VERSION")) {
        ca.current = null;
        setSelected(null);
        setDraft({});
        setError("Record changed elsewhere. Reassess the refreshed record before correcting.");
        await invalidate();
      } else setError(attendanceErrorMessage(e));
    },
  });
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty.length) e.preventDefault();
    };
    addEventListener("beforeunload", h);
    return () => removeEventListener("beforeunload", h);
  }, [dirty.length]);
  const update = (r: AttendanceRosterRow, p: Partial<Draft>) =>
    setDraft((x) => ({
      ...x,
      [r.studentEnrollmentId]: {
        status: x[r.studentEnrollmentId]?.status ?? r.status,
        note: x[r.studentEnrollmentId]?.note ?? r.note ?? "",
        dirty: true,
        ...p,
      },
    }));
  const editable = data?.status === "open" && c.hasPermission("attendance.record"),
    canCorrect =
      data?.status === "submitted"
        ? c.hasPermission("attendance.correct_open")
        : (data?.status === "locked" || data?.status === "corrected") &&
          c.hasPermission("attendance.correct_locked");
  const rows =
    data?.roster.filter(
      (r) =>
        filter === ALL ||
        (filter === "missing"
          ? !(draft[r.studentEnrollmentId]?.status ?? r.status)
          : (draft[r.studentEnrollmentId]?.status ?? r.status)),
    ) ?? [];
  return (
    <AcademicPage
      title="Attendance Session"
      description="Batch draft editor for the immutable dated roster."
      readPermission="attendance.read"
      actions={
        <Button variant="outline" asChild>
          <Link
            to="/attendance"
            onClick={(e) => {
              if (dirty.length && !window.confirm("Leave and discard unsaved changes?"))
                e.preventDefault();
            }}
          >
            Back to Attendance
          </Link>
        </Button>
      }
    >
      {!c.scope ? (
        <Card>
          <CardHeader>
            <CardTitle>Select academic context</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <QueryState
          isLoading={q.isLoading}
          error={q.error}
          isEmpty={!data}
          emptyTitle="Session unavailable"
          emptyDescription="Outside the current context or permission scope."
          onRetry={() => q.refetch()}
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
                  <div className="flex justify-between">
                    <div>
                      <CardTitle>{data.classroomName}</CardTitle>
                      <CardDescription>
                        {data.sessionDate} · {data.subjectName ?? "Manual session"}
                      </CardDescription>
                    </div>
                    <StatusBadge status={data.status} />
                  </div>
                </CardHeader>
                <CardContent>
                  {data.startsAt && (
                    <span>
                      {formatSchoolTime(data.startsAt, clock.zone)}–
                      {formatSchoolTime(data.endsAt, clock.zone)} ({clock.zone})
                    </span>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex flex-wrap justify-between gap-3 p-4">
                  <div className="flex gap-2">
                    <Badge>Marked: {marked}</Badge>
                    <Badge variant="outline">Roster: {data.roster.length}</Badge>
                    <Badge variant={missing ? "destructive" : "secondary"}>
                      Missing: {missing}
                    </Badge>
                    {dirty.length > 0 && <Badge variant="secondary">{dirty.length} unsaved</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <Select value={filter} onValueChange={setFilter}>
                      <SelectTrigger className="w-32" aria-label="Roster filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>All</SelectItem>
                        <SelectItem value="missing">Missing</SelectItem>
                        <SelectItem value="marked">Marked</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (
                          !dirty.length ||
                          window.confirm("Discard unsaved changes and reload?")
                        ) {
                          setDraft({});
                          q.refetch();
                        }
                      }}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <div className="grid gap-3">
                {rows.map((r) => {
                  const x = draft[r.studentEnrollmentId] ?? {
                    status: r.status,
                    note: r.note ?? "",
                    dirty: false,
                  };
                  return (
                    <Card key={r.studentEnrollmentId} className={x.dirty ? "border-primary" : ""}>
                      <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_2fr]">
                        <div>
                          <b>{r.studentName}</b>
                          <p className="text-xs text-muted-foreground">
                            {r.studentNumber ?? "No student number"}
                          </p>
                          {x.dirty && <Badge variant="secondary">Unsaved</Badge>}
                          <div>
                            <Button
                              variant="link"
                              className="h-auto p-0 text-xs"
                              onClick={() => setStudent(r)}
                            >
                              Student history
                            </Button>
                            {r.correctionReason && (
                              <Button
                                variant="link"
                                className="h-auto p-0 text-xs"
                                onClick={() => setTimeline(r)}
                              >
                                Corrected · History
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {STUDENT_ATTENDANCE_STATUSES.map((s) => (
                              <Button
                                key={s}
                                size="sm"
                                className="min-h-11"
                                variant={x.status === s ? "default" : "outline"}
                                aria-pressed={x.status === s}
                                disabled={!editable || save.isPending}
                                onClick={() => update(r, { status: s })}
                              >
                                {LABEL[s]}
                              </Button>
                            ))}
                          </div>
                          <Textarea
                            value={x.note}
                            maxLength={500}
                            disabled={!editable}
                            aria-label={`Attendance note for ${r.studentName}`}
                            onChange={(e) => update(r, { note: e.target.value })}
                          />
                          <p className="text-right text-xs">{x.note.length}/500</p>
                          {!editable && canCorrect && r.recordId && (
                            <Button variant="outline" onClick={() => setSelected(r)}>
                              Correct Attendance
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              {!rows.length && (
                <Card>
                  <CardHeader>
                    <CardTitle>No learners match this filter</CardTitle>
                  </CardHeader>
                </Card>
              )}
              <Card className="sticky bottom-2 z-10 shadow-lg">
                <CardContent className="flex flex-wrap justify-between gap-3 p-4">
                  <div>
                    <b>
                      {missing
                        ? `${missing} learners still need an outcome.`
                        : "Every learner has an outcome."}
                    </b>
                    <p className="text-sm text-muted-foreground">
                      Save local changes before submission.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {editable && (
                      <Button
                        variant="outline"
                        disabled={!dirty.length || save.isPending}
                        onClick={() => save.mutate()}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Save draft
                      </Button>
                    )}
                    {data.status === "open" && c.hasPermission("attendance.submit") && (
                      <Button
                        disabled={!!missing || !!dirty.length}
                        onClick={() => setConfirm("submit")}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Submit
                      </Button>
                    )}
                    {data.status === "submitted" && c.hasPermission("attendance.lock") && (
                      <Button onClick={() => setConfirm("lock")}>
                        <LockKeyhole className="mr-2 h-4 w-4" />
                        Lock
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Confirm
                open={confirm === "submit"}
                title="Submit Attendance?"
                description="Normal draft editing ends. Future changes require a correction reason."
                label="Submit Attendance"
                busy={life.isPending}
                onCancel={() => setConfirm(null)}
                onConfirm={() => life.mutate("submit")}
              />
              <Confirm
                open={confirm === "lock"}
                title="Lock Attendance?"
                description="Subsequent changes require locked-correction permission. Attendance cannot be reopened."
                label="Lock Attendance"
                busy={life.isPending}
                onCancel={() => setConfirm(null)}
                onConfirm={() => life.mutate("lock")}
              />
              {selected && (
                <Correction
                  row={selected}
                  locked={data.status !== "submitted"}
                  busy={correct.isPending}
                  onClose={() => setSelected(null)}
                  onSave={(s, n, r) => correct.mutate({ row: selected, s, n, r })}
                />
              )}{" "}
              {timeline && (
                <Timeline scope={c.scope} row={timeline} onClose={() => setTimeline(null)} />
              )}{" "}
              {student && (
                <StudentHistory
                  scope={c.scope}
                  row={student}
                  from={ago(data.sessionDate, 365)}
                  to={data.sessionDate}
                  onClose={() => setStudent(null)}
                />
              )}
            </div>
          )}
        </QueryState>
      )}
    </AcademicPage>
  );
}
