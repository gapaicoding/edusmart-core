-- Read-only structural gate for Batch 5 Attendance.
begin transaction read only;

do $attendance$
declare
  session_guard text := pg_get_functiondef('public.guard_attendance_session_transition()'::regprocedure);
  session_consistency text := pg_get_functiondef('public.validate_attendance_session_consistency()'::regprocedure);
  record_guard text := pg_get_functiondef('public.validate_student_attendance_record()'::regprocedure);
begin
  -- 1. Function-source integrity
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

  -- 2. Required triggers
  if not exists (select 1 from pg_trigger where tgrelid='public.attendance_sessions'::regclass and tgname='audit_attendance_sessions' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid='public.attendance_sessions'::regclass and tgname='trg_attendance_sessions_validate_consistency' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid='public.student_attendance_records'::regclass and tgname='trg_student_attendance_validate_record' and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgrelid='public.attendance_sessions'::regclass and tgname='trg_attendance_sessions_workflow_guard' and not tgisinternal)
  then raise exception 'Attendance triggers are incomplete'; end if;

  -- 3. RLS enabled
  if not (select relrowsecurity from pg_class where oid='public.attendance_sessions'::regclass)
     or not (select relrowsecurity from pg_class where oid='public.student_attendance_records'::regclass)
  then raise exception 'Attendance RLS is disabled'; end if;

  -- 4. Required policies must exist (missing = failure, not silent pass)
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='attendance_sessions'
      and policyname='attendance_sessions_update'
  ) then raise exception 'Missing required policy: attendance_sessions_update'; end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='student_attendance_records'
      and policyname='student_attendance_insert'
  ) then raise exception 'Missing required policy: student_attendance_insert'; end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='student_attendance_records'
      and policyname='student_attendance_update'
  ) then raise exception 'Missing required policy: student_attendance_update'; end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='class_enrollments'
      and policyname='class_enrollments_attendance_select'
  ) then raise exception 'Missing required policy: class_enrollments_attendance_select'; end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='student_enrollments'
      and policyname='student_enrollments_attendance_select'
  ) then raise exception 'Missing required policy: student_enrollments_attendance_select'; end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='students'
      and policyname='students_attendance_select'
  ) then raise exception 'Missing required policy: students_attendance_select'; end if;

  -- 5. No attendance DELETE policy
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename in ('attendance_sessions','student_attendance_records')
      and cmd='d'
  ) then raise exception 'Attendance DELETE policy exists — hard-delete is not allowed'; end if;

  -- 6. Session UPDATE policy semantics: submit and lock branches only
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='attendance_sessions'
      and policyname='attendance_sessions_update'
      and qual like '%attendance.submit%'
      and qual like '%attendance.lock%'
      and with_check like '%attendance.submit%'
      and with_check like '%attendance.lock%'
  ) then raise exception 'attendance_sessions_update policy is missing submit/lock semantics'; end if;

  -- 7. Record INSERT/UPDATE policies require correct_locked for locked/corrected sessions
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_attendance_records'
      and policyname in ('student_attendance_insert','student_attendance_update')
      and coalesce(with_check, qual, '') not like '%attendance.correct_locked%'
  ) then raise exception 'Locked correction policy is incomplete'; end if;

  -- 8. Record policies require correct_open for submitted sessions
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_attendance_records'
      and policyname in ('student_attendance_insert','student_attendance_update')
      and coalesce(with_check, qual, '') not like '%attendance.correct_open%'
  ) then raise exception 'Submitted correction policy is incomplete'; end if;

  -- 9. Record INSERT/UPDATE require attendance.record for open sessions
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_attendance_records'
      and policyname in ('student_attendance_insert','student_attendance_update')
      and coalesce(with_check, qual, '') not like '%attendance.record%'
  ) then raise exception 'Open session record policy is incomplete'; end if;

  -- 10. Roster SELECT policies are subject-aware (pass profile_id/student_id)
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='class_enrollments'
      and policyname='class_enrollments_attendance_select'
      and qual like '%profile_id%'
  ) then raise exception 'class_enrollments_attendance_select is not subject-aware'; end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_enrollments'
      and policyname='student_enrollments_attendance_select'
      and qual like '%profile_id%'
  ) then raise exception 'student_enrollments_attendance_select is not subject-aware'; end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='students'
      and policyname='students_attendance_select'
      and qual like '%profile_id%'
  ) then raise exception 'students_attendance_select is not subject-aware'; end if;

  -- 11. Lifecycle guard is SECURITY INVOKER (uses auth.uid, not definer privilege)
  if (select p.prosecdef from pg_proc p where p.oid='public.guard_attendance_session_transition()'::regprocedure) then
    raise exception 'guard_attendance_session_transition must be SECURITY INVOKER';
  end if;

  -- 12. Validation/consistency functions are SECURITY DEFINER
  if not (select p.prosecdef from pg_proc p where p.oid='public.validate_attendance_session_consistency()'::regprocedure)
     or not (select p.prosecdef from pg_proc p where p.oid='public.validate_student_attendance_record()'::regprocedure)
  then raise exception 'Attendance validation functions must be SECURITY DEFINER'; end if;
end
$attendance$;

select 'B5 ATTENDANCE STRUCTURAL VALIDATION PASSED' as result;
rollback;
