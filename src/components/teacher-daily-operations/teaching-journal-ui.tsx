import { useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, CalendarDays, Eye, FilePenLine, RefreshCw, Send } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/lib/app-context";
import { B13DomainError } from "@/lib/teacher-daily-operations.server";
import {
  createTeachingJournal,
  getMyTeachingJournal,
  listMyTeachingJournals,
  listMyTeachingOccurrences,
  listStaffTeachingJournals,
  submitTeachingJournal,
  updateTeachingJournal,
} from "@/lib/teacher-daily-operations.functions";

type Row = {
  [key: string]: unknown;
  material_taught?: unknown;
  obstacles?: unknown;
  follow_up?: unknown;
  teacher_note?: unknown;
  status?: unknown;
  journal_id?: unknown;
  version?: unknown;
  timetable_entry_id?: unknown;
  occurrence_date?: unknown;
  journal_date?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  subject_name?: unknown;
  classroom_name?: unknown;
  journal_status?: unknown;
  teacher_name?: unknown;
};
const today = () => new Date().toLocaleDateString("en-CA");
const text = (value: unknown) => (typeof value === "string" ? value : "");
const id = (value: unknown) => (typeof value === "string" ? value : "");
const dateText = (value: unknown) => {
  const raw = text(value);
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
};
const displayDate = (value: unknown) => {
  const raw = dateText(value);
  if (!raw) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(`${raw}T12:00:00`),
  );
};
const displayTime = (value: unknown) => {
  const raw = text(value);
  return raw ? raw.slice(0, 5) : "—";
};
const safeError = (error: unknown) => {
  const code = error instanceof B13DomainError ? error.code : "";
  const messages: Record<string, string> = {
    B13_TDO_AUTH_REQUIRED: "Your session is required to continue.",
    B13_TDO_SCOPE_DENIED: "You do not have permission to view this data.",
    B13_TDO_ASSIGNMENT_DENIED: "This teaching session is not assigned to your account.",
    B13_TDO_OCCURRENCE_INVALID: "This scheduled occurrence is no longer available.",
    B13_TDO_STALE_VERSION:
      "This journal changed elsewhere. Review the current server state before trying again.",
    B13_TDO_INVALID_STATE: "This action is no longer allowed for the journal.",
    B13_TDO_MATERIAL_REQUIRED: "Material taught is required before submission.",
    B13_TDO_REQUEST_CONFLICT: "The request could not be safely replayed.",
  };
  return messages[code] ?? "We couldn't complete that request. Please try again.";
};
const statusLabel = (value: unknown) =>
  ({ draft: "Draft", submitted: "Submitted" })[text(value)] ?? "Not started";

function PageFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { activeSchool } = useAppContext();
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
          {activeSchool && (
            <p className="mt-1 text-xs text-muted-foreground">Scope: {activeSchool.name}</p>
          )}
        </div>
        {children}
      </div>
    </AppShell>
  );
}

type EditorProps = {
  occurrence: Row | undefined;
  journal: Row | undefined;
  onClose: () => void;
  onSaved: () => void;
};
function JournalEditor({ occurrence, journal, onClose, onSaved }: EditorProps) {
  const queryClient = useQueryClient();
  const create = useServerFn(createTeachingJournal);
  const update = useServerFn(updateTeachingJournal);
  const submit = useServerFn(submitTeachingJournal);
  const pending = useRef<string | null>(null);
  const [material, setMaterial] = useState(text(journal?.material_taught));
  const [obstacles, setObstacles] = useState(text(journal?.obstacles));
  const [followUp, setFollowUp] = useState(text(journal?.follow_up));
  const [teacherNote, setTeacherNote] = useState(text(journal?.teacher_note));
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmitted = text(journal?.status) === "submitted";
  const isDraft = Boolean(journal?.journal_id) && !isSubmitted;
  const requestId = () => {
    if (!pending.current) pending.current = crypto.randomUUID();
    return pending.current;
  };
  const clearRequest = () => {
    pending.current = null;
  };
  const mutation = useMutation({
    mutationFn: async (kind: "create" | "update" | "submit") => {
      const requestIdValue = requestId();
      if (kind === "create")
        return create({
          data: {
            requestId: requestIdValue,
            timetableEntryId: id(occurrence?.timetable_entry_id),
            journalDate: dateText(occurrence?.occurrence_date),
            materialTaught: material || null,
            obstacles: obstacles || null,
            followUp: followUp || null,
            teacherNote: teacherNote || null,
          },
        });
      if (kind === "update")
        return update({
          data: {
            requestId: requestIdValue,
            journalId: id(journal?.journal_id),
            expectedVersion: Number(journal?.version),
            materialTaught: material || null,
            obstacles: obstacles || null,
            followUp: followUp || null,
            teacherNote: teacherNote || null,
          },
        });
      return submit({
        data: {
          requestId: requestIdValue,
          journalId: id(journal?.journal_id),
          expectedVersion: Number(journal?.version),
        },
      });
    },
    onSuccess: () => {
      clearRequest();
      setConfirm(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["b13-teaching-journals"] });
      onSaved();
    },
    onError: (e) => {
      clearRequest();
      setError(safeError(e));
    },
  });
  const context = journal ?? occurrence ?? {};
  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Action not completed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-4">
        <div>
          <span className="text-xs text-muted-foreground">Date</span>
          <p className="font-medium">
            {displayDate(context.journal_date ?? context.occurrence_date)}
          </p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Time</span>
          <p className="font-medium">
            {displayTime(context.start_time)} – {displayTime(context.end_time)}
          </p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Subject</span>
          <p className="font-medium">{text(context.subject_name) || "—"}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Classroom</span>
          <p className="font-medium">{text(context.classroom_name) || "—"}</p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="journal-material">Material Taught</Label>
        <Textarea
          id="journal-material"
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          disabled={isSubmitted || mutation.isPending}
          placeholder="What was taught in this session?"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="journal-obstacles">Obstacles</Label>
          <Textarea
            id="journal-obstacles"
            value={obstacles}
            onChange={(e) => setObstacles(e.target.value)}
            disabled={isSubmitted || mutation.isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="journal-follow-up">Follow Up</Label>
          <Textarea
            id="journal-follow-up"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            disabled={isSubmitted || mutation.isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="journal-note">Teacher Note</Label>
          <Textarea
            id="journal-note"
            value={teacherNote}
            onChange={(e) => setTeacherNote(e.target.value)}
            disabled={isSubmitted || mutation.isPending}
          />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        {!isSubmitted && (
          <>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(isDraft ? "update" : "create")}
            >
              {mutation.isPending ? "Saving…" : "Save Draft"}
            </Button>
            {isDraft && (
              <Button
                disabled={mutation.isPending || !material.trim()}
                onClick={() => setConfirm(true)}
              >
                <Send className="mr-2 h-4 w-4" />
                Submit Journal
              </Button>
            )}
          </>
        )}
      </div>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this journal?</AlertDialogTitle>
            <AlertDialogDescription>
              After submission, this journal becomes read-only. A correction workflow is not
              available in this phase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                mutation.mutate("submit");
              }}
            >
              {mutation.isPending ? "Submitting…" : "Submit Journal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function TeachingJournalPage() {
  const { hasPermission } = useAppContext();
  const canUse = [
    "teaching_journal.read",
    "teaching_journal.create",
    "teaching_journal.update",
    "teaching_journal.submit",
  ].some(hasPermission);
  const [date, setDate] = useState(today());
  const [selected, setSelected] = useState<{ occurrence: Row; journal: Row | undefined } | null>(
    null,
  );
  const fetchOccurrences = useServerFn(listMyTeachingOccurrences);
  const fetchJournals = useServerFn(listMyTeachingJournals);
  const occurrenceQuery = useQuery({
    queryKey: ["b13-teaching-journals", "occurrences", date],
    queryFn: () => fetchOccurrences({ data: { from: date, to: date, page: 1, pageSize: 100 } }),
    enabled: canUse,
  });
  const journalsQuery = useQuery({
    queryKey: ["b13-teaching-journals", "mine", date],
    queryFn: () => fetchJournals({ data: { from: date, to: date, page: 1, pageSize: 100 } }),
    enabled: canUse,
  });
  const journals = useMemo(
    () =>
      new Map(
        ((journalsQuery.data ?? []) as Row[]).map((row) => [
          id(row.journal_date) + ":" + id(row.timetable_entry_id),
          row,
        ]),
      ),
    [journalsQuery.data],
  );
  if (!canUse)
    return (
      <PageFrame
        title="Teaching Journal"
        description="Record the work completed in scheduled teaching sessions."
      >
        <Card>
          <CardHeader>
            <CardTitle>Access unavailable</CardTitle>
            <CardDescription>
              Your active account does not have a Teaching Journal permission.
            </CardDescription>
          </CardHeader>
        </Card>
      </PageFrame>
    );
  return (
    <PageFrame
      title="Teaching Journal"
      description="Record the work completed in scheduled teaching sessions."
    >
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>My teaching sessions</CardTitle>
            <CardDescription>
              Journals can only be created from published sessions assigned to you.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Journal date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {occurrenceQuery.isLoading || journalsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : occurrenceQuery.error || journalsQuery.error ? (
            <Alert variant="destructive">
              <AlertTitle>Teaching sessions unavailable</AlertTitle>
              <AlertDescription>
                {safeError(occurrenceQuery.error ?? journalsQuery.error)}
              </AlertDescription>
            </Alert>
          ) : (occurrenceQuery.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No scheduled teaching sessions for this date.
            </div>
          ) : (
            <div className="space-y-3">
              {((occurrenceQuery.data ?? []) as Row[]).map((occurrence) => {
                const key =
                  dateText(occurrence.occurrence_date) + ":" + id(occurrence.timetable_entry_id);
                const journal = occurrence.journal_id ? journals.get(key) : undefined;
                const state = text(occurrence.journal_status) || text(journal?.status);
                return (
                  <div
                    key={key}
                    className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {text(occurrence.subject_name) || "Subject"}
                        </span>
                        <Badge
                          variant={
                            state === "submitted"
                              ? "default"
                              : state === "draft"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {statusLabel(state)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {displayTime(occurrence.start_time)} – {displayTime(occurrence.end_time)} ·{" "}
                        {text(occurrence.classroom_name) || "Classroom"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {displayDate(occurrence.occurrence_date)}
                      </p>
                    </div>
                    <Button
                      variant={state === "submitted" ? "outline" : "default"}
                      onClick={() => setSelected({ occurrence, journal })}
                    >
                      {state === "submitted" ? (
                        <>
                          <Eye className="mr-2 h-4 w-4" />
                          View Journal
                        </>
                      ) : state === "draft" ? (
                        <>
                          <FilePenLine className="mr-2 h-4 w-4" />
                          Continue Journal
                        </>
                      ) : (
                        <>
                          <BookOpen className="mr-2 h-4 w-4" />
                          Create Journal
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <JournalDialog selected={selected} onClose={() => setSelected(null)} />
    </PageFrame>
  );
}

function JournalDialog({
  selected,
  onClose,
}: {
  selected: { occurrence: Row; journal: Row | undefined } | null;
  onClose: () => void;
}) {
  const fetchDetail = useServerFn(getMyTeachingJournal);
  const [detail, setDetail] = useState<Row | undefined>(selected?.journal);
  const detailQuery = useQuery({
    queryKey: ["b13-teaching-journals", "detail", selected?.journal?.journal_id],
    queryFn: async () => {
      const rows = await fetchDetail({ data: { journalId: id(selected?.journal?.journal_id) } });
      return rows[0];
    },
    enabled: Boolean(selected?.journal?.journal_id),
  });
  const journal = detailQuery.data ?? detail ?? selected?.journal;
  if (!selected) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Teaching journal editor"
    >
      <Card className="max-h-[90vh] w-full max-w-4xl overflow-y-auto">
        <CardHeader>
          <CardTitle>
            {journal?.status === "submitted" ? "Submitted teaching journal" : "Teaching journal"}
          </CardTitle>
          <CardDescription>
            {journal?.status === "submitted"
              ? "This journal is read-only after submission."
              : "Save a draft or submit when the session record is complete."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JournalEditor
            occurrence={selected.occurrence}
            journal={journal}
            onClose={onClose}
            onSaved={() => {
              setDetail(undefined);
              void detailQuery.refetch();
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export function TeachingJournalManagerPage() {
  const { activeSchool, hasPermission } = useAppContext();
  const fetch = useServerFn(listStaffTeachingJournals);
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["b13-teaching-journals", "manager", activeSchool?.id, date, status],
    queryFn: () =>
      fetch({
        data: {
          schoolId: activeSchool!.id,
          from: date || null,
          to: date || null,
          status: status === "all" ? null : (status as "draft" | "submitted"),
          page: 1,
          pageSize: 100,
        },
      }),
    enabled: Boolean(activeSchool?.id) && hasPermission("teaching_journal.read"),
  });
  const rows = ((query.data ?? []) as Row[]).filter(
    (row) =>
      !search ||
      [row.teacher_name, row.subject_name, row.classroom_name].some((value) =>
        text(value).toLowerCase().includes(search.toLowerCase()),
      ),
  );
  return (
    <PageFrame
      title="Journal Monitor"
      description="Read-only visibility into teaching journals within your authorized school scope."
    >
      <Card>
        <CardHeader>
          <CardTitle>Teaching journals</CardTitle>
          <CardDescription>
            Managers can monitor records but cannot author on behalf of teachers.
          </CardDescription>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              aria-label="Search journals"
              placeholder="Search teacher, subject, classroom"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Input
              aria-label="Monitor date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : query.error ? (
            <Alert variant="destructive">
              <AlertTitle>Journal monitor unavailable</AlertTitle>
              <AlertDescription>{safeError(query.error)}</AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No teaching journals match these filters.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={id(row.journal_id)} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {text(row.teacher_name) || "Teacher"} ·{" "}
                        {text(row.subject_name) || "Subject"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {displayDate(row.journal_date)} · {text(row.classroom_name) || "Classroom"}
                      </p>
                    </div>
                    <Badge>{statusLabel(row.status)}</Badge>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm">
                    {text(row.material_taught) || "No material recorded."}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageFrame>
  );
}
