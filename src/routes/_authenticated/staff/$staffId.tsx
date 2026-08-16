import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Field, FormDialog, QueryState, SisPage, StatusBadge } from "@/components/sis/sis-ui";
import { useAppContext } from "@/lib/app-context";
import { getStaffDetail, saveStaffAssignment } from "@/lib/sis.functions";
import { STAFF_ASSIGNMENT_STATUSES } from "@/lib/sis.schemas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export const Route = createFileRoute("/_authenticated/staff/$staffId")({
  component: StaffDetailPage,
  head: () => ({
    meta: [
      { title: "Staff profile · EduSmart SchoolOS" },
      {
        name: "description",
        content: "Staff member profile with school assignments and employment details.",
      },
      { property: "og:title", content: "Staff profile · EduSmart SchoolOS" },
      {
        property: "og:description",
        content: "School assignments and employment details for one staff member.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type AssignmentForm = {
  id?: string;
  schoolId: string;
  employeeNumber: string;
  positionTitle: string;
  employmentStatus: string;
  joinedOn: string;
  leftOn: string;
  status: string;
};

function StaffDetailPage() {
  const { staffId } = Route.useParams();
  const { activeOrganization, hasPermission } = useAppContext();
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getStaffDetail);
  const persistAssignment = useServerFn(saveStaffAssignment);

  const organizationId = activeOrganization?.organizationId ?? null;
  const schools = activeOrganization?.schools ?? [];

  const detailQuery = useQuery({
    queryKey: ["sis", "staff", staffId, organizationId],
    queryFn: () => fetchDetail({ data: { id: staffId, organizationId: organizationId! } }),
    enabled: Boolean(organizationId) && hasPermission("staff.read"),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AssignmentForm>({
    schoolId: "",
    employeeNumber: "",
    positionTitle: "",
    employmentStatus: "active",
    joinedOn: "",
    leftOn: "",
    status: "active",
  });
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: AssignmentForm) =>
      persistAssignment({
        data: {
          id: input.id,
          organizationId: organizationId!,
          staffMemberId: staffId,
          schoolId: input.schoolId,
          employeeNumber: input.employeeNumber,
          positionTitle: input.positionTitle,
          employmentStatus: input.employmentStatus,
          joinedOn: input.joinedOn,
          leftOn: input.leftOn,
          status: input.status,
        },
      }),
    onSuccess: () => {
      setOpen(false);
      setFormError(null);
      toast.success("School assignment saved");
      void queryClient.invalidateQueries({ queryKey: ["sis"] });
    },
    onError: (error: unknown) =>
      setFormError(error instanceof Error ? error.message : "We couldn't save this assignment."),
  });

  const canUpdate = hasPermission("staff.update");
  const staff = detailQuery.data?.staff;
  const schoolName = (id: string) => schools.find((s) => s.id === id)?.name ?? id;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.schoolId) {
      setFormError("Select a school for this assignment.");
      return;
    }
    mutation.mutate(form);
  }

  return (
    <SisPage
      title={staff?.fullName ?? "Staff profile"}
      description="Organization-level staff identity with its school assignments."
      readPermission="staff.read"
      actions={
        <Button variant="outline" asChild>
          <Link to="/staff">Back to staff</Link>
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
                Teaching authority comes from teaching assignments, not from this record alone.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Staff kind</p>
                <p className="capitalize">{staff?.staffKind.replace("_", " ") ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Portal login</p>
                <p>{staff?.hasLogin ? "Linked" : "Not linked"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                {staff && <StatusBadge status={staff.status} />}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">School assignments</CardTitle>
                <CardDescription>Which schools this person works at, and since when.</CardDescription>
              </div>
              {canUpdate && (
                <Button
                  size="sm"
                  onClick={() => {
                    setForm({
                      schoolId: schools[0]?.id ?? "",
                      employeeNumber: "",
                      positionTitle: "",
                      employmentStatus: "active",
                      joinedOn: "",
                      leftOn: "",
                      status: "active",
                    });
                    setFormError(null);
                    setOpen(true);
                  }}
                >
                  Assign to school
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {detailQuery.data?.assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No school assignments yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>School</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailQuery.data?.assignments ?? []).map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{schoolName(a.schoolId)}</TableCell>
                        <TableCell className="text-xs">
                          {a.positionTitle ?? "—"}
                          {a.employeeNumber ? ` · ${a.employeeNumber}` : ""}
                        </TableCell>
                        <TableCell className="text-xs">
                          {a.joinedOn ?? "—"}
                          {a.leftOn ? ` → ${a.leftOn}` : ""}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={a.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {canUpdate && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setForm({
                                  id: a.id,
                                  schoolId: a.schoolId,
                                  employeeNumber: a.employeeNumber ?? "",
                                  positionTitle: a.positionTitle ?? "",
                                  employmentStatus: a.employmentStatus,
                                  joinedOn: a.joinedOn ?? "",
                                  leftOn: a.leftOn ?? "",
                                  status: a.status,
                                });
                                setFormError(null);
                                setOpen(true);
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
        </div>
      </QueryState>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={form.id ? "Edit school assignment" : "Assign to school"}
        description="The school must belong to the same organization as this staff member."
        submitting={mutation.isPending}
        error={formError}
        onSubmit={submit}
      >
        <Field label="School">
          <Select value={form.schoolId} onValueChange={(v) => setForm({ ...form, schoolId: v })}>
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
          <Field label="Position title" htmlFor="positionTitle">
            <Input
              id="positionTitle"
              value={form.positionTitle}
              onChange={(e) => setForm({ ...form, positionTitle: e.target.value })}
            />
          </Field>
          <Field label="Employee number" htmlFor="employeeNumber">
            <Input
              id="employeeNumber"
              value={form.employeeNumber}
              onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Joined on" htmlFor="joinedOn">
            <Input
              id="joinedOn"
              type="date"
              value={form.joinedOn}
              onChange={(e) => setForm({ ...form, joinedOn: e.target.value })}
            />
          </Field>
          <Field label="Left on" htmlFor="leftOn">
            <Input
              id="leftOn"
              type="date"
              value={form.leftOn}
              onChange={(e) => setForm({ ...form, leftOn: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Employment status"
            htmlFor="employmentStatus"
            hint="Free text, for example: permanent, contract, part-time."
          >
            <Input
              id="employmentStatus"
              value={form.employmentStatus}
              onChange={(e) => setForm({ ...form, employmentStatus: e.target.value })}
              required
            />
          </Field>
          <Field label="Assignment status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ASSIGNMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormDialog>
    </SisPage>
  );
}
