-- EduSmart SchoolOS — Core V1 Permission Registry & Default Roles
-- Version: 1.2 HOTFIX
--
-- IMPORTANT:
-- This version intentionally DOES NOT use a temporary/private staging table.
-- It is designed to be reliable when pasted and run as one full query in
-- Supabase Dashboard SQL Editor.
--
-- Requires:
--   07_DATABASE_SCHEMA.sql PASS
--   08_RLS_POLICIES.sql PASS
--
-- Safe to re-run: yes. It rebuilds only the permission links of the 8
-- built-in system roles. Custom organization roles are not touched.

begin;

-- 1. Permission registry
insert into public.permissions (code, domain, action, description) values
('organization.read','organization','read','Read organization metadata'),
('organization.update','organization','update','Update organization metadata'),
('school.read','organization','read','Read school metadata'),
('school.update','organization','update','Update school metadata'),
('membership.read','identity','read','Read memberships in authorized scope'),
('membership.invite','identity','invite','Invite a user/member'),
('membership.update_role','identity','update_role','Change member role or scope'),
('membership.disable','identity','disable','Suspend or end membership'),
('role.read','identity','read','Read role definitions'),
('role.manage_custom','identity','manage','Manage custom organization roles'),
('academic_year.read','academic','read','Read academic years'),
('academic_year.manage','academic','manage','Create or update academic years'),
('term.read','academic','read','Read terms/semesters'),
('term.manage','academic','manage','Create or update terms/semesters'),
('grade_level.read','academic','read','Read grade levels'),
('grade_level.manage','academic','manage','Create or update grade levels'),
('classroom.read','academic','read','Read classrooms'),
('classroom.manage','academic','manage','Create or update classrooms'),
('subject.read','academic','read','Read subjects'),
('subject.manage','academic','manage','Create or update subjects'),
('curriculum.read','academic','read','Read curriculum structures'),
('curriculum.manage','academic','manage','Create or update curriculum structures'),
('student.read','sis','read','Read student records'),
('student.create','sis','create','Create student records'),
('student.update','sis','update','Update student records'),
('student.archive','sis','archive','Archive student records'),
('student.import','sis','import','Import students'),
('student.export','sis','export','Export students'),
('guardian.read','sis','read','Read guardian records'),
('guardian.manage','sis','manage','Create/update guardian relationships'),
('staff.read','sis','read','Read staff records'),
('staff.create','sis','create','Create staff records/assignments'),
('staff.update','sis','update','Update staff records/assignments'),
('enrollment.read','sis','read','Read student enrollment records'),
('enrollment.manage','sis','manage','Create/update student enrollment lifecycle'),
('class_enrollment.manage','sis','manage','Manage classroom placements'),
('teaching_assignment.read','teaching','read','Read teaching assignments'),
('teaching_assignment.create','teaching','create','Create teaching assignments'),
('teaching_assignment.update','teaching','update','Update teaching assignments'),
('teaching_assignment.archive','teaching','archive','Archive teaching assignments'),
('schedule.read','schedule','read','Read schedule'),
('schedule.create','schedule','create','Create schedule entries'),
('schedule.update','schedule','update','Update schedule entries'),
('schedule.publish','schedule','publish','Publish schedule'),
('schedule.archive','schedule','archive','Archive schedule'),
('attendance.read','attendance','read','Read attendance'),
('attendance.session.create','attendance','create','Create attendance session'),
('attendance.record','attendance','record','Record attendance'),
('attendance.submit','attendance','submit','Submit attendance session'),
('attendance.correct_open','attendance','update','Correct open/unlocked attendance'),
('attendance.correct_locked','attendance','update_locked','Correct locked attendance'),
('attendance.lock','attendance','lock','Lock attendance session'),
('attendance.export','attendance','export','Export attendance'),
('assessment.read','assessment','read','Read assessments'),
('assessment.create','assessment','create','Create assessments'),
('assessment.update_own','assessment','update','Update owned or elevated assessment'),
('assessment.archive_own','assessment','archive','Archive owned assessment'),
('assessment.publish','assessment','publish','Publish assessment'),
('score.read','assessment','read','Read scores'),
('score.enter','assessment','create','Enter scores'),
('score.update_open','assessment','update','Update scores while open'),
('score.update_locked','assessment','update_locked','Update locked/final score'),
('score.export','assessment','export','Export scores'),
('report_card.read','reporting','read','Read report card'),
('report_card.generate','reporting','generate','Generate report card draft/snapshot'),
('report_card.edit_narrative','reporting','update','Edit report card narrative'),
('report_card.submit','reporting','submit','Submit report card'),
('report_card.review','reporting','review','Review report card'),
('report_card.publish','reporting','publish','Publish report card'),
('report_card.revise_published','reporting','revise','Revise published report card'),
('report_card.download','reporting','download','Download published report document'),
('audit.read','security','read','Read authorized audit logs'),
('audit.export','security','export','Export authorized audit logs'),
('security.session_revoke_member','security','revoke','Revoke member session/access')
on conflict (code) do update
set domain = excluded.domain,
    action = excluded.action,
    description = excluded.description;

-- 2. Built-in system roles
insert into public.roles (organization_id, code, name, description, is_system_role, is_customizable) values
(null,'ORG_OWNER','Organization Owner','Yayasan/organization owner with organization-wide authority',true,false),
(null,'SCHOOL_ADMIN','School Admin / Tata Usaha','School-scoped operational master-data administrator',true,false),
(null,'PRINCIPAL','Principal / Kepala Sekolah','School-scoped leadership and approval role',true,false),
(null,'VICE_PRINCIPAL_CURRICULUM','Wakasek Kurikulum','School-scoped academic setup, assignment and scheduling role',true,false),
(null,'TEACHER','Teacher / Guru','Class-scoped teacher role; assign one CLASS grant per authorized classroom',true,false),
(null,'HOMEROOM_TEACHER','Homeroom Teacher / Wali Kelas','Class-scoped homeroom role; combine with TEACHER where also teaching subjects',true,false),
(null,'PARENT','Parent / Guardian','Relationship-scoped parent portal role',true,false),
(null,'STUDENT','Student / Siswa','Own-record student portal role',true,false)
on conflict (code) where organization_id is null do update
set name = excluded.name,
    description = excluded.description,
    is_system_role = excluded.is_system_role,
    is_customizable = excluded.is_customizable;

-- 3. Rebuild permission links for built-in roles only.
--    This avoids any dependency on temporary/staging relations.
delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and r.organization_id is null
  and r.code in (
    'ORG_OWNER',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'VICE_PRINCIPAL_CURRICULUM',
    'TEACHER',
    'HOMEROOM_TEACHER',
    'PARENT',
    'STUDENT'
  );

-- Organization Owner receives every Core V1 permission.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.organization_id is null
  and r.code = 'ORG_OWNER'
on conflict (role_id, permission_id) do nothing;

-- Remaining built-in roles use the conservative matrix below.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from (
  values
  ('SCHOOL_ADMIN','organization.read'),
  ('SCHOOL_ADMIN','school.read'),
  ('SCHOOL_ADMIN','membership.read'),
  ('SCHOOL_ADMIN','membership.invite'),
  ('SCHOOL_ADMIN','role.read'),
  ('SCHOOL_ADMIN','academic_year.read'),
  ('SCHOOL_ADMIN','academic_year.manage'),
  ('SCHOOL_ADMIN','term.read'),
  ('SCHOOL_ADMIN','term.manage'),
  ('SCHOOL_ADMIN','grade_level.read'),
  ('SCHOOL_ADMIN','grade_level.manage'),
  ('SCHOOL_ADMIN','classroom.read'),
  ('SCHOOL_ADMIN','classroom.manage'),
  ('SCHOOL_ADMIN','subject.read'),
  ('SCHOOL_ADMIN','subject.manage'),
  ('SCHOOL_ADMIN','curriculum.read'),
  ('SCHOOL_ADMIN','student.read'),
  ('SCHOOL_ADMIN','student.create'),
  ('SCHOOL_ADMIN','student.update'),
  ('SCHOOL_ADMIN','student.import'),
  ('SCHOOL_ADMIN','student.export'),
  ('SCHOOL_ADMIN','guardian.read'),
  ('SCHOOL_ADMIN','guardian.manage'),
  ('SCHOOL_ADMIN','staff.read'),
  ('SCHOOL_ADMIN','staff.create'),
  ('SCHOOL_ADMIN','staff.update'),
  ('SCHOOL_ADMIN','enrollment.read'),
  ('SCHOOL_ADMIN','enrollment.manage'),
  ('SCHOOL_ADMIN','class_enrollment.manage'),
  ('SCHOOL_ADMIN','teaching_assignment.read'),
  ('SCHOOL_ADMIN','teaching_assignment.create'),
  ('SCHOOL_ADMIN','teaching_assignment.update'),
  ('SCHOOL_ADMIN','schedule.read'),
  ('SCHOOL_ADMIN','schedule.create'),
  ('SCHOOL_ADMIN','schedule.update'),
  ('SCHOOL_ADMIN','attendance.read'),
  ('SCHOOL_ADMIN','attendance.session.create'),
  ('SCHOOL_ADMIN','attendance.record'),
  ('SCHOOL_ADMIN','attendance.submit'),
  ('SCHOOL_ADMIN','attendance.correct_open'),
  ('SCHOOL_ADMIN','attendance.lock'),
  ('SCHOOL_ADMIN','attendance.export'),
  ('SCHOOL_ADMIN','assessment.read'),
  ('SCHOOL_ADMIN','score.read'),
  ('SCHOOL_ADMIN','score.export'),
  ('SCHOOL_ADMIN','report_card.read'),
  ('SCHOOL_ADMIN','report_card.generate'),
  ('SCHOOL_ADMIN','report_card.download'),
  ('PRINCIPAL','organization.read'),
  ('PRINCIPAL','school.read'),
  ('PRINCIPAL','membership.read'),
  ('PRINCIPAL','role.read'),
  ('PRINCIPAL','academic_year.read'),
  ('PRINCIPAL','term.read'),
  ('PRINCIPAL','grade_level.read'),
  ('PRINCIPAL','classroom.read'),
  ('PRINCIPAL','subject.read'),
  ('PRINCIPAL','curriculum.read'),
  ('PRINCIPAL','student.read'),
  ('PRINCIPAL','student.export'),
  ('PRINCIPAL','guardian.read'),
  ('PRINCIPAL','staff.read'),
  ('PRINCIPAL','enrollment.read'),
  ('PRINCIPAL','teaching_assignment.read'),
  ('PRINCIPAL','schedule.read'),
  ('PRINCIPAL','attendance.read'),
  ('PRINCIPAL','attendance.session.create'),
  ('PRINCIPAL','attendance.record'),
  ('PRINCIPAL','attendance.submit'),
  ('PRINCIPAL','attendance.correct_open'),
  ('PRINCIPAL','attendance.correct_locked'),
  ('PRINCIPAL','attendance.lock'),
  ('PRINCIPAL','attendance.export'),
  ('PRINCIPAL','assessment.read'),
  ('PRINCIPAL','score.read'),
  ('PRINCIPAL','score.export'),
  ('PRINCIPAL','report_card.read'),
  ('PRINCIPAL','report_card.generate'),
  ('PRINCIPAL','report_card.edit_narrative'),
  ('PRINCIPAL','report_card.submit'),
  ('PRINCIPAL','report_card.review'),
  ('PRINCIPAL','report_card.publish'),
  ('PRINCIPAL','report_card.download'),
  ('PRINCIPAL','audit.read'),
  ('VICE_PRINCIPAL_CURRICULUM','organization.read'),
  ('VICE_PRINCIPAL_CURRICULUM','school.read'),
  ('VICE_PRINCIPAL_CURRICULUM','academic_year.read'),
  ('VICE_PRINCIPAL_CURRICULUM','academic_year.manage'),
  ('VICE_PRINCIPAL_CURRICULUM','term.read'),
  ('VICE_PRINCIPAL_CURRICULUM','term.manage'),
  ('VICE_PRINCIPAL_CURRICULUM','grade_level.read'),
  ('VICE_PRINCIPAL_CURRICULUM','grade_level.manage'),
  ('VICE_PRINCIPAL_CURRICULUM','classroom.read'),
  ('VICE_PRINCIPAL_CURRICULUM','classroom.manage'),
  ('VICE_PRINCIPAL_CURRICULUM','subject.read'),
  ('VICE_PRINCIPAL_CURRICULUM','subject.manage'),
  ('VICE_PRINCIPAL_CURRICULUM','curriculum.read'),
  ('VICE_PRINCIPAL_CURRICULUM','curriculum.manage'),
  ('VICE_PRINCIPAL_CURRICULUM','student.read'),
  ('VICE_PRINCIPAL_CURRICULUM','student.export'),
  ('VICE_PRINCIPAL_CURRICULUM','staff.read'),
  ('VICE_PRINCIPAL_CURRICULUM','enrollment.read'),
  ('VICE_PRINCIPAL_CURRICULUM','class_enrollment.manage'),
  ('VICE_PRINCIPAL_CURRICULUM','teaching_assignment.read'),
  ('VICE_PRINCIPAL_CURRICULUM','teaching_assignment.create'),
  ('VICE_PRINCIPAL_CURRICULUM','teaching_assignment.update'),
  ('VICE_PRINCIPAL_CURRICULUM','teaching_assignment.archive'),
  ('VICE_PRINCIPAL_CURRICULUM','schedule.read'),
  ('VICE_PRINCIPAL_CURRICULUM','schedule.create'),
  ('VICE_PRINCIPAL_CURRICULUM','schedule.update'),
  ('VICE_PRINCIPAL_CURRICULUM','schedule.publish'),
  ('VICE_PRINCIPAL_CURRICULUM','schedule.archive'),
  ('VICE_PRINCIPAL_CURRICULUM','attendance.read'),
  ('VICE_PRINCIPAL_CURRICULUM','attendance.session.create'),
  ('VICE_PRINCIPAL_CURRICULUM','attendance.record'),
  ('VICE_PRINCIPAL_CURRICULUM','attendance.submit'),
  ('VICE_PRINCIPAL_CURRICULUM','attendance.correct_open'),
  ('VICE_PRINCIPAL_CURRICULUM','attendance.export'),
  ('VICE_PRINCIPAL_CURRICULUM','assessment.read'),
  ('VICE_PRINCIPAL_CURRICULUM','assessment.create'),
  ('VICE_PRINCIPAL_CURRICULUM','assessment.update_own'),
  ('VICE_PRINCIPAL_CURRICULUM','assessment.publish'),
  ('VICE_PRINCIPAL_CURRICULUM','score.read'),
  ('VICE_PRINCIPAL_CURRICULUM','score.export'),
  ('VICE_PRINCIPAL_CURRICULUM','report_card.read'),
  ('VICE_PRINCIPAL_CURRICULUM','report_card.generate'),
  ('VICE_PRINCIPAL_CURRICULUM','report_card.edit_narrative'),
  ('VICE_PRINCIPAL_CURRICULUM','report_card.submit'),
  ('VICE_PRINCIPAL_CURRICULUM','report_card.review'),
  ('VICE_PRINCIPAL_CURRICULUM','report_card.download'),
  ('TEACHER','organization.read'),
  ('TEACHER','school.read'),
  ('TEACHER','academic_year.read'),
  ('TEACHER','term.read'),
  ('TEACHER','grade_level.read'),
  ('TEACHER','classroom.read'),
  ('TEACHER','subject.read'),
  ('TEACHER','curriculum.read'),
  ('TEACHER','student.read'),
  ('TEACHER','staff.read'),
  ('TEACHER','enrollment.read'),
  ('TEACHER','teaching_assignment.read'),
  ('TEACHER','schedule.read'),
  ('TEACHER','attendance.read'),
  ('TEACHER','attendance.session.create'),
  ('TEACHER','attendance.record'),
  ('TEACHER','attendance.submit'),
  ('TEACHER','attendance.correct_open'),
  ('TEACHER','assessment.read'),
  ('TEACHER','assessment.create'),
  ('TEACHER','assessment.update_own'),
  ('TEACHER','assessment.archive_own'),
  ('TEACHER','assessment.publish'),
  ('TEACHER','score.read'),
  ('TEACHER','score.enter'),
  ('TEACHER','score.update_open'),
  ('TEACHER','score.export'),
  ('TEACHER','report_card.read'),
  ('TEACHER','report_card.download'),
  ('HOMEROOM_TEACHER','organization.read'),
  ('HOMEROOM_TEACHER','school.read'),
  ('HOMEROOM_TEACHER','academic_year.read'),
  ('HOMEROOM_TEACHER','term.read'),
  ('HOMEROOM_TEACHER','grade_level.read'),
  ('HOMEROOM_TEACHER','classroom.read'),
  ('HOMEROOM_TEACHER','subject.read'),
  ('HOMEROOM_TEACHER','curriculum.read'),
  ('HOMEROOM_TEACHER','student.read'),
  ('HOMEROOM_TEACHER','student.export'),
  ('HOMEROOM_TEACHER','guardian.read'),
  ('HOMEROOM_TEACHER','staff.read'),
  ('HOMEROOM_TEACHER','enrollment.read'),
  ('HOMEROOM_TEACHER','teaching_assignment.read'),
  ('HOMEROOM_TEACHER','schedule.read'),
  ('HOMEROOM_TEACHER','attendance.read'),
  ('HOMEROOM_TEACHER','attendance.session.create'),
  ('HOMEROOM_TEACHER','attendance.record'),
  ('HOMEROOM_TEACHER','attendance.submit'),
  ('HOMEROOM_TEACHER','attendance.correct_open'),
  ('HOMEROOM_TEACHER','attendance.export'),
  ('HOMEROOM_TEACHER','assessment.read'),
  ('HOMEROOM_TEACHER','score.read'),
  ('HOMEROOM_TEACHER','score.export'),
  ('HOMEROOM_TEACHER','report_card.read'),
  ('HOMEROOM_TEACHER','report_card.generate'),
  ('HOMEROOM_TEACHER','report_card.edit_narrative'),
  ('HOMEROOM_TEACHER','report_card.submit'),
  ('HOMEROOM_TEACHER','report_card.download'),
  ('PARENT','school.read'),
  ('PARENT','academic_year.read'),
  ('PARENT','term.read'),
  ('PARENT','grade_level.read'),
  ('PARENT','classroom.read'),
  ('PARENT','subject.read'),
  ('PARENT','student.read'),
  ('PARENT','guardian.read'),
  ('PARENT','enrollment.read'),
  ('PARENT','teaching_assignment.read'),
  ('PARENT','schedule.read'),
  ('PARENT','attendance.read'),
  ('PARENT','assessment.read'),
  ('PARENT','score.read'),
  ('PARENT','report_card.read'),
  ('PARENT','report_card.download'),
  ('STUDENT','school.read'),
  ('STUDENT','academic_year.read'),
  ('STUDENT','term.read'),
  ('STUDENT','grade_level.read'),
  ('STUDENT','classroom.read'),
  ('STUDENT','subject.read'),
  ('STUDENT','curriculum.read'),
  ('STUDENT','student.read'),
  ('STUDENT','enrollment.read'),
  ('STUDENT','teaching_assignment.read'),
  ('STUDENT','schedule.read'),
  ('STUDENT','attendance.read'),
  ('STUDENT','assessment.read'),
  ('STUDENT','score.read'),
  ('STUDENT','report_card.read'),
  ('STUDENT','report_card.download')
) as seed(role_code, permission_code)
join public.roles r
  on r.code = seed.role_code
 and r.organization_id is null
join public.permissions p
  on p.code = seed.permission_code
on conflict (role_id, permission_id) do nothing;

commit;

-- Verification output.
select count(*) as permissions
from public.permissions;

select count(*) as system_roles
from public.roles
where organization_id is null
  and code in (
    'ORG_OWNER',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'VICE_PRINCIPAL_CURRICULUM',
    'TEACHER',
    'HOMEROOM_TEACHER',
    'PARENT',
    'STUDENT'
  );

select count(*) as system_role_permission_links
from public.role_permissions rp
join public.roles r on r.id = rp.role_id
where r.organization_id is null
  and r.code in (
    'ORG_OWNER',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'VICE_PRINCIPAL_CURRICULUM',
    'TEACHER',
    'HOMEROOM_TEACHER',
    'PARENT',
    'STUDENT'
  );