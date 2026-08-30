-- Read-only structural regression gate for the final Batch 4 Schedule contract.
-- Run after validate_final_schema.sql against disposable local Supabase.

do $schedule$
declare
  consistency text := pg_get_functiondef('public.validate_timetable_consistency()'::regprocedure);
  conflicts text := pg_get_functiondef('public.validate_timetable_conflicts()'::regprocedure);
  lifecycle text := pg_get_functiondef('public.validate_timetable_history_lifecycle()'::regprocedure);
  transition_guard text := pg_get_functiondef('public.guard_timetable_transition()'::regprocedure);
  replacement text := pg_get_functiondef(
    'public.replace_timetable_entry(uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'::regprocedure
  );
begin
  if consistency not like '%Published TimetableEntry requires a non-historical TeachingAssignment%'
     or consistency not like '%new.status = ''published''%'
     or consistency not like '%old.status = ''published''%'
  then raise exception 'Inactive-Assignment publication/material-rewrite guard is missing'; end if;

  if conflicts not like '%Teacher has an overlapping published timetable entry%'
     or conflicts not like '%Classroom has an overlapping published timetable entry%'
     or conflicts not like '%TeachingAssignment already has an overlapping published timetable entry%'
  then raise exception 'Published schedule conflict guards are incomplete'; end if;

  if lifecycle not like '%Published or inactive TimetableEntry history cannot be deleted%'
     or lifecycle not like '%Inactive TimetableEntry history cannot be updated%'
     or lifecycle not like '%Published TimetableEntry cannot return to draft%'
  then raise exception 'Schedule lifecycle/history guards are incomplete'; end if;

  if transition_guard not like '%schedule.publish%'
     or transition_guard not like '%schedule.archive%'
  then raise exception 'Schedule publication/archive permission guards are incomplete'; end if;

  if replacement not like '%p_expected_row_version%'
     or replacement not like '%TimetableEntry changed since it was loaded; reload before replacing%'
     or replacement not like '%for update%'
     or replacement not like '%insert into public.timetable_entries%'
  then raise exception 'Atomic replacement/concurrency contract is incomplete'; end if;

  if (select p.prosecdef from pg_proc p where p.oid=
      'public.replace_timetable_entry(uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'::regprocedure)
  then raise exception 'replace_timetable_entry must remain SECURITY INVOKER'; end if;

  if not coalesce((select p.proconfig @> array['search_path=""']::text[] from pg_proc p where p.oid=
      'public.replace_timetable_entry(uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'::regprocedure), false)
  then raise exception 'replace_timetable_entry must retain an empty search_path'; end if;

  if not exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename='timetable_entries'
      and p.policyname='timetable_entries_select'
      and p.qual like '%has_staff_scope_permission%'
      and p.qual like '%published%'
      and p.qual like '%can_access_teaching_assignment%'
  ) then raise exception 'Draft/published caller visibility policy is missing'; end if;

  if not exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename='timetable_entries'
      and p.policyname='timetable_entries_insert'
      and p.with_check like '%schedule.create%'
      and p.with_check like '%schedule.publish%'
  ) or not exists (
    select 1 from pg_policies p
    where p.schemaname='public' and p.tablename='timetable_entries'
      and p.policyname='timetable_entries_update'
      and p.qual like '%schedule.update%'
  ) then raise exception 'Caller-scoped schedule mutation policies are incomplete'; end if;

  if not (select c.relrowsecurity from pg_class c where c.oid='public.timetable_entries'::regclass)
  then raise exception 'RLS is disabled on timetable_entries'; end if;
end
$schedule$;

select 'B4-F05 SCHEDULE REGRESSION VALIDATION PASSED' as result;
