-- Read-only Batch 13 Phase 2 validator. Execute in a transaction and rollback.
do $$
declare
  v_name text;
begin
  if to_regclass('public.teacher_daily_operation_command_requests') is null then
    raise exception 'B13-P2: command ledger is missing';
  end if;
  if not exists (select 1 from pg_class where oid='public.teacher_daily_operation_command_requests'::regclass and relrowsecurity) then
    raise exception 'B13-P2: command ledger RLS is disabled';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='staff_attendance_records' and column_name='version') then
    raise exception 'B13-P2: staff attendance version is missing';
  end if;
  foreach v_name in array array[
    'create_teaching_journal','update_teaching_journal','submit_teaching_journal',
    'manage_staff_attendance','list_my_teaching_journals','get_my_teaching_journal',
    'list_staff_teaching_journals','get_staff_teaching_journal','list_my_teaching_occurrences',
    'list_staff_attendance','get_staff_attendance_record','list_my_staff_attendance'
  ] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_name and p.prosecdef and p.proconfig @> array['search_path=""']::text[]) then
      raise exception 'B13-P2: secured RPC % is missing or has unsafe search_path', v_name;
    end if;
    if exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where n.nspname='public' and p.proname=v_name and a.privilege_type='EXECUTE'
        and (a.grantee=0 or a.grantee=(select oid from pg_roles where rolname='anon'))
    ) then
      raise exception 'B13-P2: anonymous/public execute remains on %', v_name;
    end if;
    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where n.nspname='public' and p.proname=v_name and a.privilege_type='EXECUTE'
        and a.grantee=(select oid from pg_roles where rolname='authenticated')
    ) then
      raise exception 'B13-P2: authenticated execute is missing on %', v_name;
    end if;
  end loop;
  if has_table_privilege('authenticated','public.staff_attendance_records','INSERT,UPDATE,DELETE') then
    raise exception 'B13-P2: direct authenticated Staff Attendance mutation remains';
  end if;
  if exists (
    select 1 from pg_policy pp
    join pg_class pc on pc.oid=pp.polrelid
    join pg_namespace pn on pn.oid=pc.relnamespace
    where pn.nspname='public' and pc.relname='teacher_daily_operation_command_requests'
  ) then
    raise exception 'B13-P2: command ledger has an unexpected application policy';
  end if;
  if exists (select 1 from public.staff_attendance_records where version < 1) then
    raise exception 'B13-P2: invalid Staff Attendance version';
  end if;
  if exists (select 1 from public.staff_attendance_records where check_in_at is not null and check_out_at is not null and check_out_at < check_in_at) then
    raise exception 'B13-P2: Staff Attendance time invariant failed';
  end if;
  raise notice 'B13 TEACHER DAILY OPERATIONS PHASE 2 VALIDATION PASSED';
end;
$$;
