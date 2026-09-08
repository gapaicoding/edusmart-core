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
      and policyname='attendance_sessions_select'
  ) then raise exception 'Missing required policy: attendance_sessions_select'; end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='attendance_sessions'
      and policyname='attendance_sessions_update'
  ) then raise exception 'Missing required policy: attendance_sessions_update'; end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='attendance_sessions'
      and policyname='attendance_sessions_insert'
  ) then raise exception 'Missing required policy: attendance_sessions_insert'; end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='student_attendance_records'
      and policyname='student_attendance_select'
  ) then raise exception 'Missing required policy: student_attendance_select'; end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='student_attendance_records'
      and policyname='student_attendance_insert'
  ) then raise exception 'Missing required policy: student_attendance_insert'; end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='student_attendance_records'
      and policyname='student_attendance_update'
  ) then raise exception 'Missing required policy: student_attendance_update'; end if;

  -- 4a. Operational Attendance must use the ORG/SCHOOL/CLASS-only helper.
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='attendance_sessions'
      and policyname='attendance_sessions_select'
      and qual like '%has_staff_scope_permission%'
      and qual like '%attendance.read%'
      and qual not like '%has_permission(%'
  ) then raise exception 'attendance_sessions_select is not operational-scope-only'; end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='attendance_sessions'
      and policyname='attendance_sessions_insert'
      and with_check like '%has_staff_scope_permission%'
      and with_check like '%attendance.session.create%'
      and with_check not like '%has_permission(%'
  ) then raise exception 'attendance_sessions_insert is not operational-scope-only'; end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_attendance_records'
      and policyname='student_attendance_select'
      and qual like '%has_staff_scope_permission%'
      and qual like '%attendance.read%'
      and qual not like '%has_permission(%'
  ) then raise exception 'student_attendance_select is not operational-scope-only'; end if;

  if not exists (
    select 1 from pg_proc
    where oid='public.has_staff_scope_permission(text,uuid,uuid,uuid)'::regprocedure
      and prosecdef
  ) then raise exception 'Operational scope helper must exist as SECURITY DEFINER'; end if;

  if pg_get_functiondef('public.has_staff_scope_permission(text,uuid,uuid,uuid)'::regprocedure)
       not like '%mr.scope_type = ''ORG''%'
     or pg_get_functiondef('public.has_staff_scope_permission(text,uuid,uuid,uuid)'::regprocedure)
       not like '%mr.scope_type = ''SCHOOL''%'
     or pg_get_functiondef('public.has_staff_scope_permission(text,uuid,uuid,uuid)'::regprocedure)
       not like '%mr.scope_type = ''CLASS''%'
     or pg_get_functiondef('public.has_staff_scope_permission(text,uuid,uuid,uuid)'::regprocedure)
       like '%mr.scope_type = ''OWN''%'
     or pg_get_functiondef('public.has_staff_scope_permission(text,uuid,uuid,uuid)'::regprocedure)
       like '%mr.scope_type = ''RELATED''%'
  then raise exception 'Operational scope helper admits an invalid scope type'; end if;

  -- 4b. Attendance-specific roster SELECT policies MUST NOT exist. Batch 5 relies on
  -- the canonical can_access_enrollment/can_access_student SELECT policies for the
  -- operational staff/teacher roster read path. Reintroducing these policies exposes
  -- the systemic OWN-scope fallback in public.has_permission and creates a recursive
  -- Attendance-only RLS chain; both are forbidden.
  if exists (
    select 1 from pg_policies where schemaname='public'
      and (
        (tablename='class_enrollments' and policyname='class_enrollments_attendance_select')
        or (tablename='student_enrollments' and policyname='student_enrollments_attendance_select')
        or (tablename='students' and policyname='students_attendance_select')
      )
  ) then raise exception 'Forbidden Attendance-specific roster SELECT policy exists — Batch 5 uses canonical SIS access'; end if;

  -- 4c. No additional permissive policy may bypass the operational contract.
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and (
        (tablename='attendance_sessions' and policyname not in (
          'attendance_sessions_select',
          'attendance_sessions_insert',
          'attendance_sessions_update'
        ))
        or (tablename='student_attendance_records' and policyname not in (
          'student_attendance_select',
          'student_attendance_insert',
          'student_attendance_update'
        ))
      )
  ) then raise exception 'Unexpected Attendance policy can bypass the operational contract'; end if;

  -- 5. No attendance DELETE policy
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename in ('attendance_sessions','student_attendance_records')
      and cmd in ('DELETE','ALL')
  ) then raise exception 'Attendance DELETE policy exists — hard-delete is not allowed'; end if;

  -- 6. Session UPDATE policy semantics: submit and lock branches only
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='attendance_sessions'
      and policyname='attendance_sessions_update'
      and qual like '%has_staff_scope_permission%'
      and qual like '%attendance.submit%'
      and qual like '%attendance.lock%'
      and qual not like '%has_permission(%'
      and with_check like '%has_staff_scope_permission%'
      and with_check like '%attendance.submit%'
      and with_check like '%attendance.lock%'
      and with_check not like '%has_permission(%'
  ) then raise exception 'attendance_sessions_update policy is missing submit/lock semantics'; end if;

  -- 7. INSERT WITH CHECK independently preserves all record-state permissions.
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_attendance_records'
      and policyname='student_attendance_insert'
      and with_check like '%has_staff_scope_permission%'
      and with_check not like '%has_permission(%'
      and with_check like '%attendance.record%'
      and with_check like '%attendance.correct_open%'
      and with_check like '%attendance.correct_locked%'
      and with_check like '%''open''%'
      and with_check like '%''submitted''%'
      and with_check like '%''locked''%'
      and with_check like '%''corrected''%'
  ) then raise exception 'student_attendance_insert WITH CHECK is incomplete'; end if;

  -- 8. UPDATE USING independently preserves the old-row boundary.
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_attendance_records'
      and policyname='student_attendance_update'
      and qual like '%has_staff_scope_permission%'
      and qual not like '%has_permission(%'
      and qual like '%attendance.record%'
      and qual like '%attendance.correct_open%'
      and qual like '%attendance.correct_locked%'
      and qual like '%''open''%'
      and qual like '%''submitted''%'
      and qual like '%''locked''%'
      and qual like '%''corrected''%'
  ) then raise exception 'student_attendance_update USING is incomplete'; end if;

  -- 9. UPDATE WITH CHECK independently preserves the new-row boundary.
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='student_attendance_records'
      and policyname='student_attendance_update'
      and with_check like '%has_staff_scope_permission%'
      and with_check not like '%has_permission(%'
      and with_check like '%attendance.record%'
      and with_check like '%attendance.correct_open%'
      and with_check like '%attendance.correct_locked%'
      and with_check like '%''open''%'
      and with_check like '%''submitted''%'
      and with_check like '%''locked''%'
      and with_check like '%''corrected''%'
  ) then raise exception 'student_attendance_update WITH CHECK is incomplete'; end if;

  -- 10. Lifecycle guard is SECURITY INVOKER (uses auth.uid, not definer privilege)
  if (select p.prosecdef from pg_proc p where p.oid='public.guard_attendance_session_transition()'::regprocedure) then
    raise exception 'guard_attendance_session_transition must be SECURITY INVOKER';
  end if;

  -- 11. Validation/consistency functions are SECURITY DEFINER
  if not (select p.prosecdef from pg_proc p where p.oid='public.validate_attendance_session_consistency()'::regprocedure)
     or not (select p.prosecdef from pg_proc p where p.oid='public.validate_student_attendance_record()'::regprocedure)
  then raise exception 'Attendance validation functions must be SECURITY DEFINER'; end if;
end
$attendance$;

select 'B5 ATTENDANCE STRUCTURAL VALIDATION PASSED' as result;
rollback;
