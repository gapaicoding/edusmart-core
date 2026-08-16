-- B2-F01 / B2-F02: SIS placement integrity (academic year + grade level),
-- forward and reverse drift. No RLS/RBAC/permission/Auth/tenant changes.

-- 5. Pre-migration invariant assertion (aborts the whole migration on violation)
do $preflight$
begin
  if exists (
    select 1
    from public.class_enrollments ce
    join public.student_enrollments se
      on se.id = ce.student_enrollment_id
     and se.organization_id = ce.organization_id
     and se.school_id = ce.school_id
    join public.classrooms c
      on c.id = ce.classroom_id
     and c.organization_id = ce.organization_id
     and c.school_id = ce.school_id
    where se.academic_year_id is distinct from c.academic_year_id
       or se.grade_level_id is distinct from c.grade_level_id
  ) then
    raise exception
      'Cannot apply SIS placement integrity migration: inconsistent existing ClassEnrollment rows exist';
  end if;
end
$preflight$;

-- 6. Forward validator (same trigger binding: trg_class_enrollments_validate_consistency)
create or replace function public.validate_class_enrollment_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enrollment_year  uuid;
  v_enrollment_grade uuid;
  v_class_year       uuid;
  v_class_grade      uuid;
begin
  -- for share: blocks concurrent UPDATEs of these parent rows until this
  -- transaction ends, while still allowing parallel placement inserts.
  select se.academic_year_id, se.grade_level_id
    into v_enrollment_year, v_enrollment_grade
  from public.student_enrollments se
  where se.id = new.student_enrollment_id
    and se.organization_id = new.organization_id
    and se.school_id = new.school_id
  for share;

  select c.academic_year_id, c.grade_level_id
    into v_class_year, v_class_grade
  from public.classrooms c
  where c.id = new.classroom_id
    and c.organization_id = new.organization_id
    and c.school_id = new.school_id
  for share;

  if v_enrollment_year is null
     or v_class_year is null
     or v_enrollment_year <> v_class_year then
    raise exception using
      errcode = '23514',
      message = 'ClassEnrollment classroom must belong to the same academic year as StudentEnrollment';
  end if;

  if v_enrollment_grade is null
     or v_class_grade is null
     or v_enrollment_grade <> v_class_grade then
    raise exception using
      errcode = '23514',
      message = 'ClassEnrollment classroom must belong to the same grade level as StudentEnrollment';
  end if;

  return new;
end;
$function$;

-- 7. Reverse drift guard (shared function, two conditional triggers)
create or replace function public.validate_enrollment_placement_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if TG_TABLE_NAME = 'student_enrollments' then
    if exists (
      select 1
      from public.class_enrollments ce
      join public.classrooms c
        on c.id = ce.classroom_id
       and c.organization_id = ce.organization_id
       and c.school_id = ce.school_id
      where ce.student_enrollment_id = new.id
        and ce.organization_id = new.organization_id
        and ce.school_id = new.school_id
        and (
          c.academic_year_id is distinct from new.academic_year_id
          or c.grade_level_id is distinct from new.grade_level_id
        )
    ) then
      raise exception using
        errcode = '23514',
        message = 'Cannot change StudentEnrollment academic year or grade level: existing classroom placements would no longer match';
    end if;

  elsif TG_TABLE_NAME = 'classrooms' then
    if exists (
      select 1
      from public.class_enrollments ce
      join public.student_enrollments se
        on se.id = ce.student_enrollment_id
       and se.organization_id = ce.organization_id
       and se.school_id = ce.school_id
      where ce.classroom_id = new.id
        and ce.organization_id = new.organization_id
        and ce.school_id = new.school_id
        and (
          se.academic_year_id is distinct from new.academic_year_id
          or se.grade_level_id is distinct from new.grade_level_id
        )
    ) then
      raise exception using
        errcode = '23514',
        message = 'Cannot change Classroom academic year or grade level: existing student placements would no longer match';
    end if;
  end if;

  return new;
end;
$function$;

create trigger trg_student_enrollments_validate_placement
before update of academic_year_id, grade_level_id on public.student_enrollments
for each row
when (
  old.academic_year_id is distinct from new.academic_year_id
  or old.grade_level_id is distinct from new.grade_level_id
)
execute function public.validate_enrollment_placement_integrity();

create trigger trg_classrooms_validate_placement
before update of academic_year_id, grade_level_id on public.classrooms
for each row
when (
  old.academic_year_id is distinct from new.academic_year_id
  or old.grade_level_id is distinct from new.grade_level_id
)
execute function public.validate_enrollment_placement_integrity();