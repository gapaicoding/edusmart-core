import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CalendarClock, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { AcademicPage, Field, FormDialog, StatusBadge } from "@/components/academic/academic-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppContext } from "@/lib/app-context";
import {
  changeTimetableLifecycle,
  getScheduleOptions,
  listSchedule,
  replacePublishedTimetableEntry,
  saveDraftTimetableEntry,
  type ScheduleEntry,
  type ScheduleOptions,
} from "@/lib/schedule.functions";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ALL = "__all__";

type EntryFormState = {
  id?: string;
  rowVersion?: number;
  status: string;
  teachingAssignmentId: string;
  timetablePeriodId: string;
  weekday: string;
  roomLabel: string;
  effectiveFrom: string;
  effectiveTo: string;
  cutoverDate: string;
};

const EMPTY_FORM: EntryFormState = {
  status: "draft",
  teachingAssignmentId: "",
  timetablePeriodId: "",
  weekday: "1",
  roomLabel: "",
  effectiveFrom: "",
  effectiveTo: "",
  cutoverDate: "",
};

export function ConflictBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Schedule change rejected</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function PublishBar({
  entry,
  canPublish,
  canArchive,
  busy,
  onPublish,
  onArchive,
}: {
  entry: ScheduleEntry;
  canPublish: boolean;
  canArchive: boolean;
  busy: boolean;
  onPublish: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-t pt-2">
      {entry.status === "draft" && canPublish && (
        <Button size="sm" onClick={onPublish} disabled={busy}>Publish</Button>
      )}
      {entry.status !== "inactive" && canArchive && (
        <Button size="sm" variant="outline" onClick={onArchive} disabled={busy}>Archive</Button>
      )}
    </div>
  );
}

export function WeeklyGrid({
  entries,
  periods,
  canUpdate,
  canPublish,
  canArchive,
  busy,
  onEdit,
  onLifecycle,
}: {
  entries: ScheduleEntry[];
  periods: ScheduleOptions["periods"];
  canUpdate: boolean;
  canPublish: boolean;
  canArchive: boolean;
  busy: boolean;
  onEdit: (entry: ScheduleEntry) => void;
  onLifecycle: (entry: ScheduleEntry, action: "publish" | "archive") => void;
}) {
  const byCell = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    for (const entry of entries) {
      const key = `${entry.timetablePeriodId}:${entry.weekday}`;
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return map;
  }, [entries]);

  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <div className="grid min-w-[1050px] grid-cols-[150px_repeat(7,minmax(125px,1fr))]">
        <div className="border-b border-r bg-muted/60 p-3 text-xs font-semibold">Period</div>
        {WEEKDAYS.map((day) => <div key={day} className="border-b border-r bg-muted/60 p-3 text-center text-xs font-semibold last:border-r-0">{day}</div>)}
        {periods.map((period) => (
          <div className="contents" key={period.id}>
            <div className="border-b border-r p-3 text-xs">
              <p className="font-semibold">{period.sequence}. {period.label}</p>
              <p className="text-muted-foreground">{period.startTime.slice(0, 5)}–{period.endTime.slice(0, 5)}</p>
            </div>
            {WEEKDAYS.map((day, index) => {
              const cell = byCell.get(`${period.id}:${index + 1}`) ?? [];
              return (
                <div key={day} className="min-h-32 space-y-2 border-b border-r p-2 last:border-r-0">
                  {cell.map((entry) => (
                    <Card key={entry.id} className={entry.status === "draft" ? "border-dashed" : entry.status === "inactive" ? "opacity-60" : "border-primary/40"}>
                      <CardContent className="space-y-2 p-3 text-xs">
                        <div className="flex items-start justify-between gap-1"><strong>{entry.subjectName}</strong><StatusBadge status={entry.status} /></div>
                        <p>{entry.classroomName}</p>
                        <p className="text-muted-foreground">{entry.teacherName}{entry.roomLabel ? ` · ${entry.roomLabel}` : ""}</p>
                        <p className="text-[10px] text-muted-foreground">{entry.effectiveFrom} → {entry.effectiveTo ?? "open"}</p>
                        {canUpdate && entry.status !== "inactive" && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onEdit(entry)}>Edit</Button>}
                        <PublishBar entry={entry} canPublish={canPublish} canArchive={canArchive} busy={busy} onPublish={() => onLifecycle(entry, "publish")} onArchive={() => onLifecycle(entry, "archive")} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EntryDialog({
  open,
  onOpenChange,
  form,
  setForm,
  options,
  submitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: EntryFormState;
  setForm: (form: EntryFormState) => void;
  options: ScheduleOptions | undefined;
  submitting: boolean;
  error: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const published = form.status === "published";
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={form.id ? (published ? "Replace published entry" : "Edit draft entry") : "Create draft entry"}
      description={published ? "A dated successor preserves the published predecessor as history." : "Drafts remain staff-only until explicitly published."}
      submitting={submitting}
      error={error}
      submitLabel={published ? "Create successor" : "Save draft"}
      onSubmit={onSubmit}
    >
      <Field label="Teaching assignment" htmlFor="teachingAssignment">
        <Select value={form.teachingAssignmentId} onValueChange={(value) => setForm({ ...form, teachingAssignmentId: value })}>
          <SelectTrigger id="teachingAssignment"><SelectValue placeholder="Choose assignment" /></SelectTrigger>
          <SelectContent>{(options?.assignments ?? []).filter((item) => item.status === "active" || item.id === form.teachingAssignmentId).map((item) => <SelectItem key={item.id} value={item.id}>{item.label}{item.hint ? ` · ${item.hint}` : ""}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Timetable period" htmlFor="timetablePeriod">
        <Select value={form.timetablePeriodId} onValueChange={(value) => setForm({ ...form, timetablePeriodId: value })}>
          <SelectTrigger id="timetablePeriod"><SelectValue placeholder="Choose period" /></SelectTrigger>
          <SelectContent>{(options?.periods ?? []).filter((item) => item.status === "active" || item.id === form.timetablePeriodId).map((item) => <SelectItem key={item.id} value={item.id}>{item.sequence}. {item.label} · {item.startTime.slice(0, 5)}–{item.endTime.slice(0, 5)}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Weekday" htmlFor="weekday">
        <Select value={form.weekday} onValueChange={(value) => setForm({ ...form, weekday: value })}>
          <SelectTrigger id="weekday"><SelectValue /></SelectTrigger>
          <SelectContent>{WEEKDAYS.map((day, index) => <SelectItem key={day} value={String(index + 1)}>{day}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Room" htmlFor="room"><Input id="room" value={form.roomLabel} maxLength={120} onChange={(event) => setForm({ ...form, roomLabel: event.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Effective from" htmlFor="effectiveFrom"><Input id="effectiveFrom" type="date" value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} /></Field>
        <Field label="Effective to" htmlFor="effectiveTo"><Input id="effectiveTo" type="date" value={form.effectiveTo} onChange={(event) => setForm({ ...form, effectiveTo: event.target.value })} /></Field>
      </div>
      {published && <Field label="Successor cutover date" htmlFor="cutoverDate" hint="The predecessor ends on the day before this date."><Input id="cutoverDate" type="date" value={form.cutoverDate} onChange={(event) => setForm({ ...form, cutoverDate: event.target.value })} /></Field>}
    </FormDialog>
  );
}

export function SchedulePage({ mine = false }: { mine?: boolean }) {
  const { activeOrganization, activeSchool, activeAcademicYear, activeTerm, hasPermission, contextLoading, error: contextError } = useAppContext();
  const queryClient = useQueryClient();
  const fetchOptions = useServerFn(getScheduleOptions);
  const fetchSchedule = useServerFn(listSchedule);
  const saveDraft = useServerFn(saveDraftTimetableEntry);
  const replacePublished = useServerFn(replacePublishedTimetableEntry);
  const changeLifecycle = useServerFn(changeTimetableLifecycle);
  const [classroomId, setClassroomId] = useState(ALL);
  const [staffMemberId, setStaffMemberId] = useState(ALL);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<EntryFormState>(EMPTY_FORM);
  const [actionError, setActionError] = useState<string | null>(null);

  const scope = activeOrganization && activeSchool && activeAcademicYear ? {
    organizationId: activeOrganization.organizationId,
    schoolId: activeSchool.id,
    academicYearId: activeAcademicYear.id,
  } : null;
  const enabled = Boolean(scope && activeTerm && hasPermission("schedule.read"));
  const optionsQuery = useQuery({
    queryKey: ["schedule-options", scope],
    queryFn: () => fetchOptions({ data: scope! }),
    enabled: Boolean(scope && hasPermission("schedule.read")),
  });
  const scheduleQuery = useQuery({
    queryKey: ["schedule", scope, activeTerm?.id, classroomId, staffMemberId, mine],
    queryFn: () => fetchSchedule({ data: {
      ...scope!,
      termId: activeTerm!.id,
      classroomId: !mine && classroomId !== ALL ? classroomId : undefined,
      staffMemberId: !mine && staffMemberId !== ALL ? staffMemberId : undefined,
      mine,
    } }),
    enabled,
  });
  useEffect(() => { setClassroomId(ALL); setStaffMemberId(ALL); }, [activeSchool?.id, activeAcademicYear?.id, activeTerm?.id]);

  const mutation = useMutation({
    mutationFn: async (operation: { kind: "save" } | { kind: "lifecycle"; entry: ScheduleEntry; action: "publish" | "archive" }) => {
      if (!scope || !activeTerm) throw new Error("Select a complete academic context first.");
      if (operation.kind === "lifecycle") {
        return changeLifecycle({ data: { id: operation.entry.id, rowVersion: operation.entry.rowVersion, ...scope, action: operation.action } });
      }
      const payload = {
        id: form.id,
        rowVersion: form.rowVersion,
        ...scope,
        termId: activeTerm.id,
        teachingAssignmentId: form.teachingAssignmentId,
        timetablePeriodId: form.timetablePeriodId,
        weekday: Number(form.weekday),
        roomLabel: form.roomLabel.trim() || null,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || null,
      };
      if (form.status === "published") return replacePublished({ data: { ...payload, id: form.id!, rowVersion: form.rowVersion!, cutoverDate: form.cutoverDate } });
      return saveDraft({ data: payload });
    },
    onSuccess: async (_, operation) => {
      setActionError(null);
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast.success(operation.kind === "lifecycle" ? (operation.action === "publish" ? "Schedule entry published." : "Schedule entry archived.") : (form.status === "published" ? "Published successor created." : "Draft saved."));
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : String(error)),
  });

  function openCreate() {
    setActionError(null);
    setForm({ ...EMPTY_FORM, effectiveFrom: activeAcademicYear?.startsOn ?? "" });
    setDialogOpen(true);
  }
  function openEdit(entry: ScheduleEntry) {
    setActionError(null);
    setForm({
      id: entry.id,
      rowVersion: entry.rowVersion,
      status: entry.status,
      teachingAssignmentId: entry.teachingAssignmentId,
      timetablePeriodId: entry.timetablePeriodId,
      weekday: String(entry.weekday),
      roomLabel: entry.roomLabel ?? "",
      effectiveFrom: entry.effectiveFrom,
      effectiveTo: entry.effectiveTo ?? "",
      cutoverDate: "",
    });
    setDialogOpen(true);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    mutation.mutate({ kind: "save" });
  }

  const title = mine ? "My schedule" : "Schedule";
  const description = mine ? "Your teaching timetable in the active academic context." : "Plan, publish and preserve classroom and teacher timetables.";
  const pageError = contextError ?? optionsQuery.error ?? scheduleQuery.error;
  const dialogOptions = optionsQuery.data
    ? { ...optionsQuery.data, assignments: optionsQuery.data.assignments.filter((item) => item.termId === activeTerm?.id) }
    : undefined;
  return (
    <AcademicPage
      title={title}
      description={description}
      readPermission="schedule.read"
      actions={<div className="flex gap-2">{mine ? <Button variant="outline" asChild><Link to="/schedule">Classroom schedule</Link></Button> : <Button variant="outline" asChild><Link to="/schedule/my">My schedule</Link></Button>}{hasPermission("schedule.create") && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New draft</Button>}</div>}
    >
      <div className="space-y-4">
        {!activeAcademicYear || !activeTerm ? (
          <Card><CardHeader><CardTitle className="text-base">Select an academic year and term</CardTitle></CardHeader></Card>
        ) : (
          <>
            {!mine && <div className="grid gap-3 sm:grid-cols-2">
              <Select value={classroomId} onValueChange={setClassroomId}><SelectTrigger aria-label="Classroom filter"><SelectValue placeholder="All classrooms" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All classrooms</SelectItem>{(optionsQuery.data?.classrooms ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select>
              <Select value={staffMemberId} onValueChange={setStaffMemberId}><SelectTrigger aria-label="Teacher filter"><SelectValue placeholder="All teachers" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All teachers</SelectItem>{(optionsQuery.data?.teachers ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select>
            </div>}
            <ConflictBanner message={actionError} />
            {(contextLoading || optionsQuery.isPending || scheduleQuery.isPending) && <div className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-72 w-full" /></div>}
            {pageError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>We couldn't load the schedule</AlertTitle><AlertDescription className="flex items-center justify-between gap-3"><span>{pageError.message}</span><Button size="sm" variant="outline" onClick={() => void scheduleQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></AlertDescription></Alert>}
            {!pageError && !scheduleQuery.isPending && (optionsQuery.data?.periods.length ?? 0) === 0 && <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center"><CalendarClock className="h-7 w-7 text-muted-foreground" /><p className="font-medium">No timetable periods</p><p className="text-sm text-muted-foreground">Create active timetable periods before adding schedule entries.</p></CardContent></Card>}
            {!pageError && !scheduleQuery.isPending && (optionsQuery.data?.periods.length ?? 0) > 0 && (scheduleQuery.data?.length ?? 0) === 0 && <Card><CardContent className="py-12 text-center"><p className="font-medium">No schedule entries match this view</p><p className="text-sm text-muted-foreground">Create a draft or change the classroom and teacher filters.</p></CardContent></Card>}
            {!pageError && (scheduleQuery.data?.length ?? 0) > 0 && <div className="space-y-2"><div className="flex gap-2 text-xs"><Badge variant="secondary">Draft · staff only</Badge><Badge>Published</Badge><Badge variant="outline">Inactive history</Badge></div><WeeklyGrid entries={scheduleQuery.data ?? []} periods={optionsQuery.data?.periods ?? []} canUpdate={hasPermission("schedule.update")} canPublish={hasPermission("schedule.publish")} canArchive={hasPermission("schedule.archive")} busy={mutation.isPending} onEdit={openEdit} onLifecycle={(entry, action) => { setActionError(null); mutation.mutate({ kind: "lifecycle", entry, action }); }} /></div>}
          </>
        )}
      </div>
      <EntryDialog open={dialogOpen} onOpenChange={setDialogOpen} form={form} setForm={setForm} options={dialogOptions} submitting={mutation.isPending} error={actionError} onSubmit={submit} />
    </AcademicPage>
  );
}
