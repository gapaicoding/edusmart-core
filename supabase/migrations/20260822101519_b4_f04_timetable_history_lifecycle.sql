-- EduSmart Core V1 / B4-F04
-- Timetable history, lifecycle, and atomic published successor replacement.
--
-- Published is approval state. Inclusive effective dates determine when a
-- published version is authoritative. An ended published row remains valid
-- immutable history; inactive means immediate withdrawal/non-participation.

do $$
declare
  v_entry_count bigint;
  v_entry_hash text;
begin
  if to_regclass('public.timetable_entries') is null
     or to_regclass('public.timetable_periods') is null
     or to_regclass('public.schools') is null
  then
    raise exception using errcode = '55000',
      message = 'Cannot apply B4-F04: required foundation tables are missing';
  end if;

  if (
    select count(*)
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'timetable_entries'
      and c.column_name = any (array[
        'id','organization_id','school_id','academic_year_id','term_id',
        'teaching_assignment_id','timetable_period_id','weekday','start_time',
        'end_time','room_label','effective_from','effective_to','status',
        'created_at','updated_at'
      ])
  ) <> 16 or not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.timetable_entries'::regclass
      and c.conname = 'timetable_entries_status_check'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%draft%'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%published%'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%inactive%'
  ) then
    raise exception using errcode = '55000',
      message = 'Cannot apply B4-F04: TimetableEntry columns or statuses differ';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'timetable_entries'
      and c.column_name = 'row_version'
  ) or to_regprocedure('public.set_timetable_entry_row_version()') is not null
     or exists (
       select 1 from pg_catalog.pg_trigger t
       where t.tgrelid = 'public.timetable_entries'::regclass
         and t.tgname = 'trg_timetable_entries_row_version'
         and not t.tgisinternal
     )
  then
    raise exception using errcode = '55000',
      message = 'Cannot apply B4-F04: row-version objects already exist';
  end if;

  if to_regprocedure('public.validate_timetable_consistency()') is null
     or to_regprocedure('public.validate_timetable_conflicts()') is null
     or to_regprocedure('public.guard_timetable_transition()') is null
  then
    raise exception using errcode = '55000',
      message = 'Cannot apply B4-F04: required F02/F03 functions are missing';
  end if;

  if to_regprocedure(
    'public.replace_timetable_entry(uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'
  ) is not null
     or to_regprocedure(
       'public.replace_timetable_entry(uuid,uuid,uuid,timestamp with time zone,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'
     ) is not null
     or to_regprocedure(
       'public.replace_timetable_entry(uuid,uuid,uuid,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'
     ) is not null
  then
    raise exception using errcode = '55000',
      message = 'Cannot apply B4-F04: replace_timetable_entry already exists';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.timetable_entries'::regclass
      and t.tgname = 'trg_timetable_entries_validate_consistency'
      and not t.tgisinternal
  ) or not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.timetable_entries'::regclass
      and t.tgname = 'trg_timetable_entries_validate_schedule_conflicts'
      and not t.tgisinternal
  ) then
    raise exception using errcode = '55000',
      message = 'Cannot apply B4-F04: required F02/F03 triggers are missing';
  end if;

  if exists (
    select 1
    from public.timetable_entries e
    join public.schools s
      on s.id = e.school_id
     and s.organization_id = e.organization_id
    left join pg_catalog.pg_timezone_names z on z.name = s.timezone
    where z.name is null
  ) or exists (
    select 1
    from public.timetable_entries e
    left join public.schools s
      on s.id = e.school_id
     and s.organization_id = e.organization_id
    where s.id is null
  ) then
    raise exception using errcode = '23514',
      message = 'Cannot apply B4-F04: TimetableEntry School timezone is invalid';
  end if;

  if exists (
    select 1 from public.timetable_entries e
    join public.teaching_assignments ta on ta.id = e.teaching_assignment_id
    where (e.organization_id, e.school_id, e.academic_year_id)
       is distinct from (ta.organization_id, ta.school_id, ta.academic_year_id)
  ) or exists (
    select 1 from public.timetable_entries e
    join public.teaching_assignments ta on ta.id = e.teaching_assignment_id
    where ta.term_id is not null and e.term_id is distinct from ta.term_id
  ) or exists (
    select 1 from public.timetable_entries e
    join public.timetable_periods p on p.id = e.timetable_period_id
    where (e.organization_id,e.school_id,e.academic_year_id,e.start_time,e.end_time)
       is distinct from (p.organization_id,p.school_id,p.academic_year_id,p.start_time,p.end_time)
  ) then
    raise exception using errcode = '23514',
      message = 'Cannot apply B4-F04: existing timetable integrity is invalid';
  end if;

  if exists (
    select 1
    from public.timetable_entries e
    join public.teaching_assignments ta on ta.id = e.teaching_assignment_id
    join public.academic_years ay on ay.id = e.academic_year_id
    left join public.terms t on t.id = e.term_id
    where (ta.term_id is not null and e.term_id is distinct from ta.term_id)
       or (e.term_id is not null and t.academic_year_id is distinct from e.academic_year_id)
       or e.effective_from < ay.starts_on
       or e.effective_from > ay.ends_on
       or (e.effective_to is not null and e.effective_to > ay.ends_on)
       or (e.term_id is not null and (
         e.effective_from < t.starts_on
         or e.effective_from > t.ends_on
         or (e.effective_to is not null and e.effective_to > t.ends_on)
       ))
       or e.effective_from < ta.starts_on
       or (ta.ends_on is not null and
         coalesce(e.effective_to, t.ends_on, ay.ends_on) > ta.ends_on)
  ) then
    raise exception using errcode = '23514',
      message = 'Cannot apply B4-F04: existing timetable date integrity is invalid';
  end if;

  if exists (
    with enriched as (
      select e.*, ta.classroom_id, ssa.staff_member_id,
             coalesce(e.effective_to, t.ends_on, ay.ends_on) as semantic_end
      from public.timetable_entries e
      join public.teaching_assignments ta on ta.id = e.teaching_assignment_id
      join public.staff_school_assignments ssa
        on ssa.id = ta.staff_school_assignment_id
      join public.academic_years ay on ay.id = e.academic_year_id
      left join public.terms t on t.id = e.term_id
      where e.status = 'published'
    )
    select 1
    from enriched a
    join enriched b on a.id < b.id
    where a.organization_id = b.organization_id
      and a.weekday = b.weekday
      and a.start_time < b.end_time
      and b.start_time < a.end_time
      and a.effective_from <= b.semantic_end
      and b.effective_from <= a.semantic_end
      and (
        a.teaching_assignment_id = b.teaching_assignment_id
        or a.staff_member_id = b.staff_member_id
        or a.classroom_id = b.classroom_id
      )
  ) then
    raise exception using errcode = '23514',
      message = 'Cannot apply B4-F04: existing published timetable conflicts exist';
  end if;

  select count(*), md5(coalesce(jsonb_agg(jsonb_build_array(
    e.id,e.organization_id,e.school_id,e.academic_year_id,e.term_id,
    e.teaching_assignment_id,e.weekday,e.start_time,e.end_time,e.room_label,
    e.effective_from,e.effective_to,e.status,e.created_at,e.updated_at,
    e.timetable_period_id
  ) order by e.id)::text, '[]'))
    into v_entry_count, v_entry_hash
  from public.timetable_entries e;
  perform pg_catalog.set_config('edusmart.b4f04_entry_count', v_entry_count::text, true);
  perform pg_catalog.set_config('edusmart.b4f04_entry_hash', v_entry_hash, true);
end
$$;

alter table public.timetable_entries
  add column row_version bigint not null default 1,
  add constraint timetable_entries_row_version_check
    check (row_version >= 1);

create function public.set_timetable_entry_row_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.row_version := 1;
    return new;
  end if;

  if old.row_version is null or old.row_version < 1 then
    raise exception using errcode = '23514',
      message = 'TimetableEntry row version is invalid';
  end if;

  if old.row_version = 9223372036854775807::bigint then
    raise exception using errcode = '23514',
      message = 'TimetableEntry row version is exhausted';
  end if;

  -- DB-owned optimistic concurrency metadata: caller input is ignored and
  -- every successful UPDATE advances exactly once without relying on time.
  new.row_version := old.row_version + 1;
  return new;
end
$$;

revoke all on function public.set_timetable_entry_row_version() from public;
revoke all on function public.set_timetable_entry_row_version() from anon;
revoke all on function public.set_timetable_entry_row_version() from authenticated;
grant execute on function public.set_timetable_entry_row_version() to service_role;

create trigger trg_timetable_entries_row_version
before insert or update on public.timetable_entries
for each row execute function public.set_timetable_entry_row_version();

comment on function public.set_timetable_entry_row_version() is
  'B4-F04: assigns row_version 1 on INSERT and strictly increments it once on every successful TimetableEntry UPDATE.';
comment on trigger trg_timetable_entries_row_version
on public.timetable_entries is
  'B4-F04: DB-owned optimistic concurrency version; runs after history and before tenant/updated_at/validation triggers by lexical name.';

-- Preserve F02 grandfathering for the predecessor-only pure range closure.
-- All F02 parent/date checks still run; only its final inactive-TA material
-- classification treats this monotonic closure as non-material history work.
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

  if tg_op = 'UPDATE'
     and old.status = 'published'
     and new.status = 'published'
     and new.effective_to is not null
     and new.effective_to is distinct from old.effective_to
     and (old.effective_to is null or new.effective_to < old.effective_to)
     and (old.organization_id,old.school_id,old.academic_year_id,old.term_id,
          old.teaching_assignment_id,old.timetable_period_id,old.weekday,
          old.start_time,old.end_time,old.room_label,old.effective_from,
          old.created_at)
         is not distinct from
         (new.organization_id,new.school_id,new.academic_year_id,new.term_id,
          new.teaching_assignment_id,new.timetable_period_id,new.weekday,
          new.start_time,new.end_time,new.room_label,new.effective_from,
          new.created_at)
  then
    v_material_write := false;
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
grant execute on function public.validate_timetable_consistency() to service_role;

-- Replaced below with the complete installed B4-F03 definition plus one
-- narrowly scoped structural early-return before any parent/advisory locks.
create or replace function public.validate_timetable_conflicts()
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

  -- B4-F04: a structurally pure published effective-end shortening only
  -- removes conflict space. Before commit competitors see the prior longer
  -- range; after commit retained-range conflicts remain visible. Returning
  -- here avoids holding OLD advisory keys before a replacement successor
  -- acquires its normal complete sorted F03 key set.
  if tg_op = 'UPDATE'
     and old.status = 'published'
     and new.status = 'published'
     and new.effective_to is not null
     and new.effective_to is distinct from old.effective_to
     and (old.effective_to is null or new.effective_to < old.effective_to)
     and (old.organization_id,old.school_id,old.academic_year_id,old.term_id,
          old.teaching_assignment_id,old.timetable_period_id,old.weekday,
          old.start_time,old.end_time,old.room_label,old.effective_from,
          old.created_at)
         is not distinct from
         (new.organization_id,new.school_id,new.academic_year_id,new.term_id,
          new.teaching_assignment_id,new.timetable_period_id,new.weekday,
          new.start_time,new.end_time,new.room_label,new.effective_from,
          new.created_at)
  then
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
grant execute on function public.validate_timetable_conflicts() to service_role;

comment on function public.validate_timetable_conflicts() is
  'B4-F03 conflict enforcement with B4-F04 early-return for structurally pure published effective-end shortening.';

create or replace function public.validate_timetable_history_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_school_timezone text;
  v_business_today date;
  v_old_semantic_end date;
  v_room_only boolean;
  v_identity_same boolean;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception using errcode = '23514',
        message = 'Published or inactive TimetableEntry history cannot be deleted';
    end if;
    return old;
  end if;

  -- Inactive is terminal. Reject the statement itself: the existing
  -- updated_at trigger would otherwise turn an apparent no-op into a write.
  if old.status = 'inactive' then
    raise exception using errcode = '23514',
      message = 'Inactive TimetableEntry history cannot be updated';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception using errcode = '23514',
      message = 'TimetableEntry created_at is immutable';
  end if;

  -- Draft remains mutable planning state and may publish or become inactive.
  if old.status = 'draft' then
    return new;
  end if;

  if old.status <> 'published' then
    raise exception using errcode = '23514',
      message = 'TimetableEntry lifecycle state is not replaceable';
  end if;

  if new.status = 'draft' then
    raise exception using errcode = '23514',
      message = 'Published TimetableEntry cannot return to draft';
  end if;

  v_room_only :=
    (old.organization_id,old.school_id,old.academic_year_id,old.term_id,
     old.teaching_assignment_id,old.timetable_period_id,old.weekday,
     old.start_time,old.end_time,old.effective_from,old.effective_to,
     old.status,old.created_at)
    is not distinct from
    (new.organization_id,new.school_id,new.academic_year_id,new.term_id,
     new.teaching_assignment_id,new.timetable_period_id,new.weekday,
     new.start_time,new.end_time,new.effective_from,new.effective_to,
     new.status,new.created_at);

  if new.status = 'published' and v_room_only then
    return new;
  end if;

  select s.timezone
    into v_school_timezone
  from public.schools s
  where s.id = old.school_id
    and s.organization_id = old.organization_id
  for share;

  if not found or not exists (
    select 1 from pg_catalog.pg_timezone_names z
    where z.name = v_school_timezone
  ) then
    raise exception using errcode = '23514',
      message = 'TimetableEntry School timezone is invalid';
  end if;

  v_business_today :=
    (pg_catalog.transaction_timestamp() at time zone v_school_timezone)::date;

  select coalesce(old.effective_to, t.ends_on, ay.ends_on)
    into v_old_semantic_end
  from public.academic_years ay
  left join public.terms t
    on t.id = old.term_id
   and t.organization_id = old.organization_id
   and t.school_id = old.school_id
  where ay.id = old.academic_year_id
    and ay.organization_id = old.organization_id
    and ay.school_id = old.school_id;

  if not found or v_old_semantic_end is null then
    raise exception using errcode = '23514',
      message = 'TimetableEntry semantic effective end cannot be resolved';
  end if;

  v_identity_same :=
    (old.organization_id,old.school_id,old.academic_year_id,old.term_id,
     old.teaching_assignment_id,old.timetable_period_id,old.weekday,
     old.start_time,old.end_time,old.room_label,old.effective_from,
     old.created_at)
    is not distinct from
    (new.organization_id,new.school_id,new.academic_year_id,new.term_id,
     new.teaching_assignment_id,new.timetable_period_id,new.weekday,
     new.start_time,new.end_time,new.room_label,new.effective_from,
     new.created_at);

  if new.status = 'published' then
    if v_identity_same
       and new.effective_to is not null
       and new.effective_to is distinct from old.effective_to
       and new.effective_to < v_old_semantic_end
       and new.effective_to >= old.effective_from
       and new.effective_to >= (v_business_today - 1)
    then
      return new;
    end if;

    raise exception using errcode = '23514',
      message = 'Published TimetableEntry material history cannot be rewritten';
  end if;

  if new.status = 'inactive' then
    if not v_identity_same then
      raise exception using errcode = '23514',
        message = 'TimetableEntry withdrawal cannot change material identity';
    end if;

    if v_old_semantic_end < v_business_today then
      raise exception using errcode = '23514',
        message = 'Ended published TimetableEntry must remain published history';
    end if;

    if old.effective_from < v_business_today then
      if new.effective_to is distinct from (v_business_today - 1) then
        raise exception using errcode = '23514',
          message = 'Current TimetableEntry withdrawal must close at the prior business day';
      end if;
    elsif new.effective_to is distinct from old.effective_to then
      raise exception using errcode = '23514',
        message = 'Never-effective TimetableEntry withdrawal must preserve its dates';
    end if;

    return new;
  end if;

  raise exception using errcode = '23514',
    message = 'TimetableEntry lifecycle transition is forbidden';
end
$$;

revoke all on function public.validate_timetable_history_lifecycle() from public;
revoke all on function public.validate_timetable_history_lifecycle() from anon;
revoke all on function public.validate_timetable_history_lifecycle() from authenticated;
grant execute on function public.validate_timetable_history_lifecycle() to service_role;

create trigger trg_timetable_entries_history_lifecycle
before update or delete on public.timetable_entries
for each row execute function public.validate_timetable_history_lifecycle();

comment on trigger trg_timetable_entries_history_lifecycle
on public.timetable_entries is
  'B4-F04: runs before tenant/updated_at/validation triggers by lexical name and protects immutable history on UPDATE/DELETE.';

comment on function public.validate_timetable_history_lifecycle() is
  'B4-F04: preserves published range history, makes inactive terminal, and blocks published/inactive hard delete.';

create or replace function public.guard_timetable_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_classroom_id uuid;
  v_pure_end_change boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  v_pure_end_change :=
    old.status = 'published'
    and new.status = 'published'
    and new.effective_to is not null
    and new.effective_to is distinct from old.effective_to
    and (old.effective_to is null or new.effective_to < old.effective_to)
    and (old.organization_id,old.school_id,old.academic_year_id,old.term_id,
         old.teaching_assignment_id,old.timetable_period_id,old.weekday,
         old.start_time,old.end_time,old.room_label,old.effective_from,
         old.created_at)
        is not distinct from
        (new.organization_id,new.school_id,new.academic_year_id,new.term_id,
         new.teaching_assignment_id,new.timetable_period_id,new.weekday,
         new.start_time,new.end_time,new.room_label,new.effective_from,
         new.created_at);

  if old.status is not distinct from new.status and not v_pure_end_change then
    return new;
  end if;

  select ta.classroom_id into v_classroom_id
  from public.teaching_assignments ta
  where ta.id = old.teaching_assignment_id
    and ta.organization_id = old.organization_id
    and ta.school_id = old.school_id;

  if not found then
    raise exception using errcode = '23514',
      message = 'TimetableEntry authorization scope cannot be resolved';
  end if;

  if new.status = 'published'
     and old.status is distinct from new.status
     and not public.has_permission(
       'schedule.publish', old.organization_id, old.school_id, v_classroom_id
     )
  then
    raise exception using errcode = '42501',
      message = 'Missing schedule.publish permission';
  end if;

  if (new.status = 'inactive' and old.status is distinct from new.status)
     or v_pure_end_change
  then
    if not public.has_permission(
      'schedule.archive', old.organization_id, old.school_id, v_classroom_id
    ) then
      raise exception using errcode = '42501',
        message = 'Missing schedule.archive permission';
    end if;
  end if;

  return new;
end
$$;

revoke all on function public.guard_timetable_transition() from public;
revoke all on function public.guard_timetable_transition() from anon;
revoke all on function public.guard_timetable_transition() from authenticated;
grant execute on function public.guard_timetable_transition() to service_role;

create function public.replace_timetable_entry(
  p_timetable_entry_id uuid,
  p_organization_id uuid,
  p_school_id uuid,
  p_expected_row_version bigint,
  p_cutover_date date,
  p_term_id uuid,
  p_teaching_assignment_id uuid,
  p_timetable_period_id uuid,
  p_weekday smallint,
  p_room_label text default null,
  p_inherit_room_label boolean default true,
  p_successor_effective_to date default null,
  p_inherit_effective_to boolean default true
)
returns table(timetable_entry_id uuid, replacement_mode text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.timetable_entries%rowtype;
  v_school_timezone text;
  v_business_today date;
  v_old_semantic_end date;
  v_period_start time without time zone;
  v_period_end time without time zone;
  v_new_id uuid;
  v_new_effective_to date;
  v_new_room_label text;
  v_mode text;
begin
  select e.* into v_old
  from public.timetable_entries e
  where e.id = p_timetable_entry_id
    and e.organization_id = p_organization_id
    and e.school_id = p_school_id
  for update;

  if not found then
    raise exception using errcode = '23514',
      message = 'TimetableEntry is unavailable for replacement';
  end if;

  if p_expected_row_version is null or p_expected_row_version < 1 then
    raise exception using errcode = '23514',
      message = 'TimetableEntry expected row version is invalid';
  end if;

  -- Compare the DB-owned version only after locking the current row. Mode A
  -- keeps the predecessor published, so status alone cannot detect a stale
  -- waiter after another replacement has shortened the predecessor range.
  if v_old.row_version is distinct from p_expected_row_version then
    raise exception using errcode = '23514',
      message = 'TimetableEntry changed since it was loaded; reload before replacing';
  end if;

  if v_old.status <> 'published' then
    raise exception using errcode = '23514',
      message = 'TimetableEntry is no longer published and replaceable';
  end if;

  if p_cutover_date is null
     or p_inherit_room_label is null
     or p_inherit_effective_to is null
  then
    raise exception using errcode = '23514',
      message = 'TimetableEntry replacement inputs are incomplete';
  end if;

  select s.timezone into v_school_timezone
  from public.schools s
  where s.id = v_old.school_id
    and s.organization_id = v_old.organization_id
  for share;

  if not found or not exists (
    select 1 from pg_catalog.pg_timezone_names z
    where z.name = v_school_timezone
  ) then
    raise exception using errcode = '23514',
      message = 'TimetableEntry School timezone is invalid';
  end if;

  v_business_today :=
    (pg_catalog.transaction_timestamp() at time zone v_school_timezone)::date;

  select coalesce(v_old.effective_to, t.ends_on, ay.ends_on)
    into v_old_semantic_end
  from public.academic_years ay
  left join public.terms t
    on t.id = v_old.term_id
   and t.organization_id = v_old.organization_id
   and t.school_id = v_old.school_id
  where ay.id = v_old.academic_year_id
    and ay.organization_id = v_old.organization_id
    and ay.school_id = v_old.school_id;

  if not found or v_old_semantic_end is null then
    raise exception using errcode = '23514',
      message = 'TimetableEntry semantic effective end cannot be resolved';
  end if;

  if p_cutover_date < v_business_today then
    raise exception using errcode = '23514',
      message = 'TimetableEntry replacement cutover cannot be backdated';
  end if;
  if p_cutover_date < v_old.effective_from then
    raise exception using errcode = '23514',
      message = 'TimetableEntry replacement cutover precedes predecessor start';
  end if;
  if p_cutover_date > v_old_semantic_end then
    raise exception using errcode = '23514',
      message = 'TimetableEntry replacement cutover exceeds predecessor end';
  end if;
  if p_cutover_date = v_old.effective_from
     and p_cutover_date = v_business_today
  then
    raise exception using errcode = '23514',
      message = 'Current-day same-start TimetableEntry replacement is ambiguous';
  end if;

  if p_cutover_date > v_old.effective_from then
    update public.timetable_entries e
    set effective_to = p_cutover_date - 1
    where e.id = v_old.id
      and e.organization_id = v_old.organization_id
      and e.school_id = v_old.school_id;
    if not found then
      raise exception using errcode = '23514',
        message = 'TimetableEntry predecessor closure was not applied';
    end if;
    v_mode := 'published_range_cutover';
  elsif p_cutover_date = v_old.effective_from
        and v_old.effective_from > v_business_today
  then
    update public.timetable_entries e
    set status = 'inactive'
    where e.id = v_old.id
      and e.organization_id = v_old.organization_id
      and e.school_id = v_old.school_id;
    if not found then
      raise exception using errcode = '23514',
        message = 'TimetableEntry predecessor withdrawal was not applied';
    end if;
    v_mode := 'future_same_start_supersession';
  else
    raise exception using errcode = '23514',
      message = 'TimetableEntry replacement cutover is not supported';
  end if;

  select p.start_time, p.end_time
    into v_period_start, v_period_end
  from public.timetable_periods p
  where p.id = p_timetable_period_id
    and p.organization_id = v_old.organization_id
    and p.school_id = v_old.school_id
    and p.academic_year_id = v_old.academic_year_id;

  if not found then
    raise exception using errcode = '23514',
      message = 'Successor TimetablePeriod is outside predecessor scope';
  end if;

  v_new_effective_to := case
    when p_inherit_effective_to then v_old.effective_to
    else p_successor_effective_to
  end;
  v_new_room_label := case
    when p_inherit_room_label then v_old.room_label
    else p_room_label
  end;
  v_new_id := pg_catalog.gen_random_uuid();

  insert into public.timetable_entries (
    id,organization_id,school_id,academic_year_id,term_id,
    teaching_assignment_id,timetable_period_id,weekday,start_time,end_time,
    room_label,effective_from,effective_to,status
  ) values (
    v_new_id,v_old.organization_id,v_old.school_id,v_old.academic_year_id,
    p_term_id,p_teaching_assignment_id,p_timetable_period_id,p_weekday,
    v_period_start,v_period_end,v_new_room_label,p_cutover_date,
    v_new_effective_to,'published'
  );

  return query select v_new_id, v_mode;
end
$$;

revoke all on function public.replace_timetable_entry(
  uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean
) from public;
revoke all on function public.replace_timetable_entry(
  uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean
) from anon;
grant execute on function public.replace_timetable_entry(
  uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean
) to authenticated;
grant execute on function public.replace_timetable_entry(
  uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean
) to service_role;

comment on function public.replace_timetable_entry(
  uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean
) is 'B4-F04 SECURITY INVOKER atomic successor replacement; locks the predecessor, verifies the required DB-owned row_version token, preserves published ranges, and returns a pre-generated successor UUID.';

do $$
declare
  v_entry_count bigint;
  v_entry_hash text;
begin
  select count(*), md5(coalesce(jsonb_agg(jsonb_build_array(
    e.id,e.organization_id,e.school_id,e.academic_year_id,e.term_id,
    e.teaching_assignment_id,e.weekday,e.start_time,e.end_time,e.room_label,
    e.effective_from,e.effective_to,e.status,e.created_at,e.updated_at,
    e.timetable_period_id
  ) order by e.id)::text, '[]'))
    into v_entry_count, v_entry_hash
  from public.timetable_entries e;

  if v_entry_count::text is distinct from
       pg_catalog.current_setting('edusmart.b4f04_entry_count', true)
     or v_entry_hash is distinct from
       pg_catalog.current_setting('edusmart.b4f04_entry_hash', true)
  then
    raise exception using errcode = '23514',
      message = 'B4-F04 unexpectedly changed TimetableEntry data';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_attrdef d
      on d.adrelid = a.attrelid
     and d.adnum = a.attnum
    where a.attrelid = 'public.timetable_entries'::regclass
      and a.attname = 'row_version'
      and not a.attisdropped
      and a.atttypid = 'pg_catalog.int8'::regtype
      and a.attnotnull
      and pg_catalog.pg_get_expr(d.adbin, d.adrelid)
          in ('1', '1::bigint', '(1)::bigint', '''1''::bigint')
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.timetable_entries'::regclass
      and c.conname = 'timetable_entries_row_version_check'
      and c.contype = 'c'
      and c.convalidated
      and pg_catalog.pg_get_constraintdef(c.oid) like '%row_version >= 1%'
  ) or exists (
    select 1 from public.timetable_entries e
    where e.row_version is distinct from 1::bigint
  ) then
    raise exception using errcode = '55000',
      message = 'B4-F04 TimetableEntry row-version schema is invalid';
  end if;

  if to_regprocedure('public.set_timetable_entry_row_version()') is null
     or (
       select count(*)
       from pg_catalog.pg_trigger t
       where t.tgrelid = 'public.timetable_entries'::regclass
         and t.tgname = 'trg_timetable_entries_row_version'
         and not t.tgisinternal
         and t.tgenabled <> 'D'
         and t.tgtype = 23
     ) <> 1
  then
    raise exception using errcode = '55000',
      message = 'B4-F04 TimetableEntry row-version trigger was not installed';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.timetable_entries'::regclass
      and t.tgname = 'trg_timetable_entries_history_lifecycle'
      and not t.tgisinternal
  ) or to_regprocedure(
    'public.replace_timetable_entry(uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'
  ) is null
     or to_regprocedure(
       'public.replace_timetable_entry(uuid,uuid,uuid,timestamp with time zone,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'
     ) is not null
     or to_regprocedure(
       'public.replace_timetable_entry(uuid,uuid,uuid,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'
     ) is not null
  then
    raise exception using errcode = '55000',
      message = 'B4-F04 lifecycle objects were not installed';
  end if;
end
$$;
