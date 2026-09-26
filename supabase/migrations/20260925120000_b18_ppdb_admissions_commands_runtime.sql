-- EduSmart Core V1 — Batch 18 Phase 2 PPDB commands/projections/runtime.
-- All public-facing functions are narrow SECURITY DEFINER boundaries. Phase 3 UI
-- is intentionally absent.

create or replace function public.b18_submit_admission_application(
  p_admission_cycle_id uuid,
  p_request_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle record;
  v_existing record;
  v_app_id uuid := gen_random_uuid();
  v_fingerprint text := md5(concat(p_admission_cycle_id::text, '|', p_payload::text));
  v_number text := 'B18-' || upper(substr(replace(v_app_id::text, '-', ''), 1, 12));
  v_grade uuid := nullif(p_payload->>'target_grade_level_id','')::uuid;
  v_guardian jsonb;
  v_guardian_count integer;
  v_primary_count integer;
  v_guardian_id uuid;
  v_result jsonb;
begin
  if p_request_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'B18_ADMISSION_VALIDATION_FAILED';
  end if;
  select c.*, ay.status as academic_year_status, s.name as school_name, ay.name as academic_year_name
    into v_cycle
  from public.admission_cycles c
  join public.academic_years ay on ay.id=c.academic_year_id and ay.organization_id=c.organization_id and ay.school_id=c.school_id
  join public.schools s on s.id=c.school_id and s.organization_id=c.organization_id
  where c.id=p_admission_cycle_id
  for update;
  if not found then raise exception 'B18_ADMISSION_NOT_FOUND'; end if;
  if v_cycle.status <> 'open' then raise exception 'B18_ADMISSION_CYCLE_NOT_OPEN'; end if;
  if v_cycle.academic_year_status in ('closed','archived') then raise exception 'B18_ADMISSION_PERIOD_CLOSED'; end if;
  if v_cycle.opens_at is not null and now() < v_cycle.opens_at then raise exception 'B18_ADMISSION_CYCLE_NOT_OPEN'; end if;
  if v_cycle.closes_at is not null and now() > v_cycle.closes_at then raise exception 'B18_ADMISSION_CYCLE_NOT_OPEN'; end if;
  if char_length(coalesce(p_payload->>'applicant_full_name','')) not between 1 and 200 then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  if char_length(coalesce(p_payload->>'applicant_preferred_name','')) > 200
     or char_length(coalesce(p_payload->>'applicant_email','')) > 320
     or char_length(coalesce(p_payload->>'applicant_phone','')) > 64
     or char_length(coalesce(p_payload->>'applicant_nisn','')) > 64 then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  if v_grade is null or not exists (select 1 from public.grade_levels g where g.id=v_grade and g.organization_id=v_cycle.organization_id and g.school_id=v_cycle.school_id and g.is_active) then
    raise exception 'B18_ADMISSION_VALIDATION_FAILED';
  end if;
  if p_payload->>'policy_version' is null or char_length(p_payload->>'policy_version') not between 1 and 128 then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  if p_payload->>'consent_source' <> 'public_submission' then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  if p_payload->>'guardians' is null or jsonb_typeof(p_payload->'guardians') <> 'array' then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  v_guardian_count := jsonb_array_length(p_payload->'guardians');
  if v_guardian_count < 1 or v_guardian_count > 5 then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  select count(*) into v_primary_count from jsonb_array_elements(p_payload->'guardians') g where coalesce((g->>'is_primary')::boolean,false);
  if v_primary_count <> 1 then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;

  select status, semantic_fingerprint, result_payload into v_existing
  from public.admission_command_requests where request_id=p_request_id for update;
  if found then
    if v_existing.semantic_fingerprint <> v_fingerprint then raise exception 'B18_ADMISSION_REQUEST_CONFLICT'; end if;
    if v_existing.status='completed' then return v_existing.result_payload; end if;
    raise exception 'B18_ADMISSION_REQUEST_CONFLICT';
  end if;
  insert into public.admission_command_requests(actor_kind,organization_id,school_id,command,request_id,semantic_fingerprint,status)
  values ('public',v_cycle.organization_id,v_cycle.school_id,'submit_application',p_request_id,v_fingerprint,'started');

  insert into public.admission_applications(organization_id,school_id,admission_cycle_id,target_academic_year_id,target_grade_level_id,application_number,status,applicant_full_name,applicant_preferred_name,applicant_gender,applicant_birth_date,applicant_birth_place,applicant_nisn,applicant_email,applicant_phone,submission_note,submitted_at)
  values (v_cycle.organization_id,v_cycle.school_id,v_cycle.id,v_cycle.academic_year_id,v_grade,v_number,'submitted',p_payload->>'applicant_full_name',nullif(p_payload->>'applicant_preferred_name',''),nullif(p_payload->>'applicant_gender',''),nullif(p_payload->>'applicant_birth_date','')::date,nullif(p_payload->>'applicant_birth_place',''),nullif(p_payload->>'applicant_nisn',''),nullif(p_payload->>'applicant_email',''),nullif(p_payload->>'applicant_phone',''),nullif(p_payload->>'submission_note',''),now());
  for v_guardian in select * from jsonb_array_elements(p_payload->'guardians') loop
    if char_length(coalesce(v_guardian->>'full_name','')) not between 1 and 200 or char_length(coalesce(v_guardian->>'relationship','')) not between 1 and 80 or char_length(coalesce(v_guardian->>'phone','')) > 64 or char_length(coalesce(v_guardian->>'email','')) > 320 then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
    insert into public.admission_application_guardians(organization_id,school_id,application_id,full_name,relationship,phone,email,is_primary)
    values (v_cycle.organization_id,v_cycle.school_id,v_app_id,v_guardian->>'full_name',v_guardian->>'relationship',nullif(v_guardian->>'phone',''),nullif(v_guardian->>'email',''),coalesce((v_guardian->>'is_primary')::boolean,false)) returning id into v_guardian_id;
  end loop;
  insert into public.admission_consents(organization_id,school_id,application_id,policy_version,consented_at,consent_source)
  values (v_cycle.organization_id,v_cycle.school_id,v_app_id,p_payload->>'policy_version',coalesce(nullif(p_payload->>'consented_at','')::timestamptz,now()),'public_submission');
  insert into public.admission_stage_history(organization_id,school_id,application_id,from_status,to_status,actor_kind,request_id,occurred_at)
  values (v_cycle.organization_id,v_cycle.school_id,v_app_id,null,'submitted','public',p_request_id,now());
  v_result := jsonb_build_object('application_id',v_app_id,'application_reference',v_number,'status','submitted','submitted_at',now(),'cycle_id',v_cycle.id,'cycle_name',v_cycle.name);
  update public.admission_command_requests set status='completed',completed_at=now(),result_payload=v_result where request_id=p_request_id;
  insert into public.audit_logs(organization_id,school_id,actor_profile_id,actor_type,action,entity_type,entity_id,after_data,metadata)
  values (v_cycle.organization_id,v_cycle.school_id,null,'system','admission_application_submitted','admission_application',v_app_id,jsonb_build_object('status','submitted'),jsonb_build_object('actor_kind','public','request_id',p_request_id));
  return v_result;
exception when unique_violation then
  raise exception 'B18_ADMISSION_REQUEST_CONFLICT';
end;
$$;

create or replace function public.b18_get_public_admission_cycle(p_admission_cycle_id uuid)
returns table(id uuid,name text,school_name text,academic_year_name text,opens_at timestamptz,closes_at timestamptz,available boolean,grades jsonb)
language sql
security definer
set search_path = ''
as $$
  select c.id,c.name,s.name,ay.name,c.opens_at,c.closes_at,
    (c.status='open' and ay.status not in ('closed','archived') and (c.opens_at is null or now()>=c.opens_at) and (c.closes_at is null or now()<=c.closes_at)),
    coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'code',g.code) order by g.sequence) from public.grade_levels g where g.organization_id=c.organization_id and g.school_id=c.school_id and g.is_active),'[]'::jsonb)
  from public.admission_cycles c join public.schools s on s.id=c.school_id and s.organization_id=c.organization_id join public.academic_years ay on ay.id=c.academic_year_id and ay.organization_id=c.organization_id and ay.school_id=c.school_id
  where c.id=p_admission_cycle_id and c.status='open' and ay.status not in ('closed','archived');
$$;

create or replace function public.b18_cycle_transition(p_cycle_id uuid,p_expected_row_version bigint,p_request_id uuid,p_reason text,p_command text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c record; e record; fp text; perm text; target text; result jsonb;
begin
  select * into c from public.admission_cycles where id=p_cycle_id for update;
  if not found then raise exception 'B18_ADMISSION_NOT_FOUND'; end if;
  perm:=case when p_command in ('open_cycle','close_cycle','reopen_cycle','archive_cycle') then 'admission.manage_cycle' end;
  if not public.has_permission(perm,c.organization_id,c.school_id) then raise exception 'B18_ADMISSION_FORBIDDEN'; end if;
  if p_request_id is null then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  if p_command='reopen_cycle' and char_length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  fp:=md5(concat(p_cycle_id::text,'|',p_expected_row_version,'|',p_command,'|',coalesce(p_reason,'')));
  select status,semantic_fingerprint,result_payload into e from public.admission_command_requests where request_id=p_request_id for update;
  if found then if e.semantic_fingerprint<>fp then raise exception 'B18_ADMISSION_REQUEST_CONFLICT'; elsif e.status='completed' then return e.result_payload; else raise exception 'B18_ADMISSION_REQUEST_CONFLICT'; end if; end if;
  if c.row_version<>p_expected_row_version then raise exception 'B18_ADMISSION_STALE_VERSION'; end if;
  insert into public.admission_command_requests(actor_kind,actor_profile_id,organization_id,school_id,command,request_id,semantic_fingerprint,status) values ('staff',auth.uid(),c.organization_id,c.school_id,p_command,p_request_id,fp,'started');
  if p_command='open_cycle' then
    if c.status<>'draft' or not exists(select 1 from public.academic_years y where y.id=c.academic_year_id and y.organization_id=c.organization_id and y.school_id=c.school_id and y.status in ('draft','active')) then raise exception 'B18_ADMISSION_INVALID_STATE'; end if; target:='open';
  elsif p_command='close_cycle' then if c.status<>'open' then raise exception 'B18_ADMISSION_INVALID_STATE'; end if; target:='closed';
  elsif p_command='reopen_cycle' then if c.status<>'closed' or not exists(select 1 from public.academic_years y where y.id=c.academic_year_id and y.organization_id=c.organization_id and y.school_id=c.school_id and y.status not in ('closed','archived')) then raise exception 'B18_ADMISSION_INVALID_STATE'; end if; target:='open';
  elsif p_command='archive_cycle' then if c.status<>'closed' then raise exception 'B18_ADMISSION_INVALID_STATE'; end if; target:='archived';
  else raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  update public.admission_cycles set status=target where id=c.id and row_version=p_expected_row_version;
  if not found then raise exception 'B18_ADMISSION_STALE_VERSION'; end if;
  result:=jsonb_build_object('cycle_id',c.id,'status',target,'row_version',p_expected_row_version+1);
  update public.admission_command_requests set status='completed',completed_at=now(),result_payload=result where request_id=p_request_id;
  insert into public.audit_logs(organization_id,school_id,actor_profile_id,actor_type,action,entity_type,entity_id,before_data,after_data,metadata) values(c.organization_id,c.school_id,auth.uid(), 'user',p_command,'admission_cycle',c.id,jsonb_build_object('status',c.status,'row_version',c.row_version),jsonb_build_object('status',target,'row_version',p_expected_row_version+1),jsonb_build_object('request_id',p_request_id,'reason',nullif(p_reason,'')));
  return result;
end; $$;

create or replace function public.b18_open_admission_cycle(p_cycle_id uuid,p_expected_row_version bigint,p_request_id uuid) returns jsonb language sql security definer set search_path='' as $$ select public.b18_cycle_transition(p_cycle_id,p_expected_row_version,p_request_id,null,'open_cycle') $$;
create or replace function public.b18_close_admission_cycle(p_cycle_id uuid,p_expected_row_version bigint,p_request_id uuid) returns jsonb language sql security definer set search_path='' as $$ select public.b18_cycle_transition(p_cycle_id,p_expected_row_version,p_request_id,null,'close_cycle') $$;
create or replace function public.b18_reopen_admission_cycle(p_cycle_id uuid,p_expected_row_version bigint,p_request_id uuid,p_reason text) returns jsonb language sql security definer set search_path='' as $$ select public.b18_cycle_transition(p_cycle_id,p_expected_row_version,p_request_id,p_reason,'reopen_cycle') $$;
create or replace function public.b18_archive_admission_cycle(p_cycle_id uuid,p_expected_row_version bigint,p_request_id uuid) returns jsonb language sql security definer set search_path='' as $$ select public.b18_cycle_transition(p_cycle_id,p_expected_row_version,p_request_id,null,'archive_cycle') $$;

create or replace function public.b18_transition_admission_application(p_application_id uuid,p_expected_row_version bigint,p_request_id uuid,p_command text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a record;e record;fp text;perm text;target text;result jsonb;
begin
 select * into a from public.admission_applications where id=p_application_id for update;
 if not found then raise exception 'B18_ADMISSION_NOT_FOUND'; end if;
 perm:=case when p_command='start_review' then 'admission.review' when p_command='withdraw_application' then 'admission.review' when p_command in ('accept_application','reject_application') then 'admission.decide' else null end;
 if perm is null or not public.has_permission(perm,a.organization_id,a.school_id) then raise exception 'B18_ADMISSION_FORBIDDEN'; end if;
 if p_request_id is null then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
 if p_command in ('reject_application','withdraw_application') and char_length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
 fp:=md5(concat(p_application_id::text,'|',p_expected_row_version,'|',p_command,'|',coalesce(p_reason,'')));
 select status,semantic_fingerprint,result_payload into e from public.admission_command_requests where request_id=p_request_id for update;
 if found then if e.semantic_fingerprint<>fp then raise exception 'B18_ADMISSION_REQUEST_CONFLICT'; elsif e.status='completed' then return e.result_payload; else raise exception 'B18_ADMISSION_REQUEST_CONFLICT'; end if; end if;
 if a.row_version<>p_expected_row_version then raise exception 'B18_ADMISSION_STALE_VERSION'; end if;
 insert into public.admission_command_requests(actor_kind,actor_profile_id,organization_id,school_id,command,request_id,semantic_fingerprint,status) values('staff',auth.uid(),a.organization_id,a.school_id,p_command,p_request_id,fp,'started');
 target:=case p_command when 'start_review' then 'under_review' when 'accept_application' then 'accepted' when 'reject_application' then 'rejected' when 'withdraw_application' then 'withdrawn' end;
 if (p_command='start_review' and a.status<>'submitted') or (p_command='accept_application' and a.status<>'under_review') or (p_command='reject_application' and a.status not in ('submitted','under_review')) or (p_command='withdraw_application' and a.status not in ('submitted','under_review','accepted')) then raise exception 'B18_ADMISSION_INVALID_STATE'; end if;
 update public.admission_applications set status=target,decided_at=case when p_command in ('accept_application','reject_application') then now() else decided_at end,decided_by_profile_id=case when p_command in ('accept_application','reject_application') then auth.uid() else decided_by_profile_id end,decision_reason=case when p_command in ('accept_application','reject_application') then nullif(p_reason,'') else decision_reason end where id=a.id and row_version=p_expected_row_version;
 if not found then raise exception 'B18_ADMISSION_STALE_VERSION'; end if;
 insert into public.admission_stage_history(organization_id,school_id,application_id,from_status,to_status,actor_kind,actor_profile_id,request_id,reason) values(a.organization_id,a.school_id,a.id,a.status,target,'staff',auth.uid(),p_request_id,nullif(p_reason,''));
 result:=jsonb_build_object('application_id',a.id,'status',target,'row_version',p_expected_row_version+1);
 update public.admission_command_requests set status='completed',completed_at=now(),result_payload=result where request_id=p_request_id;
 insert into public.audit_logs(organization_id,school_id,actor_profile_id,actor_type,action,entity_type,entity_id,before_data,after_data,metadata) values(a.organization_id,a.school_id,auth.uid(),'user',p_command,'admission_application',a.id,jsonb_build_object('status',a.status,'row_version',a.row_version),jsonb_build_object('status',target,'row_version',p_expected_row_version+1),jsonb_build_object('request_id',p_request_id,'reason',nullif(p_reason,'')));
 return result;
end; $$;

create or replace function public.b18_start_admission_review(p_application_id uuid,p_expected_row_version bigint,p_request_id uuid) returns jsonb language sql security definer set search_path='' as $$ select public.b18_transition_admission_application(p_application_id,p_expected_row_version,p_request_id,'start_review',null) $$;
create or replace function public.b18_accept_admission_application(p_application_id uuid,p_expected_row_version bigint,p_request_id uuid,p_reason text default null) returns jsonb language sql security definer set search_path='' as $$ select public.b18_transition_admission_application(p_application_id,p_expected_row_version,p_request_id,'accept_application',p_reason) $$;
create or replace function public.b18_reject_admission_application(p_application_id uuid,p_expected_row_version bigint,p_request_id uuid,p_reason text) returns jsonb language sql security definer set search_path='' as $$ select public.b18_transition_admission_application(p_application_id,p_expected_row_version,p_request_id,'reject_application',p_reason) $$;
create or replace function public.b18_withdraw_admission_application(p_application_id uuid,p_expected_row_version bigint,p_request_id uuid,p_reason text) returns jsonb language sql security definer set search_path='' as $$ select public.b18_transition_admission_application(p_application_id,p_expected_row_version,p_request_id,'withdraw_application',p_reason) $$;

create or replace function public.b18_convert_admission_application(p_application_id uuid,p_expected_row_version bigint,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a record;c record;e record;g record;fp text;result jsonb;v_student uuid;v_guardian uuid;v_enrollment uuid;v_conversion uuid;v_count int:=0;
begin
 select a.*,c.status cycle_status,c.academic_year_id,c.name cycle_name,y.status year_status into a from public.admission_applications a join public.admission_cycles c on c.id=a.admission_cycle_id and c.organization_id=a.organization_id and c.school_id=a.school_id join public.academic_years y on y.id=a.target_academic_year_id and y.organization_id=a.organization_id and y.school_id=a.school_id where a.id=p_application_id for update;
 if not found then raise exception 'B18_ADMISSION_NOT_FOUND'; end if;
 if not public.has_permission('admission.convert',a.organization_id,a.school_id) then raise exception 'B18_ADMISSION_FORBIDDEN'; end if;
 if a.status='converted' then raise exception 'B18_ADMISSION_ALREADY_CONVERTED'; end if;
 if a.status<>'accepted' then raise exception 'B18_ADMISSION_INVALID_STATE'; end if;
 if a.year_status in ('closed','archived') then raise exception 'B18_ADMISSION_PERIOD_CLOSED'; end if;
 fp:=md5(concat(p_application_id::text,'|',p_expected_row_version,'|convert_application'));
 select status,semantic_fingerprint,result_payload into e from public.admission_command_requests where request_id=p_request_id for update;
 if found then if e.semantic_fingerprint<>fp then raise exception 'B18_ADMISSION_REQUEST_CONFLICT'; elsif e.status='completed' then return e.result_payload; else raise exception 'B18_ADMISSION_REQUEST_CONFLICT'; end if; end if;
 if a.row_version<>p_expected_row_version then raise exception 'B18_ADMISSION_STALE_VERSION'; end if;
 insert into public.admission_command_requests(actor_kind,actor_profile_id,organization_id,school_id,command,request_id,semantic_fingerprint,status) values('staff',auth.uid(),a.organization_id,a.school_id,'convert_application',p_request_id,fp,'started');
 if a.applicant_nisn is not null and exists(select 1 from public.students s where s.organization_id=a.organization_id and s.nisn=a.applicant_nisn) then raise exception 'B18_ADMISSION_POSSIBLE_DUPLICATE'; end if;
 if not exists(select 1 from public.admission_application_guardians ag where ag.application_id=a.id) then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
 insert into public.students(organization_id,nisn,full_name,preferred_name,gender,birth_date,birth_place,status) values(a.organization_id,a.applicant_nisn,a.applicant_full_name,a.applicant_preferred_name,a.applicant_gender,a.applicant_birth_date,a.applicant_birth_place,'active') returning id into v_student;
 for g in select * from public.admission_application_guardians where application_id=a.id order by is_primary desc,created_at loop
   insert into public.guardians(organization_id,full_name,phone,email,status) values(a.organization_id,g.full_name,g.phone,g.email,'active') returning id into v_guardian;
   insert into public.student_guardians(organization_id,student_id,guardian_id,relationship_type,is_primary,status) values(a.organization_id,v_student,v_guardian,g.relationship,g.is_primary,'active');
   v_count:=v_count+1;
 end loop;
 insert into public.student_enrollments(organization_id,school_id,student_id,academic_year_id,grade_level_id,status,enrolled_on) values(a.organization_id,a.school_id,v_student,a.target_academic_year_id,a.target_grade_level_id,'draft',current_date) returning id into v_enrollment;
 insert into public.admission_conversions(organization_id,school_id,application_id,student_id,student_enrollment_id,converted_by_profile_id,request_id) values(a.organization_id,a.school_id,a.id,v_student,v_enrollment,auth.uid(),p_request_id) returning id into v_conversion;
 update public.admission_applications set status='converted' where id=a.id and row_version=p_expected_row_version;
 insert into public.admission_stage_history(organization_id,school_id,application_id,from_status,to_status,actor_kind,actor_profile_id,request_id) values(a.organization_id,a.school_id,a.id,'accepted','converted','staff',auth.uid(),p_request_id);
 result:=jsonb_build_object('application_id',a.id,'student_id',v_student,'student_enrollment_id',v_enrollment,'conversion_id',v_conversion,'status','converted','guardian_count',v_count);
 update public.admission_command_requests set status='completed',completed_at=now(),result_payload=result where request_id=p_request_id;
 insert into public.audit_logs(organization_id,school_id,actor_profile_id,actor_type,action,entity_type,entity_id,before_data,after_data,metadata) values(a.organization_id,a.school_id,auth.uid(),'user','convert_application','admission_application',a.id,jsonb_build_object('status','accepted'),jsonb_build_object('status','converted'),jsonb_build_object('request_id',p_request_id,'student_id',v_student,'student_enrollment_id',v_enrollment,'guardian_count',v_count));
 return result;
end; $$;

create or replace function public.b18_list_admission_cycles(p_school_id uuid default null)
returns table(id uuid,school_id uuid,academic_year_id uuid,name text,status text,row_version bigint,opens_at timestamptz,closes_at timestamptz)
language sql security definer set search_path='' as $$
 select c.id,c.school_id,c.academic_year_id,c.name,c.status,c.row_version,c.opens_at,c.closes_at from public.admission_cycles c where (p_school_id is null or c.school_id=p_school_id) and public.has_permission('admission.read',c.organization_id,c.school_id) order by c.created_at desc limit 100
$$;

create or replace function public.b18_get_admission_cycle(p_cycle_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare c record;begin select * into c from public.admission_cycles where id=p_cycle_id; if not found or not public.has_permission('admission.read',c.organization_id,c.school_id) then raise exception 'B18_ADMISSION_NOT_FOUND'; end if; return to_jsonb(c); end; $$;

create or replace function public.b18_list_admission_applications(p_cycle_id uuid default null,p_status text default null,p_grade_level_id uuid default null,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$ declare v_limit int:=least(greatest(coalesce(p_limit,50),1),100); v_offset int:=greatest(coalesce(p_offset,0),0); v_org uuid;v_school uuid;items jsonb;total int;begin select organization_id,school_id into v_org,v_school from public.admission_cycles where id=p_cycle_id; if p_cycle_id is not null and (v_org is null or not public.has_permission('admission.read',v_org,v_school)) then raise exception 'B18_ADMISSION_NOT_FOUND'; end if; if p_cycle_id is null then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if; select count(*) into total from public.admission_applications a where a.admission_cycle_id=p_cycle_id and (p_status is null or a.status=p_status) and (p_grade_level_id is null or a.target_grade_level_id=p_grade_level_id); select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into items from (select a.id,a.application_number,a.status,a.applicant_full_name,a.target_grade_level_id,a.submitted_at,a.row_version from public.admission_applications a where a.admission_cycle_id=p_cycle_id and (p_status is null or a.status=p_status) and (p_grade_level_id is null or a.target_grade_level_id=p_grade_level_id) order by a.created_at desc limit v_limit offset v_offset) x; return jsonb_build_object('items',items,'limit',v_limit,'offset',v_offset,'total',total); end; $$;

create or replace function public.b18_get_admission_application(p_application_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ declare a record;begin select * into a from public.admission_applications where id=p_application_id; if not found or not public.has_permission('admission.read',a.organization_id,a.school_id) then raise exception 'B18_ADMISSION_NOT_FOUND'; end if; return jsonb_build_object('application',to_jsonb(a),'guardians',coalesce((select jsonb_agg(to_jsonb(g)) from public.admission_application_guardians g where g.application_id=a.id),'[]'::jsonb),'consents',coalesce((select jsonb_agg(jsonb_build_object('policy_version',c.policy_version,'consented_at',c.consented_at,'consent_source',c.consent_source)) from public.admission_consents c where c.application_id=a.id),'[]'::jsonb),'stage_history',coalesce((select jsonb_agg(jsonb_build_object('from_status',h.from_status,'to_status',h.to_status,'actor_kind',h.actor_kind,'reason',h.reason,'occurred_at',h.occurred_at) order by h.occurred_at) from public.admission_stage_history h where h.application_id=a.id),'[]'::jsonb),'conversion', (select to_jsonb(c) from public.admission_conversions c where c.application_id=a.id)); end; $$;

revoke all on function public.b18_submit_admission_application(uuid,uuid,jsonb) from public;
revoke all on function public.b18_get_public_admission_cycle(uuid) from public;
grant execute on function public.b18_submit_admission_application(uuid,uuid,jsonb) to anon,authenticated;
grant execute on function public.b18_get_public_admission_cycle(uuid) to anon,authenticated;

do $$ declare n text; begin foreach n in array array['b18_open_admission_cycle','b18_close_admission_cycle','b18_reopen_admission_cycle','b18_archive_admission_cycle','b18_start_admission_review','b18_accept_admission_application','b18_reject_admission_application','b18_withdraw_admission_application','b18_convert_admission_application','b18_list_admission_cycles','b18_get_admission_cycle','b18_list_admission_applications','b18_get_admission_application'] loop execute format('revoke all on function public.%I from public,anon,authenticated',n); end loop; end $$;
grant execute on function public.b18_open_admission_cycle(uuid,bigint,uuid) to authenticated;
grant execute on function public.b18_close_admission_cycle(uuid,bigint,uuid) to authenticated;
grant execute on function public.b18_reopen_admission_cycle(uuid,bigint,uuid,text) to authenticated;
grant execute on function public.b18_archive_admission_cycle(uuid,bigint,uuid) to authenticated;
grant execute on function public.b18_start_admission_review(uuid,bigint,uuid) to authenticated;
grant execute on function public.b18_accept_admission_application(uuid,bigint,uuid,text) to authenticated;
grant execute on function public.b18_reject_admission_application(uuid,bigint,uuid,text) to authenticated;
grant execute on function public.b18_withdraw_admission_application(uuid,bigint,uuid,text) to authenticated;
grant execute on function public.b18_convert_admission_application(uuid,bigint,uuid) to authenticated;
grant execute on function public.b18_list_admission_cycles(uuid) to authenticated;
grant execute on function public.b18_get_admission_cycle(uuid) to authenticated;
grant execute on function public.b18_list_admission_applications(uuid,text,uuid,integer,integer) to authenticated;
grant execute on function public.b18_get_admission_application(uuid) to authenticated;
