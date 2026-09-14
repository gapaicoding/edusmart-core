import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import {
  writeSisCorrectedTemplate,
  writeSisErrorReport,
  writeSisExportWorkbook,
} from "./sis-export.xlsx";
import { parseSisWorkbook } from "./sis-import.xlsx";

describe("writeSisExportWorkbook", () => {
  test("round-trips durable refs and is re-importable", async () => {
    const buf = await writeSisExportWorkbook({
      Students: [
        { student_ref: "STU-001", nisn: "0012345678", full_name: "Ahmad", status: "active" },
      ],
      Guardians: [{ guardian_ref: "GUA-001", full_name: "Budi", status: "active" }],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "README",
      "Staff",
      "Students",
      "Guardians",
      "StaffSchoolAssignments",
      "StudentGuardians",
      "StudentEnrollments",
      "ClassEnrollments",
    ]);
    expect(workbook.getWorksheet("README")).toBeDefined();
    expect(workbook.getWorksheet("ValidationIssues")).toBeUndefined();
    const students = workbook.getWorksheet("Students");
    const headerRow = [];
    students.getRow(1).eachCell((c) => headerRow.push(String(c.value)));
    expect(headerRow).toContain("student_ref");

    const result = await parseSisWorkbook(buf);
    const studentsSheet = result.sheets.find((s) => s.sheetName === "Students");
    expect(studentsSheet.rows[0].cellsByHeader.student_ref.value).toBe("STU-001");
  });

  test("preserves unique person identities while relationship rows retain cardinality", async () => {
    const buf = await writeSisExportWorkbook({
      Students: [
        {
          student_ref: "STU-MULTI",
          nisn: "0099001100",
          full_name: "One Student",
          status: "active",
        },
      ],
      Guardians: [
        { guardian_ref: "GRD-ONE", full_name: "Guardian One", status: "active" },
        { guardian_ref: "GRD-TWO", full_name: "Guardian Two", status: "active" },
      ],
      StudentGuardians: [
        {
          student_ref_or_nisn: "STU-MULTI",
          guardian_ref: "GRD-ONE",
          relationship_type: "parent",
          status: "active",
        },
        {
          student_ref_or_nisn: "STU-MULTI",
          guardian_ref: "GRD-TWO",
          relationship_type: "guardian",
          status: "active",
        },
      ],
      StudentEnrollments: [
        {
          student_ref_or_nisn: "STU-MULTI",
          school_code: "SCH-A",
          academic_year_code: "2025",
          grade_level_code: "G1",
          enrolled_on: "2025-07-01",
          status: "active",
        },
        {
          student_ref_or_nisn: "STU-MULTI",
          school_code: "SCH-A",
          academic_year_code: "2026",
          grade_level_code: "G2",
          enrolled_on: "2026-07-01",
          status: "active",
        },
      ],
      ClassEnrollments: [
        {
          student_ref_or_nisn: "STU-MULTI",
          school_code: "SCH-A",
          academic_year_code: "2026",
          classroom_code: "2A",
          starts_on: "2026-07-01",
          status: "active",
        },
      ],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    expect(workbook.getWorksheet("Students").actualRowCount - 1).toBe(1);
    expect(workbook.getWorksheet("StudentGuardians").actualRowCount - 1).toBe(2);
    expect(workbook.getWorksheet("StudentEnrollments").actualRowCount - 1).toBe(2);
    expect(workbook.getWorksheet("ClassEnrollments").actualRowCount - 1).toBe(1);
    const parsed = await parseSisWorkbook(buf);
    expect(parsed.issues.filter((issue) => /DUPLICATE/.test(issue.code))).toEqual([]);
  });

  test("no internal UUID columns are written", async () => {
    const buf = await writeSisExportWorkbook({
      Students: [{ student_ref: "STU-001", full_name: "Ahmad", status: "active" }],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    const headers = [];
    workbook
      .getWorksheet("Students")
      .getRow(1)
      .eachCell((c) => headers.push(String(c.value)));
    expect(headers.some((h) => /(^id$|_id$|uuid|profile_id)/i.test(h))).toBe(false);
  });

  test("formula-injection-looking values are written inert", async () => {
    const buf = await writeSisExportWorkbook({
      Guardians: [{ guardian_ref: "=1+1", full_name: "+SUM(A1:A2)", status: "active" }],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    const cell = workbook.getWorksheet("Guardians").getRow(2).getCell(1);
    expect(typeof cell.value === "object" && cell.value !== null && "formula" in cell.value).toBe(
      false,
    );
  });
});

describe("writeSisErrorReport", () => {
  test("generates an inert diagnostic workbook", async () => {
    const buf = await writeSisErrorReport([
      {
        severity: "error",
        code: "B10_ROW_SCHOOL_MISMATCH",
        message: "wrong school",
        sheet: "Students",
        entityType: "student",
        rowNumber: 5,
        field: "school_code",
        rawValue: "=SUM(A1:A2)",
      },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    const ws = workbook.getWorksheet("Issues");
    expect(ws).toBeDefined();
    const rawValueCell = ws.getRow(2).getCell(5);
    expect(
      typeof rawValueCell.value === "object" &&
        rawValueCell.value !== null &&
        "formula" in rawValueCell.value,
    ).toBe(false);
  });
});

describe("writeSisCorrectedTemplate", () => {
  test("preserves canonical rows, appends ValidationIssues, and reimports after correction", async () => {
    const formulaLike = "=B10-UAT-INERT";
    const invalidClassroom = "B10-UAT-NO-CLASS";
    const issue = {
      severity: "error",
      code: "B10_REFERENCE_NOT_FOUND",
      message: `Classroom ${invalidClassroom} not found`,
      sheet: "ClassEnrollments",
      entityType: "class_enrollment",
      rowNumber: 5002,
      field: "classroom_code",
      rawValue: invalidClassroom,
      normalizedValue: invalidClassroom,
    };
    const buf = await writeSisCorrectedTemplate(
      {
        Students: [
          {
            student_ref: "B10-UAT-STU-001",
            full_name: "Student",
            preferred_name: formulaLike,
            status: "active",
          },
        ],
        ClassEnrollments: [
          {
            student_ref_or_nisn: "B10-UAT-STU-001",
            school_code: "SD_DEMO",
            academic_year_code: "2026/2027",
            classroom_code: invalidClassroom,
            starts_on: "2026-07-01",
            is_primary: true,
            status: "active",
          },
        ],
      },
      [issue],
      { Students: [5002], ClassEnrollments: [5002] },
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "README",
      "Staff",
      "Students",
      "Guardians",
      "StaffSchoolAssignments",
      "StudentGuardians",
      "StudentEnrollments",
      "ClassEnrollments",
      "ValidationIssues",
    ]);
    expect(workbook.getWorksheet("Issues")).toBeUndefined();
    const studentCell = workbook.getWorksheet("Students").getCell("D5002");
    expect(studentCell.value).toBe(formulaLike);
    expect(
      typeof studentCell.value === "object" &&
        studentCell.value !== null &&
        "formula" in studentCell.value,
    ).toBe(false);
    expect(workbook.getWorksheet("ClassEnrollments").getCell("D5002").value).toBe(invalidClassroom);
    expect(workbook.getWorksheet("ValidationIssues").getCell("H2").value).toBe(issue.code);

    const serialized = JSON.stringify(workbook.worksheets.map((sheet) => sheet.getSheetValues()));
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(serialized).not.toContain("sis-imports/");

    workbook.getWorksheet("ClassEnrollments").getCell("D5002").value = "1A";
    const corrected = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await parseSisWorkbook(corrected);
    expect(parsed.issues).toEqual([]);
    expect(
      parsed.sheets.find((sheet) => sheet.sheetName === "ClassEnrollments").rows[0].cellsByHeader
        .classroom_code.value,
    ).toBe("1A");
  });
});
