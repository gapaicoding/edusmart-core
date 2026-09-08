-- EduSmart Core V1 / B4-F05
-- Finalize the already-enforced inactive TeachingAssignment timetable policy.
-- No data or behavior is rewritten here: F02/F04 are authoritative. This
-- forward migration records the final product decision without editing applied
-- history or silently changing historical rows.

do $f05_policy$
begin
  if to_regprocedure('public.validate_timetable_consistency()') is null
     or to_regprocedure('public.validate_timetable_history_lifecycle()') is null
     or to_regprocedure(
       'public.replace_timetable_entry(uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean)'
     ) is null
  then
    raise exception using errcode = '55000',
      message = 'Cannot apply B4-F05: final B4 timetable policy functions are missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.timetable_entries'::regclass
      and t.tgname = 'trg_timetable_entries_validate_consistency'
      and not t.tgisinternal and t.tgenabled <> 'D'
  ) or not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.timetable_entries'::regclass
      and t.tgname = 'trg_timetable_entries_history_lifecycle'
      and not t.tgisinternal and t.tgenabled <> 'D'
  ) then
    raise exception using errcode = '55000',
      message = 'Cannot apply B4-F05: timetable policy triggers are missing or disabled';
  end if;
end
$f05_policy$;

comment on function public.validate_timetable_consistency() is
  'B4-F05 final policy: existing published history may remain attached to an Assignment that later becomes inactive or archived; new publication and material rewrite require an active Assignment.';

comment on function public.validate_timetable_history_lifecycle() is
  'B4-F05 final policy: published history is preserved, inactive is terminal, hard delete is blocked, and only explicitly permitted non-material lifecycle operations may touch grandfathered history.';

comment on function public.replace_timetable_entry(uuid,uuid,uuid,bigint,date,uuid,uuid,uuid,smallint,text,boolean,date,boolean) is
  'B4-F05 final policy: caller-scoped atomic successor replacement preserves the predecessor, enforces row_version, and never silently reassigns history.';
