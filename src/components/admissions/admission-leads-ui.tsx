import { cloneElement, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/lib/app-context";
import { useAppPreferences } from "@/lib/app-preferences";
import { supabase } from "@/integrations/supabase/client";
import { getPublicAdmissionCycle } from "@/lib/admissions.server";
import {
  createAdmissionLead,
  commandAdmissionLead,
  convertAdmissionLead,
  findAdmissionLeadDuplicates,
  getAdmissionLead,
  listAdmissionLeadAssignees,
  listAdmissionLeads,
} from "@/lib/admission-leads.functions";
import { listAdmissionCycles } from "@/lib/admissions.functions";

type Lead = {
  id: string;
  prospect_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  source_other: string | null;
  contact_channel: string;
  channel_other: string | null;
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "CONVERTED" | "CLOSED";
  assigned_profile_id: string | null;
  next_action_at: string | null;
  linked_application_id: string | null;
  row_version: number;
  created_at: string;
  activities?: { event_type: string; note: string | null; occurred_at: string }[];
};
type Bundle = { items: Lead[]; counts: Record<string, number> };
const copy = {
  id: {
    title: "Pertanyaan Penerimaan",
    description: "Kelola pertanyaan calon siswa dalam antrean sekolah ini.",
    search: "Cari nama atau kontak",
    name: "Nama calon siswa",
    contact: "Nama kontak/wali",
    phone: "Telepon",
    email: "Email",
    source: "Sumber",
    channel: "Kanal kontak",
    other: "Label lainnya",
    create: "Buat pertanyaan",
    possible: "Mungkin ada pertanyaan yang sudah tercatat",
    createAnyway: "Tetap buat",
    contactAction: "Tandai sudah dihubungi",
    qualify: "Kualifikasi",
    close: "Tutup",
    note: "Catatan operasional",
    addNote: "Tambah catatan",
    convert: "Konversi ke pendaftaran formal",
    cycle: "Gelombang penerimaan",
    grade: "Tingkat tujuan",
    guardian: "Nama wali",
    relationship: "Hubungan dengan calon siswa",
    policy: "Versi kebijakan persetujuan B18",
    consent: "Saya telah mengonfirmasi persetujuan formal yang diwajibkan untuk pendaftaran B18.",
    confirmConvert: "Buat pendaftaran formal",
    conversionNotice:
      "Ini membuat pendaftaran formal berstatus diajukan. Tindakan ini tidak menerima siswa dan tidak membuat siswa atau pendaftaran kelas.",
    noRows: "Belum ada pertanyaan.",
    error: "Tindakan tidak dapat diselesaikan. Muat ulang dan coba lagi.",
    access: "Akses pengelolaan pertanyaan diperlukan untuk ruang kerja ini.",
  },
  en: {
    title: "Admissions Inquiries",
    description: "Manage prospective student inquiries in this school queue.",
    search: "Search name or contact",
    name: "Prospect name",
    contact: "Guardian/contact name",
    phone: "Phone",
    email: "Email",
    source: "Source",
    channel: "Contact channel",
    other: "Other label",
    create: "Create inquiry",
    possible: "A possible existing inquiry was found",
    createAnyway: "Create anyway",
    contactAction: "Mark contacted",
    qualify: "Qualify",
    close: "Close",
    note: "Operational note",
    addNote: "Add note",
    convert: "Convert to formal application",
    cycle: "Admission cycle",
    grade: "Target grade",
    guardian: "Guardian name",
    relationship: "Relationship to prospect",
    policy: "B18 consent policy version",
    consent: "I have confirmed the formal consent required for the B18 application.",
    confirmConvert: "Create formal application",
    conversionNotice:
      "This creates a submitted formal application. It does not accept the student or create a student or enrollment.",
    noRows: "No inquiries yet.",
    error: "The action could not be completed. Reload and try again.",
    access: "Inquiry-management access is required for this workspace.",
  },
} as const;
const sources = ["WALK_IN", "REFERRAL", "SOCIAL_MEDIA", "WEBSITE", "EVENT", "OTHER"];
const channels = ["WHATSAPP", "PHONE", "EMAIL", "IN_PERSON", "OTHER"];
const localized = (value: string, locale: "id" | "en") => {
  const terms: Record<string, string> = {
    NEW: locale === "id" ? "Baru" : "New",
    CONTACTED: locale === "id" ? "Dihubungi" : "Contacted",
    QUALIFIED: locale === "id" ? "Terkualifikasi" : "Qualified",
    CONVERTED: locale === "id" ? "Dikonversi" : "Converted",
    CLOSED: locale === "id" ? "Ditutup" : "Closed",
    WALK_IN: locale === "id" ? "Datang langsung" : "Walk-in",
    REFERRAL: locale === "id" ? "Rujukan" : "Referral",
    SOCIAL_MEDIA: locale === "id" ? "Media sosial" : "Social media",
    WEBSITE: locale === "id" ? "Situs web" : "Website",
    EVENT: locale === "id" ? "Acara" : "Event",
    OTHER: locale === "id" ? "Lainnya" : "Other",
    WHATSAPP: "WhatsApp",
    PHONE: locale === "id" ? "Telepon" : "Phone",
    EMAIL: "Email",
    IN_PERSON: locale === "id" ? "Tatap muka" : "In person",
    CREATED: locale === "id" ? "Pertanyaan dibuat" : "Inquiry created",
    UPDATED: locale === "id" ? "Data diperbarui" : "Details updated",
    STATUS_CHANGED: locale === "id" ? "Status berubah" : "Status changed",
    ASSIGNED: locale === "id" ? "Penanggung jawab ditetapkan" : "Assignee set",
    UNASSIGNED: locale === "id" ? "Dikembalikan ke antrean sekolah" : "Returned to school queue",
    NEXT_ACTION_CHANGED: locale === "id" ? "Tindak lanjut diperbarui" : "Next action updated",
    NOTE_ADDED: locale === "id" ? "Catatan ditambahkan" : "Note added",
  };
  return terms[value] ?? value;
};

export function AdmissionLeadsWorkspace() {
  const { activeSchool, hasPermission } = useAppContext();
  const { locale } = useAppPreferences();
  const t = copy[locale];
  const queryClient = useQueryClient();
  const listFn = useServerFn(listAdmissionLeads);
  const createFn = useServerFn(createAdmissionLead);
  const commandFn = useServerFn(commandAdmissionLead);
  const duplicateFn = useServerFn(findAdmissionLeadDuplicates);
  const convertFn = useServerFn(convertAdmissionLead);
  const detailFn = useServerFn(getAdmissionLead);
  const assigneesFn = useServerFn(listAdmissionLeadAssignees);
  const cyclesFn = useServerFn(listAdmissionCycles);
  const schoolId = activeSchool?.id;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [form, setForm] = useState({
    prospect_name: "",
    contact_name: "",
    phone: "",
    email: "",
    source: "WEBSITE",
    source_other: "",
    contact_channel: "PHONE",
    channel_other: "",
  });
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    prospect_name: "",
    contact_name: "",
    phone: "",
    email: "",
    source: "WEBSITE",
    source_other: "",
    contact_channel: "PHONE",
    channel_other: "",
  });
  const [nextActionDraft, setNextActionDraft] = useState("");
  const [conversion, setConversion] = useState({
    admission_cycle_id: "",
    target_grade_level_id: "",
    guardian_name: "",
    guardian_relationship: "Parent/Guardian",
    policy_version: "v1",
    consent_confirmed: false,
  });
  const queryKey = [
    "b28-leads",
    schoolId,
    search,
    statusFilter,
    sourceFilter,
    channelFilter,
    assigneeFilter,
    actionFilter,
  ];
  const query = useQuery({
    queryKey,
    queryFn: async () =>
      (await listFn({
        data: {
          schoolId: schoolId!,
          search: search || undefined,
          status: (statusFilter || undefined) as never,
          source: (sourceFilter || undefined) as never,
          channel: (channelFilter || undefined) as never,
          assigneeId: assigneeFilter && assigneeFilter !== "QUEUE" ? assigneeFilter : undefined,
          unassigned: assigneeFilter === "QUEUE",
          actionFilter: (actionFilter || undefined) as never,
        },
      })) as unknown as Bundle,
    enabled: Boolean(schoolId && hasPermission("admission.lead.read")),
  });
  const cycles = useQuery({
    queryKey: ["b28-lead-cycles", schoolId],
    queryFn: async () =>
      (await cyclesFn({ data: { schoolId } })) as unknown as {
        id: string;
        name: string;
        status: string;
      }[],
    enabled: Boolean(schoolId && hasPermission("admission.lead.convert")),
  });
  const assignees = useQuery({
    queryKey: ["b28-lead-assignees", schoolId],
    queryFn: async () =>
      (await assigneesFn({ data: { schoolId: schoolId! } })) as unknown as {
        profile_id: string;
        full_name: string;
      }[],
    enabled: Boolean(schoolId && hasPermission("admission.lead.manage")),
  });
  const detail = useQuery({
    queryKey: ["b28-lead-detail", selected?.id],
    queryFn: async () => (await detailFn({ data: { leadId: selected!.id } })) as unknown as Lead,
    enabled: Boolean(selected?.id),
  });
  const grades = useQuery({
    queryKey: ["b28-lead-cycle-grades", conversion.admission_cycle_id],
    queryFn: async () => {
      const result = await getPublicAdmissionCycle(supabase, conversion.admission_cycle_id);
      return (result as unknown as { grades?: { id: string; name: string }[] }[])[0]?.grades ?? [];
    },
    enabled: Boolean(conversion.admission_cycle_id),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["b28-leads", schoolId] });
    void queryClient.invalidateQueries({ queryKey: ["b28-lead-detail", selected?.id] });
  };
  const create = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("school context missing");
      if (!duplicateCount) {
        const dupes = await duplicateFn({
          data: { schoolId, phone: form.phone || undefined, email: form.email || undefined },
        });
        const matches = Array.isArray(dupes) ? dupes : [];
        if (matches.length) return { duplicate: true as const, matches: matches.length };
      }
      return createFn({
        data: {
          schoolId,
          requestId: crypto.randomUUID(),
          payload: { ...form, admission_cycle_id: null },
        },
      });
    },
    onSuccess: (result) => {
      const outcome = result as { duplicate?: boolean; matches?: number };
      if (outcome.duplicate) {
        setDuplicateCount(outcome.matches ?? 1);
        return;
      }
      setForm({
        prospect_name: "",
        contact_name: "",
        phone: "",
        email: "",
        source: "WEBSITE",
        source_other: "",
        contact_channel: "PHONE",
        channel_other: "",
      });
      setDuplicateCount(0);
      void refresh();
    },
  });
  const action = useMutation({
    mutationFn: (input: { lead: Lead; command: string; payload?: Record<string, unknown> }) =>
      commandFn({
        data: {
          leadId: input.lead.id,
          expectedRowVersion: input.lead.row_version,
          requestId: crypto.randomUUID(),
          command: input.command as
            "update" | "contact" | "qualify" | "close" | "assign" | "next_action" | "note",
          payload: input.payload ?? {},
        },
      }),
    onSuccess: (result, input) => {
      const updated = result as { lead_id?: string; status?: Lead["status"]; row_version?: number };
      const nextStatus =
        updated.status ??
        (input.command === "contact"
          ? "CONTACTED"
          : input.command === "qualify"
            ? "QUALIFIED"
            : input.command === "close"
              ? "CLOSED"
              : undefined);
      setSelected((current) =>
        current && current.id === input.lead.id
          ? {
              ...current,
              status: nextStatus ?? current.status,
              row_version: updated.row_version ?? current.row_version + 1,
            }
          : current,
      );
      setNote("");
      void refresh();
    },
  });
  const convert = useMutation({
    mutationFn: () =>
      convertFn({
        data: {
          leadId: selected!.id,
          expectedRowVersion: selected!.row_version,
          requestId: crypto.randomUUID(),
          application: { ...conversion, consent_confirmed: true },
        },
      }),
    onSuccess: () => {
      setSelected(null);
      void refresh();
    },
  });
  const rows = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const picked = useMemo(() => {
    const base = detail.data ?? rows.find((item) => item.id === selected?.id) ?? selected;
    if (!base || !selected || selected.id !== base.id || selected.row_version <= base.row_version)
      return base;
    return { ...base, row_version: selected.row_version, status: selected.status };
  }, [detail.data, rows, selected]);
  const denied = !hasPermission("admission.lead.read");
  const beginEdit = (lead: Lead) => {
    setEditForm({
      prospect_name: lead.prospect_name,
      contact_name: lead.contact_name ?? "",
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      source: lead.source,
      source_other: lead.source_other ?? "",
      contact_channel: lead.contact_channel,
      channel_other: lead.channel_other ?? "",
    });
    setEditing(true);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-5">
        <header>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-muted-foreground">
            {activeSchool?.name}: {t.description}
          </p>
        </header>
        {denied ? (
          <Alert>
            <AlertDescription>{t.access}</AlertDescription>
          </Alert>
        ) : (
          <>
            <section
              aria-label={
                locale === "id" ? "Ringkasan alur pertanyaan" : "Inquiry pipeline summary"
              }
              className="grid grid-cols-2 gap-2 sm:grid-cols-5"
            >
              {["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "CLOSED"].map((status) => (
                <Card key={status}>
                  <CardContent className="p-3">
                    <p className="text-sm text-muted-foreground">{localized(status, locale)}</p>
                    <p className="text-xl font-semibold">{query.data?.counts?.[status] ?? 0}</p>
                  </CardContent>
                </Card>
              ))}
            </section>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
              <section className="space-y-3">
                <Label htmlFor="lead-search">{t.search}</Label>
                <Input
                  id="lead-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  maxLength={100}
                />
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <select
                    aria-label={locale === "id" ? "Filter status" : "Filter status"}
                    className="h-10 rounded-md border bg-background px-3"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">{locale === "id" ? "Semua status" : "All statuses"}</option>
                    {["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "CLOSED"].map((s) => (
                      <option key={s} value={s}>
                        {localized(s, locale)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={t.source}
                    className="h-10 rounded-md border bg-background px-3"
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                  >
                    <option value="">{locale === "id" ? "Semua sumber" : "All sources"}</option>
                    {sources.map((s) => (
                      <option key={s} value={s}>
                        {localized(s, locale)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={t.channel}
                    className="h-10 rounded-md border bg-background px-3"
                    value={channelFilter}
                    onChange={(e) => setChannelFilter(e.target.value)}
                  >
                    <option value="">{locale === "id" ? "Semua kanal" : "All channels"}</option>
                    {channels.map((c) => (
                      <option key={c} value={c}>
                        {localized(c, locale)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={locale === "id" ? "Penanggung jawab" : "Assignee"}
                    className="h-10 rounded-md border bg-background px-3"
                    value={assigneeFilter}
                    onChange={(e) => setAssigneeFilter(e.target.value)}
                  >
                    <option value="">
                      {locale === "id" ? "Semua penanggung jawab" : "All assignees"}
                    </option>
                    <option value="QUEUE">
                      {locale === "id" ? "Antrean sekolah" : "School queue"}
                    </option>
                    {(assignees.data ?? []).map((person) => (
                      <option key={person.profile_id} value={person.profile_id}>
                        {person.full_name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={locale === "id" ? "Jadwal tindak lanjut" : "Next action"}
                    className="h-10 rounded-md border bg-background px-3"
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                  >
                    <option value="">
                      {locale === "id" ? "Semua tindak lanjut" : "All next actions"}
                    </option>
                    <option value="OVERDUE">{locale === "id" ? "Terlambat" : "Overdue"}</option>
                    <option value="UPCOMING">
                      {locale === "id" ? "7 hari ke depan" : "Next 7 days"}
                    </option>
                  </select>
                </div>
                <div className="grid gap-2">
                  {rows.length ? (
                    rows.map((lead) => (
                      <button
                        type="button"
                        key={lead.id}
                        onClick={() => setSelected(lead)}
                        className="w-full rounded-lg border bg-card p-4 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{lead.prospect_name}</strong>
                          <Badge variant="outline">{localized(lead.status, locale)}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {lead.contact_name ?? "—"} · {localized(lead.source, locale)}
                        </p>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-lg border p-4 text-muted-foreground">{t.noRows}</p>
                  )}
                </div>
              </section>
              <section className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{t.create}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Field label={t.name}>
                      <Input
                        value={form.prospect_name}
                        onChange={(e) => setForm({ ...form, prospect_name: e.target.value })}
                        maxLength={200}
                      />
                    </Field>
                    <Field label={t.contact}>
                      <Input
                        value={form.contact_name}
                        onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                        maxLength={200}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label={t.phone}>
                        <Input
                          type="tel"
                          value={form.phone}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                          maxLength={64}
                        />
                      </Field>
                      <Field label={t.email}>
                        <Input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          maxLength={320}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label={t.source}>
                        <select
                          className="h-10 w-full rounded-md border bg-background px-3"
                          value={form.source}
                          onChange={(e) => setForm({ ...form, source: e.target.value })}
                        >
                          {sources.map((s) => (
                            <option key={s} value={s}>
                              {localized(s, locale)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t.channel}>
                        <select
                          className="h-10 w-full rounded-md border bg-background px-3"
                          value={form.contact_channel}
                          onChange={(e) => setForm({ ...form, contact_channel: e.target.value })}
                        >
                          {channels.map((c) => (
                            <option key={c} value={c}>
                              {localized(c, locale)}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    {form.source === "OTHER" && (
                      <Field
                        label={locale === "id" ? "Label sumber lainnya" : "Other source label"}
                      >
                        <Input
                          value={form.source_other}
                          onChange={(e) => setForm({ ...form, source_other: e.target.value })}
                          maxLength={80}
                        />
                      </Field>
                    )}
                    {form.contact_channel === "OTHER" && (
                      <Field
                        label={locale === "id" ? "Label kanal lainnya" : "Other channel label"}
                      >
                        <Input
                          value={form.channel_other}
                          onChange={(e) => setForm({ ...form, channel_other: e.target.value })}
                          maxLength={80}
                        />
                      </Field>
                    )}
                    {duplicateCount > 0 && (
                      <Alert>
                        <AlertDescription>
                          {t.possible} ({duplicateCount})
                        </AlertDescription>
                      </Alert>
                    )}
                    <Button
                      disabled={
                        !hasPermission("admission.lead.manage") ||
                        create.isPending ||
                        !form.prospect_name.trim() ||
                        (!form.phone.trim() &&
                          !form.email.trim() &&
                          form.contact_channel !== "IN_PERSON")
                      }
                      onClick={() => void create.mutateAsync()}
                    >
                      {duplicateCount ? t.createAnyway : t.create}
                    </Button>
                    {create.isError && (
                      <p role="alert" className="text-sm text-destructive">
                        {t.error}
                      </p>
                    )}
                  </CardContent>
                </Card>
                {picked && (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {picked.prospect_name}{" "}
                        <Badge variant="outline">{localized(picked.status, locale)}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {picked.linked_application_id && (
                        <p className="text-sm">
                          <Link
                            className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            to="/admissions/$applicationId"
                            params={{ applicationId: picked.linked_application_id }}
                          >
                            {locale === "id"
                              ? "Buka pendaftaran formal"
                              : "Open formal application"}
                          </Link>
                        </p>
                      )}
                      {!editing && !["CLOSED", "CONVERTED"].includes(picked.status) && (
                        <Button
                          variant="outline"
                          disabled={!hasPermission("admission.lead.manage") || action.isPending}
                          onClick={() => beginEdit(picked)}
                        >
                          {locale === "id" ? "Ubah detail" : "Edit details"}
                        </Button>
                      )}
                      {editing && (
                        <div className="space-y-2 rounded-md border p-3">
                          <Field label={t.name}>
                            <Input
                              value={editForm.prospect_name}
                              onChange={(e) =>
                                setEditForm({ ...editForm, prospect_name: e.target.value })
                              }
                              maxLength={200}
                            />
                          </Field>
                          <Field label={t.contact}>
                            <Input
                              value={editForm.contact_name}
                              onChange={(e) =>
                                setEditForm({ ...editForm, contact_name: e.target.value })
                              }
                              maxLength={200}
                            />
                          </Field>
                          <div className="grid grid-cols-2 gap-2">
                            <Field label={t.phone}>
                              <Input
                                type="tel"
                                value={editForm.phone}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, phone: e.target.value })
                                }
                                maxLength={64}
                              />
                            </Field>
                            <Field label={t.email}>
                              <Input
                                type="email"
                                value={editForm.email}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, email: e.target.value })
                                }
                                maxLength={320}
                              />
                            </Field>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Field label={t.source}>
                              <select
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={editForm.source}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, source: e.target.value })
                                }
                              >
                                {sources.map((s) => (
                                  <option key={s} value={s}>
                                    {localized(s, locale)}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <Field label={t.channel}>
                              <select
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={editForm.contact_channel}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, contact_channel: e.target.value })
                                }
                              >
                                {channels.map((c) => (
                                  <option key={c} value={c}>
                                    {localized(c, locale)}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          </div>
                          {editForm.source === "OTHER" && (
                            <Field
                              label={
                                locale === "id" ? "Label sumber lainnya" : "Other source label"
                              }
                            >
                              <Input
                                value={editForm.source_other}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, source_other: e.target.value })
                                }
                                maxLength={80}
                              />
                            </Field>
                          )}
                          {editForm.contact_channel === "OTHER" && (
                            <Field
                              label={
                                locale === "id" ? "Label kanal lainnya" : "Other channel label"
                              }
                            >
                              <Input
                                value={editForm.channel_other}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, channel_other: e.target.value })
                                }
                                maxLength={80}
                              />
                            </Field>
                          )}
                          <Button
                            disabled={
                              action.isPending ||
                              !editForm.prospect_name.trim() ||
                              (!editForm.phone.trim() &&
                                !editForm.email.trim() &&
                                editForm.contact_channel !== "IN_PERSON")
                            }
                            onClick={() =>
                              void action
                                .mutateAsync({ lead: picked, command: "update", payload: editForm })
                                .then(() => setEditing(false))
                            }
                          >
                            {locale === "id" ? "Simpan perubahan" : "Save changes"}
                          </Button>
                          <Button variant="ghost" onClick={() => setEditing(false)}>
                            {locale === "id" ? "Batal" : "Cancel"}
                          </Button>
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {picked.contact_name ?? "—"} · {picked.phone ?? "—"} · {picked.email ?? "—"}
                      </p>
                      <p className="text-sm">
                        {localized(picked.source, locale)} ·{" "}
                        {localized(picked.contact_channel, locale)}
                      </p>
                      <Field
                        label={
                          locale === "id" ? "Penanggung jawab (opsional)" : "Optional assignee"
                        }
                      >
                        <select
                          className="h-10 w-full rounded-md border bg-background px-3"
                          value={picked.assigned_profile_id ?? ""}
                          disabled={
                            !hasPermission("admission.lead.manage") ||
                            action.isPending ||
                            ["CLOSED", "CONVERTED"].includes(picked.status)
                          }
                          onChange={(e) =>
                            void action.mutateAsync({
                              lead: picked,
                              command: "assign",
                              payload: { assigned_profile_id: e.target.value || null },
                            })
                          }
                        >
                          <option value="">
                            {locale === "id" ? "Antrean sekolah" : "School queue"}
                          </option>
                          {(assignees.data ?? []).map((person) => (
                            <option key={person.profile_id} value={person.profile_id}>
                              {person.full_name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={locale === "id" ? "Tindak lanjut berikutnya" : "Next action"}>
                        <Input
                          type="datetime-local"
                          disabled={
                            !hasPermission("admission.lead.manage") ||
                            action.isPending ||
                            ["CLOSED", "CONVERTED"].includes(picked.status)
                          }
                          value={
                            nextActionDraft ||
                            (picked.next_action_at
                              ? new Date(picked.next_action_at).toISOString().slice(0, 16)
                              : "")
                          }
                          onChange={(e) => setNextActionDraft(e.target.value)}
                        />
                      </Field>
                      <Button
                        variant="outline"
                        disabled={
                          !hasPermission("admission.lead.manage") ||
                          action.isPending ||
                          ["CLOSED", "CONVERTED"].includes(picked.status)
                        }
                        onClick={() => {
                          void action.mutateAsync({
                            lead: picked,
                            command: "next_action",
                            payload: {
                              next_action_at: nextActionDraft
                                ? new Date(nextActionDraft).toISOString()
                                : null,
                            },
                          });
                          setNextActionDraft("");
                        }}
                      >
                        {locale === "id" ? "Simpan jadwal" : "Save schedule"}
                      </Button>
                      {picked.status === "NEW" && (
                        <Button
                          variant="outline"
                          disabled={action.isPending}
                          onClick={() =>
                            void action.mutateAsync({ lead: picked, command: "contact" })
                          }
                        >
                          {t.contactAction}
                        </Button>
                      )}
                      {picked.status === "CONTACTED" && (
                        <Button
                          variant="outline"
                          disabled={action.isPending}
                          onClick={() =>
                            void action.mutateAsync({ lead: picked, command: "qualify" })
                          }
                        >
                          {t.qualify}
                        </Button>
                      )}
                      {!["CLOSED", "CONVERTED"].includes(picked.status) && (
                        <Button
                          variant="ghost"
                          disabled={action.isPending}
                          onClick={() =>
                            void action.mutateAsync({ lead: picked, command: "close" })
                          }
                        >
                          {t.close}
                        </Button>
                      )}
                      {action.isError && (
                        <p role="alert" className="text-sm text-destructive">
                          {t.error}
                        </p>
                      )}
                      {picked.status === "QUALIFIED" && (
                        <div className="space-y-2 rounded-md border p-3">
                          <h3 className="font-medium">{t.convert}</h3>
                          <p className="text-sm text-muted-foreground">{t.conversionNotice}</p>
                          <Field label={t.cycle}>
                            <select
                              className="h-10 w-full rounded-md border bg-background px-3"
                              value={conversion.admission_cycle_id}
                              onChange={(e) =>
                                setConversion({ ...conversion, admission_cycle_id: e.target.value })
                              }
                            >
                              <option value="">—</option>
                              {(cycles.data ?? [])
                                .filter((c) => c.status === "open")
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                            </select>
                          </Field>
                          <Field label={t.grade}>
                            <select
                              className="h-10 w-full rounded-md border bg-background px-3"
                              value={conversion.target_grade_level_id}
                              onChange={(e) =>
                                setConversion({
                                  ...conversion,
                                  target_grade_level_id: e.target.value,
                                })
                              }
                            >
                              <option value="">—</option>
                              {(grades.data ?? []).map((grade) => (
                                <option key={grade.id} value={grade.id}>
                                  {grade.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label={t.guardian}>
                            <Input
                              value={conversion.guardian_name}
                              onChange={(e) =>
                                setConversion({ ...conversion, guardian_name: e.target.value })
                              }
                              maxLength={200}
                            />
                          </Field>
                          <Field label={t.relationship}>
                            <Input
                              value={conversion.guardian_relationship}
                              onChange={(e) =>
                                setConversion({
                                  ...conversion,
                                  guardian_relationship: e.target.value,
                                })
                              }
                              maxLength={80}
                            />
                          </Field>
                          <Field label={t.policy}>
                            <Input
                              value={conversion.policy_version}
                              onChange={(e) =>
                                setConversion({ ...conversion, policy_version: e.target.value })
                              }
                              maxLength={128}
                            />
                          </Field>
                          <label className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={conversion.consent_confirmed}
                              onChange={(e) =>
                                setConversion({
                                  ...conversion,
                                  consent_confirmed: e.target.checked,
                                })
                              }
                            />
                            {t.consent}
                          </label>
                          <Button
                            disabled={
                              !hasPermission("admission.lead.convert") ||
                              convert.isPending ||
                              !conversion.consent_confirmed ||
                              !conversion.admission_cycle_id ||
                              !conversion.target_grade_level_id ||
                              !conversion.guardian_name.trim()
                            }
                            onClick={() => void convert.mutateAsync()}
                          >
                            {t.confirmConvert}
                          </Button>
                          {convert.isError && (
                            <p role="alert" className="text-sm text-destructive">
                              {t.error}
                            </p>
                          )}
                        </div>
                      )}
                      <Field label={t.note}>
                        <Textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          maxLength={1000}
                        />
                      </Field>
                      <Button
                        variant="outline"
                        disabled={
                          !note.trim() ||
                          action.isPending ||
                          ["CLOSED", "CONVERTED"].includes(picked.status)
                        }
                        onClick={() =>
                          void action.mutateAsync({
                            lead: picked,
                            command: "note",
                            payload: { note },
                          })
                        }
                      >
                        {t.addNote}
                      </Button>
                      <ol
                        aria-label={locale === "id" ? "Riwayat aktivitas" : "Activity history"}
                        className="space-y-2 border-l pl-4"
                      >
                        {(picked.activities ?? []).map((activity, i) => (
                          <li key={`${activity.occurred_at}-${i}`} className="text-sm">
                            {localized(activity.event_type, locale)}
                            {activity.note ? `: ${activity.note}` : ""}
                            <time className="block text-xs text-muted-foreground">
                              {new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              }).format(new Date(activity.occurred_at))}
                            </time>
                          </li>
                        ))}
                      </ol>
                    </CardContent>
                  </Card>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useMemo(() => `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, [label]);
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children as ReactElement<{ id?: string }>, { id })}
    </div>
  );
}
