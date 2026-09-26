-- B19-P3-DB-01: serialize void with payment on the same invoice row.
-- Request-ledger lock precedes financial locks; financial hierarchy is invoice
-- then dependent rows. Reversal only removes settlement and never waits on an
-- invoice after locking a payment. No global isolation or table ACL change.
begin;

create or replace function public.b19_void_finance_invoice(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o uuid;
  r public.finance_invoices;
  x jsonb;
  fp text;
  existing jsonb;
  paid bigint;
begin
  o := public.b19_finance_authorize('finance.issue', (p_input->>'school_id')::uuid);
  if nullif(btrim(p_input->>'reason'), '') is null then
    raise exception using errcode = 'P0001', message = 'B19_FINANCE_INVALID_STATE';
  end if;
  fp := public.b19_finance_fingerprint(p_input);
  existing := public.b19_finance_command_begin(
    (p_input->>'request_id')::uuid, 'invoice_void', fp, o,
    (p_input->>'school_id')::uuid
  );
  if existing is not null then
    return existing;
  end if;

  -- Serialization point shared with b19_record_finance_payment.
  select i.* into r
  from public.finance_invoices i
  where i.id = (p_input->>'invoice_id')::uuid
    and i.organization_id = o
    and i.school_id = (p_input->>'school_id')::uuid
  for update;

  -- Preserve the original non-enumerating stale contract, including missing
  -- resources, invalid document state, missing version, and stale version.
  if not found then
    raise exception using errcode = 'P0001', message = 'B19_FINANCE_STALE';
  end if;
  if r.document_status <> 'issued'
    or r.row_version is distinct from (p_input->>'expected_row_version')::bigint then
    raise exception using errcode = 'P0001', message = 'B19_FINANCE_STALE';
  end if;

  -- Separate statement AFTER the lock: fresh READ COMMITTED snapshot sees
  -- any payment that committed while this command waited for the invoice.
  -- Canonical valid settlement excludes full immutable reversal evidence.
  select coalesce(sum(a.amount_idr), 0) into paid
  from public.finance_payment_allocations a
  join public.finance_payments p on p.id = a.payment_id
  where a.invoice_id = r.id
    and not exists (
      select 1 from public.finance_payment_corrections c
      where c.original_payment_id = p.id
    );
  if paid <> 0 then
    raise exception using errcode = 'P0001', message = 'B19_FINANCE_INVALID_STATE';
  end if;

  update public.finance_invoices
  set document_status = 'void', row_version = row_version + 1
  where id = r.id
    and organization_id = o
    and school_id = r.school_id
    and document_status = 'issued'
    and row_version = r.row_version
  returning * into r;
  if not found then
    raise exception using errcode = 'P0001', message = 'B19_FINANCE_STALE';
  end if;

  insert into public.finance_invoice_status_history(
    organization_id, school_id, invoice_id, from_status, to_status,
    actor_profile_id, reason, request_id
  ) values (
    o, r.school_id, r.id, 'issued', 'void', auth.uid(),
    btrim(p_input->>'reason'), (p_input->>'request_id')::uuid
  );
  insert into public.audit_logs(
    organization_id, school_id, actor_profile_id, actor_type, action,
    entity_type, entity_id, before_data, after_data, metadata
  ) values (
    o, r.school_id, auth.uid(), 'user', 'invoice_void', 'finance_invoice', r.id,
    jsonb_build_object('document_status', 'issued', 'row_version', r.row_version - 1),
    jsonb_build_object('document_status', 'void', 'row_version', r.row_version),
    jsonb_build_object('request_id', (p_input->>'request_id')::uuid,
      'reason', btrim(p_input->>'reason'))
  );
  x := jsonb_build_object('invoice_id', r.id,
    'document_status', r.document_status, 'row_version', r.row_version);
  perform public.b19_finance_command_complete(
    (p_input->>'request_id')::uuid, 'invoice_void', x, 'invoice', r.id
  );
  return x;
end;
$$;

revoke all on function public.b19_void_finance_invoice(jsonb) from public, anon;
grant execute on function public.b19_void_finance_invoice(jsonb) to authenticated;

commit;
