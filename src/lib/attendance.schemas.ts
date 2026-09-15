import { z } from "zod";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
export const postgresTimestampSchema = z.string().datetime({ offset: true });

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
    requestId: uuid.optional(),
    acknowledgeCalendarImpact: z.boolean().optional(),
    acknowledgeCollision: z.boolean().optional(),
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
    requestId: uuid.optional(),
    acknowledgeCalendarImpact: z.boolean().optional(),
    acknowledgeCollision: z.boolean().optional(),
  }),
]);

export const attendanceSessionInput = attendanceScopeInput.extend({ id: uuid });

export const saveAttendanceRecordInput = attendanceScopeInput
  .extend({
    sessionId: uuid,
    sessionStatus: z.enum(ATTENDANCE_SESSION_STATUSES),
    recordId: uuid.optional(),
    studentEnrollmentId: uuid,
    status: z.enum(STUDENT_ATTENDANCE_STATUSES),
    note: z.string().trim().max(500).nullable().optional(),
    correctionReason: z.string().trim().max(500).nullable().optional(),
    expectedUpdatedAt: postgresTimestampSchema.optional(),
    expectedSessionUpdatedAt: postgresTimestampSchema,
    requestId: uuid.optional(),
  })
  .superRefine((value, context) => {
    if (value.sessionStatus !== "open" && (!value.recordId || !value.correctionReason)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correctionReason"],
        message:
          "Finalized attendance requires an existing record and a meaningful correction reason.",
      });
    }
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
    if (value.recordId && !value.expectedUpdatedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedUpdatedAt"],
        message: "Updating an existing attendance record requires the current updated_at token.",
      });
    }
  });

export const attendanceLifecycleInput = attendanceScopeInput.extend({
  id: uuid,
  action: z.enum(["submit", "lock"]),
  expectedUpdatedAt: postgresTimestampSchema,
  requestId: uuid.optional(),
});

export const attendanceHistoryInput = attendanceScopeInput
  .extend({
    from: date,
    to: date,
    classroomId: uuid.optional(),
    status: z.enum(ATTENDANCE_SESSION_STATUSES).optional(),
    studentId: uuid.optional(),
    offset: z.number().int().min(0).default(0),
    pageSize: z.number().int().min(1).max(100).default(50),
  })
  .refine((value) => Date.parse(value.to) >= Date.parse(value.from), {
    message: "Attendance history end date must not precede the start date.",
    path: ["to"],
  })
  .refine((value) => (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 <= 366, {
    message: "Attendance history range cannot exceed 366 days.",
    path: ["to"],
  });

const draftRecord = z.object({
  studentEnrollmentId: uuid,
  status: z.enum(STUDENT_ATTENDANCE_STATUSES),
  note: z.string().trim().max(500).nullable().optional(),
  expectedUpdatedAt: postgresTimestampSchema.optional(),
});

export const saveAttendanceDraftInput = attendanceScopeInput.extend({
  sessionId: uuid,
  expectedSessionUpdatedAt: postgresTimestampSchema,
  requestId: uuid,
  records: z.array(draftRecord).min(1).max(500),
});

export const staffStudentAttendanceHistoryInput = attendanceScopeInput
  .extend({
    studentId: uuid,
    from: date,
    to: date,
    offset: z.number().int().min(0).default(0),
    pageSize: z.number().int().min(1).max(100).default(50),
  })
  .refine((value) => Date.parse(value.to) >= Date.parse(value.from), { path: ["to"] })
  .refine((value) => (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 <= 366, {
    path: ["to"],
  });

export const attendanceCorrectionsInput = attendanceScopeInput.extend({
  recordId: uuid,
  offset: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(100).default(50),
});
