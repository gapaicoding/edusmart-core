-- Read-only Batch 20 structural validator.
do $$
declare
  required text[] := array[
    'communication_announcements',
    'communication_announcement_targets',
    'communication_announcement_recipients',
    'communication_command_requests'
  ];
  app_functions text[] := array[
    'public.b20_create_announcement(jsonb)',
    'public.b20_update_announcement(jsonb)',
    'public.b20_publish_announcement(jsonb)',
    'public.b20_list_announcements(uuid,integer,integer)',
    'public.b20_get_announcement(uuid,uuid)'
  ];
  t text; f text; c integer; definition text;
begin
  foreach t in array required loop
    if to_regclass('public.' || t) is null then
      raise exception 'B20_MISSING_TABLE:%', t;
    end if;
    if not exists (
      select 1
      from pg_class r
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public'
        and r.relname = t
        and r.relrowsecurity
        and r.relforcerowsecurity
    ) then
      raise exception 'B20_RLS:%', t;
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications'
      and column_name = 'source_announcement_id'
  ) then raise exception 'B20_NOTIFICATION_SOURCE_COLUMN'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.communication_announcement_recipients'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%(announcement_id, recipient_profile_id)%'
  ) then raise exception 'B20_RECIPIENT_UNIQUENESS'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.communication_announcements'::regclass
      and pg_get_constraintdef(oid) ilike '%draft%published%'
  ) then raise exception 'B20_LIFECYCLE_CONSTRAINT'; end if;

  foreach f in array app_functions loop
    select lower(pg_get_functiondef(p.oid)) into definition
    from pg_proc p
    where p.oid = to_regprocedure(f)
      and p.prosecdef
      and p.proconfig @> array['search_path=""'];
    if definition is null then raise exception 'B20_FUNCTION_SECURITY:%', f; end if;
    if has_function_privilege('public', to_regprocedure(f), 'execute')
      or has_function_privilege('anon', to_regprocedure(f), 'execute')
      or not has_function_privilege('authenticated', to_regprocedure(f), 'execute') then
      raise exception 'B20_FUNCTION_ACL:%', f;
    end if;
    if strpos(definition, 'auth.uid()') = 0
      and strpos(definition, 'b20_require_staff') = 0
      and f not like '%list_announcements%'
      and f not like '%get_announcement%' then
      raise exception 'B20_ACTOR_DERIVATION:%', f;
    end if;
  end loop;

  select lower(pg_get_functiondef(p.oid)) into definition
  from pg_proc p where p.oid = to_regprocedure('public.b20_publish_announcement(jsonb)');
  if strpos(definition, 'for update') = 0
    or strpos(definition, 'b20_start_command') = 0
    or strpos(definition, 'communication_announcement_recipients') = 0
    or strpos(definition, 'notification_recipients') = 0 then
    raise exception 'B20_PUBLISH_ATOMICITY';
  end if;

  if exists (
    select 1 from pg_class r
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname like 'communication_%'
      and (
        has_table_privilege('anon', r.oid, 'select')
        or has_table_privilege('authenticated', r.oid, 'insert')
        or has_table_privilege('authenticated', r.oid, 'update')
        or has_table_privilege('authenticated', r.oid, 'delete')
      )
  ) then raise exception 'B20_DIRECT_TABLE_BOUNDARY'; end if;

  select count(*) into c
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like 'b20_%'
    and has_function_privilege('anon', p.oid, 'execute');
  if c <> 0 then raise exception 'B20_ANON_FUNCTIONS:%', c; end if;

  select count(*) into c
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like 'b20_%'
    and has_function_privilege('public', p.oid, 'execute');
  if c <> 0 then raise exception 'B20_PUBLIC_FUNCTIONS:%', c; end if;

  raise notice 'B20_COMMUNICATION_CENTER_VALIDATION_PASS';
  raise notice 'structural_blockers: 0';
end $$;

select 'B20_COMMUNICATION_CENTER_VALIDATION_PASS' as result,
       0 as structural_blockers;
