-- EduSmart SchoolOS — Foundation Validation Queries
-- Safe to run repeatedly.

-- 1. Core tables expected
select count(*) as core_public_table_count
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
  and table_name in (
    'organizations','schools','school_settings','profiles','organization_memberships',
    'membership_school_access','roles','permissions','role_permissions','membership_roles','invitations',
    'academic_years','terms','grade_levels','classrooms','subjects','curricula','learning_outcomes','learning_objectives',
    'students','guardians','student_guardians','staff_members','staff_school_assignments','student_enrollments','class_enrollments',
    'teaching_assignments','timetable_entries','academic_calendar_events','attendance_sessions','student_attendance_records',
    'staff_attendance_records','assessment_types','assessments','assessment_learning_objectives','student_scores',
    'file_assets','report_cards','report_card_subject_entries','report_card_narratives','generated_documents','audit_logs'
  );

-- Expected: 42

-- 2. RLS coverage for Core V1 tables
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'organizations','schools','school_settings','profiles','organization_memberships',
    'membership_school_access','roles','permissions','role_permissions','membership_roles','invitations',
    'academic_years','terms','grade_levels','classrooms','subjects','curricula','learning_outcomes','learning_objectives',
    'students','guardians','student_guardians','staff_members','staff_school_assignments','student_enrollments','class_enrollments',
    'teaching_assignments','timetable_entries','academic_calendar_events','attendance_sessions','student_attendance_records',
    'staff_attendance_records','assessment_types','assessments','assessment_learning_objectives','student_scores',
    'file_assets','report_cards','report_card_subject_entries','report_card_narratives','generated_documents','audit_logs'
  )
order by c.relname;

-- Expected: every row rls_enabled = true

-- 3. Permission registry
select count(*) as permission_count from public.permissions;
-- Expected: > 60

-- 4. System roles
select code, name, is_system_role
from public.roles
where organization_id is null
order by code;
-- Expected: 8 roles

-- 5. Role permission counts
select r.code, count(*) as permission_count
from public.roles r
left join public.role_permissions rp on rp.role_id = r.id
where r.organization_id is null
group by r.code
order by r.code;

-- 6. Demo tenant
select o.code as organization_code, o.name as organization_name,
       s.code as school_code, s.name as school_name
from public.organizations o
join public.schools s on s.organization_id = o.id
where o.code = 'EDUSMART_DEMO';

-- 7. Demo academic structure
select
  (select count(*) from public.grade_levels where school_id = (select id from public.schools where code='SD_DEMO' limit 1)) as grade_levels,
  (select count(*) from public.classrooms where school_id = (select id from public.schools where code='SD_DEMO' limit 1)) as classrooms,
  (select count(*) from public.subjects where school_id = (select id from public.schools where code='SD_DEMO' limit 1)) as subjects;
-- Expected: 6 / 6 / 8

-- 8. Demo SIS counts
select
  (select count(*) from public.students where organization_id = (select id from public.organizations where code='EDUSMART_DEMO')) as students,
  (select count(*) from public.guardians where organization_id = (select id from public.organizations where code='EDUSMART_DEMO')) as guardians,
  (select count(*) from public.staff_members where organization_id = (select id from public.organizations where code='EDUSMART_DEMO')) as staff,
  (select count(*) from public.student_enrollments where school_id = (select id from public.schools where code='SD_DEMO' limit 1)) as enrollments;
-- Expected: 36 / 36 / 10 / 36

-- 9. Demo operations counts
select
  (select count(*) from public.teaching_assignments where school_id = (select id from public.schools where code='SD_DEMO' limit 1)) as teaching_assignments,
  (select count(*) from public.timetable_entries where school_id = (select id from public.schools where code='SD_DEMO' limit 1)) as timetable_entries,
  (select count(*) from public.attendance_sessions where school_id = (select id from public.schools where code='SD_DEMO' limit 1)) as attendance_sessions,
  (select count(*) from public.student_attendance_records where school_id = (select id from public.schools where code='SD_DEMO' limit 1)) as attendance_records,
  (select count(*) from public.assessments where school_id = (select id from public.schools where code='SD_DEMO' limit 1)) as assessments,
  (select count(*) from public.student_scores where school_id = (select id from public.schools where code='SD_DEMO' limit 1)) as scores,
  (select count(*) from public.report_cards where school_id = (select id from public.schools where code='SD_DEMO' limit 1)) as report_cards;
-- Expected: 30 / 30 / 6 / 36 / 6 / 36 / 36

-- 10. First admin bootstrap status (returns zero rows until 11_BOOTSTRAP_FIRST_ADMIN.sql is run)
select
  u.email,
  p.full_name,
  o.code as organization_code,
  m.status as membership_status,
  r.code as role_code,
  mr.scope_type,
  mr.scope_id
from auth.users u
join public.profiles p on p.id = u.id
join public.organization_memberships m on m.profile_id = p.id
join public.organizations o on o.id = m.organization_id
left join public.membership_roles mr on mr.membership_id = m.id
left join public.roles r on r.id = mr.role_id
where o.code = 'EDUSMART_DEMO'
order by u.email, r.code;

-- 11. Cross-tenant structural sanity: should return zero rows
select 'school_org_mismatch' as issue, count(*) as count
from public.schools s
left join public.organizations o on o.id = s.organization_id
where o.id is null
union all
select 'enrollment_school_org_mismatch', count(*)
from public.student_enrollments se
join public.schools s on s.id = se.school_id
where s.organization_id <> se.organization_id
union all
select 'class_enrollment_school_mismatch', count(*)
from public.class_enrollments ce
join public.classrooms c on c.id = ce.classroom_id
where c.school_id <> ce.school_id or c.organization_id <> ce.organization_id;
