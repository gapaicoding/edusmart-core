-- Batch 19 Phase 2 forward-only correction: parent projection is explicitly allowlisted.
begin;
create or replace function public.b19_get_parent_invoice(p_invoice_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='P0001',message='B19_FINANCE_FORBIDDEN'; end if;
  select jsonb_build_object(
    'invoice',jsonb_build_object('id',i.id,'invoice_number',i.invoice_number,'billing_period_key',i.billing_period_key,'issue_date',i.issue_date,'due_date',i.due_date,'document_status',i.document_status,'child_name',s.full_name),
    'items',coalesce((select jsonb_agg(jsonb_build_object('fee_code',ii.fee_code_snapshot,'name',ii.name_snapshot,'description',ii.description_snapshot,'quantity',ii.quantity,'unit_amount_idr',ii.unit_amount_idr,'line_amount_idr',ii.line_amount_idr,'currency',ii.currency)) from public.finance_invoice_items ii where ii.invoice_id=i.id),'[]'::jsonb),
    'settlement',public.b19_finance_settlement(i.id),
    'payments',coalesce((select jsonb_agg(jsonb_build_object('amount_idr',p.amount_idr,'received_at',p.received_at,'method',p.method,'reversed',exists(select 1 from public.finance_payment_corrections c where c.original_payment_id=p.id))) from public.finance_payment_allocations a join public.finance_payments p on p.id=a.payment_id where a.invoice_id=i.id),'[]'::jsonb)
  ) into result
  from public.finance_invoices i join public.students s on s.id=i.student_id and s.organization_id=i.organization_id
  where i.id=p_invoice_id and exists(select 1 from public.student_guardians sg join public.guardians g on g.id=sg.guardian_id where sg.student_id=i.student_id and sg.organization_id=i.organization_id and sg.status='active' and coalesce(sg.can_view_academic,false) and g.profile_id=auth.uid() and public.has_permission('finance.portal_read',i.organization_id,i.school_id,null,null,i.student_id));
  if result is null then raise exception using errcode='P0001',message='B19_FINANCE_NOT_FOUND'; end if;
  return result;
end; $$;
commit;
