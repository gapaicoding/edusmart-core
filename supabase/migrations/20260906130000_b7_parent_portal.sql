-- EduSmart Core V1 / Batch 7 Parent Portal
-- Adds a subject-scoped Attendance read path for guardians without weakening
-- the operational B5 staff-only RLS. Every other Parent Portal surface reuses
-- the canonical RELATED path already established by the foundation and B6
-- (published Assessments/StudentScore, published Timetable, Students/
-- Enrollments/ClassEnrollments via has_permission(..., st.id)).

-- ---------------------------------------------------------------------------
-- Guardian-scoped Attendance reader.
--
-- SECURITY DEFINER: encapsulates the safe subject read so B5's staff-only
-- student_attendance_records SELECT policy does not need to be widened and
-- no overlay is added to class_enrollments / student_enrollments / students
-- (per the B5 note about recursive RLS chains).
--
-- Authorization contract (ALL of the following must hold per returned row):
--   * Subject binding: caller must be a guardian actively linked to
--     p_student_id in the same organization
--     (student_guardians.status='active', guardians.status='active',
--     guardians.profile_id=auth.uid()).
--   * Canonical RBAC: caller must currently hold the 'attendance.read'
--     permission against the exact (organization, school, classroom,
--     related_student) context of the attendance row, verified through
--     public.has_permission which itself joins organization_memberships /
--     membership_roles / role_permissions and re-asserts the RELATED
--     guardian binding. Revoking the parent's membership, role, or the
--     'attendance.read' permission immediately zeroes this reader.
--   * Only sessions with an operator-visible outcome are returned
--     ('submitted','locked','corrected'). Draft/open sessions and internal
--     staff correction state are never exposed.
--   * Only rows whose student_enrollments.student_id = p_student_id are
--     returned; no classmate rows can leak.
--   * Cross-organization isolation follows from the guardian join and from
--     has_permission's own membership/organization equality.
--
-- Staff-internal free-text remarks (student_attendance_records.notes) are
-- deliberately not exposed by this parent-facing surface; the underlying
-- column is untouched and remains staff-only via B5 RLS.
-- ---------------------------------------------------------------------------

create or replace function public.list_parent_student_attendance(
  p_student_id uuid,
  p_from date default null,
  p_to date default null
)
returns table (
  record_id uuid,
  session_id uuid,
  organization_id uuid,
  school_id uuid,
  classroom_id uuid,
  session_date date,
  session_status text,
  status text,
  recorded_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    star.id,
    s.id,
    star.organization_id,
    star.school_id,
    s.classroom_id,
    s.session_date,
    s.status,
    star.status,
    star.updated_at
  from public.student_attendance_records star
  join public.attendance_sessions s
    on s.id = star.attendance_session_id
   and s.organization_id = star.organization_id
   and s.school_id = star.school_id
  join public.student_enrollments se
    on se.id = star.student_enrollment_id
   and se.organization_id = star.organization_id
   and se.school_id = star.school_id
  where s.status in ('submitted','locked','corrected')
    and se.student_id = p_student_id
    and (p_from is null or s.session_date >= p_from)
    and (p_to   is null or s.session_date <= p_to)
    and exists (
      select 1
      from public.student_guardians sg
      join public.guardians g
        on g.id = sg.guardian_id
       and g.organization_id = sg.organization_id
      where sg.student_id = p_student_id
        and sg.organization_id = star.organization_id
        and sg.status = 'active'
        and g.status = 'active'
        and g.profile_id = auth.uid()
    )
    and public.has_permission(
      'attendance.read',
      star.organization_id,
      star.school_id,
      s.classroom_id,
      null,
      p_student_id
    )
  order by s.session_date desc, star.updated_at desc
$$;

revoke all on function public.list_parent_student_attendance(uuid, date, date) from public;
grant execute on function public.list_parent_student_attendance(uuid, date, date) to authenticated;

comment on function public.list_parent_student_attendance(uuid, date, date) is
  'B7: subject-scoped guardian read of student attendance. Requires an active guardian relationship to p_student_id AND an active organization membership carrying attendance.read for the row context (via public.has_permission RELATED); returns only outcome-visible sessions (submitted/locked/corrected); never exposes classmate records, draft/open session state, or staff-internal notes.';
