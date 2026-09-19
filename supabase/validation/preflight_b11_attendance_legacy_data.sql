-- Batch 11 Attendance legacy-data preflight. Safe on the pre-B11 schema.
-- Read only: reports aggregate counts only and exposes no Student PII.
begin;
set transaction read only;

with record_checks as (
  select r.id,
    (s.id is null) as orphan_session,
    (e.id is null) as orphan_enrollment,
    (st.id is null) as student_or_tenant_mismatch,
    (s.id is not null and e.id is not null and e.academic_year_id<>s.academic_year_id) as wrong_year,
    (s.id is not null and e.id is not null and
      (e.enrolled_on>s.session_date or (e.ended_on is not null and e.ended_on<s.session_date))) as wrong_date,
    case when s.id is null or e.id is null then false else
      (select count(*) from public.class_enrollments ce
       where ce.student_enrollment_id=r.student_enrollment_id
         and ce.organization_id=r.organization_id and ce.school_id=r.school_id
         and ce.classroom_id=s.classroom_id and ce.is_primary
         and ce.starts_on<=s.session_date
         and (ce.ends_on is null or ce.ends_on>=s.session_date))=0 end as missing_historical_class,
    case when s.id is null or e.id is null then false else
      (select count(*) from public.class_enrollments ce
       where ce.student_enrollment_id=r.student_enrollment_id
         and ce.organization_id=r.organization_id and ce.school_id=r.school_id
         and ce.classroom_id=s.classroom_id and ce.is_primary
         and ce.starts_on<=s.session_date
         and (ce.ends_on is null or ce.ends_on>=s.session_date))>1 end as ambiguous_historical_class
  from public.student_attendance_records r
  left join public.attendance_sessions s on s.id=r.attendance_session_id
    and s.organization_id=r.organization_id and s.school_id=r.school_id
  left join public.student_enrollments e on e.id=r.student_enrollment_id
    and e.organization_id=r.organization_id and e.school_id=r.school_id
  left join public.students st on st.id=e.student_id and st.organization_id=e.organization_id
), duplicate_records as (
  select coalesce(sum(n-1),0)::bigint as violations from (
    select count(*) n from public.student_attendance_records
    group by attendance_session_id,student_enrollment_id having count(*)>1
  ) d
)
select count(*)::bigint as legacy_records_checked,
  count(*) filter (where orphan_session)::bigint as orphan_or_cross_tenant_session,
  count(*) filter (where orphan_enrollment)::bigint as orphan_or_cross_tenant_enrollment,
  count(*) filter (where student_or_tenant_mismatch)::bigint as student_enrollment_mismatch,
  count(*) filter (where wrong_year)::bigint as wrong_academic_year,
  count(*) filter (where wrong_date)::bigint as enrollment_not_effective,
  count(*) filter (where missing_historical_class)::bigint as missing_historical_primary_class,
  count(*) filter (where ambiguous_historical_class)::bigint as ambiguous_historical_primary_class,
  (select violations from duplicate_records) as duplicate_logical_records
from record_checks;

rollback;
