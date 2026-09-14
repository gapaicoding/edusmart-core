import ExcelJS from "exceljs";
import {
  SIS_ALL_SHEETS,
  SIS_CODES,
  SIS_DATA_SHEETS,
  SIS_MAX_COMPRESSED_BYTES,
  SIS_MAX_DATA_ROWS_PER_SHEET,
  SIS_SHEET_README,
  SIS_TEMPLATE_VERSION,
  type SisDataSheet,
} from "./sis-import.constants";
import type { SisIssue } from "./sis-import.types";

/** Field headers exactly as they appear in the canonical workbook, per sheet. */
export const SIS_SHEET_FIELDS: Record<SisDataSheet, string[]> = {
  Staff: ["staff_ref", "full_name", "staff_kind", "status"],
  Students: [
    "student_ref",
    "nisn",
    "full_name",
    "preferred_name",
    "gender",
    "birth_date",
    "birth_place",
    "status",
  ],
  Guardians: ["guardian_ref", "full_name", "phone", "email", "occupation", "status"],
  StaffSchoolAssignments: [
    "staff_ref_or_employee_number",
    "school_code",
    "employee_number",
    "employment_status",
    "position_title",
    "joined_on",
    "left_on",
    "status",
  ],
  StudentGuardians: [
    "student_ref_or_nisn",
    "guardian_ref",
    "relationship_type",
    "is_primary",
    "can_view_academic",
    "can_view_attendance",
    "can_receive_notification",
    "can_manage_permissions",
    "status",
  ],
  StudentEnrollments: [
    "student_ref_or_nisn",
    "school_code",
    "academic_year_code",
    "grade_level_code",
    "student_number",
    "enrollment_number",
    "status",
    "enrolled_on",
    "ended_on",
  ],
  ClassEnrollments: [
    "student_ref_or_nisn",
    "school_code",
    "academic_year_code",
    "classroom_code",
    "starts_on",
    "ends_on",
    "is_primary",
    "status",
  ],
};

const BOOLEAN_DROPDOWN = ["TRUE", "FALSE", "YES", "NO"];

/** Enum/boolean columns that get an Excel dropdown (data validation list) in the template. */
export const SIS_FIELD_DROPDOWNS: Record<string, string[]> = {
  "Students.gender": ["male", "female", "other", "unspecified", "L", "P"],
  "Students.status": ["active", "inactive", "alumni", "archived"],
  "Guardians.status": ["active", "inactive", "archived"],
  "Staff.staff_kind": ["teacher", "non_teacher"],
  "Staff.status": ["active", "inactive", "archived"],
  "StaffSchoolAssignments.status": ["active", "inactive", "archived"],
  "StudentGuardians.is_primary": BOOLEAN_DROPDOWN,
  "StudentGuardians.can_view_academic": BOOLEAN_DROPDOWN,
  "StudentGuardians.can_view_attendance": BOOLEAN_DROPDOWN,
  "StudentGuardians.can_receive_notification": BOOLEAN_DROPDOWN,
  "StudentGuardians.can_manage_permissions": BOOLEAN_DROPDOWN,
  "StudentGuardians.status": ["active", "inactive", "revoked"],
  "StudentEnrollments.status": [
    "draft",
    "active",
    "leave",
    "transferred",
    "withdrawn",
    "graduated",
  ],
  "ClassEnrollments.is_primary": BOOLEAN_DROPDOWN,
  "ClassEnrollments.status": ["active", "inactive", "moved", "ended"],
};

/**
 * Convert a value to the exact text that must be written into an XLSX cell.
 * Formula safety for XLSX is a WRITER-side guarantee, not a value mutation:
 * callers must assign this string directly as a plain cell value (never as
 * `{ formula: ... }`). ExcelJS only creates a formula cell when explicitly
 * given a formula object, so an explicit string assignment is inert on its
 * own — no leading apostrophe or other character is added, and the exact
 * business value round-trips through export -> reimport unchanged.
 */
export function safeXlsxString(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input);
}

/**
 * CSV formula-injection mitigation (opt-in, only where CSV output exists).
 * Unlike XLSX, a CSV cell has no cell-type metadata, so the conventional
 * mitigation is a leading apostrophe on dangerous leading characters. Do not
 * use this for XLSX — it would corrupt the stored/displayed value.
 */
export function safeCsvString(input: unknown): string {
  if (input === null || input === undefined) return "";
  const s = String(input);
  if (/^[=+\-@]/.test(s)) {
    return `'${s}`;
  }
  return s;
}

/** @deprecated Use `safeXlsxString` (writer output) or `safeCsvString` (CSV mitigation) explicitly. */
export const safeSpreadsheetString = safeXlsxString;

export interface RawCell {
  value: unknown;
  isFormula: boolean;
}

export interface RawWorkbookSheet {
  sheetName: SisDataSheet;
  headerRow: string[];
  rows: Array<{ rowNumber: number; cellsByHeader: Record<string, RawCell> }>;
}

export interface ParsedWorkbook {
  sheets: RawWorkbookSheet[];
  issues: SisIssue[];
}

function issue(
  code: string,
  message: string,
  sheet: string,
  rowNumber = 0,
  field?: string,
): SisIssue {
  return {
    severity: "error",
    code,
    message,
    sheet,
    entityType: "student",
    rowNumber,
    field,
  } as SisIssue;
}

/**
 * Parse a canonical SIS workbook from a Buffer/Uint8Array. Framework-neutral —
 * no HTTP transport coupling. Never evaluates formulas; formula cells are
 * flagged as issues, not executed.
 */
export async function parseSisWorkbook(bytes: Buffer | Uint8Array): Promise<ParsedWorkbook> {
  const issues: SisIssue[] = [];
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

  if (buf.byteLength > SIS_MAX_COMPRESSED_BYTES) {
    return {
      sheets: [],
      issues: [issue(SIS_CODES.FILE_TOO_LARGE, "Workbook exceeds 10 MB limit", "workbook")],
    };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buf as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    return {
      sheets: [],
      issues: [
        issue(SIS_CODES.FILE_CORRUPT_OR_UNSAFE, "File is not a valid .xlsx workbook", "workbook"),
      ],
    };
  }

  const sheets: RawWorkbookSheet[] = [];

  for (const sheetName of SIS_DATA_SHEETS) {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      issues.push(
        issue(SIS_CODES.SCHEMA_SHEET_MISSING, `Missing required sheet: ${sheetName}`, sheetName),
      );
      continue;
    }

    const headerExcelRow = worksheet.getRow(1);
    const headerCells: string[] = [];
    headerExcelRow.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      headerCells.push(typeof v === "string" ? v.trim() : String(v ?? "").trim());
    });

    const expected = new Set(SIS_SHEET_FIELDS[sheetName]);
    const seen = new Set<string>();
    for (const h of headerCells) {
      if (seen.has(h)) {
        issues.push(
          issue(SIS_CODES.SCHEMA_DUPLICATE_HEADER, `Duplicate header: ${h}`, sheetName, 1, h),
        );
      }
      seen.add(h);
    }
    for (const expectedHeader of expected) {
      if (!seen.has(expectedHeader)) {
        issues.push(
          issue(
            SIS_CODES.SCHEMA_HEADER_MISSING,
            `Missing required header: ${expectedHeader}`,
            sheetName,
            1,
            expectedHeader,
          ),
        );
      }
    }
    for (const h of seen) {
      if (!expected.has(h)) {
        issues.push({
          severity: "warning",
          code: SIS_CODES.SCHEMA_UNKNOWN_COLUMN,
          message: `Unknown column: ${h}`,
          sheet: sheetName,
          entityType: "student",
          rowNumber: 1,
          field: h,
        } as SisIssue);
      }
    }

    const rows: RawWorkbookSheet["rows"] = [];
    let dataRowCount = 0;
    const lastRow = worksheet.rowCount;
    for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const cellsByHeader: Record<string, RawCell> = {};
      let hasAnyValue = false;

      headerCells.forEach((header, idx) => {
        const cell = row.getCell(idx + 1);
        const isFormula =
          typeof cell.value === "object" &&
          cell.value !== null &&
          "formula" in (cell.value as unknown as Record<string, unknown>);
        let value: unknown = cell.value;
        if (isFormula) {
          value = undefined;
          issues.push(
            issue(
              SIS_CODES.FORMULA_CELL_NOT_ALLOWED,
              `Formula cell not allowed: ${header}`,
              sheetName,
              rowNumber,
              header,
            ),
          );
        } else if (value !== null && value !== undefined && value !== "") {
          hasAnyValue = true;
        }
        cellsByHeader[header] = { value, isFormula };
      });

      if (!hasAnyValue) continue; // ignore blank trailing rows
      dataRowCount++;
      rows.push({ rowNumber, cellsByHeader });
    }

    if (dataRowCount > SIS_MAX_DATA_ROWS_PER_SHEET) {
      issues.push(
        issue(
          SIS_CODES.FILE_TOO_LARGE,
          `Sheet ${sheetName} exceeds ${SIS_MAX_DATA_ROWS_PER_SHEET} data rows`,
          sheetName,
        ),
      );
    }

    sheets.push({ sheetName, headerRow: headerCells, rows });
  }

  return { sheets, issues };
}

/** Generate the canonical 8-sheet workbook template. No DB UUIDs, no secrets, no formulas. */
export async function generateSisImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EduSmart Core";
  workbook.created = new Date();

  const readme = workbook.addWorksheet(SIS_SHEET_README);
  readme.columns = [{ width: 100 }];
  const readmeLines = [
    `EduSmart SIS Import Template — version ${SIS_TEMPLATE_VERSION}`,
    "",
    "One workbook = ONE school. Every row must belong to the school you selected for this import job.",
    "Academic Setup (school, academic years, grade levels, classrooms) must already exist — this",
    "import never auto-creates master data.",
    "",
    "Durable identity refs (student_ref, guardian_ref, staff_ref) are required, permanent identifiers",
    "you control. Once a ref is mapped to a record, re-importing the same ref always resolves to the",
    "same record. Refs are 3-40 characters: letters, digits, and hyphens only (e.g. STU-0001).",
    "Ref comparison is case-insensitive; the casing you type is preserved for exports.",
    "",
    "Dates must be entered as native Excel dates or ISO text YYYY-MM-DD. Ambiguous formats such as",
    "03/04/2026 are rejected.",
    "",
    "Boolean columns accept TRUE, FALSE, YES, NO, 1, or 0 (case-insensitive).",
    "",
    "Only the exact status/enum values documented per sheet are accepted.",
    "",
    "This template never uses fuzzy name/phone/email matching for identity. Guardians are matched",
    "by guardian_ref only. Students match by student_ref, then NISN, then create. Staff match by",
    "staff_ref, then employee_number at the selected school, then create.",
    "",
    "Do not enter formulas in any cell. Formula cells are rejected.",
  ];
  readmeLines.forEach((line, idx) => {
    readme.getCell(idx + 1, 1).value = safeXlsxString(line);
  });

  const DATA_VALIDATION_ROWS = 5001; // header + max data rows

  for (const sheetName of SIS_DATA_SHEETS) {
    const ws = workbook.addWorksheet(sheetName);
    const fields = SIS_SHEET_FIELDS[sheetName];
    ws.columns = fields.map((f) => ({ header: f, key: f, width: Math.max(16, f.length + 2) }));
    ws.getRow(1).font = { bold: true };
    fields.forEach((field, idx) => {
      const col = ws.getColumn(idx + 1);
      if (
        field.endsWith("_ref") ||
        field.endsWith("_code") ||
        field === "nisn" ||
        field.endsWith("_number")
      ) {
        col.numFmt = "@"; // Text format for identifiers
      }
      if (field.endsWith("_on") || field.endsWith("_date")) {
        col.numFmt = "yyyy-mm-dd";
      }

      const dropdown = SIS_FIELD_DROPDOWNS[`${sheetName}.${field}`];
      if (dropdown) {
        const colLetter = ws.getColumn(idx + 1).letter;
        for (let r = 2; r <= DATA_VALIDATION_ROWS; r++) {
          ws.getCell(`${colLetter}${r}`).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [`"${dropdown.join(",")}"`],
            showErrorMessage: true,
            errorTitle: "Invalid value",
            error: `Allowed values: ${dropdown.join(", ")}`,
          };
        }
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
