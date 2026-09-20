import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, Pencil, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/lib/app-context";
import { listStaff } from "@/lib/sis.functions";
import {
  listMyStaffAttendance,
  listStaffAttendance,
  manageStaffAttendance,
} from "@/lib/teacher-daily-operations.functions";
import { B13DomainError } from "@/lib/teacher-daily-operations.server";

type Row = {
  [key: string]: unknown;
  staff_member_id?: unknown;
  attendance_date?: unknown;
  status?: unknown;
  note?: unknown;
  version?: unknown;
  attendance_record_id?: unknown;
  staff_name?: unknown;
};
const STATUSES = ["present", "late", "excused", "sick", "absent", "leave", "other"] as const;
const today = () => new Date().toLocaleDateString("en-CA");
const text = (v: unknown) => (typeof v === "string" ? v : "");
const id = (v: unknown) => (typeof v === "string" ? v : "");
const dateText = (v: unknown) => text(v).slice(0, 10);
const label = (v: unknown) =>
  text(v)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "—";
const safeError = (error: unknown) => {
  const code = error instanceof B13DomainError ? error.code : "";
  return (
    (
      {
        B13_TDO_AUTH_REQUIRED: "Your session is required to continue.",
        B13_TDO_SCOPE_DENIED: "You do not have permission to manage this data.",
        B13_TDO_STALE_VERSION:
          "This attendance record changed elsewhere. Refresh it before saving again.",
        B13_TDO_STAFF_ASSIGNMENT_INVALID:
          "That staff member is not eligible for this school and date.",
        B13_TDO_ATTENDANCE_INVALID: "The attendance details are not valid.",
      } as Record<string, string>
    )[code] ?? "We couldn't complete that request. Please try again."
  );
};

function Frame({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Staff Attendance</h1>
          <p className="text-sm text-muted-foreground">
            School-scoped operational attendance and read-only personal history.
          </p>
        </div>
        {children}
      </div>
    </AppShell>
  );
}

function AttendanceForm({
  row,
  onClose,
  onSaved,
}: {
  row: Row | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { activeSchool, activeOrganization } = useAppContext();
  const fetchStaff = useServerFn(listStaff);
  const save = useServerFn(manageStaffAttendance);
  const queryClient = useQueryClient();
  const pending = useRef<string | null>(null);
  const [staffMemberId, setStaffMemberId] = useState(id(row?.staff_member_id));
  const [attendanceDate, setAttendanceDate] = useState(dateText(row?.attendance_date) || today());
  const [status, setStatus] = useState(text(row?.status) || "present");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [note, setNote] = useState(text(row?.note));
  const [error, setError] = useState<string | null>(null);
  const staffQuery = useQuery({
    queryKey: ["b13-staff-attendance", "eligible-staff", activeSchool?.id],
    queryFn: () =>
      fetchStaff({
        data: {
          organizationId: activeOrganization!.organizationId,
          schoolId: activeSchool!.id,
          assignmentScope: "assigned",
          staffKind: null,
          status: "active",
          search: null,
          page: 1,
          pageSize: 100,
        },
      }),
    enabled: Boolean(activeSchool?.id),
  });
  const mutation = useMutation({
    mutationFn: () => {
      pending.current ??= crypto.randomUUID();
      return save({
        data: {
          requestId: pending.current,
          staffMemberId,
          attendanceDate,
          status: status as (typeof STATUSES)[number],
          checkInAt: checkIn ? new Date(checkIn).toISOString() : null,
          checkOutAt: checkOut ? new Date(checkOut).toISOString() : null,
          note: note || null,
          expectedVersion: row ? Number(row.version) : null,
        },
      });
    },
    onSuccess: () => {
      pending.current = null;
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["b13-staff-attendance"] });
      onSaved();
    },
    onError: (e) => {
      pending.current = null;
      setError(safeError(e));
    },
  });
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={row ? "Edit staff attendance" : "Create staff attendance"}
    >
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <CardHeader>
          <CardTitle>{row ? "Edit attendance record" : "Create attendance record"}</CardTitle>
          <CardDescription>
            Attendance management requires the authorized school operational scope.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Action not completed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Staff</Label>
                <Select
                  value={staffMemberId}
                  onValueChange={setStaffMemberId}
                  disabled={Boolean(row) || mutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {(staffQuery.data?.rows ?? []).map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="attendance-date">Attendance Date</Label>
                <Input
                  id="attendance-date"
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus} disabled={mutation.isPending}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {label(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="attendance-check-in">Check-in</Label>
                <Input
                  id="attendance-check-in"
                  type="datetime-local"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="attendance-check-out">Check-out</Label>
                <Input
                  id="attendance-check-out"
                  type="datetime-local"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="attendance-note">Note</Label>
              <Textarea
                id="attendance-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !staffMemberId || !attendanceDate}
              >
                {mutation.isPending ? "Saving…" : "Save Attendance"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function StaffAttendancePage() {
  const { activeSchool, activeOrganization, hasPermission } = useAppContext();
  const canManage = hasPermission("staff_attendance.manage");
  const canRead = hasPermission("staff_attendance.read");
  const canSelf = hasPermission("staff_attendance.self.read");
  const fetchManager = useServerFn(listStaffAttendance);
  const fetchSelf = useServerFn(listMyStaffAttendance);
  const [date, setDate] = useState(today());
  const [status, setStatus] = useState("all");
  const [dialog, setDialog] = useState<Row | null | undefined>(undefined);
  const managerQuery = useQuery({
    queryKey: ["b13-staff-attendance", "manager", activeSchool?.id, date, status],
    queryFn: () =>
      fetchManager({
        data: {
          schoolId: activeSchool!.id,
          from: date,
          to: date,
          status: status === "all" ? null : (status as (typeof STATUSES)[number]),
          staffMemberId: null,
          page: 1,
          pageSize: 100,
        },
      }),
    enabled: Boolean(activeSchool?.id) && (canManage || canRead),
  });
  const selfQuery = useQuery({
    queryKey: ["b13-staff-attendance", "self", date, status],
    queryFn: () =>
      fetchSelf({
        data: {
          from: date,
          to: date,
          status: status === "all" ? null : (status as (typeof STATUSES)[number]),
          page: 1,
          pageSize: 100,
        },
      }),
    enabled: canSelf,
  });
  const managerContent = (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>School attendance</CardTitle>
          <CardDescription>Manager view is bounded and school-scoped.</CardDescription>
        </div>
        {canManage && (
          <Button onClick={() => setDialog(null)}>
            <Plus className="mr-2 h-4 w-4" />
            Add attendance
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Input
            aria-label="Attendance date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {label(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {managerQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : managerQuery.error ? (
          <Alert variant="destructive">
            <AlertTitle>Attendance unavailable</AlertTitle>
            <AlertDescription>{safeError(managerQuery.error)}</AlertDescription>
          </Alert>
        ) : (managerQuery.data ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No staff attendance records match this date/filter.
          </div>
        ) : (
          <div className="space-y-3">
            {((managerQuery.data ?? []) as Row[]).map((row) => (
              <div
                key={id(row.attendance_record_id)}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{text(row.staff_name) || "Staff member"}</p>
                  <p className="text-sm text-muted-foreground">
                    {dateText(row.attendance_date)} · {label(row.status)} ·{" "}
                    {text(row.note) || "No note"}
                  </p>
                </div>
                {canManage && (
                  <Button variant="outline" onClick={() => setDialog(row)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
  const selfContent = (
    <Card>
      <CardHeader>
        <CardTitle>My attendance history</CardTitle>
        <CardDescription>Read-only history for the authenticated staff identity.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Input
            aria-label="My attendance date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {label(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selfQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : selfQuery.error ? (
          <Alert variant="destructive">
            <AlertTitle>Attendance history unavailable</AlertTitle>
            <AlertDescription>{safeError(selfQuery.error)}</AlertDescription>
          </Alert>
        ) : (selfQuery.data ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No attendance history available for this period.
          </div>
        ) : (
          <div className="space-y-3">
            {((selfQuery.data ?? []) as Row[]).map((row) => (
              <div key={id(row.attendance_record_id)} className="rounded-lg border p-4">
                <p className="font-medium">
                  {dateText(row.attendance_date)} · {label(row.status)}
                </p>
                <p className="text-sm text-muted-foreground">{text(row.note) || "No note"}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
  return (
    <Frame>
      {(canManage || canRead) && canSelf ? (
        <Tabs defaultValue={canManage || canRead ? "manage" : "mine"}>
          <TabsList>
            <TabsTrigger value="manage">Manage attendance</TabsTrigger>
            <TabsTrigger value="mine">My attendance</TabsTrigger>
          </TabsList>
          <TabsContent value="manage">{managerContent}</TabsContent>
          <TabsContent value="mine">{selfContent}</TabsContent>
        </Tabs>
      ) : canManage || canRead ? (
        managerContent
      ) : canSelf ? (
        selfContent
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Access unavailable</CardTitle>
            <CardDescription>
              Your active account does not have Staff Attendance permission.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      {dialog !== undefined && (
        <AttendanceForm
          row={dialog ?? undefined}
          onClose={() => setDialog(undefined)}
          onSaved={() => setDialog(undefined)}
        />
      )}
    </Frame>
  );
}
