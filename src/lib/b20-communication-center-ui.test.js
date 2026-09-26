import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const read = (relative) => readFileSync(resolve(root, relative), "utf8");
const ui = read("src/components/communications/communication-center-ui.tsx");
const functions = read("src/lib/communication.functions.ts");
const inbox = read("src/components/notifications/notification-inbox-ui.tsx");

describe("B20 Communication Center UI contract", () => {
  test("contains the staff route workflow and capability boundary", () => {
    for (const route of [
      "src/routes/_authenticated/communications/index.tsx",
      "src/routes/_authenticated/communications/new.tsx",
      "src/routes/_authenticated/communications/$announcementId.tsx",
    ]) {
      expect(read(route)).toContain("createFileRoute");
    }
    expect(read("src/components/app-shell.tsx")).toContain('permission: "notification.send"');
    expect(ui).toContain("notification.send");
    expect(ui).not.toMatch(/role\s*===|role\s*!==/);
  });

  test("preserves server-only mutations and stable request identity", () => {
    expect(functions).toContain("requireSupabaseAuth");
    expect(functions).toContain("request_id: data.requestId");
    expect(ui).toContain("crypto.randomUUID()");
    expect(ui).not.toMatch(/\.from\(\s*[`\"]communication_|\.from\(\s*[`\"]notifications/);
    expect(ui).not.toMatch(/midtrans|xendit|qris|virtual account|refund|gateway/i);
  });

  test("keeps notification compatibility and safe announcement navigation", () => {
    expect(inbox).toContain('"announcement_published"');
    expect(inbox).toContain('startsWith("/")');
    expect(ui).toContain("publishMutation.mutate({ version");
    expect(ui).toContain("recipients");
    expect(ui).not.toContain("command_requests");
    expect(ui).not.toContain("audit JSON");
  });
});
