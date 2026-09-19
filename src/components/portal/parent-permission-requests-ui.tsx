import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  History,
  Loader2,
  ShieldAlert,
  X,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  getParentPermissionRequest,
  listParentPermissionRequests,
  listPermissionDecisionHistory,
  submitParentPermissionDecision,
} from "@/lib/notifications-parent-permissions.functions";

const PAGE_SIZE = 20;

type JsonObject = Record<string, unknown>;
export type ParentStudent = {
  recipientId: string;
  studentId: string;
  studentName: string;
  decision: string | null;
  ownedByMe: boolean;
  canRespond: boolean;
  decisionVersion: number | null;
};

export type ParentPermissionRequest = {
  id: string;
  title: string;
  requestType: string;
  description: string | null;
  dueAt: string | null;
  status: string;
  expired: boolean;
  students: ParentStudent[];
};

type ParentHistory = {
  operation: string;
  oldDecision: string | null;
  newDecision: string | null;
  changedAt: string;
};

type DecisionAction = { student: ParentStudent; decision: "approved" | "rejected" };

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function versionValue(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function parseStudents(value: unknown): ParentStudent[] {
  if (!Array.isArray(value)) return [];
  return value.map(object).flatMap((student) => {
    const recipientId = stringValue(student["recipient_id"]);
    const studentId = stringValue(student["student_id"]);
    const studentName = stringValue(student["student_name"]);
    if (!recipientId || !studentId || !studentName) return [];
    return [
      {
        recipientId,
        studentId,
        studentName,
        decision: stringValue(student["decision"]),
        ownedByMe: booleanValue(student["owned_by_me"]),
        canRespond: booleanValue(student["can_respond"]),
        decisionVersion: versionValue(student["decision_version"]),
      },
    ];
  });
}

function parseRequest(value: unknown): ParentPermissionRequest | null {
  const row = object(value);
  const id = stringValue(row["id"]);
  const title = stringValue(row["title"]);
  const requestType = stringValue(row["request_type"]);
  if (!id || !title || !requestType) return null;
  return {
    id,
    title,
    requestType,
    description: stringValue(row["description"]),
    dueAt: stringValue(row["due_at"]),
    status: stringValue(row["status"]) ?? "unknown",
    expired: booleanValue(row["expired"]),
    students: parseStudents(row["students"]),
  };
}

function parseRequests(value: unknown): ParentPermissionRequest[] {
  return Array.isArray(value)
    ? value.flatMap((row) => (parseRequest(row) ? [parseRequest(row)!] : []))
    : [];
}

function parseHistory(value: unknown): ParentHistory[] {
  if (!Array.isArray(value)) return [];
  return value.map(object).flatMap((row) => {
    const operation = stringValue(row["operation"]);
    const changedAt = stringValue(row["changed_at"]);
    if (!operation || !changedAt) return [];
    return [
      {
        operation,
        oldDecision: stringValue(row["old_decision"]),
        newDecision: stringValue(row["new_decision"]),
        changedAt,
      },
    ];
  });
}

function formatDate(value: string | null) {
  if (!value) return "No deadline set";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Deadline unavailable"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function label(value: string | null) {
  if (!value) return "No decision";
  return value === "approved"
    ? "Approved"
    : value === "rejected"
      ? "Rejected"
      : "Decision recorded";
}

function requestTypeLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function parentState(request: ParentPermissionRequest, student: ParentStudent) {
  if (request.status === "cancelled") return "Cancelled";
  if (request.status === "closed") return "Closed";
  if (request.expired) return "Deadline passed";
  if (student.decision && !student.ownedByMe) return "Decision made by another Guardian";
  if (student.decision && student.ownedByMe && student.canRespond)
    return "Your decision · change allowed";
  if (student.decision) return label(student.decision);
  if (student.canRespond) return "Action required";
  return "Read-only";
}

function stateTone(state: string): "default" | "secondary" | "destructive" | "outline" {
  if (state === "Action required") return "default";
  if (state === "Deadline passed" || state === "Cancelled") return "destructive";
  if (state === "Approved" || state.startsWith("Your decision")) return "secondary";
  return "outline";
}

function actionError(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (code === "STALE_VERSION" || code === "DECISION_OWNED_BY_OTHER_GUARDIAN") {
    return "This request changed before your decision was saved. The latest state is shown below.";
  }
  if (code === "REQUEST_EXPIRED") return "The deadline has passed. This request is now read-only.";
  if (code === "REQUEST_CLOSED") return "This request was closed and is now read-only.";
  if (code === "REQUEST_CANCELLED") return "This request was cancelled and is now read-only.";
  if (
    code === "NOT_RECIPIENT" ||
    code === "PARENT_RELATION_REQUIRED" ||
    code === "PERMISSION_DENIED"
  ) {
    return "Your current permission scope does not allow this action.";
  }
  return "We couldn't save your decision. Refresh and try again.";
}

function StudentDecisionCard({
  request,
  student,
  onAction,
  busy,
}: {
  request: ParentPermissionRequest;
  student: ParentStudent;
  onAction: (student: ParentStudent, decision: "approved" | "rejected") => void;
  busy: boolean;
}) {
  const state = parentState(request, student);
  const ownerVersionMissing = Boolean(
    student.decision && student.ownedByMe && student.canRespond && student.decisionVersion === null,
  );
  const actionable = student.canRespond && !request.expired && request.status === "open";
  return (
    <Card className="border-border/80">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Student
            </p>
            <h2 className="mt-1 text-lg font-semibold">{student.studentName}</h2>
          </div>
          <Badge variant={stateTone(state)}>{state}</Badge>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Current decision</dt>
            <dd className="font-medium">{label(student.decision)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Deadline</dt>
            <dd className={request.expired ? "font-medium text-destructive" : "font-medium"}>
              {request.expired ? "Deadline passed" : formatDate(request.dueAt)}
            </dd>
          </div>
        </dl>
        {ownerVersionMissing && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Refresh required</AlertTitle>
            <AlertDescription>
              The current decision version is unavailable. No action was sent.
            </AlertDescription>
          </Alert>
        )}
        {actionable && !ownerVersionMissing && (
          <div
            className="flex flex-wrap gap-2"
            aria-label={`Decision actions for ${student.studentName}`}
          >
            <Button disabled={busy} onClick={() => onAction(student, "approved")}>
              <Check /> Approve
            </Button>
            <Button disabled={busy} variant="outline" onClick={() => onAction(student, "rejected")}>
              <X /> Reject
            </Button>
          </div>
        )}
        {student.decision &&
          student.ownedByMe &&
          student.canRespond &&
          !ownerVersionMissing &&
          !request.expired &&
          request.status === "open" && (
            <p className="text-xs text-muted-foreground">
              You can change this decision while the request remains open.
            </p>
          )}
        {student.decision && !student.ownedByMe && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" />
            The authorized outcome is read-only for this account.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RequestSummary({ request }: { request: ParentPermissionRequest }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{requestTypeLabel(request.requestType)}</Badge>
        <Badge variant={request.status === "open" && !request.expired ? "secondary" : "outline"}>
          {request.expired && request.status === "open" ? "Deadline passed" : request.status}
        </Badge>
      </div>
      <h2 className="text-lg font-semibold">{request.title}</h2>
      <p className="text-sm text-muted-foreground">Deadline: {formatDate(request.dueAt)}</p>
    </div>
  );
}

function HistoryList({ rows }: { rows: ParentHistory[] }) {
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">No decision history yet.</p>;
  return (
    <ol className="space-y-3" aria-label="Decision history">
      {rows.map((row, index) => (
        <li
          key={`${row.changedAt}-${row.operation}-${index}`}
          className="border-l-2 border-border pl-3 text-sm"
        >
          <p className="font-medium">{row.operation.replaceAll("_", " ")}</p>
          <p className="text-muted-foreground">
            {label(row.oldDecision)} → {label(row.newDecision)}
          </p>
          <time className="text-xs text-muted-foreground" dateTime={row.changedAt}>
            {formatDate(row.changedAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}

function ConfirmationDialog({
  action,
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  action: DecisionAction | null;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  if (!action) return null;
  const verb = action.decision === "approved" ? "Approve" : "Reject";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{verb} permission request?</DialogTitle>
          <DialogDescription>
            Confirm that you want to {verb.toLowerCase()} this permission request for{" "}
            {action.student.studentName}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={action.decision === "rejected" ? "destructive" : "default"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy && <Loader2 className="animate-spin" />}
            Confirm {verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ParentPermissionRequestListPage() {
  const fetch = useServerFn(listParentPermissionRequests);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["parent-permission-requests", "list", page],
    queryFn: () => fetch({ data: { pageSize: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE } }),
  });
  const requests = parseRequests(query.data);
  return (
    <AppShell>
      <main className="mx-auto max-w-4xl space-y-6">
        <header>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Parent Portal</p>
          <h1 className="text-2xl font-semibold tracking-tight">Permission Requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and respond to permission requests for your children.
          </p>
        </header>
        {query.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : query.error ? (
          <Alert variant="destructive">
            <AlertTitle>We couldn't load permission requests</AlertTitle>
            <AlertDescription>
              <p>Please try again. If the problem continues, contact your school administrator.</p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => void query.refetch()}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <FileCheck2 className="h-8 w-8 text-muted-foreground" />
              <CardTitle className="text-base">No permission requests</CardTitle>
              <CardDescription>Requests shared with your account will appear here.</CardDescription>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <Card key={request.id} className="overflow-hidden">
                <CardHeader>
                  <RequestSummary request={request} />
                </CardHeader>
                <CardContent className="space-y-3">
                  {request.students.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No student details are available for this request.
                    </p>
                  ) : (
                    request.students.map((student) => (
                      <div
                        key={student.recipientId}
                        className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{student.studentName}</p>
                          <p className="text-sm text-muted-foreground">
                            {parentState(request, student)}
                          </p>
                        </div>
                        <Button asChild variant="outline">
                          <Link
                            to="/portal/permission-requests/$requestId"
                            params={{ requestId: request.id }}
                          >
                            View request
                          </Link>
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <div className="flex justify-between gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft /> Previous
          </Button>
          <span className="self-center text-sm text-muted-foreground">Page {page}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={requests.length < PAGE_SIZE}
            onClick={() => setPage((value) => value + 1)}
          >
            Next <ChevronRight />
          </Button>
        </div>
      </main>
    </AppShell>
  );
}

export function ParentPermissionRequestDetailPage({ requestId }: { requestId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetch = useServerFn(getParentPermissionRequest);
  const historyFetch = useServerFn(listPermissionDecisionHistory);
  const submit = useServerFn(submitParentPermissionDecision);
  const [action, setAction] = useState<DecisionAction | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const detailQuery = useQuery({
    queryKey: ["parent-permission-request", requestId],
    queryFn: () => fetch({ data: { requestId } }),
  });
  const request = parseRequests(detailQuery.data)[0] ?? null;
  const historyQueries = useQueries({
    queries: (request?.students ?? []).map((student) => ({
      queryKey: ["parent-permission-history", requestId, student.recipientId],
      queryFn: () =>
        historyFetch({
          data: {
            requestId,
            requestRecipientId: student.recipientId,
            pageSize: PAGE_SIZE,
            offset: 0,
          },
        }),
      enabled: Boolean(request),
    })),
  });
  const historyByRecipient = useMemo(
    () =>
      new Map(
        (request?.students ?? []).map((student, index) => [
          student.recipientId,
          parseHistory(historyQueries[index]?.data),
        ]),
      ),
    [request, historyQueries],
  );
  const mutation = useMutation({
    mutationFn: (next: DecisionAction) => {
      if (
        next.student.decision &&
        next.student.ownedByMe &&
        next.student.decisionVersion === null
      ) {
        throw new Error("MISSING_DECISION_VERSION");
      }
      return submit({
        data: {
          requestId,
          requestRecipientId: next.student.recipientId,
          decision: next.decision,
          expectedVersion: next.student.decision ? next.student.decisionVersion : null,
          commandRequestId: crypto.randomUUID(),
        },
      });
    },
    onSuccess: async () => {
      setAction(null);
      setErrorMessage(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["parent-permission-request", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["parent-permission-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["parent-permission-history", requestId] }),
      ]);
    },
    onError: async (error) => {
      setErrorMessage(actionError(error));
      setAction(null);
      await Promise.all([
        detailQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["parent-permission-history", requestId] }),
      ]);
    },
  });
  if (detailQuery.isPending)
    return (
      <AppShell>
        <main className="mx-auto max-w-4xl space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-56 w-full" />
        </main>
      </AppShell>
    );
  if (detailQuery.error || !request)
    return (
      <AppShell>
        <main className="mx-auto max-w-4xl space-y-4">
          <Alert variant="destructive">
            <AlertTitle>We couldn't load this permission request</AlertTitle>
            <AlertDescription>
              This request may be unavailable. Please return to the list and try again.
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => navigate({ to: "/portal/permission-requests" })}>
            Back to permission requests
          </Button>
        </main>
      </AppShell>
    );
  return (
    <AppShell>
      <main className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              to="/portal/permission-requests"
            >
              ← Permission Requests
            </Link>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">{request.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {requestTypeLabel(request.requestType)} · Deadline {formatDate(request.dueAt)}
            </p>
          </div>
          <Badge variant={request.status === "open" && !request.expired ? "secondary" : "outline"}>
            {request.expired && request.status === "open" ? "Deadline passed" : request.status}
          </Badge>
        </div>
        {request.description && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Request details</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-6">{request.description}</p>
            </CardContent>
          </Card>
        )}
        {errorMessage && (
          <Alert variant="destructive">
            <AlertTitle>Decision not saved</AlertTitle>
            <AlertDescription>
              {errorMessage}
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => void detailQuery.refetch()}
              >
                Refresh request
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <section aria-labelledby="student-decisions" className="space-y-3">
          <div>
            <h2 id="student-decisions" className="text-lg font-semibold">
              Student decisions
            </h2>
            <p className="text-sm text-muted-foreground">
              Each student has an independently authorized response.
            </p>
          </div>
          {request.students.length === 0 ? (
            <Alert>
              <AlertTitle>No student details available</AlertTitle>
              <AlertDescription>
                This request has no response details available for this account.
              </AlertDescription>
            </Alert>
          ) : (
            request.students.map((student) => (
              <StudentDecisionCard
                key={student.recipientId}
                request={request}
                student={student}
                busy={mutation.isPending}
                onAction={(selected, decision) => setAction({ student: selected, decision })}
              />
            ))
          )}
        </section>
        <section aria-labelledby="decision-history" className="space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            <h2 id="decision-history" className="text-lg font-semibold">
              Decision history
            </h2>
          </div>
          {request.students.map((student, index) => (
            <Card key={`history-${student.recipientId}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{student.studentName}</CardTitle>
              </CardHeader>
              <CardContent>
                {historyQueries[index]?.isPending ? (
                  <Skeleton className="h-16 w-full" />
                ) : historyQueries[index]?.isError ? (
                  <p className="text-sm text-muted-foreground">
                    History is temporarily unavailable.
                  </p>
                ) : (
                  <HistoryList rows={historyByRecipient.get(student.recipientId) ?? []} />
                )}
              </CardContent>
            </Card>
          ))}
        </section>
        <ConfirmationDialog
          action={action}
          open={Boolean(action)}
          busy={mutation.isPending}
          onOpenChange={(open) => {
            if (!open && !mutation.isPending) setAction(null);
          }}
          onConfirm={() => {
            if (action) mutation.mutate(action);
          }}
        />
      </main>
    </AppShell>
  );
}
