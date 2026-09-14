import {
  SIS_EXTERNAL_REF_PATTERN,
  SIS_CODES,
} from "./sis-import.constants";
import type { ExternalRef } from "./sis-import.types";

export type NormalizeOk<T> = { ok: true; value: T };
export type NormalizeErr = { ok: false; code: string; message: string };
export type NormalizeResult<T> = NormalizeOk<T> | NormalizeErr;

const ok = <T>(value: T): NormalizeOk<T> => ({ ok: true, value });
const err = (code: string, message: string): NormalizeErr => ({ ok: false, code, message });

/** Trim + collapse internal whitespace + Unicode NFC. Used for name-like free text. */
export function normalizeText(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).normalize("NFC").trim().replace(/\s+/g, " ");
  return s.length === 0 ? null : s;
}

/** Preserve raw string identifiers (nisn, employee_number, codes) — never coerce through Number. */
export function normalizeIdentifierText(input: unknown): { value: string | null; warning?: string } {
  if (input === null || input === undefined) return { value: null };
  if (typeof input === "number") {
    // Excel already coerced this cell to a number; leading zeros are unrecoverable.
    return {
      value: String(input),
      warning: "Cell was stored as a number by Excel; leading zeros (if any) could not be recovered.",
    };
  }
  const s = String(input).trim();
  return { value: s.length === 0 ? null : s };
}

export function normalizeEmail(input: unknown): string | null {
  const s = normalizeText(input);
  return s === null ? null : s.toLowerCase();
}

export function normalizePhone(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/[\s().-]/g, "");
  return s.length === 0 ? null : s;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Accept Excel-native Date cells or strict ISO YYYY-MM-DD text. Reject anything ambiguous. */
export function normalizeDate(input: unknown): NormalizeResult<string> {
  if (input === null || input === undefined || input === "") {
    return err(SIS_CODES.REQUIRED_FIELD, "Date is required");
  }
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return err(SIS_CODES.TYPE_INVALID, "Invalid date");
    const y = input.getUTCFullYear();
    const m = String(input.getUTCMonth() + 1).padStart(2, "0");
    const d = String(input.getUTCDate()).padStart(2, "0");
    return ok(`${y}-${m}-${d}`);
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!ISO_DATE_RE.test(trimmed)) {
      return err(SIS_CODES.TYPE_INVALID, "Use ISO format YYYY-MM-DD; ambiguous dates are rejected");
    }
    const parts = trimmed.split("-").map(Number);
    const y = parts[0] ?? NaN;
    const m = parts[1] ?? NaN;
    const d = parts[2] ?? NaN;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
      return err(SIS_CODES.TYPE_INVALID, "Not a valid calendar date");
    }
    return ok(trimmed);
  }
  return err(SIS_CODES.TYPE_INVALID, "Unsupported date cell type");
}

const TRUE_TOKENS = new Set(["true", "yes", "1"]);
const FALSE_TOKENS = new Set(["false", "no", "0"]);

export function normalizeBoolean(input: unknown): NormalizeResult<boolean> {
  if (typeof input === "boolean") return ok(input);
  if (typeof input === "number") {
    if (input === 1) return ok(true);
    if (input === 0) return ok(false);
    return err(SIS_CODES.TYPE_INVALID, "Invalid boolean value");
  }
  if (typeof input === "string") {
    const s = input.trim().toLowerCase();
    if (TRUE_TOKENS.has(s)) return ok(true);
    if (FALSE_TOKENS.has(s)) return ok(false);
  }
  return err(SIS_CODES.TYPE_INVALID, "Invalid boolean value; use TRUE/FALSE/YES/NO/1/0");
}

export function normalizeEnum<T extends string>(
  input: unknown,
  allowed: readonly T[],
  aliases: Record<string, T> = {},
): NormalizeResult<T> {
  if (input === null || input === undefined) return err(SIS_CODES.REQUIRED_FIELD, "Value is required");
  const s = String(input).trim().toLowerCase();
  if (aliases[s]) return ok(aliases[s]);
  const match = allowed.find((v) => v.toLowerCase() === s);
  if (match) return ok(match);
  return err(SIS_CODES.TYPE_INVALID, `Invalid value; allowed: ${allowed.join(", ")}`);
}

/** Frozen documented gender aliases: L -> male, P -> female. */
export const GENDER_ALIASES: Record<string, "male" | "female" | "other" | "unspecified"> = {
  l: "male",
  p: "female",
};

export function normalizeExternalRef(input: unknown): NormalizeResult<ExternalRef> {
  if (input === null || input === undefined) {
    return err(SIS_CODES.EXTERNAL_REF_REQUIRED, "External ref is required");
  }
  const display = String(input).trim();
  if (display.length === 0) {
    return err(SIS_CODES.EXTERNAL_REF_REQUIRED, "External ref is required");
  }
  if (!SIS_EXTERNAL_REF_PATTERN.test(display)) {
    return err(
      SIS_CODES.EXTERNAL_REF_INVALID_FORMAT,
      "External ref must be 3-40 chars of letters, digits, and hyphens only",
    );
  }
  return ok({ display, canonical: display.toLowerCase() });
}

/** A literal string that merely looks like a formula (e.g. typed "=1+1" as text) is safe data —
 * formula CELL rejection is handled separately by the parser via cell.type inspection. */
export function isLiteralFormulaLookingString(value: unknown): boolean {
  return typeof value === "string" && /^[=+\-@]/.test(value.trim());
}
