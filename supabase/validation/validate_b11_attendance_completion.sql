-- EduSmart Core V1 / Batch 11 Phase 1 — read-only structural validator.
begin;
set transaction read only;

do $b11$
declare
  v_function regprocedure;
  v_definition text;
  v_parent text;
  v_student text;
begin
  if to_regclass('public.attendance_session_roster_members') is null
     or to_regclass('public.attendance_command_requests') is null then
    raise exception 'B11: required foundation table is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.attendance_session_roster_members'::regclass
      and c.contype='p'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.attendance_session_roster_members'::regclass
      and c.contype='u'
      and (select array_agg(a.attname order by u.ord)
           from unnest(c.conkey) with ordinality u(attnum,ord)
           join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=u.attnum)
          = array['attendance_session_id','student_enrollment_id']::name[]
  ) then raise exception 'B11: roster PK or logical uniqueness is missing'; end if;

  if not exists(select 1 from pg_catalog.pg_constraint c
       where c.conrelid='public.attendance_session_roster_members'::regclass
         and c.conname='attendance_roster_session_fk' and c.contype='f'
         and c.confrelid='public.attendance_sessions'::regclass and c.confdeltype='r')
     or not exists(select 1 from pg_catalog.pg_constraint c
       where c.conrelid='public.attendance_session_roster_members'::regclass
         and c.conname='attendance_roster_enrollment_student_fk' and c.contype='f'
         and c.confrelid='public.student_enrollments'::regclass and c.confdeltype='r')
     or not exists(select 1 from pg_catalog.pg_constraint c
       where c.conrelid='public.attendance_session_roster_members'::regclass
         and c.conname='attendance_roster_student_fk' and c.contype='f'
         and c.confrelid='public.students'::regclass and c.confdeltype='r')
     or not exists (
       select 1 from pg_catalog.pg_constraint c
       where c.conrelid='public.student_attendance_records'::regclass
         and c.conname='student_attendance_roster_member_fk' and c.contype='f'
         and c.confrelid='public.attendance_session_roster_members'::regclass
         and c.confdeltype='r' and c.convalidated
     ) then raise exception 'B11: tenant-safe roster foreign keys are incomplete'; end if;

  if not exists(select 1 from pg_catalog.pg_constraint c
      where c.conrelid='public.attendance_command_requests'::regclass
        and c.conname='attendance_command_fingerprint_sha256_check' and c.contype='c')
  then raise exception 'B11: command fingerprint shape constraint is missing'; end if;

  if not exists(select 1 from pg_catalog.pg_trigger
    where tgrelid='public.attendance_session_roster_members'::regclass
      and tgname='trg_attendance_roster_immutable' and not tgisinternal)
    or not exists(select 1 from pg_catalog.pg_trigger
    where tgrelid='public.attendance_command_requests'::regclass
      and tgname='trg_attendance_command_immutable' and not tgisinternal)
  then raise exception 'B11: immutable-history triggers are missing'; end if;

  if not exists(select 1 from pg_catalog.pg_attribute
      where attrelid='public.attendance_command_requests'::regclass
        and attname='retained_until' and attnotnull and not attisdropped)
  then raise exception 'B11: command retention horizon is missing'; end if;

  if not (select relrowsecurity from pg_catalog.pg_class where oid='public.attendance_session_roster_members'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid='public.attendance_command_requests'::regclass)
  then raise exception 'B11: RLS is disabled on a new table'; end if;

  if not exists(select 1 from pg_catalog.pg_policies where schemaname='public'
      and tablename='attendance_session_roster_members' and policyname='attendance_roster_select'
      and cmd='SELECT' and qual like '%has_staff_scope_permission%attendance.read%')
     or exists(select 1 from pg_catalog.pg_policies where schemaname='public'
      and tablename in ('attendance_session_roster_members','attendance_command_requests')
      and cmd in ('INSERT','UPDATE','DELETE','ALL'))
  then raise exception 'B11: new-table RLS posture is unsafe'; end if;

  if has_table_privilege('authenticated','public.attendance_session_roster_members','INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.attendance_command_requests','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.attendance_sessions','INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.student_attendance_records','INSERT,UPDATE,DELETE')
     or has_table_privilege('anon','public.attendance_session_roster_members','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon','public.attendance_command_requests','SELECT,INSERT,UPDATE,DELETE')
  then raise exception 'B11: browser table privileges are too broad'; end if;

  foreach v_function in array array[
    'public.attendance_school_timezone(uuid)'::regprocedure,
    'public.open_attendance_session(uuid,date,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,boolean,boolean)'::regprocedure,
    'public.save_attendance_draft(uuid,timestamptz,uuid,jsonb)'::regprocedure,
    'public.submit_attendance_session(uuid,timestamptz,uuid)'::regprocedure,
    'public.lock_attendance_session(uuid,timestamptz,uuid)'::regprocedure,
    'public.correct_attendance_record(uuid,timestamptz,uuid,text,text,text)'::regprocedure,
    'public.list_attendance_history(uuid,date,date,uuid,text,uuid,integer,integer)'::regprocedure,
    'public.list_staff_student_attendance_history(uuid,date,date,integer,integer)'::regprocedure,
    'public.list_attendance_corrections(uuid,integer,integer)'::regprocedure
  ] loop
    select pg_catalog.pg_get_functiondef(v_function) into v_definition;
    if not (select p.prosecdef from pg_catalog.pg_proc p where p.oid=v_function)
       or not (select coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']
               from pg_catalog.pg_proc p where p.oid=v_function)
       or not has_function_privilege('authenticated',v_function,'EXECUTE')
       or has_function_privilege('anon',v_function,'EXECUTE')
       or has_function_privilege('service_role',v_function,'EXECUTE')
    then raise exception 'B11: RPC security/ACL failure for %',v_function; end if;
  end loop;

  v_definition:=pg_catalog.pg_get_functiondef('public.submit_attendance_session(uuid,timestamptz,uuid)'::regprocedure);
  if position('v_roster=0' in replace(v_definition,' ',''))=0
     or position('v_records<>v_roster' in replace(v_definition,' ',''))=0
     or position('B11_ATTENDANCE_ROSTER_INCOMPLETE' in v_definition)=0
     or position('status=''submitted''' in replace(v_definition,' ',''))=0
  then raise exception 'B11: complete-roster submit contract is incomplete'; end if;

  v_definition:=pg_catalog.pg_get_functiondef('public.guard_attendance_session_transition()'::regprocedure);
  if position('B11_ATTENDANCE_EMPTY_ROSTER' in v_definition)=0
     or position('B11_ATTENDANCE_ROSTER_INCOMPLETE' in v_definition)=0
     or position('old.status = ''open'' and new.status = ''submitted''' in v_definition)=0
     or position('old.status = ''submitted'' and new.status = ''locked''' in v_definition)=0
  then raise exception 'B11: lifecycle trigger does not enforce complete monotonic submission'; end if;

  v_definition:=pg_catalog.pg_get_functiondef('public.correct_attendance_record(uuid,timestamptz,uuid,text,text,text)'::regprocedure);
  if position('attendance.correct_open' in v_definition)=0
     or position('attendance.correct_locked' in v_definition)=0
     or position('set status=p_status' in lower(v_definition))=0
     or position('update public.attendance_sessions' in lower(v_definition))>0
  then raise exception 'B11: correction lifecycle contract is invalid'; end if;

  v_definition:=pg_catalog.pg_get_functiondef('public.open_attendance_session(uuid,date,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,boolean,boolean)'::regprocedure);
  if position('created_at_session_open' in v_definition)=0
     or position('B11_ATTENDANCE_EMPTY_ROSTER' in v_definition)=0
     or position('pg_timezone_names' in v_definition)=0
     or position('B11_ATTENDANCE_CALENDAR_IMPACT_ACK_REQUIRED' in v_definition)=0
     or position('B11_ATTENDANCE_COLLISION_ACK_REQUIRED' in v_definition)=0
     or position('B11_ATTENDANCE_LOGICAL_SESSION_CONFLICT' in v_definition)=0
     or position('coalesce(e.ends_at,e.starts_at)' in replace(v_definition,' ',''))=0
  then raise exception 'B11: open/snapshot/date contract is incomplete'; end if;

  v_definition:=pg_catalog.pg_get_functiondef('public.b11_attendance_fingerprint(jsonb)'::regprocedure);
  if position('extensions.digest' in v_definition)=0 or position('sha256' in lower(v_definition))=0
     or position('md5' in lower(v_definition))>0
     or has_function_privilege('authenticated','public.b11_attendance_fingerprint(jsonb)'::regprocedure,'EXECUTE')
     or has_function_privilege('anon','public.b11_attendance_fingerprint(jsonb)'::regprocedure,'EXECUTE')
     or has_function_privilege('service_role','public.b11_attendance_fingerprint(jsonb)'::regprocedure,'EXECUTE')
  then raise exception 'B11: SHA-256 request fingerprint contract is missing'; end if;

  v_definition:=pg_catalog.pg_get_functiondef('public.save_attendance_draft(uuid,timestamptz,uuid,jsonb)'::regprocedure);
  if position('B11_ATTENDANCE_NOTE_TOO_LONG' in v_definition)=0 or position('>500' in replace(v_definition,' ',''))=0
  then raise exception 'B11: draft note boundary is missing'; end if;
  v_definition:=pg_catalog.pg_get_functiondef('public.correct_attendance_record(uuid,timestamptz,uuid,text,text,text)'::regprocedure);
  if position('B11_ATTENDANCE_NOTE_TOO_LONG' in v_definition)=0 or position('>500' in replace(v_definition,' ',''))=0
  then raise exception 'B11: correction note boundary is missing'; end if;

  if exists(select 1 from pg_catalog.pg_policies where schemaname='public'
    and tablename in ('attendance_sessions','student_attendance_records','attendance_session_roster_members','attendance_command_requests')
    and cmd in ('DELETE','ALL'))
  then raise exception 'B11: Attendance hard-delete policy exists'; end if;

  v_parent:=pg_catalog.pg_get_functiondef('public.list_parent_student_attendance(uuid,date,date)'::regprocedure);
  v_student:=pg_catalog.pg_get_functiondef('public.list_student_own_attendance(uuid,uuid,date,date)'::regprocedure);
  if position('security definer' in lower(v_parent))=0 or position('submitted' in v_parent)=0
     or position('locked' in v_parent)=0 or position('corrected' in v_parent)=0
     or position('student_guardians' in v_parent)=0 or position('correction_reason' in v_parent)>0
     or position('security definer' in lower(v_student))=0 or position('students st' in v_student)=0
     or position('st.profile_id = auth.uid()' in v_student)=0 or position('correction_reason' in v_student)>0
  then raise exception 'B11: Parent/Student portal attendance contract changed'; end if;

  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.student_attendance_records'::regclass
       and tgname='audit_student_attendance' and not tgisinternal)
     or not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.attendance_sessions'::regclass
       and tgname='trg_attendance_sessions_workflow_guard' and not tgisinternal)
  then raise exception 'B11: B5 audit/lifecycle trigger is missing'; end if;

  if exists(select 1 from public.student_attendance_records r
    left join public.attendance_session_roster_members m
      on m.attendance_session_id=r.attendance_session_id
     and m.student_enrollment_id=r.student_enrollment_id
     and m.organization_id=r.organization_id and m.school_id=r.school_id
    where m.id is null)
  then raise exception 'B11: deployed record lacks roster snapshot membership'; end if;
end
$b11$;

select 'B11 ATTENDANCE COMPLETION STRUCTURAL VALIDATION PASSED' as result;
rollback;
