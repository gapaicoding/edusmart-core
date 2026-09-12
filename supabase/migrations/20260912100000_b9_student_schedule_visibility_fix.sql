-- EduSmart Core V1 / Batch 9 final remediation round 2
--
-- B9-LIVE-UAT-003: a pure STUDENT could read raw teaching_assignments,
-- including draft lifecycle rows, through the generic teaching_assignment.read
-- permission and the classroom-matching OWN branch.
--
-- B9-LIVE-UAT-004: the Student schedule assembled its response through raw
-- caller-scoped reads. staff_school_assignments/staff_members correctly denied
-- those reads, so teacherName was null.
--
-- The fix removes only STUDENT's raw teaching_assignment.read permission and
-- provides an authenticated-only, exact-student, published-schedule projection
-- containing the minimum safe teacher field (staff_members.full_name).

do $$
declare
  v_deleted integer;
begin
  delete from public.role_permissions rp
  using public.roles r, public.permissions p
  where rp.role_id = r.id
    and rp.permission_id = p.id
    and r.organization_id is null
    and r.code = 'STUDENT'
    and p.code = 'teaching_assignment.read';

  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception 'Expected exactly one STUDENT teaching_assignment.read grant, removed %', v_deleted;
  end if;
end
$$;

create or replace function public.list_student_published_schedule(
  p_organization_id uuid
)
returns table (
  entry_id uuid,
  day_of_week smallint,
  starts_at time without time zone,
  ends_at time without time zone,
  subject_name text,
  classroom_name text,
  teacher_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    te.id,
    te.weekday,
    te.start_time,
    te.end_time,
    sub.name,
    c.name,
    sm.full_name
  from public.students st
  join lateral (
    select se.*
    from public.student_enrollments se
    where se.student_id = st.id
      and se.organization_id = st.organization_id
      and se.status in ('active', 'leave')
    order by se.enrolled_on desc, se.created_at desc
    limit 1
  ) se on true
  join public.class_enrollments ce
    on ce.student_enrollment_id = se.id
   and ce.organization_id = se.organization_id
   and ce.school_id = se.school_id
   and ce.status = 'active'
   and ce.is_primary
  join public.classrooms c
    on c.id = ce.classroom_id
   and c.organization_id = ce.organization_id
   and c.school_id = ce.school_id
  join public.teaching_assignments ta
    on ta.classroom_id = ce.classroom_id
   and ta.organization_id = ce.organization_id
   and ta.school_id = ce.school_id
   and ta.academic_year_id = se.academic_year_id
  join public.timetable_entries te
    on te.teaching_assignment_id = ta.id
   and te.organization_id = ta.organization_id
   and te.school_id = ta.school_id
   and te.academic_year_id = ta.academic_year_id
   and te.status = 'published'
  join public.subjects sub
    on sub.id = ta.subject_id
   and sub.organization_id = ta.organization_id
   and sub.school_id = ta.school_id
  join public.staff_school_assignments ssa
    on ssa.id = ta.staff_school_assignment_id
   and ssa.organization_id = ta.organization_id
   and ssa.school_id = ta.school_id
  join public.staff_members sm
    on sm.id = ssa.staff_member_id
   and sm.organization_id = ssa.organization_id
  where st.profile_id = auth.uid()
    and st.organization_id = p_organization_id
    and st.status <> 'archived'
    and public.has_permission(
      'schedule.read',
      st.organization_id,
      se.school_id,
      ce.classroom_id,
      st.profile_id,
      st.id
    )
  order by te.weekday, te.start_time, te.id
$$;

revoke all on function public.list_student_published_schedule(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.list_student_published_schedule(uuid)
to authenticated;

comment on function public.list_student_published_schedule(uuid) is
  'B9 round 2: exact auth.uid()-bound Student schedule. Returns only published own-classroom timetable rows and the minimal safe teacher display name; accepts no student id and exposes no raw assignment/staff lifecycle metadata.';
