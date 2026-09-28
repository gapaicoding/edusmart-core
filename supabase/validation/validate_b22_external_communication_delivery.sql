-- Read-only Batch 22 structural and privilege validator.
do $$
declare
  required text[] := array[
    'communication_delivery_jobs',
    'communication_delivery_recipients',
    'communication_delivery_attempts'
  ];
  f text;
  t text;
  definition text;
begin
  foreach t in array required loop
    if to_regclass('public.' || t) is null then
      raise exception 'B22_MISSING_TABLE:%', t;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception 'B22_RLS:%', t;
    end if;
    if has_table_privilege('anon', to_regclass('public.' || t), 'select')
      or has_table_privilege('authenticated', to_regclass('public.' || t), 'select')
      or has_table_privilege('authenticated', to_regclass('public.' || t), 'insert')
      or has_table_privilege('authenticated', to_regclass('public.' || t), 'update')
      or has_table_privilege('authenticated', to_regclass('public.' || t), 'delete')
      or has_table_privilege('service_role', to_regclass('public.' || t), 'select')
      or has_table_privilege('service_role', to_regclass('public.' || t), 'insert')
      or has_table_privilege('service_role', to_regclass('public.' || t), 'update')
      or has_table_privilege('service_role', to_regclass('public.' || t), 'delete') then
      raise exception 'B22_DIRECT_TABLE_ACCESS:%', t;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.communication_delivery_jobs'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%(announcement_id, channel)%'
  ) then raise exception 'B22_ENQUEUE_UNIQUENESS'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.communication_delivery_recipients'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%(job_id, announcement_recipient_id)%'
  ) then raise exception 'B22_RECIPIENT_UNIQUENESS'; end if;

  foreach f in array array[
    'public.b22_enqueue_external_delivery(jsonb)',
    'public.b22_list_delivery_jobs(uuid,uuid)'
  ] loop
    select lower(pg_get_functiondef(p.oid)) into definition
    from pg_proc p
    where p.oid = to_regprocedure(f)
      and p.prosecdef
      and p.proconfig @> array['search_path=""'];
    if definition is null then raise exception 'B22_FUNCTION_SECURITY:%', f; end if;
    if has_function_privilege('public', to_regprocedure(f), 'execute')
      or has_function_privilege('anon', to_regprocedure(f), 'execute')
      or has_function_privilege('service_role', to_regprocedure(f), 'execute')
      or not has_function_privilege('authenticated', to_regprocedure(f), 'execute') then
      raise exception 'B22_FUNCTION_ACL:%', f;
    end if;
    if strpos(definition, 'b22_require_delivery_manager') = 0 then
      raise exception 'B22_CAPABILITY_CHECK:%', f;
    end if;
  end loop;

  select lower(pg_get_functiondef(p.oid)) into definition
  from pg_proc p where p.oid = to_regprocedure('public.b22_enqueue_external_delivery(jsonb)');
  if strpos(definition, 'status <> ''published''') = 0
    or strpos(definition, 'communication_announcement_recipients') = 0
    or strpos(definition, 'on conflict (announcement_id, channel) do nothing') = 0 then
    raise exception 'B22_ENQUEUE_INVARIANTS';
  end if;

  raise notice 'B22_EXTERNAL_COMMUNICATION_DELIVERY_VALIDATION_PASS';
end $$;

select 'B22_EXTERNAL_COMMUNICATION_DELIVERY_VALIDATION_PASS' as result;
