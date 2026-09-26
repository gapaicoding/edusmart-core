-- Read-only Batch 19 Phase 1 Finance foundation validator.
do $$
declare
  v_table text;
  v_expected text[] := array[
    'finance_fee_definitions',
    'finance_billing_plans',
    'finance_billing_plan_versions',
    'finance_billing_plan_targets',
    'finance_invoice_number_counters',
    'finance_invoices',
    'finance_invoice_items',
    'finance_invoice_status_history',
    'finance_payments',
    'finance_payment_allocations',
    'finance_payment_corrections',
    'finance_command_requests'
  ];
  v_caps text[] := array[
    'finance.read',
    'finance.manage_fees',
    'finance.manage_billing',
    'finance.issue',
    'finance.record_payment',
    'finance.adjust',
    'finance.portal_read'
  ];
  v_staff text[] := array[
    'finance.read',
    'finance.manage_fees',
    'finance.manage_billing',
    'finance.issue',
    'finance.record_payment',
    'finance.adjust'
  ];
  v_count bigint;
begin
  foreach v_table in array v_expected loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'B19_FINANCE_FOUNDATION_MISSING_TABLE: %', v_table;
    end if;
    if not exists (
      select 1 from pg_class c
      where c.oid = ('public.' || v_table)::regclass
        and c.relrowsecurity
        and c.relforcerowsecurity
    ) then
      raise exception 'B19_FINANCE_FOUNDATION_RLS_MISSING: %', v_table;
    end if;
    if has_table_privilege('public','public.' || v_table,'SELECT')
       or has_table_privilege('anon','public.' || v_table,'SELECT')
       or has_table_privilege('public','public.' || v_table,'INSERT')
       or has_table_privilege('anon','public.' || v_table,'INSERT')
       or has_table_privilege('authenticated','public.' || v_table,'INSERT')
       or has_table_privilege('public','public.' || v_table,'UPDATE')
       or has_table_privilege('anon','public.' || v_table,'UPDATE')
       or has_table_privilege('authenticated','public.' || v_table,'UPDATE')
       or has_table_privilege('public','public.' || v_table,'DELETE')
       or has_table_privilege('anon','public.' || v_table,'DELETE')
       or has_table_privilege('authenticated','public.' || v_table,'DELETE') then
      raise exception 'B19_FINANCE_FOUNDATION_TABLE_PRIVILEGE_DRIFT: %', v_table;
    end if;
  end loop;

  select count(*) into v_count
  from public.permissions
  where code like 'finance.%';
  if v_count <> cardinality(v_caps) then
    raise exception 'B19_FINANCE_FOUNDATION_CAPABILITY_COUNT: %', v_count;
  end if;
  if exists (
    select 1 from public.permissions
    where code like 'finance.%' and not (code = any(v_caps))
  ) then
    raise exception 'B19_FINANCE_FOUNDATION_CAPABILITY_DRIFT';
  end if;

  foreach v_table in array v_staff loop
    if not exists (
      select 1 from public.permissions p
      join public.role_permissions rp on rp.permission_id = p.id
      join public.roles r on r.id = rp.role_id
      where p.code = v_table and r.organization_id is null
        and r.code in ('ORG_OWNER','PRINCIPAL','SCHOOL_ADMIN')
    ) then
      raise exception 'B19_FINANCE_FOUNDATION_STAFF_GRANT_MISSING: %', v_table;
    end if;
  end loop;

  if not exists (
    select 1 from public.permissions p
    join public.role_permissions rp on rp.permission_id = p.id
    join public.roles r on r.id = rp.role_id
    where p.code = 'finance.portal_read' and r.organization_id is null and r.code = 'PARENT'
  ) then
    raise exception 'B19_FINANCE_FOUNDATION_PARENT_GRANT_MISSING';
  end if;

  if exists (
    select 1 from public.permissions p
    join public.role_permissions rp on rp.permission_id = p.id
    join public.roles r on r.id = rp.role_id
    where p.code like 'finance.%'
      and r.organization_id is null
      and r.code in ('VICE_PRINCIPAL_CURRICULUM','TEACHER','HOMEROOM_TEACHER','STUDENT')
  ) then
    raise exception 'B19_FINANCE_FOUNDATION_UNAUTHORIZED_ROLE_GRANT';
  end if;
  if exists (select 1 from public.roles where upper(code) in ('BENDahara','BURSAR','FINANCE','ACCOUNTANT')) then
    raise exception 'B19_FINANCE_FOUNDATION_UNEXPECTED_ROLE';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = any(v_expected)
      and column_name ~ '(amount|total|balance)'
      and data_type in ('real','double precision','numeric','decimal')
  ) then
    raise exception 'B19_FINANCE_FOUNDATION_FLOATING_MONEY_TYPE';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'finance_invoices'
      and column_name = 'document_status' and data_type = 'text'
  ) then
    raise exception 'B19_FINANCE_FOUNDATION_DOCUMENT_STATUS_MISSING';
  end if;
  if exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.finance_invoices'::regclass
      and pg_get_constraintdef(c.oid) ilike '%document_status%'
      and pg_get_constraintdef(c.oid) ilike '%overdue%'
  ) then
    raise exception 'B19_FINANCE_FOUNDATION_OVERDUE_MUST_BE_DERIVED';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.finance_payment_allocations'::regclass
      and conname = 'finance_allocations_one_per_payment'
  ) then
    raise exception 'B19_FINANCE_FOUNDATION_ALLOCATION_UNIQUENESS_MISSING';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.finance_payment_corrections'::regclass
      and conname = 'finance_payment_corrections_one_reversal'
  ) then
    raise exception 'B19_FINANCE_FOUNDATION_REVERSAL_UNIQUENESS_MISSING';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'finance_invoice_generation_key'
  ) then
    raise exception 'B19_FINANCE_FOUNDATION_GENERATION_UNIQUENESS_MISSING';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'finance_%'
      and (has_function_privilege('public',p.oid,'EXECUTE')
        or has_function_privilege('anon',p.oid,'EXECUTE'))
  ) then
    raise exception 'B19_FINANCE_FOUNDATION_ANON_FUNCTION_EXECUTE';
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'finance_%'
      and p.prosecdef
      and not (p.proconfig @> array['search_path=""'])
  ) then
    raise exception 'B19_FINANCE_FOUNDATION_SECURITY_DEFINER_SEARCH_PATH';
  end if;

  if exists (
    select 1 from pg_class
    where relnamespace = 'public'::regnamespace
      and relname ilike any(array['finance_gateway%','finance_webhook%','finance_ledger%','finance_journal%'])
  ) then
    raise exception 'B19_FINANCE_FOUNDATION_UNSUPPORTED_TABLE';
  end if;

  foreach v_table in array array[
    'finance_fee_definitions','finance_billing_plans','finance_billing_plan_versions',
    'finance_billing_plan_targets','finance_invoice_number_counters','finance_invoices',
    'finance_invoice_items','finance_invoice_status_history','finance_payments',
    'finance_payment_allocations','finance_payment_corrections','finance_command_requests'
  ] loop
    execute format('select count(*) from public.%I', v_table) into v_count;
    -- Empty tables were a Phase-1 deployment check, not a lasting schema
    -- invariant. Runtime/UAT evidence is inventoried separately by tenant.
    raise notice 'B19_FINANCE_BUSINESS_ROW_COUNT: % = %', v_table, v_count;
  end loop;
end;
$$;

select 'B19_FINANCE_FOUNDATION_VALIDATION_PASS' as result,
       0 as structural_blockers;
