do $$
declare
  v_function oid;
  v_def text;
  v_config text;
begin
  select p.oid, pg_catalog.pg_get_functiondef(p.oid), pg_catalog.array_to_string(p.proconfig, ',')
    into v_function, v_def, v_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'b26_get_pilot_readiness_facts'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_school_id uuid'
    and p.prosecdef;

  if v_function is null then raise exception 'B26 readiness projection missing or not SECURITY DEFINER'; end if;
  if v_config not like '%search_path=""%' then raise exception 'B26 readiness projection must use an empty search_path'; end if;
  if not has_function_privilege('authenticated', v_function, 'EXECUTE') then raise exception 'authenticated must execute readiness projection'; end if;
  if has_function_privilege('anon', v_function, 'EXECUTE') then raise exception 'anon must not execute readiness projection'; end if;
  if has_function_privilege('service_role', v_function, 'EXECUTE') then raise exception 'service_role must not execute readiness projection'; end if;
  if v_def ~* '\m(insert|update|delete|truncate|perform)\M' then raise exception 'B26 readiness projection must remain read-only'; end if;
  if v_def not like '%school.readiness.read%' or v_def not like '%p_school_id%' then raise exception 'B26 readiness projection must check scoped readiness access'; end if;
end;
$$;

select 'B26_PILOT_READINESS_VALIDATION_PASS' as validation_result;
