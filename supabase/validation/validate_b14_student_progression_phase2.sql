-- Read-only Batch 14 Phase 2 RPC/ACL validator.
do $$
declare
  v_signature text;
  v_oid oid;
  v_expected text[] := array[
    'public.create_progression_batch(uuid,uuid,uuid,uuid)',
    'public.list_progression_batches(uuid,integer,integer)',
    'public.get_progression_batch(uuid,uuid)',
    'public.list_progression_candidates(uuid,uuid,integer,integer)',
    'public.save_progression_decision(uuid,uuid,uuid,uuid,text,uuid,uuid,text,text,bigint)',
    'public.submit_progression_batch(uuid,uuid,uuid,bigint)',
    'public.reject_progression_batch(uuid,uuid,uuid,bigint,text)',
    'public.approve_progression_batch(uuid,uuid,uuid,bigint)',
    'public.cancel_progression_batch(uuid,uuid,uuid,bigint,text)',
    'public.apply_progression_batch(uuid,uuid,uuid,bigint)'
  ];
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version='20260920110000') then
    raise exception 'B14_PHASE2_MIGRATION_NOT_PRESENT';
  end if;
  foreach v_signature in array v_expected loop
    v_oid := v_signature::regprocedure;
    if not has_function_privilege('authenticated',v_oid,'EXECUTE') then raise exception 'B14_RPC_AUTHENTICATED_EXECUTE_MISSING:%',v_signature; end if;
    if has_function_privilege('public',v_oid,'EXECUTE') then raise exception 'B14_RPC_PUBLIC_EXECUTE_PRESENT:%',v_signature; end if;
    if has_function_privilege('anon',v_oid,'EXECUTE') then raise exception 'B14_RPC_ANON_EXECUTE_PRESENT:%',v_signature; end if;
    if has_function_privilege('service_role',v_oid,'EXECUTE') then raise exception 'B14_RPC_SERVICE_ROLE_EXECUTE_PRESENT:%',v_signature; end if;
    if exists(select 1 from pg_proc p where p.oid=v_oid and (p.prosecdef is false or not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) cfg where cfg in ('search_path=""','search_path=')))) then
      raise exception 'B14_RPC_SECURITY_DEFINER_OR_SEARCH_PATH_INVALID:%',v_signature;
    end if;
  end loop;
  foreach v_signature in array array['public.b14_authorize(text,uuid)','public.b14_command_begin(uuid,text,text,uuid,uuid)','public.b14_command_complete(uuid,text,jsonb,text,uuid)'] loop
    v_oid := v_signature::regprocedure;
    if not exists(select 1 from pg_proc where oid=v_oid and prosecdef and exists(select 1 from unnest(coalesce(proconfig,'{}')) cfg where cfg in ('search_path=""','search_path='))) then raise exception 'B14_INTERNAL_RPC_HARDENING_INVALID:%',v_signature; end if;
  end loop;
  if has_table_privilege('authenticated','public.progression_batches','INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.progression_decisions','INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.progression_command_requests','INSERT,UPDATE,DELETE') then
    raise exception 'B14_DIRECT_TABLE_MUTATION_PRESENT';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.progression_batches'::regclass) or not (select relrowsecurity from pg_class where oid='public.progression_decisions'::regclass) or not (select relrowsecurity from pg_class where oid='public.progression_command_requests'::regclass) then
    raise exception 'B14_RLS_NOT_ENABLED';
  end if;
  if not exists(select 1 from public.permissions where code='progression.cancel') then raise exception 'B14_CANCEL_PERMISSION_MISSING'; end if;
  if not exists(select 1 from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id where r.organization_id is null and r.code='SCHOOL_ADMIN' and p.code='progression.cancel') then raise exception 'B14_CANCEL_SCHOOL_ADMIN_GRANT_MISSING'; end if;
end $$;

select 'B14 STUDENT PROGRESSION PHASE 2 ACL VALIDATION PASSED' as result;
