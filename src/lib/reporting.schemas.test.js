import { describe, expect, test } from "bun:test";
import {
  findExistingReportCardInput,
  generateReportCardInput,
  listReportCardGenerationCandidatesInput,
} from "./reporting.schemas.ts";

const UUID = "11111111-1111-1111-1111-111111111111";
const UUID2 = "22222222-2222-2222-2222-222222222222";

describe("generation entry point schemas", () => {
  test("candidate query requires a school id and rejects unrelated payloads", () => {
    expect(listReportCardGenerationCandidatesInput.parse({ schoolId: UUID }).schoolId).toBe(UUID);
    expect(() => listReportCardGenerationCandidatesInput.parse({})).toThrow();
    expect(() => listReportCardGenerationCandidatesInput.parse({ schoolId: "not-a-uuid" })).toThrow();
  });

  test("generation input requires uuid enrollment and term", () => {
    expect(
      generateReportCardInput.parse({ studentEnrollmentId: UUID, termId: UUID2 }).termId,
    ).toBe(UUID2);
    expect(() =>
      generateReportCardInput.parse({ studentEnrollmentId: UUID, termId: "bad" }),
    ).toThrow();
  });

  test("existing card lookup validates uuids", () => {
    expect(
      findExistingReportCardInput.parse({ studentEnrollmentId: UUID, termId: UUID2 }),
    ).toEqual({ studentEnrollmentId: UUID, termId: UUID2 });
    expect(() =>
      findExistingReportCardInput.parse({ studentEnrollmentId: "x", termId: UUID2 }),
    ).toThrow();
  });
});
