begin;

-- =========================================================
-- EduSmart Core V1
-- Batch 3 — Teacher Assignment
-- B3-F01 Database Integrity Hardening
--
-- Protects:
-- 1. TeachingAssignment -> Classroom academic year consistency
-- 2. TeachingAssignment -> Term academic year consistency
-- 3. Reverse drift when Classroom academic_year_id changes
-- 4. Reverse drift when Term academic_year_id changes
-- 5. Concurrent parent/child writes through parent row locking
--
-- No RLS changes.
-- No RBAC changes.
-- No permission changes.
-- No tenant architecture changes.
-- =========================================================


-- =========================================================
-- 1. PREFLIGHT EXISTING DATA
-- =========================================================
-- Abort atomically if either Teaching Assignment year
-- invariant is already violated.
--
-- Live preflight before this migration:
-- teaching_assignment_count = 30
-- classroom academic-year mismatches = 0
-- term academic-year mismatches = 0
-- =========================================================

do $preflight$
begin
  if exists (
    select 1
    from public.teaching_assignments ta
    join public.classrooms c
      on c.id = ta.classroom_id
     and c.organization_id = ta.organization_id
     and c.school_id = ta.school_id
    where c.academic_year_id
      is distinct from ta.academic_year_id
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F01: existing TeachingAssignment classroom academic year mismatches exist';
  end if;

  if exists (
    select 1
    from public.teaching_assignments ta
    join public.terms t
      on t.id = ta.term_id
     and t.organization_id = ta.organization_id
     and t.school_id = ta.school_id
    where ta.term_id is not null
      and t.academic_year_id
        is distinct from ta.academic_year_id
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F01: existing TeachingAssignment term academic year mismatches exist';
  end if;
end
$preflight$;


-- =========================================================
-- 2. FORWARD TEACHING ASSIGNMENT VALIDATION
-- =========================================================
-- Harden the existing validator.
--
-- IMPORTANT:
-- The existing trigger:
--
--   trg_teaching_assignments_validate_consistency
--
-- is preserved.
--
-- We only replace its function implementation.
--
-- Parent rows are locked FOR SHARE so a concurrent
-- Classroom/Term academic-year update cannot race with a
-- Teaching Assignment write and leave inconsistent data.
-- =========================================================

create or replace function
  public.validate_teaching_assignment_consistency()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_class_year uuid;
  v_term_year uuid;
begin

  -- -------------------------------------------------------
  -- Classroom validation
  -- -------------------------------------------------------
  -- Resolve using the complete tenant/school boundary and
  -- retain a SHARE lock until transaction completion.
  -- -------------------------------------------------------

  select c.academic_year_id
    into v_class_year
  from public.classrooms c
  where c.id = new.classroom_id
    and c.organization_id = new.organization_id
    and c.school_id = new.school_id
  for share;

  if v_class_year is null
     or v_class_year
        is distinct from new.academic_year_id
  then
    raise exception using
      errcode = '23514',
      message =
        'TeachingAssignment classroom academic year mismatch';
  end if;


  -- -------------------------------------------------------
  -- Term validation
  -- -------------------------------------------------------
  -- Term is nullable. When provided, it must belong to the
  -- same Academic Year as the Teaching Assignment.
  -- -------------------------------------------------------

  if new.term_id is not null then

    select t.academic_year_id
      into v_term_year
    from public.terms t
    where t.id = new.term_id
      and t.organization_id = new.organization_id
      and t.school_id = new.school_id
    for share;

    if v_term_year is null
       or v_term_year
          is distinct from new.academic_year_id
    then
      raise exception using
        errcode = '23514',
        message =
          'TeachingAssignment term academic year mismatch';
    end if;

  end if;


  return new;
end;
$function$;


-- =========================================================
-- 3. REVERSE-DRIFT VALIDATOR
-- =========================================================
-- Protect existing Teaching Assignments when a parent
-- Classroom or Term is modified later.
--
-- This function performs validation only.
-- It performs no writes and no cascading updates.
-- =========================================================

create function
  public.validate_teaching_assignment_parent_integrity()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin

  -- -------------------------------------------------------
  -- Classroom academic-year reverse drift
  -- -------------------------------------------------------

  if tg_table_schema = 'public'
     and tg_table_name = 'classrooms'
  then

    if exists (
      select 1
      from public.teaching_assignments ta
      where ta.classroom_id = new.id
        and ta.organization_id = new.organization_id
        and ta.school_id = new.school_id
        and ta.academic_year_id
          is distinct from new.academic_year_id
    ) then
      raise exception using
        errcode = '23514',
        message =
          'Cannot change Classroom academic year: existing TeachingAssignments would no longer match';
    end if;


  -- -------------------------------------------------------
  -- Term academic-year reverse drift
  -- -------------------------------------------------------

  elsif tg_table_schema = 'public'
        and tg_table_name = 'terms'
  then

    if exists (
      select 1
      from public.teaching_assignments ta
      where ta.term_id = new.id
        and ta.organization_id = new.organization_id
        and ta.school_id = new.school_id
        and ta.academic_year_id
          is distinct from new.academic_year_id
    ) then
      raise exception using
        errcode = '23514',
        message =
          'Cannot change Term academic year: existing TeachingAssignments would no longer match';
    end if;

  end if;


  return new;
end;
$function$;


-- =========================================================
-- 4. SECURITY HARDENING
-- =========================================================
-- This SECURITY DEFINER function exists only for trigger
-- execution. It is not intended to be directly callable by
-- PUBLIC / application users.
-- =========================================================

revoke execute
on function public.validate_teaching_assignment_parent_integrity()
from public, anon, authenticated;


-- =========================================================
-- 5. CLASSROOM REVERSE GUARD
-- =========================================================

create trigger
  trg_classrooms_validate_teaching_assignment_integrity
before update of academic_year_id
on public.classrooms
for each row
when (
  old.academic_year_id
    is distinct from new.academic_year_id
)
execute function
  public.validate_teaching_assignment_parent_integrity();


-- =========================================================
-- 6. TERM REVERSE GUARD
-- =========================================================

create trigger
  trg_terms_validate_teaching_assignment_integrity
before update of academic_year_id
on public.terms
for each row
when (
  old.academic_year_id
    is distinct from new.academic_year_id
)
execute function
  public.validate_teaching_assignment_parent_integrity();


commit;
