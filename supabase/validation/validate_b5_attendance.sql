-- Read-only structural gate for Batch 5 Attendance.
begin transaction read only;

do $attendance$
declare
  session_guard text := pg_get_functiondef('public.guard_attendance_session_transition()'::regprocedure);
  session_consistency text := pg_get_functiondef('public.validate_attendance_session_consistency()'::regprocedure);
  record_guard text := pg_get_functiondef('public.validate_student_attendance_record()'::regprocedure);
begin
  if session_guard not like '%old.status = ''open'' and new.status = ''submitted''%'
     or session_guard not like '%old.status = ''submitted'' and new.status = ''locked''%'
     or session_guard not like '%AttendanceSession lifecycle transition is forbidden%'
     or session_guard not like '%AttendanceSession lifecycle metadata is immutable%'
     or session_guard not like '%attendance.submit%'
     or session_guard not like '%attendance.lock%'
  then raise exception 'Attendance lifecycle guard is incomplete'; end if;

  if session_consistency not like '%Manual AttendanceSession requires a meaningful reason%'
     or session_consistency not like '%eligible published TimetableEntry%'
     or session_consistency not like '%AttendanceSession identity and origin are immutable%'
  then raise exception 'Attendance session consistency guard is incomplete'; end if;

  if record_guard not like '%dated classroom roster%'
     or record_guard not like '%Submitted attendance correction requires a reason%'
     or record_guard not like '%Locked attendance correction requires a reason%'
     or record_guard not like '%StudentAttendanceRecord identity is immutable%'
  then raise exception 'Attendance record guard is incomplete'; end if;

  if not exists (select 1 from pg_trigger where tgrelid='public.attendance_sessions'::regclass and tgname='audit_attendance_sessions' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid='public.attendance_sessions'::regclass and tgname='trg_attendance_sessions_validate_consistency' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid='public.student_attendance_records'::regclass and tgname='trg_student_attendance_validate_record' and not tgisinternal)
  then raise exception 'Attendance triggers are incomplete'; end if;

  if not (select relrowsecurity from pg_class where oid='public.attendance_sessions'::regclass)
     or not (select relrowsecurity from pg_class where oid='public.student_attendance_records'::regclass)
  then raise exception 'Attendance RLS is disabled'; end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_attendance_records'
      and policyname in ('student_attendance_insert','student_attendance_update')
      and coalesce(with_check, qual, '') not like '%attendance.correct_locked%'
  ) then raise exception 'Locked correction policy is incomplete'; end if;
end
$attendance$;

select 'B5 ATTENDANCE STRUCTURAL VALIDATION PASSED' as result;
rollback;
