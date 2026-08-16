import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Field, FormDialog, QueryState, SisPage, StatusBadge } from "@/components/sis/sis-ui";
import { useAppContext } from "@/lib/app-context";
import {
  getStudentDetail,
  listGuardians,
  saveClassEnrollment,
  saveEnrollment,
  saveStudentGuardian,
} from "@/lib/sis.functions";
import { listAcademicYears, listClassrooms, listGradeLevels } from "@/lib/academic.functions";
import {
  CLASS_ENROLLMENT_STATUSES,
  ENROLLMENT_STATUSES,
  STUDENT_GUARDIAN_STATUSES,
} from "@/lib/sis.schemas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/students/$studentId")({
  component: StudentDetailPage,
  head: () => ({
    meta: [
      { title: "Student profile · EduSmart SchoolOS" },
      {
        name: "description",
        content:
          "Student profile with enrolment history, classroom placements and guardian relationships.",
      },
      { property: "og:title", content: "Student profile · EduSmart SchoolOS" },
      {
        property: "og:description",
        content: "Enrolment history, classroom placements and guardian links for one student.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type EnrollmentForm = {
  id?: string;
  schoolId: string;
  academicYearId: string;
  gradeLevelId: string;
  studentNumber: string;
  enrollmentNumber: string;
  status: string;
  enrolledOn: string;
  endedOn: string;
};

type PlacementForm = {
  id?: string;
  studentEnrollmentId: string;
  classroomId: string;
  startsOn: string;
  endsOn: string;
  isPrimary: boolean;
  status: string;
};

type LinkForm = {
  id?: string;
  guardianId: string;
  relationshipType: string;
  isPrimary: boolean;
  canViewAcademic: boolean;
  canViewAttendance: boolean;
  canReceiveNotification: boolean;
  status: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function StudentDetailPage() {
  const { studentId } = Route.useParams();
  const { activeOrganization, hasPermission } = useAppContext();
  const queryClient = useQueryClient();

  const fetchDetail = useServerFn(getStudentDetail);
  const fetchGuardians = useServerFn(listGuardians);
  const fetchYears = useServerFn(listAcademicYears);
  const fetchGradeLevels = useServerFn(listGradeLevels);
  const fetchClassrooms = useServerFn(listClassrooms);
  const persistEnrollment = useServerFn(saveEnrollment);
  const persistPlacement = useServerFn(saveClassEnrollment);
  const persistLink = useServerFn(saveStudentGuardian);

  const organizationId = activeOrganization?.organizationId ?? null;
  const schools = activeOrganization?.schools ?? [];

  const detailQuery = useQuery({
    queryKey: ["sis", "student", studentId, organizationId],
    queryFn: () => fetchDetail({ data: { id: studentId, organizationId: organizationId! } }),
    enabled: Boolean(organizationId) && hasPermission("student.read"),
  });

  const guardiansQuery = useQuery({
    queryKey: ["sis", "guardians", "picker", organizationId],
    queryFn: () =>
      fetchGuardians({
        data: { organizationId: organizationId!, status: "active", page: 1, pageSize: 100 },
      }),
    enabled: Boolean(organizationId) && hasPermission("guardian.read"),
  });

  const [enrollmentOpen, setEnrollmentOpen] = useState(false);
  const [enrollmentForm, setEnrollmentForm] = useState<EnrollmentForm>({
    schoolId: "",
    academicYearId: "",
    gradeLevelId: "",
    studentNumber: "",
    enrollmentNumber: "",
    status: "active",
    enrolledOn: today(),
    endedOn: "",
  });
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);

  const [placementOpen, setPlacementOpen] = useState(false);
  const [placementForm, setPlacementForm] = useState<PlacementForm>({
    studentEnrollmentId: "",
    classroomId: "",
    startsOn: today(),
    endsOn: "",
    isPrimary: true,
    status: "active",
  });
  const [placementError, setPlacementError] = useState<string | null>(null);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState<LinkForm>({
    guardianId: "",
    relationshipType: "",
    isPrimary: false,
    canViewAcademic: true,
    canViewAttendance: true,
    canReceiveNotification: true,
    status: "active",
  });
  const [linkError, setLinkError] = useState<string | null>(null);

  const yearsQuery = useQuery({
    queryKey: ["academic", "years", enrollmentForm.schoolId],
    queryFn: () => fetchYears({ data: { schoolId: enrollmentForm.schoolId } }),
    enabled: Boolean(enrollmentForm.schoolId) && enrollmentOpen,
  });

  const gradesQuery = useQuery({
    queryKey: ["academic", "grade-levels", enrollmentForm.schoolId],
    queryFn: () => fetchGradeLevels({ data: { schoolId: enrollmentForm.schoolId } }),
    enabled: Boolean(enrollmentForm.schoolId) && enrollmentOpen,
  });

  const placementEnrollment = useMemo(
    () =>
      detailQuery.data?.enrollments.find((e) => e.id === placementForm.studentEnrollmentId) ?? null,
    [detailQuery.data, placementForm.studentEnrollmentId],
  );

  const placementClassroomsQuery = useQuery({
    queryKey: [
      "academic",
      "classrooms",
      placementEnrollment?.schoolId,
      placementEnrollment?.academicYearId,
    ],
    queryFn: () =>
      fetchClassrooms({
        data: {
          schoolId: placementEnrollment!.schoolId,
          academicYearId: placementEnrollment!.academicYearId,
        },
      }),
    enabled: Boolean(placementEnrollment) && placementOpen,
  });

  const enrollmentMutation = useMutation({
    mutationFn: (input: EnrollmentForm) =>
      persistEnrollment({
        data: {
          id: input.id,
          organizationId: organizationId!,
          studentId,
          schoolId: input.schoolId,
          academicYearId: input.academicYearId,
          gradeLevelId: input.gradeLevelId,
          studentNumber: input.studentNumber,
          enrollmentNumber: input.enrollmentNumber,
          status: input.status,
          enrolledOn: input.enrolledOn,
          endedOn: input.endedOn,
        },
      }),
    onSuccess: () => {
      setEnrollmentOpen(false);
      setEnrollmentError(null);
      toast.success("Enrolment saved");
      void queryClient.invalidateQueries({ queryKey: ["sis"] });
    },
    onError: (error: unknown) =>
      setEnrollmentError(error instanceof Error ? error.message : "We couldn't save this enrolment."),
  });

  const placementMutation = useMutation({
    mutationFn: (input: PlacementForm) =>
      persistPlacement({
        data: {
          id: input.id,
          studentEnrollmentId: input.studentEnrollmentId,
          classroomId: input.classroomId,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          isPrimary: input.isPrimary,
          status: input.status,
        },
      }),
    onSuccess: () => {
      setPlacementOpen(false);
      setPlacementError(null);
      toast.success("Classroom placement saved");
      void queryClient.invalidateQueries({ queryKey: ["sis"] });
    },
    onError: (error: unknown) =>
      setPlacementError(
        error instanceof Error ? error.message : "We couldn't save this classroom placement.",
      ),
  });

  const linkMutation = useMutation({
    mutationFn: (input: LinkForm) =>
      persistLink({
        data: {
          id: input.id,
          organizationId: organizationId!,
          studentId,
          guardianId: input.guardianId,
          relationshipType: input.relationshipType,
          isPrimary: input.isPrimary,
          canViewAcademic: input.canViewAcademic,
          canViewAttendance: input.canViewAttendance,
          canReceiveNotification: input.canReceiveNotification,
          status: input.status,
        },
      }),
    onSuccess: () => {
      setLinkOpen(false);
      setLinkError(null);
      toast.success("Guardian relationship saved");
      void queryClient.invalidateQueries({ queryKey: ["sis"] });
    },
    onError: (error: unknown) =>
      setLinkError(error instanceof Error ? error.message : "We couldn't save this relationship."),
  });

  const canManageEnrollment = hasPermission("enrollment.manage");
  const canManageClass = hasPermission("class_enrollment.manage");
  const canManageGuardian = hasPermission("guardian.manage");

  const schoolName = (id: string) => schools.find((s) => s.id === id)?.name ?? id;

  function submitEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollmentForm.schoolId || !enrollmentForm.academicYearId || !enrollmentForm.gradeLevelId) {
      setEnrollmentError("School, academic year and grade level are required.");
      return;
    }
    enrollmentMutation.mutate(enrollmentForm);
  }

  function submitPlacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!placementForm.studentEnrollmentId || !placementForm.classroomId) {
      setPlacementError("Enrolment and classroom are required.");
      return;
    }
    placementMutation.mutate(placementForm);
  }

  function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!linkForm.guardianId || !linkForm.relationshipType.trim()) {
      setLinkError("Guardian and relationship are required.");
      return;
    }
    linkMutation.mutate(linkForm);
  }

  const student = detailQuery.data?.student;

  return (
    <SisPage
      title={student?.fullName ?? "Student profile"}
      description="Enrolment history, classroom placements and guardian relationships."
      readPermission="student.read"
      actions={
        <Button variant="outline" asChild>
          <Link to="/students">Back to students</Link>
        </Button>
      }
    >
      <QueryState
        isLoading={detailQuery.isPending}
        error={detailQuery.error}
        isEmpty={false}
        emptyTitle=""
        emptyDescription=""
        onRetry={() => void detailQuery.refetch()}
        columns={4}
      >
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identity</CardTitle>
              <CardDescription>
                Organization-level record. School membership comes from enrolment below.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">NISN</p>
                <p className="font-mono">{student?.nisn ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gender</p>
                <p className="capitalize">{student?.gender ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Born</p>
                <p>
                  {student?.birthDate ?? "—"}
                  {student?.birthPlace ? ` · ${student.birthPlace}` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                {student && <StatusBadge status={student.status} />}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Enrolment history</CardTitle>
                <CardDescription>One enrolment per school and academic year.</CardDescription>
              </div>
              {canManageEnrollment && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEnrollmentForm({
                      schoolId: schools[0]?.id ?? "",
                      academicYearId: "",
                      gradeLevelId: "",
                      studentNumber: "",
                      enrollmentNumber: "",
                      status: "active",
                      enrolledOn: today(),
                      endedOn: "",
                    });
                    setEnrollmentError(null);
                    setEnrollmentOpen(true);
                  }}
                >
                  Add enrolment
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {detailQuery.data?.enrollments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This student is not enrolled in any school yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>School</TableHead>
                      <TableHead>Student number</TableHead>
                      <TableHead>Enrolled</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailQuery.data?.enrollments ?? []).map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{schoolName(e.schoolId)}</TableCell>
                        <TableCell className="font-mono text-xs">{e.studentNumber ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {e.enrolledOn}
                          {e.endedOn ? ` → ${e.endedOn}` : ""}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={e.status} />
                        </TableCell>
                        <TableCell className="space-x-1 text-right">
                          {canManageEnrollment && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEnrollmentForm({
                                  id: e.id,
                                  schoolId: e.schoolId,
                                  academicYearId: e.academicYearId,
                                  gradeLevelId: e.gradeLevelId,
                                  studentNumber: e.studentNumber ?? "",
                                  enrollmentNumber: e.enrollmentNumber ?? "",
                                  status: e.status,
                                  enrolledOn: e.enrolledOn,
                                  endedOn: e.endedOn ?? "",
                                });
                                setEnrollmentError(null);
                                setEnrollmentOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                          )}
                          {canManageClass && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setPlacementForm({
                                  studentEnrollmentId: e.id,
                                  classroomId: "",
                                  startsOn: today(),
                                  endsOn: "",
                                  isPrimary: true,
                                  status: "active",
                                });
                                setPlacementError(null);
                                setPlacementOpen(true);
                              }}
                            >
                              Place in class
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Classroom placements</CardTitle>
              <CardDescription>
                A placement always belongs to one enrolment, and must match its school, academic year
                and grade level.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {detailQuery.data?.placements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No classroom placements yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Classroom</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Primary</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailQuery.data?.placements ?? []).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.classroomId.slice(0, 8)}…</TableCell>
                        <TableCell className="text-xs">
                          {p.startsOn}
                          {p.endsOn ? ` → ${p.endsOn}` : ""}
                        </TableCell>
                        <TableCell>{p.isPrimary ? "Yes" : "No"}</TableCell>
                        <TableCell>
                          <StatusBadge status={p.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {canManageClass && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setPlacementForm({
                                  id: p.id,
                                  studentEnrollmentId: p.studentEnrollmentId,
                                  classroomId: p.classroomId,
                                  startsOn: p.startsOn,
                                  endsOn: p.endsOn ?? "",
                                  isPrimary: p.isPrimary,
                                  status: p.status,
                                });
                                setPlacementError(null);
                                setPlacementOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Guardians</CardTitle>
                <CardDescription>
                  Parent portal access is derived from these active relationships.
                </CardDescription>
              </div>
              {canManageGuardian && (
                <Button
                  size="sm"
                  onClick={() => {
                    setLinkForm({
                      guardianId: "",
                      relationshipType: "",
                      isPrimary: false,
                      canViewAcademic: true,
                      canViewAttendance: true,
                      canReceiveNotification: true,
                      status: "active",
                    });
                    setLinkError(null);
                    setLinkOpen(true);
                  }}
                >
                  Link guardian
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {detailQuery.data?.links.length === 0 ? (
                <p className="text-sm text-muted-foreground">No guardians linked yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guardian</TableHead>
                      <TableHead>Relationship</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailQuery.data?.links ?? []).map((link) => {
                      const guardian = detailQuery.data?.guardians.find(
                        (g) => g.id === link.guardianId,
                      );
                      return (
                        <TableRow key={link.id}>
                          <TableCell>
                            <Link
                              to="/guardians/$guardianId"
                              params={{ guardianId: link.guardianId }}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {guardian?.fullName ?? "Guardian"}
                            </Link>
                            {link.isPrimary && (
                              <p className="text-xs text-muted-foreground">Primary contact</p>
                            )}
                          </TableCell>
                          <TableCell className="capitalize">{link.relationshipType}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {[
                              link.canViewAcademic ? "Academic" : null,
                              link.canViewAttendance ? "Attendance" : null,
                              link.canReceiveNotification ? "Notifications" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "No access"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={link.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            {canManageGuardian && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setLinkForm({
                                    id: link.id,
                                    guardianId: link.guardianId,
                                    relationshipType: link.relationshipType,
                                    isPrimary: link.isPrimary,
                                    canViewAcademic: link.canViewAcademic,
                                    canViewAttendance: link.canViewAttendance,
                                    canReceiveNotification: link.canReceiveNotification,
                                    status: link.status,
                                  });
                                  setLinkError(null);
                                  setLinkOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </QueryState>

      <FormDialog
        open={enrollmentOpen}
        onOpenChange={setEnrollmentOpen}
        title={enrollmentForm.id ? "Edit enrolment" : "Add enrolment"}
        description="Enrol this student into a school, academic year and grade level."
        submitting={enrollmentMutation.isPending}
        error={enrollmentError}
        onSubmit={submitEnrollment}
      >
        <Field label="School">
          <Select
            value={enrollmentForm.schoolId}
            onValueChange={(v) =>
              setEnrollmentForm({ ...enrollmentForm, schoolId: v, academicYearId: "", gradeLevelId: "" })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a school" />
            </SelectTrigger>
            <SelectContent>
              {schools.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Academic year">
            <Select
              value={enrollmentForm.academicYearId}
              onValueChange={(v) => setEnrollmentForm({ ...enrollmentForm, academicYearId: v })}
              disabled={!enrollmentForm.schoolId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a year" />
              </SelectTrigger>
              <SelectContent>
                {(yearsQuery.data ?? []).map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Grade level">
            <Select
              value={enrollmentForm.gradeLevelId}
              onValueChange={(v) => setEnrollmentForm({ ...enrollmentForm, gradeLevelId: v })}
              disabled={!enrollmentForm.schoolId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a grade" />
              </SelectTrigger>
              <SelectContent>
                {(gradesQuery.data ?? []).map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Student number" htmlFor="studentNumber">
            <Input
              id="studentNumber"
              value={enrollmentForm.studentNumber}
              onChange={(e) =>
                setEnrollmentForm({ ...enrollmentForm, studentNumber: e.target.value })
              }
            />
          </Field>
          <Field label="Enrolment number" htmlFor="enrollmentNumber">
            <Input
              id="enrollmentNumber"
              value={enrollmentForm.enrollmentNumber}
              onChange={(e) =>
                setEnrollmentForm({ ...enrollmentForm, enrollmentNumber: e.target.value })
              }
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Enrolled on" htmlFor="enrolledOn">
            <Input
              id="enrolledOn"
              type="date"
              value={enrollmentForm.enrolledOn}
              onChange={(e) => setEnrollmentForm({ ...enrollmentForm, enrolledOn: e.target.value })}
              required
            />
          </Field>
          <Field label="Ended on" htmlFor="endedOn">
            <Input
              id="endedOn"
              type="date"
              value={enrollmentForm.endedOn}
              onChange={(e) => setEnrollmentForm({ ...enrollmentForm, endedOn: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <Select
              value={enrollmentForm.status}
              onValueChange={(v) => setEnrollmentForm({ ...enrollmentForm, status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENROLLMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormDialog>

      <FormDialog
        open={placementOpen}
        onOpenChange={setPlacementOpen}
        title={placementForm.id ? "Edit classroom placement" : "Place in classroom"}
        description="The classroom must belong to the same school, academic year and grade level as the enrolment."
        submitting={placementMutation.isPending}
        error={placementError}
        onSubmit={submitPlacement}
      >
        <Field label="Enrolment">
          <Select
            value={placementForm.studentEnrollmentId}
            onValueChange={(v) =>
              setPlacementForm({ ...placementForm, studentEnrollmentId: v, classroomId: "" })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an enrolment" />
            </SelectTrigger>
            <SelectContent>
              {(detailQuery.data?.enrollments ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {schoolName(e.schoolId)} · {e.enrolledOn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Classroom">
          <Select
            value={placementForm.classroomId}
            onValueChange={(v) => setPlacementForm({ ...placementForm, classroomId: v })}
            disabled={!placementEnrollment}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a classroom" />
            </SelectTrigger>
            <SelectContent>
              {(placementClassroomsQuery.data ?? [])
                .filter((c) => c.gradeLevelId === placementEnrollment?.gradeLevelId)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Starts on" htmlFor="startsOn">
            <Input
              id="startsOn"
              type="date"
              value={placementForm.startsOn}
              onChange={(e) => setPlacementForm({ ...placementForm, startsOn: e.target.value })}
              required
            />
          </Field>
          <Field label="Ends on" htmlFor="endsOn">
            <Input
              id="endsOn"
              type="date"
              value={placementForm.endsOn}
              onChange={(e) => setPlacementForm({ ...placementForm, endsOn: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <Select
              value={placementForm.status}
              onValueChange={(v) => setPlacementForm({ ...placementForm, status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASS_ENROLLMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="isPrimaryClass"
            checked={placementForm.isPrimary}
            onCheckedChange={(v) => setPlacementForm({ ...placementForm, isPrimary: v === true })}
          />
          <Label htmlFor="isPrimaryClass">Primary classroom for this enrolment</Label>
        </div>
      </FormDialog>

      <FormDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        title={linkForm.id ? "Edit guardian relationship" : "Link guardian"}
        description="Guardian access to this student is granted through the relationship flags below."
        submitting={linkMutation.isPending}
        error={linkError}
        onSubmit={submitLink}
      >
        <Field label="Guardian">
          <Select
            value={linkForm.guardianId}
            onValueChange={(v) => setLinkForm({ ...linkForm, guardianId: v })}
            disabled={Boolean(linkForm.id)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a guardian" />
            </SelectTrigger>
            <SelectContent>
              {(guardiansQuery.data?.rows ?? []).map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Relationship"
          htmlFor="relationshipType"
          hint="For example: mother, father, uncle, legal guardian."
        >
          <Input
            id="relationshipType"
            value={linkForm.relationshipType}
            onChange={(e) => setLinkForm({ ...linkForm, relationshipType: e.target.value })}
            required
          />
        </Field>
        <Field label="Status">
          <Select value={linkForm.status} onValueChange={(v) => setLinkForm({ ...linkForm, status: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STUDENT_GUARDIAN_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="space-y-2">
          {(
            [
              ["isPrimary", "Primary contact"],
              ["canViewAcademic", "Can view academic records"],
              ["canViewAttendance", "Can view attendance"],
              ["canReceiveNotification", "Can receive notifications"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <Checkbox
                id={key}
                checked={linkForm[key]}
                onCheckedChange={(v) => setLinkForm({ ...linkForm, [key]: v === true })}
              />
              <Label htmlFor={key}>{label}</Label>
            </div>
          ))}
        </div>
      </FormDialog>
    </SisPage>
  );
}
