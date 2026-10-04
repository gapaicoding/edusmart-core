-- Read-only B27 database boundary validator.
do $$
declare
  t text;
  f text;
  p oid;
  definition text;
begin
  foreach t in array array['b27_midtrans_qris_orders','b27_midtrans_qris_requests','b27_midtrans_qris_notifications'] loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception 'B27_RLS:%',t;
    end if;
    if has_table_privilege('anon',to_regclass('public.'||t),'select')
      or has_table_privilege('authenticated',to_regclass('public.'||t),'select')
      or has_table_privilege('authenticated',to_regclass('public.'||t),'insert')
      or has_table_privilege('authenticated',to_regclass('public.'||t),'update')
      or has_table_privilege('authenticated',to_regclass('public.'||t),'delete')
      or has_table_privilege('service_role',to_regclass('public.'||t),'select')
      or has_table_privilege('service_role',to_regclass('public.'||t),'insert')
      or has_table_privilege('service_role',to_regclass('public.'||t),'update')
      or has_table_privilege('service_role',to_regclass('public.'||t),'delete') then
      raise exception 'B27_DIRECT_TABLE_ACCESS:%',t;
    end if;
  end loop;

  if not exists(select 1 from pg_constraint where conrelid='public.b27_midtrans_qris_orders'::regclass
    and contype='c' and pg_get_constraintdef(oid) ilike '%environment = ''sandbox''%') then
    raise exception 'B27_SANDBOX_CONSTRAINT';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.b27_midtrans_qris_orders'::regclass
    and contype='u' and pg_get_constraintdef(oid) ilike '%(intent_id)%') then
    raise exception 'B27_ORDER_IDEMPOTENCY';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.b24_provider_events'::regclass
    and contype='u' and pg_get_constraintdef(oid) ilike '%(provider_key, provider_event_id)%') then
    raise exception 'B27_EVENT_REPLAY_UNIQUENESS';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public'
    and table_name like 'b27_midtrans_qris_%' and
    (column_name ilike '%secret%' or column_name ilike '%private_key%' or column_name ilike '%raw%payload%')) then
    raise exception 'B27_SECRET_OR_RAW_PAYLOAD_COLUMN';
  end if;

  foreach f in array array[
    'public.b27_reserve_parent_midtrans_qris(uuid,uuid,uuid)',
    'public.b27_save_midtrans_qris_result(uuid,text,text)',
    'public.b27_mark_midtrans_qris_ambiguous(uuid,text)',
    'public.b27_expire_parent_midtrans_qris(uuid,uuid)',
    'public.b27_get_parent_midtrans_qris(uuid,uuid)',
    'public.b27_claim_parent_midtrans_qris_status_check(uuid,uuid)',
    'public.b27_get_midtrans_order_for_parent(uuid,uuid)',
    'public.b27_list_invoice_midtrans_qris(uuid,uuid,uuid)',
    'public.b27_receive_midtrans_qris_notification(jsonb)',
    'public.b27_record_unsupported_midtrans_qris_notification(jsonb)',
    'public.b24_reconcile_midtrans_qris_event(jsonb)'
  ] loop
    select p.oid, lower(pg_get_functiondef(p.oid)) into p,definition from pg_proc p
      where p.oid=to_regprocedure(f) and p.prosecdef and p.proconfig @> array['search_path=""'];
    if p is null then raise exception 'B27_FUNCTION_SECURITY:%',f; end if;
    if has_function_privilege('public',p,'execute') or has_function_privilege('anon',p,'execute')
      or has_function_privilege('authenticated',p,'execute')
      or not has_function_privilege('service_role',p,'execute') then
      raise exception 'B27_FUNCTION_ACL:%',f;
    end if;
  end loop;
  select lower(pg_get_functiondef('public.b27_receive_midtrans_qris_notification(jsonb)'::regprocedure)) into definition;
  if strpos(definition,'b24_reconcile_midtrans_qris_event')=0 then raise exception 'B27_B24_BOUNDARY'; end if;
  select lower(pg_get_functiondef('public.b24_reconcile_midtrans_qris_event(jsonb)'::regprocedure)) into definition;
  if strpos(definition,'for update')=0 or strpos(definition,'finance_payment_allocations')=0
    or strpos(definition,'b24_payment_reconciliations')=0 then raise exception 'B27_B24_RECONCILIATION'; end if;
  if exists(select 1 from public.b27_midtrans_qris_orders where environment<>'sandbox' or currency<>'IDR' or method<>'qris') then
    raise exception 'B27_ORDER_ENVIRONMENT_DATA';
  end if;
  raise notice 'B27_MIDTRANS_QRIS_SANDBOX_VALIDATION_PASS';
end $$;

select 'B27_MIDTRANS_QRIS_SANDBOX_VALIDATION_PASS' as result;
