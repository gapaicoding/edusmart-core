-- B14 Phase 2 remediation: idempotency replay is checked before mutable-state
-- gates, and review/approval revalidate the complete candidate set.
begin;

create or replace function public.b14_transition_batch(p_request_id uuid,p_command text,p_permission text,p_school_id uuid,p_batch_id uuid,p_expected_version bigint,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_batch public.progression_batches; v_decision public.progression_decisions; v_fp text; v_existing jsonb; v_result jsonb;
begin
  v_org:=public.b14_authorize(p_permission,p_school_id);
  v_fp:=public.b14_command_fingerprint(jsonb_build_object('batch_id',p_batch_id,'expected_version',p_expected_version,'reason',p_reason));
  v_existing:=public.b14_command_begin(p_request_id,p_command,v_fp,v_org,p_school_id);
  if v_existing is not null then return v_existing; end if;
  select * into v_batch from public.progression_batches where id=p_batch_id and organization_id=v_org and school_id=p_school_id for update;
  if not found then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_NOT_FOUND'; end if;
  if p_expected_version is null or v_batch.version<>p_expected_version then raise exception using errcode='P0001',message='B14_PROGRESSION_STALE_VERSION'; end if;
  if p_command='submit_progression_batch' then
    if v_batch.status<>'draft' then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if;
    for v_decision in select * from public.progression_decisions where batch_id=p_batch_id order by id for update loop
      perform public.b14_validate_decision(v_batch,v_decision,true);
    end loop;
    update public.progression_batches set status='in_review',submitted_by_profile_id=auth.uid(),submitted_at=transaction_timestamp(),version=version+1 where id=p_batch_id returning * into v_batch;
  elsif p_command='reject_progression_batch' then
    if v_batch.status<>'in_review' then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if;
    if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if;
    update public.progression_batches set status='rejected',rejected_by_profile_id=auth.uid(),rejected_at=transaction_timestamp(),rejection_reason=btrim(p_reason),version=version+1 where id=p_batch_id returning * into v_batch;
  elsif p_command='approve_progression_batch' then
    if v_batch.status<>'in_review' then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if;
    for v_decision in select * from public.progression_decisions where batch_id=p_batch_id order by id for update loop
      perform public.b14_validate_decision(v_batch,v_decision,true);
    end loop;
    update public.progression_batches set status='approved',approved_by_profile_id=auth.uid(),approved_at=transaction_timestamp(),version=version+1 where id=p_batch_id returning * into v_batch;
  elsif p_command='cancel_progression_batch' then
    if v_batch.status<>'draft' then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if;
    if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if;
    update public.progression_batches set status='cancelled',cancelled_by_profile_id=auth.uid(),cancelled_at=transaction_timestamp(),cancellation_reason=btrim(p_reason),version=version+1 where id=p_batch_id returning * into v_batch;
  else raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if;
  v_result:=jsonb_build_object('id',v_batch.id,'status',v_batch.status,'version',v_batch.version);
  perform public.b14_command_complete(p_request_id,p_command,v_result,'progression_batch',p_batch_id);
  return v_result;
end; $$;

create or replace function public.save_progression_decision(p_request_id uuid,p_school_id uuid,p_batch_id uuid,p_source_student_enrollment_id uuid,p_outcome text,p_target_grade_level_id uuid default null,p_target_classroom_id uuid default null,p_exception_reason text default null,p_operator_note text default null,p_expected_version bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_batch public.progression_batches; v_decision public.progression_decisions; v_fp text; v_existing jsonb; v_result jsonb; v_snapshot jsonb;
begin
  v_org:=public.b14_authorize('progression.update',p_school_id);
  if p_outcome not in ('promoted','retained','graduated') then raise exception using errcode='P0001',message='B14_PROGRESSION_TARGET_CONTEXT_INVALID'; end if;
  v_fp:=public.b14_command_fingerprint(jsonb_build_object('batch_id',p_batch_id,'source_student_enrollment_id',p_source_student_enrollment_id,'outcome',p_outcome,'target_grade_level_id',p_target_grade_level_id,'target_classroom_id',p_target_classroom_id,'exception_reason',p_exception_reason,'operator_note',p_operator_note,'expected_version',p_expected_version));
  v_existing:=public.b14_command_begin(p_request_id,'save_progression_decision',v_fp,v_org,p_school_id);
  if v_existing is not null then return v_existing; end if;
  select * into v_batch from public.progression_batches where id=p_batch_id and organization_id=v_org and school_id=p_school_id for update;
  if not found then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_NOT_FOUND'; end if;
  if v_batch.status<>'draft' then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_STATUS_INVALID'; end if;
  select * into v_decision from public.progression_decisions where batch_id=p_batch_id and source_student_enrollment_id=p_source_student_enrollment_id for update;
  if not found then raise exception using errcode='P0001',message='B14_PROGRESSION_DECISION_NOT_FOUND'; end if;
  if p_expected_version is null or v_decision.version<>p_expected_version then raise exception using errcode='P0001',message='B14_PROGRESSION_STALE_VERSION'; end if;
  v_snapshot:=public.b14_readiness(v_org,p_school_id,p_source_student_enrollment_id,v_batch.source_academic_year_id);
  update public.progression_decisions set outcome=p_outcome,target_grade_level_id=case when p_outcome='graduated' then null else p_target_grade_level_id end,target_classroom_id=case when p_outcome='graduated' then null else p_target_classroom_id end,readiness_snapshot=v_snapshot,exception_reason=nullif(btrim(p_exception_reason),''),operator_note=nullif(btrim(p_operator_note),''),decided_by_profile_id=auth.uid(),decided_at=transaction_timestamp(),version=version+1 where id=v_decision.id returning * into v_decision;
  perform public.b14_validate_decision(v_batch,v_decision,false);
  v_result:=jsonb_build_object('decision_id',v_decision.id,'batch_id',p_batch_id,'outcome',v_decision.outcome,'version',v_decision.version);
  perform public.b14_command_complete(p_request_id,'save_progression_decision',v_result,'progression_decision',v_decision.id);
  return v_result;
end; $$;

create or replace function public.apply_progression_batch(p_request_id uuid,p_school_id uuid,p_batch_id uuid,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_batch public.progression_batches; v_decision public.progression_decisions; v_fp text; v_existing jsonb; v_result jsonb; v_promoted integer:=0; v_retained integer:=0; v_graduated integer:=0; v_enrollments integer:=0; v_classes integer:=0; v_target_year public.academic_years; v_source public.student_enrollments; v_new_enrollment public.student_enrollments;
begin
  v_org:=public.b14_authorize('progression.apply',p_school_id);
  v_fp:=public.b14_command_fingerprint(jsonb_build_object('batch_id',p_batch_id,'expected_version',p_expected_version));
  v_existing:=public.b14_command_begin(p_request_id,'apply_progression_batch',v_fp,v_org,p_school_id);
  if v_existing is not null then return v_existing; end if;
  select * into v_batch from public.progression_batches where id=p_batch_id and organization_id=v_org and school_id=p_school_id for update;
  if not found then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_NOT_FOUND'; end if;
  if v_batch.status='applied' then raise exception using errcode='P0001',message='B14_PROGRESSION_ALREADY_APPLIED'; end if;
  if v_batch.status<>'approved' then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_NOT_APPROVED'; end if;
  if v_batch.version<>p_expected_version then raise exception using errcode='P0001',message='B14_PROGRESSION_STALE_VERSION'; end if;
  select * into v_target_year from public.academic_years where id=v_batch.target_academic_year_id;
  for v_decision in select * from public.progression_decisions where batch_id=p_batch_id order by id for update loop
    perform public.b14_validate_decision(v_batch,v_decision,true);
    select * into v_source from public.student_enrollments where id=v_decision.source_student_enrollment_id for update;
    if v_decision.outcome in ('promoted','retained') then
      if exists(select 1 from public.student_enrollments se where se.student_id=v_source.student_id and se.school_id=p_school_id and se.academic_year_id=v_batch.target_academic_year_id) then raise exception using errcode='P0001',message='B14_PROGRESSION_APPLY_CONFLICT'; end if;
      insert into public.student_enrollments(organization_id,school_id,student_id,academic_year_id,grade_level_id,status,enrolled_on,previous_enrollment_id)
      values(v_org,p_school_id,v_source.student_id,v_batch.target_academic_year_id,v_decision.target_grade_level_id,'active',v_target_year.starts_on,v_source.id) returning * into v_new_enrollment;
      v_enrollments:=v_enrollments+1;
      insert into public.class_enrollments(organization_id,school_id,student_enrollment_id,classroom_id,starts_on,is_primary,status)
      values(v_org,p_school_id,v_new_enrollment.id,v_decision.target_classroom_id,v_target_year.starts_on,true,'active');
      v_classes:=v_classes+1;
      if v_decision.outcome='promoted' then v_promoted:=v_promoted+1; else v_retained:=v_retained+1; end if;
    else v_graduated:=v_graduated+1; end if;
  end loop;
  update public.progression_batches set status='applied',applied_by_profile_id=auth.uid(),applied_at=transaction_timestamp(),version=version+1 where id=p_batch_id returning * into v_batch;
  v_result:=jsonb_build_object('id',p_batch_id,'status','applied','version',v_batch.version,'promoted_count',v_promoted,'retained_count',v_retained,'graduated_count',v_graduated,'created_enrollment_count',v_enrollments,'created_class_enrollment_count',v_classes,'applied_at',v_batch.applied_at);
  perform public.b14_command_complete(p_request_id,'apply_progression_batch',v_result,'progression_batch',p_batch_id);
  return v_result;
end; $$;

commit;
