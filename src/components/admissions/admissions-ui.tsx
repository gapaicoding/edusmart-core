import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAppContext, PermissionGate } from "@/lib/app-context";
import {
  acceptAdmissionApplication,
  archiveAdmissionCycle,
  closeAdmissionCycle,
  convertAdmissionApplication,
  getAdmissionApplication,
  listAdmissionApplications,
  listAdmissionCycles,
  openAdmissionCycle,
  rejectAdmissionApplication,
  reopenAdmissionCycle,
  startAdmissionReview,
  withdrawAdmissionApplication,
} from "@/lib/admissions.functions";
import { getPublicAdmissionCycle, submitPublicAdmissionApplication } from "@/lib/admissions.server";

type Grade = { id: string; name: string; code?: string };
type PublicCycle = {
  id: string;
  name: string;
  school_name: string;
  academic_year_name: string;
  opens_at: string | null;
  closes_at: string | null;
  available: boolean;
  grades: Grade[];
};
type Cycle = {
  id: string;
  school_id: string;
  academic_year_id: string;
  name: string;
  status: "draft" | "open" | "closed" | "archived";
  row_version: number;
  opens_at: string | null;
  closes_at: string | null;
};
type Application = {
  id: string;
  application_number: string;
  status: string;
  applicant_full_name: string;
  target_grade_level_id: string;
  submitted_at: string;
  row_version: number;
};
type DetailApplication = Application & {
  applicant_nisn?: string | null;
};
type GuardianDetail = {
  id?: string;
  full_name?: string | null;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
};
type ConsentDetail = { policy_version?: string | null; consent_source?: string | null };
type StageDetail = {
  occurred_at?: string | null;
  from_status?: string | null;
  to_status?: string | null;
  reason?: string | null;
};
type ConversionDetail = { student_id?: string | null; student_enrollment_id?: string | null };
type SubmissionReceipt = {
  application_reference?: string | null;
  status?: string | null;
  submitted_at?: string | null;
};
type Detail = {
  application: DetailApplication;
  guardians: GuardianDetail[];
  consents: ConsentDetail[];
  stage_history: StageDetail[];
  conversion: ConversionDetail | null;
};

const statusLabel = (status: string) =>
  status.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const safeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (
    message.toLowerCase().includes("already exist") ||
    message.toLowerCase().includes("duplicate")
  )
    return "A student with the same canonical student identifier already exists. This application was not converted.";
  return message || "This action could not be completed.";
};
const requestId = () => crypto.randomUUID();

function PageState({
  children,
  error,
  onRetry,
}: {
  children?: ReactNode;
  error?: unknown;
  onRetry?: () => void;
}) {
  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>We could not load this admissions view</AlertTitle>
        <AlertDescription className="mt-2">
          {safeError(error)}{" "}
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              Try again
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  return <>{children}</>;
}

export function PublicAdmissionPage({ cycleId }: { cycleId: string }) {
  const query = useQuery({
    queryKey: ["b18", "public-cycle", cycleId],
    queryFn: async () =>
      (await getPublicAdmissionCycle(supabase, cycleId)) as unknown as PublicCycle[],
  });
  const cycle = query.data?.[0];
  const [applicant, setApplicant] = useState({ fullName: "", nisn: "", gradeId: "" });
  const [guardians, setGuardians] = useState([
    { fullName: "", relationship: "Parent/Guardian", phone: "", email: "", primary: true },
  ]);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);
  const logicalRequest = useRef<string | null>(null);
  const logicalPayload = useRef<string | null>(null);

  const submit = useMutation({
    mutationFn: async (input: { id: string; payload: Record<string, unknown> }) =>
      submitPublicAdmissionApplication(supabase, {
        cycleId,
        requestId: input.id,
        payload: input.payload,
      }),
    onSuccess: (data) => {
      setReceipt(data as SubmissionReceipt);
      setError(null);
    },
    onError: (e) => setError(safeError(e)),
  });
  function addGuardian() {
    if (guardians.length < 5)
      setGuardians((items) => [
        ...items,
        { fullName: "", relationship: "Parent/Guardian", phone: "", email: "", primary: false },
      ]);
  }
  function removeGuardian(index: number) {
    if (guardians.length > 1) setGuardians((items) => items.filter((_, i) => i !== index));
  }
  function submitForm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!cycle?.available) return setError("This admission cycle is not accepting applications.");
    if (!applicant.fullName.trim() || !applicant.gradeId)
      return setError("Enter the applicant name and target grade.");
    if (!consent) return setError("Explicit consent is required before submitting.");
    if (
      guardians.length < 1 ||
      guardians.filter((g) => g.primary).length !== 1 ||
      guardians.some((g) => !g.fullName.trim() || !g.relationship.trim())
    )
      return setError("Add one complete primary guardian contact.");
    const payload = {
      applicant_full_name: applicant.fullName.trim(),
      applicant_nisn: applicant.nisn.trim() || null,
      target_grade_level_id: applicant.gradeId,
      policy_version: "v1",
      consent_source: "public_submission",
      guardians: guardians.map((g) => ({
        full_name: g.fullName.trim(),
        relationship: g.relationship.trim(),
        phone: g.phone.trim() || null,
        email: g.email.trim() || null,
        is_primary: g.primary,
      })),
    };
    const fingerprint = JSON.stringify(payload);
    if (logicalPayload.current !== fingerprint) {
      logicalPayload.current = fingerprint;
      logicalRequest.current = requestId();
    }
    const id = logicalRequest.current!;
    logicalRequest.current = id;
    submit.mutate({ id, payload });
  }
  if (query.isLoading)
    return (
      <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 py-8">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-80 w-full" />
      </main>
    );
  if (query.error || !cycle)
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <PageState
          error={query.error ?? new Error("This admissions cycle is unavailable.")}
          onRetry={() => void query.refetch()}
        />
      </main>
    );
  if (receipt)
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Application received</CardTitle>
            <CardDescription>
              Your submission has been received. This receipt does not promise acceptance or
              placement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <strong>Reference:</strong> {String(receipt.application_reference ?? "Submitted")}
            </p>
            <p>
              <strong>Status:</strong> {statusLabel(String(receipt.status ?? "submitted"))}
            </p>
            <p>
              <strong>Submitted:</strong> {String(receipt.submitted_at ?? "Now")}
            </p>
            <p className="text-muted-foreground">
              Keep this reference for your records. There is no public application lookup in this
              release.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 py-8 sm:py-12">
      <header>
        <p className="text-sm font-medium text-primary">EduSmart Admissions</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{cycle.name}</h1>
        <p className="mt-2 text-muted-foreground">
          {cycle.school_name} · {cycle.academic_year_name}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={cycle.available ? "default" : "secondary"}>
            {cycle.available ? "Applications open" : "Applications unavailable"}
          </Badge>
          <span className="text-muted-foreground">
            Window: {cycle.opens_at ? new Date(cycle.opens_at).toLocaleString() : "Any time"} –{" "}
            {cycle.closes_at ? new Date(cycle.closes_at).toLocaleString() : "No closing date"}
          </span>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Complete the structured application below. Your information is sent securely to the
          selected school.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Application details</CardTitle>
          <CardDescription>Fields marked required are needed to submit.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-8" onSubmit={submitForm} noValidate>
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Applicant</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="applicant-name">Full name *</Label>
                  <Input
                    id="applicant-name"
                    value={applicant.fullName}
                    onChange={(e) => setApplicant({ ...applicant, fullName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="applicant-nisn">NISN (optional)</Label>
                  <Input
                    id="applicant-nisn"
                    value={applicant.nisn}
                    onChange={(e) => setApplicant({ ...applicant, nisn: e.target.value })}
                    maxLength={64}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target-grade">Target grade *</Label>
                  <Select
                    value={applicant.gradeId}
                    onValueChange={(value) => setApplicant({ ...applicant, gradeId: value })}
                  >
                    <SelectTrigger id="target-grade">
                      <SelectValue placeholder="Choose a grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {cycle.grades.map((grade) => (
                        <SelectItem key={grade.id} value={grade.id}>
                          {grade.name}
                          {grade.code ? ` (${grade.code})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Guardian / contact</h2>
                  <p className="text-sm text-muted-foreground">
                    At least one primary contact is required.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addGuardian}
                  disabled={guardians.length >= 5}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add guardian
                </Button>
              </div>
              {guardians.map((guardian, index) => (
                <div className="space-y-3 rounded-lg border p-4" key={`guardian-${index}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Contact {index + 1}</p>
                    {guardians.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeGuardian(index)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`guardian-name-${index}`}>Full name *</Label>
                      <Input
                        id={`guardian-name-${index}`}
                        value={guardian.fullName}
                        onChange={(e) =>
                          setGuardians((items) =>
                            items.map((g, i) =>
                              i === index ? { ...g, fullName: e.target.value } : g,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`guardian-rel-${index}`}>Relationship *</Label>
                      <Input
                        id={`guardian-rel-${index}`}
                        value={guardian.relationship}
                        onChange={(e) =>
                          setGuardians((items) =>
                            items.map((g, i) =>
                              i === index ? { ...g, relationship: e.target.value } : g,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`guardian-phone-${index}`}>Phone</Label>
                      <Input
                        id={`guardian-phone-${index}`}
                        value={guardian.phone}
                        onChange={(e) =>
                          setGuardians((items) =>
                            items.map((g, i) =>
                              i === index ? { ...g, phone: e.target.value } : g,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`guardian-email-${index}`}>Email</Label>
                      <Input
                        id={`guardian-email-${index}`}
                        type="email"
                        value={guardian.email}
                        onChange={(e) =>
                          setGuardians((items) =>
                            items.map((g, i) =>
                              i === index ? { ...g, email: e.target.value } : g,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={guardian.primary}
                      onCheckedChange={(checked) =>
                        checked &&
                        setGuardians((items) =>
                          items.map((g, i) => ({ ...g, primary: i === index })),
                        )
                      }
                    />
                    Primary contact
                  </label>
                </div>
              ))}
            </section>
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Consent</h2>
              <label className="flex items-start gap-3 rounded-lg border p-4 text-sm">
                <Checkbox
                  checked={consent}
                  onCheckedChange={(checked) => setConsent(checked === true)}
                />
                <span>
                  I consent to the school processing this application for admissions review under
                  policy version v1. *
                </span>
              </label>
            </section>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={submit.isPending || !cycle.available}
            >
              {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit
              application
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function ReasonDialog({
  open,
  title,
  description,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  title: string;
  description: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  busy?: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) setReason("");
        onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Label htmlFor="action-reason">Reason *</Label>
        <Textarea
          id="action-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {busy ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdmissionsWorkspace({ applicationId }: { applicationId?: string }) {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">
        {applicationId ? (
          <AdmissionApplicationDetail applicationId={applicationId} />
        ) : (
          <AdmissionsDashboard />
        )}
      </div>
    </AppShell>
  );
}

function AdmissionsDashboard() {
  const { activeSchool, hasPermission } = useAppContext();
  const schoolId = activeSchool?.id;
  const queryClient = useQueryClient();
  const cyclesFn = useServerFn(listAdmissionCycles);
  const cyclesQuery = useQuery({
    queryKey: ["b18", "cycles", schoolId],
    queryFn: () => cyclesFn({ data: { schoolId } }),
    enabled: Boolean(schoolId) && hasPermission("admission.read"),
  });
  const [selectedCycle, setSelectedCycle] = useState<string | null>(null);
  const cycles = (cyclesQuery.data ?? []) as unknown as Cycle[];
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Admissions</p>
        <h1 className="text-3xl font-bold tracking-tight">PPDB workspace</h1>
        <p className="mt-2 text-muted-foreground">
          Manage admission cycles and review applications within your active school.
        </p>
      </header>
      <PageState error={cyclesQuery.error} onRetry={() => void cyclesQuery.refetch()}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <CyclePanel
            cycles={cycles}
            selectedCycle={selectedCycle}
            onSelect={setSelectedCycle}
            onChanged={() =>
              void queryClient.invalidateQueries({ queryKey: ["b18", "cycles", schoolId] })
            }
          />
          <ApplicationQueue cycleId={selectedCycle ?? cycles[0]?.id ?? null} />
        </div>
      </PageState>
    </div>
  );
}

function CyclePanel({
  cycles,
  selectedCycle,
  onSelect,
  onChanged,
}: {
  cycles: Cycle[];
  selectedCycle: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const { hasPermission } = useAppContext();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [action, setAction] = useState<"reopen" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commandRequests = useRef<Record<string, string>>({});
  const cycle = cycles.find((item) => item.id === selectedCycle) ?? cycles[0];
  const openFn = useServerFn(openAdmissionCycle);
  const closeFn = useServerFn(closeAdmissionCycle);
  const reopenFn = useServerFn(reopenAdmissionCycle);
  const archiveFn = useServerFn(archiveAdmissionCycle);
  const mutation = useMutation({
    mutationFn: async (input: { command: string; reason?: string }) => {
      if (!cycle) return;
      const data = {
        cycleId: cycle.id,
        expectedRowVersion: cycle.row_version,
        requestId: (commandRequests.current[
          `${input.command}:${cycle.row_version}:${input.reason ?? ""}`
        ] ??= requestId()),
        reason: input.reason,
      };
      if (input.command === "open") return openFn({ data });
      if (input.command === "close") return closeFn({ data });
      if (input.command === "archive") return archiveFn({ data });
      return reopenFn({ data: { ...data, reason: input.reason! } });
    },
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (e) => setError(safeError(e)),
  });
  if (!cycle)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Admission cycles</CardTitle>
          <CardDescription>No cycles are available in this school.</CardDescription>
        </CardHeader>
      </Card>
    );
  const canManage = hasPermission("admission.manage_cycle");
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Admission cycles</CardTitle>
            <CardDescription>Choose a cycle to inspect its application queue.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {cycles.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`w-full rounded-lg border p-3 text-left transition-colors ${item.id === cycle.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
              onClick={() => onSelect(item.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.name}</span>
                <Badge variant={item.status === "open" ? "default" : "secondary"}>
                  {statusLabel(item.status)}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.opens_at ? new Date(item.opens_at).toLocaleDateString() : "No opening date"} –{" "}
                {item.closes_at ? new Date(item.closes_at).toLocaleDateString() : "No closing date"}
              </p>
            </button>
          ))}
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {cycle.status === "draft" && (
              <Button
                size="sm"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ command: "open" })}
              >
                Open
              </Button>
            )}
            {cycle.status === "open" && (
              <Button
                size="sm"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ command: "close" })}
              >
                Close
              </Button>
            )}
            {cycle.status === "closed" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => {
                    setAction("reopen");
                    setReasonOpen(true);
                  }}
                >
                  Reopen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ command: "archive" })}
                >
                  Archive
                </Button>
              </>
            )}
            {cycle.status === "archived" && (
              <p className="text-sm text-muted-foreground">Archived cycles are read-only.</p>
            )}
          </div>
        )}
        <ReasonDialog
          open={reasonOpen}
          title="Reopen admission cycle"
          description="A reason is required and the target academic year must still be open."
          onOpenChange={setReasonOpen}
          busy={mutation.isPending}
          onConfirm={(reason) => {
            if (action) mutation.mutate({ command: action, reason });
            setReasonOpen(false);
          }}
        />
      </CardContent>
    </Card>
  );
}

function ApplicationQueue({ cycleId }: { cycleId: string | null }) {
  const fn = useServerFn(listAdmissionApplications);
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ["b18", "applications", cycleId, status, offset],
    queryFn: () =>
      fn({
        data: {
          cycleId: cycleId!,
          status: status === "all" ? undefined : status,
          limit: 50,
          offset,
        },
      }),
    enabled: Boolean(cycleId),
  });
  const data = (query.data ?? { items: [], total: 0, limit: 50, offset }) as unknown as {
    items: Application[];
    total: number;
    limit: number;
    offset: number;
  };
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Applications</CardTitle>
            <CardDescription>
              {data.total ?? 0} bounded results in the selected cycle.
            </CardDescription>
          </div>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setOffset(0);
            }}
          >
            <SelectTrigger className="w-40" aria-label="Filter application status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["submitted", "under_review", "accepted", "rejected", "withdrawn", "converted"].map(
                (item) => (
                  <SelectItem key={item} value={item}>
                    {statusLabel(item)}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <PageState error={query.error} onRetry={() => void query.refetch()}>
          {query.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : data.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No applications match this filter.
            </p>
          ) : (
            <div className="space-y-2">
              {data.items.map((item) => (
                <Link
                  key={item.id}
                  to="/admissions/$applicationId"
                  params={{ applicationId: item.id }}
                  className="block rounded-lg border p-3 hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{item.applicant_full_name}</span>
                    <Badge variant="secondary">{statusLabel(item.status)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.application_number} · {new Date(item.submitted_at).toLocaleDateString()}
                  </p>
                </Link>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {Math.floor(offset / 50) + 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + 50 >= (data.total ?? 0)}
              onClick={() => setOffset(offset + 50)}
            >
              Next
            </Button>
          </div>
        </PageState>
      </CardContent>
    </Card>
  );
}

export function AdmissionApplicationDetail({ applicationId }: { applicationId: string }) {
  const queryClient = useQueryClient();
  const fn = useServerFn(getAdmissionApplication);
  const startFn = useServerFn(startAdmissionReview);
  const acceptFn = useServerFn(acceptAdmissionApplication);
  const rejectFn = useServerFn(rejectAdmissionApplication);
  const withdrawFn = useServerFn(withdrawAdmissionApplication);
  const convertFn = useServerFn(convertAdmissionApplication);
  const query = useQuery({
    queryKey: ["b18", "application", applicationId],
    queryFn: () => fn({ data: { applicationId } }),
  });
  const [reasonOpen, setReasonOpen] = useState<"reject" | "withdraw" | null>(null);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const commandRequests = useRef<Record<string, string>>({});
  const detail = query.data as unknown as Detail | undefined;
  const command = async (
    name: "review" | "accept" | "reject" | "withdraw" | "convert",
    reason?: string,
  ) => {
    if (!detail) return;
    const a = detail.application;
    const input = {
      applicationId,
      expectedRowVersion: Number(a.row_version),
      requestId: (commandRequests.current[`${name}:${a.row_version}:${reason ?? ""}`] ??=
        requestId()),
      reason: reason ?? null,
    };
    if (name === "review") return startFn({ data: input });
    if (name === "accept") return acceptFn({ data: input });
    if (name === "reject") return rejectFn({ data: input });
    if (name === "withdraw") return withdrawFn({ data: input });
    return convertFn({ data: input });
  };
  const mutation = useMutation({
    mutationFn: ({
      name,
      reason,
    }: {
      name: "review" | "accept" | "reject" | "withdraw" | "convert";
      reason?: string;
    }) => command(name, reason),
    onSuccess: () => {
      setReasonOpen(null);
      setConfirmConvert(false);
      void queryClient.invalidateQueries({ queryKey: ["b18", "application", applicationId] });
    },
    onError: (e) => alert(safeError(e)),
  });
  if (query.isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-48" />
      </div>
    );
  if (query.error || !detail)
    return (
      <PageState
        error={query.error ?? new Error("Application unavailable.")}
        onRetry={() => void query.refetch()}
      />
    );
  const a = detail.application;
  const status = String(a.status);
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <Link to="/admissions" className="text-sm text-primary">
            ← Admissions
          </Link>
          <h1 className="mt-2 text-3xl font-bold">{String(a.applicant_full_name)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {String(a.application_number)} · {statusLabel(status)}
          </p>
        </div>
        <Badge className="w-fit" variant={status === "converted" ? "default" : "secondary"}>
          {statusLabel(status)}
        </Badge>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Applicant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <strong>Name:</strong> {String(a.applicant_full_name)}
            </p>
            <p>
              <strong>NISN:</strong> {String(a.applicant_nisn ?? "Not provided")}
            </p>
            <p>
              <strong>Submitted:</strong> {String(a.submitted_at)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Guardians / consent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {detail.guardians.map((g, i) => (
              <div key={String(g.id ?? i)}>
                <strong>{String(g.full_name)}</strong>
                <span className="ml-2 text-muted-foreground">{String(g.relationship)}</span>
                <p>{String(g.phone ?? g.email ?? "No contact provided")}</p>
              </div>
            ))}
            {detail.consents.map((c, i) => (
              <p key={i} className="text-muted-foreground">
                Consent {String(c.policy_version)} · {String(c.consent_source)}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Stage history</CardTitle>
          <CardDescription>Confirmed server transitions only.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {detail.stage_history.map((h, i) => (
              <li key={`${String(h.occurred_at)}-${i}`} className="border-l-2 pl-4 text-sm">
                <p className="font-medium">
                  {String(h.from_status ?? "New")} → {String(h.to_status)}
                </p>
                <p className="text-muted-foreground">
                  {String(h.occurred_at)}
                  {h.reason ? ` · ${String(h.reason)}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      {detail.conversion && (
        <Card>
          <CardHeader>
            <CardTitle>Conversion summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Converted to canonical SIS records.</p>
            <p>Student: {String(detail.conversion.student_id)}</p>
            <p>Enrollment: {String(detail.conversion.student_enrollment_id)}</p>
            <p>Classroom placement was not created.</p>
          </CardContent>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        <PermissionGate permission="admission.review">
          {status === "submitted" && (
            <Button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ name: "review" })}
            >
              Start review
            </Button>
          )}
          {["submitted", "under_review", "accepted"].includes(status) && (
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setReasonOpen("withdraw")}
            >
              Withdraw
            </Button>
          )}
        </PermissionGate>
        <PermissionGate permission="admission.decide">
          {status === "under_review" && (
            <>
              <Button
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ name: "accept" })}
              >
                Accept
              </Button>
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => setReasonOpen("reject")}
              >
                Reject
              </Button>
            </>
          )}
        </PermissionGate>
        <PermissionGate permission="admission.convert">
          {status === "accepted" && !detail.conversion && (
            <Button
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => setConfirmConvert(true)}
            >
              Convert to SIS
            </Button>
          )}
        </PermissionGate>
      </div>
      <ReasonDialog
        open={reasonOpen !== null}
        title={reasonOpen === "reject" ? "Reject application" : "Withdraw application"}
        description="Provide a bounded reason for this staff action."
        onOpenChange={(open) => !open && setReasonOpen(null)}
        busy={mutation.isPending}
        onConfirm={(reason) => {
          if (reasonOpen) mutation.mutate({ name: reasonOpen, reason });
        }}
      />
      <Dialog open={confirmConvert} onOpenChange={setConfirmConvert}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert accepted application?</DialogTitle>
            <DialogDescription>
              This creates a Student, Guardian linkage, and Student Enrollment. Classroom placement
              is not created.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Applicant: {String(a.applicant_full_name)}
            <br />
            Target school and academic year are taken from the application.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmConvert(false)}>
              Cancel
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ name: "convert" })}
            >
              Confirm conversion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
