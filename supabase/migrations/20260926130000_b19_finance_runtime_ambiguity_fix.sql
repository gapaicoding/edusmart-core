-- Batch 19 Phase 2 forward-only correction: qualify the generated invoice id.
begin;
create or replace function public.b19_generate_finance_invoice(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; v_invoice_id uuid; i public.finance_invoices; x jsonb; fp text; existing jsonb;
begin
  o:=public.b19_finance_authorize('finance.manage_billing',(p_input->>'school_id')::uuid);
  fp:=public.b19_finance_fingerprint(p_input);
  existing:=public.b19_finance_command_begin((p_input->>'request_id')::uuid,'invoice_generate',fp,o,(p_input->>'school_id')::uuid);
  if existing is not null then return existing; end if;
  v_invoice_id:=public.b19_generate_finance_invoice_internal(o,(p_input->>'school_id')::uuid,(p_input->>'plan_version_id')::uuid,(p_input->>'student_enrollment_id')::uuid,p_input->>'billing_period_key',auth.uid());
  select fi.* into i from public.finance_invoices fi where fi.id=v_invoice_id;
  x:=jsonb_build_object('invoice_id',i.id,'invoice_number',i.invoice_number,'document_status',i.document_status,'row_version',i.row_version);
  perform public.b19_finance_command_complete((p_input->>'request_id')::uuid,'invoice_generate',x,'invoice',i.id);
  return x;
end; $$;
commit;
