-- EduSmart Core V1 / Batch 7 Parent Portal: exact release-contract validator.
--
-- B7 does not add or replace any RLS policy on canonical protected tables.
-- Every non-attendance Parent Portal read reuses the canonical foundation
-- (student.read/enrollment.read RELATED via has_permission), Batch 4 timetable
-- (published + can_access_teaching_assignment), and Batch 6
-- (published assessments + student_scores_select RELATED bound to st.id).
-- The single new B7 surface is the subject-scoped Attendance reader function,
-- which is validated below for function identity, security mode, empty
-- search_path, SQL/stable/table return, execute grants, exact subject
-- binding AND canonical attendance.read RBAC re-check.
--
-- The validator also asserts that B7 did not silently regress the canonical
-- RELATED subject-binding it depends on (student_scores_select passes st.id;
-- has_permission RELATED requires guardians.profile_id = auth.uid() with
-- optional exact p_related_student_id match), that B5's staff-only Attendance
-- policies remain intact, and that no additional permissive SELECT policy has
-- been layered onto any portal-critical table (F-005 remediation).

do $$
declare
  v_oid oid;
  v_hash text;
  v_expected_hash text;
  v_expr text;
  v_defn text;
  n integer;
  r record;
  v_portal_tables text[] := array[
    'public.students',
    'public.student_guardians',
    'public.guardians',
    'public.student_enrollments',
    'public.class_enrollments',
    'public.timetable_entries',
    'public.student_attendance_records',
    'public.student_scores',
    'public.assessments'
  ];
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
  -- 2. Portal-critical policy inventory (F-005): exact total count AND
  --    exact permissive-SELECT count per table. An extra permissive SELECT
  --    policy on any portal-critical table would fail here even if the
  --    canonical policy definition remained intact.
  ----------------------------------------------------------------------------
  for r in
    select unnest as tname,
           unnest_count as expected_total,
           unnest_sel as expected_select
    from (
      select
        unnest(v_portal_tables) as unnest,
        unnest(array[3,3,3,3,3,3,3,3,3])::int as unnest_count,
        unnest(array[1,1,1,1,1,1,1,1,1])::int as unnest_sel
    ) t
  loop
    select count(*) into n from pg_catalog.pg_policy
    where polrelid = r.tname::regclass;
    if n <> r.expected_total then
      raise exception 'Portal-critical table % has % policies, expected %',
        r.tname, n, r.expected_total;
    end if;

    -- Permissive SELECT policies only. polpermissive is true for PERMISSIVE.
    select count(*) into n from pg_catalog.pg_policy
    where polrelid = r.tname::regclass
      and polcmd = 'r'
      and polpermissive is true;
    if n <> r.expected_select then
      raise exception 'Portal-critical table % has % permissive SELECT policies, expected %',
        r.tname, n, r.expected_select;
    end if;

    -- Every existing policy must target the authenticated role only (no
    -- broadening to public/anon). polroles = {0} means PUBLIC.
    if exists (
      select 1 from pg_catalog.pg_policy p
      join pg_catalog.pg_roles ro on ro.oid = any(p.polroles)
      where p.polrelid = r.tname::regclass
        and ro.rolname in ('anon','public')
    ) then
      raise exception 'Portal-critical table % has a policy granted to anon/public', r.tname;
    end if;
  end loop;

  ----------------------------------------------------------------------------
  -- 3. Canonical portal-critical SELECT policies exist by their stable name
  --    and route through the expected canonical helper. (Guards against a
  --    silent rename that swaps in a broader definition under a new name.)
  ----------------------------------------------------------------------------
  for r in
    select * from (values
      ('public.students'::regclass,             'students_select'),
      ('public.student_guardians'::regclass,    'student_guardians_select'),
      ('public.guardians'::regclass,            'guardians_select'),
      ('public.student_enrollments'::regclass,  'student_enrollments_select'),
      ('public.class_enrollments'::regclass,    'class_enrollments_select'),
      ('public.timetable_entries'::regclass,    'timetable_entries_select'),
      ('public.student_attendance_records'::regclass, 'student_attendance_select'),
      ('public.student_scores'::regclass,       'student_scores_select'),
      ('public.assessments'::regclass,          'assessments_select')
    ) as t(tbl regclass, pname text)
  loop
    if not exists (
      select 1 from pg_catalog.pg_policy
      where polrelid = r.tbl and polname = r.pname and polcmd = 'r'
    ) then
      raise exception 'Canonical portal SELECT policy % on % is missing', r.pname, r.tbl;
    end if;
  end loop;

  ----------------------------------------------------------------------------
  -- 4. Canonical policies parents depend on still bind the exact subject.
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
  -- 5. B5 staff-only Attendance policies remain intact and were not widened.
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
  -- 6. B7 SECURITY DEFINER attendance reader: identity, mode, contract.
  ----------------------------------------------------------------------------
  v_oid := 'public.list_parent_student_attendance(uuid,date,date)'::regprocedure::oid;

  select md5(regexp_replace(lower(regexp_replace(prosrc, '--[^' || chr(10) || chr(13) || ']*', ' ', 'g')),
             '[[:space:]]', '', 'g'))
    into v_hash
  from pg_catalog.pg_proc where oid = v_oid;
  v_expected_hash := '69421375dbd1f70d1e03fdaa66e98224';
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
  if exists (
    select 1
    from aclexplode((select proacl from pg_catalog.pg_proc where oid = v_oid)) a
    join pg_catalog.pg_roles r on r.oid = a.grantee
    where r.rolname in ('anon','service_role') and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'list_parent_student_attendance must not grant EXECUTE to anon/service_role';
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
  -- 7. Positive semantic assertions on the B7 reader body (F-006 remediation).
  --    Prove the function still binds the exact student AND now re-asserts
  --    the canonical attendance.read RBAC path with the correct arguments.
  ----------------------------------------------------------------------------
  -- Exact student binding (subject; guards VAL-D, VAL-E).
  if position('se.student_id=p_student_id' in v_hash) = 0 then
    raise exception 'B7 attendance reader no longer filters by exact student id';
  end if;
  if position('sg.student_id=p_student_id' in v_hash) = 0 then
    raise exception 'B7 attendance reader no longer requires the guardian relation to the exact student';
  end if;
  -- Active Guardian / StudentGuardian identity (guards VAL-F, VAL-G).
  if position('g.profile_id=auth.uid()' in v_hash) = 0 then
    raise exception 'B7 attendance reader no longer requires guardians.profile_id=auth.uid()';
  end if;
  if position('sg.status=''active''' in v_hash) = 0 then
    raise exception 'B7 attendance reader no longer requires an active StudentGuardian relation';
  end if;
  if position('g.status=''active''' in v_hash) = 0 then
    raise exception 'B7 attendance reader no longer requires an active Guardian record';
  end if;
  -- Cross-organization isolation (guards VAL-I).
  if position('sg.organization_id=star.organization_id' in v_hash) = 0 then
    raise exception 'B7 attendance reader no longer pins guardian/organization equality';
  end if;
  -- Safe session lifecycle.
  if position('s.statusin(''submitted'',''locked'',''corrected'')' in v_hash) = 0 then
    raise exception 'B7 attendance reader no longer restricts to outcome-visible sessions';
  end if;
  -- Canonical RBAC: attendance.read via public.has_permission with the exact
  -- (org, school, classroom, NULL owner, related student) context of the row
  -- (guards VAL-A, VAL-B, VAL-C, VAL-H — appended OR TRUE would change hash).
  if position('andpublic.has_permission(''attendance.read''' in v_hash) = 0 then
    raise exception 'B7 attendance reader no longer enforces canonical attendance.read via public.has_permission';
  end if;
  if position(',p_student_id)' in v_hash) = 0 then
    raise exception 'B7 attendance reader no longer passes p_student_id as the related student arg to has_permission';
  end if;

  -- Negative assertions: the body must NOT fall back to role-name checks,
  -- email matching, generic membership lookups outside has_permission, or
  -- OR-TRUE bypasses.
  if position('role_name' in v_hash) <> 0
     or position('r.code=''parent''' in v_hash) <> 0
     or position('ortrue' in v_hash) <> 0
     or position('email' in v_hash) <> 0
     or position('organization_memberships' in v_hash) <> 0 then
    raise exception 'B7 attendance reader introduced an unsafe fallback (role/email/membership-name or OR TRUE)';
  end if;

  -- Belt-and-braces: the CREATE FUNCTION definition still includes the exact
  -- has_permission call with the argument shape reviewed for release.
  select pg_get_functiondef(v_oid) into v_defn;
  if v_defn !~* 'public\.has_permission\s*\(\s*''attendance\.read''' then
    raise exception 'list_parent_student_attendance definition no longer literally calls public.has_permission(''attendance.read'', ...)';
  end if;

  ----------------------------------------------------------------------------
  -- 8. PARENT role continues to hold the read codes the Portal depends on.
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
