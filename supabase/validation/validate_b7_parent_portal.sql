-- EduSmart Core V1 / Batch 7 Parent Portal: exact release-contract validator.
--
-- B7 does not add or replace any RLS policy on canonical protected tables.
-- Every non-attendance Parent Portal read reuses the canonical foundation
-- (student.read/enrollment.read RELATED via has_permission), Batch 4 timetable
-- (published + can_access_teaching_assignment), and Batch 6
-- (published assessments + student_scores_select RELATED bound to st.id).
-- The single new B7 surface is the subject-scoped Attendance reader function,
-- which is validated below (function identity, security mode, empty
-- search_path, SQL/stable/table return, execute grants).
--
-- The validator also asserts that B7 did not silently regress the canonical
-- RELATED subject-binding it depends on (student_scores_select passes st.id;
-- has_permission RELATED requires guardians.profile_id = auth.uid() with
-- optional exact p_related_student_id match), and that B5's staff-only
-- Attendance policies remain intact.

do $$
declare
  v_oid oid;
  v_hash text;
  v_expected_hash text;
  v_expr text;
  n integer;
begin
  ----------------------------------------------------------------------------
  -- 1. RLS remains enabled on every portal-relevant protected table.
  ----------------------------------------------------------------------------
  if exists (
    select 1 from pg_catalog.pg_class c
    where c.oid in (
      'public.students'::regclass,
      'public.student_enrollments'::regclass,
      'public.class_enrollments'::regclass,
      'public.student_guardians'::regclass,
      'public.guardians'::regclass,
      'public.student_scores'::regclass,
      'public.assessments'::regclass,
      'public.timetable_entries'::regclass,
      'public.student_attendance_records'::regclass,
      'public.attendance_sessions'::regclass
    )
    and not c.relrowsecurity
  ) then
    raise exception 'B7 dependency: RLS is not enabled on a portal-relevant table';
  end if;

  ----------------------------------------------------------------------------
  -- 2. B7 must NOT introduce any write policy on portal-protected tables.
  ----------------------------------------------------------------------------
  -- Attendance write policies must remain exactly B5's staff-only set.
  select count(*) into n from pg_catalog.pg_policy
  where polrelid = 'public.student_attendance_records'::regclass;
  if n <> 3 then
    raise exception 'Attendance record policy count changed unexpectedly: %', n;
  end if;

  -- No extra permissive SELECT policy has been layered on student_attendance_records.
  select count(*) into n from pg_catalog.pg_policy
  where polrelid = 'public.student_attendance_records'::regclass
    and polcmd = 'r';
  if n <> 1 then
    raise exception 'Attendance record SELECT policy count changed: %', n;
  end if;

  -- No extra portal-write policies snuck onto scores or assessments.
  select count(*) into n from pg_catalog.pg_policy
  where polrelid = 'public.student_scores'::regclass;
  if n <> 3 then raise exception 'student_scores policy count changed: %',n; end if;
  select count(*) into n from pg_catalog.pg_policy
  where polrelid = 'public.assessments'::regclass;
  if n <> 3 then raise exception 'assessments policy count changed: %',n; end if;

  ----------------------------------------------------------------------------
  -- 3. Canonical policies parents depend on still bind the exact subject.
  ----------------------------------------------------------------------------
  -- student_scores_select MUST still pass st.id as the RELATED subject arg.
  select regexp_replace(lower(pg_get_expr(polqual, polrelid)), '[[:space:]]', '', 'g')
    into v_expr
  from pg_catalog.pg_policy
  where polrelid = 'public.student_scores'::regclass
    and polname = 'student_scores_select';
  if v_expr not like '%st.profile_id,st.id%' or v_expr not like '%a.status=%published%' then
    raise exception 'student_scores_select no longer binds exact student id for published/RELATED reads';
  end if;

  -- can_access_student MUST still receive s.id via students_select.
  select regexp_replace(lower(pg_get_expr(polqual, polrelid)), '[[:space:]]', '', 'g')
    into v_expr
  from pg_catalog.pg_policy
  where polrelid = 'public.students'::regclass and polname = 'students_select';
  if v_expr not like '%can_access_student(%student.read%,id,organization_id)%' then
    raise exception 'students_select no longer routes through can_access_student(exact id)';
  end if;

  -- has_permission RELATED branch must still require exact student binding.
  select md5(regexp_replace(lower(regexp_replace(prosrc, '--[^' || chr(10) || chr(13) || ']*', ' ', 'g')),
             '[[:space:]]', '', 'g'))
    into v_hash
  from pg_catalog.pg_proc
  where oid = 'public.has_permission(text,uuid,uuid,uuid,uuid,uuid)'::regprocedure;
  if position('scope_type=''related''' in v_hash) = 0
     or position('g.profile_id=auth.uid()' in v_hash) = 0
     or position('p_related_student_idisnullors.id=p_related_student_id' in v_hash) = 0 then
    raise exception 'has_permission RELATED branch no longer requires exact guardian subject binding';
  end if;

  ----------------------------------------------------------------------------
  -- 4. B5 staff-only Attendance policies remain intact and were not widened.
  ----------------------------------------------------------------------------
  select regexp_replace(lower(pg_get_expr(polqual, polrelid)), '[[:space:]]', '', 'g')
    into v_expr
  from pg_catalog.pg_policy
  where polrelid = 'public.student_attendance_records'::regclass
    and polname  = 'student_attendance_select';
  if v_expr is null then
    raise exception 'B5 student_attendance_select policy is missing';
  end if;
  if v_expr not like '%has_staff_scope_permission(%attendance.read%' then
    raise exception 'student_attendance_select is no longer routed via has_staff_scope_permission';
  end if;
  -- Must NOT have grown a parent/related overlay: no reference to
  -- student_guardians, guardians, or profile_id in the operational SELECT policy.
  if v_expr like '%student_guardians%' or v_expr like '%guardians%' or v_expr like '%profile_id%' then
    raise exception 'Operational student_attendance_select was widened with a parent overlay';
  end if;

  ----------------------------------------------------------------------------
  -- 5. B7 SECURITY DEFINER attendance reader: identity, mode, contract.
  ----------------------------------------------------------------------------
  v_oid := 'public.list_parent_student_attendance(uuid,date,date)'::regprocedure::oid;

  select md5(regexp_replace(lower(regexp_replace(prosrc, '--[^' || chr(10) || chr(13) || ']*', ' ', 'g')),
             '[[:space:]]', '', 'g'))
    into v_hash
  from pg_catalog.pg_proc where oid = v_oid;
  v_expected_hash := 'ce514acb7f001144eca0d3ec818926e4';
  if v_hash is distinct from v_expected_hash then
    raise exception 'list_parent_student_attendance body differs from reviewed B7 contract: got %',
      v_hash;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = v_oid
      and pg_get_functiondef(p.oid) ilike '%SET search_path TO ''''%'
  ) then
    raise exception 'list_parent_student_attendance must SET search_path to empty';
  end if;

  if not (select prosecdef from pg_catalog.pg_proc where oid = v_oid) then
    raise exception 'list_parent_student_attendance must be SECURITY DEFINER';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = v_oid
      and (l.lanname <> 'sql' or p.provolatile <> 's' or p.proretset is not true)
  ) then
    raise exception 'list_parent_student_attendance language/volatility/return contract differs';
  end if;

  -- Public must NOT hold execute; only authenticated may execute.
  if exists (
    select 1
    from aclexplode((select proacl from pg_catalog.pg_proc where oid = v_oid)) a
    join pg_catalog.pg_roles r on r.oid = a.grantee
    where r.rolname = 'public' and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'list_parent_student_attendance still grants EXECUTE to public';
  end if;
  if not exists (
    select 1
    from aclexplode((select proacl from pg_catalog.pg_proc where oid = v_oid)) a
    join pg_catalog.pg_roles r on r.oid = a.grantee
    where r.rolname = 'authenticated' and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'list_parent_student_attendance must grant EXECUTE to authenticated';
  end if;

  ----------------------------------------------------------------------------
  -- 6. The B7 reader body itself binds the exact student and safe sessions.
  -- (Guards VPM-01, VPM-03, VPM-06.)
  ----------------------------------------------------------------------------
  if position('se.student_id=p_student_id' in v_hash) = 0 then
    raise exception 'B7 attendance reader no longer filters by exact student id';
  end if;
  if position('sg.student_id=p_student_id' in v_hash) = 0
     or position('g.profile_id=auth.uid()' in v_hash) = 0
     or position('sg.status=''active''' in v_hash) = 0 then
    raise exception 'B7 attendance reader no longer requires an exact active guardian binding';
  end if;
  if position('s.statusin(''submitted'',''locked'',''corrected'')' in v_hash) = 0 then
    raise exception 'B7 attendance reader no longer restricts to outcome-visible sessions';
  end if;

  ----------------------------------------------------------------------------
  -- 7. PARENT role continues to hold the read codes the Portal depends on.
  ----------------------------------------------------------------------------
  foreach v_expr in array array[
    'student.read','guardian.read','enrollment.read','schedule.read',
    'attendance.read','assessment.read','score.read'
  ] loop
    if not exists (
      select 1 from public.role_permissions rp
      join public.roles r on r.id = rp.role_id
      join public.permissions p on p.id = rp.permission_id
      where r.organization_id is null and r.code = 'PARENT' and p.code = v_expr
    ) then
      raise exception 'PARENT role missing required B7 permission: %', v_expr;
    end if;
  end loop;
end $$;

select 'B7 parent portal validation passed' as result;
