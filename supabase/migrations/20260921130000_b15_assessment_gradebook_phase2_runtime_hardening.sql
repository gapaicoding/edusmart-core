-- Batch 15 Phase 2 forward-only runtime hardening.
-- current_date is a SQL special value and must not be table-qualified.
create or replace function public.b15_assessment_save_scores(
  p_assessment_id uuid,p_organization_id uuid,p_school_id uuid,p_expected_assessment_version bigint,p_entries jsonb,p_request_id uuid)
returns table(assessment_id uuid,saved_count bigint,version bigint)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); a public.assessments%rowtype; e public.assessment_command_requests; row jsonb; old_score public.student_scores%rowtype; v_count bigint:=0; fp text; payload jsonb; expected_score_version bigint; sid uuid; score_value numeric; score_status text; feedback_value text;
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
  if not public.can_manage_assessment_context('score.enter',p_organization_id,p_school_id,a.academic_year_id,a.term_id,a.teaching_assignment_id)
     and not public.can_manage_assessment_context('score.update_open',p_organization_id,p_school_id,a.academic_year_id,a.term_id,a.teaching_assignment_id) then raise exception 'B15_ASSESSMENT_FORBIDDEN'; end if;
  insert into public.assessment_command_requests(organization_id,school_id,actor_profile_id,request_id,command_name,payload_fingerprint) values(p_organization_id,p_school_id,v_actor,p_request_id,'save_assessment_scores',fp);
  for row in select * from jsonb_array_elements(p_entries) loop
    sid:=(row->>'student_enrollment_id')::uuid; score_status:=row->>'status'; score_value:=nullif(row->>'score','')::numeric; feedback_value:=row->>'feedback'; expected_score_version:=nullif(row->>'expected_score_version','')::bigint;
    if score_status not in ('missing','submitted','excused','final') or ((score_status in ('missing','excused')) and score_value is not null) or ((score_status in ('submitted','final')) and score_value is null) or (score_value is not null and (score_value<a.min_score or score_value>a.max_score)) then raise exception 'B15_ASSESSMENT_SCORE_INVALID'; end if;
    if not exists (select 1 from public.student_enrollments se join public.class_enrollments ce on ce.student_enrollment_id=se.id and ce.organization_id=se.organization_id and ce.school_id=se.school_id where se.id=sid and se.organization_id=p_organization_id and se.school_id=p_school_id and se.academic_year_id=a.academic_year_id and se.status='active' and ce.classroom_id=(select ta.classroom_id from public.teaching_assignments ta where ta.id=a.teaching_assignment_id) and ce.status='active' and ce.is_primary and se.enrolled_on<=current_date and (se.ended_on is null or se.ended_on>=current_date) and ce.starts_on<=current_date and (ce.ends_on is null or ce.ends_on>=current_date)) then raise exception 'B15_ASSESSMENT_INVALID_ROSTER'; end if;
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

revoke all on function public.b15_assessment_save_scores(uuid,uuid,uuid,bigint,jsonb,uuid) from public, anon, service_role;
grant execute on function public.b15_assessment_save_scores(uuid,uuid,uuid,bigint,jsonb,uuid) to authenticated;
