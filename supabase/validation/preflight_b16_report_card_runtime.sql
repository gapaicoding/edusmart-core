-- Batch 16 Phase 1: read-only Report Card integrity preflight.
-- This script reports findings; it never mutates business data.

with findings as (
  select
    'report_card_status_counts'::text as check_name,
    'EXPECTED DEVELOPMENT INFORMATION'::text as classification,
    count(*)::bigint as issue_count,
    coalesce(status, '<null>')::text as detail
  from public.report_cards
  group by status

  union all
  select 'report_card_org_school_mismatch', 'STRUCTURAL BLOCKER', count(*), 'report_cards.school.organization_id != report_cards.organization_id'
  from public.report_cards rc
  join public.schools s on s.id = rc.school_id
  where s.organization_id <> rc.organization_id

  union all
  select 'report_card_enrollment_scope_mismatch', 'STRUCTURAL BLOCKER', count(*), 'enrollment tenant/school differs from report card'
  from public.report_cards rc
  join public.student_enrollments se on se.id = rc.student_enrollment_id
  where se.organization_id <> rc.organization_id or se.school_id <> rc.school_id

  union all
  select 'report_card_academic_year_mismatch', 'STRUCTURAL BLOCKER', count(*), 'enrollment academic year differs from report card context'
  from public.report_cards rc
  join public.student_enrollments se on se.id = rc.student_enrollment_id
  where se.academic_year_id <> rc.academic_year_id

  union all
  select 'report_card_term_year_mismatch', 'STRUCTURAL BLOCKER', count(*), 'term academic year differs from report card context'
  from public.report_cards rc
  join public.terms t on t.id = rc.term_id
  where t.academic_year_id <> rc.academic_year_id

  union all
  select 'report_card_duplicate_business_identity', 'STRUCTURAL BLOCKER', count(*), 'duplicate enrollment/term/version identity'
  from (
    select student_enrollment_id, term_id, version
    from public.report_cards
    group by student_enrollment_id, term_id, version
    having count(*) > 1
  ) duplicates

  union all
  select 'report_card_duplicate_working_identity', 'STRUCTURAL BLOCKER', count(*), 'more than one draft/submitted/reviewed row per enrollment/term'
  from (
    select student_enrollment_id, term_id
    from public.report_cards
    where status in ('draft','submitted','reviewed')
    group by student_enrollment_id, term_id
    having count(*) > 1
  ) duplicates

  union all
  select 'report_card_duplicate_published_identity', 'STRUCTURAL BLOCKER', count(*), 'more than one published row per enrollment/term'
  from (
    select student_enrollment_id, term_id
    from public.report_cards
    where status = 'published'
    group by student_enrollment_id, term_id
    having count(*) > 1
  ) duplicates

  union all
  select 'report_card_invalid_status', 'STRUCTURAL BLOCKER', count(*), 'status outside canonical domain'
  from public.report_cards
  where status not in ('draft','submitted','reviewed','published','revised','archived')

  union all
  select 'orphan_subject_entries', 'STRUCTURAL BLOCKER', count(*), 'subject entry has no report card'
  from public.report_card_subject_entries rse
  left join public.report_cards rc on rc.id = rse.report_card_id
  where rc.id is null

  union all
  select 'subject_entry_scope_mismatch', 'STRUCTURAL BLOCKER', count(*), 'subject entry tenant/school differs from report card'
  from public.report_card_subject_entries rse
  join public.report_cards rc on rc.id = rse.report_card_id
  where rse.organization_id <> rc.organization_id or rse.school_id <> rc.school_id

  union all
  select 'orphan_narratives', 'STRUCTURAL BLOCKER', count(*), 'narrative has no report card'
  from public.report_card_narratives rcn
  left join public.report_cards rc on rc.id = rcn.report_card_id
  where rc.id is null

  union all
  select 'narrative_scope_mismatch', 'STRUCTURAL BLOCKER', count(*), 'narrative tenant/school differs from report card'
  from public.report_card_narratives rcn
  join public.report_cards rc on rc.id = rcn.report_card_id
  where rcn.organization_id <> rc.organization_id or rcn.school_id <> rc.school_id

  union all
  select 'revised_without_published_predecessor', 'DATA READINESS WARNING', count(*), 'revised row has no published predecessor for the same enrollment/term'
  from public.report_cards revised
  where revised.status = 'revised'
    and not exists (
      select 1 from public.report_cards published
      where published.student_enrollment_id = revised.student_enrollment_id
        and published.term_id = revised.term_id
        and published.status = 'published'
        and published.version < revised.version
    )

  union all
  select 'published_without_subject_snapshot', 'DATA READINESS WARNING', count(*), 'published row has no subject entries'
  from public.report_cards rc
  where rc.status = 'published'
    and not exists (select 1 from public.report_card_subject_entries rse where rse.report_card_id = rc.id)

  union all
  select 'published_without_narrative_snapshot', 'DATA READINESS WARNING', count(*), 'published row has no narratives'
  from public.report_cards rc
  where rc.status = 'published'
    and not exists (select 1 from public.report_card_narratives rcn where rcn.report_card_id = rc.id)

  union all
  select 'generated_document_association_anomaly', 'EXPECTED DEVELOPMENT INFORMATION', count(*), 'document boundary is read-only in Batch 16 Phase 1'
  from public.generated_documents gd
  where gd.entity_type = 'report_card'
    and not exists (select 1 from public.report_cards rc where rc.id = gd.entity_id)
)
select check_name, classification, issue_count, detail
from findings
order by classification, check_name, detail;
