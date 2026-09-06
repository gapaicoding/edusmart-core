-- EduSmart Core V1 / Batch 7 Parent Portal: exact release-contract validator.
-- Run after 20260906130000_b7_parent_portal.sql is applied.

do $$
declare
  v_oid oid;
  v_owner oid;
  v_source text;
  v_normalized_source text;
  v_hash text;
  v_actual_using text;
  v_expected_using text;
  v_actual_check text;
  v_expected_check text;
  n integer;
  r record;
begin
  if exists (
    select 1 from pg_catalog.pg_class c
    where c.oid = any (array[
      'public.students'::regclass, 'public.student_guardians'::regclass,
      'public.guardians'::regclass, 'public.student_enrollments'::regclass,
      'public.class_enrollments'::regclass, 'public.timetable_entries'::regclass,
      'public.student_attendance_records'::regclass,
      'public.student_scores'::regclass, 'public.assessments'::regclass,
      'public.attendance_sessions'::regclass
    ]) and not c.relrowsecurity
  ) then
    raise exception 'B7 dependency: RLS is not enabled on a portal-relevant table';
  end if;

  -- Exact inventory and role comparison uses polroles directly, preserving
  -- PUBLIC (OID 0) instead of losing it through a pg_roles join.
  for r in
    select * from (values
      ('public.students'::regclass, 3, 'students_select'),
      ('public.student_guardians'::regclass, 3, 'student_guardians_select'),
      ('public.guardians'::regclass, 3, 'guardians_select'),
      ('public.student_enrollments'::regclass, 3, 'student_enrollments_select'),
      ('public.class_enrollments'::regclass, 3, 'class_enrollments_select'),
      ('public.timetable_entries'::regclass, 3, 'timetable_entries_select'),
      ('public.student_attendance_records'::regclass, 3, 'student_attendance_select'),
      ('public.student_scores'::regclass, 3, 'student_scores_select'),
      ('public.assessments'::regclass, 3, 'assessments_select')
    ) as t(tbl regclass, expected_total integer, pname text)
  loop
    select count(*) into n from pg_catalog.pg_policy where polrelid = r.tbl;
    if n <> r.expected_total then
      raise exception 'Portal-critical table % has % policies, expected %', r.tbl, n, r.expected_total;
    end if;
    select count(*) into n from pg_catalog.pg_policy where polrelid = r.tbl and polcmd = 'r';
    if n <> 1 then
      raise exception 'Portal-critical table % has % SELECT policies, expected 1', r.tbl, n;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_policy p
      where p.polrelid = r.tbl and p.polname = r.pname and p.polcmd = 'r'
        and p.polpermissive
        and p.polroles = array['authenticated'::regrole::oid]::oid[]
        and p.polwithcheck is null
    ) then
      raise exception 'Canonical SELECT policy % on % has wrong identity, mode, role set, or WITH CHECK', r.pname, r.tbl;
    end if;
  end loop;

  -- Shadow policies make PostgreSQL parse/deparse both expected and actual
  -- expressions. Normalization removes only case and insignificant whitespace.
  create temporary table b7_expected_students (like public.students including all) on commit drop;
  create temporary table b7_expected_student_guardians (like public.student_guardians including all) on commit drop;
  create temporary table b7_expected_guardians (like public.guardians including all) on commit drop;
  create temporary table b7_expected_student_enrollments (like public.student_enrollments including all) on commit drop;
  create temporary table b7_expected_class_enrollments (like public.class_enrollments including all) on commit drop;
  create temporary table b7_expected_timetable_entries (like public.timetable_entries including all) on commit drop;
  create temporary table b7_expected_student_attendance_records (like public.student_attendance_records including all) on commit drop;
  create temporary table b7_expected_student_scores (like public.student_scores including all) on commit drop;
  create temporary table b7_expected_assessments (like public.assessments including all) on commit drop;

  create policy students_select on b7_expected_students for select to authenticated
    using (public.can_access_student('student.read', id, organization_id));
  create policy student_guardians_select on b7_expected_student_guardians for select to authenticated
    using (
      public.can_access_student('student.read', student_id, organization_id)
      or exists (
        select 1 from public.guardians g
        where g.id = b7_expected_student_guardians.guardian_id
          and g.profile_id = auth.uid()
          and g.organization_id = b7_expected_student_guardians.organization_id
      )
    );
  create policy guardians_select on b7_expected_guardians for select to authenticated
    using (public.can_access_guardian('guardian.read', id, organization_id));
  create policy student_enrollments_select on b7_expected_student_enrollments for select to authenticated
    using (public.can_access_enrollment('enrollment.read', id));
  create policy class_enrollments_select on b7_expected_class_enrollments for select to authenticated
    using (public.can_access_enrollment('enrollment.read', student_enrollment_id));
  create policy timetable_entries_select on b7_expected_timetable_entries for select to authenticated
    using (exists (
      select 1 from public.teaching_assignments ta
      where ta.id = b7_expected_timetable_entries.teaching_assignment_id
        and (
          public.has_staff_scope_permission('schedule.read', b7_expected_timetable_entries.organization_id, b7_expected_timetable_entries.school_id, ta.classroom_id)
          or (b7_expected_timetable_entries.status = 'published'
              and public.can_access_teaching_assignment('schedule.read', b7_expected_timetable_entries.teaching_assignment_id))
        )
    ));
  create policy student_attendance_select on b7_expected_student_attendance_records for select to authenticated
    using (exists (
      select 1 from public.attendance_sessions s
      where s.id = b7_expected_student_attendance_records.attendance_session_id
        and s.organization_id = b7_expected_student_attendance_records.organization_id
        and s.school_id = b7_expected_student_attendance_records.school_id
        and public.has_staff_scope_permission('attendance.read', s.organization_id, s.school_id, s.classroom_id)
    ));
  create policy student_scores_select on b7_expected_student_scores for select to authenticated
    using (exists (
      select 1
      from public.assessments a
      join public.teaching_assignments ta on ta.id = a.teaching_assignment_id
      join public.student_enrollments se on se.id = b7_expected_student_scores.student_enrollment_id
      join public.students st on st.id = se.student_id
      where a.id = b7_expected_student_scores.assessment_id
        and (
          public.has_staff_scope_permission('score.read', b7_expected_student_scores.organization_id, b7_expected_student_scores.school_id, ta.classroom_id)
          or (a.status = 'published' and public.has_permission(
            'score.read', b7_expected_student_scores.organization_id,
            b7_expected_student_scores.school_id, ta.classroom_id, st.profile_id, st.id
          ))
        )
    ));
  create policy assessments_select on b7_expected_assessments for select to authenticated
    using (exists (
      select 1 from public.teaching_assignments ta
      where ta.id = b7_expected_assessments.teaching_assignment_id
        and (
          public.has_staff_scope_permission('assessment.read', b7_expected_assessments.organization_id, b7_expected_assessments.school_id, ta.classroom_id)
          or (b7_expected_assessments.status = 'published'
              and public.can_access_assessment('assessment.read', b7_expected_assessments.id))
        )
    ));

  for r in
    select * from (values
      ('public.students'::regclass, 'students_select', 'b7_expected_students'::regclass, 'b7_expected_students', 'students'),
      ('public.student_guardians'::regclass, 'student_guardians_select', 'b7_expected_student_guardians'::regclass, 'b7_expected_student_guardians', 'student_guardians'),
      ('public.guardians'::regclass, 'guardians_select', 'b7_expected_guardians'::regclass, 'b7_expected_guardians', 'guardians'),
      ('public.student_enrollments'::regclass, 'student_enrollments_select', 'b7_expected_student_enrollments'::regclass, 'b7_expected_student_enrollments', 'student_enrollments'),
      ('public.class_enrollments'::regclass, 'class_enrollments_select', 'b7_expected_class_enrollments'::regclass, 'b7_expected_class_enrollments', 'class_enrollments'),
      ('public.timetable_entries'::regclass, 'timetable_entries_select', 'b7_expected_timetable_entries'::regclass, 'b7_expected_timetable_entries', 'timetable_entries'),
      ('public.student_attendance_records'::regclass, 'student_attendance_select', 'b7_expected_student_attendance_records'::regclass, 'b7_expected_student_attendance_records', 'student_attendance_records'),
      ('public.student_scores'::regclass, 'student_scores_select', 'b7_expected_student_scores'::regclass, 'b7_expected_student_scores', 'student_scores'),
      ('public.assessments'::regclass, 'assessments_select', 'b7_expected_assessments'::regclass, 'b7_expected_assessments', 'assessments')
    ) as t(actual_tbl regclass, pname text, expected_tbl regclass, shadow_name text, actual_name text)
  loop
    select regexp_replace(lower(pg_get_expr(polqual, polrelid)), '[[:space:]]', '', 'g'),
           regexp_replace(lower(pg_get_expr(polwithcheck, polrelid)), '[[:space:]]', '', 'g')
      into v_actual_using, v_actual_check
    from pg_catalog.pg_policy where polrelid = r.actual_tbl and polname = r.pname;
    select replace(regexp_replace(lower(pg_get_expr(polqual, polrelid)), '[[:space:]]', '', 'g'), r.shadow_name, r.actual_name),
           replace(regexp_replace(lower(pg_get_expr(polwithcheck, polrelid)), '[[:space:]]', '', 'g'), r.shadow_name, r.actual_name)
      into v_expected_using, v_expected_check
    from pg_catalog.pg_policy where polrelid = r.expected_tbl and polname = r.pname;
    if v_actual_using is distinct from v_expected_using or v_actual_check is distinct from v_expected_check then
      raise exception 'Canonical policy body drift detected for % on %', r.pname, r.actual_tbl;
    end if;
  end loop;

  -- Keep source, normalized source, and digest separate. Semantic assertions
  -- never inspect a 32-character MD5 value.
  select prosrc into v_source from pg_catalog.pg_proc
  where oid = 'public.has_permission(text,uuid,uuid,uuid,uuid,uuid)'::regprocedure;
  v_normalized_source := regexp_replace(lower(regexp_replace(v_source, '--[^' || chr(10) || chr(13) || ']*', ' ', 'g')), '[[:space:]]', '', 'g');
  v_hash := md5(v_normalized_source);
  if v_hash <> 'e869258671062fbd5345aad39cab3840' then
    raise exception 'has_permission body differs from canonical foundation contract: got %', v_hash;
  end if;
  if position('m.status=''active''' in v_normalized_source) = 0
     or position('p.status=''active''' in v_normalized_source) = 0
     or position('mr.scope_type=''related''' in v_normalized_source) = 0
     or position('g.profile_id=auth.uid()' in v_normalized_source) = 0
     or position('sg.status=''active''' in v_normalized_source) = 0
     or position('p_related_student_idisnullors.id=p_related_student_id' in v_normalized_source) = 0 then
    raise exception 'has_permission RELATED branch no longer enforces active exact-subject authorization';
  end if;

  v_oid := 'public.list_parent_student_attendance(uuid,date,date)'::regprocedure::oid;
  select p.proowner, p.prosrc into v_owner, v_source from pg_catalog.pg_proc p where p.oid = v_oid;
  v_normalized_source := regexp_replace(lower(regexp_replace(v_source, '--[^' || chr(10) || chr(13) || ']*', ' ', 'g')), '[[:space:]]', '', 'g');
  v_hash := md5(v_normalized_source);
  if v_hash <> '9e2f908a2da98129183768b7fb69c4fb' then
    raise exception 'list_parent_student_attendance body differs from reviewed B7 contract: got %', v_hash;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace ns on ns.oid = p.pronamespace
    join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = v_oid and ns.nspname = 'public'
      and p.pronargs = 3
      and p.proargtypes = array[
        'uuid'::regtype::oid,
        'date'::regtype::oid,
        'date'::regtype::oid
      ]::oidvector
      and p.prosecdef and p.proconfig @> array['search_path=""']::text[]
      and l.lanname = 'sql' and p.provolatile = 's' and p.proretset
      and pg_get_function_result(p.oid) = 'TABLE(record_id uuid, session_id uuid, organization_id uuid, school_id uuid, classroom_id uuid, session_date date, session_status text, status text, recorded_at timestamp with time zone)'
  ) then
    raise exception 'list_parent_student_attendance identity/security/return contract differs';
  end if;

  -- Function owner and authenticated are the only allowed direct EXECUTE
  -- grantees. PUBLIC is grantee OID 0 and is checked explicitly.
  if exists (
    select 1 from aclexplode(coalesce((select proacl from pg_catalog.pg_proc where oid = v_oid), acldefault('f', v_owner))) a
    where a.privilege_type = 'EXECUTE' and a.grantee = 0
  ) then raise exception 'list_parent_student_attendance grants EXECUTE to PUBLIC'; end if;
  if exists (
    select 1 from aclexplode(coalesce((select proacl from pg_catalog.pg_proc where oid = v_oid), acldefault('f', v_owner))) a
    where a.privilege_type = 'EXECUTE' and a.grantee in ('anon'::regrole::oid, 'service_role'::regrole::oid)
  ) then raise exception 'list_parent_student_attendance grants EXECUTE to anon/service_role'; end if;
  if not exists (
    select 1 from aclexplode(coalesce((select proacl from pg_catalog.pg_proc where oid = v_oid), acldefault('f', v_owner))) a
    where a.privilege_type = 'EXECUTE' and a.grantee = 'authenticated'::regrole::oid and not a.is_grantable
  ) then raise exception 'list_parent_student_attendance must grant non-grantable EXECUTE to authenticated'; end if;
  if exists (
    select 1 from aclexplode(coalesce((select proacl from pg_catalog.pg_proc where oid = v_oid), acldefault('f', v_owner))) a
    where a.privilege_type = 'EXECUTE' and a.grantee <> all (array[v_owner, 'authenticated'::regrole::oid]::oid[])
  ) then raise exception 'list_parent_student_attendance has an unexpected direct EXECUTE grantee'; end if;

  if position('se.student_id=p_student_id' in v_normalized_source) = 0
     or position('sg.student_id=p_student_id' in v_normalized_source) = 0
     or position('sg.status=''active''' in v_normalized_source) = 0
     or position('g.status=''active''' in v_normalized_source) = 0
     or position('g.profile_id=auth.uid()' in v_normalized_source) = 0
     or position('sg.organization_id=star.organization_id' in v_normalized_source) = 0
     or position('s.statusin(''submitted'',''locked'',''corrected'')' in v_normalized_source) = 0
     or position('public.has_permission(''attendance.read'',star.organization_id,star.school_id,s.classroom_id,null,p_student_id)' in v_normalized_source) = 0 then
    raise exception 'B7 attendance reader is missing a canonical subject, lifecycle, or RBAC predicate';
  end if;
  if position('ortrue' in v_normalized_source) <> 0
     or position('role_name' in v_normalized_source) <> 0
     or position('r.code=''parent''' in v_normalized_source) <> 0
     or position('email' in v_normalized_source) <> 0
     or position('organization_memberships' in v_normalized_source) <> 0 then
    raise exception 'B7 attendance reader contains an unsafe authorization fallback';
  end if;

  foreach v_actual_using in array array[
    'student.read', 'guardian.read', 'enrollment.read', 'schedule.read',
    'attendance.read', 'assessment.read', 'score.read'
  ] loop
    if not exists (
      select 1 from public.role_permissions rp
      join public.roles ro on ro.id = rp.role_id
      join public.permissions pe on pe.id = rp.permission_id
      where ro.organization_id is null and ro.code = 'PARENT' and pe.code = v_actual_using
    ) then
      raise exception 'PARENT role missing required B7 permission: %', v_actual_using;
    end if;
  end loop;
end $$;

select 'B7 parent portal validation passed' as result;
