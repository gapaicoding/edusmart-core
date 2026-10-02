import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, ChevronLeft, ChevronRight, FileEdit, Megaphone, Send } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { formatPreferredDate, translateUiText, useAppPreferences } from "@/lib/app-preferences";
import { listClassrooms } from "@/lib/academic.functions";
import {
  createCommunicationAnnouncement,
  enqueueExternalCommunicationDelivery,
  getCommunicationAnnouncement,
  listExternalCommunicationDeliveries,
  runExternalCommunicationDeliveryCycle,
  setExternalCommunicationDeliveryPaused,
  retryExternalCommunicationDelivery,
  recordExternalContactPreference,
  listCommunicationAnnouncements,
  publishCommunicationAnnouncement,
  updateCommunicationAnnouncement,
} from "@/lib/communication.functions";
import type { CommunicationTargetInput } from "@/lib/communication.schemas";

const PAGE_SIZE = 20;
type Audience = "staff" | "student" | "guardian";
type Target = CommunicationTargetInput;
type AnnouncementRow = {
  id: string;
  title: string;
  status: "draft" | "published";
  target_count: number;
  recipient_count: number;
  created_at: string;
  published_at: string | null;
  version: number;
};
type AnnouncementDetail = {
  id: string;
  title: string;
  body: string;
  status: "draft" | "published";
  version: number;
  created_at: string;
  published_at: string | null;
  target_count: number;
  recipient_count: number;
  readable_recipient: boolean;
  targets: { scope: "school" | "classroom"; classroom_id: string | null; audience: Audience }[];
};
type DeliveryJob = {
  id: string;
  channel: "whatsapp" | "email";
  status:
    | "queued"
    | "processing"
    | "paused"
    | "completed"
    | "completed_with_errors"
    | "failed"
    | "cancelled";
  created_at: string;
  recipient_count: number;
  pending_count: number;
  processing_count: number;
  accepted_count: number;
  retryable_count: number;
  permanent_failure_count: number;
  skipped_count: number;
  expired_lease_count: number;
  oldest_pending_at: string | null;
  paused_at: string | null;
  recipients: {
    id: string;
    recipient_profile_id: string;
    status: string;
    attempt_count: number;
    failure_code: string | null;
    retryable: boolean;
    eligibility: string;
    masked_destination: string | null;
  }[];
};
const deliveryStatusMessage = {
  queued: "communication.deliveryStatus.queued",
  processing: "communication.deliveryStatus.processing",
  paused: "communication.deliveryStatus.paused",
  completed: "communication.deliveryStatus.completed",
  completed_with_errors: "communication.deliveryStatus.completed_with_errors",
  failed: "communication.deliveryStatus.failed",
  cancelled: "communication.deliveryStatus.cancelled",
} as const;
const recipientStatusMessage = {
  pending: "communication.recipientStatus.pending",
  processing: "communication.recipientStatus.processing",
  sent: "communication.recipientStatus.sent",
  delivered: "communication.recipientStatus.delivered",
  failed: "communication.recipientStatus.failed",
  skipped: "communication.recipientStatus.skipped",
  cancelled: "communication.recipientStatus.cancelled",
} as const;
const eligibilityMessage = {
  eligible: "communication.eligibility.eligible",
  opted_out: "communication.eligibility.opted_out",
  consent_required: "communication.eligibility.consent_required",
  contact_unverified: "communication.eligibility.contact_unverified",
  not_supported: "communication.eligibility.not_supported",
} as const;
const failureMessage = {
  WORKER_LEASE_EXPIRED: "communication.failure.WORKER_LEASE_EXPIRED",
  TEST_TEMPORARY_FAILURE: "communication.failure.TEST_TEMPORARY_FAILURE",
  TEST_INVALID_DESTINATION: "communication.failure.TEST_INVALID_DESTINATION",
  TEST_MISSING_DESTINATION: "communication.failure.TEST_MISSING_DESTINATION",
  TEST_UNSUPPORTED_DESTINATION: "communication.failure.TEST_UNSUPPORTED_DESTINATION",
  CONSENT_OR_CONTACT_INELIGIBLE: "communication.failure.CONSENT_OR_CONTACT_INELIGIBLE",
  RECIPIENT_NOT_SUPPORTED: "communication.failure.RECIPIENT_NOT_SUPPORTED",
  CONTACT_NOT_IN_SCHOOL: "communication.failure.CONTACT_NOT_IN_SCHOOL",
  DESTINATION_MISSING: "communication.failure.DESTINATION_MISSING",
  CLAIM_EXPIRED: "communication.failure.CLAIM_EXPIRED",
  JOB_PAUSED: "communication.failure.JOB_PAUSED",
  INELIGIBLE: "communication.failure.INELIGIBLE",
} as const;

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
function requestId() {
  return crypto.randomUUID();
}
function formatDate(value: string | null) {
  return value ? formatPreferredDate(value, { dateStyle: "medium", timeStyle: "short" }) : "—";
}
function audiencesLabel(targets: Target[]) {
  return [...new Set(targets.flatMap((target) => target.audiences))].join(", ");
}
function targetsFromDetail(detail: AnnouncementDetail): Target[] {
  const grouped = new Map<string, Target>();
  for (const target of detail.targets ?? []) {
    const key = `${target.scope}:${target.classroom_id ?? "school"}`;
    const existing = grouped.get(key) ?? {
      scope: target.scope,
      classroomId: target.classroom_id,
      audiences: [],
    };
    if (!existing.audiences.includes(target.audience)) existing.audiences.push(target.audience);
    grouped.set(key, existing);
  }
  return [...grouped.values()];
}

function ErrorState({ message }: { message: string }) {
  const { locale } = useAppPreferences();
  return (
    <Alert variant="destructive">
      <AlertTitle>{translateUiText("Communication Center unavailable", locale)}</AlertTitle>
      <AlertDescription>{translateUiText(message, locale)}</AlertDescription>
    </Alert>
  );
}

function AudienceSelector({
  audience,
  onToggle,
}: {
  audience: Audience[];
  onToggle: (value: Audience) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(["staff", "student", "guardian"] as Audience[]).map((item) => (
        <Button
          key={item}
          type="button"
          size="sm"
          variant={audience.includes(item) ? "default" : "outline"}
          onClick={() => onToggle(item)}
        >
          {item === "staff" ? "Staff" : item === "student" ? "Students" : "Guardians"}
        </Button>
      ))}
    </div>
  );
}

function AnnouncementEditor({
  initial,
  onDone,
}: {
  initial?: AnnouncementDetail;
  onDone: (id: string) => void;
}) {
  const { activeSchool, activeAcademicYear } = useAppContext();
  const { locale, t } = useAppPreferences();
  const create = useServerFn(createCommunicationAnnouncement);
  const update = useServerFn(updateCommunicationAnnouncement);
  const classroomFetch = useServerFn(listClassrooms);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [scope, setScope] = useState<"school" | "classroom">(
    initial?.targets?.some((x) => x.scope === "classroom") ? "classroom" : "school",
  );
  const initialTargets = initial ? targetsFromDetail(initial) : [];
  const [classroomIds, setClassroomIds] = useState<string[]>(
    initialTargets.map((x) => x.classroomId).filter((x): x is string => Boolean(x)),
  );
  const [audience, setAudience] = useState<Audience[]>([
    ...(initialTargets[0]?.audiences ?? ["staff", "student", "guardian"]),
  ]);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const classrooms = useQuery({
    queryKey: ["communication-classrooms", activeSchool?.id, activeAcademicYear?.id],
    queryFn: () =>
      classroomFetch({
        data: { schoolId: activeSchool!.id, academicYearId: activeAcademicYear?.id },
      }),
    enabled: Boolean(activeSchool?.id),
  });
  const mutation = useMutation({
    mutationFn: (logicalRequestId: string) => {
      const targets: Target[] =
        scope === "school"
          ? [{ scope: "school", classroomId: null, audiences: audience }]
          : classroomIds.map((classroomId) => ({
              scope: "classroom",
              classroomId,
              audiences: audience,
            }));
      if (!activeSchool?.id || audience.length === 0 || targets.length === 0)
        throw new Error("Choose a classroom and at least one audience.");
      const data = { requestId: logicalRequestId, schoolId: activeSchool.id, title, body, targets };
      return initial
        ? update({
            data: { ...data, announcementId: initial.id, expectedVersion: initial.version },
          })
        : create({ data });
    },
    onSuccess: (result) => {
      const value = result as { announcement_id?: string };
      toast.success(translateUiText(initial ? "Draft updated." : "Draft created.", locale));
      setPendingRequestId(null);
      if (value.announcement_id) onDone(value.announcement_id);
    },
    onError: () => {
      setPendingRequestId(null);
      toast.error(
        translateUiText("The announcement could not be saved. Please try again.", locale),
      );
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const logicalId = pendingRequestId ?? requestId();
    setPendingRequestId(logicalId);
    mutation.mutate(logicalId);
  };
  const canSubmit = Boolean(
    title.trim() && body.trim() && audience.length && (scope === "school" || classroomIds.length),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{initial ? "Edit announcement draft" : "Create announcement"}</CardTitle>
        <CardDescription>
          Plain-text announcements are delivered through the authenticated in-app inbox.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="announcement-title">Title</Label>
            <Input
              id="announcement-title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="School announcement title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="announcement-body">Message</Label>
            <Textarea
              id="announcement-body"
              value={body}
              maxLength={10000}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write a clear message for the selected audience."
              rows={8}
            />
          </div>
          <div className="space-y-2">
            <Label>Target scope</Label>
            <Select
              value={scope}
              onValueChange={(value: "school" | "classroom") => setScope(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="school">Entire school</SelectItem>
                <SelectItem value="classroom">Selected classrooms</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === "classroom" && (
            <div className="space-y-2">
              <Label>Classrooms</Label>
              {classrooms.isPending ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(classrooms.data ?? [])
                    .filter((classroom) => classroom.status === "active")
                    .map((classroom) => (
                      <Button
                        key={classroom.id}
                        type="button"
                        variant={classroomIds.includes(classroom.id) ? "default" : "outline"}
                        className="justify-start"
                        onClick={() =>
                          setClassroomIds((current) =>
                            current.includes(classroom.id)
                              ? current.filter((id) => id !== classroom.id)
                              : [...current, classroom.id],
                          )
                        }
                      >
                        {classroom.code} — {classroom.name}
                      </Button>
                    ))}
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Audience</Label>
            <AudienceSelector
              audience={audience}
              onToggle={(value) =>
                setAudience((current) =>
                  current.includes(value)
                    ? current.filter((item) => item !== value)
                    : [...current, value],
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Recipients are resolved from active school relationships at publish time and
              deduplicated by profile.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/communications">{t("common.cancel")}</Link>
            </Button>
            <Button type="submit" disabled={!canSubmit || mutation.isPending}>
              {mutation.isPending ? t("common.saving") : t("communication.saveDraft")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function CommunicationListPage() {
  const { activeSchool, hasPermission } = useAppContext();
  const { t } = useAppPreferences();
  const fetch = useServerFn(listCommunicationAnnouncements);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["communications", activeSchool?.id, page],
    queryFn: () =>
      fetch({
        data: { schoolId: activeSchool!.id, pageSize: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
      }),
    enabled: Boolean(activeSchool?.id && hasPermission("notification.send")),
  });
  if (!hasPermission("notification.send"))
    return (
      <AppShell>
        <ErrorState message="Communication Center is available to authorized school staff only." />
      </AppShell>
    );
  const data = rows<AnnouncementRow>(query.data);
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("communication.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("communication.description")}</p>
          </div>
          <Button asChild>
            <Link to="/communications/new">
              <Megaphone className="mr-2 h-4 w-4" />
              {t("communication.new")}
            </Link>
          </Button>
        </div>
        {query.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : query.error ? (
          <ErrorState message="Please reload and try again." />
        ) : data.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <BellRing className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">{t("communication.empty")}</p>
              <p className="text-sm text-muted-foreground">{t("communication.emptyDescription")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">{item.title}</h2>
                      <Badge variant={item.status === "published" ? "default" : "secondary"}>
                        {t(
                          item.status === "published"
                            ? "common.status.published"
                            : "common.status.draft",
                        )}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("communication.meta", {
                        targets: String(item.target_count),
                        recipients: String(item.recipient_count),
                        date: formatDate(item.created_at),
                      })}
                    </p>
                  </div>
                  <Button variant="outline" asChild>
                    <Link to="/communications/$announcementId" params={{ announcementId: item.id }}>
                      {t("communication.open")}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <div className="flex justify-between">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            {t("common.previous")}
          </Button>
          <Button
            variant="outline"
            disabled={data.length < PAGE_SIZE}
            onClick={() => setPage((current) => current + 1)}
          >
            {t("common.next")}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

export function CommunicationNewPage() {
  const navigate = useNavigate();
  const { t } = useAppPreferences();
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link className="text-sm text-muted-foreground hover:text-foreground" to="/communications">
          ← {t("communication.back")}
        </Link>
        <AnnouncementEditor
          onDone={(id) =>
            void navigate({ to: "/communications/$announcementId", params: { announcementId: id } })
          }
        />
      </div>
    </AppShell>
  );
}

function ExternalDeliveryPanel({ announcementId }: { announcementId: string }) {
  const { activeSchool, hasPermission } = useAppContext();
  const { t } = useAppPreferences();
  const queryClient = useQueryClient();
  const fetch = useServerFn(listExternalCommunicationDeliveries);
  const enqueue = useServerFn(enqueueExternalCommunicationDelivery);
  const runCycle = useServerFn(runExternalCommunicationDeliveryCycle);
  const setPaused = useServerFn(setExternalCommunicationDeliveryPaused);
  const requestRetry = useServerFn(retryExternalCommunicationDelivery);
  const recordPreference = useServerFn(recordExternalContactPreference);
  const [consentEvidence, setConsentEvidence] = useState<Record<string, string>>({});
  const allowed = hasPermission("communication.delivery.manage");
  const query = useQuery({
    queryKey: ["communication-deliveries", activeSchool?.id, announcementId],
    queryFn: () => fetch({ data: { schoolId: activeSchool!.id, announcementId } }),
    enabled: Boolean(allowed && activeSchool?.id && announcementId),
  });
  const mutation = useMutation({
    mutationFn: (channel: "whatsapp" | "email") =>
      enqueue({ data: { schoolId: activeSchool!.id, announcementId, channel } }),
    onSuccess: (result) => {
      const value = result as { already_queued?: boolean };
      toast.success(
        t(
          value.already_queued
            ? "communication.deliveryAlreadyQueued"
            : "communication.deliveryQueued",
        ),
      );
      void queryClient.invalidateQueries({ queryKey: ["communication-deliveries"] });
    },
    onError: () => toast.error(t("communication.deliveryQueueFailed")),
  });
  const cycleMutation = useMutation({
    mutationFn: () => runCycle({ data: { schoolId: activeSchool!.id, limit: 10 } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["communication-deliveries"] }),
    onError: () => toast.error(t("communication.operationFailed")),
  });
  const jobMutation = useMutation({
    mutationFn: (job: DeliveryJob) =>
      setPaused({
        data: { schoolId: activeSchool!.id, jobId: job.id, paused: job.status !== "paused" },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["communication-deliveries"] }),
    onError: () => toast.error(t("communication.operationFailed")),
  });
  const retryMutation = useMutation({
    mutationFn: (recipientId: string) =>
      requestRetry({ data: { schoolId: activeSchool!.id, recipientId, requestId: requestId() } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["communication-deliveries"] }),
    onError: () => toast.error(t("communication.operationFailed")),
  });
  const preferenceMutation = useMutation({
    mutationFn: (input: {
      recipientProfileId: string;
      channel: "email" | "whatsapp";
      consentState: "granted" | "revoked";
      sourceReference: string;
    }) =>
      recordPreference({
        data: {
          schoolId: activeSchool!.id,
          ...input,
          contactState: "verified_by_school",
          source: "school_recorded",
        },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["communication-deliveries"] }),
    onError: () => toast.error(t("communication.operationFailed")),
  });

  if (!allowed) return null;
  const jobs = rows<DeliveryJob>(query.data);
  const channels = new Set(jobs.map((job) => job.channel));
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold leading-none tracking-tight">
          {t("communication.deliveryTitle")}
        </h2>
        <CardDescription>{t("communication.deliveryDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("communication.deliveryNotSent")}</p>
        <Button
          type="button"
          variant="outline"
          disabled={cycleMutation.isPending}
          onClick={() => cycleMutation.mutate()}
        >
          {cycleMutation.isPending
            ? t("communication.workerRunning")
            : t("communication.runWorker")}
        </Button>
        {query.isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : query.error ? (
          <ErrorState message="Delivery status could not be loaded. Please try again." />
        ) : jobs.length > 0 ? (
          <ul className="space-y-2" aria-label={t("communication.deliveryTitle")}>
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {job.channel === "whatsapp" ? "WhatsApp" : "Email"}
                  </span>
                  <Badge variant="secondary">{t(deliveryStatusMessage[job.status])}</Badge>
                </div>
                <span className="text-muted-foreground">
                  {t("communication.deliveryRecipients")}: {job.recipient_count} ·{" "}
                  {t("communication.deliveryPending")}: {job.pending_count} ·{" "}
                  {t("communication.processing")}: {job.processing_count} ·{" "}
                  {t("communication.deliverySent")}: {job.accepted_count} ·{" "}
                  {t("communication.retryable")}: {job.retryable_count} ·{" "}
                  {t("communication.deliveryFailed")}: {job.permanent_failure_count} ·{" "}
                  {t("communication.deliverySkipped")}: {job.skipped_count}
                </span>
                <div className="flex flex-wrap gap-2">
                  {job.status === "paused" || ["queued", "processing"].includes(job.status) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={jobMutation.isPending}
                      onClick={() => jobMutation.mutate(job)}
                    >
                      {job.status === "paused"
                        ? t("communication.resume")
                        : t("communication.pause")}
                    </Button>
                  ) : null}
                </div>
                {job.recipients?.map((recipient) => (
                  <div
                    key={recipient.id}
                    className="w-full border-t pt-2 text-xs"
                    aria-label={t("communication.recipientStatus")}
                  >
                    <span>
                      {recipient.masked_destination ?? t("communication.destinationUnavailable")}
                    </span>
                    {" · "}
                    <span>
                      {t(
                        eligibilityMessage[
                          recipient.eligibility as keyof typeof eligibilityMessage
                        ] ?? "communication.eligibility.contact_unverified",
                      )}
                    </span>
                    {" · "}
                    <span>
                      {recipient.failure_code
                        ? t(
                            failureMessage[recipient.failure_code as keyof typeof failureMessage] ??
                              "communication.failure.INELIGIBLE",
                          )
                        : t(
                            recipientStatusMessage[
                              recipient.status as keyof typeof recipientStatusMessage
                            ] ?? "communication.recipientStatus.pending",
                          )}
                    </span>
                    {recipient.retryable ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={retryMutation.isPending}
                        onClick={() => retryMutation.mutate(recipient.id)}
                      >
                        {t("communication.retry")}
                      </Button>
                    ) : null}
                    {recipient.eligibility !== "not_supported" ? (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <div className="min-w-48">
                          <Label htmlFor={`consent-evidence-${recipient.id}`}>
                            {t("communication.consentEvidence")}
                          </Label>
                          <Input
                            id={`consent-evidence-${recipient.id}`}
                            value={consentEvidence[recipient.id] ?? ""}
                            onChange={(event) =>
                              setConsentEvidence((current) => ({
                                ...current,
                                [recipient.id]: event.target.value,
                              }))
                            }
                            maxLength={120}
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            preferenceMutation.isPending ||
                            !(consentEvidence[recipient.id] ?? "").trim()
                          }
                          onClick={() =>
                            preferenceMutation.mutate({
                              recipientProfileId: recipient.recipient_profile_id,
                              channel: job.channel,
                              consentState: "granted",
                              sourceReference: consentEvidence[recipient.id]!.trim(),
                            })
                          }
                        >
                          {t("communication.recordConsent")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={preferenceMutation.isPending}
                          onClick={() =>
                            preferenceMutation.mutate({
                              recipientProfileId: recipient.recipient_profile_id,
                              channel: job.channel,
                              consentState: "revoked",
                              sourceReference:
                                (consentEvidence[recipient.id] ?? "").trim() ||
                                "Guardian opt-out reported",
                            })
                          }
                        >
                          {t("communication.recordOptOut")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending || channels.has("whatsapp")}
            onClick={() => mutation.mutate("whatsapp")}
          >
            {mutation.isPending && mutation.variables === "whatsapp"
              ? t("communication.deliveryQueueing")
              : channels.has("whatsapp")
                ? t("communication.deliveryAlreadyQueued")
                : t("communication.deliveryWhatsapp")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending || channels.has("email")}
            onClick={() => mutation.mutate("email")}
          >
            {mutation.isPending && mutation.variables === "email"
              ? t("communication.deliveryQueueing")
              : channels.has("email")
                ? t("communication.deliveryAlreadyQueued")
                : t("communication.deliveryEmail")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CommunicationDetailPage() {
  const { announcementId } = useParams({ strict: false });
  const { activeSchool, hasPermission } = useAppContext();
  const { locale, t } = useAppPreferences();
  const fetch = useServerFn(getCommunicationAnnouncement);
  const publish = useServerFn(publishCommunicationAnnouncement);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["communication", activeSchool?.id, announcementId],
    queryFn: () => fetch({ data: { schoolId: activeSchool!.id, announcementId: announcementId! } }),
    enabled: Boolean(activeSchool?.id && announcementId),
  });
  const [editing, setEditing] = useState(false);
  const publishMutation = useMutation({
    mutationFn: (input: { version: number; requestId: string }) =>
      publish({
        data: {
          requestId: input.requestId,
          schoolId: activeSchool!.id,
          announcementId: announcementId!,
          expectedVersion: input.version,
        },
      }),
    onSuccess: () => {
      toast.success(translateUiText("Announcement published.", locale));
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ["communication"] });
      void queryClient.invalidateQueries({ queryKey: ["communications"] });
    },
    onError: () =>
      toast.error(
        translateUiText("The announcement could not be published. Please try again.", locale),
      ),
  });
  if (query.isPending)
    return (
      <AppShell>
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  if (query.error || !query.data)
    return (
      <AppShell>
        <ErrorState message="This announcement is unavailable or you do not have access." />
      </AppShell>
    );
  const detail = query.data as AnnouncementDetail;
  if (editing && detail.status === "draft")
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl space-y-6">
          <Link
            className="text-sm text-muted-foreground"
            to="/communications/$announcementId"
            params={{ announcementId: detail.id }}
          >
            {t("communication.cancelEditing")}
          </Link>
          <AnnouncementEditor
            initial={detail}
            onDone={() => {
              setEditing(false);
              void queryClient.invalidateQueries({ queryKey: ["communication"] });
            }}
          />
        </div>
      </AppShell>
    );
  const staff = hasPermission("notification.send");
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link className="text-sm text-muted-foreground hover:text-foreground" to="/communications">
          ← {t("communication.back")}
        </Link>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{detail.title}</CardTitle>
                <CardDescription>
                  {detail.status === "published"
                    ? t("communication.publishedOn", { date: formatDate(detail.published_at) })
                    : t("communication.draftVersion", { version: String(detail.version) })}
                </CardDescription>
              </div>
              <Badge variant={detail.status === "published" ? "default" : "secondary"}>
                {t(
                  detail.status === "published" ? "common.status.published" : "common.status.draft",
                )}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="whitespace-pre-wrap text-sm leading-6">{detail.body}</p>
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <p>
                <strong>{t("communication.audience")}</strong> {detail.target_count}{" "}
                {t("communication.targetEntries")}
              </p>
              <p>
                <strong>{t("communication.resolvedRecipients")}</strong> {detail.recipient_count}
              </p>
              {detail.readable_recipient && (
                <p className="mt-2 text-muted-foreground">{t("communication.delivered")}</p>
              )}
            </div>
            {staff && detail.status === "draft" && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <FileEdit className="mr-2 h-4 w-4" />
                  {t("communication.editDraft")}
                </Button>
                <Button
                  onClick={() =>
                    publishMutation.mutate({ version: detail.version, requestId: requestId() })
                  }
                  disabled={publishMutation.isPending}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {publishMutation.isPending
                    ? t("communication.publishing")
                    : t("communication.publish")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        {detail.status === "published" && <ExternalDeliveryPanel announcementId={detail.id} />}
      </div>
    </AppShell>
  );
}
