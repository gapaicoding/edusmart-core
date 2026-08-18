import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Field, FormDialog, Pager, QueryState, SisPage, StatusBadge } from "@/components/sis/sis-ui";
import { useAppContext } from "@/lib/app-context";
import { listStaff, saveStaffMember } from "@/lib/sis.functions";
import { PERSON_STATUSES, STAFF_KINDS } from "@/lib/sis.schemas";
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

export const Route = createFileRoute("/_authenticated/staff/")({
  component: StaffPage,
  head: () => ({
    meta: [
      { title: "Staff · EduSmart SchoolOS" },
      {
        name: "description",
        content:
          "Manage organization-level staff records and their school assignments across the tenant.",
      },
      { property: "og:title", content: "Staff · EduSmart SchoolOS" },
      {
        property: "og:description",
        content: "Staff directory with school assignments for the active organization.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ALL = "__all__";

type StaffFormState = {
  id?: string;
  fullName: string;
  staffKind: string;
  status: string;
};

const EMPTY_FORM: StaffFormState = { fullName: "", staffKind: "teacher", status: "active" };

function StaffPage() {
  const { activeOrganization, activeSchool, hasPermission } = useAppContext();
  const queryClient = useQueryClient();
  const fetchStaff = useServerFn(listStaff);
  const persistStaff = useServerFn(saveStaffMember);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [staffKind, setStaffKind] = useState(ALL);
  const [assignmentScope, setAssignmentScope] = useState<"all" | "assigned" | "unassigned">("all");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<StaffFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const organizationId = activeOrganization?.organizationId ?? null;
  const schools = activeOrganization?.schools ?? [];

  const filters = useMemo(
    () => ({
      organizationId: organizationId!,
      schoolId: assignmentScope === "assigned" ? (activeSchool?.id ?? null) : null,
      assignmentScope,
      staffKind: staffKind === ALL ? null : staffKind,
      status: status === ALL ? null : status,
      search: search || null,
      page,
      pageSize: 25,
    }),
    [organizationId, assignmentScope, activeSchool, staffKind, status, search, page],
  );

  const staffQuery = useQuery({
    queryKey: ["sis", "staff", filters],
    queryFn: () => fetchStaff({ data: filters }),
    enabled: Boolean(organizationId) && hasPermission("staff.read"),
  });

  const mutation = useMutation({
    mutationFn: (input: StaffFormState) =>
      persistStaff({
        data: {
          id: input.id,
          organizationId: organizationId!,
          fullName: input.fullName,
          staffKind: input.staffKind,
          status: input.status,
        },
      }),
    onSuccess: () => {
      setDialogOpen(false);
      setFormError(null);
      toast.success("Staff member saved");
      void queryClient.invalidateQueries({ queryKey: ["sis", "staff"] });
    },
    onError: (error: unknown) =>
      setFormError(error instanceof Error ? error.message : "We couldn't save this staff member."),
  });

  const canCreate = hasPermission("staff.create");
  const canUpdate = hasPermission("staff.update");
  const schoolName = (id: string) => schools.find((s) => s.id === id)?.name ?? "Other school";

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
      title="Staff"
      description="Staff identity belongs to the organization; working at a school is a separate assignment."
      readPermission="staff.read"
      actions={
        canCreate ? (
          <Button
            onClick={() => {
              setForm(EMPTY_FORM);
              setFormError(null);
              setDialogOpen(true);
            }}
            disabled={!organizationId}
          >
            Add staff member
          </Button>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Search name"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            value={staffKind}
            onValueChange={(v) => {
              setStaffKind(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Staff kind" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All staff kinds</SelectItem>
              {STAFF_KINDS.map((k) => (
                <SelectItem key={k} value={k} className="capitalize">
                  {k.replace("_", " ")}
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
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {PERSON_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={assignmentScope}
            onValueChange={(v) => {
              setAssignmentScope(v as "all" | "assigned" | "unassigned");
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accessible staff</SelectItem>
              <SelectItem value="assigned" disabled={!activeSchool}>
                Assigned to {activeSchool?.name ?? "active school"}
              </SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <QueryState
          isLoading={staffQuery.isPending}
          error={staffQuery.error}
          isEmpty={(staffQuery.data?.rows.length ?? 0) === 0}
          emptyTitle="No staff match these filters"
          emptyDescription="Adjust the filters above, or add a staff member to get started."
          onRetry={() => void staffQuery.refetch()}
          columns={5}
        >
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>School assignments</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(staffQuery.data?.rows ?? []).map((row) => {
                  const assignments = staffQuery.data?.assignments[row.id] ?? [];
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          to="/staff/$staffId"
                          params={{ staffId: row.id }}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {row.fullName}
                        </Link>
                        {!row.hasLogin && (
                          <p className="text-xs text-muted-foreground">No portal login linked</p>
                        )}
                      </TableCell>
                      <TableCell className="capitalize">{row.staffKind.replace("_", " ")}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {assignments.length === 0
                          ? "Unassigned"
                          : assignments
                              .filter((a) => a.status === "active")
                              .map((a) => schoolName(a.schoolId))
                              .join(" · ") || "No active assignment"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {canUpdate && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setForm({
                                id: row.id,
                                fullName: row.fullName,
                                staffKind: row.staffKind,
                                status: row.status,
                              });
                              setFormError(null);
                              setDialogOpen(true);
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
            <Pager
              page={staffQuery.data?.page ?? 1}
              pageSize={staffQuery.data?.pageSize ?? 25}
              total={staffQuery.data?.total ?? 0}
              onPageChange={setPage}
            />
          </>
        </QueryState>
      </div>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={form.id ? "Edit staff member" : "Add staff member"}
        description="School assignments are managed from the staff member's profile."
        submitting={mutation.isPending}
        error={formError}
        onSubmit={submit}
      >
        <Field label="Full name" htmlFor="staffName">
          <Input
            id="staffName"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Staff kind">
            <Select value={form.staffKind} onValueChange={(v) => setForm({ ...form, staffKind: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_KINDS.map((k) => (
                  <SelectItem key={k} value={k} className="capitalize">
                    {k.replace("_", " ")}
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
                {PERSON_STATUSES.map((s) => (
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
