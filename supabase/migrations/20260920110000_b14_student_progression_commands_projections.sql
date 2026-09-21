-- EduSmart Core V1 / Batch 14 Phase 2
-- Authenticated commands, bounded projections, idempotency, and atomic apply.
-- No direct table DML is granted; all mutations derive authority from auth.uid().

begin;

create or replace function public.b14_authorize(p_permission text, p_school_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'B14_PROGRESSION_UNAUTHENTICATED';
  end if;
  select s.organization_id into v_org
  from public.schools s
  where s.id = p_school_id;
  if v_org is null then
    raise exception using errcode = 'P0001', message = 'B14_PROGRESSION_SCHOOL_SCOPE_INVALID';
  end if;
  if not public.has_permission(p_permission, v_org, p_school_id) then
    raise exception using errcode = 'P0001', message = 'B14_PROGRESSION_FORBIDDEN';
  end if;
  return v_org;
end;
$$;

create or replace function public.b14_command_fingerprint(p_payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.b14_command_begin(
  p_request_id uuid,
  p_command_name text,
  p_fingerprint text,
  p_organization_id uuid,
  p_school_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.progression_command_requests;
begin
  insert into public.progression_command_requests(
    organization_id, school_id, actor_profile_id, request_id, command_name,
    payload_fingerprint, status
  ) values (
    p_organization_id, p_school_id, auth.uid(), p_request_id, p_command_name,
    p_fingerprint, 'processing'
  ) on conflict (actor_profile_id, request_id, command_name) do nothing;

  select * into v_row
  from public.progression_command_requests
  where actor_profile_id = auth.uid()
    and request_id = p_request_id
    and command_name = p_command_name
  for update;

  if v_row.payload_fingerprint <> p_fingerprint then
    raise exception using errcode = 'P0001', message = 'B14_PROGRESSION_REQUEST_CONFLICT';
  end if;
  if v_row.status = 'processing' and v_row.created_at < now() - interval '15 minutes' then
    raise exception using errcode = 'P0001', message = 'B14_PROGRESSION_REQUEST_CONFLICT';
  end if;
  if v_row.status = 'completed' then
    return v_row.result_payload;
  end if;
  return null;
end;
$$;

create or replace function public.b14_command_complete(
  p_request_id uuid,
  p_command_name text,
  p_result jsonb,
  p_resource_type text,
  p_resource_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.progression_command_requests
  set status = 'completed',
      result_payload = p_result,
      resource_type = p_resource_type,
      resource_id = p_resource_id,
      completed_at = transaction_timestamp()
  where actor_profile_id = auth.uid()
    and request_id = p_request_id
    and command_name = p_command_name;
end;
$$;

create or replace function public.b14_readiness(
  p_organization_id uuid,
  p_school_id uuid,
  p_enrollment_id uuid,
  p_source_year_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_published bigint;
  v_assessments bigint;
  v_class_count bigint;
  v_warnings jsonb := '[]'::jsonb;
begin
  select count(*) into v_published
  from public.report_cards rc
  where rc.organization_id = p_organization_id and rc.school_id = p_school_id
    and rc.student_enrollment_id = p_enrollment_id and rc.academic_year_id = p_source_year_id
    and rc.status = 'published';
  select count(*) into v_assessments
  from public.assessments a
  where a.organization_id = p_organization_id and a.school_id = p_school_id
    and a.academic_year_id = p_source_year_id and a.status <> 'archived';
  select count(*) into v_class_count
  from public.class_enrollments ce
  where ce.organization_id = p_organization_id and ce.school_id = p_school_id
    and ce.student_enrollment_id = p_enrollment_id and ce.status = 'active';
  if v_published = 0 then
    v_warnings := v_warnings || jsonb_build_array('report_card_not_published');
  end if;
  if v_assessments = 0 then
    v_warnings := v_warnings || jsonb_build_array('assessment_context_unavailable');
  end if;
  if v_class_count = 0 then
    v_warnings := v_warnings || jsonb_build_array('class_context_unresolved');
  end if;
  return jsonb_build_object(
    'report_card_published', v_published > 0,
    'assessment_context_available', v_assessments > 0,
    'class_context_available', v_class_count > 0,
    'warnings', v_warnings
  );
end;
$$;

create or replace function public.b14_validate_decision(
  p_batch public.progression_batches,
  p_decision public.progression_decisions,
  p_require_complete boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.student_enrollments;
  v_source_grade public.grade_levels;
  v_target_grade public.grade_levels;
  v_target_class public.classrooms;
  v_terminal_sequence integer;
  v_warnings integer := 0;
begin
  select * into v_source from public.student_enrollments se
  where se.id = p_decision.source_student_enrollment_id
    and se.organization_id = p_batch.organization_id and se.school_id = p_batch.school_id
    and se.academic_year_id = p_batch.source_academic_year_id
    and se.status in ('active','leave');
  if not found then raise exception using errcode='P0001',message='B14_PROGRESSION_SOURCE_ENROLLMENT_INVALID'; end if;
  if v_source.student_id <> p_decision.student_id then raise exception using errcode='P0001',message='B14_PROGRESSION_SOURCE_ENROLLMENT_INVALID'; end if;
  select * into v_source_grade from public.grade_levels g where g.id=v_source.grade_level_id;
  if p_decision.outcome is null and p_require_complete then raise exception using errcode='P0001',message='B14_PROGRESSION_UNRESOLVED_DECISIONS'; end if;
  if p_decision.outcome is null then return; end if;
  if jsonb_array_length(coalesce(p_decision.readiness_snapshot->'warnings','[]'::jsonb)) > 0 then
    v_warnings := jsonb_array_length(p_decision.readiness_snapshot->'warnings');
    if nullif(btrim(coalesce(p_decision.exception_reason,'')),'') is null then
      raise exception using errcode='P0001',message='B14_PROGRESSION_READINESS_EXCEPTION_REQUIRED';
    end if;
  end if;
  if p_decision.outcome = 'graduated' then
    if p_decision.target_grade_level_id is not null or p_decision.target_classroom_id is not null then
      raise exception using errcode='P0001',message='B14_PROGRESSION_TARGET_CONTEXT_INVALID';
    end if;
    select max(g.sequence) into v_terminal_sequence from public.grade_levels g
    where g.organization_id=p_batch.organization_id and g.school_id=p_batch.school_id and g.is_active;
    if v_source_grade.sequence <> v_terminal_sequence then
      raise exception using errcode='P0001',message='B14_PROGRESSION_TARGET_CONTEXT_INVALID';
    end if;
    return;
  end if;
  if p_decision.target_grade_level_id is null or p_decision.target_classroom_id is null then
    raise exception using errcode='P0001',message='B14_PROGRESSION_TARGET_CONTEXT_INVALID';
  end if;
  select * into v_target_grade from public.grade_levels g
  where g.id=p_decision.target_grade_level_id and g.organization_id=p_batch.organization_id and g.school_id=p_batch.school_id and g.is_active;
  if not found then raise exception using errcode='P0001',message='B14_PROGRESSION_TARGET_CONTEXT_INVALID'; end if;
  if p_decision.outcome='promoted' and v_target_grade.sequence <> v_source_grade.sequence + 1 then
    raise exception using errcode='P0001',message='B14_PROGRESSION_TARGET_CONTEXT_INVALID';
  end if;
  if p_decision.outcome='retained' and v_target_grade.sequence <> v_source_grade.sequence then
    raise exception using errcode='P0001',message='B14_PROGRESSION_TARGET_CONTEXT_INVALID';
  end if;
  select * into v_target_class from public.classrooms c
  where c.id=p_decision.target_classroom_id and c.organization_id=p_batch.organization_id and c.school_id=p_batch.school_id
    and c.academic_year_id=p_batch.target_academic_year_id and c.grade_level_id=p_decision.target_grade_level_id and c.status='active';
  if not found then raise exception using errcode='P0001',message='B14_PROGRESSION_TARGET_CONTEXT_INVALID'; end if;
end;
$$;

create or replace function public.create_progression_batch(
  p_request_id uuid, p_school_id uuid, p_source_academic_year_id uuid, p_target_academic_year_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_source public.academic_years; v_target public.academic_years; v_batch public.progression_batches; v_existing jsonb; v_fp text; v_result jsonb; v_count bigint;
begin
  v_org := public.b14_authorize('progression.create',p_school_id);
  select * into v_source from public.academic_years where id=p_source_academic_year_id and organization_id=v_org and school_id=p_school_id;
  select * into v_target from public.academic_years where id=p_target_academic_year_id and organization_id=v_org and school_id=p_school_id;
  if v_source.id is null or v_target.id is null or v_source.id=v_target.id or v_target.starts_on<=v_source.starts_on or v_target.ends_on<=v_source.ends_on then raise exception using errcode='P0001',message='B14_PROGRESSION_ACADEMIC_YEAR_INVALID'; end if;
  v_fp:=public.b14_command_fingerprint(jsonb_build_object('school_id',p_school_id,'source_academic_year_id',p_source_academic_year_id,'target_academic_year_id',p_target_academic_year_id));
  v_existing:=public.b14_command_begin(p_request_id,'create_progression_batch',v_fp,v_org,p_school_id); if v_existing is not null then return v_existing; end if;
  insert into public.progression_batches(organization_id,school_id,source_academic_year_id,target_academic_year_id,created_by_profile_id)
  values(v_org,p_school_id,p_source_academic_year_id,p_target_academic_year_id,auth.uid()) returning * into v_batch;
  insert into public.progression_decisions(organization_id,school_id,batch_id,student_id,source_student_enrollment_id,readiness_snapshot)
  select v_org,p_school_id,v_batch.id,se.student_id,se.id,public.b14_readiness(v_org,p_school_id,se.id,p_source_academic_year_id)
  from public.student_enrollments se where se.organization_id=v_org and se.school_id=p_school_id and se.academic_year_id=p_source_academic_year_id and se.status in ('active','leave');
  select count(*) into v_count from public.progression_decisions where batch_id=v_batch.id;
  v_result:=jsonb_build_object('id',v_batch.id,'organization_id',v_org,'school_id',p_school_id,'source_academic_year_id',p_source_academic_year_id,'target_academic_year_id',p_target_academic_year_id,'status','draft','version',1,'candidate_count',v_count);
  perform public.b14_command_complete(p_request_id,'create_progression_batch',v_result,'progression_batch',v_batch.id); return v_result;
end; $$;

create or replace function public.list_progression_batches(p_school_id uuid, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_result jsonb;
begin v_org:=public.b14_authorize('progression.read',p_school_id); p_limit:=least(greatest(coalesce(p_limit,50),1),100); p_offset:=greatest(coalesce(p_offset,0),0);
select coalesce(jsonb_agg(x),'[]'::jsonb) into v_result from (select jsonb_build_object('id',b.id,'source_academic_year_id',b.source_academic_year_id,'target_academic_year_id',b.target_academic_year_id,'status',b.status,'version',b.version,'candidate_count',(select count(*) from public.progression_decisions d where d.batch_id=b.id),'decided_count',(select count(*) from public.progression_decisions d where d.batch_id=b.id and d.outcome is not null),'warning_count',(select count(*) from public.progression_decisions d where d.batch_id=b.id and jsonb_array_length(coalesce(d.readiness_snapshot->'warnings','[]'::jsonb))>0),'created_at',b.created_at,'updated_at',b.updated_at,'submitted_at',b.submitted_at,'approved_at',b.approved_at,'applied_at',b.applied_at) x from public.progression_batches b where b.organization_id=v_org and b.school_id=p_school_id order by b.updated_at desc limit p_limit offset p_offset) q; return v_result; end; $$;

create or replace function public.get_progression_batch(p_school_id uuid,p_batch_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_result jsonb;
begin v_org:=public.b14_authorize('progression.read',p_school_id); select jsonb_build_object('id',b.id,'source_academic_year_id',b.source_academic_year_id,'target_academic_year_id',b.target_academic_year_id,'status',b.status,'version',b.version,'candidate_count',(select count(*) from public.progression_decisions d where d.batch_id=b.id),'decided_count',(select count(*) from public.progression_decisions d where d.batch_id=b.id and d.outcome is not null),'outcomes',(select coalesce(jsonb_object_agg(coalesce(d.outcome,'unresolved'),n),'{}'::jsonb) from (select outcome,count(*) n from public.progression_decisions where batch_id=b.id group by outcome) d),'warning_count',(select count(*) from public.progression_decisions d where d.batch_id=b.id and jsonb_array_length(coalesce(d.readiness_snapshot->'warnings','[]'::jsonb))>0),'created_at',b.created_at,'submitted_at',b.submitted_at,'approved_at',b.approved_at,'rejected_at',b.rejected_at,'applied_at',b.applied_at,'cancelled_at',b.cancelled_at) into v_result from public.progression_batches b where b.id=p_batch_id and b.organization_id=v_org and b.school_id=p_school_id; if v_result is null then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_NOT_FOUND'; end if; return v_result; end; $$;

create or replace function public.list_progression_candidates(p_school_id uuid,p_batch_id uuid,p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_result jsonb;
begin v_org:=public.b14_authorize('progression.read',p_school_id); p_limit:=least(greatest(coalesce(p_limit,100),1),250); p_offset:=greatest(coalesce(p_offset,0),0); select coalesce(jsonb_agg(x),'[]'::jsonb) into v_result from (select jsonb_build_object('decision_id',d.id,'student_id',d.student_id,'student_name',s.full_name,'source_enrollment_id',d.source_student_enrollment_id,'source_grade_level_id',se.grade_level_id,'source_classroom_id',ce.classroom_id,'readiness',d.readiness_snapshot,'outcome',d.outcome,'target_grade_level_id',d.target_grade_level_id,'target_classroom_id',d.target_classroom_id,'exception_reason',d.exception_reason,'operator_note',d.operator_note,'version',d.version) x from public.progression_decisions d join public.progression_batches b on b.id=d.batch_id and b.organization_id=v_org and b.school_id=p_school_id join public.students s on s.id=d.student_id and s.organization_id=v_org join public.student_enrollments se on se.id=d.source_student_enrollment_id and se.organization_id=v_org and se.school_id=p_school_id left join public.class_enrollments ce on ce.student_enrollment_id=se.id and ce.organization_id=v_org and ce.school_id=p_school_id and ce.status='active' where d.batch_id=p_batch_id order by s.full_name,d.id limit p_limit offset p_offset) q; if v_result is null then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_NOT_FOUND'; end if; return v_result; end; $$;

create or replace function public.save_progression_decision(p_request_id uuid,p_school_id uuid,p_batch_id uuid,p_source_student_enrollment_id uuid,p_outcome text,p_target_grade_level_id uuid default null,p_target_classroom_id uuid default null,p_exception_reason text default null,p_operator_note text default null,p_expected_version bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_batch public.progression_batches; v_decision public.progression_decisions; v_fp text; v_existing jsonb; v_result jsonb; v_snapshot jsonb;
begin v_org:=public.b14_authorize('progression.update',p_school_id); if p_outcome not in ('promoted','retained','graduated') then raise exception using errcode='P0001',message='B14_PROGRESSION_TARGET_CONTEXT_INVALID'; end if; select * into v_batch from public.progression_batches where id=p_batch_id and organization_id=v_org and school_id=p_school_id for update; if not found then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_NOT_FOUND'; end if; if v_batch.status<>'draft' then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if; select * into v_decision from public.progression_decisions where batch_id=p_batch_id and source_student_enrollment_id=p_source_student_enrollment_id for update; if not found then raise exception using errcode='P0001',message='B14_PROGRESSION_DECISION_NOT_FOUND'; end if; if p_expected_version is null or v_decision.version<>p_expected_version then raise exception using errcode='P0001',message='B14_PROGRESSION_STALE_VERSION'; end if; v_fp:=public.b14_command_fingerprint(jsonb_build_object('batch_id',p_batch_id,'source_student_enrollment_id',p_source_student_enrollment_id,'outcome',p_outcome,'target_grade_level_id',p_target_grade_level_id,'target_classroom_id',p_target_classroom_id,'exception_reason',p_exception_reason,'operator_note',p_operator_note,'expected_version',p_expected_version)); v_existing:=public.b14_command_begin(p_request_id,'save_progression_decision',v_fp,v_org,p_school_id); if v_existing is not null then return v_existing; end if; v_snapshot:=public.b14_readiness(v_org,p_school_id,p_source_student_enrollment_id,v_batch.source_academic_year_id); update public.progression_decisions set outcome=p_outcome,target_grade_level_id=case when p_outcome='graduated' then null else p_target_grade_level_id end,target_classroom_id=case when p_outcome='graduated' then null else p_target_classroom_id end,readiness_snapshot=v_snapshot,exception_reason=nullif(btrim(p_exception_reason),''),operator_note=nullif(btrim(p_operator_note),''),decided_by_profile_id=auth.uid(),decided_at=transaction_timestamp(),version=version+1 where id=v_decision.id returning * into v_decision; perform public.b14_validate_decision(v_batch,v_decision,false); v_result:=jsonb_build_object('decision_id',v_decision.id,'batch_id',p_batch_id,'outcome',v_decision.outcome,'version',v_decision.version); perform public.b14_command_complete(p_request_id,'save_progression_decision',v_result,'progression_decision',v_decision.id); return v_result;
end; $$;

create or replace function public.b14_transition_batch(p_request_id uuid,p_command text,p_permission text,p_school_id uuid,p_batch_id uuid,p_expected_version bigint,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_batch public.progression_batches; v_decision public.progression_decisions; v_fp text; v_existing jsonb; v_result jsonb; v_unresolved bigint;
begin v_org:=public.b14_authorize(p_permission,p_school_id); select * into v_batch from public.progression_batches where id=p_batch_id and organization_id=v_org and school_id=p_school_id for update; if not found then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_NOT_FOUND'; end if; if p_expected_version is null or v_batch.version<>p_expected_version then raise exception using errcode='P0001',message='B14_PROGRESSION_STALE_VERSION'; end if; v_fp:=public.b14_command_fingerprint(jsonb_build_object('batch_id',p_batch_id,'expected_version',p_expected_version,'reason',p_reason)); v_existing:=public.b14_command_begin(p_request_id,p_command,v_fp,v_org,p_school_id); if v_existing is not null then return v_existing; end if;
  if p_command='submit_progression_batch' then
    if v_batch.status<>'draft' then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if;
    select count(*) into v_unresolved from public.progression_decisions d where d.batch_id=p_batch_id and (d.outcome is null); if v_unresolved>0 then raise exception using errcode='P0001',message='B14_PROGRESSION_UNRESOLVED_DECISIONS'; end if;
    for v_decision in select * from public.progression_decisions where batch_id=p_batch_id order by id for update loop
      perform public.b14_validate_decision(v_batch,v_decision,true);
    end loop;
    update public.progression_batches set status='in_review',submitted_by_profile_id=auth.uid(),submitted_at=transaction_timestamp(),version=version+1 where id=p_batch_id returning * into v_batch;
  elsif p_command='reject_progression_batch' then
    if v_batch.status<>'in_review' then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if; if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if; update public.progression_batches set status='rejected',rejected_by_profile_id=auth.uid(),rejected_at=transaction_timestamp(),rejection_reason=btrim(p_reason),version=version+1 where id=p_batch_id returning * into v_batch;
  elsif p_command='approve_progression_batch' then
    if v_batch.status<>'in_review' then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if; update public.progression_batches set status='approved',approved_by_profile_id=auth.uid(),approved_at=transaction_timestamp(),version=version+1 where id=p_batch_id returning * into v_batch;
  elsif p_command='cancel_progression_batch' then
    if v_batch.status<>'draft' then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if; if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if; update public.progression_batches set status='cancelled',cancelled_by_profile_id=auth.uid(),cancelled_at=transaction_timestamp(),cancellation_reason=btrim(p_reason),version=version+1 where id=p_batch_id returning * into v_batch;
  else raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if;
  v_result:=jsonb_build_object('id',v_batch.id,'status',v_batch.status,'version',v_batch.version); perform public.b14_command_complete(p_request_id,p_command,v_result,'progression_batch',p_batch_id); return v_result;
end; $$;

create or replace function public.submit_progression_batch(p_request_id uuid,p_school_id uuid,p_batch_id uuid,p_expected_version bigint) returns jsonb language sql security definer set search_path='' as $$ select public.b14_transition_batch(p_request_id,'submit_progression_batch','progression.submit',p_school_id,p_batch_id,p_expected_version,null); $$;
create or replace function public.reject_progression_batch(p_request_id uuid,p_school_id uuid,p_batch_id uuid,p_expected_version bigint,p_reason text) returns jsonb language sql security definer set search_path='' as $$ select public.b14_transition_batch(p_request_id,'reject_progression_batch','progression.review',p_school_id,p_batch_id,p_expected_version,p_reason); $$;
create or replace function public.approve_progression_batch(p_request_id uuid,p_school_id uuid,p_batch_id uuid,p_expected_version bigint) returns jsonb language sql security definer set search_path='' as $$ select public.b14_transition_batch(p_request_id,'approve_progression_batch','progression.approve',p_school_id,p_batch_id,p_expected_version,null); $$;
create or replace function public.cancel_progression_batch(p_request_id uuid,p_school_id uuid,p_batch_id uuid,p_expected_version bigint,p_reason text) returns jsonb language sql security definer set search_path='' as $$ select public.b14_transition_batch(p_request_id,'cancel_progression_batch','progression.cancel',p_school_id,p_batch_id,p_expected_version,p_reason); $$;

create or replace function public.apply_progression_batch(p_request_id uuid,p_school_id uuid,p_batch_id uuid,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_batch public.progression_batches; v_decision public.progression_decisions; v_fp text; v_existing jsonb; v_result jsonb; v_promoted integer:=0; v_retained integer:=0; v_graduated integer:=0; v_enrollments integer:=0; v_classes integer:=0; v_target_year public.academic_years; v_source public.student_enrollments; v_new_enrollment public.student_enrollments;
begin v_org:=public.b14_authorize('progression.apply',p_school_id); select * into v_batch from public.progression_batches where id=p_batch_id and organization_id=v_org and school_id=p_school_id for update; if not found then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_NOT_FOUND'; end if; if v_batch.status='applied' then raise exception using errcode='P0001',message='B14_PROGRESSION_ALREADY_APPLIED'; end if; if v_batch.status<>'approved' then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_NOT_APPROVED'; end if; if v_batch.version<>p_expected_version then raise exception using errcode='P0001',message='B14_PROGRESSION_STALE_VERSION'; end if; v_fp:=public.b14_command_fingerprint(jsonb_build_object('batch_id',p_batch_id,'expected_version',p_expected_version)); v_existing:=public.b14_command_begin(p_request_id,'apply_progression_batch',v_fp,v_org,p_school_id); if v_existing is not null then return v_existing; end if; select * into v_target_year from public.academic_years where id=v_batch.target_academic_year_id;
  for v_decision in select * from public.progression_decisions where batch_id=p_batch_id order by id for update loop
    perform public.b14_validate_decision(v_batch,v_decision,true); select * into v_source from public.student_enrollments where id=v_decision.source_student_enrollment_id for update;
    if v_decision.outcome in ('promoted','retained') then
      if exists(select 1 from public.student_enrollments se where se.student_id=v_source.student_id and se.school_id=p_school_id and se.academic_year_id=v_batch.target_academic_year_id) then raise exception using errcode='P0001',message='B14_PROGRESSION_APPLY_CONFLICT'; end if;
      insert into public.student_enrollments(organization_id,school_id,student_id,academic_year_id,grade_level_id,status,enrolled_on,previous_enrollment_id)
      values(v_org,p_school_id,v_source.student_id,v_batch.target_academic_year_id,v_decision.target_grade_level_id,'active',v_target_year.starts_on,v_source.id) returning * into v_new_enrollment; v_enrollments:=v_enrollments+1;
      if exists(select 1 from public.class_enrollments ce where ce.student_enrollment_id=v_new_enrollment.id and ce.is_primary and ce.status='active') then raise exception using errcode='P0001',message='B14_PROGRESSION_APPLY_CONFLICT'; end if;
      insert into public.class_enrollments(organization_id,school_id,student_enrollment_id,classroom_id,starts_on,is_primary,status) values(v_org,p_school_id,v_new_enrollment.id,v_decision.target_classroom_id,v_target_year.starts_on,true,'active'); v_classes:=v_classes+1;
      if v_decision.outcome='promoted' then v_promoted:=v_promoted+1; else v_retained:=v_retained+1; end if;
    else v_graduated:=v_graduated+1; end if;
  end loop;
  update public.progression_batches set status='applied',applied_by_profile_id=auth.uid(),applied_at=transaction_timestamp(),version=version+1 where id=p_batch_id returning * into v_batch;
  v_result:=jsonb_build_object('id',p_batch_id,'status','applied','version',v_batch.version,'promoted_count',v_promoted,'retained_count',v_retained,'graduated_count',v_graduated,'created_enrollment_count',v_enrollments,'created_class_enrollment_count',v_classes,'applied_at',v_batch.applied_at); perform public.b14_command_complete(p_request_id,'apply_progression_batch',v_result,'progression_batch',p_batch_id); return v_result;
end; $$;

do $$ declare f record; begin
  for f in select * from (values
    ('public.create_progression_batch(uuid,uuid,uuid,uuid)'),('public.list_progression_batches(uuid,integer,integer)'),('public.get_progression_batch(uuid,uuid)'),('public.list_progression_candidates(uuid,uuid,integer,integer)'),('public.save_progression_decision(uuid,uuid,uuid,uuid,text,uuid,uuid,text,text,bigint)'),('public.submit_progression_batch(uuid,uuid,uuid,bigint)'),('public.reject_progression_batch(uuid,uuid,uuid,bigint,text)'),('public.approve_progression_batch(uuid,uuid,uuid,bigint)'),('public.cancel_progression_batch(uuid,uuid,uuid,bigint,text)'),('public.apply_progression_batch(uuid,uuid,uuid,bigint)') ) x(signature) loop
    execute 'revoke all on function '||f.signature||' from public, anon, service_role'; execute 'grant execute on function '||f.signature||' to authenticated';
  end loop;
end $$;

-- Phase-2 cancellation capability is intentionally restricted to draft operators.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code='progression.cancel'
where r.organization_id is null and r.code='SCHOOL_ADMIN' on conflict do nothing;

comment on function public.apply_progression_batch(uuid,uuid,uuid,bigint) is 'B14 Phase 2 atomic annual rollover. Creates new target-year enrollments and never updates source-year enrollment history.';

commit;
