-- B14 Phase 1 read-only structural/security validator.
-- The migration-presence check verifies the B14 migration is present; it does
-- not assert that it is the latest migration.

do $validator$
declare
  v_expected_permissions constant text[] := array[
    'progression.read','progression.create','progression.update',
    'progression.submit','progression.review','progression.approve',
    'progression.apply','progression.cancel','progression.audit'
  ];
  v_permission_count integer;
  v_migration_present boolean;
  v_table text;
begin
  foreach v_table in array array['progression_batches','progression_decisions','progression_command_requests'] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'B14_VALIDATION_MISSING_TABLE: %', v_table;
    end if;
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table and c.relrowsecurity
    ) then
      raise exception 'B14_VALIDATION_RLS_DISABLED: %', v_table;
    end if;
    if exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = v_table
    ) then
      raise exception 'B14_VALIDATION_UNEXPECTED_DIRECT_POLICY: %', v_table;
    end if;
    if has_table_privilege('anon', 'public.' || v_table, 'INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated', 'public.' || v_table, 'INSERT,UPDATE,DELETE') then
      raise exception 'B14_VALIDATION_BROWSER_WRITE_PRIVILEGE: %', v_table;
    end if;
  end loop;

  if exists (
    select 1
    from aclexplode(coalesce(
      (select c.relacl from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname='progression_batches'),
      acldefault('r', 'postgres'::regrole)
    )) a
    where a.grantee = 0 and a.privilege_type in ('INSERT','UPDATE','DELETE')
  ) then
    raise exception 'B14_VALIDATION_PUBLIC_WRITE_PRIVILEGE: progression_batches';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.progression_batches'::regclass
      and conname='progression_batches_source_target_check'
  ) then raise exception 'B14_VALIDATION_MISSING_YEAR_DIFFERENCE_CONSTRAINT'; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='uq_progression_batches_active_scope'
  ) then raise exception 'B14_VALIDATION_MISSING_ACTIVE_SCOPE_UNIQUENESS'; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='uq_progression_decisions_batch_source_enrollment'
  ) then raise exception 'B14_VALIDATION_MISSING_DECISION_UNIQUENESS'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.progression_decisions'::regclass
      and conname='progression_decisions_outcome_target_check'
  ) then raise exception 'B14_VALIDATION_MISSING_GRADUATION_TARGET_CONSTRAINT'; end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.progression_command_requests'::regclass
      and conname='progression_command_requests_actor_request_key'
  ) then raise exception 'B14_VALIDATION_MISSING_COMMAND_UNIQUENESS'; end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.progression_batches'::regclass
      and tgname='trg_progression_batches_audit' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid='public.progression_decisions'::regclass
      and tgname='trg_progression_decisions_audit' and not tgisinternal
  ) then raise exception 'B14_VALIDATION_MISSING_AUDIT_TRIGGER'; end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.student_enrollments'::regclass
      and tgname='trg_student_enrollments_progression_immutability' and not tgisinternal
  ) then raise exception 'B14_VALIDATION_MISSING_SOURCE_IMMUTABILITY_TRIGGER'; end if;

  select count(*) into v_permission_count
  from public.permissions
  where code = any(v_expected_permissions);
  if v_permission_count <> cardinality(v_expected_permissions) then
    raise exception 'B14_VALIDATION_PERMISSION_NAMESPACE_INCOMPLETE';
  end if;

  if not exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id=rp.role_id
    join public.permissions p on p.id=rp.permission_id
    where r.organization_id is null and r.code='SCHOOL_ADMIN' and p.code='progression.create'
  ) then raise exception 'B14_VALIDATION_OPERATOR_GRANT_MISSING'; end if;

  if not exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id=rp.role_id
    join public.permissions p on p.id=rp.permission_id
    where r.organization_id is null and r.code='PRINCIPAL' and p.code='progression.apply'
  ) then raise exception 'B14_VALIDATION_APPROVER_GRANT_MISSING'; end if;

  if not exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id=rp.role_id
    join public.permissions p on p.id=rp.permission_id
    where r.organization_id is null and r.code in ('TEACHER','HOMEROOM_TEACHER') and p.code='progression.read'
  ) then raise exception 'B14_VALIDATION_TEACHER_READ_GRANT_MISSING'; end if;

  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'B14_VALIDATION_MIGRATION_LEDGER_UNAVAILABLE';
  end if;
  execute 'select exists (select 1 from supabase_migrations.schema_migrations where version = $1)'
    into v_migration_present using '20260920100000';
  if not v_migration_present then
    raise exception 'B14_VALIDATION_MIGRATION_NOT_PRESENT';
  end if;

  raise notice 'B14 STUDENT PROGRESSION FOUNDATION VALIDATION PASSED';
end;
$validator$;

select 'B14 STUDENT PROGRESSION FOUNDATION VALIDATION PASSED' as result;
