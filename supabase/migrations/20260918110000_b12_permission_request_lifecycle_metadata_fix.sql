-- B12 lifecycle metadata correction.
-- Draft cancellation must not manufacture a publish timestamp. Published
-- timestamps remain preserved for requests that were genuinely opened.
begin;

alter table public.parent_permission_requests
  drop constraint parent_permission_requests_lifecycle_fields_check;

alter table public.parent_permission_requests
  add constraint parent_permission_requests_lifecycle_fields_check
  check (
    (status = 'draft' and published_at is null and closed_at is null and cancelled_at is null)
    or (status = 'open' and published_at is not null and closed_at is null and cancelled_at is null and due_at is not null)
    or (status = 'closed' and published_at is not null and closed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and closed_at is null and cancelled_at is not null)
  );

create or replace function public.cancel_permission_request(
  p_request_id uuid,
  p_organization_id uuid,
  p_school_id uuid,
  p_expected_version bigint,
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
       version=public.parent_permission_requests.version+1,updated_at=transaction_timestamp()
   where id=p_request_id
   returning public.parent_permission_requests.version into n;
 result:=jsonb_build_object('request_id',p_request_id,'status','cancelled','version',n);
 perform public.b12_claim_command(p_command_request_id,p_organization_id,p_school_id,p_request_id,'cancel',p_request_id,fp,result,true);
 perform public.b12_audit('request_cancelled','parent_permission_requests',p_request_id,p_organization_id,p_school_id);
 return query select p_request_id,'cancelled',n;
end;
$$;

revoke all on function public.cancel_permission_request(uuid,uuid,uuid,bigint,uuid) from public,anon,service_role;
grant execute on function public.cancel_permission_request(uuid,uuid,uuid,bigint,uuid) to authenticated;

commit;
