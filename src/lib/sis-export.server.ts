import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeSisExportWorkbook } from "./sis-export.xlsx";
import type { SisDataSheet } from "./sis-import.constants";
import { SIS_XLSX_MIME } from "./sis-import.storage.server";

type RpcClient = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> };
type ExportProjection = { ready: boolean; missingRefs: { students: number; guardians: number; staff: number }; schoolCode: string } & Partial<Record<SisDataSheet, Array<Record<string, unknown>>>>;

export interface SisExportReadiness { ready: boolean; missingRefs: { students: number; guardians: number; staff: number } }
export interface SisExportResult { filename: string; contentType: typeof SIS_XLSX_MIME }

export const getSisExportReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ schoolId: z.string().uuid() }).strict().parse(x))
  .handler(async ({ data, context }) => {
    const result = await (context.supabase as unknown as RpcClient).rpc(
      "get_sis_export_projection",
      { p_school_id: data.schoolId },
    );
    if (result.error || !result.data) throw new Error("B10_AUTHORIZATION_DENIED");
    const projection = result.data as ExportProjection;
    return {
      ready: projection.ready,
      missingRefs: projection.missingRefs,
    } satisfies SisExportReadiness;
  });

export const exportSisData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ schoolId: z.string().uuid() }).strict().parse(x))
  .handler(async ({ data, context }) => {
    const result = await (context.supabase as unknown as RpcClient).rpc(
      "get_sis_export_projection",
      { p_school_id: data.schoolId },
    );
    if (result.error || !result.data) throw new Error("B10_AUTHORIZATION_DENIED");
    const projection = result.data as ExportProjection;
    if (!projection.ready) {
      throw new Error(`B10_EXPORT_REFERENCES_NOT_READY:${JSON.stringify(projection.missingRefs)}`);
    }
    const sheets: Partial<Record<SisDataSheet, Array<Record<string, unknown>>>> = {};
    for (const name of ["Staff", "Students", "Guardians", "StaffSchoolAssignments", "StudentGuardians", "StudentEnrollments", "ClassEnrollments"] as SisDataSheet[])
      sheets[name] = projection[name] ?? [];
    const bytes = await writeSisExportWorkbook(sheets);
    return new Response(new Blob([Uint8Array.from(bytes)]), {
      headers: {
        "content-type": SIS_XLSX_MIME,
        "content-disposition": `attachment; filename="edusmart-sis-${projection.schoolCode}.xlsx"`,
      },
    });
  });
