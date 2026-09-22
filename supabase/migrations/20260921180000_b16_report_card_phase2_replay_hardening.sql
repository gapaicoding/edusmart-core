-- B16 Phase 2 forward-only replay hardening.
-- Completed command replay is resolved before current-state/CAS gates so a
-- transport retry returns its original bounded result.

create or replace function public.b16_report_card_transition(
  p_report_card_id uuid,
  p_action text,
  p_expected_row_version bigint,
  p_request_id uuid
)
returns table(report_card_id uuid, status text, business_version integer, row_version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid(); v_card public.report_cards%rowtype; v_existing public.report_card_command_requests%rowtype; v_result public.report_cards%rowtype; v_fp text;
begin
  if v_actor is null then raise exception 'B16_REPORT_CARD_AUTH_REQUIRED'; end if;
  if p_request_id is null or p_action not in ('submit','review','return','archive') then raise exception 'B16_REPORT_CARD_INVALID_STATE'; end if;
  select * into v_card from public.report_cards where id=p_report_card_id for update;
  if not found then raise exception 'B16_REPORT_CARD_NOT_FOUND'; end if;
  v_fp := public.b16_report_card_request_fingerprint(pg_catalog.jsonb_build_object('report_card_id',p_report_card_id,'action',p_action,'expected_row_version',p_expected_row_version));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':b16_report_card_transition:'||p_request_id::text,0));
  select * into v_existing from public.report_card_command_requests c where c.actor_profile_id=v_actor and c.command_name='transition_report_card' and c.request_id=p_request_id for update;
  if found then
    if v_existing.payload_fingerprint<>v_fp or v_existing.report_card_id<>p_report_card_id then raise exception 'B16_REPORT_CARD_REQUEST_CONFLICT'; end if;
    if v_existing.status='completed' then return query select (v_existing.result_payload->>'report_card_id')::uuid,v_existing.result_payload->>'status',(v_existing.result_payload->>'business_version')::integer,(v_existing.result_payload->>'row_version')::bigint; return; end if;
    raise exception 'B16_REPORT_CARD_REQUEST_CONFLICT';
  end if;
  if v_card.row_version <> p_expected_row_version then raise exception 'B16_REPORT_CARD_STALE_VERSION'; end if;
  insert into public.report_card_command_requests(organization_id,school_id,actor_profile_id,request_id,command_name,payload_fingerprint,report_card_id) values(v_card.organization_id,v_card.school_id,v_actor,p_request_id,'transition_report_card',v_fp,p_report_card_id);
  begin
    select * into v_result from public.transition_report_card(p_report_card_id,v_card.updated_at,p_action);
  exception when others then
    if sqlerrm ilike '%Stale%' then raise exception 'B16_REPORT_CARD_STALE_VERSION'; elsif sqlerrm ilike '%permission%' then raise exception 'B16_REPORT_CARD_FORBIDDEN'; elsif sqlerrm ilike '%Invalid%' then raise exception 'B16_REPORT_CARD_INVALID_STATE'; else raise exception 'B16_REPORT_CARD_FORBIDDEN'; end if;
  end;
  update public.report_card_command_requests c set resource_type='report_card',resource_id=p_report_card_id,result_payload=pg_catalog.jsonb_build_object('report_card_id',v_result.id,'status',v_result.status,'business_version',v_result.version,'row_version',v_result.row_version),status='completed',completed_at=pg_catalog.clock_timestamp() where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='transition_report_card';
  return query select v_result.id,v_result.status,v_result.version,v_result.row_version;
end
$$;

create or replace function public.b16_report_card_publish(
  p_report_card_id uuid,
  p_expected_row_version bigint,
  p_request_id uuid
)
returns table(report_card_id uuid, status text, business_version integer, row_version bigint)
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid(); v_card public.report_cards%rowtype; v_result public.report_cards%rowtype; v_existing public.report_card_command_requests%rowtype; v_fp text;
begin
  if v_actor is null then raise exception 'B16_REPORT_CARD_AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'B16_REPORT_CARD_INVALID_STATE'; end if;
  select * into v_card from public.report_cards where id=p_report_card_id for update;
  if not found then raise exception 'B16_REPORT_CARD_NOT_FOUND'; end if;
  v_fp:=public.b16_report_card_request_fingerprint(pg_catalog.jsonb_build_object('report_card_id',p_report_card_id,'expected_row_version',p_expected_row_version));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':b16_report_card_publish:'||p_request_id::text,0));
  select * into v_existing from public.report_card_command_requests c where c.actor_profile_id=v_actor and c.command_name='publish_report_card' and c.request_id=p_request_id for update;
  if found then
    if v_existing.payload_fingerprint<>v_fp or v_existing.report_card_id<>p_report_card_id then raise exception 'B16_REPORT_CARD_REQUEST_CONFLICT'; end if;
    if v_existing.status='completed' then return query select (v_existing.result_payload->>'report_card_id')::uuid,v_existing.result_payload->>'status',(v_existing.result_payload->>'business_version')::integer,(v_existing.result_payload->>'row_version')::bigint; return; end if;
    raise exception 'B16_REPORT_CARD_REQUEST_CONFLICT';
  end if;
  if v_card.row_version<>p_expected_row_version then raise exception 'B16_REPORT_CARD_STALE_VERSION'; end if;
  if v_card.status<>'reviewed' then raise exception 'B16_REPORT_CARD_INVALID_STATE'; end if;
  insert into public.report_card_command_requests(organization_id,school_id,actor_profile_id,request_id,command_name,payload_fingerprint,report_card_id) values(v_card.organization_id,v_card.school_id,v_actor,p_request_id,'publish_report_card',v_fp,p_report_card_id);
  begin
    select * into v_result from public.publish_report_card(p_report_card_id,v_card.updated_at);
  exception when others then
    if sqlerrm ilike '%Stale%' then raise exception 'B16_REPORT_CARD_STALE_VERSION'; elsif sqlerrm ilike '%permission%' then raise exception 'B16_REPORT_CARD_FORBIDDEN'; elsif sqlerrm ilike '%Reviewed%' then raise exception 'B16_REPORT_CARD_INVALID_STATE'; else raise exception 'B16_REPORT_CARD_SNAPSHOT_INVALID'; end if;
  end;
  update public.report_card_command_requests c set resource_type='report_card',resource_id=p_report_card_id,result_payload=pg_catalog.jsonb_build_object('report_card_id',v_result.id,'status',v_result.status,'business_version',v_result.version,'row_version',v_result.row_version),status='completed',completed_at=pg_catalog.clock_timestamp() where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='publish_report_card';
  return query select v_result.id,v_result.status,v_result.version,v_result.row_version;
end
$$;

revoke all on function public.b16_report_card_transition(uuid,text,bigint,uuid) from public,anon,service_role;
grant execute on function public.b16_report_card_transition(uuid,text,bigint,uuid) to authenticated;
revoke all on function public.b16_report_card_publish(uuid,bigint,uuid) from public,anon,service_role;
grant execute on function public.b16_report_card_publish(uuid,bigint,uuid) to authenticated;
