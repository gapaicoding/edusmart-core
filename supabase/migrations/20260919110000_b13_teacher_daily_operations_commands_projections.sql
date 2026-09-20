-- Batch 13 Phase 2: command RPCs, bounded projections, and RPC-only writes.
-- The Phase 1 migration is immutable; every correction is forward-only.

alter table public.staff_attendance_records
  add column if not exists version bigint not null default 1,
  add constraint staff_attendance_records_version_check check (version >= 1);

create table public.teacher_daily_operation_command_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  command_name text not null,
  payload_fingerprint text not null,
  resource_id uuid,
  result_payload jsonb,
  status text not null default 'processing',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint teacher_daily_operation_command_requests_status_check
    check (status in ('processing', 'completed')),
  constraint teacher_daily_operation_command_requests_fingerprint_check
    check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint teacher_daily_operation_command_requests_completion_check
    check ((status = 'processing' and completed_at is null and result_payload is null)
      or (status = 'completed' and completed_at is not null and result_payload is not null)),
  constraint teacher_daily_operation_command_requests_actor_request_key
    unique (actor_profile_id, request_id, command_name)
);

create index teacher_daily_operation_command_requests_resource_idx
  on public.teacher_daily_operation_command_requests (resource_id, created_at desc);

alter table public.teacher_daily_operation_command_requests enable row level security;
revoke all on public.teacher_daily_operation_command_requests from public, anon, authenticated, service_role;

revoke insert, update, delete on public.staff_attendance_records from authenticated;

insert into public.permissions (code, domain, action, description) values
  ('teaching_journal.read', 'teaching_journal', 'read', 'Read teaching journal operational projections'),
  ('teaching_journal.create', 'teaching_journal', 'create', 'Create a draft teaching journal for an assigned timetable occurrence'),
  ('teaching_journal.update', 'teaching_journal', 'update', 'Update an owned draft teaching journal'),
  ('teaching_journal.submit', 'teaching_journal', 'submit', 'Submit an owned teaching journal'),
  ('staff_attendance.read', 'staff_attendance', 'read', 'Read scoped staff attendance projections'),
  ('staff_attendance.manage', 'staff_attendance', 'manage', 'Manage scoped staff attendance records'),
  ('staff_attendance.self.read', 'staff_attendance', 'self.read', 'Read the authenticated staff member attendance history')
on conflict (code) do nothing;

create or replace function public.b13_claim_teacher_daily_command(
  p_organization_id uuid,
  p_school_id uuid,
  p_command_name text,
  p_request_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_fingerprint text;
  v_existing public.teacher_daily_operation_command_requests;
begin
  if v_actor is null then
    raise exception 'B13_TDO_AUTH_REQUIRED';
  end if;
  if p_request_id is null or p_command_name is null or p_payload is null then
    raise exception 'B13_TDO_REQUEST_CONFLICT';
  end if;
  v_fingerprint := pg_catalog.encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
  select * into v_existing
    from public.teacher_daily_operation_command_requests c
   where c.actor_profile_id = v_actor
     and c.request_id = p_request_id
     and c.command_name = p_command_name
   for update;
  if found then
    if v_existing.payload_fingerprint <> v_fingerprint
       or v_existing.organization_id <> p_organization_id
       or v_existing.school_id <> p_school_id then
      raise exception 'B13_TDO_REQUEST_CONFLICT';
    end if;
    if v_existing.status = 'completed' then
      return v_existing.result_payload;
    end if;
    raise exception 'B13_TDO_REQUEST_CONFLICT';
  end if;
  insert into public.teacher_daily_operation_command_requests
    (organization_id, school_id, actor_profile_id, request_id, command_name, payload_fingerprint)
  values
    (p_organization_id, p_school_id, v_actor, p_request_id, p_command_name, v_fingerprint);
  return null;
end;
$$;

create or replace function public.b13_complete_teacher_daily_command(
  p_command_id uuid,
  p_resource_id uuid,
  p_result_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.teacher_daily_operation_command_requests c
     set resource_id = p_resource_id,
         result_payload = p_result_payload,
         status = 'completed',
         completed_at = clock_timestamp()
   where c.id = p_command_id
     and c.status = 'processing';
  if not found then
    raise exception 'B13_TDO_RESULT_SHAPE_INVALID';
  end if;
end;
$$;

create or replace function public.create_teaching_journal(
  p_request_id uuid,
  p_timetable_entry_id uuid,
  p_journal_date date,
  p_material_taught text default null,
  p_obstacles text default null,
  p_follow_up text default null,
  p_teacher_note text default null
)
returns table (journal_id uuid, status text, version bigint, journal_date date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org uuid; v_school uuid; v_year uuid; v_term uuid; v_assignment uuid;
  v_timetable uuid; v_classroom uuid; v_staff_assignment uuid;
  v_journal uuid; v_version bigint; v_status text; v_result jsonb; v_command uuid;
begin
  if v_actor is null then raise exception 'B13_TDO_AUTH_REQUIRED'; end if;
  select te.organization_id, te.school_id, te.academic_year_id, te.term_id,
         te.teaching_assignment_id, te.id, ta.classroom_id, ta.staff_school_assignment_id
    into v_org, v_school, v_year, v_term, v_assignment, v_timetable, v_classroom, v_staff_assignment
    from public.timetable_entries te
    join public.teaching_assignments ta
      on ta.id = te.teaching_assignment_id
     and ta.organization_id = te.organization_id
     and ta.school_id = te.school_id
     and ta.academic_year_id = te.academic_year_id
     and ta.term_id is not distinct from te.term_id
    join public.staff_school_assignments ssa
      on ssa.id = ta.staff_school_assignment_id
     and ssa.organization_id = ta.organization_id
     and ssa.school_id = ta.school_id
    join public.staff_members sm
      on sm.id = ssa.staff_member_id
     and sm.organization_id = ssa.organization_id
     and sm.profile_id = v_actor
     and sm.status = 'active'
    where te.id = p_timetable_entry_id
      and te.status = 'published'
      and ta.status = 'active'
      and ssa.status = 'active'
      and (ssa.joined_on is null or ssa.joined_on <= p_journal_date)
      and (ssa.left_on is null or ssa.left_on >= p_journal_date)
      and p_journal_date between te.effective_from and coalesce(te.effective_to, p_journal_date)
      and extract(isodow from p_journal_date)::smallint = te.weekday
      and p_journal_date between ta.starts_on and coalesce(ta.ends_on, p_journal_date)
      and public.has_permission('teaching_journal.create', te.organization_id, te.school_id, ta.classroom_id);
  if v_org is null then raise exception 'B13_TDO_ASSIGNMENT_DENIED'; end if;

  v_result := public.b13_claim_teacher_daily_command(
    v_org, v_school, 'create_teaching_journal', p_request_id,
    jsonb_build_object('timetable_entry_id',v_timetable,'journal_date',p_journal_date,
      'material_taught',p_material_taught,'obstacles',p_obstacles,'follow_up',p_follow_up,'teacher_note',p_teacher_note));
  if v_result is not null then
    return query select (v_result->>'journal_id')::uuid, v_result->>'status', (v_result->>'version')::bigint, (v_result->>'journal_date')::date;
    return;
  end if;
  select c.id into v_command from public.teacher_daily_operation_command_requests c
   where c.actor_profile_id = v_actor and c.request_id = p_request_id and c.command_name = 'create_teaching_journal';
  if exists (select 1 from public.teaching_journals j where j.school_id=v_school and j.timetable_entry_id=v_timetable and j.journal_date=p_journal_date) then
    raise exception 'B13_TDO_DUPLICATE_JOURNAL';
  end if;
  insert into public.teaching_journals
    (organization_id,school_id,academic_year_id,term_id,teaching_assignment_id,timetable_entry_id,journal_date,status,material_taught,obstacles,follow_up,teacher_note,version,created_by_profile_id)
  values (v_org,v_school,v_year,v_term,v_assignment,v_timetable,p_journal_date,'draft',p_material_taught,p_obstacles,p_follow_up,p_teacher_note,1,v_actor)
  returning id,status,version,journal_date into v_journal,v_status,v_version,journal_date;
  v_result := jsonb_build_object('journal_id',v_journal,'status',v_status,'version',v_version,'journal_date',journal_date);
  perform public.b13_complete_teacher_daily_command(v_command,v_journal,v_result);
  return query select v_journal,v_status,v_version,journal_date;
end;
$$;

create or replace function public.update_teaching_journal(
  p_request_id uuid,
  p_journal_id uuid,
  p_expected_version bigint,
  p_material_taught text default null,
  p_obstacles text default null,
  p_follow_up text default null,
  p_teacher_note text default null
)
returns table (journal_id uuid, status text, version bigint, journal_date date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid(); v_j public.teaching_journals; v_result jsonb; v_command uuid;
begin
  if v_actor is null then raise exception 'B13_TDO_AUTH_REQUIRED'; end if;
  select j.* into v_j from public.teaching_journals j where j.id=p_journal_id for update;
  if not found then raise exception 'B13_TDO_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.teaching_assignments ta
    join public.staff_school_assignments ssa on ssa.id=ta.staff_school_assignment_id
    join public.staff_members sm on sm.id=ssa.staff_member_id
    where ta.id=v_j.teaching_assignment_id and ta.organization_id=v_j.organization_id and ta.school_id=v_j.school_id
      and sm.profile_id=v_actor and sm.status='active' and ssa.status='active'
      and public.has_permission('teaching_journal.update',v_j.organization_id,v_j.school_id,ta.classroom_id)
  ) then raise exception 'B13_TDO_SCOPE_DENIED'; end if;
  v_result := public.b13_claim_teacher_daily_command(v_j.organization_id,v_j.school_id,'update_teaching_journal',p_request_id,
    jsonb_build_object('journal_id',p_journal_id,'expected_version',p_expected_version,'material_taught',p_material_taught,'obstacles',p_obstacles,'follow_up',p_follow_up,'teacher_note',p_teacher_note));
  if v_result is not null then return query select (v_result->>'journal_id')::uuid,v_result->>'status',(v_result->>'version')::bigint,(v_result->>'journal_date')::date; return; end if;
  select c.id into v_command from public.teacher_daily_operation_command_requests c where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='update_teaching_journal';
  if v_j.status <> 'draft' then raise exception 'B13_TDO_INVALID_STATE'; end if;
  if p_expected_version is null or p_expected_version <> v_j.version then raise exception 'B13_TDO_STALE_VERSION'; end if;
  update public.teaching_journals j set material_taught=p_material_taught,obstacles=p_obstacles,follow_up=p_follow_up,teacher_note=p_teacher_note,version=v_j.version+1 where j.id=p_journal_id;
  v_result:=jsonb_build_object('journal_id',p_journal_id,'status','draft','version',v_j.version+1,'journal_date',v_j.journal_date);
  perform public.b13_complete_teacher_daily_command(v_command,p_journal_id,v_result);
  return query select p_journal_id,'draft'::text,v_j.version+1,v_j.journal_date;
end;
$$;

create or replace function public.submit_teaching_journal(
  p_request_id uuid,
  p_journal_id uuid,
  p_expected_version bigint
)
returns table (journal_id uuid, status text, version bigint, journal_date date, submitted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid(); v_j public.teaching_journals; v_result jsonb; v_command uuid; v_submitted timestamptz;
begin
  if v_actor is null then raise exception 'B13_TDO_AUTH_REQUIRED'; end if;
  select j.* into v_j from public.teaching_journals j where j.id=p_journal_id for update;
  if not found then raise exception 'B13_TDO_NOT_FOUND'; end if;
  if not exists (select 1 from public.teaching_assignments ta join public.staff_school_assignments ssa on ssa.id=ta.staff_school_assignment_id join public.staff_members sm on sm.id=ssa.staff_member_id where ta.id=v_j.teaching_assignment_id and ta.organization_id=v_j.organization_id and ta.school_id=v_j.school_id and sm.profile_id=v_actor and sm.status='active' and ssa.status='active' and public.has_permission('teaching_journal.submit',v_j.organization_id,v_j.school_id,ta.classroom_id)) then raise exception 'B13_TDO_SCOPE_DENIED'; end if;
  v_result:=public.b13_claim_teacher_daily_command(v_j.organization_id,v_j.school_id,'submit_teaching_journal',p_request_id,jsonb_build_object('journal_id',p_journal_id,'expected_version',p_expected_version));
  if v_result is not null then return query select (v_result->>'journal_id')::uuid,v_result->>'status',(v_result->>'version')::bigint,(v_result->>'journal_date')::date,(v_result->>'submitted_at')::timestamptz; return; end if;
  select c.id into v_command from public.teacher_daily_operation_command_requests c where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='submit_teaching_journal';
  if v_j.status <> 'draft' then raise exception 'B13_TDO_INVALID_STATE'; end if;
  if btrim(coalesce(v_j.material_taught,''))='' then raise exception 'B13_TDO_MATERIAL_REQUIRED'; end if;
  if p_expected_version is null or p_expected_version<>v_j.version then raise exception 'B13_TDO_STALE_VERSION'; end if;
  update public.teaching_journals j set status='submitted',version=v_j.version+1,submitted_by_profile_id=v_actor,submitted_at=clock_timestamp() where j.id=p_journal_id returning j.submitted_at into v_submitted;
  v_result:=jsonb_build_object('journal_id',p_journal_id,'status','submitted','version',v_j.version+1,'journal_date',v_j.journal_date,'submitted_at',v_submitted);
  perform public.b13_complete_teacher_daily_command(v_command,p_journal_id,v_result);
  return query select p_journal_id,'submitted'::text,v_j.version+1,v_j.journal_date,v_submitted;
end;
$$;

create or replace function public.manage_staff_attendance(
  p_request_id uuid,
  p_staff_member_id uuid,
  p_attendance_date date,
  p_status text,
  p_check_in_at timestamptz default null,
  p_check_out_at timestamptz default null,
  p_note text default null,
  p_expected_version bigint default null
)
returns table (attendance_record_id uuid, status text, version bigint, attendance_date date, check_in_at timestamptz, check_out_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid(); v_org uuid; v_school uuid; v_id uuid; v_version bigint; v_result jsonb; v_command uuid; v_existing public.staff_attendance_records;
begin
  if v_actor is null then raise exception 'B13_TDO_AUTH_REQUIRED'; end if;
  select sm.organization_id, ssa.school_id into v_org,v_school from public.staff_members sm join public.staff_school_assignments ssa on ssa.staff_member_id=sm.id and ssa.organization_id=sm.organization_id where sm.id=p_staff_member_id and sm.status='active' and ssa.status='active' and public.has_permission('staff_attendance.manage',sm.organization_id,ssa.school_id);
  if v_org is null then raise exception 'B13_TDO_SCOPE_DENIED'; end if;
  if p_status not in ('present','late','excused','sick','absent','leave','other') or (p_check_in_at is not null and p_check_out_at is not null and p_check_out_at<p_check_in_at) then raise exception 'B13_TDO_ATTENDANCE_INVALID'; end if;
  if not exists(select 1 from public.staff_school_assignments ssa join public.staff_members sm on sm.id=ssa.staff_member_id where ssa.staff_member_id=p_staff_member_id and ssa.organization_id=v_org and ssa.school_id=v_school and ssa.status='active' and (ssa.joined_on is null or ssa.joined_on<=p_attendance_date) and (ssa.left_on is null or ssa.left_on>=p_attendance_date)) then raise exception 'B13_TDO_STAFF_ASSIGNMENT_INVALID'; end if;
  v_result:=public.b13_claim_teacher_daily_command(v_org,v_school,'manage_staff_attendance',p_request_id,jsonb_build_object('staff_member_id',p_staff_member_id,'attendance_date',p_attendance_date,'status',p_status,'check_in_at',p_check_in_at,'check_out_at',p_check_out_at,'note',p_note,'expected_version',p_expected_version));
  if v_result is not null then return query select (v_result->>'attendance_record_id')::uuid,v_result->>'status',(v_result->>'version')::bigint,(v_result->>'attendance_date')::date,(v_result->>'check_in_at')::timestamptz,(v_result->>'check_out_at')::timestamptz; return; end if;
  select c.id into v_command from public.teacher_daily_operation_command_requests c where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='manage_staff_attendance';
  select r.* into v_existing from public.staff_attendance_records r where r.staff_member_id=p_staff_member_id and r.school_id=v_school and r.attendance_date=p_attendance_date for update;
  if found then
    if p_expected_version is null or p_expected_version<>v_existing.version then raise exception 'B13_TDO_STALE_VERSION'; end if;
    update public.staff_attendance_records r set status=p_status,check_in_at=p_check_in_at,check_out_at=p_check_out_at,note=p_note,version=v_existing.version+1 where r.id=v_existing.id returning r.id,r.status,r.version,r.attendance_date,r.check_in_at,r.check_out_at into v_id,status,v_version,attendance_date,check_in_at,check_out_at;
  else
    if p_expected_version is not null then raise exception 'B13_TDO_STALE_VERSION'; end if;
    insert into public.staff_attendance_records (organization_id,school_id,staff_member_id,attendance_date,status,check_in_at,check_out_at,note,version) values(v_org,v_school,p_staff_member_id,p_attendance_date,p_status,p_check_in_at,p_check_out_at,p_note,1) returning id,status,version,attendance_date,check_in_at,check_out_at into v_id,status,v_version,attendance_date,check_in_at,check_out_at;
  end if;
  v_result=jsonb_build_object('attendance_record_id',v_id,'status',status,'version',v_version,'attendance_date',attendance_date,'check_in_at',check_in_at,'check_out_at',check_out_at);
  perform public.b13_complete_teacher_daily_command(v_command,v_id,v_result);
  return query select v_id,status,v_version,attendance_date,check_in_at,check_out_at;
end;
$$;

create or replace function public.list_my_teaching_journals(p_academic_year_id uuid default null,p_term_id uuid default null,p_from date default null,p_to date default null,p_status text default null,p_page integer default 1,p_page_size integer default 20)
returns table (journal_id uuid,journal_date date,status text,version bigint,material_taught text,obstacles text,follow_up text,teacher_note text,submission_at timestamptz,classroom_id uuid,classroom_name text,subject_id uuid,subject_name text,timetable_entry_id uuid,teaching_assignment_id uuid)
language sql stable security definer set search_path=''
as $$
  select j.id,j.journal_date,j.status,j.version,j.material_taught,j.obstacles,j.follow_up,j.teacher_note,j.submitted_at,c.id,c.name,s.id,s.name,j.timetable_entry_id,j.teaching_assignment_id
  from public.teaching_journals j join public.teaching_assignments ta on ta.id=j.teaching_assignment_id join public.staff_school_assignments ssa on ssa.id=ta.staff_school_assignment_id join public.staff_members sm on sm.id=ssa.staff_member_id and sm.profile_id=auth.uid() join public.classrooms c on c.id=ta.classroom_id join public.subjects s on s.id=ta.subject_id
  where auth.uid() is not null and sm.status='active' and ssa.status='active' and public.has_permission('teaching_journal.read',j.organization_id,j.school_id,ta.classroom_id) and (p_academic_year_id is null or j.academic_year_id=p_academic_year_id) and (p_term_id is null or j.term_id=p_term_id) and (p_from is null or j.journal_date>=p_from) and (p_to is null or j.journal_date<=p_to) and (p_status is null or j.status=p_status)
  order by j.journal_date desc,j.updated_at desc limit least(greatest(coalesce(p_page_size,20),1),100) offset (greatest(coalesce(p_page,1),1)-1)*least(greatest(coalesce(p_page_size,20),1),100)
$$;

create or replace function public.get_my_teaching_journal(p_journal_id uuid)
returns table (journal_id uuid,journal_date date,status text,version bigint,material_taught text,obstacles text,follow_up text,teacher_note text,submitted_at timestamptz,classroom_id uuid,classroom_name text,subject_id uuid,subject_name text,timetable_entry_id uuid,teaching_assignment_id uuid)
language sql stable security definer set search_path=''
as $$ select * from public.list_my_teaching_journals(null,null,null,null,null,1,100) where list_my_teaching_journals.journal_id=p_journal_id $$;

create or replace function public.list_staff_teaching_journals(p_school_id uuid,p_teacher_profile_id uuid default null,p_classroom_id uuid default null,p_subject_id uuid default null,p_status text default null,p_from date default null,p_to date default null,p_page integer default 1,p_page_size integer default 20)
returns table (journal_id uuid,journal_date date,status text,version bigint,material_taught text,obstacles text,follow_up text,teacher_note text,submitted_at timestamptz,teacher_staff_member_id uuid,teacher_name text,classroom_id uuid,classroom_name text,subject_id uuid,subject_name text,timetable_entry_id uuid,teaching_assignment_id uuid)
language sql stable security definer set search_path=''
as $$ select j.id,j.journal_date,j.status,j.version,j.material_taught,j.obstacles,j.follow_up,j.teacher_note,j.submitted_at,sm.id,sm.full_name,c.id,c.name,s.id,s.name,j.timetable_entry_id,j.teaching_assignment_id from public.teaching_journals j join public.teaching_assignments ta on ta.id=j.teaching_assignment_id join public.staff_school_assignments ssa on ssa.id=ta.staff_school_assignment_id join public.staff_members sm on sm.id=ssa.staff_member_id join public.classrooms c on c.id=ta.classroom_id join public.subjects s on s.id=ta.subject_id where auth.uid() is not null and public.has_staff_scope_permission('teaching_journal.read',j.organization_id,p_school_id,ta.classroom_id) and j.school_id=p_school_id and (p_teacher_profile_id is null or sm.profile_id=p_teacher_profile_id) and (p_classroom_id is null or ta.classroom_id=p_classroom_id) and (p_subject_id is null or ta.subject_id=p_subject_id) and (p_status is null or j.status=p_status) and (p_from is null or j.journal_date>=p_from) and (p_to is null or j.journal_date<=p_to) order by j.journal_date desc,j.updated_at desc limit least(greatest(coalesce(p_page_size,20),1),100) offset (greatest(coalesce(p_page,1),1)-1)*least(greatest(coalesce(p_page_size,20),1),100) $$;

create or replace function public.get_staff_teaching_journal(p_school_id uuid,p_journal_id uuid)
returns table (journal_id uuid,journal_date date,status text,version bigint,material_taught text,obstacles text,follow_up text,teacher_note text,submitted_at timestamptz,teacher_staff_member_id uuid,teacher_name text,classroom_id uuid,classroom_name text,subject_id uuid,subject_name text,timetable_entry_id uuid,teaching_assignment_id uuid)
language sql stable security definer set search_path=''
as $$ select * from public.list_staff_teaching_journals(p_school_id,null,null,null,null,null,null,1,100) where list_staff_teaching_journals.journal_id=p_journal_id $$;

create or replace function public.list_my_teaching_occurrences(p_from date,p_to date,p_page integer default 1,p_page_size integer default 20)
returns table (timetable_entry_id uuid,occurrence_date date,start_time time,end_time time,classroom_id uuid,classroom_name text,subject_id uuid,subject_name text,teaching_assignment_id uuid,journal_id uuid,journal_status text,journal_version bigint)
language sql stable security definer set search_path=''
as $$ select te.id,d::date,te.start_time,te.end_time,c.id,c.name,s.id,s.name,ta.id,j.id,j.status,j.version from public.timetable_entries te join public.teaching_assignments ta on ta.id=te.teaching_assignment_id join public.staff_school_assignments ssa on ssa.id=ta.staff_school_assignment_id join public.staff_members sm on sm.id=ssa.staff_member_id and sm.profile_id=auth.uid() join public.classrooms c on c.id=ta.classroom_id join public.subjects s on s.id=ta.subject_id cross join lateral generate_series(greatest(p_from,te.effective_from,ta.starts_on),least(p_to,coalesce(te.effective_to,p_to),coalesce(ta.ends_on,p_to)),interval '1 day') d left join public.teaching_journals j on j.timetable_entry_id=te.id and j.journal_date=d::date where auth.uid() is not null and te.status='published' and ta.status='active' and sm.status='active' and ssa.status='active' and extract(isodow from d)::smallint=te.weekday and public.has_permission('teaching_journal.read',te.organization_id,te.school_id,ta.classroom_id) order by d desc,te.start_time limit least(greatest(coalesce(p_page_size,20),1),100) offset (greatest(coalesce(p_page,1),1)-1)*least(greatest(coalesce(p_page_size,20),1),100) $$;

create or replace function public.list_staff_attendance(p_school_id uuid,p_from date default null,p_to date default null,p_status text default null,p_staff_member_id uuid default null,p_page integer default 1,p_page_size integer default 20)
returns table (attendance_record_id uuid,staff_member_id uuid,staff_name text,attendance_date date,status text,check_in_at timestamptz,check_out_at timestamptz,note text,version bigint)
language sql stable security definer set search_path=''
as $$ select r.id,r.staff_member_id,sm.full_name,r.attendance_date,r.status,r.check_in_at,r.check_out_at,r.note,r.version from public.staff_attendance_records r join public.staff_members sm on sm.id=r.staff_member_id where auth.uid() is not null and r.school_id=p_school_id and public.has_staff_scope_permission('staff_attendance.read',r.organization_id,r.school_id) and (p_from is null or r.attendance_date>=p_from) and (p_to is null or r.attendance_date<=p_to) and (p_status is null or r.status=p_status) and (p_staff_member_id is null or r.staff_member_id=p_staff_member_id) order by r.attendance_date desc,r.updated_at desc limit least(greatest(coalesce(p_page_size,20),1),100) offset (greatest(coalesce(p_page,1),1)-1)*least(greatest(coalesce(p_page_size,20),1),100) $$;

create or replace function public.get_staff_attendance_record(p_school_id uuid,p_attendance_record_id uuid)
returns table (attendance_record_id uuid,staff_member_id uuid,staff_name text,attendance_date date,status text,check_in_at timestamptz,check_out_at timestamptz,note text,version bigint)
language sql stable security definer set search_path=''
as $$ select * from public.list_staff_attendance(p_school_id,null,null,null,null,1,100) where list_staff_attendance.attendance_record_id=p_attendance_record_id $$;

create or replace function public.list_my_staff_attendance(p_from date default null,p_to date default null,p_status text default null,p_page integer default 1,p_page_size integer default 20)
returns table (attendance_record_id uuid,staff_member_id uuid,attendance_date date,status text,check_in_at timestamptz,check_out_at timestamptz,note text,version bigint)
language sql stable security definer set search_path=''
as $$ select r.id,r.staff_member_id,r.attendance_date,r.status,r.check_in_at,r.check_out_at,r.note,r.version from public.staff_attendance_records r join public.staff_members sm on sm.id=r.staff_member_id where auth.uid() is not null and sm.profile_id=auth.uid() and sm.status='active' and public.has_permission('staff_attendance.self.read',r.organization_id,r.school_id) and (p_from is null or r.attendance_date>=p_from) and (p_to is null or r.attendance_date<=p_to) and (p_status is null or r.status=p_status) order by r.attendance_date desc,r.updated_at desc limit least(greatest(coalesce(p_page_size,20),1),100) offset (greatest(coalesce(p_page,1),1)-1)*least(greatest(coalesce(p_page_size,20),1),100) $$;

revoke all on function public.b13_claim_teacher_daily_command(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.b13_complete_teacher_daily_command(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.create_teaching_journal(uuid,uuid,date,text,text,text,text) to authenticated;
grant execute on function public.update_teaching_journal(uuid,uuid,bigint,text,text,text,text) to authenticated;
grant execute on function public.submit_teaching_journal(uuid,uuid,bigint) to authenticated;
grant execute on function public.manage_staff_attendance(uuid,uuid,date,text,timestamptz,timestamptz,text,bigint) to authenticated;
grant execute on function public.list_my_teaching_journals(uuid,uuid,date,date,text,integer,integer) to authenticated;
grant execute on function public.get_my_teaching_journal(uuid) to authenticated;
grant execute on function public.list_staff_teaching_journals(uuid,uuid,uuid,uuid,text,date,date,integer,integer) to authenticated;
grant execute on function public.get_staff_teaching_journal(uuid,uuid) to authenticated;
grant execute on function public.list_my_teaching_occurrences(date,date,integer,integer) to authenticated;
grant execute on function public.list_staff_attendance(uuid,date,date,text,uuid,integer,integer) to authenticated;
grant execute on function public.get_staff_attendance_record(uuid,uuid) to authenticated;
grant execute on function public.list_my_staff_attendance(date,date,text,integer,integer) to authenticated;
