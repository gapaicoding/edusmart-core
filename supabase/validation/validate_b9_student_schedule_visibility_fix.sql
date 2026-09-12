do $$
declare
  v_def text;
  v_args text;
  v_result text;
begin
  select pg_get_functiondef('public.list_student_published_schedule(uuid)'::regprocedure),
         pg_get_function_arguments('public.list_student_published_schedule(uuid)'::regprocedure),
         pg_get_function_result('public.list_student_published_schedule(uuid)'::regprocedure)
  into v_def, v_args, v_result;

  if v_args <> 'p_organization_id uuid' then
    raise exception 'Unsafe schedule RPC arguments: %', v_args;
  end if;
  if v_result !~ 'entry_id uuid.*day_of_week smallint.*starts_at time without time zone.*ends_at time without time zone.*subject_name text.*classroom_name text.*teacher_name text' then
    raise exception 'Unexpected schedule RPC result: %', v_result;
  end if;
  if v_def not ilike '%SECURITY DEFINER%' or v_def not ilike '%SET search_path TO ''''%' then
    raise exception 'Schedule RPC security contract is incomplete';
  end if;
  if v_def not like '%st.profile_id = auth.uid()%'
     or v_def not like '%te.status = ''published''%'
     or (
       v_def not like '%ta.classroom_id = ce.classroom_id%'
       and v_def not like '%ta.classroom_id = selected.classroom_id%'
     ) then
    raise exception 'Schedule RPC lost exact Student/published/classroom predicates';
  end if;
  if v_def ~* 'email|phone|employee_number|employment_status' then
    raise exception 'Schedule RPC exposes private staff metadata';
  end if;

  if has_function_privilege('public','public.list_student_published_schedule(uuid)','EXECUTE')
     or has_function_privilege('anon','public.list_student_published_schedule(uuid)','EXECUTE')
     or has_function_privilege('service_role','public.list_student_published_schedule(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.list_student_published_schedule(uuid)','EXECUTE') then
    raise exception 'Schedule RPC ACL is not authenticated-only';
  end if;

  if exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id=rp.role_id
    join public.permissions p on p.id=rp.permission_id
    where r.organization_id is null and r.code='STUDENT' and p.code='teaching_assignment.read'
  ) then
    raise exception 'STUDENT still has raw teaching_assignment.read';
  end if;
  if not exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id=rp.role_id
    join public.permissions p on p.id=rp.permission_id
    where r.organization_id is null and r.code='PARENT' and p.code='teaching_assignment.read'
  ) then
    raise exception 'Parent teaching assignment permission regressed';
  end if;
  if not exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id=rp.role_id
    join public.permissions p on p.id=rp.permission_id
    where r.organization_id is null and r.code='TEACHER' and p.code='teaching_assignment.read'
  ) then
    raise exception 'Teacher teaching assignment permission regressed';
  end if;
end
$$;

select 'B9 Student schedule visibility fix validation passed' as result;
