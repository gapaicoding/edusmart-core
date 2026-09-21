import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ClipboardCheck, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAppContext, PermissionGate } from "@/lib/app-context";
import {
  changeAssessmentLifecycle,
  getAssessment,
  getAssessmentOptions,
  saveScores,
} from "@/lib/assessment.functions";
import {
  correctFinalScoreCommand,
  createAssessmentCommand,
  getAssessmentProjection,
  getGradebookProjection,
  listAssessmentProjection,
  saveAssessmentScoresCommand,
  transitionAssessmentCommand,
  updateAssessmentDraftCommand,
} from "@/lib/assessment-gradebook.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

function useScope() {
  const c = useAppContext();
  const org = c.activeOrganization?.organizationId;
  const school = c.activeSchool?.id;
  const year = c.activeAcademicYear?.id;
  const term = c.activeTerm?.id;
  return {
    context: c,
    scope:
      org && school && year && term
        ? { organizationId: org, schoolId: school, academicYearId: year, termId: term }
        : null,
  };
}

function StateMessage({ children }: { children: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

function AssessmentForm({
  scope,
  onSaved,
}: {
  scope: NonNullable<ReturnType<typeof useScope>["scope"]>;
  onSaved: () => void;
}) {
  const optionsFn = useServerFn(getAssessmentOptions);
  const saveFn = useServerFn(createAssessmentCommand);
  const [open, setOpen] = useState(false);
  const opts = useQuery({
    queryKey: ["assessment-options", scope],
    queryFn: () => optionsFn({ data: scope }),
    enabled: open,
  });
  const [assignment, setAssignment] = useState("");
  const [type, setType] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [min, setMin] = useState("0");
  const [max, setMax] = useState("100");
  const [weight, setWeight] = useState("");
  const [description, setDescription] = useState("");
  const mutation = useMutation({
    mutationFn: (requestId: string) =>
      saveFn({
        data: {
          ...scope,
          teachingAssignmentId: assignment,
          assessmentTypeId: type,
          title,
          description: description || null,
          assessmentDate: date,
          minScore: Number(min),
          maxScore: Number(max),
          weight: weight === "" ? null : Number(weight),
          requestId,
        },
      }),
    onSuccess: () => {
      toast.success("Assessment draft created.");
      setOpen(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New assessment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create assessment</DialogTitle>
          <DialogDescription>Create a draft in the selected academic context.</DialogDescription>
        </DialogHeader>
        {opts.isPending ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Teaching assignment</Label>
              <Select value={assignment} onValueChange={setAssignment}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose class and subject" />
                </SelectTrigger>
                <SelectContent>
                  {opts.data?.assignments.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assessment type</Label>
              <Select
                value={type}
                onValueChange={(v) => {
                  setType(v);
                  const w = opts.data?.types.find((x) => x.id === v)?.defaultWeight;
                  setWeight(w == null ? "" : String(w));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose type" />
                </SelectTrigger>
                <SelectContent>
                  {opts.data?.types.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Title</Label>
              <Input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Minimum score</Label>
              <Input
                type="number"
                step="0.01"
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
            </div>
            <div>
              <Label>Maximum score</Label>
              <Input
                type="number"
                step="0.01"
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </div>
            <div>
              <Label>Weight (optional)</Label>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !assignment || !type || !title || !date}
            onClick={() => mutation.mutate(crypto.randomUUID())}
          >
            {mutation.isPending ? "Saving…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssessmentsPage() {
  const { context, scope } = useScope();
  const qc = useQueryClient();
  const fn = useServerFn(listAssessmentProjection);
  const optionsFn = useServerFn(getAssessmentOptions);
  const canRead = context.hasPermission("assessment.read");
  const q = useQuery({
    queryKey: ["assessments", scope],
    queryFn: () => fn({ data: scope! }),
    enabled: !!scope && canRead,
  });
  const options = useQuery({
    queryKey: ["assessment-options", scope],
    queryFn: () => optionsFn({ data: scope! }),
    enabled: !!scope && canRead,
  });
  if (context.contextLoading || context.academicLoading || (!scope && !context.error))
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  if (context.error) return <StateMessage>{context.error.message}</StateMessage>;
  if (!scope)
    return (
      <StateMessage>Select a school, academic year, and term to view assessments.</StateMessage>
    );
  if (!canRead) return <StateMessage>Access unavailable.</StateMessage>;
  const assignmentLabels = new Map((options.data?.assignments ?? []).map((x) => [x.id, x.label]));
  const typeNames = new Map((options.data?.types ?? []).map((x) => [x.id, x.name]));
  const displayRows = q.data!.map((a) => ({
    ...a,
    subjectName: assignmentLabels.get(a.teaching_assignment_id) ?? "Assigned class",
    classroomName: "",
    typeName: typeNames.get(a.assessment_type_id) ?? "Assessment",
    assessmentDate: a.assessment_date,
    minScore: "",
    maxScore: "",
    weight: null,
  }));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Assessments</h1>
          <p className="text-sm text-muted-foreground">
            Create assessments and manage scoring for the selected term.
          </p>
        </div>
        <PermissionGate permission="assessment.create">
          <AssessmentForm
            scope={scope}
            onSaved={() => void qc.invalidateQueries({ queryKey: ["assessments"] })}
          />
        </PermissionGate>
      </div>
      {q.isPending ? (
        <Skeleton className="h-48" />
      ) : q.error ? (
        <StateMessage>{(q.error as Error).message}</StateMessage>
      ) : q.data!.length === 0 ? (
        <StateMessage>No assessments in this term.</StateMessage>
      ) : (
        <div className="grid gap-3">
          {displayRows.map((a) => (
            <Link key={a.id} to="/assessments/$id" params={{ id: a.id }}>
              <Card className="transition-colors hover:bg-accent/30">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{a.title}</CardTitle>
                      <CardDescription>
                        {a.subjectName} · {a.classroomName} · {a.typeName}
                      </CardDescription>
                    </div>
                    <Badge variant={a.status === "published" ? "default" : "secondary"}>
                      {a.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {a.assessmentDate} · Score {a.minScore}–{a.maxScore}
                  {a.weight == null ? "" : ` · Weight ${a.weight}`}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

type DraftRow = {
  scoreId: string | null;
  studentEnrollmentId: string;
  studentName: string;
  studentNumber: string | null;
  score: number | null;
  status: string;
  feedback: string | null;
  updatedAt: string | null;
};
export function AssessmentDetailPage({ id }: { id: string }) {
  const { context, scope } = useScope();
  const qc = useQueryClient();
  const detailFn = useServerFn(getAssessment);
  const saveFn = useServerFn(saveScores);
  const lifeFn = useServerFn(changeAssessmentLifecycle);
  const q = useQuery({
    queryKey: ["assessment", id, scope],
    queryFn: () => detailFn({ data: { ...scope!, id } }),
    enabled: !!scope,
  });
  const [rows, setRows] = useState<DraftRow[]>([]);
  useEffect(() => {
    if (q.data) setRows(q.data.roster);
  }, [q.data]);
  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          ...scope!,
          id,
          rows: rows.map((r) => ({
            scoreId: r.scoreId ?? undefined,
            studentEnrollmentId: r.studentEnrollmentId,
            score: r.score,
            status: r.status as "missing" | "submitted" | "excused" | "final",
            feedback: r.feedback,
            expectedUpdatedAt: r.updatedAt ?? undefined,
          })),
        },
      }),
    onSuccess: (r) => {
      const failures = r.results.filter((x) => !x.ok);
      if (failures.length)
        toast.error(`${failures.length} score(s) were not saved. ${failures[0]?.message}`);
      else toast.success("Scores saved.");
      void qc.invalidateQueries({ queryKey: ["assessment", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const lifecycle = useMutation({
    mutationFn: (action: "open" | "close" | "publish" | "archive") =>
      lifeFn({ data: { ...scope!, id, action, expectedUpdatedAt: q.data!.assessment.updated_at } }),
    onSuccess: () => {
      toast.success("Assessment status updated.");
      void qc.invalidateQueries({ queryKey: ["assessment", id] });
      void qc.invalidateQueries({ queryKey: ["assessments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (context.contextLoading || q.isPending) return <Skeleton className="h-72" />;
  if (!scope) return <StateMessage>Select a complete academic context.</StateMessage>;
  if (q.error) return <StateMessage>{(q.error as Error).message}</StateMessage>;
  const a = q.data!.assessment;
  const canEdit =
    ["draft", "open", "closed"].includes(a.status) || context.hasPermission("score.update_locked");
  const next =
    a.status === "draft"
      ? "open"
      : a.status === "open"
        ? "close"
        : a.status === "closed"
          ? "publish"
          : null;
  return (
    <div className="space-y-5">
      <Link to="/assessments" className="inline-flex items-center text-sm text-muted-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" />
        Assessments
      </Link>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{a.title}</CardTitle>
              <CardDescription>
                {a.assessment_date} · Score {a.min_score}–{a.max_score}
              </CardDescription>
            </div>
            <Badge>{a.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {next &&
            (next === "publish" ? (
              <PermissionGate permission="assessment.publish">
                <Button disabled={lifecycle.isPending} onClick={() => lifecycle.mutate(next)}>
                  Publish scores
                </Button>
              </PermissionGate>
            ) : (
              <Button disabled={lifecycle.isPending} onClick={() => lifecycle.mutate(next)}>
                {next === "close" ? "Close scoring" : "Open scoring"}
              </Button>
            ))}
          <PermissionGate permission="assessment.archive_own">
            <Button
              variant="outline"
              disabled={a.status === "archived" || lifecycle.isPending}
              onClick={() => lifecycle.mutate("archive")}
            >
              Archive
            </Button>
          </PermissionGate>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Score entry
          </CardTitle>
          <CardDescription>
            {rows.length} eligible students. Missing and excused results have no numeric score.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No students were enrolled in this class on the assessment date.
            </p>
          ) : (
            rows.map((r, i) => (
              <div
                key={r.studentEnrollmentId}
                className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(160px,1fr)_120px_150px_minmax(180px,1fr)] sm:items-end"
              >
                <div>
                  <p className="font-medium">{r.studentName}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.studentNumber || "No student number"}
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Score</Label>
                  <Input
                    aria-label={`Score for ${r.studentName}`}
                    type="number"
                    step="0.01"
                    min={a.min_score}
                    max={a.max_score}
                    disabled={!canEdit || ["missing", "excused"].includes(r.status)}
                    value={r.score ?? ""}
                    onChange={(e) =>
                      setRows((x) =>
                        x.map((v, n) =>
                          n === i
                            ? { ...v, score: e.target.value === "" ? null : Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Result</Label>
                  <Select
                    disabled={!canEdit}
                    value={r.status}
                    onValueChange={(v) =>
                      setRows((x) =>
                        x.map((row, n) =>
                          n === i
                            ? {
                                ...row,
                                status: v,
                                score: ["missing", "excused"].includes(v) ? null : row.score,
                              }
                            : row,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="missing">Missing</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="excused">Excused</SelectItem>
                      <SelectItem value="final">Final</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Feedback</Label>
                  <Input
                    disabled={!canEdit}
                    value={r.feedback ?? ""}
                    maxLength={1000}
                    onChange={(e) =>
                      setRows((x) =>
                        x.map((v, n) => (n === i ? { ...v, feedback: e.target.value || null } : v)),
                      )
                    }
                  />
                </div>
              </div>
            ))
          )}
          {rows.length > 0 && (
            <div className="sticky bottom-3 flex justify-end rounded-lg border bg-background/95 p-3 shadow">
              <Button disabled={!canEdit || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? "Saving…" : "Save all scores"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
