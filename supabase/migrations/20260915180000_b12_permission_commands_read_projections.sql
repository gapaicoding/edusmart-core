begin;

-- B12 Phase 2: commands and safe read projections. This migration is local and
-- intentionally remains unapplied until the Phase-2 security/integrity audit.

create table public.parent_permission_request_draft_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  request_id uuid not null,
  student_id uuid not null,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint b12_draft_targets_request_student_key unique (request_id, student_id),
  constraint b12_draft_targets_request_fk foreign key (request_id, organization_id, school_id)
    references public.parent_permission_requests(id, organization_id, school_id) on delete restrict,
  constraint b12_draft_targets_student_fk foreign key (student_id, organization_id)
    references public.students(id, organization_id) on delete restrict
);
create index b12_draft_targets_scope_request on public.parent_permission_request_draft_targets
  (organization_id, school_id, request_id, student_id);

alter table public.permission_request_command_requests
  drop constraint permission_request_command_requests_command_kind_check;
alter table public.permission_request_command_requests
  add constraint permission_request_command_requests_command_kind_check
  check (command_kind in ('create','update','publish','decision','reminder','close','cancel'));

alter table public.parent_permission_request_draft_targets enable row level security;
revoke all on table public.parent_permission_request_draft_targets from public, anon, authenticated, service_role;
grant select on table public.parent_permission_request_draft_targets to authenticated;
create policy b12_draft_targets_staff_select on public.parent_permission_request_draft_targets
  for select to authenticated using (
    public.has_staff_scope_permission('permission_request.read', organization_id, school_id)
  );

create or replace function public.b12_command_fingerprint(p_payload jsonb)
returns text language sql immutable security invoker set search_path = '' as $$
  select pg_catalog.encode(extensions.digest(p_payload::text, 'sha256'), 'hex')
$$;

create or replace function public.b12_audit(
  p_action text, p_entity_type text, p_entity_id uuid,
  p_organization_id uuid, p_school_id uuid, p_metadata jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs(organization_id, school_id, actor_profile_id, action,
    entity_type, entity_id, metadata)
  values (p_organization_id, p_school_id, auth.uid(), p_action, p_entity_type,
    p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

create or replace function public.b12_require_staff(
  p_permission text, p_organization_id uuid, p_school_id uuid, p_classroom_id uuid default null
)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null or not public.has_staff_scope_permission(
    p_permission, p_organization_id, p_school_id, p_classroom_id
  ) then
    raise exception using errcode = '42501', message = 'B12_PERMISSION_DENIED';
  end if;
end;
$$;

create or replace function public.b12_claim_command(
  p_command_id uuid, p_organization_id uuid, p_school_id uuid, p_request_id uuid,
  p_kind text, p_target_id uuid, p_fingerprint text, p_result jsonb,
  p_completed boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.permission_request_command_requests%rowtype;
begin
  insert into public.permission_request_command_requests
    (id, organization_id, school_id, request_id, request_key, command_kind,
     target_id, actor_profile_id, request_fingerprint, result, completed_at)
  values (gen_random_uuid(), p_organization_id, p_school_id, p_request_id, p_command_id,
     p_kind, p_target_id, auth.uid(), p_fingerprint,
     case when p_completed then p_result else null end,
     case when p_completed then transaction_timestamp() else null end)
  on conflict (actor_profile_id, request_key) do nothing;
  select * into v_row from public.permission_request_command_requests
    where actor_profile_id=auth.uid() and request_key=p_command_id for update;
  if v_row.request_fingerprint <> p_fingerprint then
    raise exception using errcode = '40001', message = 'B12_IDEMPOTENCY_CONFLICT';
  end if;
  if v_row.completed_at is not null then return v_row.result; end if;
  update public.permission_request_command_requests
    set result=p_result, completed_at=case when p_completed then transaction_timestamp() else null end
    where id=v_row.id;
  return p_result;
end;
$$;

create or replace function public.b12_replay_command(p_command_id uuid, p_fingerprint text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.permission_request_command_requests%rowtype;
begin
  select * into v from public.permission_request_command_requests
    where actor_profile_id=auth.uid() and request_key=p_command_id for update;
  if not found then return null; end if;
  if v.request_fingerprint <> p_fingerprint then
    raise exception using errcode='40001', message='B12_IDEMPOTENCY_CONFLICT';
  end if;
  return v.result;
end;
$$;

create or replace function public.create_permission_request(
  p_organization_id uuid, p_school_id uuid, p_request_id uuid,
  p_request_type text, p_title text, p_description text, p_target_mode text,
  p_target_classroom_id uuid default null, p_student_ids uuid[] default '{}',
  p_due_at timestamptz default null, p_command_request_id uuid default gen_random_uuid()
)
returns table(request_id uuid, status text, version bigint)
language plpgsql security definer set search_path = public as $$
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
  insert into public.parent_permission_requests(id,organization_id,school_id,request_type,title,description,target_mode,target_classroom_id,created_by_profile_id)
  values(p_request_id,p_organization_id,p_school_id,p_request_type,p_title,p_description,p_target_mode,p_target_classroom_id,auth.uid());
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
  update public.parent_permission_requests set request_type=p_request_type,title=p_title,description=p_description,target_mode=p_target_mode,target_classroom_id=p_target_classroom_id,due_at=p_due_at,version=version+1,updated_at=transaction_timestamp() where id=p_request_id;
  delete from public.parent_permission_request_draft_targets where request_id=p_request_id;
  if p_target_mode='students' then
    if coalesce(array_length(p_student_ids,1),0)=0 or exists(select 1 from unnest(p_student_ids) s group by s having count(*)>1) then raise exception using errcode='22023',message='B12_INVALID_TARGET_SET'; end if;
    if exists(select 1 from unnest(p_student_ids) s where not exists(select 1 from public.student_enrollments e where e.student_id=s and e.organization_id=p_organization_id and e.school_id=p_school_id and e.status='active' and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date))) then raise exception using errcode='22023',message='B12_INVALID_TARGET_SET'; end if;
    insert into public.parent_permission_request_draft_targets(organization_id,school_id,request_id,student_id) select p_organization_id,p_school_id,p_request_id,s from unnest(p_student_ids) s;
  end if;
  select version into v_new from public.parent_permission_requests where id=p_request_id;
  v_result:=jsonb_build_object('request_id',p_request_id,'status','draft','version',v_new);
  perform public.b12_claim_command(p_command_request_id,p_organization_id,p_school_id,p_request_id,'update',p_request_id,v_fp,v_result,true);
  perform public.b12_audit('request_edited','parent_permission_requests',p_request_id,p_organization_id,p_school_id);
  return query select p_request_id,'draft',v_new;
end;
$$;

create or replace function public.publish_permission_request(
  p_request_id uuid,p_organization_id uuid,p_school_id uuid,p_expected_version bigint,p_command_request_id uuid default gen_random_uuid()
)
returns table(request_id uuid,status text,version bigint,recipient_count bigint,notification_id uuid)
language plpgsql security definer set search_path=public as $$
declare v public.parent_permission_requests%rowtype; v_count bigint; v_notification uuid; v_version bigint; v_fp text; v_result jsonb;
begin
  select * into v from public.parent_permission_requests where id=p_request_id and organization_id=p_organization_id and school_id=p_school_id for update;
  if not found then raise exception using errcode='P0001',message='B12_REQUEST_NOT_FOUND'; end if;
  perform public.b12_require_staff('permission_request.publish',p_organization_id,p_school_id,v.target_classroom_id);
  v_fp:=public.b12_command_fingerprint(jsonb_build_object('kind','publish','request_id',p_request_id,'version',p_expected_version));
  if public.b12_replay_command(p_command_request_id,v_fp) is not null then return query select p_request_id,'open',v.version,(select count(*) from public.parent_permission_request_recipients where request_id=p_request_id),(select id from public.notifications where source_permission_request_id=p_request_id and notification_type='permission_request_published' limit 1); return; end if;
  if v.status<>'draft' then raise exception using errcode='P0001',message='B12_REQUEST_NOT_DRAFT'; end if;
  if v.version<>p_expected_version then raise exception using errcode='40001',message='B12_STALE_VERSION'; end if;
  if v.due_at is null or v.due_at<=transaction_timestamp() then raise exception using errcode='P0001',message='B12_REQUEST_EXPIRED'; end if;
  if exists(select 1 from public.permission_request_command_requests c where c.actor_profile_id=auth.uid() and c.request_key=p_command_request_id and c.request_fingerprint<>v_fp) then raise exception using errcode='40001',message='B12_IDEMPOTENCY_CONFLICT'; end if;
  if v.target_mode='classroom' then
    insert into public.parent_permission_request_recipients(organization_id,school_id,request_id,student_id,student_enrollment_id,class_enrollment_id,source_type)
    select p_organization_id,p_school_id,p_request_id,e.student_id,e.id,ce.id,'classroom_snapshot'
    from public.class_enrollments ce join public.student_enrollments e on e.id=ce.student_enrollment_id and e.student_id=ce.student_id and e.organization_id=ce.organization_id and e.school_id=ce.school_id
    where ce.classroom_id=v.target_classroom_id and ce.organization_id=p_organization_id and ce.school_id=p_school_id and ce.status='active' and ce.starts_on<=current_date and (ce.ends_on is null or ce.ends_on>=current_date) and e.status='active' and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date) on conflict(request_id,student_id) do nothing;
  else
    insert into public.parent_permission_request_recipients(organization_id,school_id,request_id,student_id,student_enrollment_id,source_type)
    select d.organization_id,d.school_id,d.request_id,d.student_id,e.id,'explicit_student'
    from public.parent_permission_request_draft_targets d join public.student_enrollments e on e.student_id=d.student_id and e.organization_id=d.organization_id and e.school_id=d.school_id and e.status='active' and e.enrolled_on<=current_date and (e.ended_on is null or e.ended_on>=current_date) where d.request_id=p_request_id on conflict(request_id,student_id) do nothing;
  end if;
  select count(*) into v_count from public.parent_permission_request_recipients where request_id=p_request_id;
  if v_count=0 then raise exception using errcode='22023',message='B12_NO_ELIGIBLE_RECIPIENTS'; end if;
  insert into public.notifications(organization_id,school_id,notification_type,title,preview,deep_link,dedupe_key,source_permission_request_id,created_by_profile_id)
    values(p_organization_id,p_school_id,'permission_request_published','A permission request is ready','Review the permission request in the Parent Portal','/portal/permission-requests/'||p_request_id,'permission-request:'||p_request_id||':published',p_request_id,auth.uid()) on conflict(organization_id,school_id,dedupe_key) do nothing returning id into v_notification;
  if v_notification is null then select id into v_notification from public.notifications where organization_id=p_organization_id and school_id=p_school_id and dedupe_key='permission-request:'||p_request_id||':published'; end if;
  insert into public.notification_recipients(organization_id,school_id,notification_id,recipient_profile_id)
    select distinct r.organization_id,r.school_id,v_notification,g.profile_id from public.parent_permission_request_recipients r join public.student_guardians sg on sg.student_id=r.student_id and sg.organization_id=r.organization_id and sg.status='active' and sg.can_manage_permissions and sg.can_receive_notification join public.guardians g on g.id=sg.guardian_id and g.organization_id=sg.organization_id and g.profile_id is not null and g.status='active' on conflict(notification_id,recipient_profile_id) do nothing;
  update public.parent_permission_requests set status='open',published_at=transaction_timestamp(),published_by_profile_id=auth.uid(),version=version+1,updated_at=transaction_timestamp() where id=p_request_id returning version into v_version;
  v_result:=jsonb_build_object('request_id',p_request_id,'status','open','version',v_version,'recipient_count',v_count,'notification_id',v_notification);
  perform public.b12_claim_command(p_command_request_id,p_organization_id,p_school_id,p_request_id,'publish',p_request_id,v_fp,v_result,true);
  perform public.b12_audit('request_published','parent_permission_requests',p_request_id,p_organization_id,p_school_id,jsonb_build_object('recipient_count',v_count));
  return query select p_request_id,'open',v_version,v_count,v_notification;
end;
$$;

create or replace function public.submit_parent_permission_decision(
  p_request_id uuid,p_request_recipient_id uuid,p_decision text,p_expected_version bigint default null,p_command_request_id uuid default gen_random_uuid()
)
returns table(decision_id uuid,request_id uuid,request_recipient_id uuid,decision text,version bigint)
language plpgsql security definer set search_path=public as $$
declare r public.parent_permission_requests%rowtype; rec public.parent_permission_request_recipients%rowtype; d public.parent_permission_decisions%rowtype; g uuid; v_org uuid; v_school uuid; v_new bigint; v_fp text; v_result jsonb;
begin
  if auth.uid() is null or p_decision not in ('approved','rejected') then raise exception using errcode='22023',message='B12_DECISION_NOT_ALLOWED'; end if;
  select * into rec from public.parent_permission_request_recipients where id=p_request_recipient_id and request_id=p_request_id for update;
  if not found then raise exception using errcode='P0001',message='B12_NOT_RECIPIENT'; end if;
  v_org:=rec.organization_id; v_school:=rec.school_id;
  select * into r from public.parent_permission_requests where id=p_request_id and organization_id=v_org and school_id=v_school for update;
  if r.status<>'open' then raise exception using errcode='P0001',message='B12_REQUEST_NOT_OPEN'; end if;
  if r.due_at<=transaction_timestamp() then raise exception using errcode='P0001',message='B12_REQUEST_EXPIRED'; end if;
  select g.id into g from public.guardians g join public.profiles p on p.id=g.profile_id and p.status='active' join public.student_guardians sg on sg.guardian_id=g.id and sg.organization_id=g.organization_id where g.profile_id=auth.uid() and g.organization_id=v_org and g.status='active' and sg.student_id=rec.student_id and sg.status='active' and sg.can_manage_permissions limit 1;
  if g is null then raise exception using errcode='42501',message='B12_PARENT_RELATION_REQUIRED'; end if;
  v_fp:=public.b12_command_fingerprint(jsonb_build_object('kind','decision','request_id',p_request_id,'recipient_id',p_request_recipient_id,'decision',p_decision,'expected_version',p_expected_version));
  if public.b12_replay_command(p_command_request_id,v_fp) is not null then return query select (select id from public.parent_permission_decisions where request_recipient_id=p_request_recipient_id),p_request_id,p_request_recipient_id,p_decision,(select version from public.parent_permission_decisions where request_recipient_id=p_request_recipient_id); return; end if;
  if exists(select 1 from public.permission_request_command_requests c where c.actor_profile_id=auth.uid() and c.request_key=p_command_request_id and c.request_fingerprint<>v_fp) then raise exception using errcode='40001',message='B12_IDEMPOTENCY_CONFLICT'; end if;
  select * into d from public.parent_permission_decisions where request_recipient_id=p_request_recipient_id for update;
  if found then
    if d.decided_by_guardian_id<>g then raise exception using errcode='42501',message='B12_DECISION_OWNED_BY_OTHER_GUARDIAN'; end if;
    if p_expected_version is null or d.version<>p_expected_version then raise exception using errcode='40001',message='B12_STALE_VERSION'; end if;
    if d.decision=p_decision then v_new:=d.version; else update public.parent_permission_decisions set decision=p_decision,version=version+1,updated_at=transaction_timestamp() where id=d.id returning version into v_new; insert into public.parent_permission_decision_history(organization_id,school_id,request_id,request_recipient_id,decision_id,student_id,actor_guardian_id,actor_profile_id,old_decision,new_decision,operation) values(v_org,v_school,p_request_id,p_request_recipient_id,d.id,rec.student_id,g,auth.uid(),d.decision,p_decision,'changed'); perform public.b12_audit('decision_changed','parent_permission_decisions',d.id,v_org,v_school); end if;
  else
    insert into public.parent_permission_decisions(organization_id,school_id,request_id,request_recipient_id,student_id,decided_by_guardian_id,decided_by_profile_id,decision) values(v_org,v_school,p_request_id,p_request_recipient_id,rec.student_id,g,auth.uid(),p_decision) returning * into d;
    insert into public.parent_permission_decision_history(organization_id,school_id,request_id,request_recipient_id,decision_id,student_id,actor_guardian_id,actor_profile_id,new_decision,operation) values(v_org,v_school,p_request_id,p_request_recipient_id,d.id,rec.student_id,g,auth.uid(),p_decision,'submitted');
    v_new:=d.version; perform public.b12_audit('decision_submitted','parent_permission_decisions',d.id,v_org,v_school);
  end if;
  v_result:=jsonb_build_object('decision_id',coalesce(d.id,(select id from public.parent_permission_decisions where request_recipient_id=p_request_recipient_id)),'request_id',p_request_id,'request_recipient_id',p_request_recipient_id,'decision',p_decision,'version',v_new);
  perform public.b12_claim_command(p_command_request_id,v_org,v_school,p_request_id,'decision',p_request_recipient_id,v_fp,v_result,true);
  return query select (v_result->>'decision_id')::uuid,p_request_id,p_request_recipient_id,p_decision,v_new;
end;
$$;

create or replace function public.close_permission_request(p_request_id uuid,p_organization_id uuid,p_school_id uuid,p_expected_version bigint,p_command_request_id uuid default gen_random_uuid())
returns table(request_id uuid,status text,version bigint) language plpgsql security definer set search_path=public as $$
declare v public.parent_permission_requests%rowtype; n bigint; fp text; result jsonb;
begin
 select * into v from public.parent_permission_requests where id=p_request_id and organization_id=p_organization_id and school_id=p_school_id for update;
 if not found then raise exception using errcode='P0001',message='B12_REQUEST_NOT_FOUND'; end if;
 perform public.b12_require_staff('permission_request.close',p_organization_id,p_school_id,v.target_classroom_id);
 fp:=public.b12_command_fingerprint(jsonb_build_object('kind','close','request_id',p_request_id,'version',p_expected_version));
 if public.b12_replay_command(p_command_request_id,fp) is not null then return query select p_request_id,'closed',v.version; return; end if;
 if v.status<>'open' then raise exception using errcode='P0001',message='B12_REQUEST_NOT_OPEN'; end if;
 if v.version<>p_expected_version then raise exception using errcode='40001',message='B12_STALE_VERSION'; end if;
 update public.parent_permission_requests set status='closed',closed_at=transaction_timestamp(),closed_by_profile_id=auth.uid(),version=version+1,updated_at=transaction_timestamp() where id=p_request_id returning version into n;
 result:=jsonb_build_object('request_id',p_request_id,'status','closed','version',n); perform public.b12_claim_command(p_command_request_id,p_organization_id,p_school_id,p_request_id,'close',p_request_id,fp,result,true); perform public.b12_audit('request_closed','parent_permission_requests',p_request_id,p_organization_id,p_school_id); return query select p_request_id,'closed',n;
end; $$;

create or replace function public.cancel_permission_request(p_request_id uuid,p_organization_id uuid,p_school_id uuid,p_expected_version bigint,p_command_request_id uuid default gen_random_uuid())
returns table(request_id uuid,status text,version bigint) language plpgsql security definer set search_path=public as $$
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
 update public.parent_permission_requests set status='cancelled',cancelled_at=transaction_timestamp(),cancelled_by_profile_id=auth.uid(),published_at=coalesce(published_at,transaction_timestamp()),version=version+1,updated_at=transaction_timestamp() where id=p_request_id returning version into n;
 result:=jsonb_build_object('request_id',p_request_id,'status','cancelled','version',n); perform public.b12_claim_command(p_command_request_id,p_organization_id,p_school_id,p_request_id,'cancel',p_request_id,fp,result,true); perform public.b12_audit('request_cancelled','parent_permission_requests',p_request_id,p_organization_id,p_school_id); return query select p_request_id,'cancelled',n;
end; $$;

create or replace function public.send_permission_request_reminder(p_request_id uuid,p_organization_id uuid,p_school_id uuid,p_command_request_id uuid default gen_random_uuid())
returns table(request_id uuid,notification_id uuid,delivery_count bigint) language plpgsql security definer set search_path=public as $$
declare r public.parent_permission_requests%rowtype; n uuid; c bigint; fp text; result jsonb; k text;
begin
 select * into r from public.parent_permission_requests where id=p_request_id and organization_id=p_organization_id and school_id=p_school_id for update;
 if not found then raise exception using errcode='P0001',message='B12_REQUEST_NOT_FOUND'; end if;
 perform public.b12_require_staff('notification.send',p_organization_id,p_school_id,r.target_classroom_id);
 perform public.b12_require_staff('permission_request.read',p_organization_id,p_school_id,r.target_classroom_id);
 if r.status<>'open' then raise exception using errcode='P0001',message='B12_REQUEST_NOT_OPEN'; end if;
 if r.due_at<=transaction_timestamp() then raise exception using errcode='P0001',message='B12_REQUEST_EXPIRED'; end if;
 fp:=public.b12_command_fingerprint(jsonb_build_object('kind','reminder','request_id',p_request_id,'command_request_id',p_command_request_id)); k:='permission-request:'||p_request_id||':reminder:'||p_command_request_id;
 if public.b12_replay_command(p_command_request_id,fp) is not null then return query select p_request_id,(select id from public.notifications where organization_id=p_organization_id and school_id=p_school_id and dedupe_key=k),(select count(*) from public.notification_recipients nr join public.notifications nn on nn.id=nr.notification_id where nn.organization_id=p_organization_id and nn.school_id=p_school_id and nn.dedupe_key=k); return; end if;
 insert into public.notifications(organization_id,school_id,notification_type,title,preview,deep_link,dedupe_key,source_permission_request_id,created_by_profile_id) values(p_organization_id,p_school_id,'permission_request_reminder','A permission request is awaiting your response','Review the pending permission request','/portal/permission-requests/'||p_request_id,k,p_request_id,auth.uid()) on conflict(organization_id,school_id,dedupe_key) do nothing returning id into n;
 if n is null then select id into n from public.notifications where organization_id=p_organization_id and school_id=p_school_id and dedupe_key=k; end if;
 insert into public.notification_recipients(organization_id,school_id,notification_id,recipient_profile_id)
 select distinct r.organization_id,r.school_id,n,g.profile_id from public.parent_permission_request_recipients rr join public.student_guardians sg on sg.student_id=rr.student_id and sg.organization_id=rr.organization_id and sg.status='active' and sg.can_manage_permissions and sg.can_receive_notification join public.guardians g on g.id=sg.guardian_id and g.organization_id=sg.organization_id and g.status='active' and g.profile_id is not null where rr.request_id=p_request_id and not exists(select 1 from public.parent_permission_decisions d where d.request_recipient_id=rr.id) on conflict(notification_id,recipient_profile_id) do nothing;
 select count(*) into c from public.notification_recipients where notification_id=n;
 result:=jsonb_build_object('request_id',p_request_id,'notification_id',n,'delivery_count',c); perform public.b12_claim_command(p_command_request_id,p_organization_id,p_school_id,p_request_id,'reminder',p_request_id,fp,result,true); perform public.b12_audit('reminder_sent','parent_permission_requests',p_request_id,p_organization_id,p_school_id,jsonb_build_object('delivery_count',c)); return query select p_request_id,n,c;
end; $$;

create or replace function public.mark_notification_read(p_notification_recipient_id uuid)
returns table(notification_recipient_id uuid,read_at timestamptz) language plpgsql security definer set search_path=public as $$
begin
 update public.notification_recipients set read_at=coalesce(read_at,transaction_timestamp()) where id=p_notification_recipient_id and recipient_profile_id=auth.uid() returning id,notification_recipients.read_at into notification_recipient_id,read_at;
 if not found then raise exception using errcode='P0001',message='B12_NOTIFICATION_NOT_FOUND'; end if;
end; $$;

create or replace function public.list_staff_permission_requests(p_organization_id uuid,p_school_id uuid,p_status text default null,p_page_size integer default 50,p_offset integer default 0)
returns table(id uuid,title text,request_type text,target_mode text,status text,due_at timestamptz,published_at timestamptz,created_at timestamptz,version bigint,recipient_count bigint,pending_count bigint,approved_count bigint,rejected_count bigint)
language sql security definer stable set search_path=public as $$
 select r.id,r.title,r.request_type,r.target_mode,r.status,r.due_at,r.published_at,r.created_at,r.version,
 (select count(*) from public.parent_permission_request_recipients x where x.request_id=r.id),
 (select count(*) from public.parent_permission_request_recipients x where x.request_id=r.id and not exists(select 1 from public.parent_permission_decisions d where d.request_recipient_id=x.id)),
 (select count(*) from public.parent_permission_request_recipients x join public.parent_permission_decisions d on d.request_recipient_id=x.id and d.decision='approved' where x.request_id=r.id),
 (select count(*) from public.parent_permission_request_recipients x join public.parent_permission_decisions d on d.request_recipient_id=x.id and d.decision='rejected' where x.request_id=r.id)
 from public.parent_permission_requests r where r.organization_id=p_organization_id and r.school_id=p_school_id and public.has_staff_scope_permission('permission_request.read',r.organization_id,r.school_id,r.target_classroom_id) and (p_status is null or r.status=p_status) order by r.created_at desc limit least(greatest(p_page_size,1),100) offset greatest(p_offset,0)
$$;

create or replace function public.get_staff_permission_request(p_request_id uuid,p_organization_id uuid,p_school_id uuid)
returns table(id uuid,title text,description text,request_type text,target_mode text,target_classroom_id uuid,status text,due_at timestamptz,published_at timestamptz,created_at timestamptz,version bigint,recipient_count bigint,pending_count bigint,approved_count bigint,rejected_count bigint)
language sql security definer stable set search_path=public as $$
 select x.id,x.title,x.description,x.request_type,x.target_mode,x.target_classroom_id,x.status,x.due_at,x.published_at,x.created_at,x.version,
 (select count(*) from public.parent_permission_request_recipients r where r.request_id=x.id),
 (select count(*) from public.parent_permission_request_recipients r where r.request_id=x.id and not exists(select 1 from public.parent_permission_decisions d where d.request_recipient_id=r.id)),
 (select count(*) from public.parent_permission_request_recipients r join public.parent_permission_decisions d on d.request_recipient_id=r.id and d.decision='approved' where r.request_id=x.id),
 (select count(*) from public.parent_permission_request_recipients r join public.parent_permission_decisions d on d.request_recipient_id=r.id and d.decision='rejected' where r.request_id=x.id)
 from public.parent_permission_requests x where x.id=p_request_id and x.organization_id=p_organization_id and x.school_id=p_school_id and public.has_staff_scope_permission('permission_request.read',x.organization_id,x.school_id,x.target_classroom_id)
$$;

create or replace function public.list_permission_request_responses(p_request_id uuid,p_page_size integer default 50,p_offset integer default 0)
returns table(recipient_id uuid,student_id uuid,student_name text,decision text,decided_at timestamptz,decided boolean)
language sql security definer stable set search_path=public as $$
 select r.id,r.student_id,coalesce(s.preferred_name,s.full_name,'Student'),d.decision,d.decided_at,(d.id is not null)
 from public.parent_permission_request_recipients r join public.parent_permission_requests q on q.id=r.request_id and public.has_staff_scope_permission('permission_request.read',q.organization_id,q.school_id,q.target_classroom_id) join public.students s on s.id=r.student_id left join public.parent_permission_decisions d on d.request_recipient_id=r.id where r.request_id=p_request_id order by s.full_name limit least(greatest(p_page_size,1),100) offset greatest(p_offset,0)
$$;

create or replace function public.list_parent_permission_requests(p_page_size integer default 50,p_offset integer default 0)
returns table(id uuid,title text,request_type text,status text,due_at timestamptz,expired boolean,students jsonb)
language sql security definer stable set search_path=public as $$
 select q.id,q.title,q.request_type,q.status,q.due_at,(q.status='open' and q.due_at<=transaction_timestamp()),jsonb_agg(jsonb_build_object('recipient_id',r.id,'student_id',r.student_id,'student_name',coalesce(s.preferred_name,s.full_name,'Student'),'decision',d.decision,'owned_by_me',d.decided_by_profile_id=auth.uid(),'can_respond',q.status='open' and q.due_at>transaction_timestamp() and (d.id is null or d.decided_by_profile_id=auth.uid())))
 from public.parent_permission_requests q join public.parent_permission_request_recipients r on r.request_id=q.id join public.students s on s.id=r.student_id join public.student_guardians sg on sg.student_id=r.student_id and sg.organization_id=r.organization_id and sg.status='active' and sg.can_manage_permissions join public.guardians g on g.id=sg.guardian_id and g.organization_id=sg.organization_id and g.profile_id=auth.uid() and g.status='active' join public.profiles p on p.id=g.profile_id and p.status='active' left join public.parent_permission_decisions d on d.request_recipient_id=r.id where q.status<>'draft' group by q.id order by max(q.created_at) desc limit least(greatest(p_page_size,1),100) offset greatest(p_offset,0)
$$;

create or replace function public.get_parent_permission_request(p_request_id uuid)
returns table(id uuid,title text,description text,request_type text,status text,due_at timestamptz,expired boolean,students jsonb)
language sql security definer stable set search_path=public as $$
 select q.id,q.title,q.description,q.request_type,q.status,q.due_at,(q.status='open' and q.due_at<=transaction_timestamp()),jsonb_agg(jsonb_build_object('recipient_id',r.id,'student_id',r.student_id,'student_name',coalesce(s.preferred_name,s.full_name,'Student'),'decision',d.decision,'owned_by_me',d.decided_by_profile_id=auth.uid(),'can_respond',q.status='open' and q.due_at>transaction_timestamp() and (d.id is null or d.decided_by_profile_id=auth.uid())))
 from public.parent_permission_requests q join public.parent_permission_request_recipients r on r.request_id=q.id join public.students s on s.id=r.student_id join public.student_guardians sg on sg.student_id=r.student_id and sg.organization_id=r.organization_id and sg.status='active' and sg.can_manage_permissions join public.guardians g on g.id=sg.guardian_id and g.organization_id=sg.organization_id and g.profile_id=auth.uid() and g.status='active' join public.profiles p on p.id=g.profile_id and p.status='active' left join public.parent_permission_decisions d on d.request_recipient_id=r.id where q.id=p_request_id and q.status<>'draft' group by q.id
$$;

create or replace function public.list_permission_decision_history(p_request_id uuid,p_request_recipient_id uuid default null,p_page_size integer default 50,p_offset integer default 0)
returns table(operation text,old_decision text,new_decision text,changed_at timestamptz)
language sql security definer stable set search_path=public as $$
 select h.operation,h.old_decision,h.new_decision,h.changed_at from public.parent_permission_decision_history h join public.parent_permission_request_recipients r on r.id=h.request_recipient_id join public.student_guardians sg on sg.student_id=r.student_id and sg.organization_id=r.organization_id and sg.status='active' and sg.can_manage_permissions join public.guardians g on g.id=sg.guardian_id and g.organization_id=sg.organization_id and g.profile_id=auth.uid() and g.status='active' join public.profiles p on p.id=g.profile_id and p.status='active' where h.request_id=p_request_id and (p_request_recipient_id is null or h.request_recipient_id=p_request_recipient_id) order by h.changed_at desc limit least(greatest(p_page_size,1),100) offset greatest(p_offset,0)
$$;

create or replace function public.list_my_notifications(p_page_size integer default 50,p_offset integer default 0)
returns table(delivery_id uuid,notification_id uuid,notification_type text,title text,preview text,deep_link text,created_at timestamptz,read_at timestamptz,expires_at timestamptz,source_request_id uuid,unread_count bigint)
language sql security definer stable set search_path=public as $$
 select nr.id,n.id,n.notification_type,n.title,n.preview,n.deep_link,n.created_at,nr.read_at,n.expires_at,n.source_permission_request_id,(select count(*) from public.notification_recipients x where x.recipient_profile_id=auth.uid() and x.read_at is null) from public.notification_recipients nr join public.notifications n on n.id=nr.notification_id and n.organization_id=nr.organization_id and n.school_id=nr.school_id where nr.recipient_profile_id=auth.uid() order by nr.created_at desc limit least(greatest(p_page_size,1),100) offset greatest(p_offset,0)
$$;

revoke all on function public.b12_command_fingerprint(jsonb),public.b12_audit(text,text,uuid,uuid,uuid,jsonb),public.b12_require_staff(text,uuid,uuid,uuid),public.b12_claim_command(uuid,uuid,uuid,uuid,text,uuid,text,jsonb,boolean),public.b12_replay_command(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.create_permission_request(uuid,uuid,uuid,text,text,text,text,uuid,uuid[],timestamptz,uuid),public.update_permission_request(uuid,uuid,uuid,bigint,text,text,text,text,uuid,uuid[],timestamptz,uuid),public.publish_permission_request(uuid,uuid,uuid,bigint,uuid),public.submit_parent_permission_decision(uuid,uuid,text,bigint,uuid),public.close_permission_request(uuid,uuid,uuid,bigint,uuid),public.cancel_permission_request(uuid,uuid,uuid,bigint,uuid),public.send_permission_request_reminder(uuid,uuid,uuid,uuid),public.mark_notification_read(uuid) from public,anon,service_role;
grant execute on function public.create_permission_request(uuid,uuid,uuid,text,text,text,text,uuid,uuid[],timestamptz,uuid),public.update_permission_request(uuid,uuid,uuid,bigint,text,text,text,text,uuid,uuid[],timestamptz,uuid),public.publish_permission_request(uuid,uuid,uuid,bigint,uuid),public.submit_parent_permission_decision(uuid,uuid,text,bigint,uuid),public.close_permission_request(uuid,uuid,uuid,bigint,uuid),public.cancel_permission_request(uuid,uuid,uuid,bigint,uuid),public.send_permission_request_reminder(uuid,uuid,uuid,uuid),public.mark_notification_read(uuid) to authenticated;
revoke all on function public.list_staff_permission_requests(uuid,uuid,text,integer,integer),public.get_staff_permission_request(uuid,uuid,uuid),public.list_permission_request_responses(uuid,integer,integer),public.list_parent_permission_requests(integer,integer),public.get_parent_permission_request(uuid),public.list_permission_decision_history(uuid,uuid,integer,integer),public.list_my_notifications(integer,integer) from public,anon,service_role;
grant execute on function public.list_staff_permission_requests(uuid,uuid,text,integer,integer),public.get_staff_permission_request(uuid,uuid,uuid),public.list_permission_request_responses(uuid,integer,integer),public.list_parent_permission_requests(integer,integer),public.get_parent_permission_request(uuid),public.list_permission_decision_history(uuid,uuid,integer,integer),public.list_my_notifications(integer,integer) to authenticated;

comment on table public.parent_permission_request_draft_targets is 'B12 Phase-2 editable pre-publication target set; published recipients remain authoritative.';

commit;
