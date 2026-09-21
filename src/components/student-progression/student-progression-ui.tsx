/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PermissionGate, useAppContext } from "@/lib/app-context";
import { listGradeLevels, listClassrooms } from "@/lib/academic.functions";
import {
  approveProgressionBatch,
  applyProgressionBatch,
  cancelProgressionBatch,
  createProgressionBatch,
  getProgressionBatch,
  listProgressionBatches,
  listProgressionCandidates,
  rejectProgressionBatch,
  saveProgressionDecision,
  submitProgressionBatch,
} from "@/lib/student-progression.functions";
import { B14ProgressionError } from "@/lib/student-progression.server";

type Json = any;
const outcomes = ["promoted", "retained", "graduated"] as const;
const id = () => crypto.randomUUID();
const asRows = (value: unknown): Json[] =>
  Array.isArray(value) ? value : value ? [value as Json] : [];
const label = (years: { id: string; name: string }[], value: unknown) =>
  years.find((x) => x.id === value)?.name ?? String(value ?? "—");
const safeError = (error: unknown) =>
  error instanceof B14ProgressionError
    ? error.message
    : "The progression operation could not be completed.";

function Status({ value }: { value: string }) {
  return (
    <Badge
      variant={
        value === "applied"
          ? "default"
          : value === "rejected" || value === "cancelled"
            ? "destructive"
            : "secondary"
      }
    >
      {value.replaceAll("_", " ")}
    </Badge>
  );
}

function Shell({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </main>
  );
}

function ErrorState({ error, onReload }: { error: unknown; onReload?: () => void }) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-wrap items-center gap-3 p-5 text-sm">
        <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
        <span>{safeError(error)}</span>
        {onReload && (
          <Button variant="outline" size="sm" onClick={onReload}>
            <RefreshCw className="h-4 w-4" />
            Reload latest data
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function PermissionDeniedState() {
  return (
    <Card className="border-muted">
      <CardContent className="flex items-start gap-3 p-5 text-sm">
        <ShieldAlert className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="font-medium">Access unavailable</p>
          <p className="mt-1 text-muted-foreground">
            You do not have permission to view student progression records.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function StudentProgressionListPage() {
  const { activeSchool, academicYears, hasPermission, identityLoading, contextLoading } =
    useAppContext();
  const fetch = useServerFn(listProgressionBatches);
  const create = useServerFn(createProgressionBatch);
  const navigate = useNavigate();
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const query = useQuery({
    queryKey: ["progression-batches", activeSchool?.id],
    enabled: !!activeSchool?.id && hasPermission("progression.read"),
    queryFn: () => fetch({ data: { schoolId: activeSchool!.id, limit: 50, offset: 0 } }),
  });
  const years = academicYears;
  const createBatch = async () => {
    if (!activeSchool || !source || !target) return;
    setCreating(true);
    setError(null);
    try {
      const row = await create({
        data: {
          requestId: id(),
          schoolId: activeSchool.id,
          sourceAcademicYearId: source,
          targetAcademicYearId: target,
        },
      });
      const batch = row as Json;
      await navigate({
        to: "/student-progression/$batchId",
        params: { batchId: String(batch.id) },
      });
    } catch (e) {
      setError(e);
    } finally {
      setCreating(false);
    }
  };
  if (identityLoading || contextLoading)
    return (
      <Shell title="Student Progression">
        <p className="text-muted-foreground">Loading access context…</p>
      </Shell>
    );
  if (!hasPermission("progression.read"))
    return (
      <Shell title="Student Progression">
        <PermissionDeniedState />
      </Shell>
    );
  return (
    <Shell
      title="Student Progression"
      description="Prepare, review, and apply annual promotion decisions. Readiness warnings inform the workflow; they do not decide outcomes."
    >
      {Boolean(error) && <ErrorState error={error} />}
      <Card>
        <CardHeader>
          <CardTitle>Progression batches</CardTitle>
          <CardDescription>School-scoped annual rollover work.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Source → target</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Candidates</th>
                  <th className="p-2">Decided</th>
                  <th className="p-2">Warnings</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {query.isPending ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      Loading progression batches…
                    </td>
                  </tr>
                ) : query.error ? (
                  <tr>
                    <td colSpan={6} className="p-6">
                      <ErrorState error={query.error} onReload={() => void query.refetch()} />
                    </td>
                  </tr>
                ) : asRows(query.data).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      No progression batches yet.
                    </td>
                  </tr>
                ) : (
                  asRows(query.data).map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="p-2">
                        {label(years, row.source_academic_year_id)} →{" "}
                        {label(years, row.target_academic_year_id)}
                      </td>
                      <td className="p-2">
                        <Status value={row.status} />
                      </td>
                      <td className="p-2">{row.candidate_count ?? 0}</td>
                      <td className="p-2">{row.decided_count ?? 0}</td>
                      <td className="p-2">{row.warning_count ?? 0}</td>
                      <td className="p-2 text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link
                            to="/student-progression/$batchId"
                            params={{ batchId: String(row.id) }}
                          >
                            Open
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <PermissionGate permission="progression.create">
        <Card>
          <CardHeader>
            <CardTitle>Create Progression Batch</CardTitle>
            <CardDescription>
              Authority is derived from your authenticated school context.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2 text-sm">
                Source academic year
                <select
                  className="h-9 rounded-md border bg-background px-3"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="">Select source year</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                Target academic year
                <select
                  className="h-9 rounded-md border bg-background px-3"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Select target year</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <Button
                  disabled={!hasPermission("progression.create") || !source || !target || creating}
                  onClick={() => void createBatch()}
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}Create batch
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </PermissionGate>
    </Shell>
  );
}

function DecisionEditor({
  batch,
  candidates,
  reload,
}: {
  batch: Json;
  candidates: Json[];
  reload: () => void;
}) {
  const { activeSchool, hasPermission } = useAppContext();
  const save = useServerFn(saveProgressionDecision);
  const grades = useServerFn(listGradeLevels);
  const classrooms = useServerFn(listClassrooms);
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [gradeRows, setGradeRows] = useState<Json[]>([]);
  const [classRows, setClassRows] = useState<Json[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Json>>({});
  const editable = batch.status === "draft" && hasPermission("progression.update");
  useEffect(() => {
    if (!activeSchool) return;
    void grades({ data: { schoolId: activeSchool.id } }).then((x) => setGradeRows(x as Json[]));
  }, [activeSchool, grades]);
  useEffect(() => {
    if (!activeSchool || !batch.target_academic_year_id) return;
    void classrooms({
      data: { schoolId: activeSchool.id, academicYearId: batch.target_academic_year_id },
    }).then((x) => setClassRows(x as Json[]));
  }, [activeSchool, batch.target_academic_year_id, classrooms]);
  const value = (row: Json) => ({
    outcome: row.outcome ?? "",
    targetGradeLevelId: row.target_grade_level_id ?? "",
    targetClassroomId: row.target_classroom_id ?? "",
    exceptionReason: row.exception_reason ?? "",
    ...drafts[row.source_enrollment_id],
  });
  const saveRow = async (row: Json) => {
    if (!activeSchool) return;
    const v = value(row);
    setBusy(row.source_enrollment_id);
    setError(null);
    try {
      await save({
        data: {
          requestId: id(),
          schoolId: activeSchool.id,
          batchId: batch.id,
          sourceStudentEnrollmentId: row.source_enrollment_id,
          outcome: v.outcome,
          targetGradeLevelId: v.outcome === "graduated" ? null : v.targetGradeLevelId || null,
          targetClassroomId: v.outcome === "graduated" ? null : v.targetClassroomId || null,
          exceptionReason: v.exceptionReason || null,
          expectedVersion: Number(row.version),
        },
      });
      reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-4">
      {error && <ErrorState error={error} onReload={reload} />}{" "}
      {candidates.map((row) => {
        const v = value(row);
        const warnings = Array.isArray(row.readiness?.warnings) ? row.readiness.warnings : [];
        return (
          <Card key={row.decision_id}>
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{row.student_name ?? "Student"}</p>
                  <p className="text-xs text-muted-foreground">
                    Source enrollment · {row.source_enrollment_id}
                  </p>
                </div>
                <Badge variant={warnings.length ? "destructive" : "secondary"}>
                  {warnings.length ? "Readiness warning" : "Ready information"}
                </Badge>
              </div>
              {warnings.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">Readiness warning</p>
                  <p>Exception reason is required before this decision can be submitted.</p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="grid gap-1 text-sm">
                  Outcome
                  <select
                    disabled={!editable}
                    className="h-9 rounded-md border bg-background px-2"
                    value={v.outcome}
                    onChange={(e) =>
                      setDrafts({
                        ...drafts,
                        [row.source_enrollment_id]: { ...v, outcome: e.target.value },
                      })
                    }
                  >
                    <option value="">Select outcome</option>
                    {outcomes.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </label>
                {v.outcome !== "graduated" && (
                  <>
                    <label className="grid gap-1 text-sm">
                      Target grade
                      <select
                        disabled={!editable}
                        className="h-9 rounded-md border bg-background px-2"
                        value={v.targetGradeLevelId}
                        onChange={(e) =>
                          setDrafts({
                            ...drafts,
                            [row.source_enrollment_id]: {
                              ...v,
                              targetGradeLevelId: e.target.value,
                            },
                          })
                        }
                      >
                        <option value="">Select grade</option>
                        {gradeRows.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name ?? x.code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      Target classroom
                      <select
                        disabled={!editable}
                        className="h-9 rounded-md border bg-background px-2"
                        value={v.targetClassroomId}
                        onChange={(e) =>
                          setDrafts({
                            ...drafts,
                            [row.source_enrollment_id]: { ...v, targetClassroomId: e.target.value },
                          })
                        }
                      >
                        <option value="">Select classroom</option>
                        {classRows
                          .filter(
                            (x) =>
                              !v.targetGradeLevelId ||
                              x.gradeLevelId === v.targetGradeLevelId ||
                              x.grade_level_id === v.targetGradeLevelId,
                          )
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name ?? x.code}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                )}
                <label className="grid gap-1 text-sm sm:col-span-1">
                  Exception reason
                  <textarea
                    disabled={!editable || warnings.length === 0}
                    className="min-h-9 rounded-md border bg-background px-2 py-1"
                    value={v.exceptionReason}
                    onChange={(e) =>
                      setDrafts({
                        ...drafts,
                        [row.source_enrollment_id]: { ...v, exceptionReason: e.target.value },
                      })
                    }
                    placeholder={warnings.length ? "Required for warning" : "Optional"}
                  />
                </label>
              </div>
              {editable && (
                <Button
                  size="sm"
                  disabled={!v.outcome || busy === row.source_enrollment_id}
                  onClick={() => void saveRow(row)}
                >
                  {busy === row.source_enrollment_id && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Save decision
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Decision version {row.version ?? 1}. Backend validates the final grade/classroom
                rules.
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function StudentProgressionDetailPage({ batchId }: { batchId: string }) {
  const { activeSchool, academicYears, hasPermission, identityLoading, contextLoading } =
    useAppContext();
  const fetchBatch = useServerFn(getProgressionBatch);
  const fetchCandidates = useServerFn(listProgressionCandidates);
  const submit = useServerFn(submitProgressionBatch);
  const reject = useServerFn(rejectProgressionBatch);
  const approve = useServerFn(approveProgressionBatch);
  const cancel = useServerFn(cancelProgressionBatch);
  const apply = useServerFn(applyProgressionBatch);
  const [error, setError] = useState<any>(null);
  const [, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const batchQuery = useQuery({
    queryKey: ["progression-batch", activeSchool?.id, batchId],
    enabled: !!activeSchool?.id && hasPermission("progression.read"),
    queryFn: () => fetchBatch({ data: { schoolId: activeSchool!.id, batchId } }),
  });
  const candidatesQuery = useQuery({
    queryKey: ["progression-candidates", activeSchool?.id, batchId],
    enabled: !!activeSchool?.id && hasPermission("progression.read"),
    queryFn: () =>
      fetchCandidates({ data: { schoolId: activeSchool!.id, batchId, limit: 250, offset: 0 } }),
  });
  const batch = batchQuery.data as Json | undefined;
  const candidates = asRows(candidatesQuery.data);
  const refresh = () => {
    void batchQuery.refetch();
    void candidatesQuery.refetch();
  };
  const transition = async (fn: (x: any) => Promise<unknown>, extra: Json = {}) => {
    if (!activeSchool || !batch) return;
    setBusy(true);
    setError(null);
    try {
      await fn({
        data: {
          requestId: id(),
          schoolId: activeSchool.id,
          batchId,
          expectedVersion: Number(batch.version),
          ...extra,
        },
      });
      refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  if (identityLoading || contextLoading)
    return (
      <Shell title="Student Progression">
        <p className="text-muted-foreground">Loading access context…</p>
      </Shell>
    );
  if (!hasPermission("progression.read"))
    return (
      <Shell title="Student Progression">
        <PermissionDeniedState />
      </Shell>
    );
  if (batchQuery.isPending)
    return (
      <Shell title="Student Progression">
        <p className="text-muted-foreground">Loading batch…</p>
      </Shell>
    );
  if (batchQuery.error || !batch)
    return (
      <Shell title="Student Progression">
        <ErrorState error={batchQuery.error ?? new Error("Batch not found")} onReload={refresh} />
      </Shell>
    );
  const warningCount = Number(batch.warning_count ?? 0);
  const draft = batch.status === "draft";
  const review = batch.status === "in_review";
  const approved = batch.status === "approved";
  const applied = batch.status === "applied";
  const outcomes = (batch.outcomes ?? {}) as Record<string, unknown>;
  const promotedCount = Number(outcomes["promoted"] ?? 0);
  const retainedCount = Number(outcomes["retained"] ?? 0);
  const graduatedCount = Number(outcomes["graduated"] ?? 0);
  const createdEnrollmentCount = Number(
    batch.created_enrollment_count ?? promotedCount + retainedCount,
  );
  const createdClassEnrollmentCount = Number(
    batch.created_class_enrollment_count ?? promotedCount + retainedCount,
  );
  return (
    <Shell
      title="Progression batch"
      description="Review the annual progression workflow and its bounded candidate projection."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost">
          <Link to="/student-progression">
            <ArrowLeft className="h-4 w-4" />
            All batches
          </Link>
        </Button>
        <Status value={batch.status} />
        <span className="text-sm text-muted-foreground">Version {batch.version}</span>
      </div>
      {error && <ErrorState error={error} onReload={refresh} />}
      <Card>
        <CardHeader>
          <CardTitle>
            {label(academicYears, batch.source_academic_year_id)} →{" "}
            {label(academicYears, batch.target_academic_year_id)}
          </CardTitle>
          <CardDescription>
            {batch.candidate_count ?? 0} candidates · {batch.decided_count ?? 0} decided ·{" "}
            {warningCount} warnings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <PermissionGate permission="progression.submit">
              {draft && (
                <Button disabled={busy} onClick={() => void transition(submit)}>
                  Submit for Review
                </Button>
              )}
            </PermissionGate>
            <PermissionGate permission="progression.cancel">
              {draft && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    const value = window.prompt("Cancellation reason");
                    if (value?.trim()) {
                      setReason(value);
                      void transition(cancel, { reason: value });
                    }
                  }}
                >
                  Cancel Batch
                </Button>
              )}
            </PermissionGate>
            <PermissionGate permission="progression.review">
              {review && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    const value = window.prompt("Rejection reason");
                    if (value?.trim()) void transition(reject, { reason: value });
                  }}
                >
                  Reject
                </Button>
              )}
            </PermissionGate>
            <PermissionGate permission="progression.approve">
              {review && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Approve this progression batch for application?"))
                      void transition(approve);
                  }}
                >
                  Approve
                </Button>
              )}
            </PermissionGate>
            <PermissionGate permission="progression.apply">
              {approved && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Apply progression? This creates next-year enrollment/class placement, preserves historical source enrollment, runs atomically, and makes the batch immutable.",
                      )
                    )
                      void transition(apply);
                  }}
                >
                  Apply Progression
                </Button>
              )}
            </PermissionGate>
            {applied && (
              <span className="inline-flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Applied and immutable
              </span>
            )}
          </div>
        </CardContent>
      </Card>
      {applied && (
        <Card data-testid="progression-applied-summary">
          <CardHeader>
            <CardTitle>Applied result</CardTitle>
            <CardDescription>Bounded results recorded for this immutable batch.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-sm text-muted-foreground">Promoted</dt>
                <dd className="text-lg font-semibold">{promotedCount}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Retained</dt>
                <dd className="text-lg font-semibold">{retainedCount}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Graduated</dt>
                <dd className="text-lg font-semibold">{graduatedCount}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Created target enrollments</dt>
                <dd className="text-lg font-semibold">{createdEnrollmentCount}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Created target class placements</dt>
                <dd className="text-lg font-semibold">{createdClassEnrollmentCount}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Applied at</dt>
                <dd className="text-sm font-medium">
                  {batch.applied_at ? new Date(String(batch.applied_at)).toLocaleString() : "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
      <DecisionEditor batch={batch} candidates={candidates} reload={refresh} />
    </Shell>
  );
}
