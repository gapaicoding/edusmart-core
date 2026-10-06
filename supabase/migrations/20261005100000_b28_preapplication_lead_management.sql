-- B28 school-scoped pre-application inquiries. Formal applications remain B18-owned.
create table public.admission_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  admission_cycle_id uuid,
  prospect_name text not null check (char_length(btrim(prospect_name)) between 1 and 200),
  contact_name text check (contact_name is null or char_length(btrim(contact_name)) between 1 and 200),
  phone text check (phone is null or char_length(phone) <= 64),
  email text check (email is null or char_length(email) <= 320),
  phone_normalized text generated always as (nullif(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), '')) stored,
  email_normalized text generated always as (nullif(lower(btrim(coalesce(email,''))), '')) stored,
  source text not null check (source in ('WALK_IN','REFERRAL','SOCIAL_MEDIA','WEBSITE','EVENT','OTHER')),
  source_other text,
  contact_channel text not null check (contact_channel in ('WHATSAPP','PHONE','EMAIL','IN_PERSON','OTHER')),
  channel_other text,
  status text not null default 'NEW' check (status in ('NEW','CONTACTED','QUALIFIED','CONVERTED','CLOSED')),
  assigned_profile_id uuid references public.profiles(id) on delete restrict,
  next_action_at timestamptz,
  linked_application_id uuid,
  row_version bigint not null default 1 check (row_version > 0),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  constraint admission_leads_scope_key unique (id, organization_id, school_id),
  constraint admission_leads_school_fk foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint admission_leads_cycle_fk foreign key (admission_cycle_id, organization_id, school_id)
    references public.admission_cycles(id, organization_id, school_id) on delete restrict,
  constraint admission_leads_application_fk foreign key (linked_application_id, organization_id, school_id)
    references public.admission_applications(id, organization_id, school_id) on delete restrict,
  constraint admission_leads_source_other_check check ((source='OTHER') = (source_other is not null)),
  constraint admission_leads_channel_other_check check ((contact_channel='OTHER') = (channel_other is not null)),
  constraint admission_leads_contact_check check (phone is not null or email is not null or contact_channel='IN_PERSON')
);
create unique index admission_leads_application_once on public.admission_leads(linked_application_id) where linked_application_id is not null;
create index admission_leads_queue_idx on public.admission_leads(organization_id,school_id,status,created_at desc);
create index admission_leads_owner_idx on public.admission_leads(organization_id,school_id,assigned_profile_id,status,next_action_at);
create index admission_leads_phone_local_idx on public.admission_leads(organization_id,school_id,phone_normalized) where phone_normalized is not null;
create index admission_leads_email_local_idx on public.admission_leads(organization_id,school_id,email_normalized) where email_normalized is not null;

create table public.admission_lead_activities (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, school_id uuid not null,
  lead_id uuid not null, actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in ('CREATED','UPDATED','STATUS_CHANGED','ASSIGNED','UNASSIGNED','NEXT_ACTION_CHANGED','NOTE_ADDED','CONVERTED','CLOSED')),
  note text check (note is null or char_length(btrim(note)) between 1 and 1000),
  before_status text, after_status text, occurred_at timestamptz not null default transaction_timestamp(),
  constraint admission_lead_activities_lead_fk foreign key (lead_id,organization_id,school_id)
    references public.admission_leads(id,organization_id,school_id) on delete restrict,
  constraint admission_lead_activity_note_check check ((event_type='NOTE_ADDED') = (note is not null))
);
create index admission_lead_activities_timeline_idx on public.admission_lead_activities(lead_id,occurred_at,id);

create table public.admission_lead_command_requests (
  id uuid primary key default gen_random_uuid(), actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null, school_id uuid not null, lead_id uuid,
  request_id uuid not null, command text not null,
  semantic_fingerprint text not null check (char_length(semantic_fingerprint) between 1 and 256),
  result_payload jsonb, created_at timestamptz not null default transaction_timestamp(),
  constraint admission_lead_command_actor_request unique(actor_profile_id,request_id),
  constraint admission_lead_command_school_fk foreign key(school_id,organization_id)
    references public.schools(id,organization_id) on delete restrict,
  constraint admission_lead_command_lead_fk foreign key(lead_id,organization_id,school_id)
    references public.admission_leads(id,organization_id,school_id) on delete restrict,
  constraint admission_lead_command_result_bound check(result_payload is null or octet_length(result_payload::text)<=16384)
);
create index admission_lead_commands_scope_idx on public.admission_lead_command_requests(organization_id,school_id,created_at desc);

create or replace function public.b28_touch_admission_lead()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.id<>old.id or new.organization_id<>old.organization_id or new.school_id<>old.school_id
     or new.created_by_profile_id<>old.created_by_profile_id or new.created_at<>old.created_at then
    raise exception 'B28_LEAD_IMMUTABLE_FIELDS';
  end if;
  new.row_version:=old.row_version+1; new.updated_at:=transaction_timestamp(); return new;
end $$;
create trigger trg_b28_admission_lead_touch before update on public.admission_leads
for each row execute function public.b28_touch_admission_lead();

create or replace function public.b28_validate_lead_assignee()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.assigned_profile_id is not null and not exists(
   select 1 from public.staff_members sm join public.staff_school_assignments ssa
     on ssa.staff_member_id=sm.id and ssa.organization_id=sm.organization_id
   join public.profiles pr on pr.id=sm.profile_id
   join public.organization_memberships om on om.organization_id=sm.organization_id and om.profile_id=sm.profile_id and om.status='active'
   join public.membership_school_access msa on msa.membership_id=om.id and msa.organization_id=om.organization_id
   where sm.organization_id=new.organization_id and sm.profile_id=new.assigned_profile_id and sm.status='active'
     and pr.status='active' and ssa.school_id=new.school_id and ssa.status='active'
     and ssa.employment_status='active' and (ssa.left_on is null or ssa.left_on>=current_date)
     and msa.school_id=new.school_id and msa.status='active'
 ) then raise exception 'B28_LEAD_ASSIGNEE_INVALID'; end if;
 return new;
end $$;
create trigger trg_b28_admission_lead_assignee before insert or update of assigned_profile_id on public.admission_leads
for each row execute function public.b28_validate_lead_assignee();

create or replace function public.b28_reject_lead_activity_mutation()
returns trigger language plpgsql set search_path='' as $$ begin raise exception 'B28_LEAD_ACTIVITY_APPEND_ONLY'; end $$;
create trigger trg_b28_lead_activity_append_only before update or delete on public.admission_lead_activities
for each row execute function public.b28_reject_lead_activity_mutation();

alter table public.admission_leads enable row level security;
alter table public.admission_leads force row level security;
alter table public.admission_lead_activities enable row level security;
alter table public.admission_lead_activities force row level security;
alter table public.admission_lead_command_requests enable row level security;
alter table public.admission_lead_command_requests force row level security;
create policy b28_admission_leads_read on public.admission_leads for select to authenticated
 using(public.has_permission('admission.lead.read',organization_id,school_id));
create policy b28_admission_lead_activities_read on public.admission_lead_activities for select to authenticated
 using(public.has_permission('admission.lead.read',organization_id,school_id));
revoke all on public.admission_leads,public.admission_lead_activities,public.admission_lead_command_requests from public,anon,authenticated,service_role;

insert into public.permissions(code,domain,action,description) values
 ('admission.lead.read','admission','lead_read','Read scoped pre-application leads'),
 ('admission.lead.manage','admission','lead_manage','Manage scoped pre-application leads'),
 ('admission.lead.convert','admission','lead_convert','Convert qualified scoped leads to formal applications')
on conflict(code) do update set domain=excluded.domain,action=excluded.action,description=excluded.description;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.organization_id is null and r.code in ('ORG_OWNER','PRINCIPAL','SCHOOL_ADMIN')
 and p.code in ('admission.lead.read','admission.lead.manage','admission.lead.convert')
on conflict(role_id,permission_id) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.organization_id is null and r.code='VICE_PRINCIPAL_CURRICULUM' and p.code='admission.lead.read'
on conflict(role_id,permission_id) do nothing;

create or replace function public.b28_lead_projection(p_lead_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',l.id,'admission_cycle_id',l.admission_cycle_id,'prospect_name',l.prospect_name,
 'contact_name',l.contact_name,'phone',l.phone,'email',l.email,'source',l.source,'source_other',l.source_other,
 'contact_channel',l.contact_channel,'channel_other',l.channel_other,'status',l.status,
 'assigned_profile_id',l.assigned_profile_id,'next_action_at',l.next_action_at,
 'linked_application_id',l.linked_application_id,'row_version',l.row_version,'created_at',l.created_at,
 'activities',coalesce((select jsonb_agg(jsonb_build_object('event_type',a.event_type,'note',a.note,'before_status',a.before_status,'after_status',a.after_status,'occurred_at',a.occurred_at) order by a.occurred_at,a.id) from public.admission_lead_activities a where a.lead_id=l.id),'[]'::jsonb))
 from public.admission_leads l where l.id=p_lead_id and public.has_permission('admission.lead.read',l.organization_id,l.school_id)
$$;

create or replace function public.b28_list_admission_leads(
 p_school_id uuid,p_status text default null,p_source text default null,p_channel text default null,
 p_assignee uuid default null,p_unassigned boolean default false,p_search text default null,
 p_limit integer default 50,p_offset integer default 0,p_action_filter text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_q text:=nullif(btrim(p_search),''); v_items jsonb; v_counts jsonb;
begin
 select organization_id into v_org from public.schools where id=p_school_id;
 if v_org is null or not public.has_permission('admission.lead.read',v_org,p_school_id) then raise exception 'B28_LEAD_NOT_FOUND'; end if;
 if p_status is not null and p_status not in ('NEW','CONTACTED','QUALIFIED','CONVERTED','CLOSED') then raise exception 'B28_LEAD_VALIDATION_FAILED'; end if;
 if p_source is not null and p_source not in ('WALK_IN','REFERRAL','SOCIAL_MEDIA','WEBSITE','EVENT','OTHER') then raise exception 'B28_LEAD_VALIDATION_FAILED'; end if;
 if p_channel is not null and p_channel not in ('WHATSAPP','PHONE','EMAIL','IN_PERSON','OTHER') then raise exception 'B28_LEAD_VALIDATION_FAILED'; end if;
 if p_action_filter is not null and p_action_filter not in ('OVERDUE','UPCOMING') then raise exception 'B28_LEAD_VALIDATION_FAILED'; end if;
 if v_q is not null and char_length(v_q) not between 2 and 100 then raise exception 'B28_LEAD_VALIDATION_FAILED'; end if;
 select jsonb_build_object('NEW',count(*) filter(where status='NEW'),'CONTACTED',count(*) filter(where status='CONTACTED'),
 'QUALIFIED',count(*) filter(where status='QUALIFIED'),'CONVERTED',count(*) filter(where status='CONVERTED'),
 'CLOSED',count(*) filter(where status='CLOSED')) into v_counts from public.admission_leads where organization_id=v_org and school_id=p_school_id;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_items from (
   select id,prospect_name,contact_name,source,source_other,contact_channel,channel_other,status,
     assigned_profile_id,next_action_at,row_version,created_at,linked_application_id
   from public.admission_leads where organization_id=v_org and school_id=p_school_id
     and (p_status is null or status=p_status) and (p_source is null or source=p_source)
     and (p_channel is null or contact_channel=p_channel)
     and (not p_unassigned or assigned_profile_id is null) and (p_assignee is null or assigned_profile_id=p_assignee)
     and (p_action_filter is null or (p_action_filter='OVERDUE' and next_action_at<now()) or (p_action_filter='UPCOMING' and next_action_at between now() and now()+interval '7 days'))
     and (v_q is null or prospect_name ilike '%'||v_q||'%'
       or (length(regexp_replace(v_q,'[^0-9]','','g'))>0 and coalesce(phone_normalized,'') like '%'||regexp_replace(v_q,'[^0-9]','','g')||'%')
       or coalesce(email_normalized,'') like '%'||lower(v_q)||'%')
   order by created_at desc limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0)
 ) q;
 return jsonb_build_object('items',v_items,'counts',v_counts);
end $$;

create or replace function public.b28_get_admission_lead(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_school uuid;
begin
 select organization_id,school_id into v_org,v_school from public.admission_leads where id=p_lead_id;
 if not found or not public.has_permission('admission.lead.read',v_org,v_school) then raise exception 'B28_LEAD_NOT_FOUND'; end if;
 return public.b28_lead_projection(p_lead_id);
end $$;

create or replace function public.b28_list_lead_assignees(p_school_id uuid)
returns table(profile_id uuid,full_name text) language plpgsql security definer set search_path='' as $$
declare v_org uuid;
begin
 select organization_id into v_org from public.schools where id=p_school_id;
 if v_org is null or not public.has_permission('admission.lead.manage',v_org,p_school_id) then raise exception 'B28_LEAD_NOT_FOUND'; end if;
 return query select distinct pr.id,pr.full_name from public.staff_members sm
 join public.staff_school_assignments ssa on ssa.staff_member_id=sm.id and ssa.organization_id=sm.organization_id
 join public.profiles pr on pr.id=sm.profile_id
 join public.organization_memberships om on om.organization_id=sm.organization_id and om.profile_id=sm.profile_id and om.status='active'
 join public.membership_school_access msa on msa.membership_id=om.id and msa.organization_id=om.organization_id
 where sm.organization_id=v_org and sm.status='active' and pr.status='active' and ssa.school_id=p_school_id
  and ssa.status='active' and ssa.employment_status='active' and (ssa.left_on is null or ssa.left_on>=current_date)
  and msa.school_id=p_school_id and msa.status='active' order by pr.full_name;
end $$;

create or replace function public.b28_find_lead_duplicates(p_school_id uuid,p_phone text default null,p_email text default null,p_exclude_lead_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_phone text:=nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),''); v_email text:=nullif(lower(btrim(coalesce(p_email,''))),'' ); v_items jsonb;
begin
 select organization_id into v_org from public.schools where id=p_school_id;
 if v_org is null or not public.has_permission('admission.lead.read',v_org,p_school_id) then raise exception 'B28_LEAD_NOT_FOUND'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'prospect_name',prospect_name,'status',status,'created_at',created_at)),'[]'::jsonb) into v_items
 from (select id,prospect_name,status,created_at from public.admission_leads where organization_id=v_org and school_id=p_school_id
  and id is distinct from p_exclude_lead_id
  and ((v_phone is not null and phone_normalized=v_phone) or (v_email is not null and email_normalized=v_email))
  order by created_at desc limit 10) x;
 return v_items;
end $$;

create or replace function public.b28_create_admission_lead(p_school_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_id uuid:=gen_random_uuid(); v_fp text; v_old record; v_result jsonb; v_uid uuid:=auth.uid();
begin
 select organization_id into v_org from public.schools where id=p_school_id;
 if v_uid is null or v_org is null or not public.has_permission('admission.lead.manage',v_org,p_school_id) then raise exception 'B28_LEAD_FORBIDDEN'; end if;
 if p_request_id is null or jsonb_typeof(p_payload)<>'object' then raise exception 'B28_LEAD_VALIDATION_FAILED'; end if;
 v_fp:=md5(concat(p_school_id,'|',p_payload::text));
 select semantic_fingerprint,result_payload into v_old from public.admission_lead_command_requests where actor_profile_id=v_uid and request_id=p_request_id for update;
 if found then if v_old.semantic_fingerprint<>v_fp then raise exception 'B28_LEAD_REQUEST_CONFLICT'; end if; if v_old.result_payload is not null then return v_old.result_payload; end if; raise exception 'B28_LEAD_REQUEST_CONFLICT'; end if;
 insert into public.admission_lead_command_requests(actor_profile_id,organization_id,school_id,lead_id,request_id,command,semantic_fingerprint)
 values(v_uid,v_org,p_school_id,null,p_request_id,'create',v_fp);
 if char_length(btrim(coalesce(p_payload->>'prospect_name',''))) not between 1 and 200
  or char_length(coalesce(p_payload->>'contact_name',''))>200 or char_length(coalesce(p_payload->>'phone',''))>64
  or char_length(coalesce(p_payload->>'email',''))>320 or (nullif(p_payload->>'phone','') is null and nullif(p_payload->>'email','') is null and p_payload->>'contact_channel'<>'IN_PERSON')
  or (nullif(p_payload->>'email','') is not null and p_payload->>'email' !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  or (nullif(p_payload->>'phone','') is not null and length(regexp_replace(p_payload->>'phone','[^0-9]','','g'))<7)
 then raise exception 'B28_LEAD_VALIDATION_FAILED'; end if;
 if p_payload->>'source' not in ('WALK_IN','REFERRAL','SOCIAL_MEDIA','WEBSITE','EVENT','OTHER') or p_payload->>'contact_channel' not in ('WHATSAPP','PHONE','EMAIL','IN_PERSON','OTHER') then raise exception 'B28_LEAD_VALIDATION_FAILED'; end if;
 insert into public.admission_leads(id,organization_id,school_id,admission_cycle_id,prospect_name,contact_name,phone,email,source,source_other,contact_channel,channel_other,assigned_profile_id,next_action_at,created_by_profile_id)
 values(v_id,v_org,p_school_id,nullif(p_payload->>'admission_cycle_id','')::uuid,btrim(p_payload->>'prospect_name'),nullif(btrim(p_payload->>'contact_name'),''),nullif(btrim(p_payload->>'phone'),''),nullif(lower(btrim(p_payload->>'email')),''),p_payload->>'source',nullif(btrim(p_payload->>'source_other'),''),p_payload->>'contact_channel',nullif(btrim(p_payload->>'channel_other'),''),nullif(p_payload->>'assigned_profile_id','')::uuid,nullif(p_payload->>'next_action_at','')::timestamptz,v_uid);
 insert into public.admission_lead_activities(organization_id,school_id,lead_id,actor_profile_id,event_type) values(v_org,p_school_id,v_id,v_uid,'CREATED');
 v_result:=jsonb_build_object('lead_id',v_id,'status','NEW','row_version',1);
 update public.admission_lead_command_requests set lead_id=v_id,result_payload=v_result where actor_profile_id=v_uid and request_id=p_request_id;
 return v_result;
end $$;

create or replace function public.b28_admission_lead_command(p_lead_id uuid,p_expected_row_version bigint,p_request_id uuid,p_command text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.admission_leads%rowtype; v_uid uuid:=auth.uid(); v_fp text; v_old record; v_event text; v_target text; v_result jsonb;
begin
 select * into l from public.admission_leads where id=p_lead_id for update;
 if not found or not public.has_permission('admission.lead.manage',l.organization_id,l.school_id) then raise exception 'B28_LEAD_NOT_FOUND'; end if;
 if v_uid is null or p_request_id is null or p_payload is null then raise exception 'B28_LEAD_VALIDATION_FAILED'; end if;
 v_fp:=md5(concat(p_lead_id,'|',p_expected_row_version,'|',p_command,'|',p_payload::text));
 select semantic_fingerprint,result_payload into v_old from public.admission_lead_command_requests where actor_profile_id=v_uid and request_id=p_request_id for update;
 if found then if v_old.semantic_fingerprint<>v_fp then raise exception 'B28_LEAD_REQUEST_CONFLICT'; end if; if v_old.result_payload is not null then return v_old.result_payload; end if; raise exception 'B28_LEAD_REQUEST_CONFLICT'; end if;
 if p_expected_row_version is null or l.row_version<>p_expected_row_version then raise exception 'B28_LEAD_STALE_VERSION'; end if;
 insert into public.admission_lead_command_requests(actor_profile_id,organization_id,school_id,lead_id,request_id,command,semantic_fingerprint)
 values(v_uid,l.organization_id,l.school_id,l.id,p_request_id,p_command,v_fp);
 if l.status in ('CONVERTED','CLOSED') then raise exception 'B28_LEAD_INVALID_STATE'; end if;
 if p_command='update' then
   if (nullif(p_payload->>'email','') is not null and p_payload->>'email' !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or (nullif(p_payload->>'phone','') is not null and length(regexp_replace(p_payload->>'phone','[^0-9]','','g'))<7)
    or char_length(coalesce(p_payload->>'prospect_name',l.prospect_name)) not between 1 and 200 then raise exception 'B28_LEAD_VALIDATION_FAILED'; end if;
   update public.admission_leads set prospect_name=coalesce(nullif(btrim(p_payload->>'prospect_name'),''),prospect_name),contact_name=nullif(btrim(coalesce(p_payload->>'contact_name',contact_name)),''),phone=nullif(btrim(coalesce(p_payload->>'phone',phone)),''),email=nullif(lower(btrim(coalesce(p_payload->>'email',email))),''),source=coalesce(p_payload->>'source',source),source_other=nullif(btrim(coalesce(p_payload->>'source_other',source_other)),''),contact_channel=coalesce(p_payload->>'contact_channel',contact_channel),channel_other=nullif(btrim(coalesce(p_payload->>'channel_other',channel_other)),''),admission_cycle_id=coalesce(nullif(p_payload->>'admission_cycle_id','')::uuid,admission_cycle_id) where id=l.id;
   v_event:='UPDATED';
 elsif p_command='contact' then if l.status<>'NEW' then raise exception 'B28_LEAD_INVALID_STATE'; end if; update public.admission_leads set status='CONTACTED' where id=l.id; v_event:='STATUS_CHANGED';
 elsif p_command='qualify' then if l.status<>'CONTACTED' then raise exception 'B28_LEAD_INVALID_STATE'; end if; update public.admission_leads set status='QUALIFIED' where id=l.id; v_event:='STATUS_CHANGED';
 elsif p_command='close' then update public.admission_leads set status='CLOSED' where id=l.id; v_event:='CLOSED';
 elsif p_command='assign' then update public.admission_leads set assigned_profile_id=nullif(p_payload->>'assigned_profile_id','')::uuid where id=l.id; v_event:=case when nullif(p_payload->>'assigned_profile_id','') is null then 'UNASSIGNED' else 'ASSIGNED' end;
 elsif p_command='next_action' then update public.admission_leads set next_action_at=nullif(p_payload->>'next_action_at','')::timestamptz where id=l.id; v_event:='NEXT_ACTION_CHANGED';
 elsif p_command='note' then if char_length(btrim(coalesce(p_payload->>'note',''))) not between 1 and 1000 then raise exception 'B28_LEAD_VALIDATION_FAILED'; end if; v_event:='NOTE_ADDED';
 else raise exception 'B28_LEAD_VALIDATION_FAILED'; end if;
 if v_event='NOTE_ADDED' then insert into public.admission_lead_activities(organization_id,school_id,lead_id,actor_profile_id,event_type,note) values(l.organization_id,l.school_id,l.id,v_uid,v_event,btrim(p_payload->>'note'));
 else insert into public.admission_lead_activities(organization_id,school_id,lead_id,actor_profile_id,event_type,before_status,after_status) values(l.organization_id,l.school_id,l.id,v_uid,v_event,l.status,(select status from public.admission_leads where id=l.id)); end if;
 v_result:=jsonb_build_object('lead_id',l.id,'status',(select status from public.admission_leads where id=l.id),'row_version',(select row_version from public.admission_leads where id=l.id));
 update public.admission_lead_command_requests set result_payload=v_result where actor_profile_id=v_uid and request_id=p_request_id; return v_result;
end $$;

-- Private B18 staff-entry submission boundary. This preserves B18's submitted
-- state, guardian, formal consent, request ledger, and stage-history contracts.
create or replace function public.b18_submit_staff_admission_application(p_admission_cycle_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c record; v_uid uuid:=auth.uid(); v_existing record; v_app uuid:=gen_random_uuid(); v_number text; v_grade uuid; v_fp text; v_result jsonb;
begin
 select cy.*,ay.status as year_status into c from public.admission_cycles cy join public.academic_years ay on ay.id=cy.academic_year_id and ay.organization_id=cy.organization_id and ay.school_id=cy.school_id where cy.id=p_admission_cycle_id for update of cy;
 if not found or v_uid is null or not public.has_permission('admission.lead.convert',c.organization_id,c.school_id) then raise exception 'B28_LEAD_NOT_FOUND'; end if;
 if c.status<>'open' or c.year_status in ('closed','archived') or (c.opens_at is not null and now()<c.opens_at) or (c.closes_at is not null and now()>c.closes_at) then raise exception 'B28_LEAD_CYCLE_INVALID'; end if;
 v_grade:=nullif(p_payload->>'target_grade_level_id','')::uuid;
 if v_grade is null or not exists(select 1 from public.grade_levels where id=v_grade and organization_id=c.organization_id and school_id=c.school_id and is_active)
  or p_payload->>'consent_confirmed' is distinct from 'true'
  or char_length(btrim(coalesce(p_payload->>'applicant_full_name',''))) not between 1 and 200
  or char_length(btrim(coalesce(p_payload->>'guardian_name',''))) not between 1 and 200
  or char_length(btrim(coalesce(p_payload->>'guardian_relationship',''))) not between 1 and 80
  or char_length(coalesce(p_payload->>'policy_version','')) not between 1 and 128 then raise exception 'B28_LEAD_CONSENT_OR_APPLICATION_INVALID'; end if;
 if p_request_id is null or p_payload is null then raise exception 'B28_LEAD_VALIDATION_FAILED'; end if;
 v_fp:=md5(concat(p_admission_cycle_id,'|',p_payload::text));
 select semantic_fingerprint,result_payload into v_existing from public.admission_command_requests where request_id=p_request_id for update;
 if found then if v_existing.semantic_fingerprint<>v_fp then raise exception 'B28_LEAD_REQUEST_CONFLICT'; end if; if v_existing.status='completed' then return v_existing.result_payload; end if; raise exception 'B28_LEAD_REQUEST_CONFLICT'; end if;
 insert into public.admission_command_requests(actor_kind,actor_profile_id,organization_id,school_id,command,request_id,semantic_fingerprint,status)
 values('staff',v_uid,c.organization_id,c.school_id,'submit_application',p_request_id,v_fp,'started');
 v_number:='B28-'||upper(substr(replace(v_app::text,'-',''),1,12));
 insert into public.admission_applications(id,organization_id,school_id,admission_cycle_id,target_academic_year_id,target_grade_level_id,application_number,status,applicant_full_name,applicant_email,applicant_phone,submission_note,submitted_at)
 values(v_app,c.organization_id,c.school_id,c.id,c.academic_year_id,v_grade,v_number,'submitted',btrim(p_payload->>'applicant_full_name'),nullif(btrim(p_payload->>'applicant_email'),''),nullif(btrim(p_payload->>'applicant_phone'),''),'Created from a qualified admissions inquiry.',now());
 insert into public.admission_application_guardians(organization_id,school_id,application_id,full_name,relationship,phone,email,is_primary)
 values(c.organization_id,c.school_id,v_app,btrim(p_payload->>'guardian_name'),btrim(p_payload->>'guardian_relationship'),nullif(btrim(p_payload->>'applicant_phone'),''),nullif(btrim(p_payload->>'applicant_email'),''),true);
 insert into public.admission_consents(organization_id,school_id,application_id,policy_version,consented_at,consent_source)
 values(c.organization_id,c.school_id,v_app,btrim(p_payload->>'policy_version'),now(),'staff_entry');
 insert into public.admission_stage_history(organization_id,school_id,application_id,from_status,to_status,actor_kind,actor_profile_id,request_id)
 values(c.organization_id,c.school_id,v_app,null,'submitted','staff',v_uid,p_request_id);
 v_result:=jsonb_build_object('application_id',v_app,'application_reference',v_number,'status','submitted','cycle_id',c.id,'cycle_name',c.name);
 update public.admission_command_requests set status='completed',completed_at=now(),result_payload=v_result where request_id=p_request_id;
 insert into public.audit_logs(organization_id,school_id,actor_profile_id,actor_type,action,entity_type,entity_id,after_data,metadata)
 values(c.organization_id,c.school_id,v_uid,'user','admission_application_submitted','admission_application',v_app,jsonb_build_object('status','submitted'),jsonb_build_object('actor_kind','staff','request_id',p_request_id,'source','preapplication_lead'));
 return v_result;
end $$;

create or replace function public.b28_convert_admission_lead(p_lead_id uuid,p_expected_row_version bigint,p_request_id uuid,p_application jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.admission_leads%rowtype; v_uid uuid:=auth.uid(); v_fp text; v_old record; v_application jsonb; v_submitted jsonb; v_app_id uuid; v_result jsonb;
begin
 select * into l from public.admission_leads where id=p_lead_id for update;
 if not found or not public.has_permission('admission.lead.convert',l.organization_id,l.school_id) then raise exception 'B28_LEAD_NOT_FOUND'; end if;
 if v_uid is null or p_request_id is null or jsonb_typeof(p_application)<>'object' then raise exception 'B28_LEAD_VALIDATION_FAILED'; end if;
 v_fp:=md5(concat(p_lead_id,'|',p_expected_row_version,'|',p_application::text));
 select semantic_fingerprint,result_payload into v_old from public.admission_lead_command_requests where actor_profile_id=v_uid and request_id=p_request_id for update;
 if found then if v_old.semantic_fingerprint<>v_fp then raise exception 'B28_LEAD_REQUEST_CONFLICT'; end if; if v_old.result_payload is not null then return v_old.result_payload; end if; raise exception 'B28_LEAD_REQUEST_CONFLICT'; end if;
 if l.row_version<>p_expected_row_version then raise exception 'B28_LEAD_STALE_VERSION'; end if;
 if l.status<>'QUALIFIED' then raise exception 'B28_LEAD_INVALID_STATE'; end if;
 insert into public.admission_lead_command_requests(actor_profile_id,organization_id,school_id,lead_id,request_id,command,semantic_fingerprint)
 values(v_uid,l.organization_id,l.school_id,l.id,p_request_id,'convert',v_fp);
 v_application:=p_application||jsonb_build_object('applicant_full_name',l.prospect_name,'applicant_phone',l.phone,'applicant_email',l.email);
 v_submitted:=public.b18_submit_staff_admission_application(nullif(p_application->>'admission_cycle_id','')::uuid,p_request_id,v_application);
 v_app_id:=(v_submitted->>'application_id')::uuid;
 update public.admission_leads set status='CONVERTED',linked_application_id=v_app_id where id=l.id;
 insert into public.admission_lead_activities(organization_id,school_id,lead_id,actor_profile_id,event_type,before_status,after_status)
 values(l.organization_id,l.school_id,l.id,v_uid,'CONVERTED',l.status,'CONVERTED');
 v_result:=jsonb_build_object('lead_id',l.id,'application_id',v_app_id,'application_reference',v_submitted->>'application_reference','status','CONVERTED');
 update public.admission_lead_command_requests set result_payload=v_result where actor_profile_id=v_uid and request_id=p_request_id; return v_result;
end $$;

revoke all on function public.b28_lead_projection(uuid),public.b28_list_admission_leads(uuid,text,text,text,uuid,boolean,text,integer,integer,text),public.b28_get_admission_lead(uuid),public.b28_list_lead_assignees(uuid),public.b28_find_lead_duplicates(uuid,text,text,uuid),public.b28_create_admission_lead(uuid,uuid,jsonb),public.b28_admission_lead_command(uuid,bigint,uuid,text,jsonb),public.b28_convert_admission_lead(uuid,bigint,uuid,jsonb),public.b18_submit_staff_admission_application(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.b28_list_admission_leads(uuid,text,text,text,uuid,boolean,text,integer,integer,text),public.b28_get_admission_lead(uuid),public.b28_list_lead_assignees(uuid),public.b28_find_lead_duplicates(uuid,text,text,uuid),public.b28_create_admission_lead(uuid,uuid,jsonb),public.b28_admission_lead_command(uuid,bigint,uuid,text,jsonb),public.b28_convert_admission_lead(uuid,bigint,uuid,jsonb) to authenticated;

comment on table public.admission_leads is 'B28 school-scoped pre-application inquiry management; no automatic purge or hard delete.';
comment on table public.admission_lead_activities is 'B28 append-only bounded operational activity history.';
comment on table public.admission_lead_command_requests is 'B28 authenticated request idempotency and safe result records.';
