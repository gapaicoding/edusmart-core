do $$
declare v_count integer;
begin
  select count(*) into v_count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('report_cards','report_card_subject_entries','report_card_narratives');
  if v_count<>3 then raise exception 'B8 reporting tables missing'; end if;
  if not exists(select 1 from pg_index i where i.indexrelid='public.uq_report_cards_one_working'::regclass and i.indisunique and pg_get_expr(i.indpred,i.indrelid) like '%draft%' and pg_get_expr(i.indpred,i.indrelid) like '%submitted%' and pg_get_expr(i.indpred,i.indrelid) like '%reviewed%') then raise exception 'Working uniqueness missing'; end if;
  if not exists(select 1 from pg_index i where i.indexrelid='public.uq_report_cards_one_published'::regclass and i.indisunique and pg_get_expr(i.indpred,i.indrelid) like '%published%') then raise exception 'Published uniqueness missing'; end if;
  if exists(select 1 from public.report_cards where status in ('draft','submitted','reviewed') group by student_enrollment_id,term_id having count(*)>1) then raise exception 'Duplicate working versions'; end if;
  if exists(select 1 from public.report_cards where status='published' group by student_enrollment_id,term_id having count(*)>1) then raise exception 'Duplicate published versions'; end if;
  if exists(select 1 from public.report_cards rc join public.student_enrollments se on se.id=rc.student_enrollment_id join public.terms t on t.id=rc.term_id where (rc.organization_id,rc.school_id,rc.academic_year_id) is distinct from (se.organization_id,se.school_id,se.academic_year_id) or (rc.organization_id,rc.school_id,rc.academic_year_id) is distinct from (t.organization_id,t.school_id,t.academic_year_id)) then raise exception 'ReportCard context mismatch'; end if;
  if (select count(*) from public.report_cards)<>36 then raise exception 'Expected 36 existing ReportCards'; end if;
end $$;

do $$
declare fn text; v_oid oid; v_owner oid; trigger_fn text[]:=array['validate_report_card_consistency()','guard_report_card_transition()','guard_report_card_subject_entry_write()','guard_report_card_narrative_write()']; app_fn text[]:=array['can_access_report_card(text,uuid)','generate_report_card_draft(uuid,uuid,timestamp with time zone)','transition_report_card(uuid,timestamp with time zone,text)','create_report_card_revision(uuid,timestamp with time zone)','publish_report_card(uuid,timestamp with time zone)'];
begin
  foreach fn in array trigger_fn||app_fn loop
    v_oid:=to_regprocedure('public.'||fn);
    if v_oid is null then raise exception 'Missing function %',fn; end if;
    select proowner into v_owner from pg_proc where oid=v_oid;
    if not exists(select 1 from pg_proc p cross join lateral unnest(coalesce(p.proconfig,'{}')) cfg where p.oid=v_oid and cfg in ('search_path=','search_path=""')) then raise exception 'Unhardened search_path %',fn; end if;
    if exists(select 1 from aclexplode(coalesce((select proacl from pg_proc where oid=v_oid),acldefault('f',v_owner))) a where a.privilege_type='EXECUTE' and a.grantee in (0,'anon'::regrole::oid,'service_role'::regrole::oid)) then raise exception 'Unsafe ACL %',fn; end if;
  end loop;
  foreach fn in array trigger_fn loop if (select prosecdef from pg_proc where oid=to_regprocedure('public.'||fn)) then raise exception 'Trigger function unexpectedly SECURITY DEFINER %',fn; end if; end loop;
  foreach fn in array app_fn loop if not (select prosecdef from pg_proc where oid=to_regprocedure('public.'||fn)) then raise exception 'Application function must be SECURITY DEFINER %',fn; end if; end loop;
  foreach fn in array trigger_fn loop if has_function_privilege('authenticated',to_regprocedure('public.'||fn),'EXECUTE') then raise exception 'Trigger function executable %',fn; end if; end loop;
  foreach fn in array app_fn loop if not has_function_privilege('authenticated',to_regprocedure('public.'||fn),'EXECUTE') then raise exception 'Application function not executable %',fn; end if; end loop;
  if position('can_view_academic' in pg_get_functiondef('public.can_access_report_card(text,uuid)'::regprocedure))=0 then raise exception 'Guardian academic flag missing'; end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['report_cards','report_card_subject_entries','report_card_narratives'] loop if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'RLS disabled %',t; end if; end loop;
  if not exists(select 1 from pg_trigger where tgrelid='public.report_cards'::regclass and tgname='trg_report_cards_workflow_guard' and not tgisinternal) then raise exception 'Workflow trigger missing'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.report_cards'::regclass and tgname='trg_report_cards_validate_consistency' and not tgisinternal) then raise exception 'Consistency trigger missing'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.report_cards'::regclass and tgname='audit_report_cards' and not tgisinternal) then raise exception 'ReportCard audit missing'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.report_card_subject_entries'::regclass and tgname='trg_report_card_subject_entries_write_guard' and not tgisinternal) then raise exception 'Subject guard missing'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.report_card_narratives'::regclass and tgname='trg_report_card_narratives_write_guard' and not tgisinternal) then raise exception 'Narrative guard missing'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.report_card_subject_entries'::regclass and tgname='audit_report_card_subject_entries' and not tgisinternal) then raise exception 'Subject audit missing'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.report_card_narratives'::regclass and tgname='audit_report_card_narratives' and not tgisinternal) then raise exception 'Narrative audit missing'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='report_cards' and policyname='report_cards_select') then raise exception 'ReportCard select policy missing'; end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename in ('report_cards','report_card_subject_entries') and cmd='DELETE') then raise exception 'Broad Reporting delete policy exists'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='report_card_narratives' and policyname='report_card_narratives_delete' and cmd='DELETE') then raise exception 'Draft narrative delete policy missing'; end if;
end $$;
select 'B8 reporting validation passed' as result;
