-- Batch 15 Phase 1 structural validator. It validates presence, not latest
-- migration equality, so later Batch 15 migrations remain compatible.
do $$
declare
  v_rls boolean;
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='assessments' and column_name='version') then
    raise exception 'B15_ASSESSMENT_VERSION_MISSING';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='student_scores' and column_name='version') then
    raise exception 'B15_SCORE_VERSION_MISSING';
  end if;
  if not exists (select 1 from pg_constraint where conname='assessments_version_check') then
    raise exception 'B15_ASSESSMENT_VERSION_CONSTRAINT_MISSING';
  end if;
  if not exists (select 1 from pg_constraint where conname='student_scores_version_check') then
    raise exception 'B15_SCORE_VERSION_CONSTRAINT_MISSING';
  end if;
  if not exists (select 1 from pg_class where relname='assessment_command_requests' and relkind='r') then
    raise exception 'B15_COMMAND_LEDGER_MISSING';
  end if;
  if not exists (select 1 from pg_constraint where conname='assessment_command_requests_actor_request_key') then
    raise exception 'B15_COMMAND_LEDGER_UNIQUENESS_MISSING';
  end if;
  select relrowsecurity into v_rls from pg_class where relname='assessment_command_requests';
  if v_rls is distinct from true then
    raise exception 'B15_COMMAND_LEDGER_RLS_MISSING';
  end if;
  if has_table_privilege('authenticated', 'public.assessment_command_requests', 'select')
     or has_table_privilege('authenticated', 'public.assessment_command_requests', 'insert')
     or has_table_privilege('authenticated', 'public.assessment_command_requests', 'update')
     or has_table_privilege('authenticated', 'public.assessment_command_requests', 'delete') then
    raise exception 'B15_COMMAND_LEDGER_DIRECT_PRIVILEGE_PRESENT';
  end if;
  if exists (select 1 from pg_constraint where conname='assessments_status_check'
    and pg_get_constraintdef(oid) not like '%draft%open%closed%published%archived%') then
    raise exception 'B15_ASSESSMENT_STATUS_DOMAIN_CHANGED';
  end if;
  if exists (select 1 from pg_constraint where conname='student_scores_status_check'
    and pg_get_constraintdef(oid) not like '%missing%submitted%excused%final%') then
    raise exception 'B15_SCORE_STATUS_DOMAIN_CHANGED';
  end if;
  if not exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id=rp.role_id and r.organization_id is null
    join public.permissions p on p.id=rp.permission_id and p.code='assessment.publish'
    where r.code='PRINCIPAL'
  ) then raise exception 'B15_PRINCIPAL_PUBLISH_MISSING'; end if;
  if exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id=rp.role_id and r.organization_id is null
    join public.permissions p on p.id=rp.permission_id and p.code='assessment.publish'
    where r.code='TEACHER'
  ) then raise exception 'B15_TEACHER_PUBLISH_PRESENT'; end if;
  if exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id=rp.role_id and r.organization_id is null
    join public.permissions p on p.id=rp.permission_id and p.code='assessment.publish'
    where r.code='SCHOOL_ADMIN'
  ) then raise exception 'B15_SCHOOL_ADMIN_PUBLISH_PRESENT'; end if;
  raise notice 'B15 assessment gradebook foundation: PASS';
end $$;
