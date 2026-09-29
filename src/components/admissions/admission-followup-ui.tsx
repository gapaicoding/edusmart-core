import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAppContext } from "@/lib/app-context";
import { formatPreferredDate, translateUiText, useAppPreferences } from "@/lib/app-preferences";
import {
  getAdmissionFunnel,
  getAdmissionFollowupApplication,
  listAdmissionFollowupAssignees,
  listAdmissionFollowupTasks,
  runAdmissionFollowupCommand,
} from "@/lib/admissions.functions";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Assignee = { profile_id: string; full_name: string };
type FollowupTask = {
  id: string;
  application_id: string;
  assigned_profile_id: string;
  assigned_name: string;
  status: "open" | "completed" | "cancelled";
  due_at: string;
  completion_outcome: string | null;
  row_version: number;
  application_number: string;
  applicant_full_name: string;
  application_status: string;
};
type Activity = {
  id: string;
  event_type: string;
  actor_name: string;
  previous_assignee_name: string | null;
  assignee_name: string | null;
  previous_due_at: string | null;
  due_at: string | null;
  completion_outcome: string | null;
  occurred_at: string;
};
type Bundle = {
  active_task: FollowupTask | null;
  latest_task: FollowupTask | null;
  activities: Activity[];
};
type Funnel = Record<string, number>;
type Queue = { items: FollowupTask[]; total: number };

const outcomes = [
  "contacted",
  "no_response",
  "callback_required",
  "documents_pending",
  "followup_not_required",
] as const;

function copy(value: string, locale: "id" | "en") {
  const id: Record<string, string> = {
    "Admissions funnel": "Funnel Penerimaan",
    "Follow-up queue": "Antrean Tindak Lanjut",
    "Operational follow-up for submitted applications. Completing a task does not change the admission decision.":
      "Tindak lanjut operasional untuk pendaftaran yang masuk. Menyelesaikan tugas tidak mengubah keputusan penerimaan.",
    "Counts reflect current application status.": "Jumlah mengikuti status pendaftaran saat ini.",
    Total: "Total",
    Submitted: "Diajukan",
    "Under review": "Dalam peninjauan",
    Accepted: "Diterima",
    Rejected: "Ditolak",
    Withdrawn: "Ditarik",
    Converted: "Dikonversi",
    submitted: "Diajukan",
    "under review": "Dalam peninjauan",
    accepted: "Diterima",
    rejected: "Ditolak",
    withdrawn: "Ditarik",
    converted: "Dikonversi",
    Open: "Terbuka",
    Overdue: "Terlambat",
    "Assigned to me": "Ditugaskan kepada saya",
    All: "Semua",
    "No follow-up tasks in this view.": "Tidak ada tugas tindak lanjut pada tampilan ini.",
    "Could not load follow-up data.": "Data tindak lanjut tidak dapat dimuat.",
    Retry: "Coba lagi",
    "No active eligible staff member is available in this school.":
      "Tidak ada staf aktif yang memenuhi syarat di sekolah ini.",
    "Eligible staff could not be loaded.": "Data staf yang memenuhi syarat tidak dapat dimuat.",
    "Follow-up task": "Tugas tindak lanjut",
    "No active follow-up task.": "Tidak ada tugas tindak lanjut aktif.",
    "Create follow-up": "Buat tindak lanjut",
    "Update task": "Ubah tugas",
    Complete: "Selesaikan",
    Cancel: "Batalkan",
    Assignee: "Petugas",
    "Select staff": "Pilih staf",
    "Due date and time": "Batas tanggal dan waktu",
    Outcome: "Hasil",
    "Select an outcome": "Pilih hasil",
    "Save task": "Simpan tugas",
    "Complete task": "Selesaikan tugas",
    "Task status": "Status tugas",
    "Application status": "Status pendaftaran",
    "Follow-up outcome": "Hasil tindak lanjut",
    "Follow-up history": "Riwayat tindak lanjut",
    "Follow-up task changes do not change the admission decision.":
      "Perubahan tugas tindak lanjut tidak mengubah keputusan penerimaan.",
    "Application status and task status are tracked separately.":
      "Status pendaftaran dan status tugas tindak lanjut dicatat secara terpisah.",
    "Cancel task": "Batalkan tugas",
    "Task created": "Tugas dibuat",
    "Task updated": "Tugas diperbarui",
    "Task completed": "Tugas diselesaikan",
    "Task cancelled": "Tugas dibatalkan",
    "Follow-up task created.": "Tugas tindak lanjut dibuat.",
    "Follow-up task updated.": "Tugas tindak lanjut diperbarui.",
    "Follow-up task completed.": "Tugas tindak lanjut diselesaikan.",
    "Follow-up task cancelled.": "Tugas tindak lanjut dibatalkan.",
    Due: "Batas waktu",
    "Overdue task": "Tugas terlambat",
    "Could not save follow-up. Please try again.":
      "Tindak lanjut tidak dapat disimpan. Silakan coba lagi.",
    "A follow-up task is already open.": "Sudah ada tugas tindak lanjut yang terbuka.",
    "An open follow-up task already exists for this application.":
      "Sudah ada tugas tindak lanjut terbuka untuk pendaftaran ini.",
    "This application can no longer receive a follow-up task.":
      "Pendaftaran ini tidak dapat menerima tugas tindak lanjut baru.",
    "This application cannot receive a new follow-up task.":
      "Pendaftaran ini tidak dapat menerima tugas tindak lanjut baru.",
    "The task changed. Refresh and try again.": "Tugas telah berubah. Muat ulang lalu coba lagi.",
    "This follow-up task changed in another session. Reload and try again.":
      "Tugas tindak lanjut berubah di sesi lain. Muat ulang lalu coba lagi.",
    "This follow-up task is no longer open.": "Tugas tindak lanjut ini tidak lagi terbuka.",
    "Choose an active staff member assigned to this school.":
      "Pilih staf aktif yang bertugas di sekolah ini.",
    "You do not have permission to manage this follow-up.":
      "Anda tidak memiliki izin untuk mengelola tindak lanjut ini.",
    "This follow-up record is unavailable.": "Data tindak lanjut ini tidak tersedia.",
    "This request was already used with different details.":
      "ID permintaan ini sudah digunakan dengan detail berbeda.",
    "Review the follow-up details and try again.": "Periksa detail tindak lanjut lalu coba lagi.",
    "Change the assignee or due time before saving.":
      "Ubah petugas atau batas waktu sebelum menyimpan.",
    "Callback required": "Perlu dihubungi kembali",
    Contacted: "Sudah dihubungi",
    "No response": "Belum ada respons",
    "Documents pending": "Menunggu dokumen",
    "No further follow-up": "Tidak perlu tindak lanjut lagi",
    Created: "Dibuat",
    Updated: "Diperbarui",
    Completed: "Selesai",
    Cancelled: "Dibatalkan",
  };
  if (locale === "en") return value;
  return id[value] ?? translateUiText(value, locale);
}

function outcomeLabel(value: string, locale: "id" | "en") {
  const labels: Record<string, string> = {
    contacted: "Contacted",
    no_response: "No response",
    callback_required: "Callback required",
    documents_pending: "Documents pending",
    followup_not_required: "No further follow-up",
  };
  return copy(labels[value] ?? value, locale);
}

function errorCopy(error: unknown, locale: "id" | "en") {
  const message = error instanceof Error ? error.message : "";
  const known: Record<string, string> = {
    B23_FOLLOWUP_ACTIVE_EXISTS: "A follow-up task is already open.",
    B23_FOLLOWUP_APPLICATION_TERMINAL: "This application can no longer receive a follow-up task.",
    B23_FOLLOWUP_STALE_VERSION: "The task changed. Refresh and try again.",
    B23_FOLLOWUP_NOT_OPEN: "The task changed. Refresh and try again.",
    "An open follow-up task already exists for this application.":
      "An open follow-up task already exists for this application.",
    "This application cannot receive a new follow-up task.":
      "This application cannot receive a new follow-up task.",
    "This follow-up task changed in another session. Reload and try again.":
      "This follow-up task changed in another session. Reload and try again.",
    "This follow-up task is no longer open.": "This follow-up task is no longer open.",
    "Choose an active staff member assigned to this school.":
      "Choose an active staff member assigned to this school.",
    "You do not have permission to manage this follow-up.":
      "You do not have permission to manage this follow-up.",
    "This follow-up record is unavailable.": "This follow-up record is unavailable.",
    "This request was already used with different details.":
      "This request was already used with different details.",
    "Review the follow-up details and try again.": "Review the follow-up details and try again.",
    "Change the assignee or due time before saving.":
      "Change the assignee or due time before saving.",
  };
  const code = Object.keys(known).find((key) => message.includes(key));
  return copy((code && known[code]) || "Could not save follow-up. Please try again.", locale);
}

function newRequestId() {
  return crypto.randomUUID();
}

function localDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function AdmissionFunnel({ cycleId }: { cycleId: string }) {
  const { locale } = useAppPreferences();
  const fn = useServerFn(getAdmissionFunnel);
  const query = useQuery({
    queryKey: ["b23", "funnel", cycleId],
    queryFn: () => fn({ data: { cycleId } }),
  });
  const funnel = query.data as unknown as Funnel | undefined;
  const items = [
    ["Total", "total"],
    ["Submitted", "submitted"],
    ["Under review", "under_review"],
    ["Accepted", "accepted"],
    ["Rejected", "rejected"],
    ["Withdrawn", "withdrawn"],
    ["Converted", "converted"],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy("Admissions funnel", locale)}</CardTitle>
        <CardDescription>
          {copy("Counts reflect current application status.", locale)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {items.map(([label]) => (
              <Skeleton key={label} className="h-16" />
            ))}
          </div>
        ) : query.error || !funnel ? (
          <Alert variant="destructive">
            <AlertDescription>{copy("Could not load follow-up data.", locale)}</AlertDescription>
            <Button className="mt-2" variant="outline" onClick={() => void query.refetch()}>
              {copy("Retry", locale)}
            </Button>
          </Alert>
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {items.map(([label, key]) => (
              <div key={key} className="rounded-lg border bg-card p-3">
                <dt className="text-xs text-muted-foreground">{copy(label, locale)}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{funnel[key] ?? 0}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

export function AdmissionFollowupQueue({ cycleId }: { cycleId: string }) {
  const { locale } = useAppPreferences();
  const { hasPermission } = useAppContext();
  const fn = useServerFn(listAdmissionFollowupTasks);
  const [filter, setFilter] = useState<"open" | "overdue" | "mine" | "all">("open");
  const query = useQuery({
    queryKey: ["b23", "followup-queue", cycleId, filter],
    queryFn: () => fn({ data: { cycleId, filter, limit: 50, offset: 0 } }),
  });
  const queue = query.data as unknown as Queue | undefined;
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{copy("Follow-up queue", locale)}</CardTitle>
          <CardDescription>
            {copy(
              "Operational follow-up for submitted applications. Completing a task does not change the admission decision.",
              locale,
            )}
          </CardDescription>
        </div>
        <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
          <SelectTrigger aria-label={copy("Follow-up queue", locale)} className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">{copy("Open", locale)}</SelectItem>
            <SelectItem value="overdue">{copy("Overdue", locale)}</SelectItem>
            {hasPermission("admission.read") && (
              <SelectItem value="mine">{copy("Assigned to me", locale)}</SelectItem>
            )}
            <SelectItem value="all">{copy("All", locale)}</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : query.error ? (
          <Alert variant="destructive">
            <AlertDescription>{copy("Could not load follow-up data.", locale)}</AlertDescription>
            <Button className="mt-2" variant="outline" onClick={() => void query.refetch()}>
              {copy("Retry", locale)}
            </Button>
          </Alert>
        ) : !queue?.items.length ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            {copy("No follow-up tasks in this view.", locale)}
          </p>
        ) : (
          <ul className="divide-y">
            {queue.items.map((task) => (
              <li
                key={task.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    to="/admissions/$applicationId"
                    params={{ applicationId: task.application_id }}
                  >
                    {task.application_number} · {task.applicant_full_name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {copy("Application status", locale)}:{" "}
                    {copy(task.application_status.replaceAll("_", " "), locale)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge
                    variant={
                      task.status === "open" && Date.parse(task.due_at) < Date.now()
                        ? "destructive"
                        : task.status === "open"
                          ? "default"
                          : "secondary"
                    }
                  >
                    {task.status === "open" && Date.parse(task.due_at) < Date.now()
                      ? copy("Overdue task", locale)
                      : copy(
                          task.status === "open"
                            ? "Open"
                            : task.status === "completed"
                              ? "Completed"
                              : "Cancelled",
                          locale,
                        )}
                  </Badge>
                  <span>{task.assigned_name}</span>
                  <span className="text-muted-foreground">
                    {formatPreferredDate(
                      task.due_at,
                      { dateStyle: "medium", timeStyle: "short" },
                      locale,
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function AdmissionFollowupPanel({ applicationId }: { applicationId: string }) {
  const { locale } = useAppPreferences();
  const { activeSchool, hasPermission } = useAppContext();
  const queryClient = useQueryClient();
  const dataFn = useServerFn(getAdmissionFollowupApplication);
  const assigneeFn = useServerFn(listAdmissionFollowupAssignees);
  const commandFn = useServerFn(runAdmissionFollowupCommand);
  const query = useQuery({
    queryKey: ["b23", "followup-application", applicationId],
    queryFn: () => dataFn({ data: { applicationId } }),
  });
  const assigneesQuery = useQuery({
    queryKey: ["b23", "assignees", activeSchool?.id],
    queryFn: () => assigneeFn({ data: { schoolId: activeSchool!.id } }),
    enabled: Boolean(activeSchool?.id && hasPermission("admission.review")),
  });
  const bundle = query.data as unknown as Bundle | undefined;
  const assignees = (assigneesQuery.data ?? []) as unknown as Assignee[];
  const canManage = hasPermission("admission.review");
  const [dialog, setDialog] = useState<"create" | "update" | "complete" | "cancel" | null>(null);
  const [assignedProfileId, setAssignedProfileId] = useState("");
  const [dueLocal, setDueLocal] = useState("");
  const [outcome, setOutcome] = useState<(typeof outcomes)[number] | "">("");
  const [error, setError] = useState<string | null>(null);
  const activeRequestId = useRef<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const activeTask = bundle?.active_task ?? null;
  const task = activeTask ?? bundle?.latest_task ?? null;
  const dueDateValid = Boolean(dueLocal && !Number.isNaN(new Date(dueLocal).getTime()));
  const assigneeValid = assignees.some((item) => item.profile_id === assignedProfileId);
  const mutation = useMutation({
    mutationFn: async () => {
      const command =
        dialog === "create"
          ? "create"
          : dialog === "update"
            ? "update"
            : dialog === "cancel"
              ? "cancel"
              : "complete";
      const data = {
        applicationId,
        taskId: command === "create" ? null : task?.id,
        expectedRowVersion: command === "create" ? null : Number(task?.row_version),
        requestId: (activeRequestId.current ??= newRequestId()),
        command,
        assignedProfileId: command === "create" || command === "update" ? assignedProfileId : null,
        dueAt:
          command === "create" || command === "update" ? new Date(dueLocal).toISOString() : null,
        completionOutcome: command === "complete" ? outcome : null,
      } as const;
      return commandFn({ data });
    },
    onSuccess: async () => {
      setError(null);
      toast.success(
        copy(
          dialog === "create"
            ? "Follow-up task created."
            : dialog === "update"
              ? "Follow-up task updated."
              : dialog === "cancel"
                ? "Follow-up task cancelled."
                : "Follow-up task completed.",
          locale,
        ),
      );
      setDialog(null);
      activeRequestId.current = null;
      setOutcome("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["b23", "followup-application", applicationId] }),
        queryClient.invalidateQueries({ queryKey: ["b23", "followup-queue"] }),
      ]);
    },
    onError: (cause) => setError(errorCopy(cause, locale)),
  });
  const startCreate = () => {
    activeRequestId.current = newRequestId();
    setAssignedProfileId(assignees[0]?.profile_id ?? "");
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    setDueLocal(localDateTime(date.toISOString()));
    setDialog("create");
  };
  const startUpdate = () => {
    if (!task) return;
    activeRequestId.current = newRequestId();
    setAssignedProfileId(task.assigned_profile_id);
    setDueLocal(localDateTime(task.due_at));
    setDialog("update");
  };
  const openComplete = () => {
    activeRequestId.current = newRequestId();
    setOutcome("");
    setDialog("complete");
  };
  const openCancel = () => {
    activeRequestId.current = newRequestId();
    setDialog("cancel");
  };
  const activities = (bundle?.activities ?? []) as Activity[];
  return (
    <Card id="b23-followup-panel" ref={panelRef} tabIndex={-1}>
      <CardHeader>
        <CardTitle>{copy("Follow-up task", locale)}</CardTitle>
        <CardDescription>
          {copy("Application status and task status are tracked separately.", locale)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading ? (
          <Skeleton className="h-20" />
        ) : query.error || !bundle ? (
          <Alert variant="destructive">
            <AlertDescription>{copy("Could not load follow-up data.", locale)}</AlertDescription>
            <Button className="mt-2" variant="outline" onClick={() => void query.refetch()}>
              {copy("Retry", locale)}
            </Button>
          </Alert>
        ) : task ? (
          <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={task.status === "open" ? "default" : "secondary"}>
                  {copy(
                    task.status === "open"
                      ? "Open"
                      : task.status === "completed"
                        ? "Completed"
                        : "Cancelled",
                    locale,
                  )}
                </Badge>
                <span className="font-medium">{task.assigned_name}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {copy("Due", locale)}:{" "}
                {formatPreferredDate(
                  task.due_at,
                  { dateStyle: "medium", timeStyle: "short" },
                  locale,
                )}
              </p>
              {task.status === "open" && Date.parse(task.due_at) < Date.now() && (
                <p className="text-sm font-medium text-destructive">
                  {copy("Overdue task", locale)}
                </p>
              )}
              {task.completion_outcome && (
                <p className="text-sm text-muted-foreground">
                  {copy("Follow-up outcome", locale)}:{" "}
                  {outcomeLabel(task.completion_outcome, locale)}
                </p>
              )}
            </div>
            {canManage && activeTask && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={startUpdate}>
                  {copy("Update task", locale)}
                </Button>
                <Button variant="outline" onClick={openComplete}>
                  {copy("Complete", locale)}
                </Button>
                <Button variant="ghost" disabled={mutation.isPending} onClick={openCancel}>
                  {copy("Cancel task", locale)}
                </Button>
              </div>
            )}
            {canManage && !activeTask && (
              <Button
                disabled={
                  assigneesQuery.isLoading ||
                  Boolean(assigneesQuery.error) ||
                  assignees.length === 0
                }
                onClick={startCreate}
              >
                {copy("Create follow-up", locale)}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {copy("No active follow-up task.", locale)}
            </p>
            {canManage && (
              <Button
                disabled={
                  assigneesQuery.isLoading ||
                  Boolean(assigneesQuery.error) ||
                  assignees.length === 0
                }
                onClick={startCreate}
              >
                {copy("Create follow-up", locale)}
              </Button>
            )}
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {canManage && assigneesQuery.error && (
          <Alert variant="destructive">
            <AlertDescription>
              {copy("Eligible staff could not be loaded.", locale)}
            </AlertDescription>
            <Button variant="outline" onClick={() => void assigneesQuery.refetch()}>
              {copy("Retry", locale)}
            </Button>
          </Alert>
        )}
        {canManage &&
          !assigneesQuery.isLoading &&
          !assigneesQuery.error &&
          assignees.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {copy("No active eligible staff member is available in this school.", locale)}
            </p>
          )}
        {activities.length > 0 && (
          <section aria-labelledby="followup-history-heading">
            <h3 id="followup-history-heading" className="font-medium">
              {copy("Follow-up history", locale)}
            </h3>
            <ol className="mt-2 space-y-2 border-l pl-4">
              {activities.map((activity) => (
                <li key={activity.id} className="text-sm">
                  <span className="font-medium">
                    {copy(
                      activity.event_type.replace(/^./, (letter) => letter.toUpperCase()),
                      locale,
                    )}
                  </span>
                  <span className="text-muted-foreground"> · {activity.actor_name}</span>
                  {activity.assignee_name && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {copy("Assignee", locale)}:{" "}
                      {activity.previous_assignee_name &&
                      activity.previous_assignee_name !== activity.assignee_name
                        ? `${activity.previous_assignee_name} → `
                        : ""}
                      {activity.assignee_name}
                    </span>
                  )}
                  {activity.due_at && activity.event_type !== "completed" && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {copy("Due", locale)}:{" "}
                      {activity.previous_due_at && activity.previous_due_at !== activity.due_at
                        ? `${formatPreferredDate(activity.previous_due_at, { dateStyle: "medium", timeStyle: "short" }, locale)} → `
                        : ""}
                      {formatPreferredDate(
                        activity.due_at,
                        { dateStyle: "medium", timeStyle: "short" },
                        locale,
                      )}
                    </span>
                  )}
                  {activity.completion_outcome && (
                    <> · {outcomeLabel(activity.completion_outcome, locale)}</>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatPreferredDate(
                      activity.occurred_at,
                      { dateStyle: "medium", timeStyle: "short" },
                      locale,
                    )}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </CardContent>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => panelRef.current?.focus());
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {copy(
                dialog === "create"
                  ? "Create follow-up"
                  : dialog === "update"
                    ? "Update task"
                    : dialog === "cancel"
                      ? "Cancel task"
                      : "Complete task",
                locale,
              )}
            </DialogTitle>
            <DialogDescription>
              {copy("Follow-up task changes do not change the admission decision.", locale)}
            </DialogDescription>
          </DialogHeader>
          {(dialog === "create" || dialog === "update") && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="followup-assignee">{copy("Assignee", locale)}</Label>
                <Select value={assignedProfileId} onValueChange={setAssignedProfileId}>
                  <SelectTrigger id="followup-assignee">
                    <SelectValue placeholder={copy("Select staff", locale)} />
                  </SelectTrigger>
                  <SelectContent>
                    {assignees.map((assignee) => (
                      <SelectItem key={assignee.profile_id} value={assignee.profile_id}>
                        {assignee.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="followup-due">{copy("Due date and time", locale)}</Label>
                <Input
                  id="followup-due"
                  type="datetime-local"
                  value={dueLocal}
                  onChange={(event) => setDueLocal(event.target.value)}
                />
              </div>
            </div>
          )}
          {dialog === "complete" && (
            <div className="space-y-2">
              <Label htmlFor="followup-outcome">{copy("Outcome", locale)}</Label>
              <Select
                value={outcome}
                onValueChange={(value) => setOutcome(value as typeof outcome)}
              >
                <SelectTrigger id="followup-outcome">
                  <SelectValue placeholder={copy("Select an outcome", locale)} />
                </SelectTrigger>
                <SelectContent>
                  {outcomes.map((item) => (
                    <SelectItem key={item} value={item}>
                      {outcomeLabel(item, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {copy("Cancel", locale)}
            </Button>
            <Button
              disabled={
                mutation.isPending ||
                ((dialog === "create" || dialog === "update") &&
                  (!assigneeValid || !dueDateValid)) ||
                (dialog === "complete" && !outcome)
              }
              onClick={() => mutation.mutate()}
            >
              {copy(
                dialog === "complete"
                  ? "Complete task"
                  : dialog === "cancel"
                    ? "Cancel task"
                    : "Save task",
                locale,
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
