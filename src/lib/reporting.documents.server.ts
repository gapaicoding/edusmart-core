import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getPortalSubjectRelationship } from "./portal.server";
import {
  generateReportCardPdf,
  reportCardObjectPath,
  sha256Hex,
  type ReportCardPdfModel,
} from "./reporting.pdf";
export { reportCardObjectPath } from "./reporting.pdf";

export const REPORT_CARD_BUCKET = "report-cards";
export const REPORT_CARD_DOCUMENT_TYPE = "report_card_pdf";
export const REPORT_CARD_SIGNED_URL_TTL_SECONDS = 120;

type Client = SupabaseClient<Database>;
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
};

export function canGenerateReportCardDocument(status: string) {
  return status === "published";
}

export function isShortLivedDocumentTtl(seconds: number) {
  return seconds >= 60 && seconds <= 300;
}

export function isExactReportCardDocument(input: {
  reportCardId: string;
  organizationId: string;
  schoolId: string;
  version: number;
  entityId: string;
  entityType: string;
  documentType: string;
  bucket: string;
  objectPath: string;
}) {
  return (
    input.entityId === input.reportCardId &&
    input.entityType === "report_card" &&
    input.documentType === REPORT_CARD_DOCUMENT_TYPE &&
    input.bucket === REPORT_CARD_BUCKET &&
    input.objectPath ===
      reportCardObjectPath({
        organizationId: input.organizationId,
        schoolId: input.schoolId,
        reportCardId: input.reportCardId,
        version: input.version,
      })
  );
}

async function callBooleanRpc(supabase: Client, name: string, args: Record<string, unknown>) {
  const result = await (supabase as unknown as RpcClient).rpc(name, args);
  if (result.error)
    throw new Error("Your permission scope does not allow this Report Card document action.");
  return result.data === true;
}

export async function requireStaffDocumentAccess(supabase: Client, objectPath: string) {
  if (
    !(await callBooleanRpc(supabase, "can_staff_download_report_card_document_object", {
      p_object_path: objectPath,
    }))
  )
    throw new Error("Your permission scope does not allow this Report Card document action.");
}

export async function loadDocumentRecord(
  supabase: Client,
  card: { id: string; organization_id: string; school_id: string; version: number },
) {
  const { data, error } = await supabase
    .from("generated_documents")
    .select(
      "id,entity_type,entity_id,document_type,file_asset_id,checksum,generated_at,file_assets(id,bucket,object_path,mime_type,size_bytes,status,organization_id,school_id)",
    )
    .eq("entity_type", "report_card")
    .eq("entity_id", card.id)
    .eq("document_type", REPORT_CARD_DOCUMENT_TYPE)
    .maybeSingle();
  if (error) throw new Error("We couldn't load the Report Card document right now.");
  if (!data) return null;
  const file = data.file_assets;
  if (
    !file ||
    !isExactReportCardDocument({
      reportCardId: card.id,
      organizationId: card.organization_id,
      schoolId: card.school_id,
      version: card.version,
      entityId: data.entity_id,
      entityType: data.entity_type,
      documentType: data.document_type,
      bucket: file.bucket,
      objectPath: file.object_path,
    }) ||
    file.mime_type !== "application/pdf" ||
    file.status !== "active" ||
    file.organization_id !== card.organization_id ||
    file.school_id !== card.school_id
  )
    throw new Error(
      "The Report Card document metadata is inconsistent. Contact support before retrying.",
    );
  return {
    documentId: data.id,
    fileAssetId: data.file_asset_id,
    checksum: data.checksum,
    generatedAt: data.generated_at,
    objectPath: file.object_path,
    sizeBytes: file.size_bytes,
  };
}

export async function loadPublishedPdfModel(
  supabase: Client,
  reportCardId: string,
): Promise<{
  card: Database["public"]["Tables"]["report_cards"]["Row"];
  model: ReportCardPdfModel;
}> {
  const card = await supabase.from("report_cards").select("*").eq("id", reportCardId).maybeSingle();
  if (card.error) throw new Error("We couldn't load this Report Card for document generation.");
  if (!card.data) throw new Error("Report Card not found.");
  if (!canGenerateReportCardDocument(card.data.status))
    throw new Error("Only a published Report Card can generate an official PDF.");
  const enrollment = await supabase
    .from("student_enrollments")
    .select("student_id")
    .eq("id", card.data.student_enrollment_id)
    .maybeSingle();
  if (enrollment.error || !enrollment.data)
    throw new Error("Report Card enrollment context is unavailable.");
  const [student, school, year, term, entries, narratives] = await Promise.all([
    supabase
      .from("students")
      .select("full_name")
      .eq("id", enrollment.data.student_id)
      .maybeSingle(),
    supabase.from("schools").select("name").eq("id", card.data.school_id).maybeSingle(),
    supabase
      .from("academic_years")
      .select("name")
      .eq("id", card.data.academic_year_id)
      .maybeSingle(),
    supabase.from("terms").select("name").eq("id", card.data.term_id).maybeSingle(),
    supabase
      .from("report_card_subject_entries")
      .select("subject_id,final_score,predicate,narrative")
      .eq("report_card_id", card.data.id),
    supabase
      .from("report_card_narratives")
      .select("title,content,sequence")
      .eq("report_card_id", card.data.id)
      .order("sequence"),
  ]);
  if ([student, school, year, term, entries, narratives].some((result) => result.error))
    throw new Error("The published Report Card snapshot could not be loaded completely.");
  const subjectIds = [...new Set((entries.data ?? []).map((entry) => entry.subject_id))];
  const subjects = subjectIds.length
    ? await supabase.from("subjects").select("id,name").in("id", subjectIds)
    : { data: [], error: null };
  if (subjects.error) throw new Error("The Report Card subjects could not be loaded.");
  const names = new Map((subjects.data ?? []).map((subject) => [subject.id, subject.name]));
  const rawAttendance =
    card.data.attendance_summary &&
    typeof card.data.attendance_summary === "object" &&
    !Array.isArray(card.data.attendance_summary)
      ? (card.data.attendance_summary as Record<string, unknown>)
      : {};
  const rawCounts =
    rawAttendance["counts"] &&
    typeof rawAttendance["counts"] === "object" &&
    !Array.isArray(rawAttendance["counts"])
      ? (rawAttendance["counts"] as Record<string, unknown>)
      : {};
  const count = (key: string) =>
    typeof rawCounts[key] === "number" ? (rawCounts[key] as number) : 0;
  return {
    card: card.data,
    model: {
      reportCardId: card.data.id,
      version: card.data.version,
      schoolName: school.data?.name ?? "School",
      studentName: student.data?.full_name ?? "Student",
      academicYearName: year.data?.name ?? "Academic year",
      termName: term.data?.name ?? "Term",
      publishedAt: card.data.published_at!,
      subjects: (entries.data ?? []).map((entry) => ({
        subjectName: names.get(entry.subject_id) ?? "Subject",
        finalScore: entry.final_score,
        predicate: entry.predicate,
        narrative: entry.narrative,
      })),
      attendance: {
        finalizedSessionCount:
          typeof rawAttendance["finalizedSessionCount"] === "number"
            ? (rawAttendance["finalizedSessionCount"] as number)
            : 0,
        counts: {
          present: count("present"),
          late: count("late"),
          excused: count("excused"),
          sick: count("sick"),
          absent: count("absent"),
          other: count("other"),
        },
      },
      homeroomComment: card.data.homeroom_comment,
      narratives: (narratives.data ?? []).map((narrative) => ({
        title: narrative.title,
        content: narrative.content,
      })),
    },
  };
}

export async function createReportCardPdf(model: ReportCardPdfModel) {
  const fontUrl = import.meta
    .resolve("@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff");
  const fontBytes = new Uint8Array(await readFile(fileURLToPath(fontUrl)));
  const bytes = await generateReportCardPdf(model, fontBytes);
  return { bytes, checksum: await sha256Hex(bytes) };
}

export async function requirePortalPublishedReport(
  supabase: Client,
  userId: string,
  studentId: string,
  reportCardId: string,
) {
  const relationship = await getPortalSubjectRelationship(supabase, userId, studentId);
  if (!relationship || !relationship.can_view_academic) return null;
  const card = await supabase
    .from("report_cards")
    .select("id,organization_id,school_id,student_enrollment_id,version,status")
    .eq("id", reportCardId)
    .eq("status", "published")
    .maybeSingle();
  if (card.error || !card.data) return null;
  const enrollment = await supabase
    .from("student_enrollments")
    .select("student_id")
    .eq("id", card.data.student_enrollment_id)
    .eq("student_id", studentId)
    .maybeSingle();
  if (enrollment.error || !enrollment.data) return null;
  return card.data;
}
