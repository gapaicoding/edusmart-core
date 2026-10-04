begin;

create or replace function public.b27_record_unsupported_midtrans_qris_notification(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.b27_midtrans_qris_orders; fp text; x jsonb;
begin
  if p_input->>'status' is distinct from '04' or p_input->>'currency' is distinct from 'IDR'
    or p_input->>'external_id' !~ '^[0-9a-fA-F-]{36}$' or p_input->>'provider_reference' is null then
    raise exception using errcode='P0001',message='B27_INVALID_EVENT';
  end if;
  select * into o from public.b27_midtrans_qris_orders where external_id=(p_input->>'external_id')::uuid for update;
  if o.id is null or (o.provider_reference is not null and o.provider_reference<>p_input->>'provider_reference') then
    raise exception using errcode='P0001',message='B27_NOT_FOUND';
  end if;
  fp:=encode(extensions.digest(convert_to(jsonb_build_object('external_id',p_input->>'external_id',
    'provider_reference',p_input->>'provider_reference','status','04','amount_value',p_input->>'amount_value',
    'currency',p_input->>'currency')::text,'UTF8'),'sha256'),'hex');
  insert into public.b27_midtrans_qris_notifications(external_id,provider_reference,event_status,amount_value,currency,
    timestamp_value,fingerprint,response_code)
  values(o.external_id,o.provider_reference,'04',left(coalesce(p_input->>'amount_value',''),32),'IDR',
    coalesce(nullif(p_input->>'occurred_at','')::timestamptz,clock_timestamp()),fp,'UNSUPPORTED_REFUND_STATUS')
  on conflict(external_id,provider_reference,event_status,fingerprint) do nothing;
  if o.status in ('creating','ambiguous','pending') then
    update public.b27_midtrans_qris_orders set status='review_required',safe_error_code='UNKNOWN_STATUS' where id=o.id;
  end if;
  x:=jsonb_build_object('status','review_required','exception_code','UNSUPPORTED_REFUND_STATUS');
  return x;
end; $$;

revoke all on function public.b27_record_unsupported_midtrans_qris_notification(jsonb) from public,anon,authenticated;
grant execute on function public.b27_record_unsupported_midtrans_qris_notification(jsonb) to service_role;
commit;

