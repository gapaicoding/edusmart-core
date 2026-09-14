import { describe, expect, test } from "bun:test";
import {
  normalizeBoolean,
  normalizeDate,
  normalizeEmail,
  normalizeEnum,
  normalizeExternalRef,
  normalizeIdentifierText,
  normalizePhone,
  normalizeText,
  isLiteralFormulaLookingString,
  GENDER_ALIASES,
} from "./sis-import.normalize";
import { STUDENT_GENDERS } from "./sis.schemas";

describe("normalizeExternalRef", () => {
  test("valid ref: canonical is lowercase, display preserved", () => {
    const r = normalizeExternalRef("STU-AbC001");
    expect(r.ok).toBe(true);
    expect(r.value.display).toBe("STU-AbC001");
    expect(r.value.canonical).toBe("stu-abc001");
  });

  test("case-insensitive comparison", () => {
    const a = normalizeExternalRef("ABC123").value.canonical;
    const b = normalizeExternalRef("abc123").value.canonical;
    expect(a).toBe(b);
  });

  test("rejects invalid characters", () => {
    const r = normalizeExternalRef("stu 001");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("B10_EXTERNAL_REF_INVALID_FORMAT");
  });

  test("rejects too short", () => {
    expect(normalizeExternalRef("ab").ok).toBe(false);
  });

  test("rejects too long", () => {
    expect(normalizeExternalRef("a".repeat(41)).ok).toBe(false);
  });

  test("rejects blank", () => {
    const r = normalizeExternalRef("");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("B10_EXTERNAL_REF_REQUIRED");
  });
});

describe("normalizeText", () => {
  test("collapses internal whitespace and trims", () => {
    expect(normalizeText("  Ahmad   Yani  ")).toBe("Ahmad Yani");
  });

  test("Unicode NFC normalization", () => {
    const decomposed = "é"; // e + combining acute accent
    const composed = "é"; // é
    expect(normalizeText(decomposed)).toBe(composed);
  });

  test("null on blank", () => {
    expect(normalizeText("   ")).toBeNull();
  });
});

describe("normalizeEmail / normalizePhone", () => {
  test("email is lowercased", () => {
    expect(normalizeEmail("John.Doe@Example.COM")).toBe("john.doe@example.com");
  });

  test("phone strips separators", () => {
    expect(normalizePhone("(0812) 345-6789")).toBe("08123456789");
  });
});

describe("normalizeIdentifierText", () => {
  test("preserves leading zeros from string cell", () => {
    expect(normalizeIdentifierText("00123").value).toBe("00123");
  });

  test("warns when Excel already coerced to number (leading zero lost)", () => {
    const r = normalizeIdentifierText(123);
    expect(r.value).toBe("123");
    expect(r.warning).toBeDefined();
  });
});

describe("normalizeDate", () => {
  test("accepts ISO text", () => {
    const r = normalizeDate("2026-03-04");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("2026-03-04");
  });

  test("accepts Excel-native Date", () => {
    const r = normalizeDate(new Date(Date.UTC(2026, 2, 4)));
    expect(r.ok).toBe(true);
    expect(r.value).toBe("2026-03-04");
  });

  test("rejects ambiguous slash-formatted date", () => {
    const r = normalizeDate("03/04/2026");
    expect(r.ok).toBe(false);
  });

  test("rejects invalid calendar date", () => {
    const r = normalizeDate("2026-02-30");
    expect(r.ok).toBe(false);
  });

  test("rejects blank", () => {
    expect(normalizeDate(null).ok).toBe(false);
  });
});

describe("normalizeBoolean", () => {
  test.each([
    ["TRUE", true],
    ["false", false],
    ["Yes", true],
    ["no", false],
    [1, true],
    [0, false],
    [true, true],
  ])("%p -> %p", (input, expected) => {
    const r = normalizeBoolean(input);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(expected);
  });

  test("invalid boolean rejected", () => {
    expect(normalizeBoolean("maybe").ok).toBe(false);
    expect(normalizeBoolean("Y").ok).toBe(false);
  });
});

describe("normalizeEnum", () => {
  test("valid enum value case-insensitive", () => {
    const r = normalizeEnum("ACTIVE", ["active", "inactive"]);
    expect(r.ok).toBe(true);
    expect(r.value).toBe("active");
  });

  test("invalid enum value rejected", () => {
    expect(normalizeEnum("bogus", ["active", "inactive"]).ok).toBe(false);
  });

  test("documented gender aliases L/P", () => {
    const l = normalizeEnum("L", STUDENT_GENDERS, GENDER_ALIASES);
    const p = normalizeEnum("p", STUDENT_GENDERS, GENDER_ALIASES);
    expect(l.value).toBe("male");
    expect(p.value).toBe("female");
  });
});

describe("isLiteralFormulaLookingString", () => {
  test("detects formula-like text so writer can escape it", () => {
    expect(isLiteralFormulaLookingString("=1+1")).toBe(true);
    expect(isLiteralFormulaLookingString("+SUM(A1:A2)")).toBe(true);
    expect(isLiteralFormulaLookingString("-1+2")).toBe(true);
    expect(isLiteralFormulaLookingString("@SUM(A1:A2)")).toBe(true);
    expect(isLiteralFormulaLookingString("normal text")).toBe(false);
  });
});
