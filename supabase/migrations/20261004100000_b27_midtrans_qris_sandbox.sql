-- EduSmart Core V1 / Batch 27
-- Midtrans BI-SNAP dynamic QRIS. Provider events still settle exclusively through B24.
begin;

alter table public.b24_online_payment_intents drop constraint b24_online_payment_intents_channel_check;
alter table public.b24_online_payment_intents add constraint b24_online_payment_intents_channel_check
  check (channel in ('synthetic','qris'));
alter table public.b24_provider_events drop constraint b24_provider_events_safe_failure_code_check;
alter table public.b24_provider_events add constraint b24_provider_events_safe_failure_code_check
  check (safe_failure_code is null or safe_failure_code in ('TEST_DECLINED','TEST_EXPIRED','MIDTRANS_NON_SUCCESS'));

create table public.b27_midtrans_qris_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  intent_id uuid not null,
  environment text not null default 'sandbox' check (environment = 'sandbox'),
  method text not null default 'qris' check (method = 'qris'),
  external_id uuid not null unique,
  provider_reference text,
  amount_idr bigint not null check (amount_idr > 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  status text not null default 'creating' check (status in
    ('creating','ambiguous','pending','settled','expired','failed','review_required')),
  qr_content text check (qr_content is null or char_length(qr_content) between 1 and 512),
  expires_at timestamptz not null,
  safe_error_code text check (safe_error_code is null or safe_error_code in
    ('PROVIDER_UNAVAILABLE','PROVIDER_REJECTED','INVALID_RESPONSE','AMOUNT_MISMATCH','CURRENCY_MISMATCH','UNKNOWN_STATUS')),
  status_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint b27_qris_school_fk foreign key (school_id,organization_id)
    references public.schools(id,organization_id) on delete restrict,
  constraint b27_qris_intent_fk foreign key (intent_id,organization_id,school_id)
    references public.b24_online_payment_intents(id,organization_id,school_id) on delete restrict,
  constraint b27_qris_intent_key unique (intent_id),
  constraint b27_qris_provider_ref_check check
    (provider_reference is null or char_length(provider_reference) between 1 and 120)
);
create index b27_qris_school_created_idx on public.b27_midtrans_qris_orders(organization_id,school_id,created_at desc);

create table public.b27_midtrans_qris_requests (
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  invoice_id uuid not null,
  order_id uuid not null references public.b27_midtrans_qris_orders(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (actor_profile_id,request_id)
);

create table public.b27_midtrans_qris_notifications (
  id uuid primary key default gen_random_uuid(),
  external_id uuid not null,
  provider_reference text not null,
  event_status text not null check (event_status in ('00','03','04','05','06','08','09')),
  amount_value text not null check (char_length(amount_value) <= 32),
  currency text not null check (char_length(currency) = 3),
  timestamp_value timestamptz not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  response_code text not null,
  received_at timestamptz not null default now(),
  unique (external_id,provider_reference,event_status,fingerprint)
);

create or replace function public.b27_touch_qris_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := clock_timestamp(); return new; end; $$;
create trigger b27_midtrans_qris_touch_updated_at before update on public.b27_midtrans_qris_orders
for each row execute function public.b27_touch_qris_updated_at();
create trigger b27_midtrans_qris_no_delete before delete on public.b27_midtrans_qris_orders
for each row execute function public.b24_deny_immutable_delete();
create trigger b27_midtrans_qris_requests_no_mutation before update or delete on public.b27_midtrans_qris_requests
for each row execute function public.b24_deny_immutable_delete();
create trigger b27_midtrans_qris_notifications_no_mutation before update or delete on public.b27_midtrans_qris_notifications
for each row execute function public.b24_deny_immutable_delete();

-- Every RPC below is service-role-only. Actor and school ownership are revalidated here.

create or replace function public.b24_reconcile_midtrans_qris_event(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.b27_midtrans_qris_orders;
  v public.b24_online_payment_intents;
  i public.finance_invoices;
  existing public.b24_provider_events;
  ev public.b24_provider_events;
  pay public.finance_payments;
  alloc public.finance_payment_allocations;
  rec public.b24_payment_reconciliations;
  pstatus text; etype text; failure text; settlement_ref text;
  amount numeric; occurred timestamptz; event_id text; fp text;
  total bigint; paid bigint; outstanding bigint; outcome text; ex text; do_settle boolean:=false; x jsonb;
begin
  if jsonb_typeof(p_input)<>'object' then raise exception using errcode='P0001',message='B27_INVALID_EVENT'; end if;
  if p_input->>'external_id' !~ '^[0-9a-fA-F-]{36}$' or p_input->>'provider_reference' is null
    or p_input->>'status' not in ('00','03','05','06','08','09')
    or p_input->>'currency' is distinct from 'IDR' then
    raise exception using errcode='P0001',message='B27_INVALID_EVENT';
  end if;
  amount:=nullif(p_input->>'amount_value','')::numeric;
  if amount is null or amount<=0 or amount>9007199254740991 then
    raise exception using errcode='P0001',message='B27_INVALID_EVENT';
  end if;
  pstatus:=p_input->>'status';
  etype:=case pstatus when '00' then 'settled' when '03' then 'pending' when '08' then 'expired' else 'failed' end;
  failure:=case when etype='failed' then 'MIDTRANS_NON_SUCCESS' else null end;
  settlement_ref:=case when etype='settled' then p_input->>'provider_reference' else null end;
  occurred:=coalesce(nullif(p_input->>'occurred_at','')::timestamptz,clock_timestamp());
  event_id:='midtrans-'||encode(extensions.digest(convert_to((p_input->>'external_id')||'|'||
    (p_input->>'provider_reference')||'|'||pstatus,'UTF8'),'sha256'),'hex');
  if char_length(event_id)>120 then raise exception using errcode='P0001',message='B27_INVALID_EVENT'; end if;
  fp:=encode(extensions.digest(convert_to(jsonb_build_object('external_id',p_input->>'external_id',
    'provider_reference',p_input->>'provider_reference','status',pstatus,'amount_value',p_input->>'amount_value',
    'currency',p_input->>'currency')::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('midtrans_sandbox:'||event_id,0));
  select * into o from public.b27_midtrans_qris_orders where external_id=(p_input->>'external_id')::uuid;
  if o.id is null then raise exception using errcode='P0001',message='B27_NOT_FOUND'; end if;
  if o.environment<>'sandbox' or o.method<>'qris' or amount<>o.amount_idr or o.currency<>'IDR'
    or (o.provider_reference is not null and o.provider_reference<>p_input->>'provider_reference') then
    raise exception using errcode='P0001',message='B27_EVENT_MISMATCH';
  end if;
  select * into v from public.b24_online_payment_intents where id=o.intent_id
    and organization_id=o.organization_id and school_id=o.school_id for update;
  if v.id is null or v.provider_key<>'midtrans_sandbox' or v.channel<>'qris' or v.amount_idr<>o.amount_idr then
    raise exception using errcode='P0001',message='B27_NOT_FOUND';
  end if;
  select * into existing from public.b24_provider_events where provider_key='midtrans_sandbox' and provider_event_id=event_id;
  if existing.id is not null then
    if existing.fingerprint<>fp then raise exception using errcode='P0001',message='B24_EVENT_CONFLICT'; end if;
    return existing.result_payload;
  end if;
  select * into i from public.finance_invoices where id=v.invoice_id and organization_id=v.organization_id and school_id=v.school_id for update;
  if i.id is null then raise exception using errcode='P0001',message='B27_NOT_FOUND'; end if;
  -- Match B24 lock order: invoice first, then intent.
  select * into v from public.b24_online_payment_intents where id=o.intent_id for update;
  outcome:=v.status; ex:=null;
  if v.status<>'pending' then
    if etype='settled' and v.status in ('expired','failed','cancelled') then
      outcome:='review_required'; ex:='INVOICE_NOT_ELIGIBLE';
      update public.b24_online_payment_intents set status='review_required',provider_reference=settlement_ref,
        terminal_at=clock_timestamp(),row_version=row_version+1 where id=v.id returning * into v;
    else outcome:='ignored_terminal'; end if;
  elsif etype='pending' then outcome:='pending';
  elsif etype='failed' then
    update public.b24_online_payment_intents set status='failed',terminal_at=clock_timestamp(),row_version=row_version+1
      where id=v.id returning * into v; outcome:='failed';
  elsif etype='expired' then
    update public.b24_online_payment_intents set status='expired',terminal_at=clock_timestamp(),row_version=row_version+1
      where id=v.id returning * into v; outcome:='expired';
  else
    select coalesce(sum(line_amount_idr),0)::bigint into total from public.finance_invoice_items where invoice_id=i.id;
    select coalesce(sum(a.amount_idr),0)::bigint into paid from public.finance_payment_allocations a
      join public.finance_payments p on p.id=a.payment_id
      where a.invoice_id=i.id and not exists(select 1 from public.finance_payment_corrections c where c.original_payment_id=p.id);
    outstanding:=total-paid;
    if occurred>v.expires_at or i.document_status<>'issued' then ex:='INVOICE_NOT_ELIGIBLE';
    elsif v.amount_idr>outstanding then ex:='OUTSTANDING_CHANGED'; end if;
    if ex is null then do_settle:=true; outcome:='settled';
    else
      update public.b24_online_payment_intents set status='review_required',provider_reference=settlement_ref,
        terminal_at=clock_timestamp(),row_version=row_version+1 where id=v.id returning * into v;
      outcome:='review_required';
    end if;
  end if;
  insert into public.b24_provider_events(organization_id,school_id,intent_id,provider_key,provider_event_id,event_type,
    provider_settlement_reference,amount_idr,currency,occurred_at,fingerprint,safe_failure_code)
  values(v.organization_id,v.school_id,v.id,'midtrans_sandbox',event_id,etype,settlement_ref,v.amount_idr,'IDR',
    occurred,fp,failure) returning * into ev;
  if do_settle then
    begin
      insert into public.finance_payments(organization_id,school_id,student_id,student_enrollment_id,academic_year_id,
        amount_idr,currency,received_at,method,manual_reference,note,recorded_by_profile_id)
      values(i.organization_id,i.school_id,i.student_id,i.student_enrollment_id,i.academic_year_id,v.amount_idr,'IDR',
        occurred,'online_provider',null,'B24 normalized Midtrans sandbox settlement',v.requested_by_profile_id) returning * into pay;
      insert into public.finance_payment_allocations(organization_id,school_id,student_id,student_enrollment_id,currency,
        payment_id,invoice_id,amount_idr)
      values(i.organization_id,i.school_id,i.student_id,i.student_enrollment_id,'IDR',pay.id,v.invoice_id,v.amount_idr)
        returning * into alloc;
      update public.b24_online_payment_intents set status='settled',provider_reference=settlement_ref,
        settled_at=clock_timestamp(),terminal_at=clock_timestamp(),row_version=row_version+1 where id=v.id returning * into v;
      insert into public.b24_payment_reconciliations(organization_id,school_id,invoice_id,intent_id,provider_event_row_id,
        provider_key,provider_settlement_reference,amount_idr,currency,status,canonical_payment_id)
      values(v.organization_id,v.school_id,v.invoice_id,v.id,ev.id,'midtrans_sandbox',settlement_ref,v.amount_idr,'IDR',
        'settled',pay.id) returning * into rec;
      update public.b27_midtrans_qris_orders set status='settled' where id=o.id;
    exception when unique_violation then
      pay:=null; ex:='SETTLEMENT_ID_REUSED'; outcome:='review_required';
      update public.b24_online_payment_intents set status='review_required',provider_reference=settlement_ref,
        settled_at=null,terminal_at=clock_timestamp(),row_version=row_version+1 where id=v.id returning * into v;
    end;
  elsif etype in ('settled') and outcome='review_required' then
    insert into public.b24_payment_reconciliations(organization_id,school_id,invoice_id,intent_id,provider_event_row_id,
      provider_key,provider_settlement_reference,amount_idr,currency,status,exception_code)
    values(v.organization_id,v.school_id,v.invoice_id,v.id,ev.id,'midtrans_sandbox',settlement_ref,v.amount_idr,'IDR',
      'review_required',coalesce(ex,'INVOICE_NOT_ELIGIBLE'));
    update public.b27_midtrans_qris_orders set status='review_required',safe_error_code='AMOUNT_MISMATCH' where id=o.id;
  else
    update public.b27_midtrans_qris_orders set status=case etype when 'pending' then 'pending' when 'expired' then 'expired' else 'failed' end
      where id=o.id and status in ('creating','ambiguous','pending');
  end if;
  x:=jsonb_build_object('intent_id',v.id,'status',outcome,'amount_idr',v.amount_idr,'exception_code',ex);
  update public.b24_provider_events set result_status=outcome,result_payload=x,processed_at=clock_timestamp() where id=ev.id;
  return x;
end; $$;



create or replace function public.b27_receive_midtrans_qris_notification(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare x jsonb;
begin
  -- Called only after the fixed route verifies Midtrans signature, timestamp and partner identity.
  x:=public.b24_reconcile_midtrans_qris_event(p_input);
  return x;
end; $$;

create or replace function public.b27_list_invoice_midtrans_qris(p_actor_id uuid,p_school_id uuid,p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; x jsonb;
begin
  if p_actor_id is null then raise exception using errcode='P0001',message='B27_FORBIDDEN'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_id::text,true);
  o:=public.b19_finance_authorize('finance.read',p_school_id);
  select coalesce(jsonb_agg(jsonb_build_object('order_id',q.id,'intent_id',q.intent_id,'environment',q.environment,
    'method',q.method,'amount_idr',q.amount_idr,'currency',q.currency,'status',q.status,'expires_at',q.expires_at,
    'safe_error_code',q.safe_error_code,'reconciliation_status',r.status,'exception_code',r.exception_code)
    order by q.created_at desc),'[]'::jsonb) into x
  from public.b27_midtrans_qris_orders q join public.b24_online_payment_intents v
    on v.id=q.intent_id and v.organization_id=q.organization_id and v.school_id=q.school_id
  left join public.b24_payment_reconciliations r on r.intent_id=v.id
  where q.organization_id=o and q.school_id=p_school_id and v.invoice_id=p_invoice_id;
  return x;
end; $$;

create or replace function public.b27_get_midtrans_order_for_parent(p_actor_id uuid,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.b27_midtrans_qris_orders; v public.b24_online_payment_intents; i public.finance_invoices;
begin
  if p_actor_id is null then raise exception using errcode='P0001',message='B27_FORBIDDEN'; end if;
  select * into o from public.b27_midtrans_qris_orders where id=p_order_id;
  if o.id is null then raise exception using errcode='P0001',message='B27_NOT_FOUND'; end if;
  select * into v from public.b24_online_payment_intents where id=o.intent_id and organization_id=o.organization_id and school_id=o.school_id;
  select * into i from public.finance_invoices where id=v.invoice_id and organization_id=v.organization_id and school_id=v.school_id;
  if i.id is null or not public.b24_parent_can_access_invoice(p_actor_id,i) then
    raise exception using errcode='P0001',message='B27_NOT_FOUND';
  end if;
  return jsonb_build_object('order_id',o.id,'invoice_id',i.id,'intent_id',v.id,'amount_idr',o.amount_idr,
    'currency',o.currency,'status',o.status,'expires_at',o.expires_at,'qr_content',o.qr_content,
    'safe_error_code',o.safe_error_code);
end; $$;


create or replace function public.b27_reserve_parent_midtrans_qris(
  p_actor_id uuid,p_invoice_id uuid,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  i public.finance_invoices;
  v public.b24_online_payment_intents;
  o public.b27_midtrans_qris_orders;
  req public.b27_midtrans_qris_requests;
  total bigint; paid bigint; outstanding bigint; is_new boolean := false;
begin
  if p_actor_id is null or p_invoice_id is null or p_request_id is null then
    raise exception using errcode='P0001',message='B27_FORBIDDEN';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_id::text,true);
  select * into i from public.finance_invoices where id=p_invoice_id;
  if i.id is null or not public.b24_parent_can_access_invoice(p_actor_id,i) then
    raise exception using errcode='P0001',message='B27_NOT_FOUND';
  end if;
  select * into i from public.finance_invoices
    where id=p_invoice_id and organization_id=i.organization_id and school_id=i.school_id for update;
  if i.document_status<>'issued' then raise exception using errcode='P0001',message='B27_NOT_ELIGIBLE'; end if;
  select * into req from public.b27_midtrans_qris_requests
    where actor_profile_id=p_actor_id and request_id=p_request_id for update;
  if req.actor_profile_id is not null and req.invoice_id<>i.id then
    raise exception using errcode='P0001',message='B27_REQUEST_CONFLICT';
  end if;
  if req.order_id is not null then
    select * into o from public.b27_midtrans_qris_orders where id=req.order_id;
    return jsonb_build_object('order_id',o.id,'intent_id',o.intent_id,'amount_idr',o.amount_idr,
      'expires_at',o.expires_at,'status',o.status,'qr_content',o.qr_content,'should_create',false);
  end if;
  select coalesce(sum(line_amount_idr),0)::bigint into total from public.finance_invoice_items where invoice_id=i.id;
  select coalesce(sum(a.amount_idr),0)::bigint into paid from public.finance_payment_allocations a
    join public.finance_payments p on p.id=a.payment_id
    where a.invoice_id=i.id and not exists(select 1 from public.finance_payment_corrections c where c.original_payment_id=p.id);
  outstanding:=total-paid;
  if outstanding<=0 then raise exception using errcode='P0001',message='B27_NOT_ELIGIBLE'; end if;
  select * into v from public.b24_online_payment_intents
    where invoice_id=i.id and organization_id=i.organization_id and school_id=i.school_id
      and provider_key='midtrans_sandbox' and channel='qris' and status='pending'
    order by created_at desc limit 1 for update;
  if v.id is null then
    insert into public.b24_online_payment_intents(organization_id,school_id,invoice_id,requested_by_profile_id,
      provider_key,channel,amount_idr,currency,status,expires_at)
    values(i.organization_id,i.school_id,i.id,p_actor_id,'midtrans_sandbox','qris',outstanding,'IDR','pending',
      clock_timestamp()+interval '15 minutes') returning * into v;
  elsif v.amount_idr<>outstanding or v.expires_at<=clock_timestamp() then
    raise exception using errcode='P0001',message='B27_NOT_ELIGIBLE';
  end if;
  select * into o from public.b27_midtrans_qris_orders where intent_id=v.id for update;
  if o.id is null then
    insert into public.b27_midtrans_qris_orders(organization_id,school_id,intent_id,external_id,amount_idr,expires_at)
      values(v.organization_id,v.school_id,v.id,gen_random_uuid(),v.amount_idr,v.expires_at) returning * into o;
    is_new:=true;
  end if;
  insert into public.b27_midtrans_qris_requests(actor_profile_id,request_id,invoice_id,order_id)
    values(p_actor_id,p_request_id,i.id,o.id);
  return jsonb_build_object('order_id',o.id,'intent_id',o.intent_id,'external_id',o.external_id,
    'amount_idr',o.amount_idr,'expires_at',o.expires_at,'status',o.status,'qr_content',o.qr_content,'should_create',is_new);
end; $$;

create or replace function public.b27_save_midtrans_qris_result(
  p_order_id uuid,p_provider_reference text,p_qr_content text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.b27_midtrans_qris_orders;
begin
  select * into o from public.b27_midtrans_qris_orders where id=p_order_id for update;
  if o.id is null or o.status<>'creating' or p_provider_reference is null or char_length(p_provider_reference)>120
    or p_qr_content is null or char_length(p_qr_content) not between 1 and 512 then
    raise exception using errcode='P0001',message='B27_ORDER_INVALID';
  end if;
  update public.b27_midtrans_qris_orders set provider_reference=p_provider_reference,qr_content=p_qr_content,status='pending'
    where id=o.id returning * into o;
  return jsonb_build_object('order_id',o.id,'status',o.status,'qr_content',o.qr_content,'expires_at',o.expires_at);
end; $$;

create or replace function public.b27_mark_midtrans_qris_ambiguous(p_order_id uuid,p_safe_error_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_safe_error_code not in ('PROVIDER_UNAVAILABLE','PROVIDER_REJECTED','INVALID_RESPONSE') then
    raise exception using errcode='P0001',message='B27_ORDER_INVALID';
  end if;
  update public.b27_midtrans_qris_orders set status='ambiguous',safe_error_code=p_safe_error_code
    where id=p_order_id and status='creating';
end; $$;

create or replace function public.b27_get_parent_midtrans_qris(p_actor_id uuid,p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.finance_invoices; x jsonb;
begin
  if p_actor_id is null then raise exception using errcode='P0001',message='B27_FORBIDDEN'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_id::text,true);
  select * into i from public.finance_invoices where id=p_invoice_id;
  if i.id is null or not public.b24_parent_can_access_invoice(p_actor_id,i) then
    raise exception using errcode='P0001',message='B27_NOT_FOUND';
  end if;
  select jsonb_build_object('order_id',q.id,'intent_id',q.intent_id,'amount_idr',q.amount_idr,
    'currency',q.currency,'status',q.status,'expires_at',q.expires_at,'qr_content',q.qr_content,
    'safe_error_code',q.safe_error_code,'reconciliation_status',r.status,'exception_code',r.exception_code)
    into x from public.b27_midtrans_qris_orders q
    join public.b24_online_payment_intents v on v.id=q.intent_id and v.organization_id=q.organization_id and v.school_id=q.school_id
    left join public.b24_payment_reconciliations r on r.intent_id=v.id
    where v.invoice_id=i.id and v.organization_id=i.organization_id and v.school_id=i.school_id
    order by q.created_at desc limit 1;
  return x;
end; $$;

create or replace function public.b27_claim_parent_midtrans_qris_status_check(p_actor_id uuid,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.b27_midtrans_qris_orders; v public.b24_online_payment_intents; i public.finance_invoices;
begin
  if p_actor_id is null then raise exception using errcode='P0001',message='B27_FORBIDDEN'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_id::text,true);
  select * into o from public.b27_midtrans_qris_orders where id=p_order_id for update;
  if o.id is null then raise exception using errcode='P0001',message='B27_NOT_FOUND'; end if;
  select * into v from public.b24_online_payment_intents where id=o.intent_id and organization_id=o.organization_id and school_id=o.school_id;
  select * into i from public.finance_invoices where id=v.invoice_id and organization_id=v.organization_id and school_id=v.school_id;
  if i.id is null or not public.b24_parent_can_access_invoice(p_actor_id,i) then
    raise exception using errcode='P0001',message='B27_NOT_FOUND';
  end if;
  if o.status not in ('pending','ambiguous') or o.expires_at<=clock_timestamp()
    or (o.status_checked_at is not null and o.status_checked_at>clock_timestamp()-interval '30 seconds') then
    return jsonb_build_object('should_query',false);
  end if;
  update public.b27_midtrans_qris_orders set status_checked_at=clock_timestamp() where id=o.id returning * into o;
  return jsonb_build_object('should_query',true,'external_id',o.external_id,'provider_reference',o.provider_reference,
    'amount_idr',o.amount_idr,'expires_at',o.expires_at,'status',o.status);
end; $$;
alter table public.b27_midtrans_qris_orders enable row level security;
alter table public.b27_midtrans_qris_orders force row level security;
alter table public.b27_midtrans_qris_requests enable row level security;
alter table public.b27_midtrans_qris_requests force row level security;
alter table public.b27_midtrans_qris_notifications enable row level security;
alter table public.b27_midtrans_qris_notifications force row level security;
revoke all on table public.b27_midtrans_qris_orders,public.b27_midtrans_qris_requests,public.b27_midtrans_qris_notifications
  from public,anon,authenticated,service_role;
revoke all on function public.b27_touch_qris_updated_at() from public,anon,authenticated,service_role;
revoke all on function public.b27_reserve_parent_midtrans_qris(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.b27_save_midtrans_qris_result(uuid,text,text) from public,anon,authenticated;
revoke all on function public.b27_mark_midtrans_qris_ambiguous(uuid,text) from public,anon,authenticated;
revoke all on function public.b27_get_parent_midtrans_qris(uuid,uuid) from public,anon,authenticated;
revoke all on function public.b27_claim_parent_midtrans_qris_status_check(uuid,uuid) from public,anon,authenticated;
revoke all on function public.b27_get_midtrans_order_for_parent(uuid,uuid) from public,anon,authenticated;
revoke all on function public.b27_list_invoice_midtrans_qris(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.b27_receive_midtrans_qris_notification(jsonb) from public,anon,authenticated;
revoke all on function public.b24_reconcile_midtrans_qris_event(jsonb) from public,anon,authenticated;
grant execute on function public.b27_reserve_parent_midtrans_qris(uuid,uuid,uuid) to service_role;
grant execute on function public.b27_save_midtrans_qris_result(uuid,text,text) to service_role;
grant execute on function public.b27_mark_midtrans_qris_ambiguous(uuid,text) to service_role;
grant execute on function public.b27_get_parent_midtrans_qris(uuid,uuid) to service_role;
grant execute on function public.b27_claim_parent_midtrans_qris_status_check(uuid,uuid) to service_role;
grant execute on function public.b27_get_midtrans_order_for_parent(uuid,uuid) to service_role;
grant execute on function public.b27_list_invoice_midtrans_qris(uuid,uuid,uuid) to service_role;
grant execute on function public.b27_receive_midtrans_qris_notification(jsonb) to service_role;
grant execute on function public.b24_reconcile_midtrans_qris_event(jsonb) to service_role;

commit;
