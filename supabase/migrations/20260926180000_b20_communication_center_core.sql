begin;

-- Batch 20: Communication Center announcement foundation and in-app broadcast
-- runtime. This is additive and deliberately reuses B12 notifications and
-- notification_recipients for delivery/read state.

create table public.communication_announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  school_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  body text not null check (length(btrim(body)) between 1 and 10000),
  status text not null default 'draft' check (status in ('draft','published')),
  version bigint not null default 1 check (version > 0),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  updated_at timestamptz not null default pg_catalog.transaction_timestamp(),
  published_by_profile_id uuid references public.profiles(id) on delete restrict,
  published_at timestamptz,
  constraint communication_announcements_id_org_school_key unique (id, organization_id, school_id),
  constraint communication_announcements_school_fk foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint communication_announcements_publish_metadata_check check (
    (status = 'draft' and published_by_profile_id is null and published_at is null)
    or (status = 'published' and published_by_profile_id is not null and published_at is not null)
  )
);

create index idx_communication_announcements_school_status
  on public.communication_announcements (organization_id, school_id, status, created_at desc);

create table public.communication_announcement_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  announcement_id uuid not null,
  target_scope text not null check (target_scope in ('school','classroom')),
  classroom_id uuid,
  audience_type text not null check (audience_type in ('staff','student','guardian')),
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint communication_targets_announcement_fk foreign key (announcement_id, organization_id, school_id)
    references public.communication_announcements(id, organization_id, school_id) on delete restrict,
  constraint communication_targets_classroom_fk foreign key (classroom_id, organization_id, school_id)
    references public.classrooms(id, organization_id, school_id) on delete restrict,
  constraint communication_targets_scope_check check (
    (target_scope = 'school' and classroom_id is null)
    or (target_scope = 'classroom' and classroom_id is not null)
  )
);

create unique index communication_targets_school_unique
  on public.communication_announcement_targets (announcement_id, audience_type)
  where classroom_id is null;
create unique index communication_targets_classroom_unique
  on public.communication_announcement_targets (announcement_id, classroom_id, audience_type)
  where classroom_id is not null;
create index idx_communication_targets_classroom
  on public.communication_announcement_targets (organization_id, school_id, classroom_id, audience_type);

create table public.communication_announcement_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  announcement_id uuid not null,
  recipient_profile_id uuid not null references public.profiles(id) on delete restrict,
  recipient_type text not null check (recipient_type in ('staff','student','guardian')),
  resolved_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint communication_recipients_announcement_fk foreign key (announcement_id, organization_id, school_id)
    references public.communication_announcements(id, organization_id, school_id) on delete restrict,
  constraint communication_recipients_unique_profile unique (announcement_id, recipient_profile_id),
  constraint communication_recipients_id_org_school_key unique (id, organization_id, school_id)
);

create index idx_communication_recipients_profile
  on public.communication_announcement_recipients (recipient_profile_id, resolved_at desc);

create table public.communication_command_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  announcement_id uuid,
  request_key uuid not null,
  command_kind text not null check (command_kind in ('create','update','publish')),
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  completed_at timestamptz,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  retained_until timestamptz not null default (pg_catalog.transaction_timestamp() + interval '30 days'),
  constraint communication_commands_announcement_fk foreign key (announcement_id, organization_id, school_id)
    references public.communication_announcements(id, organization_id, school_id) on delete restrict,
  constraint communication_commands_request_key unique (actor_profile_id, request_key),
  constraint communication_commands_retention_check check (retained_until > created_at)
);

create index idx_communication_commands_scope
  on public.communication_command_requests (organization_id, school_id, announcement_id, created_at desc);

alter table public.notifications
  add column source_announcement_id uuid;
alter table public.notifications
  add constraint notifications_announcement_fk foreign key (source_announcement_id, organization_id, school_id)
  references public.communication_announcements(id, organization_id, school_id) on delete restrict;
create index idx_notifications_announcement on public.notifications (source_announcement_id);

create or replace function public.guard_b20_announcement_immutable()
returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.status = 'published' then
    raise exception using errcode = '23514', message = 'B20_ANNOUNCEMENT_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger trg_b20_announcement_immutable
before update or delete on public.communication_announcements
for each row execute function public.guard_b20_announcement_immutable();

create or replace function public.guard_b20_published_targets_immutable()
returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    select 1 from public.communication_announcements a
    where a.id = coalesce(old.announcement_id, new.announcement_id)
      and a.organization_id = coalesce(old.organization_id, new.organization_id)
      and a.school_id = coalesce(old.school_id, new.school_id)
      and a.status = 'published'
  ) then
    raise exception using errcode = '23514', message = 'B20_PUBLISHED_TARGETS_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger trg_b20_published_targets_immutable
before update or delete on public.communication_announcement_targets
for each row execute function public.guard_b20_published_targets_immutable();

create or replace function public.guard_b20_recipient_snapshot_immutable()
returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'B20_RECIPIENT_SNAPSHOT_IMMUTABLE';
end;
$$;
create trigger trg_b20_recipient_snapshot_immutable
before update or delete on public.communication_announcement_recipients
for each row execute function public.guard_b20_recipient_snapshot_immutable();

alter table public.communication_announcements enable row level security;
alter table public.communication_announcements force row level security;
alter table public.communication_announcement_targets enable row level security;
alter table public.communication_announcement_targets force row level security;
alter table public.communication_announcement_recipients enable row level security;
alter table public.communication_announcement_recipients force row level security;
alter table public.communication_command_requests enable row level security;
alter table public.communication_command_requests force row level security;

create policy b20_announcement_staff_select on public.communication_announcements
for select to authenticated using (
  public.has_staff_scope_permission('notification.send', organization_id, school_id)
);
create policy b20_targets_staff_select on public.communication_announcement_targets
for select to authenticated using (
  public.has_staff_scope_permission('notification.send', organization_id, school_id)
);
create policy b20_recipients_staff_select on public.communication_announcement_recipients
for select to authenticated using (
  public.has_staff_scope_permission('notification.send', organization_id, school_id)
);

revoke all on table public.communication_announcements,
  public.communication_announcement_targets,
  public.communication_announcement_recipients,
  public.communication_command_requests from public, anon, authenticated, service_role;
revoke all on function public.guard_b20_announcement_immutable(), public.guard_b20_published_targets_immutable(), public.guard_b20_recipient_snapshot_immutable() from public, anon, authenticated, service_role;

create or replace function public.b20_require_staff(
  p_permission text, p_organization_id uuid, p_school_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_staff_scope_permission(p_permission, p_organization_id, p_school_id) then
    raise exception using errcode = '42501', message = 'B20_PERMISSION_DENIED';
  end if;
end;
$$;

create or replace function public.b20_replace_targets(
  p_announcement_id uuid, p_organization_id uuid, p_school_id uuid, p_targets jsonb
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  t jsonb; a text; v_scope text; v_classroom_id uuid; v_count bigint := 0;
begin
  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) < 1 or jsonb_array_length(p_targets) > 100 then
    raise exception using errcode = '22023', message = 'B20_INVALID_TARGET_SCOPE';
  end if;
  delete from public.communication_announcement_targets
  where announcement_id = p_announcement_id and organization_id = p_organization_id and school_id = p_school_id;
  for t in select value from jsonb_array_elements(p_targets) loop
    v_scope := lower(btrim(t->>'scope'));
    v_classroom_id := nullif(t->>'classroom_id','')::uuid;
    if v_scope not in ('school','classroom') or (v_scope = 'school' and v_classroom_id is not null) or (v_scope = 'classroom' and v_classroom_id is null) then
      raise exception using errcode = '22023', message = 'B20_INVALID_TARGET_SCOPE';
    end if;
    if v_classroom_id is not null and not exists (
      select 1 from public.classrooms c
      where c.id = v_classroom_id and c.organization_id = p_organization_id and c.school_id = p_school_id and c.status = 'active'
    ) then
      raise exception using errcode = '22023', message = 'B20_FOREIGN_CLASSROOM';
    end if;
    if jsonb_typeof(t->'audiences') <> 'array' then
      raise exception using errcode = '22023', message = 'B20_INVALID_AUDIENCE';
    end if;
    for a in select jsonb_array_elements_text(t->'audiences') loop
      if a not in ('staff','student','guardian') then
        raise exception using errcode = '22023', message = 'B20_INVALID_AUDIENCE';
      end if;
      insert into public.communication_announcement_targets(organization_id,school_id,announcement_id,target_scope,classroom_id,audience_type)
      values(p_organization_id,p_school_id,p_announcement_id,v_scope,v_classroom_id,a)
      on conflict do nothing;
      v_count := v_count + 1;
    end loop;
  end loop;
  if v_count = 0 then
    raise exception using errcode = '22023', message = 'B20_NO_AUDIENCE';
  end if;
  return v_count;
end;
$$;

create or replace function public.b20_start_command(
  p_request_key uuid, p_organization_id uuid, p_school_id uuid, p_announcement_id uuid,
  p_kind text, p_fingerprint text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.communication_command_requests%rowtype;
begin
  insert into public.communication_command_requests(organization_id,school_id,announcement_id,request_key,command_kind,actor_profile_id,request_fingerprint)
  values(p_organization_id,p_school_id,p_announcement_id,p_request_key,p_kind,auth.uid(),p_fingerprint)
  on conflict (actor_profile_id,request_key) do nothing;
  select * into v from public.communication_command_requests where actor_profile_id=auth.uid() and request_key=p_request_key for update;
  if v.request_fingerprint <> p_fingerprint then raise exception using errcode='40001',message='B20_IDEMPOTENCY_CONFLICT'; end if;
  return v.result;
end;
$$;

create or replace function public.b20_finish_command(p_request_key uuid, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update public.communication_command_requests set result=p_result,completed_at=pg_catalog.transaction_timestamp()
  where actor_profile_id=auth.uid() and request_key=p_request_key;
  return p_result;
end;
$$;

create or replace function public.b20_create_announcement(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_school_id uuid := (p_input->>'school_id')::uuid; v_org uuid; v_id uuid; v_fp text; v_replay jsonb; v_targets bigint; v_result jsonb;
begin
  select s.organization_id into v_org from public.schools s where s.id=v_school_id;
  if v_org is null then raise exception using errcode='P0001',message='B20_ANNOUNCEMENT_NOT_FOUND'; end if;
  perform public.b20_require_staff('notification.send',v_org,v_school_id);
  v_id := coalesce(nullif(p_input->>'announcement_id','')::uuid,gen_random_uuid());
  v_fp := public.b12_command_fingerprint(jsonb_build_object('kind','create','announcement_id',v_id,'school_id',v_school_id,'title',btrim(p_input->>'title'),'body',btrim(p_input->>'body'),'targets',p_input->'targets'));
  -- A create command has no durable announcement row until after the command
  -- ledger reservation.  Keep the nullable FK null for this first step; the
  -- result is the authoritative announcement identity for replay.
  v_replay := public.b20_start_command((p_input->>'request_id')::uuid,v_org,v_school_id,null,'create',v_fp);
  if v_replay is not null then return v_replay; end if;
  insert into public.communication_announcements(id,organization_id,school_id,title,body,created_by_profile_id)
  values(v_id,v_org,v_school_id,btrim(p_input->>'title'),btrim(p_input->>'body'),auth.uid());
  v_targets := public.b20_replace_targets(v_id,v_org,v_school_id,p_input->'targets');
  v_result := jsonb_build_object('announcement_id',v_id,'status','draft','version',1,'target_count',v_targets);
  return public.b20_finish_command((p_input->>'request_id')::uuid,v_result);
end;
$$;

create or replace function public.b20_update_announcement(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.communication_announcements%rowtype; v_fp text; v_replay jsonb; v_targets bigint; v_result jsonb;
begin
  select * into v from public.communication_announcements where id=(p_input->>'announcement_id')::uuid and school_id=(p_input->>'school_id')::uuid for update;
  if not found then raise exception using errcode='P0001',message='B20_ANNOUNCEMENT_NOT_FOUND'; end if;
  perform public.b20_require_staff('notification.send',v.organization_id,v.school_id);
  v_fp := public.b12_command_fingerprint(jsonb_build_object('kind','update','announcement_id',v.id,'version',p_input->>'expected_version','title',btrim(p_input->>'title'),'body',btrim(p_input->>'body'),'targets',p_input->'targets'));
  v_replay := public.b20_start_command((p_input->>'request_id')::uuid,v.organization_id,v.school_id,v.id,'update',v_fp);
  if v_replay is not null then return v_replay; end if;
  if v.status <> 'draft' then raise exception using errcode='P0001',message='B20_ANNOUNCEMENT_NOT_DRAFT'; end if;
  if v.version <> (p_input->>'expected_version')::bigint then raise exception using errcode='40001',message='B20_STALE_VERSION'; end if;
  update public.communication_announcements set title=btrim(p_input->>'title'),body=btrim(p_input->>'body'),version=version+1,updated_at=pg_catalog.transaction_timestamp() where id=v.id;
  v_targets := public.b20_replace_targets(v.id,v.organization_id,v.school_id,p_input->'targets');
  v_result := jsonb_build_object('announcement_id',v.id,'status','draft','version',v.version+1,'target_count',v_targets);
  return public.b20_finish_command((p_input->>'request_id')::uuid,v_result);
end;
$$;

create or replace function public.b20_publish_announcement(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.communication_announcements%rowtype; v_fp text; v_replay jsonb; v_notification uuid; v_count bigint; v_result jsonb;
begin
  select * into v from public.communication_announcements where id=(p_input->>'announcement_id')::uuid and school_id=(p_input->>'school_id')::uuid for update;
  if not found then raise exception using errcode='P0001',message='B20_ANNOUNCEMENT_NOT_FOUND'; end if;
  perform public.b20_require_staff('notification.send',v.organization_id,v.school_id);
  v_fp := public.b12_command_fingerprint(jsonb_build_object('kind','publish','announcement_id',v.id,'version',p_input->>'expected_version'));
  v_replay := public.b20_start_command((p_input->>'request_id')::uuid,v.organization_id,v.school_id,v.id,'publish',v_fp);
  if v_replay is not null then return v_replay; end if;
  if v.status <> 'draft' then raise exception using errcode='P0001',message='B20_ANNOUNCEMENT_ALREADY_PUBLISHED'; end if;
  if v.version <> (p_input->>'expected_version')::bigint then raise exception using errcode='40001',message='B20_STALE_VERSION'; end if;
  if not exists(select 1 from public.communication_announcement_targets t where t.announcement_id=v.id) then raise exception using errcode='22023',message='B20_NO_AUDIENCE'; end if;
  insert into public.communication_announcement_recipients(organization_id,school_id,announcement_id,recipient_profile_id,recipient_type)
  select distinct v.organization_id,v.school_id,v.id,q.recipient_profile_id,q.recipient_type
  from (
    select p.id recipient_profile_id,'staff' recipient_type
    from public.communication_announcement_targets t
    join public.organization_memberships m on t.target_scope='school' and m.organization_id=v.organization_id and m.status='active'
    join public.membership_school_access msa on msa.membership_id=m.id and msa.organization_id=v.organization_id and msa.school_id=v.school_id and msa.status='active'
    join public.profiles p on p.id=m.profile_id and p.status='active'
    where t.announcement_id=v.id and t.audience_type='staff'
    union all
    select p.id,'staff'
    from public.communication_announcement_targets t
    join public.teaching_assignments ta on t.target_scope='classroom' and ta.classroom_id=t.classroom_id and ta.organization_id=v.organization_id and ta.school_id=v.school_id and ta.status='active' and ta.starts_on<=current_date and (ta.ends_on is null or ta.ends_on>=current_date)
    join public.staff_school_assignments ssa on ssa.id=ta.staff_school_assignment_id and ssa.organization_id=v.organization_id and ssa.school_id=v.school_id and ssa.status='active'
    join public.staff_members sm on sm.id=ssa.staff_member_id and sm.organization_id=v.organization_id and sm.status='active'
    join public.profiles p on p.id=sm.profile_id and p.status='active'
    where t.announcement_id=v.id and t.audience_type='staff'
    union all
    select p.id,'staff'
    from public.communication_announcement_targets t
    join public.classrooms c on c.id=t.classroom_id and c.organization_id=v.organization_id and c.school_id=v.school_id and c.homeroom_staff_school_assignment_id is not null
    join public.staff_school_assignments ssa on ssa.id=c.homeroom_staff_school_assignment_id and ssa.organization_id=v.organization_id and ssa.school_id=v.school_id and ssa.status='active'
    join public.staff_members sm on sm.id=ssa.staff_member_id and sm.organization_id=v.organization_id and sm.status='active'
    join public.profiles p on p.id=sm.profile_id and p.status='active'
    where t.announcement_id=v.id and t.target_scope='classroom' and t.audience_type='staff'
    union all
    select p.id,'student'
    from public.communication_announcement_targets t
    join public.student_enrollments se on se.organization_id=v.organization_id and se.school_id=v.school_id and se.status in ('active','leave') and se.enrolled_on<=current_date and (se.ended_on is null or se.ended_on>=current_date)
    join public.students s on s.id=se.student_id and s.organization_id=v.organization_id and s.status='active'
    join public.profiles p on p.id=s.profile_id and p.status='active'
    left join public.class_enrollments ce on ce.student_enrollment_id=se.id and ce.organization_id=v.organization_id and ce.school_id=v.school_id and ce.status='active' and ce.starts_on<=current_date and (ce.ends_on is null or ce.ends_on>=current_date)
    where t.announcement_id=v.id and t.audience_type='student' and (t.target_scope='school' or ce.classroom_id=t.classroom_id)
    union all
    select p.id,'guardian'
    from public.communication_announcement_targets t
    join public.student_enrollments se on se.organization_id=v.organization_id and se.school_id=v.school_id and se.status in ('active','leave') and se.enrolled_on<=current_date and (se.ended_on is null or se.ended_on>=current_date)
    join public.students s on s.id=se.student_id and s.organization_id=v.organization_id and s.status='active'
    left join public.class_enrollments ce on ce.student_enrollment_id=se.id and ce.organization_id=v.organization_id and ce.school_id=v.school_id and ce.status='active' and ce.starts_on<=current_date and (ce.ends_on is null or ce.ends_on>=current_date)
    join public.student_guardians sg on sg.student_id=s.id and sg.organization_id=v.organization_id and sg.status='active' and sg.can_receive_notification
    join public.guardians g on g.id=sg.guardian_id and g.organization_id=v.organization_id and g.status='active' and g.profile_id is not null
    join public.profiles p on p.id=g.profile_id and p.status='active'
    where t.announcement_id=v.id and t.audience_type='guardian' and (t.target_scope='school' or ce.classroom_id=t.classroom_id)
  ) q on conflict (announcement_id,recipient_profile_id) do nothing;
  select count(*) into v_count from public.communication_announcement_recipients where announcement_id=v.id;
  if v_count=0 then raise exception using errcode='22023',message='B20_NO_ELIGIBLE_RECIPIENTS'; end if;
  insert into public.notifications(organization_id,school_id,notification_type,title,preview,deep_link,dedupe_key,source_announcement_id,created_by_profile_id)
  values(v.organization_id,v.school_id,'announcement_published',v.title,left(v.body,500),'/communications/'||v.id,'announcement:'||v.id||':published',v.id,auth.uid())
  on conflict(organization_id,school_id,dedupe_key) do nothing returning id into v_notification;
  if v_notification is null then select n.id into v_notification from public.notifications n where n.organization_id=v.organization_id and n.school_id=v.school_id and n.dedupe_key='announcement:'||v.id||':published'; end if;
  insert into public.notification_recipients(organization_id,school_id,notification_id,recipient_profile_id)
  select v.organization_id,v.school_id,v_notification,r.recipient_profile_id from public.communication_announcement_recipients r where r.announcement_id=v.id on conflict(notification_id,recipient_profile_id) do nothing;
  update public.communication_announcements set status='published',version=version+1,published_by_profile_id=auth.uid(),published_at=pg_catalog.transaction_timestamp(),updated_at=pg_catalog.transaction_timestamp() where id=v.id;
  v_result:=jsonb_build_object('announcement_id',v.id,'status','published','version',v.version+1,'recipient_count',v_count,'notification_id',v_notification);
  return public.b20_finish_command((p_input->>'request_id')::uuid,v_result);
end;
$$;

create or replace function public.b20_list_announcements(p_school_id uuid,p_page_size integer default 20,p_offset integer default 0)
returns table(id uuid,title text,status text,target_count bigint,recipient_count bigint,created_at timestamptz,published_at timestamptz,version bigint)
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select s.organization_id into v_org from public.schools s where s.id=p_school_id;
  if v_org is null then return; end if;
  perform public.b20_require_staff('notification.send',v_org,p_school_id);
  return query select a.id,a.title,a.status,(select count(*) from public.communication_announcement_targets t where t.announcement_id=a.id),(select count(*) from public.communication_announcement_recipients r where r.announcement_id=a.id),a.created_at,a.published_at,a.version
  from public.communication_announcements a where a.organization_id=v_org and a.school_id=p_school_id order by a.created_at desc limit least(greatest(coalesce(p_page_size,20),1),100) offset greatest(coalesce(p_offset,0),0);
end;
$$;

create or replace function public.b20_get_announcement(p_announcement_id uuid,p_school_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.communication_announcements%rowtype; v_allowed boolean; v_org uuid;
begin
  select * into a from public.communication_announcements x where x.id=p_announcement_id and x.school_id=p_school_id;
  if not found then raise exception using errcode='P0001',message='B20_ANNOUNCEMENT_NOT_FOUND'; end if;
  select s.organization_id into v_org from public.schools s where s.id=p_school_id;
  v_allowed := public.has_staff_scope_permission('notification.send',v_org,p_school_id) or exists(select 1 from public.notification_recipients nr join public.notifications n on n.id=nr.notification_id and n.organization_id=nr.organization_id and n.school_id=nr.school_id where n.source_announcement_id=a.id and nr.recipient_profile_id=auth.uid());
  if not v_allowed then raise exception using errcode='42501',message='B20_PERMISSION_DENIED'; end if;
  return jsonb_build_object('id',a.id,'title',a.title,'body',a.body,'status',a.status,'version',a.version,'created_at',a.created_at,'published_at',a.published_at,'target_count',(select count(*) from public.communication_announcement_targets t where t.announcement_id=a.id),'recipient_count',(select count(*) from public.communication_announcement_recipients r where r.announcement_id=a.id),'targets',(select coalesce(jsonb_agg(jsonb_build_object('scope',t.target_scope,'classroom_id',t.classroom_id,'audience',t.audience_type) order by t.target_scope,t.classroom_id,t.audience_type),'[]'::jsonb) from public.communication_announcement_targets t where t.announcement_id=a.id),'readable_recipient',exists(select 1 from public.notification_recipients nr join public.notifications n on n.id=nr.notification_id where n.source_announcement_id=a.id and nr.recipient_profile_id=auth.uid()));
end;
$$;

revoke all on function public.b20_require_staff(text,uuid,uuid),public.b20_replace_targets(uuid,uuid,uuid,jsonb),public.b20_start_command(uuid,uuid,uuid,uuid,text,text),public.b20_finish_command(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.b20_create_announcement(jsonb),public.b20_update_announcement(jsonb),public.b20_publish_announcement(jsonb),public.b20_list_announcements(uuid,integer,integer),public.b20_get_announcement(uuid,uuid) from public,anon,service_role;
grant execute on function public.b20_create_announcement(jsonb),public.b20_update_announcement(jsonb),public.b20_publish_announcement(jsonb),public.b20_list_announcements(uuid,integer,integer),public.b20_get_announcement(uuid,uuid) to authenticated;

commit;
