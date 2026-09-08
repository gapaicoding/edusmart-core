-- Avoid INSERT ... RETURNING on TeachingAssignment replacement rows.
-- The SELECT policy's stable access helper cannot observe the row created by
-- the same INSERT command, while the INSERT WITH CHECK policy remains valid.

create or replace function public.replace_teaching_assignment(
  p_teaching_assignment_id uuid,
  p_organization_id uuid,
  p_school_id uuid,
  p_academic_year_id uuid,
  p_term_id uuid,
  p_classroom_id uuid,
  p_subject_id uuid,
  p_staff_school_assignment_id uuid,
  p_role text,
  p_status text,
  p_starts_on date,
  p_ends_on date
)
returns table (
  teaching_assignment_id uuid,
  replacement_occurred boolean
)
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_old public.teaching_assignments%rowtype;
  v_material_changed boolean;
  v_ssa_status text;
  v_result_id uuid;
begin
  -- The caller must be able to see this tenant-scoped row through
  -- the existing SELECT policy. FOR UPDATE serializes concurrent
  -- edits and replacements of the same assignment.
  select ta.*
    into v_old
  from public.teaching_assignments ta
  where ta.id = p_teaching_assignment_id
    and ta.organization_id = p_organization_id
    and ta.school_id = p_school_id
  for update;

  if not found then
    raise exception using
      errcode = '23514',
      message =
        'TeachingAssignment is unavailable for update';
  end if;

  v_material_changed :=
    v_old.staff_school_assignment_id
      is distinct from p_staff_school_assignment_id
    or v_old.classroom_id
      is distinct from p_classroom_id
    or v_old.subject_id
      is distinct from p_subject_id
    or v_old.academic_year_id
      is distinct from p_academic_year_id
    or v_old.term_id
      is distinct from p_term_id;

  -- Inactive and archived history cannot be replaced automatically.
  if v_material_changed
     and v_old.status in ('inactive', 'archived')
  then
    raise exception using
      errcode = '23514',
      message =
        'Historical TeachingAssignment material identity cannot be changed';
  end if;

  -- B3-F02:
  -- A new active SSA is required when active material replacement
  -- creates a new responsibility, or when a draft changes its SSA.
  -- The FOR SHARE lock prevents validation from racing with an SSA
  -- status transition.
  if (
       v_material_changed
       and v_old.status = 'active'
     )
     or (
       v_old.status = 'draft'
       and v_old.staff_school_assignment_id
         is distinct from p_staff_school_assignment_id
     )
  then
    select ssa.status
      into v_ssa_status
    from public.staff_school_assignments ssa
    where ssa.id = p_staff_school_assignment_id
      and ssa.organization_id = p_organization_id
      and ssa.school_id = p_school_id
    for share;

    if not found
       or v_ssa_status is distinct from 'active'
    then
      raise exception using
        errcode = '23514',
        message =
          'TeachingAssignment staff assignment is not active';
    end if;
  end if;

  -- Ordinary non-material edits and material edits of persisted
  -- drafts remain in-place. All existing constraints, RLS policies,
  -- B3-F01 validation, tenant guards, and archive guards apply.
  if not v_material_changed
     or v_old.status = 'draft'
  then
    update public.teaching_assignments ta
    set academic_year_id = p_academic_year_id,
        term_id = p_term_id,
        classroom_id = p_classroom_id,
        subject_id = p_subject_id,
        staff_school_assignment_id =
          p_staff_school_assignment_id,
        role = p_role,
        status = p_status,
        starts_on = p_starts_on,
        ends_on = p_ends_on,
        updated_at = statement_timestamp()
    where ta.id = v_old.id
      and ta.organization_id = v_old.organization_id
      and ta.school_id = v_old.school_id
    returning ta.id
      into v_result_id;

    if not found then
      raise exception using
        errcode = '23514',
        message =
          'TeachingAssignment update was not applied';
    end if;

    return query
      select v_result_id, false;

    return;
  end if;

  -- An active material edit becomes an atomic historical
  -- replacement. Only lifecycle metadata on the old row changes;
  -- its material identity and effective dates remain untouched.
  update public.teaching_assignments ta
  set status = 'inactive',
      updated_at = statement_timestamp()
  where ta.id = v_old.id
    and ta.organization_id = v_old.organization_id
    and ta.school_id = v_old.school_id;

  if not found then
    raise exception using
      errcode = '23514',
      message =
        'TeachingAssignment replacement transition was not applied';
  end if;

  v_result_id := gen_random_uuid();

  insert into public.teaching_assignments (
    id,
    organization_id,
    school_id,
    academic_year_id,
    term_id,
    classroom_id,
    subject_id,
    staff_school_assignment_id,
    role,
    status,
    starts_on,
    ends_on
  )
  values (
    v_result_id,
    p_organization_id,
    p_school_id,
    p_academic_year_id,
    p_term_id,
    p_classroom_id,
    p_subject_id,
    p_staff_school_assignment_id,
    p_role,
    p_status,
    p_starts_on,
    p_ends_on
  );

  if not found then
    raise exception using
      errcode = '23514',
      message =
        'TeachingAssignment replacement was not created';
  end if;

  return query
    select v_result_id, true;
end;
$function$;
