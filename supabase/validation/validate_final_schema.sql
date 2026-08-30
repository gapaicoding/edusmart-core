\set ON_ERROR_STOP on

-- EduSmart Phase 2B: data-neutral validation of a fresh canonical B4 bootstrap.
do $validation$
declare
  expected_tables text[] := array[
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
  actual_tables text[];
  missing text;
  n bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto')
     or not exists (select 1 from pg_extension where extname = 'btree_gist') then
    raise exception 'Required extensions pgcrypto and/or btree_gist are missing';
  end if;

  select array_agg(c.relname order by c.relname) into actual_tables
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p');
  if actual_tables is distinct from expected_tables then
    raise exception 'Public table inventory mismatch. Expected %, got %', expected_tables, actual_tables;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='timetable_entries'
      and column_name='timetable_period_id' and data_type='uuid' and is_nullable='NO'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='timetable_entries'
      and column_name='row_version' and data_type='bigint' and is_nullable='NO'
  ) then raise exception 'Final timetable_entries columns are invalid'; end if;

  select string_agg(x.table_name, ', ' order by x.table_name) into missing
  from unnest(expected_tables) x(table_name)
  left join pg_class c on c.relname=x.table_name
  left join pg_namespace ns on ns.oid=c.relnamespace and ns.nspname='public'
  where ns.oid is null or not c.relrowsecurity;
  if missing is not null then raise exception 'RLS missing: %', missing; end if;

  select count(*) into n from public.permissions;
  if n <> 74 then raise exception 'Expected 74 permissions, got %', n; end if;
  select count(*) into n from public.roles where organization_id is null and is_system_role;
  if n <> 8 then raise exception 'Expected 8 system roles, got %', n; end if;
  select count(*) into n from public.role_permissions rp
    join public.roles r on r.id=rp.role_id
    where r.organization_id is null and r.is_system_role;
  if n <> 294 then raise exception 'Expected 294 built-in role-permission links, got %', n; end if;

  if (select count(*) from public.organizations) <> 0
     or (select count(*) from public.schools) <> 0
     or (select count(*) from public.students) <> 0
     or (select count(*) from public.staff_members) <> 0 then
    raise exception 'Tenant/domain seed data must be empty';
  end if;
end
$validation$;

do $objects$
declare
  required_functions text[] := array[
    'public.has_permission(text,uuid,uuid,uuid,uuid,uuid)',
    'public.handle_new_auth_user()',
    'public.validate_calendar_within_year()',
    'public.validate_academic_year_calendar_bounds()',
    'public.validate_class_enrollment_consistency()',
    'public.validate_enrollment_placement_integrity()',
    'public.replace_teaching_assignment(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,date,date)',
    'public.guard_timetable_period_history()',
    'public.validate_timetable_parent_integrity()',
    'public.validate_timetable_conflicts()',
    'public.validate_teaching_assignment_timetable_conflicts()',
    'public.validate_staff_assignment_timetable_conflicts()',
    'public.set_timetable_entry_row_version()',
    'public.validate_timetable_history_lifecycle()',
    'public.replace_timetable_entry(uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'
  ];
  required_triggers text[] := array[
    'auth.users:on_auth_user_created',
    'public.academic_calendar_events:trg_calendar_validate_year',
    'public.academic_years:trg_academic_year_validate_calendar_bounds',
    'public.student_enrollments:trg_student_enrollments_validate_placement',
    'public.classrooms:trg_classrooms_validate_placement',
    'public.timetable_periods:trg_timetable_periods_history_guard',
    'public.academic_years:trg_academic_years_validate_timetable_integrity',
    'public.terms:trg_terms_validate_timetable_integrity',
    'public.teaching_assignments:trg_teaching_assignments_validate_timetable_integrity',
    'public.timetable_entries:trg_timetable_entries_validate_schedule_conflicts',
    'public.teaching_assignments:trg_teaching_assignments_validate_timetable_conflicts',
    'public.staff_school_assignments:trg_staff_school_assignments_validate_timetable_conflicts',
    'public.timetable_entries:trg_timetable_entries_row_version',
    'public.timetable_entries:trg_timetable_entries_history_lifecycle'
  ];
  required_constraints text[] := array[
    'public.timetable_periods:timetable_periods_active_time_no_overlap',
    'public.timetable_entries:timetable_entries_period_fk',
    'public.timetable_entries:timetable_entries_assignment_fk',
    'public.timetable_entries:timetable_entries_row_version_check'
  ];
  item text;
begin
  foreach item in array required_functions loop
    if to_regprocedure(item) is null then raise exception 'Required function/RPC missing: %', item; end if;
  end loop;

  if not (select p.prosecdef from pg_proc p where p.oid='public.has_permission(text,uuid,uuid,uuid,uuid,uuid)'::regprocedure) then
    raise exception 'has_permission must be SECURITY DEFINER';
  end if;
  if (select p.prosecdef from pg_proc p where p.oid='public.replace_teaching_assignment(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,date,date)'::regprocedure) then
    raise exception 'replace_teaching_assignment must be SECURITY INVOKER';
  end if;
  if (select p.prosecdef from pg_proc p where p.oid='public.replace_timetable_entry(uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'::regprocedure) then
    raise exception 'replace_timetable_entry must be SECURITY INVOKER';
  end if;

  foreach item in array required_triggers loop
    if not exists (
      select 1 from pg_trigger t
      where t.tgrelid=split_part(item,':',1)::regclass
        and t.tgname=split_part(item,':',2) and not t.tgisinternal and t.tgenabled <> 'D'
    ) then raise exception 'Required trigger missing/disabled: %', item; end if;
  end loop;
  foreach item in array required_constraints loop
    if not exists (
      select 1 from pg_constraint c
      where c.conrelid=split_part(item,':',1)::regclass
        and c.conname=split_part(item,':',2) and c.convalidated
    ) then raise exception 'Required constraint missing/unvalidated: %', item; end if;
  end loop;
end
$objects$;

do $history$
declare
  expected text[] := array[
    '20260815000000','20260816033554','20260816041800','20260818155412',
    '20260820163930','20260821064307','20260821100739','20260821102452',
    '20260821132235','20260821133442','20260821190000','20260821193000',
    '20260821210000','20260821230000','20260822014606','20260822042901',
    '20260822101519','20260830110000','20260830120000'
  ];
  actual text[];
begin
  select array_agg(version order by version) into actual
  from supabase_migrations.schema_migrations;
  if actual is distinct from expected then
    raise exception 'Migration history mismatch. Expected %, got %', expected, actual;
  end if;
  if exists (select version from supabase_migrations.schema_migrations group by version having count(*) <> 1) then
    raise exception 'Migration history contains duplicate versions';
  end if;
end
$history$;

select
  (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as public_table_count,
  (select count(*) from public.permissions) as permission_count,
  (select count(*) from public.roles where organization_id is null and is_system_role) as system_role_count,
  (select count(*) from public.role_permissions rp join public.roles r on r.id=rp.role_id where r.organization_id is null and r.is_system_role) as built_in_mapping_count,
  (select count(*) from public.organizations) as organization_count,
  (select count(*) from public.schools) as school_count,
  (select count(*) from public.students) as student_count,
  (select count(*) from public.staff_members) as staff_member_count;

do $f05$
begin
  if coalesce(obj_description('public.validate_timetable_consistency()'::regprocedure, 'pg_proc'), '')
       not like 'B4-F05 final policy:%active Assignment%'
     or coalesce(obj_description('public.validate_timetable_history_lifecycle()'::regprocedure, 'pg_proc'), '')
       not like 'B4-F05 final policy:%published history%'
     or coalesce(obj_description(
       'public.replace_timetable_entry(uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'::regprocedure,
       'pg_proc'
     ), '') not like 'B4-F05 final policy:%never silently reassigns history%'
  then
    raise exception 'B4-F05 final inactive-Assignment history policy is missing';
  end if;

  if not exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename='timetable_entries'
      and p.policyname='timetable_entries_select'
      and p.roles @> array['authenticated']::name[]
      and p.qual like '%has_staff_scope_permission%'
      and p.qual like '%published%'
      and p.qual like '%can_access_teaching_assignment%'
  ) then
    raise exception 'B4-F05 draft/published timetable visibility policy is invalid';
  end if;

  if has_table_privilege('anon', 'public.timetable_entries', 'INSERT')
     or has_table_privilege('anon', 'public.timetable_entries', 'UPDATE')
     or has_table_privilege('anon', 'public.timetable_entries', 'DELETE')
  then
    raise exception 'Anonymous timetable writes must remain unavailable';
  end if;
end
$f05$;

select 'FINAL B4 SCHEMA VALIDATION PASSED' as result;
