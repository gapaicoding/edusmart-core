-- EduSmart Core V1 / Batch 9 final remediation round 3
--
-- B9-LIVE-UAT-004: eligible active-primary-class enrollment must be selected
-- before LIMIT. Selecting a student_enrollment first allowed a newer future
-- enrollment without a classroom to suppress the current published schedule.

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
    selected.classroom_name,
    sm.full_name
  from public.students st
  join lateral (
    select
      se.id as student_enrollment_id,
      se.organization_id,
      se.school_id,
      se.academic_year_id,
      ce.classroom_id,
      c.name as classroom_name
    from public.student_enrollments se
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
    join public.academic_years ay
      on ay.id = se.academic_year_id
     and ay.organization_id = se.organization_id
     and ay.school_id = se.school_id
    where se.student_id = st.id
      and se.organization_id = st.organization_id
      and se.status in ('active', 'leave')
    order by
      ay.is_current desc,
      (current_date between ay.starts_on and ay.ends_on) desc,
      ay.starts_on desc,
      se.enrolled_on desc,
      se.created_at desc
    limit 1
  ) selected on true
  join public.teaching_assignments ta
    on ta.classroom_id = selected.classroom_id
   and ta.organization_id = selected.organization_id
   and ta.school_id = selected.school_id
   and ta.academic_year_id = selected.academic_year_id
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
      selected.school_id,
      selected.classroom_id,
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
  'B9 round 3: exact auth.uid()-bound published Student schedule. Selects only an eligible active-primary-class enrollment before LIMIT, preferring the current/date-relevant academic year, and projects only safe schedule and teacher display fields.';
