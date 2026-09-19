import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const ui = readFileSync(
  new URL("../components/portal/parent-permission-requests-ui.tsx", import.meta.url),
  "utf8",
);
const listRoute = readFileSync(
  new URL("../routes/_authenticated/portal/permission-requests.tsx", import.meta.url),
  "utf8",
);
const detailRoute = readFileSync(
  new URL("../routes/_authenticated/portal/permission-requests/$requestId.tsx", import.meta.url),
  "utf8",
);
const notifications = readFileSync(
  new URL("../components/notifications/notification-inbox-ui.tsx", import.meta.url),
  "utf8",
);

describe("B12 Phase 4 Parent permission UI source contract", () => {
  test("uses independently authorized Parent list/detail/history RPCs", () => {
    for (const token of [
      "listParentPermissionRequests",
      "getParentPermissionRequest",
      "listPermissionDecisionHistory",
      "useServerFn(listParentPermissionRequests)",
      "useServerFn(getParentPermissionRequest)",
      "useServerFn(listPermissionDecisionHistory)",
      "requestRecipientId: next.student.recipientId",
    ])
      expect(ui).toContain(token);
    expect(ui).not.toMatch(/parent_permission_decisions/);
    expect(ui).not.toMatch(/parent_permission_decision_history/);
  });

  test("parses the owner-authorized decision version and never substitutes request version", () => {
    expect(ui).toContain('student["decision_version"]');
    expect(ui).toContain("decisionVersion: versionValue");
    expect(ui).toMatch(
      /expectedVersion:\s*next\.student\.decision\s*\?\s*next\.student\.decisionVersion\s*:\s*null/,
    );
    expect(ui).not.toContain("request.version");
    expect(ui).not.toContain("expectedVersion: 0");
    expect(ui).toContain('student["owned_by_me"]');
    expect(ui).toContain('student["can_respond"]');
  });

  test("keeps first decisions, owner changes, and null-version safety distinct", () => {
    expect(ui).toMatch(
      /expectedVersion:\s*next\.student\.decision\s*\?\s*next\.student\.decisionVersion\s*:\s*null/,
    );
    expect(ui).toContain("MISSING_DECISION_VERSION");
    expect(ui).toMatch(
      /student\.decision\s*&&\s*student\.ownedByMe\s*&&\s*student\.canRespond\s*&&\s*student\.decisionVersion\s*===\s*null/,
    );
    expect(ui).toContain("student.decision && !student.ownedByMe");
    expect(ui).toContain("Decision made by another Guardian");
    expect(ui).toContain("Deadline passed");
    expect(ui).toContain('request.status === "closed"');
    expect(ui).toContain('request.status === "cancelled"');
  });

  test("maps concurrency and lifecycle races to refresh-safe UX without force retry", () => {
    for (const token of [
      'code === "STALE_VERSION"',
      'code === "DECISION_OWNED_BY_OTHER_GUARDIAN"',
      'code === "REQUEST_EXPIRED"',
      'code === "REQUEST_CLOSED"',
      'code === "REQUEST_CANCELLED"',
      "detailQuery.refetch()",
      "crypto.randomUUID()",
      "No action was sent",
    ])
      expect(ui).toContain(token);
    expect(ui).not.toContain("retry: true");
    expect(ui).not.toContain("force");
  });

  test("keeps notification opening/read separate and preserves safe Parent deep links", () => {
    expect(listRoute).toContain("ParentPermissionRequestListPage");
    expect(detailRoute).toContain("ParentPermissionRequestDetailPage");
    expect(notifications).toContain('to="/permission-requests/$requestId"');
    expect(notifications).toContain("markNotificationRead");
    expect(notifications).toContain("navigate({ to: item.deep_link as never })");
    expect(ui).not.toContain("markNotificationRead");
  });

  test("includes accessible, bounded, responsive presentation contracts", () => {
    for (const token of [
      "aria-label={`Decision actions for ${student.studentName}`}",
      'aria-label="Decision history"',
      "DialogTitle",
      "DialogDescription",
      "PAGE_SIZE = 20",
      "Previous",
      "Next",
      "sm:flex-row",
      "flex-wrap",
    ])
      expect(ui).toContain(token);
  });
});
