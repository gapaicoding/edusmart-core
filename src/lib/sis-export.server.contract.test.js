import {describe,expect,test} from "bun:test";import {readFileSync} from "node:fs";
const server=readFileSync(new URL("./sis-export.server.ts",import.meta.url),"utf8");const sql=readFileSync(new URL("../../supabase/migrations/20260912150000_b10_sis_import_server_transport.sql",import.meta.url),"utf8");
describe("B10 Phase 3C export server contract",()=>{
 test("1. export authenticates and accepts one school only",()=>{expect(server).toContain("requireSupabaseAuth");expect(server).toContain("z.object({ schoolId: z.string().uuid() }).strict()");});
 test("2. projection requires all seven permission classes",()=>{for(const e of ["student","guardian","staff","student_guardian","student_enrollment","class_enrollment","staff_school_assignment"])expect(sql).toContain(`'${e}'`);expect(sql).toContain("sis_entity_export_permission_codes");});
 test("3. export never auto-prepares or mints refs",()=>{expect(server).not.toMatch(/prepare_sis_import_references|mint_sis_entity_ref/);expect(sql.slice(sql.indexOf("get_sis_export_projection"))).not.toMatch(/insert into public\.sis_import_entity_refs/);});
 test("4. missing refs fail controlled",()=>expect(server).toContain("B10_EXPORT_REFERENCES_NOT_READY"));
 test("5. workbook output has no internal UUID fields",()=>{const projection=sql.slice(sql.indexOf("get_sis_export_projection"));expect(projection).not.toMatch(/jsonb_build_object\('(student_id|guardian_id|staff_member_id|profile_id|organization_id|school_id)'/);});
 test("6. school scope is explicit throughout",()=>expect((sql.match(/school_id=s\.id/g)??[]).length).toBeGreaterThanOrEqual(6));
 test("7. writer and binary XLSX response are used",()=>{expect(server).toContain("writeSisExportWorkbook");expect(server).toContain("new Response(new Blob");expect(server).toContain("SIS_XLSX_MIME");});
});
