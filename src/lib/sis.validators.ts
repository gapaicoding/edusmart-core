import { z } from "zod";

/** Shared scope validators for the SIS server functions. */

export const orgRecordSchema = z.object({
  organizationId: z.string().uuid(),
  id: z.string().uuid(),
});

export function orgRecordInput(input: unknown) {
  return orgRecordSchema.parse(input);
}
