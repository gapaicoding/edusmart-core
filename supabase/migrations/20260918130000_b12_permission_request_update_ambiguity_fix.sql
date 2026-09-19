begin;

-- B12 Phase 3 residual draft-edit ambiguity remediation.
-- 20260918120000 qualified version references. This forward correction also
-- qualifies the draft-target request_id predicate because request_id is a
-- RETURNS TABLE output variable in this PL/pgSQL function.
create or replace function public.update_permission_request(
  p_request_id uuid, p_organization_id uuid, p_school_id uuid, p_expected_version bigint,
  p_request_type text, p_title text, p_description text, p_target_mode text,
  p_target_classroom_id uuid default null, p_student_ids uuid[] default '{}',
  p_due_at timestamptz default null, p_command_request_id uuid default gen_random_uuid()
)
returns table(request_id uuid,status text,version bigint)
language plpgsql security definer set search_path=public as $$
declare v public.parent_permission_requests%rowtype; v_new bigint; v_fp text; v_result jsonb;
begin
  select * into v from public.parent_permission_requests where id=p_request_id and organization_id=p_organization_id and school_id=p_school_id;
  if not found then raise exception using errcode='P0001',message='B12_REQUEST_NOT_FOUND'; end if;
  perform public.b12_require_staff('permission_request.update',p_organization_id,p_school_id,v.target_classroom_id);
  v_fp:=public.b12_command_fingerprint(jsonb_build_object('kind','update','request_id',p_request_id,'version',p_expected_version,'request_type',p_request_type,'title',p_title,'description',p_description,'target_mode',p_target_mode,'target_classroom_id',p_target_classroom_id,'student_ids',p_student_ids,'due_at',p_due_at));
  if public.b12_replay_command(p_command_request_id,v_fp) is not null then return query select p_request_id,'draft',v.version; return; end if;
  select * into v from public.parent_permission_requests where id=p_request_id and organization_id=p_organization_id and school_id=p_school_id for update;
  if not found then raise exception using errcode='P0001',message='B12_REQUEST_NOT_FOUND'; end if;
  if v.status <> 'draft' then raise exception using errcode='P0001',message='B12_REQUEST_NOT_DRAFT'; end if;
  if v.version <> p_expected_version then raise exception using errcode='40001',message='B12_STALE_VERSION'; end if;
  if p_target_mode not in ('students','classroom') or (p_target_mode='classroom' and p_target_classroom_id is null) or (p_target_mode='students' and p_target_classroom_id is not null) then raise exception using errcode='22023',message='B12_INVALID_TARGET_SET'; end if;
  update public.parent_permission_requests
    set request_type=p_request_type,title=p_title,description=p_description,target_mode=p_target_mode,target_classroom_id=p_target_classroom_id,due_at=p_due_at,version=public.parent_permission_requests.version+1,updated_at=transaction_timestamp()
    where id=p_request_id;
  delete from public.parent_permission_request_draft_targets as dt where dt.request_id=p_request_id;
  if p_target_mode='students' then
    if coalesce(array_length(p_student_ids,1),0)=0 or exists(select 1 from unnest(p_student_ids) s group by s having count(*)>1) then raise exception using errcode='22023',message='B12_INVALID_TARGET_SET'; end if;
    if exists(select 1 from unnest(p_student_ids) s where not exists(select 1 from public.student_enrollments e where e.student_id=s and e.organization_id=p_organization_id and e.school_id=p_school_id and e.status='active' and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date))) then raise exception using errcode='22023',message='B12_INVALID_TARGET_SET'; end if;
    insert into public.parent_permission_request_draft_targets(organization_id,school_id,request_id,student_id) select p_organization_id,p_school_id,p_request_id,s from unnest(p_student_ids) s;
  end if;
  select public.parent_permission_requests.version into v_new from public.parent_permission_requests where id=p_request_id;
  v_result:=jsonb_build_object('request_id',p_request_id,'status','draft','version',v_new);
  perform public.b12_claim_command(p_command_request_id,p_organization_id,p_school_id,p_request_id,'update',p_request_id,v_fp,v_result,true);
  perform public.b12_audit('request_edited','parent_permission_requests',p_request_id,p_organization_id,p_school_id);
  return query select p_request_id,'draft',v_new;
end;
$$;

commit;
