-- B4-F02 — Timetable tenant and academic integrity.
-- This migration hardens parent equality, Term/date semantics, reverse drift,
-- concurrency-safe parent validation, and TeachingAssignment delete safety.

do $$
begin
  if to_regclass('public.timetable_entries') is null
     or to_regclass('public.timetable_periods') is null
  then
    raise exception 'Cannot apply B4-F02: B4-F01 timetable foundation is missing';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'validate_timetable_parent_integrity'
  ) then
    raise exception 'Cannot apply B4-F02: validate_timetable_parent_integrity already exists';
  end if;

  if exists (
    select 1
    from public.timetable_entries te
    left join public.teaching_assignments ta
      on ta.id = te.teaching_assignment_id
     and ta.organization_id = te.organization_id
     and ta.school_id = te.school_id
    left join public.academic_years ay
      on ay.id = te.academic_year_id
     and ay.organization_id = te.organization_id
     and ay.school_id = te.school_id
    left join public.terms t
      on t.id = te.term_id
     and t.organization_id = te.organization_id
     and t.school_id = te.school_id
    where ta.id is null
       or ay.id is null
       or ta.academic_year_id is distinct from te.academic_year_id
       or (
         ta.term_id is not null
         and te.term_id is distinct from ta.term_id
       )
       or (
         te.term_id is not null
         and (
           t.id is null
           or t.academic_year_id is distinct from te.academic_year_id
         )
       )
       or te.effective_from < ay.starts_on
       or te.effective_from > ay.ends_on
       or (
         te.effective_to is not null
         and (
           te.effective_to < ay.starts_on
           or te.effective_to > ay.ends_on
         )
       )
       or (
         te.term_id is not null
         and (
           te.effective_from < t.starts_on
           or te.effective_from > t.ends_on
           or (
             te.effective_to is not null
             and (
               te.effective_to < t.starts_on
               or te.effective_to > t.ends_on
             )
           )
         )
       )
       or te.effective_from < ta.starts_on
       or (
         ta.ends_on is not null
         and coalesce(te.effective_to, t.ends_on, ay.ends_on) > ta.ends_on
       )
  ) then
    raise exception 'Cannot apply B4-F02: existing TimetableEntry academic integrity violation';
  end if;
end
$$;

alter table public.timetable_entries
  drop constraint timetable_entries_assignment_fk,
  add constraint timetable_entries_assignment_fk
    foreign key (teaching_assignment_id, organization_id, school_id)
    references public.teaching_assignments(id, organization_id, school_id)
    on delete restrict;

create index idx_timetable_entries_assignment_integrity
on public.timetable_entries (
  teaching_assignment_id,
  organization_id,
  school_id
);

create index idx_timetable_entries_term_integrity
on public.timetable_entries (
  term_id,
  organization_id,
  school_id
)
where term_id is not null;

create or replace function public.validate_timetable_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.teaching_assignments%rowtype;
  v_year public.academic_years%rowtype;
  v_term public.terms%rowtype;
  v_scope_end date;
  v_material_write boolean;
begin
  -- Lock the TeachingAssignment first so a concurrent parent mutation or
  -- deletion cannot commit between validation and the child write.
  select ta.*
  into v_assignment
  from public.teaching_assignments ta
  where ta.id = new.teaching_assignment_id
    and ta.organization_id = new.organization_id
    and ta.school_id = new.school_id
  for share;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'TimetableEntry TeachingAssignment tenant or school mismatch';
  end if;

  if v_assignment.academic_year_id is distinct from new.academic_year_id then
    raise exception using
      errcode = '23514',
      message = 'TimetableEntry TeachingAssignment academic year mismatch';
  end if;

  select ay.*
  into v_year
  from public.academic_years ay
  where ay.id = new.academic_year_id
    and ay.organization_id = new.organization_id
    and ay.school_id = new.school_id
  for share;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'TimetableEntry AcademicYear tenant or school mismatch';
  end if;

  if v_assignment.term_id is not null
     and new.term_id is distinct from v_assignment.term_id
  then
    raise exception using
      errcode = '23514',
      message = 'Term-scoped TeachingAssignment requires the same TimetableEntry Term';
  end if;

  v_scope_end := v_year.ends_on;

  if new.term_id is not null then
    select t.*
    into v_term
    from public.terms t
    where t.id = new.term_id
      and t.organization_id = new.organization_id
      and t.school_id = new.school_id
    for share;

    if not found
       or v_term.academic_year_id is distinct from new.academic_year_id
    then
      raise exception using
        errcode = '23514',
        message = 'TimetableEntry Term academic year, tenant, or school mismatch';
    end if;

    v_scope_end := v_term.ends_on;
  end if;

  if new.effective_to is not null
     and new.effective_to < new.effective_from
  then
    raise exception using
      errcode = '23514',
      message = 'TimetableEntry effective date range is invalid';
  end if;

  if new.effective_from < v_year.starts_on
     or new.effective_from > v_year.ends_on
     or (
       new.effective_to is not null
       and (
         new.effective_to < v_year.starts_on
         or new.effective_to > v_year.ends_on
       )
     )
  then
    raise exception using
      errcode = '23514',
      message = 'TimetableEntry effective dates must fall inside AcademicYear';
  end if;

  if new.term_id is not null
     and (
       new.effective_from < v_term.starts_on
       or new.effective_from > v_term.ends_on
       or (
         new.effective_to is not null
         and (
           new.effective_to < v_term.starts_on
           or new.effective_to > v_term.ends_on
         )
       )
     )
  then
    raise exception using
      errcode = '23514',
      message = 'TimetableEntry effective dates must fall inside Term';
  end if;

  if new.effective_from < v_assignment.starts_on
     or (
       v_assignment.ends_on is not null
       and coalesce(new.effective_to, v_scope_end) > v_assignment.ends_on
     )
  then
    raise exception using
      errcode = '23514',
      message = 'TimetableEntry effective dates must fall inside TeachingAssignment';
  end if;

  v_material_write := tg_op = 'INSERT';

  if tg_op = 'UPDATE' then
    v_material_write := (
      old.organization_id,
      old.school_id,
      old.academic_year_id,
      old.term_id,
      old.teaching_assignment_id,
      old.timetable_period_id,
      old.weekday,
      old.start_time,
      old.end_time,
      old.effective_from,
      old.effective_to,
      old.status
    ) is distinct from (
      new.organization_id,
      new.school_id,
      new.academic_year_id,
      new.term_id,
      new.teaching_assignment_id,
      new.timetable_period_id,
      new.weekday,
      new.start_time,
      new.end_time,
      new.effective_from,
      new.effective_to,
      new.status
    );
  end if;

  -- Existing published history against an inactive Assignment is
  -- grandfathered until B4-F05. New publication or a material rewrite is not.
  if new.status = 'published'
     and v_assignment.status in ('inactive', 'archived')
     and v_material_write
  then
    raise exception using
      errcode = '23514',
      message = 'Published TimetableEntry requires a non-historical TeachingAssignment';
  end if;

  return new;
end
$$;

revoke all on function public.validate_timetable_consistency() from public;
revoke all on function public.validate_timetable_consistency() from anon;
revoke all on function public.validate_timetable_consistency() from authenticated;

create function public.validate_timetable_parent_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_schema = 'public'
     and tg_table_name = 'academic_years'
  then
    if exists (
      select 1
      from public.timetable_entries te
      where te.academic_year_id = new.id
        and te.organization_id = new.organization_id
        and te.school_id = new.school_id
        and (
          te.effective_from < new.starts_on
          or te.effective_from > new.ends_on
          or (
            te.effective_to is not null
            and (
              te.effective_to < new.starts_on
              or te.effective_to > new.ends_on
            )
          )
        )
    ) then
      raise exception using
        errcode = '23514',
        message = 'Cannot change AcademicYear dates: existing TimetableEntries would fall outside the year';
    end if;

    if new.ends_on is distinct from old.ends_on
       and exists (
         select 1
         from public.timetable_entries te
         where te.academic_year_id = new.id
           and te.organization_id = new.organization_id
           and te.school_id = new.school_id
           and te.term_id is null
           and te.effective_to is null
       )
    then
      raise exception using
        errcode = '23514',
        message = 'AcademicYear end date cannot change while open-ended whole-year timetable entries depend on it';
    end if;

  elsif tg_table_schema = 'public'
        and tg_table_name = 'terms'
  then
    if exists (
      select 1
      from public.timetable_entries te
      where te.term_id = new.id
        and te.organization_id = new.organization_id
        and te.school_id = new.school_id
        and (
          te.academic_year_id is distinct from new.academic_year_id
          or te.effective_from < new.starts_on
          or te.effective_from > new.ends_on
          or (
            te.effective_to is not null
            and (
              te.effective_to < new.starts_on
              or te.effective_to > new.ends_on
            )
          )
        )
    ) then
      raise exception using
        errcode = '23514',
        message = 'Cannot change Term academic identity: existing TimetableEntries would become invalid';
    end if;

    if new.ends_on is distinct from old.ends_on
       and exists (
         select 1
         from public.timetable_entries te
         where te.term_id = new.id
           and te.organization_id = new.organization_id
           and te.school_id = new.school_id
           and te.academic_year_id = new.academic_year_id
           and te.effective_to is null
       )
    then
      raise exception using
        errcode = '23514',
        message = 'Term end date cannot change while open-ended timetable entries depend on it';
    end if;

  elsif tg_table_schema = 'public'
        and tg_table_name = 'teaching_assignments'
  then
    if exists (
      select 1
      from public.timetable_entries te
      join public.academic_years ay
        on ay.id = te.academic_year_id
       and ay.organization_id = te.organization_id
       and ay.school_id = te.school_id
      left join public.terms t
        on t.id = te.term_id
       and t.organization_id = te.organization_id
       and t.school_id = te.school_id
      where te.teaching_assignment_id = new.id
        and te.organization_id = new.organization_id
        and te.school_id = new.school_id
        and (
          te.academic_year_id is distinct from new.academic_year_id
          or (
            new.term_id is not null
            and te.term_id is distinct from new.term_id
          )
          or te.effective_from < new.starts_on
          or (
            new.ends_on is not null
            and coalesce(te.effective_to, t.ends_on, ay.ends_on) > new.ends_on
          )
        )
    ) then
      raise exception using
        errcode = '23514',
        message = 'Cannot change TeachingAssignment academic dates: existing TimetableEntries would become invalid';
    end if;
  end if;

  return new;
end
$$;

revoke all on function public.validate_timetable_parent_integrity() from public;
revoke all on function public.validate_timetable_parent_integrity() from anon;
revoke all on function public.validate_timetable_parent_integrity() from authenticated;

create trigger trg_academic_years_validate_timetable_integrity
before update of starts_on, ends_on
on public.academic_years
for each row
when (
  old.starts_on is distinct from new.starts_on
  or old.ends_on is distinct from new.ends_on
)
execute function public.validate_timetable_parent_integrity();

create trigger trg_terms_validate_timetable_integrity
before update of academic_year_id, starts_on, ends_on
on public.terms
for each row
when (
  old.academic_year_id is distinct from new.academic_year_id
  or old.starts_on is distinct from new.starts_on
  or old.ends_on is distinct from new.ends_on
)
execute function public.validate_timetable_parent_integrity();

create trigger trg_teaching_assignments_validate_timetable_integrity
before update of academic_year_id, term_id, starts_on, ends_on
on public.teaching_assignments
for each row
when (
  old.academic_year_id is distinct from new.academic_year_id
  or old.term_id is distinct from new.term_id
  or old.starts_on is distinct from new.starts_on
  or old.ends_on is distinct from new.ends_on
)
execute function public.validate_timetable_parent_integrity();

-- Transactional postcondition: every existing row still satisfies B4-F02.
do $$
begin
  if exists (
    select 1
    from public.timetable_entries te
    join public.teaching_assignments ta
      on ta.id = te.teaching_assignment_id
     and ta.organization_id = te.organization_id
     and ta.school_id = te.school_id
    join public.academic_years ay
      on ay.id = te.academic_year_id
     and ay.organization_id = te.organization_id
     and ay.school_id = te.school_id
    left join public.terms t
      on t.id = te.term_id
     and t.organization_id = te.organization_id
     and t.school_id = te.school_id
    where ta.academic_year_id is distinct from te.academic_year_id
       or (
         ta.term_id is not null
         and te.term_id is distinct from ta.term_id
       )
       or (
         te.term_id is not null
         and t.academic_year_id is distinct from te.academic_year_id
       )
       or te.effective_from < ay.starts_on
       or te.effective_from > ay.ends_on
       or (
         te.effective_to is not null
         and te.effective_to > ay.ends_on
       )
       or (
         te.term_id is not null
         and (
           te.effective_from < t.starts_on
           or te.effective_from > t.ends_on
           or (
             te.effective_to is not null
             and te.effective_to > t.ends_on
           )
         )
       )
       or te.effective_from < ta.starts_on
       or (
         ta.ends_on is not null
         and coalesce(te.effective_to, t.ends_on, ay.ends_on) > ta.ends_on
       )
  ) then
    raise exception 'Cannot apply B4-F02: postcondition failed';
  end if;
end
$$;

comment on function public.validate_timetable_consistency() is
  'B4-F02 forward tenant, AcademicYear, Term, and effective-date integrity guard.';

comment on function public.validate_timetable_parent_integrity() is
  'B4-F02 reverse-drift guard for TimetableEntry academic integrity.';
