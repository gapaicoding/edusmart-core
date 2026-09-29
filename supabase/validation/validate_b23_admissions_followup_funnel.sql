-- Read-only B23 schema/security validator. Run against the intended Development database.
do $$
declare
  v_table text;
  v_ok boolean;
  v_fn text;
  v_signature text;
begin
  foreach v_table in array array[
    'admission_followup_tasks',
    'admission_followup_activities',
    'admission_followup_command_requests'
  ] loop
    select c.relrowsecurity and c.relforcerowsecurity into v_ok
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_table and c.relkind = 'r';
    if coalesce(v_ok, false) is not true then
      raise exception 'B23 validator: RLS is not enabled and forced on %', v_table;
    end if;
    if has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT')
      or has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE')
      or has_table_privilege('authenticated', format('public.%I', v_table), 'DELETE') then
      raise exception 'B23 validator: direct authenticated write privilege exists on %', v_table;
    end if;
    if has_table_privilege('service_role', format('public.%I', v_table), 'SELECT')
      or has_table_privilege('service_role', format('public.%I', v_table), 'INSERT')
      or has_table_privilege('service_role', format('public.%I', v_table), 'UPDATE')
      or has_table_privilege('service_role', format('public.%I', v_table), 'DELETE') then
      raise exception 'B23 validator: service_role table privilege exists on %', v_table;
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'admission_followup_one_open_task_per_application'
      and indexdef ilike '%unique%'
      and indexdef ilike '%where%status%open%'
  ) then
    raise exception 'B23 validator: one-open-task partial unique index is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'admission_followup_activities'
      and t.tgname = 'trg_admission_followup_activity_append_only' and not t.tgisinternal
  ) then
    raise exception 'B23 validator: append-only activity trigger is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'admission_followup_tasks'
      and c.conname = 'admission_followup_tasks_application_fk' and c.contype = 'f'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'admission_followup_activities'
      and c.conname = 'admission_followup_activities_task_fk' and c.contype = 'f'
  ) then
    raise exception 'B23 validator: composite application/task ownership foreign key is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'admission_followup_tasks'
      and policyname = 'b23_followup_tasks_scoped_read' and cmd = 'SELECT'
      and qual ilike '%admission.read%'
  ) or not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'admission_followup_activities'
      and policyname = 'b23_followup_activities_scoped_read' and cmd = 'SELECT'
      and qual ilike '%admission.read%'
  ) then
    raise exception 'B23 validator: scoped read policies are missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'admission_followup_tasks'
      and c.conname = 'admission_followup_tasks_status_fields_check'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%completion_outcome%'
  ) then
    raise exception 'B23 validator: task status/outcome consistency check is missing';
  end if;

  foreach v_signature in array array[
    'b23_list_followup_assignees(uuid)',
    'b23_get_admission_funnel(uuid)',
    'b23_list_followup_tasks(uuid,text,integer,integer)',
    'b23_get_followup_application(uuid)',
    'b23_followup_command(uuid,uuid,bigint,uuid,text,uuid,timestamp with time zone,text)'
  ] loop
    select p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') ilike '%search_path=%'
    into v_ok
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.oid = v_signature::regprocedure;
    if coalesce(v_ok, false) is not true then
      raise exception 'B23 validator: expected SECURITY DEFINER/search_path contract missing for %', v_signature;
    end if;
    if has_function_privilege('anon', format('public.%s', v_signature), 'EXECUTE') then
      raise exception 'B23 validator: anonymous execution is granted for %', v_signature;
    end if;
    if has_function_privilege('service_role', format('public.%s', v_signature), 'EXECUTE') then
      raise exception 'B23 validator: service_role execution is granted for %', v_signature;
    end if;
    if not has_function_privilege('authenticated', format('public.%s', v_signature), 'EXECUTE') then
      raise exception 'B23 validator: authenticated execution is not granted for %', v_signature;
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef('public.b23_followup_command(uuid,uuid,bigint,uuid,text,uuid,timestamp with time zone,text)'::regprocedure)
    ilike '%admission.review%'
    and pg_catalog.pg_get_functiondef('public.b23_followup_command(uuid,uuid,bigint,uuid,text,uuid,timestamp with time zone,text)'::regprocedure)
      ilike '%semantic_fingerprint%'
  into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'B23 validator: command capability/idempotency contract is missing';
  end if;

  select pg_catalog.pg_get_functiondef('public.b23_get_admission_funnel(uuid)'::regprocedure)
    ilike '%admission.read%'
    and pg_catalog.pg_get_functiondef('public.b23_get_admission_funnel(uuid)'::regprocedure)
      ilike '%under_review%'
  into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'B23 validator: scoped canonical funnel projection is missing';
  end if;

  select pg_catalog.pg_get_functiondef('public.b23_validate_followup_assignee()'::regprocedure)
    ilike '%staff_school_assignments%'
    and pg_catalog.pg_get_functiondef('public.b23_validate_followup_assignee()'::regprocedure)
      ilike '%membership_school_access%'
    and pg_catalog.pg_get_functiondef('public.b23_validate_followup_assignee()'::regprocedure)
      ilike '%status = ''active''%'
    and pg_catalog.pg_get_functiondef('public.b23_validate_followup_assignee()'::regprocedure)
      not ilike '%employment_status%'
    and pg_catalog.pg_get_functiondef('public.b23_list_followup_assignees(uuid)'::regprocedure)
      not ilike '%employment_status%'
  into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'B23 validator: active same-school assignee validation is missing';
  end if;
end $$;

select 'B23 admissions follow-up/funnel schema and security contracts: PASS' as validation_result;
