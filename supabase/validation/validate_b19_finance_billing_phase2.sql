-- Read-only Batch 19 Phase 2 validator.
do $$
declare
  required text[] := array['finance_fee_definitions','finance_billing_plans','finance_billing_plan_versions','finance_billing_plan_targets','finance_invoice_number_counters','finance_invoices','finance_invoice_items','finance_invoice_status_history','finance_payments','finance_payment_allocations','finance_payment_corrections','finance_command_requests'];
  t text; n integer:=0; c integer; pub integer; anon integer; auth_mut integer; f record;
  definition text; lock_pos integer; settlement_pos integer; cas_pos integer;
  plan_read text[] := array[
    'public.b19_list_finance_billing_plans(uuid,integer,integer)',
    'public.b19_get_finance_billing_plan(uuid,uuid)',
    'public.b19_list_finance_billing_plan_versions(uuid,uuid,integer,integer)',
    'public.b19_get_finance_billing_plan_version(uuid,uuid)',
    'public.b19_list_finance_billing_plan_targets(uuid,uuid,integer,integer)'
  ];
begin
  -- Structural tripwire only; independent-session regression is also required.
  select lower(regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'))
    into definition
  from pg_proc p
  where p.oid = to_regprocedure('public.b19_void_finance_invoice(jsonb)')
    and p.prosecdef and p.proconfig @> array['search_path=""'];
  if definition is null then raise exception 'B19_PHASE2_VOID_SECURITY'; end if;
  lock_pos := strpos(definition, 'for update;');
  cas_pos := strpos(definition, 'r.row_version is distinct from');
  settlement_pos := strpos(definition, 'select coalesce(sum(a.amount_idr)');
  if lock_pos = 0 or cas_pos <= lock_pos or settlement_pos <= cas_pos
    or strpos(definition, 'if paid <> 0 then') <= settlement_pos
    or strpos(definition, 'update public.finance_invoices') <= settlement_pos then
    raise exception 'B19_PHASE2_VOID_LOCK_ORDER';
  end if;
  if has_function_privilege('public', 'public.b19_void_finance_invoice(jsonb)', 'execute')
    or has_function_privilege('anon', 'public.b19_void_finance_invoice(jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.b19_void_finance_invoice(jsonb)', 'execute') then
    raise exception 'B19_PHASE2_VOID_ACL';
  end if;
  foreach t in array plan_read loop
    select lower(pg_get_functiondef(p.oid)) into definition
    from pg_proc p
    where p.oid = to_regprocedure(t)
      and p.prosecdef
      and p.proconfig @> array['search_path=""'];
    if definition is null
      or strpos(definition, 'b19_finance_authorize(''finance.read'', p_school_id)') = 0
      or (
        strpos(definition, 'limit least(greatest(coalesce(p_limit, 50), 1), 100)') = 0
        and t not like '%get_finance_billing_plan(uuid,uuid)%'
        and t not like '%get_finance_billing_plan_version(uuid,uuid)%'
      )
      or has_function_privilege('public', to_regprocedure(t), 'execute')
      or has_function_privilege('anon', to_regprocedure(t), 'execute')
      or not has_function_privilege('authenticated', to_regprocedure(t), 'execute') then
      raise exception 'B19_PHASE2_PLAN_READ:%', t;
    end if;
  end loop;
  foreach t in array required loop
    if to_regclass('public.'||t) is null then raise exception 'B19_PHASE2_MISSING_TABLE:%',t; end if;
    if not exists(select 1 from pg_class r join pg_namespace s on s.oid=r.relnamespace where s.nspname='public' and r.relname=t and r.relrowsecurity and r.relforcerowsecurity) then raise exception 'B19_PHASE2_RLS:%',t; end if;
  end loop;
  select count(*) into c from public.permissions where code like 'finance.%'; if c<>7 then raise exception 'B19_PHASE2_CAPABILITY_COUNT:%',c; end if;
  select count(*) into c from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'b19_%' and has_function_privilege('anon',p.oid,'execute');
  if c<>0 then raise exception 'B19_PHASE2_ANON_FUNCTIONS:%',c; end if;
  select count(*) into c from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'b19_%' and has_function_privilege('public',p.oid,'execute');
  if c<>0 then raise exception 'B19_PHASE2_PUBLIC_FUNCTIONS:%',c; end if;
  for f in select p.oid::regprocedure proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'b19_%' loop
    if has_function_privilege('authenticated',f.proc,'execute') is false and f.proc::text not like '%finance_authorize%' and f.proc::text not like '%finance_fingerprint%' and f.proc::text not like '%finance_command_%' and f.proc::text not like '%finance_settlement%' and f.proc::text not like '%finance_assert_open_year%' and f.proc::text not like '%generate_finance_invoice_internal%' then raise exception 'B19_PHASE2_AUTH_FUNCTION_ACL:%',f.proc; end if;
  end loop;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'b19_%' and p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') not like '%search_path=%') then raise exception 'B19_PHASE2_SEARCH_PATH'; end if;
  select count(*) into pub from information_schema.tables where table_schema='public' and table_name like 'finance_%';
  if pub<>12 then raise exception 'B19_PHASE2_FINANCE_TABLE_COUNT:%',pub; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name like 'finance_%' and column_name like '%amount%' and data_type in ('real','double precision','numeric')) then raise exception 'B19_PHASE2_FLOAT_MONEY'; end if;
  if exists(select 1 from public.finance_invoices where document_status not in ('draft','issued','void')) then raise exception 'B19_PHASE2_DOCUMENT_STATE'; end if;
  select count(*) into c from public.finance_command_requests where command_name not in ('fee_create','fee_update','fee_archive','billing_plan_create','billing_plan_update','billing_plan_activate','invoice_generate','invoice_issue','invoice_void','payment_record','payment_reverse');
  if c<>0 then raise exception 'B19_PHASE2_COMMAND_NAME'; end if;
  if exists(select 1 from pg_class r join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname like 'finance_%' and has_table_privilege('anon',r.oid,'select')) then raise exception 'B19_PHASE2_ANON_TABLE_ACCESS'; end if;
  if exists(select 1 from pg_class r join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname like 'finance_%' and (has_table_privilege('authenticated',r.oid,'insert') or has_table_privilege('authenticated',r.oid,'update') or has_table_privilege('authenticated',r.oid,'delete'))) then raise exception 'B19_PHASE2_DIRECT_MUTATION'; end if;
  if exists(select 1 from pg_class r join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname like 'finance_%' and (r.relname like '%gateway%' or r.relname like '%webhook%' or r.relname like '%ledger%' or r.relname like '%journal%')) then raise exception 'B19_PHASE2_UNSUPPORTED_TABLE'; end if;
  raise notice 'B19_FINANCE_PHASE2_VALIDATION_PASS';
  raise notice 'structural_blockers: 0';
end $$;

select 'B19_FINANCE_PHASE2_VALIDATION_PASS' as result,
       0 as structural_blockers;
