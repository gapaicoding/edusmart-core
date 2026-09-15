-- EduSmart Core V1 / Batch 11 Phase 1 — Attendance completion foundation.
-- Forward only. Preserves the B5 lifecycle and the B7/B9 portal RPC contracts.
-- DEPLOYMENT COUPLING: this migration revokes legacy authenticated table writes.
-- THIS MIGRATION MUST NOT BE APPLIED WHILE THE LEGACY DIRECT-WRITE ATTENDANCE SERVER IS ACTIVE.
-- Apply it only in the coordinated Phase-2 maintenance cutover.

begin;

-- Abort rather than silently skipping malformed legacy attendance.
do $preflight$
begin
  if exists (
    select 1 from public.student_attendance_records r
    left join public.attendance_sessions s
      on s.id = r.attendance_session_id
     and s.organization_id = r.organization_id and s.school_id = r.school_id
    left join public.student_enrollments e
      on e.id = r.student_enrollment_id
     and e.organization_id = r.organization_id and e.school_id = r.school_id
    left join public.students st
      on st.id = e.student_id and st.organization_id = e.organization_id
    where s.id is null or e.id is null or st.id is null
  ) then
    raise exception using errcode = '23514',
      message = 'B11_ATTENDANCE_LEGACY_INTEGRITY: orphan or cross-tenant attendance record';
  end if;
  if exists (
    select 1
    from public.student_attendance_records r
    join public.attendance_sessions s
      on s.id = r.attendance_session_id
     and s.organization_id = r.organization_id
     and s.school_id = r.school_id
    join public.student_enrollments e
      on e.id = r.student_enrollment_id
     and e.organization_id = r.organization_id
     and e.school_id = r.school_id
    where e.academic_year_id <> s.academic_year_id
  ) then
    raise exception using errcode = '23514',
      message = 'B11_ATTENDANCE_LEGACY_INTEGRITY: attendance enrollment academic year does not match session';
  end if;
  if exists (
    select 1
    from public.student_attendance_records r
    join public.attendance_sessions s on s.id = r.attendance_session_id
    join public.student_enrollments e on e.id = r.student_enrollment_id
    where e.enrolled_on > s.session_date
       or (e.ended_on is not null and e.ended_on < s.session_date)
  ) then
    raise exception using errcode = '23514',
      message = 'B11_ATTENDANCE_LEGACY_INTEGRITY: attendance enrollment was not effective on session date';
  end if;
  if exists (
    select 1
    from public.student_attendance_records r
    join public.attendance_sessions s on s.id = r.attendance_session_id
    where 1 <> (
      select count(*)
      from public.class_enrollments ce
      where ce.student_enrollment_id = r.student_enrollment_id
        and ce.organization_id = r.organization_id
        and ce.school_id = r.school_id
        and ce.classroom_id = s.classroom_id
        and ce.is_primary
        and ce.starts_on <= s.session_date
        and (ce.ends_on is null or ce.ends_on >= s.session_date)
    )
  ) then
    raise exception using errcode = '23514',
      message = 'B11_ATTENDANCE_LEGACY_INTEGRITY: attendance record requires exactly one historical primary classroom placement';
  end if;
  if exists (
    select attendance_session_id, student_enrollment_id
    from public.student_attendance_records
    group by attendance_session_id, student_enrollment_id having count(*) > 1
  ) then
    raise exception using errcode = '23514',
      message = 'B11_ATTENDANCE_LEGACY_INTEGRITY: duplicate logical attendance record';
  end if;
end
$preflight$;

alter table public.student_enrollments
  add constraint student_enrollments_id_student_org_school_key
  unique (id, student_id, organization_id, school_id);

create table public.attendance_session_roster_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  attendance_session_id uuid not null,
  student_enrollment_id uuid not null,
  student_id uuid not null,
  snapshot_source text not null check (snapshot_source in (
    'created_at_session_open', 'backfilled_from_record', 'backfilled_from_dated_roster'
  )),
  snapshotted_at timestamptz not null default pg_catalog.transaction_timestamp(),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  constraint attendance_roster_session_enrollment_key
    unique (attendance_session_id, student_enrollment_id),
  constraint attendance_roster_session_enrollment_tenant_key
    unique (attendance_session_id, student_enrollment_id, organization_id, school_id),
  constraint attendance_roster_session_fk
    foreign key (attendance_session_id, organization_id, school_id)
    references public.attendance_sessions(id, organization_id, school_id) on delete restrict,
  constraint attendance_roster_enrollment_student_fk
    foreign key (student_enrollment_id, student_id, organization_id, school_id)
    references public.student_enrollments(id, student_id, organization_id, school_id)
    on delete restrict,
  constraint attendance_roster_student_fk
    foreign key (student_id, organization_id)
    references public.students(id, organization_id) on delete restrict
);

create index idx_attendance_roster_school_session
  on public.attendance_session_roster_members (school_id, attendance_session_id);
create index idx_attendance_roster_student
  on public.attendance_session_roster_members (student_id, attendance_session_id);

create or replace function public.guard_attendance_roster_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode = '23514',
    message = 'B11_ATTENDANCE_ROSTER_IMMUTABLE: snapshot membership cannot be changed or deleted';
end
$$;

create trigger trg_attendance_roster_immutable
before update or delete on public.attendance_session_roster_members
for each row execute function public.guard_attendance_roster_immutable();

-- Stored records are authoritative preservation evidence after the preflight
-- proves their historical year/date/classroom identity. Dated roster rows add
-- the best reconstructable unmarked historical membership. UNION collapses an
-- enrollment present in both sources and gives record provenance precedence.
-- Current class_enrollments.status is deliberately excluded: it is an
-- operational current-state marker, while starts_on/ends_on are the authority
-- for historical membership on the session date.
with candidates as (
  select r.organization_id, r.school_id, r.attendance_session_id,
         r.student_enrollment_id, e.student_id, 1 as priority
  from public.student_attendance_records r
  join public.student_enrollments e
    on e.id = r.student_enrollment_id
   and e.organization_id = r.organization_id and e.school_id = r.school_id
  union all
  select s.organization_id, s.school_id, s.id, e.id, e.student_id, 2
  from public.attendance_sessions s
  join public.class_enrollments ce
    on ce.organization_id = s.organization_id and ce.school_id = s.school_id
   and ce.classroom_id = s.classroom_id and ce.is_primary
   and ce.starts_on <= s.session_date
   and (ce.ends_on is null or ce.ends_on >= s.session_date)
  join public.student_enrollments e
    on e.id = ce.student_enrollment_id
   and e.organization_id = s.organization_id and e.school_id = s.school_id
   and e.academic_year_id = s.academic_year_id
   and e.enrolled_on <= s.session_date
   and (e.ended_on is null or e.ended_on >= s.session_date)
), chosen as (
  select distinct on (attendance_session_id, student_enrollment_id)
    organization_id, school_id, attendance_session_id, student_enrollment_id,
    student_id, priority
  from candidates
  order by attendance_session_id, student_enrollment_id, priority
)
insert into public.attendance_session_roster_members (
  organization_id, school_id, attendance_session_id, student_enrollment_id,
  student_id, snapshot_source, created_by_profile_id
)
select organization_id, school_id, attendance_session_id, student_enrollment_id,
       student_id,
       case priority when 1 then 'backfilled_from_record'
                     else 'backfilled_from_dated_roster' end,
       null
from chosen;

do $post_backfill$
begin
  if exists (
    select 1 from public.student_attendance_records r
    left join public.attendance_session_roster_members m
      on m.attendance_session_id = r.attendance_session_id
     and m.student_enrollment_id = r.student_enrollment_id
     and m.organization_id = r.organization_id and m.school_id = r.school_id
    where m.id is null
  ) then
    raise exception using errcode = '23514',
      message = 'B11_ATTENDANCE_BACKFILL: stored attendance record was not preserved';
  end if;
  if exists (
    select 1
    from public.attendance_session_roster_members m
    join public.attendance_sessions s on s.id=m.attendance_session_id
    join public.student_enrollments e on e.id=m.student_enrollment_id
    where m.organization_id<>s.organization_id or m.school_id<>s.school_id
       or e.student_id<>m.student_id
       or e.organization_id<>m.organization_id or e.school_id<>m.school_id
  ) then
    raise exception using errcode = '23514',
      message = 'B11_ATTENDANCE_BACKFILL: snapshot tenant or student enrollment mismatch';
  end if;
  if exists (
    select attendance_session_id,student_enrollment_id
    from public.attendance_session_roster_members
    group by attendance_session_id,student_enrollment_id having count(*)<>1
  ) then
    raise exception using errcode = '23514',
      message = 'B11_ATTENDANCE_BACKFILL: duplicate logical roster membership';
  end if;
end
$post_backfill$;

alter table public.student_attendance_records
  add constraint student_attendance_roster_member_fk
  foreign key (attendance_session_id, student_enrollment_id, organization_id, school_id)
  references public.attendance_session_roster_members
    (attendance_session_id, student_enrollment_id, organization_id, school_id)
  on delete restrict;

-- Defense in depth: even an owner-mediated update cannot submit a partial or
-- empty snapshot. This replaces B5 only through this new forward migration.
create or replace function public.guard_attendance_session_transition()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_roster bigint; v_records bigint;
begin
  if old.status is not distinct from new.status then
    if (old.submitted_at,old.submitted_by_profile_id,old.locked_at) is distinct from
       (new.submitted_at,new.submitted_by_profile_id,new.locked_at)
    then raise exception using errcode='23514',message='AttendanceSession lifecycle metadata is immutable'; end if;
    return new;
  end if;
  if auth.uid() is null then return new; end if;
  if old.status = 'open' and new.status = 'submitted' then
    if not public.has_staff_scope_permission('attendance.submit',old.organization_id,old.school_id,old.classroom_id)
      then raise exception using errcode='42501',message='Missing attendance.submit permission'; end if;
    select count(*) into v_roster from public.attendance_session_roster_members m where m.attendance_session_id=old.id;
    select count(*) into v_records from public.student_attendance_records r where r.attendance_session_id=old.id;
    if v_roster=0 then raise exception using errcode='23514',message='B11_ATTENDANCE_EMPTY_ROSTER'; end if;
    if v_records<>v_roster then raise exception using errcode='23514',message='B11_ATTENDANCE_ROSTER_INCOMPLETE'; end if;
    new.submitted_by_profile_id:=auth.uid();
    new.submitted_at:=pg_catalog.transaction_timestamp();
    new.locked_at:=old.locked_at;
    return new;
  end if;
  if old.status = 'submitted' and new.status = 'locked' then
    if not public.has_staff_scope_permission('attendance.lock',old.organization_id,old.school_id,old.classroom_id)
      then raise exception using errcode='42501',message='Missing attendance.lock permission'; end if;
    new.submitted_by_profile_id:=old.submitted_by_profile_id;
    new.submitted_at:=old.submitted_at;
    new.locked_at:=pg_catalog.transaction_timestamp();
    return new;
  end if;
  raise exception using errcode='23514',message='AttendanceSession lifecycle transition is forbidden';
end
$$;

create table public.attendance_command_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  request_id uuid not null,
  command_kind text not null check (command_kind in ('open','save_draft','submit','lock','correct')),
  target_id uuid,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_fingerprint text not null,
  result jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  retained_until timestamptz not null default (pg_catalog.transaction_timestamp() + interval '30 days'),
  constraint attendance_command_actor_request_key unique (actor_profile_id, request_id),
  constraint attendance_command_fingerprint_sha256_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint attendance_command_retention_check check (retained_until > created_at),
  constraint attendance_command_school_fk foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint attendance_command_result_shape check (
    result is null or (jsonb_typeof(result) = 'object' and not (result ?| array['note','student_name','payload']))
  )
);
create index idx_attendance_command_target
  on public.attendance_command_requests (organization_id, school_id, target_id, created_at desc);

create or replace function public.guard_attendance_command_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '23514', message = 'B11_ATTENDANCE_COMMAND_IMMUTABLE';
  end if;
  if old.organization_id is distinct from new.organization_id
     or old.school_id is distinct from new.school_id
     or old.request_id is distinct from new.request_id
     or old.command_kind is distinct from new.command_kind
     or old.target_id is distinct from new.target_id
     or old.actor_profile_id is distinct from new.actor_profile_id
     or old.request_fingerprint is distinct from new.request_fingerprint
     or old.created_at is distinct from new.created_at
     or old.retained_until is distinct from new.retained_until
     or old.completed_at is not null
  then
    raise exception using errcode = '23514', message = 'B11_ATTENDANCE_COMMAND_IMMUTABLE';
  end if;
  return new;
end
$$;
create trigger trg_attendance_command_immutable
before update or delete on public.attendance_command_requests
for each row execute function public.guard_attendance_command_immutable();

alter table public.attendance_session_roster_members enable row level security;
alter table public.attendance_command_requests enable row level security;

create policy attendance_roster_select on public.attendance_session_roster_members
for select to authenticated using (exists (
  select 1 from public.attendance_sessions s
  where s.id = attendance_session_roster_members.attendance_session_id
    and s.organization_id = attendance_session_roster_members.organization_id
    and s.school_id = attendance_session_roster_members.school_id
    and public.has_staff_scope_permission('attendance.read', s.organization_id, s.school_id, s.classroom_id)
));

revoke all on table public.attendance_session_roster_members from public, anon, authenticated, service_role;
grant select on table public.attendance_session_roster_members to authenticated;
revoke all on table public.attendance_command_requests from public, anon, authenticated, service_role;

-- Helpers are not API-executable.
create or replace function public.b11_attendance_fingerprint(p_payload jsonb)
returns text language sql immutable security definer set search_path = '' as $$
  select pg_catalog.encode(extensions.digest(p_payload::text, 'sha256'), 'hex')
$$;

create or replace function public.b11_attendance_request_begin(
  p_organization_id uuid, p_school_id uuid, p_request_id uuid,
  p_command_kind text, p_target_id uuid, p_fingerprint text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_row public.attendance_command_requests%rowtype;
begin
  if v_actor is null then raise exception using errcode='42501', message='B11_ATTENDANCE_AUTH_REQUIRED'; end if;
  insert into public.attendance_command_requests
    (organization_id,school_id,request_id,command_kind,target_id,actor_profile_id,request_fingerprint)
  values (p_organization_id,p_school_id,p_request_id,p_command_kind,p_target_id,v_actor,p_fingerprint)
  on conflict (actor_profile_id,request_id) do nothing;
  select * into v_row from public.attendance_command_requests
    where actor_profile_id=v_actor and request_id=p_request_id for update;
  if v_row.organization_id <> p_organization_id or v_row.school_id <> p_school_id
     or v_row.command_kind <> p_command_kind
     or v_row.target_id is distinct from p_target_id
     or v_row.request_fingerprint <> p_fingerprint
  then raise exception using errcode='23514', message='B11_ATTENDANCE_IDEMPOTENCY_CONFLICT'; end if;
  return v_row.result;
end
$$;

create or replace function public.b11_attendance_request_finish(
  p_request_id uuid, p_result jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.attendance_command_requests
     set result=p_result, completed_at=pg_catalog.transaction_timestamp()
   where actor_profile_id=auth.uid() and request_id=p_request_id and completed_at is null;
  if not found then raise exception using errcode='23514', message='B11_ATTENDANCE_IDEMPOTENCY_FINALIZE_FAILED'; end if;
end
$$;

create or replace function public.attendance_school_timezone(p_school_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_timezone text; v_org uuid;
begin
  select s.timezone,s.organization_id into v_timezone,v_org from public.schools s where s.id=p_school_id;
  if not found then raise exception using errcode='42501', message='B11_ATTENDANCE_SCHOOL_UNAVAILABLE'; end if;
  if auth.uid() is not null and not exists (
    select 1 from public.classrooms c where c.organization_id=v_org and c.school_id=p_school_id
      and public.has_staff_scope_permission('attendance.read',v_org,p_school_id,c.id)
  ) then
    raise exception using errcode='42501', message='B11_ATTENDANCE_SCOPE_DENIED';
  end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then
    raise exception using errcode='22023', message='B11_ATTENDANCE_INVALID_SCHOOL_TIMEZONE';
  end if;
  return v_timezone;
end
$$;

create or replace function public.open_attendance_session(
  p_request_id uuid, p_session_date date, p_timetable_entry_id uuid default null,
  p_classroom_id uuid default null, p_term_id uuid default null,
  p_teaching_assignment_id uuid default null, p_starts_at timestamptz default null,
  p_ends_at timestamptz default null, p_manual_reason text default null,
  p_acknowledge_non_instructional boolean default false,
  p_acknowledge_collision boolean default false
) returns table(session_id uuid, session_status text, roster_count bigint,
                school_timezone text, calendar_warning boolean, collision_warning boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid:=auth.uid(); v_org uuid; v_school uuid; v_year uuid; v_term uuid;
  v_class uuid; v_assignment uuid; v_start timestamptz; v_end timestamptz;
  v_timezone text; v_calendar boolean; v_collision boolean; v_session public.attendance_sessions%rowtype;
  v_existing jsonb; v_fingerprint text;
begin
  if v_actor is null then raise exception using errcode='42501',message='B11_ATTENDANCE_AUTH_REQUIRED'; end if;
  if (p_timetable_entry_id is null) = (p_classroom_id is null) then
    raise exception using errcode='22023',message='B11_ATTENDANCE_ORIGIN_INVALID';
  end if;
  if p_timetable_entry_id is not null then
    select te.organization_id,te.school_id,te.academic_year_id,te.term_id,ta.classroom_id,
           te.teaching_assignment_id,
           (p_session_date + te.start_time) at time zone s.timezone,
           (p_session_date + te.end_time) at time zone s.timezone,
           s.timezone
      into v_org,v_school,v_year,v_term,v_class,v_assignment,v_start,v_end,v_timezone
      from public.timetable_entries te
      join public.teaching_assignments ta on ta.id=te.teaching_assignment_id
       and ta.organization_id=te.organization_id and ta.school_id=te.school_id
      join public.schools s on s.id=te.school_id and s.organization_id=te.organization_id
     where te.id=p_timetable_entry_id and te.status='published'
       and te.weekday=extract(isodow from p_session_date)::smallint
       and te.effective_from<=p_session_date and (te.effective_to is null or te.effective_to>=p_session_date);
  else
    select c.organization_id,c.school_id,c.academic_year_id,p_term_id,c.id,
           p_teaching_assignment_id,p_starts_at,p_ends_at,s.timezone
      into v_org,v_school,v_year,v_term,v_class,v_assignment,v_start,v_end,v_timezone
      from public.classrooms c join public.schools s on s.id=c.school_id and s.organization_id=c.organization_id
     where c.id=p_classroom_id;
    if nullif(btrim(p_manual_reason),'') is null or length(btrim(p_manual_reason))<3 then
      raise exception using errcode='22023',message='B11_ATTENDANCE_MANUAL_REASON_REQUIRED';
    end if;
  end if;
  if v_school is null then raise exception using errcode='42501',message='B11_ATTENDANCE_CONTEXT_UNAVAILABLE'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then
    raise exception using errcode='22023',message='B11_ATTENDANCE_INVALID_SCHOOL_TIMEZONE';
  end if;
  if not public.has_staff_scope_permission('attendance.session.create',v_org,v_school,v_class) then
    raise exception using errcode='42501',message='B11_ATTENDANCE_SCOPE_DENIED';
  end if;
  if not exists(select 1 from public.academic_years y where y.id=v_year and y.organization_id=v_org
       and y.school_id=v_school and p_session_date between y.starts_on and y.ends_on)
     or not exists(select 1 from public.terms t where t.id=v_term and t.organization_id=v_org
       and t.school_id=v_school and t.academic_year_id=v_year and p_session_date between t.starts_on and t.ends_on)
  then raise exception using errcode='22023',message='B11_ATTENDANCE_ACADEMIC_DATE_OUT_OF_BOUNDS'; end if;
  -- Canonical jsonb text plus SHA-256 gives stable semantic request equality.
  -- Claim/replay precedes mutable advisory calendar/collision evaluation, but
  -- only after actor, scope and authoritative context have been re-derived.
  v_fingerprint:=public.b11_attendance_fingerprint(jsonb_build_object(
    'command','open','organization_id',v_org,'school_id',v_school,'academic_year_id',v_year,
    'term_id',v_term,'classroom_id',v_class,'session_date',p_session_date,
    'timetable_entry_id',p_timetable_entry_id,'teaching_assignment_id',v_assignment,
    'starts_at',v_start,'ends_at',v_end,
    'manual_reason',case when p_timetable_entry_id is null then btrim(p_manual_reason) end,
    'acknowledge_calendar',p_acknowledge_non_instructional,
    'acknowledge_collision',p_acknowledge_collision));
  v_existing:=public.b11_attendance_request_begin(v_org,v_school,p_request_id,'open',null,v_fingerprint);
  if v_existing is not null then
    return query select (v_existing->>'session_id')::uuid,v_existing->>'status',
      (v_existing->>'roster_count')::bigint,v_existing->>'school_timezone',
      (v_existing->>'calendar_warning')::boolean,(v_existing->>'collision_warning')::boolean; return;
  end if;
  -- Neutral advisory: affects_instruction does not imply a full holiday.
  -- Date-only events overlap the local date; timed events overlap either the
  -- explicit session interval or, when no time exists, the whole local day.
  v_calendar := exists(select 1 from public.academic_calendar_events e where e.organization_id=v_org
    and e.school_id=v_school and e.academic_year_id=v_year and e.affects_instruction
    and ((e.starts_on is not null and p_session_date between e.starts_on and coalesce(e.ends_on,e.starts_on))
      or (e.starts_at is not null and tstzrange(
          e.starts_at,coalesce(e.ends_at,e.starts_at),case when e.ends_at is null then '[]' else '[)' end
        ) && tstzrange(
          coalesce(v_start,p_session_date::timestamp at time zone v_timezone),
          coalesce(v_end,(p_session_date+1)::timestamp at time zone v_timezone),'[)'))));
  v_collision := p_timetable_entry_id is null and exists(select 1 from public.attendance_sessions s
    where s.organization_id=v_org and s.school_id=v_school and s.classroom_id=v_class and s.session_date=p_session_date
      and not (s.timetable_entry_id is null and
        coalesce(s.teaching_assignment_id,'00000000-0000-0000-0000-000000000000') =
        coalesce(v_assignment,'00000000-0000-0000-0000-000000000000')));
  if v_calendar and not p_acknowledge_non_instructional then
    raise exception using errcode='P0001',message='B11_ATTENDANCE_CALENDAR_IMPACT_ACK_REQUIRED';
  end if;
  if v_collision and not p_acknowledge_collision then
    raise exception using errcode='P0001',message='B11_ATTENDANCE_COLLISION_ACK_REQUIRED';
  end if;
  select * into v_session from public.attendance_sessions s where s.classroom_id=v_class
    and s.session_date=p_session_date
    and coalesce(s.teaching_assignment_id,'00000000-0000-0000-0000-000000000000')=coalesce(v_assignment,'00000000-0000-0000-0000-000000000000')
     and coalesce(s.timetable_entry_id,'00000000-0000-0000-0000-000000000000')=coalesce(p_timetable_entry_id,'00000000-0000-0000-0000-000000000000')
     for update;
  if found and (v_session.organization_id<>v_org or v_session.school_id<>v_school
     or v_session.academic_year_id<>v_year or v_session.term_id<>v_term
     or v_session.classroom_id<>v_class
     or v_session.timetable_entry_id is distinct from p_timetable_entry_id
     or v_session.teaching_assignment_id is distinct from v_assignment
     or v_session.session_date<>p_session_date
     or v_session.starts_at is distinct from v_start or v_session.ends_at is distinct from v_end
     or (p_timetable_entry_id is null and v_session.manual_reason is distinct from btrim(p_manual_reason)))
  then raise exception using errcode='23514',message='B11_ATTENDANCE_LOGICAL_SESSION_CONFLICT'; end if;
  if not found then
    insert into public.attendance_sessions(organization_id,school_id,academic_year_id,term_id,
      timetable_entry_id,teaching_assignment_id,classroom_id,session_date,starts_at,ends_at,manual_reason,status)
    values(v_org,v_school,v_year,v_term,p_timetable_entry_id,v_assignment,v_class,p_session_date,
      v_start,v_end,case when p_timetable_entry_id is null then btrim(p_manual_reason) end,'open') returning * into v_session;
  end if;
  insert into public.attendance_session_roster_members(organization_id,school_id,attendance_session_id,
    student_enrollment_id,student_id,snapshot_source,created_by_profile_id)
  select v_org,v_school,v_session.id,e.id,e.student_id,'created_at_session_open',v_actor
    from public.class_enrollments ce join public.student_enrollments e
      on e.id=ce.student_enrollment_id and e.organization_id=v_org and e.school_id=v_school
   where ce.organization_id=v_org and ce.school_id=v_school and ce.classroom_id=v_class
     and ce.is_primary and ce.starts_on<=p_session_date
     and (ce.ends_on is null or ce.ends_on>=p_session_date)
     and e.academic_year_id=v_year and e.enrolled_on<=p_session_date
     and (e.ended_on is null or e.ended_on>=p_session_date)
  on conflict (attendance_session_id,student_enrollment_id) do nothing;
  select count(*) into roster_count from public.attendance_session_roster_members m where m.attendance_session_id=v_session.id;
  if roster_count=0 then raise exception using errcode='23514',message='B11_ATTENDANCE_EMPTY_ROSTER'; end if;
  session_id:=v_session.id; session_status:=v_session.status; school_timezone:=v_timezone;
  calendar_warning:=v_calendar; collision_warning:=v_collision;
  perform public.b11_attendance_request_finish(p_request_id,jsonb_build_object('session_id',session_id,
    'status',session_status,'roster_count',roster_count,'school_timezone',school_timezone,
    'calendar_warning',calendar_warning,'collision_warning',collision_warning));
  return next;
end
$$;

create or replace function public.save_attendance_draft(
  p_session_id uuid, p_expected_session_updated_at timestamptz,
  p_request_id uuid, p_records jsonb
) returns table(session_id uuid, saved_count integer)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_s public.attendance_sessions%rowtype; v_item jsonb;
  v_existing jsonb; v_fp text; v_count int:=0; v_record public.student_attendance_records%rowtype;
begin
  if v_actor is null then raise exception using errcode='42501',message='B11_ATTENDANCE_AUTH_REQUIRED'; end if;
  select * into v_s from public.attendance_sessions where id=p_session_id for update;
  if not found or not public.has_staff_scope_permission('attendance.record',v_s.organization_id,v_s.school_id,v_s.classroom_id)
    then raise exception using errcode='42501',message='B11_ATTENDANCE_SCOPE_DENIED'; end if;
  v_fp:=public.b11_attendance_fingerprint(jsonb_build_object(
    'command','save_draft','session_id',p_session_id,
    'expected_session_updated_at',p_expected_session_updated_at,'records',p_records));
  v_existing:=public.b11_attendance_request_begin(v_s.organization_id,v_s.school_id,p_request_id,'save_draft',p_session_id,v_fp);
  if v_existing is not null then return query select p_session_id,(v_existing->>'saved_count')::int; return; end if;
  if v_s.status<>'open' then raise exception using errcode='23514',message='B11_ATTENDANCE_SESSION_NOT_OPEN'; end if;
  if v_s.updated_at<>p_expected_session_updated_at then raise exception using errcode='40001',message='B11_ATTENDANCE_STALE_SESSION'; end if;
  if jsonb_typeof(p_records)<>'array' then raise exception using errcode='22023',message='B11_ATTENDANCE_RECORDS_ARRAY_REQUIRED'; end if;
  if exists(select 1 from jsonb_array_elements(p_records) x group by x->>'student_enrollment_id' having count(*)>1)
    then raise exception using errcode='22023',message='B11_ATTENDANCE_DUPLICATE_DRAFT_MEMBER'; end if;
  for v_item in select value from jsonb_array_elements(p_records) loop
    if coalesce(v_item->>'status','') not in ('present','late','excused','sick','absent','other')
      then raise exception using errcode='22023',message='B11_ATTENDANCE_STATUS_INVALID'; end if;
    if length(coalesce(v_item->>'note',''))>500
      then raise exception using errcode='22023',message='B11_ATTENDANCE_NOTE_TOO_LONG'; end if;
    if not exists(select 1 from public.attendance_session_roster_members m where m.attendance_session_id=p_session_id
      and m.student_enrollment_id=(v_item->>'student_enrollment_id')::uuid and m.organization_id=v_s.organization_id and m.school_id=v_s.school_id)
      then raise exception using errcode='23514',message='B11_ATTENDANCE_OUTSIDER_RECORD'; end if;
    select * into v_record from public.student_attendance_records r where r.attendance_session_id=p_session_id
      and r.student_enrollment_id=(v_item->>'student_enrollment_id')::uuid for update;
    if found then
      if nullif(v_item->>'expected_updated_at','') is null or v_record.updated_at<>(v_item->>'expected_updated_at')::timestamptz
        then raise exception using errcode='40001',message='B11_ATTENDANCE_STALE_RECORD'; end if;
      update public.student_attendance_records set status=v_item->>'status', note=nullif(v_item->>'note',''), correction_reason=null
       where id=v_record.id;
    else
      insert into public.student_attendance_records(organization_id,school_id,attendance_session_id,
        student_enrollment_id,status,note,correction_reason)
      values(v_s.organization_id,v_s.school_id,p_session_id,(v_item->>'student_enrollment_id')::uuid,
        v_item->>'status',nullif(v_item->>'note',''),null);
    end if;
    v_count:=v_count+1;
  end loop;
  perform public.b11_attendance_request_finish(p_request_id,jsonb_build_object('session_id',p_session_id,'saved_count',v_count));
  return query select p_session_id,v_count;
end
$$;

create or replace function public.submit_attendance_session(
  p_session_id uuid, p_expected_updated_at timestamptz, p_request_id uuid
) returns table(session_id uuid, session_status text, submitted_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_s public.attendance_sessions%rowtype; v_existing jsonb; v_fp text; v_roster bigint; v_records bigint; v_outsiders bigint;
begin
  select * into v_s from public.attendance_sessions where id=p_session_id for update;
  if not found or auth.uid() is null or not public.has_staff_scope_permission('attendance.submit',v_s.organization_id,v_s.school_id,v_s.classroom_id)
    then raise exception using errcode='42501',message='B11_ATTENDANCE_SCOPE_DENIED'; end if;
  v_fp:=public.b11_attendance_fingerprint(jsonb_build_object(
    'command','submit','session_id',p_session_id,'expected_updated_at',p_expected_updated_at));
  v_existing:=public.b11_attendance_request_begin(v_s.organization_id,v_s.school_id,p_request_id,'submit',p_session_id,v_fp);
  if v_existing is not null then return query select p_session_id,v_existing->>'status',(v_existing->>'submitted_at')::timestamptz; return; end if;
  if v_s.status<>'open' then raise exception using errcode='23514',message='B11_ATTENDANCE_SESSION_NOT_OPEN'; end if;
  if v_s.updated_at<>p_expected_updated_at then raise exception using errcode='40001',message='B11_ATTENDANCE_STALE_SESSION'; end if;
  select count(*) into v_roster from public.attendance_session_roster_members where attendance_session_id=p_session_id;
  select count(*) into v_records from public.student_attendance_records where attendance_session_id=p_session_id;
  select count(*) into v_outsiders from public.student_attendance_records r where r.attendance_session_id=p_session_id
    and not exists(select 1 from public.attendance_session_roster_members m where m.attendance_session_id=r.attendance_session_id
      and m.student_enrollment_id=r.student_enrollment_id and m.organization_id=r.organization_id and m.school_id=r.school_id);
  if v_roster=0 then raise exception using errcode='23514',message='B11_ATTENDANCE_EMPTY_ROSTER'; end if;
  if v_outsiders<>0 then raise exception using errcode='23514',message='B11_ATTENDANCE_OUTSIDER_RECORD'; end if;
  if v_records<>v_roster then raise exception using errcode='23514',message='B11_ATTENDANCE_ROSTER_INCOMPLETE'; end if;
  update public.attendance_sessions set status='submitted' where id=p_session_id returning * into v_s;
  perform public.b11_attendance_request_finish(p_request_id,jsonb_build_object('session_id',p_session_id,'status',v_s.status,'submitted_at',v_s.submitted_at));
  return query select p_session_id,v_s.status,v_s.submitted_at;
end
$$;

create or replace function public.lock_attendance_session(
  p_session_id uuid, p_expected_updated_at timestamptz, p_request_id uuid
) returns table(session_id uuid, session_status text, locked_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_s public.attendance_sessions%rowtype; v_existing jsonb; v_fp text;
begin
  select * into v_s from public.attendance_sessions where id=p_session_id for update;
  if not found or auth.uid() is null or not public.has_staff_scope_permission('attendance.lock',v_s.organization_id,v_s.school_id,v_s.classroom_id)
    then raise exception using errcode='42501',message='B11_ATTENDANCE_SCOPE_DENIED'; end if;
  v_fp:=public.b11_attendance_fingerprint(jsonb_build_object(
    'command','lock','session_id',p_session_id,'expected_updated_at',p_expected_updated_at));
  v_existing:=public.b11_attendance_request_begin(v_s.organization_id,v_s.school_id,p_request_id,'lock',p_session_id,v_fp);
  if v_existing is not null then return query select p_session_id,v_existing->>'status',(v_existing->>'locked_at')::timestamptz; return; end if;
  if v_s.status<>'submitted' then raise exception using errcode='23514',message='B11_ATTENDANCE_SESSION_NOT_SUBMITTED'; end if;
  if v_s.updated_at<>p_expected_updated_at then raise exception using errcode='40001',message='B11_ATTENDANCE_STALE_SESSION'; end if;
  update public.attendance_sessions set status='locked' where id=p_session_id returning * into v_s;
  perform public.b11_attendance_request_finish(p_request_id,jsonb_build_object('session_id',p_session_id,'status',v_s.status,'locked_at',v_s.locked_at));
  return query select p_session_id,v_s.status,v_s.locked_at;
end
$$;

create or replace function public.correct_attendance_record(
  p_record_id uuid, p_expected_updated_at timestamptz, p_request_id uuid,
  p_status text, p_note text, p_correction_reason text
) returns table(record_id uuid, record_status text, record_updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_r public.student_attendance_records%rowtype; v_s public.attendance_sessions%rowtype;
  v_existing jsonb; v_fp text; v_permission text;
begin
  select * into v_r from public.student_attendance_records where id=p_record_id for update;
  if not found then raise exception using errcode='42501',message='B11_ATTENDANCE_RECORD_UNAVAILABLE'; end if;
  select * into v_s from public.attendance_sessions where id=v_r.attendance_session_id for update;
  v_permission:=case when v_s.status='submitted' then 'attendance.correct_open'
                     when v_s.status in ('locked','corrected') then 'attendance.correct_locked' end;
  if auth.uid() is null or v_permission is null or not public.has_staff_scope_permission(v_permission,v_s.organization_id,v_s.school_id,v_s.classroom_id)
    then raise exception using errcode='42501',message='B11_ATTENDANCE_SCOPE_DENIED'; end if;
  if not exists(select 1 from public.attendance_session_roster_members m where m.attendance_session_id=v_s.id
    and m.student_enrollment_id=v_r.student_enrollment_id and m.organization_id=v_r.organization_id and m.school_id=v_r.school_id)
    then raise exception using errcode='23514',message='B11_ATTENDANCE_OUTSIDER_RECORD'; end if;
  if p_status not in ('present','late','excused','sick','absent','other') then raise exception using errcode='22023',message='B11_ATTENDANCE_STATUS_INVALID'; end if;
  if nullif(btrim(p_correction_reason),'') is null or length(btrim(p_correction_reason))<3 then raise exception using errcode='22023',message='B11_ATTENDANCE_CORRECTION_REASON_REQUIRED'; end if;
  if length(coalesce(p_note,''))>500 then raise exception using errcode='22023',message='B11_ATTENDANCE_NOTE_TOO_LONG'; end if;
  v_fp:=public.b11_attendance_fingerprint(jsonb_build_object(
    'command','correct','record_id',p_record_id,'expected_updated_at',p_expected_updated_at,
    'status',p_status,'note',p_note,'correction_reason',btrim(p_correction_reason)));
  v_existing:=public.b11_attendance_request_begin(v_s.organization_id,v_s.school_id,p_request_id,'correct',p_record_id,v_fp);
  if v_existing is not null then return query select p_record_id,v_existing->>'status',(v_existing->>'updated_at')::timestamptz; return; end if;
  if v_r.updated_at<>p_expected_updated_at then raise exception using errcode='40001',message='B11_ATTENDANCE_STALE_RECORD'; end if;
  if v_r.status=p_status and v_r.note is not distinct from nullif(p_note,'') then raise exception using errcode='22023',message='B11_ATTENDANCE_CORRECTION_NO_CHANGE'; end if;
  update public.student_attendance_records set status=p_status,note=nullif(p_note,''),correction_reason=btrim(p_correction_reason)
   where id=p_record_id returning * into v_r;
  perform public.b11_attendance_request_finish(p_request_id,jsonb_build_object('record_id',p_record_id,'status',v_r.status,'updated_at',v_r.updated_at));
  return query select p_record_id,v_r.status,v_r.updated_at;
end
$$;

create or replace function public.list_attendance_history(
  p_school_id uuid, p_from date, p_to date, p_classroom_id uuid default null,
  p_status text default null, p_student_id uuid default null,
  p_offset integer default 0, p_page_size integer default 50
) returns table(session_id uuid,session_date date,classroom_id uuid,classroom_name text,origin text,
  lifecycle text,roster_count bigint,marked_count bigint,present_count bigint,late_count bigint,
  excused_count bigint,sick_count bigint,absent_count bigint,other_count bigint,
  teaching_assignment_id uuid,timetable_entry_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_from is null or p_to is null or p_to<p_from or p_to-p_from>366
     or p_page_size not between 1 and 100 or p_offset<0
  then raise exception using errcode='22023',message='B11_ATTENDANCE_HISTORY_BOUNDS_INVALID'; end if;
  return query select s.id,s.session_date,s.classroom_id,c.name,
    case when s.timetable_entry_id is null then 'manual' else 'timetable' end,s.status,
    count(distinct m.id),count(distinct r.id),
    count(distinct r.id) filter(where r.status='present'),count(distinct r.id) filter(where r.status='late'),
    count(distinct r.id) filter(where r.status='excused'),count(distinct r.id) filter(where r.status='sick'),
    count(distinct r.id) filter(where r.status='absent'),count(distinct r.id) filter(where r.status='other'),
    s.teaching_assignment_id,s.timetable_entry_id
  from public.attendance_sessions s join public.classrooms c on c.id=s.classroom_id
  left join public.attendance_session_roster_members m on m.attendance_session_id=s.id
  left join public.student_attendance_records r on r.attendance_session_id=s.id
  where s.school_id=p_school_id and s.session_date between p_from and p_to
    and (p_classroom_id is null or s.classroom_id=p_classroom_id)
    and (p_status is null or s.status=p_status)
    and (p_student_id is null or exists(select 1 from public.attendance_session_roster_members sm where sm.attendance_session_id=s.id and sm.student_id=p_student_id))
    and public.has_staff_scope_permission('attendance.read',s.organization_id,s.school_id,s.classroom_id)
  group by s.id,c.name order by s.session_date desc,s.id limit p_page_size offset p_offset;
end
$$;

create or replace function public.list_staff_student_attendance_history(
  p_student_id uuid,p_from date,p_to date,p_offset integer default 0,p_page_size integer default 50
) returns table(record_id uuid,session_id uuid,session_date date,classroom_id uuid,classroom_name text,
  status text,note text,was_corrected boolean,origin text,updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_from is null or p_to is null or p_to<p_from or p_to-p_from>366
     or p_page_size not between 1 and 100 or p_offset<0
  then raise exception using errcode='22023',message='B11_ATTENDANCE_HISTORY_BOUNDS_INVALID'; end if;
  return query select r.id,s.id,s.session_date,s.classroom_id,c.name,r.status,r.note,
    exists(select 1 from public.audit_logs a where a.entity_type='student_attendance_records'
      and a.entity_id=r.id and a.action='update' and a.before_data is distinct from a.after_data),
    case when s.timetable_entry_id is null then 'manual' else 'timetable' end,r.updated_at
  from public.attendance_session_roster_members m
  join public.attendance_sessions s on s.id=m.attendance_session_id and s.organization_id=m.organization_id and s.school_id=m.school_id
  join public.classrooms c on c.id=s.classroom_id
  join public.student_attendance_records r on r.attendance_session_id=m.attendance_session_id and r.student_enrollment_id=m.student_enrollment_id
  where m.student_id=p_student_id and s.session_date between p_from and p_to
    and public.has_staff_scope_permission('attendance.read',s.organization_id,s.school_id,s.classroom_id)
  order by s.session_date desc,r.id limit p_page_size offset p_offset;
end
$$;

create or replace function public.list_attendance_corrections(
  p_record_id uuid,p_offset integer default 0,p_page_size integer default 50
) returns table(record_id uuid,session_id uuid,student_id uuid,student_name text,
  old_status text,new_status text,reason text,actor_profile_id uuid,actor_name text,changed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_s public.attendance_sessions%rowtype;
begin
  if auth.uid() is null or p_page_size not between 1 and 100 or p_offset<0
    then raise exception using errcode='22023',message='B11_ATTENDANCE_HISTORY_BOUNDS_INVALID'; end if;
  select s.* into v_s from public.student_attendance_records r join public.attendance_sessions s on s.id=r.attendance_session_id where r.id=p_record_id;
  if not found or not public.has_staff_scope_permission('attendance.read',v_s.organization_id,v_s.school_id,v_s.classroom_id)
    then raise exception using errcode='42501',message='B11_ATTENDANCE_SCOPE_DENIED'; end if;
  return query select a.entity_id,r.attendance_session_id,m.student_id,st.full_name,
    a.before_data->>'status',a.after_data->>'status',a.after_data->>'correction_reason',
    a.actor_profile_id,p.full_name,a.occurred_at
  from public.audit_logs a join public.student_attendance_records r on r.id=a.entity_id
  join public.attendance_session_roster_members m on m.attendance_session_id=r.attendance_session_id and m.student_enrollment_id=r.student_enrollment_id
  join public.students st on st.id=m.student_id and st.organization_id=m.organization_id
  left join public.profiles p on p.id=a.actor_profile_id
  where a.entity_type='student_attendance_records' and a.entity_id=p_record_id and a.action='update'
    and (a.before_data->>'status' is distinct from a.after_data->>'status' or a.before_data->>'note' is distinct from a.after_data->>'note')
    and nullif(a.after_data->>'correction_reason','') is not null
  order by a.occurred_at desc,a.id limit p_page_size offset p_offset;
end
$$;

-- New record writes, including legacy direct B5 paths, must hit the frozen roster.
create or replace function public.validate_student_attendance_record()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_session public.attendance_sessions%rowtype; v_student_id uuid;
begin
  -- B5 compatibility marker: membership is still the dated classroom roster,
  -- but B11 resolves it from the immutable snapshot created at session open.
  select s.* into v_session from public.attendance_sessions s where s.id=new.attendance_session_id
    and s.organization_id=new.organization_id and s.school_id=new.school_id for share;
  if not found then raise exception using errcode='23514',message='StudentAttendanceRecord requires an exact AttendanceSession tenant'; end if;
  select m.student_id into v_student_id from public.attendance_session_roster_members m
   where m.attendance_session_id=new.attendance_session_id and m.student_enrollment_id=new.student_enrollment_id
     and m.organization_id=new.organization_id and m.school_id=new.school_id;
  if not found then raise exception using errcode='23514',message='B11_ATTENDANCE_OUTSIDER_RECORD'; end if;
  if tg_op='UPDATE' and (old.organization_id,old.school_id,old.attendance_session_id,old.student_enrollment_id)
    is distinct from (new.organization_id,new.school_id,new.attendance_session_id,new.student_enrollment_id)
    then raise exception using errcode='23514',message='StudentAttendanceRecord identity is immutable'; end if;
  if auth.uid() is not null then
    if tg_op='INSERT' then new.recorded_by_profile_id:=auth.uid(); end if;
    new.updated_by_profile_id:=auth.uid();
  end if;
  if v_session.status='open' then new.correction_reason:=null;
  elsif v_session.status='submitted' and (new.correction_reason is null or length(btrim(new.correction_reason))<3)
    then raise exception using errcode='23514',message='Submitted attendance correction requires a reason';
  elsif v_session.status in ('locked','corrected') and (new.correction_reason is null or length(btrim(new.correction_reason))<3)
    then raise exception using errcode='23514',message='Locked attendance correction requires a reason';
  elsif v_session.status not in ('open','submitted','locked','corrected')
    then raise exception using errcode='23514',message='StudentAttendanceRecord session state is invalid'; end if;
  return new;
end
$$;

-- API ACL convergence. Helpers are executable only by the owner through RPCs.
-- Once this migration is deployed with Phase 2, mutations are command-only;
-- SELECT remains available under the existing RLS/portal contracts.
revoke insert, update, delete on table public.attendance_sessions from authenticated;
revoke insert, update, delete on table public.student_attendance_records from authenticated;
grant select on table public.attendance_sessions to authenticated;
grant select on table public.student_attendance_records to authenticated;
revoke all on function public.guard_attendance_roster_immutable() from public,anon,authenticated,service_role;
revoke all on function public.guard_attendance_command_immutable() from public,anon,authenticated,service_role;
revoke all on function public.b11_attendance_fingerprint(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.b11_attendance_request_begin(uuid,uuid,uuid,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.b11_attendance_request_finish(uuid,jsonb) from public,anon,authenticated,service_role;

do $acl$
declare f regprocedure;
begin
  foreach f in array array[
    'public.attendance_school_timezone(uuid)'::regprocedure,
    'public.open_attendance_session(uuid,date,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,boolean,boolean)'::regprocedure,
    'public.save_attendance_draft(uuid,timestamptz,uuid,jsonb)'::regprocedure,
    'public.submit_attendance_session(uuid,timestamptz,uuid)'::regprocedure,
    'public.lock_attendance_session(uuid,timestamptz,uuid)'::regprocedure,
    'public.correct_attendance_record(uuid,timestamptz,uuid,text,text,text)'::regprocedure,
    'public.list_attendance_history(uuid,date,date,uuid,text,uuid,integer,integer)'::regprocedure,
    'public.list_staff_student_attendance_history(uuid,date,date,integer,integer)'::regprocedure,
    'public.list_attendance_corrections(uuid,integer,integer)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role',f);
    execute format('grant execute on function %s to authenticated',f);
  end loop;
end
$acl$;

comment on table public.attendance_session_roster_members is 'B11 immutable historical membership snapshot; contains identifiers only, no unnecessary PII.';
comment on table public.attendance_command_requests is 'B11 minimal authenticated command idempotency ledger; no attendance row payload or PII. Completed requests have a frozen 30-day retention horizon; cleanup is an owner-operated future maintenance action and is not scheduled by this migration.';
comment on function public.open_attendance_session(uuid,date,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,boolean,boolean) is 'B11 atomic, tenant-derived session open and roster snapshot; explicit calendar/collision acknowledgement.';
comment on function public.submit_attendance_session(uuid,timestamptz,uuid) is 'B11 complete non-empty snapshot submission; never defaults missing outcomes.';
comment on function public.correct_attendance_record(uuid,timestamptz,uuid,text,text,text) is 'B11 idempotent reasoned record correction; session lifecycle is unchanged.';

commit;
