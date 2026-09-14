import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Download, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Pager, QueryState, StatusBadge } from "@/components/sis/sis-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppContext } from "@/lib/app-context";
import { downloadBinaryResponse, sisErrorCode, sisErrorMessage } from "@/lib/sis-download";
import { exportSisData, getSisExportReadiness } from "@/lib/sis-export.server";
import {
  confirmSisImport,
  downloadSisImportErrors,
  downloadSisImportTemplate,
  getSisImportJob,
  getSisImportPreview,
  listSisImportJobs,
  prepareSisImportReferences,
  uploadSisImportFile,
  validateSisImport,
} from "@/lib/sis-import.server";

const IMPORT_PERMISSIONS = ["student.import", "guardian.import", "staff.import", "enrollment.import"];
const EXPORT_PERMISSIONS = ["student.export", "guardian.export", "staff.export"];
const PAGE_SIZE = 25;
const PREVIEW_PAGE_SIZE = 100;

function BatchPage({ title, description, permissions, actions, children }: { title: string; description: string; permissions: string[]; actions?: ReactNode; children: ReactNode }) {
  const { activeSchool, contextLoading, hasPermission } = useAppContext();
  const allowed = permissions.some(hasPermission);
  let body = children;
  if (contextLoading) body = <Skeleton className="h-48 w-full" />;
  else if (!allowed) body = <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Access denied</AlertTitle><AlertDescription>Your current school permissions do not include this bulk SIS workflow. Server authorization remains authoritative.</AlertDescription></Alert>;
  else if (!activeSchool) body = <Alert><AlertTitle>Select a school</AlertTitle><AlertDescription>Choose the school that owns this import or export.</AlertDescription></Alert>;
  return <AppShell><main className="space-y-6"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="text-sm text-muted-foreground">{description}</p>{activeSchool && <p className="mt-1 text-xs text-muted-foreground">Scope: {activeSchool.name} ({activeSchool.code})</p>}</div>{allowed && activeSchool ? actions : null}</header>{body}</main></AppShell>;
}

function dateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

function count(totals: Record<string, number> | undefined, key: string) {
  return totals?.[key] ?? 0;
}

export function SisImportHistoryPage() {
  const { activeSchool, hasPermission } = useAppContext();
  const listJobs = useServerFn(listSisImportJobs);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [activeSchool?.id]);
  const query = useQuery({
    queryKey: ["sis-imports", activeSchool?.id, page],
    queryFn: () => listJobs({ data: { schoolId: activeSchool!.id, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE } }),
    enabled: Boolean(activeSchool) && IMPORT_PERMISSIONS.some(hasPermission),
  });
  const rows = query.data ?? [];
  return <BatchPage title="SIS Imports" description="Upload, validate, review, and atomically commit canonical school data." permissions={IMPORT_PERMISSIONS} actions={<Button asChild><Link to="/sis-imports/new"><Upload className="mr-2 h-4 w-4" />New Import</Link></Button>}>
    <Card><CardHeader><CardTitle>Import history</CardTitle><CardDescription>Authoritative jobs for the selected school.</CardDescription></CardHeader><CardContent>
      <QueryState isLoading={query.isLoading} error={query.error} isEmpty={!rows.length} emptyTitle="No imports yet" emptyDescription="Start with the canonical template and upload one workbook for this school." onRetry={() => void query.refetch()} columns={7}>
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>File</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead>Validated</TableHead><TableHead>Completed</TableHead><TableHead>Summary</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{rows.map((job) => <TableRow key={job.id}><TableCell><p className="max-w-64 truncate font-medium">{job.filename}</p><p className="text-xs text-muted-foreground">Template {job.templateVersion}</p></TableCell><TableCell><StatusBadge status={job.status} />{job.failureSummary && <p className="mt-1 max-w-52 text-xs text-destructive">{job.failureSummary}</p>}</TableCell><TableCell>{dateTime(job.createdAt)}</TableCell><TableCell>{dateTime(job.validatedAt)}</TableCell><TableCell>{dateTime(job.completedAt)}</TableCell><TableCell className="whitespace-nowrap text-xs">{count(job.totals,"create")} create · {count(job.totals,"update")} update · {count(job.totals,"error")} errors</TableCell><TableCell className="text-right"><Button asChild size="sm" variant="outline"><Link to="/sis-imports/$jobId" params={{ jobId: job.id }}>View</Link></Button></TableCell></TableRow>)}</TableBody></Table></div>
        <Pager page={page} pageSize={PAGE_SIZE} total={(page - 1) * PAGE_SIZE + rows.length + (rows.length === PAGE_SIZE ? 1 : 0)} onPageChange={setPage} />
      </QueryState>
    </CardContent></Card>
  </BatchPage>;
}

export function SisImportNewPage() {
  const { activeOrganization, activeSchool } = useAppContext();
  const navigate = useNavigate();
  const template = useServerFn(downloadSisImportTemplate);
  const upload = useServerFn(uploadSisImportFile);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const templateMutation = useMutation({ mutationFn: () => template(), onSuccess: (response) => downloadBinaryResponse(response, "edusmart-sis-import-template-v1.xlsx"), onError: (e) => setError(sisErrorMessage(e)) });
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !activeOrganization || !activeSchool) throw new Error("B10_FILE_INVALID");
      if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("B10_FILE_INVALID");
      if (file.size > 10 * 1024 * 1024) throw new Error("B10_FILE_TOO_LARGE");
      const form = new FormData(); form.set("file", file); form.set("organizationId", activeOrganization.organizationId); form.set("schoolId", activeSchool.id);
      return upload({ data: form });
    },
    onSuccess: (result) => { toast.success("Workbook uploaded safely."); void navigate({ to: "/sis-imports/$jobId", params: { jobId: result.jobId } }); },
    onError: (e) => setError(sisErrorMessage(e)),
  });
  return <BatchPage title="New SIS Import" description="One canonical .xlsx workbook imports data into one selected school." permissions={IMPORT_PERMISSIONS} actions={<Button variant="outline" onClick={() => templateMutation.mutate()} disabled={templateMutation.isPending}><Download className="mr-2 h-4 w-4" />{templateMutation.isPending ? "Preparing…" : "Download Template"}</Button>}>
    <Card><CardHeader><CardTitle>Select workbook</CardTitle><CardDescription>Use the latest template. Maximum compressed size is 10 MB; server ZIP and formula checks remain authoritative.</CardDescription></CardHeader><CardContent className="space-y-4">
      {error && <Alert variant="destructive" aria-live="polite"><AlertTitle>Upload unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="space-y-2"><Label htmlFor="sis-workbook">XLSX workbook</Label><Input id="sis-workbook" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={uploadMutation.isPending} onChange={(event) => { setError(null); setFile(event.target.files?.[0] ?? null); }} /></div>
      {file && <div className="rounded-md border p-3"><p className="font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB · local precheck only</p></div>}
      <Button disabled={!file || uploadMutation.isPending} onClick={() => uploadMutation.mutate()}><Upload className="mr-2 h-4 w-4" />{uploadMutation.isPending ? "Uploading…" : "Upload Workbook"}</Button>
    </CardContent></Card>
  </BatchPage>;
}

type PreviewRow = { sheet?: string; entityType?: string; rowNumber?: number; action?: string; normalized?: Record<string, unknown>; fieldDiff?: Array<{ field: string; current: unknown; requested: unknown }> };
type PreviewIssue = { sheet?: string; rowNumber?: number; severity?: string; code?: string; field?: string | null; message?: string };

export function SisImportJobPage({ jobId }: { jobId: string }) {
  const { activeSchool } = useAppContext();
  const queryClient = useQueryClient();
  const jobFn = useServerFn(getSisImportJob); const previewFn = useServerFn(getSisImportPreview); const validateFn = useServerFn(validateSisImport); const confirmFn = useServerFn(confirmSisImport); const errorsFn = useServerFn(downloadSisImportErrors);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(1); const [filter, setFilter] = useState("all"); const [pageError, setPageError] = useState<string | null>(null);
  useEffect(() => { setConfirmationToken(null); setPageError(null); }, [activeSchool?.id, jobId]);
  const jobQuery = useQuery({ queryKey: ["sis-import", activeSchool?.id, jobId], queryFn: () => jobFn({ data: { jobId } }), retry: false });
  const previewQuery = useQuery({ queryKey: ["sis-import-preview", activeSchool?.id, jobId], queryFn: () => previewFn({ data: { jobId } }), enabled: Boolean(jobQuery.data && ["validated","completed","failed"].includes(jobQuery.data.status)), retry: false });
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["sis-import", activeSchool?.id, jobId] }), queryClient.invalidateQueries({ queryKey: ["sis-import-preview", activeSchool?.id, jobId] }), queryClient.invalidateQueries({ queryKey: ["sis-imports", activeSchool?.id] })]); };
  const validateMutation = useMutation({ mutationFn: () => validateFn({ data: { jobId } }), onSuccess: async (result) => { setConfirmationToken(result.confirmationToken); setPageError(null); await refresh(); toast.success(result.blockingErrorCount ? "Validation found issues." : "Workbook is ready for confirmation."); }, onError: (e) => setPageError(sisErrorMessage(e)) });
  const confirmMutation = useMutation({ mutationFn: () => { if (!confirmationToken) throw new Error("B10_CONFIRMATION_TOKEN_INVALID"); return confirmFn({ data: { jobId, confirmationToken } }); }, onSuccess: async () => { setConfirmationToken(null); setPageError(null); await refresh(); toast.success("Import completed."); }, onError: async (e) => { const code=sisErrorCode(e); if (["B10_STALE_PREVIEW","B10_CONFIRMATION_TOKEN_INVALID","B10_EXTERNAL_REF_CONFLICT","B10_AY_GRADE_MISMATCH","B10_CLASS_ENROLLMENT_OVERLAP"].includes(code)) setConfirmationToken(null); setPageError(sisErrorMessage(e)); await refresh(); } });
  const errorDownload = useMutation({ mutationFn: () => errorsFn({ data: { jobId } }), onSuccess: (response) => downloadBinaryResponse(response, `sis-import-${jobId}-errors.xlsx`), onError: (e) => setPageError(sisErrorMessage(e)) });
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(jobId)) return <BatchPage title="Import job" description="Review an authoritative import workflow." permissions={IMPORT_PERMISSIONS}><Alert variant="destructive"><AlertTitle>Invalid job</AlertTitle><AlertDescription>The URL does not contain a valid job identifier.</AlertDescription></Alert></BatchPage>;
  const job=jobQuery.data; const preview=previewQuery.data; const errors=count(preview?.totals,"error"); const issues=(preview?.issues ?? []) as PreviewIssue[]; const rows=(preview?.rows ?? []) as PreviewRow[];
  const filtered=rows.filter((row)=>filter==="all" ? true : filter==="warnings" ? issues.some((i)=>i.severity==="warning"&&i.sheet===row.sheet&&i.rowNumber===row.rowNumber) : filter==="errors" ? row.action==="error" : row.action===filter);
  const shown=filtered.slice((previewPage-1)*PREVIEW_PAGE_SIZE,previewPage*PREVIEW_PAGE_SIZE);
  return <BatchPage title={job?.filename ?? "Import job"} description="Authoritative validation preview and transactional confirmation." permissions={IMPORT_PERMISSIONS} actions={<Button asChild variant="outline"><Link to="/sis-imports">Back to History</Link></Button>}>
    {jobQuery.isLoading ? <Skeleton className="h-48 w-full" /> : jobQuery.error || !job ? <Alert variant="destructive"><AlertTitle>Job unavailable</AlertTitle><AlertDescription>{sisErrorMessage(jobQuery.error)}</AlertDescription></Alert> : <>
      {pageError && <Alert variant="destructive" aria-live="polite"><AlertTitle>Action required</AlertTitle><AlertDescription>{pageError}</AlertDescription></Alert>}
      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Workflow status</CardTitle><CardDescription>Template {job.templateVersion} · created {dateTime(job.createdAt)}</CardDescription></div><StatusBadge status={job.status} /></div></CardHeader><CardContent className="space-y-4">
        {job.failureSummary && <Alert variant="destructive"><AlertTitle>Import failed safely</AlertTitle><AlertDescription>{job.failureSummary}. No partial SIS write is retained.</AlertDescription></Alert>}
        {job.status==="uploaded" && <Button disabled={validateMutation.isPending} onClick={()=>validateMutation.mutate()}>{validateMutation.isPending ? "Validating…" : "Validate Workbook"}</Button>}
        {job.status==="validating" && <p className="text-sm text-muted-foreground">Validation is processing. Refresh to obtain the authoritative state.</p>}
        {job.status==="importing" && <p className="text-sm text-muted-foreground">Atomic import is in progress. No second execution will be started.</p>}
        {job.status==="completed" && <Alert><AlertTitle>Import completed</AlertTitle><AlertDescription>The database committed the full plan atomically.</AlertDescription></Alert>}
        {job.status==="cancelled" && <p className="text-sm text-muted-foreground">This import is cancelled and cannot be confirmed.</p>}
        {(job.status==="validated"||job.status==="failed") && !confirmationToken && <Alert><RefreshCw className="h-4 w-4" /><AlertTitle>Confirmation authorization is not in memory</AlertTitle><AlertDescription>Revalidate to generate a new confirmation authorization. Refreshing intentionally does not preserve it.</AlertDescription></Alert>}
        {(job.status==="validated"||job.status==="failed") && <Button variant="outline" disabled={validateMutation.isPending||confirmMutation.isPending} onClick={()=>{setConfirmationToken(null);validateMutation.mutate();}}><RefreshCw className="mr-2 h-4 w-4" />{validateMutation.isPending?"Revalidating…":"Revalidate"}</Button>}
      </CardContent></Card>
      {preview && <>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" aria-label="Preview summary">{["create","update","unchanged","skip","error","warning"].map((key)=><Card key={key}><CardHeader className="pb-2"><CardDescription className="capitalize">{key}</CardDescription><CardTitle>{key==="warning" ? issues.filter((i)=>i.severity==="warning").length : count(preview.totals,key)}</CardTitle></CardHeader></Card>)}</section>
        <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Validated rows</CardTitle><CardDescription>Immutable preview version {preview.previewVersion}; at most {PREVIEW_PAGE_SIZE} rows render per page.</CardDescription></div><Select value={filter} onValueChange={(v)=>{setFilter(v);setPreviewPage(1);}}><SelectTrigger className="w-44" aria-label="Preview filter"><SelectValue /></SelectTrigger><SelectContent>{["all","errors","warnings","create","update","unchanged","skip"].map((x)=><SelectItem key={x} value={x} className="capitalize">{x}</SelectItem>)}</SelectContent></Select></div></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Sheet / row</TableHead><TableHead>Entity</TableHead><TableHead>Action</TableHead><TableHead>Values</TableHead><TableHead>Changes & issues</TableHead></TableRow></TableHeader><TableBody>{shown.map((row,index)=>{const rowIssues=issues.filter((i)=>i.sheet===row.sheet&&i.rowNumber===row.rowNumber);return <TableRow key={`${row.sheet}-${row.rowNumber}-${index}`}><TableCell>{row.sheet}<br/><span className="text-xs text-muted-foreground">Excel row {row.rowNumber}</span></TableCell><TableCell>{row.entityType}</TableCell><TableCell><Badge variant={row.action==="error"?"destructive":"secondary"}>{row.action?.toUpperCase()}</Badge></TableCell><TableCell><dl className="max-w-md text-xs">{Object.entries(row.normalized??{}).slice(0,8).map(([key,value])=><div key={key}><dt className="inline font-medium">{key}: </dt><dd className="inline">{String(value??"—")}</dd></div>)}</dl></TableCell><TableCell><div className="space-y-1">{(row.fieldDiff??[]).map((diff)=><p key={diff.field} className="text-xs"><strong>{diff.field}</strong>: {String(diff.current??"—")} → {String(diff.requested??"—")}</p>)}{rowIssues.map((issue)=><p key={`${issue.code}-${issue.field}`} className={issue.severity==="error"?"text-xs text-destructive":"text-xs text-amber-700"}><strong>{issue.severity}: {issue.code}</strong>{issue.field?` · ${issue.field}`:""} — {issue.message}</p>)}</div></TableCell></TableRow>})}</TableBody></Table></div><Pager page={previewPage} pageSize={PREVIEW_PAGE_SIZE} total={filtered.length} onPageChange={setPreviewPage}/></CardContent></Card>
        <div className="flex flex-wrap gap-2">{issues.length>0 && <Button variant="outline" disabled={errorDownload.isPending} onClick={()=>errorDownload.mutate()}><Download className="mr-2 h-4 w-4" />{errorDownload.isPending?"Preparing…":"Download Error Report"}</Button>}
          {job.status==="validated" && errors===0 && confirmationToken && <AlertDialog><AlertDialogTrigger asChild><Button disabled={confirmMutation.isPending}>Confirm Import</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Commit this SIS import?</AlertDialogTitle><AlertDialogDescription>{count(preview.totals,"create")} records will be created and {count(preview.totals,"update")} updated. {count(preview.totals,"unchanged")} are unchanged and {count(preview.totals,"skip")} skipped. The operation is transactional, changes only listed update fields, and performs no hard delete.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={confirmMutation.isPending}>Cancel</AlertDialogCancel><AlertDialogAction disabled={confirmMutation.isPending||errors>0||!confirmationToken} onClick={()=>confirmMutation.mutate()}>{confirmMutation.isPending?"Confirming…":"Confirm Transactional Import"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
        </div>
      </>}
    </>}
  </BatchPage>;
}

export function SisExportPage() {
  const { activeOrganization, activeSchool, hasPermission } = useAppContext(); const queryClient=useQueryClient();
  const readinessFn=useServerFn(getSisExportReadiness); const prepareFn=useServerFn(prepareSisImportReferences); const exportFn=useServerFn(exportSisData); const [pageError,setPageError]=useState<string|null>(null); const [preparation,setPreparation]=useState<Array<{entityType:string;mintedCount:number;alreadyMappedCount:number}>|null>(null);
  const readiness=useQuery({queryKey:["sis-export-readiness",activeSchool?.id],queryFn:()=>readinessFn({data:{schoolId:activeSchool!.id}}),enabled:Boolean(activeSchool)&&EXPORT_PERMISSIONS.some(hasPermission),retry:false});
  const prepare=useMutation({mutationFn:()=>{if(!activeOrganization||!activeSchool)throw new Error("B10_AUTHORIZATION_DENIED");return prepareFn({data:{organizationId:activeOrganization.organizationId,schoolId:activeSchool.id}});},onSuccess:async(result)=>{setPreparation(result);setPageError(null);await queryClient.invalidateQueries({queryKey:["sis-export-readiness",activeSchool?.id]});toast.success("Durable references prepared.");},onError:(e)=>setPageError(sisErrorMessage(e))});
  const generate=useMutation({mutationFn:()=>{if(!activeSchool)throw new Error("B10_AUTHORIZATION_DENIED");return exportFn({data:{schoolId:activeSchool.id}});},onSuccess:(response)=>downloadBinaryResponse(response,"edusmart-sis-export.xlsx"),onError:(e)=>{setPageError(sisErrorMessage(e));if(sisErrorCode(e)==="B10_EXPORT_REFERENCES_NOT_READY")void readiness.refetch();}});
  useEffect(()=>{setPreparation(null);setPageError(null);},[activeSchool?.id]);
  return <BatchPage title="SIS Export" description="Download the canonical seven-sheet workbook for the selected school." permissions={EXPORT_PERMISSIONS}>
    {pageError&&<Alert variant="destructive" aria-live="polite"><AlertTitle>Export unavailable</AlertTitle><AlertDescription>{pageError}</AlertDescription></Alert>}
    <Card><CardHeader><CardTitle>Durable reference readiness</CardTitle><CardDescription>Reference preparation is explicit and does not change academic or person data.</CardDescription></CardHeader><CardContent className="space-y-4">{readiness.isLoading?<Skeleton className="h-24 w-full"/>:readiness.error||!readiness.data?<Alert variant="destructive"><AlertTitle>Readiness unavailable</AlertTitle><AlertDescription>{sisErrorMessage(readiness.error)}</AlertDescription></Alert>:<><Alert variant={readiness.data.ready?"default":"destructive"}><AlertTitle>{readiness.data.ready?"Ready to export":"References must be prepared"}</AlertTitle><AlertDescription>{readiness.data.ready?"Every exported person has a stable durable reference.":`Missing: ${readiness.data.missingRefs.students} Students, ${readiness.data.missingRefs.guardians} Guardians, ${readiness.data.missingRefs.staff} Staff.`}</AlertDescription></Alert>
      {!readiness.data.ready&&<AlertDialog><AlertDialogTrigger asChild><Button variant="outline" disabled={prepare.isPending}>Prepare References</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Prepare durable SIS references?</AlertDialogTitle><AlertDialogDescription>This persists stable external references only. It does not modify Student, Guardian, Staff, enrollment, or academic data.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={prepare.isPending}>Cancel</AlertDialogCancel><AlertDialogAction disabled={prepare.isPending} onClick={()=>prepare.mutate()}>{prepare.isPending?"Preparing…":"Prepare References"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
      {readiness.data.ready&&<Button disabled={generate.isPending} onClick={()=>generate.mutate()}><FileSpreadsheet className="mr-2 h-4 w-4"/>{generate.isPending?"Generating…":"Export SIS Data"}</Button>}</>}
      {preparation&&<div className="rounded-md border p-3"><p className="mb-2 font-medium">Latest preparation result</p>{preparation.map((row)=><p key={row.entityType} className="text-sm">{row.entityType}: {row.mintedCount} minted, {row.alreadyMappedCount} already prepared</p>)}</div>}
    </CardContent></Card>
  </BatchPage>;
}
