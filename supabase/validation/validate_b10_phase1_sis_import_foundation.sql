-- Batch 10 Phase 1 database foundation validator.
--
-- READ ONLY. Run this AFTER the 20260912120000_b10_sis_import_foundation.sql
-- migration has been applied to a target database. It validates persistence
-- of the Phase-1 invariants in the final Batch-10 schema; later approved
-- Phase-3 objects are allowed.
--
-- Usage: psql "$DATABASE_URL" -f supabase/validation/validate_b10_phase1_sis_import_foundation.sql

begin;
set transaction read only;

do $$
declare
  v_count integer;
  v_missing text[] := array[]::text[];
begin
  -- ---------------------------------------------------------------------
  -- TABLES
  -- ---------------------------------------------------------------------
  if to_regclass('public.sis_import_jobs') is null then
    v_missing := v_missing || 'table sis_import_jobs missing';
  end if;
  if to_regclass('public.sis_import_job_rows') is null then
    v_missing := v_missing || 'table sis_import_job_rows missing';
  end if;
  if to_regclass('public.sis_import_job_issues') is null then
    v_missing := v_missing || 'table sis_import_job_issues missing';
  end if;
  if to_regclass('public.sis_import_entity_refs') is null then
    v_missing := v_missing || 'table sis_import_entity_refs missing';
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'B10 Phase 1 validator FAILED (tables): %', array_to_string(v_missing, '; ');
  end if;

  -- ---------------------------------------------------------------------
  -- JOBS
  -- ---------------------------------------------------------------------
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sis_import_jobs'
      and column_name = 'school_id' and is_nullable = 'NO'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_jobs.school_id must be NOT NULL';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sis_import_jobs'
      and column_name = 'organization_id' and is_nullable = 'NO'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_jobs.organization_id must be NOT NULL';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sis_import_jobs' and column_name = 'normalized_plan_fingerprint'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_jobs.normalized_plan_fingerprint missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sis_import_jobs' and column_name = 'preview_version'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_jobs.preview_version missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sis_import_jobs' and column_name = 'confirmation_token_hash'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_jobs token-binding field missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sis_import_jobs'::regclass and conname = 'sis_import_jobs_status_check'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_jobs status CHECK missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sis_import_jobs'::regclass
      and conname = 'sis_import_jobs_school_fk'
      and contype = 'f'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_jobs tenant-safe school FK missing';
  end if;

  -- ---------------------------------------------------------------------
  -- ROWS / ISSUES
  -- ---------------------------------------------------------------------
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sis_import_job_rows'::regclass and conname = 'sis_import_job_rows_entity_type_check'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_job_rows entity_type CHECK missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sis_import_job_rows'::regclass and conname = 'sis_import_job_rows_action_check'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_job_rows action CHECK missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sis_import_job_issues'::regclass and conname = 'sis_import_job_issues_severity_check'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_job_issues severity CHECK missing';
  end if;

  -- ---------------------------------------------------------------------
  -- ENTITY REFS
  -- ---------------------------------------------------------------------
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sis_import_entity_refs'::regclass and conname = 'sis_import_entity_refs_entity_type_check'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_entity_refs entity_type CHECK missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sis_import_entity_refs'::regclass and conname = 'sis_import_entity_refs_exactly_one_typed_fk_check'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_entity_refs exactly-one-typed-FK CHECK missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sis_import_entity_refs'::regclass and conname = 'sis_import_entity_refs_student_fk' and contype = 'f'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_entity_refs student composite FK missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sis_import_entity_refs'::regclass and conname = 'sis_import_entity_refs_guardian_fk' and contype = 'f'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_entity_refs guardian composite FK missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sis_import_entity_refs'::regclass and conname = 'sis_import_entity_refs_staff_fk' and contype = 'f'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_entity_refs staff composite FK missing';
  end if;

  -- Composite FKs must actually be tenant-safe. Resolve both sides through
  -- pg_attribute in conkey/confkey order; pg_get_constraintdef rendering is
  -- intentionally irrelevant (it may omit schema qualification).
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.sis_import_entity_refs'::regclass
      and c.confrelid = 'public.students'::regclass
      and c.conname = 'sis_import_entity_refs_student_fk'
      and c.contype = 'f'
      and (select array_agg(a.attname order by k.ord)
           from unnest(c.conkey) with ordinality k(attnum, ord)
           join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)
          = array['student_id','organization_id']::name[]
      and (select array_agg(a.attname order by k.ord)
           from unnest(c.confkey) with ordinality k(attnum, ord)
           join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum)
          = array['id','organization_id']::name[]
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_entity_refs student FK is not tenant-safe';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'sis_import_entity_refs'
      and indexname = 'uq_sis_import_entity_refs_org_type_ref_ci'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: case-insensitive external-ref uniqueness index missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'sis_import_entity_refs'
      and indexname = 'uq_sis_import_entity_refs_one_per_student'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: one-ref-per-Student unique index missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'sis_import_entity_refs'
      and indexname = 'uq_sis_import_entity_refs_one_per_guardian'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: one-ref-per-Guardian unique index missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'sis_import_entity_refs'
      and indexname = 'uq_sis_import_entity_refs_one_per_staff'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: one-ref-per-Staff unique index missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sis_import_entity_refs'::regclass
      and conname = 'sis_import_entity_refs_external_ref_format_check'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: external-ref format CHECK missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.sis_import_entity_refs'::regclass
      and tgname = 'trg_sis_import_entity_refs_immutable'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: entity-ref immutability trigger missing';
  end if;

  -- ---------------------------------------------------------------------
  -- RLS ENABLED ON ALL FOUR
  -- ---------------------------------------------------------------------
  select count(*) into v_count
  from pg_tables
  where schemaname = 'public'
    and tablename in ('sis_import_jobs','sis_import_job_rows','sis_import_job_issues','sis_import_entity_refs')
    and rowsecurity = true;

  if v_count <> 4 then
    raise exception 'B10 Phase 1 validator FAILED: RLS is not enabled on all four B10 tables (found % of 4)', v_count;
  end if;

  -- ---------------------------------------------------------------------
  -- ENTITY REF LOCKDOWN
  -- ---------------------------------------------------------------------
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sis_import_entity_refs'
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_entity_refs must have ZERO RLS policies in Phase 1';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'sis_import_entity_refs'
      and grantee in ('authenticated','anon')
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_entity_refs must have ZERO table grants to authenticated/anon';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in ('sis_import_jobs','sis_import_job_rows','sis_import_job_issues')
      and cmd = 'UPDATE' and tablename in ('sis_import_job_rows','sis_import_job_issues')
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_job_rows/sis_import_job_issues must not have a generic UPDATE policy in Phase 1';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in ('sis_import_job_rows','sis_import_job_issues')
      and cmd in ('INSERT','DELETE')
  ) then
    raise exception 'B10 Phase 1 validator FAILED: sis_import_job_rows/sis_import_job_issues must not have a client-facing INSERT/DELETE policy in Phase 1';
  end if;

  -- ---------------------------------------------------------------------
  -- B10-P1-SEC-001: sis_import_jobs direct-mutation lockdown
  -- ---------------------------------------------------------------------
  if not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'sis_import_jobs'
      and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) then
    raise exception 'B10-P1-SEC-001 FAILED: authenticated must have SELECT on sis_import_jobs';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'sis_import_jobs'
      and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    raise exception 'B10-P1-SEC-001 FAILED: authenticated must NOT have INSERT/UPDATE/DELETE on sis_import_jobs';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sis_import_jobs' and cmd = 'INSERT'
  ) then
    raise exception 'B10-P1-SEC-001 FAILED: sis_import_jobs must not have a direct-client INSERT policy';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sis_import_jobs' and cmd = 'UPDATE'
  ) then
    raise exception 'B10-P1-SEC-001 FAILED: sis_import_jobs must not have a direct-client UPDATE policy';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sis_import_jobs' and cmd = 'DELETE'
  ) then
    raise exception 'B10-P1-SEC-001 FAILED: sis_import_jobs must not have a DELETE policy';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sis_import_jobs' and cmd = 'SELECT'
      and policyname = 'sis_import_jobs_select'
  ) then
    raise exception 'B10-P1-SEC-001 FAILED: sis_import_jobs school/permission-scoped SELECT policy missing';
  end if;

  -- Provenance FK contract (Gate 6B): mapping rows can never reference a
  -- job belonging to a different organization.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sis_import_entity_refs'::regclass
      and conname = 'sis_import_entity_refs_created_by_job_fk' and contype = 'f'
  ) then
    raise exception 'B10-P1-SEC-001 FAILED: sis_import_entity_refs tenant-safe provenance FK to sis_import_jobs missing';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.sis_import_entity_refs'::regclass
      and c.confrelid = 'public.sis_import_jobs'::regclass
      and c.conname = 'sis_import_entity_refs_created_by_job_fk'
      and c.contype = 'f'
      and (select array_agg(a.attname order by k.ord) from unnest(c.conkey) with ordinality k(attnum,ord)
           join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)
          = array['created_by_import_job_id','organization_id']::name[]
      and (select array_agg(a.attname order by k.ord) from unnest(c.confkey) with ordinality k(attnum,ord)
           join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum)
          = array['id','organization_id']::name[]
  ) then
    raise exception 'B10-P1-SEC-001 FAILED: sis_import_entity_refs provenance FK is not tenant-safe';
  end if;

  -- File-asset FK contract (Gate 6A).
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.sis_import_jobs'::regclass
      and c.confrelid = 'public.file_assets'::regclass
      and c.conname = 'sis_import_jobs_file_asset_fk' and c.contype = 'f'
      and c.confdeltype = 'r'
      and (select array_agg(a.attname order by k.ord) from unnest(c.conkey) with ordinality k(attnum,ord)
           join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)
          = array['source_file_asset_id','organization_id']::name[]
      and (select array_agg(a.attname order by k.ord) from unnest(c.confkey) with ordinality k(attnum,ord)
           join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum)
          = array['id','organization_id']::name[]
  ) then
    raise exception 'B10-P1-SEC-001 FAILED: sis_import_jobs tenant-safe file-asset FK missing';
  end if;

  if not exists (
    select 1
    from pg_index i
    where i.indrelid = 'public.file_assets'::regclass
      and i.indisunique and i.indisvalid and i.indpred is null
      and i.indnkeyatts = 2
      and (select array_agg(a.attname order by k.ord)
           from unnest(i.indkey::smallint[]) with ordinality k(attnum,ord)
           join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
           where k.ord <= i.indnkeyatts)
          = array['id','organization_id']::name[]
  ) then
    raise exception 'B10-P1-SEC-001 FAILED: file_assets composite unique FK target missing';
  end if;

  -- ---------------------------------------------------------------------
  -- RBAC
  -- ---------------------------------------------------------------------
  select count(*) into v_count
  from public.permissions
  where code in (
    'guardian.import','guardian.export',
    'staff.import','staff.export',
    'enrollment.import','enrollment.export',
    'class_enrollment.import','class_enrollment.export',
    'staff_school_assignment.import','staff_school_assignment.export'
  );
  if v_count <> 10 then
    raise exception 'B10 Phase 1 validator FAILED: expected 10 new B10 permission codes, found %', v_count;
  end if;

  -- Full RBAC matrix (Gate 8): 10 new codes x 8 roles.
  -- SCHOOL_ADMIN: all 10 (5 import + 5 export).
  select count(*) into v_count
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id
  join public.permissions p on p.id = rp.permission_id
  where r.code = 'SCHOOL_ADMIN' and r.organization_id is null
    and p.code in (
      'guardian.import','guardian.export','staff.import','staff.export',
      'enrollment.import','enrollment.export','class_enrollment.import','class_enrollment.export',
      'staff_school_assignment.import','staff_school_assignment.export'
    );
  if v_count <> 10 then
    raise exception 'B10 Phase 1 validator FAILED: SCHOOL_ADMIN must hold all 10 B10 codes, found %', v_count;
  end if;

  -- ORG_OWNER: all 10, via the established explicit-grant mechanism.
  select count(*) into v_count
  from public.role_permissions rp
  join public.roles r on r.id = rp.role_id
  join public.permissions p on p.id = rp.permission_id
  where r.code = 'ORG_OWNER' and r.organization_id is null
    and p.code in (
      'guardian.import','guardian.export','staff.import','staff.export',
      'enrollment.import','enrollment.export','class_enrollment.import','class_enrollment.export',
      'staff_school_assignment.import','staff_school_assignment.export'
    );
  if v_count <> 10 then
    raise exception 'B10 Phase 1 validator FAILED: ORG_OWNER must hold all 10 B10 codes, found %', v_count;
  end if;

  -- PRINCIPAL / VICE_PRINCIPAL_CURRICULUM / HOMEROOM_TEACHER: export only (5
  -- codes each), and must NOT hold any of the 5 import codes.
  declare
    v_role text;
  begin
    foreach v_role in array array['PRINCIPAL','VICE_PRINCIPAL_CURRICULUM','HOMEROOM_TEACHER']
    loop
      select count(*) into v_count
      from public.role_permissions rp
      join public.roles r on r.id = rp.role_id
      join public.permissions p on p.id = rp.permission_id
      where r.code = v_role and r.organization_id is null
        and p.code in ('guardian.export','staff.export','enrollment.export','class_enrollment.export','staff_school_assignment.export');
      if v_count <> 5 then
        raise exception 'B10 Phase 1 validator FAILED: % must hold all 5 B10 export codes, found %', v_role, v_count;
      end if;

      if exists (
        select 1
        from public.role_permissions rp
        join public.roles r on r.id = rp.role_id
        join public.permissions p on p.id = rp.permission_id
        where r.code = v_role and r.organization_id is null
          and p.code in ('guardian.import','staff.import','enrollment.import','class_enrollment.import','staff_school_assignment.import')
      ) then
        raise exception 'B10 Phase 1 validator FAILED: % must not hold any B10 import code', v_role;
      end if;
    end loop;
  end;

  -- TEACHER (non-homeroom), PARENT, STUDENT: none of the 10 codes.
  if exists (
    select 1
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.code in ('TEACHER','PARENT','STUDENT') and r.organization_id is null
      and p.code in (
        'guardian.import','guardian.export','staff.import','staff.export',
        'enrollment.import','enrollment.export','class_enrollment.import','class_enrollment.export',
        'staff_school_assignment.import','staff_school_assignment.export'
      )
  ) then
    raise exception 'B10 Phase 1 validator FAILED: TEACHER/PARENT/STUDENT must not hold any B10 import/export permission';
  end if;

  -- ---------------------------------------------------------------------
  -- STORAGE
  -- ---------------------------------------------------------------------
  if not exists (select 1 from storage.buckets where id = 'sis-imports') then
    raise exception 'B10 Phase 1 validator FAILED: sis-imports storage bucket missing';
  end if;

  if exists (select 1 from storage.buckets where id = 'sis-imports' and public = true) then
    raise exception 'B10 Phase 1 validator FAILED: sis-imports storage bucket must not be public';
  end if;

  -- ---------------------------------------------------------------------
  -- REGRESSION: pre-existing objects must remain untouched
  -- ---------------------------------------------------------------------
  if not exists (
    select 1 from pg_constraint where conname = 'students_id_org_key' and conrelid = 'public.students'::regclass
  ) then
    raise exception 'B10 Phase 1 validator FAILED (regression): students(id, organization_id) unique key missing';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'guardians_id_org_key' and conrelid = 'public.guardians'::regclass
  ) then
    raise exception 'B10 Phase 1 validator FAILED (regression): guardians(id, organization_id) unique key missing';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'staff_members_id_org_key' and conrelid = 'public.staff_members'::regclass
  ) then
    raise exception 'B10 Phase 1 validator FAILED (regression): staff_members(id, organization_id) unique key missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'class_enrollments_no_primary_overlap' and conrelid = 'public.class_enrollments'::regclass
  ) then
    raise exception 'B10 Phase 1 validator FAILED (regression): class_enrollments EXCLUDE overlap constraint missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.class_enrollments'::regclass
      and tgname = 'trg_class_enrollments_validate_consistency'
      and not tgisinternal
      and tgenabled <> 'D'
  ) then
    raise exception 'B10 Phase 1 validator FAILED (regression): class_enrollments B2 consistency trigger missing';
  end if;

  raise notice 'B10 Phase 1 validator: ALL CHECKS PASSED';
end $$;

rollback;
