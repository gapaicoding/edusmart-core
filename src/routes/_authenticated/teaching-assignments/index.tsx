import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AcademicPage, Field, FormDialog, QueryState, StatusBadge } from "@/components/academic/academic-ui";
import { Pager } from "@/components/sis/sis-ui";
import { useAppContext } from "@/lib/app-context";
import {
  getTeachingOptions,
  listTeachingAssignments,
  saveTeachingAssignment,
  type TeachingAssignmentRow,
} from "@/lib/teaching.functions";
import { TEACHING_ROLES, TEACHING_STATUSES } from "@/lib/teaching.schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/teaching-assignments/")({
  component: TeachingAssignmentsPage,
  head: () => ({
    meta: [
      { title: "Teacher Assignments · EduSmart SchoolOS" },
      {
        name: "description",
        content:
          "Manage which teacher is responsible for which subject in which classroom, per academic year and term.",
      },
      { property: "og:title", content: "Teacher Assignments · EduSmart SchoolOS" },
      {
        property: "og:description",
        content: "Teaching responsibility records linking staff, subjects and classrooms.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ALL = "__all__";
const NONE = "__none__";

type AssignmentForm = {
  id?: string;
  academicYearId: string;
  termId: string;
  classroomId: string;
  subjectId: string;
  staffSchoolAssignmentId: string;
  role: string;
  status: string;
  startsOn: string;
  endsOn: string;
};

const EMPTY_FORM: AssignmentForm = {
  academicYearId: "",
  termId: NONE,
  classroomId: "",
  subjectId: "",
  staffSchoolAssignmentId: "",
  role: "teacher",
  status: "active",
  startsOn: new Date().toISOString().slice(0, 10),
  endsOn: "",
};

function personLabel(row: TeachingAssignmentRow) {
  return row.staffName ?? "Staff member not accessible";
}

function TeachingAssignmentsPage() {
  const {
    activeOrganization,
    activeSchool,
    activeAcademicYear,
    activeTerm,
    hasPermission,
  } = useAppContext();
  const queryClient = useQueryClient();
  const fetchAssignments = useServerFn(listTeachingAssignments);
  const fetchOptions = useServerFn(getTeachingOptions);
  const persistAssignment = useServerFn(saveTeachingAssignment);

  const organizationId = activeOrganization?.organizationId ?? null;
  const schoolId = activeSchool?.id ?? null;

  const [search, setSearch] = useState("");
  const [academicYearId, setAcademicYearId] = useState(ALL);
  const [termId, setTermId] = useState(ALL);
  const [gradeLevelId, setGradeLevelId] = useState(ALL);
  const [classroomId, setClassroomId] = useState(ALL);
  const [subjectId, setSubjectId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AssignmentForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // Active context supplies defaults only; RLS stays the real boundary.
  useEffect(() => {
    if (activeAcademicYear?.id) setAcademicYearId(activeAcademicYear.id);
  }, [activeAcademicYear?.id]);

  const optionsQuery = useQuery({
    queryKey: ["teaching", "options", organizationId, schoolId],
    queryFn: () =>
      fetchOptions({ data: { organizationId: organizationId!, schoolId: schoolId! } }),
    enabled: Boolean(organizationId && schoolId) && hasPermission("teaching_assignment.read"),
  });
  const options = optionsQuery.data;

  const filters = useMemo(
    () => ({
      organizationId: organizationId!,
      schoolId: schoolId!,
      academicYearId: academicYearId === ALL ? null : academicYearId,
      termId: termId === ALL ? null : termId,
      gradeLevelId: gradeLevelId === ALL ? null : gradeLevelId,
      classroomId: classroomId === ALL ? null : classroomId,
      subjectId: subjectId === ALL ? null : subjectId,
      status: status === ALL ? null : status,
      search: search || null,
      page,
      pageSize: 25,
    }),
    [organizationId, schoolId, academicYearId, termId, gradeLevelId, classroomId, subjectId, status, search, page],
  );

  const listQuery = useQuery({
    queryKey: ["teaching", "assignments", filters],
    queryFn: () => fetchAssignments({ data: filters }),
    enabled: Boolean(organizationId && schoolId) && hasPermission("teaching_assignment.read"),
  });

  const mutation = useMutation({
    mutationFn: (input: AssignmentForm) =>
      persistAssignment({
        data: {
          id: input.id,
          organizationId: organizationId!,
          schoolId: schoolId!,
          academicYearId: input.academicYearId,
          termId: input.termId === NONE ? null : input.termId,
          classroomId: input.classroomId,
          subjectId: input.subjectId,
          staffSchoolAssignmentId: input.staffSchoolAssignmentId,
          role: input.role as (typeof TEACHING_ROLES)[number],
          status: input.status as (typeof TEACHING_STATUSES)[number],
          startsOn: input.startsOn,
          endsOn: input.endsOn,
        },
      }),
    onSuccess: () => {
      setDialogOpen(false);
      setFormError(null);
      toast.success("Teaching assignment saved");
      void queryClient.invalidateQueries({ queryKey: ["teaching"] });
    },
    onError: (error: unknown) =>
      setFormError(
        error instanceof Error ? error.message : "We couldn't save this teaching assignment.",
      ),
  });

  const canCreate = hasPermission("teaching_assignment.create");
  const canUpdate = hasPermission("teaching_assignment.update");
  const canArchive = hasPermission("teaching_assignment.archive");

  // Term and Classroom choices must always belong to the selected year.
  const formTerms = (options?.terms ?? []).filter((t) => t.academicYearId === form.academicYearId);
  const formClassrooms = (options?.classrooms ?? []).filter(
    (c) => c.academicYearId === form.academicYearId,
  );
  const filterTerms = (options?.terms ?? []).filter(
    (t) => academicYearId === ALL || t.academicYearId === academicYearId,
  );
  const filterClassrooms = (options?.classrooms ?? []).filter(
    (c) =>
      (academicYearId === ALL || c.academicYearId === academicYearId) &&
      (gradeLevelId === ALL || c.gradeLevelId === gradeLevelId),
  );

  function openCreate() {
    setForm({
      ...EMPTY_FORM,
      academicYearId: activeAcademicYear?.id ?? options?.academicYears[0]?.id ?? "",
      termId: activeTerm?.id ?? NONE,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(row: TeachingAssignmentRow) {
    setForm({
      id: row.id,
      academicYearId: row.academicYearId,
      termId: row.termId ?? NONE,
      classroomId: row.classroomId,
      subjectId: row.subjectId,
      staffSchoolAssignmentId: row.staffSchoolAssignmentId,
      role: row.role,
      status: row.status,
      startsOn: row.startsOn,
      endsOn: row.endsOn ?? "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  function setYear(next: string) {
    // Clear stale term/classroom whenever the academic year changes.
    setForm((prev) => ({ ...prev, academicYearId: next, termId: NONE, classroomId: "" }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.academicYearId) return setFormError("Select an academic year.");
    if (!form.staffSchoolAssignmentId) return setFormError("Select a staff member.");
    if (!form.classroomId) return setFormError("Select a classroom.");
    if (!form.subjectId) return setFormError("Select a subject.");
    if (!form.startsOn) return setFormError("A start date is required.");
    if (form.status === "archived" && !canArchive) {
      return setFormError("Your current role is not allowed to archive teaching assignments.");
    }
    mutation.mutate(form);
  }

  const rows = listQuery.data?.rows ?? [];
  const hasFilters =
    search !== "" ||
    [academicYearId, termId, gradeLevelId, classroomId, subjectId, status].some((v) => v !== ALL);

  return (
    <AcademicPage
      title="Teacher Assignments"
      description="Who teaches which subject to which classroom, for the selected academic context."
      readPermission="teaching_assignment.read"
      actions={
        canCreate ? (
          <Button onClick={openCreate} disabled={!schoolId}>
            Add teaching assignment
          </Button>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Search teacher name"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            value={academicYearId}
            onValueChange={(v) => {
              setAcademicYearId(v);
              setTermId(ALL);
              setClassroomId(ALL);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Academic year">
              <SelectValue placeholder="Academic year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All academic years</SelectItem>
              {(options?.academicYears ?? []).map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={termId}
            onValueChange={(v) => {
              setTermId(v);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Term">
              <SelectValue placeholder="Term" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All terms</SelectItem>
              {filterTerms.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={gradeLevelId}
            onValueChange={(v) => {
              setGradeLevelId(v);
              setClassroomId(ALL);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Grade level">
              <SelectValue placeholder="Grade level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All grade levels</SelectItem>
              {(options?.gradeLevels ?? []).map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={classroomId}
            onValueChange={(v) => {
              setClassroomId(v);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Classroom">
              <SelectValue placeholder="Classroom" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All classrooms</SelectItem>
              {filterClassrooms.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                  {c.hint ? ` · ${c.hint}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={subjectId}
            onValueChange={(v) => {
              setSubjectId(v);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Subject">
              <SelectValue placeholder="Subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All subjects</SelectItem>
              {(options?.subjects ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                  {s.hint ? ` · ${s.hint}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {TEACHING_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <QueryState
          isLoading={listQuery.isPending}
          error={listQuery.error}
          isEmpty={rows.length === 0}
          emptyTitle={
            hasFilters ? "No teaching assignments match these filters" : "No teaching assignments yet"
          }
          emptyDescription={
            hasFilters
              ? "Adjust the filters above to widen the search."
              : "Create a teaching assignment to record who teaches which subject in which classroom."
          }
          onRetry={() => void listQuery.refetch()}
          columns={7}
        >
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Classroom</TableHead>
                    <TableHead>Academic context</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-medium">{personLabel(row)}</p>
                        {(row.staffPositionTitle || row.staffEmployeeNumber) && (
                          <p className="text-xs text-muted-foreground">
                            {[row.staffPositionTitle, row.staffEmployeeNumber]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.subjectName ?? "Subject not accessible"}
                        {row.subjectCode && (
                          <p className="text-xs text-muted-foreground">{row.subjectCode}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.classroomName ?? "Classroom not accessible"}
                        <p className="text-xs text-muted-foreground">
                          {[row.classroomCode, row.gradeLevelName].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.academicYearName ?? "—"}
                        <p className="text-muted-foreground">{row.termName ?? "Whole year"}</p>
                      </TableCell>
                      <TableCell className="capitalize">{row.role}</TableCell>
                      <TableCell className="text-xs">
                        {row.startsOn}
                        {row.endsOn ? ` → ${row.endsOn}` : ""}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {canUpdate && (
                          <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager
              page={listQuery.data?.page ?? 1}
              pageSize={listQuery.data?.pageSize ?? 25}
              total={listQuery.data?.total ?? 0}
              onPageChange={setPage}
            />
          </>
        </QueryState>
      </div>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={form.id ? "Edit teaching assignment" : "Add teaching assignment"}
        description="Only staff with an active assignment to this school can be given a teaching responsibility."
        submitting={mutation.isPending}
        error={formError}
        onSubmit={submit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Academic year">
            <Select value={form.academicYearId} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue placeholder="Select academic year" />
              </SelectTrigger>
              <SelectContent>
                {(options?.academicYears ?? []).map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Term (optional)">
            <Select
              value={formTerms.some((t) => t.id === form.termId) ? form.termId : NONE}
              onValueChange={(v) => setForm({ ...form, termId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Whole academic year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Whole academic year</SelectItem>
                {formTerms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Staff member">
          <Select
            value={form.staffSchoolAssignmentId}
            onValueChange={(v) => setForm({ ...form, staffSchoolAssignmentId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select staff assigned to this school" />
            </SelectTrigger>
            <SelectContent>
              {(options?.staff ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                  {s.hint ? ` · ${s.hint}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(options?.staff ?? []).length === 0 && !optionsQuery.isPending && (
            <p className="text-xs text-muted-foreground">
              No staff have an active assignment to this school yet. Assign them from the staff
              profile first.
            </p>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Classroom">
            <Select
              value={form.classroomId}
              onValueChange={(v) => setForm({ ...form, classroomId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select classroom" />
              </SelectTrigger>
              <SelectContent>
                {formClassrooms.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                    {c.hint ? ` · ${c.hint}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Subject">
            <Select value={form.subjectId} onValueChange={(v) => setForm({ ...form, subjectId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {(options?.subjects ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                    {s.hint ? ` · ${s.hint}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role">
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEACHING_ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEACHING_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize" disabled={s === "archived" && !canArchive}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts on" htmlFor="startsOn">
            <Input
              id="startsOn"
              type="date"
              value={form.startsOn}
              onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
              required
            />
          </Field>
          <Field label="Ends on (optional)" htmlFor="endsOn">
            <Input
              id="endsOn"
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
