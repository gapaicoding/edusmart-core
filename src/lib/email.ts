import { z } from "zod";

/**
 * Single source of truth for email validation across every auth surface
 * (sign-in, forgot password, invitation acceptance, invitation issuance).
 *
 * Uses zod's standard email validation — no handcrafted regex — and always
 * trims whitespace and lowercases before validating, so values are stored and
 * sent to Supabase Auth in a normalized form.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { message: "Email is required" })
  .max(255, { message: "Email must be less than 255 characters" })
  .email({ message: "Enter a valid email address" });

/** Returns the normalized email, or an error message when invalid. */
export function parseEmail(value: string): { email: string; error: null } | { email: null; error: string } {
  const result = emailSchema.safeParse(value ?? "");
  if (!result.success) {
    return { email: null, error: result.error.issues[0]?.message ?? "Enter a valid email address" };
  }
  return { email: result.data, error: null };
}
