-- EduSmart Core V1 / Batch 13 Phase 1
-- Teacher Daily Operations: Teaching Journal foundation and Staff Attendance hardening.
-- Phase 2 owns command RPCs and projections.  Direct journal writes are denied here.

begin;

-- -----------------------------------------------------------------------------
-- 1. Teaching Journal occurrence aggregate
-- -----------------------------------------------------------------------------

create table public.teaching_journals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  term_id uuid not null,
  teaching_assignment_id uuid not null,
  timetable_entry_id uuid not null,
  journal_date date not null,
  status text not null default 'draft'
    check (status in ('draft','submitted')),
  material_taught text,
  obstacles text,
  follow_up text,
  teacher_note text,
  version bigint not null default 1
    check (version >= 1),
  created_by_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  submitted_by_profile_id uuid
    references public.profiles(id) on delete restrict,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teaching_journals_id_org_school_key unique (id, organization_id, school_id),
  constraint teaching_journals_occurrence_key unique (school_id, timetable_entry_id, journal_date),
  constraint teaching_journals_year_fk
    foreign key (academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete restrict,
  constraint teaching_journals_term_fk
    foreign key (term_id, organization_id, school_id)
    references public.terms(id, organization_id, school_id) on delete restrict,
  constraint teaching_journals_assignment_fk
    foreign key (teaching_assignment_id, organization_id, school_id)
    references public.teaching_assignments(id, organization_id, school_id) on delete restrict,
  constraint teaching_journals_timetable_fk
    foreign key (timetable_entry_id, organization_id, school_id)
    references public.timetable_entries(id, organization_id, school_id) on delete restrict,
  constraint teaching_journals_submission_metadata_check check (
    (status = 'draft' and submitted_by_profile_id is null and submitted_at is null)
    or (status = 'submitted' and submitted_by_profile_id is not null and submitted_at is not null)
  )
);

create index idx_teaching_journals_teacher_date
on public.teaching_journals (created_by_profile_id, journal_date desc, updated_at desc);

create index idx_teaching_journals_school_date
on public.teaching_journals (school_id, journal_date desc, status);

create or replace function public.validate_teaching_journal_context()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_timetable public.timetable_entries;
  v_assignment public.teaching_assignments;
  v_year public.academic_years;
  v_term public.terms;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Teaching Journal must be created as draft';
    end if;
    if new.submitted_by_profile_id is not null or new.submitted_at is not null then
      raise exception 'Draft Teaching Journal cannot have submission metadata';
    end if;
    if auth.uid() is not null and new.created_by_profile_id <> auth.uid() then
      raise exception 'Teaching Journal creator must match authenticated profile';
    end if;
  else
    if old.status = 'submitted' then
      raise exception 'Submitted Teaching Journal is immutable';
    end if;
    if new.created_by_profile_id is distinct from old.created_by_profile_id
       or new.organization_id is distinct from old.organization_id
       or new.school_id is distinct from old.school_id
       or new.academic_year_id is distinct from old.academic_year_id
       or new.term_id is distinct from old.term_id
       or new.teaching_assignment_id is distinct from old.teaching_assignment_id
       or new.timetable_entry_id is distinct from old.timetable_entry_id
       or new.journal_date is distinct from old.journal_date then
      raise exception 'Teaching Journal occurrence identity is immutable';
    end if;
    if new.version <> old.version + 1 then
      raise exception 'Teaching Journal version must advance exactly once';
    end if;
    if new.status = 'draft' then
      if new.submitted_by_profile_id is not null or new.submitted_at is not null then
        raise exception 'Draft Teaching Journal cannot have submission metadata';
      end if;
    elsif new.status = 'submitted' then
      if btrim(coalesce(new.material_taught, '')) = '' then
        raise exception 'Teaching Journal material_taught is required at submission';
      end if;
      if auth.uid() is null then
        raise exception 'Teaching Journal submission requires an authenticated actor';
      end if;
      new.submitted_by_profile_id := auth.uid();
      new.submitted_at := coalesce(new.submitted_at, clock_timestamp());
    else
      raise exception 'Unsupported Teaching Journal lifecycle transition';
    end if;
  end if;

  select * into v_timetable
  from public.timetable_entries te
  where te.id = new.timetable_entry_id
    and te.organization_id = new.organization_id
    and te.school_id = new.school_id;
  if not found or v_timetable.status <> 'published' then
    raise exception 'Teaching Journal requires a published timetable entry';
  end if;

  if v_timetable.teaching_assignment_id <> new.teaching_assignment_id
     or v_timetable.academic_year_id <> new.academic_year_id
     or v_timetable.term_id is distinct from new.term_id then
    raise exception 'Teaching Journal timetable context does not match';
  end if;

  if new.journal_date < v_timetable.effective_from
     or (v_timetable.effective_to is not null and new.journal_date > v_timetable.effective_to)
     or extract(isodow from new.journal_date)::smallint <> v_timetable.weekday then
    raise exception 'Teaching Journal date is outside the published timetable occurrence';
  end if;

  select * into v_assignment
  from public.teaching_assignments ta
  where ta.id = new.teaching_assignment_id
    and ta.organization_id = new.organization_id
    and ta.school_id = new.school_id;
  if not found or v_assignment.status <> 'active'
     or new.journal_date < v_assignment.starts_on
     or (v_assignment.ends_on is not null and new.journal_date > v_assignment.ends_on)
     or v_assignment.academic_year_id <> new.academic_year_id
     or v_assignment.term_id is distinct from new.term_id then
    raise exception 'Teaching Journal assignment context is invalid for the journal date';
  end if;

  select * into v_year
  from public.academic_years ay
  where ay.id = new.academic_year_id
    and ay.organization_id = new.organization_id
    and ay.school_id = new.school_id;
  if not found or new.journal_date < v_year.starts_on or new.journal_date > v_year.ends_on then
    raise exception 'Teaching Journal date is outside the academic year';
  end if;

  select * into v_term
  from public.terms t
  where t.id = new.term_id
    and t.organization_id = new.organization_id
    and t.school_id = new.school_id
    and t.academic_year_id = new.academic_year_id;
  if not found or new.journal_date < v_term.starts_on or new.journal_date > v_term.ends_on then
    raise exception 'Teaching Journal date is outside the academic term';
  end if;

  return new;
end;
$$;

create trigger trg_teaching_journals_validate_context
before insert or update on public.teaching_journals
for each row execute function public.validate_teaching_journal_context();

create or replace function public.prevent_teaching_journal_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Teaching Journal hard delete is not permitted';
end;
$$;

create trigger trg_teaching_journals_no_delete
before delete on public.teaching_journals
for each row execute function public.prevent_teaching_journal_delete();

create trigger trg_teaching_journals_updated_at
before update on public.teaching_journals
for each row execute function public.set_updated_at();

create trigger trg_teaching_journals_tenant_immutable
before update on public.teaching_journals
for each row execute function public.prevent_tenant_boundary_change();

create trigger audit_teaching_journals
after insert or update or delete on public.teaching_journals
for each row execute function public.audit_row_change();

-- Phase 1 intentionally exposes only the bounded read surface. Phase 2 command
-- RPCs will be the sole application write boundary.
alter table public.teaching_journals enable row level security;
revoke all on public.teaching_journals from public, anon, authenticated;
grant select on public.teaching_journals to authenticated;

create policy teaching_journals_select
on public.teaching_journals for select to authenticated
using (
  exists (
    select 1
    from public.teaching_assignments ta
    where ta.id = teaching_journals.teaching_assignment_id
      and ta.organization_id = teaching_journals.organization_id
      and ta.school_id = teaching_journals.school_id
      and (
        public.has_staff_scope_permission(
          'teaching_journal.read',
          teaching_journals.organization_id,
          teaching_journals.school_id,
          null
        )
        or (
          exists (
            select 1
            from public.staff_school_assignments ssa
            join public.staff_members sm
              on sm.id = ssa.staff_member_id
             and sm.organization_id = ssa.organization_id
            where ssa.id = ta.staff_school_assignment_id
              and ssa.organization_id = teaching_journals.organization_id
              and ssa.school_id = teaching_journals.school_id
              and sm.profile_id = auth.uid()
              and sm.status = 'active'
              and ssa.status = 'active'
          )
          and public.has_permission(
            'teaching_journal.read',
            teaching_journals.organization_id,
            teaching_journals.school_id,
            ta.classroom_id
          )
        )
      )
  )
);

revoke insert, update, delete on public.teaching_journals from authenticated;

-- -----------------------------------------------------------------------------
-- 2. Staff Attendance: reuse and harden the canonical table
-- -----------------------------------------------------------------------------

create or replace function public.validate_staff_attendance_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.staff_school_assignments ssa
    where ssa.organization_id = new.organization_id
      and ssa.school_id = new.school_id
      and ssa.staff_member_id = new.staff_member_id
      and ssa.status = 'active'
      and (ssa.joined_on is null or ssa.joined_on <= new.attendance_date)
      and (ssa.left_on is null or ssa.left_on >= new.attendance_date)
  ) then
    raise exception 'Staff attendance requires a valid staff-school assignment for the date';
  end if;
  return new;
end;
$$;

create trigger trg_staff_attendance_validate_assignment
before insert or update on public.staff_attendance_records
for each row execute function public.validate_staff_attendance_assignment();

drop policy if exists staff_attendance_select on public.staff_attendance_records;
drop policy if exists staff_attendance_insert on public.staff_attendance_records;
drop policy if exists staff_attendance_update on public.staff_attendance_records;

create policy staff_attendance_select
on public.staff_attendance_records for select to authenticated
using (
  public.has_permission('staff_attendance.read', organization_id, school_id)
  or public.has_permission('staff_attendance.manage', organization_id, school_id)
  or (
    public.has_permission('staff_attendance.self.read', organization_id, school_id)
    and exists (
      select 1
      from public.staff_members sm
      join public.staff_school_assignments ssa
        on ssa.staff_member_id = sm.id
       and ssa.organization_id = sm.organization_id
       and ssa.school_id = staff_attendance_records.school_id
       and ssa.status = 'active'
       and (ssa.joined_on is null or ssa.joined_on <= staff_attendance_records.attendance_date)
       and (ssa.left_on is null or ssa.left_on >= staff_attendance_records.attendance_date)
      where sm.id = staff_attendance_records.staff_member_id
        and sm.organization_id = staff_attendance_records.organization_id
        and sm.profile_id = auth.uid()
        and sm.status = 'active'
    )
  )
);

create policy staff_attendance_insert
on public.staff_attendance_records for insert to authenticated
with check (public.has_permission('staff_attendance.manage', organization_id, school_id));

create policy staff_attendance_update
on public.staff_attendance_records for update to authenticated
using (public.has_permission('staff_attendance.manage', organization_id, school_id))
with check (public.has_permission('staff_attendance.manage', organization_id, school_id));

revoke delete on public.staff_attendance_records from authenticated;

create trigger audit_staff_attendance
after insert or update or delete on public.staff_attendance_records
for each row execute function public.audit_row_change();

-- -----------------------------------------------------------------------------
-- 3. Permission registry and built-in role links
-- -----------------------------------------------------------------------------

insert into public.permissions (code, domain, action, description) values
  ('teaching_journal.read','teaching_journal','read','Read authorized teaching journals'),
  ('teaching_journal.create','teaching_journal','create','Create draft teaching journals for assigned timetable occurrences'),
  ('teaching_journal.update','teaching_journal','update','Update own draft teaching journals'),
  ('teaching_journal.submit','teaching_journal','submit','Submit own draft teaching journals'),
  ('staff_attendance.read','staff_attendance','read','Read authorized staff attendance'),
  ('staff_attendance.manage','staff_attendance','manage','Manage school staff attendance'),
  ('staff_attendance.self.read','staff_attendance','read','Read own authorized staff attendance history')
on conflict (code) do update
set domain = excluded.domain,
    action = excluded.action,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.organization_id is null
  and r.code = 'ORG_OWNER'
  and p.code in (
    'teaching_journal.read','teaching_journal.create','teaching_journal.update','teaching_journal.submit',
    'staff_attendance.read','staff_attendance.manage','staff_attendance.self.read'
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from (
  values
    ('SCHOOL_ADMIN','teaching_journal.read'),
    ('SCHOOL_ADMIN','staff_attendance.read'),
    ('SCHOOL_ADMIN','staff_attendance.manage'),
    ('PRINCIPAL','teaching_journal.read'),
    ('PRINCIPAL','staff_attendance.read'),
    ('PRINCIPAL','staff_attendance.manage'),
    ('VICE_PRINCIPAL_CURRICULUM','teaching_journal.read'),
    ('TEACHER','teaching_journal.read'),
    ('TEACHER','teaching_journal.create'),
    ('TEACHER','teaching_journal.update'),
    ('TEACHER','teaching_journal.submit'),
    ('TEACHER','staff_attendance.self.read'),
    ('HOMEROOM_TEACHER','teaching_journal.read'),
    ('HOMEROOM_TEACHER','teaching_journal.create'),
    ('HOMEROOM_TEACHER','teaching_journal.update'),
    ('HOMEROOM_TEACHER','teaching_journal.submit'),
    ('HOMEROOM_TEACHER','staff_attendance.self.read')
) as grants(role_code, permission_code)
join public.roles r on r.code = grants.role_code and r.organization_id is null
join public.permissions p on p.code = grants.permission_code
on conflict (role_id, permission_id) do nothing;

commit;
