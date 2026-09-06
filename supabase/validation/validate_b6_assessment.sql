-- EduSmart Core V1 / Batch 6 Assessment: security and integrity validator.
-- Run after the pending B6 migration in an isolated/predeployment database.

do $$
declare v text; q text; c text; n integer;
begin
  if (select count(*) from pg_catalog.pg_class pc join pg_catalog.pg_namespace pn on pn.oid=pc.relnamespace
      where pn.nspname='public' and pc.relname in ('assessment_types','assessments','assessment_learning_objectives','student_scores')
        and pc.relkind='r') <> 4 then raise exception 'B6 canonical table set is incomplete'; end if;
  if exists (select 1 from pg_catalog.pg_class pc join pg_catalog.pg_namespace pn on pn.oid=pc.relnamespace
      where pn.nspname='public' and pc.relname in ('assessment_types','assessments','assessment_learning_objectives','student_scores')
        and not pc.relrowsecurity) then raise exception 'B6 RLS is not enabled on every protected table'; end if;

  select lower(pg_get_constraintdef(oid)) into v from pg_catalog.pg_constraint
  where conrelid='public.assessments'::regclass and conname='assessments_score_range_check';
  if v is null or v not like '%max_score > min_score%' then raise exception 'Assessment score range CHECK missing'; end if;
  select lower(pg_get_constraintdef(oid)) into v from pg_catalog.pg_constraint
  where conrelid='public.assessments'::regclass and contype='c' and lower(pg_get_constraintdef(oid)) like '%published%archived%';
  if v is null then raise exception 'Assessment lifecycle CHECK missing'; end if;
  select lower(pg_get_constraintdef(oid)) into v from pg_catalog.pg_constraint
  where conrelid='public.student_scores'::regclass and conname='student_scores_assessment_student_key';
  if v is null or v not like '%assessment_id%student_enrollment_id%' then raise exception 'Student score uniqueness missing'; end if;
  select lower(pg_get_constraintdef(oid)) into v from pg_catalog.pg_constraint
  where conrelid='public.student_scores'::regclass and contype='c'
    and lower(pg_get_constraintdef(oid)) like '%missing%submitted%excused%final%';
  if v is null then raise exception 'Student score status CHECK missing'; end if;
  foreach v in array array['assessments_year_fk','assessments_term_fk','assessments_teaching_fk','assessments_type_fk',
    'student_scores_assessment_fk','student_scores_enrollment_fk'] loop
    if not exists(select 1 from pg_catalog.pg_constraint where conname=v and contype='f')
      then raise exception 'Required B6 FK missing: %',v; end if;
  end loop;

  select lower(regexp_replace(regexp_replace(pg_get_functiondef('public.can_manage_assessment_context(text,uuid,uuid,uuid,uuid,uuid)'::regprocedure),
    '--[^'||chr(10)||chr(13)||']*',' ','g'),'[[:space:]]+',' ','g')) into v;
  foreach c in array array['security definer','set search_path to ''''','ta.id = p_teaching_assignment_id',
    'ta.organization_id = p_organization_id','ta.school_id = p_school_id','ta.academic_year_id = p_academic_year_id',
    'ta.term_id is not distinct from p_term_id','public.has_permission(','p_permission_code','ta.classroom_id',
    'sm.profile_id','sm.profile_id = auth.uid()','ta.status = ''active''','ssa.status = ''active''',
    'public.has_staff_scope_permission('] loop
    if position(c in v)=0 then raise exception 'Assessment context helper semantic missing: %',c; end if;
  end loop;

  select lower(regexp_replace(regexp_replace(pg_get_functiondef('public.validate_assessment_consistency()'::regprocedure),
    '--[^'||chr(10)||chr(13)||']*',' ','g'),'[[:space:]]+',' ','g')) into v;
  foreach c in array array['security definer','set search_path to ''''','ta.id = new.teaching_assignment_id',
    'ta.organization_id = new.organization_id','ta.school_id = new.school_id','ta.academic_year_id = new.academic_year_id',
    'ta.term_id is not distinct from new.term_id','old.teaching_assignment_id is distinct from new.teaching_assignment_id',
    'tg_op = ''insert'' and v_assignment.status <> ''active''','v_assignment.status <> ''active''',
    't.id = new.term_id','t.organization_id = new.organization_id',
    't.school_id = new.school_id','t.academic_year_id = new.academic_year_id',
    'new.assessment_date < v_term.starts_on','new.assessment_date > v_term.ends_on',
    'at.id = new.assessment_type_id','at.organization_id = new.organization_id','at.school_id = new.school_id',
    'tg_op = ''insert'' and not v_type_active','old.assessment_type_id is distinct from new.assessment_type_id','not v_type_active',
    'new.created_by_profile_id := auth.uid()','old.created_by_profile_id is distinct from new.created_by_profile_id'] loop
    if position(c in v)=0 then raise exception 'Assessment consistency semantic missing: %',c; end if;
  end loop;

  select lower(regexp_replace(regexp_replace(pg_get_functiondef('public.validate_student_score()'::regprocedure),
    '--[^'||chr(10)||chr(13)||']*',' ','g'),'[[:space:]]+',' ','g')) into v;
  foreach c in array array['a.id = new.assessment_id','a.organization_id = new.organization_id','a.school_id = new.school_id',
    'se.id = new.student_enrollment_id','se.organization_id = new.organization_id','se.school_id = new.school_id',
    'se.academic_year_id = v_assessment.academic_year_id','se.enrolled_on <= v_assessment.assessment_date',
    'se.ended_on >= v_assessment.assessment_date','ce.student_enrollment_id = se.id',
    'ce.organization_id = se.organization_id','ce.school_id = se.school_id','ce.classroom_id = v_classroom_id',
    'ce.is_primary','ce.starts_on <= v_assessment.assessment_date','ce.ends_on >= v_assessment.assessment_date',
    'new.score < v_assessment.min_score','new.score > v_assessment.max_score',
    'new.status in (''missing'',''excused'') and new.score is not null',
    'new.status in (''submitted'',''final'') and new.score is null',
    'new.entered_by_profile_id := auth.uid()','new.updated_by_profile_id := auth.uid()',
    'old.entered_by_profile_id','old.student_enrollment_id','score.update_locked'] loop
    if position(c in v)=0 then raise exception 'Student score validation semantic missing: %',c; end if;
  end loop;

  select lower(regexp_replace(regexp_replace(pg_get_functiondef('public.guard_student_score_update()'::regprocedure),
    '--[^'||chr(10)||chr(13)||']*',' ','g'),'[[:space:]]+',' ','g')) into v;
  foreach c in array array['security invoker','old.status = ''final'' or v_assessment.status in (''published'',''archived'')',
    'not public.has_permission(''score.update_locked'', old.organization_id, old.school_id, v_classroom_id)',
    'v_assessment.status not in (''draft'',''open'',''closed'')'] loop
    if position(c in v)=0 then raise exception 'Locked score guard semantic missing: %',c; end if;
  end loop;

  select lower(regexp_replace(regexp_replace(pg_get_functiondef('public.guard_assessment_transition()'::regprocedure),
    '--[^'||chr(10)||chr(13)||']*',' ','g'),'[[:space:]]+',' ','g')) into v;
  foreach c in array array['security invoker','old.status = ''draft'' and new.status = ''open''',
    'old.status = ''open'' and new.status = ''closed''','old.status = ''closed'' and new.status = ''published''',
    'old.status in (''draft'',''open'',''closed'',''published'') and new.status = ''archived''',
    'new.status = ''published'' and not public.has_permission(''assessment.publish''',
    'new.status = ''archived'' and not (public.has_permission(''assessment.archive_own''',
    'old.created_by_profile_id = auth.uid()','public.has_staff_scope_permission(''assessment.archive_own'''] loop
    if position(c in v)=0 then raise exception 'Assessment lifecycle semantic missing: %',c; end if;
  end loop;

  select lower(regexp_replace(regexp_replace(pg_get_functiondef('public.can_access_assessment(text,uuid)'::regprocedure),
    '--[^'||chr(10)||chr(13)||']*',' ','g'),'[[:space:]]+',' ','g')) into v;
  foreach c in array array['a.id = p_assessment_id','p_permission_code = ''assessment.read''','a.status = ''published''',
    'se.organization_id = a.organization_id','se.school_id = a.school_id','se.academic_year_id = a.academic_year_id',
    'ce.classroom_id = ta.classroom_id','ce.is_primary','se.enrolled_on <= a.assessment_date',
    'ce.starts_on <= a.assessment_date','st.profile_id','st.id'] loop
    if position(c in v)=0 then raise exception 'RELATED Assessment binding semantic missing: %',c; end if;
  end loop;

  select lower(regexp_replace(regexp_replace(pg_get_functiondef('public.validate_assessment_learning_objective()'::regprocedure),
    '--[^'||chr(10)||chr(13)||']*',' ','g'),'[[:space:]]+',' ','g')) into v;
  foreach c in array array['a.id = new.assessment_id','lo.id = new.learning_objective_id',
    'lo.organization_id = a.organization_id','lo.school_id = a.school_id',
    'outcome.organization_id = lo.organization_id','outcome.school_id = lo.school_id',
    'outcome.subject_id = ta.subject_id'] loop
    if position(c in v)=0 then raise exception 'Objective binding semantic missing: %',c; end if;
  end loop;

  select lower(regexp_replace(coalesce(qual,''),'[[:space:]]+',' ','g')) into q
  from pg_catalog.pg_policies where schemaname='public' and tablename='assessments'
    and policyname='assessments_select' and cmd='SELECT';
  foreach v in array array['has_staff_scope_permission','assessment.read','status','published','can_access_assessment'] loop
    if q is null or position(v in q)=0 then raise exception 'assessments_select semantic missing: %',v; end if;
  end loop;

  select lower(regexp_replace(coalesce(with_check,''),'[[:space:]]+',' ','g')) into c
  from pg_catalog.pg_policies where schemaname='public' and tablename='assessments'
    and policyname='assessments_insert' and cmd='INSERT';
  foreach v in array array['status','draft','open','can_manage_assessment_context','assessment.create','organization_id',
    'school_id','academic_year_id','term_id','teaching_assignment_id'] loop
    if c is null or position(v in c)=0 then raise exception 'assessments_insert WITH CHECK missing: %',v; end if;
  end loop;

  select lower(regexp_replace(coalesce(qual,''),'[[:space:]]+',' ','g')),
         lower(regexp_replace(coalesce(with_check,''),'[[:space:]]+',' ','g')) into q,c
  from pg_catalog.pg_policies where schemaname='public' and tablename='assessments'
    and policyname='assessments_update' and cmd='UPDATE';
  foreach v in array array['can_access_assessment','assessment.update_own','created_by_profile_id','auth.uid()'] loop
    if q is null or position(v in q)=0 then raise exception 'assessments_update USING missing: %',v; end if;
  end loop;
  foreach v in array array['can_manage_assessment_context','assessment.update_own','organization_id','school_id',
    'academic_year_id','term_id','teaching_assignment_id','created_by_profile_id','auth.uid()'] loop
    if c is null or position(v in c)=0 then raise exception 'assessments_update NEW-row check missing: %',v; end if;
  end loop;
  if position('can_access_assessment' in c)>0 then raise exception 'assessments_update WITH CHECK reverted to ID-only authorization'; end if;

  select lower(regexp_replace(coalesce(qual,''),'[[:space:]]+',' ','g')) into q
  from pg_catalog.pg_policies where schemaname='public' and tablename='student_scores'
    and policyname='student_scores_select' and cmd='SELECT';
  foreach v in array array['has_staff_scope_permission','score.read','status','published','has_permission',
    'student_enrollment_id','students','profile_id','st.id','classroom_id'] loop
    if q is null or position(v in q)=0 then raise exception 'student_scores_select semantic missing: %',v; end if;
  end loop;

  select lower(regexp_replace(coalesce(with_check,''),'[[:space:]]+',' ','g')) into c
  from pg_catalog.pg_policies where schemaname='public' and tablename='student_scores'
    and policyname='student_scores_insert' and cmd='INSERT';
  foreach v in array array['assessments','assessment_id','owns_teaching_assignment','can_access_teaching_assignment',
    'score.enter','teaching_assignment_id','organization_id','school_id'] loop
    if c is null or position(v in c)=0 then raise exception 'student_scores_insert semantic missing: %',v; end if;
  end loop;

  select lower(regexp_replace(coalesce(qual,''),'[[:space:]]+',' ','g')),
         lower(regexp_replace(coalesce(with_check,''),'[[:space:]]+',' ','g')) into q,c
  from pg_catalog.pg_policies where schemaname='public' and tablename='student_scores'
    and policyname='student_scores_update' and cmd='UPDATE';
  foreach v in array array['assessments','assessment_id','draft','open','closed','owns_teaching_assignment',
    'can_access_teaching_assignment','score.update_open','score.update_locked','organization_id','school_id'] loop
    if q is null or position(v in q)=0 or c is null or position(v in c)=0
      then raise exception 'student_scores_update semantic missing from USING/WITH CHECK: %',v; end if;
  end loop;

  foreach v in array array['assessment_types_select','assessment_types_insert','assessment_types_update','assessments_select',
    'assessments_insert','assessments_update','student_scores_select','student_scores_insert','student_scores_update'] loop
    if not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and policyname=v)
      then raise exception 'Required B6 policy missing: %',v; end if;
  end loop;
  if exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename in ('assessments','student_scores')
      and cmd in ('DELETE','ALL')) then raise exception 'Forbidden DELETE/ALL Assessment policy exists'; end if;
  select count(*) into n from pg_catalog.pg_policies where schemaname='public' and tablename='assessments';
  if n <> 3 then raise exception 'Unexpected assessments policy count: %',n; end if;
  select count(*) into n from pg_catalog.pg_policies where schemaname='public' and tablename='student_scores';
  if n <> 3 then raise exception 'Unexpected student_scores policy count: %',n; end if;

  if not exists(select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
    where t.tgrelid='public.assessments'::regclass and t.tgname='trg_assessments_consistency'
      and p.proname='validate_assessment_consistency' and (t.tgtype & 2)=2 and (t.tgtype & 4)=4
      and (t.tgtype & 16)=16 and not t.tgisinternal) then raise exception 'Assessment consistency trigger wiring invalid'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
    where t.tgrelid='public.assessments'::regclass and t.tgname='trg_assessments_workflow_guard'
      and p.proname='guard_assessment_transition' and (t.tgtype & 2)=2 and (t.tgtype & 16)=16
      and not t.tgisinternal) then raise exception 'Assessment workflow trigger wiring invalid'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
    where t.tgrelid='public.student_scores'::regclass and t.tgname='trg_student_scores_validate'
      and p.proname='validate_student_score' and (t.tgtype & 2)=2 and (t.tgtype & 4)=4
      and (t.tgtype & 16)=16 and not t.tgisinternal) then raise exception 'Student score validation trigger wiring invalid'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
    where t.tgrelid='public.student_scores'::regclass and t.tgname='trg_student_scores_update_guard'
      and p.proname='guard_student_score_update' and (t.tgtype & 2)=2 and (t.tgtype & 16)=16
      and not t.tgisinternal) then raise exception 'Student score lock trigger wiring invalid'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
    where t.tgrelid='public.assessment_learning_objectives'::regclass and t.tgname='trg_assessment_learning_objectives_validate'
      and p.proname='validate_assessment_learning_objective' and (t.tgtype & 2)=2 and (t.tgtype & 4)=4
      and (t.tgtype & 16)=16 and not t.tgisinternal) then raise exception 'Objective validation trigger wiring invalid'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
    where t.tgrelid='public.assessments'::regclass and t.tgname='audit_assessments' and p.proname='audit_row_change'
      and (t.tgtype & 2)=0 and (t.tgtype & 4)=4 and (t.tgtype & 16)=16
      and not t.tgisinternal) then raise exception 'Assessment audit trigger wiring invalid'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
    where t.tgrelid='public.student_scores'::regclass and t.tgname='audit_student_scores' and p.proname='audit_row_change'
      and (t.tgtype & 2)=0 and (t.tgtype & 4)=4 and (t.tgtype & 16)=16
      and not t.tgisinternal) then raise exception 'Student score audit trigger wiring invalid'; end if;

  foreach v in array array['assessment.read','assessment.create','assessment.update_own','assessment.publish',
    'assessment.archive_own','score.read','score.enter','score.update_open','score.update_locked','score.export'] loop
    if not exists(select 1 from public.permissions where code=v) then raise exception 'B6 permission missing: %',v; end if;
  end loop;
end $$;

select 'B6 assessment validation passed' as result;
