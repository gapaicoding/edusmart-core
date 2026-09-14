begin;
set transaction read only;

do $$
declare v_oid oid;
  v_persist_oid oid;
begin
  v_oid := to_regprocedure('public.commit_sis_import_job(uuid,text)');
  if v_oid is null then raise exception 'B10-3B: commit RPC missing'; end if;
  if not exists(select 1 from pg_proc p where p.oid=v_oid and p.prosecdef
      and exists (select 1 from unnest(coalesce(p.proconfig,array[]::text[])) cfg
        where split_part(cfg,'=',1)='search_path'
          and split_part(cfg,'=',2) in ('','""')))
    then raise exception 'B10-3B: commit RPC not hardened'; end if;
  if has_function_privilege('public','public.commit_sis_import_job(uuid,text)','execute')
    or has_function_privilege('anon','public.commit_sis_import_job(uuid,text)','execute')
    or has_function_privilege('service_role','public.commit_sis_import_job(uuid,text)','execute')
    then raise exception 'B10-3B: forbidden commit execute grant'; end if;
  if not has_function_privilege('authenticated','public.commit_sis_import_job(uuid,text)','execute')
    then raise exception 'B10-3B: authenticated execute missing'; end if;
  if to_regprocedure('public.hash_sis_confirmation_token(uuid,integer,text,text)') is null
     or to_regprocedure('public.hash_sis_confirmation_token(text)') is not null
     or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='hash_sis_confirmation_token') <> 1
    then raise exception 'B10-3B: confirmation-token helper contract is not converged'; end if;
  v_persist_oid := to_regprocedure('public.persist_sis_import_validation(uuid,integer,text,text,text,text,bigint,text)');
  if v_persist_oid is null
     or position('hash_sis_confirmation_token(v_job.id, v_new_version, p_normalized_plan_fingerprint, v_token)'
                 in (select prosrc from pg_proc where oid=v_persist_oid)) = 0
    then raise exception 'B10-3B: validation issuance is not fingerprint-bound'; end if;
  if position('hash_sis_confirmation_token(v_job.id, v_job.preview_version,'
              in (select prosrc from pg_proc where oid=v_oid)) = 0
     or position('v_job.normalized_plan_fingerprint, p_confirmation_token)'
                 in (select prosrc from pg_proc where oid=v_oid)) = 0
    then raise exception 'B10-3B: commit verification is not fingerprint-bound'; end if;
  if position('normalized_plan_fingerprint is null'
              in lower((select prosrc from pg_proc where oid=v_oid))) = 0
    then raise exception 'B10-3B: committable fingerprint requirement missing'; end if;
  if has_function_privilege('authenticated','public.mint_sis_entity_ref(uuid,text,text,uuid,uuid,uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.verify_sis_import_plan_attestation(uuid,uuid,integer,text,text,text,text,bigint,text)','execute')
    then raise exception 'B10-3B: internal helper exposed'; end if;
  if has_table_privilege('authenticated','public.sis_import_jobs','insert,update,delete')
    or has_table_privilege('authenticated','public.sis_import_entity_refs','select,insert,update,delete')
    then raise exception 'B10-3B: direct mutation/ref access widened'; end if;
  if not exists(select 1 from pg_constraint where conname='class_enrollments_no_primary_overlap')
    or to_regprocedure('public.validate_class_enrollment_consistency()') is null
    then raise exception 'B10-3B: B2 temporal protections missing'; end if;
  if to_regprocedure('public.can_access_student(text,uuid,uuid)') is null
    then raise exception 'B10-3B: B9 student authorization missing'; end if;
  if to_regclass('public.report_cards') is null then raise exception 'B10-3B: B8 report cards missing'; end if;
  if position('verify_sis_import_plan_attestation'
              in (select prosrc from pg_proc where oid=v_persist_oid)) = 0
    then raise exception 'B10-3B: plan HMAC attestation boundary missing'; end if;
end $$;

rollback;
