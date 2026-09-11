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
import {
  createReportCardRevision,
  deleteReportNarrative,
  findExistingReportCard,
  generateReportCardDraft,
  getReportCard,
  listReportCardGenerationCandidates,
  listReportCards,
  publishReportCardVersion,
  saveReportNarrative,
  transitionReportCard,
  updateReportCardComment,
  updateReportSubjectNarrative,
} from "@/lib/reporting.functions";
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
  const candidatesFn = useServerFn(listReportCardGenerationCandidates);
  const generateFn = useServerFn(generateReportCardDraft);
  const findFn = useServerFn(findExistingReportCard);
  const candidates = useQuery({
    queryKey: ["report-card-candidates", schoolId, defaultAcademicYearId, search],
    queryFn: () =>
      candidatesFn({
        data: {
          schoolId,
          academicYearId: defaultAcademicYearId ?? undefined,
          search: search || undefined,
        },
      }),
    enabled: open,
  });
  const selected =
    candidates.data?.rows.find((r) => r.studentEnrollmentId === enrollmentId) ?? null;
  const eligibleTerms = selected
    ? terms.filter((t) => t.academicYearId === selected.academicYearId)
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
  }, [selected?.studentEnrollmentId]);
  const reset = () => {
    setSearch("");
    setEnrollmentId(null);
    setTermId(defaultTermId ?? null);
  };
  const generate = useMutation({
    mutationFn: async () => {
      if (!enrollmentId || !termId) throw new Error("Select a student and a term.");
      if (!eligibleTerms.some((t) => t.id === termId))
        throw new Error("Selected term is not part of this enrollment's academic year.");
      return generateFn({ data: { studentEnrollmentId: enrollmentId, termId } });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["report-cards"] });
      toast.success("Report card draft created.");
      setOpen(false);
      reset();
      navigate({ to: "/report-cards/$id", params: { id: result.id } });
    },
    onError: async (error) => {
      const message = formatReportingMutationError(error);
      if (/already exists/i.test(message) && enrollmentId && termId) {
        try {
          const existing = await findFn({
            data: { studentEnrollmentId: enrollmentId, termId },
          });
          if (existing.card) {
            toast.info("A report card already exists for this student and term. Opening it.");
            setOpen(false);
            reset();
            navigate({ to: "/report-cards/$id", params: { id: existing.card.id } });
            return;
          }
        } catch {
          /* fall through to toast */
        }
      }
      toast.error(message);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
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
            ) : !candidates.data?.rows.length ? (
              <Alert>
                <AlertTitle>No eligible student enrollments</AlertTitle>
                <AlertDescription>
                  No active enrollments in your authorized scope match this search.
                </AlertDescription>
              </Alert>
            ) : (
              <Select value={enrollmentId ?? ""} onValueChange={(v) => setEnrollmentId(v || null)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a student enrollment" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.data.rows.map((r) => (
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
              disabled={!selected}
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
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              reset();
            }}
            disabled={generate.isPending}
          >
            Cancel
          </Button>
          <Button
            data-testid="generate-report-card-submit"
            disabled={!enrollmentId || !termId || generate.isPending}
            onClick={() => generate.mutate()}
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
  const fn = useServerFn(listReportCards);
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
          search: search || undefined,
        },
      }),
    enabled: Boolean(activeSchool?.id),
  });
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
        {!activeSchool ? (
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
        ) : !query.data?.rows.length ? (
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
            {query.data.rows.map((row) => (
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

type Detail = NonNullable<
  Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getReportCard>>>>
>;

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
    expectedUpdatedAt: string;
  }) => void;
  onDelete: (id: string) => void;
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
              {draft && (
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
                      expectedUpdatedAt: n.updated_at,
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
                  expectedUpdatedAt: cardUpdatedAt,
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
  updatedAt,
  reportCardId,
}: {
  status: string;
  updatedAt: string;
  reportCardId: string;
}) {
  const { permissions } = useAppContext();
  const actions = reportActions(status, permissions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const transition = useServerFn(transitionReportCard);
  const publish = useServerFn(publishReportCardVersion);
  const revision = useServerFn(createReportCardRevision);
  const mutation = useMutation({
    mutationFn: async (action: string) => {
      if (action === "publish")
        return publish({ data: { reportCardId, expectedUpdatedAt: updatedAt } });
      if (action === "revision")
        return revision({ data: { reportCardId, expectedUpdatedAt: updatedAt } });
      return transition({
        data: {
          reportCardId,
          expectedUpdatedAt: updatedAt,
          action: action as "submit" | "review" | "return" | "archive",
        },
      });
    },
    onSuccess: async (result, action) => {
      await queryClient.invalidateQueries({ queryKey: ["report-cards"] });
      await queryClient.invalidateQueries({ queryKey: ["report-card", reportCardId] });
      if (action === "revision" && "id" in result)
        navigate({ to: "/report-cards/$id", params: { id: result.id } });
      else toast.success("Report card workflow updated.");
    },
    onError: async (error) => {
      toast.error(formatReportingMutationError(error));
      await queryClient.invalidateQueries({ queryKey: ["report-card", reportCardId] });
    },
  });
  const button = (
    action: string,
    label: string,
    variant: "default" | "outline" | "destructive" = "default",
  ) => (
    <Button
      key={action}
      variant={variant}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(action)}
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
                <AlertDialogAction onClick={() => mutation.mutate("publish")}>
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
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => mutation.mutate("revision")}>
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
  const fn = useServerFn(getReportCard);
  const queryClient = useQueryClient();
  const { permissions } = useAppContext();
  const commentFn = useServerFn(updateReportCardComment);
  const subjectFn = useServerFn(updateReportSubjectNarrative);
  const narrativeFn = useServerFn(saveReportNarrative);
  const deleteFn = useServerFn(deleteReportNarrative);
  const generateFn = useServerFn(generateReportCardDraft);
  const query = useQuery({
    queryKey: ["report-card", id],
    queryFn: () => fn({ data: { reportCardId: id } }),
    retry: false,
  });
  const [comment, setComment] = useState("");
  useEffect(
    () => setComment(query.data?.card.homeroom_comment ?? ""),
    [query.data?.card.homeroom_comment],
  );
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["report-card", id] });
    await queryClient.invalidateQueries({ queryKey: ["report-cards"] });
  };
  const mutation = useMutation({
    mutationFn: async (job: () => Promise<unknown>) => job(),
    onSuccess: async () => {
      toast.success("Report card saved.");
      await refresh();
    },
    onError: async (error) => {
      toast.error(formatReportingMutationError(error));
      await refresh();
    },
  });
  if (query.isLoading)
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
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
  const data = query.data;
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
            <h1 className="text-3xl font-semibold">{data.context.studentName}</h1>
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
              busy={mutation.isPending}
              onSave={(entry, narrative) =>
                mutation.mutate(() =>
                  subjectFn({
                    data: {
                      reportCardId: id,
                      entryId: entry.id,
                      narrative: narrative || null,
                      expectedUpdatedAt: entry.updated_at,
                    },
                  }),
                )
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
              disabled={!draft || !canSave || mutation.isPending}
              rows={5}
            />
            {draft && canSave && (
              <Button
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate(() =>
                    commentFn({
                      data: {
                        reportCardId: id,
                        homeroomComment: comment || null,
                        expectedUpdatedAt: data.card.updated_at,
                      },
                    }),
                  )
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
          busy={mutation.isPending}
          cardUpdatedAt={data.card.updated_at}
          onSave={(input) =>
            mutation.mutate(() => narrativeFn({ data: { reportCardId: id, ...input } }))
          }
          onDelete={(narrativeId) =>
            mutation.mutate(() =>
              deleteFn({
                data: { reportCardId: id, narrativeId, expectedUpdatedAt: data.card.updated_at },
              }),
            )
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
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate(() =>
                    generateFn({
                      data: {
                        studentEnrollmentId: data.card.student_enrollment_id,
                        termId: data.card.term_id,
                        expectedUpdatedAt: data.card.updated_at,
                      },
                    }),
                  )
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
          updatedAt={data.card.updated_at}
          reportCardId={id}
        />
        <ReportCardVersionHistory rows={data.history} currentId={id} />
        <ReportCardDocumentSection reportCardId={id} status={data.card.status} />
      </div>
    </AppShell>
  );
}
