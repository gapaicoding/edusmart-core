begin;

do $$
declare
  definition text;
  old_currency_clause text := '    or p_input->>''currency'' is distinct from ''IDR'' then';
  new_currency_clause text := ' then';
  old_mismatch_block text := $old$
  if o.environment<>'sandbox' or o.method<>'qris' or amount<>o.amount_idr or o.currency<>'IDR'
    or (o.provider_reference is not null and o.provider_reference<>p_input->>'provider_reference') then
    raise exception using errcode='P0001',message='B27_EVENT_MISMATCH';
  end if;
$old$;
  new_mismatch_block text := $new$
  if o.environment<>'sandbox' or o.method<>'qris' then
    raise exception using errcode='P0001',message='B27_EVENT_MISMATCH';
  elsif amount<>o.amount_idr then
    update public.b27_midtrans_qris_orders set status='review_required',safe_error_code='AMOUNT_MISMATCH' where id=o.id;
    return jsonb_build_object('status','review_required','exception_code','AMOUNT_MISMATCH');
  elsif p_input->>'currency' is distinct from 'IDR' or o.currency<>'IDR' then
    update public.b27_midtrans_qris_orders set status='review_required',safe_error_code='CURRENCY_MISMATCH' where id=o.id;
    return jsonb_build_object('status','review_required','exception_code','CURRENCY_MISMATCH');
  elsif o.provider_reference is not null and o.provider_reference<>p_input->>'provider_reference' then
    update public.b27_midtrans_qris_orders set status='review_required',safe_error_code='UNKNOWN_STATUS' where id=o.id;
    return jsonb_build_object('status','review_required','exception_code','PROVIDER_REFERENCE_MISMATCH');
  end if;
$new$;
begin
  select pg_get_functiondef('public.b24_reconcile_midtrans_qris_event(jsonb)'::regprocedure) into definition;
  if definition is null or position(old_currency_clause in definition)=0 or position(old_mismatch_block in definition)=0 then
    raise exception 'B27_EXPECTED_MISMATCH_GUARD';
  end if;
  definition:=replace(definition,old_currency_clause,new_currency_clause);
  definition:=replace(definition,old_mismatch_block,new_mismatch_block);
  execute definition;
end;
$$;

commit;
