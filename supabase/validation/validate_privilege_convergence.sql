\set ON_ERROR_STOP on

-- Data-neutral validation for the forward privilege-convergence migration.
do $privileges$
declare
  app_tables text[] := array[
    'academic_calendar_events','academic_years','assessment_learning_objectives',
    'assessment_types','assessments','attendance_sessions','audit_logs',
    'class_enrollments','classrooms','curricula','file_assets','generated_documents',
    'grade_levels','guardians','invitations','learning_objectives','learning_outcomes',
    'membership_roles','membership_school_access','organization_memberships','organizations',
    'permissions','profiles','report_card_narratives','report_card_subject_entries',
    'report_cards','role_permissions','roles','school_settings','schools',
    'staff_attendance_records','staff_members','staff_school_assignments',
    'student_attendance_records','student_enrollments','student_guardians','student_scores',
    'students','subjects','teaching_assignments','terms','timetable_entries','timetable_periods'
  ];
  allowed_authenticated_functions regprocedure[] := array[
    'public.has_active_membership(uuid)'::regprocedure,
    'public.has_any_active_membership()'::regprocedure,
    'public.is_own_membership(uuid)'::regprocedure,
    'public.has_permission_in_org(text,uuid)'::regprocedure,
    'public.has_permission(text,uuid,uuid,uuid,uuid,uuid)'::regprocedure,
    'public.has_staff_scope_permission(text,uuid,uuid,uuid)'::regprocedure,
    'public.can_read_membership(uuid,uuid)'::regprocedure,
    'public.can_read_role(uuid)'::regprocedure,
    'public.can_read_membership_role(uuid,uuid,text,uuid)'::regprocedure,
    'public.can_access_student(text,uuid,uuid)'::regprocedure,
    'public.can_access_guardian(text,uuid,uuid)'::regprocedure,
    'public.can_access_staff(text,uuid,uuid)'::regprocedure,
    'public.can_access_enrollment(text,uuid)'::regprocedure,
    'public.can_access_teaching_assignment(text,uuid)'::regprocedure,
    'public.owns_teaching_assignment(uuid)'::regprocedure,
    'public.can_access_assessment(text,uuid)'::regprocedure,
    'public.can_access_report_card(text,uuid)'::regprocedure,
    'public.replace_teaching_assignment(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,date,date)'::regprocedure,
    'public.replace_timetable_entry(uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'::regprocedure
  ];
  item text;
  privilege_name text;
  fn regprocedure;
  n bigint;
begin
  foreach item in array app_tables loop
    if has_table_privilege('anon', format('public.%I', item), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') then
      raise exception 'anon retains a privilege on public.%', item;
    end if;
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
      if not has_table_privilege('service_role', format('public.%I', item), privilege_name) then
        raise exception 'service_role lacks % on public.%', privilege_name, item;
      end if;
    end loop;
    if not (select c.relrowsecurity from pg_class c where c.oid=format('public.%I', item)::regclass) then
      raise exception 'RLS is disabled on public.%', item;
    end if;
  end loop;

  if exists (
    select 1
    from pg_proc p join pg_namespace nsp on nsp.oid=p.pronamespace
    where nsp.nspname='public'
      and not exists (
        select 1 from pg_depend d where d.classid='pg_proc'::regclass
          and d.objid=p.oid and d.deptype='e'
      )
      and (has_function_privilege('anon', p.oid, 'EXECUTE') or exists (
        select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.grantee=0 and a.privilege_type='EXECUTE'
      ))
  ) then raise exception 'anon or PUBLIC can execute a public function'; end if;

  foreach fn in array allowed_authenticated_functions loop
    if not has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception 'authenticated lacks EXECUTE on %', fn;
    end if;
  end loop;

  if exists (
    select 1
    from pg_proc p join pg_namespace nsp on nsp.oid=p.pronamespace
    where nsp.nspname='public'
      and not exists (
        select 1 from pg_depend d where d.classid='pg_proc'::regclass
          and d.objid=p.oid and d.deptype='e'
      )
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and p.oid::regprocedure <> all (allowed_authenticated_functions)
  ) then raise exception 'authenticated can execute a non-allowlisted public function'; end if;

  if not has_table_privilege('authenticated', 'public.timetable_entries', 'SELECT,INSERT,UPDATE')
     or has_table_privilege('authenticated', 'public.timetable_entries', 'DELETE,TRUNCATE,TRIGGER')
     or has_table_privilege('authenticated', 'public.organization_memberships', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.permissions', 'INSERT,UPDATE,DELETE') then
    raise exception 'Authenticated table grants do not match the RLS-facing CRUD contract';
  end if;

  if exists (
    select 1
    from pg_default_acl d
    join pg_roles owner_role on owner_role.oid=d.defaclrole
    join pg_namespace nsp on nsp.oid=d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where owner_role.rolname='postgres' and nsp.nspname='public'
      and d.defaclobjtype in ('r','S','f')
      and a.grantee in ((select oid from pg_roles where rolname='anon'),
                        (select oid from pg_roles where rolname='authenticated'))
  ) then raise exception 'Future public objects grant privileges to anon/authenticated by default'; end if;

  if (select count(distinct d.defaclobjtype)
      from pg_default_acl d
      join pg_roles owner_role on owner_role.oid=d.defaclrole
      join pg_namespace nsp on nsp.oid=d.defaclnamespace
      cross join lateral aclexplode(d.defaclacl) a
      where owner_role.rolname='postgres' and nsp.nspname='public'
        and d.defaclobjtype in ('r','S','f')
        and a.grantee=(select oid from pg_roles where rolname='service_role')) <> 3 then
    raise exception 'service_role default privileges are incomplete';
  end if;

  if (select p.prosecdef from pg_proc p where p.oid='public.replace_teaching_assignment(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,date,date)'::regprocedure)
     or (select p.prosecdef from pg_proc p where p.oid='public.replace_timetable_entry(uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'::regprocedure) then
    raise exception 'Replacement RPCs must remain SECURITY INVOKER';
  end if;

  select count(*) into n from public.permissions;
  if n <> 74 then raise exception 'Expected 74 permissions, got %', n; end if;
  select count(*) into n from public.roles where organization_id is null and is_system_role;
  if n <> 8 then raise exception 'Expected 8 system roles, got %', n; end if;
  select count(*) into n from public.role_permissions rp join public.roles r on r.id=rp.role_id
    where r.organization_id is null and r.is_system_role;
  if n <> 294 then raise exception 'Expected 294 built-in mappings, got %', n; end if;

  if (select count(*) from public.organizations) <> 0
     or (select count(*) from public.schools) <> 0
     or (select count(*) from public.students) <> 0
     or (select count(*) from public.staff_members) <> 0 then
    raise exception 'Privilege convergence mutated or introduced tenant data';
  end if;
end
$privileges$;

select 'PRIVILEGE CONVERGENCE VALIDATION PASSED' as result;
