import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import type { z } from "zod";
import { AcademicPage, Field, FormDialog, QueryState, StatusBadge } from "@/components/academic/academic-ui";
import { PermissionGate, useAppContext } from "@/lib/app-context";
import {
  listClassrooms,
  listGradeLevels,
  saveClassroom,
  type ClassroomRow,
} from "@/lib/academic.functions";
import { LIFECYCLE_STATUSES, classroomInput, firstZodMessage } from "@/lib/academic.schemas";
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

export const Route = createFileRoute("/_authenticated/academic/classrooms")({
  head: () => ({
    meta: [
      { title: "Classrooms — EduSmart SchoolOS" },
      { name: "description", content: "Manage rombel classrooms inside the active academic year." },
      { property: "og:title", content: "Classrooms — EduSmart SchoolOS" },
      { property: "og:description", content: "Classroom setup inside the active academic year." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClassroomsPage,
});

type FormState = {
  id?: string;
  gradeLevelId: string;
  code: string;
  name: string;
  capacity: string;
  status: string;
};

const EMPTY: FormState = { gradeLevelId: "", code: "", name: "", capacity: "", status: "active" };

function ClassroomsPage() {
  const { activeSchool, activeAcademicYear } = useAppContext();
  const schoolId = activeSchool?.id ?? null;
  const yearId = activeAcademicYear?.id ?? null;
  const queryClient = useQueryClient();
  const fetchRows = useServerFn(listClassrooms);
  const fetchGrades = useServerFn(listGradeLevels);
  const persist = useServerFn(saveClassroom);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["academic", "classrooms", schoolId, yearId],
    queryFn: () => fetchRows({ data: { schoolId: schoolId!, academicYearId: yearId } }),
    enabled: Boolean(schoolId && yearId),
  });

  const gradesQuery = useQuery({
    queryKey: ["academic", "grade-levels", schoolId],
    queryFn: () => fetchGrades({ data: { schoolId: schoolId! } }),
    enabled: Boolean(schoolId),
  });

  const gradeLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of gradesQuery.data ?? []) map.set(g.id, g.name);
    return map;
  }, [gradesQuery.data]);

  const mutation = useMutation({
    mutationFn: (values: unknown) => persist({ data: values as never }),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["academic", "classrooms", schoolId, yearId] });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : String(error)),
  });

  function openEdit(row: ClassroomRow) {
    setForm({
      id: row.id,
      gradeLevelId: row.gradeLevelId,
      code: row.code,
      name: row.name,
      capacity: row.capacity === null ? "" : String(row.capacity),
      status: row.status,
    });
    setFormError(null);
    setOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schoolId || !yearId) return;
    setFormError(null);
    const parsed = classroomInput.safeParse({ ...form, schoolId, academicYearId: yearId });
    if (!parsed.success) {
      setFormError(firstZodMessage(parsed.error as z.ZodError));
      return;
    }
    mutation.mutate(parsed.data);
  }

  const rows = query.data ?? [];
  const activeGrades = (gradesQuery.data ?? []).filter((g) => g.isActive || g.id === form.gradeLevelId);

  if (!yearId) {
    return (
      <AcademicPage
        title="Classrooms"
        description="Classrooms (rombel) belong to one academic year and one grade level."
        readPermission="classroom.read"
      >
        <Alert>
          <AlertDescription>
            Select an academic year in the top bar to view and manage its classrooms.
          </AlertDescription>
        </Alert>
      </AcademicPage>
    );
  }

  return (
    <AcademicPage
      title="Classrooms"
      description={`Classrooms for ${activeAcademicYear?.name ?? "the active academic year"}. Next year's 7A is a separate classroom record.`}
      readPermission="classroom.read"
      actions={
        <PermissionGate permission="classroom.manage">
          <Button
            onClick={() => {
              setForm(EMPTY);
              setFormError(null);
              setOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New classroom
          </Button>
        </PermissionGate>
      }
    >
      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        isEmpty={rows.length === 0}
        emptyTitle="No classrooms in this academic year"
        emptyDescription="Create classrooms per grade level so students can be enrolled into them."
        onRetry={() => void query.refetch()}
        columns={5}
      >
        <div className="overflow-x-auto rounded-md border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Grade level</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{gradeLabel.get(row.gradeLevelId) ?? "—"}</TableCell>
                  <TableCell>{row.capacity ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <PermissionGate permission="classroom.manage">
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
        title={form.id ? "Edit classroom" : "New classroom"}
        description="Classrooms are scoped to the active academic year and never carried over between years."
        submitting={mutation.isPending}
        error={formError}
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Grade level">
            <Select
              value={form.gradeLevelId}
              onValueChange={(value) => setForm({ ...form, gradeLevelId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a grade level" />
              </SelectTrigger>
              <SelectContent>
                {activeGrades.map((grade) => (
                  <SelectItem key={grade.id} value={grade.id}>
                    {grade.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Field label="Code" htmlFor="c-code" hint="Unique per academic year, e.g. 7A">
            <Input id="c-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Name" htmlFor="c-name">
            <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Capacity" htmlFor="c-cap" hint="Optional; must be 1 or higher when set">
            <Input
              id="c-cap"
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            />
          </Field>
        </div>
      </FormDialog>
    </AcademicPage>
  );
}
