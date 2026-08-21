-- B4-F01 — Timetable Period Foundation
-- Normalizes the existing raw timetable times into AcademicYear-scoped school
-- periods. timetable_entries.start_time/end_time remain transitional legacy
-- columns; timetable_periods is the time source of truth for future writes.

do $$
begin
  if to_regclass('public.timetable_periods') is not null then
    raise exception 'Cannot apply B4-F01: public.timetable_periods already exists';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'timetable_entries'
      and column_name = 'timetable_period_id'
  ) then
    raise exception 'Cannot apply B4-F01: timetable_entries.timetable_period_id already exists';
  end if;

  if not exists (select 1 from pg_extension where extname = 'btree_gist') then
    raise exception 'Cannot apply B4-F01: required btree_gist extension is unavailable';
  end if;
end
$$;

-- Fail before any backfill if distinct legacy slots overlap inside one
-- Organization/School/AcademicYear.
do $$
begin
  if exists (
    with slots as (
      select distinct
        organization_id,
        school_id,
        academic_year_id,
        start_time,
        end_time
      from public.timetable_entries
    )
    select 1
    from slots a
    join slots b
      on b.organization_id = a.organization_id
     and b.school_id = a.school_id
     and b.academic_year_id = a.academic_year_id
     and (a.start_time, a.end_time) < (b.start_time, b.end_time)
     and a.start_time < b.end_time
     and b.start_time < a.end_time
  ) then
    raise exception 'B4-F01 BACKFILL BLOCKED — LEGACY PERIOD DATA REQUIRES DOMAIN REVIEW';
  end if;
end
$$;

create table public.timetable_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  sequence smallint not null,
  label text not null,
  start_time time not null,
  end_time time not null,
  period_type text not null default 'instruction',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timetable_periods_sequence_check check (sequence > 0),
  constraint timetable_periods_label_check check (btrim(label) <> ''),
  constraint timetable_periods_time_check check (end_time > start_time),
  constraint timetable_periods_type_check
    check (period_type in ('instruction', 'break', 'assembly', 'other')),
  constraint timetable_periods_status_check
    check (status in ('draft', 'active', 'inactive')),
  constraint timetable_periods_entry_identity_key
    unique (
      id,
      organization_id,
      school_id,
      academic_year_id,
      start_time,
      end_time
    ),
  constraint timetable_periods_year_fk
    foreign key (academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id)
    on delete restrict,
  constraint timetable_periods_active_time_no_overlap
    exclude using gist (
      organization_id with =,
      school_id with =,
      academic_year_id with =,
      (numrange(
        extract(epoch from start_time),
        extract(epoch from end_time),
        '[)'
      )) with &&
    )
    where (status = 'active')
);

create index idx_timetable_periods_school_year_sequence
on public.timetable_periods (
  organization_id,
  school_id,
  academic_year_id,
  sequence
);

create unique index uq_timetable_periods_active_label
on public.timetable_periods (
  organization_id,
  school_id,
  academic_year_id,
  lower(btrim(label))
)
where status = 'active';

create unique index uq_timetable_periods_active_sequence
on public.timetable_periods (
  organization_id,
  school_id,
  academic_year_id,
  sequence
)
where status = 'active';

create trigger trg_timetable_periods_updated_at
before update on public.timetable_periods
for each row execute function public.set_updated_at();

create trigger trg_timetable_periods_tenant_immutable
before update on public.timetable_periods
for each row execute function public.prevent_tenant_boundary_change();

create function public.guard_timetable_period_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'inactive' and new.status <> 'inactive' then
    raise exception 'Inactive TimetablePeriod cannot be reactivated';
  end if;

  if old.status = 'active' and new.status = 'draft' then
    raise exception 'Active TimetablePeriod cannot return to draft';
  end if;

  if new.status = 'inactive'
     and old.status is distinct from new.status
     and auth.uid() is not null
     and not public.has_permission(
       'schedule.archive',
       old.organization_id,
       old.school_id
     )
  then
    raise exception 'Missing schedule.archive permission';
  end if;

  -- The TimetableEntry composite FK is authoritative for referenced Period
  -- tenant/year/time identity. This guard covers the separate semantic type
  -- identity, which is intentionally not duplicated into TimetableEntry.
  if old.period_type is distinct from new.period_type
  and exists (
    select 1
    from public.timetable_entries te
    where te.timetable_period_id = old.id
  )
  then
    raise exception 'Referenced TimetablePeriod type identity cannot be changed';
  end if;

  return new;
end
$$;

revoke all on function public.guard_timetable_period_history() from public;
revoke all on function public.guard_timetable_period_history() from anon;
revoke all on function public.guard_timetable_period_history() from authenticated;

create trigger trg_timetable_periods_history_guard
before update on public.timetable_periods
for each row execute function public.guard_timetable_period_history();

alter table public.timetable_entries
  add column timetable_period_id uuid;

-- One active instructional Period is created for every distinct legacy slot.
-- Labels and sequences are deterministic within Organization/School/AY.
with legacy_slots as (
  select distinct
    organization_id,
    school_id,
    academic_year_id,
    start_time,
    end_time
  from public.timetable_entries
),
numbered_slots as (
  select
    organization_id,
    school_id,
    academic_year_id,
    start_time,
    end_time,
    row_number() over (
      partition by organization_id, school_id, academic_year_id
      order by start_time, end_time
    )::smallint as period_sequence
  from legacy_slots
)
insert into public.timetable_periods (
  organization_id,
  school_id,
  academic_year_id,
  sequence,
  label,
  start_time,
  end_time,
  period_type,
  status
)
select
  organization_id,
  school_id,
  academic_year_id,
  period_sequence,
  'Period ' || period_sequence::text,
  start_time,
  end_time,
  'instruction',
  'active'
from numbered_slots;

update public.timetable_entries te
set timetable_period_id = tp.id
from public.timetable_periods tp
where tp.organization_id = te.organization_id
  and tp.school_id = te.school_id
  and tp.academic_year_id = te.academic_year_id
  and tp.start_time = te.start_time
  and tp.end_time = te.end_time
  and tp.status = 'active';

do $$
begin
  if exists (
    select 1
    from public.timetable_entries
    where timetable_period_id is null
  ) then
    raise exception 'Cannot apply B4-F01: unmatched legacy TimetableEntry exists';
  end if;

  if exists (
    select 1
    from public.timetable_entries te
    join public.timetable_periods tp
      on tp.organization_id = te.organization_id
     and tp.school_id = te.school_id
     and tp.academic_year_id = te.academic_year_id
     and tp.start_time = te.start_time
     and tp.end_time = te.end_time
     and tp.status = 'active'
    group by te.id
    having count(*) <> 1
  ) then
    raise exception 'Cannot apply B4-F01: legacy TimetableEntry period mapping is not unique';
  end if;
end
$$;

alter table public.timetable_entries
  alter column timetable_period_id set not null,
  add constraint timetable_entries_period_fk
    foreign key (
      timetable_period_id,
      organization_id,
      school_id,
      academic_year_id,
      start_time,
      end_time
    )
    references public.timetable_periods (
      id,
      organization_id,
      school_id,
      academic_year_id,
      start_time,
      end_time
    )
    on delete restrict;

alter table public.timetable_periods enable row level security;

create policy timetable_periods_select
on public.timetable_periods
for select
to authenticated
using (
  public.has_permission(
    'schedule.read',
    organization_id,
    school_id
  )
);

create policy timetable_periods_insert
on public.timetable_periods
for insert
to authenticated
with check (
  public.has_permission(
    'schedule.create',
    organization_id,
    school_id
  )
  and (
    status <> 'inactive'
    or public.has_permission(
      'schedule.archive',
      organization_id,
      school_id
    )
  )
);

create policy timetable_periods_update
on public.timetable_periods
for update
to authenticated
using (
  public.has_permission(
    'schedule.update',
    organization_id,
    school_id
  )
)
with check (
  public.has_permission(
    'schedule.update',
    organization_id,
    school_id
  )
);

grant select, insert, update on public.timetable_periods to authenticated;

-- Transactional postconditions. Any failure rolls back the entire migration.
do $$
begin
  if (
    select count(*)
    from public.timetable_entries te
    join public.timetable_periods tp
      on tp.id = te.timetable_period_id
     and tp.organization_id = te.organization_id
     and tp.school_id = te.school_id
     and tp.academic_year_id = te.academic_year_id
     and tp.start_time = te.start_time
     and tp.end_time = te.end_time
  ) <> (select count(*) from public.timetable_entries)
  then
    raise exception 'Cannot apply B4-F01: TimetableEntry/Period integrity validation failed';
  end if;

  if exists (
    select 1
    from public.timetable_periods a
    join public.timetable_periods b
      on b.organization_id = a.organization_id
     and b.school_id = a.school_id
     and b.academic_year_id = a.academic_year_id
     and a.id < b.id
     and a.status = 'active'
     and b.status = 'active'
     and a.start_time < b.end_time
     and b.start_time < a.end_time
  ) then
    raise exception 'Cannot apply B4-F01: overlapping active TimetablePeriods exist';
  end if;
end
$$;

comment on table public.timetable_periods is
  'AcademicYear-scoped School bell slots. Time identity is historical once referenced.';

comment on column public.timetable_entries.timetable_period_id is
  'Authoritative timetable time-slot reference. start_time/end_time are transitional legacy mirrors.';
