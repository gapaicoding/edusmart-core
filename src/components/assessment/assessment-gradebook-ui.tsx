import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ClipboardCheck, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAppContext, PermissionGate } from "@/lib/app-context";
import { getAssessmentOptions } from "@/lib/assessment.functions";
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
  const context = useAppContext();
  const organizationId = context.activeOrganization?.organizationId;
  const schoolId = context.activeSchool?.id;
  const academicYearId = context.activeAcademicYear?.id;
  const termId = context.activeTerm?.id;
  return {
    context,
    scope:
      organizationId && schoolId && academicYearId && termId
        ? { organizationId, schoolId, academicYearId, termId }
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
  const createFn = useServerFn(createAssessmentCommand);
  const [open, setOpen] = useState(false);
  const options = useQuery({
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
      createFn({
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
    onError: (error: Error) => toast.error(error.message),
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
        {options.isPending ? (
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
                  {options.data?.assignments.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assessment type</Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value);
                  const defaultWeight = options.data?.types.find(
                    (item) => item.id === value,
                  )?.defaultWeight;
                  setWeight(defaultWeight == null ? "" : String(defaultWeight));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose type" />
                </SelectTrigger>
                <SelectContent>
                  {options.data?.types.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Title</Label>
              <Input
                value={title}
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div>
              <Label>Minimum score</Label>
              <Input
                type="number"
                step="0.01"
                value={min}
                onChange={(event) => setMin(event.target.value)}
              />
            </div>
            <div>
              <Label>Maximum score</Label>
              <Input
                type="number"
                step="0.01"
                value={max}
                onChange={(event) => setMax(event.target.value)}
              />
            </div>
            <div>
              <Label>Weight (optional)</Label>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
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
  const listFn = useServerFn(listAssessmentProjection);
  const optionsFn = useServerFn(getAssessmentOptions);
  const canRead = context.hasPermission("assessment.read");
  const query = useQuery({
    queryKey: ["assessments", scope],
    queryFn: () => listFn({ data: { ...scope!, status: null, limit: 100, offset: 0 } }),
    enabled: !!scope && canRead,
  });
  const options = useQuery({
    queryKey: ["assessment-options", scope],
    queryFn: () => optionsFn({ data: scope! }),
    enabled: !!scope && canRead,
  });
  if (context.contextLoading || context.academicLoading || (!scope && !context.error)) {
    return <Skeleton className="h-56" />;
  }
  if (context.error) return <StateMessage>{context.error.message}</StateMessage>;
  if (!scope) return <StateMessage>Select a complete academic context.</StateMessage>;
  if (!canRead) return <StateMessage>Access unavailable.</StateMessage>;
  const assignmentLabels = new Map(
    (options.data?.assignments ?? []).map((item) => [item.id, item.label]),
  );
  const typeNames = new Map((options.data?.types ?? []).map((item) => [item.id, item.name]));
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
      {query.isPending ? (
        <Skeleton className="h-48" />
      ) : query.error ? (
        <StateMessage>{(query.error as Error).message}</StateMessage>
      ) : query.data.length === 0 ? (
        <StateMessage>No assessments in this term.</StateMessage>
      ) : (
        <div className="grid gap-3">
          {query.data.map((assessment) => (
            <Link key={assessment.id} to="/assessments/$id" params={{ id: assessment.id }}>
              <Card className="transition-colors hover:bg-accent/30">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{assessment.title}</CardTitle>
                      <CardDescription>
                        {assignmentLabels.get(assessment.teaching_assignment_id) ??
                          "Assigned class"}{" "}
                        · {typeNames.get(assessment.assessment_type_id) ?? "Assessment"}
                      </CardDescription>
                    </div>
                    <Badge variant={assessment.status === "published" ? "default" : "secondary"}>
                      {assessment.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {assessment.assessment_date} · Version {assessment.version}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

type GradebookRow = {
  score_id: string | null;
  student_enrollment_id: string;
  student_name: string;
  enrollment_status: string;
  score: number | null;
  score_status: string | null;
  score_version: number | null;
  feedback: string | null;
  current_eligible: boolean;
};

export function AssessmentDetailPage({ id }: { id: string }) {
  const { context, scope } = useScope();
  const qc = useQueryClient();
  const detailFn = useServerFn(getAssessmentProjection);
  const gradebookFn = useServerFn(getGradebookProjection);
  const updateFn = useServerFn(updateAssessmentDraftCommand);
  const scoreFn = useServerFn(saveAssessmentScoresCommand);
  const lifecycleFn = useServerFn(transitionAssessmentCommand);
  const correctionFn = useServerFn(correctFinalScoreCommand);
  const canRead = context.hasPermission("assessment.read");
  const detail = useQuery({
    queryKey: ["assessment-b15", id, scope],
    queryFn: () => detailFn({ data: { ...scope!, assessmentId: id } }),
    enabled: !!scope && canRead,
  });
  const gradebook = useQuery({
    queryKey: ["gradebook-b15", id, scope],
    queryFn: () => gradebookFn({ data: { ...scope!, assessmentId: id } }),
    enabled: !!scope && canRead,
  });
  const [rows, setRows] = useState<GradebookRow[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [correctionRow, setCorrectionRow] = useState<GradebookRow | null>(null);
  const [correctionScore, setCorrectionScore] = useState("");
  const [correctionStatus, setCorrectionStatus] = useState<"submitted" | "final">("final");
  const [correctionReason, setCorrectionReason] = useState("");
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (gradebook.data) setRows(gradebook.data as GradebookRow[]);
  }, [gradebook.data]);
  useEffect(() => {
    if (detail.data) setDraftTitle(detail.data.title);
  }, [detail.data]);
  const refresh = () => {
    void detail.refetch();
    void gradebook.refetch();
    void qc.invalidateQueries({ queryKey: ["assessments"] });
  };
  const saveScores = useMutation({
    mutationFn: (requestId: string) =>
      scoreFn({
        data: {
          assessmentId: id,
          organizationId: scope!.organizationId,
          schoolId: scope!.schoolId,
          expectedAssessmentVersion: detail.data!.version,
          requestId,
          entries: rows
            .filter((row) => row.current_eligible)
            .map((row) => ({
              studentEnrollmentId: row.student_enrollment_id,
              score: row.score,
              status: (row.score_status ?? "missing") as
                "missing" | "submitted" | "excused" | "final",
              feedback: row.feedback,
              expectedScoreVersion: row.score_version,
            })),
        },
      }),
    onSuccess: () => {
      toast.success("Scores saved.");
      refresh();
    },
    onError: (error: Error) => {
      setConflict(/changed|refresh|stale/i.test(error.message));
      toast.error(error.message);
    },
  });
  const lifecycle = useMutation({
    mutationFn: (action: "open" | "close" | "publish" | "archive") =>
      lifecycleFn({
        data: {
          assessmentId: id,
          organizationId: scope!.organizationId,
          schoolId: scope!.schoolId,
          action,
          expectedVersion: detail.data!.version,
          requestId: crypto.randomUUID(),
        },
      }),
    onSuccess: () => {
      toast.success("Assessment status updated.");
      refresh();
    },
    onError: (error: Error) => {
      setConflict(/changed|refresh|stale/i.test(error.message));
      toast.error(error.message);
    },
  });
  const updateDraft = useMutation({
    mutationFn: (requestId: string) =>
      updateFn({
        data: {
          assessmentId: id,
          organizationId: scope!.organizationId,
          schoolId: scope!.schoolId,
          assessmentTypeId: detail.data!.assessment_type_id,
          assessmentDate: detail.data!.assessment_date,
          title: draftTitle,
          description: detail.data!.description,
          minScore: detail.data!.min_score,
          maxScore: detail.data!.max_score,
          weight: detail.data!.weight,
          expectedVersion: detail.data!.version,
          requestId,
        },
      }),
    onSuccess: () => {
      toast.success("Draft updated.");
      refresh();
    },
    onError: (error: Error) => {
      setConflict(/changed|refresh|stale/i.test(error.message));
      toast.error(error.message);
    },
  });
  const correction = useMutation({
    mutationFn: (requestId: string) =>
      correctionFn({
        data: {
          assessmentId: id,
          scoreId: correctionRow!.score_id!,
          organizationId: scope!.organizationId,
          schoolId: scope!.schoolId,
          expectedScoreVersion: correctionRow!.score_version!,
          newScore: Number(correctionScore),
          newStatus: correctionStatus,
          reason: correctionReason,
          requestId,
        },
      }),
    onSuccess: () => {
      toast.success("Final score corrected.");
      setCorrectionRow(null);
      setCorrectionReason("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (context.contextLoading || detail.isPending || gradebook.isPending)
    return <Skeleton className="h-72" />;
  if (!scope) return <StateMessage>Select a complete academic context.</StateMessage>;
  if (!canRead) return <StateMessage>Access unavailable.</StateMessage>;
  if (detail.error || gradebook.error || !detail.data) {
    return (
      <StateMessage>
        {(detail.error ?? (gradebook.error as Error))?.message ?? "Assessment unavailable."}
      </StateMessage>
    );
  }
  const assessment = detail.data;
  const isOrdinaryEditable = ["draft", "open", "closed"].includes(assessment.status);
  const canScore =
    isOrdinaryEditable &&
    (context.hasPermission("score.enter") || context.hasPermission("score.update_open"));
  const next =
    assessment.status === "draft"
      ? "open"
      : assessment.status === "open"
        ? "close"
        : assessment.status === "closed"
          ? "publish"
          : null;
  return (
    <div className="space-y-5">
      <Link to="/assessments" className="inline-flex items-center text-sm text-muted-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> Assessments
      </Link>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{assessment.title}</CardTitle>
              <CardDescription>
                {assessment.assessment_date} · Version {assessment.version}
              </CardDescription>
            </div>
            <Badge>{assessment.status}</Badge>
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
              <PermissionGate permission="assessment.update_own">
                <Button disabled={lifecycle.isPending} onClick={() => lifecycle.mutate(next)}>
                  {next === "close" ? "Close scoring" : "Open scoring"}
                </Button>
              </PermissionGate>
            ))}
          <PermissionGate permission="assessment.archive_own">
            <Button
              variant="outline"
              disabled={assessment.status === "archived" || lifecycle.isPending}
              onClick={() => lifecycle.mutate("archive")}
            >
              Archive
            </Button>
          </PermissionGate>
        </CardContent>
      </Card>
      {conflict && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm text-destructive">
              This assessment changed. Reload latest data before saving again.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setConflict(false);
                refresh();
              }}
            >
              Reload latest data
            </Button>
          </CardContent>
        </Card>
      )}
      {assessment.status === "draft" && (
        <PermissionGate permission="assessment.update_own">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4" /> Draft details
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="min-w-60 flex-1">
                <Label>Title</Label>
                <Input
                  value={draftTitle}
                  maxLength={160}
                  onChange={(event) => setDraftTitle(event.target.value)}
                />
              </div>
              <Button
                disabled={updateDraft.isPending || !draftTitle.trim()}
                onClick={() => updateDraft.mutate(crypto.randomUUID())}
              >
                Save draft
              </Button>
            </CardContent>
          </Card>
        </PermissionGate>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" /> Score entry
          </CardTitle>
          <CardDescription>
            {rows.length} roster rows. Historical non-eligible scores remain visible and read-only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No students are available for this assessment.
            </p>
          ) : (
            rows.map((row, index) => {
              const rowEditable = canScore && row.current_eligible && !saveScores.isPending;
              const canCorrect = Boolean(
                row.score_id &&
                row.score_status === "final" &&
                ["published", "archived"].includes(assessment.status) &&
                context.hasPermission("score.update_locked"),
              );
              return (
                <div
                  key={row.student_enrollment_id}
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(160px,1fr)_120px_150px_minmax(180px,1fr)_auto] sm:items-end"
                >
                  <div>
                    <p className="font-medium">{row.student_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.current_eligible ? "Eligible" : "Historical · read-only"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">Score</Label>
                    <Input
                      aria-label={`Score for ${row.student_name}`}
                      type="number"
                      step="0.01"
                      min={assessment.min_score}
                      max={assessment.max_score}
                      disabled={
                        !rowEditable || ["missing", "excused"].includes(row.score_status ?? "")
                      }
                      value={row.score ?? ""}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  score:
                                    event.target.value === "" ? null : Number(event.target.value),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Result</Label>
                    <Select
                      disabled={!rowEditable}
                      value={row.score_status ?? "missing"}
                      onValueChange={(value) =>
                        setRows((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  score_status: value,
                                  score: ["missing", "excused"].includes(value) ? null : item.score,
                                }
                              : item,
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
                      disabled={!rowEditable}
                      maxLength={1000}
                      value={row.feedback ?? ""}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, feedback: event.target.value || null }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  {canCorrect && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCorrectionRow(row);
                        setCorrectionScore(String(row.score ?? ""));
                        setCorrectionStatus("final");
                      }}
                    >
                      Correct
                    </Button>
                  )}
                </div>
              );
            })
          )}
          {rows.some((row) => row.current_eligible) && (
            <div className="sticky bottom-3 flex justify-end rounded-lg border bg-background/95 p-3 shadow">
              <Button
                disabled={!canScore || saveScores.isPending}
                onClick={() => saveScores.mutate(crypto.randomUUID())}
              >
                {saveScores.isPending ? "Saving…" : "Save all scores"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={!!correctionRow}
        onOpenChange={(open) => {
          if (!open) setCorrectionRow(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct final score</DialogTitle>
            <DialogDescription>
              Current score: {correctionRow?.score ?? "—"}. A reason is required and will be
              audited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Corrected score</Label>
              <Input
                type="number"
                min={assessment.min_score}
                max={assessment.max_score}
                value={correctionScore}
                onChange={(event) => setCorrectionScore(event.target.value)}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={correctionStatus}
                onValueChange={(value: "submitted" | "final") => setCorrectionStatus(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Correction reason</Label>
              <Textarea
                required
                maxLength={500}
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionRow(null)}>
              Cancel
            </Button>
            <Button
              disabled={correction.isPending || !correctionScore || !correctionReason.trim()}
              onClick={() => correction.mutate(crypto.randomUUID())}
            >
              {correction.isPending ? "Saving…" : "Submit correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
