begin;

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
  if o.status not in ('creating','pending','ambiguous','expired')
    or (o.status='creating' and o.created_at>clock_timestamp()-interval '30 seconds')
    or (o.status_checked_at is not null and o.status_checked_at>clock_timestamp()-interval '30 seconds') then
    return jsonb_build_object('should_query',false);
  end if;
  update public.b27_midtrans_qris_orders set status_checked_at=clock_timestamp() where id=o.id returning * into o;
  return jsonb_build_object('should_query',true,'external_id',o.external_id,'provider_reference',o.provider_reference,
    'amount_idr',o.amount_idr,'expires_at',o.expires_at,'status',o.status);
end; $$;

revoke all on function public.b27_claim_parent_midtrans_qris_status_check(uuid,uuid) from public,anon,authenticated;
grant execute on function public.b27_claim_parent_midtrans_qris_status_check(uuid,uuid) to service_role;
commit;

