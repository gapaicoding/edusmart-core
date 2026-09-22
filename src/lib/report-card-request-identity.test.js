import { expect, test } from "bun:test";
import {
  acquireReportCardRequestAction,
  reportCardFailureIsDefinitive,
} from "./report-card-request-identity";

test("report-card retries retain the logical action identity and payload", () => {
  const first = acquireReportCardRequestAction(
    null,
    { content: { b: 2, a: 1 } },
    () => "request-a",
  );
  const same = acquireReportCardRequestAction(
    first,
    { content: { a: 1, b: 2 } },
    () => "unexpected",
  );
  const changed = acquireReportCardRequestAction(
    first,
    { content: { a: 1, b: 3 } },
    () => "request-b",
  );

  expect(first?.requestId).toBe("request-a");
  expect(same).toBe(first);
  expect(changed).toBeNull();
});

test("a resolved action can be replaced by a deliberate new action", () => {
  const first = acquireReportCardRequestAction(null, { action: "submit" }, () => "request-a");
  const resolved = acquireReportCardRequestAction(null, { action: "return" }, () => "request-b");

  expect(first?.requestId).toBe("request-a");
  expect(resolved?.requestId).toBe("request-b");
});

test("domain CAS failures resolve instead of becoming destructive auto-retries", () => {
  expect(
    reportCardFailureIsDefinitive(new Error("This report card changed. Reload the latest data.")),
  ).toBe(true);
  expect(reportCardFailureIsDefinitive(new Error("Network request failed"))).toBe(false);
});
