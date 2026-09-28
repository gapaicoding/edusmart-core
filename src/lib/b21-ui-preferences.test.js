import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { translateUiNode, translateUiText } from "./app-preferences.tsx";

const root = process.cwd();
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

describe("B21 UI preferences and stabilization contract", () => {
  test("provides persisted ID/EN locale and light/dark theme preferences", () => {
    const source = read("src/lib/app-preferences.tsx");
    expect(source).toContain('"edusmart.locale"');
    expect(source).toContain('"edusmart.theme"');
    expect(source).toContain('type Locale = "id" | "en"');
    expect(source).toContain('type Theme = "light" | "dark"');
    expect(source).toContain("document.documentElement.lang");
    expect(source).toContain('classList.toggle("dark"');
  });

  test("initializes preferences before the application shell and exposes Settings", () => {
    const rootSource = read("src/routes/__root.tsx");
    const shellSource = read("src/components/app-shell.tsx");
    expect(rootSource).toContain("AppPreferencesProvider");
    expect(rootSource).toContain("localStorage.getItem('edusmart.theme')");
    expect(shellSource).toContain('navigate({ to: "/settings" })');
    expect(read("src/routes/_authenticated/settings.tsx")).toContain("SettingsPage");
  });

  test("keeps dashboard user-facing and removes raw permission inventory", () => {
    const dashboard = read("src/routes/_authenticated/dashboard.tsx");
    expect(dashboard).toContain("dashboard.workspaceReady");
    expect(dashboard).not.toContain("Foundation shell");
    expect(dashboard).not.toContain("permissions.slice");
  });

  test("keeps assessment list and detail inside the authenticated product shell", () => {
    expect(read("src/routes/_authenticated/assessments/index.tsx")).toContain("<AppShell>");
    expect(read("src/routes/_authenticated/assessments/$id.tsx")).toContain("<AppShell>");
  });

  test("uses semantic tokens for the B21 shell and shared page header", () => {
    expect(read("src/components/ui/page-header.tsx")).toContain("text-foreground");
    expect(read("src/components/app-shell.tsx")).toContain("bg-background");
    expect(read("src/components/app-shell.tsx")).toContain('t("common.openNavigation")');
    expect(read("src/components/app-shell.tsx")).toContain(
      'aria-label={t("common.closeNavigation")}',
    );
    expect(read("src/components/app-shell.tsx")).toContain('role="dialog"');
    expect(read("src/components/app-shell.tsx")).toContain('event.key === "Escape"');
    expect(read("src/components/app-shell.tsx")).toContain("mobileCloseRef.current?.focus()");
    expect(read("src/components/app-shell.tsx")).toContain('t("notifications.unreadAria"');
  });

  test("keeps shared SIS/academic error, pagination, and status presentation localized", () => {
    const preferences = read("src/lib/app-preferences.tsx");
    const academic = read("src/components/academic/academic-ui.tsx");
    const sis = read("src/components/sis/sis-ui.tsx");
    expect(preferences).toContain('"common.status.published"');
    expect(preferences).toContain('"common.status.paid"');
    expect(academic).toContain('t("common.loadError")');
    expect(academic).toContain("const key = `common.status.${status}`");
    expect(sis).toContain('t("common.previous")');
    expect(sis).toContain('t("common.next")');
    expect(sis).not.toContain("{readPermission}</code>");
  });

  test("localizes shared table, button, field, badge, and placeholder labels without changing values", () => {
    const preferences = read("src/lib/app-preferences.tsx");
    expect(preferences).toContain("export function translateUiText");
    expect(preferences).toContain('"Academic Year": "Tahun Ajaran"');
    expect(read("src/components/ui/table.tsx")).toContain(
      "translateUiNode(children, preferences.locale)",
    );
    expect(read("src/components/ui/button.tsx")).toContain(
      "translateUiNode(children, preferences.locale)",
    );
    expect(read("src/components/ui/label.tsx")).toContain(
      "translateUiNode(children, preferences.locale)",
    );
    expect(read("src/components/ui/badge.tsx")).toContain(
      "translateUiNode(children, preferences.locale)",
    );
    expect(read("src/components/ui/input.tsx")).toContain(
      "translateUiText(placeholder, preferences.locale)",
    );
  });

  test("keeps Parent and Student portal shell copy localized and backend errors private", () => {
    const preferences = read("src/lib/app-preferences.tsx");
    const parentPortal = read("src/components/portal/portal-ui.tsx");
    const studentPortal = read("src/components/student-portal/student-portal-ui.tsx");
    expect(preferences).toContain('"portal.parentEmptyTitle"');
    expect(preferences).toContain('"portal.studentEmptyTitle"');
    expect(parentPortal).toContain('t("portal.parentEmptyDescription")');
    expect(studentPortal).toContain('t("portal.studentEmptyDescription")');
    expect(parentPortal).not.toContain("{(error as Error).message}");
    expect(studentPortal).not.toContain("{(overviewQuery.error as Error).message}");
  });

  test("localizes exact copy through nested shared UI without changing domain values", () => {
    const tree = createElement(
      "section",
      null,
      createElement("button", null, "New assessment"),
      createElement("span", null, "notification.send"),
    );
    const localized = translateUiNode(tree, "id");
    expect(localized.props.children[0].props.children).toBe("Penilaian baru");
    expect(localized.props.children[1].props.children).toBe("notification.send");
  });

  test("localizes assessment detail states while keeping backend status values intact", () => {
    expect(translateUiText("Eligible", "id")).toBe("Memenuhi syarat");
    expect(translateUiText("Score entry", "id")).toBe("Entri nilai");
    expect(translateUiText("Historical · read-only", "id")).toBe("Historis · hanya dapat dibaca");
    expect(translateUiText("missing", "id")).toBe("Belum diisi");
    const gradebook = read("src/components/assessment/assessment-gradebook-ui.tsx");
    expect(gradebook).toContain('translateUiText("Assessment unavailable.", locale)');
    expect(gradebook).not.toContain('?.message ?? "Assessment unavailable."');
  });

  test("localizes audited reporting, admissions, SIS, and progression copy without mutating domain labels", () => {
    expect(
      translateUiText("Your current permissions do not include report-card access.", "id"),
    ).toBe("Izin Anda saat ini tidak mencakup akses ke rapor.");
    expect(translateUiText("Historical period — closed", "id")).toBe("Periode historis — ditutup");
    expect(translateUiText("Import history", "id")).toBe("Riwayat impor");
    expect(translateUiText("Create Progression Batch", "id")).toBe("Buat kelompok kenaikan kelas");
    expect(translateUiText("Convert accepted application?", "id")).toBe(
      "Konversi pendaftaran yang diterima?",
    );
    expect(translateUiText("notification.send", "id")).toBe("notification.send");
  });

  test("localizes Parent portal navigation, billing denial, and permission-request controls", () => {
    expect(translateUiText("Scores", "id")).toBe("Nilai");
    expect(
      translateUiText("Billing is available only to an authorized related parent.", "id"),
    ).toBe("Tagihan hanya tersedia bagi orang tua/wali yang terhubung dan berwenang.");
    expect(
      translateUiText("Review and respond to permission requests for your children.", "id"),
    ).toBe("Tinjau dan tanggapi permintaan izin untuk anak Anda.");
    expect(read("src/components/app-shell.tsx")).toContain('Scores: t("navigation.scores")');
    expect(read("src/components/portal/parent-permission-requests-ui.tsx")).toContain(
      'preferences.t("common.previous")',
    );
  });

  test("localizes restricted Teacher operational states without changing permissions", () => {
    expect(
      translateUiText("Your active account does not have a Teaching Journal permission.", "id"),
    ).toBe("Akun aktif Anda tidak memiliki izin untuk Jurnal Mengajar.");
    expect(
      translateUiText("Your active account does not have Staff Attendance permission.", "id"),
    ).toBe("Akun aktif Anda tidak memiliki izin untuk Presensi Staf.");
    const journal = read("src/components/teacher-daily-operations/teaching-journal-ui.tsx");
    const staffAttendance = read("src/components/teacher-daily-operations/staff-attendance-ui.tsx");
    expect(journal).toContain("if (contextLoading)");
    expect(staffAttendance).toContain("{contextLoading ? (");
  });

  test("localizes root not-found and application error recovery copy", () => {
    expect(translateUiText("Page not found", "id")).toBe("Halaman tidak ditemukan");
    expect(translateUiText("Go home", "id")).toBe("Kembali ke beranda");
    expect(translateUiText("This page didn't load", "id")).toBe("Halaman ini tidak dapat dimuat");
    expect(read("src/routes/__root.tsx")).toContain('translateUiText("Page not found", locale)');
  });

  test("keeps SIS user errors safe and localized without exposing internal error codes", () => {
    const sisDownload = readFileSync(new URL("./sis-download.ts", import.meta.url), "utf8");
    expect(sisDownload).not.toContain("${code}");
    expect(
      translateUiText("Choose a valid .xlsx file created from the latest template.", "id"),
    ).toBe("Pilih berkas .xlsx valid yang dibuat dari templat terbaru.");
    expect(translateUiText("Workbook uploaded safely.", "id")).toBe(
      "Buku kerja berhasil diunggah dengan aman.",
    );
  });

  test("keeps Finance screens inside the app shell and localizes native billing options", () => {
    const finance = read("src/components/finance/finance-ui.tsx");
    expect(finance).toContain("<AppShell>");
    expect(finance).toContain('translateUiText("Monthly", locale)');
    expect(finance).toContain('translateUiText("One-time", locale)');
  });
});
