create or replace function public.validate_calendar_within_year()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year_start date;
  v_year_end date;
begin
  select ay.starts_on, ay.ends_on
  into v_year_start, v_year_end
  from public.academic_years as ay
  where ay.id = new.academic_year_id;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Academic year not found for calendar event';
  end if;

  if new.starts_on is not null
     and (
       new.starts_on < v_year_start
       or coalesce(new.ends_on, new.starts_on) > v_year_end
     )
  then
    raise exception using
      errcode = '23514',
      message = format(
        'Calendar event dates must fall inside academic year %s to %s',
        v_year_start,
        v_year_end
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_calendar_validate_year on public.academic_calendar_events;

create trigger trg_calendar_validate_year
before insert or update of academic_year_id, starts_on, ends_on
on public.academic_calendar_events
for each row
execute function public.validate_calendar_within_year();

create or replace function public.validate_academic_year_calendar_bounds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.academic_calendar_events as e
    where e.academic_year_id = new.id
      and e.starts_on is not null
      and (
        e.starts_on < new.starts_on
        or coalesce(e.ends_on, e.starts_on) > new.ends_on
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Academic year dates cannot exclude existing calendar events';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_academic_year_validate_calendar_bounds on public.academic_years;

create trigger trg_academic_year_validate_calendar_bounds
before update of starts_on, ends_on
on public.academic_years
for each row
when (
  old.starts_on is distinct from new.starts_on
  or old.ends_on is distinct from new.ends_on
)
execute function public.validate_academic_year_calendar_bounds();