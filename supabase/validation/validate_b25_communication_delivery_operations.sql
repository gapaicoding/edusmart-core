do $$
declare
  v_missing text;
begin
  select string_agg(x.name, ', ' order by x.name) into v_missing
  from (values
    ('communication_contact_preferences'),
    ('communication_contact_preference_events'),
    ('communication_delivery_operator_requests')
  ) as x(name)
  where to_regclass('public.' || x.name) is null;
  if v_missing is not null then raise exception 'B25 missing tables: %', v_missing; end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (
      'communication_contact_preferences','communication_contact_preference_events',
      'communication_delivery_operator_requests','communication_delivery_jobs',
      'communication_delivery_recipients','communication_delivery_attempts'
    ) and (c.relrowsecurity is not true or c.relforcerowsecurity is not true)
  ) then raise exception 'B25 RLS is not enabled and forced for every delivery integrity table'; end if;

  if not exists (select 1 from pg_constraint where conname='b25_contact_preference_revocation_check') then
    raise exception 'B25 consent revocation invariant is missing';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='b25_record_contact_preference'
      and position('communication_contact_preference_events(' in p.prosrc)>0
      and position('source_reference,changed_by_profile_id,effective_at' in p.prosrc)>0
  ) then raise exception 'B25 consent evidence reference is not copied into the immutable preference event'; end if;
  if not exists (select 1 from pg_constraint where conname='b25_delivery_recipient_lease_state_check') then
    raise exception 'B25 lease state invariant is missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='b25_delivery_one_active_claim_idx') then
    raise exception 'B25 active claim uniqueness is missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='b25_delivery_attempt_start_once_idx') or
     not exists (select 1 from pg_indexes where schemaname='public' and indexname='b25_delivery_attempt_final_once_idx') then
    raise exception 'B25 append-only logical attempt uniqueness is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_b22_delivery_attempt_immutable' and not tgisinternal) then
    raise exception 'B22 append-only attempt guard is missing';
  end if;
  if has_function_privilege('authenticated','public.b25_resolve_claimed_delivery(uuid,uuid)','EXECUTE') or
     has_function_privilege('anon','public.b25_resolve_claimed_delivery(uuid,uuid)','EXECUTE') then
    raise exception 'B25 raw destination resolver is exposed outside the server execution boundary';
  end if;
  if not has_function_privilege('service_role','public.b25_resolve_claimed_delivery(uuid,uuid)','EXECUTE') then
    raise exception 'B25 server executor cannot resolve eligible destinations';
  end if;
  if has_function_privilege('anon','public.b25_claim_delivery_batch(uuid,uuid,integer,integer)','EXECUTE') or
     has_function_privilege('authenticated','public.b25_claim_delivery_batch(uuid,uuid,integer,integer)','EXECUTE') then
    raise exception 'B25 worker claim is directly callable by a browser role';
  end if;
  if exists (select 1 from public.communication_delivery_jobs where provider_key <> 'unconfigured') then
    raise exception 'B25 provider-neutral jobs contain a configured provider';
  end if;
  raise notice 'B25_COMMUNICATION_DELIVERY_OPERATIONS_VALIDATION_PASS';
end;
$$;

select 'B25_COMMUNICATION_DELIVERY_OPERATIONS_VALIDATION_PASS' as validation_result;
