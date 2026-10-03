import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { aggregateReadinessStatus, buildPilotReadiness } from "./pilot-readiness.schemas.ts";

const functions = readFileSync("src/lib/pilot-readiness.functions.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261003100000_b26_pilot_readiness_access.sql",
  "utf8",
);
const projectionMigration = readFileSync(
  "supabase/migrations/20261003110000_b26_pilot_readiness_projection.sql",
  "utf8",
);
const validator = readFileSync("supabase/validation/validate_b26_pilot_readiness.sql", "utf8");

const baseFacts = {
  schoolActive: true,
  activeAcademicYears: 1,
  activeTerms: 2,
  activeClassrooms: 4,
  activeEnrollments: 30,
  activeClassAssignments: 30,
  activeGuardianLinks: 26,
  profileLinkedEnrollments: 24,
  activeTeachingAssignments: 8,
  openAdmissionCycles: 1,
  openFollowups: 0,
  activeFeeDefinitions: 2,
  activeBillingPlans: 1,
  publishedAnnouncements: 1,
  access: {
    academics: true,
    students: true,
    teaching: true,
    admissions: true,
    finance: true,
    communication: true,
    guardians: true,
  },
};

describe("B26 pilot readiness contract", () => {
  test("aggregate precedence is deterministic and never averages away blockers", () => {
    expect(aggregateReadinessStatus(["READY", "MANUAL_FALLBACK"])).toBe("MANUAL_FALLBACK");
    expect(aggregateReadinessStatus(["MANUAL_FALLBACK", "WARNING"])).toBe("WARNING");
    expect(aggregateReadinessStatus(["BLOCKER", "READY", "MANUAL_FALLBACK"])).toBe("BLOCKER");
    expect(aggregateReadinessStatus([])).toBe("READY");
  });

  test("ready school has explicit manual payment and communication fallbacks", () => {
    const report = buildPilotReadiness(
      { id: "school-safe", name: "Synthetic School" },
      baseFacts,
      "2026-10-03T00:00:00.000Z",
    );
    expect(report.overallStatus).toBe("MANUAL_FALLBACK");
    expect(
      report.domains
        .find((domain) => domain.domainCode === "finance")
        .checks.find((check) => check.checkCode === "ONLINE_PAYMENT_PROVIDER"),
    ).toMatchObject({ status: "MANUAL_FALLBACK", actionCode: "USE_MANUAL_PAYMENT_FALLBACK" });
    expect(
      report.domains
        .find((domain) => domain.domainCode === "communication")
        .checks.find((check) => check.checkCode === "EXTERNAL_COMMUNICATION_PROVIDER"),
    ).toMatchObject({ status: "MANUAL_FALLBACK", actionCode: "USE_IN_APP_COMMUNICATION" });
  });

  test("warning and blocker facts map to stable codes and precedence", () => {
    const report = buildPilotReadiness(
      { id: "school-safe", name: "Synthetic School" },
      {
        ...baseFacts,
        activeAcademicYears: 0,
        activeEnrollments: 0,
        openAdmissionCycles: 0,
        openFollowups: 2,
      },
    );
    expect(report.overallStatus).toBe("BLOCKER");
    expect(
      report.domains
        .find((domain) => domain.domainCode === "admissions")
        .checks.find((check) => check.checkCode === "OPEN_FOLLOWUPS").status,
    ).toBe("WARNING");
    expect(
      report.domains
        .find((domain) => domain.domainCode === "academic_sis")
        .checks.find((check) => check.checkCode === "ACTIVE_ENROLLMENTS").actionCode,
    ).toBe("REVIEW_ENROLLMENTS");
  });

  test("report contains safe counts and codes but no domain record fields", () => {
    const serialized = JSON.stringify(
      buildPilotReadiness({ id: "safe-id", name: "Synthetic School" }, baseFacts),
    );
    expect(serialized).not.toMatch(
      /studentName|guardianName|email|phone|invoiceNumber|amount|applicationBody|profileId/i,
    );
    expect(serialized).toContain("ACTIVE_ENROLLMENTS");
  });

  test("server derives school scope and uses authenticated read-only aggregates", () => {
    expect(functions).toContain("requireSupabaseAuth");
    expect(functions).toContain('"b26_get_pilot_readiness_facts"');
    expect(projectionMigration).toContain("school.readiness.read");
    expect(projectionMigration).toContain("has_staff_scope_permission");
    expect(projectionMigration).toContain("set search_path = ''");
    expect(projectionMigration).toContain(
      "grant execute on function public.b26_get_pilot_readiness_facts(uuid) to authenticated",
    );
    expect(functions).not.toMatch(
      /\.insert\(|\.update\(|\.delete\(|\.rpc\([^\n]*(?:repair|mutate|create)/i,
    );
    expect(projectionMigration).not.toMatch(/\b(insert|update|delete|truncate)\b/i);
    expect(validator).toContain("B26_PILOT_READINESS_VALIDATION_PASS");
  });

  test("minimal readiness permission is granted only to leadership system roles", () => {
    expect(migration).toContain("school.readiness.read");
    expect(migration).toContain("('ORG_OWNER', 'SCHOOL_ADMIN', 'PRINCIPAL')");
    expect(migration).not.toMatch(/VICE_PRINCIPAL|TEACHER|PARENT|STUDENT/);
  });
});
