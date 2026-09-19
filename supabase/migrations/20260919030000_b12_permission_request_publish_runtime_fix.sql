begin;

create or replace function public.publish_permission_request(
  p_request_id uuid,p_organization_id uuid,p_school_id uuid,p_expected_version bigint,p_command_request_id uuid default gen_random_uuid()
)
returns table(request_id uuid,status text,version bigint,recipient_count bigint,notification_id uuid)
language plpgsql security definer set search_path=public as $$
declare v public.parent_permission_requests%rowtype; v_count bigint; v_notification uuid; v_version bigint; v_fp text; v_result jsonb;
begin
  select * into v from public.parent_permission_requests pr where pr.id=p_request_id and pr.organization_id=p_organization_id and pr.school_id=p_school_id for update;
  if not found then raise exception using errcode='P0001',message='B12_REQUEST_NOT_FOUND'; end if;
  perform public.b12_require_staff('permission_request.publish',p_organization_id,p_school_id,v.target_classroom_id);
  v_fp:=public.b12_command_fingerprint(jsonb_build_object('kind','publish','request_id',p_request_id,'version',p_expected_version));
  if public.b12_replay_command(p_command_request_id,v_fp) is not null then
    return query select p_request_id,'open',v.version,
      (select count(*) from public.parent_permission_request_recipients rr where rr.request_id=p_request_id),
      (select n.id from public.notifications n where n.source_permission_request_id=p_request_id and n.notification_type='permission_request_published' limit 1);
    return;
  end if;
  if v.status<>'draft' then raise exception using errcode='P0001',message='B12_REQUEST_NOT_DRAFT'; end if;
  if v.version<>p_expected_version then raise exception using errcode='40001',message='B12_STALE_VERSION'; end if;
  if v.due_at is null or v.due_at<=transaction_timestamp() then raise exception using errcode='P0001',message='B12_REQUEST_EXPIRED'; end if;
  if exists(select 1 from public.permission_request_command_requests c where c.actor_profile_id=auth.uid() and c.request_key=p_command_request_id and c.request_fingerprint<>v_fp) then raise exception using errcode='40001',message='B12_IDEMPOTENCY_CONFLICT'; end if;
  if v.target_mode='classroom' then
    insert into public.parent_permission_request_recipients(organization_id,school_id,request_id,student_id,student_enrollment_id,class_enrollment_id,source_type)
    select p_organization_id,p_school_id,p_request_id,e.student_id,e.id,ce.id,'classroom_snapshot'
    from public.class_enrollments ce join public.student_enrollments e on e.id=ce.student_enrollment_id and e.student_id=ce.student_id and e.organization_id=ce.organization_id and e.school_id=ce.school_id
    where ce.classroom_id=v.target_classroom_id and ce.organization_id=p_organization_id and ce.school_id=p_school_id and ce.status='active' and ce.starts_on<=current_date and (ce.ends_on is null or ce.ends_on>=current_date) and e.status='active' and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date)
    on conflict on constraint parent_permission_recipients_request_student_key do nothing;
  else
    insert into public.parent_permission_request_recipients(organization_id,school_id,request_id,student_id,student_enrollment_id,source_type)
    select d.organization_id,d.school_id,d.request_id,d.student_id,e.id,'explicit_student'
    from public.parent_permission_request_draft_targets d join public.student_enrollments e on e.student_id=d.student_id and e.organization_id=d.organization_id and e.school_id=d.school_id and e.status='active' and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date) where d.request_id=p_request_id
    on conflict on constraint parent_permission_recipients_request_student_key do nothing;
  end if;
  select count(*) into v_count from public.parent_permission_request_recipients rr where rr.request_id=p_request_id;
  if v_count=0 then raise exception using errcode='22023',message='B12_NO_ELIGIBLE_RECIPIENTS'; end if;
  insert into public.notifications(organization_id,school_id,notification_type,title,preview,deep_link,dedupe_key,source_permission_request_id,created_by_profile_id)
    values(p_organization_id,p_school_id,'permission_request_published','A permission request is ready','Review the permission request in the Parent Portal','/portal/permission-requests/'||p_request_id,'permission-request:'||p_request_id||':published',p_request_id,auth.uid())
    on conflict on constraint notifications_semantic_event_key do nothing returning id into v_notification;
  if v_notification is null then select n.id into v_notification from public.notifications n where n.organization_id=p_organization_id and n.school_id=p_school_id and n.dedupe_key='permission-request:'||p_request_id||':published'; end if;
  insert into public.notification_recipients(organization_id,school_id,notification_id,recipient_profile_id)
    select distinct rr.organization_id,rr.school_id,v_notification,g.profile_id from public.parent_permission_request_recipients rr join public.student_guardians sg on sg.student_id=rr.student_id and sg.organization_id=rr.organization_id and sg.status='active' and sg.can_manage_permissions and sg.can_receive_notification join public.guardians g on g.id=sg.guardian_id and g.organization_id=sg.organization_id and g.profile_id is not null and g.status='active'
    on conflict on constraint notification_recipients_unique_delivery do nothing;
  update public.parent_permission_requests pr set status='open',published_at=transaction_timestamp(),published_by_profile_id=auth.uid(),version=pr.version+1,updated_at=transaction_timestamp() where pr.id=p_request_id returning pr.version into v_version;
  v_result:=jsonb_build_object('request_id',p_request_id,'status','open','version',v_version,'recipient_count',v_count,'notification_id',v_notification);
  perform public.b12_claim_command(p_command_request_id,p_organization_id,p_school_id,p_request_id,'publish',p_request_id,v_fp,v_result,true);
  perform public.b12_audit('request_published','parent_permission_requests',p_request_id,p_organization_id,p_school_id,jsonb_build_object('recipient_count',v_count));
  return query select p_request_id,'open',v_version,v_count,v_notification;
end;
$$;

commit;
