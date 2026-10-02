begin;

alter table public.communication_contact_preference_events
  add column if not exists source_reference text check (source_reference is null or length(source_reference)<=120);

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
    where j.announcement_id=p_announcement_id and j.organization_id=v_org and j.school_id=p_school_id group by j.id
  ) x;
  return v_rows;
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
  v_status:=case when p_outcome='accepted' then 'sent' else 'failed' end;
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

commit;
