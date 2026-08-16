import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import type { z } from "zod";
import { AcademicPage, Field, FormDialog, QueryState } from "@/components/academic/academic-ui";
import { PermissionGate, useAppContext } from "@/lib/app-context";
import { listCalendarEvents, saveCalendarEvent, type CalendarEventRow } from "@/lib/academic.functions";
import { CALENDAR_EVENT_TYPES, calendarEventInput, firstZodMessage } from "@/lib/academic.schemas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/academic/calendar")({
  head: () => ({
    meta: [
      { title: "Academic Calendar — EduSmart SchoolOS" },
      { name: "description", content: "Record holidays, exam weeks and events for the active academic year." },
      { property: "og:title", content: "Academic Calendar — EduSmart SchoolOS" },
      { property: "og:description", content: "Calendar events for the active academic year." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CalendarPage,
});

const NO_TERM = "__none__";

type FormState = {
  id?: string;
  termId: string;
  title: string;
  eventType: string;
  startsOn: string;
  endsOn: string;
  affectsInstruction: boolean;
};

const EMPTY: FormState = {
  termId: NO_TERM,
  title: "",
  eventType: CALENDAR_EVENT_TYPES[0] ?? "holiday",
  startsOn: "",
  endsOn: "",
  affectsInstruction: true,
};

function CalendarPage() {
  const { activeSchool, activeAcademicYear, terms } = useAppContext();
  const schoolId = activeSchool?.id ?? null;
  const yearId = activeAcademicYear?.id ?? null;
  const queryClient = useQueryClient();
  const fetchRows = useServerFn(listCalendarEvents);
  const persist = useServerFn(saveCalendarEvent);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["academic", "calendar", schoolId, yearId],
    queryFn: () => fetchRows({ data: { schoolId: schoolId!, academicYearId: yearId } }),
    enabled: Boolean(schoolId && yearId),
  });

  const mutation = useMutation({
    mutationFn: (values: unknown) => persist({ data: values as never }),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["academic", "calendar", schoolId, yearId] });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : String(error)),
  });

  function openEdit(row: CalendarEventRow) {
    setForm({
      id: row.id,
      termId: row.termId ?? NO_TERM,
      title: row.title,
      eventType: row.eventType,
      startsOn: row.startsOn ?? "",
      endsOn: row.endsOn ?? "",
      affectsInstruction: row.affectsInstruction,
    });
    setFormError(null);
    setOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schoolId || !yearId) return;
    setFormError(null);
    const parsed = calendarEventInput.safeParse({
      ...form,
      schoolId,
      academicYearId: yearId,
      termId: form.termId === NO_TERM ? null : form.termId,
      endsOn: form.endsOn === "" ? null : form.endsOn,
    });
    if (!parsed.success) {
      setFormError(firstZodMessage(parsed.error as z.ZodError));
      return;
    }
    mutation.mutate(parsed.data);
  }

  const rows = query.data ?? [];
  const termLabel = (id: string | null) => terms.find((t) => t.id === id)?.name ?? "Whole year";

  if (!yearId) {
    return (
      <AcademicPage
        title="Academic Calendar"
        description="Holidays, exam weeks and events that shape whether instruction happens."
        readPermission="schedule.read"
      >
        <Alert>
          <AlertDescription>
            Select an academic year in the top bar to view and manage its calendar.
          </AlertDescription>
        </Alert>
      </AcademicPage>
    );
  }

  return (
    <AcademicPage
      title="Academic Calendar"
      description={`Events for ${activeAcademicYear?.name ?? "the active academic year"}. Events flagged as affecting instruction pause normal attendance sessions.`}
      readPermission="schedule.read"
      actions={
        <PermissionGate anyOf={["schedule.create", "schedule.update"]}>
          <Button
            onClick={() => {
              setForm(EMPTY);
              setFormError(null);
              setOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New event
          </Button>
        </PermissionGate>
      }
    >
      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        isEmpty={rows.length === 0}
        emptyTitle="No calendar events yet"
        emptyDescription="Record holidays, exam weeks and school events so scheduling and attendance stay realistic."
        onRetry={() => void query.refetch()}
        columns={5}
      >
        <div className="overflow-x-auto rounded-md border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Instruction</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell className="capitalize">{row.eventType.replace(/_/g, " ")}</TableCell>
                  <TableCell>{termLabel(row.termId)}</TableCell>
                  <TableCell>
                    {row.startsOn ?? "—"}
                    {row.endsOn && row.endsOn !== row.startsOn ? ` → ${row.endsOn}` : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.affectsInstruction ? "destructive" : "secondary"}>
                      {row.affectsInstruction ? "affected" : "normal"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <PermissionGate permission="schedule.update">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                    </PermissionGate>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </QueryState>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={form.id ? "Edit calendar event" : "New calendar event"}
        description="Leave the term empty for events that span the whole academic year."
        submitting={mutation.isPending}
        error={formError}
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="ce-title">
            <Input
              id="ce-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Event type">
            <Select value={form.eventType} onValueChange={(value) => setForm({ ...form, eventType: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALENDAR_EVENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Term" hint="Optional">
            <Select value={form.termId} onValueChange={(value) => setForm({ ...form, termId: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TERM}>Whole year</SelectItem>
                {terms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Affects instruction">
            <div className="flex h-9 items-center">
              <Switch
                checked={form.affectsInstruction}
                onCheckedChange={(checked) => setForm({ ...form, affectsInstruction: checked })}
              />
            </div>
          </Field>
          <Field label="Starts on" htmlFor="ce-start">
            <Input
              id="ce-start"
              type="date"
              value={form.startsOn}
              onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
            />
          </Field>
          <Field label="Ends on" htmlFor="ce-end" hint="Optional for single-day events">
            <Input
              id="ce-end"
              type="date"
              value={form.endsOn}
              onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
            />
          </Field>
        </div>
      </FormDialog>
    </AcademicPage>
  );
}
