create or replace function public.b25_list_delivery_operations(p_announcement_id uuid,p_school_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_rows jsonb;
begin
  select a.organization_id into v_org from public.communication_announcements a where a.id=p_announcement_id and a.school_id=p_school_id;
  if v_org is null then raise exception using errcode='P0001',message='B22_ANNOUNCEMENT_NOT_FOUND'; end if;
  if auth.uid() is null or not public.has_staff_scope_permission('communication.delivery.manage',v_org,p_school_id) then raise exception using errcode='42501',message='B25_PERMISSION_DENIED'; end if;
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
        'id',r.id,'recipient_profile_id',ar.recipient_profile_id,'status',r.status,'attempt_count',r.attempt_count,'failure_code',r.last_failure_code,
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
