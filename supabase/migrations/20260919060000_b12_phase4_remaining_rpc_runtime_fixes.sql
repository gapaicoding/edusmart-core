begin;

create or replace function public.send_permission_request_reminder(
  p_request_id uuid,
  p_organization_id uuid,
  p_school_id uuid,
  p_command_request_id uuid default gen_random_uuid()
)
returns table(request_id uuid, notification_id uuid, delivery_count bigint)
language plpgsql security definer set search_path=public as $$
declare
  r public.parent_permission_requests%rowtype;
  n uuid;
  c bigint;
  fp text;
  result jsonb;
  k text;
begin
  select pr.* into r
  from public.parent_permission_requests pr
  where pr.id=p_request_id
    and pr.organization_id=p_organization_id
    and pr.school_id=p_school_id
  for update;
  if not found then raise exception using errcode='P0001',message='B12_REQUEST_NOT_FOUND'; end if;
  perform public.b12_require_staff('notification.send',p_organization_id,p_school_id,r.target_classroom_id);
  perform public.b12_require_staff('permission_request.read',p_organization_id,p_school_id,r.target_classroom_id);
  if r.status<>'open' then raise exception using errcode='P0001',message='B12_REQUEST_NOT_OPEN'; end if;
  if r.due_at<=transaction_timestamp() then raise exception using errcode='P0001',message='B12_REQUEST_EXPIRED'; end if;
  fp:=public.b12_command_fingerprint(jsonb_build_object('kind','reminder','request_id',p_request_id,'command_request_id',p_command_request_id));
  k:='permission-request:'||p_request_id||':reminder:'||p_command_request_id;
  if public.b12_replay_command(p_command_request_id,fp) is not null then
    return query
      select p_request_id,
        (select nn.id from public.notifications nn where nn.organization_id=p_organization_id and nn.school_id=p_school_id and nn.dedupe_key=k),
        (select count(*) from public.notification_recipients nr join public.notifications nn on nn.id=nr.notification_id where nn.organization_id=p_organization_id and nn.school_id=p_school_id and nn.dedupe_key=k);
    return;
  end if;
  insert into public.notifications(organization_id,school_id,notification_type,title,preview,deep_link,dedupe_key,source_permission_request_id,created_by_profile_id)
    values(p_organization_id,p_school_id,'permission_request_reminder','A permission request is awaiting your response','Review the pending permission request','/portal/permission-requests/'||p_request_id,k,p_request_id,auth.uid())
    on conflict(organization_id,school_id,dedupe_key) do nothing
    returning id into n;
  if n is null then
    select nn.id into n from public.notifications nn where nn.organization_id=p_organization_id and nn.school_id=p_school_id and nn.dedupe_key=k;
  end if;
  insert into public.notification_recipients(organization_id,school_id,notification_id,recipient_profile_id)
    select distinct rr.organization_id,rr.school_id,n,g.profile_id
    from public.parent_permission_request_recipients rr
    join public.student_guardians sg on sg.student_id=rr.student_id and sg.organization_id=rr.organization_id and sg.status='active' and sg.can_manage_permissions and sg.can_receive_notification
    join public.guardians g on g.id=sg.guardian_id and g.organization_id=sg.organization_id and g.status='active' and g.profile_id is not null
    where rr.request_id=p_request_id
      and not exists(select 1 from public.parent_permission_decisions d where d.request_recipient_id=rr.id)
    on conflict do nothing;
  select count(*) into c from public.notification_recipients nr where nr.notification_id=n;
  result:=jsonb_build_object('request_id',p_request_id,'notification_id',n,'delivery_count',c);
  perform public.b12_claim_command(p_command_request_id,p_organization_id,p_school_id,p_request_id,'reminder',p_request_id,fp,result,true);
  perform public.b12_audit('reminder_sent','parent_permission_requests',p_request_id,p_organization_id,p_school_id,jsonb_build_object('delivery_count',c));
  return query select p_request_id,n,c;
end;
$$;

create or replace function public.submit_parent_permission_decision(
  p_request_id uuid,
  p_request_recipient_id uuid,
  p_decision text,
  p_expected_version bigint default null,
  p_command_request_id uuid default gen_random_uuid()
)
returns table(decision_id uuid,request_id uuid,request_recipient_id uuid,decision text,version bigint)
language plpgsql security definer set search_path=public as $$
declare
  r public.parent_permission_requests%rowtype;
  rec public.parent_permission_request_recipients%rowtype;
  d public.parent_permission_decisions%rowtype;
  g uuid;
  v_org uuid;
  v_school uuid;
  v_new bigint;
  v_fp text;
  v_result jsonb;
begin
  if auth.uid() is null or p_decision not in ('approved','rejected') then raise exception using errcode='22023',message='B12_DECISION_NOT_ALLOWED'; end if;
  select rr.* into rec
  from public.parent_permission_request_recipients rr
  where rr.id=p_request_recipient_id and rr.request_id=p_request_id
  for update;
  if not found then raise exception using errcode='P0001',message='B12_NOT_RECIPIENT'; end if;
  v_org:=rec.organization_id;
  v_school:=rec.school_id;
  select pr.* into r
  from public.parent_permission_requests pr
  where pr.id=p_request_id and pr.organization_id=v_org and pr.school_id=v_school
  for update;
  if r.status<>'open' then raise exception using errcode='P0001',message='B12_REQUEST_NOT_OPEN'; end if;
  if r.due_at<=transaction_timestamp() then raise exception using errcode='P0001',message='B12_REQUEST_EXPIRED'; end if;
  select gg.id into g
  from public.guardians gg
  join public.profiles pp on pp.id=gg.profile_id and pp.status='active'
  join public.student_guardians sg on sg.guardian_id=gg.id and sg.organization_id=gg.organization_id
  where gg.profile_id=auth.uid() and gg.organization_id=v_org and gg.status='active'
    and sg.student_id=rec.student_id and sg.status='active' and sg.can_manage_permissions
  limit 1;
  if g is null then raise exception using errcode='42501',message='B12_PARENT_RELATION_REQUIRED'; end if;
  v_fp:=public.b12_command_fingerprint(jsonb_build_object('kind','decision','request_id',p_request_id,'recipient_id',p_request_recipient_id,'decision',p_decision,'expected_version',p_expected_version));
  if public.b12_replay_command(p_command_request_id,v_fp) is not null then
    return query select (select dd.id from public.parent_permission_decisions dd where dd.request_recipient_id=p_request_recipient_id),p_request_id,p_request_recipient_id,p_decision,(select dd.version from public.parent_permission_decisions dd where dd.request_recipient_id=p_request_recipient_id);
    return;
  end if;
  if exists(select 1 from public.permission_request_command_requests c where c.actor_profile_id=auth.uid() and c.request_key=p_command_request_id and c.request_fingerprint<>v_fp) then raise exception using errcode='40001',message='B12_IDEMPOTENCY_CONFLICT'; end if;
  select dd.* into d from public.parent_permission_decisions dd where dd.request_recipient_id=p_request_recipient_id for update;
  if found then
    if d.decided_by_guardian_id<>g then raise exception using errcode='42501',message='B12_DECISION_OWNED_BY_OTHER_GUARDIAN'; end if;
    if p_expected_version is null or d.version<>p_expected_version then raise exception using errcode='40001',message='B12_STALE_VERSION'; end if;
    if d.decision=p_decision then
      v_new:=d.version;
    else
      update public.parent_permission_decisions pd
      set decision=p_decision,version=pd.version+1,updated_at=transaction_timestamp()
      where pd.id=d.id
      returning pd.version into v_new;
      insert into public.parent_permission_decision_history(organization_id,school_id,request_id,request_recipient_id,decision_id,student_id,actor_guardian_id,actor_profile_id,old_decision,new_decision,operation)
        values(v_org,v_school,p_request_id,p_request_recipient_id,d.id,rec.student_id,g,auth.uid(),d.decision,p_decision,'changed');
      perform public.b12_audit('decision_changed','parent_permission_decisions',d.id,v_org,v_school);
    end if;
  else
    insert into public.parent_permission_decisions(organization_id,school_id,request_id,request_recipient_id,student_id,decided_by_guardian_id,decided_by_profile_id,decision)
      values(v_org,v_school,p_request_id,p_request_recipient_id,rec.student_id,g,auth.uid(),p_decision)
      returning * into d;
    insert into public.parent_permission_decision_history(organization_id,school_id,request_id,request_recipient_id,decision_id,student_id,actor_guardian_id,actor_profile_id,new_decision,operation)
      values(v_org,v_school,p_request_id,p_request_recipient_id,d.id,rec.student_id,g,auth.uid(),p_decision,'submitted');
    v_new:=d.version;
    perform public.b12_audit('decision_submitted','parent_permission_decisions',d.id,v_org,v_school);
  end if;
  v_result:=jsonb_build_object('decision_id',coalesce(d.id,(select dd.id from public.parent_permission_decisions dd where dd.request_recipient_id=p_request_recipient_id)),'request_id',p_request_id,'request_recipient_id',p_request_recipient_id,'decision',p_decision,'version',v_new);
  perform public.b12_claim_command(p_command_request_id,v_org,v_school,p_request_id,'decision',p_request_recipient_id,v_fp,v_result,true);
  return query select (v_result->>'decision_id')::uuid,p_request_id,p_request_recipient_id,p_decision,v_new;
end;
$$;

create or replace function public.close_permission_request(
  p_request_id uuid,
  p_organization_id uuid,
  p_school_id uuid,
  p_expected_version bigint,
  p_command_request_id uuid default gen_random_uuid()
)
returns table(request_id uuid,status text,version bigint)
language plpgsql security definer set search_path=public as $$
declare
  v public.parent_permission_requests%rowtype;
  n bigint;
  fp text;
  result jsonb;
begin
  select pr.* into v
  from public.parent_permission_requests pr
  where pr.id=p_request_id and pr.organization_id=p_organization_id and pr.school_id=p_school_id
  for update;
  if not found then raise exception using errcode='P0001',message='B12_REQUEST_NOT_FOUND'; end if;
  perform public.b12_require_staff('permission_request.close',p_organization_id,p_school_id,v.target_classroom_id);
  fp:=public.b12_command_fingerprint(jsonb_build_object('kind','close','request_id',p_request_id,'version',p_expected_version));
  if public.b12_replay_command(p_command_request_id,fp) is not null then return query select p_request_id,'closed',v.version; return; end if;
  if v.status<>'open' then raise exception using errcode='P0001',message='B12_REQUEST_NOT_OPEN'; end if;
  if v.version<>p_expected_version then raise exception using errcode='40001',message='B12_STALE_VERSION'; end if;
  update public.parent_permission_requests pr
  set status='closed',closed_at=transaction_timestamp(),closed_by_profile_id=auth.uid(),version=pr.version+1,updated_at=transaction_timestamp()
  where pr.id=p_request_id
  returning pr.version into n;
  result:=jsonb_build_object('request_id',p_request_id,'status','closed','version',n);
  perform public.b12_claim_command(p_command_request_id,p_organization_id,p_school_id,p_request_id,'close',p_request_id,fp,result,true);
  perform public.b12_audit('request_closed','parent_permission_requests',p_request_id,p_organization_id,p_school_id);
  return query select p_request_id,'closed',n;
end;
$$;

commit;
