import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reportCardDocumentInput, portalReportCardDocumentInput } from "./reporting.schemas";
import { studentReportCardDocumentInput } from "./student-portal.schemas";
import {
  REPORT_CARD_BUCKET,
  REPORT_CARD_DOCUMENT_TYPE,
  REPORT_CARD_SIGNED_URL_TTL_SECONDS,
  createReportCardPdf,
  loadDocumentRecord,
  loadPublishedPdfModel,
  newReportCardDocumentPath,
  requirePortalPublishedReport,
  requireStaffDocumentAccess,
  requireStudentPublishedReport,
  REPORT_CARD_ATTESTATION_TTL_SECONDS,
  signReportCardDocumentAttestation,
} from "./reporting.documents.server";

type RegistrationRow = {
  generated_document_id: string;
  file_asset_id: string;
  object_path: string;
  checksum: string;
  previous_object_path?: string;
};
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: RegistrationRow[] | null;
    error: { message: string; code?: string } | null;
  }>;
};

function documentError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (/permission|authorized|policy|row-level security/i.test(message))
    return "Your permission scope does not allow this Report Card document action.";
  if (/published/i.test(message))
    return "Only a published Report Card can generate an official PDF.";
  if (/authoritative Report Card PDF changed|refresh and retry regeneration/i.test(message))
    return "The official PDF changed while regeneration was running. Refresh the document status and retry.";
  if (/already exists|duplicate|conflict/i.test(message))
    return "An official PDF already exists or is currently being generated. Refresh the document status.";
  if (/metadata is inconsistent/i.test(message)) return message;
  return fallback;
}

export const getReportCardDocumentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => reportCardDocumentInput.parse(x))
  .handler(async ({ data, context }) => {
    const card = await context.supabase
      .from("report_cards")
      .select("id,organization_id,school_id,version,status")
      .eq("id", data.reportCardId)
      .maybeSingle();
    if (card.error) throw new Error("We couldn't load the Report Card document status.");
    if (!card.data) return null;
    await requireStaffDocumentAccess(
      context.supabase,
      `${card.data.organization_id}/${card.data.school_id}/report-cards/${card.data.id}/v${card.data.version}/00000000-0000-4000-8000-000000000000/report-card.pdf`,
    );
    try {
      const document = await loadDocumentRecord(context.supabase, card.data);
      return {
        reportCardStatus: card.data.status,
        state: document ? ("available" as const) : ("not_generated" as const),
        document: document
          ? {
              generatedAt: document.generatedAt,
              checksum: document.checksum,
              sizeBytes: document.sizeBytes,
            }
          : null,
      };
    } catch (error) {
      return {
        reportCardStatus: card.data.status,
        state: "failed" as const,
        document: null,
        message: documentError(error, "The document status is unavailable."),
      };
    }
  });

export const generateReportCardDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => reportCardDocumentInput.parse(x))
  .handler(async ({ data, context }) => {
    try {
      const { card, model } = await loadPublishedPdfModel(context.supabase, data.reportCardId);
      const objectPath = newReportCardDocumentPath({
        organizationId: card.organization_id,
        schoolId: card.school_id,
        reportCardId: card.id,
        version: card.version,
      });
      await requireStaffDocumentAccess(context.supabase, objectPath);
      const existing = await loadDocumentRecord(context.supabase, card);
      if (existing)
        return {
          state: "available" as const,
          generatedAt: existing.generatedAt,
          checksum: existing.checksum,
        };
      const generated = await createReportCardPdf(model);
      const expiresAtEpochSeconds =
        Math.floor(Date.now() / 1000) + REPORT_CARD_ATTESTATION_TTL_SECONDS;
      const attestation = signReportCardDocumentAttestation({
        actorId: context.userId,
        reportCardId: card.id,
        version: card.version,
        organizationId: card.organization_id,
        schoolId: card.school_id,
        objectPath,
        sizeBytes: generated.bytes.length,
        checksum: generated.checksum,
        expiresAtEpochSeconds,
      });
      // A random generation path prevents cross-request races; this only clears
      // an unregistered preemption at the exact newly generated path.
      await context.supabase.storage.from(REPORT_CARD_BUCKET).remove([objectPath]);
      const upload = await context.supabase.storage
        .from(REPORT_CARD_BUCKET)
        .upload(objectPath, generated.bytes, { contentType: "application/pdf", upsert: false });
      if (upload.error) {
        const raced = await loadDocumentRecord(context.supabase, card).catch(() => null);
        if (raced)
          return {
            state: "available" as const,
            generatedAt: raced.generatedAt,
            checksum: raced.checksum,
          };
        throw new Error(`Storage upload failed: ${upload.error.message}`);
      }
      const registration = await (context.supabase as unknown as RpcClient).rpc(
        "register_report_card_document",
        {
          p_report_card_id: card.id,
          p_object_path: objectPath,
          p_size_bytes: generated.bytes.length,
          p_checksum: generated.checksum,
          p_attestation_expires_at: expiresAtEpochSeconds,
          p_attestation: attestation,
        },
      );
      if (registration.error || !registration.data?.[0]) {
        const raced = await loadDocumentRecord(context.supabase, card).catch(() => null);
        if (raced) {
          await context.supabase.storage.from(REPORT_CARD_BUCKET).remove([objectPath]);
          return {
            state: "available" as const,
            generatedAt: raced.generatedAt,
            checksum: raced.checksum,
          };
        }
        await context.supabase.storage
          .from(REPORT_CARD_BUCKET)
          .remove([objectPath])
          .catch(() => undefined);
        throw new Error(
          `Metadata registration failed: ${registration.error?.message ?? "no result"}`,
        );
      }
      return {
        state: "available" as const,
        generatedAt: new Date().toISOString(),
        checksum: generated.checksum,
      };
    } catch (error) {
      throw new Error(
        documentError(error, "We couldn't generate the Report Card PDF. No success was recorded."),
      );
    }
  });

export const regenerateReportCardDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => reportCardDocumentInput.parse(x))
  .handler(async ({ data, context }) => {
    let objectPath: string | null = null;
    let uploaded = false;

    try {
      const { card, model } = await loadPublishedPdfModel(context.supabase, data.reportCardId);
      const existing = await loadDocumentRecord(context.supabase, card);
      if (!existing)
        throw new Error(
          "No authoritative Report Card PDF exists to regenerate. Generate the official PDF first.",
        );

      objectPath = newReportCardDocumentPath({
        organizationId: card.organization_id,
        schoolId: card.school_id,
        reportCardId: card.id,
        version: card.version,
      });
      await requireStaffDocumentAccess(context.supabase, objectPath);

      const generated = await createReportCardPdf(model);
      const expiresAtEpochSeconds =
        Math.floor(Date.now() / 1000) + REPORT_CARD_ATTESTATION_TTL_SECONDS;
      const attestation = signReportCardDocumentAttestation({
        actorId: context.userId,
        reportCardId: card.id,
        version: card.version,
        organizationId: card.organization_id,
        schoolId: card.school_id,
        objectPath,
        sizeBytes: generated.bytes.length,
        checksum: generated.checksum,
        expiresAtEpochSeconds,
      });

      // Only a fresh random orphan can exist at this path. Never overwrite an
      // existing registered object; Storage UPDATE remains unavailable.
      await context.supabase.storage.from(REPORT_CARD_BUCKET).remove([objectPath]);
      const upload = await context.supabase.storage
        .from(REPORT_CARD_BUCKET)
        .upload(objectPath, generated.bytes, { contentType: "application/pdf", upsert: false });
      if (upload.error) throw new Error(`Storage upload failed: ${upload.error.message}`);
      uploaded = true;

      const replacement = await (context.supabase as unknown as RpcClient).rpc(
        "replace_report_card_document",
        {
          p_report_card_id: card.id,
          p_expected_file_asset_id: existing.fileAssetId,
          p_object_path: objectPath,
          p_size_bytes: generated.bytes.length,
          p_checksum: generated.checksum,
          p_attestation_expires_at: expiresAtEpochSeconds,
          p_attestation: attestation,
        },
      );

      const row = replacement.data?.[0];
      if (replacement.error || !row?.previous_object_path) {
        await context.supabase.storage
          .from(REPORT_CARD_BUCKET)
          .remove([objectPath])
          .catch(() => undefined);
        throw new Error(
          `Metadata replacement failed: ${replacement.error?.message ?? "no result"}`,
        );
      }

      uploaded = false;

      // The database transaction has already removed the old file_asset row,
      // so this exact previous object is now an orphan. Cleanup uses the same
      // authenticated JWT and the existing orphan-only DELETE policy.
      const cleanup = await context.supabase.storage
        .from(REPORT_CARD_BUCKET)
        .remove([row.previous_object_path]);

      return {
        state: "available" as const,
        generatedAt: new Date().toISOString(),
        checksum: row.checksum,
        cleanupPending: Boolean(cleanup.error),
      };
    } catch (error) {
      // If the trusted upload succeeded but the replacement transaction did
      // not, the newly uploaded object is still an orphan and is safe to remove.
      if (uploaded && objectPath)
        await context.supabase.storage
          .from(REPORT_CARD_BUCKET)
          .remove([objectPath])
          .catch(() => undefined);
      throw new Error(
        documentError(
          error,
          "We couldn't regenerate the Report Card PDF. The previous official PDF remains authoritative unless the document status shows the replacement.",
        ),
      );
    }
  });

export const getReportCardDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => reportCardDocumentInput.parse(x))
  .handler(async ({ data, context }) => {
    const card = await context.supabase
      .from("report_cards")
      .select("id,organization_id,school_id,version,status")
      .eq("id", data.reportCardId)
      .maybeSingle();
    if (card.error || !card.data) throw new Error("Report Card document not found.");
    const document = await loadDocumentRecord(context.supabase, card.data);
    if (!document) throw new Error("The Report Card PDF has not been generated yet.");
    await requireStaffDocumentAccess(context.supabase, document.objectPath);
    const signed = await context.supabase.storage
      .from(REPORT_CARD_BUCKET)
      .createSignedUrl(document.objectPath, REPORT_CARD_SIGNED_URL_TTL_SECONDS, {
        download: `report-card-v${card.data.version}.pdf`,
      });
    if (signed.error || !signed.data?.signedUrl)
      throw new Error("We couldn't create a secure Report Card download link.");
    return { url: signed.data.signedUrl, expiresIn: REPORT_CARD_SIGNED_URL_TTL_SECONDS };
  });

export const getPortalReportCardDocumentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => portalReportCardDocumentInput.parse(x))
  .handler(async ({ data, context }) => {
    const card = await requirePortalPublishedReport(
      context.supabase,
      context.userId,
      data.studentId,
      data.reportCardId,
    );
    if (!card) return null;
    try {
      const document = await loadDocumentRecord(context.supabase, card);
      return {
        state: document ? ("available" as const) : ("not_generated" as const),
        generatedAt: document?.generatedAt ?? null,
      };
    } catch {
      return { state: "failed" as const, generatedAt: null };
    }
  });

export const getPortalReportCardDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => portalReportCardDocumentInput.parse(x))
  .handler(async ({ data, context }) => {
    const card = await requirePortalPublishedReport(
      context.supabase,
      context.userId,
      data.studentId,
      data.reportCardId,
    );
    if (!card) throw new Error("Report Card document not found or unavailable.");
    const document = await loadDocumentRecord(context.supabase, card);
    if (!document) throw new Error("PDF belum tersedia.");
    const signed = await context.supabase.storage
      .from(REPORT_CARD_BUCKET)
      .createSignedUrl(document.objectPath, REPORT_CARD_SIGNED_URL_TTL_SECONDS, {
        download: `report-card-v${card.version}.pdf`,
      });
    if (signed.error || !signed.data?.signedUrl)
      throw new Error("We couldn't create a secure Report Card download link.");
    return {
      url: signed.data.signedUrl,
      expiresIn: REPORT_CARD_SIGNED_URL_TTL_SECONDS,
      documentType: REPORT_CARD_DOCUMENT_TYPE,
    };
  });

/**
 * Batch 9 — Student document access.
 *
 * Deliberately uses requireStudentPublishedReport, never
 * requirePortalPublishedReport (Parent) and never requireStaffDocumentAccess
 * (staff). No regeneration capability is exposed to the Student persona —
 * only status + a short-lived signed download URL for the existing
 * authoritative B8 document.
 */
export const getStudentReportCardDocumentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => studentReportCardDocumentInput.parse(x))
  .handler(async ({ data, context }) => {
    const card = await requireStudentPublishedReport(
      context.supabase,
      context.userId,
      data.reportCardId,
    );
    if (!card) return null;
    try {
      const document = await loadDocumentRecord(context.supabase, card);
      return {
        state: document ? ("available" as const) : ("not_generated" as const),
        generatedAt: document?.generatedAt ?? null,
      };
    } catch {
      return { state: "failed" as const, generatedAt: null };
    }
  });

export const getStudentReportCardDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => studentReportCardDocumentInput.parse(x))
  .handler(async ({ data, context }) => {
    const card = await requireStudentPublishedReport(
      context.supabase,
      context.userId,
      data.reportCardId,
    );
    if (!card) throw new Error("Report Card document not found or unavailable.");
    const document = await loadDocumentRecord(context.supabase, card);
    if (!document) throw new Error("The Report Card PDF has not been generated yet.");
    const signed = await context.supabase.storage
      .from(REPORT_CARD_BUCKET)
      .createSignedUrl(document.objectPath, REPORT_CARD_SIGNED_URL_TTL_SECONDS, {
        download: `report-card-v${card.version}.pdf`,
      });
    if (signed.error || !signed.data?.signedUrl)
      throw new Error("We couldn't create a secure Report Card download link.");
    return {
      url: signed.data.signedUrl,
      expiresIn: REPORT_CARD_SIGNED_URL_TTL_SECONDS,
      documentType: REPORT_CARD_DOCUMENT_TYPE,
    };
  });
