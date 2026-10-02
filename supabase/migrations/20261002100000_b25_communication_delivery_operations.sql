begin;

-- Purpose-specific, school-recorded operational contact eligibility. Raw
-- destinations remain in the canonical guardian row and are resolved only by
-- the trusted server executor immediately before an adapter call.
create table public.communication_contact_preferences (
  organization_id uuid not null,
  school_id uuid not null,
  recipient_profile_id uuid not null references public.profiles(id) on delete restrict,
  channel text not null check (channel in ('whatsapp','email')),
  purpose text not null check (purpose in ('operational','marketing')),
  consent_state text not null check (consent_state in ('unknown','granted','revoked')),
  contact_state text not null check (contact_state in ('unverified','verified_by_school','disabled')),
  source text not null check (source in ('school_recorded','guardian_portal','imported')),
  source_reference text check (source_reference is null or length(source_reference) <= 120),
  changed_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  effective_at timestamptz not null default pg_catalog.transaction_timestamp(),
  revoked_at timestamptz,
  updated_at timestamptz not null default pg_catalog.transaction_timestamp(),
  primary key (organization_id,school_id,recipient_profile_id,channel,purpose),
  constraint b25_contact_preference_school_fk foreign key (school_id,organization_id)
    references public.schools(id,organization_id) on delete restrict,
  constraint b25_contact_preference_revocation_check check
    ((consent_state='revoked' and revoked_at is not null) or (consent_state<>'revoked' and revoked_at is null))
);
create index b25_contact_preferences_resolve_idx
  on public.communication_contact_preferences(organization_id,school_id,recipient_profile_id,channel,purpose);

create table public.communication_contact_preference_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  recipient_profile_id uuid not null references public.profiles(id) on delete restrict,
  channel text not null check (channel in ('whatsapp','email')),
  purpose text not null check (purpose in ('operational','marketing')),
  consent_state text not null check (consent_state in ('unknown','granted','revoked')),
  contact_state text not null check (contact_state in ('unverified','verified_by_school','disabled')),
  source text not null check (source in ('school_recorded','guardian_portal','imported')),
  source_reference text check (source_reference is null or length(source_reference)<=120),
  changed_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  effective_at timestamptz not null,
  constraint b25_contact_event_school_fk foreign key (school_id,organization_id)
    references public.schools(id,organization_id) on delete restrict
);
create index b25_contact_events_history_idx
  on public.communication_contact_preference_events(organization_id,school_id,recipient_profile_id,channel,purpose,effective_at desc);

alter table public.communication_delivery_jobs
  drop constraint communication_delivery_jobs_status_check;
alter table public.communication_delivery_jobs
  add constraint communication_delivery_jobs_status_check
    check (status in ('queued','processing','paused','completed','completed_with_errors','failed','cancelled'));
alter table public.communication_delivery_jobs
  add column paused_at timestamptz,
  add column paused_by_profile_id uuid references public.profiles(id) on delete restrict;
alter table public.communication_delivery_jobs
  add constraint b25_delivery_job_pause_state_check check
    ((status='paused' and paused_at is not null and paused_by_profile_id is not null) or
     (status<>'paused' and paused_at is null and paused_by_profile_id is null));

alter table public.communication_delivery_recipients
  add column claim_token uuid,
  add column lease_expires_at timestamptz,
  add column claim_started_at timestamptz,
  add constraint b25_delivery_recipient_scope_key unique(id,organization_id,school_id),
  add constraint b25_delivery_recipient_lease_state_check check
    ((status='processing' and claim_token is not null and lease_expires_at is not null and claim_started_at is not null) or
     (status<>'processing' and claim_token is null and lease_expires_at is null and claim_started_at is null));
create unique index b25_delivery_one_active_claim_idx
  on public.communication_delivery_recipients(claim_token) where claim_token is not null;
create index b25_delivery_lease_expiry_idx
  on public.communication_delivery_recipients(lease_expires_at) where status='processing';

create table public.communication_delivery_operator_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  recipient_id uuid not null,
  response jsonb,
  created_at timestamptz not null default pg_catalog.transaction_timestamp(),
  constraint b25_operator_request_recipient_fk foreign key(recipient_id,organization_id,school_id)
    references public.communication_delivery_recipients(id,organization_id,school_id) on delete restrict,
  constraint b25_operator_request_once unique(actor_profile_id,school_id,request_id)
);
alter table public.communication_delivery_operator_requests enable row level security;
alter table public.communication_delivery_operator_requests force row level security;
revoke all on public.communication_delivery_operator_requests from public,anon,authenticated,service_role;

-- Attempt rows remain append-only. A logical attempt has an immutable start
-- event and at most one immutable final event with the same ordinal.
alter table public.communication_delivery_attempts
  drop constraint communication_delivery_attempts_number_key;
create unique index b25_delivery_attempt_start_once_idx
  on public.communication_delivery_attempts(delivery_recipient_id,attempt_number) where outcome='started';
create unique index b25_delivery_attempt_final_once_idx
  on public.communication_delivery_attempts(delivery_recipient_id,attempt_number) where outcome<>'started';
alter table public.communication_delivery_attempts
  add constraint b25_delivery_attempt_event_completion_check check
    ((outcome='started' and completed_at is null) or (outcome<>'started' and completed_at is not null));

alter table public.communication_contact_preferences enable row level security;
alter table public.communication_contact_preferences force row level security;
alter table public.communication_contact_preference_events enable row level security;
alter table public.communication_contact_preference_events force row level security;
create policy b25_contact_preferences_staff_select on public.communication_contact_preferences
  for select to authenticated using (public.has_staff_scope_permission('communication.delivery.manage',organization_id,school_id));
create policy b25_contact_events_staff_select on public.communication_contact_preference_events
  for select to authenticated using (public.has_staff_scope_permission('communication.delivery.manage',organization_id,school_id));
revoke all on public.communication_contact_preferences,public.communication_contact_preference_events from public,anon,authenticated,service_role;

create or replace function public.b25_record_contact_preference(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := nullif(p_input->>'school_id','')::uuid;
  v_profile uuid := nullif(p_input->>'recipient_profile_id','')::uuid;
  v_channel text := lower(btrim(coalesce(p_input->>'channel','')));
  v_purpose text := lower(btrim(coalesce(p_input->>'purpose','')));
  v_consent text := lower(btrim(coalesce(p_input->>'consent_state','')));
  v_contact text := lower(btrim(coalesce(p_input->>'contact_state','')));
  v_source text := lower(btrim(coalesce(p_input->>'source','')));
  v_org uuid;
  v_now timestamptz := pg_catalog.transaction_timestamp();
begin
  if auth.uid() is null then raise exception using errcode='42501',message='B25_PERMISSION_DENIED'; end if;
  select s.organization_id into v_org from public.schools s where s.id=v_school;
  if v_org is null or not public.has_staff_scope_permission('communication.delivery.manage',v_org,v_school) then
    raise exception using errcode='42501',message='B25_PERMISSION_DENIED';
  end if;
  if v_channel not in ('whatsapp','email') or v_purpose<>'operational' or
     v_consent not in ('unknown','granted','revoked') or
     v_contact not in ('unverified','verified_by_school','disabled') or
     v_source not in ('school_recorded','guardian_portal','imported') then
    raise exception using errcode='22023',message='B25_INVALID_PREFERENCE';
  end if;
  if v_consent='granted' and v_source='school_recorded' and
     nullif(btrim(coalesce(p_input->>'source_reference','')),'') is null then
    raise exception using errcode='22023',message='B25_CONSENT_EVIDENCE_REQUIRED';
  end if;
  if not exists (
    select 1 from public.guardians g
    join public.student_guardians sg on sg.guardian_id=g.id and sg.organization_id=g.organization_id and sg.status='active'
    join public.student_enrollments e on e.student_id=sg.student_id and e.organization_id=sg.organization_id and e.school_id=v_school and e.status='active'
    where g.organization_id=v_org and g.profile_id=v_profile and g.status='active'
  ) then raise exception using errcode='P0001',message='B25_CONTACT_NOT_IN_SCHOOL'; end if;

  insert into public.communication_contact_preferences(
    organization_id,school_id,recipient_profile_id,channel,purpose,consent_state,contact_state,source,source_reference,changed_by_profile_id,effective_at,revoked_at,updated_at
  ) values (
    v_org,v_school,v_profile,v_channel,v_purpose,v_consent,v_contact,v_source,
    nullif(btrim(p_input->>'source_reference'),''),auth.uid(),v_now,case when v_consent='revoked' then v_now else null end,v_now
  ) on conflict (organization_id,school_id,recipient_profile_id,channel,purpose) do update set
    consent_state=excluded.consent_state,contact_state=excluded.contact_state,source=excluded.source,
    source_reference=excluded.source_reference,changed_by_profile_id=excluded.changed_by_profile_id,
    effective_at=excluded.effective_at,revoked_at=excluded.revoked_at,updated_at=excluded.updated_at;

  insert into public.communication_contact_preference_events(
    organization_id,school_id,recipient_profile_id,channel,purpose,consent_state,contact_state,source,source_reference,changed_by_profile_id,effective_at
  ) values(v_org,v_school,v_profile,v_channel,v_purpose,v_consent,v_contact,v_source,nullif(btrim(p_input->>'source_reference'),''),auth.uid(),v_now);
  return jsonb_build_object('saved',true,'channel',v_channel,'purpose',v_purpose,'consent_state',v_consent,'contact_state',v_contact);
end;
$$;

create or replace function public.b25_actor_can_manage_delivery(p_actor uuid,p_organization_id uuid,p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    join public.profiles p on p.id=m.profile_id
    join public.membership_roles mr on mr.membership_id=m.id and mr.organization_id=m.organization_id
    join public.roles r on r.id=mr.role_id
    join public.role_permissions rp on rp.role_id=r.id
    join public.permissions perm on perm.id=rp.permission_id
    where m.profile_id=p_actor and m.organization_id=p_organization_id and m.status='active' and p.status='active'
      and perm.code='communication.delivery.manage'
      and (r.organization_id is null or r.organization_id=p_organization_id)
      and (mr.starts_at is null or mr.starts_at<=pg_catalog.now())
      and (mr.ends_at is null or mr.ends_at>pg_catalog.now())
      and (mr.scope_type='ORG' or (mr.scope_type='SCHOOL' and mr.scope_id=p_school_id))
  );
$$;

create or replace function public.b25_assert_delivery_operator(p_school_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select s.organization_id into v_org from public.schools s where s.id=p_school_id;
  if auth.uid() is null or v_org is null or not public.has_staff_scope_permission('communication.delivery.manage',v_org,p_school_id) then
    raise exception using errcode='42501',message='B25_PERMISSION_DENIED';
  end if;
  return true;
end;
$$;

create or replace function public.b25_list_delivery_operations(p_announcement_id uuid,p_school_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_rows jsonb;
begin
  select a.organization_id into v_org from public.communication_announcements a where a.id=p_announcement_id and a.school_id=p_school_id;
  if v_org is null then raise exception using errcode='P0001',message='B22_ANNOUNCEMENT_NOT_FOUND'; end if;
  if auth.uid() is null or not public.has_staff_scope_permission('communication.delivery.manage',v_org,p_school_id) then
    raise exception using errcode='42501',message='B25_PERMISSION_DENIED'; end if;
  select coalesce(jsonb_agg(x order by x.created_at),'[]'::jsonb) into v_rows from (
    select j.id,j.channel,j.status,j.created_at,j.paused_at,
      count(r.id)::integer as recipient_count,
      count(r.id) filter(where r.status='pending')::integer as pending_count,
      count(r.id) filter(where r.status='processing')::integer as processing_count,
      count(r.id) filter(where r.status in ('sent','delivered'))::integer as accepted_count,
      count(r.id) filter(where r.status='failed' and r.last_failure_retryable and r.attempt_count<3)::integer as retryable_count,
      count(r.id) filter(where r.status='failed' and not r.last_failure_retryable)::integer as permanent_failure_count,
      count(r.id) filter(where r.status='skipped')::integer as skipped_count,
      count(r.id) filter(where r.status='processing' and r.lease_expires_at<pg_catalog.now())::integer as expired_lease_count,
      min(r.created_at) filter(where r.status='pending') as oldest_pending_at,
      coalesce(jsonb_agg(jsonb_build_object(
        'id',r.id,'status',r.status,'attempt_count',r.attempt_count,'failure_code',r.last_failure_code,
        'retryable',r.status='failed' and r.last_failure_retryable and r.attempt_count<3,
        'next_attempt_at',r.next_attempt_at,'eligibility',case when ar.recipient_type<>'guardian' then 'not_supported' when p.consent_state='revoked' then 'opted_out' when p.consent_state is null or p.consent_state<>'granted' then 'consent_required' when p.contact_state<>'verified_by_school' or (j.channel='email' and nullif(g.email,'') is null) or (j.channel='whatsapp' and nullif(g.phone,'') is null) then 'contact_unverified' else 'eligible' end,
        'masked_destination',case when j.channel='email' and nullif(g.email,'') is not null then left(split_part(g.email,'@',1),1)||'•••@'||split_part(g.email,'@',2) when j.channel='whatsapp' and nullif(g.phone,'') is not null then '••••'||right(regexp_replace(g.phone,'[^0-9]','','g'),4) else null end
      ) order by r.created_at) filter(where r.id is not null),'[]'::jsonb) as recipients
    from public.communication_delivery_jobs j
    left join public.communication_delivery_recipients r on r.job_id=j.id
    left join public.communication_announcement_recipients ar on ar.id=r.announcement_recipient_id and ar.organization_id=r.organization_id and ar.school_id=r.school_id
    left join public.communication_contact_preferences p on p.organization_id=r.organization_id and p.school_id=r.school_id and p.recipient_profile_id=ar.recipient_profile_id and p.channel=j.channel and p.purpose='operational'
    left join public.guardians g on g.organization_id=r.organization_id and g.profile_id=ar.recipient_profile_id and g.status='active'
    where j.announcement_id=p_announcement_id and j.organization_id=v_org and j.school_id=p_school_id
    group by j.id
  ) x;
  return v_rows;
end;
$$;

-- Only called from the authenticated server executor after capability checks.
-- Service-role execute is isolated to server-only worker code; no raw resolver
-- RPC is available to authenticated browser sessions.
create or replace function public.b25_claim_delivery_batch(p_actor uuid,p_school_id uuid,p_limit integer default 10,p_lease_seconds integer default 90)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_row record; v_token uuid; v_attempt integer; v_claims jsonb:='[]'::jsonb; v_now timestamptz:=pg_catalog.clock_timestamp();
begin
  if p_actor is null or p_limit<1 or p_limit>25 or p_lease_seconds<30 or p_lease_seconds>600 then raise exception using errcode='22023',message='B25_INVALID_WORKER_LIMIT'; end if;
  select s.organization_id into v_org from public.schools s where s.id=p_school_id;
  if v_org is null or not public.b25_actor_can_manage_delivery(p_actor,v_org,p_school_id) then raise exception using errcode='42501',message='B25_PERMISSION_DENIED'; end if;
  -- Expired execution leases become an immutable unknown final attempt and are
  -- eligible for bounded retry; a process crash never leaves a row stuck.
  for v_row in select r.* from public.communication_delivery_recipients r join public.communication_delivery_jobs j on j.id=r.job_id
    where r.school_id=p_school_id and r.status='processing' and r.lease_expires_at<=v_now and j.status<>'paused'
    order by r.lease_expires_at for update of r skip locked limit p_limit loop
    v_attempt:=v_row.attempt_count+1;
    insert into public.communication_delivery_attempts(organization_id,school_id,job_id,delivery_recipient_id,attempt_number,outcome,failure_code,started_at,completed_at)
    select v_row.organization_id,v_row.school_id,v_row.job_id,v_row.id,v_attempt,'unknown','WORKER_LEASE_EXPIRED',v_row.claim_started_at,v_now
    where not exists(select 1 from public.communication_delivery_attempts a where a.delivery_recipient_id=v_row.id and a.attempt_number=v_attempt and a.outcome<>'started');
    update public.communication_delivery_recipients set status='failed',attempt_count=v_attempt,last_failure_code='WORKER_LEASE_EXPIRED',last_failure_retryable=(v_attempt<3),next_attempt_at=case when v_attempt<3 then v_now else null end,claim_token=null,lease_expires_at=null,claim_started_at=null,updated_at=v_now where id=v_row.id;
  end loop;
  for v_row in
    select r.id,r.organization_id,r.school_id,r.job_id,r.attempt_count,r.status,r.next_attempt_at
    from public.communication_delivery_recipients r join public.communication_delivery_jobs j on j.id=r.job_id
    where r.school_id=p_school_id and j.status in ('queued','processing')
      and ((r.status='pending' and r.attempt_count<3) or (r.status='failed' and r.last_failure_retryable and r.attempt_count<3 and coalesce(r.next_attempt_at,v_now)<=v_now))
    order by r.created_at for update of r skip locked limit p_limit loop
    v_token:=gen_random_uuid(); v_attempt:=v_row.attempt_count+1;
    update public.communication_delivery_recipients set status='processing',claim_token=v_token,claim_started_at=v_now,lease_expires_at=v_now+pg_catalog.make_interval(secs=>p_lease_seconds),next_attempt_at=null,updated_at=v_now where id=v_row.id;
    insert into public.communication_delivery_attempts(organization_id,school_id,job_id,delivery_recipient_id,attempt_number,outcome,started_at)
    values(v_row.organization_id,v_row.school_id,v_row.job_id,v_row.id,v_attempt,'started',v_now);
    update public.communication_delivery_jobs set status='processing',updated_at=v_now where id=v_row.job_id and status='queued';
    v_claims:=v_claims||jsonb_build_array(jsonb_build_object('recipient_id',v_row.id,'job_id',v_row.job_id,'claim_token',v_token,'attempt_number',v_attempt));
  end loop;
  return v_claims;
end;
$$;

create or replace function public.b25_resolve_claimed_delivery(p_recipient_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_r public.communication_delivery_recipients%rowtype; v_j public.communication_delivery_jobs%rowtype; v_src public.communication_announcement_recipients%rowtype; v_g public.guardians%rowtype; v_pref public.communication_contact_preferences%rowtype; v_destination text;
begin
  select * into v_r from public.communication_delivery_recipients r where r.id=p_recipient_id and r.status='processing' and r.claim_token=p_claim_token and r.lease_expires_at>pg_catalog.clock_timestamp();
  if not found then return jsonb_build_object('eligible',false,'reason','CLAIM_EXPIRED'); end if;
  select * into v_j from public.communication_delivery_jobs j where j.id=v_r.job_id;
  if v_j.status='paused' then return jsonb_build_object('eligible',false,'reason','JOB_PAUSED'); end if;
  select * into v_src from public.communication_announcement_recipients x where x.id=v_r.announcement_recipient_id and x.organization_id=v_r.organization_id and x.school_id=v_r.school_id and x.announcement_id=v_r.announcement_id;
  if not found or v_src.recipient_type<>'guardian' then return jsonb_build_object('eligible',false,'reason','RECIPIENT_NOT_SUPPORTED'); end if;
  select * into v_pref from public.communication_contact_preferences p where p.organization_id=v_r.organization_id and p.school_id=v_r.school_id and p.recipient_profile_id=v_src.recipient_profile_id and p.channel=v_j.channel and p.purpose='operational';
  if not found or v_pref.consent_state<>'granted' or v_pref.contact_state<>'verified_by_school' then return jsonb_build_object('eligible',false,'reason','CONSENT_OR_CONTACT_INELIGIBLE'); end if;
  select g.* into v_g from public.guardians g join public.student_guardians sg on sg.guardian_id=g.id and sg.organization_id=g.organization_id and sg.status='active'
    join public.student_enrollments e on e.student_id=sg.student_id and e.organization_id=sg.organization_id and e.school_id=v_r.school_id and e.status='active'
    where g.organization_id=v_r.organization_id and g.profile_id=v_src.recipient_profile_id and g.status='active' limit 1;
  if not found then return jsonb_build_object('eligible',false,'reason','CONTACT_NOT_IN_SCHOOL'); end if;
  v_destination:=case when v_j.channel='email' then lower(btrim(coalesce(v_g.email,''))) else regexp_replace(coalesce(v_g.phone,''),'[[:space:]()-]','','g') end;
  if v_destination='' or (v_j.channel='email' and position('@' in v_destination)<2) then return jsonb_build_object('eligible',false,'reason','DESTINATION_MISSING'); end if;
  return jsonb_build_object('eligible',true,'destination',v_destination,'channel',v_j.channel,'job_id',v_j.id,'attempt_number',v_r.attempt_count+1);
end;
$$;

create or replace function public.b25_finalize_delivery_attempt(p_recipient_id uuid,p_claim_token uuid,p_outcome text,p_failure_code text default null,p_message_reference text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_r public.communication_delivery_recipients%rowtype; v_j public.communication_delivery_jobs%rowtype; v_started public.communication_delivery_attempts%rowtype; v_attempt integer; v_status text; v_retry boolean; v_code text;
begin
  if p_outcome not in ('accepted','retryable_failure','permanent_failure') then raise exception using errcode='22023',message='B25_INVALID_OUTCOME'; end if;
  select * into v_r from public.communication_delivery_recipients r where r.id=p_recipient_id and r.status='processing' and r.claim_token=p_claim_token and r.lease_expires_at>pg_catalog.clock_timestamp() for update;
  if not found then return jsonb_build_object('finalized',false,'reason','CLAIM_EXPIRED'); end if;
  select * into v_j from public.communication_delivery_jobs j where j.id=v_r.job_id for update;
  if v_j.status='paused' then return jsonb_build_object('finalized',false,'reason','JOB_PAUSED'); end if;
  v_attempt:=v_r.attempt_count+1;
  select * into v_started from public.communication_delivery_attempts a where a.delivery_recipient_id=v_r.id and a.attempt_number=v_attempt and a.outcome='started';
  if not found then return jsonb_build_object('finalized',false,'reason','ATTEMPT_NOT_STARTED'); end if;
  v_retry:=p_outcome='retryable_failure' and v_attempt<3;
  v_status:=case when p_outcome='accepted' then 'sent' when p_outcome='retryable_failure' or p_outcome='permanent_failure' then 'failed' end;
  v_code:=case when p_outcome='accepted' then null else left(coalesce(p_failure_code,'DELIVERY_FAILED'),80) end;
  insert into public.communication_delivery_attempts(organization_id,school_id,job_id,delivery_recipient_id,attempt_number,outcome,failure_code,provider_message_id,started_at,completed_at)
  values(v_r.organization_id,v_r.school_id,v_r.job_id,v_r.id,v_attempt,p_outcome,v_code,left(p_message_reference,200),v_started.started_at,pg_catalog.clock_timestamp());
  update public.communication_delivery_recipients set status=v_status,attempt_count=v_attempt,last_failure_code=v_code,last_failure_retryable=v_retry,next_attempt_at=case when v_retry then pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>least(900,30*(2^(v_attempt-1))::integer)) else null end,claim_token=null,lease_expires_at=null,claim_started_at=null,updated_at=pg_catalog.clock_timestamp() where id=v_r.id;
  update public.communication_delivery_jobs j set status=case when exists(select 1 from public.communication_delivery_recipients x where x.job_id=j.id and x.id<>v_r.id and (x.status in ('pending','processing') or (x.status='failed' and x.last_failure_retryable and x.attempt_count<3))) or v_retry then 'processing' when exists(select 1 from public.communication_delivery_recipients x where x.job_id=j.id and x.status='failed') then 'completed_with_errors' else 'completed' end,updated_at=pg_catalog.clock_timestamp() where j.id=v_j.id;
  return jsonb_build_object('finalized',true,'status',v_status,'retryable',v_retry,'attempt_number',v_attempt);
end;
$$;

create or replace function public.b25_skip_claimed_delivery(p_recipient_id uuid,p_claim_token uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_r public.communication_delivery_recipients%rowtype; v_started public.communication_delivery_attempts%rowtype; v_attempt integer; v_safe text;
begin
  v_safe:=case when p_reason in ('CLAIM_EXPIRED','JOB_PAUSED','RECIPIENT_NOT_SUPPORTED','CONSENT_OR_CONTACT_INELIGIBLE','CONTACT_NOT_IN_SCHOOL','DESTINATION_MISSING') then p_reason else 'INELIGIBLE' end;
  select * into v_r from public.communication_delivery_recipients r where r.id=p_recipient_id and r.status='processing' and r.claim_token=p_claim_token for update;
  if not found then return jsonb_build_object('skipped',false); end if;
  v_attempt:=v_r.attempt_count+1;
  select * into v_started from public.communication_delivery_attempts a where a.delivery_recipient_id=v_r.id and a.attempt_number=v_attempt and a.outcome='started';
  if found then
    insert into public.communication_delivery_attempts(organization_id,school_id,job_id,delivery_recipient_id,attempt_number,outcome,failure_code,started_at,completed_at)
    values(v_r.organization_id,v_r.school_id,v_r.job_id,v_r.id,v_attempt,'permanent_failure',v_safe,v_started.started_at,pg_catalog.clock_timestamp());
  end if;
  update public.communication_delivery_recipients set status='skipped',attempt_count=case when found then v_attempt else attempt_count end,last_failure_code=v_safe,last_failure_retryable=false,next_attempt_at=null,claim_token=null,lease_expires_at=null,claim_started_at=null,updated_at=pg_catalog.clock_timestamp() where id=v_r.id;
  update public.communication_delivery_jobs j set status=case when exists(select 1 from public.communication_delivery_recipients x where x.job_id=j.id and x.id<>v_r.id and (x.status in ('pending','processing') or (x.status='failed' and x.last_failure_retryable and x.attempt_count<3))) then 'processing' when exists(select 1 from public.communication_delivery_recipients x where x.job_id=j.id and x.status='failed') then 'completed_with_errors' else 'completed' end,updated_at=pg_catalog.clock_timestamp() where j.id=v_r.job_id and j.status<>'paused';
  return jsonb_build_object('skipped',true,'reason',v_safe);
end;
$$;

create or replace function public.b25_set_delivery_job_paused(p_job_id uuid,p_school_id uuid,p_paused boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_j public.communication_delivery_jobs%rowtype;
begin
  select * into v_j from public.communication_delivery_jobs j where j.id=p_job_id and j.school_id=p_school_id for update;
  if not found or auth.uid() is null or not public.has_staff_scope_permission('communication.delivery.manage',v_j.organization_id,p_school_id) then raise exception using errcode='42501',message='B25_PERMISSION_DENIED'; end if;
  if p_paused and v_j.status not in ('queued','processing','paused') then raise exception using errcode='P0001',message='B25_JOB_NOT_PAUSABLE'; end if;
  update public.communication_delivery_jobs set status=case when p_paused then 'paused' else case when exists(select 1 from public.communication_delivery_recipients r where r.job_id=v_j.id and r.status='processing') then 'processing' else 'queued' end end,paused_at=case when p_paused then pg_catalog.transaction_timestamp() else null end,paused_by_profile_id=case when p_paused then auth.uid() else null end,updated_at=pg_catalog.transaction_timestamp() where id=v_j.id;
  return jsonb_build_object('id',v_j.id,'status',case when p_paused then 'paused' else 'queued' end);
end;
$$;

create or replace function public.b25_request_delivery_retry(p_recipient_id uuid,p_school_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_r public.communication_delivery_recipients%rowtype; v_j public.communication_delivery_jobs%rowtype; v_org uuid; v_inserted uuid; v_prior public.communication_delivery_operator_requests%rowtype; v_result jsonb;
begin
  select * into v_r from public.communication_delivery_recipients r where r.id=p_recipient_id and r.school_id=p_school_id for update;
  if not found then raise exception using errcode='P0001',message='B25_RECIPIENT_UNAVAILABLE'; end if;
  select * into v_j from public.communication_delivery_jobs j where j.id=v_r.job_id for update;
  v_org:=v_j.organization_id;
  if auth.uid() is null or not public.has_staff_scope_permission('communication.delivery.manage',v_org,p_school_id) then raise exception using errcode='42501',message='B25_PERMISSION_DENIED'; end if;
  insert into public.communication_delivery_operator_requests(organization_id,school_id,actor_profile_id,request_id,recipient_id)
    values(v_org,p_school_id,auth.uid(),p_request_id,v_r.id) on conflict(actor_profile_id,school_id,request_id) do nothing returning id into v_inserted;
  if v_inserted is null then
    select * into v_prior from public.communication_delivery_operator_requests q where q.actor_profile_id=auth.uid() and q.school_id=p_school_id and q.request_id=p_request_id;
    if v_prior.recipient_id<>v_r.id then raise exception using errcode='22023',message='B25_IDEMPOTENCY_CONFLICT'; end if;
    return coalesce(v_prior.response,jsonb_build_object('retried',false,'reason','REQUEST_IN_PROGRESS'));
  end if;
  if exists(select 1 from public.communication_delivery_attempts a where a.delivery_recipient_id=v_r.id and a.outcome='accepted') then v_result:=jsonb_build_object('retried',false,'reason','ALREADY_ACCEPTED');
  elsif v_j.status='paused' or v_r.status<>'failed' or not v_r.last_failure_retryable or v_r.attempt_count>=3 then v_result:=jsonb_build_object('retried',false,'reason','NOT_RETRYABLE');
  else
    update public.communication_delivery_recipients set next_attempt_at=pg_catalog.clock_timestamp(),updated_at=pg_catalog.clock_timestamp() where id=v_r.id;
    v_result:=jsonb_build_object('retried',true,'recipient_id',v_r.id,'request_id',p_request_id);
  end if;
  update public.communication_delivery_operator_requests set response=v_result where id=v_inserted;
  return v_result;
end;
$$;

create or replace function public.b25_get_delivery_job_stats(p_job_id uuid,p_school_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_result jsonb;
begin
  select j.organization_id into v_org from public.communication_delivery_jobs j where j.id=p_job_id and j.school_id=p_school_id;
  if v_org is null or auth.uid() is null or not public.has_staff_scope_permission('communication.delivery.manage',v_org,p_school_id) then raise exception using errcode='42501',message='B25_PERMISSION_DENIED'; end if;
  select jsonb_build_object('id',j.id,'status',j.status,'channel',j.channel,'recipient_count',count(r.id),'pending_count',count(r.id) filter(where r.status='pending'),'processing_count',count(r.id) filter(where r.status='processing'),'accepted_count',count(r.id) filter(where r.status in ('sent','delivered')),'retryable_count',count(r.id) filter(where r.status='failed' and r.last_failure_retryable and r.attempt_count<3),'permanent_failure_count',count(r.id) filter(where r.status='failed' and not r.last_failure_retryable),'skipped_count',count(r.id) filter(where r.status='skipped'),'expired_lease_count',count(r.id) filter(where r.status='processing' and r.lease_expires_at<pg_catalog.now()),'oldest_pending_at',min(r.created_at) filter(where r.status='pending'),'paused_at',j.paused_at)
    into v_result from public.communication_delivery_jobs j left join public.communication_delivery_recipients r on r.job_id=j.id where j.id=p_job_id group by j.id;
  return v_result;
end;
$$;

revoke all on function public.b25_record_contact_preference(jsonb),public.b25_list_delivery_operations(uuid,uuid),public.b25_set_delivery_job_paused(uuid,uuid,boolean),public.b25_request_delivery_retry(uuid,uuid,uuid),public.b25_get_delivery_job_stats(uuid,uuid),public.b25_assert_delivery_operator(uuid) from public,anon,service_role;
grant execute on function public.b25_record_contact_preference(jsonb),public.b25_list_delivery_operations(uuid,uuid),public.b25_set_delivery_job_paused(uuid,uuid,boolean),public.b25_request_delivery_retry(uuid,uuid,uuid),public.b25_get_delivery_job_stats(uuid,uuid),public.b25_assert_delivery_operator(uuid) to authenticated;
revoke all on function public.b25_claim_delivery_batch(uuid,uuid,integer,integer),public.b25_resolve_claimed_delivery(uuid,uuid),public.b25_finalize_delivery_attempt(uuid,uuid,text,text,text),public.b25_skip_claimed_delivery(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.b25_actor_can_manage_delivery(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.b25_claim_delivery_batch(uuid,uuid,integer,integer),public.b25_resolve_claimed_delivery(uuid,uuid),public.b25_finalize_delivery_attempt(uuid,uuid,text,text,text),public.b25_skip_claimed_delivery(uuid,uuid,text) to service_role;

commit;
