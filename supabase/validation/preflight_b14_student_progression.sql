-- B14 Phase 1 read-only Development data-readiness preflight.
-- This file intentionally creates no tables, rows, functions, policies, or
-- progression business data. It reports aggregate readiness only.

-- SCHOOLS
select s.id as school_id, s.organization_id, s.code, s.name, s.status
from public.schools s
order by s.organization_id, s.code;

-- CANDIDATE SOURCE/TARGET ACADEMIC YEAR PAIRS
select
  s.id as school_id,
  s.name as school_name,
  source.id as source_academic_year_id,
  source.code as source_code,
  source.starts_on as source_starts_on,
  source.ends_on as source_ends_on,
  target.id as target_academic_year_id,
  target.code as target_code,
  target.starts_on as target_starts_on,
  target.ends_on as target_ends_on,
  source.status as source_status,
  target.status as target_status
from public.schools s
join public.academic_years source on source.school_id = s.id and source.organization_id = s.organization_id
join public.academic_years target on target.school_id = s.id and target.organization_id = s.organization_id
  and target.starts_on > source.starts_on
  and target.ends_on > source.ends_on
where s.status = 'active'
order by s.id, source.starts_on, target.starts_on;

-- YEAR RANGE / ORDERING ISSUES
select count(*) as invalid_academic_year_count
from public.academic_years
where ends_on < starts_on;

select count(*) as overlapping_year_pair_count
from public.academic_years a
join public.academic_years b
  on b.school_id = a.school_id
 and b.organization_id = a.organization_id
 and b.id <> a.id
where a.starts_on < b.starts_on and a.ends_on >= b.starts_on;

-- GRADE-LEVEL SEQUENCES
select school_id, organization_id,
       count(*) as active_grade_level_count,
       count(distinct sequence) as distinct_sequence_count,
       min(sequence) as min_sequence,
       max(sequence) as max_sequence
from public.grade_levels
where is_active
group by organization_id, school_id
order by organization_id, school_id;

select school_id, sequence, count(*) as duplicate_sequence_count
from public.grade_levels
where is_active
group by school_id, sequence
having count(*) > 1
order by school_id, sequence;

-- CLASSROOM READINESS BY YEAR/GRADE
select
  c.school_id,
  c.academic_year_id,
  c.grade_level_id,
  count(*) filter (where c.status in ('draft','active')) as usable_classroom_count,
  count(*) as total_classroom_count
from public.classrooms c
group by c.school_id, c.academic_year_id, c.grade_level_id
order by c.school_id, c.academic_year_id, c.grade_level_id;

-- ACTIVE/CURRENT STUDENT ENROLLMENTS
select school_id, academic_year_id, status, count(*) as enrollment_count
from public.student_enrollments
group by school_id, academic_year_id, status
order by school_id, academic_year_id, status;

-- DUPLICATE ENROLLMENT ANOMALIES
select student_id, school_id, academic_year_id, count(*) as duplicate_count
from public.student_enrollments
group by student_id, school_id, academic_year_id
having count(*) > 1
order by school_id, academic_year_id;

-- CLASS-ENROLLMENT CONSISTENCY ISSUES
select count(*) as class_enrollment_scope_issue_count
from public.class_enrollments ce
left join public.student_enrollments se
  on se.id = ce.student_enrollment_id
 and se.organization_id = ce.organization_id
 and se.school_id = ce.school_id
left join public.classrooms c
  on c.id = ce.classroom_id
 and c.organization_id = ce.organization_id
 and c.school_id = ce.school_id
where se.id is null or c.id is null
   or c.academic_year_id <> se.academic_year_id;

-- SOURCE ENROLLMENTS WITH MISSING GRADE
select count(*) as source_enrollment_missing_grade_count
from public.student_enrollments se
left join public.grade_levels gl
  on gl.id = se.grade_level_id
 and gl.organization_id = se.organization_id
 and gl.school_id = se.school_id
where gl.id is null;

-- TARGET-YEAR READINESS SUMMARY
select
  source.school_id,
  source.id as source_academic_year_id,
  target.id as target_academic_year_id,
  count(distinct se.id) filter (where se.status in ('active','draft','leave')) as source_candidate_enrollment_count,
  count(distinct c.id) filter (where c.status in ('draft','active')) as target_usable_classroom_count,
  count(distinct gl.id) filter (where gl.is_active) as target_school_grade_count
from public.academic_years source
join public.academic_years target
  on target.school_id = source.school_id
 and target.organization_id = source.organization_id
 and target.starts_on > source.starts_on
 and target.ends_on > source.ends_on
left join public.student_enrollments se
  on se.school_id = source.school_id
 and se.organization_id = source.organization_id
 and se.academic_year_id = source.id
left join public.classrooms c
  on c.school_id = target.school_id
 and c.organization_id = target.organization_id
 and c.academic_year_id = target.id
left join public.grade_levels gl
  on gl.school_id = target.school_id
 and gl.organization_id = target.organization_id
group by source.school_id, source.id, target.id
order by source.school_id, source.id, target.id;

-- REPORT-CARD READINESS COUNTS
select
  rc.school_id,
  rc.academic_year_id,
  rc.term_id,
  count(*) as report_card_count,
  count(*) filter (where rc.status = 'published') as published_report_card_count,
  count(*) filter (where rc.status <> 'published') as non_published_report_card_count
from public.report_cards rc
group by rc.school_id, rc.academic_year_id, rc.term_id
order by rc.school_id, rc.academic_year_id, rc.term_id;

-- ASSESSMENT READINESS COUNTS
select
  a.school_id,
  a.academic_year_id,
  a.term_id,
  count(distinct a.id) as assessment_count,
  count(distinct ss.id) as score_count,
  count(distinct a.id) filter (where a.status = 'published') as published_assessment_count
from public.assessments a
left join public.student_scores ss on ss.assessment_id = a.id
group by a.school_id, a.academic_year_id, a.term_id
order by a.school_id, a.academic_year_id, a.term_id;

-- TERMINAL/INACTIVE SOURCE ENROLLMENT CONDITIONS
select school_id, academic_year_id, status, count(*) as enrollment_count
from public.student_enrollments
where status in ('leave','transferred','withdrawn','graduated')
group by school_id, academic_year_id, status
order by school_id, academic_year_id, status;

-- AGGREGATE ISSUE SUMMARY
select
  (select count(*) from public.academic_years where ends_on < starts_on) as invalid_year_ranges,
  (select count(*) from (
     select student_id, school_id, academic_year_id
     from public.student_enrollments
     group by student_id, school_id, academic_year_id
     having count(*) > 1
   ) d) as duplicate_enrollment_keys,
  (select count(*)
   from public.class_enrollments ce
   left join public.student_enrollments se on se.id = ce.student_enrollment_id
     and se.organization_id = ce.organization_id and se.school_id = ce.school_id
   left join public.classrooms c on c.id = ce.classroom_id
     and c.organization_id = ce.organization_id and c.school_id = ce.school_id
   where se.id is null or c.id is null or c.academic_year_id <> se.academic_year_id) as class_scope_issues,
  (select count(*)
   from public.student_enrollments se
   left join public.grade_levels gl on gl.id = se.grade_level_id
     and gl.organization_id = se.organization_id and gl.school_id = se.school_id
   where gl.id is null) as missing_grade_references;
