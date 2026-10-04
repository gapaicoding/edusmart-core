import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const root = path.resolve(import.meta.dir, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("B19 Phase 3 Finance UI contract", () => {
  test("contains the frozen route family and no extra student billing route", () => {
    const routeFiles = [
      "routes/_authenticated/finance/index.tsx",
      "routes/_authenticated/finance/fees.tsx",
      "routes/_authenticated/finance/billing.tsx",
      "routes/_authenticated/finance/invoices/$invoiceId.tsx",
      "routes/_authenticated/finance/payments.tsx",
      "routes/_authenticated/portal/billing.tsx",
    ];
    for (const file of routeFiles) expect(fs.existsSync(path.join(root, file))).toBe(true);
    expect(fs.existsSync(path.join(root, "routes/_authenticated/student/billing.tsx"))).toBe(false);
  });

  test("uses capability navigation and server-function boundary", () => {
    const shell = read("components/app-shell.tsx");
    const ui = read("components/finance/finance-ui.tsx");
    expect(shell).toContain('permission: "finance.read"');
    expect(shell).toContain('permission: "finance.portal_read"');
    expect(ui).toContain("PermissionGate");
    expect(ui).toContain("useServerFn");
    expect(ui).toContain("crypto.randomUUID");
    expect(ui).not.toMatch(/role\s*===|role\s*!==|role\.code/);
  });

  test("preserves Finance semantics and limits gateway UI to the approved sandbox QRIS path", () => {
    const ui = read("components/finance/finance-ui.tsx");
    const preferences = read("lib/app-preferences.tsx");
    expect(ui).not.toMatch(/\.from\(["']finance_/);
    expect(ui).not.toMatch(/\b(insert|update|delete)\s*\(/);
    expect(ui).toContain("not a gateway");
    expect(ui).toContain("Reversed");
    expect(ui).toContain("outstanding");
    expect(ui).toContain("Midtrans");
    expect(ui).toContain('"payment.qris.pay"');
    expect(preferences).toContain("Pay with QRIS (Sandbox)");
    expect(ui).not.toMatch(/Virtual Account|Xendit|Refund/);
    expect(ui).not.toContain("command_requests");
    expect(ui).not.toContain("audit_json");
  });

  test("shows a safe sandbox availability status and manual fallback to Finance operators", () => {
    const ui = read("components/finance/finance-ui.tsx");
    const preferences = read("lib/app-preferences.tsx");
    const server = read("lib/midtrans-qris.server.ts");
    expect(ui).toContain('"payment.qris.notConfigured"');
    expect(ui).toContain('"payment.qris.manualFallback"');
    expect(ui).toContain('"payment.qris.noRealMoney"');
    expect(preferences).toContain("QRIS Sandbox belum dikonfigurasi.");
    expect(preferences).toContain("QRIS Sandbox is not configured.");
    expect(server).toContain('"CONFIGURED" | "NOT_CONFIGURED" | "DISABLED"');
    expect(server).not.toContain("MIDTRANS_SANDBOX_CLIENT_SECRET:");
  });

  test("does not introduce a Phase 3 migration", () => {
    const migrations = fs.readdirSync(path.join(root, "..", "supabase/migrations"));
    expect(
      migrations.filter((name) => name.startsWith("2026092618") && name.includes("b19")),
    ).toEqual([]);
  });
});
