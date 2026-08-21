-- B4-F01-CA01 — Narrow inherited default privileges on timetable_periods.
-- This correction is intentionally table-specific. Public-schema default
-- privileges remain unchanged for the dedicated B4-F06 hardening phase.

do $$
begin
  if to_regclass('public.timetable_periods') is null then
    raise exception
      'Cannot apply B4-F01 grant correction: public.timetable_periods does not exist';
  end if;
end
$$;

revoke all privileges
on table public.timetable_periods
from public;

revoke all privileges
on table public.timetable_periods
from anon;

revoke all privileges
on table public.timetable_periods
from authenticated;

grant select, insert, update
on table public.timetable_periods
to authenticated;
