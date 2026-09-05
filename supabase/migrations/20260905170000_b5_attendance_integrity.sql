-- EduSmart Core V1 / Batch 5 Attendance
-- Harden the existing Attendance schema without redesigning its tables.

create or replace function public.validate_attendance_session_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timetable public.timetable_entries%rowtype;
  v_assignment public.teaching_assignments%rowtype;
begin
  if tg_op = 'UPDATE' and
     (old.organization_id, old.school_id, old.academic_year_id, old.term_id,
      old.timetable_entry_id, old.teaching_assignment_id, old.classroom_id,
      old.session_date, old.starts_at, old.ends_at, old.manual_reason, old.created_at)
     is distinct from
     (new.organization_id, new.school_id, new.academic_year_id, new.term_id,
      new.timetable_entry_id, new.teaching_assignment_id, new.classroom_id,
      new.session_date, new.starts_at, new.ends_at, new.manual_reason, new.created_at)
  then
    raise exception using errcode = '23514',
      message = 'AttendanceSession identity and origin are immutable';
  end if;

  if tg_op = 'UPDATE' then
    return new;
  end if;

  if new.timetable_entry_id is null then
    if nullif(pg_catalog.btrim(new.manual_reason), '') is null then
      raise exception using errcode = '23514',
        message = 'Manual AttendanceSession requires a meaningful reason';
    end if;

    if new.teaching_assignment_id is not null then
      select ta.* into v_assignment
      from public.teaching_assignments ta
      where ta.id = new.teaching_assignment_id
        and ta.organization_id = new.organization_id
        and ta.school_id = new.school_id
        and ta.academic_year_id = new.academic_year_id
        and ta.classroom_id = new.classroom_id
        and ta.term_id is not distinct from new.term_id
        and ta.status = 'active';
      if not found then
        raise exception using errcode = '23514',
          message = 'Manual AttendanceSession TeachingAssignment is outside the active context';
      end if;
    end if;
  else
    if nullif(pg_catalog.btrim(new.manual_reason), '') is not null then
      raise exception using errcode = '23514',
        message = 'Timetable AttendanceSession cannot also be manual';
    end if;

    select te.* into v_timetable
    from public.timetable_entries te
    where te.id = new.timetable_entry_id
      and te.organization_id = new.organization_id
      and te.school_id = new.school_id
      and te.academic_year_id = new.academic_year_id
      and te.term_id = new.term_id
      and te.teaching_assignment_id = new.teaching_assignment_id
      and te.status = 'published'
      and te.weekday = extract(isodow from new.session_date)::smallint
      and te.effective_from <= new.session_date
      and (te.effective_to is null or te.effective_to >= new.session_date);
    if not found then
      raise exception using errcode = '23514',
        message = 'AttendanceSession requires an eligible published TimetableEntry';
    end if;

    select ta.* into v_assignment
    from public.teaching_assignments ta
    where ta.id = v_timetable.teaching_assignment_id
      and ta.organization_id = v_timetable.organization_id
      and ta.school_id = v_timetable.school_id
      and ta.classroom_id = new.classroom_id;
    if not found then
      raise exception using errcode = '23514',
        message = 'AttendanceSession TimetableEntry classroom mismatch';
    end if;
  end if;

  return new;
end
$$;

create or replace function public.guard_attendance_session_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status is not distinct from new.status then
    if (old.submitted_at, old.submitted_by_profile_id, old.locked_at)
       is distinct from
       (new.submitted_at, new.submitted_by_profile_id, new.locked_at)
    then
      raise exception using errcode = '23514',
        message = 'AttendanceSession lifecycle metadata is immutable';
    end if;
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if old.status = 'open' and new.status = 'submitted' then
    if not public.has_permission('attendance.submit', old.organization_id, old.school_id, old.classroom_id) then
      raise exception using errcode = '42501', message = 'Missing attendance.submit permission';
    end if;
    new.submitted_by_profile_id := auth.uid();
    new.submitted_at := pg_catalog.transaction_timestamp();
    new.locked_at := old.locked_at;
    return new;
  end if;

  if old.status = 'submitted' and new.status = 'locked' then
    if not public.has_permission('attendance.lock', old.organization_id, old.school_id, old.classroom_id) then
      raise exception using errcode = '42501', message = 'Missing attendance.lock permission';
    end if;
    new.submitted_by_profile_id := old.submitted_by_profile_id;
    new.submitted_at := old.submitted_at;
    new.locked_at := pg_catalog.transaction_timestamp();
    return new;
  end if;

  raise exception using errcode = '23514',
    message = 'AttendanceSession lifecycle transition is forbidden';
end
$$;

create or replace function public.validate_student_attendance_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.attendance_sessions%rowtype;
  v_student_id uuid;
begin
  select s.* into v_session
  from public.attendance_sessions s
  where s.id = new.attendance_session_id
    and s.organization_id = new.organization_id
    and s.school_id = new.school_id
  for share;
  if not found then
    raise exception using errcode = '23514',
      message = 'StudentAttendanceRecord session scope mismatch';
  end if;

  select se.student_id into v_student_id
  from public.student_enrollments se
  where se.id = new.student_enrollment_id
    and se.organization_id = new.organization_id
    and se.school_id = new.school_id
    and se.academic_year_id = v_session.academic_year_id
    and se.enrolled_on <= v_session.session_date
    and (se.ended_on is null or se.ended_on >= v_session.session_date)
    and exists (
      select 1 from public.class_enrollments ce
      where ce.student_enrollment_id = se.id
        and ce.organization_id = se.organization_id
        and ce.school_id = se.school_id
        and ce.classroom_id = v_session.classroom_id
        and ce.is_primary
        and ce.starts_on <= v_session.session_date
        and (ce.ends_on is null or ce.ends_on >= v_session.session_date)
    );
  if not found then
    raise exception using errcode = '23514',
      message = 'StudentAttendanceRecord student is outside the dated classroom roster';
  end if;

  if tg_op = 'UPDATE' and
     (old.organization_id, old.school_id, old.attendance_session_id,
      old.student_enrollment_id, old.created_at, old.recorded_by_profile_id)
     is distinct from
     (new.organization_id, new.school_id, new.attendance_session_id,
      new.student_enrollment_id, new.created_at, new.recorded_by_profile_id)
  then
    raise exception using errcode = '23514',
      message = 'StudentAttendanceRecord identity is immutable';
  end if;

  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.recorded_by_profile_id := auth.uid();
    end if;
    new.updated_by_profile_id := auth.uid();
  end if;

  if v_session.status = 'open' then
    new.correction_reason := null;
  elsif v_session.status = 'submitted' then
    if nullif(pg_catalog.btrim(new.correction_reason), '') is null then
      raise exception using errcode = '23514',
        message = 'Submitted attendance correction requires a reason';
    end if;
  elsif v_session.status in ('locked', 'corrected') then
    if nullif(pg_catalog.btrim(new.correction_reason), '') is null then
      raise exception using errcode = '23514',
        message = 'Locked attendance correction requires a reason';
    end if;
  else
    raise exception using errcode = '23514',
      message = 'StudentAttendanceRecord session state is invalid';
  end if;

  return new;
end
$$;

revoke all on function public.validate_attendance_session_consistency() from public, anon, authenticated;
revoke all on function public.guard_attendance_session_transition() from public, anon, authenticated;
revoke all on function public.validate_student_attendance_record() from public, anon, authenticated;
grant execute on function public.validate_attendance_session_consistency() to service_role;
grant execute on function public.guard_attendance_session_transition() to service_role;
grant execute on function public.validate_student_attendance_record() to service_role;

drop trigger if exists trg_attendance_sessions_validate_consistency on public.attendance_sessions;
create trigger trg_attendance_sessions_validate_consistency
before insert or update on public.attendance_sessions
for each row execute function public.validate_attendance_session_consistency();

drop trigger if exists trg_student_attendance_validate_record on public.student_attendance_records;
create trigger trg_student_attendance_validate_record
before insert or update on public.student_attendance_records
for each row execute function public.validate_student_attendance_record();

drop trigger if exists audit_attendance_sessions on public.attendance_sessions;
create trigger audit_attendance_sessions
after insert or update on public.attendance_sessions
for each row execute function public.audit_row_change();

drop policy if exists attendance_sessions_update on public.attendance_sessions;
create policy attendance_sessions_update
on public.attendance_sessions for update to authenticated
using (
  (status = 'open' and public.has_permission('attendance.submit', organization_id, school_id, classroom_id))
  or (status = 'submitted' and public.has_permission('attendance.lock', organization_id, school_id, classroom_id))
)
with check (
  (status = 'submitted' and public.has_permission('attendance.submit', organization_id, school_id, classroom_id))
  or (status = 'locked' and public.has_permission('attendance.lock', organization_id, school_id, classroom_id))
);

drop policy if exists student_attendance_insert on public.student_attendance_records;
create policy student_attendance_insert
on public.student_attendance_records for insert to authenticated
with check (exists (
  select 1 from public.attendance_sessions s
  where s.id = student_attendance_records.attendance_session_id
    and s.organization_id = student_attendance_records.organization_id
    and s.school_id = student_attendance_records.school_id
    and (
      (s.status = 'open' and public.has_permission('attendance.record', s.organization_id, s.school_id, s.classroom_id))
      or (s.status = 'submitted' and public.has_permission('attendance.correct_open', s.organization_id, s.school_id, s.classroom_id))
      or (s.status in ('locked','corrected') and public.has_permission('attendance.correct_locked', s.organization_id, s.school_id, s.classroom_id))
    )
));

drop policy if exists student_attendance_update on public.student_attendance_records;
create policy student_attendance_update
on public.student_attendance_records for update to authenticated
using (exists (
  select 1 from public.attendance_sessions s
  where s.id = student_attendance_records.attendance_session_id
    and s.organization_id = student_attendance_records.organization_id
    and s.school_id = student_attendance_records.school_id
    and (
      (s.status = 'open' and (
        public.has_permission('attendance.record', s.organization_id, s.school_id, s.classroom_id)
        or public.has_permission('attendance.correct_open', s.organization_id, s.school_id, s.classroom_id)
      ))
      or (s.status = 'submitted' and public.has_permission('attendance.correct_open', s.organization_id, s.school_id, s.classroom_id))
      or (s.status in ('locked','corrected') and public.has_permission('attendance.correct_locked', s.organization_id, s.school_id, s.classroom_id))
    )
))
with check (exists (
  select 1 from public.attendance_sessions s
  where s.id = student_attendance_records.attendance_session_id
    and s.organization_id = student_attendance_records.organization_id
    and s.school_id = student_attendance_records.school_id
    and (
      (s.status = 'open' and (
        public.has_permission('attendance.record', s.organization_id, s.school_id, s.classroom_id)
        or public.has_permission('attendance.correct_open', s.organization_id, s.school_id, s.classroom_id)
      ))
      or (s.status = 'submitted' and public.has_permission('attendance.correct_open', s.organization_id, s.school_id, s.classroom_id))
      or (s.status in ('locked','corrected') and public.has_permission('attendance.correct_locked', s.organization_id, s.school_id, s.classroom_id))
    )
));

drop policy if exists class_enrollments_attendance_select on public.class_enrollments;
create policy class_enrollments_attendance_select
on public.class_enrollments for select to authenticated
using (exists (
  select 1
  from public.student_enrollments se
  join public.students st on st.id = se.student_id and st.organization_id = se.organization_id
  where se.id = class_enrollments.student_enrollment_id
    and se.organization_id = class_enrollments.organization_id
    and se.school_id = class_enrollments.school_id
    and public.has_permission(
      'attendance.read',
      class_enrollments.organization_id,
      class_enrollments.school_id,
      class_enrollments.classroom_id,
      st.profile_id,
      st.id
    )
));

drop policy if exists student_enrollments_attendance_select on public.student_enrollments;
create policy student_enrollments_attendance_select
on public.student_enrollments for select to authenticated
using (exists (
  select 1
  from public.students st
  join public.class_enrollments ce
    on ce.student_enrollment_id = student_enrollments.id
   and ce.organization_id = student_enrollments.organization_id
   and ce.school_id = student_enrollments.school_id
  where st.id = student_enrollments.student_id
    and st.organization_id = student_enrollments.organization_id
    and public.has_permission(
      'attendance.read',
      ce.organization_id,
      ce.school_id,
      ce.classroom_id,
      st.profile_id,
      st.id
    )
));

drop policy if exists students_attendance_select on public.students;
create policy students_attendance_select
on public.students for select to authenticated
using (exists (
  select 1
  from public.student_enrollments se
  join public.class_enrollments ce
    on ce.student_enrollment_id = se.id
   and ce.organization_id = se.organization_id
   and ce.school_id = se.school_id
  where se.student_id = students.id
    and se.organization_id = students.organization_id
    and public.has_permission(
      'attendance.read',
      ce.organization_id,
      ce.school_id,
      ce.classroom_id,
      students.profile_id,
      students.id
    )
));

comment on function public.validate_attendance_session_consistency() is
  'B5: validates immutable session origin, meaningful manual reason, and eligible timetable/classroom context.';
comment on function public.guard_attendance_session_transition() is
  'B5: authoritative open->submitted->locked session lifecycle. The corrected value is legacy/reserved and not a user-reachable transition; record-level corrections preserve the session status while the audited record captures the change.';
comment on function public.validate_student_attendance_record() is
  'B5: validates dated primary-class roster membership, immutable record identity, actor attribution, and correction reasons. Corrections to submitted/locked/corrected records require the appropriate permission and a reason; the session status is never changed by a record correction.';
