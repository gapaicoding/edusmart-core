-- EduSmart SchoolOS — Demo School Seed
-- Version: 1.0
-- Requires: 07_DATABASE_SCHEMA.sql + 08_RLS_POLICIES.sql + 09_SEED_RBAC.sql
-- Purpose: realistic domain data for UI development. This script intentionally does NOT create auth users.
-- Demo organization: Yayasan EduSmart Demo
-- Demo school: SD EduSmart Indonesia

begin;

create or replace function pg_temp.demo_uuid(p_key text)
returns uuid
language sql
immutable
as $$
  select (
    substr(md5(p_key),1,8) || '-' ||
    substr(md5(p_key),9,4) || '-' ||
    substr(md5(p_key),13,4) || '-' ||
    substr(md5(p_key),17,4) || '-' ||
    substr(md5(p_key),21,12)
  )::uuid;
$$;

-- -----------------------------------------------------------------------------
-- 1. Organization & school
-- -----------------------------------------------------------------------------

insert into public.organizations (id, code, name, legal_name, status, timezone, locale)
values (
  pg_temp.demo_uuid('org:edusmart-demo'),
  'EDUSMART_DEMO',
  'Yayasan EduSmart Demo',
  'Yayasan EduSmart Demo Indonesia',
  'active',
  'Asia/Jakarta',
  'id-ID'
)
on conflict (code) do update
set name = excluded.name,
    legal_name = excluded.legal_name,
    status = excluded.status;

insert into public.schools (id, organization_id, code, name, education_stage, npsn, timezone, status)
values (
  pg_temp.demo_uuid('school:sd-demo'),
  pg_temp.demo_uuid('org:edusmart-demo'),
  'SD_DEMO',
  'SD EduSmart Indonesia',
  'sd',
  null,
  'Asia/Jakarta',
  'active'
)
on conflict (organization_id, code) do update
set name = excluded.name,
    education_stage = excluded.education_stage,
    status = excluded.status;

insert into public.school_settings (
  id, organization_id, school_id, grading_settings, attendance_settings, report_branding
)
values (
  pg_temp.demo_uuid('school-settings:sd-demo'),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  '{"default_min_score":0,"default_max_score":100,"passing_score":75}'::jsonb,
  '{"statuses":["present","late","excused","sick","absent"],"lock_after_submit":false}'::jsonb,
  '{"school_name":"SD EduSmart Indonesia","city":"Jakarta"}'::jsonb
)
on conflict (school_id) do update
set grading_settings = excluded.grading_settings,
    attendance_settings = excluded.attendance_settings,
    report_branding = excluded.report_branding;

-- -----------------------------------------------------------------------------
-- 2. Academic year, terms, grade levels, classrooms, subjects
-- -----------------------------------------------------------------------------

insert into public.academic_years (
  id, organization_id, school_id, code, name, starts_on, ends_on, status, is_current
)
values (
  pg_temp.demo_uuid('year:sd-demo:2026-2027'),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  '2026/2027',
  'Tahun Ajaran 2026/2027',
  date '2026-07-13',
  date '2027-06-18',
  'active',
  true
)
on conflict (school_id, code) do update
set name = excluded.name,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    status = excluded.status,
    is_current = excluded.is_current;

insert into public.terms (
  id, organization_id, school_id, academic_year_id, code, name, sequence, starts_on, ends_on, status
) values
(
  pg_temp.demo_uuid('term:sd-demo:2026-2027:1'), pg_temp.demo_uuid('org:edusmart-demo'), pg_temp.demo_uuid('school:sd-demo'),
  pg_temp.demo_uuid('year:sd-demo:2026-2027'), 'SEM1', 'Semester 1', 1, date '2026-07-13', date '2026-12-18', 'active'
),
(
  pg_temp.demo_uuid('term:sd-demo:2026-2027:2'), pg_temp.demo_uuid('org:edusmart-demo'), pg_temp.demo_uuid('school:sd-demo'),
  pg_temp.demo_uuid('year:sd-demo:2026-2027'), 'SEM2', 'Semester 2', 2, date '2027-01-04', date '2027-06-18', 'draft'
)
on conflict (academic_year_id, code) do update
set name = excluded.name,
    sequence = excluded.sequence,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    status = excluded.status;

insert into public.grade_levels (
  id, organization_id, school_id, code, name, sequence, education_stage, is_active
)
select
  pg_temp.demo_uuid('grade:sd-demo:' || g::text),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  'GRADE_' || g,
  'Kelas ' || g,
  g,
  'sd',
  true
from generate_series(1,6) g
on conflict (school_id, code) do update
set name = excluded.name,
    sequence = excluded.sequence,
    is_active = excluded.is_active;

insert into public.classrooms (
  id, organization_id, school_id, academic_year_id, grade_level_id, code, name, capacity, status
)
select
  pg_temp.demo_uuid('class:sd-demo:2026-2027:' || g::text || 'A'),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  pg_temp.demo_uuid('year:sd-demo:2026-2027'),
  pg_temp.demo_uuid('grade:sd-demo:' || g::text),
  g::text || 'A',
  'Kelas ' || g || 'A',
  30,
  'active'
from generate_series(1,6) g
on conflict (school_id, academic_year_id, code) do update
set name = excluded.name,
    grade_level_id = excluded.grade_level_id,
    capacity = excluded.capacity,
    status = excluded.status;

with subject_seed(code, name, category, seq) as (
  values
  ('MAT','Matematika','wajib',1),
  ('BIN','Bahasa Indonesia','wajib',2),
  ('IPAS','IPAS','wajib',3),
  ('PP','Pendidikan Pancasila','wajib',4),
  ('BIG','Bahasa Inggris','muatan',5),
  ('PAI','Pendidikan Agama Islam','wajib',6),
  ('PJOK','PJOK','wajib',7),
  ('SENI','Seni','wajib',8)
)
insert into public.subjects (id, organization_id, school_id, code, name, category, is_active)
select
  pg_temp.demo_uuid('subject:sd-demo:' || code),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  code,
  name,
  category,
  true
from subject_seed
on conflict (school_id, code) do update
set name = excluded.name,
    category = excluded.category,
    is_active = excluded.is_active;

insert into public.curricula (id, organization_id, school_id, code, name, version, status)
values (
  pg_temp.demo_uuid('curriculum:sd-demo:merdeka-2026'),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  'MERDEKA',
  'Kurikulum Merdeka — Demo',
  '2026',
  'active'
)
on conflict (school_id, code, version) do update
set name = excluded.name, status = excluded.status;

-- -----------------------------------------------------------------------------
-- 3. Staff and school assignments
-- -----------------------------------------------------------------------------

with staff_seed(n, full_name) as (
  values
  (1,'Ayu Lestari, S.Pd.'),
  (2,'Budi Santoso, S.Pd.'),
  (3,'Citra Maharani, S.Pd.'),
  (4,'Dimas Pratama, S.Pd.'),
  (5,'Eka Nuraini, S.Pd.'),
  (6,'Farhan Ramadhan, S.Pd.'),
  (7,'Gita Permata, S.Pd.'),
  (8,'Hendra Wijaya, S.Pd.'),
  (9,'Intan Safitri, S.Pd.'),
  (10,'Joko Wibowo, S.Pd.')
)
insert into public.staff_members (id, organization_id, full_name, staff_kind, status)
select
  pg_temp.demo_uuid('staff:sd-demo:' || n::text),
  pg_temp.demo_uuid('org:edusmart-demo'),
  full_name,
  'teacher',
  'active'
from staff_seed
on conflict (id) do update
set full_name = excluded.full_name,
    status = excluded.status;

insert into public.staff_school_assignments (
  id, organization_id, school_id, staff_member_id, employee_number, employment_status,
  position_title, joined_on, status
)
select
  pg_temp.demo_uuid('staff-school:sd-demo:' || n::text),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  pg_temp.demo_uuid('staff:sd-demo:' || n::text),
  'GTK-' || lpad(n::text,3,'0'),
  'permanent',
  case when n <= 6 then 'Wali Kelas ' || n || 'A' else 'Guru Mata Pelajaran' end,
  date '2024-07-01',
  'active'
from generate_series(1,10) n
on conflict (id) do update
set employee_number = excluded.employee_number,
    position_title = excluded.position_title,
    status = excluded.status;

update public.classrooms c
set homeroom_staff_school_assignment_id = pg_temp.demo_uuid('staff-school:sd-demo:' || gl.sequence::text)
from public.grade_levels gl
where c.grade_level_id = gl.id
  and c.school_id = pg_temp.demo_uuid('school:sd-demo')
  and c.academic_year_id = pg_temp.demo_uuid('year:sd-demo:2026-2027');

-- -----------------------------------------------------------------------------
-- 4. Students, guardians, enrollment & class placement
-- -----------------------------------------------------------------------------

insert into public.students (
  id, organization_id, nisn, full_name, preferred_name, gender, birth_date, birth_place, status
)
select
  pg_temp.demo_uuid('student:sd-demo:' || n::text),
  pg_temp.demo_uuid('org:edusmart-demo'),
  lpad((9000000000::bigint + n)::text,10,'0'),
  'Siswa Demo ' || lpad(n::text,2,'0'),
  'Siswa ' || lpad(n::text,2,'0'),
  case when n % 2 = 0 then 'female' else 'male' end,
  date '2020-01-01' - ((((n - 1) / 6)) * interval '1 year') + ((n % 11) * interval '7 days'),
  'Jakarta',
  'active'
from generate_series(1,36) n
on conflict (id) do update
set full_name = excluded.full_name,
    preferred_name = excluded.preferred_name,
    status = excluded.status;

insert into public.guardians (
  id, organization_id, full_name, phone, email, occupation, status
)
select
  pg_temp.demo_uuid('guardian:sd-demo:' || n::text),
  pg_temp.demo_uuid('org:edusmart-demo'),
  'Orang Tua Siswa ' || lpad(n::text,2,'0'),
  '62812' || lpad((1000000 + n)::text,7,'0'),
  'parent' || lpad(n::text,2,'0') || '@example.test',
  case when n % 3 = 0 then 'Wiraswasta' when n % 3 = 1 then 'Karyawan' else 'Profesional' end,
  'active'
from generate_series(1,36) n
on conflict (id) do update
set full_name = excluded.full_name,
    phone = excluded.phone,
    email = excluded.email,
    status = excluded.status;

insert into public.student_guardians (
  id, organization_id, student_id, guardian_id, relationship_type, is_primary,
  can_view_academic, can_view_attendance, can_receive_notification, can_manage_permissions, status
)
select
  pg_temp.demo_uuid('student-guardian:sd-demo:' || n::text),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('student:sd-demo:' || n::text),
  pg_temp.demo_uuid('guardian:sd-demo:' || n::text),
  case when n % 2 = 0 then 'mother' else 'father' end,
  true, true, true, true, false, 'active'
from generate_series(1,36) n
on conflict (student_id, guardian_id) do update
set status = excluded.status,
    can_view_academic = true,
    can_view_attendance = true;

insert into public.student_enrollments (
  id, organization_id, school_id, student_id, academic_year_id, grade_level_id,
  student_number, enrollment_number, status, enrolled_on
)
select
  pg_temp.demo_uuid('enrollment:sd-demo:2026-2027:' || n::text),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  pg_temp.demo_uuid('student:sd-demo:' || n::text),
  pg_temp.demo_uuid('year:sd-demo:2026-2027'),
  pg_temp.demo_uuid('grade:sd-demo:' || (((n - 1) / 6) + 1)::text),
  '26' || lpad(n::text,4,'0'),
  'ENR-2026-' || lpad(n::text,4,'0'),
  'active',
  date '2026-07-13'
from generate_series(1,36) n
on conflict (student_id, school_id, academic_year_id) do update
set grade_level_id = excluded.grade_level_id,
    student_number = excluded.student_number,
    status = excluded.status;

insert into public.class_enrollments (
  id, organization_id, school_id, student_enrollment_id, classroom_id, starts_on, is_primary, status
)
select
  pg_temp.demo_uuid('class-enrollment:sd-demo:2026-2027:' || n::text),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  pg_temp.demo_uuid('enrollment:sd-demo:2026-2027:' || n::text),
  pg_temp.demo_uuid('class:sd-demo:2026-2027:' || (((n - 1) / 6) + 1)::text || 'A'),
  date '2026-07-13',
  true,
  'active'
from generate_series(1,36) n
on conflict (id) do update
set classroom_id = excluded.classroom_id,
    status = excluded.status;

-- -----------------------------------------------------------------------------
-- 5. Teaching assignments and sample weekly schedule
--     For simple demo data, each homeroom teacher teaches the seeded subjects in their class.
-- -----------------------------------------------------------------------------

with assignment_seed as (
  select g as grade_no, s.code as subject_code
  from generate_series(1,6) g
  cross join (values ('MAT'),('BIN'),('IPAS'),('PP'),('BIG')) s(code)
)
insert into public.teaching_assignments (
  id, organization_id, school_id, academic_year_id, term_id, classroom_id, subject_id,
  staff_school_assignment_id, role, starts_on, status
)
select
  pg_temp.demo_uuid('teaching:sd-demo:' || grade_no::text || ':' || subject_code),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  pg_temp.demo_uuid('year:sd-demo:2026-2027'),
  pg_temp.demo_uuid('term:sd-demo:2026-2027:1'),
  pg_temp.demo_uuid('class:sd-demo:2026-2027:' || grade_no::text || 'A'),
  pg_temp.demo_uuid('subject:sd-demo:' || subject_code),
  pg_temp.demo_uuid('staff-school:sd-demo:' || grade_no::text),
  'teacher',
  date '2026-07-13',
  'active'
from assignment_seed
on conflict (id) do update
set status = excluded.status,
    staff_school_assignment_id = excluded.staff_school_assignment_id;

with schedule_seed(subject_code, weekday, start_time, end_time) as (
  values
  ('MAT',1,time '07:30',time '08:40'),
  ('BIN',2,time '07:30',time '08:40'),
  ('IPAS',3,time '07:30',time '08:40'),
  ('PP',4,time '07:30',time '08:40'),
  ('BIG',5,time '07:30',time '08:40')
), rows_to_insert as (
  select g as grade_no, ss.*
  from generate_series(1,6) g
  cross join schedule_seed ss
)
insert into public.timetable_entries (
  id, organization_id, school_id, academic_year_id, term_id, teaching_assignment_id,
  weekday, start_time, end_time, effective_from, status
)
select
  pg_temp.demo_uuid('timetable:sd-demo:' || grade_no::text || ':' || subject_code),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  pg_temp.demo_uuid('year:sd-demo:2026-2027'),
  pg_temp.demo_uuid('term:sd-demo:2026-2027:1'),
  pg_temp.demo_uuid('teaching:sd-demo:' || grade_no::text || ':' || subject_code),
  weekday,
  start_time,
  end_time,
  date '2026-07-13',
  'published'
from rows_to_insert
on conflict (id) do update
set weekday = excluded.weekday,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    status = excluded.status;

-- -----------------------------------------------------------------------------
-- 6. Assessment types and sample assessments/scores
-- -----------------------------------------------------------------------------

with type_seed(code,name,weight) as (
  values
  ('ASSIGNMENT','Tugas',20::numeric),
  ('QUIZ','Kuis',20::numeric),
  ('DAILY_TEST','Ulangan Harian',25::numeric),
  ('MIDTERM','Sumatif Tengah Semester',15::numeric),
  ('FINAL','Sumatif Akhir Semester',20::numeric)
)
insert into public.assessment_types (
  id, organization_id, school_id, code, name, default_weight, is_active
)
select
  pg_temp.demo_uuid('assessment-type:sd-demo:' || code),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  code, name, weight, true
from type_seed
on conflict (school_id, code) do update
set name = excluded.name,
    default_weight = excluded.default_weight,
    is_active = true;

insert into public.assessments (
  id, organization_id, school_id, academic_year_id, term_id, teaching_assignment_id,
  assessment_type_id, title, description, assessment_date, min_score, max_score, weight, status
)
select
  pg_temp.demo_uuid('assessment:sd-demo:math-quiz:' || g::text),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  pg_temp.demo_uuid('year:sd-demo:2026-2027'),
  pg_temp.demo_uuid('term:sd-demo:2026-2027:1'),
  pg_temp.demo_uuid('teaching:sd-demo:' || g::text || ':MAT'),
  pg_temp.demo_uuid('assessment-type:sd-demo:QUIZ'),
  'Kuis Matematika 1 — Kelas ' || g || 'A',
  'Data dummy untuk pengembangan EduSmart',
  date '2026-08-12',
  0, 100, 20,
  'published'
from generate_series(1,6) g
on conflict (id) do update
set title = excluded.title,
    status = excluded.status;

insert into public.student_scores (
  id, organization_id, school_id, assessment_id, student_enrollment_id, score, status, feedback
)
select
  pg_temp.demo_uuid('score:sd-demo:math-quiz:' || n::text),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  pg_temp.demo_uuid('assessment:sd-demo:math-quiz:' || (((n - 1) / 6) + 1)::text),
  pg_temp.demo_uuid('enrollment:sd-demo:2026-2027:' || n::text),
  70 + ((n * 7) % 29),
  'final',
  case when n % 5 = 0 then 'Perlu latihan tambahan pada ketelitian.' else 'Capaian awal baik.' end
from generate_series(1,36) n
on conflict (assessment_id, student_enrollment_id) do update
set score = excluded.score,
    status = excluded.status,
    feedback = excluded.feedback;

-- -----------------------------------------------------------------------------
-- 7. Sample attendance: Monday, 10 August 2026, Math session for each class
-- -----------------------------------------------------------------------------

insert into public.attendance_sessions (
  id, organization_id, school_id, academic_year_id, term_id, timetable_entry_id,
  teaching_assignment_id, classroom_id, session_date, starts_at, ends_at, status, submitted_at
)
select
  pg_temp.demo_uuid('attendance-session:sd-demo:2026-08-10:' || g::text),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  pg_temp.demo_uuid('year:sd-demo:2026-2027'),
  pg_temp.demo_uuid('term:sd-demo:2026-2027:1'),
  pg_temp.demo_uuid('timetable:sd-demo:' || g::text || ':MAT'),
  pg_temp.demo_uuid('teaching:sd-demo:' || g::text || ':MAT'),
  pg_temp.demo_uuid('class:sd-demo:2026-2027:' || g::text || 'A'),
  date '2026-08-10',
  timestamptz '2026-08-10 07:30:00+07',
  timestamptz '2026-08-10 08:40:00+07',
  'submitted',
  timestamptz '2026-08-10 08:45:00+07'
from generate_series(1,6) g
on conflict (id) do update
set status = excluded.status,
    submitted_at = excluded.submitted_at;

insert into public.student_attendance_records (
  id, organization_id, school_id, attendance_session_id, student_enrollment_id, status, check_in_at, note
)
select
  pg_temp.demo_uuid('attendance-record:sd-demo:2026-08-10:' || n::text),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  pg_temp.demo_uuid('attendance-session:sd-demo:2026-08-10:' || (((n - 1) / 6) + 1)::text),
  pg_temp.demo_uuid('enrollment:sd-demo:2026-2027:' || n::text),
  case
    when n % 17 = 0 then 'sick'
    when n % 13 = 0 then 'late'
    when n % 19 = 0 then 'absent'
    else 'present'
  end,
  case when n % 17 = 0 or n % 19 = 0 then null else timestamptz '2026-08-10 07:25:00+07' + ((n % 10) * interval '1 minute') end,
  case when n % 17 = 0 then 'Izin sakit dari orang tua.' when n % 13 = 0 then 'Datang terlambat.' else null end
from generate_series(1,36) n
on conflict (attendance_session_id, student_enrollment_id) do update
set status = excluded.status,
    check_in_at = excluded.check_in_at,
    note = excluded.note;

-- -----------------------------------------------------------------------------
-- 8. Draft report cards for workflow UI
-- -----------------------------------------------------------------------------

insert into public.report_cards (
  id, organization_id, school_id, academic_year_id, term_id, student_enrollment_id,
  version, status, homeroom_comment, attendance_summary
)
select
  pg_temp.demo_uuid('report-card:sd-demo:sem1:' || n::text),
  pg_temp.demo_uuid('org:edusmart-demo'),
  pg_temp.demo_uuid('school:sd-demo'),
  pg_temp.demo_uuid('year:sd-demo:2026-2027'),
  pg_temp.demo_uuid('term:sd-demo:2026-2027:1'),
  pg_temp.demo_uuid('enrollment:sd-demo:2026-2027:' || n::text),
  1,
  'draft',
  'Draft rapor demo. Narasi final akan direview wali kelas.',
  jsonb_build_object('present', 1, 'late', 0, 'sick', 0, 'excused', 0, 'absent', 0)
from generate_series(1,36) n
on conflict (student_enrollment_id, term_id, version) do update
set homeroom_comment = excluded.homeroom_comment;

commit;

-- Expected core demo counts after a clean run:
-- organizations: 1
-- schools: 1
-- grade_levels: 6
-- classrooms: 6
-- subjects: 8
-- staff_members: 10
-- students: 36
-- guardians: 36
-- student_enrollments: 36
-- class_enrollments: 36
-- teaching_assignments: 30
-- timetable_entries: 30
-- assessments: 6
-- student_scores: 36
-- attendance_sessions: 6
-- student_attendance_records: 36
-- report_cards: 36
