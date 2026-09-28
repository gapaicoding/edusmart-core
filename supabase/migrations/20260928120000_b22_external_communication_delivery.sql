begin;

-- Batch 22 establishes durable, provider-neutral external delivery requests.
-- It deliberately does not contact providers or persist recipient addresses.

insert into public.permissions (code, domain, action, description)
values (
  'communication.delivery.manage',
  'communication',
  'manage_delivery',
  'Queue and review external delivery requests'
)
on conflict (code) do update
set domain = excluded.domain,
    action = excluded.action,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'communication.delivery.manage'
where r.organization_id is null
  and r.code in ('ORG_OWNER', 'SCHOOL_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL_CURRICULUM')
on conflict (role_id, permission_id) do nothing;

create unique index communication_recipients_id_scope_announcement_key
  on public.communication_announcement_recipients (id, organization_id, school_id, announcement_id);

create table public.communication_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  announcement_id uuid not null,
  channel text not null check (channel in ('whatsapp', 'email')),
  provider_key text not null default 'unconfigured'
    check (provider_key = 'unconfigured'),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  updated_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint communication_delivery_jobs_announcement_fk
    foreign key (announcement_id, organization_id, school_id)
    references public.communication_announcements(id, organization_id, school_id) on delete restrict,
  constraint communication_delivery_jobs_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint communication_delivery_jobs_id_org_school_announcement_key
    unique (id, organization_id, school_id, announcement_id),
  constraint communication_delivery_jobs_announcement_channel_key
    unique (announcement_id, channel)
);

create index idx_communication_delivery_jobs_scope
  on public.communication_delivery_jobs (organization_id, school_id, created_at desc);

create table public.communication_delivery_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  announcement_id uuid not null,
  job_id uuid not null,
  announcement_recipient_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'delivered', 'failed', 'skipped', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  next_attempt_at timestamptz,
  last_failure_code text check (last_failure_code is null or length(last_failure_code) <= 80),
  last_failure_retryable boolean not null default false,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  updated_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint communication_delivery_recipients_job_fk
    foreign key (job_id, organization_id, school_id, announcement_id)
    references public.communication_delivery_jobs(id, organization_id, school_id, announcement_id) on delete restrict,
  constraint communication_delivery_recipients_source_fk
    foreign key (announcement_recipient_id, organization_id, school_id, announcement_id)
    references public.communication_announcement_recipients(id, organization_id, school_id, announcement_id) on delete restrict,
  constraint communication_delivery_recipients_id_scope_job_key
    unique (id, organization_id, school_id, job_id),
  constraint communication_delivery_recipients_job_source_key
    unique (job_id, announcement_recipient_id),
  constraint communication_delivery_recipients_attempt_state_check
    check (attempt_count = 0 or status in ('pending', 'processing', 'sent', 'delivered', 'failed', 'skipped', 'cancelled'))
);

create index idx_communication_delivery_recipients_claim
  on public.communication_delivery_recipients (job_id, status, next_attempt_at, created_at);

create table public.communication_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  job_id uuid not null,
  delivery_recipient_id uuid not null,
  attempt_number integer not null check (attempt_number between 1 and 3),
  outcome text not null check (outcome in ('started', 'accepted', 'delivered', 'retryable_failure', 'permanent_failure', 'unknown')),
  failure_code text check (failure_code is null or length(failure_code) <= 80),
  provider_message_id text check (provider_message_id is null or length(provider_message_id) <= 200),
  started_at timestamptz not null default pg_catalog.transaction_timestamp(),
  completed_at timestamptz,
  constraint communication_delivery_attempts_recipient_fk
    foreign key (delivery_recipient_id, organization_id, school_id, job_id)
    references public.communication_delivery_recipients(id, organization_id, school_id, job_id) on delete restrict,
  constraint communication_delivery_attempts_number_key
    unique (delivery_recipient_id, attempt_number),
  constraint communication_delivery_attempts_completion_check
    check (completed_at is null or completed_at >= started_at)
);

create index idx_communication_delivery_attempts_job
  on public.communication_delivery_attempts (job_id, started_at desc);

create or replace function public.guard_b22_delivery_attempt_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'B22_DELIVERY_ATTEMPT_IMMUTABLE';
end;
$$;

create trigger trg_b22_delivery_attempt_immutable
before update or delete on public.communication_delivery_attempts
for each row execute function public.guard_b22_delivery_attempt_immutable();

alter table public.communication_delivery_jobs enable row level security;
alter table public.communication_delivery_jobs force row level security;
alter table public.communication_delivery_recipients enable row level security;
alter table public.communication_delivery_recipients force row level security;
alter table public.communication_delivery_attempts enable row level security;
alter table public.communication_delivery_attempts force row level security;

create policy b22_delivery_jobs_staff_select on public.communication_delivery_jobs
for select to authenticated using (
  public.has_staff_scope_permission('communication.delivery.manage', organization_id, school_id)
);
create policy b22_delivery_recipients_staff_select on public.communication_delivery_recipients
for select to authenticated using (
  public.has_staff_scope_permission('communication.delivery.manage', organization_id, school_id)
);
create policy b22_delivery_attempts_staff_select on public.communication_delivery_attempts
for select to authenticated using (
  public.has_staff_scope_permission('communication.delivery.manage', organization_id, school_id)
);

revoke all on table public.communication_delivery_jobs,
  public.communication_delivery_recipients,
  public.communication_delivery_attempts from public, anon, authenticated, service_role;
revoke all on function public.guard_b22_delivery_attempt_immutable() from public, anon, authenticated, service_role;

create or replace function public.b22_require_delivery_manager(p_organization_id uuid, p_school_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_staff_scope_permission(
    'communication.delivery.manage', p_organization_id, p_school_id
  ) then
    raise exception using errcode = '42501', message = 'B22_DELIVERY_PERMISSION_DENIED';
  end if;
end;
$$;

create or replace function public.b22_enqueue_external_delivery(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.communication_announcements%rowtype;
  v_channel text := lower(btrim(p_input->>'channel'));
  v_job public.communication_delivery_jobs%rowtype;
  v_created boolean := false;
  v_recipients bigint;
begin
  if v_channel is null or v_channel not in ('whatsapp', 'email') then
    raise exception using errcode = '22023', message = 'B22_INVALID_CHANNEL';
  end if;
  select * into v
  from public.communication_announcements a
  where a.id = nullif(p_input->>'announcement_id', '')::uuid
    and a.school_id = nullif(p_input->>'school_id', '')::uuid
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'B22_ANNOUNCEMENT_NOT_FOUND';
  end if;
  perform public.b22_require_delivery_manager(v.organization_id, v.school_id);
  if v.status <> 'published' then
    raise exception using errcode = 'P0001', message = 'B22_ANNOUNCEMENT_NOT_PUBLISHED';
  end if;

  insert into public.communication_delivery_jobs(
    organization_id, school_id, announcement_id, channel, created_by_profile_id
  ) values (v.organization_id, v.school_id, v.id, v_channel, auth.uid())
  on conflict (announcement_id, channel) do nothing
  returning * into v_job;
  v_created := found;
  if not v_created then
    select * into v_job
    from public.communication_delivery_jobs j
    where j.announcement_id = v.id and j.channel = v_channel
    for update;
  end if;

  if v_created then
    insert into public.communication_delivery_recipients(
      organization_id, school_id, announcement_id, job_id, announcement_recipient_id
    )
    select v.organization_id, v.school_id, v.id, v_job.id, r.id
    from public.communication_announcement_recipients r
    where r.announcement_id = v.id
      and r.organization_id = v.organization_id
      and r.school_id = v.school_id
    on conflict (job_id, announcement_recipient_id) do nothing;
  end if;

  select count(*) into v_recipients
  from public.communication_delivery_recipients r
  where r.job_id = v_job.id;
  if v_recipients = 0 then
    raise exception using errcode = '22023', message = 'B22_NO_SNAPSHOT_RECIPIENTS';
  end if;

  return jsonb_build_object(
    'id', v_job.id,
    'channel', v_job.channel,
    'provider_key', v_job.provider_key,
    'status', v_job.status,
    'recipient_count', v_recipients,
    'already_queued', not v_created
  );
end;
$$;

create or replace function public.b22_list_delivery_jobs(p_announcement_id uuid, p_school_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_result jsonb;
begin
  select a.organization_id into v_org
  from public.communication_announcements a
  where a.id = p_announcement_id and a.school_id = p_school_id;
  if v_org is null then
    raise exception using errcode = 'P0001', message = 'B22_ANNOUNCEMENT_NOT_FOUND';
  end if;
  perform public.b22_require_delivery_manager(v_org, p_school_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', j.id,
    'channel', j.channel,
    'provider_key', j.provider_key,
    'status', j.status,
    'created_at', j.created_at,
    'recipient_count', (select count(*) from public.communication_delivery_recipients r where r.job_id = j.id),
    'pending_count', (select count(*) from public.communication_delivery_recipients r where r.job_id = j.id and r.status = 'pending'),
    'sent_count', (select count(*) from public.communication_delivery_recipients r where r.job_id = j.id and r.status in ('sent', 'delivered')),
    'failed_count', (select count(*) from public.communication_delivery_recipients r where r.job_id = j.id and r.status = 'failed'),
    'skipped_count', (select count(*) from public.communication_delivery_recipients r where r.job_id = j.id and r.status = 'skipped')
  ) order by j.created_at), '[]'::jsonb) into v_result
  from public.communication_delivery_jobs j
  where j.announcement_id = p_announcement_id
    and j.organization_id = v_org
    and j.school_id = p_school_id;
  return v_result;
end;
$$;

revoke all on function public.b22_require_delivery_manager(uuid, uuid),
  public.b22_enqueue_external_delivery(jsonb),
  public.b22_list_delivery_jobs(uuid, uuid) from public, anon, service_role;
grant execute on function public.b22_enqueue_external_delivery(jsonb),
  public.b22_list_delivery_jobs(uuid, uuid) to authenticated;

commit;
