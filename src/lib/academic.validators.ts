import { z } from "zod";

/** Scope validators shared by the Academic Setup server functions. */

export const schoolScopeSchema = z.object({ schoolId: z.string().uuid() });

export const yearScopeSchema = z.object({
  schoolId: z.string().uuid(),
  academicYearId: z.string().uuid().nullable().optional(),
});

export function schoolScopeInput(input: unknown) {
  return schoolScopeSchema.parse(input);
}

export function yearScopeInput(input: unknown) {
  return yearScopeSchema.parse(input);
}
