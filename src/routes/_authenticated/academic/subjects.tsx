import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search } from "lucide-react";
import type { z } from "zod";
import { AcademicPage, Field, FormDialog, QueryState } from "@/components/academic/academic-ui";
import { PermissionGate, useAppContext } from "@/lib/app-context";
import { listSubjects, saveSubject, type SubjectRow } from "@/lib/academic.functions";
import { firstZodMessage, subjectInput } from "@/lib/academic.schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/academic/subjects")({
  head: () => ({
    meta: [
      { title: "Subjects — EduSmart SchoolOS" },
      { name: "description", content: "Manage the subject catalogue owned by the active school." },
      { property: "og:title", content: "Subjects — EduSmart SchoolOS" },
      { property: "og:description", content: "Subject catalogue for the active school." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SubjectsPage,
});

type FormState = { id?: string; code: string; name: string; category: string; isActive: boolean };
const EMPTY: FormState = { code: "", name: "", category: "", isActive: true };

function SubjectsPage() {
  const { activeSchool } = useAppContext();
  const schoolId = activeSchool?.id ?? null;
  const queryClient = useQueryClient();
  const fetchRows = useServerFn(listSubjects);
  const persist = useServerFn(saveSubject);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["academic", "subjects", schoolId],
    queryFn: () => fetchRows({ data: { schoolId: schoolId! } }),
    enabled: Boolean(schoolId),
  });

  const mutation = useMutation({
    mutationFn: (values: unknown) => persist({ data: values as never }),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["academic", "subjects", schoolId] });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : String(error)),
  });

  function openEdit(row: SubjectRow) {
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category ?? "",
      isActive: row.isActive,
    });
    setFormError(null);
    setOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schoolId) return;
    setFormError(null);
    const parsed = subjectInput.safeParse({ ...form, schoolId });
    if (!parsed.success) {
      setFormError(firstZodMessage(parsed.error as z.ZodError));
      return;
    }
    mutation.mutate(parsed.data);
  }

  const rows = query.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <AcademicPage
      title="Subjects"
      description="Subjects are owned by the school and reused across grade levels and classrooms."
      readPermission="subject.read"
      actions={
        <PermissionGate permission="subject.manage">
          <Button
            onClick={() => {
              setForm(EMPTY);
              setFormError(null);
              setOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New subject
          </Button>
        </PermissionGate>
      }
    >
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search code, name or category"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search subjects"
        />
      </div>

      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        isEmpty={filtered.length === 0}
        emptyTitle={rows.length === 0 ? "No subjects yet" : "No subjects match your search"}
        emptyDescription={
          rows.length === 0
            ? "Add the subjects this school teaches; teaching assignments come in a later batch."
            : "Try a different code, name or category."
        }
        onRetry={() => void query.refetch()}
        columns={4}
      >
        <div className="overflow-x-auto rounded-md border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.category ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={row.isActive ? "default" : "outline"}>
                      {row.isActive ? "active" : "inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <PermissionGate permission="subject.manage">
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
        title={form.id ? "Edit subject" : "New subject"}
        description="Deactivate rather than delete so historic assessments keep resolving."
        submitting={mutation.isPending}
        error={formError}
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" htmlFor="s-code" hint="Unique per school, e.g. MTK">
            <Input id="s-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Name" htmlFor="s-name">
            <Input id="s-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Category" htmlFor="s-cat" hint="Optional grouping">
            <Input
              id="s-cat"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </Field>
          <Field label="Active">
            <div className="flex h-9 items-center">
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
              />
            </div>
          </Field>
        </div>
      </FormDialog>
    </AcademicPage>
  );
}
