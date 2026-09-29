-- Read-only B24 schema, privilege and invariant validator.
do $$
declare
  t text;
  f text;
  definition text;
begin
  foreach t in array array[
    'b24_payment_intent_requests',
    'b24_online_payment_intents',
    'b24_provider_events',
    'b24_payment_reconciliations'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t and c.relkind='r'
        and c.relrowsecurity and c.relforcerowsecurity
    ) then raise exception 'B24_RLS:%',t; end if;
    if has_table_privilege('anon',to_regclass('public.'||t),'select')
      or has_table_privilege('authenticated',to_regclass('public.'||t),'select')
      or has_table_privilege('authenticated',to_regclass('public.'||t),'insert')
      or has_table_privilege('authenticated',to_regclass('public.'||t),'update')
      or has_table_privilege('authenticated',to_regclass('public.'||t),'delete')
      or has_table_privilege('service_role',to_regclass('public.'||t),'select')
      or has_table_privilege('service_role',to_regclass('public.'||t),'insert')
      or has_table_privilege('service_role',to_regclass('public.'||t),'update')
      or has_table_privilege('service_role',to_regclass('public.'||t),'delete') then
      raise exception 'B24_DIRECT_TABLE_ACCESS:%',t;
    end if;
  end loop;

  if not exists (select 1 from pg_constraint where conrelid='public.b24_online_payment_intents'::regclass
      and contype='f' and pg_get_constraintdef(oid) ilike '%invoice_id, organization_id, school_id%') then
    raise exception 'B24_INTENT_COMPOSITE_INVOICE_FK';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.b24_payment_reconciliations'::regclass
      and contype='f' and pg_get_constraintdef(oid) ilike '%intent_id, organization_id, school_id, invoice_id%') then
    raise exception 'B24_RECONCILIATION_COMPOSITE_INTENT_FK';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.b24_online_payment_intents'::regclass
      and contype='c' and pg_get_constraintdef(oid) ilike '%currency = ''IDR''%') then
    raise exception 'B24_INTENT_CURRENCY';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.b24_online_payment_intents'::regclass
      and contype='c' and pg_get_constraintdef(oid) ilike '%amount_idr%'
      and pg_get_constraintdef(oid) ilike '%9007199254740991%') then
    raise exception 'B24_INTENT_AMOUNT';
  end if;
  if not exists (select 1 from pg_index where indrelid='public.b24_online_payment_intents'::regclass
      and indisunique and pg_get_indexdef(indexrelid) ilike '%where (status = ''pending''%') then
    raise exception 'B24_ACTIVE_INTENT_UNIQUENESS';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.b24_provider_events'::regclass
      and contype='u' and pg_get_constraintdef(oid) ilike '%(provider_key, provider_event_id)%') then
    raise exception 'B24_EVENT_IDENTITY_UNIQUENESS';
  end if;
  if not exists (select 1 from pg_index where indrelid='public.b24_payment_reconciliations'::regclass
      and indisunique and pg_get_indexdef(indexrelid) ilike '%provider_key, provider_settlement_reference%'
      and pg_get_indexdef(indexrelid) ilike '%where (status = ''settled''%') then
    raise exception 'B24_SETTLEMENT_EFFECT_UNIQUENESS';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.finance_payments'::regclass
      and contype='c' and pg_get_constraintdef(oid) ilike '%online_provider%'
      and pg_get_constraintdef(oid) ilike '%bank_transfer%') then
    raise exception 'B24_CANONICAL_PAYMENT_METHOD_EXTENSION';
  end if;

  foreach f in array array[
    'public.b24_get_parent_payment_intent(uuid,uuid)',
    'public.b24_create_parent_payment_intent(uuid,uuid,uuid)',
    'public.b24_list_invoice_payment_intents(uuid,uuid,uuid)',
    'public.b24_find_intent_for_test_event(uuid,uuid)',
    'public.b24_simulate_development_payment_event(uuid,jsonb)'
  ] loop
    select lower(pg_get_functiondef(p.oid)) into definition from pg_proc p
    where p.oid=to_regprocedure(f) and p.prosecdef and p.proconfig @> array['search_path=""'];
    if definition is null then raise exception 'B24_FUNCTION_SECURITY:%',f; end if;
    if has_function_privilege('public',to_regprocedure(f),'execute')
      or has_function_privilege('anon',to_regprocedure(f),'execute')
      or has_function_privilege('authenticated',to_regprocedure(f),'execute')
      or not has_function_privilege('service_role',to_regprocedure(f),'execute') then
      raise exception 'B24_FUNCTION_ACL:%',f;
    end if;
  end loop;

  select lower(pg_get_functiondef(p.oid)) into definition from pg_proc p
    where p.oid=to_regprocedure('public.b24_create_parent_payment_intent(uuid,uuid,uuid)');
  if strpos(definition,'b24_parent_can_access_invoice')=0
    or strpos(definition,'for update')=0
    or strpos(definition,'outstanding>9007199254740991')=0 then
    raise exception 'B24_PARENT_INTENT_INVARIANTS';
  end if;
  select lower(pg_get_functiondef(p.oid)) into definition from pg_proc p
    where p.oid=to_regprocedure('public.b24_simulate_development_payment_event(uuid,jsonb)');
  if strpos(definition,'b19_finance_authorize')=0 or strpos(definition,'for update')=0
    or strpos(definition,'online_provider')=0 or strpos(definition,'pg_advisory_xact_lock')=0 then
    raise exception 'B24_RECONCILIATION_INVARIANTS';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public'
    and table_name in ('b24_payment_intent_requests','b24_online_payment_intents','b24_provider_events','b24_payment_reconciliations')
    and column_name ilike '%raw%payload%') then
    raise exception 'B24_RAW_PAYLOAD_COLUMN';
  end if;
  raise notice 'B24_ONLINE_PAYMENT_RECONCILIATION_VALIDATION_PASS';
end $$;

select 'B24_ONLINE_PAYMENT_RECONCILIATION_VALIDATION_PASS' as result;
