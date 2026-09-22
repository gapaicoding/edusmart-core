import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Archive,
  BookOpenCheck,
  History,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

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
  AlertDialogTrigger,
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
import { getAcademicContext } from "@/lib/context.functions";
import { useReportCardRequestAction } from "@/lib/report-card-request-identity";
import type {
  ReportCardContentInput,
  ReportCardGenerationInput,
} from "@/lib/report-card-runtime.schemas";
import {
  createReportCardRevisionCommand,
  generateReportCardDraftCommand,
  getReportCardProjection,
  listReportCardCandidatesProjection,
  listReportCardsProjection,
  publishReportCardCommand,
  saveReportCardContentCommand,
  transitionReportCardCommand,
} from "@/lib/report-card-runtime.functions";
import {
  generateReportCardDocument,
  getReportCardDocumentStatus,
  getReportCardDownload,
  regenerateReportCardDocument,
} from "@/lib/reporting.documents.functions";
import {
  displaySnapshotScore,
  formatReportingMutationError,
  orderReportHistory,
  reportActions,
  REPORT_STATUS_LABELS,
  safeAttendance,
} from "./reporting-model";

const date = (value: string | null) => (value ? new Date(value).toLocaleDateString() : "—");

export function ReportCardStatusBadge({ status }: { status: string }) {
  const variant =
    status === "published"
      ? "default"
      : status === "revised" || status === "archived"
        ? "outline"
        : "secondary";
  return <Badge variant={variant}>{REPORT_STATUS_LABELS[status] ?? status}</Badge>;
}

export function GenerateReportCardDialog({
  schoolId,
  terms,
  defaultAcademicYearId,
  defaultTermId,
}: {
  schoolId: string;
  terms: readonly { id: string; name: string; academicYearId: string }[];
  defaultAcademicYearId?: string | null;
  defaultTermId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [termId, setTermId] = useState<string | null>(defaultTermId ?? null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const candidatesFn = useServerFn(listReportCardCandidatesProjection);
  const generateFn = useServerFn(generateReportCardDraftCommand);
  const requestAction = useReportCardRequestAction<{
    studentEnrollmentId: string;
    termId: string;
  }>();
  const candidates = useQuery({
    queryKey: ["report-card-candidates", schoolId, defaultAcademicYearId, search],
    queryFn: () =>
      candidatesFn({
        data: {
          schoolId,
          academicYearId: defaultAcademicYearId ?? undefined,
        },
      }),
    enabled: open,
  });
  const candidateRows = useMemo(
    () =>
      (candidates.data ?? []).filter(
        (r) => !search || r.student_name.toLowerCase().includes(search.toLowerCase()),
      ),
    [candidates.data, search],
  );
  const selected = candidateRows.find((r) => r.student_enrollment_id === enrollmentId) ?? null;
  const displayCandidates = candidateRows.map((r) => ({
    studentEnrollmentId: r.student_enrollment_id,
    studentName: r.student_name,
    academicYearName: r.academic_year_id,
    gradeLevelName: null,
    classroomName: r.classroom_name,
  }));
  const eligibleTerms = selected
    ? terms.filter((t) => t.academicYearId === selected.academic_year_id)
    : [];
  useEffect(() => {
    if (!selected) return;
    if (termId && eligibleTerms.some((t) => t.id === termId)) return;
    setTermId(
      defaultTermId && eligibleTerms.some((t) => t.id === defaultTermId)
        ? defaultTermId
        : (eligibleTerms[0]?.id ?? null),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.student_enrollment_id]);
  const reset = () => {
    setSearch("");
    setEnrollmentId(null);
    setTermId(defaultTermId ?? null);
  };
  const generate = useMutation({
    mutationFn: async (action: {
      requestId: string;
      payload: { studentEnrollmentId: string; termId: string };
    }) => {
      return generateFn({
        data: { ...action.payload, requestId: action.requestId },
      });
    },
    onSuccess: async (result, action) => {
      await queryClient.invalidateQueries({ queryKey: ["report-cards"] });
      requestAction.succeed(action);
      toast.success("Report card draft created.");
      setOpen(false);
      reset();
      if (result?.report_card_id)
        navigate({ to: "/report-cards/$id", params: { id: result.report_card_id } });
    },
    onError: async (error, action) => {
      requestAction.fail(error, action);
      toast.error(formatReportingMutationError(error));
    },
  });
  const startGenerate = () => {
    if (!enrollmentId || !termId || generate.isPending) return;
    if (!eligibleTerms.some((t) => t.id === termId)) {
      toast.error("Selected term is not part of this enrollment's academic year.");
      return;
    }
    const action = requestAction.begin({ studentEnrollmentId: enrollmentId, termId });
    if (action) generate.mutate(action);
  };
  const retryGenerate = () => {
    const action = requestAction.retry();
    if (action && !generate.isPending) generate.mutate(action);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && (generate.isPending || requestAction.retryAction)) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button data-testid="generate-report-card-trigger">
          <Plus className="mr-2 h-4 w-4" />
          Generate Report Card
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Report Card</DialogTitle>
          <DialogDescription>
            Create the first Report Card draft for an eligible student enrollment and term.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Search student</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={generate.isPending || Boolean(requestAction.retryAction)}
              placeholder="Search by student name"
              aria-label="Search candidate students"
            />
          </div>
          <div className="space-y-2">
            <Label>Student enrollment</Label>
            {candidates.isLoading ? (
              <Skeleton className="h-10" />
            ) : candidates.error ? (
              <Alert variant="destructive">
                <AlertTitle>Candidates could not be loaded</AlertTitle>
                <AlertDescription>{(candidates.error as Error).message}</AlertDescription>
              </Alert>
            ) : !candidateRows.length ? (
              <Alert>
                <AlertTitle>No eligible student enrollments</AlertTitle>
                <AlertDescription>
                  No active enrollments in your authorized scope match this search.
                </AlertDescription>
              </Alert>
            ) : (
              <Select
                value={enrollmentId ?? ""}
                onValueChange={(v) => setEnrollmentId(v || null)}
                disabled={generate.isPending || Boolean(requestAction.retryAction)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a student enrollment" />
                </SelectTrigger>
                <SelectContent>
                  {displayCandidates.map((r) => (
                    <SelectItem key={r.studentEnrollmentId} value={r.studentEnrollmentId}>
                      {r.studentName} · {r.academicYearName}
                      {r.gradeLevelName ? ` · ${r.gradeLevelName}` : ""}
                      {r.classroomName ? ` / ${r.classroomName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>Term</Label>
            <Select
              value={termId ?? ""}
              onValueChange={(v) => setTermId(v || null)}
              disabled={!selected || generate.isPending || Boolean(requestAction.retryAction)}
            >
              <SelectTrigger>
                <SelectValue placeholder={selected ? "Select a term" : "Select a student first"} />
              </SelectTrigger>
              <SelectContent>
                {eligibleTerms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && !eligibleTerms.length && (
              <p className="text-xs text-muted-foreground">
                No terms are configured for this enrollment's academic year.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          {requestAction.retryAction && (
            <Alert>
              <AlertTitle>Generation result is uncertain</AlertTitle>
              <AlertDescription>
                Retry the same request to safely confirm its result.
              </AlertDescription>
              <Button variant="outline" onClick={retryGenerate} disabled={generate.isPending}>
                Retry generation
              </Button>
            </Alert>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              reset();
            }}
            disabled={generate.isPending || Boolean(requestAction.retryAction)}
          >
            Cancel
          </Button>
          <Button
            data-testid="generate-report-card-submit"
            disabled={!enrollmentId || !termId || generate.isPending}
            onClick={startGenerate}
          >
            {generate.isPending ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReportCardsPage() {
  const { activeSchool, activeAcademicYear, activeTerm, terms, permissions } = useAppContext();
  const fn = useServerFn(listReportCardsProjection);
  const canRead = permissions.includes("report_card.read");
  const canGenerate = permissions.includes("report_card.generate");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [termId, setTermId] = useState(activeTerm?.id ?? "all");
  useEffect(() => {
    if (activeTerm?.id) setTermId(activeTerm.id);
  }, [activeTerm?.id]);
  const query = useQuery({
    queryKey: ["report-cards", activeSchool?.id, activeAcademicYear?.id, termId, status, search],
    queryFn: () =>
      fn({
        data: {
          schoolId: activeSchool?.id,
          academicYearId: activeAcademicYear?.id,
          termId: termId === "all" ? undefined : termId,
          status: status === "all" ? undefined : (status as "draft"),
        },
      }),
    enabled: Boolean(activeSchool?.id && canRead),
  });
  const displayRows = (query.data ?? [])
    .filter((row) => !search || row.student_name.toLowerCase().includes(search.toLowerCase()))
    .map((row) => ({
      id: row.report_card_id,
      studentName: row.student_name,
      academicYearName: row.academic_year_id,
      termName: row.term_id,
      gradeLevelName: null,
      classroomName: row.classroom_name,
      version: row.business_version,
      status: row.status,
      updated_at: row.updated_at,
      published_at: row.published_at,
    }));
  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Reporting
            </p>
            <h1 className="text-3xl font-semibold">Report Cards</h1>
            <p className="text-sm text-muted-foreground">
              Build and manage frozen academic snapshots through publication.
            </p>
          </div>
          {canGenerate && activeSchool ? (
            <GenerateReportCardDialog
              schoolId={activeSchool.id}
              terms={terms}
              defaultAcademicYearId={activeAcademicYear?.id ?? null}
              defaultTermId={activeTerm?.id ?? null}
            />
          ) : null}
        </header>
        <Card>
          <CardContent className="grid gap-3 p-4 md:grid-cols-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student"
              aria-label="Search student"
            />
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger>
                <SelectValue placeholder="All terms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All terms</SelectItem>
                {terms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(REPORT_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
        {!canRead ? (
          <Alert>
            <AlertTitle>Report card access unavailable</AlertTitle>
            <AlertDescription>
              Your current permissions do not include report-card access.
            </AlertDescription>
          </Alert>
        ) : !activeSchool ? (
          <Alert>
            <AlertTitle>Select a school</AlertTitle>
            <AlertDescription>Choose a school to load its report cards.</AlertDescription>
          </Alert>
        ) : query.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : query.error ? (
          <Alert variant="destructive">
            <AlertTitle>Report cards could not be loaded</AlertTitle>
            <AlertDescription>
              {(query.error as Error).message}{" "}
              <button className="underline" onClick={() => void query.refetch()}>
                Try again
              </button>
            </AlertDescription>
          </Alert>
        ) : !displayRows.length ? (
          <Alert>
            <AlertTitle>No report cards found</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>No snapshots match the current school and filters.</p>
              {canGenerate && activeSchool ? (
                <GenerateReportCardDialog
                  schoolId={activeSchool.id}
                  terms={terms}
                  defaultAcademicYearId={activeAcademicYear?.id ?? null}
                  defaultTermId={activeTerm?.id ?? null}
                />
              ) : null}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-3">
            {displayRows.map((row) => (
              <Link key={row.id} to="/report-cards/$id" params={{ id: row.id }}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] sm:items-center">
                    <div>
                      <p className="font-semibold">{row.studentName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.academicYearName} · {row.termName}
                        {(row.gradeLevelName || row.classroomName) &&
                          ` · ${[row.gradeLevelName, row.classroomName].filter(Boolean).join(" / ")}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Version</p>
                      <p>Version {row.version}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <ReportCardStatusBadge status={row.status} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Updated</p>
                      <p>{date(row.updated_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Published</p>
                      <p>{date(row.published_at)}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

type Detail = {
  card: {
    id: string;
    school_id: string;
    status: string;
    version: number;
    row_version: number;
    homeroom_comment: string | null;
    attendance_summary: unknown;
    student_enrollment_id: string;
    term_id: string;
    updated_at: string;
    published_at: string | null;
    academic_year_id: string;
  };
  student_name: string | null;
  classroom_id: string | null;
  context?: {
    studentName: string;
    schoolName: string;
    academicYearName: string;
    termName: string;
    gradeLevelName: string | null;
    classroomName: string | null;
  };
  entries: Array<{
    id: string;
    subject_id: string;
    final_score: number | null;
    predicate: string | null;
    narrative: string | null;
    row_version: number;
    subjectName?: string;
  }>;
  narratives: Array<{
    id: string;
    section_code: string;
    title: string;
    content: string;
    sequence: number;
    row_version: number;
  }>;
  history: Array<{
    id: string;
    version: number;
    row_version: number;
    status: string;
    updated_at: string;
    published_at: string | null;
  }>;
};

function AttendanceSummary({ value }: { value: unknown }) {
  const summary = safeAttendance(value);
  const entries = Object.entries(summary.counts);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Attendance snapshot</CardTitle>
        <CardDescription>{summary.finalizedSessionCount} finalized sessions</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {entries.map(([key, count]) => (
          <div key={key} className="rounded-md bg-muted p-3">
            <p className="text-xs capitalize text-muted-foreground">{key}</p>
            <p className="text-xl font-semibold">{count}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function SubjectEntryTable({
  entries,
  draft,
  busy,
  onSave,
}: {
  entries: Detail["entries"];
  draft: boolean;
  busy: boolean;
  onSave: (entry: Detail["entries"][number], narrative: string) => void;
}) {
  return (
    <div className="grid gap-3">
      {entries.length ? (
        entries.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="grid gap-3 p-4 lg:grid-cols-[1.2fr_.6fr_.7fr_2fr_auto] lg:items-start">
              <div>
                <p className="font-medium">{entry.subjectName}</p>
                <p className="text-xs text-muted-foreground">Frozen subject snapshot</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Final score</p>
                <p
                  className={
                    entry.final_score === null
                      ? "text-sm text-muted-foreground"
                      : "text-lg font-semibold"
                  }
                >
                  {displaySnapshotScore(entry.final_score)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Predicate</p>
                <p>{entry.predicate ?? "—"}</p>
              </div>
              <div>
                <Label htmlFor={`subject-${entry.id}`} className="text-xs">
                  Narrative
                </Label>
                <Textarea
                  id={`subject-${entry.id}`}
                  defaultValue={entry.narrative ?? ""}
                  disabled={!draft || busy}
                  rows={3}
                  data-entry-narrative={entry.id}
                />
              </div>
              {draft && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    const el = document.querySelector(
                      `[data-entry-narrative="${entry.id}"]`,
                    ) as HTMLTextAreaElement | null;
                    onSave(entry, el?.value ?? "");
                  }}
                >
                  Save narrative
                </Button>
              )}
            </CardContent>
          </Card>
        ))
      ) : (
        <Alert>
          <AlertTitle>No subject snapshots</AlertTitle>
          <AlertDescription>
            No published source results were available when this snapshot was generated.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function NarrativeEditor({
  narratives,
  draft,
  busy,
  cardUpdatedAt,
  onSave,
  onDelete,
}: {
  narratives: Detail["narratives"];
  draft: boolean;
  busy: boolean;
  cardUpdatedAt: string;
  onSave: (input: {
    narrativeId?: string;
    sectionCode: string;
    title: string;
    content: string;
    sequence: number;
    expectedRowVersion?: number;
  }) => void;
  onDelete?: (id: string) => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Narrative sections</CardTitle>
        <CardDescription>
          Qualitative sections preserved separately from generated scores.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {narratives.map((n) => (
          <div key={n.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.section_code}</p>
              </div>
              {draft && onDelete && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDelete(n.id)}>
                  Remove
                </Button>
              )}
            </div>
            {draft ? (
              <div className="mt-2 space-y-2">
                <Textarea defaultValue={n.content} disabled={busy} data-narrative-content={n.id} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    const element = document.querySelector(
                      `[data-narrative-content="${n.id}"]`,
                    ) as HTMLTextAreaElement | null;
                    onSave({
                      narrativeId: n.id,
                      sectionCode: n.section_code,
                      title: n.title,
                      content: element?.value ?? "",
                      sequence: n.sequence,
                      expectedRowVersion: n.row_version,
                    });
                  }}
                >
                  Save section
                </Button>
              </div>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm">{n.content || "No content"}</p>
            )}
          </div>
        ))}
        {!narratives.length && !draft && (
          <p className="text-sm text-muted-foreground">No narrative sections.</p>
        )}
        {draft && (
          <div className="grid gap-2 border-t pt-4">
            <Label>Add narrative section</Label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Section title"
            />
            <Textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Narrative"
            />
            <Button
              className="w-fit"
              disabled={busy || !newTitle.trim()}
              onClick={() => {
                onSave({
                  sectionCode: newTitle
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "_"),
                  title: newTitle.trim(),
                  content: newContent,
                  sequence: narratives.length + 1,
                });
                setNewTitle("");
                setNewContent("");
              }}
            >
              Add section
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReportCardVersionHistory({
  rows,
  currentId,
}: {
  rows: Detail["history"];
  currentId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Version history
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {orderReportHistory(rows).map((row) => (
          <Link
            key={row.id}
            to="/report-cards/$id"
            params={{ id: row.id }}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 hover:border-primary/50"
          >
            <div>
              <p className="font-medium">
                Version {row.version}{" "}
                {row.id === currentId && (
                  <span className="text-xs text-muted-foreground">· viewing</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Updated {date(row.updated_at)} · Published {date(row.published_at)}
              </p>
            </div>
            <ReportCardStatusBadge status={row.status} />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

export function ReviewPublishBar({
  status,
  rowVersion,
  reportCardId,
}: {
  status: string;
  rowVersion: number;
  reportCardId: string;
}) {
  const { permissions } = useAppContext();
  const actions = reportActions(status, permissions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const transition = useServerFn(transitionReportCardCommand);
  const publish = useServerFn(publishReportCardCommand);
  const revision = useServerFn(createReportCardRevisionCommand);
  const [revisionReason, setRevisionReason] = useState("");
  const requestAction = useReportCardRequestAction<{
    command: "transition" | "publish" | "revision";
    action: string;
    reportCardId: string;
    expectedRowVersion: number;
    reason?: string;
  }>();
  const mutation = useMutation({
    mutationFn: async (request: {
      requestId: string;
      payload: {
        command: "transition" | "publish" | "revision";
        action: string;
        reportCardId: string;
        expectedRowVersion: number;
        reason?: string;
      };
    }) => {
      const { payload, requestId } = request;
      if (payload.command === "publish")
        return publish({
          data: {
            reportCardId: payload.reportCardId,
            expectedRowVersion: payload.expectedRowVersion,
            requestId,
          },
        });
      if (payload.command === "revision")
        return revision({
          data: {
            sourceReportCardId: payload.reportCardId,
            expectedSourceRowVersion: payload.expectedRowVersion,
            reason: payload.reason ?? "",
            requestId,
          },
        });
      return transition({
        data: {
          reportCardId: payload.reportCardId,
          expectedRowVersion: payload.expectedRowVersion,
          action: payload.action as "submit" | "review" | "return" | "archive",
          requestId,
        },
      });
    },
    onSuccess: async (result, request) => {
      await queryClient.invalidateQueries({ queryKey: ["report-cards"] });
      await queryClient.invalidateQueries({ queryKey: ["report-card", reportCardId] });
      requestAction.succeed(request);
      if (request.payload.command === "revision" && result?.report_card_id)
        navigate({ to: "/report-cards/$id", params: { id: result.report_card_id } });
      else toast.success("Report card workflow updated.");
    },
    onError: async (error, request) => {
      requestAction.fail(error, request);
      toast.error(formatReportingMutationError(error));
      await queryClient.invalidateQueries({ queryKey: ["report-card", reportCardId] });
    },
  });
  const runAction = (action: string) => {
    if (mutation.isPending || requestAction.retryAction) return;
    const command =
      action === "publish" ? "publish" : action === "revision" ? "revision" : "transition";
    const payload = {
      command,
      action,
      reportCardId,
      expectedRowVersion: rowVersion,
      ...(command === "revision" ? { reason: revisionReason.trim() } : {}),
    } as const;
    const request = requestAction.begin(payload);
    if (request) mutation.mutate(request);
  };
  const retryAction = () => {
    const request = requestAction.retry();
    if (request && !mutation.isPending) mutation.mutate(request);
  };
  const button = (
    action: string,
    label: string,
    variant: "default" | "outline" | "destructive" = "default",
  ) => (
    <Button
      key={action}
      variant={variant}
      disabled={mutation.isPending || Boolean(requestAction.retryAction)}
      onClick={() => runAction(action)}
    >
      {label}
    </Button>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          Workflow
        </CardTitle>
        <CardDescription>
          Only actions valid for this lifecycle state and your permissions are shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {requestAction.retryAction && (
          <Alert className="w-full">
            <AlertTitle>Workflow result is uncertain</AlertTitle>
            <AlertDescription>Retry the same action to safely confirm its result.</AlertDescription>
            <Button variant="outline" onClick={retryAction} disabled={mutation.isPending}>
              Retry action
            </Button>
          </Alert>
        )}
        {actions.includes("submit") && button("submit", "Submit", "default")}
        {actions.includes("archive") && button("archive", "Archive", "outline")}
        {actions.includes("review") && button("review", "Mark reviewed")}
        {actions.includes("return") && button("return", "Return to draft", "outline")}
        {actions.includes("publish") && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={mutation.isPending}>Publish</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Publish official Report Card?</AlertDialogTitle>
                <AlertDialogDescription>
                  The reviewed snapshot will become the Parent-visible official Report Card. If an
                  older version is published, it becomes historical/revised and is not deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => runAction("publish")}>
                  Publish official report
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {actions.includes("revision") && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={mutation.isPending}>
                Create Revision
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Create a new draft version?</AlertDialogTitle>
                <AlertDialogDescription>
                  The current published version remains visible and immutable. A new draft version
                  will be created for changes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                value={revisionReason}
                onChange={(event) => setRevisionReason(event.target.value)}
                disabled={mutation.isPending || Boolean(requestAction.retryAction)}
                placeholder="Reason for this revision"
                maxLength={1000}
                aria-label="Revision reason"
              />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={!revisionReason.trim() || mutation.isPending}
                  onClick={() => runAction("revision")}
                >
                  Create draft revision
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {!actions.some((a) =>
          ["submit", "archive", "review", "return", "publish", "revision"].includes(a),
        ) && <p className="text-sm text-muted-foreground">This version is read-only.</p>}
      </CardContent>
    </Card>
  );
}

function ReportCardDocumentSection({
  reportCardId,
  status,
}: {
  reportCardId: string;
  status: string;
}) {
  const statusFn = useServerFn(getReportCardDocumentStatus);
  const generateFn = useServerFn(generateReportCardDocument);
  const regenerateFn = useServerFn(regenerateReportCardDocument);
  const downloadFn = useServerFn(getReportCardDownload);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["report-card-document", reportCardId],
    queryFn: () => statusFn({ data: { reportCardId } }),
    retry: false,
  });
  const generate = useMutation({
    mutationFn: () => generateFn({ data: { reportCardId } }),
    onSuccess: async () => {
      toast.success("Official PDF is available.");
      await queryClient.invalidateQueries({ queryKey: ["report-card-document", reportCardId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "PDF generation failed."),
  });
  const regenerate = useMutation({
    mutationFn: () => regenerateFn({ data: { reportCardId } }),
    onSuccess: async (result) => {
      if (result.cleanupPending)
        toast.warning(
          "Official PDF regenerated. The previous non-authoritative Storage object still needs orphan cleanup.",
        );
      else toast.success("Official PDF regenerated.");
      await queryClient.invalidateQueries({ queryKey: ["report-card-document", reportCardId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "PDF regeneration failed."),
  });
  const download = useMutation({
    mutationFn: () => downloadFn({ data: { reportCardId } }),
    onSuccess: (result) => window.location.assign(result.url),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Secure download failed."),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Official PDF</CardTitle>
        <CardDescription>
          Private, version-specific document for this immutable Report Card snapshot.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : query.error || !query.data ? (
          <Alert variant="destructive">
            <AlertTitle>Document status unavailable</AlertTitle>
            <AlertDescription>
              {query.error instanceof Error
                ? query.error.message
                : "This document is outside your authorized scope."}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="font-medium">
                  {query.data.state === "available"
                    ? "Available"
                    : query.data.state === "failed"
                      ? "Generation failed"
                      : "Not generated"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {query.data.document?.generatedAt
                    ? `Generated ${date(query.data.document.generatedAt)}`
                    : status === "published"
                      ? "Generate once for this published version."
                      : "No new document can be generated for this lifecycle state."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {status === "published" && query.data.state === "available" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={regenerate.isPending || download.isPending}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {regenerate.isPending ? "Regenerating…" : "Regenerate PDF"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Regenerate official PDF?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This rebuilds the PDF from the same immutable published Report Card
                          snapshot. The Report Card version does not change. The replacement is
                          uploaded to a new private object path and becomes authoritative only after
                          the server attestation is verified.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={regenerate.isPending}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          disabled={regenerate.isPending}
                          onClick={() => regenerate.mutate()}
                        >
                          Regenerate official PDF
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {query.data.state === "available" && (
                  <Button
                    disabled={download.isPending || regenerate.isPending}
                    onClick={() => download.mutate()}
                  >
                    Download PDF
                  </Button>
                )}
                {status === "published" && query.data.state !== "available" && (
                  <Button disabled={generate.isPending} onClick={() => generate.mutate()}>
                    {generate.isPending
                      ? "Generating…"
                      : query.data.state === "failed"
                        ? "Retry Generation"
                        : "Generate PDF"}
                  </Button>
                )}
              </div>
            </div>
            {query.data.state === "failed" && "message" in query.data && (
              <p className="text-sm text-destructive">{query.data.message}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ReportCardBuilder({ id }: { id: string }) {
  const fn = useServerFn(getReportCardProjection);
  const queryClient = useQueryClient();
  const { permissions, activeOrganization } = useAppContext();
  const canRead = permissions.includes("report_card.read");
  const contentFn = useServerFn(saveReportCardContentCommand);
  const generateFn = useServerFn(generateReportCardDraftCommand);
  const fetchAcademicContext = useServerFn(getAcademicContext);
  const query = useQuery({
    queryKey: ["report-card", id],
    queryFn: () => fn({ data: { reportCardId: id } }),
    retry: false,
    enabled: canRead,
  });
  const academicContextQuery = useQuery({
    queryKey: ["academic-context", (query.data as unknown as Detail | undefined)?.card.school_id],
    queryFn: () =>
      fetchAcademicContext({
        data: { schoolId: (query.data as unknown as Detail).card.school_id },
      }),
    enabled: canRead && Boolean((query.data as unknown as Detail | undefined)?.card.school_id),
    staleTime: 60_000,
  });
  const [comment, setComment] = useState("");
  const [conflict, setConflict] = useState(false);
  type DraftAction =
    | { operation: "save"; input: Omit<ReportCardContentInput, "requestId"> }
    | { operation: "regenerate"; input: Omit<ReportCardGenerationInput, "requestId"> };
  const requestAction = useReportCardRequestAction<DraftAction>();
  useEffect(
    () => setComment((query.data as unknown as Detail | undefined)?.card.homeroom_comment ?? ""),
    [query.data],
  );
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["report-card", id] });
    await queryClient.invalidateQueries({ queryKey: ["report-cards"] });
  };
  const mutation = useMutation({
    mutationFn: async (request: { requestId: string; payload: DraftAction }) => {
      if (request.payload.operation === "save")
        return contentFn({ data: { ...request.payload.input, requestId: request.requestId } });
      return generateFn({ data: { ...request.payload.input, requestId: request.requestId } });
    },
    onSuccess: async (_result, request) => {
      setConflict(false);
      toast.success("Report card saved.");
      await refresh();
      requestAction.succeed(request);
    },
    onError: async (error, request) => {
      requestAction.fail(error, request);
      const message = formatReportingMutationError(error);
      if (/changed|stale|refresh/i.test(message)) setConflict(true);
      else toast.error(message);
    },
  });
  const runDraftAction = (payload: DraftAction) => {
    if (mutation.isPending || requestAction.retryAction) return;
    const request = requestAction.begin(payload);
    if (request) mutation.mutate(request);
  };
  const retryDraftAction = () => {
    const request = requestAction.retry();
    if (request && !mutation.isPending) mutation.mutate(request);
  };
  if (query.isLoading)
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      </AppShell>
    );
  if (!canRead)
    return (
      <AppShell>
        <Alert>
          <AlertTitle>Report card access unavailable</AlertTitle>
          <AlertDescription>
            Your current permissions do not include report-card access.
          </AlertDescription>
        </Alert>
      </AppShell>
    );
  if (query.error)
    return (
      <AppShell>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Report card could not be loaded</AlertTitle>
          <AlertDescription>{(query.error as Error).message}</AlertDescription>
        </Alert>
      </AppShell>
    );
  if (!query.data)
    return (
      <AppShell>
        <Alert>
          <AlertTitle>Report card not found</AlertTitle>
          <AlertDescription>
            The identifier is invalid, unknown, or outside your authorized scope.
          </AlertDescription>
        </Alert>
      </AppShell>
    );
  const rawData = query.data as unknown as Detail;
  const academicYears = academicContextQuery.data?.academicYears ?? [];
  const academicTerms = academicContextQuery.data?.terms ?? [];
  const canonicalYear = academicYears.find((year) => year.id === rawData.card.academic_year_id);
  const canonicalTerm = academicTerms.find(
    (term) =>
      term.id === rawData.card.term_id && term.academicYearId === rawData.card.academic_year_id,
  );
  const canonicalSchool = activeOrganization?.schools.find(
    (school) => school.id === rawData.card.school_id,
  );
  const context = {
    studentName: rawData.student_name ?? "Student",
    schoolName: canonicalSchool?.name ?? "School",
    academicYearName:
      canonicalYear?.name ??
      (academicContextQuery.isLoading ? "Loading academic year…" : "Academic year unavailable"),
    termName:
      canonicalTerm?.name ??
      (academicContextQuery.isLoading ? "Loading term…" : "Term unavailable"),
    gradeLevelName: null,
    classroomName: null,
  };
  const data = { ...rawData, context };
  const draft = data.card.status === "draft";
  const actions = reportActions(data.card.status, permissions);
  const canSave = actions.includes("save");
  const canRegenerate = actions.includes("regenerate");
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <Link
              to="/report-cards"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Report Cards
            </Link>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Frozen academic snapshot
            </p>
            <h1 className="text-3xl font-semibold">{context.studentName}</h1>
            <p className="text-sm text-muted-foreground">
              {data.context.schoolName} · {data.context.academicYearName} · {data.context.termName}
            </p>
            <p className="text-sm text-muted-foreground">
              {[data.context.gradeLevelName, data.context.classroomName]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Version {data.card.version}</Badge>
            <ReportCardStatusBadge status={data.card.status} />
          </div>
        </header>
        {conflict && (
          <Alert variant="destructive">
            <AlertTitle>This report card changed elsewhere</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>Reload the latest snapshot before saving again.</span>
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                Reload latest
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {requestAction.retryAction && (
          <Alert variant="destructive">
            <AlertTitle>Save result is uncertain</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>Your edits are being held. Retry the same save to confirm its result.</span>
              <Button
                variant="outline"
                size="sm"
                onClick={retryDraftAction}
                disabled={mutation.isPending}
              >
                Retry same save
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <Alert>
          <BookOpenCheck className="h-4 w-4" />
          <AlertTitle>This is a snapshot</AlertTitle>
          <AlertDescription>
            Calculated scores and attendance were captured from published source data. They are not
            live gradebook fields and cannot be edited here.
          </AlertDescription>
        </Alert>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subject snapshot</CardTitle>
            <CardDescription>
              Scores, predicates, and teacher narratives frozen for this version.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SubjectEntryTable
              entries={data.entries}
              draft={draft && canSave}
              busy={mutation.isPending || Boolean(requestAction.retryAction)}
              onSave={(entry, narrative) =>
                runDraftAction({
                  operation: "save",
                  input: {
                    reportCardId: id,
                    expectedRowVersion: data.card.row_version,
                    content: {
                      subject_entries: [
                        {
                          id: entry.id,
                          narrative: narrative || null,
                          expected_row_version: entry.row_version,
                        },
                      ],
                    },
                  },
                })
              }
            />
          </CardContent>
        </Card>
        <AttendanceSummary value={data.card.attendance_summary} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Homeroom comment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={
                !draft || !canSave || mutation.isPending || Boolean(requestAction.retryAction)
              }
              rows={5}
            />
            {draft && canSave && (
              <Button
                disabled={mutation.isPending || Boolean(requestAction.retryAction)}
                onClick={() =>
                  runDraftAction({
                    operation: "save",
                    input: {
                      reportCardId: id,
                      expectedRowVersion: data.card.row_version,
                      content: { homeroom_comment: comment || null },
                    },
                  })
                }
              >
                Save comment
              </Button>
            )}
          </CardContent>
        </Card>
        <NarrativeEditor
          narratives={data.narratives}
          draft={draft && canSave}
          busy={mutation.isPending || Boolean(requestAction.retryAction)}
          cardUpdatedAt={data.card.updated_at}
          onSave={(input) =>
            runDraftAction({
              operation: "save",
              input: {
                reportCardId: id,
                expectedRowVersion: data.card.row_version,
                content: {
                  narratives: [
                    {
                      id: input.narrativeId ?? null,
                      section_code: input.sectionCode,
                      title: input.title,
                      content: input.content,
                      sequence: input.sequence,
                      ...(input.expectedRowVersion
                        ? { expected_row_version: input.expectedRowVersion }
                        : {}),
                    },
                  ],
                },
              },
            })
          }
        />
        {draft && canRegenerate && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regenerate snapshot</CardTitle>
              <CardDescription>
                Refresh calculated values from current published source data. Human narrative fields
                are preserved by the reporting foundation and values freeze again on submission.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                disabled={mutation.isPending || Boolean(requestAction.retryAction)}
                onClick={() =>
                  runDraftAction({
                    operation: "regenerate",
                    input: {
                      studentEnrollmentId: data.card.student_enrollment_id,
                      termId: data.card.term_id,
                      expectedRowVersion: data.card.row_version,
                    },
                  })
                }
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate Snapshot
              </Button>
            </CardContent>
          </Card>
        )}
        <ReviewPublishBar
          status={data.card.status}
          rowVersion={data.card.row_version}
          reportCardId={id}
        />
        <ReportCardVersionHistory rows={data.history} currentId={id} />
        <ReportCardDocumentSection reportCardId={id} status={data.card.status} />
      </div>
    </AppShell>
  );
}
