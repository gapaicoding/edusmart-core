import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Field, FormDialog, Pager, QueryState, SisPage, StatusBadge } from "@/components/sis/sis-ui";
import { useAppContext } from "@/lib/app-context";
import { listStudents, saveStudent } from "@/lib/sis.functions";
import { listClassrooms, listGradeLevels } from "@/lib/academic.functions";
import { STUDENT_GENDERS, STUDENT_STATUSES } from "@/lib/sis.schemas";
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

export const Route = createFileRoute("/_authenticated/students/")({
  component: StudentsPage,
  head: () => ({
    meta: [
      { title: "Students · EduSmart SchoolOS" },
      {
        name: "description",
        content:
          "Search, register and manage organization-level student records and their school enrolments.",
      },
      { property: "og:title", content: "Students · EduSmart SchoolOS" },
      {
        property: "og:description",
        content: "Organization-level student directory with school and classroom filters.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ALL = "__all__";

type StudentFormState = {
  id?: string;
  fullName: string;
  preferredName: string;
  nisn: string;
  gender: string;
  birthDate: string;
  birthPlace: string;
  status: string;
};

const EMPTY_FORM: StudentFormState = {
  fullName: "",
  preferredName: "",
  nisn: "",
  gender: "unspecified",
  birthDate: "",
  birthPlace: "",
  status: "active",
};

function StudentsPage() {
  const { activeOrganization, activeSchool, activeAcademicYear, hasPermission } = useAppContext();
  const queryClient = useQueryClient();

  const fetchStudents = useServerFn(listStudents);
  const fetchGradeLevels = useServerFn(listGradeLevels);
  const fetchClassrooms = useServerFn(listClassrooms);
  const persistStudent = useServerFn(saveStudent);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [gradeLevelId, setGradeLevelId] = useState<string>(ALL);
  const [classroomId, setClassroomId] = useState<string>(ALL);
  const [enrollmentScope, setEnrollmentScope] = useState<"all" | "enrolled" | "unenrolled">("all");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<StudentFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const organizationId = activeOrganization?.organizationId ?? null;
  const schoolId = activeSchool?.id ?? null;
  const academicYearId = activeAcademicYear?.id ?? null;

  const filters = useMemo(
    () => ({
      organizationId: organizationId!,
      schoolId,
      academicYearId: schoolId ? academicYearId : null,
      gradeLevelId: gradeLevelId === ALL ? null : gradeLevelId,
      classroomId: classroomId === ALL ? null : classroomId,
      status: status === ALL ? null : status,
      enrollmentScope,
      search: search || null,
      page,
      pageSize: 25,
    }),
    [
      organizationId,
      schoolId,
      academicYearId,
      gradeLevelId,
      classroomId,
      status,
      enrollmentScope,
      search,
      page,
    ],
  );

  const studentsQuery = useQuery({
    queryKey: ["sis", "students", filters],
    queryFn: () => fetchStudents({ data: filters }),
    enabled: Boolean(organizationId) && hasPermission("student.read"),
  });

  const gradeLevelsQuery = useQuery({
    queryKey: ["academic", "grade-levels", schoolId],
    queryFn: () => fetchGradeLevels({ data: { schoolId: schoolId! } }),
    enabled: Boolean(schoolId) && hasPermission("grade_level.read"),
  });

  const classroomsQuery = useQuery({
    queryKey: ["academic", "classrooms", schoolId, academicYearId],
    queryFn: () => fetchClassrooms({ data: { schoolId: schoolId!, academicYearId } }),
    enabled: Boolean(schoolId) && hasPermission("classroom.read"),
  });

  const mutation = useMutation({
    mutationFn: (input: StudentFormState) =>
      persistStudent({
        data: {
          id: input.id,
          organizationId: organizationId!,
          fullName: input.fullName,
          preferredName: input.preferredName,
          nisn: input.nisn,
          gender: input.gender,
          birthDate: input.birthDate,
          birthPlace: input.birthPlace,
          status: input.status,
        },
      }),
    onSuccess: () => {
      setDialogOpen(false);
      setFormError(null);
      toast.success("Student saved");
      void queryClient.invalidateQueries({ queryKey: ["sis", "students"] });
    },
    onError: (error: unknown) =>
      setFormError(error instanceof Error ? error.message : "We couldn't save this student."),
  });

  const canCreate = hasPermission("student.create");
  const canUpdate = hasPermission("student.update");
  const gradeLevelName = (id: string) =>
    gradeLevelsQuery.data?.find((g) => g.id === id)?.name ?? "—";
  const classroomName = (id: string | null) =>
    id ? (classroomsQuery.data?.find((c) => c.id === id)?.name ?? "—") : "No classroom";

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(row: {
    id: string;
    fullName: string;
    preferredName: string | null;
    nisn: string | null;
    gender: string | null;
    birthDate: string | null;
    birthPlace: string | null;
    status: string;
  }) {
    setForm({
      id: row.id,
      fullName: row.fullName,
      preferredName: row.preferredName ?? "",
      nisn: row.nisn ?? "",
      gender: row.gender ?? "unspecified",
      birthDate: row.birthDate ?? "",
      birthPlace: row.birthPlace ?? "",
      status: row.status,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.fullName.trim()) {
      setFormError("Full name is required.");
      return;
    }
    mutation.mutate(form);
  }

  return (
    <SisPage
      title="Students"
      description="Student identity is held at organization level; school, grade and classroom come from enrolment."
      readPermission="student.read"
      actions={
        canCreate ? (
          <Button onClick={openCreate} disabled={!organizationId}>
            Register student
          </Button>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Search name or NISN"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {STUDENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={enrollmentScope}
            onValueChange={(v) => {
              setEnrollmentScope(v as "all" | "enrolled" | "unenrolled");
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Enrolment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accessible students</SelectItem>
              <SelectItem value="enrolled" disabled={!schoolId}>
                Enrolled in {activeSchool?.name ?? "current school"}
              </SelectItem>
              <SelectItem value="unenrolled">Not enrolled</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={gradeLevelId}
            onValueChange={(v) => {
              setGradeLevelId(v);
              setPage(1);
            }}
            disabled={!schoolId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Grade level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All grade levels</SelectItem>
              {(gradeLevelsQuery.data ?? []).map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
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
            disabled={!schoolId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Classroom" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All classrooms</SelectItem>
              {(classroomsQuery.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!schoolId && (
          <p className="text-xs text-muted-foreground">
            Student identities are organization-wide. Select a school in the top bar to filter by
            enrolment, grade level and classroom.
          </p>
        )}

        <QueryState
          isLoading={studentsQuery.isPending}
          error={studentsQuery.error}
          isEmpty={(studentsQuery.data?.rows.length ?? 0) === 0}
          emptyTitle="No students match these filters"
          emptyDescription="Adjust the filters above, or register a student to get started."
          onRetry={() => void studentsQuery.refetch()}
          columns={6}
        >
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>NISN</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Classroom</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(studentsQuery.data?.rows ?? []).map((row) => {
                  const placement = studentsQuery.data?.placements[row.id];
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          to="/students/$studentId"
                          params={{ studentId: row.id }}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {row.fullName}
                        </Link>
                        {row.preferredName && (
                          <p className="text-xs text-muted-foreground">{row.preferredName}</p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.nisn ?? "—"}</TableCell>
                      <TableCell>
                        {placement ? (
                          gradeLevelName(placement.gradeLevelId)
                        ) : (
                          <span className="text-xs text-muted-foreground">Not enrolled</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {placement ? (
                          classroomName(placement.classroomId)
                        ) : (
                          <span className="text-xs text-muted-foreground">Not enrolled</span>
                        )}
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
                  );
                })}
              </TableBody>
            </Table>
            <Pager
              page={studentsQuery.data?.page ?? 1}
              pageSize={studentsQuery.data?.pageSize ?? 25}
              total={studentsQuery.data?.total ?? 0}
              onPageChange={setPage}
            />
          </>
        </QueryState>
      </div>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={form.id ? "Edit student" : "Register student"}
        description="Student identity belongs to the organization. Enrolment into a school and academic year is managed on the student's profile."
        submitting={mutation.isPending}
        error={formError}
        onSubmit={submit}
      >
        <Field label="Full name" htmlFor="fullName">
          <Input
            id="fullName"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
          />
        </Field>
        <Field label="Preferred name" htmlFor="preferredName">
          <Input
            id="preferredName"
            value={form.preferredName}
            onChange={(e) => setForm({ ...form, preferredName: e.target.value })}
          />
        </Field>
        <Field label="NISN" htmlFor="nisn" hint="Must be unique within the organization.">
          <Input
            id="nisn"
            value={form.nisn}
            onChange={(e) => setForm({ ...form, nisn: e.target.value })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Gender">
            <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STUDENT_GENDERS.map((g) => (
                  <SelectItem key={g} value={g} className="capitalize">
                    {g}
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
                {STUDENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date of birth" htmlFor="birthDate">
            <Input
              id="birthDate"
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            />
          </Field>
          <Field label="Place of birth" htmlFor="birthPlace">
            <Input
              id="birthPlace"
              value={form.birthPlace}
              onChange={(e) => setForm({ ...form, birthPlace: e.target.value })}
            />
          </Field>
        </div>
      </FormDialog>
    </SisPage>
  );
}
