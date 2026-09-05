import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");

// corrected is legacy/reserved — no user-reachable transition creates it; kept for filtering historical data
export const ATTENDANCE_SESSION_STATUSES = ["open", "submitted", "locked", "corrected"] as const;
export const STUDENT_ATTENDANCE_STATUSES = [
  "present",
  "late",
  "excused",
  "sick",
  "absent",
  "other",
] as const;

export const attendanceScopeInput = z.object({
  organizationId: uuid,
  schoolId: uuid,
  academicYearId: uuid,
  termId: uuid,
});

export const attendanceListInput = attendanceScopeInput.extend({
  sessionDate: date.optional(),
  classroomId: uuid.optional(),
  status: z.enum(ATTENDANCE_SESSION_STATUSES).optional(),
});

export const attendanceOptionsInput = attendanceScopeInput.extend({ sessionDate: date });

export const openAttendanceSessionInput = z.discriminatedUnion("origin", [
  attendanceScopeInput.extend({
    origin: z.literal("timetable"),
    sessionDate: date,
    timetableEntryId: uuid,
  }),
  attendanceScopeInput.extend({
    origin: z.literal("manual"),
    sessionDate: date,
    classroomId: uuid,
    teachingAssignmentId: uuid.optional(),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    manualReason: z
      .string()
      .trim()
      .min(3, "Explain why this attendance session is manual.")
      .max(500),
  }),
]);

export const attendanceSessionInput = attendanceScopeInput.extend({ id: uuid });

export const saveAttendanceRecordInput = attendanceScopeInput
  .extend({
    sessionId: uuid,
    recordId: uuid.optional(),
    studentEnrollmentId: uuid,
    status: z.enum(STUDENT_ATTENDANCE_STATUSES),
    note: z.string().trim().max(500).nullable().optional(),
    correctionReason: z.string().trim().max(500).nullable().optional(),
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.correctionReason !== undefined &&
      value.correctionReason !== null &&
      value.correctionReason.length < 3
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correctionReason"],
        message: "Correction reason must be meaningful.",
      });
    }
  });

export const attendanceLifecycleInput = attendanceScopeInput.extend({
  id: uuid,
  action: z.enum(["submit", "lock"]),
  expectedUpdatedAt: z.string().datetime(),
});
