-- EduSmart Core V1 / Batch 13 Phase 1 post-deploy validator.
-- Read-only structural, security, permission, and data-integrity validation.
begin;
set transaction read only;

do $b13$
declare
  v_latest text;
begin
  if to_regclass('public.teaching_journals') is null then
    raise exception 'B13: teaching_journals is missing';
  end if;

  if not exists (select 1 from pg_catalog.pg_class where oid='public.teaching_journals'::regclass and relrowsecurity) then
    raise exception 'B13: teaching_journals RLS is disabled';
  end if;

  foreach v_latest in array array[
    'id','organization_id','school_id','academic_year_id','term_id','teaching_assignment_id',
    'timetable_entry_id','journal_date','status','material_taught','obstacles','follow_up',
    'teacher_note','version','created_by_profile_id','submitted_by_profile_id','submitted_at',
    'created_at','updated_at'
  ] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='teaching_journals' and column_name=v_latest
    ) then raise exception 'B13: teaching_journals column % is missing', v_latest; end if;
  end loop;

  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.teaching_journals'::regclass and conname='teaching_journals_occurrence_key' and contype='u')
     or not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.teaching_journals'::regclass and conname='teaching_journals_submission_metadata_check' and contype='c')
     or not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.teaching_journals'::regclass and conname='teaching_journals_year_fk' and contype='f' and confdeltype='r')
     or not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.teaching_journals'::regclass and conname='teaching_journals_term_fk' and contype='f' and confdeltype='r')
     or not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.teaching_journals'::regclass and conname='teaching_journals_assignment_fk' and contype='f' and confdeltype='r')
     or not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.teaching_journals'::regclass and conname='teaching_journals_timetable_fk' and contype='f' and confdeltype='r') then
    raise exception 'B13: journal uniqueness, lifecycle, or tenant-safe FKs are incomplete';
  end if;

  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.teaching_journals'::regclass and tgname='trg_teaching_journals_validate_context' and not tgisinternal)
     or not exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.teaching_journals'::regclass and tgname='trg_teaching_journals_no_delete' and not tgisinternal)
     or not exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.teaching_journals'::regclass and tgname='audit_teaching_journals' and not tgisinternal)
     or not exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.staff_attendance_records'::regclass and tgname='trg_staff_attendance_validate_assignment' and not tgisinternal)
     or not exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.staff_attendance_records'::regclass and tgname='audit_staff_attendance' and not tgisinternal) then
    raise exception 'B13: lifecycle, attendance eligibility, or audit triggers are missing';
  end if;

  if exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='teaching_journals' and cmd in ('INSERT','UPDATE','DELETE','ALL'))
     or not exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='teaching_journals' and policyname='teaching_journals_select' and cmd='SELECT') then
    raise exception 'B13: journal direct-write RLS posture is unsafe';
  end if;

  if not exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='staff_attendance_records' and policyname='staff_attendance_select' and cmd='SELECT' and qual like '%staff_attendance.self.read%')
     or not exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='staff_attendance_records' and policyname='staff_attendance_insert' and cmd='INSERT' and with_check like '%staff_attendance.manage%')
     or not exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='staff_attendance_records' and policyname='staff_attendance_update' and cmd='UPDATE' and qual like '%staff_attendance.manage%')
     or exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='staff_attendance_records' and cmd in ('DELETE','ALL')) then
    raise exception 'B13: staff attendance RLS posture is unsafe';
  end if;

  if has_table_privilege('anon','public.teaching_journals','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.teaching_journals','INSERT,UPDATE,DELETE')
     or has_table_privilege('anon','public.staff_attendance_records','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.staff_attendance_records','DELETE') then
    raise exception 'B13: browser table ACL is too broad';
  end if;

  if (select count(*) from public.staff_attendance_records r left join public.staff_school_assignments a
      on a.staff_member_id=r.staff_member_id and a.organization_id=r.organization_id and a.school_id=r.school_id
      and a.status='active' and (a.joined_on is null or a.joined_on<=r.attendance_date)
      and (a.left_on is null or a.left_on>=r.attendance_date) where a.id is null) > 0
     or exists (select 1 from public.staff_attendance_records where check_out_at is not null and check_in_at is not null and check_out_at<check_in_at)
     or exists (select 1 from public.staff_attendance_records where status not in ('present','late','excused','sick','absent','leave','other')) then
    raise exception 'B13: existing staff attendance data violates the canonical contract';
  end if;

  foreach v_latest in array array[
    'teaching_journal.read','teaching_journal.create','teaching_journal.update','teaching_journal.submit',
    'staff_attendance.read','staff_attendance.manage','staff_attendance.self.read'
  ] loop
    if not exists (select 1 from public.permissions where code=v_latest) then
      raise exception 'B13: permission % is missing', v_latest;
    end if;
  end loop;

  -- The migration ledger may contain later valid migrations; require only
  -- that the foundation version is present in the applied migration history.
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260919100000'
  ) then
    raise exception 'B13: foundation migration 20260919100000 is not applied';
  end if;
end
$b13$;

select 'B13 TEACHER DAILY OPERATIONS FOUNDATION VALIDATION PASSED' as result;
rollback;
