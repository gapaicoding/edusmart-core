import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SIS_DATA_SHEETS, SIS_TEMPLATE_VERSION, type SisDataSheet } from "./sis-import.constants";
import { canonicalizePersistedValidationPlan } from "./sis-import.attestation";
import { signSisImportPlanAttestation, SIS_IMPORT_PLAN_ATTESTATION_TTL_SECONDS } from "./sis-import.attestation.server";
import { computeNormalizedPlanFingerprint } from "./sis-import.fingerprint";
import { convergeSisImportAction } from "./sis-import.convergence";
import { buildSisValidationPlan, type SisWorkbookRows, type SisSheetRow } from "./sis-import.plan";
import { generateSisImportTemplate, parseSisWorkbook, type ParsedWorkbook } from "./sis-import.xlsx";
import { normalizeBoolean, normalizeDate, normalizeEmail, normalizeIdentifierText, normalizePhone, normalizeText } from "./sis-import.normalize";
import { writeSisCorrectedTemplate } from "./sis-export.xlsx";
import { loadSisValidationSnapshot } from "./sis-import.snapshot.server";
import { SIS_IMPORT_BUCKET, SIS_XLSX_MIME, assertSisUploadEnvelope, inspectXlsxZip, newSisImportObjectPath } from "./sis-import.storage.server";

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
type RpcClient = { rpc(name: string, args?: Record<string, unknown>): Promise<RpcResult> };
type StorageClient = { storage: { from(bucket: string): { upload(path: string, bytes: Uint8Array, options: Record<string, unknown>): Promise<{ error: { message: string } | null }>; download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>; remove(paths: string[]): Promise<{ error: { message: string } | null }> } } };

export interface SisImportJobSummary { id: string; filename: string; templateVersion: string; status: string; totals: Record<string, number>; previewVersion: number; failureSummary: string | null; createdAt: string; validatedAt: string | null; completedAt: string | null }
export interface SisImportValidationResponse { jobId: string; previewVersion: number; confirmationToken: string | null; blockingErrorCount: number; totals: Record<string, number> }
export interface SisImportCommitResponse { jobId: string; status: string; totals: Record<string, number>; failureSummary: string | null }
export interface SisReferencePreparationResult { entityType: string; mintedCount: number; alreadyMappedCount: number }

const uuid = z.string().uuid();
const jobInput = z.object({ jobId: uuid }).strict();
const confirmInput = z.object({ jobId: uuid, confirmationToken: z.string().min(1).max(256) }).strict();
const pageInput = z.object({ schoolId: uuid, limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).default(0) }).strict();
const sheetKey: Record<SisDataSheet, keyof SisWorkbookRows> = { Students: "students", Guardians: "guardians", Staff: "staff", StudentGuardians: "studentGuardians", StaffSchoolAssignments: "staffSchoolAssignments", StudentEnrollments: "studentEnrollments", ClassEnrollments: "classEnrollments" };
const identifierFields = new Set(["student_ref","guardian_ref","staff_ref","nisn","employee_number","student_ref_or_nisn","staff_ref_or_employee_number","school_code","academic_year_code","grade_level_code","classroom_code"]);
const booleanFields = new Set(["is_primary","can_view_academic","can_view_attendance","can_receive_notification","can_manage_permissions"]);
const dateFields = new Set(["birth_date","joined_on","left_on","enrolled_on","ended_on","starts_on","ends_on"]);
const expectedFields: Record<string,string[]>={staff_school_assignment:["staff_member_id","employee_number","position_title","employment_status","joined_on","left_on","status"],student_guardian:["relationship_type","is_primary","can_view_academic","can_view_attendance","can_receive_notification","can_manage_permissions","status"],student_enrollment:["student_id","school_id","academic_year_id","grade_level_id","student_number","enrollment_number","status","enrolled_on","ended_on"],class_enrollment:["student_enrollment_id","classroom_id","starts_on","ends_on","is_primary","status"]};

function normalizeCell(field: string, value: unknown) {
  if (identifierFields.has(field)) return normalizeIdentifierText(value).value;
  if (field === "email") return normalizeEmail(value);
  if (field === "phone") return normalizePhone(value);
  if (booleanFields.has(field)) { const r=normalizeBoolean(value); return r.ok?r.value:null; }
  if (dateFields.has(field)) { if (value===null||value===undefined||value==="") return null; const r=normalizeDate(value); return r.ok?r.value:null; }
  return normalizeText(value);
}

export function parsedWorkbookToPlanRows(parsed: ParsedWorkbook): SisWorkbookRows {
  const out: SisWorkbookRows={students:[],guardians:[],staff:[],studentGuardians:[],staffSchoolAssignments:[],studentEnrollments:[],classEnrollments:[]};
  for(const sheet of parsed.sheets){
    const rows: SisSheetRow[]=sheet.rows.map((row)=>({sheet:sheet.sheetName,rowNumber:row.rowNumber,normalized:Object.fromEntries(Object.entries(row.cellsByHeader).map(([field,cell])=>[field,normalizeCell(field,cell.value)]))}));
    (out[sheetKey[sheet.sheetName]] as SisSheetRow[]).push(...rows);
  }
  return out;
}

function rpc(context: { supabase: unknown }) { return context.supabase as RpcClient; }
function pickExpected(row:Record<string,unknown>,fields:string[]){return Object.fromEntries(fields.map((f)=>[f,row[f]??null]));}
function safeError(error: unknown) { const m=error instanceof Error?error.message:""; const code=m.match(/B10_[A-Z0-9_]+/)?.[0]; return new Error(code??"B10_IMPORT_COMMIT_FAILED"); }
function xlsxResponse(bytes: Uint8Array, filename: string) { return new Response(new Blob([Uint8Array.from(bytes)]),{headers:{"content-type":SIS_XLSX_MIME,"content-disposition":`attachment; filename="${filename}"`}}); }

export const downloadSisImportTemplate=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async()=>xlsxResponse(await generateSisImportTemplate(),"edusmart-sis-import-template-v1.xlsx"));

export const uploadSisImportFile=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((x:unknown)=>x as FormData).handler(async({data,context})=>{
  let jobId:string|null=null; let objectPath:string|null=null;
  try{
    const file=data.get("file"); const organizationId=String(data.get("organizationId")??""); const schoolId=String(data.get("schoolId")??"");
    if(!(file instanceof File)||!uuid.safeParse(organizationId).success||!uuid.safeParse(schoolId).success) throw new Error("B10_FILE_INVALID");
    assertSisUploadEnvelope(file); const bytes=new Uint8Array(await file.arrayBuffer()); await inspectXlsxZip(bytes);
    const created=await rpc(context).rpc("create_sis_import_job",{p_organization_id:organizationId,p_school_id:schoolId,p_source_filename:file.name,p_source_file_hash:createHash("sha256").update(bytes).digest("hex"),p_template_version:SIS_TEMPLATE_VERSION});
    if(created.error||!created.data) throw new Error(created.error?.message??"B10_AUTHORIZATION_DENIED");
    const job=(Array.isArray(created.data)?created.data[0]:created.data) as {id:string;organization_id:string;school_id:string}; jobId=job.id;
    objectPath=newSisImportObjectPath({organizationId:job.organization_id,schoolId:job.school_id,jobId:job.id});
    const storage=(context.supabase as unknown as StorageClient).storage.from(SIS_IMPORT_BUCKET);
    const uploaded=await storage.upload(objectPath,bytes,{contentType:SIS_XLSX_MIME,upsert:false}); if(uploaded.error) throw new Error("B10_FILE_UPLOAD_FAILED");
    const attached=await rpc(context).rpc("register_sis_import_source_file",{p_job_id:job.id,p_object_path:objectPath,p_original_filename:file.name,p_mime_type:SIS_XLSX_MIME,p_size_bytes:bytes.length});
    if(attached.error){await storage.remove([objectPath]);throw new Error(attached.error.message);}
    return {jobId:job.id,status:"uploaded" as const};
  }catch(error){if(jobId) await rpc(context).rpc("fail_sis_import_upload",{p_job_id:jobId}).catch(()=>undefined);throw safeError(error);}
});

async function loadJob(context:{supabase:unknown},jobId:string){const r=await rpc(context).rpc("get_sis_import_job_payload",{p_job_id:jobId});if(r.error||!r.data)throw safeError(new Error(r.error?.message??"B10_JOB_NOT_FOUND"));return r.data as Record<string,unknown>;}

export const validateSisImport=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((x:unknown)=>jobInput.parse(x)).handler(async({data,context})=>{
  try{
    const job=await loadJob(context,data.jobId);
    const objectPath=newSisImportObjectPath({organizationId:String(job["organizationId"]),schoolId:String(job["schoolId"]),jobId:String(job["id"])});
    const downloaded=await (context.supabase as unknown as StorageClient).storage.from(SIS_IMPORT_BUCKET).download(objectPath);if(downloaded.error||!downloaded.data)throw new Error("B10_FILE_INVALID");
    const bytes=new Uint8Array(await downloaded.data.arrayBuffer());await inspectXlsxZip(bytes);const parsed=await parseSisWorkbook(bytes);
    if(parsed.issues.some((i)=>i.severity==="error"))throw new Error(parsed.issues[0]?.code??"B10_FILE_INVALID");
    const workbook=parsedWorkbookToPlanRows(parsed);const snapshot=await loadSisValidationSnapshot(context.supabase,data.jobId,workbook);
    const plan=buildSisValidationPlan(workbook,{organizationId:snapshot.job.organizationId,selectedSchoolCode:snapshot.reference.school.code,selectedSchoolId:snapshot.job.schoolId,templateVersion:snapshot.job.templateVersion,reference:snapshot.reference,identity:snapshot.identity});
    const rowsBySheet=Object.fromEntries(SIS_DATA_SHEETS.map((s)=>[s,(workbook[sheetKey[s]]??[]).map((r)=>r.normalized)]));
    const fingerprint=computeNormalizedPlanFingerprint({templateVersion:snapshot.job.templateVersion,organizationId:snapshot.job.organizationId,schoolId:snapshot.job.schoolId,rowsBySheet});
    const persistedRows=plan.rows.map((row)=>{let expected=row.resolvedEntityId?snapshot.expectedById.get(row.resolvedEntityId)??null:null;const fields=expectedFields[row.entityType];if(expected&&fields)expected=pickExpected(expected,fields);if(row.entityType==="student_guardian"){
      const studentKey=String(row.normalized["student_ref_or_nisn"]??"").toLowerCase();const guardianKey=String(row.normalized["guardian_ref"]??"").toLowerCase();const student=snapshot.identity.students.find((s)=>s.ref===studentKey||s.nisn===studentKey);const guardian=snapshot.identity.guardians.find((g)=>g.ref===guardianKey);const relation=snapshot.existing.studentGuardians.find((x)=>String(x["student_id"])===student?.id&&String(x["guardian_id"])===guardian?.id);if(relation)expected=pickExpected(relation,expectedFields["student_guardian"]??[]);
    }const action=convergeSisImportAction(row.action,row.normalized,expected);return {sheet:row.sheet,rowNumber:row.rowNumber,entityType:row.entityType,action,matchKey:row.matchIdentity as unknown as Record<string,unknown>,expectedState:expected,resolvedEntityId:row.resolvedEntityId,raw:null,normalized:row.normalized};});
    const issues=plan.issues.map((i)=>({rowIndex:Math.max(0,plan.rows.findIndex((r)=>r.sheet===i.sheet&&r.rowNumber===i.rowNumber)),severity:i.severity,code:i.code,field:i.field??null,rawValue:i.rawValue==null?null:String(i.rawValue),normalizedValue:i.normalizedValue==null?null:String(i.normalizedValue),message:i.message}));
    const totals=persistedRows.reduce<Record<string,number>>((a,r)=>(a[r.action]=(a[r.action]??0)+1,a),{});const canonical=canonicalizePersistedValidationPlan({rows:persistedRows,issues,totals});
    const expiresAtEpochSeconds=Math.floor(Date.now()/1000)+SIS_IMPORT_PLAN_ATTESTATION_TTL_SECONDS;const attestation=signSisImportPlanAttestation({actorId:context.userId,jobId:data.jobId,expectedPreviousPreviewVersion:snapshot.job.previewVersion,normalizedPlanFingerprint:fingerprint,...canonical,expiresAtEpochSeconds});
    const saved=await rpc(context).rpc("persist_sis_import_validation",{p_job_id:data.jobId,p_expected_previous_preview_version:snapshot.job.previewVersion,p_normalized_plan_fingerprint:fingerprint,p_rows_json:canonical.rowsJson,p_issues_json:canonical.issuesJson,p_totals_json:canonical.totalsJson,p_attestation_expires_at:expiresAtEpochSeconds,p_attestation:attestation});if(saved.error)throw new Error(saved.error.message);
    const result=(saved.data as Array<Record<string,unknown>>)?.[0];return {jobId:data.jobId,previewVersion:Number(result?.["preview_version"]),confirmationToken:result?.["confirmation_token"]?String(result["confirmation_token"]):null,blockingErrorCount:Number(result?.["blocking_error_count"]??0),totals} satisfies SisImportValidationResponse;
  }catch(error){throw safeError(error);}
});

export const getSisImportJob=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).inputValidator((x:unknown)=>jobInput.parse(x)).handler(async({data,context})=>{const j=await loadJob(context,data.jobId);return {id:String(j["id"]),filename:String(j["filename"]),templateVersion:String(j["templateVersion"]),status:String(j["status"]),totals:j["totals"] as Record<string,number>,previewVersion:Number(j["previewVersion"]),failureSummary:j["failureSummary"]?String(j["failureSummary"]):null,createdAt:String(j["createdAt"]),validatedAt:j["validatedAt"]?String(j["validatedAt"]):null,completedAt:j["completedAt"]?String(j["completedAt"]):null};});
export const getSisImportPreview=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).inputValidator((x:unknown)=>jobInput.parse(x)).handler(async({data,context})=>{const j=await loadJob(context,data.jobId);return {jobId:String(j["id"]),status:String(j["status"]),totals:j["totals"] as Record<string,number>,previewVersion:Number(j["previewVersion"]),rows:j["rows"] as Array<Record<string,string|number|null>>,issues:j["issues"] as Array<Record<string,string|number|null>>};});
export const listSisImportJobs=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).inputValidator((x:unknown)=>pageInput.parse(x)).handler(async({data,context})=>{const r=await rpc(context).rpc("list_sis_import_jobs",{p_school_id:data.schoolId,p_limit:data.limit,p_offset:data.offset});if(r.error)throw safeError(new Error(r.error.message));return r.data as SisImportJobSummary[];});
export const confirmSisImport=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((x:unknown)=>confirmInput.parse(x)).handler(async({data,context})=>{const r=await rpc(context).rpc("commit_sis_import_job",{p_job_id:data.jobId,p_confirmation_token:data.confirmationToken});if(r.error)throw safeError(new Error(r.error.message));const x=(r.data as SisImportCommitResponse[])?.[0];return x;});
export const downloadSisImportErrors=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((x:unknown)=>jobInput.parse(x)).handler(async({data,context})=>{const j=await loadJob(context,data.jobId);const issues=(j["issues"] as Array<Record<string,unknown>>).map((i)=>{const issue={sheet:String(i["sheet"]),entityType:String(i["entityType"]) as never,rowNumber:Number(i["rowNumber"]),severity:String(i["severity"]) as never,code:String(i["code"]),rawValue:i["rawValue"],normalizedValue:i["normalizedValue"],message:String(i["message"])};return i["field"]?{...issue,field:String(i["field"])}:issue;});const objectPath=newSisImportObjectPath({organizationId:String(j["organizationId"]),schoolId:String(j["schoolId"]),jobId:String(j["id"])});const downloaded=await (context.supabase as unknown as StorageClient).storage.from(SIS_IMPORT_BUCKET).download(objectPath);if(downloaded.error||!downloaded.data)throw new Error("B10_FILE_INVALID");const bytes=new Uint8Array(await downloaded.data.arrayBuffer());await inspectXlsxZip(bytes);const workbook=parsedWorkbookToPlanRows(await parseSisWorkbook(bytes));const sheetsData=Object.fromEntries(SIS_DATA_SHEETS.map((sheet)=>[sheet,(workbook[sheetKey[sheet]]??[]).map((row)=>row.normalized)]));const sourceRowNumbers=Object.fromEntries(SIS_DATA_SHEETS.map((sheet)=>[sheet,(workbook[sheetKey[sheet]]??[]).map((row)=>row.rowNumber)]));return xlsxResponse(await writeSisCorrectedTemplate(sheetsData,issues,sourceRowNumbers),`sis-import-${data.jobId}-errors.xlsx`);});
export const prepareSisImportReferences=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((x:unknown)=>z.object({organizationId:uuid,schoolId:uuid}).strict().parse(x)).handler(async({data,context})=>{const r=await rpc(context).rpc("prepare_sis_import_references",{p_organization_id:data.organizationId,p_school_id:data.schoolId});if(r.error)throw safeError(new Error(r.error.message));return r.data as SisReferencePreparationResult[];});
