-- Batch 15 Phase 1 read-only Development data preflight.
-- Each row is classified for audit consumption; this script performs no DML.
select * from (
  select 'assessment_org_school_integrity' as check_name, 'STRUCTURAL BLOCKER' as classification,
    count(*)::bigint as issue_count
  from public.assessments a
  left join public.schools s on s.id = a.school_id and s.organization_id = a.organization_id
  where s.id is null
  union all
  select 'assessment_academic_year_integrity', 'STRUCTURAL BLOCKER', count(*)
  from public.assessments a
  left join public.academic_years y on y.id = a.academic_year_id
    and y.organization_id = a.organization_id and y.school_id = a.school_id
  where y.id is null
  union all
  select 'assessment_term_year_consistency', 'STRUCTURAL BLOCKER', count(*)
  from public.assessments a
  left join public.terms t on t.id = a.term_id
    and t.organization_id = a.organization_id and t.school_id = a.school_id
    and t.academic_year_id = a.academic_year_id
  where t.id is null
  union all
  select 'assessment_assignment_scope', 'STRUCTURAL BLOCKER', count(*)
  from public.assessments a
  left join public.teaching_assignments ta on ta.id = a.teaching_assignment_id
    and ta.organization_id = a.organization_id and ta.school_id = a.school_id
  where ta.id is null
  union all
  select 'assessment_duplicate_identity', 'DATA READINESS WARNING', count(*)
  from (
    select organization_id, school_id, academic_year_id, term_id,
      teaching_assignment_id, assessment_type_id, title, assessment_date, count(*)
    from public.assessments
    group by organization_id, school_id, academic_year_id, term_id,
      teaching_assignment_id, assessment_type_id, title, assessment_date
    having count(*) > 1
  ) duplicates
  union all
  select 'duplicate_score_identity', 'STRUCTURAL BLOCKER', count(*)
  from (
    select assessment_id, student_enrollment_id, count(*)
    from public.student_scores
    group by assessment_id, student_enrollment_id
    having count(*) > 1
  ) duplicates
  union all
  select 'score_assessment_reference', 'STRUCTURAL BLOCKER', count(*)
  from public.student_scores ss
  left join public.assessments a on a.id = ss.assessment_id
    and a.organization_id = ss.organization_id and a.school_id = ss.school_id
  where a.id is null
  union all
  select 'score_enrollment_reference', 'STRUCTURAL BLOCKER', count(*)
  from public.student_scores ss
  left join public.student_enrollments se on se.id = ss.student_enrollment_id
    and se.organization_id = ss.organization_id and se.school_id = ss.school_id
  where se.id is null
  union all
  select 'score_enrollment_year_mismatch', 'STRUCTURAL BLOCKER', count(*)
  from public.student_scores ss
  join public.assessments a on a.id = ss.assessment_id
    and a.organization_id = ss.organization_id and a.school_id = ss.school_id
  join public.student_enrollments se on se.id = ss.student_enrollment_id
    and se.organization_id = ss.organization_id and se.school_id = ss.school_id
  where se.academic_year_id <> a.academic_year_id
  union all
  select 'score_range_violation', 'STRUCTURAL BLOCKER', count(*)
  from public.student_scores ss
  join public.assessments a on a.id = ss.assessment_id
    and a.organization_id = ss.organization_id and a.school_id = ss.school_id
  where ss.score is not null and (ss.score < a.min_score or ss.score > a.max_score)
  union all
  select 'score_status_value_consistency', 'STRUCTURAL BLOCKER', count(*)
  from public.student_scores
  where (status in ('missing', 'excused') and score is not null)
     or (status in ('submitted', 'final') and score is null)
  union all
  select 'published_assessment_without_scope', 'DATA READINESS WARNING', count(*)
  from public.assessments a
  left join public.teaching_assignments ta on ta.id = a.teaching_assignment_id
  where a.status = 'published' and (ta.id is null or ta.school_id <> a.school_id)
  union all
  select 'final_score_without_published_assessment', 'DATA READINESS WARNING', count(*)
  from public.student_scores ss
  join public.assessments a on a.id = ss.assessment_id
  where ss.status = 'final' and a.status <> 'published'
  union all
  select 'report_card_published_source_review', 'EXPECTED DEVELOPMENT QA INFORMATION', 0::bigint
) checks
order by classification, check_name;
