-- EduSmart Core V1 — Batch 16 Phase 2
-- Authenticated Report Card commands and bounded staff projections.
-- Document/PDF, portal, assessment, attendance, and UI paths are unchanged.

create or replace function public.b16_report_card_request_fingerprint(p_payload jsonb)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select pg_catalog.encode(extensions.digest(p_payload::text, 'sha256'), 'hex')
$$;

revoke all on function public.b16_report_card_request_fingerprint(jsonb) from public, anon, authenticated, service_role;

create or replace function public.b16_report_card_generate_draft(
  p_student_enrollment_id uuid,
  p_term_id uuid,
  p_request_id uuid,
  p_expected_row_version bigint default null
)
returns table(report_card_id uuid, status text, business_version integer, row_version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_enrollment public.student_enrollments%rowtype;
  v_term public.terms%rowtype;
  v_card public.report_cards%rowtype;
  v_existing public.report_card_command_requests%rowtype;
  v_id uuid;
  v_fp text;
  v_payload jsonb;
begin
  if v_actor is null then raise exception 'B16_REPORT_CARD_AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'B16_REPORT_CARD_INVALID_CONTENT'; end if;

  select * into v_enrollment from public.student_enrollments se
  where se.id = p_student_enrollment_id for share;
  if not found then raise exception 'B16_REPORT_CARD_NOT_FOUND'; end if;
  select * into v_term from public.terms t where t.id = p_term_id for share;
  if not found or v_term.organization_id <> v_enrollment.organization_id
    or v_term.school_id <> v_enrollment.school_id
    or v_term.academic_year_id <> v_enrollment.academic_year_id then
    raise exception 'B16_REPORT_CARD_SCOPE_MISMATCH';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'student_enrollment_id', p_student_enrollment_id,
    'term_id', p_term_id,
    'expected_row_version', p_expected_row_version
  );
  v_fp := public.b16_report_card_request_fingerprint(v_payload);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor::text || ':b16_report_card_generate_draft:' || p_request_id::text, 0));
  select * into v_existing from public.report_card_command_requests c
  where c.actor_profile_id = v_actor and c.command_name = 'generate_report_card_draft'
    and c.request_id = p_request_id for update;
  if found then
    if v_existing.payload_fingerprint <> v_fp
      or v_existing.organization_id <> v_enrollment.organization_id
      or v_existing.school_id <> v_enrollment.school_id then
      raise exception 'B16_REPORT_CARD_REQUEST_CONFLICT';
    end if;
    if v_existing.status = 'completed' then
      return query select
        (v_existing.result_payload->>'report_card_id')::uuid,
        v_existing.result_payload->>'status',
        (v_existing.result_payload->>'business_version')::integer,
        (v_existing.result_payload->>'row_version')::bigint;
      return;
    end if;
    raise exception 'B16_REPORT_CARD_REQUEST_CONFLICT';
  end if;

  select * into v_card from public.report_cards rc
  where rc.student_enrollment_id = p_student_enrollment_id
    and rc.term_id = p_term_id
    and rc.status in ('draft','submitted','reviewed')
  for update;
  if found then
    if v_card.status <> 'draft' then raise exception 'B16_REPORT_CARD_INVALID_STATE'; end if;
    if p_expected_row_version is null or v_card.row_version <> p_expected_row_version then
      raise exception 'B16_REPORT_CARD_STALE_VERSION';
    end if;
  elsif p_expected_row_version is not null then
    raise exception 'B16_REPORT_CARD_STALE_VERSION';
  end if;

  insert into public.report_card_command_requests(
    organization_id, school_id, actor_profile_id, request_id, command_name, payload_fingerprint
  ) values (
    v_enrollment.organization_id, v_enrollment.school_id, v_actor, p_request_id,
    'generate_report_card_draft', v_fp
  );

  begin
    select public.generate_report_card_draft(
      p_student_enrollment_id,
      p_term_id,
      case when v_card.id is null then null else v_card.updated_at end
    ) into v_id;
  exception when others then
    if sqlerrm ilike '%Stale%' or sqlerrm ilike '%updated_at%' then
      raise exception 'B16_REPORT_CARD_STALE_VERSION';
    elsif sqlerrm ilike '%permission%' then
      raise exception 'B16_REPORT_CARD_FORBIDDEN';
    elsif sqlerrm ilike '%published%' or sqlerrm ilike '%working%' then
      raise exception 'B16_REPORT_CARD_INVALID_STATE';
    else
      raise exception 'B16_REPORT_CARD_SNAPSHOT_INVALID';
    end if;
  end;

  select * into v_card from public.report_cards rc where rc.id = v_id;
  update public.report_card_command_requests c set
    report_card_id = v_card.id,
    resource_type = 'report_card',
    resource_id = v_card.id,
    result_payload = pg_catalog.jsonb_build_object(
      'report_card_id', v_card.id,
      'status', v_card.status,
      'business_version', v_card.version,
      'row_version', v_card.row_version
    ),
    status = 'completed', completed_at = pg_catalog.clock_timestamp()
  where c.actor_profile_id = v_actor and c.request_id = p_request_id
    and c.command_name = 'generate_report_card_draft';
  return query select v_card.id, v_card.status, v_card.version, v_card.row_version;
end
$$;

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
  if v_card.row_version <> p_expected_row_version then raise exception 'B16_REPORT_CARD_STALE_VERSION'; end if;
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
  insert into public.report_card_command_requests(
    organization_id, school_id, actor_profile_id, request_id, command_name, payload_fingerprint, report_card_id
  ) values (v_card.organization_id, v_card.school_id, v_actor, p_request_id, 'save_report_card_content', v_fp, p_report_card_id);

  if p_content ? 'homeroom_comment' then
    update public.report_cards set homeroom_comment = p_content->>'homeroom_comment'
    where id = p_report_card_id and row_version = p_expected_row_version;
    if not found then raise exception 'B16_REPORT_CARD_STALE_VERSION'; end if;
    select row_version into v_new from public.report_cards where id = p_report_card_id;
  else
    v_new := p_expected_row_version;
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
    'report_card_row_version', v_new,
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
  v_actor uuid := auth.uid();
  v_card public.report_cards%rowtype;
  v_existing public.report_card_command_requests%rowtype;
  v_result public.report_cards%rowtype;
  v_fp text;
begin
  if v_actor is null then raise exception 'B16_REPORT_CARD_AUTH_REQUIRED'; end if;
  if p_action not in ('submit','review','return','archive') then raise exception 'B16_REPORT_CARD_INVALID_STATE'; end if;
  select * into v_card from public.report_cards where id=p_report_card_id for update;
  if not found then raise exception 'B16_REPORT_CARD_NOT_FOUND'; end if;
  if v_card.row_version <> p_expected_row_version then raise exception 'B16_REPORT_CARD_STALE_VERSION'; end if;
  v_fp := public.b16_report_card_request_fingerprint(pg_catalog.jsonb_build_object('report_card_id',p_report_card_id,'action',p_action,'expected_row_version',p_expected_row_version));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':b16_report_card_transition:'||p_request_id::text,0));
  select * into v_existing from public.report_card_command_requests c where c.actor_profile_id=v_actor and c.command_name='transition_report_card' and c.request_id=p_request_id for update;
  if found then
    if v_existing.payload_fingerprint<>v_fp or v_existing.report_card_id<>p_report_card_id then raise exception 'B16_REPORT_CARD_REQUEST_CONFLICT'; end if;
    if v_existing.status='completed' then return query select (v_existing.result_payload->>'report_card_id')::uuid,v_existing.result_payload->>'status',(v_existing.result_payload->>'business_version')::integer,(v_existing.result_payload->>'row_version')::bigint; return; end if;
    raise exception 'B16_REPORT_CARD_REQUEST_CONFLICT';
  end if;
  insert into public.report_card_command_requests(organization_id,school_id,actor_profile_id,request_id,command_name,payload_fingerprint,report_card_id) values(v_card.organization_id,v_card.school_id,v_actor,p_request_id,'transition_report_card',v_fp,p_report_card_id);
  begin
    select public.transition_report_card(p_report_card_id,v_card.updated_at,p_action) into v_result;
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
  select * into v_card from public.report_cards where id=p_report_card_id for update;
  if not found then raise exception 'B16_REPORT_CARD_NOT_FOUND'; end if;
  if v_card.row_version<>p_expected_row_version then raise exception 'B16_REPORT_CARD_STALE_VERSION'; end if;
  if v_card.status<>'reviewed' then raise exception 'B16_REPORT_CARD_INVALID_STATE'; end if;
  v_fp:=public.b16_report_card_request_fingerprint(pg_catalog.jsonb_build_object('report_card_id',p_report_card_id,'expected_row_version',p_expected_row_version));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':b16_report_card_publish:'||p_request_id::text,0));
  select * into v_existing from public.report_card_command_requests c where c.actor_profile_id=v_actor and c.command_name='publish_report_card' and c.request_id=p_request_id for update;
  if found then
    if v_existing.payload_fingerprint<>v_fp or v_existing.report_card_id<>p_report_card_id then raise exception 'B16_REPORT_CARD_REQUEST_CONFLICT'; end if;
    if v_existing.status='completed' then return query select (v_existing.result_payload->>'report_card_id')::uuid,v_existing.result_payload->>'status',(v_existing.result_payload->>'business_version')::integer,(v_existing.result_payload->>'row_version')::bigint; return; end if;
    raise exception 'B16_REPORT_CARD_REQUEST_CONFLICT';
  end if;
  insert into public.report_card_command_requests(organization_id,school_id,actor_profile_id,request_id,command_name,payload_fingerprint,report_card_id) values(v_card.organization_id,v_card.school_id,v_actor,p_request_id,'publish_report_card',v_fp,p_report_card_id);
  begin
    select public.publish_report_card(p_report_card_id,v_card.updated_at) into v_result;
  exception when others then
    if sqlerrm ilike '%Stale%' then raise exception 'B16_REPORT_CARD_STALE_VERSION'; elsif sqlerrm ilike '%permission%' then raise exception 'B16_REPORT_CARD_FORBIDDEN'; elsif sqlerrm ilike '%Reviewed%' then raise exception 'B16_REPORT_CARD_INVALID_STATE'; else raise exception 'B16_REPORT_CARD_SNAPSHOT_INVALID'; end if;
  end;
  update public.report_card_command_requests c set resource_type='report_card',resource_id=p_report_card_id,result_payload=pg_catalog.jsonb_build_object('report_card_id',v_result.id,'status',v_result.status,'business_version',v_result.version,'row_version',v_result.row_version),status='completed',completed_at=pg_catalog.clock_timestamp() where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='publish_report_card';
  return query select v_result.id,v_result.status,v_result.version,v_result.row_version;
end
$$;

create or replace function public.b16_report_card_create_revision(
  p_source_report_card_id uuid,
  p_expected_source_row_version bigint,
  p_reason text,
  p_request_id uuid
)
returns table(source_report_card_id uuid, report_card_id uuid, business_version integer, row_version bigint, status text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid(); v_source public.report_cards%rowtype; v_new public.report_cards%rowtype; v_new_id uuid; v_existing public.report_card_command_requests%rowtype; v_fp text; v_reason text;
begin
  if v_actor is null then raise exception 'B16_REPORT_CARD_AUTH_REQUIRED'; end if;
  v_reason:=pg_catalog.btrim(coalesce(p_reason,''));
  if length(v_reason)<1 or length(v_reason)>1000 then raise exception 'B16_REPORT_CARD_REVISION_REASON_REQUIRED'; end if;
  select * into v_source from public.report_cards where id=p_source_report_card_id for update;
  if not found then raise exception 'B16_REPORT_CARD_NOT_FOUND'; end if;
  if v_source.row_version<>p_expected_source_row_version then raise exception 'B16_REPORT_CARD_STALE_VERSION'; end if;
  if v_source.status<>'published' then raise exception 'B16_REPORT_CARD_REVISION_SOURCE_INVALID'; end if;
  if not public.can_access_report_card('report_card.revise_published',v_source.id) then raise exception 'B16_REPORT_CARD_REVISION_FORBIDDEN'; end if;
  v_fp:=public.b16_report_card_request_fingerprint(pg_catalog.jsonb_build_object('source_report_card_id',p_source_report_card_id,'expected_source_row_version',p_expected_source_row_version,'reason',v_reason));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':b16_report_card_create_revision:'||p_request_id::text,0));
  select * into v_existing from public.report_card_command_requests c where c.actor_profile_id=v_actor and c.command_name='create_report_card_revision' and c.request_id=p_request_id for update;
  if found then
    if v_existing.payload_fingerprint<>v_fp or v_existing.report_card_id<>p_source_report_card_id then raise exception 'B16_REPORT_CARD_REQUEST_CONFLICT'; end if;
    if v_existing.status='completed' then return query select (v_existing.result_payload->>'source_report_card_id')::uuid,(v_existing.result_payload->>'report_card_id')::uuid,(v_existing.result_payload->>'business_version')::integer,(v_existing.result_payload->>'row_version')::bigint,v_existing.result_payload->>'status'; return; end if;
    raise exception 'B16_REPORT_CARD_REQUEST_CONFLICT';
  end if;
  insert into public.report_card_command_requests(organization_id,school_id,actor_profile_id,request_id,command_name,payload_fingerprint,report_card_id) values(v_source.organization_id,v_source.school_id,v_actor,p_request_id,'create_report_card_revision',v_fp,p_source_report_card_id);
  begin
    select public.create_report_card_revision(p_source_report_card_id,v_source.updated_at) into v_new_id;
  exception when others then
    if sqlerrm ilike '%Stale%' then raise exception 'B16_REPORT_CARD_STALE_VERSION'; elsif sqlerrm ilike '%permission%' then raise exception 'B16_REPORT_CARD_REVISION_FORBIDDEN'; elsif sqlerrm ilike '%Published%' then raise exception 'B16_REPORT_CARD_REVISION_SOURCE_INVALID'; else raise exception 'B16_REPORT_CARD_SNAPSHOT_INVALID'; end if;
  end;
  select * into v_new from public.report_cards where id = v_new_id;
  insert into public.audit_logs(organization_id,school_id,actor_profile_id,actor_type,action,entity_type,entity_id,before_data,after_data,metadata)
  values(v_source.organization_id,v_source.school_id,v_actor,'user','report_card_revision_created','report_card',v_new.id,
    pg_catalog.jsonb_build_object('source_report_card_id',v_source.id,'business_version',v_source.version,'status',v_source.status,'row_version',v_source.row_version),
    pg_catalog.jsonb_build_object('report_card_id',v_new.id,'business_version',v_new.version,'status',v_new.status,'row_version',v_new.row_version),
    pg_catalog.jsonb_build_object('source_report_card_id',v_source.id,'new_report_card_id',v_new.id,'source_business_version',v_source.version,'new_business_version',v_new.version,'reason',v_reason,'command','create_report_card_revision','request_id',p_request_id));
  update public.report_card_command_requests c set resource_type='report_card',resource_id=v_new.id,result_payload=pg_catalog.jsonb_build_object('source_report_card_id',v_source.id,'report_card_id',v_new.id,'business_version',v_new.version,'row_version',v_new.row_version,'status',v_new.status),status='completed',completed_at=pg_catalog.clock_timestamp() where c.actor_profile_id=v_actor and c.request_id=p_request_id and c.command_name='create_report_card_revision';
  return query select v_source.id,v_new.id,v_new.version,v_new.row_version,v_new.status;
end
$$;

create or replace function public.b16_list_report_cards(
  p_school_id uuid,
  p_academic_year_id uuid default null,
  p_term_id uuid default null,
  p_status text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(report_card_id uuid, organization_id uuid, school_id uuid, academic_year_id uuid, term_id uuid, student_enrollment_id uuid, student_name text, classroom_id uuid, classroom_name text, business_version integer, row_version bigint, status text, updated_at timestamptz, published_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select rc.id,rc.organization_id,rc.school_id,rc.academic_year_id,rc.term_id,rc.student_enrollment_id,s.full_name,ce.classroom_id,cl.name,rc.version,rc.row_version,rc.status,rc.updated_at,rc.published_at
  from public.report_cards rc
  join public.student_enrollments se on se.id=rc.student_enrollment_id and se.organization_id=rc.organization_id and se.school_id=rc.school_id
  join public.students s on s.id=se.student_id and s.organization_id=rc.organization_id
  left join lateral (select ce.classroom_id from public.class_enrollments ce where ce.student_enrollment_id=se.id and ce.organization_id=rc.organization_id and ce.school_id=rc.school_id and ce.is_primary order by ce.starts_on desc nulls last limit 1) ce on true
  left join public.classrooms cl on cl.id=ce.classroom_id and cl.organization_id=rc.organization_id and cl.school_id=rc.school_id
  where auth.uid() is not null and rc.school_id=p_school_id
    and (p_academic_year_id is null or rc.academic_year_id=p_academic_year_id)
    and (p_term_id is null or rc.term_id=p_term_id)
    and (p_status is null or rc.status=p_status)
    and public.has_staff_scope_permission('report_card.read',rc.organization_id,rc.school_id,ce.classroom_id)
  order by rc.updated_at desc limit greatest(1,least(coalesce(p_limit,100),200)) offset greatest(coalesce(p_offset,0),0)
$$;

create or replace function public.b16_get_report_card(p_report_card_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_card public.report_cards%rowtype; v_classroom uuid; v_student_name text; v_entries jsonb; v_narratives jsonb; v_history jsonb;
begin
  if auth.uid() is null then raise exception 'B16_REPORT_CARD_AUTH_REQUIRED'; end if;
  select * into v_card from public.report_cards rc where rc.id=p_report_card_id;
  if not found then raise exception 'B16_REPORT_CARD_NOT_FOUND'; end if;
  select ce.classroom_id, s.full_name into v_classroom,v_student_name
  from public.student_enrollments se join public.students s on s.id=se.student_id
  left join lateral (select ce2.classroom_id from public.class_enrollments ce2 where ce2.student_enrollment_id=se.id and ce2.is_primary order by ce2.starts_on desc nulls last limit 1) ce on true
  where se.id=v_card.student_enrollment_id and se.organization_id=v_card.organization_id and se.school_id=v_card.school_id;
  if not public.has_staff_scope_permission('report_card.read',v_card.organization_id,v_card.school_id,v_classroom) then raise exception 'B16_REPORT_CARD_FORBIDDEN'; end if;
  select coalesce(jsonb_agg(to_jsonb(e) - 'source_calculation' order by e.subject_id),'[]'::jsonb) into v_entries from public.report_card_subject_entries e where e.report_card_id=v_card.id;
  select coalesce(jsonb_agg(to_jsonb(n) order by n.sequence),'[]'::jsonb) into v_narratives from public.report_card_narratives n where n.report_card_id=v_card.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'version',h.version,'status',h.status,'row_version',h.row_version,'updated_at',h.updated_at,'published_at',h.published_at) order by h.version desc),'[]'::jsonb) into v_history from public.report_cards h where h.student_enrollment_id=v_card.student_enrollment_id and h.term_id=v_card.term_id;
  return jsonb_build_object('card',to_jsonb(v_card),'student_name',v_student_name,'classroom_id',v_classroom,'entries',v_entries,'narratives',v_narratives,'history',v_history);
end
$$;

create or replace function public.b16_list_report_card_candidates(p_school_id uuid,p_academic_year_id uuid default null)
returns table(student_enrollment_id uuid, student_name text, academic_year_id uuid, classroom_id uuid, classroom_name text, has_working_report_card boolean)
language sql stable security definer set search_path = ''
as $$
  select se.id,s.full_name,se.academic_year_id,ce.classroom_id,cl.name,
    exists(select 1 from public.report_cards rc where rc.student_enrollment_id=se.id and rc.status in ('draft','submitted','reviewed'))
  from public.student_enrollments se join public.students s on s.id=se.student_id and s.organization_id=se.organization_id
  left join lateral (select ce2.classroom_id from public.class_enrollments ce2 where ce2.student_enrollment_id=se.id and ce2.organization_id=se.organization_id and ce2.school_id=se.school_id and ce2.status='active' and ce2.is_primary order by ce2.starts_on desc nulls last limit 1) ce on true
  left join public.classrooms cl on cl.id=ce.classroom_id and cl.organization_id=se.organization_id and cl.school_id=se.school_id
  where auth.uid() is not null and se.school_id=p_school_id and se.status='active'
    and (p_academic_year_id is null or se.academic_year_id=p_academic_year_id)
    and public.has_staff_scope_permission('report_card.generate',se.organization_id,se.school_id,ce.classroom_id)
$$;

revoke all on function public.b16_report_card_generate_draft(uuid,uuid,uuid,bigint) from public,anon,service_role;
grant execute on function public.b16_report_card_generate_draft(uuid,uuid,uuid,bigint) to authenticated;
revoke all on function public.b16_report_card_save_content(uuid,bigint,jsonb,uuid) from public,anon,service_role;
grant execute on function public.b16_report_card_save_content(uuid,bigint,jsonb,uuid) to authenticated;
revoke all on function public.b16_report_card_transition(uuid,text,bigint,uuid) from public,anon,service_role;
grant execute on function public.b16_report_card_transition(uuid,text,bigint,uuid) to authenticated;
revoke all on function public.b16_report_card_publish(uuid,bigint,uuid) from public,anon,service_role;
grant execute on function public.b16_report_card_publish(uuid,bigint,uuid) to authenticated;
revoke all on function public.b16_report_card_create_revision(uuid,bigint,text,uuid) from public,anon,service_role;
grant execute on function public.b16_report_card_create_revision(uuid,bigint,text,uuid) to authenticated;
revoke all on function public.b16_list_report_cards(uuid,uuid,uuid,text,integer,integer) from public,anon,service_role;
grant execute on function public.b16_list_report_cards(uuid,uuid,uuid,text,integer,integer) to authenticated;
revoke all on function public.b16_get_report_card(uuid) from public,anon,service_role;
grant execute on function public.b16_get_report_card(uuid) to authenticated;
revoke all on function public.b16_list_report_card_candidates(uuid,uuid) from public,anon,service_role;
grant execute on function public.b16_list_report_card_candidates(uuid,uuid) to authenticated;
