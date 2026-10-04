begin;
do $$
declare
  definition text;
  old_block text := $old$
  if o.status in ('creating','ambiguous','pending') then
    update public.b27_midtrans_qris_orders set status='review_required',safe_error_code='UNKNOWN_STATUS' where id=o.id;
  end if;
$old$;
  new_block text := $new$
  update public.b27_midtrans_qris_orders set status='review_required',safe_error_code='UNKNOWN_STATUS' where id=o.id;
$new$;
begin
  select pg_get_functiondef('public.b27_record_unsupported_midtrans_qris_notification(jsonb)'::regprocedure) into definition;
  if definition is null or position(old_block in definition)=0 then
    raise exception 'B27_EXPECTED_UNSUPPORTED_STATUS_UPDATE';
  end if;
  execute replace(definition,old_block,new_block);
end;
$$;
commit;

