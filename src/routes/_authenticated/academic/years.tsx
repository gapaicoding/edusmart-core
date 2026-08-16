import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { z } from "zod";
import { AcademicPage, Field, FormDialog, QueryState, StatusBadge } from "@/components/academic/academic-ui";
import { PermissionGate, useAppContext } from "@/lib/app-context";
import { listAcademicYears, saveAcademicYear, type AcademicYearRow } from "@/lib/academic.functions";
import { ACADEMIC_YEAR_STATUSES, academicYearInput, firstZodMessage } from "@/lib/academic.schemas";
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

export const Route = createFileRoute("/_authenticated/academic/years")({
  head: () => ({
    meta: [
      { title: "Academic Years — EduSmart SchoolOS" },
      { name: "description", content: "Create and manage academic years for the active school." },
      { property: "og:title", content: "Academic Years — EduSmart SchoolOS" },
      { property: "og:description", content: "Academic year setup for the active school." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AcademicYearsPage,
});

type FormState = {
  id?: string;
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: string;
  isCurrent: boolean;
};

const EMPTY: FormState = {
  code: "",
  name: "",
  startsOn: "",
  endsOn: "",
  status: "draft",
  isCurrent: false,
};

function AcademicYearsPage() {
  const { activeSchool } = useAppContext();
  const schoolId = activeSchool?.id ?? null;
  const queryClient = useQueryClient();
  const fetchYears = useServerFn(listAcademicYears);
  const persist = useServerFn(saveAcademicYear);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["academic", "years", schoolId],
    queryFn: () => fetchYears({ data: { schoolId: schoolId! } }),
    enabled: Boolean(schoolId),
  });

  const mutation = useMutation({
    mutationFn: (values: unknown) => persist({ data: values as never }),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["academic", "years", schoolId] });
      void queryClient.invalidateQueries({ queryKey: ["academic-context", schoolId] });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : String(error)),
  });

  function openCreate() {
    setForm(EMPTY);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: AcademicYearRow) {
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      status: row.status,
      isCurrent: row.isCurrent,
    });
    setFormError(null);
    setOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schoolId) return;
    setFormError(null);
    const parsed = academicYearInput.safeParse({ ...form, schoolId });
    if (!parsed.success) {
      setFormError(firstZodMessage(parsed.error as z.ZodError));
      return;
    }
    mutation.mutate(parsed.data);
  }

  const rows = query.data ?? [];

  return (
    <AcademicPage
      title="Academic Years"
      description="Each academic year belongs to one school and frames terms, classrooms and enrollment."
      readPermission="academic_year.read"
      actions={
        <PermissionGate permission="academic_year.manage">
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New academic year
          </Button>
        </PermissionGate>
      }
    >
      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        isEmpty={rows.length === 0}
        emptyTitle="No academic years yet"
        emptyDescription="Create the first academic year to unlock terms, classrooms and scheduling."
        onRetry={() => void query.refetch()}
        columns={6}
      >
        <div className="overflow-x-auto rounded-md border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Starts</TableHead>
                <TableHead>Ends</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell className="font-medium">
                    {row.name}
                    {row.isCurrent && <span className="ml-2 text-xs text-muted-foreground">· current</span>}
                  </TableCell>
                  <TableCell>{row.startsOn}</TableCell>
                  <TableCell>{row.endsOn}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <PermissionGate permission="academic_year.manage">
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
        title={form.id ? "Edit academic year" : "New academic year"}
        description="Academic years are never deleted — close or archive them instead to keep history intact."
        submitting={mutation.isPending}
        error={formError}
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" htmlFor="ay-code" hint="Unique per school, e.g. 2026-2027">
            <Input
              id="ay-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </Field>
          <Field label="Name" htmlFor="ay-name">
            <Input
              id="ay-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Starts on" htmlFor="ay-start">
            <Input
              id="ay-start"
              type="date"
              value={form.startsOn}
              onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
            />
          </Field>
          <Field label="Ends on" htmlFor="ay-end">
            <Input
              id="ay-end"
              type="date"
              value={form.endsOn}
              onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACADEMIC_YEAR_STATUSES.map((status) => (
                  <SelectItem key={status} value={status} className="capitalize">
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Current year" hint="Marks the default year for this school.">
            <div className="flex h-9 items-center">
              <Switch
                checked={form.isCurrent}
                onCheckedChange={(checked) => setForm({ ...form, isCurrent: checked })}
              />
            </div>
          </Field>
        </div>
      </FormDialog>
    </AcademicPage>
  );
}
