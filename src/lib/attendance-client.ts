export type AttendanceActionKind = "open" | "draft" | "submit" | "lock" | "correct";

export type StableAction = {
  kind: AttendanceActionKind;
  fingerprint: string;
  requestId: string;
};

type CorrectionCacheRow = {
  recordId: string | null;
  studentEnrollmentId: string;
  status: string | null;
  note: string | null;
  correctionReason: string | null;
  updatedAt: string | null;
};

export function applyAttendanceCorrectionToDetail<T extends { roster: CorrectionCacheRow[] }>(
  detail: T | undefined,
  correction: {
    recordId: string;
    studentEnrollmentId: string;
    status: string;
    note: string;
    correctionReason: string;
    updatedAt: string;
  },
): T | undefined {
  if (!detail) return detail;
  return {
    ...detail,
    roster: detail.roster.map((row) =>
      row.recordId === correction.recordId &&
      row.studentEnrollmentId === correction.studentEnrollmentId
        ? {
            ...row,
            status: correction.status,
            note: correction.note || null,
            correctionReason: correction.correctionReason,
            updatedAt: correction.updatedAt,
          }
        : row,
    ),
  };
}

export function beginStableAction(
  current: StableAction | null,
  kind: AttendanceActionKind,
  fingerprint: string,
): StableAction {
  if (current?.kind === kind && current.fingerprint === fingerprint) return current;
  return { kind, fingerprint, requestId: crypto.randomUUID() };
}

export function retireStableAction(current: StableAction | null, requestId: string) {
  return current?.requestId === requestId ? null : current;
}

export function schoolLocalDate(timeZone: string, instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function formatSchoolTime(value: string | null, timeZone: string): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(value));
}

export function attendanceErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return typeof candidate.code === "string"
    ? candidate.code
    : typeof candidate.cause?.code === "string"
      ? candidate.cause.code
      : null;
}

export function isAttendanceError(error: unknown, code: string): boolean {
  if (attendanceErrorCode(error) === code) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  const safeText: Record<string, string> = {
    CALENDAR_ACK_REQUIRED: "calendar event affecting instruction",
    COLLISION_ACK_REQUIRED: "another attendance session overlaps",
    LOGICAL_SESSION_CONFLICT: "already exists with incompatible details",
    STALE_VERSION: "changed. Refresh",
    INCOMPLETE_ROSTER: "outcome for every roster member",
  };
  return Boolean(safeText[code] && message.toLowerCase().includes(safeText[code]!.toLowerCase()));
}
