-- B4-F03 — Published timetable conflict and concurrency enforcement.
-- Draft rows may conflict. Published rows serialize and reject overlapping
-- TeachingAssignment, StaffMember, or Classroom responsibilities.

do $$
begin
  if to_regclass('public.timetable_entries') is null
     or to_regclass('public.timetable_periods') is null
  then
    raise exception 'Cannot apply B4-F03: timetable foundation is missing';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'validate_timetable_conflicts',
        'validate_teaching_assignment_timetable_conflicts',
        'validate_staff_assignment_timetable_conflicts'
      )
  ) then
    raise exception 'Cannot apply B4-F03: conflict integrity functions already exist';
  end if;

  -- Existing published rows must be conflict-free before enforcement is
  -- installed. Inclusive date ranges and half-open time ranges are used.
  if exists (
    select 1
    from public.timetable_entries a
    join public.timetable_entries b
      on a.id < b.id
     and a.organization_id = b.organization_id
     and a.status = 'published'
     and b.status = 'published'
     and a.teaching_assignment_id = b.teaching_assignment_id
     and a.weekday = b.weekday
     and a.start_time < b.end_time
     and b.start_time < a.end_time
    join public.academic_years aay
      on aay.id = a.academic_year_id
     and aay.organization_id = a.organization_id
     and aay.school_id = a.school_id
    left join public.terms at
      on at.id = a.term_id
     and at.organization_id = a.organization_id
     and at.school_id = a.school_id
    join public.academic_years bay
      on bay.id = b.academic_year_id
     and bay.organization_id = b.organization_id
     and bay.school_id = b.school_id
    left join public.terms bt
      on bt.id = b.term_id
     and bt.organization_id = b.organization_id
     and bt.school_id = b.school_id
    where a.effective_from <= coalesce(b.effective_to, bt.ends_on, bay.ends_on)
      and b.effective_from <= coalesce(a.effective_to, at.ends_on, aay.ends_on)
  ) then
    raise exception 'Cannot apply B4-F03: existing published duplicate TeachingAssignment conflict';
  end if;

  if exists (
    select 1
    from public.timetable_entries a
    join public.teaching_assignments ata
      on ata.id = a.teaching_assignment_id
     and ata.organization_id = a.organization_id
     and ata.school_id = a.school_id
    join public.staff_school_assignments assa
      on assa.id = ata.staff_school_assignment_id
     and assa.organization_id = ata.organization_id
     and assa.school_id = ata.school_id
    join public.timetable_entries b
      on a.id < b.id
     and a.organization_id = b.organization_id
     and a.status = 'published'
     and b.status = 'published'
     and a.weekday = b.weekday
     and a.start_time < b.end_time
     and b.start_time < a.end_time
    join public.teaching_assignments bta
      on bta.id = b.teaching_assignment_id
     and bta.organization_id = b.organization_id
     and bta.school_id = b.school_id
    join public.staff_school_assignments bssa
      on bssa.id = bta.staff_school_assignment_id
     and bssa.organization_id = bta.organization_id
     and bssa.school_id = bta.school_id
     and bssa.staff_member_id = assa.staff_member_id
    join public.academic_years aay
      on aay.id = a.academic_year_id
     and aay.organization_id = a.organization_id
     and aay.school_id = a.school_id
    left join public.terms at
      on at.id = a.term_id
     and at.organization_id = a.organization_id
     and at.school_id = a.school_id
    join public.academic_years bay
      on bay.id = b.academic_year_id
     and bay.organization_id = b.organization_id
     and bay.school_id = b.school_id
    left join public.terms bt
      on bt.id = b.term_id
     and bt.organization_id = b.organization_id
     and bt.school_id = b.school_id
    where a.effective_from <= coalesce(b.effective_to, bt.ends_on, bay.ends_on)
      and b.effective_from <= coalesce(a.effective_to, at.ends_on, aay.ends_on)
  ) then
    raise exception 'Cannot apply B4-F03: existing published teacher conflict';
  end if;

  if exists (
    select 1
    from public.timetable_entries a
    join public.teaching_assignments ata
      on ata.id = a.teaching_assignment_id
     and ata.organization_id = a.organization_id
     and ata.school_id = a.school_id
    join public.timetable_entries b
      on a.id < b.id
     and a.organization_id = b.organization_id
     and a.status = 'published'
     and b.status = 'published'
     and a.weekday = b.weekday
     and a.start_time < b.end_time
     and b.start_time < a.end_time
    join public.teaching_assignments bta
      on bta.id = b.teaching_assignment_id
     and bta.organization_id = b.organization_id
     and bta.school_id = b.school_id
     and bta.classroom_id = ata.classroom_id
    join public.academic_years aay
      on aay.id = a.academic_year_id
     and aay.organization_id = a.organization_id
     and aay.school_id = a.school_id
    left join public.terms at
      on at.id = a.term_id
     and at.organization_id = a.organization_id
     and at.school_id = a.school_id
    join public.academic_years bay
      on bay.id = b.academic_year_id
     and bay.organization_id = b.organization_id
     and bay.school_id = b.school_id
    left join public.terms bt
      on bt.id = b.term_id
     and bt.organization_id = b.organization_id
     and bt.school_id = b.school_id
    where a.effective_from <= coalesce(b.effective_to, bt.ends_on, bay.ends_on)
      and b.effective_from <= coalesce(a.effective_to, at.ends_on, aay.ends_on)
  ) then
    raise exception 'Cannot apply B4-F03: existing published Classroom conflict';
  end if;
end
$$;

create index idx_timetable_entries_published_conflict_scan
on public.timetable_entries (
  organization_id,
  weekday,
  teaching_assignment_id,
  start_time,
  end_time,
  effective_from
)
where status = 'published';

create function public.validate_timetable_conflicts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ta public.teaching_assignments%rowtype;
  v_ssa public.staff_school_assignments%rowtype;
  v_year public.academic_years%rowtype;
  v_term public.terms%rowtype;
  v_candidate_end date;
  v_lock_key bigint;
  v_material_change boolean;
begin
  if new.status <> 'published' then
    return new;
  end if;

  v_material_change := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    v_material_change := (
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

  if not v_material_change then
    return new;
  end if;

  -- Parent row locks are acquired before advisory locks. This matches the
  -- B4-F02 parent order and prevents row-lock/advisory-lock cycles with
  -- reverse parent validation.
  select ta.*
  into v_ta
  from public.teaching_assignments ta
  where ta.id = new.teaching_assignment_id
    and ta.organization_id = new.organization_id
    and ta.school_id = new.school_id
  for share;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Timetable conflict validation could not resolve TeachingAssignment';
  end if;

  select ssa.*
  into v_ssa
  from public.staff_school_assignments ssa
  where ssa.id = v_ta.staff_school_assignment_id
    and ssa.organization_id = v_ta.organization_id
    and ssa.school_id = v_ta.school_id
  for share;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Timetable conflict validation could not resolve Staff assignment';
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
      message = 'Timetable conflict validation could not resolve AcademicYear';
  end if;

  v_candidate_end := coalesce(new.effective_to, v_year.ends_on);
  if new.term_id is not null then
    select t.*
    into v_term
    from public.terms t
    where t.id = new.term_id
      and t.organization_id = new.organization_id
      and t.school_id = new.school_id
    for share;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'Timetable conflict validation could not resolve Term';
    end if;
    v_candidate_end := coalesce(new.effective_to, v_term.ends_on);
  end if;

  -- 64-bit PostgreSQL hashes are stable for every transaction on this server.
  -- A theoretical hash collision only causes extra serialization; it cannot
  -- allow a conflicting commit. Domain prefixes keep lock classes separate.
  for v_lock_key in
    select distinct lock_key
    from unnest(array[
      pg_catalog.hashtextextended(
        'b4f03|01|assignment|' || new.organization_id::text || '|' ||
        new.teaching_assignment_id::text || '|' || new.weekday::text,
        0
      ),
      pg_catalog.hashtextextended(
        'b4f03|02|teacher|' || new.organization_id::text || '|' ||
        v_ssa.staff_member_id::text || '|' || new.weekday::text,
        0
      ),
      pg_catalog.hashtextextended(
        'b4f03|03|classroom|' || new.organization_id::text || '|' ||
        v_ta.classroom_id::text || '|' || new.weekday::text,
        0
      )
    ]) as locks(lock_key)
    order by lock_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(v_lock_key);
  end loop;

  if exists (
    select 1
    from public.timetable_entries other
    join public.academic_years oay
      on oay.id = other.academic_year_id
     and oay.organization_id = other.organization_id
     and oay.school_id = other.school_id
    left join public.terms ot
      on ot.id = other.term_id
     and ot.organization_id = other.organization_id
     and ot.school_id = other.school_id
    where other.id <> new.id
      and other.organization_id = new.organization_id
      and other.status = 'published'
      and other.teaching_assignment_id = new.teaching_assignment_id
      and other.weekday = new.weekday
      and other.start_time < new.end_time
      and new.start_time < other.end_time
      and other.effective_from <= v_candidate_end
      and new.effective_from <= coalesce(other.effective_to, ot.ends_on, oay.ends_on)
  ) then
    raise exception using
      errcode = '23514',
      message = 'TeachingAssignment already has an overlapping published timetable entry';
  end if;

  if exists (
    select 1
    from public.timetable_entries other
    join public.teaching_assignments ota
      on ota.id = other.teaching_assignment_id
     and ota.organization_id = other.organization_id
     and ota.school_id = other.school_id
    join public.staff_school_assignments ossa
      on ossa.id = ota.staff_school_assignment_id
     and ossa.organization_id = ota.organization_id
     and ossa.school_id = ota.school_id
    join public.academic_years oay
      on oay.id = other.academic_year_id
     and oay.organization_id = other.organization_id
     and oay.school_id = other.school_id
    left join public.terms ot
      on ot.id = other.term_id
     and ot.organization_id = other.organization_id
     and ot.school_id = other.school_id
    where other.id <> new.id
      and other.organization_id = new.organization_id
      and other.status = 'published'
      and ossa.staff_member_id = v_ssa.staff_member_id
      and other.weekday = new.weekday
      and other.start_time < new.end_time
      and new.start_time < other.end_time
      and other.effective_from <= v_candidate_end
      and new.effective_from <= coalesce(other.effective_to, ot.ends_on, oay.ends_on)
  ) then
    raise exception using
      errcode = '23514',
      message = 'Teacher has an overlapping published timetable entry';
  end if;

  if exists (
    select 1
    from public.timetable_entries other
    join public.teaching_assignments ota
      on ota.id = other.teaching_assignment_id
     and ota.organization_id = other.organization_id
     and ota.school_id = other.school_id
    join public.academic_years oay
      on oay.id = other.academic_year_id
     and oay.organization_id = other.organization_id
     and oay.school_id = other.school_id
    left join public.terms ot
      on ot.id = other.term_id
     and ot.organization_id = other.organization_id
     and ot.school_id = other.school_id
    where other.id <> new.id
      and other.organization_id = new.organization_id
      and other.status = 'published'
      and ota.classroom_id = v_ta.classroom_id
      and other.weekday = new.weekday
      and other.start_time < new.end_time
      and new.start_time < other.end_time
      and other.effective_from <= v_candidate_end
      and new.effective_from <= coalesce(other.effective_to, ot.ends_on, oay.ends_on)
  ) then
    raise exception using
      errcode = '23514',
      message = 'Classroom has an overlapping published timetable entry';
  end if;

  return new;
end
$$;

revoke all on function public.validate_timetable_conflicts() from public;
revoke all on function public.validate_timetable_conflicts() from anon;
revoke all on function public.validate_timetable_conflicts() from authenticated;

create trigger trg_timetable_entries_validate_schedule_conflicts
before insert or update
on public.timetable_entries
for each row
execute function public.validate_timetable_conflicts();

-- A draft TeachingAssignment can be edited in place. If a published Entry
-- already references it, derived teacher/Classroom conflict identity can
-- change without touching the Entry, so protect that reverse path.
create function public.validate_teaching_assignment_timetable_conflicts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ssa public.staff_school_assignments%rowtype;
  v_entry record;
  v_lock_key bigint;
begin
  if old.staff_school_assignment_id is not distinct from new.staff_school_assignment_id
     and old.classroom_id is not distinct from new.classroom_id
  then
    return new;
  end if;

  select ssa.*
  into v_ssa
  from public.staff_school_assignments ssa
  where ssa.id = new.staff_school_assignment_id
    and ssa.organization_id = new.organization_id
    and ssa.school_id = new.school_id
  for share;

  if not found then
    return new;
  end if;

  for v_lock_key in
    select distinct lock_key
    from (
      select pg_catalog.hashtextextended(
        'b4f03|01|assignment|' || new.organization_id::text || '|' ||
        new.id::text || '|' || te.weekday::text,
        0
      ) lock_key
      from public.timetable_entries te
      where te.teaching_assignment_id = new.id
        and te.organization_id = new.organization_id
        and te.school_id = new.school_id
        and te.status = 'published'
      union all
      select pg_catalog.hashtextextended(
        'b4f03|02|teacher|' || new.organization_id::text || '|' ||
        v_ssa.staff_member_id::text || '|' || te.weekday::text,
        0
      )
      from public.timetable_entries te
      where te.teaching_assignment_id = new.id
        and te.organization_id = new.organization_id
        and te.school_id = new.school_id
        and te.status = 'published'
      union all
      select pg_catalog.hashtextextended(
        'b4f03|03|classroom|' || new.organization_id::text || '|' ||
        new.classroom_id::text || '|' || te.weekday::text,
        0
      )
      from public.timetable_entries te
      where te.teaching_assignment_id = new.id
        and te.organization_id = new.organization_id
        and te.school_id = new.school_id
        and te.status = 'published'
    ) lock_keys
    order by lock_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(v_lock_key);
  end loop;

  for v_entry in
    select te.*,
           coalesce(te.effective_to, t.ends_on, ay.ends_on) semantic_end
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
      and te.status = 'published'
  loop
    if exists (
      select 1
      from public.timetable_entries other
      join public.teaching_assignments ota
        on ota.id = other.teaching_assignment_id
       and ota.organization_id = other.organization_id
       and ota.school_id = other.school_id
      join public.staff_school_assignments ossa
        on ossa.id = ota.staff_school_assignment_id
       and ossa.organization_id = ota.organization_id
       and ossa.school_id = ota.school_id
      join public.academic_years oay
        on oay.id = other.academic_year_id
       and oay.organization_id = other.organization_id
       and oay.school_id = other.school_id
      left join public.terms ot
        on ot.id = other.term_id
       and ot.organization_id = other.organization_id
       and ot.school_id = other.school_id
      where other.id <> v_entry.id
        and other.organization_id = new.organization_id
        and other.status = 'published'
        and other.weekday = v_entry.weekday
        and other.start_time < v_entry.end_time
        and v_entry.start_time < other.end_time
        and other.effective_from <= v_entry.semantic_end
        and v_entry.effective_from <= coalesce(other.effective_to, ot.ends_on, oay.ends_on)
        and ossa.staff_member_id = v_ssa.staff_member_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'Teacher has an overlapping published timetable entry';
    end if;

    if exists (
      select 1
      from public.timetable_entries other
      join public.teaching_assignments ota
        on ota.id = other.teaching_assignment_id
       and ota.organization_id = other.organization_id
       and ota.school_id = other.school_id
      join public.academic_years oay
        on oay.id = other.academic_year_id
       and oay.organization_id = other.organization_id
       and oay.school_id = other.school_id
      left join public.terms ot
        on ot.id = other.term_id
       and ot.organization_id = other.organization_id
       and ot.school_id = other.school_id
      where other.id <> v_entry.id
        and other.organization_id = new.organization_id
        and other.status = 'published'
        and other.weekday = v_entry.weekday
        and other.start_time < v_entry.end_time
        and v_entry.start_time < other.end_time
        and other.effective_from <= v_entry.semantic_end
        and v_entry.effective_from <= coalesce(other.effective_to, ot.ends_on, oay.ends_on)
        and ota.classroom_id = new.classroom_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'Classroom has an overlapping published timetable entry';
    end if;
  end loop;

  return new;
end
$$;

revoke all on function public.validate_teaching_assignment_timetable_conflicts() from public;
revoke all on function public.validate_teaching_assignment_timetable_conflicts() from anon;
revoke all on function public.validate_teaching_assignment_timetable_conflicts() from authenticated;

create trigger trg_teaching_assignments_validate_timetable_conflicts
before update of staff_school_assignment_id, classroom_id
on public.teaching_assignments
for each row
when (
  old.staff_school_assignment_id is distinct from new.staff_school_assignment_id
  or old.classroom_id is distinct from new.classroom_id
)
execute function public.validate_teaching_assignment_timetable_conflicts();

-- StaffMember is the teacher conflict identity. Protect the upstream mutable
-- SSA link so changing staff_member_id cannot bypass Entry conflict checks.
create function public.validate_staff_assignment_timetable_conflicts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry record;
  v_lock_key bigint;
begin
  if old.staff_member_id is not distinct from new.staff_member_id then
    return new;
  end if;

  for v_lock_key in
    select distinct pg_catalog.hashtextextended(
      'b4f03|02|teacher|' || new.organization_id::text || '|' ||
      new.staff_member_id::text || '|' || te.weekday::text,
      0
    ) lock_key
    from public.teaching_assignments ta
    join public.timetable_entries te
      on te.teaching_assignment_id = ta.id
     and te.organization_id = ta.organization_id
     and te.school_id = ta.school_id
    where ta.staff_school_assignment_id = new.id
      and ta.organization_id = new.organization_id
      and ta.school_id = new.school_id
      and te.status = 'published'
    order by lock_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(v_lock_key);
  end loop;

  for v_entry in
    select te.*,
           coalesce(te.effective_to, t.ends_on, ay.ends_on) semantic_end
    from public.teaching_assignments ta
    join public.timetable_entries te
      on te.teaching_assignment_id = ta.id
     and te.organization_id = ta.organization_id
     and te.school_id = ta.school_id
    join public.academic_years ay
      on ay.id = te.academic_year_id
     and ay.organization_id = te.organization_id
     and ay.school_id = te.school_id
    left join public.terms t
      on t.id = te.term_id
     and t.organization_id = te.organization_id
     and t.school_id = te.school_id
    where ta.staff_school_assignment_id = new.id
      and ta.organization_id = new.organization_id
      and ta.school_id = new.school_id
      and te.status = 'published'
  loop
    if exists (
      select 1
      from public.timetable_entries other
      join public.teaching_assignments ota
        on ota.id = other.teaching_assignment_id
       and ota.organization_id = other.organization_id
       and ota.school_id = other.school_id
      join public.staff_school_assignments ossa
        on ossa.id = ota.staff_school_assignment_id
       and ossa.organization_id = ota.organization_id
       and ossa.school_id = ota.school_id
      join public.academic_years oay
        on oay.id = other.academic_year_id
       and oay.organization_id = other.organization_id
       and oay.school_id = other.school_id
      left join public.terms ot
        on ot.id = other.term_id
       and ot.organization_id = other.organization_id
       and ot.school_id = other.school_id
      where other.id <> v_entry.id
        and other.organization_id = new.organization_id
        and other.status = 'published'
        and other.weekday = v_entry.weekday
        and other.start_time < v_entry.end_time
        and v_entry.start_time < other.end_time
        and other.effective_from <= v_entry.semantic_end
        and v_entry.effective_from <= coalesce(other.effective_to, ot.ends_on, oay.ends_on)
        and ossa.staff_member_id = new.staff_member_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'Teacher has an overlapping published timetable entry';
    end if;
  end loop;

  return new;
end
$$;

revoke all on function public.validate_staff_assignment_timetable_conflicts() from public;
revoke all on function public.validate_staff_assignment_timetable_conflicts() from anon;
revoke all on function public.validate_staff_assignment_timetable_conflicts() from authenticated;

create trigger trg_staff_school_assignments_validate_timetable_conflicts
before update of staff_member_id
on public.staff_school_assignments
for each row
when (old.staff_member_id is distinct from new.staff_member_id)
execute function public.validate_staff_assignment_timetable_conflicts();

-- Final persisted-data postcondition. No row is changed by this migration.
do $$
begin
  if exists (
    select 1
    from public.timetable_entries a
    join public.timetable_entries b
      on a.id < b.id
     and a.organization_id = b.organization_id
     and a.status = 'published'
     and b.status = 'published'
     and a.teaching_assignment_id = b.teaching_assignment_id
     and a.weekday = b.weekday
     and a.start_time < b.end_time
     and b.start_time < a.end_time
    join public.academic_years aay on aay.id = a.academic_year_id
      and aay.organization_id = a.organization_id and aay.school_id = a.school_id
    left join public.terms at on at.id = a.term_id
      and at.organization_id = a.organization_id and at.school_id = a.school_id
    join public.academic_years bay on bay.id = b.academic_year_id
      and bay.organization_id = b.organization_id and bay.school_id = b.school_id
    left join public.terms bt on bt.id = b.term_id
      and bt.organization_id = b.organization_id and bt.school_id = b.school_id
    where a.effective_from <= coalesce(b.effective_to, bt.ends_on, bay.ends_on)
      and b.effective_from <= coalesce(a.effective_to, at.ends_on, aay.ends_on)
  ) then
    raise exception 'B4-F03 postcondition failed: duplicate TeachingAssignment conflict';
  end if;

  if exists (
    select 1
    from public.timetable_entries a
    join public.teaching_assignments ata on ata.id = a.teaching_assignment_id
      and ata.organization_id = a.organization_id and ata.school_id = a.school_id
    join public.staff_school_assignments assa on assa.id = ata.staff_school_assignment_id
      and assa.organization_id = ata.organization_id and assa.school_id = ata.school_id
    join public.timetable_entries b on a.id < b.id
      and a.organization_id = b.organization_id and a.status = 'published' and b.status = 'published'
      and a.weekday = b.weekday and a.start_time < b.end_time and b.start_time < a.end_time
    join public.teaching_assignments bta on bta.id = b.teaching_assignment_id
      and bta.organization_id = b.organization_id and bta.school_id = b.school_id
    join public.staff_school_assignments bssa on bssa.id = bta.staff_school_assignment_id
      and bssa.organization_id = bta.organization_id and bssa.school_id = bta.school_id
      and bssa.staff_member_id = assa.staff_member_id
    join public.academic_years aay on aay.id = a.academic_year_id
      and aay.organization_id = a.organization_id and aay.school_id = a.school_id
    left join public.terms at on at.id = a.term_id
      and at.organization_id = a.organization_id and at.school_id = a.school_id
    join public.academic_years bay on bay.id = b.academic_year_id
      and bay.organization_id = b.organization_id and bay.school_id = b.school_id
    left join public.terms bt on bt.id = b.term_id
      and bt.organization_id = b.organization_id and bt.school_id = b.school_id
    where a.effective_from <= coalesce(b.effective_to, bt.ends_on, bay.ends_on)
      and b.effective_from <= coalesce(a.effective_to, at.ends_on, aay.ends_on)
  ) then
    raise exception 'B4-F03 postcondition failed: teacher conflict';
  end if;

  if exists (
    select 1
    from public.timetable_entries a
    join public.teaching_assignments ata on ata.id = a.teaching_assignment_id
      and ata.organization_id = a.organization_id and ata.school_id = a.school_id
    join public.timetable_entries b on a.id < b.id
      and a.organization_id = b.organization_id and a.status = 'published' and b.status = 'published'
      and a.weekday = b.weekday and a.start_time < b.end_time and b.start_time < a.end_time
    join public.teaching_assignments bta on bta.id = b.teaching_assignment_id
      and bta.organization_id = b.organization_id and bta.school_id = b.school_id
      and bta.classroom_id = ata.classroom_id
    join public.academic_years aay on aay.id = a.academic_year_id
      and aay.organization_id = a.organization_id and aay.school_id = a.school_id
    left join public.terms at on at.id = a.term_id
      and at.organization_id = a.organization_id and at.school_id = a.school_id
    join public.academic_years bay on bay.id = b.academic_year_id
      and bay.organization_id = b.organization_id and bay.school_id = b.school_id
    left join public.terms bt on bt.id = b.term_id
      and bt.organization_id = b.organization_id and bt.school_id = b.school_id
    where a.effective_from <= coalesce(b.effective_to, bt.ends_on, bay.ends_on)
      and b.effective_from <= coalesce(a.effective_to, at.ends_on, aay.ends_on)
  ) then
    raise exception 'B4-F03 postcondition failed: Classroom conflict';
  end if;
end
$$;

comment on function public.validate_timetable_conflicts() is
  'B4-F03 published Entry conflict serialization and validation.';
comment on function public.validate_teaching_assignment_timetable_conflicts() is
  'B4-F03 reverse conflict guard for derived TA teacher/Classroom identity.';
comment on function public.validate_staff_assignment_timetable_conflicts() is
  'B4-F03 reverse teacher conflict guard for mutable SSA StaffMember identity.';
