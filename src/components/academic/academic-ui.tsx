import type { FormEvent, ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAppContext } from "@/lib/app-context";
import { translateUiText, useAppPreferences } from "@/lib/app-preferences";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

const ACADEMIC_COPY: Record<string, { id: string; en: string }> = {
  "Academic Years": { id: "Tahun Ajaran", en: "Academic Years" },
  "Each academic year belongs to one school and frames terms, classrooms and enrollment.": {
    id: "Setiap tahun ajaran berlaku untuk satu sekolah dan menjadi dasar semester, rombongan belajar, serta pendaftaran siswa.",
    en: "Each academic year belongs to one school and frames terms, classrooms and enrollment.",
  },
  Terms: { id: "Semester", en: "Terms" },
  "Terms live inside one academic year and must stay within its date range.": {
    id: "Semester berada dalam satu tahun ajaran dan harus mengikuti rentang tanggalnya.",
    en: "Terms live inside one academic year and must stay within its date range.",
  },
  "Grade Levels": { id: "Tingkat Kelas", en: "Grade Levels" },
  Classrooms: { id: "Rombongan Belajar", en: "Classrooms" },
  Subjects: { id: "Mata Pelajaran", en: "Subjects" },
  Curricula: { id: "Kurikulum", en: "Curricula" },
  "Academic Calendar": { id: "Kalender Akademik", en: "Academic Calendar" },
  "Scope:": { id: "Lingkup:", en: "Scope:" },
  "#": { id: "No.", en: "#" },
  Code: { id: "Kode", en: "Code" },
  Name: { id: "Nama", en: "Name" },
  Starts: { id: "Mulai", en: "Starts" },
  Ends: { id: "Selesai", en: "Ends" },
  Status: { id: "Status", en: "Status" },
  Actions: { id: "Tindakan", en: "Actions" },
  Stage: { id: "Jenjang", en: "Stage" },
  State: { id: "Status", en: "State" },
  Version: { id: "Versi", en: "Version" },
  Category: { id: "Kategori", en: "Category" },
  "Grade level": { id: "Tingkat kelas", en: "Grade level" },
  Capacity: { id: "Kapasitas", en: "Capacity" },
  Title: { id: "Judul", en: "Title" },
  Type: { id: "Jenis", en: "Type" },
  Term: { id: "Semester", en: "Term" },
  Dates: { id: "Tanggal", en: "Dates" },
  Instruction: { id: "Kegiatan belajar", en: "Instruction" },
  "New academic year": { id: "Tahun ajaran baru", en: "New academic year" },
  "Edit academic year": { id: "Ubah tahun ajaran", en: "Edit academic year" },
  "New term": { id: "Semester baru", en: "New term" },
  "Edit term": { id: "Ubah semester", en: "Edit term" },
  "New grade level": { id: "Tingkat kelas baru", en: "New grade level" },
  "Edit grade level": { id: "Ubah tingkat kelas", en: "Edit grade level" },
  "New classroom": { id: "Rombongan belajar baru", en: "New classroom" },
  "Edit classroom": { id: "Ubah rombongan belajar", en: "Edit classroom" },
  "New subject": { id: "Mata pelajaran baru", en: "New subject" },
  "Edit subject": { id: "Ubah mata pelajaran", en: "Edit subject" },
  "New curriculum": { id: "Kurikulum baru", en: "New curriculum" },
  "Edit curriculum": { id: "Ubah kurikulum", en: "Edit curriculum" },
  "New calendar event": { id: "Acara kalender baru", en: "New calendar event" },
  "Edit calendar event": { id: "Ubah acara kalender", en: "Edit calendar event" },
  "Select a grade level": { id: "Pilih tingkat kelas", en: "Select a grade level" },
  "Grade levels are tiers (not classrooms) and support PAUD, TK, SD, SMP, SMA, SMK and other structures.":
    {
      id: "Tingkat kelas adalah jenjang, bukan rombongan belajar, dan mendukung PAUD, TK, SD, SMP, SMA, SMK, serta struktur lainnya.",
      en: "Grade levels are tiers (not classrooms) and support PAUD, TK, SD, SMP, SMA, SMK and other structures.",
    },
  "Register the curriculum frameworks this school follows. Detailed CP/TP workflows come later.": {
    id: "Catat kerangka kurikulum yang digunakan sekolah ini.",
    en: "Register the curriculum frameworks this school follows. Detailed CP/TP workflows come later.",
  },
  "Subjects are owned by the school and reused across grade levels and classrooms.": {
    id: "Mata pelajaran dikelola sekolah dan dapat digunakan kembali pada berbagai tingkat kelas dan rombongan belajar.",
    en: "Subjects are owned by the school and reused across grade levels and classrooms.",
  },
  "Holidays, exam weeks and events that shape whether instruction happens.": {
    id: "Hari libur, pekan ujian, dan acara yang menentukan berlangsungnya kegiatan belajar.",
    en: "Holidays, exam weeks and events that shape whether instruction happens.",
  },
  "Classrooms (rombel) belong to one academic year and one grade level.": {
    id: "Rombongan belajar terikat pada satu tahun ajaran dan satu tingkat kelas.",
    en: "Classrooms (rombel) belong to one academic year and one grade level.",
  },
  "Deactivate instead of deleting — enrollment history keeps referencing grade levels.": {
    id: "Nonaktifkan tingkat kelas alih-alih menghapusnya karena riwayat pendaftaran masih menggunakannya.",
    en: "Deactivate instead of deleting — enrollment history keeps referencing grade levels.",
  },
  "Archive superseded frameworks instead of deleting them.": {
    id: "Arsipkan kerangka kurikulum yang sudah tidak digunakan; jangan menghapusnya.",
    en: "Archive superseded frameworks instead of deleting them.",
  },
  "Classrooms are scoped to the active academic year and never carried over between years.": {
    id: "Rombongan belajar berlaku untuk tahun ajaran aktif dan tidak otomatis dibawa ke tahun berikutnya.",
    en: "Classrooms are scoped to the active academic year and never carried over between years.",
  },
  "Academic years are never deleted — close or archive them instead to keep history intact.": {
    id: "Tahun ajaran tidak dihapus. Tutup atau arsipkan agar riwayat tetap terjaga.",
    en: "Academic years are never deleted — close or archive them instead to keep history intact.",
  },
  "The term date range must stay inside the academic year — the database enforces this rule.": {
    id: "Rentang tanggal semester harus berada di dalam tahun ajaran.",
    en: "The term date range must stay inside the academic year — the database enforces this rule.",
  },
};

function academicCopy(value: string, locale: "id" | "en") {
  return ACADEMIC_COPY[value]?.[locale] ?? translateUiText(value, locale);
}

/**
 * Shared Academic Setup shell.
 *
 * The read-permission check here is UX only. Every query behind it still runs
 * through RLS, and unauthorized reads/writes are refused by the database.
 */
export function AcademicPage({
  title,
  description,
  readPermission,
  actions,
  children,
}: {
  title: string;
  description: string;
  readPermission: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { activeSchool, hasPermission, contextLoading, error } = useAppContext();
  const { t, locale } = useAppPreferences();

  let body: ReactNode = children;

  if (contextLoading && !error) {
    body = (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else if (!hasPermission(readPermission)) {
    body = (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("common.accessDenied")}</CardTitle>
          <CardDescription>{t("common.accessDeniedDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  } else if (!activeSchool) {
    body = (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("common.selectSchoolFirst")}</CardTitle>
          <CardDescription>{t("academic.selectSchoolDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{academicCopy(title, locale)}</h1>
            <p className="text-sm text-muted-foreground">{academicCopy(description, locale)}</p>
            {activeSchool && (
              <p className="mt-1 text-xs text-muted-foreground">
                {academicCopy("Scope:", locale)} {activeSchool.name} ({activeSchool.code})
              </p>
            )}
          </div>
          {activeSchool && hasPermission(readPermission) ? actions : null}
        </div>
        {body}
      </div>
    </AppShell>
  );
}

/**
 * Distinguishes loading, failed queries and genuinely empty result sets.
 * A failed query is never rendered as an empty state.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyTitle,
  emptyDescription,
  onRetry,
  columns,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  onRetry?: () => void;
  columns?: number;
  children: ReactNode;
}) {
  const { t, locale } = useAppPreferences();
  if (isLoading) {
    return (
      <Table>
        <TableBody>
          {Array.from({ length: 4 }).map((_, row) => (
            <TableRow key={row}>
              {Array.from({ length: columns ?? 4 }).map((__, col) => (
                <TableCell key={col}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{t("common.loadError")}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{t("common.loadErrorDescription")}</p>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              {t("common.retry")}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border p-10 text-center">
        <Inbox className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">{academicCopy(emptyTitle, locale)}</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {academicCopy(emptyDescription, locale)}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  draft: "secondary",
  inactive: "outline",
  closed: "outline",
  archived: "destructive",
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useAppPreferences();
  const key = `common.status.${status}`;
  const label = t(key as Parameters<typeof t>[0]);
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? "secondary"} className="capitalize">
      {label === key ? status.replace(/_/g, " ") : label}
    </Badge>
  );
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitting,
  error,
  submitLabel = "Save",
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitting: boolean;
  error: string | null;
  submitLabel?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  const { t, locale } = useAppPreferences();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{academicCopy(title, locale)}</DialogTitle>
          <DialogDescription>{academicCopy(description, locale)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {children}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("common.saving") : academicCopy(submitLabel, locale)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  const { locale } = useAppPreferences();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{academicCopy(label, locale)}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{academicCopy(hint, locale)}</p>}
    </div>
  );
}
