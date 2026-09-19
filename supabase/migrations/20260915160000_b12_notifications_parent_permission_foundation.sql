begin;

-- Batch 12 foundation only. Commands/UI are intentionally deferred to Phase 2.

create table public.parent_permission_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  school_id uuid not null,
  request_type text not null check (length(btrim(request_type)) between 1 and 60),
  title text not null check (length(btrim(title)) between 1 and 200),
  description text check (description is null or length(description) <= 5000),
  target_mode text not null check (target_mode in ('students','classroom')),
  target_classroom_id uuid,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','open','closed','cancelled')),
  due_at timestamptz,
  published_at timestamptz,
  published_by_profile_id uuid references public.profiles(id) on delete restrict,
  closed_at timestamptz,
  closed_by_profile_id uuid references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by_profile_id uuid references public.profiles(id) on delete restrict,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  updated_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint parent_permission_requests_id_org_school_key unique (id, organization_id, school_id),
  constraint parent_permission_requests_school_fk foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint parent_permission_requests_classroom_fk foreign key (target_classroom_id, organization_id, school_id)
    references public.classrooms(id, organization_id, school_id) on delete restrict,
  constraint parent_permission_requests_target_check check (
    (target_mode = 'classroom' and target_classroom_id is not null)
    or (target_mode = 'students' and target_classroom_id is null)
  ),
  constraint parent_permission_requests_lifecycle_fields_check check (
    (status = 'draft' and published_at is null and closed_at is null and cancelled_at is null)
    or (status = 'open' and published_at is not null and closed_at is null and cancelled_at is null and due_at is not null)
    or (status = 'closed' and published_at is not null and closed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and published_at is not null and cancelled_at is not null and closed_at is null)
  ),
  constraint parent_permission_requests_due_check check (due_at is null or due_at > created_at)
);
create index idx_parent_permission_requests_scope_status on public.parent_permission_requests (organization_id, school_id, status, due_at, created_at desc);

do $b12_enrollment_key$
declare
  enrollment_rel oid;
  target_object oid;
  target_kind "char";
  required_attnums int2[];
  compatible_constraint boolean;
  compatible_index boolean;
begin
  select c.oid
    into enrollment_rel
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'student_enrollments' and c.relkind in ('r', 'p');

  if enrollment_rel is null then
    raise exception using errcode = '42P01', message = 'B12 enrollment key target table is missing';
  end if;

  select array[
    (select a.attnum from pg_catalog.pg_attribute a where a.attrelid = enrollment_rel and a.attname = 'id' and not a.attisdropped),
    (select a.attnum from pg_catalog.pg_attribute a where a.attrelid = enrollment_rel and a.attname = 'student_id' and not a.attisdropped),
    (select a.attnum from pg_catalog.pg_attribute a where a.attrelid = enrollment_rel and a.attname = 'organization_id' and not a.attisdropped),
    (select a.attnum from pg_catalog.pg_attribute a where a.attrelid = enrollment_rel and a.attname = 'school_id' and not a.attisdropped)
  ]::int2[] into required_attnums;

  if array_position(required_attnums, null::int2) is not null then
    raise exception using errcode = '42703', message = 'B12 enrollment key target columns are incomplete';
  end if;

  select c.oid, c.relkind
    into target_object, target_kind
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'student_enrollments_id_student_org_school_key';

  select exists (
    select 1
    from pg_catalog.pg_constraint con
    where con.conrelid = enrollment_rel
      and con.contype = 'u'
      and con.conkey = required_attnums
      and con.conindid = target_object
  ) into compatible_constraint;

  select exists (
    select 1
    from pg_catalog.pg_index idx
    where idx.indexrelid = target_object
      and idx.indrelid = enrollment_rel
      and idx.indisunique and idx.indisvalid and idx.indisready
      and idx.indpred is null and idx.indexprs is null
      and idx.indkey::int2[] = required_attnums
  ) into compatible_index;

  if target_object is not null then
    if compatible_constraint or compatible_index then
      return;
    end if;
    raise exception using errcode = '42710', message = 'B12 enrollment key object exists with incompatible definition';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint con
    where con.conrelid = enrollment_rel and con.contype = 'u' and con.conkey = required_attnums
  ) or exists (
    select 1
    from pg_catalog.pg_index idx
    where idx.indrelid = enrollment_rel
      and idx.indisunique and idx.indisvalid and idx.indisready
      and idx.indpred is null and idx.indexprs is null
      and idx.indkey::int2[] = required_attnums
  ) then
    return;
  end if;

  execute 'alter table public.student_enrollments add constraint student_enrollments_id_student_org_school_key unique (id, student_id, organization_id, school_id)';
end
$b12_enrollment_key$;

alter table public.guardians
  add constraint guardians_id_profile_org_key unique (id, profile_id, organization_id);

create table public.parent_permission_request_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  request_id uuid not null,
  student_id uuid not null,
  student_enrollment_id uuid not null,
  class_enrollment_id uuid,
  source_type text not null check (source_type in ('explicit_student','classroom_snapshot')),
  snapshot_at timestamptz not null default pg_catalog.transaction_timestamp(),
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint parent_permission_recipients_id_org_school_key unique (id, organization_id, school_id),
  constraint parent_permission_recipients_request_student_key unique (request_id, student_id),
  constraint parent_permission_recipients_semantic_key unique (id, organization_id, school_id, request_id, student_id),
  constraint parent_permission_recipients_request_fk foreign key (request_id, organization_id, school_id)
    references public.parent_permission_requests(id, organization_id, school_id) on delete restrict,
  constraint parent_permission_recipients_student_fk foreign key (student_id, organization_id)
    references public.students(id, organization_id) on delete restrict,
  constraint parent_permission_recipients_enrollment_fk foreign key (student_enrollment_id, student_id, organization_id, school_id)
    references public.student_enrollments(id, student_id, organization_id, school_id) on delete restrict,
  constraint parent_permission_recipients_class_enrollment_fk foreign key (class_enrollment_id, organization_id, school_id)
    references public.class_enrollments(id, organization_id, school_id) on delete restrict
);
create index idx_parent_permission_recipients_request on public.parent_permission_request_recipients (request_id, created_at);
create index idx_parent_permission_recipients_student on public.parent_permission_request_recipients (organization_id, school_id, student_id);

create table public.parent_permission_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  request_id uuid not null,
  request_recipient_id uuid not null,
  student_id uuid not null,
  decided_by_guardian_id uuid not null,
  decided_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('approved','rejected')),
  version bigint not null default 1 check (version > 0),
  decided_at timestamptz not null default pg_catalog.transaction_timestamp(),
  updated_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint parent_permission_decisions_id_org_school_key unique (id, organization_id, school_id),
  constraint parent_permission_decisions_recipient_key unique (request_recipient_id),
  constraint parent_permission_decisions_semantic_key unique (id, organization_id, school_id, request_id, request_recipient_id, student_id),
  constraint parent_permission_decisions_recipient_fk foreign key (request_recipient_id, organization_id, school_id, request_id, student_id)
    references public.parent_permission_request_recipients(id, organization_id, school_id, request_id, student_id) on delete restrict,
  constraint parent_permission_decisions_guardian_fk foreign key (decided_by_guardian_id, organization_id)
    references public.guardians(id, organization_id) on delete restrict,
  constraint parent_permission_decisions_guardian_profile_fk foreign key (decided_by_guardian_id, decided_by_profile_id, organization_id)
    references public.guardians(id, profile_id, organization_id) on delete restrict
);
create index idx_parent_permission_decisions_request on public.parent_permission_decisions (request_id, updated_at desc);

create table public.parent_permission_decision_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  request_id uuid not null,
  request_recipient_id uuid not null,
  decision_id uuid not null,
  student_id uuid not null,
  actor_guardian_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  old_decision text check (old_decision is null or old_decision in ('approved','rejected')),
  new_decision text not null check (new_decision in ('approved','rejected')),
  operation text not null default 'submitted' check (operation in ('submitted','changed')),
  changed_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint parent_permission_history_id_org_school_key unique (id, organization_id, school_id),
  constraint parent_permission_history_decision_fk foreign key (decision_id, organization_id, school_id, request_id, request_recipient_id, student_id)
    references public.parent_permission_decisions(id, organization_id, school_id, request_id, request_recipient_id, student_id) on delete restrict,
  constraint parent_permission_history_guardian_fk foreign key (actor_guardian_id, organization_id)
    references public.guardians(id, organization_id) on delete restrict
);
create index idx_parent_permission_history_recipient on public.parent_permission_decision_history (request_recipient_id, changed_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  school_id uuid not null,
  notification_type text not null check (length(btrim(notification_type)) between 1 and 60),
  title text not null check (length(btrim(title)) between 1 and 200),
  preview text check (preview is null or length(preview) <= 500),
  deep_link text check (deep_link is null or length(deep_link) <= 500),
  dedupe_key text not null check (length(btrim(dedupe_key)) between 1 and 200),
  source_permission_request_id uuid,
  created_by_profile_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  expires_at timestamptz,
  constraint notifications_id_org_school_key unique (id, organization_id, school_id),
  constraint notifications_school_fk foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint notifications_request_fk foreign key (source_permission_request_id, organization_id, school_id)
    references public.parent_permission_requests(id, organization_id, school_id) on delete restrict,
  constraint notifications_semantic_event_key unique (organization_id, school_id, dedupe_key),
  constraint notifications_expiry_check check (expires_at is null or expires_at >= created_at)
);
create index idx_notifications_source on public.notifications (source_permission_request_id);

create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  notification_id uuid not null,
  recipient_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  read_at timestamptz,
  constraint notification_recipients_id_org_school_key unique (id, organization_id, school_id),
  constraint notification_recipients_unique_delivery unique (notification_id, recipient_profile_id),
  constraint notification_recipients_notification_fk foreign key (notification_id, organization_id, school_id)
    references public.notifications(id, organization_id, school_id) on delete restrict,
  constraint notification_recipients_read_check check (read_at is null or read_at >= created_at)
);
create index idx_notification_recipients_inbox on public.notification_recipients (recipient_profile_id, read_at, created_at desc);

create table public.permission_request_command_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  request_id uuid,
  request_key uuid not null,
  command_kind text not null check (command_kind in ('publish','decision','reminder','close','cancel')),
  target_id uuid,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and not (result ?| array['description','student_name','guardian_name','note','body']))),
  completed_at timestamptz,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  retained_until timestamptz not null default (pg_catalog.transaction_timestamp() + interval '30 days'),
  constraint permission_request_commands_id_org_school_key unique (id, organization_id, school_id),
  constraint permission_request_commands_request_key unique (actor_profile_id, request_key),
  constraint permission_request_commands_request_fk foreign key (request_id, organization_id, school_id)
    references public.parent_permission_requests(id, organization_id, school_id) on delete restrict,
  constraint permission_request_commands_retention_check check (retained_until > created_at)
);
create index idx_permission_request_commands_target on public.permission_request_command_requests (organization_id, school_id, target_id, created_at desc);

create or replace function public.guard_b12_published_recipient_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'B12_PERMISSION_RECIPIENT_IMMUTABLE';
end;
$$;
create trigger trg_b12_recipient_immutable
before update or delete on public.parent_permission_request_recipients
for each row execute function public.guard_b12_published_recipient_immutable();

create or replace function public.guard_b12_decision_history_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'B12_PERMISSION_HISTORY_IMMUTABLE';
end;
$$;
create trigger trg_b12_decision_history_immutable
before update or delete on public.parent_permission_decision_history
for each row execute function public.guard_b12_decision_history_immutable();

create or replace function public.guard_b12_notification_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'B12_NOTIFICATION_IMMUTABLE';
end;
$$;
create trigger trg_b12_notification_immutable
before update or delete on public.notifications
for each row execute function public.guard_b12_notification_immutable();

alter table public.parent_permission_requests enable row level security;
alter table public.parent_permission_request_recipients enable row level security;
alter table public.parent_permission_decisions enable row level security;
alter table public.parent_permission_decision_history enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.permission_request_command_requests enable row level security;

create policy b12_requests_staff_select on public.parent_permission_requests
for select to authenticated using (public.has_staff_scope_permission('permission_request.read', organization_id, school_id, target_classroom_id));
create policy b12_requests_parent_select on public.parent_permission_requests
for select to authenticated using (
  status <> 'draft' and exists (
    select 1 from public.parent_permission_request_recipients r
    join public.student_guardians sg on sg.student_id=r.student_id and sg.organization_id=r.organization_id
    join public.guardians g on g.id=sg.guardian_id and g.organization_id=sg.organization_id
    where r.request_id=parent_permission_requests.id and r.organization_id=parent_permission_requests.organization_id
      and r.school_id=parent_permission_requests.school_id and sg.status='active' and sg.can_manage_permissions
      and g.status='active' and g.profile_id=auth.uid()
  )
);
create policy b12_recipients_staff_select on public.parent_permission_request_recipients
for select to authenticated using (public.has_staff_scope_permission('permission_request.read', organization_id, school_id));
create policy b12_recipients_parent_select on public.parent_permission_request_recipients
for select to authenticated using (exists (
  select 1 from public.student_guardians sg join public.guardians g on g.id=sg.guardian_id and g.organization_id=sg.organization_id
  where sg.student_id=parent_permission_request_recipients.student_id and sg.organization_id=parent_permission_request_recipients.organization_id
    and sg.status='active' and sg.can_manage_permissions and g.status='active' and g.profile_id=auth.uid()
));
create policy b12_decisions_staff_select on public.parent_permission_decisions
for select to authenticated using (public.has_staff_scope_permission('permission_request.read', organization_id, school_id));
create policy b12_decisions_parent_select on public.parent_permission_decisions
for select to authenticated using (exists (
  select 1 from public.student_guardians sg join public.guardians g on g.id=sg.guardian_id and g.organization_id=sg.organization_id
  where sg.student_id=parent_permission_decisions.student_id and sg.organization_id=parent_permission_decisions.organization_id
    and sg.status='active' and sg.can_manage_permissions and g.status='active' and g.profile_id=auth.uid()
));
create policy b12_history_staff_select on public.parent_permission_decision_history
for select to authenticated using (public.has_staff_scope_permission('permission_request.read', organization_id, school_id));
create policy b12_history_parent_select on public.parent_permission_decision_history
for select to authenticated using (exists (
  select 1 from public.student_guardians sg join public.guardians g on g.id=sg.guardian_id and g.organization_id=sg.organization_id
  where sg.student_id=(select d.student_id from public.parent_permission_decisions d where d.id=parent_permission_decision_history.decision_id)
    and sg.organization_id=parent_permission_decision_history.organization_id and sg.status='active' and sg.can_manage_permissions
    and g.status='active' and g.profile_id=auth.uid()
));
create policy b12_notifications_recipient_select on public.notifications
for select to authenticated using (exists (
  select 1 from public.notification_recipients nr where nr.notification_id=notifications.id and nr.organization_id=notifications.organization_id and nr.school_id=notifications.school_id and nr.recipient_profile_id=auth.uid()
));
create policy b12_notification_recipients_own_select on public.notification_recipients
for select to authenticated using (recipient_profile_id=auth.uid());

revoke all on table public.parent_permission_requests, public.parent_permission_request_recipients, public.parent_permission_decisions, public.parent_permission_decision_history, public.notifications, public.notification_recipients, public.permission_request_command_requests from public, anon, authenticated, service_role;
grant select on table public.parent_permission_requests, public.parent_permission_request_recipients, public.parent_permission_decisions, public.parent_permission_decision_history, public.notifications, public.notification_recipients to authenticated;
revoke all on function public.guard_b12_published_recipient_immutable() from public, anon, authenticated, service_role;
revoke all on function public.guard_b12_decision_history_immutable() from public, anon, authenticated, service_role;
revoke all on function public.guard_b12_notification_immutable() from public, anon, authenticated, service_role;

insert into public.permissions (code, domain, action, description) values
 ('notification.read','notification','read','Read owned in-app notifications'),
 ('notification.send','notification','send','Send authorized in-app notifications'),
 ('permission_request.read','permission_request','read','Read authorized permission requests'),
 ('permission_request.create','permission_request','create','Create permission request drafts'),
 ('permission_request.update','permission_request','update','Edit permission request drafts'),
 ('permission_request.publish','permission_request','publish','Publish permission requests'),
 ('permission_request.close','permission_request','close','Close or cancel permission requests')
on conflict (code) do update set domain=excluded.domain, action=excluded.action, description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.organization_id is null and r.code in ('ORG_OWNER','SCHOOL_ADMIN','PRINCIPAL','VICE_PRINCIPAL_CURRICULUM','TEACHER','HOMEROOM_TEACHER')
  and p.code='notification.read' on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.organization_id is null and r.code in ('ORG_OWNER','SCHOOL_ADMIN','PRINCIPAL','VICE_PRINCIPAL_CURRICULUM')
  and p.code in ('notification.send','permission_request.read','permission_request.create','permission_request.update','permission_request.publish','permission_request.close')
on conflict do nothing;

comment on table public.parent_permission_request_recipients is 'B12 immutable Student recipient snapshot created at publication; no PII copy.';
comment on table public.parent_permission_decision_history is 'B12 append-only Parent decision history.';
comment on table public.notification_recipients is 'B12 per-recipient read state; notification content is shared and immutable.';
comment on table public.permission_request_command_requests is 'B12 domain-specific idempotency ledger; not Attendance command ledger.';

commit;
