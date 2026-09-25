-- B17 read-only structural/security validator. Never repairs business data.
do $validator$
declare v_name text; v_sig regprocedure; v_fn record;
  v_guard_def text;
begin
  foreach v_name in array array['academic_period_command_requests'] loop
    if to_regclass('public.'||v_name) is null then raise exception 'B17_VALIDATION_MISSING_TABLE: %',v_name; end if;
    if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c where c.oid=to_regclass('public.'||v_name)) then
      raise exception 'B17_VALIDATION_RLS_NOT_FORCED: %',v_name;
    end if;
    if exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      where c.oid=to_regclass('public.'||v_name)
        and a.grantee in (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)
        and a.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')) then
      raise exception 'B17_VALIDATION_LEDGER_DIRECT_PRIVILEGE';
    end if;
  end loop;
  foreach v_name in array array['academic_years','terms'] loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=v_name and column_name='closed_at')
      or not exists(select 1 from information_schema.columns where table_schema='public' and table_name=v_name and column_name='closed_by_profile_id')
      or not exists(select 1 from information_schema.columns where table_schema='public' and table_name=v_name and column_name='reopened_at') then
      raise exception 'B17_VALIDATION_MISSING_LIFECYCLE_AUDIT_COLUMNS: %',v_name;
    end if;
  end loop;
  foreach v_name in array array[
    'academic_years','terms','academic_calendar_events','classrooms','teaching_assignments','timetable_entries','timetable_periods',
    'student_enrollments','class_enrollments','attendance_sessions','attendance_session_roster_members',
    'student_attendance_records','assessments','assessment_learning_objectives','student_scores',
    'report_cards','report_card_subject_entries','report_card_narratives','progression_batches','progression_decisions'
  ] loop
    if not exists(select 1 from pg_trigger t where t.tgrelid=to_regclass('public.'||v_name)
      and t.tgname like 'trg_b17_%' and not t.tgisinternal) then
      raise exception 'B17_VALIDATION_MISSING_PERIOD_GUARD: %',v_name;
    end if;
  end loop;
  select pg_get_functiondef('public.b17_guard_period_mutation()'::regprocedure) into v_guard_def;
  if v_guard_def !~* 'command_name\s*=\s*''correct_final_score''[\s\S]*status\s*=\s*''processing''' then
    raise exception 'B17_VALIDATION_SCORE_CORRECTION_EXCEPTION_MISSING';
  end if;
  if v_guard_def !~* 'command_name\s*=\s*''create_report_card_revision''[\s\S]*status\s*=\s*''started''' then
    raise exception 'B17_VALIDATION_REPORT_CARD_REVISION_EXCEPTION_MISSING';
  end if;
  foreach v_name in array array[
    'b17_get_term_close_readiness(uuid,uuid)','b17_get_academic_year_close_readiness(uuid,uuid)',
    'b17_close_term(uuid,uuid,uuid,timestamp with time zone,text)',
    'b17_close_academic_year(uuid,uuid,uuid,timestamp with time zone,text)',
    'b17_reopen_term(uuid,uuid,uuid,timestamp with time zone,text)',
    'b17_reopen_academic_year(uuid,uuid,uuid,timestamp with time zone,text)'
  ] loop
    v_sig:=to_regprocedure('public.'||v_name);
    if v_sig is null then raise exception 'B17_VALIDATION_MISSING_RPC: %',v_name; end if;
    select p.prosecdef,p.proconfig into v_fn from pg_proc p where p.oid=v_sig;
    if not v_fn.prosecdef or not (v_fn.proconfig @> array['search_path=""']) then raise exception 'B17_VALIDATION_UNSAFE_RPC: %',v_name; end if;
    if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid=v_sig and a.grantee in (0,'anon'::regrole,'service_role'::regrole) and a.privilege_type='EXECUTE') then
      raise exception 'B17_VALIDATION_RPC_ACL: %',v_name;
    end if;
    if not has_function_privilege('authenticated',v_sig,'EXECUTE') then raise exception 'B17_VALIDATION_AUTH_EXECUTE_MISSING: %',v_name; end if;
  end loop;
  if exists(select 1 from public.permissions where code in ('term.close','term.reopen','academic_year.close','academic_year.reopen') group by code having count(*)<>1)
    or (select count(*) from public.permissions where code in ('term.close','term.reopen','academic_year.close','academic_year.reopen'))<>4 then
    raise exception 'B17_VALIDATION_PERMISSION_REGISTRY';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.terms'::regclass and tgname='trg_b17_term_period_guard' and (tgtype & 4)=4)
    or not exists(select 1 from pg_trigger where tgrelid='public.academic_years'::regclass and tgname='trg_b17_academic_year_period_guard' and (tgtype & 4)=4) then
    raise exception 'B17_VALIDATION_LIFECYCLE_GUARD_MISSING';
  end if;
end
$validator$;

select 'PASS' as b17_validation_status, 'Read-only academic period closure structure/security checks passed' as detail;
