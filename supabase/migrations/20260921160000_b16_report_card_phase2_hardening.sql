-- B16 Phase 2 forward-only hardening.
-- Fixes replay ordering and bounded parent-CAS result reporting discovered by
-- authenticated synthetic runtime QA. No lifecycle, authority, or snapshot
-- semantics are changed.

create or replace function public.b16_report_card_save_content(
  p_report_card_id uuid,
  p_expected_row_version bigint,
  p_content jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_card public.report_cards%rowtype;
  v_existing public.report_card_command_requests%rowtype;
  v_item jsonb;
  v_id uuid;
  v_expected bigint;
  v_new bigint;
  v_card_row_version bigint;
  v_subject_results jsonb := '[]'::jsonb;
  v_narrative_results jsonb := '[]'::jsonb;
  v_subject_count bigint := 0;
  v_narrative_count bigint := 0;
  v_fp text;
  v_payload jsonb;
begin
  if v_actor is null then raise exception 'B16_REPORT_CARD_AUTH_REQUIRED'; end if;
  if p_request_id is null or p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'B16_REPORT_CARD_INVALID_CONTENT';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_content) as key_name
    where key_name not in ('homeroom_comment','subject_entries','narratives')
  ) then raise exception 'B16_REPORT_CARD_INVALID_CONTENT'; end if;
  if p_content ? 'homeroom_comment'
    and jsonb_typeof(p_content->'homeroom_comment') not in ('string','null') then
    raise exception 'B16_REPORT_CARD_INVALID_CONTENT';
  end if;
  if p_content ? 'homeroom_comment' and jsonb_typeof(p_content->'homeroom_comment') = 'string'
    and length(p_content->>'homeroom_comment') > 5000 then
    raise exception 'B16_REPORT_CARD_INVALID_CONTENT';
  end if;
  if p_content ? 'subject_entries' and jsonb_typeof(p_content->'subject_entries') <> 'array' then
    raise exception 'B16_REPORT_CARD_INVALID_CONTENT';
  end if;
  if p_content ? 'narratives' and jsonb_typeof(p_content->'narratives') <> 'array' then
    raise exception 'B16_REPORT_CARD_INVALID_CONTENT';
  end if;
  if jsonb_array_length(coalesce(p_content->'subject_entries','[]'::jsonb)) > 100
    or jsonb_array_length(coalesce(p_content->'narratives','[]'::jsonb)) > 100 then
    raise exception 'B16_REPORT_CARD_INVALID_CONTENT';
  end if;

  select * into v_card from public.report_cards rc where rc.id = p_report_card_id for update;
  if not found then raise exception 'B16_REPORT_CARD_NOT_FOUND'; end if;
  if v_card.status <> 'draft' then raise exception 'B16_REPORT_CARD_PUBLISHED_IMMUTABLE'; end if;
  if not public.can_access_report_card('report_card.edit_narrative', v_card.id) then
    raise exception 'B16_REPORT_CARD_FORBIDDEN';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'report_card_id', p_report_card_id,
    'expected_row_version', p_expected_row_version,
    'homeroom_comment', case when p_content ? 'homeroom_comment' then p_content->'homeroom_comment' else 'null'::jsonb end,
    'subject_entries', coalesce((select jsonb_agg(x order by coalesce(x->>'id',x->>'subject_id')) from jsonb_array_elements(coalesce(p_content->'subject_entries','[]'::jsonb)) x),'[]'::jsonb),
    'narratives', coalesce((select jsonb_agg(x order by coalesce(x->>'id',x->>'section_code')) from jsonb_array_elements(coalesce(p_content->'narratives','[]'::jsonb)) x),'[]'::jsonb)
  );
  v_fp := public.b16_report_card_request_fingerprint(v_payload);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor::text || ':b16_report_card_save_content:' || p_request_id::text, 0));
  select * into v_existing from public.report_card_command_requests c
  where c.actor_profile_id = v_actor and c.command_name = 'save_report_card_content'
    and c.request_id = p_request_id for update;
  if found then
    if v_existing.payload_fingerprint <> v_fp or v_existing.report_card_id <> p_report_card_id then
      raise exception 'B16_REPORT_CARD_REQUEST_CONFLICT';
    end if;
    if v_existing.status = 'completed' then return v_existing.result_payload; end if;
    raise exception 'B16_REPORT_CARD_REQUEST_CONFLICT';
  end if;

  if v_card.row_version <> p_expected_row_version then raise exception 'B16_REPORT_CARD_STALE_VERSION'; end if;
  insert into public.report_card_command_requests(
    organization_id, school_id, actor_profile_id, request_id, command_name, payload_fingerprint, report_card_id
  ) values (v_card.organization_id, v_card.school_id, v_actor, p_request_id, 'save_report_card_content', v_fp, p_report_card_id);

  v_card_row_version := p_expected_row_version;
  if p_content ? 'homeroom_comment' then
    update public.report_cards set homeroom_comment = p_content->>'homeroom_comment'
    where id = p_report_card_id and row_version = p_expected_row_version;
    if not found then raise exception 'B16_REPORT_CARD_STALE_VERSION'; end if;
    select row_version into v_card_row_version from public.report_cards where id = p_report_card_id;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_content->'subject_entries','[]'::jsonb)) loop
    if v_item->>'id' is null or v_item->>'narrative' is null and not (v_item ? 'narrative') then
      raise exception 'B16_REPORT_CARD_INVALID_CONTENT';
    end if;
    if v_item ? 'final_score' or v_item ? 'predicate' or v_item ? 'source_calculation' then
      raise exception 'B16_REPORT_CARD_PUBLISHED_IMMUTABLE';
    end if;
    v_id := (v_item->>'id')::uuid;
    v_expected := nullif(v_item->>'expected_row_version','')::bigint;
    if v_expected is null then raise exception 'B16_REPORT_CARD_STALE_VERSION'; end if;
    update public.report_card_subject_entries set narrative = v_item->>'narrative'
    where id = v_id and report_card_id = p_report_card_id and row_version = v_expected;
    if not found then raise exception 'B16_REPORT_CARD_STALE_VERSION'; end if;
    select row_version into v_new from public.report_card_subject_entries where id = v_id;
    v_subject_results := v_subject_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_id,'row_version',v_new));
    v_subject_count := v_subject_count + 1;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_content->'narratives','[]'::jsonb)) loop
    if not (v_item ? 'section_code') or not (v_item ? 'title') or not (v_item ? 'content') or not (v_item ? 'sequence') then
      raise exception 'B16_REPORT_CARD_INVALID_CONTENT';
    end if;
    if length(v_item->>'title') > 300 or length(v_item->>'content') > 5000 then
      raise exception 'B16_REPORT_CARD_INVALID_CONTENT';
    end if;
    v_expected := nullif(v_item->>'expected_row_version','')::bigint;
    if v_item->>'id' is null then
      if v_item ? 'expected_row_version' then raise exception 'B16_REPORT_CARD_STALE_VERSION'; end if;
      insert into public.report_card_narratives(organization_id,school_id,report_card_id,section_code,title,content,sequence)
      values (v_card.organization_id,v_card.school_id,p_report_card_id,v_item->>'section_code',v_item->>'title',v_item->>'content',(v_item->>'sequence')::integer)
      returning id,row_version into v_id,v_new;
    else
      if v_expected is null then raise exception 'B16_REPORT_CARD_STALE_VERSION'; end if;
      v_id := (v_item->>'id')::uuid;
      update public.report_card_narratives set section_code=v_item->>'section_code', title=v_item->>'title', content=v_item->>'content', sequence=(v_item->>'sequence')::integer
      where id=v_id and report_card_id=p_report_card_id and row_version=v_expected;
      if not found then raise exception 'B16_REPORT_CARD_STALE_VERSION'; end if;
      select row_version into v_new from public.report_card_narratives where id=v_id;
    end if;
    v_narrative_results := v_narrative_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',v_id,'row_version',v_new));
    v_narrative_count := v_narrative_count + 1;
  end loop;

  v_payload := pg_catalog.jsonb_build_object(
    'report_card_id', p_report_card_id,
    'report_card_row_version', v_card_row_version,
    'subject_entries', v_subject_results,
    'narratives', v_narrative_results,
    'changed_count', v_subject_count + v_narrative_count + case when p_content ? 'homeroom_comment' then 1 else 0 end
  );
  update public.report_card_command_requests c set resource_type='report_card', resource_id=p_report_card_id,
    result_payload=v_payload, status='completed', completed_at=pg_catalog.clock_timestamp()
  where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='save_report_card_content';
  return v_payload;
end
$$;

revoke all on function public.b16_report_card_save_content(uuid,bigint,jsonb,uuid) from public,anon,service_role;
grant execute on function public.b16_report_card_save_content(uuid,bigint,jsonb,uuid) to authenticated;
