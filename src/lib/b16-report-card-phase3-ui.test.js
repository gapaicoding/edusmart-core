import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const ui = readFileSync(
  new URL("../components/reporting/reporting-ui.tsx", import.meta.url),
  "utf8",
);
const boundary = readFileSync(
  new URL("./report-card-runtime.functions.ts", import.meta.url),
  "utf8",
);
const model = readFileSync(
  new URL("../components/reporting/reporting-model.ts", import.meta.url),
  "utf8",
);
const identity = readFileSync(
  new URL("./report-card-request-identity.ts", import.meta.url),
  "utf8",
);

test("B16 Phase 3 active staff UI uses projections and command boundary", () => {
  for (const name of [
    "listReportCardsProjection",
    "listReportCardCandidatesProjection",
    "getReportCardProjection",
    "generateReportCardDraftCommand",
    "saveReportCardContentCommand",
    "transitionReportCardCommand",
    "publishReportCardCommand",
    "createReportCardRevisionCommand",
  ]) {
    expect(ui).toContain(name);
  }
  expect(ui).not.toContain('from "@/lib/reporting.functions"');
  expect(ui).not.toContain("expectedUpdatedAt");
  expect(ui).toContain("row_version");
  expect(ui).toContain("business_version");
  expect(ui).not.toContain("crypto.randomUUID()");
  expect(ui.match(/mutationFn:/g)?.length).toBeGreaterThan(0);
  expect(ui).toContain("requestAction.begin(");
  expect(ui).toContain("requestAction.retry()");
  expect(identity).toContain("acquireReportCardRequestAction");
  expect(identity).toContain("retryAction");
  expect(identity).toContain("inFlight.current");
  expect(identity).toContain("reportCardFailureIsDefinitive");
  expect(boundary).not.toContain("randomUUID");
  expect(ui).toContain("This report card changed elsewhere");
  expect(model).toContain("report_card.revise_published");
  expect(ui).not.toContain("role ===");
});

test("B16 Phase 3 keeps the browser away from tables, ledger, and documents", () => {
  expect(ui).not.toMatch(
    /\.from\(['"](report_cards|report_card_subject_entries|report_card_narratives|report_card_command_requests)['"]\)/,
  );
  expect(ui).not.toContain("service_role");
  expect(ui).toContain("ReportCardDocumentSection");
  expect(boundary).toContain("b16_report_card_save_content");
  expect(boundary).toContain("b16_report_card_transition");
});

test("B16 Phase 3 presents business revision separately from CAS", () => {
  expect(ui).toContain("Version {row.version}");
  expect(ui).toContain("Version {data.card.version}");
  expect(ui).toContain("expectedRowVersion");
  expect(ui).not.toContain("Version {data.card.row_version}");
});

test("B16 detail context comes from the report card's canonical school/year/term", () => {
  expect(ui).toContain("query.data as unknown as Detail).card.school_id");
  expect(ui).toContain("year.id === rawData.card.academic_year_id");
  expect(ui).toContain("term.id === rawData.card.term_id");
  expect(ui).not.toContain("academicYearName: activeAcademicYear");
  expect(ui).not.toContain("termName: activeTerm");
  expect(ui).toContain("Academic year unavailable");
  expect(ui).toContain("Term unavailable");
});

test("all five active B16 command families receive request identity as mutation input", () => {
  expect(ui).toContain(
    "generateFn({\n        data: { ...action.payload, requestId: action.requestId }",
  );
  expect(ui).toContain("requestId: request.requestId");
  expect(ui).toContain("requestAction.begin(payload)");
  expect(ui).toContain("requestAction.retry()");
  expect(ui).not.toContain("crypto.randomUUID");
  expect(ui).toContain("expectedRowVersion: data.card.row_version");
  expect(ui).toContain("Version {data.card.version}");
});
