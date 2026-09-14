import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { IdentitySnapshot, ReferenceSnapshot } from "./sis-import.types";
import type { SisWorkbookRows } from "./sis-import.plan";

type RpcClient = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> };
type SnapshotPayload = ReferenceSnapshot & { job: { id: string; organizationId: string; schoolId: string; templateVersion: string; previewVersion: number }; students: Array<IdentitySnapshot["students"][number] & { expectedState: Record<string, unknown> }>; guardians: Array<IdentitySnapshot["guardians"][number] & { expectedState: Record<string, unknown> }>; staff: Array<IdentitySnapshot["staff"][number] & { expectedState: Record<string, unknown> }>; studentGuardians: Record<string, unknown>[]; studentEnrollments: Record<string, unknown>[]; classEnrollments: Record<string, unknown>[]; staffSchoolAssignments: Record<string, unknown>[] };

const uniqueLower = (values: unknown[]) => [...new Set(values.map((x) => String(x ?? "").trim().toLowerCase()).filter(Boolean))];
const uniqueExact = (values: unknown[]) => [...new Set(values.map((x) => String(x ?? "").trim()).filter(Boolean))];

export async function loadSisValidationSnapshot(supabase: SupabaseClient<Database>, jobId: string, workbook: SisWorkbookRows) {
  const all = Object.values(workbook).flat();
  const lowerField = (name: string) => uniqueLower(all.map((r) => r.normalized[name]));
  const exactField = (name: string) => uniqueExact(all.map((r) => r.normalized[name]));
  const result = await (supabase as unknown as RpcClient).rpc("get_sis_import_validation_snapshot", {
    p_job_id: jobId,
    p_student_refs: uniqueLower([...lowerField("student_ref"), ...lowerField("student_ref_or_nisn")]),
    p_student_nisns: exactField("nisn"),
    p_guardian_refs: lowerField("guardian_ref"),
    p_staff_refs: uniqueLower([...lowerField("staff_ref"), ...lowerField("staff_ref_or_employee_number")]),
    p_employee_numbers: exactField("employee_number"),
  });
  if (result.error || !result.data) throw new Error("B10_AUTHORIZATION_DENIED");
  const p = result.data as SnapshotPayload;
  const reference: ReferenceSnapshot = { school: p.school, academicYears: p.academicYears, gradeLevels: p.gradeLevels, classrooms: p.classrooms };
  const identity: IdentitySnapshot = {
    students: p.students,
    guardians: p.guardians,
    staff: p.staff,
    studentGuardians: p.studentGuardians.map((x) => ({ studentId: String(x["student_id"]), guardianId: String(x["guardian_id"]), isActive: x["status"] === "active" })),
    studentEnrollments: p.studentEnrollments.map((x) => ({ id: String(x["id"]), studentId: String(x["student_id"]), schoolId: String(x["school_id"]), academicYearId: String(x["academic_year_id"]), gradeLevelId: String(x["grade_level_id"]) })),
    classEnrollments: p.classEnrollments.map((x) => ({ id: String(x["id"]), studentEnrollmentId: String(x["student_enrollment_id"]), classroomId: String(x["classroom_id"]), startsOn: String(x["starts_on"]), endsOn: x["ends_on"] ? String(x["ends_on"]) : null, isPrimary: Boolean(x["is_primary"]), isActive: x["status"] === "active" })),
    staffSchoolAssignments: p.staffSchoolAssignments.map((x) => ({ id: String(x["id"]), staffId: String(x["staff_member_id"]), schoolId: String(x["school_id"]), employeeNumber: x["employee_number"] ? String(x["employee_number"]) : null, isActive: x["status"] === "active" })),
  };
  const expectedById = new Map<string, Record<string, unknown>>();
  for (const row of [...p.students, ...p.guardians, ...p.staff]) expectedById.set(row.id, row.expectedState);
  for (const rows of [p.studentGuardians, p.studentEnrollments, p.classEnrollments, p.staffSchoolAssignments])
    for (const row of rows) expectedById.set(String(row["id"]), row);
  return { job: p.job, reference, identity, expectedById, existing: { studentGuardians: p.studentGuardians, studentEnrollments: p.studentEnrollments, classEnrollments: p.classEnrollments, staffSchoolAssignments: p.staffSchoolAssignments } };
}
