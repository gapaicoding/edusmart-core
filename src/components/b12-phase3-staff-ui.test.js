import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const read = (relativePath) => readFileSync(resolve(root, relativePath), "utf8");
const staffUi = read("components/permission-requests/permission-requests-ui.tsx");
const notificationsUi = read("components/notifications/notification-inbox-ui.tsx");
const shell = read("components/app-shell.tsx");
const functions = read("lib/notifications-parent-permissions.functions.ts");
const routeFiles = [
  "routes/_authenticated/permission-requests/index.tsx",
  "routes/_authenticated/permission-requests/new.tsx",
  "routes/_authenticated/permission-requests/$requestId.tsx",
  "routes/_authenticated/permission-requests/$requestId.edit.tsx",
  "routes/_authenticated/notifications.tsx",
].map(read);

describe("B12 Phase 3 Staff UI and notification inbox", () => {
  test("registers Staff and shared authenticated routes without Parent decision UI", () => {
    expect(routeFiles).toHaveLength(5);
    expect(routeFiles.join("\n")).toContain("permission-requests");
    expect(routeFiles.join("\n")).toContain("notifications");
    expect(routeFiles.join("\n")).not.toContain("submit_parent_permission_decision");
    expect(shell).toContain('label: "Permission Requests"');
    expect(shell).toContain('"permission_request.read"');
  });

  test("uses authenticated wrappers and server-side bounded queries", () => {
    expect(staffUi).toContain("listStaffPermissionRequests");
    expect(staffUi).toContain("listPermissionRequestResponses");
    expect(staffUi).toContain("pageSize: PAGE_SIZE");
    expect(notificationsUi).toContain("listMyNotifications");
    expect(notificationsUi).toContain("pageSize: PAGE_SIZE");
    expect(functions).toContain("requireSupabaseAuth");
    expect(functions).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  test("keeps mutations on RPC wrappers and protects action identity", () => {
    for (const name of [
      "createPermissionRequest",
      "updatePermissionRequest",
      "publishPermissionRequest",
      "closePermissionRequest",
      "cancelPermissionRequest",
      "sendPermissionRequestReminder",
      "markNotificationRead",
    ])
      expect(staffUi + notificationsUi).toContain(name);
    expect(staffUi).toContain("useState(commandId)");
    expect(staffUi).toContain("STALE_VERSION");
    expect(staffUi + notificationsUi).not.toMatch(
      /\.from\(\s*["'](parent_permission_requests|notifications|notification_recipients)/,
    );
    expect(staffUi + notificationsUi).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  test("implements lifecycle safety, fallback notifications and safe deep links", () => {
    expect(routeFiles.join("\\n") + staffUi).toContain(
      "Only draft permission requests can be edited",
    );
    expect(routeFiles.join("\\n") + staffUi).toContain("There is no reopen");
    expect(staffUi).toContain("eligible Parents with pending responses");
    expect(notificationsUi).toContain('"Notification"');
    expect(notificationsUi).toContain('link.startsWith("/")');
  });

  test("keeps due-date mapping and visible validation in the form boundary", () => {
    expect(staffUi).toContain("export function toDueAtIso");
    expect(staffUi).toContain("const dueAt = toDueAtIso");
    expect(staffUi).toContain("        dueAt,");
    expect(staffUi).toContain('role="alert"');
    expect(staffUi).toContain("Select a classroom target.");
    expect(staffUi).toContain("Select at least one Student target.");
  });

  test("keeps the detail route from swallowing its edit child", () => {
    expect(routeFiles[2]).toContain('pathname.endsWith("/edit")');
    expect(routeFiles[2]).toContain("<Outlet />");
    expect(routeFiles[3]).toContain("PermissionRequestFormPage");
    expect(routeFiles[3]).toContain("Only draft permission requests can be edited.");
  });
});
