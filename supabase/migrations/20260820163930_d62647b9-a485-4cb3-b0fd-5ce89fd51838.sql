begin;

-- =========================================================
-- EduSmart Core V1
-- Batch 3 — Teacher Assignment
-- B3-F03 Historical Identity Semantics
--
-- Adds:
-- 1. Database-authoritative material-identity immutability
-- 2. One-way draft lifecycle protection
-- 3. Atomic TeachingAssignment replacement RPC
--
-- No data rewrite.
-- No historical backfill.
-- No RLS changes.
-- No RBAC changes.
-- No permission changes.
-- No B3-F01 changes.
-- No B3-F02 changes.
-- =========================================================


-- =========================================================
-- 1. PREFLIGHT
-- =========================================================

do $preflight$
begin
  -- Do not overwrite an unexpected prior function or overload.
  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'guard_teaching_assignment_material_identity'
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F03: guard_teaching_assignment_material_identity already exists';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'replace_teaching_assignment'
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F03: replace_teaching_assignment already exists';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c
      on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'teaching_assignments'
      and t.tgname = 'trg_teaching_assignments_history_guard'
      and not t.tgisinternal
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F03: trg_teaching_assignments_history_guard already exists';
  end if;

  -- Confirm all persisted statuses satisfy the established domain.
  if exists (
    select 1
    from public.teaching_assignments ta
    where ta.status not in ('draft', 'active', 'inactive', 'archived')
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F03: invalid TeachingAssignment status exists';
  end if;

  -- Confirm the active exact-identity invariant is already clean.
  if exists (
    select 1
    from public.teaching_assignments ta
    where ta.status = 'active'
    group by
      ta.school_id,
      ta.academic_year_id,
      coalesce(
        ta.term_id,
        '00000000-0000-0000-0000-000000000000'::uuid
      ),
      ta.classroom_id,
      ta.subject_id,
      ta.staff_school_assignment_id,
      ta.role
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F03: duplicate active TeachingAssignment identity exists';
  end if;

  -- Confirm tenant-scoped AcademicYear references.
  if exists (
    select 1
    from public.teaching_assignments ta
    where not exists (
      select 1
      from public.academic_years ay
      where ay.id = ta.academic_year_id
        and ay.organization_id = ta.organization_id
        and ay.school_id = ta.school_id
    )
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F03: invalid TeachingAssignment AcademicYear reference exists';
  end if;

  -- Confirm tenant-scoped Classroom references and B3-F01 consistency.
  if exists (
    select 1
    from public.teaching_assignments ta
    where not exists (
      select 1
      from public.classrooms c
      where c.id = ta.classroom_id
        and c.organization_id = ta.organization_id
        and c.school_id = ta.school_id
        and c.academic_year_id = ta.academic_year_id
    )
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F03: invalid or inconsistent TeachingAssignment Classroom reference exists';
  end if;

  -- Confirm tenant-scoped Term references and B3-F01 consistency.
  if exists (
    select 1
    from public.teaching_assignments ta
    where ta.term_id is not null
      and not exists (
        select 1
        from public.terms t
        where t.id = ta.term_id
          and t.organization_id = ta.organization_id
          and t.school_id = ta.school_id
          and t.academic_year_id = ta.academic_year_id
      )
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F03: invalid or inconsistent TeachingAssignment Term reference exists';
  end if;

  -- Confirm tenant-scoped Subject references.
  if exists (
    select 1
    from public.teaching_assignments ta
    where not exists (
      select 1
      from public.subjects s
      where s.id = ta.subject_id
        and s.organization_id = ta.organization_id
        and s.school_id = ta.school_id
    )
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F03: invalid TeachingAssignment Subject reference exists';
  end if;

  -- Confirm tenant-scoped StaffSchoolAssignment references.
  if exists (
    select 1
    from public.teaching_assignments ta
    where not exists (
      select 1
      from public.staff_school_assignments ssa
      where ssa.id = ta.staff_school_assignment_id
        and ssa.organization_id = ta.organization_id
        and ssa.school_id = ta.school_id
    )
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F03: invalid TeachingAssignment staff assignment reference exists';
  end if;

  -- Confirm downstream tenant-scoped references remain valid.
  if exists (
    select 1
    from public.timetable_entries te
    where not exists (
      select 1
      from public.teaching_assignments ta
      where ta.id = te.teaching_assignment_id
        and ta.organization_id = te.organization_id
        and ta.school_id = te.school_id
    )
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F03: invalid timetable TeachingAssignment reference exists';
  end if;

  if exists (
    select 1
    from public.attendance_sessions ats
    where ats.teaching_assignment_id is not null
      and not exists (
        select 1
        from public.teaching_assignments ta
        where ta.id = ats.teaching_assignment_id
          and ta.organization_id = ats.organization_id
          and ta.school_id = ats.school_id
      )
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F03: invalid attendance TeachingAssignment reference exists';
  end if;

  if exists (
    select 1
    from public.assessments a
    where not exists (
      select 1
      from public.teaching_assignments ta
      where ta.id = a.teaching_assignment_id
        and ta.organization_id = a.organization_id
        and ta.school_id = a.school_id
    )
  ) then
    raise exception using
      errcode = '23514',
      message =
        'Cannot apply B3-F03: invalid assessment TeachingAssignment reference exists';
  end if;
end
$preflight$;


-- =========================================================
-- 2. DATABASE-AUTHORITATIVE HISTORY GUARD
-- =========================================================

create function
  public.guard_teaching_assignment_material_identity()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  -- Draft is a one-way pre-publication state. Once a persisted
  -- assignment leaves draft, returning to draft must not restore
  -- material mutability.
  if old.status <> 'draft'
     and new.status = 'draft'
  then
    raise exception using
      errcode = '23514',
      message =
        'TeachingAssignment cannot return to draft after publication';
  end if;

  -- Material identity is mutable only while the persisted OLD row
  -- is still draft.
  if old.status <> 'draft'
     and (
       old.staff_school_assignment_id
         is distinct from new.staff_school_assignment_id
       or old.classroom_id
         is distinct from new.classroom_id
       or old.subject_id
         is distinct from new.subject_id
       or old.academic_year_id
         is distinct from new.academic_year_id
       or old.term_id
         is distinct from new.term_id
     )
  then
    raise exception using
      errcode = '23514',
      message =
        'TeachingAssignment material identity cannot be rewritten after activation';
  end if;

  return new;
end;
$function$;

revoke execute
on function public.guard_teaching_assignment_material_identity()
from public, anon, authenticated;


-- =========================================================
-- 3. BEFORE UPDATE HISTORY TRIGGER
-- =========================================================
-- PostgreSQL executes same-kind triggers alphabetically.
-- This name sorts before the existing tenant, updated_at,
-- consistency, and workflow TeachingAssignment triggers.
-- =========================================================

create trigger
  trg_teaching_assignments_history_guard
before update
on public.teaching_assignments
for each row
execute function
  public.guard_teaching_assignment_material_identity();


-- =========================================================
-- 4. ATOMIC REPLACEMENT RPC
-- =========================================================

create function public.replace_teaching_assignment(
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

  insert into public.teaching_assignments (
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
  )
  returning id
    into v_result_id;

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


-- =========================================================
-- 5. RPC PRIVILEGE HARDENING
-- =========================================================

revoke execute
on function public.replace_teaching_assignment(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  date
)
from public, anon;

grant execute
on function public.replace_teaching_assignment(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  date
)
to authenticated;

commit;
