import type { SisAction, SisEntityType, SisSeverity } from "./sis-import.constants";

/** Canonical/display pair for a durable external ref. Identity compares on `canonical`. */
export interface ExternalRef {
  display: string;
  canonical: string;
}

export interface SisIssue {
  severity: SisSeverity;
  code: string;
  sheet: string;
  entityType: SisEntityType;
  rowNumber: number;
  field?: string;
  rawValue?: unknown;
  normalizedValue?: unknown;
  message: string;
  suggestedResolution?: string;
}

/** One parsed data row, before and after normalization. */
export interface SisParsedRow<TRaw = Record<string, unknown>, TNormalized = Record<string, unknown>> {
  sheet: string;
  entityType: SisEntityType;
  rowNumber: number;
  raw: TRaw;
  normalized: TNormalized;
}

/** A logical, DB-independent handle used to refer to an entity that may not have a UUID yet
 * (brand-new same-workbook record) or may already exist in the DB. */
export type LogicalEntityHandle =
  | { kind: "existing"; id: string }
  | { kind: "new-ref"; entityType: SisEntityType; ref: string }
  | { kind: "new-row"; entityType: SisEntityType; sheet: string; rowNumber: number };

export interface FieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface SisPlanRow {
  entityType: SisEntityType;
  sheet: string;
  rowNumber: number;
  normalized: Record<string, unknown>;
  matchIdentity: LogicalEntityHandle | null;
  resolvedEntityId: string | null;
  action: SisAction;
  diff: FieldDiff[];
  issues: SisIssue[];
}

export interface SisValidationPlan {
  organizationId: string;
  schoolId: string;
  templateVersion: string;
  rows: SisPlanRow[];
  issues: SisIssue[];
  hasBlockingError: boolean;
}

/** Injected reference data (Academic Setup) — Phase 2 code never queries Supabase directly. */
export interface SchoolRef {
  id: string;
  code: string;
  organizationId: string;
  isActive: boolean;
}

export interface AcademicYearRef {
  id: string;
  code: string;
  schoolId: string;
  isActive: boolean;
}

export interface GradeLevelRef {
  id: string;
  code: string;
  schoolId: string;
  isActive: boolean;
}

export interface ClassroomRef {
  id: string;
  code: string;
  schoolId: string;
  academicYearId: string;
  gradeLevelId: string;
  isActive: boolean;
}

export interface ReferenceSnapshot {
  school: SchoolRef;
  academicYears: AcademicYearRef[];
  gradeLevels: GradeLevelRef[];
  classrooms: ClassroomRef[];
}

/** Injected existing-identity data for the selected org/school — Phase 3 supplies this from live DB reads. */
export interface ExistingStudent {
  id: string;
  ref: string | null; // canonical
  nisn: string | null;
  isActive: boolean;
}

export interface ExistingGuardian {
  id: string;
  ref: string | null; // canonical
  isActive: boolean;
}

export interface ExistingStaff {
  id: string;
  ref: string | null; // canonical
  employeeNumber: string | null; // scoped to selected school
  isActive: boolean;
}

export interface ExistingStudentGuardian {
  studentId: string;
  guardianId: string;
  isActive: boolean;
}

export interface ExistingStudentEnrollment {
  id: string;
  studentId: string;
  schoolId: string;
  academicYearId: string;
  gradeLevelId: string;
}

export interface ExistingClassEnrollment {
  id: string;
  studentEnrollmentId: string;
  classroomId: string;
  startsOn: string; // ISO date
  endsOn: string | null;
  isPrimary: boolean;
  isActive: boolean;
}

export interface ExistingStaffSchoolAssignment {
  id: string;
  staffId: string;
  schoolId: string;
  employeeNumber: string | null;
  isActive: boolean;
}

export interface IdentitySnapshot {
  students: ExistingStudent[];
  guardians: ExistingGuardian[];
  staff: ExistingStaff[];
  studentGuardians: ExistingStudentGuardian[];
  studentEnrollments: ExistingStudentEnrollment[];
  classEnrollments: ExistingClassEnrollment[];
  staffSchoolAssignments: ExistingStaffSchoolAssignment[];
}

export interface SisValidationContext {
  organizationId: string;
  /** The single authorized school for this job. Every row's school_code must match. */
  selectedSchoolCode: string;
  selectedSchoolId?: string;
  templateVersion: string;
  reference: ReferenceSnapshot;
  identity: IdentitySnapshot;
}
