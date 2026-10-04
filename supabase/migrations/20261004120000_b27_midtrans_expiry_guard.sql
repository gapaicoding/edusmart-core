begin;

create or replace function public.b27_expire_parent_midtrans_qris(p_actor_id uuid,p_invoice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.finance_invoices;
begin
  if p_actor_id is null then raise exception using errcode='P0001',message='B27_FORBIDDEN'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_id::text,true);
  select * into i from public.finance_invoices where id=p_invoice_id;
  if i.id is null or not public.b24_parent_can_access_invoice(p_actor_id,i) then
    raise exception using errcode='P0001',message='B27_NOT_FOUND';
  end if;
  select * into i from public.finance_invoices where id=i.id for update;
  update public.b24_online_payment_intents set status='expired',terminal_at=clock_timestamp(),row_version=row_version+1
    where invoice_id=i.id and organization_id=i.organization_id and school_id=i.school_id
      and provider_key='midtrans_sandbox' and channel='qris' and status='pending' and expires_at<=clock_timestamp();
  update public.b27_midtrans_qris_orders q set status='expired'
    from public.b24_online_payment_intents v
    where q.intent_id=v.id and q.organization_id=v.organization_id and q.school_id=v.school_id
      and v.invoice_id=i.id and v.organization_id=i.organization_id and v.school_id=i.school_id
      and q.status in ('pending','ambiguous','creating') and q.expires_at<=clock_timestamp();
end; $$;

revoke all on function public.b27_expire_parent_midtrans_qris(uuid,uuid) from public,anon,authenticated;
grant execute on function public.b27_expire_parent_midtrans_qris(uuid,uuid) to service_role;
commit;

