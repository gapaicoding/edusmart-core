-- EduSmart Core V1 / B4-SCH-LIVE-01
-- Normalize the exposed status-only archive action into the established
-- business-date withdrawal representation without weakening history guards.

create or replace function public.validate_timetable_history_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_school_timezone text;
  v_business_today date;
  v_old_semantic_end date;
  v_room_only boolean;
  v_identity_same boolean;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception using errcode = '23514',
        message = 'Published or inactive TimetableEntry history cannot be deleted';
    end if;
    return old;
  end if;

  if old.status = 'inactive' then
    raise exception using errcode = '23514',
      message = 'Inactive TimetableEntry history cannot be updated';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception using errcode = '23514',
      message = 'TimetableEntry created_at is immutable';
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  if old.status <> 'published' then
    raise exception using errcode = '23514',
      message = 'TimetableEntry lifecycle state is not replaceable';
  end if;

  if new.status = 'draft' then
    raise exception using errcode = '23514',
      message = 'Published TimetableEntry cannot return to draft';
  end if;

  v_room_only :=
    (old.organization_id,old.school_id,old.academic_year_id,old.term_id,
     old.teaching_assignment_id,old.timetable_period_id,old.weekday,
     old.start_time,old.end_time,old.effective_from,old.effective_to,
     old.status,old.created_at)
    is not distinct from
    (new.organization_id,new.school_id,new.academic_year_id,new.term_id,
     new.teaching_assignment_id,new.timetable_period_id,new.weekday,
     new.start_time,new.end_time,new.effective_from,new.effective_to,
     new.status,new.created_at);

  if new.status = 'published' and v_room_only then
    return new;
  end if;

  select s.timezone
    into v_school_timezone
  from public.schools s
  where s.id = old.school_id
    and s.organization_id = old.organization_id
  for share;

  if not found or not exists (
    select 1 from pg_catalog.pg_timezone_names z
    where z.name = v_school_timezone
  ) then
    raise exception using errcode = '23514',
      message = 'TimetableEntry School timezone is invalid';
  end if;

  v_business_today :=
    (pg_catalog.transaction_timestamp() at time zone v_school_timezone)::date;

  select coalesce(old.effective_to, t.ends_on, ay.ends_on)
    into v_old_semantic_end
  from public.academic_years ay
  left join public.terms t
    on t.id = old.term_id
   and t.organization_id = old.organization_id
   and t.school_id = old.school_id
  where ay.id = old.academic_year_id
    and ay.organization_id = old.organization_id
    and ay.school_id = old.school_id;

  if not found or v_old_semantic_end is null then
    raise exception using errcode = '23514',
      message = 'TimetableEntry semantic effective end cannot be resolved';
  end if;

  v_identity_same :=
    (old.organization_id,old.school_id,old.academic_year_id,old.term_id,
     old.teaching_assignment_id,old.timetable_period_id,old.weekday,
     old.start_time,old.end_time,old.room_label,old.effective_from,
     old.created_at)
    is not distinct from
    (new.organization_id,new.school_id,new.academic_year_id,new.term_id,
     new.teaching_assignment_id,new.timetable_period_id,new.weekday,
     new.start_time,new.end_time,new.room_label,new.effective_from,
     new.created_at);

  if new.status = 'published' then
    if v_identity_same
       and new.effective_to is not null
       and new.effective_to is distinct from old.effective_to
       and new.effective_to < v_old_semantic_end
       and new.effective_to >= old.effective_from
       and new.effective_to >= (v_business_today - 1)
    then
      return new;
    end if;

    raise exception using errcode = '23514',
      message = 'Published TimetableEntry material history cannot be rewritten';
  end if;

  if new.status = 'inactive' then
    if not v_identity_same then
      raise exception using errcode = '23514',
        message = 'TimetableEntry withdrawal cannot change material identity';
    end if;

    if v_old_semantic_end < v_business_today then
      raise exception using errcode = '23514',
        message = 'Ended published TimetableEntry must remain published history';
    end if;

    if old.effective_from < v_business_today then
      -- The normal Schedule action changes only status. Derive the required
      -- historical end date here from the authoritative school business date.
      if new.effective_to is not distinct from old.effective_to then
        new.effective_to := v_business_today - 1;
      elsif new.effective_to is distinct from (v_business_today - 1) then
        raise exception using errcode = '23514',
          message = 'Current TimetableEntry withdrawal must close at the prior business day';
      end if;
    elsif new.effective_to is distinct from old.effective_to then
      raise exception using errcode = '23514',
        message = 'Never-effective TimetableEntry withdrawal must preserve its dates';
    end if;

    return new;
  end if;

  raise exception using errcode = '23514',
    message = 'TimetableEntry lifecycle transition is forbidden';
end
$$;

revoke all on function public.validate_timetable_history_lifecycle() from public;
revoke all on function public.validate_timetable_history_lifecycle() from anon;
revoke all on function public.validate_timetable_history_lifecycle() from authenticated;
grant execute on function public.validate_timetable_history_lifecycle() to service_role;

comment on function public.validate_timetable_history_lifecycle() is
  'B4-F05 final policy: published history is preserved, inactive is terminal, hard delete is blocked, and B4-SCH-LIVE-01 status-only archival derives the prior school business day.';

do $archive_contract$
declare
  lifecycle text := pg_catalog.pg_get_functiondef(
    'public.validate_timetable_history_lifecycle()'::regprocedure
  );
begin
  if lifecycle not like '%new.effective_to := v_business_today - 1%'
     or lifecycle not like '%Inactive TimetableEntry history cannot be updated%'
     or lifecycle not like '%Published or inactive TimetableEntry history cannot be deleted%'
     or lifecycle not like '%Published TimetableEntry cannot return to draft%'
     or lifecycle not like '%TimetableEntry withdrawal cannot change material identity%'
     or lifecycle not like '%Ended published TimetableEntry must remain published history%'
  then
    raise exception using errcode = '55000',
      message = 'B4-SCH-LIVE-01 lifecycle contract was not installed';
  end if;
end
$archive_contract$;
