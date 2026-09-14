import { describe, expect, test } from "bun:test";
import { computeNormalizedPlanFingerprint } from "./sis-import.fingerprint";

const base = {
  templateVersion: "1",
  organizationId: "org1",
  schoolId: "sch1",
  rowsBySheet: {
    Students: [{ student_ref: "stu-001", full_name: "Ahmad" }],
  },
};

describe("computeNormalizedPlanFingerprint", () => {
  test("same logical plan twice -> same hash", () => {
    expect(computeNormalizedPlanFingerprint(base)).toBe(computeNormalizedPlanFingerprint(base));
  });

  test("object key insertion order does not affect hash", () => {
    const reordered = {
      rowsBySheet: { Students: [{ full_name: "Ahmad", student_ref: "stu-001" }] },
      schoolId: "sch1",
      organizationId: "org1",
      templateVersion: "1",
    };
    expect(computeNormalizedPlanFingerprint(base)).toBe(computeNormalizedPlanFingerprint(reordered));
  });

  test("one normalized cell change -> different hash", () => {
    const changed = {
      ...base,
      rowsBySheet: { Students: [{ student_ref: "stu-001", full_name: "Budi" }] },
    };
    expect(computeNormalizedPlanFingerprint(base)).not.toBe(computeNormalizedPlanFingerprint(changed));
  });

  test("different school -> different hash", () => {
    const changed = { ...base, schoolId: "sch2" };
    expect(computeNormalizedPlanFingerprint(base)).not.toBe(computeNormalizedPlanFingerprint(changed));
  });

  test("different template version -> different hash", () => {
    const changed = { ...base, templateVersion: "2" };
    expect(computeNormalizedPlanFingerprint(base)).not.toBe(computeNormalizedPlanFingerprint(changed));
  });
});
