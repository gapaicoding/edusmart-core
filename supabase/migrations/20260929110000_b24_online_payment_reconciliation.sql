-- EduSmart Core V1 / Batch 24
-- Provider-neutral intents and normalized synthetic event reconciliation into B19.
begin;

-- Keep B19's manual methods intact and add a distinct method used only by the
-- trusted B24 reconciliation command.
alter table public.finance_payments drop constraint finance_payments_method_check;
alter table public.finance_payments
  add constraint finance_payments_method_check
  check (method in ('cash','bank_transfer','other','online_provider'));

create table public.b24_payment_intent_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  invoice_id uuid not null,
  semantic_fingerprint text not null check (semantic_fingerprint ~ '^[0-9a-f]{64}$'),
  intent_id uuid,
  created_at timestamptz not null default now(),
  constraint b24_intent_requests_school_fk foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint b24_intent_requests_invoice_fk foreign key (invoice_id, organization_id, school_id)
    references public.finance_invoices(id, organization_id, school_id) on delete restrict,
  constraint b24_intent_requests_actor_request_key unique (actor_profile_id, request_id)
);

create table public.b24_online_payment_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  invoice_id uuid not null,
  requested_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  provider_key text not null check (provider_key ~ '^[a-z][a-z0-9_]{1,47}$'),
  channel text not null check (channel = 'synthetic'),
  amount_idr bigint not null check (amount_idr > 0 and amount_idr <= 9007199254740991),
  currency text not null default 'IDR' check (currency = 'IDR'),
  status text not null default 'pending'
    check (status in ('pending','settled','expired','failed','cancelled','review_required')),
  provider_reference text,
  expires_at timestamptz not null,
  settled_at timestamptz,
  terminal_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint b24_intents_school_fk foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint b24_intents_invoice_fk foreign key (invoice_id, organization_id, school_id)
    references public.finance_invoices(id, organization_id, school_id) on delete restrict,
  constraint b24_intents_id_owner_key unique (id, organization_id, school_id),
  constraint b24_intents_id_invoice_key unique (id, organization_id, school_id, invoice_id),
  constraint b24_intents_provider_ref_check check
    (provider_reference is null or char_length(provider_reference) between 1 and 120),
  constraint b24_intents_terminal_time_check check
    ((status = 'pending' and terminal_at is null and settled_at is null)
      or (status = 'settled' and terminal_at is not null and settled_at is not null)
      or (status in ('expired','failed','cancelled','review_required') and terminal_at is not null and settled_at is null))
);

alter table public.b24_payment_intent_requests
  add constraint b24_intent_requests_intent_fk
  foreign key (intent_id, organization_id, school_id, invoice_id)
  references public.b24_online_payment_intents(id, organization_id, school_id, invoice_id)
  on delete restrict;

create unique index b24_online_payment_intents_one_active_invoice_provider_channel
  on public.b24_online_payment_intents(invoice_id, provider_key, channel)
  where status = 'pending';
create index b24_online_payment_intents_invoice_created_idx
  on public.b24_online_payment_intents(organization_id, school_id, invoice_id, created_at desc);

create table public.b24_provider_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  intent_id uuid not null,
  provider_key text not null,
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 120),
  event_type text not null check (event_type in ('pending','settled','expired','failed')),
  provider_settlement_reference text,
  amount_idr bigint not null check (amount_idr > 0 and amount_idr <= 9007199254740991),
  currency text not null check (currency = 'IDR'),
  occurred_at timestamptz not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  safe_failure_code text check (safe_failure_code is null or safe_failure_code in ('TEST_DECLINED','TEST_EXPIRED')),
  result_status text not null default 'received' check
    (result_status in ('received','pending','settled','expired','failed','review_required','ignored_terminal')),
  result_payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  received_at timestamptz not null default now(),
  constraint b24_events_school_fk foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint b24_events_intent_fk foreign key (intent_id, organization_id, school_id)
    references public.b24_online_payment_intents(id, organization_id, school_id) on delete restrict,
  constraint b24_events_provider_identity_key unique (provider_key, provider_event_id),
  constraint b24_events_id_owner_key unique (id, organization_id, school_id),
  constraint b24_events_settlement_ref_check check
    (provider_settlement_reference is null or char_length(provider_settlement_reference) between 1 and 120),
  constraint b24_events_failure_shape_check check
    ((event_type = 'failed' and safe_failure_code is not null) or (event_type <> 'failed' and safe_failure_code is null))
);
create index b24_provider_events_intent_received_idx
  on public.b24_provider_events(organization_id, school_id, intent_id, received_at desc);

create table public.b24_payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  invoice_id uuid not null,
  intent_id uuid not null,
  provider_event_row_id uuid not null,
  provider_key text not null,
  provider_settlement_reference text not null,
  amount_idr bigint not null check (amount_idr > 0 and amount_idr <= 9007199254740991),
  currency text not null check (currency = 'IDR'),
  status text not null check (status in ('settled','review_required')),
  canonical_payment_id uuid,
  exception_code text check (exception_code is null or exception_code in
    ('OUTSTANDING_CHANGED','INVOICE_NOT_ELIGIBLE','SETTLEMENT_ID_REUSED')),
  created_at timestamptz not null default now(),
  constraint b24_reconciliations_school_fk foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint b24_reconciliations_intent_fk foreign key (intent_id, organization_id, school_id, invoice_id)
    references public.b24_online_payment_intents(id, organization_id, school_id, invoice_id) on delete restrict,
  constraint b24_reconciliations_event_fk foreign key (provider_event_row_id, organization_id, school_id)
    references public.b24_provider_events(id, organization_id, school_id) on delete restrict,
  constraint b24_reconciliations_payment_fk foreign key (canonical_payment_id, organization_id, school_id)
    references public.finance_payments(id, organization_id, school_id) on delete restrict,
  constraint b24_reconciliations_one_intent_key unique (intent_id),
  constraint b24_reconciliations_outcome_check check
    ((status = 'settled' and canonical_payment_id is not null and exception_code is null)
      or (status = 'review_required' and canonical_payment_id is null and exception_code is not null))
);
create unique index b24_payment_reconciliations_one_settlement_effect
  on public.b24_payment_reconciliations(provider_key,provider_settlement_reference)
  where status='settled';

create or replace function public.b24_touch_intent_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end; $$;
create trigger b24_payment_intents_touch_updated_at
before update on public.b24_online_payment_intents
for each row execute function public.b24_touch_intent_updated_at();

create or replace function public.b24_deny_immutable_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'B24_IMMUTABLE_RECORD';
end; $$;
create trigger b24_provider_events_no_mutation
before update or delete on public.b24_provider_events
for each row execute function public.b24_deny_immutable_delete();
create trigger b24_reconciliations_no_mutation
before update or delete on public.b24_payment_reconciliations
for each row execute function public.b24_deny_immutable_delete();

create or replace function public.b24_parent_can_access_invoice(p_actor_id uuid,p_invoice public.finance_invoices)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_actor_id is not null and exists (
    select 1 from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id and g.organization_id = sg.organization_id
    where sg.student_id = p_invoice.student_id
      and sg.organization_id = p_invoice.organization_id
      and sg.status = 'active' and coalesce(sg.can_view_academic, false)
      and g.profile_id = p_actor_id
      and public.has_permission('finance.portal_read', p_invoice.organization_id,
        p_invoice.school_id, null, null, p_invoice.student_id)
  );
$$;

create or replace function public.b24_get_parent_payment_intent(p_actor_id uuid,p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.finance_invoices; x jsonb;
begin
  if p_actor_id is null then raise exception using errcode='P0001',message='B24_FORBIDDEN'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_id::text,true);
  select * into i from public.finance_invoices where id=p_invoice_id;
  if i.id is null or not public.b24_parent_can_access_invoice(p_actor_id,i) then
    raise exception using errcode='P0001',message='B24_NOT_FOUND';
  end if;
  select jsonb_build_object('intent_id',v.id,'invoice_id',v.invoice_id,'amount_idr',v.amount_idr,
    'currency',v.currency,'status',v.status,'expires_at',v.expires_at,'created_at',v.created_at)
    into x from public.b24_online_payment_intents v
    where v.invoice_id=i.id
      and v.organization_id=i.organization_id and v.school_id=i.school_id
    order by v.created_at desc limit 1;
  return x;
end; $$;

create or replace function public.b24_create_parent_payment_intent(p_actor_id uuid,p_invoice_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  i public.finance_invoices;
  req public.b24_payment_intent_requests;
  active public.b24_online_payment_intents;
  new_intent public.b24_online_payment_intents;
  total bigint;
  paid bigint;
  outstanding bigint;
  fp text;
  x jsonb;
begin
  if p_actor_id is null or p_request_id is null then
    raise exception using errcode='P0001',message='B24_FORBIDDEN';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_id::text,true);
  select * into i from public.finance_invoices where id=p_invoice_id;
  if i.id is null or not public.b24_parent_can_access_invoice(p_actor_id,i) then
    raise exception using errcode='P0001',message='B24_NOT_FOUND';
  end if;
  fp:=public.b19_finance_fingerprint(jsonb_build_object('invoice_id',i.id,'channel','synthetic'));
  insert into public.b24_payment_intent_requests(organization_id,school_id,actor_profile_id,request_id,invoice_id,semantic_fingerprint)
  values(i.organization_id,i.school_id,p_actor_id,p_request_id,i.id,fp)
  on conflict (actor_profile_id,request_id) do nothing;
  select * into req from public.b24_payment_intent_requests
    where actor_profile_id=p_actor_id and request_id=p_request_id for update;
  if req.semantic_fingerprint<>fp or req.invoice_id<>i.id then
    raise exception using errcode='P0001',message='B24_REQUEST_CONFLICT';
  end if;
  if req.intent_id is not null then
    select jsonb_build_object('intent_id',v.id,'invoice_id',v.invoice_id,'amount_idr',v.amount_idr,
      'currency',v.currency,'status',v.status,'expires_at',v.expires_at,'created_at',v.created_at)
      into x from public.b24_online_payment_intents v where v.id=req.intent_id;
    return x;
  end if;

  select * into i from public.finance_invoices
    where id=p_invoice_id and organization_id=req.organization_id and school_id=req.school_id for update;
  if i.id is null or not public.b24_parent_can_access_invoice(p_actor_id,i) then
    raise exception using errcode='P0001',message='B24_NOT_FOUND';
  end if;
  if i.document_status<>'issued' then raise exception using errcode='P0001',message='B24_NOT_ELIGIBLE'; end if;
  update public.b24_online_payment_intents set status='expired',terminal_at=clock_timestamp(),row_version=row_version+1
    where invoice_id=i.id and organization_id=i.organization_id and school_id=i.school_id
      and status='pending' and expires_at<=clock_timestamp();
  select coalesce(sum(line_amount_idr),0)::bigint into total from public.finance_invoice_items where invoice_id=i.id;
  select coalesce(sum(a.amount_idr),0)::bigint into paid
    from public.finance_payment_allocations a join public.finance_payments p on p.id=a.payment_id
    where a.invoice_id=i.id and not exists(select 1 from public.finance_payment_corrections c where c.original_payment_id=p.id);
  outstanding:=total-paid;
  if outstanding<=0 or outstanding>9007199254740991 then
    raise exception using errcode='P0001',message='B24_NOT_ELIGIBLE';
  end if;
  select * into active from public.b24_online_payment_intents
    where invoice_id=i.id and provider_key='development_test' and channel='synthetic' and status='pending'
    order by created_at desc limit 1 for update;
  if active.id is not null then
    update public.b24_payment_intent_requests set intent_id=active.id where id=req.id;
    x:=jsonb_build_object('intent_id',active.id,'invoice_id',active.invoice_id,'amount_idr',active.amount_idr,
      'currency',active.currency,'status',active.status,'expires_at',active.expires_at,'created_at',active.created_at);
    return x;
  end if;
  insert into public.b24_online_payment_intents(organization_id,school_id,invoice_id,requested_by_profile_id,
    provider_key,channel,amount_idr,currency,status,expires_at)
  values(i.organization_id,i.school_id,i.id,p_actor_id,'development_test','synthetic',outstanding,'IDR','pending',clock_timestamp()+interval '30 minutes')
  returning * into new_intent;
  update public.b24_payment_intent_requests set intent_id=new_intent.id where id=req.id;
  x:=jsonb_build_object('intent_id',new_intent.id,'invoice_id',new_intent.invoice_id,'amount_idr',new_intent.amount_idr,
    'currency',new_intent.currency,'status',new_intent.status,'expires_at',new_intent.expires_at,'created_at',new_intent.created_at);
  return x;
end; $$;

create or replace function public.b24_list_invoice_payment_intents(p_actor_id uuid,p_school_id uuid,p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; x jsonb;
begin
  if p_actor_id is null then raise exception using errcode='P0001',message='B24_FORBIDDEN'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_id::text,true);
  o:=public.b19_finance_authorize('finance.read',p_school_id);
  select coalesce(jsonb_agg(jsonb_build_object('intent_id',v.id,'invoice_id',v.invoice_id,'provider_key',v.provider_key,
    'channel',v.channel,'amount_idr',v.amount_idr,'currency',v.currency,'status',v.status,
    'provider_reference',v.provider_reference,'expires_at',v.expires_at,'created_at',v.created_at,
    'settled_at',v.settled_at,'terminal_at',v.terminal_at,'row_version',v.row_version,
    'reconciliation_status',r.status,'exception_code',r.exception_code)
    order by v.created_at desc),'[]'::jsonb) into x
  from public.b24_online_payment_intents v
  left join public.b24_payment_reconciliations r on r.intent_id=v.id
  where v.organization_id=o and v.school_id=p_school_id and v.invoice_id=p_invoice_id;
  return x;
end; $$;

create or replace function public.b24_find_intent_for_test_event(p_actor_id uuid,p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.b24_online_payment_intents; x jsonb;
begin
  if p_actor_id is null then raise exception using errcode='P0001',message='B24_FORBIDDEN'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_id::text,true);
  select * into v from public.b24_online_payment_intents where id=p_intent_id;
  if v.id is null then raise exception using errcode='P0001',message='B24_NOT_FOUND'; end if;
  perform public.b19_finance_authorize('finance.record_payment',v.school_id);
  x:=jsonb_build_object('intent_id',v.id,'amount_idr',v.amount_idr,'created_at',v.created_at,'expires_at',v.expires_at);
  return x;
end; $$;

create or replace function public.b24_simulate_development_payment_event(p_actor_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.b24_online_payment_intents;
  i public.finance_invoices;
  existing public.b24_provider_events;
  event_row public.b24_provider_events;
  reconciliation public.b24_payment_reconciliations;
  payment public.finance_payments;
  allocation public.finance_payment_allocations;
  event_id text;
  event_type text;
  settlement_ref text;
  failure_code text;
  amount bigint;
  occurred timestamptz;
  fp text;
  total bigint;
  paid bigint;
  current_outstanding bigint;
  resulting_status text;
  exception_code text;
  do_settlement boolean := false;
  x jsonb;
begin
  if p_actor_id is null then raise exception using errcode='P0001',message='B24_FORBIDDEN'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_id::text,true);
  if jsonb_typeof(p_input)<>'object' then raise exception using errcode='P0001',message='B24_INVALID_EVENT'; end if;
  event_id:=p_input->>'event_id';
  event_type:=p_input->>'event_type';
  if event_id is null or event_id !~ '^test-event-[a-zA-Z0-9_-]{1,90}$'
    or event_type is null or event_type not in ('pending','settled','expired','failed') then
    raise exception using errcode='P0001',message='B24_INVALID_EVENT';
  end if;
  settlement_ref:=nullif(p_input->>'settlement_reference','');
  failure_code:=nullif(p_input->>'failure_code','');
  if (event_type='settled' and (settlement_ref is null or settlement_ref !~ '^test-settlement-[a-zA-Z0-9_-]{1,90}$'))
    or (event_type<>'settled' and settlement_ref is not null)
    or (event_type='failed' and failure_code is distinct from 'TEST_DECLINED')
    or (event_type<>'failed' and failure_code is not null) then
    raise exception using errcode='P0001',message='B24_INVALID_EVENT';
  end if;
  amount:=coalesce(nullif(p_input->>'amount_idr','')::bigint,0);
  occurred:=coalesce(nullif(p_input->>'occurred_at','')::timestamptz,clock_timestamp());
  select * into v from public.b24_online_payment_intents where id=(p_input->>'intent_id')::uuid;
  if v.id is null then raise exception using errcode='P0001',message='B24_NOT_FOUND'; end if;
  perform public.b19_finance_authorize('finance.record_payment',v.school_id);
  if v.provider_key<>'development_test' or amount<>v.amount_idr or (p_input->>'currency') is distinct from 'IDR' then
    raise exception using errcode='P0001',message='B24_INVALID_EVENT';
  end if;
  fp:=public.b19_finance_fingerprint(jsonb_build_object('intent_id',v.id,'event_id',event_id,'event_type',event_type,
    'settlement_reference',settlement_ref,'amount_idr',amount,'currency','IDR','occurred_at',occurred,'failure_code',failure_code));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v.provider_key||':'||event_id,0));
  select * into existing from public.b24_provider_events where provider_key=v.provider_key and provider_event_id=event_id;
  if existing.id is not null then
    if existing.fingerprint<>fp then raise exception using errcode='P0001',message='B24_EVENT_CONFLICT'; end if;
    return existing.result_payload;
  end if;
  -- Financial lock order is invoice first, then intent. This is shared with
  -- B19 manual payment/void and avoids settlement/expiry lock inversion.
  select * into i from public.finance_invoices
    where id=v.invoice_id and organization_id=v.organization_id and school_id=v.school_id for update;
  if i.id is null then raise exception using errcode='P0001',message='B24_NOT_FOUND'; end if;
  select * into v from public.b24_online_payment_intents where id=v.id for update;
  if v.id is null then raise exception using errcode='P0001',message='B24_NOT_FOUND'; end if;
  resulting_status:=v.status;
  exception_code:=null;
  if v.status<>'pending' then
    if event_type='settled' and v.status in ('expired','failed','cancelled') then
      resulting_status:='review_required';
      exception_code:='INVOICE_NOT_ELIGIBLE';
      update public.b24_online_payment_intents set status='review_required',provider_reference=settlement_ref,
        terminal_at=clock_timestamp(),row_version=row_version+1 where id=v.id returning * into v;
    else
      resulting_status:='ignored_terminal';
    end if;
  elsif event_type='pending' then
    resulting_status:='pending';
  elsif event_type='failed' then
    update public.b24_online_payment_intents set status='failed',terminal_at=clock_timestamp(),row_version=row_version+1 where id=v.id returning * into v;
    resulting_status:='failed';
  elsif event_type='expired' then
    update public.b24_online_payment_intents set status='expired',terminal_at=clock_timestamp(),row_version=row_version+1 where id=v.id returning * into v;
    resulting_status:='expired';
  else
    select coalesce(sum(line_amount_idr),0)::bigint into total from public.finance_invoice_items where invoice_id=i.id;
    select coalesce(sum(a.amount_idr),0)::bigint into paid from public.finance_payment_allocations a
      join public.finance_payments p on p.id=a.payment_id
      where a.invoice_id=i.id and not exists(select 1 from public.finance_payment_corrections c where c.original_payment_id=p.id);
    current_outstanding:=total-paid;
    if occurred>v.expires_at then exception_code:='INVOICE_NOT_ELIGIBLE';
    elsif i.id is null or i.document_status<>'issued' then exception_code:='INVOICE_NOT_ELIGIBLE';
    elsif v.amount_idr>current_outstanding then exception_code:='OUTSTANDING_CHANGED'; end if;
    if exception_code is null then
      do_settlement:=true;
      resulting_status:='settled';
    else
      update public.b24_online_payment_intents set status='review_required',provider_reference=settlement_ref,
        terminal_at=clock_timestamp(),row_version=row_version+1 where id=v.id returning * into v;
      resulting_status:='review_required';
    end if;
  end if;

  -- Insert the normalized immutable identity before its reconciliation link.
  insert into public.b24_provider_events(organization_id,school_id,intent_id,provider_key,provider_event_id,
    event_type,provider_settlement_reference,amount_idr,currency,occurred_at,fingerprint,safe_failure_code)
  values(v.organization_id,v.school_id,v.id,v.provider_key,event_id,event_type,settlement_ref,amount,'IDR',occurred,
    fp,failure_code) returning * into event_row;

  if do_settlement then
    -- A conflicting provider settlement identity rolls back this subtransaction,
    -- including both canonical B19 rows and the intent transition.
    begin
      insert into public.finance_payments(organization_id,school_id,student_id,student_enrollment_id,academic_year_id,
        amount_idr,currency,received_at,method,manual_reference,note,recorded_by_profile_id)
      values(i.organization_id,i.school_id,i.student_id,i.student_enrollment_id,i.academic_year_id,v.amount_idr,'IDR',
        occurred,'online_provider',null,'B24 normalized settlement',auth.uid()) returning * into payment;
      insert into public.finance_payment_allocations(organization_id,school_id,student_id,student_enrollment_id,
        currency,payment_id,invoice_id,amount_idr)
      values(i.organization_id,i.school_id,i.student_id,i.student_enrollment_id,'IDR',payment.id,v.invoice_id,v.amount_idr)
      returning * into allocation;
      update public.b24_online_payment_intents set status='settled',provider_reference=settlement_ref,
        settled_at=clock_timestamp(),terminal_at=clock_timestamp(),row_version=row_version+1 where id=v.id returning * into v;
      insert into public.b24_payment_reconciliations(organization_id,school_id,invoice_id,intent_id,
        provider_event_row_id,provider_key,provider_settlement_reference,amount_idr,currency,status,canonical_payment_id)
      values(v.organization_id,v.school_id,v.invoice_id,v.id,event_row.id,v.provider_key,settlement_ref,
        v.amount_idr,'IDR','settled',payment.id) returning * into reconciliation;
    exception when unique_violation then
      payment:=null;
      exception_code:='SETTLEMENT_ID_REUSED';
      resulting_status:='review_required';
      update public.b24_online_payment_intents set status='review_required',provider_reference=settlement_ref,
        settled_at=null,terminal_at=clock_timestamp(),row_version=row_version+1 where id=v.id returning * into v;
    end;
  end if;
  if event_type='settled' and resulting_status='review_required' then
    insert into public.b24_payment_reconciliations(organization_id,school_id,invoice_id,intent_id,
      provider_event_row_id,provider_key,provider_settlement_reference,amount_idr,currency,status,exception_code)
    values(v.organization_id,v.school_id,v.invoice_id,v.id,event_row.id,v.provider_key,settlement_ref,
      v.amount_idr,'IDR','review_required',coalesce(exception_code,'INVOICE_NOT_ELIGIBLE'));
  end if;
  x:=jsonb_build_object('intent_id',v.id,'status',resulting_status,'payment_id',payment.id,
    'amount_idr',v.amount_idr,'exception_code',exception_code);
  update public.b24_provider_events set result_status=resulting_status,result_payload=x,processed_at=clock_timestamp()
    where id=event_row.id;
  return x;
end; $$;

create or replace function public.b24_guard_event_result_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.processed_at is not null or new.processed_at is null
    or old.organization_id is distinct from new.organization_id or old.school_id is distinct from new.school_id
    or old.intent_id is distinct from new.intent_id or old.provider_key is distinct from new.provider_key
    or old.provider_event_id is distinct from new.provider_event_id or old.event_type is distinct from new.event_type
    or old.provider_settlement_reference is distinct from new.provider_settlement_reference
    or old.amount_idr is distinct from new.amount_idr or old.currency is distinct from new.currency
    or old.occurred_at is distinct from new.occurred_at or old.fingerprint is distinct from new.fingerprint
    or old.safe_failure_code is distinct from new.safe_failure_code or old.received_at is distinct from new.received_at then
    raise exception using errcode='P0001',message='B24_IMMUTABLE_RECORD';
  end if;
  return new;
end; $$;
create trigger b24_provider_events_immutable_content
before update on public.b24_provider_events
for each row execute function public.b24_guard_event_result_update();
drop trigger b24_provider_events_no_mutation on public.b24_provider_events;
create trigger b24_provider_events_no_delete
before delete on public.b24_provider_events
for each row execute function public.b24_deny_immutable_delete();
do $$ declare t text; begin
  foreach t in array array['b24_payment_intent_requests','b24_online_payment_intents','b24_provider_events','b24_payment_reconciliations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role',t);
  end loop;
end $$;

revoke all on function public.b24_touch_intent_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.b24_deny_immutable_delete() from public, anon, authenticated, service_role;
revoke all on function public.b24_guard_event_result_update() from public, anon, authenticated, service_role;
revoke all on function public.b24_parent_can_access_invoice(uuid,public.finance_invoices) from public, anon, authenticated, service_role;
revoke all on function public.b24_get_parent_payment_intent(uuid,uuid) from public, anon, authenticated;
revoke all on function public.b24_create_parent_payment_intent(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.b24_list_invoice_payment_intents(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.b24_find_intent_for_test_event(uuid,uuid) from public, anon, authenticated;
revoke all on function public.b24_simulate_development_payment_event(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.b24_get_parent_payment_intent(uuid,uuid) to service_role;
grant execute on function public.b24_create_parent_payment_intent(uuid,uuid,uuid) to service_role;
grant execute on function public.b24_list_invoice_payment_intents(uuid,uuid,uuid) to service_role;
grant execute on function public.b24_find_intent_for_test_event(uuid,uuid) to service_role;
grant execute on function public.b24_simulate_development_payment_event(uuid,jsonb) to service_role;

commit;

