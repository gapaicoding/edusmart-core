begin;
set transaction read only;
do $$
declare sig text;
begin
 if not exists(select 1 from storage.buckets where id='sis-imports' and public=false and file_size_limit=10485760) then raise exception 'B10-3C private bucket/limit missing'; end if;
 if (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'sis_import_%')<>3 then raise exception 'B10-3C storage policy set mismatch'; end if;
 if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'sis_import_%' and coalesce(qual,with_check,'') not ilike '%sis-imports%') then raise exception 'B10-3C storage policy lacks exact bucket predicate'; end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='sis_import_objects_insert' and with_check ilike '%can_insert_sis_import_storage_object%') then raise exception 'B10-3C upload policy does not use its callable hardened predicate'; end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='sis_import_objects_select' and qual ilike '%can_select_sis_import_storage_object%') then raise exception 'B10-3C read policy does not use its callable hardened predicate'; end if;
 if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('sis_import_objects_insert','sis_import_objects_select') and (coalesce(qual,'') ilike '%has_sis_permission_for_school%' or coalesce(with_check,'') ilike '%has_sis_permission_for_school%')) then raise exception 'B10-3C Storage policy directly calls an authenticated-denied internal helper'; end if;
 foreach sig in array array['can_insert_sis_import_storage_object(text)','can_select_sis_import_storage_object(text)'] loop
  if to_regprocedure('public.'||sig) is null then raise exception 'B10-3C Storage policy predicate missing: %',sig; end if;
  if pg_get_function_result(to_regprocedure('public.'||sig))<>'boolean' then raise exception 'B10-3C Storage policy predicate is not boolean-only: %',sig; end if;
  if not (select p.prosecdef and exists (
      select 1 from unnest(coalesce(p.proconfig,array[]::text[])) cfg
      where split_part(cfg,'=',1)='search_path'
        and split_part(cfg,'=',2) in ('','""'))
    from pg_proc p where p.oid=to_regprocedure('public.'||sig)) then raise exception 'B10-3C Storage policy predicate is not hardened: %',sig; end if;
  if has_function_privilege('public','public.'||sig,'execute') or has_function_privilege('anon','public.'||sig,'execute') or has_function_privilege('service_role','public.'||sig,'execute') then raise exception 'B10-3C forbidden Storage predicate grant: %',sig; end if;
  if not has_function_privilege('authenticated','public.'||sig,'execute') then raise exception 'B10-3C Storage policy cannot execute its predicate: %',sig; end if;
 end loop;
 foreach sig in array array['can_read_sis_import_job(uuid)','register_sis_import_source_file(uuid,text,text,text,bigint)','fail_sis_import_upload(uuid)','get_sis_import_validation_snapshot(uuid,text[],text[],text[],text[],text[])','get_sis_import_job_payload(uuid)','list_sis_import_jobs(uuid,integer,integer)','get_sis_export_projection(uuid)'] loop
  if to_regprocedure('public.'||sig) is null then raise exception 'B10-3C RPC missing: %',sig; end if;
  if has_function_privilege('public','public.'||sig,'execute') or has_function_privilege('anon','public.'||sig,'execute') or has_function_privilege('service_role','public.'||sig,'execute') then raise exception 'B10-3C forbidden RPC grant: %',sig; end if;
  if not has_function_privilege('authenticated','public.'||sig,'execute') then raise exception 'B10-3C authenticated grant missing: %',sig; end if;
 end loop;
 if to_regprocedure('public.create_sis_import_job(uuid,uuid,text,text,text,uuid)') is not null then raise exception 'B10-3C unsafe create-job source asset overload remains'; end if;
 if to_regprocedure('public.create_sis_import_job(uuid,uuid,text,text,text)') is null then raise exception 'B10-3C safe create-job signature missing'; end if;
 if has_function_privilege('authenticated','public.has_any_sis_import_permission_for_school(uuid,uuid)','execute') then raise exception 'B10-3C internal any-import helper exposed'; end if;
 if has_function_privilege('authenticated','public.has_sis_permission_for_school(text,uuid,uuid)','execute') then raise exception 'B10-3C generic permission helper exposed'; end if;
 if has_table_privilege('authenticated','public.sis_import_entity_refs','select,insert,update,delete') then raise exception 'B10-3C entity refs exposed'; end if;
 if has_table_privilege('authenticated','public.sis_import_jobs','insert,update,delete') then raise exception 'B10-3C jobs directly mutable'; end if;
 if has_function_privilege('authenticated','public.verify_sis_import_plan_attestation(uuid,uuid,integer,text,text,text,text,bigint,text)','execute') then raise exception 'B10-3C verifier exposed'; end if;
 if to_regprocedure('public.commit_sis_import_job(uuid,text)') is null or has_function_privilege('service_role','public.commit_sis_import_job(uuid,text)','execute') then raise exception 'B10-3C commit contract weakened'; end if;
 if not exists(select 1 from pg_constraint where conname='class_enrollments_no_primary_overlap') or to_regprocedure('public.validate_class_enrollment_consistency()') is null then raise exception 'B10-3C B2 protections missing'; end if;
 if to_regprocedure('public.can_access_student(text,uuid,uuid)') is null then raise exception 'B10-3C B9 protection missing'; end if;
 if to_regclass('public.generated_documents') is null then raise exception 'B10-3C B8 documents missing'; end if;
end $$;
rollback;
