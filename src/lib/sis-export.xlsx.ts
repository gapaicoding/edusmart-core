import ExcelJS from "exceljs";
import { generateSisImportTemplate, SIS_SHEET_FIELDS, safeXlsxString } from "./sis-import.xlsx";
import { SIS_DATA_SHEETS, type SisDataSheet } from "./sis-import.constants";
import type { SisIssue } from "./sis-import.types";

/**
 * Round-trip-safe export writer. Given already-authorized structured rows
 * (produced by a Phase-3 export server function), write them back out using
 * the exact canonical import headers so the workbook can be re-imported.
 * Never writes internal UUIDs, profile IDs, auth IDs, tokens, or secrets.
 */
export async function writeSisExportWorkbook(
  sheetsData: Partial<Record<SisDataSheet, Array<Record<string, unknown>>>>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    (await generateSisImportTemplate()) as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );

  for (const sheetName of SIS_DATA_SHEETS) {
    const rows = sheetsData[sheetName] ?? [];
    const fields = SIS_SHEET_FIELDS[sheetName];
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) throw new Error(`Missing canonical sheet: ${sheetName}`);

    for (const row of rows) {
      const rowValues = fields.map((field) => {
        const raw = row[field];
        if (raw === null || raw === undefined) {
          return "";
        } else if (raw instanceof Date) {
          return raw;
        } else if (typeof raw === "boolean") {
          return raw;
        } else {
          return safeXlsxString(raw);
        }
      });
      ws.addRow(rowValues);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

const ERROR_REPORT_COLUMNS = [
  "sheet",
  "entity",
  "row",
  "field",
  "raw_value",
  "normalized_value",
  "severity",
  "error_code",
  "message",
] as const;

/** Generate a diagnostic XLSX error report. All cells are inert strings — no formulas. */
export async function writeSisErrorReport(issues: SisIssue[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Issues");
  ws.columns = ERROR_REPORT_COLUMNS.map((c) => ({ header: c, key: c, width: 22 }));
  ws.getRow(1).font = { bold: true };

  for (const iss of issues) {
    ws.addRow({
      sheet: safeXlsxString(iss.sheet),
      entity: safeXlsxString(iss.entityType),
      row: iss.rowNumber,
      field: safeXlsxString(iss.field ?? ""),
      raw_value: safeXlsxString(iss.rawValue ?? ""),
      normalized_value: safeXlsxString(iss.normalizedValue ?? ""),
      severity: safeXlsxString(iss.severity),
      error_code: safeXlsxString(iss.code),
      message: safeXlsxString(iss.message),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

/**
 * Corrected-template writer: emits the canonical data sheets plus a
 * "ValidationIssues" diagnostic sheet listing every issue by sheet/row/field.
 * Precise same-cell highlighting is deferred to Phase 4 UI (LOW, cosmetic —
 * see Phase 2 report Gate 42 deviation).
 */
export async function writeSisCorrectedTemplate(
  sheetsData: Partial<Record<SisDataSheet, Array<Record<string, unknown>>>>,
  issues: SisIssue[],
  sourceRowNumbers: Partial<Record<SisDataSheet, number[]>> = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    (await generateSisImportTemplate()) as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );

  for (const sheetName of SIS_DATA_SHEETS) {
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) throw new Error(`Missing canonical sheet: ${sheetName}`);
    const fields = SIS_SHEET_FIELDS[sheetName];
    for (const [rowIndex, row] of (sheetsData[sheetName] ?? []).entries()) {
      const rowValues = fields.map((field) => {
        const raw = row[field];
        return raw === null || raw === undefined
          ? ""
          : raw instanceof Date || typeof raw === "boolean"
            ? raw
            : safeXlsxString(raw);
      });
      const sourceRowNumber = sourceRowNumbers[sheetName]?.[rowIndex];
      if (sourceRowNumber && sourceRowNumber >= 2) ws.getRow(sourceRowNumber).values = rowValues;
      else ws.addRow(rowValues);
    }
  }

  const ws = workbook.addWorksheet("ValidationIssues");
  ws.columns = ERROR_REPORT_COLUMNS.map((c) => ({ header: c, key: c, width: 22 }));
  ws.getRow(1).font = { bold: true };
  for (const iss of issues) {
    ws.addRow({
      sheet: safeXlsxString(iss.sheet),
      entity: safeXlsxString(iss.entityType),
      row: iss.rowNumber,
      field: safeXlsxString(iss.field ?? ""),
      raw_value: safeXlsxString(iss.rawValue ?? ""),
      normalized_value: safeXlsxString(iss.normalizedValue ?? ""),
      severity: safeXlsxString(iss.severity),
      error_code: safeXlsxString(iss.code),
      message: safeXlsxString(iss.message),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
