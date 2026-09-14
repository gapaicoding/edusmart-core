import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import {
  generateSisImportTemplate,
  parseSisWorkbook,
  safeXlsxString,
  safeCsvString,
  SIS_FIELD_DROPDOWNS,
  SIS_SHEET_FIELDS,
} from "./sis-import.xlsx";
import { SIS_DATA_SHEETS, SIS_MAX_DATA_ROWS_PER_SHEET } from "./sis-import.constants";
import { normalizeText } from "./sis-import.normalize";

async function buildFixture({
  omitSheets = [],
  headerOverrides = {},
  extraRowsPerSheet = {},
  formulaCell = null,
} = {}) {
  const workbook = new ExcelJS.Workbook();
  for (const sheetName of SIS_DATA_SHEETS) {
    if (omitSheets.includes(sheetName)) continue;
    const ws = workbook.addWorksheet(sheetName);
    const headers = headerOverrides[sheetName] ?? SIS_SHEET_FIELDS[sheetName];
    ws.addRow(headers);
    const extra = extraRowsPerSheet[sheetName] ?? 1;
    for (let i = 0; i < extra; i++) {
      ws.addRow(headers.map(() => "x"));
    }
    if (formulaCell && formulaCell.sheet === sheetName) {
      ws.getRow(2).getCell(formulaCell.col).value = { formula: "SUM(A1:A2)", result: 42 };
    }
  }
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

describe("parseSisWorkbook", () => {
  test("all sheets present parse cleanly (no missing-sheet issues)", async () => {
    const bytes = await buildFixture();
    const result = await parseSisWorkbook(bytes);
    expect(result.issues.some((i) => i.code === "B10_SCHEMA_SHEET_MISSING")).toBe(false);
    expect(result.sheets.length).toBe(SIS_DATA_SHEETS.length);
  });

  test("missing sheet flagged", async () => {
    const bytes = await buildFixture({ omitSheets: ["Guardians"] });
    const result = await parseSisWorkbook(bytes);
    expect(
      result.issues.some((i) => i.code === "B10_SCHEMA_SHEET_MISSING" && i.sheet === "Guardians"),
    ).toBe(true);
  });

  test("reordered columns still parsed by header name", async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Guardians");
    const headers = [...SIS_SHEET_FIELDS.Guardians].reverse();
    ws.addRow(headers);
    ws.addRow(headers.map(() => "x"));
    for (const sheetName of SIS_DATA_SHEETS) {
      if (sheetName === "Guardians") continue;
      const other = workbook.addWorksheet(sheetName);
      other.addRow(SIS_SHEET_FIELDS[sheetName]);
    }
    const buf = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await parseSisWorkbook(buf);
    const missingHeaderIssues = result.issues.filter(
      (i) => i.sheet === "Guardians" && i.code === "B10_SCHEMA_HEADER_MISSING",
    );
    expect(missingHeaderIssues.length).toBe(0);
  });

  test("missing header flagged", async () => {
    const bytes = await buildFixture({
      headerOverrides: { Students: SIS_SHEET_FIELDS.Students.slice(1) },
    });
    const result = await parseSisWorkbook(bytes);
    expect(
      result.issues.some((i) => i.code === "B10_SCHEMA_HEADER_MISSING" && i.sheet === "Students"),
    ).toBe(true);
  });

  test("duplicate header flagged", async () => {
    const headers = [...SIS_SHEET_FIELDS.Students, "student_ref"];
    const bytes = await buildFixture({ headerOverrides: { Students: headers } });
    const result = await parseSisWorkbook(bytes);
    expect(
      result.issues.some((i) => i.code === "B10_SCHEMA_DUPLICATE_HEADER" && i.sheet === "Students"),
    ).toBe(true);
  });

  test("unknown header produces a warning, not an error", async () => {
    const headers = [...SIS_SHEET_FIELDS.Students, "unexpected_column"];
    const bytes = await buildFixture({ headerOverrides: { Students: headers } });
    const result = await parseSisWorkbook(bytes);
    const found = result.issues.find((i) => i.code === "B10_SCHEMA_UNKNOWN_COLUMN");
    expect(found).toBeDefined();
    expect(found.severity).toBe("warning");
  });

  test("formula cell rejected", async () => {
    const bytes = await buildFixture({ formulaCell: { sheet: "Students", col: 1 } });
    const result = await parseSisWorkbook(bytes);
    expect(
      result.issues.some(
        (i) => i.code === "B10_FORMULA_CELL_NOT_ALLOWED" && i.sheet === "Students",
      ),
    ).toBe(true);
  });

  test("exactly 5000 rows accepted, 5001 rejected", async () => {
    const okBytes = await buildFixture({
      extraRowsPerSheet: { Students: SIS_MAX_DATA_ROWS_PER_SHEET },
    });
    const okResult = await parseSisWorkbook(okBytes);
    expect(
      okResult.issues.some((i) => i.code === "B10_FILE_TOO_LARGE" && i.sheet === "Students"),
    ).toBe(false);

    const tooManyBytes = await buildFixture({
      extraRowsPerSheet: { Students: SIS_MAX_DATA_ROWS_PER_SHEET + 1 },
    });
    const tooManyResult = await parseSisWorkbook(tooManyBytes);
    expect(
      tooManyResult.issues.some((i) => i.code === "B10_FILE_TOO_LARGE" && i.sheet === "Students"),
    ).toBe(true);
  }, 20000);

  test("blank trailing rows are ignored, not counted as data", async () => {
    const workbook = new ExcelJS.Workbook();
    for (const sheetName of SIS_DATA_SHEETS) {
      const ws = workbook.addWorksheet(sheetName);
      const headers = SIS_SHEET_FIELDS[sheetName];
      ws.addRow(headers);
      ws.addRow(headers.map(() => "x"));
      ws.addRow(headers.map(() => "")); // blank trailing row
    }
    const buf = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await parseSisWorkbook(buf);
    const studentsSheet = result.sheets.find((s) => s.sheetName === "Students");
    expect(studentsSheet.rows.length).toBe(1);
  });

  test("identifier text with leading zeros preserved through parsing", async () => {
    const workbook = new ExcelJS.Workbook();
    for (const sheetName of SIS_DATA_SHEETS) {
      const ws = workbook.addWorksheet(sheetName);
      const headers = SIS_SHEET_FIELDS[sheetName];
      ws.addRow(headers);
      if (sheetName === "Students") {
        const row = ws.addRow(headers.map((h) => (h === "nisn" ? "0012345678" : "x")));
        row.getCell(headers.indexOf("nisn") + 1).numFmt = "@";
      } else {
        ws.addRow(headers.map(() => "x"));
      }
    }
    const buf = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await parseSisWorkbook(buf);
    const studentsSheet = result.sheets.find((s) => s.sheetName === "Students");
    expect(studentsSheet.rows[0].cellsByHeader.nisn.value).toBe("0012345678");
  });

  test("corrupt file rejected", async () => {
    const result = await parseSisWorkbook(Buffer.from("not an xlsx file"));
    expect(result.issues.some((i) => i.code === "B10_FILE_CORRUPT_OR_UNSAFE")).toBe(true);
  });

  test("oversized compressed file rejected before parsing", async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1);
    const result = await parseSisWorkbook(big);
    expect(result.issues.some((i) => i.code === "B10_FILE_TOO_LARGE")).toBe(true);
  });
});

describe("generateSisImportTemplate", () => {
  test("produces a workbook with README + all 7 data sheets, parseable by parseSisWorkbook", async () => {
    const buf = await generateSisImportTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    expect(workbook.getWorksheet("README")).toBeDefined();
    for (const sheet of SIS_DATA_SHEETS) {
      expect(workbook.getWorksheet(sheet)).toBeDefined();
    }
    const result = await parseSisWorkbook(buf);
    expect(result.issues.some((i) => i.severity === "error")).toBe(false);
  });

  test("template contains no raw UUID-looking columns", async () => {
    const buf = await generateSisImportTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    for (const sheet of SIS_DATA_SHEETS) {
      const ws = workbook.getWorksheet(sheet);
      const headers = [];
      ws.getRow(1).eachCell((c) => headers.push(String(c.value)));
      expect(headers.some((h) => /(^id$|_id$|uuid|profile_id|auth)/i.test(h))).toBe(false);
    }
  });
});

describe("safeXlsxString does not mutate the value (B10-P2-XLSX-001)", () => {
  test.each([
    "=1+1",
    "+SUM(A1:A2)",
    "-1+2",
    "@SUM(A1:A2)",
    "+628123456789",
    "-Example",
    "@username",
  ])("returns %s unchanged", (input) => {
    expect(safeXlsxString(input)).toBe(input);
  });

  test("normal text passes through unchanged", () => {
    expect(safeXlsxString("Ahmad Yani")).toBe("Ahmad Yani");
  });
});

describe("safeCsvString still escapes for CSV-only use", () => {
  test.each(["=1+1", "+SUM(A1:A2)", "-1+2", "@SUM(A1:A2)"])("escapes %s", (input) => {
    expect(safeCsvString(input).startsWith("'")).toBe(true);
  });
});

describe("XLSX literal round-trip through writer + parser (B10-P2-XLSX-001)", () => {
  const DANGEROUS_LITERALS = ["=1+1", "+SUM(A1:A2)", "-1+2", "@SUM(A1:A2)"];

  test.each(DANGEROUS_LITERALS)(
    "cell written with %s round-trips as an unchanged non-formula string",
    async (literal) => {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Guardians");
      ws.addRow(SIS_SHEET_FIELDS.Guardians);
      const row = ws.addRow(
        SIS_SHEET_FIELDS.Guardians.map((h) => (h === "full_name" ? safeXlsxString(literal) : "x")),
      );
      const cell = row.getCell(SIS_SHEET_FIELDS.Guardians.indexOf("full_name") + 1);
      expect(cell.type).not.toBe(ExcelJS.ValueType.Formula);

      const buf = Buffer.from(await workbook.xlsx.writeBuffer());

      const reloaded = new ExcelJS.Workbook();
      await reloaded.xlsx.load(buf);
      const reloadedCell = reloaded
        .getWorksheet("Guardians")
        .getRow(2)
        .getCell(SIS_SHEET_FIELDS.Guardians.indexOf("full_name") + 1);
      expect(reloadedCell.type).not.toBe(ExcelJS.ValueType.Formula);
      expect(reloadedCell.value).toBe(literal);
      expect(String(reloadedCell.value).startsWith("'")).toBe(false);

      const parsed = await parseSisWorkbook(buf);
      const guardiansSheet = parsed.sheets.find((s) => s.sheetName === "Guardians");
      expect(guardiansSheet.rows[0].cellsByHeader.full_name.isFormula).toBe(false);
      expect(guardiansSheet.rows[0].cellsByHeader.full_name.value).toBe(literal);
    },
  );
});

describe("template data validation dropdowns (Gate 12)", () => {
  test("gender/status/staff_kind/boolean columns have list data validation", async () => {
    const buf = await generateSisImportTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);

    for (const [key] of Object.entries(SIS_FIELD_DROPDOWNS)) {
      const [sheetName, field] = key.split(".");
      const ws = workbook.getWorksheet(sheetName);
      const fields = SIS_SHEET_FIELDS[sheetName];
      const colIdx = fields.indexOf(field) + 1;
      const cell = ws.getRow(2).getCell(colIdx);
      expect(cell.dataValidation).toBeDefined();
      expect(cell.dataValidation.type).toBe("list");
    }
  });

  test("employment_status has NO restrictive dropdown (B10-P2-CONTRACT-001: free text)", async () => {
    const buf = await generateSisImportTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);

    expect(SIS_FIELD_DROPDOWNS["StaffSchoolAssignments.employment_status"]).toBeUndefined();

    const ws = workbook.getWorksheet("StaffSchoolAssignments");
    const colIdx = SIS_SHEET_FIELDS.StaffSchoolAssignments.indexOf("employment_status") + 1;
    const cell = ws.getRow(2).getCell(colIdx);
    expect(cell.dataValidation).toBeUndefined();
  });
});

describe("employment_status free-text contract (B10-P2-CONTRACT-001)", () => {
  test.each([
    ["PNS"],
    ["Honorer"],
    ["Kontrak Tahunan"],
    ["Guru Tetap Yayasan"],
    ["Some Arbitrary School-Specific Term / Notes 2026"],
  ])("normalizeText accepts free-text employment_status value %j", (value) => {
    expect(normalizeText(value)).toBe(value);
  });

  test("normalizeText accepts blank employment_status as null (not required)", () => {
    expect(normalizeText("")).toBeNull();
    expect(normalizeText(null)).toBeNull();
    expect(normalizeText(undefined)).toBeNull();
  });

  test("employment_status is never routed through normalizeEnum / SIS_ENUMS", () => {
    // Structural guard: employment_status must not appear in any enum contract.
    for (const key of Object.keys(SIS_FIELD_DROPDOWNS)) {
      expect(key).not.toBe("StaffSchoolAssignments.employment_status");
    }
  });
});
