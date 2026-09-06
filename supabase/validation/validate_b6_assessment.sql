-- EduSmart Core V1 / Batch 6 Assessment: security and integrity validator.
-- Run after the pending B6 migration in an isolated/predeployment database.

do $$
declare v text; n integer;
begin
  -- Canonical objects and RLS.
  if (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('assessment_types','assessments','assessment_learning_objectives','student_scores')
        and c.relkind='r') <> 4 then raise exception 'B6 canonical table set is incomplete'; end if;
  if exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('assessment_types','assessments','assessment_learning_objectives','student_scores') and not c.relrowsecurity)
    then raise exception 'B6 RLS is not enabled on every protected table'; end if;

  -- Foundation constraints: score range, lifecycle, and one row per student.
  select pg_get_constraintdef(oid) into v from pg_catalog.pg_constraint where conname='assessments_score_range_check';
  if v is null or v not ilike '%max_score > min_score%' then raise exception 'Assessment score range CHECK missing'; end if;
  select pg_get_constraintdef(oid) into v from pg_catalog.pg_constraint where conrelid='public.assessments'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%published%archived%';
  if v is null then raise exception 'Assessment lifecycle CHECK missing'; end if;
  select pg_get_constraintdef(oid) into v from pg_catalog.pg_constraint where conname='student_scores_assessment_student_key';
  if v is null or v not ilike '%assessment_id%student_enrollment_id%' then raise exception 'Student score uniqueness missing'; end if;
  select pg_get_constraintdef(oid) into v from pg_catalog.pg_constraint where conrelid='public.student_scores'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%missing%submitted%excused%final%';
  if v is null then raise exception 'Student score lifecycle CHECK missing'; end if;

  -- Required composite tenant FKs.
  foreach v in array array['assessments_year_fk','assessments_term_fk','assessments_teaching_fk','assessments_type_fk','student_scores_assessment_fk','student_scores_enrollment_fk'] loop
    if not exists(select 1 from pg_catalog.pg_constraint where conname=v and contype='f') then raise exception 'Required B6 FK missing: %',v; end if;
  end loop;

  -- Hardened functions: modes and material protections (removal must fail this validator).
  foreach v in array array['validate_assessment_consistency','validate_student_score','can_access_assessment','validate_assessment_learning_objective'] loop
    if not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v and p.prosecdef)
      then raise exception 'Required SECURITY DEFINER function missing: %',v; end if;
  end loop;
  foreach v in array array['guard_assessment_transition','guard_student_score_update'] loop
    if not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v and not p.prosecdef)
      then raise exception 'Required SECURITY INVOKER guard missing: %',v; end if;
  end loop;
  select pg_get_functiondef('public.validate_student_score()'::regprocedure) into v;
  if v not ilike '%class_enrollments%' or v not ilike '%assessment_date%' or v not ilike '%score.update_locked%' or v not ilike '%auth.uid()%' then
    raise exception 'Score range, roster binding, locked insert, or trusted attribution guard missing'; end if;
  select pg_get_functiondef('public.validate_assessment_consistency()'::regprocedure) into v;
  if v not ilike '%teaching_assignments%' or v not ilike '%terms%' or v not ilike '%assessment_types%' or v not ilike '%auth.uid()%' then
    raise exception 'Assessment context or trusted creator validation missing'; end if;
  select pg_get_functiondef('public.guard_assessment_transition()'::regprocedure) into v;
  if v not ilike '%draft%open%' or v not ilike '%open%closed%' or v not ilike '%closed%published%' or v not ilike '%assessment.publish%' or v not ilike '%assessment.archive_own%' then
    raise exception 'Assessment lifecycle transition/permission guard incomplete'; end if;
  select pg_get_functiondef('public.can_access_assessment(text,uuid)'::regprocedure) into v;
  if v not ilike '%class_enrollments%' or v not ilike '%students%' or v not ilike '%a.status = ''published''%' then raise exception 'Published RELATED assessment access is not roster-bound'; end if;

  -- Required triggers, including the pre-existing shared audit framework.
  foreach v in array array['trg_assessments_consistency','trg_assessments_workflow_guard','trg_student_scores_validate','trg_student_scores_update_guard','trg_assessment_learning_objectives_validate','audit_assessments','audit_student_scores'] loop
    if not exists(select 1 from pg_catalog.pg_trigger where tgname=v and not tgisinternal) then raise exception 'Required B6 trigger missing: %',v; end if;
  end loop;

  -- Exact policy surface; no DELETE/ALL on historical assessment/score rows.
  foreach v in array array['assessment_types_select','assessment_types_insert','assessment_types_update','assessments_select','assessments_insert','assessments_update','student_scores_select','student_scores_insert','student_scores_update'] loop
    if not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and policyname=v) then raise exception 'Required B6 policy missing: %',v; end if;
  end loop;
  if exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename in ('assessments','student_scores') and cmd in ('DELETE','ALL'))
    then raise exception 'Forbidden DELETE/ALL assessment policy exists'; end if;
  select count(*) into n from pg_catalog.pg_policies where schemaname='public' and tablename='assessments';
  if n <> 3 then raise exception 'Unexpected assessments policy count: %',n; end if;
  select count(*) into n from pg_catalog.pg_policies where schemaname='public' and tablename='student_scores';
  if n <> 3 then raise exception 'Unexpected student_scores policy count: %',n; end if;

  foreach v in array array['assessment.read','assessment.create','assessment.update_own','assessment.publish','assessment.archive_own','score.read','score.enter','score.update_open','score.update_locked','score.export'] loop
    if not exists(select 1 from public.permissions where code=v) then raise exception 'B6 permission missing: %',v; end if;
  end loop;
end $$;

select 'B6 assessment validation passed' as result;
