-- EduSmart Core V1 / Batch 13 Phase 1 preflight.
-- Aggregate-only, read-only, transaction-safe. No PII and no mutation.
begin;
set transaction read only;

select
  (select max(version)::text from supabase_migrations.schema_migrations) as latest_migration,
  (select count(*)::bigint from public.teaching_assignments) as teaching_assignments,
  (select count(*)::bigint from public.timetable_entries where status = 'published') as published_timetable_entries,
  (select count(*)::bigint from public.timetable_entries where status = 'published' and term_id is not null) as published_timetable_with_term,
  (select count(*)::bigint from public.staff_members) as staff_members,
  (select count(*)::bigint from public.staff_school_assignments) as staff_school_assignments,
  (select count(*)::bigint from public.staff_attendance_records) as staff_attendance_records,
  (select count(*)::bigint from public.staff_attendance_records r
     left join public.staff_school_assignments a
       on a.staff_member_id = r.staff_member_id
      and a.organization_id = r.organization_id
      and a.school_id = r.school_id
      and a.status = 'active'
      and (a.joined_on is null or a.joined_on <= r.attendance_date)
      and (a.left_on is null or a.left_on >= r.attendance_date)
    where a.id is null) as staff_attendance_assignment_drift,
  (select count(*)::bigint from public.staff_attendance_records
    where check_out_at is not null and check_in_at is not null and check_out_at < check_in_at) as staff_attendance_time_drift,
  (select count(*)::bigint from public.staff_attendance_records
    where status not in ('present','late','excused','sick','absent','leave','other')) as staff_attendance_status_drift,
  (select count(*)::bigint from pg_class where relname = 'teaching_journals') as teaching_journal_namespace_collision,
  (select count(*)::bigint from pg_proc where proname like '%teaching_journal%') as teaching_journal_function_namespace_collision,
  (select count(*)::bigint from pg_proc where proname like '%staff_attendance%') as staff_attendance_function_namespace_count,
  (select count(*)::bigint from public.permissions where code in (
    'teaching_journal.read','teaching_journal.create','teaching_journal.update','teaching_journal.submit',
    'staff_attendance.read','staff_attendance.manage','staff_attendance.self.read')) as b13_permission_namespace_collision,
  (select count(*)::bigint from public.timetable_entries te
    join public.teaching_assignments ta
      on ta.id = te.teaching_assignment_id
     and ta.organization_id = te.organization_id
     and ta.school_id = te.school_id
   where te.status = 'published'
     and ta.status = 'active'
     and te.term_id is not null
     and te.academic_year_id = ta.academic_year_id
     and (ta.term_id is null or ta.term_id = te.term_id)) as journal_occurrence_ready;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('staff_attendance_records','teaching_journals');

select p.code, p.domain, p.action
from public.permissions p
where p.code like 'teaching_journal.%'
   or p.code like 'staff_attendance.%'
order by p.code;

rollback;
