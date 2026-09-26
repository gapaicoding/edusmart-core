-- B18 Phase 1 read-only validator. Never inserts, updates, deletes, grants, or repairs.
do $validator$
declare
  v_name text;
  v_expected text[] := array[
    'admission_cycles','admission_applications','admission_application_guardians',
    'admission_consents','admission_stage_history','admission_conversions',
    'admission_command_requests'
  ];
  v_count integer;
begin
  foreach v_name in array v_expected loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'B18_VALIDATION_MISSING_TABLE: %', v_name;
    end if;
    if not exists (
      select 1 from pg_class c
      where c.oid = to_regclass('public.' || v_name)
        and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception 'B18_VALIDATION_RLS_NOT_FORCED: %', v_name;
    end if;
    if exists (
      select 1
      from pg_class c
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      where c.oid = to_regclass('public.' || v_name)
        and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
        and a.privilege_type in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
    ) then
      raise exception 'B18_VALIDATION_DIRECT_PRIVILEGE: %', v_name;
    end if;
  end loop;

  select count(*) into v_count
  from information_schema.columns
  where table_schema='public' and table_name='admission_cycles'
    and column_name in ('organization_id','school_id','academic_year_id','status','row_version');
  if v_count <> 5 then raise exception 'B18_VALIDATION_CYCLE_COLUMNS'; end if;

  select count(*) into v_count
  from information_schema.columns
  where table_schema='public' and table_name='admission_applications'
    and column_name in ('organization_id','school_id','admission_cycle_id','target_academic_year_id','target_grade_level_id','status','row_version');
  if v_count <> 7 then raise exception 'B18_VALIDATION_APPLICATION_COLUMNS'; end if;

  if not exists (select 1 from pg_constraint where conrelid='public.admission_cycles'::regclass and conname='admission_cycles_year_fk') then
    raise exception 'B18_VALIDATION_CYCLE_YEAR_FK';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.admission_applications'::regclass and conname='admission_applications_cycle_year_fk') then
    raise exception 'B18_VALIDATION_APPLICATION_CYCLE_YEAR_FK';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.admission_conversions'::regclass and conname='admission_conversions_application_key') then
    raise exception 'B18_VALIDATION_ONE_CONVERSION';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.admission_command_requests'::regclass and conname='admission_command_requests_result_bound') then
    raise exception 'B18_VALIDATION_COMMAND_RESULT_BOUND';
  end if;

  if not exists (select 1 from pg_trigger where tgrelid='public.admission_cycles'::regclass and tgname='trg_admission_cycles_row_version')
     or not exists (select 1 from pg_trigger where tgrelid='public.admission_applications'::regclass and tgname='trg_admission_applications_row_version') then
    raise exception 'B18_VALIDATION_ROW_VERSION_TRIGGER';
  end if;

  select count(*) into v_count from public.permissions
  where code in ('admission.read','admission.manage_cycle','admission.review','admission.decide','admission.convert');
  if v_count <> 5 then raise exception 'B18_VALIDATION_CAPABILITY_NAMESPACE'; end if;

  if exists (select 1 from public.permissions where code like 'admission.%' and code not in ('admission.read','admission.manage_cycle','admission.review','admission.decide','admission.convert')) then
    raise exception 'B18_VALIDATION_UNEXPECTED_ADMISSION_CAPABILITY';
  end if;

  if exists (
    select 1
    from public.roles r
    where r.organization_id is null
      and r.code in ('ORG_OWNER','PRINCIPAL','SCHOOL_ADMIN')
      and (select count(*) from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
           where rp.role_id=r.id and p.code in ('admission.read','admission.manage_cycle','admission.review','admission.decide','admission.convert')) <> 5
  ) then
    raise exception 'B18_VALIDATION_CORE_ROLE_GRANTS';
  end if;

  if exists (
    select 1 from public.roles r
    where r.organization_id is null and r.code='VICE_PRINCIPAL_CURRICULUM'
      and (select count(*) from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
           where rp.role_id=r.id and p.code in ('admission.read','admission.review')) <> 2
  ) then
    raise exception 'B18_VALIDATION_CURRICULUM_ROLE_GRANTS';
  end if;

  if exists (
    select 1 from public.roles r
    where r.organization_id is null and r.code in ('TEACHER','HOMEROOM_TEACHER','PARENT','STUDENT')
      and exists (select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
                  where rp.role_id=r.id and p.code like 'admission.%')
  ) then
    raise exception 'B18_VALIDATION_UNAUTHORIZED_ROLE_GRANT';
  end if;

  if exists (select 1 from pg_proc where proname in ('submit_admission_application','transition_admission_application','convert_admission_application')) then
    raise exception 'B18_VALIDATION_PHASE2_RPC_EXPOSED';
  end if;
end
$validator$;

select 'B18_VALIDATION_PASS' as result;
