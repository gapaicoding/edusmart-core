-- EduSmart Core V1 / Batch 6 Assessment
-- Harden the existing canonical Assessment model without adding parallel tables.

create or replace function public.validate_assessment_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.teaching_assignments%rowtype;
  v_term public.terms%rowtype;
begin
  select ta.* into v_assignment
  from public.teaching_assignments ta
  where ta.id = new.teaching_assignment_id
    and ta.organization_id = new.organization_id
    and ta.school_id = new.school_id
    and ta.academic_year_id = new.academic_year_id
    and ta.term_id is not distinct from new.term_id;
  if not found then
    raise exception using errcode = '23514', message = 'Assessment TeachingAssignment is outside the selected academic context';
  end if;

  if tg_op = 'INSERT' and v_assignment.status <> 'active' then
    raise exception using errcode = '23514', message = 'Assessment requires an active TeachingAssignment';
  end if;

  select t.* into v_term from public.terms t
  where t.id = new.term_id and t.organization_id = new.organization_id
    and t.school_id = new.school_id and t.academic_year_id = new.academic_year_id;
  if not found then
    raise exception using errcode = '23514', message = 'Assessment term is outside the selected academic context';
  end if;
  if new.assessment_date < v_term.starts_on or new.assessment_date > v_term.ends_on then
    raise exception using errcode = '23514', message = 'Assessment date must fall within the selected term';
  end if;

  if not exists (select 1 from public.assessment_types at where at.id = new.assessment_type_id
    and at.organization_id = new.organization_id and at.school_id = new.school_id) then
    raise exception using errcode = '23514', message = 'Assessment type is outside the selected school';
  end if;

  if nullif(pg_catalog.btrim(new.title), '') is null then
    raise exception using errcode = '23514', message = 'Assessment title is required';
  end if;
  if new.max_score <= new.min_score then
    raise exception using errcode = '23514', message = 'Assessment score range is invalid';
  end if;

  if tg_op = 'INSERT' then
    new.created_by_profile_id := auth.uid();
  elsif old.status <> 'draft' and
    (old.organization_id, old.school_id, old.academic_year_id, old.term_id,
     old.teaching_assignment_id, old.assessment_type_id, old.assessment_date,
     old.min_score, old.max_score, old.created_by_profile_id, old.created_at)
    is distinct from
    (new.organization_id, new.school_id, new.academic_year_id, new.term_id,
     new.teaching_assignment_id, new.assessment_type_id, new.assessment_date,
     new.min_score, new.max_score, new.created_by_profile_id, new.created_at)
  then
    raise exception using errcode = '23514', message = 'Open or historical Assessment context is immutable';
  elsif tg_op = 'UPDATE' and old.created_by_profile_id is distinct from new.created_by_profile_id then
    raise exception using errcode = '23514', message = 'Assessment creator attribution is immutable';
  end if;
  return new;
end
$$;

create trigger trg_assessments_consistency before insert or update on public.assessments
for each row execute function public.validate_assessment_consistency();

create or replace function public.guard_assessment_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare v_classroom_id uuid;
begin
  if old.status is not distinct from new.status then return new; end if;
  select ta.classroom_id into v_classroom_id from public.teaching_assignments ta where ta.id = old.teaching_assignment_id;
  if not ((old.status = 'draft' and new.status = 'open') or
          (old.status = 'open' and new.status = 'closed') or
          (old.status = 'closed' and new.status = 'published') or
          (old.status in ('draft','open','closed','published') and new.status = 'archived')) then
    raise exception using errcode = '23514', message = 'Assessment lifecycle transition is forbidden';
  end if;
  if new.status = 'published' and not public.has_permission('assessment.publish', old.organization_id, old.school_id, v_classroom_id) then
    raise exception using errcode = '42501', message = 'Missing assessment.publish permission';
  end if;
  if new.status = 'archived' and not (public.has_permission('assessment.archive_own', old.organization_id, old.school_id, v_classroom_id)
    and (old.created_by_profile_id = auth.uid() or public.has_staff_scope_permission('assessment.archive_own', old.organization_id, old.school_id, null))) then
    raise exception using errcode = '42501', message = 'Missing assessment.archive_own permission';
  end if;
  return new;
end
$$;

create or replace function public.validate_student_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment public.assessments%rowtype;
  v_classroom_id uuid;
begin
  select a.* into v_assessment from public.assessments a
  where a.id = new.assessment_id and a.organization_id = new.organization_id and a.school_id = new.school_id
  for share;
  if not found then raise exception using errcode = '23514', message = 'StudentScore assessment scope mismatch'; end if;
  select ta.classroom_id into v_classroom_id from public.teaching_assignments ta where ta.id = v_assessment.teaching_assignment_id;
  if tg_op = 'INSERT' and v_assessment.status in ('published','archived')
     and not public.has_permission('score.update_locked', new.organization_id, new.school_id, v_classroom_id) then
    raise exception using errcode = '42501', message = 'Missing score.update_locked permission';
  end if;
  if not exists (
    select 1 from public.student_enrollments se
    where se.id = new.student_enrollment_id and se.organization_id = new.organization_id
      and se.school_id = new.school_id and se.academic_year_id = v_assessment.academic_year_id
      and se.enrolled_on <= v_assessment.assessment_date
      and (se.ended_on is null or se.ended_on >= v_assessment.assessment_date)
      and exists (select 1 from public.class_enrollments ce
        where ce.student_enrollment_id = se.id and ce.organization_id = se.organization_id
          and ce.school_id = se.school_id and ce.classroom_id = v_classroom_id
          and ce.is_primary and ce.starts_on <= v_assessment.assessment_date
          and (ce.ends_on is null or ce.ends_on >= v_assessment.assessment_date))
  ) then raise exception using errcode = '23514', message = 'StudentScore student is outside the dated assessment roster'; end if;
  if new.score is not null and (new.score < v_assessment.min_score or new.score > v_assessment.max_score) then
    raise exception using errcode = '23514', message = 'StudentScore is outside the Assessment score range';
  end if;
  if (new.status in ('missing','excused') and new.score is not null) or
     (new.status in ('submitted','final') and new.score is null) then
    raise exception using errcode = '23514', message = 'StudentScore status and value are inconsistent';
  end if;
  if tg_op = 'UPDATE' and (old.organization_id, old.school_id, old.assessment_id, old.student_enrollment_id, old.entered_by_profile_id, old.created_at)
    is distinct from (new.organization_id, new.school_id, new.assessment_id, new.student_enrollment_id, new.entered_by_profile_id, new.created_at) then
    raise exception using errcode = '23514', message = 'StudentScore identity and original attribution are immutable';
  end if;
  if tg_op = 'INSERT' then new.entered_by_profile_id := auth.uid(); end if;
  new.updated_by_profile_id := auth.uid();
  return new;
end
$$;

create or replace function public.guard_student_score_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_assessment public.assessments%rowtype; v_classroom_id uuid;
begin
  select a.* into v_assessment from public.assessments a where a.id = old.assessment_id;
  select ta.classroom_id into v_classroom_id from public.teaching_assignments ta where ta.id = v_assessment.teaching_assignment_id;
  if old.status = 'final' or v_assessment.status in ('published','archived') then
    if not public.has_permission('score.update_locked', old.organization_id, old.school_id, v_classroom_id) then
      raise exception using errcode = '42501', message = 'Missing score.update_locked permission';
    end if;
  elsif v_assessment.status not in ('draft','open','closed') then
    raise exception using errcode = '23514', message = 'Assessment is not open for score updates';
  end if;
  return new;
end $$;

create trigger trg_student_scores_update_guard before update on public.student_scores
for each row execute function public.guard_student_score_update();

create or replace function public.can_access_assessment(p_permission_code text, p_assessment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assessments a
    join public.teaching_assignments ta on ta.id = a.teaching_assignment_id
      and ta.organization_id = a.organization_id and ta.school_id = a.school_id
    where a.id = p_assessment_id and (
      public.has_permission(p_permission_code, a.organization_id, a.school_id, ta.classroom_id, a.created_by_profile_id, null)
      or (p_permission_code = 'assessment.read' and a.status = 'published' and exists (
        select 1 from public.student_enrollments se
        join public.class_enrollments ce on ce.student_enrollment_id = se.id
          and ce.organization_id = se.organization_id and ce.school_id = se.school_id
        join public.students st on st.id = se.student_id and st.organization_id = se.organization_id
        where se.organization_id = a.organization_id and se.school_id = a.school_id
          and se.academic_year_id = a.academic_year_id and ce.classroom_id = ta.classroom_id
          and ce.is_primary and se.enrolled_on <= a.assessment_date
          and (se.ended_on is null or se.ended_on >= a.assessment_date)
          and ce.starts_on <= a.assessment_date and (ce.ends_on is null or ce.ends_on >= a.assessment_date)
          and public.has_permission('assessment.read', a.organization_id, a.school_id, ta.classroom_id, st.profile_id, st.id)
      ))
    )
  )
$$;

create or replace function public.validate_assessment_learning_objective()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.assessments a
    join public.teaching_assignments ta on ta.id = a.teaching_assignment_id
    join public.learning_objectives lo on lo.id = new.learning_objective_id
      and lo.organization_id = a.organization_id and lo.school_id = a.school_id
    join public.learning_outcomes outcome on outcome.id = lo.learning_outcome_id
      and outcome.organization_id = lo.organization_id and outcome.school_id = lo.school_id
      and outcome.subject_id = ta.subject_id
    where a.id = new.assessment_id
  ) then raise exception using errcode = '23514', message = 'Assessment LearningObjective is outside the assigned subject context'; end if;
  return new;
end $$;

create trigger trg_assessment_learning_objectives_validate before insert or update on public.assessment_learning_objectives
for each row execute function public.validate_assessment_learning_objective();

create trigger audit_assessments after insert or update on public.assessments
for each row execute function public.audit_row_change();

-- Keep existing audit_student_scores: corrections retain before/after values with auth.uid().
revoke all on function public.validate_assessment_consistency() from public;
revoke all on function public.validate_student_score() from public;
revoke all on function public.guard_assessment_transition() from public;
revoke all on function public.guard_student_score_update() from public;
revoke all on function public.can_access_assessment(text, uuid) from public;
revoke all on function public.validate_assessment_learning_objective() from public;
grant execute on function public.validate_assessment_consistency() to authenticated;
grant execute on function public.validate_student_score() to authenticated;
grant execute on function public.guard_assessment_transition() to authenticated;
grant execute on function public.guard_student_score_update() to authenticated;
grant execute on function public.can_access_assessment(text, uuid) to authenticated;
grant execute on function public.validate_assessment_learning_objective() to authenticated;
