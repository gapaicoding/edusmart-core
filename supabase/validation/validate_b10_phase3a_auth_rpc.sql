-- Batch 10 Phase 3A validator (read-only). Validates catalog semantics for
-- the authorization helpers, job-lifecycle RPCs, durable-ref resolution/mint
-- helpers, legacy bootstrap, and PII scrub function introduced in
-- 20260912130000_b10_sis_import_auth_rpc.sql. This validator checks
-- persistence of Phase-3A invariants in the FINAL Batch-10 schema. Later
-- approved Phase-3B/3C objects are allowed and are validated separately.
--
-- Run this only against a database where the Phase-3A migration has actually
-- been applied. It is read-only end to end.

begin;
set transaction read only;

do $$
declare
  v_count integer;
begin
  -- 1. Function existence -----------------------------------------------
  assert (select count(*) from pg_proc where proname = 'assert_sis_permission_for_school') = 1,
    'assert_sis_permission_for_school must exist';
  assert (select count(*) from pg_proc where proname = 'create_sis_import_job') = 1,
    'create_sis_import_job must exist';
  assert (select count(*) from pg_proc where proname = 'persist_sis_import_validation') = 1,
    'persist_sis_import_validation must exist';
  assert (select count(*) from pg_proc where proname = 'resolve_sis_student_ref') = 1,
    'resolve_sis_student_ref must exist';
  assert (select count(*) from pg_proc where proname = 'resolve_sis_guardian_ref') = 1,
    'resolve_sis_guardian_ref must exist';
  assert (select count(*) from pg_proc where proname = 'resolve_sis_staff_ref') = 1,
    'resolve_sis_staff_ref must exist';
  assert (select count(*) from pg_proc where proname = 'mint_sis_entity_ref') = 1,
    'mint_sis_entity_ref must exist';
  assert (select count(*) from pg_proc where proname = 'prepare_sis_import_references') = 1,
    'prepare_sis_import_references must exist';
  assert (select count(*) from pg_proc where proname = 'scrub_expired_sis_import_payloads') = 1,
    'scrub_expired_sis_import_payloads must exist';
  assert (select count(*) from pg_proc where proname = 'verify_sis_import_plan_attestation') = 1,
    'verify_sis_import_plan_attestation must exist (B10-P3A-SEC-001)';

  -- 2. SECURITY DEFINER + explicit empty search_path on every B10 RPC ------
  select count(*) into v_count
  from pg_proc p
  where p.proname in (
    'assert_sis_permission_for_school','has_sis_permission_for_school',
    'assert_sis_import_permissions_for_entities','create_sis_import_job',
    'persist_sis_import_validation','resolve_sis_student_ref',
    'resolve_sis_student_nisn','resolve_sis_guardian_ref','resolve_sis_staff_ref',
    'resolve_sis_staff_employee_number','mint_sis_entity_ref',
    'prepare_sis_import_references','scrub_expired_sis_import_payloads',
    'verify_sis_import_plan_attestation'
  )
  and (
    p.prosecdef is not true
    or not exists (
      select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
      where split_part(cfg, '=', 1) = 'search_path'
        and split_part(cfg, '=', 2) in ('', '""')
    )
  );
  assert v_count = 0, 'Every B10 SECURITY DEFINER function must set search_path = '''' -- found ' || v_count || ' violations';

  -- 4. ACL audit: PUBLIC/anon revoked on all new functions ---------------
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'assert_sis_permission_for_school','has_sis_permission_for_school',
      'assert_sis_import_permissions_for_entities','create_sis_import_job',
      'generate_sis_confirmation_token','hash_sis_confirmation_token',
      'persist_sis_import_validation','resolve_sis_student_ref',
      'resolve_sis_student_nisn','resolve_sis_guardian_ref','resolve_sis_staff_ref',
      'resolve_sis_staff_employee_number','mint_sis_entity_ref',
      'generate_sis_entity_ref','prepare_sis_import_references',
      'scrub_expired_sis_import_payloads'
    )
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  assert v_count = 0, 'anon must not have EXECUTE on any B10 function -- found ' || v_count;

  -- 5. service_role revoked except the scrub function --------------------
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'assert_sis_permission_for_school','create_sis_import_job',
      'persist_sis_import_validation','resolve_sis_student_ref',
      'resolve_sis_guardian_ref','resolve_sis_staff_ref',
      'mint_sis_entity_ref','prepare_sis_import_references'
    )
    and has_function_privilege('service_role', p.oid, 'EXECUTE');
  assert v_count = 0, 'service_role must not have EXECUTE on application-facing B10 functions -- found ' || v_count;

  assert has_function_privilege('service_role', 'public.scrub_expired_sis_import_payloads()'::regprocedure, 'EXECUTE'),
    'service_role should retain EXECUTE on scrub_expired_sis_import_payloads (platform maintenance, not app CRUD)';

  -- 6. Internal helpers must NOT be granted to authenticated --------------
  assert not has_function_privilege('authenticated', 'public.assert_sis_permission_for_school(text,uuid,uuid)'::regprocedure, 'EXECUTE'),
    'assert_sis_permission_for_school is internal-only';
  assert not has_function_privilege('authenticated', 'public.mint_sis_entity_ref(uuid,text,text,uuid,uuid,uuid,uuid)'::regprocedure, 'EXECUTE'),
    'mint_sis_entity_ref must not be directly callable by authenticated (Gate 19)';
  assert not has_function_privilege('authenticated', 'public.generate_sis_entity_ref(text)'::regprocedure, 'EXECUTE'),
    'generate_sis_entity_ref is internal-only';
  assert not has_function_privilege('authenticated', 'public.scrub_expired_sis_import_payloads()'::regprocedure, 'EXECUTE'),
    'authenticated must never run global retention cleanup (Gate 27)';

  -- 7. authenticated CAN call the intended public-facing RPCs -------------
  assert has_function_privilege('authenticated', 'public.create_sis_import_job(uuid,uuid,text,text,text)'::regprocedure, 'EXECUTE'),
    'authenticated should be able to call create_sis_import_job';
  assert to_regprocedure('public.create_sis_import_job(uuid,uuid,text,text,text,uuid)') is null,
    'obsolete source-asset-bearing create_sis_import_job overload remains';
  assert has_function_privilege('authenticated', 'public.persist_sis_import_validation(uuid,integer,text,text,text,text,bigint,text)'::regprocedure, 'EXECUTE'),
    'authenticated should be able to call persist_sis_import_validation';
  assert has_function_privilege('authenticated', 'public.prepare_sis_import_references(uuid,uuid)'::regprocedure, 'EXECUTE'),
    'authenticated should be able to call prepare_sis_import_references';

  -- 7b. B10-P3A-SEC-001: persist RPC signature includes attestation input,
  -- and the verifier itself is internal-only (no PUBLIC/anon/authenticated
  -- direct execute) -------------------------------------------------------
  assert exists (
    select 1 from pg_proc p
    where p.proname = 'persist_sis_import_validation'
      and pg_get_function_arguments(p.oid) ilike '%p_attestation%'
  ), 'persist_sis_import_validation must accept a plan-attestation parameter';

  assert not has_function_privilege('public', 'public.verify_sis_import_plan_attestation(uuid,uuid,integer,text,text,text,text,bigint,text)'::regprocedure, 'EXECUTE'),
    'verify_sis_import_plan_attestation must not be executable by PUBLIC';
  assert not has_function_privilege('anon', 'public.verify_sis_import_plan_attestation(uuid,uuid,integer,text,text,text,text,bigint,text)'::regprocedure, 'EXECUTE'),
    'verify_sis_import_plan_attestation must not be executable by anon';
  assert not has_function_privilege('authenticated', 'public.verify_sis_import_plan_attestation(uuid,uuid,integer,text,text,text,text,bigint,text)'::regprocedure, 'EXECUTE'),
    'verify_sis_import_plan_attestation must not be directly executable by authenticated -- only persist_sis_import_validation (SECURITY DEFINER) may call it internally';
  assert not has_function_privilege('service_role', 'public.verify_sis_import_plan_attestation(uuid,uuid,integer,text,text,text,text,bigint,text)'::regprocedure, 'EXECUTE'),
    'verify_sis_import_plan_attestation must not be executable by service_role';

  assert (
    select p.prosecdef and exists (
      select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
      where split_part(cfg, '=', 1) = 'search_path'
        and split_part(cfg, '=', 2) in ('', '""')
    )
    from pg_proc p where p.proname = 'verify_sis_import_plan_attestation'
  ), 'verify_sis_import_plan_attestation must be SECURITY DEFINER with search_path hardened';

  -- 8. No generic entity-ref SELECT RPC / no arbitrary-UUID mint RPC -------
  assert (select count(*) from pg_proc where proname ilike '%get_sis_import_entity_ref%'
    or proname ilike '%list_sis_import_entity_refs%') = 0,
    'No generic entity-ref listing/SELECT RPC may exist';

  -- 9. No generic status-update RPC ---------------------------------------
  assert (select count(*) from pg_proc where proname ilike '%set_sis_import_job_status%'
    or proname ilike '%update_sis_import_job_status%') = 0,
    'No generic set_job_status RPC may exist (Gate 14)';

  -- 10. Phase-1 objects remain intact --------------------------------------
  assert (select count(*) from pg_tables where schemaname='public' and tablename='sis_import_jobs') = 1,
    'sis_import_jobs must still exist';
  assert (select count(*) from pg_policies where schemaname='public' and tablename='sis_import_jobs' and cmd in ('INSERT','UPDATE','DELETE')) = 0,
    'sis_import_jobs must still have no direct-mutation policy';
  assert (select count(*) from pg_policies where schemaname='public' and tablename='sis_import_entity_refs') = 0,
    'sis_import_entity_refs must still have zero policies';
  assert not exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='sis_import_entity_refs' and grantee='authenticated'
  ), 'sis_import_entity_refs must still have zero grants to authenticated';

  -- 11. Regression: pre-existing B2/B9 objects remain -----------------------
  assert (select count(*) from pg_constraint where conname = 'class_enrollments_no_primary_overlap') = 1,
    'class_enrollments_no_primary_overlap EXCLUDE constraint must remain untouched';

  raise notice 'B10 Phase 3A validator: all assertions passed';
end $$;

rollback;
