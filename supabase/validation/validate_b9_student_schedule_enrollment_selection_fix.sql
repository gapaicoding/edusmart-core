do $$
declare
  v_def text;
  v_args text;
  v_lateral text;
begin
  select pg_get_functiondef('public.list_student_published_schedule(uuid)'::regprocedure),
         pg_get_function_arguments('public.list_student_published_schedule(uuid)'::regprocedure)
  into v_def, v_args;

  if v_args <> 'p_organization_id uuid' or v_def ~* 'p_student_id' then
    raise exception 'Schedule RPC accepts an unsafe Student identity argument: %', v_args;
  end if;
  if v_def not ilike '%SECURITY DEFINER%' or v_def not ilike '%SET search_path TO ''''%' then
    raise exception 'Schedule RPC security contract is incomplete';
  end if;
  if v_def not like '%st.profile_id = auth.uid()%' or v_def not like '%te.status = ''published''%' then
    raise exception 'Schedule RPC lost exact Student or published-only predicates';
  end if;

  v_lateral := substring(v_def from '(?is)join lateral \(.*?limit 1');
  if v_lateral is null
     or v_lateral not like '%join public.class_enrollments ce%'
     or v_lateral not like '%ce.student_enrollment_id = se.id%'
     or v_lateral not like '%ce.status = ''active''%'
     or v_lateral not like '%ce.is_primary%'
     or v_lateral not like '%join public.classrooms c%'
     or v_lateral not like '%join public.academic_years ay%'
     or v_lateral not like '%se.status in (''active'', ''leave'')%'
     or v_lateral not like '%ay.is_current desc%' then
    raise exception 'Enrollment/class eligibility is not established before candidate LIMIT';
  end if;

  if v_def not like '%sm.full_name%' then
    raise exception 'Safe teacher display projection is missing';
  end if;
  if v_def ~* 'email|phone|employee_number|employment_status|profile_id[[:space:]]+as|role_id' then
    raise exception 'Schedule RPC exposes private staff or identity metadata';
  end if;

  if has_function_privilege('public','public.list_student_published_schedule(uuid)','EXECUTE')
     or has_function_privilege('anon','public.list_student_published_schedule(uuid)','EXECUTE')
     or has_function_privilege('service_role','public.list_student_published_schedule(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.list_student_published_schedule(uuid)','EXECUTE') then
    raise exception 'Schedule RPC ACL is not authenticated-only';
  end if;

  if exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.organization_id is null
      and r.code = 'STUDENT'
      and p.code = 'teaching_assignment.read'
  ) then
    raise exception 'STUDENT regained raw teaching_assignment.read';
  end if;
end
$$;

select 'B9 Student schedule enrollment selection fix validation passed' as result;
