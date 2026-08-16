import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { QueryState, SisPage, StatusBadge } from "@/components/sis/sis-ui";
import { useAppContext } from "@/lib/app-context";
import { getGuardianDetail } from "@/lib/sis.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/guardians/$guardianId")({
  component: GuardianDetailPage,
  head: () => ({
    meta: [
      { title: "Guardian profile · EduSmart SchoolOS" },
      {
        name: "description",
        content: "Guardian contact details and the students this guardian is related to.",
      },
      { property: "og:title", content: "Guardian profile · EduSmart SchoolOS" },
      {
        property: "og:description",
        content: "Guardian contact details and related students.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function GuardianDetailPage() {
  const { guardianId } = Route.useParams();
  const { activeOrganization, hasPermission } = useAppContext();
  const fetchDetail = useServerFn(getGuardianDetail);
  const organizationId = activeOrganization?.organizationId ?? null;

  const detailQuery = useQuery({
    queryKey: ["sis", "guardian", guardianId, organizationId],
    queryFn: () => fetchDetail({ data: { id: guardianId, organizationId: organizationId! } }),
    enabled: Boolean(organizationId) && hasPermission("guardian.read"),
  });

  const guardian = detailQuery.data?.guardian;

  return (
    <SisPage
      title={guardian?.fullName ?? "Guardian profile"}
      description="Contact details and related students."
      readPermission="guardian.read"
      actions={
        <Button variant="outline" asChild>
          <Link to="/guardians">Back to guardians</Link>
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
              <CardTitle className="text-base">Contact</CardTitle>
              <CardDescription>Organization-level guardian record.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p>{guardian?.phone ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p>{guardian?.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Occupation</p>
                <p>{guardian?.occupation ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                {guardian && <StatusBadge status={guardian.status} />}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Related students</CardTitle>
              <CardDescription>
                Parent portal access follows these active relationships only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {detailQuery.data?.links.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No students linked yet. Link this guardian from a student profile.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Relationship</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailQuery.data?.links ?? []).map((link) => {
                      const student = detailQuery.data?.students.find((s) => s.id === link.studentId);
                      return (
                        <TableRow key={link.id}>
                          <TableCell>
                            <Link
                              to="/students/$studentId"
                              params={{ studentId: link.studentId }}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {student?.fullName ?? "Student"}
                            </Link>
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
    </SisPage>
  );
}
