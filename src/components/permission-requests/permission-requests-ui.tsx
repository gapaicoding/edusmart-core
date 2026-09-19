import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileEdit,
  GraduationCap,
  ListFilter,
  MailPlus,
  Megaphone,
  Plus,
  Send,
  Users,
  XCircle,
} from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PermissionGate, useAppContext } from "@/lib/app-context";
import {
  cancelPermissionRequest,
  closePermissionRequest,
  createPermissionRequest,
  getStaffPermissionRequest,
  listPermissionRequestDraftTargets,
  listPermissionRequestResponses,
  listStaffPermissionRequests,
  publishPermissionRequest,
  sendPermissionRequestReminder,
  updatePermissionRequest,
} from "@/lib/notifications-parent-permissions.functions";
import { listClassrooms } from "@/lib/academic.functions";
import { listStudents, type StudentRow } from "@/lib/sis.functions";

const PAGE_SIZE = 20;
const ALL = "__all__";

type RequestRow = {
  id: string;
  title: string;
  request_type: string;
  target_mode: "students" | "classroom";
  status: "draft" | "open" | "closed" | "cancelled";
  due_at: string | null;
  published_at: string | null;
  created_at: string;
  version: number;
  recipient_count: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
};

type RequestDetail = RequestRow & {
  description: string | null;
  target_classroom_id: string | null;
};

type ResponseRow = {
  recipient_id: string;
  student_id: string;
  student_name: string;
  decision: "approved" | "rejected" | null;
  decided_at: string | null;
  decided: boolean;
};

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function commandId() {
  return crypto.randomUUID();
}

export function toDueAtIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function isExpired(row: { status: string; due_at: string | null }) {
  return (
    row.status === "open" && Boolean(row.due_at && new Date(row.due_at).getTime() <= Date.now())
  );
}

function statusLabel(status: string, expired = false) {
  if (expired) return "Expired";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(
  status: string,
  expired = false,
): "default" | "secondary" | "outline" | "destructive" {
  if (expired || status === "cancelled") return "destructive";
  if (status === "open") return "default";
  if (status === "draft") return "secondary";
  return "outline";
}

function errorMessage(error: unknown) {
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (text.includes("STALE_VERSION"))
    return "Permintaan ini sudah berubah. Muat ulang data terbaru sebelum menyimpan lagi.";
  if (text.includes("NO_ELIGIBLE_RECIPIENTS"))
    return "Tidak ada penerima aktif yang memenuhi syarat untuk permintaan ini.";
  if (text.includes("REQUEST_NOT_DRAFT"))
    return "Hanya permintaan draft yang dapat diedit atau dipublikasikan.";
  if (text.includes("REQUEST_NOT_OPEN"))
    return "Permintaan ini tidak sedang terbuka untuk tindakan tersebut.";
  if (text.includes("REQUEST_EXPIRED")) return "Batas waktu permintaan sudah lewat.";
  if (text.includes("INVALID_TARGET_SET"))
    return "Target siswa atau kelas belum lengkap dan valid.";
  if (text.includes("PERMISSION_DENIED")) return "Anda tidak memiliki izin untuk tindakan ini.";
  return "Tindakan tidak dapat diselesaikan. Coba lagi.";
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {actions}
    </div>
  );
}

function Pager({
  page,
  hasNext,
  onChange,
}: {
  page: number;
  hasNext: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
      <p className="text-xs text-muted-foreground">Page {page}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>
        <Button size="sm" variant="outline" disabled={!hasNext} onClick={() => onChange(page + 1)}>
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function PermissionRequestListPage() {
  const { activeOrganization, activeSchool, hasPermission } = useAppContext();
  const navigate = useNavigate();
  const fetch = useServerFn(listStaffPermissionRequests);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(ALL);
  const [search, setSearch] = useState("");
  const organizationId = activeOrganization?.organizationId;
  const schoolId = activeSchool?.id;
  const query = useQuery({
    queryKey: ["permission-requests", "list", organizationId, schoolId, status, page],
    queryFn: () =>
      fetch({
        data: {
          organizationId: organizationId!,
          schoolId: schoolId!,
          status: status === ALL ? undefined : (status as RequestRow["status"]),
          pageSize: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        },
      }),
    enabled: Boolean(organizationId && schoolId && hasPermission("permission_request.read")),
  });
  const data = rows<RequestRow>(query.data);
  const visible = data.filter(
    (row) =>
      !search.trim() ||
      `${row.title} ${row.request_type}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const canCreate = hasPermission("permission_request.create");

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Permission Requests"
          description={`Staff workflow for ${activeSchool?.name ?? "the active school"}.`}
          actions={
            <PermissionGate permission="permission_request.create">
              <Button
                disabled={!schoolId}
                onClick={() => navigate({ to: "/permission-requests/new" })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create request
              </Button>
            </PermissionGate>
          }
        />
        <Card>
          <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_180px_auto]">
            <div className="relative">
              <ListFilter className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Search permission requests"
                className="pl-9"
                placeholder="Search title or type"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filter request status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center text-xs text-muted-foreground">
              Server page {page}
            </div>
          </CardContent>
        </Card>
        {query.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : query.error ? (
          <Alert variant="destructive">
            <AlertTitle>We couldn't load permission requests</AlertTitle>
            <AlertDescription>
              <p>{errorMessage(query.error)}</p>
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
        ) : visible.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <FileEdit className="h-8 w-8 text-muted-foreground" />
              <CardTitle className="text-base">
                {search || status !== ALL ? "No matching requests" : "No permission requests yet"}
              </CardTitle>
              <CardDescription>
                {canCreate
                  ? "Create a draft to start a permission workflow."
                  : "Requests will appear here when your school has permission workflows."}
              </CardDescription>
              {canCreate && (
                <Button
                  className="mt-2"
                  onClick={() => navigate({ to: "/permission-requests/new" })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create request
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Responses</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => {
                    const expired = isExpired(row);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Link
                            className="font-medium hover:underline"
                            to="/permission-requests/$requestId"
                            params={{ requestId: row.id }}
                          >
                            {row.title}
                          </Link>
                          <p className="text-xs text-muted-foreground">{row.request_type}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusTone(row.status, expired)}>
                            {statusLabel(row.status, expired)}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize">
                          {row.target_mode === "classroom" ? "Classroom" : "Selected students"}
                        </TableCell>
                        <TableCell className={expired ? "font-medium text-destructive" : ""}>
                          <span className="flex items-center gap-1 text-xs">
                            <CalendarClock className="h-3.5 w-3.5" />
                            {formatDate(row.due_at)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            <span className="font-medium">{row.recipient_count}</span> total ·{" "}
                            {row.pending_count} pending · {row.approved_count} approved ·{" "}
                            {row.rejected_count} rejected
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link
                              to="/permission-requests/$requestId"
                              params={{ requestId: row.id }}
                            >
                              Open
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="p-4">
                <Pager page={page} hasNext={data.length === PAGE_SIZE} onChange={setPage} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

type FormValues = {
  requestType: string;
  title: string;
  description: string;
  targetMode: "classroom" | "students";
  targetClassroomId: string;
  studentIds: string[];
  dueAt: string;
};
const EMPTY_FORM: FormValues = {
  requestType: "",
  title: "",
  description: "",
  targetMode: "classroom",
  targetClassroomId: "",
  studentIds: [],
  dueAt: "",
};

export function PermissionRequestFormPage({
  requestId,
  initial,
}: {
  requestId?: string;
  initial?: (RequestDetail & { targetStudentIds?: string[] }) | undefined;
}) {
  const { activeOrganization, activeSchool, activeAcademicYear, hasPermission } = useAppContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getClassrooms = useServerFn(listClassrooms);
  const searchStudents = useServerFn(listStudents);
  const create = useServerFn(createPermissionRequest);
  const update = useServerFn(updatePermissionRequest);
  const [form, setForm] = useState<FormValues>(() =>
    initial
      ? {
          requestType: initial.request_type,
          title: initial.title,
          description: initial.description ?? "",
          targetMode: initial.target_mode,
          targetClassroomId: initial.target_classroom_id ?? "",
          studentIds: initial.targetStudentIds ?? [],
          dueAt: initial.due_at ? new Date(initial.due_at).toISOString().slice(0, 16) : "",
        }
      : EMPTY_FORM,
  );
  const [studentSearch, setStudentSearch] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    requestType?: string;
    title?: string;
    target?: string;
    dueAt?: string;
  }>({});
  const [actionCommandId] = useState(commandId);
  const classrooms = useQuery({
    queryKey: ["permission-request", "classrooms", activeSchool?.id, activeAcademicYear?.id],
    queryFn: () =>
      getClassrooms({
        data: { schoolId: activeSchool!.id, academicYearId: activeAcademicYear?.id ?? null },
      }),
    enabled: Boolean(activeSchool?.id && activeAcademicYear?.id && hasPermission("classroom.read")),
  });
  const students = useQuery({
    queryKey: [
      "permission-request",
      "students",
      activeOrganization?.organizationId,
      activeSchool?.id,
      activeAcademicYear?.id,
      studentSearch,
    ],
    queryFn: () =>
      searchStudents({
        data: {
          organizationId: activeOrganization!.organizationId,
          schoolId: activeSchool!.id,
          academicYearId: activeAcademicYear!.id,
          enrollmentScope: "enrolled",
          search: studentSearch || null,
          page: 1,
          pageSize: 20,
        },
      }),
    enabled: Boolean(
      activeOrganization?.organizationId &&
      activeSchool?.id &&
      activeAcademicYear?.id &&
      form.targetMode === "students" &&
      hasPermission("student.read"),
    ),
  });
  const persist = useMutation({
    mutationFn: async () => {
      const dueAt = toDueAtIso(form.dueAt);
      if (form.dueAt && !dueAt) throw new Error("Enter a valid response deadline.");
      const common = {
        organizationId: activeOrganization!.organizationId,
        schoolId: activeSchool!.id,
        requestType: form.requestType,
        title: form.title,
        description: form.description || null,
        targetMode: form.targetMode,
        targetClassroomId: form.targetMode === "classroom" ? form.targetClassroomId : null,
        studentIds: form.targetMode === "students" ? form.studentIds : [],
        dueAt,
        commandRequestId: actionCommandId,
      };
      return requestId
        ? update({ data: { ...common, requestId, expectedVersion: initial!.version } })
        : create({ data: { ...common, requestId: crypto.randomUUID() } });
    },
    onSuccess: (result) => {
      const row = result as { request_id: string };
      toast.success(requestId ? "Draft updated." : "Draft saved.");
      void queryClient.invalidateQueries({ queryKey: ["permission-requests"] });
      navigate({ to: "/permission-requests/$requestId", params: { requestId: row.request_id } });
    },
    onError: (error) => setFormError(errorMessage(error)),
  });
  const selectedStudents = useMemo(
    () => (students.data?.rows ?? []).filter((student) => form.studentIds.includes(student.id)),
    [students.data?.rows, form.studentIds],
  );
  const selectedMissing = form.studentIds.filter(
    (id) => !selectedStudents.some((student) => student.id === id),
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const nextErrors: typeof fieldErrors = {};
    if (!form.requestType.trim()) nextErrors.requestType = "Request type is required.";
    if (!form.title.trim()) nextErrors.title = "Title is required.";
    if (form.targetMode === "classroom" && !form.targetClassroomId)
      nextErrors.target = "Select a classroom target.";
    if (form.targetMode === "students" && form.studentIds.length === 0)
      nextErrors.target = "Select at least one Student target.";
    if (form.dueAt && !toDueAtIso(form.dueAt))
      nextErrors.dueAt = "Enter a valid response deadline.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    persist.mutate();
  }
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title={requestId ? "Edit draft request" : "Create permission request"}
          description="Save a draft first, then publish it after reviewing its recipient snapshot."
        />
        {formError && (
          <Alert variant="destructive">
            <AlertTitle>Could not save draft</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={submit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Request details</CardTitle>
              <CardDescription>
                All fields are validated again by the authenticated server command.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="request-type">Request type</Label>
                <Input
                  id="request-type"
                  value={form.requestType}
                  onChange={(e) => setForm({ ...form, requestType: e.target.value })}
                  placeholder="e.g. field trip"
                  aria-invalid={Boolean(fieldErrors.requestType)}
                  aria-describedby={fieldErrors.requestType ? "request-type-error" : undefined}
                />
                {fieldErrors.requestType && (
                  <p id="request-type-error" className="text-sm text-destructive" role="alert">
                    {fieldErrors.requestType}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="due-at">Response deadline</Label>
                <Input
                  id="due-at"
                  type="datetime-local"
                  value={form.dueAt}
                  onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                  aria-invalid={Boolean(fieldErrors.dueAt)}
                  aria-describedby={fieldErrors.dueAt ? "due-at-error" : undefined}
                />
                {fieldErrors.dueAt && (
                  <p id="due-at-error" className="text-sm text-destructive" role="alert">
                    {fieldErrors.dueAt}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  The deadline is sent as an ISO timestamp; it is not an authorization boundary.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="request-title">Title</Label>
                <Input
                  id="request-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  aria-invalid={Boolean(fieldErrors.title)}
                  aria-describedby={fieldErrors.title ? "request-title-error" : undefined}
                  maxLength={200}
                />
                {fieldErrors.title && (
                  <p id="request-title-error" className="text-sm text-destructive" role="alert">
                    {fieldErrors.title}
                  </p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="request-description">Description</Label>
                <Textarea
                  id="request-description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  maxLength={5000}
                  placeholder="Add context for Staff and Parents."
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Target audience</CardTitle>
              <CardDescription>
                Choose one immutable target mode. The recipient list is snapshotted when you
                publish.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className={`rounded-lg border p-4 text-left ${form.targetMode === "classroom" ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => setForm({ ...form, targetMode: "classroom", studentIds: [] })}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <GraduationCap className="h-4 w-4" />
                    Entire classroom
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Use the active enrolled roster for one classroom.
                  </span>
                </button>
                <button
                  type="button"
                  className={`rounded-lg border p-4 text-left ${form.targetMode === "students" ? "border-primary bg-primary/5" : ""}`}
                  onClick={() =>
                    setForm({ ...form, targetMode: "students", targetClassroomId: "" })
                  }
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Users className="h-4 w-4" />
                    Selected Students
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Choose a bounded set of enrolled Students.
                  </span>
                </button>
              </div>
              {form.targetMode === "classroom" ? (
                <div className="space-y-2">
                  <Label htmlFor="classroom">Classroom</Label>
                  <Select
                    value={form.targetClassroomId}
                    onValueChange={(value) => setForm({ ...form, targetClassroomId: value })}
                  >
                    <SelectTrigger id="classroom">
                      <SelectValue
                        placeholder={
                          classrooms.isPending ? "Loading classrooms…" : "Select classroom"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(classrooms.data ?? [])
                        .filter((item) => item.status === "active")
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.code} — {item.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.target && (
                    <p className="text-sm text-destructive" role="alert">
                      {fieldErrors.target}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="student-search">Find enrolled Students</Label>
                    <Input
                      id="student-search"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Search by Student name or NISN"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {students.isPending ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      (students.data?.rows ?? []).map((student) => (
                        <button
                          type="button"
                          key={student.id}
                          className="flex items-center justify-between rounded-md border p-3 text-left text-sm hover:bg-accent"
                          onClick={() =>
                            setForm({
                              ...form,
                              studentIds: form.studentIds.includes(student.id)
                                ? form.studentIds.filter((id) => id !== student.id)
                                : [...form.studentIds, student.id],
                            })
                          }
                        >
                          <span>
                            <span className="block font-medium">
                              {student.preferredName || student.fullName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {student.nisn || "Enrolled Student"}
                            </span>
                          </span>
                          {form.studentIds.includes(student.id) && (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  {form.studentIds.length > 0 && (
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-sm font-medium">
                        Selected Students ({form.studentIds.length})
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedStudents.map((student) => (
                          <Badge key={student.id} variant="secondary">
                            {student.preferredName || student.fullName}
                            <button
                              type="button"
                              className="ml-1 rounded-full"
                              aria-label={`Remove ${student.fullName}`}
                              onClick={() =>
                                setForm({
                                  ...form,
                                  studentIds: form.studentIds.filter((id) => id !== student.id),
                                })
                              }
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                        {selectedMissing.map((id) => (
                          <Badge key={id} variant="outline">
                            Saved Student
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {fieldErrors.target && (
                    <p className="text-sm text-destructive" role="alert">
                      {fieldErrors.target}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                navigate({
                  to: requestId ? "/permission-requests/$requestId" : "/permission-requests",
                })
              }
            >
              Cancel
            </Button>
            <Button type="submit" disabled={persist.isPending}>
              {persist.isPending ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

export function PermissionRequestDetailPage({ requestId }: { requestId: string }) {
  const { activeOrganization, activeSchool, hasPermission } = useAppContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const get = useServerFn(getStaffPermissionRequest);
  const targets = useServerFn(listPermissionRequestDraftTargets);
  const getResponses = useServerFn(listPermissionRequestResponses);
  const publish = useServerFn(publishPermissionRequest);
  const close = useServerFn(closePermissionRequest);
  const cancel = useServerFn(cancelPermissionRequest);
  const reminder = useServerFn(sendPermissionRequestReminder);
  const [responsePage, setResponsePage] = useState(1);
  const detail = useQuery({
    queryKey: [
      "permission-requests",
      "detail",
      requestId,
      activeOrganization?.organizationId,
      activeSchool?.id,
    ],
    queryFn: async () =>
      rows<RequestDetail>(
        await get({
          data: {
            requestId,
            organizationId: activeOrganization!.organizationId,
            schoolId: activeSchool!.id!,
          },
        }),
      )[0] ?? null,
    enabled: Boolean(
      requestId &&
      activeOrganization?.organizationId &&
      activeSchool?.id &&
      hasPermission("permission_request.read"),
    ),
  });
  const targetQuery = useQuery({
    queryKey: ["permission-requests", "targets", requestId],
    queryFn: () =>
      targets({
        data: {
          requestId,
          organizationId: activeOrganization!.organizationId,
          schoolId: activeSchool!.id!,
        },
      }),
    enabled: detail.data?.status === "draft" && detail.data.target_mode === "students",
  });
  const responseQuery = useQuery({
    queryKey: ["permission-requests", "responses", requestId, responsePage],
    queryFn: () =>
      getResponses({
        data: { requestId, pageSize: PAGE_SIZE, offset: (responsePage - 1) * PAGE_SIZE },
      }),
    enabled: Boolean(detail.data && detail.data.status !== "draft"),
  });
  const act = useMutation({
    mutationFn: async (kind: "publish" | "close" | "cancel" | "reminder") => {
      const base = {
        requestId,
        organizationId: activeOrganization!.organizationId,
        schoolId: activeSchool!.id!,
        expectedVersion: detail.data!.version,
        commandRequestId: commandId(),
      };
      if (kind === "publish") return publish({ data: base });
      if (kind === "close") return close({ data: base });
      if (kind === "cancel") return cancel({ data: base });
      return reminder({
        data: {
          requestId,
          organizationId: activeOrganization!.organizationId,
          schoolId: activeSchool!.id!,
          commandRequestId: base.commandRequestId,
        },
      });
    },
    onSuccess: (_, kind) => {
      toast.success(
        kind === "reminder"
          ? "In-app reminder sent."
          : `Request ${kind === "publish" ? "published" : `${kind}d`}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["permission-requests"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (detail.isPending)
    return (
      <AppShell>
        <Skeleton className="h-96 w-full" />
      </AppShell>
    );
  if (detail.error || !detail.data)
    return (
      <AppShell>
        <Alert variant="destructive">
          <AlertTitle>Permission request unavailable</AlertTitle>
          <AlertDescription>{errorMessage(detail.error)}</AlertDescription>
        </Alert>
      </AppShell>
    );
  const row = detail.data;
  const expired = isExpired(row);
  const canEdit = row.status === "draft" && hasPermission("permission_request.update");
  const canPublish = row.status === "draft" && hasPermission("permission_request.publish");
  const canClose = row.status === "open" && hasPermission("permission_request.close");
  const canCancel =
    ["draft", "open"].includes(row.status) && hasPermission("permission_request.close");
  const canRemind =
    row.status === "open" &&
    !expired &&
    hasPermission("notification.send") &&
    hasPermission("permission_request.read");
  const confirm = (
    kind: "publish" | "close" | "cancel" | "reminder",
    title: string,
    description: string,
    label: string,
  ) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={kind === "publish" ? "default" : "outline"} disabled={act.isPending}>
          {kind === "publish" ? (
            <Megaphone className="mr-2 h-4 w-4" />
          ) : kind === "reminder" ? (
            <BellRing className="mr-2 h-4 w-4" />
          ) : kind === "close" ? (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          ) : (
            <XCircle className="mr-2 h-4 w-4" />
          )}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => act.mutate(kind)}>{label}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ to: "/permission-requests" })}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              All requests
            </Button>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{row.title}</h1>
            <p className="text-sm text-muted-foreground">
              {row.request_type} · version {row.version}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button asChild variant="outline">
                <Link to="/permission-requests/$requestId/edit" params={{ requestId }}>
                  <FileEdit className="mr-2 h-4 w-4" />
                  Edit draft
                </Link>
              </Button>
            )}
            {canPublish &&
              confirm(
                "publish",
                "Publish this request?",
                "The current recipient list will be snapshotted. The request will become open and Parents can respond; later enrolment changes will not rewrite the history.",
                "Publish",
              )}
            {canClose &&
              confirm(
                "close",
                "Close this request?",
                "Recipients, decisions and history are retained. A closed request cannot be reopened.",
                "Close",
              )}
            {canCancel &&
              confirm(
                "cancel",
                "Cancel this request?",
                "The request will be cancelled and its existing history will be retained. It cannot be reopened.",
                "Cancel",
              )}
            {canRemind &&
              confirm(
                "reminder",
                "Send an in-app reminder?",
                "A reminder will go only to eligible Parents with pending responses. This does not send email, SMS or push notifications.",
                "Send reminder",
              )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusTone(row.status, expired)}>
            {statusLabel(row.status, expired)}
          </Badge>
          {row.target_mode === "classroom" ? (
            <Badge variant="outline">Classroom target</Badge>
          ) : (
            <Badge variant="outline">Selected Students</Badge>
          )}
          <span className="text-xs text-muted-foreground">Due {formatDate(row.due_at)}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat icon={Users} label="Recipients" value={row.recipient_count} />
          <Stat icon={Clock3} label="Pending" value={row.pending_count} />
          <Stat icon={CheckCircle2} label="Approved" value={row.approved_count} />
          <Stat icon={XCircle} label="Rejected" value={row.rejected_count} />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Request details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="whitespace-pre-wrap">
                  {row.description || "No description provided."}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Target mode</p>
                  <p className="capitalize">
                    {row.target_mode === "classroom" ? "Entire classroom" : "Selected Students"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p>{formatDate(row.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Published</p>
                  <p>{formatDate(row.published_at)}</p>
                </div>
              </div>
              {row.target_mode === "classroom" ? (
                <p className="rounded-md bg-muted/50 p-3 text-xs">
                  The classroom recipient roster is resolved and snapshotted when this request is
                  published.
                </p>
              ) : (
                <div className="rounded-md bg-muted/50 p-3 text-xs">
                  Draft target IDs:{" "}
                  {targetQuery.isPending ? "Loading…" : (targetQuery.data?.length ?? 0)} selected
                  Students.
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Only valid actions for the current lifecycle and your permissions are shown.</p>
              <p className="text-xs text-muted-foreground">
                Close and cancel retain recipients, decisions and history. There is no reopen
                action.
              </p>
            </CardContent>
          </Card>
        </div>
        {row.status !== "draft" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recipient responses</CardTitle>
              <CardDescription>
                Student response status supplied by the protected Staff projection.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {responseQuery.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : responseQuery.error ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage(responseQuery.error)}</AlertDescription>
                </Alert>
              ) : rows<ResponseRow>(responseQuery.data).length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No recipient responses are available yet.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Decision</TableHead>
                          <TableHead>Decided at</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows<ResponseRow>(responseQuery.data).map((item) => (
                          <TableRow key={item.recipient_id}>
                            <TableCell>{item.student_name}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  item.decision === "approved"
                                    ? "default"
                                    : item.decision === "rejected"
                                      ? "destructive"
                                      : "secondary"
                                }
                              >
                                {item.decision ?? "Pending"}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(item.decided_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Pager
                    page={responsePage}
                    hasNext={rows<ResponseRow>(responseQuery.data).length === PAGE_SIZE}
                    onChange={setResponsePage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

export function mapStudentRows(rowsValue: StudentRow[]) {
  return rowsValue.map((student) => ({
    id: student.id,
    label: student.preferredName || student.fullName,
  }));
}
