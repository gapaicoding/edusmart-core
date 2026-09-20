-- Forward-only PL/pgSQL runtime hardening discovered by transactional RPC tests.

create or replace function public.create_teaching_journal(
  p_request_id uuid, p_timetable_entry_id uuid, p_journal_date date,
  p_material_taught text default null, p_obstacles text default null,
  p_follow_up text default null, p_teacher_note text default null
)
returns table (journal_id uuid, status text, version bigint, journal_date date)
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_org uuid; v_school uuid; v_year uuid; v_term uuid; v_assignment uuid;
  v_timetable uuid; v_classroom uuid; v_staff_assignment uuid;
  v_journal uuid; v_version bigint; v_status text; v_date date;
  v_result jsonb; v_command uuid;
begin
  if v_actor is null then raise exception 'B13_TDO_AUTH_REQUIRED'; end if;
  select te.organization_id, te.school_id, te.academic_year_id, te.term_id,
         te.teaching_assignment_id, te.id, ta.classroom_id, ta.staff_school_assignment_id
    into v_org, v_school, v_year, v_term, v_assignment, v_timetable, v_classroom, v_staff_assignment
    from public.timetable_entries te
    join public.teaching_assignments ta on ta.id=te.teaching_assignment_id
      and ta.organization_id=te.organization_id and ta.school_id=te.school_id
      and ta.academic_year_id=te.academic_year_id and ta.term_id is not distinct from te.term_id
    join public.staff_school_assignments ssa on ssa.id=ta.staff_school_assignment_id
      and ssa.organization_id=ta.organization_id and ssa.school_id=ta.school_id
    join public.staff_members sm on sm.id=ssa.staff_member_id
      and sm.organization_id=ssa.organization_id and sm.profile_id=v_actor and sm.status='active'
    where te.id=p_timetable_entry_id and te.status='published' and ta.status='active' and ssa.status='active'
      and (ssa.joined_on is null or ssa.joined_on<=p_journal_date)
      and (ssa.left_on is null or ssa.left_on>=p_journal_date)
      and p_journal_date between te.effective_from and coalesce(te.effective_to,p_journal_date)
      and extract(isodow from p_journal_date)::smallint=te.weekday
      and p_journal_date between ta.starts_on and coalesce(ta.ends_on,p_journal_date)
      and public.has_permission('teaching_journal.create',te.organization_id,te.school_id,ta.classroom_id);
  if v_org is null then raise exception 'B13_TDO_ASSIGNMENT_DENIED'; end if;
  v_result:=public.b13_claim_teacher_daily_command(v_org,v_school,'create_teaching_journal',p_request_id,
    jsonb_build_object('timetable_entry_id',v_timetable,'journal_date',p_journal_date,'material_taught',p_material_taught,'obstacles',p_obstacles,'follow_up',p_follow_up,'teacher_note',p_teacher_note));
  if v_result is not null then return query select (v_result->>'journal_id')::uuid,v_result->>'status',(v_result->>'version')::bigint,(v_result->>'journal_date')::date; return; end if;
  select c.id into v_command from public.teacher_daily_operation_command_requests c where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='create_teaching_journal';
  if exists(select 1 from public.teaching_journals j where j.school_id=v_school and j.timetable_entry_id=v_timetable and j.journal_date=p_journal_date) then raise exception 'B13_TDO_DUPLICATE_JOURNAL'; end if;
  insert into public.teaching_journals(organization_id,school_id,academic_year_id,term_id,teaching_assignment_id,timetable_entry_id,journal_date,status,material_taught,obstacles,follow_up,teacher_note,version,created_by_profile_id)
  values(v_org,v_school,v_year,v_term,v_assignment,v_timetable,p_journal_date,'draft',p_material_taught,p_obstacles,p_follow_up,p_teacher_note,1,v_actor)
  returning public.teaching_journals.id into v_journal;
  select j.status,j.version,j.journal_date into v_status,v_version,v_date from public.teaching_journals j where j.id=v_journal;
  v_result:=jsonb_build_object('journal_id',v_journal,'status',v_status,'version',v_version,'journal_date',v_date);
  perform public.b13_complete_teacher_daily_command(v_command,v_journal,v_result);
  return query select v_journal,v_status,v_version,v_date;
end;
$$;

create or replace function public.manage_staff_attendance(
  p_request_id uuid,p_staff_member_id uuid,p_attendance_date date,p_status text,
  p_check_in_at timestamptz default null,p_check_out_at timestamptz default null,
  p_note text default null,p_expected_version bigint default null
)
returns table (attendance_record_id uuid,status text,version bigint,attendance_date date,check_in_at timestamptz,check_out_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid(); v_org uuid; v_school uuid; v_id uuid; v_version bigint;
  v_status text; v_date date; v_in timestamptz; v_out timestamptz;
  v_result jsonb; v_command uuid; v_existing public.staff_attendance_records;
begin
  if v_actor is null then raise exception 'B13_TDO_AUTH_REQUIRED'; end if;
  select sm.organization_id,ssa.school_id into v_org,v_school
    from public.staff_members sm join public.staff_school_assignments ssa on ssa.staff_member_id=sm.id and ssa.organization_id=sm.organization_id
   where sm.id=p_staff_member_id and sm.status='active' and ssa.status='active'
     and public.has_permission('staff_attendance.manage',sm.organization_id,ssa.school_id);
  if v_org is null then raise exception 'B13_TDO_SCOPE_DENIED'; end if;
  if p_status not in ('present','late','excused','sick','absent','leave','other') or (p_check_in_at is not null and p_check_out_at is not null and p_check_out_at<p_check_in_at) then raise exception 'B13_TDO_ATTENDANCE_INVALID'; end if;
  if not exists(select 1 from public.staff_school_assignments ssa where ssa.staff_member_id=p_staff_member_id and ssa.organization_id=v_org and ssa.school_id=v_school and ssa.status='active' and (ssa.joined_on is null or ssa.joined_on<=p_attendance_date) and (ssa.left_on is null or ssa.left_on>=p_attendance_date)) then raise exception 'B13_TDO_STAFF_ASSIGNMENT_INVALID'; end if;
  v_result:=public.b13_claim_teacher_daily_command(v_org,v_school,'manage_staff_attendance',p_request_id,jsonb_build_object('staff_member_id',p_staff_member_id,'attendance_date',p_attendance_date,'status',p_status,'check_in_at',p_check_in_at,'check_out_at',p_check_out_at,'note',p_note,'expected_version',p_expected_version));
  if v_result is not null then return query select (v_result->>'attendance_record_id')::uuid,v_result->>'status',(v_result->>'version')::bigint,(v_result->>'attendance_date')::date,(v_result->>'check_in_at')::timestamptz,(v_result->>'check_out_at')::timestamptz; return; end if;
  select c.id into v_command from public.teacher_daily_operation_command_requests c where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='manage_staff_attendance';
  select r.* into v_existing from public.staff_attendance_records r where r.staff_member_id=p_staff_member_id and r.school_id=v_school and r.attendance_date=p_attendance_date for update;
  if found then
    if p_expected_version is null or p_expected_version<>v_existing.version then raise exception 'B13_TDO_STALE_VERSION'; end if;
    update public.staff_attendance_records r set status=p_status,check_in_at=p_check_in_at,check_out_at=p_check_out_at,note=p_note,version=v_existing.version+1 where r.id=v_existing.id
      returning r.id,r.status,r.version,r.attendance_date,r.check_in_at,r.check_out_at into v_id,v_status,v_version,v_date,v_in,v_out;
  else
    if p_expected_version is not null then raise exception 'B13_TDO_STALE_VERSION'; end if;
    insert into public.staff_attendance_records(organization_id,school_id,staff_member_id,attendance_date,status,check_in_at,check_out_at,note,version)
      values(v_org,v_school,p_staff_member_id,p_attendance_date,p_status,p_check_in_at,p_check_out_at,p_note,1)
      returning public.staff_attendance_records.id,public.staff_attendance_records.status,public.staff_attendance_records.version,public.staff_attendance_records.attendance_date,public.staff_attendance_records.check_in_at,public.staff_attendance_records.check_out_at into v_id,v_status,v_version,v_date,v_in,v_out;
  end if;
  v_result:=jsonb_build_object('attendance_record_id',v_id,'status',v_status,'version',v_version,'attendance_date',v_date,'check_in_at',v_in,'check_out_at',v_out);
  perform public.b13_complete_teacher_daily_command(v_command,v_id,v_result);
  return query select v_id,v_status,v_version,v_date,v_in,v_out;
end;
$$;

create or replace function public.get_my_teaching_journal(p_journal_id uuid)
returns table (journal_id uuid,journal_date date,status text,version bigint,material_taught text,obstacles text,follow_up text,teacher_note text,submitted_at timestamptz,classroom_id uuid,classroom_name text,subject_id uuid,subject_name text,timetable_entry_id uuid,teaching_assignment_id uuid)
language sql stable security definer set search_path=''
as $$ select x.* from public.list_my_teaching_journals(null,null,null,null,null,1,100) as x where x.journal_id=p_journal_id $$;

create or replace function public.get_staff_teaching_journal(p_school_id uuid,p_journal_id uuid)
returns table (journal_id uuid,journal_date date,status text,version bigint,material_taught text,obstacles text,follow_up text,teacher_note text,submitted_at timestamptz,teacher_staff_member_id uuid,teacher_name text,classroom_id uuid,classroom_name text,subject_id uuid,subject_name text,timetable_entry_id uuid,teaching_assignment_id uuid)
language sql stable security definer set search_path=''
as $$ select x.* from public.list_staff_teaching_journals(p_school_id,null,null,null,null,null,null,1,100) as x where x.journal_id=p_journal_id $$;

create or replace function public.get_staff_attendance_record(p_school_id uuid,p_attendance_record_id uuid)
returns table (attendance_record_id uuid,staff_member_id uuid,staff_name text,attendance_date date,status text,check_in_at timestamptz,check_out_at timestamptz,note text,version bigint)
language sql stable security definer set search_path=''
as $$ select x.* from public.list_staff_attendance(p_school_id,null,null,null,null,1,100) as x where x.attendance_record_id=p_attendance_record_id $$;
