import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, LockKeyhole, RefreshCw } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/lib/app-context";
import {
  closeAcademicYearCommand,
  closeTermCommand,
  getAcademicYearCloseReadiness,
  getTermCloseReadiness,
  reopenAcademicYearCommand,
  reopenTermCommand,
} from "@/lib/academic-period.functions";
import type { PeriodCommandResult, PeriodReadiness } from "@/lib/academic-period.schemas";

type PeriodKind = "term" | "academic_year";
type Action = {
  schoolId: string;
  periodId: string;
  expectedUpdatedAt: string;
  requestId: string;
  reason?: string;
};

type Props = {
  kind: PeriodKind;
  schoolId: string;
  periodId: string;
  name: string;
  status: string;
  updatedAt: string;
  closedAt: string | null;
  closedByProfileId: string | null;
  onChanged: () => void;
};

export function PeriodClosurePanel(props: Props) {
  const { hasPermission } = useAppContext();
  const queryClient = useQueryClient();
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const unresolvedAction = useRef<{ kind: "close" | "reopen"; payload: Action } | null>(null);
  const isTerm = props.kind === "term";
  const readPermission = isTerm ? "term.read" : "academic_year.read";
  const closePermission = isTerm ? "term.close" : "academic_year.close";
  const reopenPermission = isTerm ? "term.reopen" : "academic_year.reopen";
  const fetchReadiness = useServerFn(
    isTerm ? getTermCloseReadiness : getAcademicYearCloseReadiness,
  );
  const closeTerm = useServerFn(closeTermCommand);
  const closeYear = useServerFn(closeAcademicYearCommand);
  const reopenTerm = useServerFn(reopenTermCommand);
  const reopenYear = useServerFn(reopenAcademicYearCommand);
  const readinessQuery = useQuery({
    queryKey: ["academic-period-readiness", props.kind, props.schoolId, props.periodId],
    queryFn: async () =>
      (await fetchReadiness({
        data: { schoolId: props.schoolId, periodId: props.periodId },
      })) as PeriodReadiness,
    enabled: hasPermission(readPermission) && props.status === "active",
    staleTime: 0,
  });

  const command = useMutation({
    mutationFn: async (action: { kind: "close" | "reopen"; payload: Action }) => {
      if (action.kind === "close") {
        return (await (isTerm ? closeTerm : closeYear)({
          data: action.payload,
        })) as PeriodCommandResult;
      }
      return (await (isTerm ? reopenTerm : reopenYear)({
        data: action.payload as Action & { reason: string },
      })) as PeriodCommandResult;
    },
    retry: false,
    onSuccess: () => {
      unresolvedAction.current = null;
      setErrorMessage(null);
      setReopenOpen(false);
      setReason("");
      void queryClient.invalidateQueries({
        queryKey: ["academic-period-readiness", props.kind, props.schoolId, props.periodId],
      });
      void queryClient.invalidateQueries({ queryKey: ["academic", "years", props.schoolId] });
      void queryClient.invalidateQueries({ queryKey: ["academic", "terms", props.schoolId] });
      void queryClient.invalidateQueries({ queryKey: ["academic-context", props.schoolId] });
      props.onChanged();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "The action could not be completed.";
      if (
        /changed in another session|still has closure blockers|not have permission|cannot make that lifecycle|already used with different details|reason of at least/i.test(
          message,
        )
      ) {
        unresolvedAction.current = null;
      }
      setErrorMessage(message);
    },
  });

  function startAction(kind: "close" | "reopen", reasonValue?: string) {
    if (command.isPending || unresolvedAction.current) return;
    const action = {
      kind,
      payload: {
        schoolId: props.schoolId,
        periodId: props.periodId,
        expectedUpdatedAt: props.updatedAt,
        requestId: crypto.randomUUID(),
        ...(reasonValue ? { reason: reasonValue } : {}),
      },
    } as const;
    unresolvedAction.current = action;
    setErrorMessage(null);
    command.mutate(action);
  }

  function retrySameAction() {
    const action = unresolvedAction.current;
    if (!action || command.isPending) return;
    setErrorMessage(null);
    command.mutate(action);
  }

  function discardFailedAction() {
    unresolvedAction.current = null;
    setErrorMessage(null);
  }

  if (props.status === "closed" || props.status === "archived") {
    return (
      <Alert className="my-3">
        <LockKeyhole className="h-4 w-4" />
        <AlertTitle>
          {props.status === "closed"
            ? "Historical period — closed"
            : "Historical period — archived"}
        </AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          {props.closedAt && <p>Closure recorded {new Date(props.closedAt).toLocaleString()}.</p>}
          {props.closedByProfileId && <p>Closed by an authorized school operator.</p>}
          {props.status === "closed" && hasPermission(reopenPermission) && (
            <Button
              variant="outline"
              size="sm"
              disabled={command.isPending}
              onClick={() => setReopenOpen(true)}
            >
              Reopen period
            </Button>
          )}
          {errorMessage && <p role="alert">{errorMessage}</p>}
          {errorMessage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void readinessQuery.refetch();
                props.onChanged();
              }}
            >
              Reload latest period
            </Button>
          )}
          {unresolvedAction.current && errorMessage && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={retrySameAction} disabled={command.isPending}>
                Retry same request
              </Button>
              <Button size="sm" variant="ghost" onClick={discardFailedAction}>
                Start a new request
              </Button>
            </div>
          )}
        </AlertDescription>
        <ReopenDialog
          open={reopenOpen}
          onOpenChange={setReopenOpen}
          name={props.name}
          reason={reason}
          setReason={setReason}
          pending={command.isPending}
          allowed={hasPermission(reopenPermission)}
          onConfirm={() => startAction("reopen", reason.trim())}
        />
      </Alert>
    );
  }

  if (props.status !== "active") return null;
  const readiness = readinessQuery.data;
  return (
    <section
      className="my-4 space-y-3 rounded-md border border-border bg-muted/20 p-4"
      aria-label={`${props.name} closure readiness`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Closure readiness</h3>
          <p className="text-sm text-muted-foreground">
            Closing locks normal academic changes while historical records remain readable.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void readinessQuery.refetch()}
          disabled={readinessQuery.isFetching}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${readinessQuery.isFetching ? "animate-spin" : ""}`}
          />{" "}
          Refresh readiness
        </Button>
      </div>
      {readinessQuery.isLoading && (
        <p role="status" className="text-sm">
          Checking authoritative readiness…
        </p>
      )}
      {readinessQuery.error && (
        <Alert variant="destructive">
          <AlertDescription>
            Readiness is unavailable. Refresh before attempting closure.
          </AlertDescription>
        </Alert>
      )}
      {readiness && (
        <>
          <Alert>
            {readiness.ready ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertTitle>
              {readiness.ready
                ? "Ready for closure"
                : `${readiness.blockers.reduce((sum, item) => sum + item.count, 0)} closure blocker(s)`}
            </AlertTitle>
            <AlertDescription className="mt-2 space-y-1">
              {readiness.blockers.map((item, index) => (
                <p key={`${item.code}-${index}`}>
                  {item.count} — {humanize(item.code)}
                </p>
              ))}
              {readiness.warnings.map((item, index) => (
                <p key={`${item.code}-${index}`} className="text-amber-700">
                  Warning: {item.count} — {humanize(item.code)}
                </p>
              ))}
              {readiness.ready && readiness.warnings.length === 0 && (
                <p>All required operational workflows are finalized.</p>
              )}
            </AlertDescription>
          </Alert>
          {hasPermission(closePermission) && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={
                    !readiness.ready || command.isPending || Boolean(unresolvedAction.current)
                  }
                >
                  {command.isPending ? "Closing…" : `Close ${isTerm ? "Term" : "Academic Year"}`}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close {props.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This makes the period historical and blocks normal schedule, attendance,
                    assessment, score, enrollment, and report-card changes. Historical reads remain
                    available. The server will recheck readiness before applying the close.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={command.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={!readiness.ready || command.isPending}
                    onClick={() => startAction("close")}
                  >
                    Confirm close
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </>
      )}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      {errorMessage && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void readinessQuery.refetch();
            props.onChanged();
          }}
        >
          Reload latest period
        </Button>
      )}
      {unresolvedAction.current && errorMessage && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={retrySameAction} disabled={command.isPending}>
            Retry same request
          </Button>
          <Button size="sm" variant="ghost" onClick={discardFailedAction}>
            Start a new request
          </Button>
        </div>
      )}
      <ReopenDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        name={props.name}
        reason={reason}
        setReason={setReason}
        pending={command.isPending}
        allowed={hasPermission(reopenPermission)}
        onConfirm={() => startAction("reopen", reason.trim())}
      />
    </section>
  );
}

function ReopenDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  reason: string;
  setReason: (value: string) => void;
  pending: boolean;
  allowed: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen {props.name}?</DialogTitle>
          <DialogDescription>
            Reopening restores normal operations only for this period. Other closed parent/child
            periods remain closed. A reason is mandatory and audited.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={props.reason}
          onChange={(event) => props.setReason(event.target.value)}
          maxLength={1000}
          placeholder="Explain why this period must be reopened"
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={props.pending}
          >
            Cancel
          </Button>
          <Button
            onClick={props.onConfirm}
            disabled={props.pending || props.reason.trim().length < 3 || !props.allowed}
          >
            {props.pending ? "Reopening…" : "Confirm reopen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function humanize(code: string) {
  return code.toLowerCase().replaceAll("_", " ");
}
