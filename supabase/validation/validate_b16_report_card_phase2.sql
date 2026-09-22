-- Read-only Batch 16 Phase 2 runtime contract validator.
do $$
declare
  v_count bigint;
  v_bad bigint;
  v_name text;
  v_args text;
  v_oid oid;
begin
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'b16_report_card_generate_draft','b16_report_card_save_content',
    'b16_report_card_transition','b16_report_card_publish',
    'b16_report_card_create_revision','b16_list_report_cards',
    'b16_get_report_card','b16_list_report_card_candidates'
  );
  if v_count <> 8 then raise exception 'B16_PHASE2_VALIDATION_RPC_INVENTORY'; end if;

  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in ('b16_report_card_generate_draft','b16_report_card_save_content',
      'b16_report_card_transition','b16_report_card_publish','b16_report_card_create_revision')
    and (p.prosecdef is false or p.proconfig is null or not exists (
      select 1 from unnest(p.proconfig) c where c in ('search_path=', 'search_path=""')
    ));
  if v_bad <> 0 then raise exception 'B16_PHASE2_VALIDATION_SECURITY_DEFINER'; end if;

  foreach v_name in array array[
    'b16_report_card_generate_draft','b16_report_card_save_content','b16_report_card_transition',
    'b16_report_card_publish','b16_report_card_create_revision','b16_list_report_cards',
    'b16_get_report_card','b16_list_report_card_candidates'] loop
    select p.oid, pg_get_function_identity_arguments(p.oid) into v_oid, v_args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=v_name limit 1;
    if has_function_privilege('public', v_oid, 'execute')
      or has_function_privilege('anon', v_oid, 'execute')
      or has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'B16_PHASE2_VALIDATION_RPC_ACL';
    end if;
  end loop;

  if not exists (select 1 from pg_proc where proname='b16_report_card_request_fingerprint') then
    raise exception 'B16_PHASE2_VALIDATION_FINGERPRINT';
  end if;
  if not exists (select 1 from pg_class where relname='report_card_command_requests' and relrowsecurity and relforcerowsecurity) then
    raise exception 'B16_PHASE2_VALIDATION_LEDGER_RLS';
  end if;
  if not exists (select 1 from pg_attribute where attrelid='public.report_cards'::regclass and attname='row_version' and not attisdropped) then
    raise exception 'B16_PHASE2_VALIDATION_CARD_CAS';
  end if;
  if not exists (select 1 from pg_attribute where attrelid='public.report_card_narratives'::regclass and attname='row_version' and not attisdropped) then
    raise exception 'B16_PHASE2_VALIDATION_NARRATIVE_CAS';
  end if;
  if not exists (select 1 from pg_attribute where attrelid='public.report_card_subject_entries'::regclass and attname='row_version' and not attisdropped) then
    raise exception 'B16_PHASE2_VALIDATION_ENTRY_CAS';
  end if;
  if exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname like '%report%card%status%' and e.enumlabel in ('open','closed')) then
    raise exception 'B16_PHASE2_VALIDATION_STATUS_DRIFT';
  end if;
  raise notice 'PASS';
end $$;

select 'PASS' as validation_result;
