import { z } from "zod";

export const pilotReadinessInput = z.object({
  schoolId: z.string().uuid(),
});

export type ReadinessStatus = "READY" | "WARNING" | "BLOCKER" | "MANUAL_FALLBACK";
export type ReadinessCheck = {
  checkCode: string;
  status: ReadinessStatus;
  count?: number;
  actionCode: string;
  routeHint?: string;
};
export type ReadinessDomain = {
  domainCode: string;
  status: ReadinessStatus;
  checks: ReadinessCheck[];
};
export type PilotReadinessReport = {
  school: { id: string; name: string };
  overallStatus: ReadinessStatus;
  generatedAt: string;
  summary: Record<ReadinessStatus, number>;
  domains: ReadinessDomain[];
};

export type PilotReadinessFacts = {
  schoolActive: boolean;
  activeAcademicYears: number;
  activeTerms: number;
  activeClassrooms: number;
  activeEnrollments: number;
  activeClassAssignments: number;
  activeGuardianLinks: number;
  profileLinkedEnrollments: number;
  activeTeachingAssignments: number;
  openAdmissionCycles: number;
  openFollowups: number;
  activeFeeDefinitions: number;
  activeBillingPlans: number;
  publishedAnnouncements: number;
  access: {
    academics: boolean;
    students: boolean;
    teaching: boolean;
    admissions: boolean;
    finance: boolean;
    communication: boolean;
    guardians: boolean;
  };
};

export const pilotReadinessFactsSchema = z.object({
  schoolActive: z.boolean(),
  activeAcademicYears: z.number().int().nonnegative(),
  activeTerms: z.number().int().nonnegative(),
  activeClassrooms: z.number().int().nonnegative(),
  activeEnrollments: z.number().int().nonnegative(),
  activeClassAssignments: z.number().int().nonnegative(),
  activeGuardianLinks: z.number().int().nonnegative(),
  profileLinkedEnrollments: z.number().int().nonnegative(),
  activeTeachingAssignments: z.number().int().nonnegative(),
  openAdmissionCycles: z.number().int().nonnegative(),
  openFollowups: z.number().int().nonnegative(),
  activeFeeDefinitions: z.number().int().nonnegative(),
  activeBillingPlans: z.number().int().nonnegative(),
  publishedAnnouncements: z.number().int().nonnegative(),
  access: z.object({
    academics: z.boolean(),
    students: z.boolean(),
    teaching: z.boolean(),
    guardians: z.boolean(),
    admissions: z.boolean(),
    finance: z.boolean(),
    communication: z.boolean(),
  }),
});

const rank: Record<ReadinessStatus, number> = {
  READY: 0,
  MANUAL_FALLBACK: 1,
  WARNING: 2,
  BLOCKER: 3,
};

export function aggregateReadinessStatus(statuses: ReadinessStatus[]): ReadinessStatus {
  return statuses.reduce<ReadinessStatus>(
    (current, status) => (rank[status] > rank[current] ? status : current),
    "READY",
  );
}

export function buildPilotReadiness(
  school: PilotReadinessReport["school"],
  facts: PilotReadinessFacts,
  generatedAt = new Date().toISOString(),
): PilotReadinessReport {
  const make = (
    domainCode: string,
    checkCode: string,
    status: ReadinessStatus,
    actionCode: string,
    count?: number,
    routeHint?: string,
  ): ReadinessCheck => ({
    checkCode,
    status,
    actionCode,
    ...(count === undefined ? {} : { count }),
    ...(routeHint ? { routeHint } : {}),
  });

  const domains: ReadinessDomain[] = [
    {
      domainCode: "school",
      status: "READY",
      checks: [
        make(
          "school",
          "SCHOOL_ACTIVE",
          facts.schoolActive ? "READY" : "BLOCKER",
          "REVIEW_SCHOOL_SETUP",
          1,
          "/settings",
        ),
      ],
    },
    {
      domainCode: "academic_sis",
      status: "READY",
      checks: [
        make(
          "academic_sis",
          "ACADEMIC_ACCESS",
          facts.access.academics ? "READY" : "BLOCKER",
          "REVIEW_ACADEMIC_ACCESS",
          undefined,
          "/academic/years",
        ),
        make(
          "academic_sis",
          "ACTIVE_ACADEMIC_YEAR",
          facts.activeAcademicYears > 0 ? "READY" : "BLOCKER",
          "CONFIGURE_ACADEMIC_PERIOD",
          facts.activeAcademicYears,
          "/academic/years",
        ),
        make(
          "academic_sis",
          "ACTIVE_TERM",
          facts.activeTerms > 0 ? "READY" : "WARNING",
          "REVIEW_ACADEMIC_PERIOD",
          facts.activeTerms,
          "/academic/terms",
        ),
        make(
          "academic_sis",
          "ACTIVE_CLASSROOMS",
          facts.activeClassrooms > 0 ? "READY" : "BLOCKER",
          "ASSIGN_CLASSROOMS",
          facts.activeClassrooms,
          "/academic/classrooms",
        ),
        make(
          "academic_sis",
          "ACTIVE_ENROLLMENTS",
          facts.activeEnrollments > 0 ? "READY" : "BLOCKER",
          "REVIEW_ENROLLMENTS",
          facts.activeEnrollments,
          "/students",
        ),
        make(
          "academic_sis",
          "CLASSROOM_ASSIGNMENT_COVERAGE",
          facts.activeEnrollments > 0 && facts.activeClassAssignments >= facts.activeEnrollments
            ? "READY"
            : "WARNING",
          facts.activeClassAssignments > 0
            ? "REVIEW_CLASSROOM_ASSIGNMENTS"
            : "ASSIGN_STUDENTS_TO_CLASSROOMS",
          facts.activeClassAssignments,
          "/academic/classrooms",
        ),
      ],
    },
    {
      domainCode: "teaching",
      status: "READY",
      checks: [
        make(
          "teaching",
          "TEACHING_ACCESS",
          facts.access.teaching ? "READY" : "WARNING",
          "REVIEW_TEACHER_ASSIGNMENTS",
          undefined,
          "/teaching-assignments",
        ),
        make(
          "teaching",
          "ACTIVE_TEACHER_ASSIGNMENTS",
          facts.activeTeachingAssignments > 0 ? "READY" : "WARNING",
          "REVIEW_TEACHER_ASSIGNMENTS",
          facts.activeTeachingAssignments,
          "/teaching-assignments",
        ),
      ],
    },
    {
      domainCode: "portals",
      status: "READY",
      checks: [
        make(
          "portals",
          "STUDENT_PORTAL_ACCESS",
          facts.access.students ? "READY" : "WARNING",
          "REVIEW_STUDENT_PORTAL_ACCESS",
          undefined,
          "/students",
        ),
        make(
          "portals",
          "STUDENT_ACCOUNT_LINKS",
          !facts.access.students ||
            (facts.activeEnrollments > 0 && facts.profileLinkedEnrollments === 0)
            ? "WARNING"
            : "READY",
          "REVIEW_STUDENT_PORTAL_ACCESS",
          facts.access.students ? facts.profileLinkedEnrollments : undefined,
          "/students",
        ),
        make(
          "portals",
          "GUARDIAN_LINK_COVERAGE",
          !facts.access.guardians || facts.activeGuardianLinks === 0 ? "WARNING" : "READY",
          "REVIEW_GUARDIAN_LINKS",
          facts.access.guardians ? facts.activeGuardianLinks : undefined,
          "/guardians",
        ),
      ],
    },
    {
      domainCode: "admissions",
      status: "READY",
      checks: [
        make(
          "admissions",
          "ADMISSIONS_ACCESS",
          facts.access.admissions ? "READY" : "WARNING",
          "REVIEW_ADMISSIONS_ACCESS",
          undefined,
          "/admissions",
        ),
        make(
          "admissions",
          "OPEN_ADMISSION_CYCLE",
          facts.openAdmissionCycles > 0 ? "READY" : "WARNING",
          "REVIEW_ADMISSION_CYCLE",
          facts.openAdmissionCycles,
          "/admissions",
        ),
        make(
          "admissions",
          "OPEN_FOLLOWUPS",
          facts.openFollowups > 0 ? "WARNING" : "READY",
          "REVIEW_ADMISSIONS_FOLLOWUP",
          facts.openFollowups,
          "/admissions",
        ),
      ],
    },
    {
      domainCode: "finance",
      status: "READY",
      checks: [
        make(
          "finance",
          "FINANCE_ACCESS",
          facts.access.finance ? "READY" : "BLOCKER",
          "REVIEW_FINANCE_ACCESS",
          undefined,
          "/finance",
        ),
        make(
          "finance",
          "FEE_CONFIGURATION",
          facts.activeFeeDefinitions > 0 ? "READY" : "WARNING",
          "CONFIGURE_FINANCE",
          facts.activeFeeDefinitions,
          "/finance/fees",
        ),
        make(
          "finance",
          "BILLING_CONFIGURATION",
          facts.activeBillingPlans > 0 ? "READY" : "WARNING",
          "REVIEW_BILLING_SETUP",
          facts.activeBillingPlans,
          "/finance/billing",
        ),
        make(
          "finance",
          "ONLINE_PAYMENT_PROVIDER",
          "MANUAL_FALLBACK",
          "USE_MANUAL_PAYMENT_FALLBACK",
          undefined,
          "/finance/payments",
        ),
      ],
    },
    {
      domainCode: "communication",
      status: "READY",
      checks: [
        make(
          "communication",
          "IN_APP_COMMUNICATION",
          facts.access.communication ? "READY" : "BLOCKER",
          "USE_IN_APP_COMMUNICATION",
          facts.publishedAnnouncements,
          "/communications",
        ),
        make(
          "communication",
          "EXTERNAL_COMMUNICATION_PROVIDER",
          "MANUAL_FALLBACK",
          "USE_IN_APP_COMMUNICATION",
          undefined,
          "/communications",
        ),
      ],
    },
  ];
  for (const domain of domains)
    domain.status = aggregateReadinessStatus(domain.checks.map((check) => check.status));
  const statuses = domains.flatMap((domain) => domain.checks.map((check) => check.status));
  const summary: PilotReadinessReport["summary"] = {
    READY: 0,
    WARNING: 0,
    BLOCKER: 0,
    MANUAL_FALLBACK: 0,
  };
  for (const status of statuses) summary[status] += 1;
  return {
    school,
    overallStatus: aggregateReadinessStatus(statuses),
    generatedAt,
    summary,
    domains,
  };
}
