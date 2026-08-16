import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import type { z } from "zod";
import { AcademicPage, Field, FormDialog, QueryState, StatusBadge } from "@/components/academic/academic-ui";
import { PermissionGate, useAppContext } from "@/lib/app-context";
import { listCurricula, saveCurriculum, type CurriculumRow } from "@/lib/academic.functions";
import { LIFECYCLE_STATUSES, curriculumInput, firstZodMessage } from "@/lib/academic.schemas";
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

export const Route = createFileRoute("/_authenticated/academic/curricula")({
  head: () => ({
    meta: [
      { title: "Curricula — EduSmart SchoolOS" },
      { name: "description", content: "Register curriculum frameworks used by the active school." },
      { property: "og:title", content: "Curricula — EduSmart SchoolOS" },
      { property: "og:description", content: "Curriculum registry for the active school." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CurriculaPage,
});

type FormState = { id?: string; code: string; name: string; version: string; status: string };
const EMPTY: FormState = { code: "", name: "", version: "", status: "active" };

function CurriculaPage() {
  const { activeSchool } = useAppContext();
  const schoolId = activeSchool?.id ?? null;
  const queryClient = useQueryClient();
  const fetchRows = useServerFn(listCurricula);
  const persist = useServerFn(saveCurriculum);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["academic", "curricula", schoolId],
    queryFn: () => fetchRows({ data: { schoolId: schoolId! } }),
    enabled: Boolean(schoolId),
  });

  const mutation = useMutation({
    mutationFn: (values: unknown) => persist({ data: values as never }),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["academic", "curricula", schoolId] });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : String(error)),
  });

  function openEdit(row: CurriculumRow) {
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      version: row.version ?? "",
      status: row.status,
    });
    setFormError(null);
    setOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schoolId) return;
    setFormError(null);
    const parsed = curriculumInput.safeParse({ ...form, schoolId });
    if (!parsed.success) {
      setFormError(firstZodMessage(parsed.error as z.ZodError));
      return;
    }
    mutation.mutate(parsed.data);
  }

  const rows = query.data ?? [];

  return (
    <AcademicPage
      title="Curricula"
      description="Register the curriculum frameworks this school follows. Detailed CP/TP workflows come later."
      readPermission="curriculum.read"
      actions={
        <PermissionGate permission="curriculum.manage">
          <Button
            onClick={() => {
              setForm(EMPTY);
              setFormError(null);
              setOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New curriculum
          </Button>
        </PermissionGate>
      }
    >
      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        isEmpty={rows.length === 0}
        emptyTitle="No curricula registered"
        emptyDescription="Add at least one framework, for example Kurikulum Merdeka, to reference later."
        onRetry={() => void query.refetch()}
        columns={4}
      >
        <div className="overflow-x-auto rounded-md border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.version ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <PermissionGate permission="curriculum.manage">
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
        title={form.id ? "Edit curriculum" : "New curriculum"}
        description="Archive superseded frameworks instead of deleting them."
        submitting={mutation.isPending}
        error={formError}
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" htmlFor="cu-code" hint="Unique per school, e.g. MERDEKA">
            <Input id="cu-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Name" htmlFor="cu-name">
            <Input id="cu-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Version" htmlFor="cu-version" hint="Optional">
            <Input
              id="cu-version"
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIFECYCLE_STATUSES.map((status) => (
                  <SelectItem key={status} value={status} className="capitalize">
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormDialog>
    </AcademicPage>
  );
}
