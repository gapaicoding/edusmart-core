do $$
declare v_table regclass := to_regclass('public.communication_delivery_worker_instances');
begin
  if v_table is null then raise exception 'B29 worker instance table is missing'; end if;
  if not exists(select 1 from pg_class where oid=v_table and relrowsecurity and relforcerowsecurity) then
    raise exception 'B29 worker health table must enable and force RLS';
  end if;
  if has_table_privilege('anon',v_table,'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated',v_table,'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role',v_table,'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'B29 worker table direct access must be revoked';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='communication_delivery_recipients' and column_name='dispatch_started_at') then
    raise exception 'B29 dispatch ambiguity marker is missing';
  end if;
  if to_regprocedure('public.b25_claim_delivery_batch(uuid,uuid,integer,integer)') is null
    or to_regprocedure('public.b25_resolve_claimed_delivery(uuid,uuid)') is null
    or to_regprocedure('public.b25_finalize_delivery_attempt(uuid,uuid,text,text,text)') is null then
    raise exception 'B25 queue contract was removed';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='b25_delivery_one_active_claim_idx') then
    raise exception 'B25 atomic claim index is missing';
  end if;
  if not exists(select 1 from pg_constraint where conname='b25_delivery_recipient_lease_state_check') then
    raise exception 'B25 lease state contract is missing';
  end if;
  if has_function_privilege('anon','public.b29_claim_delivery_batch(uuid,uuid,integer,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.b29_claim_delivery_batch(uuid,uuid,integer,integer)','EXECUTE')
    or not has_function_privilege('service_role','public.b29_claim_delivery_batch(uuid,uuid,integer,integer)','EXECUTE') then
    raise exception 'B29 machine claim must be service-role only';
  end if;
  if exists (
    select 1
    from unnest(array[
      'public.b29_register_delivery_worker(uuid,text,integer)',
      'public.b29_heartbeat_delivery_worker(uuid,text,jsonb)',
      'public.b29_stop_delivery_worker(uuid)',
      'public.b29_get_delivery_worker_cursor(uuid)',
      'public.b29_list_delivery_schools(uuid)',
      'public.b29_mark_delivery_dispatch_started(uuid,uuid)'
    ]) as f(signature)
    where has_function_privilege('anon',f.signature,'EXECUTE')
      or has_function_privilege('authenticated',f.signature,'EXECUTE')
      or not has_function_privilege('service_role',f.signature,'EXECUTE')
  ) then
    raise exception 'B29 worker lifecycle RPCs must be service-role only';
  end if;
  if has_function_privilege('anon','public.b29_claim_delivery_batch_core(uuid,uuid,uuid,integer,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.b29_claim_delivery_batch_core(uuid,uuid,uuid,integer,integer)','EXECUTE')
    or not has_function_privilege('service_role','public.b29_claim_delivery_batch_core(uuid,uuid,uuid,integer,integer)','EXECUTE') then
    raise exception 'B29 shared claim core must be service-role only';
  end if;
  if has_function_privilege('anon','public.b25_claim_delivery_batch(uuid,uuid,integer,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.b25_claim_delivery_batch(uuid,uuid,integer,integer)','EXECUTE')
    or not has_function_privilege('service_role','public.b25_claim_delivery_batch(uuid,uuid,integer,integer)','EXECUTE') then
    raise exception 'B25 server claim boundary must remain service-role only';
  end if;
  if has_function_privilege('anon','public.b29_get_delivery_worker_health()','EXECUTE')
    or has_function_privilege('authenticated','public.b29_get_delivery_worker_health()','EXECUTE')
    or not has_function_privilege('service_role','public.b29_get_delivery_worker_health()','EXECUTE') then
    raise exception 'B29 worker health projection must be service-role only';
  end if;
  if has_function_privilege('anon','public.b29_finalize_delivery_attempt(uuid,uuid,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.b29_finalize_delivery_attempt(uuid,uuid,text,text,text)','EXECUTE')
    or not has_function_privilege('service_role','public.b29_finalize_delivery_attempt(uuid,uuid,text,text,text)','EXECUTE') then
    raise exception 'B29 finalization must be service-role only';
  end if;
  if exists(select 1 from public.communication_delivery_jobs where provider_key<>'unconfigured') then
    raise exception 'B29 unexpectedly configured an external provider';
  end if;
end;
$$;

select 'B29_COMMUNICATION_DELIVERY_WORKER_RUNTIME_VALIDATION_PASS' as result;
