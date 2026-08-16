import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import type { z } from "zod";
import { AcademicPage, Field, FormDialog, QueryState, StatusBadge } from "@/components/academic/academic-ui";
import { PermissionGate, useAppContext } from "@/lib/app-context";
import { listTerms, saveTerm, type TermRow } from "@/lib/academic.functions";
import { TERM_STATUSES, firstZodMessage, termInput } from "@/lib/academic.schemas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/academic/terms")({
  head: () => ({
    meta: [
      { title: "Terms — EduSmart SchoolOS" },
      { name: "description", content: "Manage semesters and terms inside the active academic year." },
      { property: "og:title", content: "Terms — EduSmart SchoolOS" },
      { property: "og:description", content: "Term setup inside the active academic year." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TermsPage,
});

type FormState = {
  id?: string;
  code: string;
  name: string;
  sequence: string;
  startsOn: string;
  endsOn: string;
  status: string;
};

const EMPTY: FormState = { code: "", name: "", sequence: "1", startsOn: "", endsOn: "", status: "draft" };

function TermsPage() {
  const { activeSchool, activeAcademicYear } = useAppContext();
  const schoolId = activeSchool?.id ?? null;
  const yearId = activeAcademicYear?.id ?? null;
  const queryClient = useQueryClient();
  const fetchTerms = useServerFn(listTerms);
  const persist = useServerFn(saveTerm);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["academic", "terms", schoolId, yearId],
    queryFn: () => fetchTerms({ data: { schoolId: schoolId!, academicYearId: yearId } }),
    enabled: Boolean(schoolId && yearId),
  });

  const mutation = useMutation({
    mutationFn: (values: unknown) => persist({ data: values as never }),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["academic", "terms", schoolId, yearId] });
      void queryClient.invalidateQueries({ queryKey: ["academic-context", schoolId] });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : String(error)),
  });

  function openCreate() {
    setForm({ ...EMPTY, sequence: String((query.data?.length ?? 0) + 1) });
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: TermRow) {
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      sequence: String(row.sequence),
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      status: row.status,
    });
    setFormError(null);
    setOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schoolId || !yearId) return;
    setFormError(null);
    const parsed = termInput.safeParse({ ...form, schoolId, academicYearId: yearId });
    if (!parsed.success) {
      setFormError(firstZodMessage(parsed.error as z.ZodError));
      return;
    }
    mutation.mutate(parsed.data);
  }

  const rows = query.data ?? [];

  if (!yearId) {
    return (
      <AcademicPage
        title="Terms"
        description="Terms live inside one academic year and must stay within its date range."
        readPermission="term.read"
      >
        <Alert>
          <AlertDescription>
            Select an academic year in the top bar to view and manage its terms.
          </AlertDescription>
        </Alert>
      </AcademicPage>
    );
  }

  return (
    <AcademicPage
      title="Terms"
      description={`Terms for ${activeAcademicYear?.name ?? "the active academic year"} (${activeAcademicYear?.startsOn} → ${activeAcademicYear?.endsOn}).`}
      readPermission="term.read"
      actions={
        <PermissionGate permission="term.manage">
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New term
          </Button>
        </PermissionGate>
      }
    >
      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        isEmpty={rows.length === 0}
        emptyTitle="No terms in this academic year"
        emptyDescription="Add Semester 1 and Semester 2 (or your school's own periods) to structure the year."
        onRetry={() => void query.refetch()}
        columns={6}
      >
        <div className="overflow-x-auto rounded-md border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
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
                  <TableCell>{row.sequence}</TableCell>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.startsOn}</TableCell>
                  <TableCell>{row.endsOn}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <PermissionGate permission="term.manage">
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
        title={form.id ? "Edit term" : "New term"}
        description="The term date range must stay inside the academic year — the database enforces this rule."
        submitting={mutation.isPending}
        error={formError}
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" htmlFor="t-code" hint="Unique inside this academic year">
            <Input id="t-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Name" htmlFor="t-name">
            <Input id="t-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Sequence" htmlFor="t-seq">
            <Input
              id="t-seq"
              type="number"
              min={1}
              value={form.sequence}
              onChange={(e) => setForm({ ...form, sequence: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TERM_STATUSES.map((status) => (
                  <SelectItem key={status} value={status} className="capitalize">
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Starts on" htmlFor="t-start">
            <Input
              id="t-start"
              type="date"
              value={form.startsOn}
              onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
            />
          </Field>
          <Field label="Ends on" htmlFor="t-end">
            <Input
              id="t-end"
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
