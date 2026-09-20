import { createFileRoute } from "@tanstack/react-router";
import { StaffAttendancePage } from "@/components/teacher-daily-operations/staff-attendance-ui";

export const Route = createFileRoute("/_authenticated/staff-attendance/")({
  component: StaffAttendancePage,
});
