-- Batch 15 Phase 2 structural/security validator. Future-safe: it validates
-- the Phase 2 contract without requiring this migration to remain latest.
do $$
declare
  v_name text;
  v_oid oid;
  v_security_definer boolean;
  v_config text[];
  v_save_definition text;
begin
  foreach v_name in array array[
    'b15_assessment_create',
    'b15_assessment_update_draft',
    'b15_assessment_transition',
    'b15_assessment_save_scores',
    'b15_correct_final_score',
    'b15_list_assessments',
    'b15_get_assessment',
    'b15_get_gradebook'
  ] loop
    select p.oid,p.prosecdef,p.proconfig into v_oid,v_security_definer,v_config
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=v_name;
    if v_oid is null then raise exception 'B15_PHASE2_FUNCTION_MISSING:%',v_name; end if;
    if not v_security_definer then raise exception 'B15_PHASE2_FUNCTION_NOT_SECURITY_DEFINER:%',v_name; end if;
    if v_config is null or not exists (select 1 from unnest(v_config) x where x like 'search_path=%') then
      raise exception 'B15_PHASE2_FUNCTION_SEARCH_PATH_MISSING:%',v_name;
    end if;
    if has_function_privilege('anon',v_oid,'execute') or has_function_privilege('public',v_oid,'execute') then
      raise exception 'B15_PHASE2_PUBLIC_ANON_EXECUTE:%',v_name;
    end if;
    if has_function_privilege('service_role',v_oid,'execute') then
      raise exception 'B15_PHASE2_SERVICE_ROLE_EXECUTE:%',v_name;
    end if;
    if not has_function_privilege('authenticated',v_oid,'execute') then
      raise exception 'B15_PHASE2_AUTHENTICATED_EXECUTE_MISSING:%',v_name;
    end if;
  end loop;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='b15_assessment_request_fingerprint') then
    raise exception 'B15_PHASE2_FINGERPRINT_HELPER_MISSING';
  end if;
  if not exists (select 1 from public.role_permissions rp join public.roles r on r.id=rp.role_id and r.organization_id is null join public.permissions p on p.id=rp.permission_id and p.code='score.update_locked' where r.code='PRINCIPAL') then
    raise exception 'B15_PHASE2_PRINCIPAL_CORRECTION_CAPABILITY_MISSING';
  end if;
  if exists (select 1 from public.role_permissions rp join public.roles r on r.id=rp.role_id and r.organization_id is null join public.permissions p on p.id=rp.permission_id and p.code='assessment.publish' where r.code='TEACHER') then
    raise exception 'B15_PHASE2_TEACHER_PUBLISH_PRESENT';
  end if;
  if not exists (select 1 from public.role_permissions rp join public.roles r on r.id=rp.role_id and r.organization_id is null join public.permissions p on p.id=rp.permission_id and p.code='assessment.publish' where r.code='PRINCIPAL') then
    raise exception 'B15_PHASE2_PRINCIPAL_PUBLISH_MISSING';
  end if;
  select pg_get_functiondef(p.oid) into v_save_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='b15_assessment_save_scores';
  if v_save_definition is null or position('can_manage_assessment_context' in v_save_definition)=0 then
    raise exception 'B15_PHASE2_SCORE_ASSIGNMENT_SCOPE_MISSING';
  end if;
  if position('pg_catalog.current_date' in v_save_definition)>0 then
    raise exception 'B15_PHASE2_SCORE_DATE_REFERENCE_INVALID';
  end if;
  raise notice 'B15 assessment gradebook Phase 2: PASS';
end $$;
