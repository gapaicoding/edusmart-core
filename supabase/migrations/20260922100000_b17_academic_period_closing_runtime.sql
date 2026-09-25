-- EduSmart Core V1 / Batch 17: Academic Period Closing & Historical Integrity.
-- Forward-only workflow, readiness, idempotency, audit, and mutation guards.
begin;

alter table public.academic_years
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by_profile_id uuid references public.profiles(id) on delete restrict,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by_profile_id uuid references public.profiles(id) on delete restrict;
alter table public.terms
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by_profile_id uuid references public.profiles(id) on delete restrict,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by_profile_id uuid references public.profiles(id) on delete restrict;

create table public.academic_period_command_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  command_name text not null check (command_name in ('close_term','close_academic_year','reopen_term','reopen_academic_year')),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  resource_type text not null check (resource_type in ('term','academic_year')),
  resource_id uuid not null,
  status text not null default 'processing' check (status in ('processing','completed')),
  result_payload jsonb,
  created_at timestamptz not null default transaction_timestamp(),
  completed_at timestamptz,
  constraint academic_period_command_requests_scope_fk foreign key (school_id,organization_id)
    references public.schools(id,organization_id) on delete restrict,
  constraint academic_period_command_requests_actor_request_key unique(actor_profile_id,command_name,request_id),
  constraint academic_period_command_requests_result_size_check
    check (result_payload is null or octet_length(result_payload::text) <= 8192),
  constraint academic_period_command_requests_completion_check
    check ((status='processing' and result_payload is null and completed_at is null)
       or (status='completed' and result_payload is not null and completed_at is not null))
);
create index academic_period_command_requests_resource_idx
  on public.academic_period_command_requests(organization_id,school_id,resource_type,resource_id,created_at desc);
alter table public.academic_period_command_requests enable row level security;
alter table public.academic_period_command_requests force row level security;
revoke all on public.academic_period_command_requests from public,anon,authenticated,service_role;

insert into public.permissions(code,domain,action,description) values
  ('term.close','academic','close','Close a ready academic term'),
  ('term.reopen','academic','reopen','Reopen a closed academic term with reason'),
  ('academic_year.close','academic','close','Close a ready academic year'),
  ('academic_year.reopen','academic','reopen','Reopen a closed academic year with reason')
on conflict(code) do update set domain=excluded.domain,action=excluded.action,description=excluded.description;

-- Specific capabilities preserve the existing capability+scope model. Owners
-- receive all new capabilities; school administration and curriculum oversight
-- may close; Principal oversight may also reopen. No role-name checks at runtime.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.organization_id is null and r.code='ORG_OWNER'
  and p.code in ('term.close','term.reopen','academic_year.close','academic_year.reopen')
on conflict(role_id,permission_id) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.organization_id is null and r.code='SCHOOL_ADMIN'
  and p.code in ('term.close','academic_year.close')
on conflict(role_id,permission_id) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.organization_id is null and r.code='PRINCIPAL'
  and p.code in ('term.close','term.reopen','academic_year.close','academic_year.reopen')
on conflict(role_id,permission_id) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.organization_id is null and r.code='VICE_PRINCIPAL_CURRICULUM'
  and p.code in ('term.close','academic_year.close')
on conflict(role_id,permission_id) do nothing;

create or replace function public.b17_authorize_period(p_school_id uuid,p_permission text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='B17_AUTH_REQUIRED'; end if;
  select s.organization_id into v_org from public.schools s where s.id=p_school_id;
  if v_org is null or not public.has_permission(p_permission,v_org,p_school_id,null) then
    raise exception using errcode='42501',message='B17_FORBIDDEN';
  end if;
  return v_org;
end $$;

create or replace function public.b17_term_readiness_internal(p_org uuid,p_school uuid,p_term uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_t public.terms%rowtype; v_year_status text; v_blockers jsonb:='[]'::jsonb; v_warnings jsonb:='[]'::jsonb;
  v_open_attendance bigint; v_incomplete_assessments bigint; v_incomplete_scores bigint; v_incomplete_cards bigint; v_missing_cards bigint;
begin
  select * into v_t from public.terms t where t.id=p_term and t.organization_id=p_org and t.school_id=p_school;
  if not found then raise exception using errcode='P0001',message='B17_PERIOD_NOT_FOUND'; end if;
  select y.status into v_year_status from public.academic_years y
    where y.id=v_t.academic_year_id and y.organization_id=p_org and y.school_id=p_school;
  if v_t.status not in ('active','closed','archived') then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','TERM_NOT_ACTIVE','count',1,'severity','blocker')); end if;
  if v_year_status<>'active' then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','ACADEMIC_YEAR_NOT_ACTIVE','count',1,'severity','blocker')); end if;
  select count(*) into v_open_attendance from public.attendance_sessions s
   where s.organization_id=p_org and s.school_id=p_school and s.term_id=p_term and s.status in ('open','submitted');
  if v_open_attendance>0 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','ATTENDANCE_NOT_FINAL','count',v_open_attendance,'severity','blocker')); end if;
  select count(*) into v_incomplete_assessments from public.assessments a
   where a.organization_id=p_org and a.school_id=p_school and a.term_id=p_term and a.status not in ('published','archived');
  if v_incomplete_assessments>0 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','ASSESSMENTS_NOT_FINAL','count',v_incomplete_assessments,'severity','blocker')); end if;
  select count(*) into v_incomplete_scores from public.assessments a
    join public.teaching_assignments ta on ta.id=a.teaching_assignment_id and ta.organization_id=a.organization_id and ta.school_id=a.school_id
    join public.class_enrollments ce on ce.organization_id=a.organization_id and ce.school_id=a.school_id
      and ce.classroom_id=ta.classroom_id and ce.starts_on<=a.assessment_date and (ce.ends_on is null or ce.ends_on>=a.assessment_date)
    join public.student_enrollments se on se.id=ce.student_enrollment_id and se.organization_id=ce.organization_id and se.school_id=ce.school_id
      and se.academic_year_id=a.academic_year_id and se.enrolled_on<=a.assessment_date and (se.ended_on is null or se.ended_on>=a.assessment_date)
    left join public.student_scores ss on ss.assessment_id=a.id and ss.student_enrollment_id=se.id and ss.organization_id=a.organization_id and ss.school_id=a.school_id
   where a.organization_id=p_org and a.school_id=p_school and a.term_id=p_term and a.status='published'
     and coalesce(ss.status,'missing') not in ('final','excused');
  if v_incomplete_scores>0 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PUBLISHED_ASSESSMENT_SCORES_INCOMPLETE','count',v_incomplete_scores,'severity','blocker')); end if;
  select count(*) into v_incomplete_cards from public.report_cards rc
   where rc.organization_id=p_org and rc.school_id=p_school and rc.term_id=p_term and rc.status in ('draft','submitted','reviewed');
  if v_incomplete_cards>0 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','REPORT_CARDS_INCOMPLETE','count',v_incomplete_cards,'severity','blocker')); end if;
  select count(*) into v_missing_cards from public.student_enrollments se
   where se.organization_id=p_org and se.school_id=p_school
     and se.academic_year_id=v_t.academic_year_id and se.status in ('active','leave')
     and not exists(select 1 from public.report_cards rc where rc.student_enrollment_id=se.id
       and rc.organization_id=p_org and rc.school_id=p_school and rc.term_id=p_term and rc.status in ('published','revised'));
  if v_missing_cards>0 then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','ENROLLMENTS_WITHOUT_PUBLISHED_REPORT_CARD','count',v_missing_cards,'severity','warning')); end if;
  return jsonb_build_object('period_type','term','period_id',v_t.id,'name',v_t.name,'status',v_t.status,
    'academic_year_id',v_t.academic_year_id,'academic_year_status',v_year_status,
    'ready',jsonb_array_length(v_blockers)=0,'blockers',v_blockers,'warnings',v_warnings);
end $$;

create or replace function public.b17_year_readiness_internal(p_org uuid,p_school uuid,p_year uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_y public.academic_years%rowtype; v_blockers jsonb:='[]'::jsonb; v_warnings jsonb:='[]'::jsonb;
  v_unfinal_terms bigint; v_unresolved_progression bigint; v_term_blockers bigint; v_term record; v_term_result jsonb;
  v_missing_cards bigint;
begin
  select * into v_y from public.academic_years y where y.id=p_year and y.organization_id=p_org and y.school_id=p_school;
  if not found then raise exception using errcode='P0001',message='B17_PERIOD_NOT_FOUND'; end if;
  if v_y.status<>'active' then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','ACADEMIC_YEAR_NOT_ACTIVE','count',1,'severity','blocker')); end if;
  select count(*) into v_unfinal_terms from public.terms t where t.organization_id=p_org and t.school_id=p_school
    and t.academic_year_id=p_year and t.status not in ('closed','archived');
  if v_unfinal_terms>0 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','TERMS_NOT_CLOSED','count',v_unfinal_terms,'severity','blocker')); end if;
  if not exists(select 1 from public.terms t where t.organization_id=p_org and t.school_id=p_school and t.academic_year_id=p_year) then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','NO_TERMS_DEFINED','count',1,'severity','blocker'));
  end if;
  select count(*) into v_unresolved_progression from public.progression_batches b
    where b.organization_id=p_org and b.school_id=p_school and p_year in (b.source_academic_year_id,b.target_academic_year_id)
      and b.status in ('draft','in_review','approved');
  if v_unresolved_progression>0 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PROGRESSION_UNRESOLVED','count',v_unresolved_progression,'severity','blocker')); end if;
  v_term_blockers:=0;
  for v_term in select t.id from public.terms t where t.organization_id=p_org and t.school_id=p_school and t.academic_year_id=p_year order by t.id loop
    v_term_result:=public.b17_term_readiness_internal(p_org,p_school,v_term.id);
    if not (v_term_result->>'ready')::boolean then v_term_blockers:=v_term_blockers+jsonb_array_length(v_term_result->'blockers'); end if;
    v_warnings:=v_warnings||(v_term_result->'warnings');
  end loop;
  if v_term_blockers>0 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','TERM_OPERATIONAL_BLOCKERS','count',v_term_blockers,'severity','blocker')); end if;
  select count(*) into v_missing_cards from public.student_enrollments se where se.organization_id=p_org and se.school_id=p_school
    and se.academic_year_id=p_year and se.status in ('active','leave')
    and exists(select 1 from public.terms t where t.organization_id=p_org and t.school_id=p_school and t.academic_year_id=p_year)
    and not exists(select 1 from public.report_cards rc where rc.student_enrollment_id=se.id and rc.organization_id=p_org and rc.school_id=p_school
      and rc.academic_year_id=p_year and rc.status in ('published','revised'));
  if v_missing_cards>0 then v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','ENROLLMENTS_WITHOUT_PUBLISHED_REPORT_CARD','count',v_missing_cards,'severity','warning')); end if;
  return jsonb_build_object('period_type','academic_year','period_id',v_y.id,'name',v_y.name,'status',v_y.status,
    'ready',jsonb_array_length(v_blockers)=0,'blockers',v_blockers,'warnings',v_warnings);
end $$;

create or replace function public.b17_get_term_close_readiness(p_school_id uuid,p_term_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_result jsonb;
begin
  v_org:=public.b17_authorize_period(p_school_id,'term.read');
  v_result:=public.b17_term_readiness_internal(v_org,p_school_id,p_term_id);
  return v_result;
exception when others then
  if sqlerrm='B17_PERIOD_NOT_FOUND' then raise; end if;
  raise;
end $$;

create or replace function public.b17_get_academic_year_close_readiness(p_school_id uuid,p_academic_year_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  v_org:=public.b17_authorize_period(p_school_id,'academic_year.read');
  return public.b17_year_readiness_internal(v_org,p_school_id,p_academic_year_id);
end $$;

create or replace function public.b17_claim_period_command(p_org uuid,p_school uuid,p_request uuid,p_command text,
  p_resource_type text,p_resource uuid,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_row public.academic_period_command_requests%rowtype;
begin
  insert into public.academic_period_command_requests(organization_id,school_id,actor_profile_id,request_id,command_name,
    payload_fingerprint,resource_type,resource_id)
  values(p_org,p_school,v_actor,p_request,p_command,p_fingerprint,p_resource_type,p_resource)
  on conflict(actor_profile_id,command_name,request_id) do nothing;
  select * into v_row from public.academic_period_command_requests c
   where c.actor_profile_id=v_actor and c.command_name=p_command and c.request_id=p_request for update;
  if v_row.organization_id<>p_org or v_row.school_id<>p_school or v_row.resource_type<>p_resource_type
     or v_row.resource_id<>p_resource or v_row.payload_fingerprint<>p_fingerprint then
    raise exception using errcode='P0001',message='B17_REQUEST_CONFLICT';
  end if;
  if v_row.status='completed' then return v_row.result_payload; end if;
  if not exists(select 1 from public.academic_period_command_requests c where c.id=v_row.id
    and mod(txid_current(),4294967296)=c.xmin::text::bigint) then
    raise exception using errcode='P0001',message='B17_REQUEST_CONFLICT';
  end if;
  return null;
end $$;

create or replace function public.b17_finish_period_command(p_request uuid,p_command text,p_result jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.academic_period_command_requests c set status='completed',result_payload=p_result,completed_at=clock_timestamp()
   where c.actor_profile_id=auth.uid() and c.command_name=p_command and c.request_id=p_request and c.status='processing'
     and mod(txid_current(),4294967296)=c.xmin::text::bigint;
  if not found then raise exception using errcode='P0001',message='B17_COMMAND_FINALIZE_FAILED'; end if;
end $$;

create or replace function public.b17_close_term(p_request_id uuid,p_school_id uuid,p_term_id uuid,
  p_expected_updated_at timestamptz,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_t public.terms%rowtype; v_y public.academic_years%rowtype; v_fp text; v_replay jsonb; v_ready jsonb; v_result jsonb;
begin
  v_org:=public.b17_authorize_period(p_school_id,'term.close');
  if p_request_id is null or p_expected_updated_at is null or length(btrim(coalesce(p_reason,'')))>1000
    or (nullif(btrim(coalesce(p_reason,'')),'') is not null and length(btrim(p_reason))<3) then raise exception using errcode='22023',message='B17_INVALID_REQUEST'; end if;
  select y.* into v_y from public.academic_years y join public.terms t on t.academic_year_id=y.id and t.organization_id=y.organization_id and t.school_id=y.school_id
    where t.id=p_term_id and t.organization_id=v_org and t.school_id=p_school_id for share of y;
  if not found then raise exception using errcode='P0001',message='B17_PERIOD_NOT_FOUND'; end if;
  select * into v_t from public.terms t where t.id=p_term_id and t.organization_id=v_org and t.school_id=p_school_id for update;
  if not found then raise exception using errcode='P0001',message='B17_PERIOD_NOT_FOUND'; end if;
  v_fp:=public.b14_command_fingerprint(jsonb_build_object('school_id',p_school_id,'term_id',p_term_id,'expected_updated_at',p_expected_updated_at,'reason',nullif(btrim(p_reason),'')));
  v_replay:=public.b17_claim_period_command(v_org,p_school_id,p_request_id,'close_term','term',p_term_id,v_fp);
  if v_replay is not null then return v_replay; end if;
  if v_t.updated_at<>p_expected_updated_at then raise exception using errcode='P0001',message='B17_STALE_PERIOD'; end if;
  if v_t.status<>'active' or v_y.status<>'active' then raise exception using errcode='P0001',message='B17_INVALID_TRANSITION'; end if;
  v_ready:=public.b17_term_readiness_internal(v_org,p_school_id,p_term_id);
  if not (v_ready->>'ready')::boolean then raise exception using errcode='P0001',message='B17_PERIOD_BLOCKED'; end if;
  update public.terms set status='closed',closed_at=transaction_timestamp(),closed_by_profile_id=auth.uid()
   where id=p_term_id returning * into v_t;
  insert into public.audit_logs(organization_id,school_id,actor_profile_id,actor_type,action,entity_type,entity_id,before_data,after_data,metadata)
  values(v_org,p_school_id,auth.uid(),'user','academic_term_closed','terms',v_t.id,
    jsonb_build_object('status','active','updated_at',p_expected_updated_at),jsonb_build_object('status','closed','closed_at',v_t.closed_at),
    jsonb_build_object('request_id',p_request_id,'reason',nullif(btrim(p_reason),''),'readiness',v_ready));
  v_result:=jsonb_build_object('period_id',v_t.id,'period_type','term','status',v_t.status,'updated_at',v_t.updated_at,'closed_at',v_t.closed_at,'closed_by_profile_id',v_t.closed_by_profile_id);
  perform public.b17_finish_period_command(p_request_id,'close_term',v_result);
  return v_result;
end $$;

create or replace function public.b17_close_academic_year(p_request_id uuid,p_school_id uuid,p_academic_year_id uuid,
  p_expected_updated_at timestamptz,p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_y public.academic_years%rowtype; v_t record; v_fp text; v_replay jsonb; v_ready jsonb; v_result jsonb; v_old_current boolean;
begin
  v_org:=public.b17_authorize_period(p_school_id,'academic_year.close');
  if p_request_id is null or p_expected_updated_at is null or length(btrim(coalesce(p_reason,'')))>1000
    or (nullif(btrim(coalesce(p_reason,'')),'') is not null and length(btrim(p_reason))<3) then raise exception using errcode='22023',message='B17_INVALID_REQUEST'; end if;
  select * into v_y from public.academic_years y where y.id=p_academic_year_id and y.organization_id=v_org and y.school_id=p_school_id for update;
  if not found then raise exception using errcode='P0001',message='B17_PERIOD_NOT_FOUND'; end if;
  v_fp:=public.b14_command_fingerprint(jsonb_build_object('school_id',p_school_id,'academic_year_id',p_academic_year_id,'expected_updated_at',p_expected_updated_at,'reason',nullif(btrim(p_reason),'')));
  v_replay:=public.b17_claim_period_command(v_org,p_school_id,p_request_id,'close_academic_year','academic_year',p_academic_year_id,v_fp);
  if v_replay is not null then return v_replay; end if;
  if v_y.updated_at<>p_expected_updated_at then raise exception using errcode='P0001',message='B17_STALE_PERIOD'; end if;
  if v_y.status<>'active' then raise exception using errcode='P0001',message='B17_INVALID_TRANSITION'; end if;
  v_old_current:=v_y.is_current;
  for v_t in select t.id from public.terms t where t.academic_year_id=p_academic_year_id and t.organization_id=v_org and t.school_id=p_school_id order by t.id for update loop null; end loop;
  v_ready:=public.b17_year_readiness_internal(v_org,p_school_id,p_academic_year_id);
  if not (v_ready->>'ready')::boolean then raise exception using errcode='P0001',message='B17_PERIOD_BLOCKED'; end if;
  update public.academic_years set status='closed',is_current=false,closed_at=transaction_timestamp(),closed_by_profile_id=auth.uid()
   where id=p_academic_year_id returning * into v_y;
  insert into public.audit_logs(organization_id,school_id,actor_profile_id,actor_type,action,entity_type,entity_id,before_data,after_data,metadata)
  values(v_org,p_school_id,auth.uid(),'user','academic_year_closed','academic_years',v_y.id,
    jsonb_build_object('status','active','is_current',v_old_current,'updated_at',p_expected_updated_at),jsonb_build_object('status','closed','is_current',false,'closed_at',v_y.closed_at),
    jsonb_build_object('request_id',p_request_id,'reason',nullif(btrim(p_reason),''),'readiness',v_ready));
  v_result:=jsonb_build_object('period_id',v_y.id,'period_type','academic_year','status',v_y.status,'updated_at',v_y.updated_at,'closed_at',v_y.closed_at,'closed_by_profile_id',v_y.closed_by_profile_id);
  perform public.b17_finish_period_command(p_request_id,'close_academic_year',v_result);
  return v_result;
end $$;

create or replace function public.b17_reopen_term(p_request_id uuid,p_school_id uuid,p_term_id uuid,
  p_expected_updated_at timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_t public.terms%rowtype; v_y public.academic_years%rowtype; v_reason text:=btrim(coalesce(p_reason,'')); v_fp text; v_replay jsonb; v_result jsonb;
begin
  v_org:=public.b17_authorize_period(p_school_id,'term.reopen');
  if p_request_id is null or p_expected_updated_at is null or length(v_reason)<3 or length(v_reason)>1000 then raise exception using errcode='P0001',message='B17_REOPEN_REASON_REQUIRED'; end if;
  select y.* into v_y from public.academic_years y join public.terms t on t.academic_year_id=y.id and t.organization_id=y.organization_id and t.school_id=y.school_id
    where t.id=p_term_id and t.organization_id=v_org and t.school_id=p_school_id for share of y;
  if not found then raise exception using errcode='P0001',message='B17_PERIOD_NOT_FOUND'; end if;
  select * into v_t from public.terms t where t.id=p_term_id and t.organization_id=v_org and t.school_id=p_school_id for update;
  if not found then raise exception using errcode='P0001',message='B17_PERIOD_NOT_FOUND'; end if;
  v_fp:=public.b14_command_fingerprint(jsonb_build_object('school_id',p_school_id,'term_id',p_term_id,'expected_updated_at',p_expected_updated_at,'reason',v_reason));
  v_replay:=public.b17_claim_period_command(v_org,p_school_id,p_request_id,'reopen_term','term',p_term_id,v_fp);
  if v_replay is not null then return v_replay; end if;
  if v_t.updated_at<>p_expected_updated_at then raise exception using errcode='P0001',message='B17_STALE_PERIOD'; end if;
  if v_t.status<>'closed' or v_y.status<>'active' then raise exception using errcode='P0001',message='B17_INVALID_TRANSITION'; end if;
  update public.terms set status='active',reopened_at=transaction_timestamp(),reopened_by_profile_id=auth.uid() where id=p_term_id returning * into v_t;
  insert into public.audit_logs(organization_id,school_id,actor_profile_id,actor_type,action,entity_type,entity_id,before_data,after_data,metadata)
  values(v_org,p_school_id,auth.uid(),'user','academic_term_reopened','terms',v_t.id,jsonb_build_object('status','closed'),jsonb_build_object('status','active','reopened_at',v_t.reopened_at),jsonb_build_object('request_id',p_request_id,'reason',v_reason));
  v_result:=jsonb_build_object('period_id',v_t.id,'period_type','term','status',v_t.status,'updated_at',v_t.updated_at,'reopened_at',v_t.reopened_at);
  perform public.b17_finish_period_command(p_request_id,'reopen_term',v_result); return v_result;
end $$;

create or replace function public.b17_reopen_academic_year(p_request_id uuid,p_school_id uuid,p_academic_year_id uuid,
  p_expected_updated_at timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_y public.academic_years%rowtype; v_reason text:=btrim(coalesce(p_reason,'')); v_fp text; v_replay jsonb; v_result jsonb;
begin
  v_org:=public.b17_authorize_period(p_school_id,'academic_year.reopen');
  if p_request_id is null or p_expected_updated_at is null or length(v_reason)<3 or length(v_reason)>1000 then raise exception using errcode='P0001',message='B17_REOPEN_REASON_REQUIRED'; end if;
  select * into v_y from public.academic_years y where y.id=p_academic_year_id and y.organization_id=v_org and y.school_id=p_school_id for update;
  if not found then raise exception using errcode='P0001',message='B17_PERIOD_NOT_FOUND'; end if;
  v_fp:=public.b14_command_fingerprint(jsonb_build_object('school_id',p_school_id,'academic_year_id',p_academic_year_id,'expected_updated_at',p_expected_updated_at,'reason',v_reason));
  v_replay:=public.b17_claim_period_command(v_org,p_school_id,p_request_id,'reopen_academic_year','academic_year',p_academic_year_id,v_fp);
  if v_replay is not null then return v_replay; end if;
  if v_y.updated_at<>p_expected_updated_at then raise exception using errcode='P0001',message='B17_STALE_PERIOD'; end if;
  if v_y.status<>'closed' then raise exception using errcode='P0001',message='B17_INVALID_TRANSITION'; end if;
  update public.academic_years set status='active',is_current=false,reopened_at=transaction_timestamp(),reopened_by_profile_id=auth.uid() where id=p_academic_year_id returning * into v_y;
  insert into public.audit_logs(organization_id,school_id,actor_profile_id,actor_type,action,entity_type,entity_id,before_data,after_data,metadata)
  values(v_org,p_school_id,auth.uid(),'user','academic_year_reopened','academic_years',v_y.id,jsonb_build_object('status','closed'),jsonb_build_object('status','active','reopened_at',v_y.reopened_at),jsonb_build_object('request_id',p_request_id,'reason',v_reason));
  v_result:=jsonb_build_object('period_id',v_y.id,'period_type','academic_year','status',v_y.status,'updated_at',v_y.updated_at,'reopened_at',v_y.reopened_at);
  perform public.b17_finish_period_command(p_request_id,'reopen_academic_year',v_result); return v_result;
end $$;

-- In-flight ledger rows are created only by the trusted B17 command. This
-- allows only its own lifecycle status update through the period-row guard.
create or replace function public.b17_period_row_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_resource text:=case when tg_table_name='terms' then 'term' else 'academic_year' end;
  v_org uuid; v_school uuid; v_command text; v_year uuid; v_ay record;
begin
  if tg_op='DELETE' then v_id:=old.id; else v_id:=new.id; end if;
  v_org:=case when tg_op='DELETE' then old.organization_id else new.organization_id end;
  v_school:=case when tg_op='DELETE' then old.school_id else new.school_id end;
  if tg_table_name='terms' then
    for v_ay in select y.id,y.status from public.academic_years y
      where y.organization_id=v_org and y.school_id=v_school and y.id in (
        case when tg_op='DELETE' then old.academic_year_id else new.academic_year_id end,
        case when tg_op='UPDATE' then old.academic_year_id else null::uuid end)
      order by y.id for share loop
      if v_ay.status in ('closed','archived') then raise exception using errcode='P0001',message='B17_ACADEMIC_YEAR_CLOSED'; end if;
    end loop;
  end if;
  if tg_op='DELETE' then
    if old.status in ('closed','archived') then raise exception using errcode='P0001',message='B17_PERIOD_CLOSED'; end if;
    return old;
  end if;
  if new.status is distinct from old.status and new.status not in ('draft','active')
     and not (old.status='active' and new.status='closed')
     and not (old.status='closed' and new.status='active') then
    raise exception using errcode='P0001',message='B17_INVALID_TRANSITION';
  end if;
  if old.status in ('closed','archived') or new.status='closed' then
    v_command:=case when old.status='closed' and new.status='active' then 'reopen_'||case when tg_table_name='terms' then 'term' else 'academic_year' end
      when old.status='active' and new.status='closed' then 'close_'||case when tg_table_name='terms' then 'term' else 'academic_year' end else null end;
    if v_command is null or not exists(select 1 from public.academic_period_command_requests c where c.actor_profile_id=auth.uid()
      and c.command_name=v_command and c.resource_type=v_resource and c.resource_id=v_id and c.status='processing'
      and mod(txid_current(),4294967296)=c.xmin::text::bigint) then
      raise exception using errcode='P0001',message='B17_PERIOD_CLOSED';
    end if;
  end if;
  return new;
end $$;
create trigger trg_b17_academic_year_period_guard before update or delete on public.academic_years for each row execute function public.b17_period_row_guard();
create trigger trg_b17_term_period_guard before update or delete on public.terms for each row execute function public.b17_period_row_guard();

create or replace function public.b17_report_card_revision_exception(p_card_id uuid)
returns boolean language sql security definer set search_path = '' as $$
  select exists(select 1 from public.audit_logs a where a.entity_type='report_card' and a.entity_id=p_card_id
      and a.action='report_card_revision_created')
    or exists(select 1 from public.report_card_command_requests c
      join public.report_cards src on src.id=c.report_card_id
      join public.report_cards draft on draft.id=p_card_id
      where c.actor_profile_id=auth.uid() and c.command_name='create_report_card_revision'
        and c.status='processing' and mod(txid_current(),4294967296)=c.xmin::text::bigint
        and draft.student_enrollment_id=src.student_enrollment_id and draft.academic_year_id=src.academic_year_id
        and draft.term_id is not distinct from src.term_id and draft.version=src.version+1 and src.status='published')
$$;

create or replace function public.b17_guard_period_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org uuid; v_school uuid; v_year uuid; v_other_year uuid; v_term uuid; v_card uuid;
  v_allowed boolean:=false; v_status text;
begin
  v_org:=nullif(r->>'organization_id','')::uuid; v_school:=nullif(r->>'school_id','')::uuid;
  if tg_table_name in ('academic_calendar_events','classrooms','teaching_assignments','timetable_entries','timetable_periods','student_enrollments','assessments','report_cards') then
    v_year:=nullif(r->>'academic_year_id','')::uuid; v_term:=nullif(r->>'term_id','')::uuid;
  elsif tg_table_name='class_enrollments' then
    select academic_year_id into v_year from public.student_enrollments where id=nullif(r->>'student_enrollment_id','')::uuid and organization_id=v_org and school_id=v_school;
  elsif tg_table_name='attendance_sessions' then
    v_year:=nullif(r->>'academic_year_id','')::uuid; v_term:=nullif(r->>'term_id','')::uuid;
  elsif tg_table_name='attendance_session_roster_members' then
    select s.academic_year_id,s.term_id into v_year,v_term from public.attendance_sessions s where s.id=nullif(r->>'attendance_session_id','')::uuid and s.organization_id=v_org and s.school_id=v_school;
  elsif tg_table_name='student_attendance_records' then
    select s.academic_year_id,s.term_id into v_year,v_term from public.attendance_sessions s where s.id=nullif(r->>'attendance_session_id','')::uuid and s.organization_id=v_org and s.school_id=v_school;
    v_allowed:=tg_op='UPDATE' and exists(select 1 from public.attendance_command_requests c where c.actor_profile_id=auth.uid()
      and c.command_kind='correct' and c.target_id=case when tg_op='DELETE' then old.id else new.id end and c.completed_at is null
      and mod(txid_current(),4294967296)=c.xmin::text::bigint);
  elsif tg_table_name='student_scores' then
    select a.academic_year_id,a.term_id into v_year,v_term from public.assessments a where a.id=nullif(r->>'assessment_id','')::uuid and a.organization_id=v_org and a.school_id=v_school;
    v_allowed:=tg_op='UPDATE' and exists(select 1 from public.assessment_command_requests c where c.actor_profile_id=auth.uid()
      and c.command_name='correct_final_score' and c.status='completed' and mod(txid_current(),4294967296)=c.xmin::text::bigint);
  elsif tg_table_name='assessment_learning_objectives' then
    select a.academic_year_id,a.term_id,a.organization_id,a.school_id into v_year,v_term,v_org,v_school from public.assessments a where a.id=nullif(r->>'assessment_id','')::uuid;
  elsif tg_table_name='report_card_subject_entries' or tg_table_name='report_card_narratives' then
    v_card:=nullif(r->>'report_card_id','')::uuid;
    select rc.academic_year_id,rc.term_id,rc.organization_id,rc.school_id into v_year,v_term,v_org,v_school from public.report_cards rc where rc.id=v_card;
    v_allowed:=public.b17_report_card_revision_exception(v_card);
  elsif tg_table_name='progression_batches' then
    v_year:=nullif(r->>'source_academic_year_id','')::uuid; v_other_year:=nullif(r->>'target_academic_year_id','')::uuid;
  elsif tg_table_name='progression_decisions' then
    select b.source_academic_year_id,b.target_academic_year_id,b.organization_id,b.school_id into v_year,v_other_year,v_org,v_school from public.progression_batches b where b.id=nullif(r->>'batch_id','')::uuid;
  end if;
  if tg_table_name='report_cards' then
    v_card:=nullif(r->>'id','')::uuid;
    if tg_op='INSERT' then
      v_allowed:=exists(select 1 from public.report_card_command_requests c join public.report_cards src on src.id=c.report_card_id
        where c.actor_profile_id=auth.uid() and c.command_name='create_report_card_revision' and c.status='processing'
          and c.report_card_id is not null and mod(txid_current(),4294967296)=c.xmin::text::bigint
          and src.student_enrollment_id=(r->>'student_enrollment_id')::uuid and src.academic_year_id=(r->>'academic_year_id')::uuid
          and src.term_id is not distinct from nullif(r->>'term_id','')::uuid and (src.version+1)=(r->>'version')::integer and src.status='published');
    elsif tg_op='UPDATE' then
      v_allowed:=public.b17_report_card_revision_exception(v_card)
       or (old.status='published' and new.status='revised' and exists(
          select 1 from public.report_cards draft join public.report_card_command_requests c on c.report_card_id=draft.id
          where draft.student_enrollment_id=old.student_enrollment_id and draft.academic_year_id=old.academic_year_id
            and draft.term_id is not distinct from old.term_id and draft.version=old.version+1 and draft.status='reviewed'
            and c.command_name='publish_report_card' and c.status='processing' and c.actor_profile_id=auth.uid() and mod(txid_current(),4294967296)=c.xmin::text::bigint));
    end if;
    v_year:=nullif(r->>'academic_year_id','')::uuid; v_term:=nullif(r->>'term_id','')::uuid;
  end if;
  if tg_table_name='assessment_learning_objectives' then v_allowed:=false; end if;
  if v_year is not null or v_term is not null then
    if not v_allowed then
      if v_year is not null then
        select y.status into v_status from public.academic_years y where y.id=v_year and y.organization_id=v_org and y.school_id=v_school for share;
        if v_status in ('closed','archived') then raise exception using errcode='P0001',message='B17_ACADEMIC_YEAR_CLOSED'; end if;
      end if;
      if v_term is not null then
        select t.status into v_status from public.terms t where t.id=v_term and t.organization_id=v_org and t.school_id=v_school for share;
        if v_status in ('closed','archived') then raise exception using errcode='P0001',message='B17_TERM_CLOSED'; end if;
      end if;
      if v_other_year is not null and v_other_year is distinct from v_year then
        select y.status into v_status from public.academic_years y where y.id=v_other_year and y.organization_id=v_org and y.school_id=v_school for share;
        if v_status in ('closed','archived') then raise exception using errcode='P0001',message='B17_ACADEMIC_YEAR_CLOSED'; end if;
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create trigger trg_b17_period_lock_calendar before insert or update or delete on public.academic_calendar_events for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_classrooms before insert or update or delete on public.classrooms for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_assignments before insert or update or delete on public.teaching_assignments for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_timetable before insert or update or delete on public.timetable_entries for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_timetable_periods before insert or update or delete on public.timetable_periods for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_enrollments before insert or update or delete on public.student_enrollments for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_class_enrollments before insert or update or delete on public.class_enrollments for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_attendance_sessions before insert or update or delete on public.attendance_sessions for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_attendance_roster before insert or update or delete on public.attendance_session_roster_members for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_attendance_records before insert or update or delete on public.student_attendance_records for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_assessments before insert or update or delete on public.assessments for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_assessment_objectives before insert or update or delete on public.assessment_learning_objectives for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_scores before insert or update or delete on public.student_scores for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_report_cards before insert or update or delete on public.report_cards for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_report_subjects before insert or update or delete on public.report_card_subject_entries for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_report_narratives before insert or update or delete on public.report_card_narratives for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_progression_batches before insert or update or delete on public.progression_batches for each row execute function public.b17_guard_period_mutation();
create trigger trg_b17_period_lock_progression_decisions before insert or update or delete on public.progression_decisions for each row execute function public.b17_guard_period_mutation();

revoke all on function public.b17_authorize_period(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.b17_term_readiness_internal(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.b17_year_readiness_internal(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.b17_claim_period_command(uuid,uuid,uuid,text,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.b17_finish_period_command(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.b17_period_row_guard() from public,anon,authenticated,service_role;
revoke all on function public.b17_guard_period_mutation() from public,anon,authenticated,service_role;
revoke all on function public.b17_report_card_revision_exception(uuid) from public,anon,authenticated,service_role;
revoke all on function public.b17_get_term_close_readiness(uuid,uuid) from public,anon,service_role;
revoke all on function public.b17_get_academic_year_close_readiness(uuid,uuid) from public,anon,service_role;
revoke all on function public.b17_close_term(uuid,uuid,uuid,timestamptz,text) from public,anon,service_role;
revoke all on function public.b17_close_academic_year(uuid,uuid,uuid,timestamptz,text) from public,anon,service_role;
revoke all on function public.b17_reopen_term(uuid,uuid,uuid,timestamptz,text) from public,anon,service_role;
revoke all on function public.b17_reopen_academic_year(uuid,uuid,uuid,timestamptz,text) from public,anon,service_role;
grant execute on function public.b17_get_term_close_readiness(uuid,uuid) to authenticated;
grant execute on function public.b17_get_academic_year_close_readiness(uuid,uuid) to authenticated;
grant execute on function public.b17_close_term(uuid,uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.b17_close_academic_year(uuid,uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.b17_reopen_term(uuid,uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.b17_reopen_academic_year(uuid,uuid,uuid,timestamptz,text) to authenticated;

comment on table public.academic_period_command_requests is 'B17 bounded idempotency ledger for scoped academic period close/reopen commands. No user content is stored.';
commit;
