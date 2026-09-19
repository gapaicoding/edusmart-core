begin;

-- B12 Phase 3 UAT remediation: preserve draft due_at at create time.
create or replace function public.create_permission_request(
  p_organization_id uuid, p_school_id uuid, p_request_id uuid,
  p_request_type text, p_title text, p_description text, p_target_mode text,
  p_target_classroom_id uuid default null, p_student_ids uuid[] default '{}',
  p_due_at timestamptz default null, p_command_request_id uuid default gen_random_uuid()
)
returns table(request_id uuid, status text, version bigint)
language plpgsql security definer set search_path=public as $$
declare v_fp text; v_result jsonb; v_existing public.permission_request_command_requests%rowtype;
begin
  perform public.b12_require_staff('permission_request.create',p_organization_id,p_school_id,p_target_classroom_id);
  if p_target_mode not in ('students','classroom') or (p_target_mode='classroom' and p_target_classroom_id is null)
     or (p_target_mode='students' and p_target_classroom_id is not null) then
    raise exception using errcode='22023', message='B12_INVALID_TARGET_SET';
  end if;
  v_fp := public.b12_command_fingerprint(jsonb_build_object('kind','create','request_id',p_request_id,
    'organization_id',p_organization_id,'school_id',p_school_id,'request_type',p_request_type,
    'title',p_title,'description',p_description,'target_mode',p_target_mode,
    'target_classroom_id',p_target_classroom_id,'student_ids',p_student_ids,'due_at',p_due_at));
  select * into v_existing from public.permission_request_command_requests
    where actor_profile_id=auth.uid() and request_key=p_command_request_id for update;
  if found then
    if v_existing.request_fingerprint <> v_fp then raise exception using errcode='40001',message='B12_IDEMPOTENCY_CONFLICT'; end if;
    if v_existing.result is not null then return query select (v_existing.result->>'request_id')::uuid,'draft',1::bigint; return; end if;
  end if;
  insert into public.parent_permission_requests(
    id,organization_id,school_id,request_type,title,description,target_mode,target_classroom_id,due_at,created_by_profile_id
  )
  values(p_request_id,p_organization_id,p_school_id,p_request_type,p_title,p_description,p_target_mode,p_target_classroom_id,p_due_at,auth.uid());
  if p_target_mode='students' then
    if coalesce(array_length(p_student_ids,1),0)=0 or exists(select 1 from unnest(p_student_ids) s group by s having count(*)>1) then
      raise exception using errcode='22023',message='B12_INVALID_TARGET_SET';
    end if;
    if exists(select 1 from unnest(p_student_ids) s where not exists(
      select 1 from public.student_enrollments e where e.student_id=s and e.organization_id=p_organization_id and e.school_id=p_school_id and e.status='active'
        and e.enrolled_on <= current_date and (e.ended_on is null or e.ended_on >= current_date))) then
      raise exception using errcode='22023',message='B12_INVALID_TARGET_SET';
    end if;
    insert into public.parent_permission_request_draft_targets(organization_id,school_id,request_id,student_id)
      select p_organization_id,p_school_id,p_request_id,s from unnest(p_student_ids) s;
  end if;
  v_result := jsonb_build_object('request_id',p_request_id,'status','draft','version',1);
  perform public.b12_claim_command(p_command_request_id,p_organization_id,p_school_id,p_request_id,'create',p_request_id,v_fp,v_result,true);
  perform public.b12_audit('request_created','parent_permission_requests',p_request_id,p_organization_id,p_school_id);
  return query select p_request_id,'draft',1::bigint;
end;
$$;

-- B12 Phase 3 UAT remediation: qualify the returned-table version column in
-- the UPDATE. PL/pgSQL otherwise resolves `version` ambiguously against the
-- RETURNS TABLE output parameter before the command ledger can be completed.
create or replace function public.cancel_permission_request(
  p_request_id uuid,p_organization_id uuid,p_school_id uuid,p_expected_version bigint,
  p_command_request_id uuid default gen_random_uuid()
)
returns table(request_id uuid,status text,version bigint)
language plpgsql security definer set search_path=public as $$
declare v public.parent_permission_requests%rowtype; n bigint; fp text; result jsonb;
begin
 select * into v from public.parent_permission_requests where id=p_request_id and organization_id=p_organization_id and school_id=p_school_id for update;
 if not found then raise exception using errcode='P0001',message='B12_REQUEST_NOT_FOUND'; end if;
 perform public.b12_require_staff('permission_request.close',p_organization_id,p_school_id,v.target_classroom_id);
 fp:=public.b12_command_fingerprint(jsonb_build_object('kind','cancel','request_id',p_request_id,'version',p_expected_version));
 if public.b12_replay_command(p_command_request_id,fp) is not null then return query select p_request_id,'cancelled',v.version; return; end if;
 if v.status='closed' then raise exception using errcode='P0001',message='B12_REQUEST_CLOSED'; end if;
 if v.status='cancelled' then return query select v.id,v.status,v.version; return; end if;
 if v.version<>p_expected_version then raise exception using errcode='40001',message='B12_STALE_VERSION'; end if;
 update public.parent_permission_requests
   set status='cancelled',cancelled_at=transaction_timestamp(),cancelled_by_profile_id=auth.uid(),
       published_at=coalesce(published_at,transaction_timestamp()),
       version=public.parent_permission_requests.version+1,updated_at=transaction_timestamp()
   where id=p_request_id
   returning public.parent_permission_requests.version into n;
 result:=jsonb_build_object('request_id',p_request_id,'status','cancelled','version',n);
 perform public.b12_claim_command(p_command_request_id,p_organization_id,p_school_id,p_request_id,'cancel',p_request_id,fp,result,true);
 perform public.b12_audit('request_cancelled','parent_permission_requests',p_request_id,p_organization_id,p_school_id);
 return query select p_request_id,'cancelled',n;
end;
$$;

revoke all on function public.create_permission_request(uuid,uuid,uuid,text,text,text,text,uuid,uuid[],timestamptz,uuid),
  public.cancel_permission_request(uuid,uuid,uuid,bigint,uuid) from public,anon,service_role;
grant execute on function public.create_permission_request(uuid,uuid,uuid,text,text,text,text,uuid,uuid[],timestamptz,uuid),
  public.cancel_permission_request(uuid,uuid,uuid,bigint,uuid) to authenticated;

commit;
