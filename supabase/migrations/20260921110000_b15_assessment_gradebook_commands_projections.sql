-- Batch 15 Phase 2: authenticated assessment/gradebook commands and bounded
-- projections. Phase 3 deliberately keeps the legacy UI on its current path.

-- The existing capability is specifically defined as locked/final score
-- mutation and is already enforced by the B6 score guards.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'score.update_locked'
where r.organization_id is null and r.code = 'PRINCIPAL'
on conflict (role_id, permission_id) do nothing;

create or replace function public.b15_assessment_request_fingerprint(p_payload jsonb)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select pg_catalog.encode(extensions.digest(p_payload::text, 'sha256'), 'hex')
$$;

revoke all on function public.b15_assessment_request_fingerprint(jsonb) from public, anon, authenticated, service_role;

create or replace function public.b15_assessment_create(
  p_organization_id uuid,
  p_school_id uuid,
  p_academic_year_id uuid,
  p_term_id uuid,
  p_teaching_assignment_id uuid,
  p_assessment_type_id uuid,
  p_title text,
  p_description text,
  p_assessment_date date,
  p_min_score numeric,
  p_max_score numeric,
  p_weight numeric,
  p_request_id uuid
)
returns table(assessment_id uuid, status text, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_classroom uuid;
  v_payload jsonb;
  v_fingerprint text;
  v_existing public.assessment_command_requests;
  v_id uuid;
  v_version bigint;
begin
  if v_actor is null then raise exception 'B15_ASSESSMENT_AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'B15_ASSESSMENT_REQUEST_CONFLICT'; end if;
  v_payload := jsonb_build_object(
    'organization_id', p_organization_id, 'school_id', p_school_id,
    'academic_year_id', p_academic_year_id, 'term_id', p_term_id,
    'teaching_assignment_id', p_teaching_assignment_id,
    'assessment_type_id', p_assessment_type_id, 'title', btrim(p_title),
    'description', p_description, 'assessment_date', p_assessment_date,
    'min_score', p_min_score, 'max_score', p_max_score, 'weight', p_weight);
  v_fingerprint := public.b15_assessment_request_fingerprint(v_payload);
  select * into v_existing from public.assessment_command_requests c
   where c.actor_profile_id=v_actor and c.command_name='create_assessment' and c.request_id=p_request_id
   for update;
  if found then
    if v_existing.payload_fingerprint <> v_fingerprint or v_existing.organization_id <> p_organization_id or v_existing.school_id <> p_school_id then
      raise exception 'B15_ASSESSMENT_REQUEST_CONFLICT';
    end if;
    if v_existing.status='completed' then
      return query select (v_existing.result_payload->>'assessment_id')::uuid,
        v_existing.result_payload->>'status', (v_existing.result_payload->>'version')::bigint;
      return;
    end if;
    raise exception 'B15_ASSESSMENT_REQUEST_CONFLICT';
  end if;
  select ta.classroom_id into v_classroom from public.teaching_assignments ta
   where ta.id=p_teaching_assignment_id and ta.organization_id=p_organization_id and ta.school_id=p_school_id
     and ta.academic_year_id=p_academic_year_id and ta.term_id is not distinct from p_term_id;
  if v_classroom is null or not public.can_manage_assessment_context(
    'assessment.create', p_organization_id, p_school_id, p_academic_year_id, p_term_id, p_teaching_assignment_id) then
    raise exception 'B15_ASSESSMENT_FORBIDDEN';
  end if;
  insert into public.assessment_command_requests(organization_id,school_id,actor_profile_id,request_id,command_name,payload_fingerprint)
  values(p_organization_id,p_school_id,v_actor,p_request_id,'create_assessment',v_fingerprint);
  insert into public.assessments(
    organization_id,school_id,academic_year_id,term_id,teaching_assignment_id,assessment_type_id,
    title,description,assessment_date,min_score,max_score,weight,status,created_by_profile_id)
  values(p_organization_id,p_school_id,p_academic_year_id,p_term_id,p_teaching_assignment_id,p_assessment_type_id,
    btrim(p_title),p_description,p_assessment_date,coalesce(p_min_score,0),coalesce(p_max_score,100),p_weight,'draft',v_actor)
  returning id, assessments.version into v_id, v_version;
  update public.assessment_command_requests c set resource_type='assessment',resource_id=v_id,
    result_payload=jsonb_build_object('assessment_id',v_id,'status','draft','version',v_version),
    status='completed',completed_at=pg_catalog.clock_timestamp()
   where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='create_assessment';
  return query select v_id,'draft'::text,v_version;
end
$$;

create or replace function public.b15_assessment_update_draft(
  p_assessment_id uuid,
  p_organization_id uuid,
  p_school_id uuid,
  p_expected_version bigint,
  p_assessment_type_id uuid,
  p_title text,
  p_description text,
  p_assessment_date date,
  p_min_score numeric,
  p_max_score numeric,
  p_weight numeric,
  p_request_id uuid
)
returns table(assessment_id uuid,status text,version bigint)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v public.assessments%rowtype; n bigint; payload jsonb; fp text; e public.assessment_command_requests;
begin
  if v_actor is null then raise exception 'B15_ASSESSMENT_AUTH_REQUIRED'; end if;
  payload:=jsonb_build_object('assessment_id',p_assessment_id,'organization_id',p_organization_id,'school_id',p_school_id,'expected_version',p_expected_version,'assessment_type_id',p_assessment_type_id,'title',btrim(p_title),'description',p_description,'assessment_date',p_assessment_date,'min_score',p_min_score,'max_score',p_max_score,'weight',p_weight);
  fp:=public.b15_assessment_request_fingerprint(payload);
  select * into e from public.assessment_command_requests c where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='update_assessment_draft' for update;
  if found then
    if e.payload_fingerprint<>fp or e.organization_id<>p_organization_id or e.school_id<>p_school_id then raise exception 'B15_ASSESSMENT_REQUEST_CONFLICT'; end if;
    if e.status='completed' then return query select (e.result_payload->>'assessment_id')::uuid,e.result_payload->>'status',(e.result_payload->>'version')::bigint; return; end if;
    raise exception 'B15_ASSESSMENT_REQUEST_CONFLICT';
  end if;
  select * into v from public.assessments a where a.id=p_assessment_id and a.organization_id=p_organization_id and a.school_id=p_school_id for update;
  if not found then raise exception 'B15_ASSESSMENT_NOT_FOUND'; end if;
  if v.status<>'draft' then raise exception 'B15_ASSESSMENT_INVALID_STATE'; end if;
  if v.version<>p_expected_version then raise exception 'B15_ASSESSMENT_STALE_VERSION'; end if;
  if not public.can_manage_assessment_update_context('assessment.update_own',p_assessment_id,p_organization_id,p_school_id,v.academic_year_id,v.term_id,v.teaching_assignment_id) then raise exception 'B15_ASSESSMENT_FORBIDDEN'; end if;
  insert into public.assessment_command_requests(organization_id,school_id,actor_profile_id,request_id,command_name,payload_fingerprint) values(p_organization_id,p_school_id,v_actor,p_request_id,'update_assessment_draft',fp);
  update public.assessments a set assessment_type_id=p_assessment_type_id,title=btrim(p_title),description=p_description,assessment_date=p_assessment_date,min_score=p_min_score,max_score=p_max_score,weight=p_weight
   where a.id=p_assessment_id and a.version=p_expected_version returning a.status,a.version into v.status,n;
  if not found then raise exception 'B15_ASSESSMENT_STALE_VERSION'; end if;
  update public.assessment_command_requests c set resource_type='assessment',resource_id=p_assessment_id,result_payload=jsonb_build_object('assessment_id',p_assessment_id,'status',v.status,'version',n),status='completed',completed_at=pg_catalog.clock_timestamp() where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='update_assessment_draft';
  return query select p_assessment_id,v.status,n;
end $$;

create or replace function public.b15_assessment_transition(
  p_assessment_id uuid,p_organization_id uuid,p_school_id uuid,p_action text,p_expected_version bigint,p_request_id uuid)
returns table(assessment_id uuid,status text,version bigint)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v public.assessments%rowtype; e public.assessment_command_requests; fp text; payload jsonb; target text; n bigint;
begin
  if v_actor is null then raise exception 'B15_ASSESSMENT_AUTH_REQUIRED'; end if;
  if p_action not in ('open','close','publish','archive') then raise exception 'B15_ASSESSMENT_INVALID_STATE'; end if;
  payload:=jsonb_build_object('assessment_id',p_assessment_id,'organization_id',p_organization_id,'school_id',p_school_id,'action',p_action,'expected_version',p_expected_version); fp:=public.b15_assessment_request_fingerprint(payload);
  select * into e from public.assessment_command_requests c where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='transition_assessment' for update;
  if found then
    if e.payload_fingerprint<>fp or e.organization_id<>p_organization_id or e.school_id<>p_school_id then raise exception 'B15_ASSESSMENT_REQUEST_CONFLICT'; end if;
    if e.status='completed' then return query select (e.result_payload->>'assessment_id')::uuid,e.result_payload->>'status',(e.result_payload->>'version')::bigint; return; end if;
    raise exception 'B15_ASSESSMENT_REQUEST_CONFLICT';
  end if;
  select * into v from public.assessments a where a.id=p_assessment_id and a.organization_id=p_organization_id and a.school_id=p_school_id for update;
  if not found then raise exception 'B15_ASSESSMENT_NOT_FOUND'; end if;
  if v.version<>p_expected_version then raise exception 'B15_ASSESSMENT_STALE_VERSION'; end if;
  target:=case p_action when 'open' then 'open' when 'close' then 'closed' when 'publish' then 'published' else 'archived' end;
  if not ((v.status='draft' and target='open') or (v.status='open' and target='closed') or (v.status='closed' and target='published') or (v.status in ('draft','open','closed','published') and target='archived')) then raise exception 'B15_ASSESSMENT_INVALID_STATE'; end if;
  if p_action='publish' then
    if not public.has_permission('assessment.publish',p_organization_id,p_school_id,null) then raise exception 'B15_ASSESSMENT_FORBIDDEN'; end if;
  elsif p_action='archive' then
    if not public.has_permission('assessment.archive_own',p_organization_id,p_school_id,null) then raise exception 'B15_ASSESSMENT_FORBIDDEN'; end if;
  elsif not public.can_manage_assessment_update_context('assessment.update_own',p_assessment_id,p_organization_id,p_school_id,v.academic_year_id,v.term_id,v.teaching_assignment_id) then
    raise exception 'B15_ASSESSMENT_FORBIDDEN';
  end if;
  insert into public.assessment_command_requests(organization_id,school_id,actor_profile_id,request_id,command_name,payload_fingerprint) values(p_organization_id,p_school_id,v_actor,p_request_id,'transition_assessment',fp);
  update public.assessments a set status=target where a.id=p_assessment_id and a.version=p_expected_version returning a.status,a.version into v.status,n;
  if not found then raise exception 'B15_ASSESSMENT_STALE_VERSION'; end if;
  update public.assessment_command_requests c set resource_type='assessment',resource_id=p_assessment_id,result_payload=jsonb_build_object('assessment_id',p_assessment_id,'status',v.status,'version',n),status='completed',completed_at=pg_catalog.clock_timestamp() where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='transition_assessment';
  return query select p_assessment_id,v.status,n;
end $$;

create or replace function public.b15_assessment_save_scores(
  p_assessment_id uuid,p_organization_id uuid,p_school_id uuid,p_expected_assessment_version bigint,p_entries jsonb,p_request_id uuid)
returns table(assessment_id uuid,saved_count bigint,version bigint)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); a public.assessments%rowtype; e public.assessment_command_requests; row jsonb; old_score public.student_scores%rowtype; v_count bigint:=0; fp text; payload jsonb; expected_score_version bigint; sid uuid; score_value numeric; score_status text; feedback_value text; n bigint;
begin
  if v_actor is null then raise exception 'B15_ASSESSMENT_AUTH_REQUIRED'; end if;
  if p_entries is null or jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)>500 then raise exception 'B15_ASSESSMENT_SCORE_INVALID'; end if;
  payload:=jsonb_build_object('assessment_id',p_assessment_id,'organization_id',p_organization_id,'school_id',p_school_id,'expected_assessment_version',p_expected_assessment_version,'entries',(select coalesce(jsonb_agg(x order by x->>'student_enrollment_id'),'[]'::jsonb) from jsonb_array_elements(p_entries) x)); fp:=public.b15_assessment_request_fingerprint(payload);
  select * into e from public.assessment_command_requests c where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='save_assessment_scores' for update;
  if found then
    if e.payload_fingerprint<>fp or e.organization_id<>p_organization_id or e.school_id<>p_school_id then raise exception 'B15_ASSESSMENT_REQUEST_CONFLICT'; end if;
    if e.status='completed' then return query select p_assessment_id,(e.result_payload->>'saved_count')::bigint,(e.result_payload->>'version')::bigint; return; end if;
    raise exception 'B15_ASSESSMENT_REQUEST_CONFLICT';
  end if;
  select * into a from public.assessments x where x.id=p_assessment_id and x.organization_id=p_organization_id and x.school_id=p_school_id for update;
  if not found then raise exception 'B15_ASSESSMENT_NOT_FOUND'; end if;
  if p_expected_assessment_version is not null and a.version<>p_expected_assessment_version then raise exception 'B15_ASSESSMENT_STALE_VERSION'; end if;
  if a.status not in ('draft','open','closed') then raise exception 'B15_ASSESSMENT_PUBLISHED_IMMUTABLE'; end if;
  if not public.has_permission('score.enter',p_organization_id,p_school_id,null) and not public.has_permission('score.update_open',p_organization_id,p_school_id,null) then raise exception 'B15_ASSESSMENT_FORBIDDEN'; end if;
  insert into public.assessment_command_requests(organization_id,school_id,actor_profile_id,request_id,command_name,payload_fingerprint) values(p_organization_id,p_school_id,v_actor,p_request_id,'save_assessment_scores',fp);
  for row in select * from jsonb_array_elements(p_entries) loop
    sid:=(row->>'student_enrollment_id')::uuid; score_status:=row->>'status'; score_value:=nullif(row->>'score','')::numeric; feedback_value:=row->>'feedback'; expected_score_version:=nullif(row->>'expected_score_version','')::bigint;
    if score_status not in ('missing','submitted','excused','final') or ((score_status in ('missing','excused')) and score_value is not null) or ((score_status in ('submitted','final')) and score_value is null) or (score_value is not null and (score_value<a.min_score or score_value>a.max_score)) then raise exception 'B15_ASSESSMENT_SCORE_INVALID'; end if;
    if not exists (select 1 from public.student_enrollments se join public.class_enrollments ce on ce.student_enrollment_id=se.id and ce.organization_id=se.organization_id and ce.school_id=se.school_id where se.id=sid and se.organization_id=p_organization_id and se.school_id=p_school_id and se.academic_year_id=a.academic_year_id and se.status='active' and ce.classroom_id=(select ta.classroom_id from public.teaching_assignments ta where ta.id=a.teaching_assignment_id) and ce.status='active' and ce.is_primary and se.enrolled_on<=pg_catalog.current_date and (se.ended_on is null or se.ended_on>=pg_catalog.current_date) and ce.starts_on<=pg_catalog.current_date and (ce.ends_on is null or ce.ends_on>=pg_catalog.current_date)) then raise exception 'B15_ASSESSMENT_INVALID_ROSTER'; end if;
    select * into old_score from public.student_scores ss where ss.assessment_id=p_assessment_id and ss.student_enrollment_id=sid and ss.organization_id=p_organization_id and ss.school_id=p_school_id for update;
    if found then
      if expected_score_version is null or old_score.version<>expected_score_version then raise exception 'B15_ASSESSMENT_STALE_VERSION'; end if;
      update public.student_scores ss set score=score_value,status=score_status,feedback=feedback_value where ss.id=old_score.id and ss.version=expected_score_version;
    else
      if expected_score_version is not null then raise exception 'B15_ASSESSMENT_STALE_VERSION'; end if;
      insert into public.student_scores(organization_id,school_id,assessment_id,student_enrollment_id,score,status,feedback) values(p_organization_id,p_school_id,p_assessment_id,sid,score_value,score_status,feedback_value);
    end if;
    v_count:=v_count+1;
  end loop;
  update public.assessment_command_requests c set resource_type='assessment',resource_id=p_assessment_id,result_payload=jsonb_build_object('assessment_id',p_assessment_id,'saved_count',v_count,'version',a.version),status='completed',completed_at=pg_catalog.clock_timestamp() where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='save_assessment_scores';
  return query select p_assessment_id,v_count,a.version;
end $$;

create or replace function public.b15_correct_final_score(
  p_assessment_id uuid,p_score_id uuid,p_organization_id uuid,p_school_id uuid,p_expected_score_version bigint,p_new_score numeric,p_new_status text,p_reason text,p_request_id uuid)
returns table(score_id uuid,version bigint,status text)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); a public.assessments%rowtype; s public.student_scores%rowtype; old_score_value numeric; old_status text; e public.assessment_command_requests; fp text; payload jsonb; n bigint;
begin
  if v_actor is null then raise exception 'B15_ASSESSMENT_AUTH_REQUIRED'; end if;
  if p_reason is null or length(btrim(p_reason))=0 or length(btrim(p_reason))>500 then raise exception 'B15_ASSESSMENT_CORRECTION_REASON_REQUIRED'; end if;
  if p_new_status not in ('submitted','final') or p_new_score is null then raise exception 'B15_ASSESSMENT_SCORE_INVALID'; end if;
  payload:=jsonb_build_object('assessment_id',p_assessment_id,'score_id',p_score_id,'organization_id',p_organization_id,'school_id',p_school_id,'expected_score_version',p_expected_score_version,'new_score',p_new_score,'new_status',p_new_status,'reason',btrim(p_reason)); fp:=public.b15_assessment_request_fingerprint(payload);
  select * into e from public.assessment_command_requests c where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='correct_final_score' for update;
  if found then
    if e.payload_fingerprint<>fp or e.organization_id<>p_organization_id or e.school_id<>p_school_id then raise exception 'B15_ASSESSMENT_REQUEST_CONFLICT'; end if;
    if e.status='completed' then return query select (e.result_payload->>'score_id')::uuid,(e.result_payload->>'version')::bigint,e.result_payload->>'status'; return; end if;
    raise exception 'B15_ASSESSMENT_REQUEST_CONFLICT';
  end if;
  select * into a from public.assessments x where x.id=p_assessment_id and x.organization_id=p_organization_id and x.school_id=p_school_id for update;
  select * into s from public.student_scores x where x.id=p_score_id and x.assessment_id=p_assessment_id and x.organization_id=p_organization_id and x.school_id=p_school_id for update;
  if not found or a.status not in ('published','archived') then raise exception 'B15_ASSESSMENT_NOT_FOUND'; end if;
  if not public.has_permission('score.update_locked',p_organization_id,p_school_id,null) then raise exception 'B15_ASSESSMENT_CORRECTION_FORBIDDEN'; end if;
  if s.status<>'final' or s.version<>p_expected_score_version then raise exception 'B15_ASSESSMENT_FINAL_IMMUTABLE'; end if;
  if p_new_score<a.min_score or p_new_score>a.max_score then raise exception 'B15_ASSESSMENT_SCORE_INVALID'; end if;
  old_score_value:=s.score; old_status:=s.status;
  insert into public.assessment_command_requests(organization_id,school_id,actor_profile_id,request_id,command_name,payload_fingerprint) values(p_organization_id,p_school_id,v_actor,p_request_id,'correct_final_score',fp);
  update public.student_scores x set score=p_new_score,status=p_new_status where x.id=p_score_id and x.version=p_expected_score_version returning x.version,x.status into n,s.status;
  insert into public.audit_logs(organization_id,school_id,actor_profile_id,actor_type,action,entity_type,entity_id,before_data,after_data,metadata)
  values(p_organization_id,p_school_id,v_actor,'user','corrected','student_scores',p_score_id,
    jsonb_build_object('score',old_score_value,'status',old_status,'assessment_id',p_assessment_id,'student_enrollment_id',s.student_enrollment_id),
    jsonb_build_object('score',p_new_score,'status',p_new_status,'assessment_id',p_assessment_id,'student_enrollment_id',s.student_enrollment_id),
    jsonb_build_object('reason',btrim(p_reason),'command','correct_final_score','request_id',p_request_id));
  update public.assessment_command_requests c set resource_type='student_score',resource_id=p_score_id,result_payload=jsonb_build_object('score_id',p_score_id,'version',n,'status',p_new_status),status='completed',completed_at=pg_catalog.clock_timestamp() where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='correct_final_score';
  return query select p_score_id,n,p_new_status;
end $$;

create or replace function public.b15_list_assessments(
  p_organization_id uuid,p_school_id uuid,p_academic_year_id uuid default null,p_term_id uuid default null,p_status text default null,p_limit integer default 50,p_offset integer default 0)
returns table(id uuid,academic_year_id uuid,term_id uuid,teaching_assignment_id uuid,assessment_type_id uuid,title text,assessment_date date,status text,version bigint,updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id,a.academic_year_id,a.term_id,a.teaching_assignment_id,a.assessment_type_id,a.title,a.assessment_date,a.status,a.version,a.updated_at
  from public.assessments a
  where a.organization_id=p_organization_id and a.school_id=p_school_id
    and (p_academic_year_id is null or a.academic_year_id=p_academic_year_id)
    and (p_term_id is null or a.term_id=p_term_id)
    and (p_status is null or a.status=p_status)
    and public.can_access_assessment('assessment.read',a.id)
  order by a.assessment_date desc,a.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0)
$$;

create or replace function public.b15_get_assessment(p_assessment_id uuid,p_organization_id uuid,p_school_id uuid)
returns table(id uuid,organization_id uuid,school_id uuid,academic_year_id uuid,term_id uuid,teaching_assignment_id uuid,assessment_type_id uuid,title text,description text,assessment_date date,min_score numeric,max_score numeric,weight numeric,status text,version bigint,created_by_profile_id uuid,created_at timestamptz,updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id,a.organization_id,a.school_id,a.academic_year_id,a.term_id,a.teaching_assignment_id,a.assessment_type_id,a.title,a.description,a.assessment_date,a.min_score,a.max_score,a.weight,a.status,a.version,a.created_by_profile_id,a.created_at,a.updated_at
  from public.assessments a
  where a.id=p_assessment_id and a.organization_id=p_organization_id and a.school_id=p_school_id and public.can_access_assessment('assessment.read',a.id)
$$;

create or replace function public.b15_get_gradebook(p_assessment_id uuid,p_organization_id uuid,p_school_id uuid)
returns table(student_enrollment_id uuid,student_id uuid,student_name text,enrollment_status text,current_eligible boolean,score_id uuid,score numeric,score_status text,feedback text,score_version bigint)
language sql stable security definer set search_path = '' as $$
  with a as (select x.*,(select ta.classroom_id from public.teaching_assignments ta where ta.id=x.teaching_assignment_id) classroom_id from public.assessments x where x.id=p_assessment_id and x.organization_id=p_organization_id and x.school_id=p_school_id), roster as (
    select se.id student_enrollment_id,se.student_id,s.full_name student_name,se.status enrollment_status,
      (se.status='active' and ce.status='active' and ce.is_primary and ce.starts_on<=current_date and (ce.ends_on is null or ce.ends_on>=current_date)) current_eligible
    from public.student_enrollments se join a on a.academic_year_id=se.academic_year_id and a.organization_id=se.organization_id and a.school_id=se.school_id
    join public.students s on s.id=se.student_id and s.organization_id=se.organization_id
    left join public.class_enrollments ce on ce.student_enrollment_id=se.id and ce.organization_id=se.organization_id and ce.school_id=se.school_id and ce.classroom_id=a.classroom_id and ce.is_primary
    where se.organization_id=p_organization_id and se.school_id=p_school_id
  ), scores as (select ss.* from public.student_scores ss where ss.assessment_id=p_assessment_id and ss.organization_id=p_organization_id and ss.school_id=p_school_id)
  select r.student_enrollment_id,r.student_id,r.student_name,r.enrollment_status,r.current_eligible,s.id,s.score,s.status,s.feedback,s.version
  from roster r left join scores s on s.student_enrollment_id=r.student_enrollment_id
  where exists (select 1 from a where public.can_access_assessment('assessment.read',a.id))
  order by r.student_name,r.student_enrollment_id
$$;

revoke all on function public.b15_assessment_create(uuid,uuid,uuid,uuid,uuid,uuid,text,text,date,numeric,numeric,numeric,uuid) from public,anon,service_role;
revoke all on function public.b15_assessment_update_draft(uuid,uuid,uuid,bigint,uuid,text,text,date,numeric,numeric,numeric,uuid) from public,anon,service_role;
revoke all on function public.b15_assessment_transition(uuid,uuid,uuid,text,bigint,uuid) from public,anon,service_role;
revoke all on function public.b15_assessment_save_scores(uuid,uuid,uuid,bigint,jsonb,uuid) from public,anon,service_role;
revoke all on function public.b15_correct_final_score(uuid,uuid,uuid,uuid,bigint,numeric,text,text,uuid) from public,anon,service_role;
revoke all on function public.b15_list_assessments(uuid,uuid,uuid,uuid,text,integer,integer) from public,anon,service_role;
revoke all on function public.b15_get_assessment(uuid,uuid,uuid) from public,anon,service_role;
revoke all on function public.b15_get_gradebook(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.b15_assessment_create(uuid,uuid,uuid,uuid,uuid,uuid,text,text,date,numeric,numeric,numeric,uuid) to authenticated;
grant execute on function public.b15_assessment_update_draft(uuid,uuid,uuid,bigint,uuid,text,text,date,numeric,numeric,numeric,uuid) to authenticated;
grant execute on function public.b15_assessment_transition(uuid,uuid,uuid,text,bigint,uuid) to authenticated;
grant execute on function public.b15_assessment_save_scores(uuid,uuid,uuid,bigint,jsonb,uuid) to authenticated;
grant execute on function public.b15_correct_final_score(uuid,uuid,uuid,uuid,bigint,numeric,text,text,uuid) to authenticated;
grant execute on function public.b15_list_assessments(uuid,uuid,uuid,uuid,text,integer,integer) to authenticated;
grant execute on function public.b15_get_assessment(uuid,uuid,uuid) to authenticated;
grant execute on function public.b15_get_gradebook(uuid,uuid,uuid) to authenticated;
