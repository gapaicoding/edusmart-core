import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Field, FormDialog, Pager, QueryState, SisPage, StatusBadge } from "@/components/sis/sis-ui";
import { useAppContext } from "@/lib/app-context";
import { listGuardians, saveGuardian } from "@/lib/sis.functions";
import { PERSON_STATUSES } from "@/lib/sis.schemas";
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

export const Route = createFileRoute("/_authenticated/guardians/")({
  component: GuardiansPage,
  head: () => ({
    meta: [
      { title: "Guardians · EduSmart SchoolOS" },
      {
        name: "description",
        content:
          "Manage guardian records and the family relationships that drive parent portal access.",
      },
      { property: "og:title", content: "Guardians · EduSmart SchoolOS" },
      {
        property: "og:description",
        content: "Guardian directory and student relationships for the active organization.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ALL = "__all__";

type GuardianFormState = {
  id?: string;
  fullName: string;
  phone: string;
  email: string;
  occupation: string;
  status: string;
};

const EMPTY_FORM: GuardianFormState = {
  fullName: "",
  phone: "",
  email: "",
  occupation: "",
  status: "active",
};

function GuardiansPage() {
  const { activeOrganization, hasPermission } = useAppContext();
  const queryClient = useQueryClient();
  const fetchGuardians = useServerFn(listGuardians);
  const persistGuardian = useServerFn(saveGuardian);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<GuardianFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const organizationId = activeOrganization?.organizationId ?? null;

  const filters = useMemo(
    () => ({
      organizationId: organizationId!,
      status: status === ALL ? null : status,
      search: search || null,
      page,
      pageSize: 25,
    }),
    [organizationId, status, search, page],
  );

  const guardiansQuery = useQuery({
    queryKey: ["sis", "guardians", filters],
    queryFn: () => fetchGuardians({ data: filters }),
    enabled: Boolean(organizationId) && hasPermission("guardian.read"),
  });

  const mutation = useMutation({
    mutationFn: (input: GuardianFormState) =>
      persistGuardian({
        data: {
          id: input.id,
          organizationId: organizationId!,
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          occupation: input.occupation,
          status: input.status,
        },
      }),
    onSuccess: () => {
      setDialogOpen(false);
      setFormError(null);
      toast.success("Guardian saved");
      void queryClient.invalidateQueries({ queryKey: ["sis", "guardians"] });
    },
    onError: (error: unknown) =>
      setFormError(error instanceof Error ? error.message : "We couldn't save this guardian."),
  });

  const canManage = hasPermission("guardian.manage");

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
      title="Guardians"
      description="Guardians are organization-level people linked to students through family relationships."
      readPermission="guardian.read"
      actions={
        canManage ? (
          <Button
            onClick={() => {
              setForm(EMPTY_FORM);
              setFormError(null);
              setDialogOpen(true);
            }}
            disabled={!organizationId}
          >
            Add guardian
          </Button>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            placeholder="Search name, phone or email"
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
              {PERSON_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <QueryState
          isLoading={guardiansQuery.isPending}
          error={guardiansQuery.error}
          isEmpty={(guardiansQuery.data?.rows.length ?? 0) === 0}
          emptyTitle="No guardians match these filters"
          emptyDescription="Adjust the filters above, or add a guardian to get started."
          onRetry={() => void guardiansQuery.refetch()}
          columns={5}
        >
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Portal login</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(guardiansQuery.data?.rows ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        to="/guardians/$guardianId"
                        params={{ guardianId: row.id }}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {row.fullName}
                      </Link>
                      {row.occupation && (
                        <p className="text-xs text-muted-foreground">{row.occupation}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{row.phone ?? "—"}</TableCell>
                    <TableCell className="text-xs">{row.email ?? "—"}</TableCell>
                    <TableCell className="text-xs">{row.hasLogin ? "Linked" : "Not linked"}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setForm({
                              id: row.id,
                              fullName: row.fullName,
                              phone: row.phone ?? "",
                              email: row.email ?? "",
                              occupation: row.occupation ?? "",
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
                ))}
              </TableBody>
            </Table>
            <Pager
              page={guardiansQuery.data?.page ?? 1}
              pageSize={guardiansQuery.data?.pageSize ?? 25}
              total={guardiansQuery.data?.total ?? 0}
              onPageChange={setPage}
            />
          </>
        </QueryState>
      </div>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={form.id ? "Edit guardian" : "Add guardian"}
        description="Guardian contact details. Student relationships are managed from a student's profile."
        submitting={mutation.isPending}
        error={formError}
        onSubmit={submit}
      >
        <Field label="Full name" htmlFor="guardianName">
          <Input
            id="guardianName"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="guardianPhone">
            <Input
              id="guardianPhone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Email" htmlFor="guardianEmail">
            <Input
              id="guardianEmail"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Occupation" htmlFor="guardianOccupation">
          <Input
            id="guardianOccupation"
            value={form.occupation}
            onChange={(e) => setForm({ ...form, occupation: e.target.value })}
          />
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
      </FormDialog>
    </SisPage>
  );
}
