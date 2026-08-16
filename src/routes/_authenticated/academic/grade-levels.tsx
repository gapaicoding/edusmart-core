import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import type { z } from "zod";
import { AcademicPage, Field, FormDialog, QueryState } from "@/components/academic/academic-ui";
import { PermissionGate, useAppContext } from "@/lib/app-context";
import { listGradeLevels, saveGradeLevel, type GradeLevelRow } from "@/lib/academic.functions";
import { EDUCATION_STAGES, firstZodMessage, gradeLevelInput } from "@/lib/academic.schemas";
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

export const Route = createFileRoute("/_authenticated/academic/grade-levels")({
  head: () => ({
    meta: [
      { title: "Grade Levels — EduSmart SchoolOS" },
      { name: "description", content: "Manage grade levels for any education stage in the active school." },
      { property: "og:title", content: "Grade Levels — EduSmart SchoolOS" },
      { property: "og:description", content: "Grade level setup for the active school." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GradeLevelsPage,
});

type FormState = {
  id?: string;
  code: string;
  name: string;
  sequence: string;
  educationStage: string;
  isActive: boolean;
};

const EMPTY: FormState = { code: "", name: "", sequence: "1", educationStage: "sd", isActive: true };

function GradeLevelsPage() {
  const { activeSchool } = useAppContext();
  const schoolId = activeSchool?.id ?? null;
  const queryClient = useQueryClient();
  const fetchRows = useServerFn(listGradeLevels);
  const persist = useServerFn(saveGradeLevel);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["academic", "grade-levels", schoolId],
    queryFn: () => fetchRows({ data: { schoolId: schoolId! } }),
    enabled: Boolean(schoolId),
  });

  const mutation = useMutation({
    mutationFn: (values: unknown) => persist({ data: values as never }),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["academic", "grade-levels", schoolId] });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : String(error)),
  });

  function openCreate() {
    setForm({ ...EMPTY, sequence: String((query.data?.length ?? 0) + 1) });
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: GradeLevelRow) {
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      sequence: String(row.sequence),
      educationStage: row.educationStage,
      isActive: row.isActive,
    });
    setFormError(null);
    setOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schoolId) return;
    setFormError(null);
    const parsed = gradeLevelInput.safeParse({ ...form, schoolId });
    if (!parsed.success) {
      setFormError(firstZodMessage(parsed.error as z.ZodError));
      return;
    }
    mutation.mutate(parsed.data);
  }

  const rows = query.data ?? [];

  return (
    <AcademicPage
      title="Grade Levels"
      description="Grade levels are tiers (not classrooms) and support PAUD, TK, SD, SMP, SMA, SMK and other structures."
      readPermission="grade_level.read"
      actions={
        <PermissionGate permission="grade_level.manage">
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New grade level
          </Button>
        </PermissionGate>
      }
    >
      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        isEmpty={rows.length === 0}
        emptyTitle="No grade levels yet"
        emptyDescription="Add the tiers this school teaches; classrooms are created inside them."
        onRetry={() => void query.refetch()}
        columns={5}
      >
        <div className="overflow-x-auto rounded-md border border-border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.sequence}</TableCell>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="uppercase">{row.educationStage}</TableCell>
                  <TableCell>
                    <Badge variant={row.isActive ? "default" : "outline"}>
                      {row.isActive ? "active" : "inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <PermissionGate permission="grade_level.manage">
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
        title={form.id ? "Edit grade level" : "New grade level"}
        description="Deactivate instead of deleting — enrollment history keeps referencing grade levels."
        submitting={mutation.isPending}
        error={formError}
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" htmlFor="g-code" hint="Unique per school, e.g. G7">
            <Input id="g-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Name" htmlFor="g-name">
            <Input id="g-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Sequence" htmlFor="g-seq" hint="Progression order within this school">
            <Input
              id="g-seq"
              type="number"
              min={1}
              value={form.sequence}
              onChange={(e) => setForm({ ...form, sequence: e.target.value })}
            />
          </Field>
          <Field label="Education stage">
            <Select
              value={form.educationStage}
              onValueChange={(value) => setForm({ ...form, educationStage: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EDUCATION_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage} className="uppercase">
                    {stage}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
