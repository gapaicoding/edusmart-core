begin;

-- B29 adds runtime identity and machine-only commands to the existing B22/B25
-- queue. It deliberately creates no parallel queue and no provider settings.
create table public.communication_delivery_worker_instances (
  id uuid primary key,
  instance_name text not null check (instance_name ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  lifecycle_status text not null check (lifecycle_status in ('RUNNING','DRAINING','STOPPED')),
  started_at timestamptz not null default pg_catalog.clock_timestamp(),
  heartbeat_at timestamptz not null default pg_catalog.clock_timestamp(),
  stopped_at timestamptz,
  stale_after_seconds integer not null default 45 check (stale_after_seconds between 15 and 180),
  last_cycle_at timestamptz,
  last_school_id uuid,
  cycle_count bigint not null default 0 check (cycle_count >= 0),
  claimed_count bigint not null default 0 check (claimed_count >= 0),
  completed_count bigint not null default 0 check (completed_count >= 0),
  retryable_failure_count bigint not null default 0 check (retryable_failure_count >= 0),
  permanent_failure_count bigint not null default 0 check (permanent_failure_count >= 0),
  ambiguous_count bigint not null default 0 check (ambiguous_count >= 0),
  safe_skipped_count bigint not null default 0 check (safe_skipped_count >= 0),
  queue_depth integer not null default 0 check (queue_depth >= 0),
  oldest_eligible_age_seconds integer not null default 0 check (oldest_eligible_age_seconds >= 0),
  constraint communication_delivery_worker_stopped_state_check
    check ((lifecycle_status='STOPPED' and stopped_at is not null) or (lifecycle_status<>'STOPPED' and stopped_at is null))
);

alter table public.communication_delivery_recipients
  add column dispatch_started_at timestamptz;

alter table public.communication_delivery_worker_instances enable row level security;
alter table public.communication_delivery_worker_instances force row level security;
revoke all on table public.communication_delivery_worker_instances from public, anon, authenticated, service_role;

create index communication_delivery_worker_heartbeat_idx
  on public.communication_delivery_worker_instances (heartbeat_at desc);

create or replace function public.b29_register_delivery_worker(p_instance_id uuid,p_instance_name text,p_stale_after_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_instance_id is null or p_instance_name !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
    or p_stale_after_seconds<15 or p_stale_after_seconds>180 then
    raise exception using errcode='22023',message='B29_INVALID_WORKER';
  end if;
  insert into public.communication_delivery_worker_instances(id,instance_name,lifecycle_status,stale_after_seconds)
  values(p_instance_id,p_instance_name,'RUNNING',p_stale_after_seconds);
  return jsonb_build_object('registered',true,'instance_id',p_instance_id,'lifecycle_status','RUNNING');
end;
$$;

create or replace function public.b29_heartbeat_delivery_worker(
  p_instance_id uuid,p_lifecycle_status text,p_metrics jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_queue integer; v_oldest integer;
begin
  if p_lifecycle_status not in ('RUNNING','DRAINING') or jsonb_typeof(p_metrics)<>'object'
    or coalesce((p_metrics->>'cycles')::bigint,-1)<0
    or coalesce((p_metrics->>'claimed')::bigint,-1)<0
    or coalesce((p_metrics->>'completed')::bigint,-1)<0
    or coalesce((p_metrics->>'retryableFailures')::bigint,-1)<0
    or coalesce((p_metrics->>'permanentFailures')::bigint,-1)<0
    or coalesce((p_metrics->>'ambiguous')::bigint,-1)<0
    or coalesce((p_metrics->>'safeSkipped')::bigint,-1)<0 then
    raise exception using errcode='22023',message='B29_INVALID_HEARTBEAT';
  end if;
  select count(*)::integer,coalesce(extract(epoch from (pg_catalog.clock_timestamp()-min(r.created_at)))::integer,0)
    into v_queue,v_oldest
  from public.communication_delivery_recipients r
  join public.communication_delivery_jobs j on j.id=r.job_id and j.organization_id=r.organization_id and j.school_id=r.school_id
  where j.status in ('queued','processing') and r.attempt_count<3 and (
    r.status='pending' or (r.status='failed' and r.last_failure_retryable and coalesce(r.next_attempt_at,pg_catalog.clock_timestamp())<=pg_catalog.clock_timestamp())
    or (r.status='processing' and r.lease_expires_at<=pg_catalog.clock_timestamp())
  );
  update public.communication_delivery_worker_instances set
    lifecycle_status=p_lifecycle_status,heartbeat_at=pg_catalog.clock_timestamp(),stopped_at=null,
    cycle_count=(p_metrics->>'cycles')::bigint,claimed_count=(p_metrics->>'claimed')::bigint,
    completed_count=(p_metrics->>'completed')::bigint,retryable_failure_count=(p_metrics->>'retryableFailures')::bigint,
    permanent_failure_count=(p_metrics->>'permanentFailures')::bigint,ambiguous_count=(p_metrics->>'ambiguous')::bigint,
    safe_skipped_count=(p_metrics->>'safeSkipped')::bigint,
    last_cycle_at=case when (p_metrics->>'cycles')::bigint>cycle_count then pg_catalog.clock_timestamp() else last_cycle_at end,
    queue_depth=v_queue,oldest_eligible_age_seconds=greatest(0,v_oldest)
  where id=p_instance_id and lifecycle_status in ('RUNNING','DRAINING');
  if not found then raise exception using errcode='P0001',message='B29_WORKER_NOT_RUNNING'; end if;
  return jsonb_build_object('heartbeat',true,'queue_depth',v_queue,'oldest_eligible_age_seconds',greatest(0,v_oldest));
end;
$$;

create or replace function public.b29_stop_delivery_worker(p_instance_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update public.communication_delivery_worker_instances set lifecycle_status='STOPPED',stopped_at=pg_catalog.clock_timestamp(),heartbeat_at=pg_catalog.clock_timestamp()
  where id=p_instance_id and lifecycle_status in ('RUNNING','DRAINING');
  return jsonb_build_object('stopped',found);
end;
$$;

create or replace function public.b29_get_delivery_worker_health()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'workers',coalesce((select jsonb_agg(jsonb_build_object(
      'instance_id',w.id,'status',case when w.lifecycle_status<>'STOPPED' and w.heartbeat_at < pg_catalog.clock_timestamp()-pg_catalog.make_interval(secs=>w.stale_after_seconds) then 'STALE' else w.lifecycle_status end,
      'started_at',w.started_at,'last_heartbeat_at',w.heartbeat_at,'last_cycle_at',w.last_cycle_at,
      'cycle_count',w.cycle_count,'claimed_count',w.claimed_count,'completed_count',w.completed_count,
      'retryable_failure_count',w.retryable_failure_count,'permanent_failure_count',w.permanent_failure_count,
      'ambiguous_count',w.ambiguous_count,'safe_skipped_count',w.safe_skipped_count,
      'queue_depth',w.queue_depth,'oldest_eligible_age_seconds',w.oldest_eligible_age_seconds
    ) order by w.started_at desc) from public.communication_delivery_worker_instances w),'[]'::jsonb),
    'stale_worker_count',(select count(*) from public.communication_delivery_worker_instances w where w.lifecycle_status<>'STOPPED' and w.heartbeat_at < pg_catalog.clock_timestamp()-pg_catalog.make_interval(secs=>w.stale_after_seconds))
  );
$$;

create or replace function public.b29_get_delivery_worker_cursor(p_instance_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_cursor uuid;
begin
  select last_school_id into v_cursor from public.communication_delivery_worker_instances
  where id=p_instance_id and lifecycle_status='RUNNING';
  if not found then raise exception using errcode='P0001',message='B29_WORKER_NOT_RUNNING'; end if;
  return v_cursor;
end;
$$;

create or replace function public.b29_list_delivery_schools(p_instance_id uuid)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare v_cursor uuid; v_result uuid[];
begin
  select last_school_id into v_cursor from public.communication_delivery_worker_instances where id=p_instance_id and lifecycle_status='RUNNING' and heartbeat_at>pg_catalog.clock_timestamp()-pg_catalog.make_interval(secs=>stale_after_seconds) for update;
  if not found then raise exception using errcode='P0001',message='B29_WORKER_NOT_RUNNING'; end if;
  with eligible as (
    select distinct r.school_id from public.communication_delivery_recipients r
    join public.communication_delivery_jobs j on j.id=r.job_id and j.organization_id=r.organization_id and j.school_id=r.school_id
    where j.status in ('queued','processing') and r.attempt_count<3 and (
      r.status='pending' or (r.status='failed' and r.last_failure_retryable and coalesce(r.next_attempt_at,pg_catalog.clock_timestamp())<=pg_catalog.clock_timestamp())
      or (r.status='processing' and r.lease_expires_at<=pg_catalog.clock_timestamp())
    )
  )
  select coalesce(array_agg(school_id order by school_id),'{}'::uuid[]) into v_result from eligible;
  return v_result;
end;
$$;

create or replace function public.b29_claim_delivery_batch_core(p_instance_id uuid,p_actor uuid,p_school_id uuid,p_limit integer,p_lease_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row record; v_token uuid; v_attempt integer; v_now timestamptz:=pg_catalog.clock_timestamp(); v_claims jsonb:='[]'::jsonb; v_retry boolean; v_outcome text; v_failure text; v_org uuid;
begin
  if p_limit<1 or p_limit>25 or p_lease_seconds<30 or p_lease_seconds>600 then raise exception using errcode='22023',message='B29_INVALID_WORKER_LIMIT'; end if;
  select s.organization_id into v_org from public.schools s where s.id=p_school_id;
  if v_org is null then return '[]'::jsonb; end if;
  if p_instance_id is not null then
    perform 1 from public.communication_delivery_worker_instances where id=p_instance_id and lifecycle_status='RUNNING' and heartbeat_at>v_now-pg_catalog.make_interval(secs=>stale_after_seconds) for update;
    if not found then raise exception using errcode='P0001',message='B29_WORKER_NOT_RUNNING'; end if;
  elsif p_actor is null or not public.b25_actor_can_manage_delivery(p_actor,v_org,p_school_id) then
    raise exception using errcode='42501',message='B25_PERMISSION_DENIED';
  end if;

  for v_row in select r.* from public.communication_delivery_recipients r join public.communication_delivery_jobs j on j.id=r.job_id and j.organization_id=r.organization_id and j.school_id=r.school_id
    where r.school_id=p_school_id and r.status='processing' and r.lease_expires_at<=v_now and j.status<>'paused'
    order by r.lease_expires_at for update of r skip locked limit p_limit loop
    v_attempt:=v_row.attempt_count+1;
    v_retry:=v_row.dispatch_started_at is null and v_attempt<3;
    v_outcome:=case when v_retry then 'retryable_failure' when v_row.dispatch_started_at is null then 'permanent_failure' else 'unknown' end;
    v_failure:=case when v_row.dispatch_started_at is null then 'WORKER_LOST_BEFORE_SEND' else 'DELIVERY_OUTCOME_UNKNOWN' end;
    insert into public.communication_delivery_attempts(organization_id,school_id,job_id,delivery_recipient_id,attempt_number,outcome,failure_code,started_at,completed_at)
    values(v_row.organization_id,v_row.school_id,v_row.job_id,v_row.id,v_attempt,v_outcome,v_failure,v_row.claim_started_at,v_now)
    on conflict do nothing;
    update public.communication_delivery_recipients set status='failed',attempt_count=v_attempt,last_failure_code=v_failure,last_failure_retryable=v_retry,
      next_attempt_at=case when v_retry then v_now+pg_catalog.make_interval(secs=>least(900,30*(2^(v_attempt-1))::integer)) else null end,
      claim_token=null,lease_expires_at=null,claim_started_at=null,dispatch_started_at=null,updated_at=v_now where id=v_row.id;
    update public.communication_delivery_jobs j set status=case
      when j.status='paused' then 'paused'
      when exists(select 1 from public.communication_delivery_recipients x where x.job_id=j.id and x.id<>v_row.id and (x.status in ('pending','processing') or (x.status='failed' and x.last_failure_retryable and x.attempt_count<3))) or v_retry then 'processing'
      when exists(select 1 from public.communication_delivery_recipients x where x.job_id=j.id and x.status='failed') then 'completed_with_errors'
      else 'completed' end,updated_at=v_now where j.id=v_row.job_id;
  end loop;

  for v_row in select r.id,r.organization_id,r.school_id,r.job_id,r.attempt_count from public.communication_delivery_recipients r
    join public.communication_delivery_jobs j on j.id=r.job_id and j.organization_id=r.organization_id and j.school_id=r.school_id
    where r.school_id=p_school_id and j.status in ('queued','processing')
      and ((r.status='pending' and r.attempt_count<3) or (r.status='failed' and r.last_failure_retryable and r.attempt_count<3 and coalesce(r.next_attempt_at,v_now)<=v_now))
    order by r.created_at for update of r skip locked limit p_limit loop
    v_token:=gen_random_uuid(); v_attempt:=v_row.attempt_count+1;
    update public.communication_delivery_recipients set status='processing',claim_token=v_token,claim_started_at=v_now,
      lease_expires_at=v_now+pg_catalog.make_interval(secs=>p_lease_seconds),dispatch_started_at=null,next_attempt_at=null,updated_at=v_now where id=v_row.id;
    insert into public.communication_delivery_attempts(organization_id,school_id,job_id,delivery_recipient_id,attempt_number,outcome,started_at)
    values(v_row.organization_id,v_row.school_id,v_row.job_id,v_row.id,v_attempt,'started',v_now);
    update public.communication_delivery_jobs set status='processing',updated_at=v_now where id=v_row.job_id and status='queued';
    v_claims:=v_claims||jsonb_build_array(jsonb_build_object('recipient_id',v_row.id,'job_id',v_row.job_id,'claim_token',v_token,'attempt_number',v_attempt));
  end loop;
  if p_instance_id is not null and jsonb_array_length(v_claims)>0 then update public.communication_delivery_worker_instances set last_school_id=p_school_id where id=p_instance_id; end if;
  return v_claims;
end;
$$;

create or replace function public.b29_claim_delivery_batch(p_instance_id uuid,p_school_id uuid,p_limit integer default 1,p_lease_seconds integer default 90)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_limit<1 or p_limit>10 then raise exception using errcode='22023',message='B29_INVALID_WORKER_LIMIT'; end if;
  return public.b29_claim_delivery_batch_core(p_instance_id,null,p_school_id,p_limit,p_lease_seconds);
end;
$$;

-- Preserve the B25 public/server contract while sharing exactly one claim
-- implementation for human-triggered Development cycles and machine workers.
create or replace function public.b25_claim_delivery_batch(p_actor uuid,p_school_id uuid,p_limit integer default 10,p_lease_seconds integer default 90)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.b29_claim_delivery_batch_core(null,p_actor,p_school_id,p_limit,p_lease_seconds);
end;
$$;

create or replace function public.b29_mark_delivery_dispatch_started(p_recipient_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update public.communication_delivery_recipients set dispatch_started_at=pg_catalog.clock_timestamp(),updated_at=pg_catalog.clock_timestamp()
  where id=p_recipient_id and status='processing' and claim_token=p_claim_token and lease_expires_at>pg_catalog.clock_timestamp() and dispatch_started_at is null;
  return jsonb_build_object('marked',found);
end;
$$;

create or replace function public.b29_finalize_delivery_attempt(p_recipient_id uuid,p_claim_token uuid,p_outcome text,p_failure_code text default null,p_message_reference text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_r public.communication_delivery_recipients%rowtype; v_j public.communication_delivery_jobs%rowtype; v_started public.communication_delivery_attempts%rowtype; v_attempt integer; v_retry boolean; v_status text; v_code text; v_event text;
begin
  if p_outcome not in ('accepted','retryable_failure','permanent_failure','unknown','safe_skip') then raise exception using errcode='22023',message='B29_INVALID_OUTCOME'; end if;
  select * into v_r from public.communication_delivery_recipients r where r.id=p_recipient_id and r.status='processing' and r.claim_token=p_claim_token and r.lease_expires_at>pg_catalog.clock_timestamp() and r.dispatch_started_at is not null for update;
  if not found then return jsonb_build_object('finalized',false,'reason','CLAIM_EXPIRED'); end if;
  select * into v_j from public.communication_delivery_jobs j where j.id=v_r.job_id for update;
  if v_j.status='paused' then return jsonb_build_object('finalized',false,'reason','JOB_PAUSED'); end if;
  v_attempt:=v_r.attempt_count+1;
  select * into v_started from public.communication_delivery_attempts a where a.delivery_recipient_id=v_r.id and a.attempt_number=v_attempt and a.outcome='started';
  if not found then return jsonb_build_object('finalized',false,'reason','ATTEMPT_NOT_STARTED'); end if;
  v_retry:=p_outcome='retryable_failure' and v_attempt<3;
  v_status:=case when p_outcome='accepted' then 'sent' when p_outcome='safe_skip' then 'skipped' else 'failed' end;
  v_code:=case when p_outcome='accepted' then null when p_outcome='unknown' then 'DELIVERY_OUTCOME_UNKNOWN' when p_outcome='safe_skip' then 'INELIGIBLE' else left(coalesce(p_failure_code,'DELIVERY_FAILED'),80) end;
  v_event:=case when p_outcome='unknown' then 'unknown' when p_outcome='safe_skip' then 'permanent_failure' else p_outcome end;
  insert into public.communication_delivery_attempts(organization_id,school_id,job_id,delivery_recipient_id,attempt_number,outcome,failure_code,provider_message_id,started_at,completed_at)
  values(v_r.organization_id,v_r.school_id,v_r.job_id,v_r.id,v_attempt,v_event,v_code,case when p_outcome='accepted' then left(p_message_reference,200) else null end,v_started.started_at,pg_catalog.clock_timestamp());
  update public.communication_delivery_recipients set status=v_status,attempt_count=v_attempt,last_failure_code=v_code,
    last_failure_retryable=v_retry,next_attempt_at=case when v_retry then pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>least(900,30*(2^(v_attempt-1))::integer)) else null end,
    claim_token=null,lease_expires_at=null,claim_started_at=null,dispatch_started_at=null,updated_at=pg_catalog.clock_timestamp() where id=v_r.id;
  update public.communication_delivery_jobs j set status=case
    when exists(select 1 from public.communication_delivery_recipients x where x.job_id=j.id and x.id<>v_r.id and (x.status in ('pending','processing') or (x.status='failed' and x.last_failure_retryable and x.attempt_count<3))) or v_retry then 'processing'
    when exists(select 1 from public.communication_delivery_recipients x where x.job_id=j.id and x.status='failed') then 'completed_with_errors' else 'completed' end,
    updated_at=pg_catalog.clock_timestamp() where j.id=v_j.id;
  return jsonb_build_object('finalized',true,'status',v_status,'retryable',v_retry,'ambiguous',p_outcome='unknown','attempt_number',v_attempt);
end;
$$;

revoke all on function public.b29_register_delivery_worker(uuid,text,integer),public.b29_heartbeat_delivery_worker(uuid,text,jsonb),public.b29_stop_delivery_worker(uuid),public.b29_get_delivery_worker_health(),public.b29_get_delivery_worker_cursor(uuid),public.b29_list_delivery_schools(uuid),public.b29_claim_delivery_batch_core(uuid,uuid,uuid,integer,integer),public.b29_claim_delivery_batch(uuid,uuid,integer,integer),public.b29_mark_delivery_dispatch_started(uuid,uuid),public.b29_finalize_delivery_attempt(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.b29_register_delivery_worker(uuid,text,integer),public.b29_heartbeat_delivery_worker(uuid,text,jsonb),public.b29_stop_delivery_worker(uuid),public.b29_get_delivery_worker_health(),public.b29_get_delivery_worker_cursor(uuid),public.b29_list_delivery_schools(uuid),public.b29_claim_delivery_batch_core(uuid,uuid,uuid,integer,integer),public.b29_claim_delivery_batch(uuid,uuid,integer,integer),public.b29_mark_delivery_dispatch_started(uuid,uuid),public.b29_finalize_delivery_attempt(uuid,uuid,text,text,text) to service_role;

commit;
