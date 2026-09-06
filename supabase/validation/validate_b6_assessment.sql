-- EduSmart Core V1 / Batch 6 Assessment: exact release-contract validator.
-- Shadow policies let PostgreSQL produce canonical expressions for comparison.
-- Function hashes are MD5 of the reviewed migration's pg_proc.prosrc body after
-- lowercasing, removing line comments, and removing all whitespace.

create temporary table b6_expected_assessments (like public.assessments including all);
create temporary table b6_expected_student_scores (like public.student_scores including all);

create policy expected_assessments_select
on b6_expected_assessments for select to authenticated
using (
  exists (
    select 1 from public.teaching_assignments ta
    where ta.id = b6_expected_assessments.teaching_assignment_id
      and (
        public.has_staff_scope_permission('assessment.read', b6_expected_assessments.organization_id, b6_expected_assessments.school_id, ta.classroom_id)
        or (b6_expected_assessments.status = 'published' and public.can_access_assessment('assessment.read', b6_expected_assessments.id))
      )
  )
);

create policy expected_assessments_insert
on b6_expected_assessments for insert to authenticated
with check (
  status in ('draft','open')
  and public.can_manage_assessment_context(
    'assessment.create', organization_id, school_id, academic_year_id, term_id,
    teaching_assignment_id
  )
);

create policy expected_assessments_update
on b6_expected_assessments for update to authenticated
using (
  public.can_access_assessment('assessment.update_own', id)
  and (
    created_by_profile_id = auth.uid()
    or public.has_permission('assessment.update_own', organization_id, school_id)
  )
)
with check (
  public.can_manage_assessment_update_context(
    'assessment.update_own', id, organization_id, school_id, academic_year_id,
    term_id, teaching_assignment_id
  )
  and (
    created_by_profile_id = auth.uid()
    or public.has_permission('assessment.update_own', organization_id, school_id)
  )
);

create policy expected_student_scores_select
on b6_expected_student_scores for select to authenticated
using (
  exists (
    select 1
    from public.assessments a
    join public.teaching_assignments ta on ta.id = a.teaching_assignment_id
    join public.student_enrollments se on se.id = b6_expected_student_scores.student_enrollment_id
    join public.students st on st.id = se.student_id
    where a.id = b6_expected_student_scores.assessment_id
      and (
        public.has_staff_scope_permission(
          'score.read',
          b6_expected_student_scores.organization_id,
          b6_expected_student_scores.school_id,
          ta.classroom_id
        )
        or (
          a.status = 'published'
          and public.has_permission(
            'score.read',
            b6_expected_student_scores.organization_id,
            b6_expected_student_scores.school_id,
            ta.classroom_id,
            st.profile_id,
            st.id
          )
        )
      )
  )
);

create policy expected_student_scores_insert
on b6_expected_student_scores for insert to authenticated
with check (exists (
  select 1
  from public.assessments a
  where a.id = b6_expected_student_scores.assessment_id
    and (
      (public.owns_teaching_assignment(a.teaching_assignment_id)
       and public.can_access_teaching_assignment('score.enter', a.teaching_assignment_id))
      or public.has_permission('score.enter', b6_expected_student_scores.organization_id, b6_expected_student_scores.school_id)
    )
));

create policy expected_student_scores_update
on b6_expected_student_scores for update to authenticated
using (exists (
  select 1
  from public.assessments a
  where a.id = b6_expected_student_scores.assessment_id
    and (
      (a.status in ('draft','open','closed')
       and public.owns_teaching_assignment(a.teaching_assignment_id)
       and public.can_access_teaching_assignment('score.update_open', a.teaching_assignment_id))
      or public.has_permission('score.update_locked', b6_expected_student_scores.organization_id, b6_expected_student_scores.school_id)
    )
))
with check (exists (
  select 1
  from public.assessments a
  where a.id = b6_expected_student_scores.assessment_id
    and (
      (a.status in ('draft','open','closed')
       and public.owns_teaching_assignment(a.teaching_assignment_id)
       and public.can_access_teaching_assignment('score.update_open', a.teaching_assignment_id))
      or public.has_permission('score.update_locked', b6_expected_student_scores.organization_id, b6_expected_student_scores.school_id)
    )
));

do $$
declare
  v_name text;
  v_expected_name text;
  v_table regclass;
  v_expected_table regclass;
  v_actual pg_catalog.pg_policy%rowtype;
  v_expected pg_catalog.pg_policy%rowtype;
  v_hash text;
  v_expected_hash text;
  v_actual_qual text;
  v_expected_qual text;
  v_actual_check text;
  v_expected_check text;
  v_oid oid;
  n integer;
begin
  if exists (
    select 1 from pg_catalog.pg_class c
    where c.oid in ('public.assessment_types'::regclass, 'public.assessments'::regclass,
      'public.assessment_learning_objectives'::regclass, 'public.student_scores'::regclass)
      and not c.relrowsecurity
  ) then raise exception 'B6 RLS is not enabled on every protected table'; end if;

  select count(*) into n from pg_catalog.pg_policy where polrelid='public.assessments'::regclass;
  if n <> 3 then raise exception 'Unexpected assessments policy count: %',n; end if;
  select count(*) into n from pg_catalog.pg_policy where polrelid='public.student_scores'::regclass;
  if n <> 3 then raise exception 'Unexpected student_scores policy count: %',n; end if;
  if exists (
    select 1 from pg_catalog.pg_policy
    where polrelid in ('public.assessments'::regclass,'public.student_scores'::regclass)
      and polcmd in ('d','*')
  ) then raise exception 'Forbidden DELETE/ALL Assessment policy exists'; end if;

  for v_name, v_expected_name, v_table, v_expected_table in
    values
      ('assessments_select','expected_assessments_select','public.assessments'::regclass,'b6_expected_assessments'::regclass),
      ('assessments_insert','expected_assessments_insert','public.assessments'::regclass,'b6_expected_assessments'::regclass),
      ('assessments_update','expected_assessments_update','public.assessments'::regclass,'b6_expected_assessments'::regclass),
      ('student_scores_select','expected_student_scores_select','public.student_scores'::regclass,'b6_expected_student_scores'::regclass),
      ('student_scores_insert','expected_student_scores_insert','public.student_scores'::regclass,'b6_expected_student_scores'::regclass),
      ('student_scores_update','expected_student_scores_update','public.student_scores'::regclass,'b6_expected_student_scores'::regclass)
  loop
    select * into v_actual from pg_catalog.pg_policy where polrelid=v_table and polname=v_name;
    select * into v_expected from pg_catalog.pg_policy where polrelid=v_expected_table and polname=v_expected_name;
    if not found or v_actual.oid is null then raise exception 'Required policy missing: %',v_name; end if;
    v_actual_qual := regexp_replace(lower(coalesce(pg_get_expr(v_actual.polqual, v_actual.polrelid), '')),
      '[[:space:]]', '', 'g');
    v_expected_qual := regexp_replace(lower(coalesce(pg_get_expr(v_expected.polqual, v_expected.polrelid), '')),
      '[[:space:]]', '', 'g');
    v_actual_check := regexp_replace(lower(coalesce(pg_get_expr(v_actual.polwithcheck, v_actual.polrelid), '')),
      '[[:space:]]', '', 'g');
    v_expected_check := regexp_replace(lower(coalesce(pg_get_expr(v_expected.polwithcheck, v_expected.polrelid), '')),
      '[[:space:]]', '', 'g');
    v_expected_qual := replace(replace(v_expected_qual, 'b6_expected_assessments', 'assessments'),
      'b6_expected_student_scores', 'student_scores');
    v_expected_check := replace(replace(v_expected_check, 'b6_expected_assessments', 'assessments'),
      'b6_expected_student_scores', 'student_scores');
    if v_actual.polcmd is distinct from v_expected.polcmd
       or v_actual.polpermissive is distinct from v_expected.polpermissive
       or v_actual.polroles is distinct from v_expected.polroles
       or v_actual_qual is distinct from v_expected_qual
       or v_actual_check is distinct from v_expected_check
    then raise exception 'Policy definition differs from reviewed B6 contract: %',v_name; end if;
  end loop;

  foreach v_name in array array[
    'assessments_year_fk','assessments_term_fk','assessments_teaching_fk','assessments_type_fk',
    'student_scores_assessment_fk','student_scores_enrollment_fk'
  ] loop
    if not exists(select 1 from pg_catalog.pg_constraint where conname=v_name and contype='f')
      then raise exception 'Required B6 FK missing: %',v_name; end if;
  end loop;
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.assessments'::regclass
      and conname='assessments_score_range_check' and pg_get_constraintdef(oid) ilike '%max_score > min_score%')
    then raise exception 'Assessment score range CHECK missing'; end if;
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.student_scores'::regclass
      and conname='student_scores_assessment_student_key' and contype='u')
    then raise exception 'Student score uniqueness missing'; end if;

  for v_oid, v_expected_hash in
    values
      ('public.validate_assessment_consistency()'::regprocedure::oid, '746ebe6a381c3f7798fec59b57eec6b2'),
      ('public.can_manage_assessment_context(text,uuid,uuid,uuid,uuid,uuid)'::regprocedure::oid, '6e0dd01c5deff9ae25501055889417fe'),
      ('public.can_manage_assessment_update_context(text,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure::oid, '1d7eaf78d2bae7552b7ffcd244aea115'),
      ('public.guard_assessment_transition()'::regprocedure::oid, '2e047334b2a609911a1a33f9e4e7fca3'),
      ('public.validate_student_score()'::regprocedure::oid, 'aacd1112bd6f0fa5939fda80304374a8'),
      ('public.guard_student_score_update()'::regprocedure::oid, '33c3312902e92527ae10bb0e7f12e637'),
      ('public.can_access_assessment(text,uuid)'::regprocedure::oid, '637d7904c46fd9db3c6ceaa4c7f1651a'),
      ('public.validate_assessment_learning_objective()'::regprocedure::oid, '1a3d9e985768a4c3539fce2bcc1418de')
  loop
    select md5(regexp_replace(lower(regexp_replace(p.prosrc, '--[^'||chr(10)||chr(13)||']*', ' ', 'g')),
      '[[:space:]]', '', 'g')) into v_hash
    from pg_catalog.pg_proc p where p.oid=v_oid;
    if v_hash is distinct from v_expected_hash then
      raise exception 'Function body differs from reviewed B6 contract: %',v_oid::regprocedure;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_proc p
      where p.oid=v_oid
        and pg_get_functiondef(p.oid) ilike '%SET search_path TO ''''%'
    ) then raise exception 'Function search_path differs from reviewed B6 contract: %',v_oid::regprocedure; end if;
  end loop;

  if not (select prosecdef from pg_catalog.pg_proc where oid='public.validate_assessment_consistency()'::regprocedure)
     or not (select prosecdef from pg_catalog.pg_proc where oid='public.can_manage_assessment_context(text,uuid,uuid,uuid,uuid,uuid)'::regprocedure)
     or not (select prosecdef from pg_catalog.pg_proc where oid='public.can_manage_assessment_update_context(text,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure)
     or not (select prosecdef from pg_catalog.pg_proc where oid='public.validate_student_score()'::regprocedure)
     or not (select prosecdef from pg_catalog.pg_proc where oid='public.can_access_assessment(text,uuid)'::regprocedure)
     or not (select prosecdef from pg_catalog.pg_proc where oid='public.validate_assessment_learning_objective()'::regprocedure)
  then raise exception 'Required SECURITY DEFINER mode missing'; end if;
  if (select prosecdef from pg_catalog.pg_proc where oid='public.guard_assessment_transition()'::regprocedure)
     or (select prosecdef from pg_catalog.pg_proc where oid='public.guard_student_score_update()'::regprocedure)
  then raise exception 'Required SECURITY INVOKER mode missing'; end if;
  if exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang
    where p.oid in (
      'public.can_manage_assessment_context(text,uuid,uuid,uuid,uuid,uuid)'::regprocedure,
      'public.can_manage_assessment_update_context(text,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure,
      'public.can_access_assessment(text,uuid)'::regprocedure
    ) and (l.lanname <> 'sql' or p.provolatile <> 's' or p.prorettype <> 'boolean'::regtype)
  ) then raise exception 'SQL helper language/volatility/return contract differs'; end if;
  if exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang
    where p.oid in (
      'public.validate_assessment_consistency()'::regprocedure,
      'public.guard_assessment_transition()'::regprocedure,
      'public.validate_student_score()'::regprocedure,
      'public.guard_student_score_update()'::regprocedure,
      'public.validate_assessment_learning_objective()'::regprocedure
    ) and (l.lanname <> 'plpgsql' or p.provolatile <> 'v' or p.prorettype <> 'trigger'::regtype)
  ) then raise exception 'Trigger function language/volatility/return contract differs'; end if;

  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.assessments'::regclass
      and tgname='trg_assessments_consistency' and tgfoid='public.validate_assessment_consistency()'::regprocedure
      and tgtype=23 and tgenabled='O' and not tgisinternal)
    then raise exception 'Assessment consistency trigger identity invalid'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.assessments'::regclass
      and tgname='trg_assessments_workflow_guard' and tgfoid='public.guard_assessment_transition()'::regprocedure
      and tgtype=19 and tgenabled='O' and not tgisinternal)
    then raise exception 'Assessment lifecycle trigger identity invalid'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.student_scores'::regclass
      and tgname='trg_student_scores_validate' and tgfoid='public.validate_student_score()'::regprocedure
      and tgtype=23 and tgenabled='O' and not tgisinternal)
    then raise exception 'Student score validation trigger identity invalid'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.student_scores'::regclass
      and tgname='trg_student_scores_update_guard' and tgfoid='public.guard_student_score_update()'::regprocedure
      and tgtype=19 and tgenabled='O' and not tgisinternal)
    then raise exception 'Student score lock trigger identity invalid'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.assessment_learning_objectives'::regclass
      and tgname='trg_assessment_learning_objectives_validate'
      and tgfoid='public.validate_assessment_learning_objective()'::regprocedure
      and tgtype=23 and tgenabled='O' and not tgisinternal)
    then raise exception 'Objective validation trigger identity invalid'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.assessments'::regclass
      and tgname='audit_assessments' and tgfoid='public.audit_row_change()'::regprocedure
      and tgtype=21 and tgenabled='O' and not tgisinternal)
    then raise exception 'Assessment audit trigger identity invalid'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.student_scores'::regclass
      and tgname='audit_student_scores' and tgfoid='public.audit_row_change()'::regprocedure
      and tgtype=29 and tgenabled='O' and not tgisinternal)
    then raise exception 'Student score audit trigger identity invalid'; end if;

  foreach v_name in array array['assessment.read','assessment.create','assessment.update_own','assessment.publish',
    'assessment.archive_own','score.read','score.enter','score.update_open','score.update_locked','score.export'] loop
    if not exists(select 1 from public.permissions where code=v_name)
      then raise exception 'B6 permission missing: %',v_name; end if;
  end loop;
end $$;

select 'B6 assessment validation passed' as result;
