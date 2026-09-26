-- B18 Phase 2 read-only validator. Never mutates data, grants, or definitions.
do $validator$
declare
  v_name text;
  v_sig regprocedure;
  v_fn record;
  v_expected text[] := array[
    'b18_get_public_admission_cycle(uuid)',
    'b18_submit_admission_application(uuid,uuid,jsonb)',
    'b18_open_admission_cycle(uuid,bigint,uuid)',
    'b18_close_admission_cycle(uuid,bigint,uuid)',
    'b18_reopen_admission_cycle(uuid,bigint,uuid,text)',
    'b18_archive_admission_cycle(uuid,bigint,uuid)',
    'b18_start_admission_review(uuid,bigint,uuid)',
    'b18_accept_admission_application(uuid,bigint,uuid,text)',
    'b18_reject_admission_application(uuid,bigint,uuid,text)',
    'b18_withdraw_admission_application(uuid,bigint,uuid,text)',
    'b18_convert_admission_application(uuid,bigint,uuid)',
    'b18_list_admission_cycles(uuid)',
    'b18_get_admission_cycle(uuid)',
    'b18_list_admission_applications(uuid,text,uuid,integer,integer)',
    'b18_get_admission_application(uuid)'
  ];
begin
  foreach v_name in array v_expected loop
    v_sig := to_regprocedure('public.' || v_name);
    if v_sig is null then raise exception 'B18_PHASE2_VALIDATION_MISSING_RPC: %',v_name; end if;
    select p.* into v_fn from pg_proc p where p.oid=v_sig;
    if not v_fn.prosecdef or not (v_fn.proconfig @> array['search_path=""']) then raise exception 'B18_PHASE2_VALIDATION_UNSAFE_RPC: %',v_name; end if;
  end loop;

  if not has_function_privilege('anon','public.b18_get_public_admission_cycle(uuid)','EXECUTE')
     or not has_function_privilege('anon','public.b18_submit_admission_application(uuid,uuid,jsonb)','EXECUTE') then
    raise exception 'B18_PHASE2_VALIDATION_PUBLIC_EXECUTE_MISSING';
  end if;
  if has_function_privilege('public','public.b18_transition_admission_application(uuid,bigint,uuid,text,text)','EXECUTE')
     or has_function_privilege('anon','public.b18_transition_admission_application(uuid,bigint,uuid,text,text)','EXECUTE') then
    raise exception 'B18_PHASE2_VALIDATION_ANON_STAFF_COMMAND_EXECUTE';
  end if;
  if not has_function_privilege('authenticated','public.b18_transition_admission_application(uuid,bigint,uuid,text,text)','EXECUTE') then
    raise exception 'B18_PHASE2_VALIDATION_AUTHENTICATED_STAFF_EXECUTE_MISSING';
  end if;
  if exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname like 'b18_%'
      and has_function_privilege('anon',p.oid,'EXECUTE')
      and p.oid not in (
        'public.b18_get_public_admission_cycle(uuid)'::regprocedure,
        'public.b18_submit_admission_application(uuid,uuid,jsonb)'::regprocedure
      )
  ) then
    raise exception 'B18_PHASE2_VALIDATION_ANON_B18_ALLOWLIST_DRIFT';
  end if;
  if has_function_privilege('anon','public.b18_list_admission_applications(uuid,text,uuid,integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.b18_get_admission_application(uuid)','EXECUTE') then
    raise exception 'B18_PHASE2_VALIDATION_ANON_STAFF_ACCESS';
  end if;
  if exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid in ('public.admission_applications'::regclass,'public.admission_application_guardians'::regclass,'public.admission_command_requests'::regclass) and a.grantee in (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole) and a.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')) then
    raise exception 'B18_PHASE2_VALIDATION_TABLE_PRIVILEGE';
  end if;
  if exists(select 1 from public.permissions where code like 'admission.%' and code not in ('admission.read','admission.manage_cycle','admission.review','admission.decide','admission.convert')) then
    raise exception 'B18_PHASE2_VALIDATION_CAPABILITY_DRIFT';
  end if;
  if exists(select 1 from pg_proc where proname in ('b18_submit_admission_application','b18_list_admission_applications') and pg_get_functiondef(oid) ~* 'role_name|admissions_officer') then
    raise exception 'B18_PHASE2_VALIDATION_ROLE_NAME_AUTH';
  end if;
end
$validator$;
select 'B18_PHASE2_VALIDATION_PASS' as result;
