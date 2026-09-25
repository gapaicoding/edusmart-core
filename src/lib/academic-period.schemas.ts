import { z } from "zod";

const uuid = z.string().uuid();
const requestId = z.string().uuid();

export const periodReadinessInput = z.object({
  schoolId: uuid,
  periodId: uuid,
});

export const periodCommandInput = z.object({
  schoolId: uuid,
  periodId: uuid,
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  requestId,
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const periodReopenInput = periodCommandInput.extend({
  reason: z.string().trim().min(3, "A reason is required to reopen a period").max(1000),
});

export type PeriodReadiness = {
  period_type: "term" | "academic_year";
  period_id: string;
  name: string;
  status: string;
  ready: boolean;
  blockers: { code: string; count: number; severity: "blocker" }[];
  warnings: { code: string; count: number; severity: "warning" }[];
  academic_year_id?: string;
  academic_year_status?: string;
};

export type PeriodCommandResult = {
  period_id: string;
  period_type: "term" | "academic_year";
  status: string;
  updated_at: string;
  closed_at?: string | null;
  closed_by_profile_id?: string | null;
  reopened_at?: string | null;
};
