/**
 * Batch 10 — canonical SIS import/export workbook contract.
 *
 * Frozen by B10_DISCOVERY_ARCHITECTURE_IMPORT_CONTRACT.md. Sheet names, entity
 * types, and limits here are the single source of truth for the parser,
 * template generator, and validation engine.
 */

export const SIS_TEMPLATE_VERSION = "1" as const;

export const SIS_SHEET_README = "README" as const;
export const SIS_SHEET_STAFF = "Staff" as const;
export const SIS_SHEET_STUDENTS = "Students" as const;
export const SIS_SHEET_GUARDIANS = "Guardians" as const;
export const SIS_SHEET_STAFF_SCHOOL_ASSIGNMENTS = "StaffSchoolAssignments" as const;
export const SIS_SHEET_STUDENT_GUARDIANS = "StudentGuardians" as const;
export const SIS_SHEET_STUDENT_ENROLLMENTS = "StudentEnrollments" as const;
export const SIS_SHEET_CLASS_ENROLLMENTS = "ClassEnrollments" as const;

export const SIS_DATA_SHEETS = [
  SIS_SHEET_STAFF,
  SIS_SHEET_STUDENTS,
  SIS_SHEET_GUARDIANS,
  SIS_SHEET_STAFF_SCHOOL_ASSIGNMENTS,
  SIS_SHEET_STUDENT_GUARDIANS,
  SIS_SHEET_STUDENT_ENROLLMENTS,
  SIS_SHEET_CLASS_ENROLLMENTS,
] as const;

export const SIS_ALL_SHEETS = [SIS_SHEET_README, ...SIS_DATA_SHEETS] as const;

export type SisDataSheet = (typeof SIS_DATA_SHEETS)[number];

export const SIS_MAX_COMPRESSED_BYTES = 10 * 1024 * 1024; // 10 MB
export const SIS_MAX_DATA_ROWS_PER_SHEET = 5000;

export const SIS_ENTITY_TYPES = [
  "student",
  "guardian",
  "student_guardian",
  "student_enrollment",
  "class_enrollment",
  "staff",
  "staff_school_assignment",
] as const;

export type SisEntityType = (typeof SIS_ENTITY_TYPES)[number];

export const SIS_SHEET_TO_ENTITY: Record<SisDataSheet, SisEntityType> = {
  [SIS_SHEET_STAFF]: "staff",
  [SIS_SHEET_STUDENTS]: "student",
  [SIS_SHEET_GUARDIANS]: "guardian",
  [SIS_SHEET_STAFF_SCHOOL_ASSIGNMENTS]: "staff_school_assignment",
  [SIS_SHEET_STUDENT_GUARDIANS]: "student_guardian",
  [SIS_SHEET_STUDENT_ENROLLMENTS]: "student_enrollment",
  [SIS_SHEET_CLASS_ENROLLMENTS]: "class_enrollment",
};

/** Frozen commit dependency order (Gate 3L / Phase-3 concern, recorded here as the canonical order). */
export const SIS_ENTITY_COMMIT_ORDER: SisEntityType[] = [
  "staff",
  "student",
  "guardian",
  "staff_school_assignment",
  "student_guardian",
  "student_enrollment",
  "class_enrollment",
];

export const SIS_ACTIONS = ["create", "update", "unchanged", "skip", "error"] as const;
export type SisAction = (typeof SIS_ACTIONS)[number];

export const SIS_SEVERITIES = ["error", "warning", "info"] as const;
export type SisSeverity = (typeof SIS_SEVERITIES)[number];

export const SIS_EXTERNAL_REF_MIN_LENGTH = 3;
export const SIS_EXTERNAL_REF_MAX_LENGTH = 40;
export const SIS_EXTERNAL_REF_PATTERN = /^[A-Za-z0-9-]{3,40}$/;

/** B10_* error/warning taxonomy. */
export const SIS_CODES = {
  FILE_INVALID: "B10_FILE_INVALID",
  FILE_TOO_LARGE: "B10_FILE_TOO_LARGE",
  FILE_CORRUPT_OR_UNSAFE: "B10_FILE_CORRUPT_OR_UNSAFE",

  SCHEMA_SHEET_MISSING: "B10_SCHEMA_SHEET_MISSING",
  SCHEMA_HEADER_MISSING: "B10_SCHEMA_HEADER_MISSING",
  SCHEMA_DUPLICATE_HEADER: "B10_SCHEMA_DUPLICATE_HEADER",
  SCHEMA_UNKNOWN_COLUMN: "B10_SCHEMA_UNKNOWN_COLUMN",

  REQUIRED_FIELD: "B10_REQUIRED_FIELD",
  TYPE_INVALID: "B10_TYPE_INVALID",
  FORMULA_CELL_NOT_ALLOWED: "B10_FORMULA_CELL_NOT_ALLOWED",

  DUPLICATE_IN_FILE: "B10_DUPLICATE_IN_FILE",

  REFERENCE_NOT_FOUND: "B10_REFERENCE_NOT_FOUND",
  REFERENCE_AMBIGUOUS: "B10_REFERENCE_AMBIGUOUS",
  REFERENCE_INACTIVE: "B10_REFERENCE_INACTIVE",
  REFERENCE_INACTIVE_FOR_CREATE: "B10_REFERENCE_INACTIVE_FOR_CREATE",

  AY_GRADE_MISMATCH: "B10_AY_GRADE_MISMATCH",
  CLASS_ENROLLMENT_OVERLAP: "B10_CLASS_ENROLLMENT_OVERLAP",

  STUDENT_IDENTITY_CONFLICT: "B10_STUDENT_IDENTITY_CONFLICT",
  GUARDIAN_IDENTITY_CONFLICT: "B10_GUARDIAN_IDENTITY_CONFLICT",
  STAFF_IDENTITY_CONFLICT: "B10_STAFF_IDENTITY_CONFLICT",

  DUPLICATE_ACTIVE_ASSIGNMENT: "B10_DUPLICATE_ACTIVE_ASSIGNMENT",
  IDENTITY_FIELD_IMMUTABLE: "B10_IDENTITY_FIELD_IMMUTABLE",
  ENROLLMENT_YEAR_OR_GRADE_IMMUTABLE: "B10_ENROLLMENT_YEAR_OR_GRADE_IMMUTABLE",
  CREATE_AS_TERMINAL_STATUS: "B10_CREATE_AS_TERMINAL_STATUS",

  CROSS_REF_UNRESOLVED: "B10_CROSS_REF_UNRESOLVED",
  CROSS_REF_DUPLICATE: "B10_CROSS_REF_DUPLICATE",

  ROW_SCHOOL_MISMATCH: "B10_ROW_SCHOOL_MISMATCH",

  EXTERNAL_REF_REQUIRED: "B10_EXTERNAL_REF_REQUIRED",
  EXTERNAL_REF_INVALID_FORMAT: "B10_EXTERNAL_REF_INVALID_FORMAT",
  EXTERNAL_REF_DUPLICATE: "B10_EXTERNAL_REF_DUPLICATE",
  EXTERNAL_REF_CONFLICT: "B10_EXTERNAL_REF_CONFLICT",
} as const;

export type SisCode = (typeof SIS_CODES)[keyof typeof SIS_CODES];
