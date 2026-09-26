-- Forward-only fix: preserve the applied Phase-2 runtime migration and ensure
-- the generated application UUID is used by all child rows.
create or replace function public.b18_submit_admission_application(
  p_admission_cycle_id uuid,
  p_request_id uuid,
  p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cycle record; v_existing record; v_app_id uuid := gen_random_uuid();
  v_fingerprint text := md5(concat(p_admission_cycle_id::text, '|', p_payload::text));
  v_number text := 'B18-' || upper(substr(replace(v_app_id::text, '-', ''), 1, 12));
  v_grade uuid := nullif(p_payload->>'target_grade_level_id','')::uuid;
  v_guardian jsonb; v_guardian_count integer; v_primary_count integer; v_result jsonb;
begin
  if p_request_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  select c.*, ay.status as academic_year_status into v_cycle
  from public.admission_cycles c join public.academic_years ay on ay.id=c.academic_year_id and ay.organization_id=c.organization_id and ay.school_id=c.school_id
  where c.id=p_admission_cycle_id for update;
  if not found then raise exception 'B18_ADMISSION_NOT_FOUND'; end if;
  if v_cycle.status <> 'open' then raise exception 'B18_ADMISSION_CYCLE_NOT_OPEN'; end if;
  if v_cycle.academic_year_status in ('closed','archived') then raise exception 'B18_ADMISSION_PERIOD_CLOSED'; end if;
  if v_cycle.opens_at is not null and now() < v_cycle.opens_at then raise exception 'B18_ADMISSION_CYCLE_NOT_OPEN'; end if;
  if v_cycle.closes_at is not null and now() > v_cycle.closes_at then raise exception 'B18_ADMISSION_CYCLE_NOT_OPEN'; end if;
  if char_length(coalesce(p_payload->>'applicant_full_name','')) not between 1 and 200 then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  if char_length(coalesce(p_payload->>'applicant_preferred_name','')) > 200 or char_length(coalesce(p_payload->>'applicant_email','')) > 320 or char_length(coalesce(p_payload->>'applicant_phone','')) > 64 or char_length(coalesce(p_payload->>'applicant_nisn','')) > 64 then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  if v_grade is null or not exists(select 1 from public.grade_levels g where g.id=v_grade and g.organization_id=v_cycle.organization_id and g.school_id=v_cycle.school_id and g.is_active) then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  if p_payload->>'policy_version' is null or char_length(p_payload->>'policy_version') not between 1 and 128 or p_payload->>'consent_source' <> 'public_submission' then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  if p_payload->>'guardians' is null or jsonb_typeof(p_payload->'guardians') <> 'array' then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  v_guardian_count:=jsonb_array_length(p_payload->'guardians');
  if v_guardian_count<1 or v_guardian_count>5 then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  select count(*) into v_primary_count from jsonb_array_elements(p_payload->'guardians') g where coalesce((g->>'is_primary')::boolean,false);
  if v_primary_count<>1 then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
  select status,semantic_fingerprint,result_payload into v_existing from public.admission_command_requests where request_id=p_request_id for update;
  if found then if v_existing.semantic_fingerprint<>v_fingerprint then raise exception 'B18_ADMISSION_REQUEST_CONFLICT'; elsif v_existing.status='completed' then return v_existing.result_payload; else raise exception 'B18_ADMISSION_REQUEST_CONFLICT'; end if; end if;
  insert into public.admission_command_requests(actor_kind,organization_id,school_id,command,request_id,semantic_fingerprint,status) values('public',v_cycle.organization_id,v_cycle.school_id,'submit_application',p_request_id,v_fingerprint,'started');
  insert into public.admission_applications(id,organization_id,school_id,admission_cycle_id,target_academic_year_id,target_grade_level_id,application_number,status,applicant_full_name,applicant_preferred_name,applicant_gender,applicant_birth_date,applicant_birth_place,applicant_nisn,applicant_email,applicant_phone,submission_note,submitted_at)
  values(v_app_id,v_cycle.organization_id,v_cycle.school_id,v_cycle.id,v_cycle.academic_year_id,v_grade,v_number,'submitted',p_payload->>'applicant_full_name',nullif(p_payload->>'applicant_preferred_name',''),nullif(p_payload->>'applicant_gender',''),nullif(p_payload->>'applicant_birth_date','')::date,nullif(p_payload->>'applicant_birth_place',''),nullif(p_payload->>'applicant_nisn',''),nullif(p_payload->>'applicant_email',''),nullif(p_payload->>'applicant_phone',''),nullif(p_payload->>'submission_note',''),now());
  for v_guardian in select * from jsonb_array_elements(p_payload->'guardians') loop
    if char_length(coalesce(v_guardian->>'full_name','')) not between 1 and 200 or char_length(coalesce(v_guardian->>'relationship','')) not between 1 and 80 or char_length(coalesce(v_guardian->>'phone',''))>64 or char_length(coalesce(v_guardian->>'email',''))>320 then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
    insert into public.admission_application_guardians(organization_id,school_id,application_id,full_name,relationship,phone,email,is_primary) values(v_cycle.organization_id,v_cycle.school_id,v_app_id,v_guardian->>'full_name',v_guardian->>'relationship',nullif(v_guardian->>'phone',''),nullif(v_guardian->>'email',''),coalesce((v_guardian->>'is_primary')::boolean,false));
  end loop;
  insert into public.admission_consents(organization_id,school_id,application_id,policy_version,consented_at,consent_source) values(v_cycle.organization_id,v_cycle.school_id,v_app_id,p_payload->>'policy_version',coalesce(nullif(p_payload->>'consented_at','')::timestamptz,now()),'public_submission');
  insert into public.admission_stage_history(organization_id,school_id,application_id,from_status,to_status,actor_kind,request_id) values(v_cycle.organization_id,v_cycle.school_id,v_app_id,null,'submitted','public',p_request_id);
  v_result:=jsonb_build_object('application_id',v_app_id,'application_reference',v_number,'status','submitted','submitted_at',now(),'cycle_id',v_cycle.id,'cycle_name',v_cycle.name);
  update public.admission_command_requests set status='completed',completed_at=now(),result_payload=v_result where request_id=p_request_id;
  insert into public.audit_logs(organization_id,school_id,actor_type,action,entity_type,entity_id,after_data,metadata) values(v_cycle.organization_id,v_cycle.school_id,'system','admission_application_submitted','admission_application',v_app_id,jsonb_build_object('status','submitted'),jsonb_build_object('actor_kind','public','request_id',p_request_id));
  return v_result;
exception when unique_violation then raise exception 'B18_ADMISSION_REQUEST_CONFLICT';
end; $$;
