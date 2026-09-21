-- B14 Phase 2 hardening: stable safe error codes for common command failures.
begin;

create or replace function public.validate_progression_decision_context()
returns trigger
language plpgsql
as $$
declare v_batch public.progression_batches; v_source public.student_enrollments; v_classroom public.classrooms; v_warning_count integer:=0;
begin
  select * into v_batch from public.progression_batches where id=new.batch_id and organization_id=new.organization_id and school_id=new.school_id;
  if not found then raise exception using errcode='P0001',message='B14_PROGRESSION_BATCH_NOT_FOUND'; end if;
  select * into v_source from public.student_enrollments where id=new.source_student_enrollment_id and organization_id=new.organization_id and school_id=new.school_id;
  if not found or v_source.student_id<>new.student_id or v_source.academic_year_id<>v_batch.source_academic_year_id then raise exception using errcode='P0001',message='B14_PROGRESSION_SOURCE_ENROLLMENT_INVALID'; end if;
  if new.target_classroom_id is not null and new.target_grade_level_id is null then raise exception using errcode='P0001',message='B14_PROGRESSION_TARGET_CONTEXT_INVALID'; end if;
  if new.outcome='graduated' and (new.target_grade_level_id is not null or new.target_classroom_id is not null) then raise exception using errcode='P0001',message='B14_PROGRESSION_TARGET_CONTEXT_INVALID'; end if;
  if new.target_classroom_id is not null then
    select * into v_classroom from public.classrooms where id=new.target_classroom_id and organization_id=new.organization_id and school_id=new.school_id;
    if not found or v_classroom.academic_year_id<>v_batch.target_academic_year_id or v_classroom.grade_level_id<>new.target_grade_level_id then raise exception using errcode='P0001',message='B14_PROGRESSION_TARGET_CONTEXT_INVALID'; end if;
  end if;
  if jsonb_typeof(new.readiness_snapshot->'warnings')='array' then v_warning_count:=jsonb_array_length(new.readiness_snapshot->'warnings'); end if;
  if new.outcome is not null and v_warning_count>0 and nullif(btrim(coalesce(new.exception_reason,'')),'') is null then raise exception using errcode='P0001',message='B14_PROGRESSION_READINESS_EXCEPTION_REQUIRED'; end if;
  return new;
end; $$;

create or replace function public.create_progression_batch(p_request_id uuid,p_school_id uuid,p_source_academic_year_id uuid,p_target_academic_year_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_source public.academic_years; v_target public.academic_years; v_batch public.progression_batches; v_existing jsonb; v_fp text; v_result jsonb; v_count bigint;
begin
  v_org:=public.b14_authorize('progression.create',p_school_id);
  select * into v_source from public.academic_years where id=p_source_academic_year_id and organization_id=v_org and school_id=p_school_id;
  select * into v_target from public.academic_years where id=p_target_academic_year_id and organization_id=v_org and school_id=p_school_id;
  if v_source.id is null or v_target.id is null or v_source.id=v_target.id or v_target.starts_on<=v_source.starts_on or v_target.ends_on<=v_source.ends_on then raise exception using errcode='P0001',message='B14_PROGRESSION_ACADEMIC_YEAR_INVALID'; end if;
  v_fp:=public.b14_command_fingerprint(jsonb_build_object('school_id',p_school_id,'source_academic_year_id',p_source_academic_year_id,'target_academic_year_id',p_target_academic_year_id));
  v_existing:=public.b14_command_begin(p_request_id,'create_progression_batch',v_fp,v_org,p_school_id); if v_existing is not null then return v_existing; end if;
  if exists(select 1 from public.progression_batches where organization_id=v_org and school_id=p_school_id and source_academic_year_id=p_source_academic_year_id and target_academic_year_id=p_target_academic_year_id and status in ('draft','in_review','approved','applied')) then raise exception using errcode='P0001',message='B14_PROGRESSION_DUPLICATE_ACTIVE_BATCH'; end if;
  insert into public.progression_batches(organization_id,school_id,source_academic_year_id,target_academic_year_id,created_by_profile_id) values(v_org,p_school_id,p_source_academic_year_id,p_target_academic_year_id,auth.uid()) returning * into v_batch;
  insert into public.progression_decisions(organization_id,school_id,batch_id,student_id,source_student_enrollment_id,readiness_snapshot)
  select v_org,p_school_id,v_batch.id,se.student_id,se.id,public.b14_readiness(v_org,p_school_id,se.id,p_source_academic_year_id) from public.student_enrollments se where se.organization_id=v_org and se.school_id=p_school_id and se.academic_year_id=p_source_academic_year_id and se.status in ('active','leave');
  select count(*) into v_count from public.progression_decisions where batch_id=v_batch.id;
  if v_count=0 then raise exception using errcode='P0001',message='B14_PROGRESSION_SOURCE_ENROLLMENT_INVALID'; end if;
  v_result:=jsonb_build_object('id',v_batch.id,'organization_id',v_org,'school_id',p_school_id,'source_academic_year_id',p_source_academic_year_id,'target_academic_year_id',p_target_academic_year_id,'status','draft','version',1,'candidate_count',v_count);
  perform public.b14_command_complete(p_request_id,'create_progression_batch',v_result,'progression_batch',v_batch.id); return v_result;
end; $$;

commit;
