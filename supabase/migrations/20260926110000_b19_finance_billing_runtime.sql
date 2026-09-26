-- EduSmart Core V1 / Batch 19 Phase 2
-- Finance and Billing commands, projections, CAS, idempotency, and ACL hardening.
begin;

create or replace function public.b19_finance_authorize(p_permission text, p_school_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception using errcode='P0001',message='B19_FINANCE_FORBIDDEN'; end if;
  select s.organization_id into v_org from public.schools s where s.id=p_school_id;
  if v_org is null or not public.has_permission(p_permission,v_org,p_school_id) then
    raise exception using errcode='P0001',message='B19_FINANCE_FORBIDDEN';
  end if;
  return v_org;
end; $$;

create or replace function public.b19_finance_fingerprint(p_payload jsonb)
returns text language sql immutable set search_path = '' as $$
  select pg_catalog.encode(extensions.digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex');
$$;

create or replace function public.b19_finance_command_begin(
  p_request_id uuid,p_command_name text,p_fingerprint text,p_org uuid,p_school uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.finance_command_requests;
begin
  insert into public.finance_command_requests(organization_id,school_id,actor_profile_id,request_id,command_name,resource_type,semantic_fingerprint)
  values(p_org,p_school,auth.uid(),p_request_id,p_command_name,'finance',p_fingerprint)
  on conflict (actor_profile_id,command_name,request_id) do nothing;
  select * into v from public.finance_command_requests
   where actor_profile_id=auth.uid() and command_name=p_command_name and request_id=p_request_id for update;
  if v.semantic_fingerprint<>p_fingerprint then raise exception using errcode='P0001',message='B19_FINANCE_REQUEST_CONFLICT'; end if;
  if v.status='processing' and v.created_at < now()-interval '15 minutes' then
    raise exception using errcode='P0001',message='B19_FINANCE_REQUEST_CONFLICT';
  end if;
  if v.status='completed' then return v.result_payload; end if;
  return null;
end; $$;

create or replace function public.b19_finance_command_complete(
  p_request_id uuid,p_command_name text,p_result jsonb,p_type text,p_resource uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.finance_command_requests set resource_type=p_type,resource_id=p_resource,
    result_payload=p_result,status='completed',completed_at=clock_timestamp()
  where actor_profile_id=auth.uid() and request_id=p_request_id and command_name=p_command_name;
end; $$;

create or replace function public.b19_finance_settlement(p_invoice_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
with total as (select coalesce(sum(line_amount_idr),0)::bigint amount from public.finance_invoice_items where invoice_id=p_invoice_id),
paid as (select coalesce(sum(a.amount_idr),0)::bigint amount from public.finance_payment_allocations a
  join public.finance_payments p on p.id=a.payment_id
  where a.invoice_id=p_invoice_id and not exists(select 1 from public.finance_payment_corrections c where c.original_payment_id=p.id))
select jsonb_build_object('invoice_total',total.amount,'paid',paid.amount,'outstanding',total.amount-paid.amount,
  'settlement',case when paid.amount=0 then 'unpaid' when paid.amount<total.amount then 'partially_paid' else 'paid' end)
from total,paid;
$$;

create or replace function public.b19_finance_assert_open_year(p_year uuid,p_org uuid,p_school uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from public.academic_years where id=p_year and organization_id=p_org and school_id=p_school;
  if v_status is null then raise exception using errcode='P0001',message='B19_FINANCE_INVALID_ENROLLMENT'; end if;
  if v_status in ('closed','archived') then raise exception using errcode='P0001',message='B19_FINANCE_CLOSED_PERIOD'; end if;
end; $$;

create or replace function public.b19_create_finance_fee_definition(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; x jsonb; r public.finance_fee_definitions; fp text; existing jsonb;
begin
  o:=public.b19_finance_authorize('finance.manage_fees',(p_input->>'school_id')::uuid);
  fp:=public.b19_finance_fingerprint(p_input); existing:=public.b19_finance_command_begin((p_input->>'request_id')::uuid,'fee_create',fp,o,(p_input->>'school_id')::uuid); if existing is not null then return existing; end if;
  insert into public.finance_fee_definitions(organization_id,school_id,code,name,description,default_amount_idr,charge_kind,grade_level_id,academic_year_id)
  values(o,(p_input->>'school_id')::uuid,upper(btrim(p_input->>'code')),btrim(p_input->>'name'),nullif(btrim(p_input->>'description'),''),(p_input->>'amount_idr')::bigint,p_input->>'charge_kind',nullif(p_input->>'grade_level_id','')::uuid,nullif(p_input->>'academic_year_id','')::uuid)
  returning * into r;
  x:=jsonb_build_object('fee_id',r.id,'school_id',r.school_id,'row_version',r.row_version,'status',r.status);
  perform public.b19_finance_command_complete((p_input->>'request_id')::uuid,'fee_create',x,'fee_definition',r.id); return x;
exception when unique_violation then raise exception using errcode='P0001',message='B19_FINANCE_REQUEST_CONFLICT';
end; $$;

create or replace function public.b19_update_finance_fee_definition(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; r public.finance_fee_definitions; x jsonb; fp text; existing jsonb;
begin
  o:=public.b19_finance_authorize('finance.manage_fees',(p_input->>'school_id')::uuid); fp:=public.b19_finance_fingerprint(p_input);
  existing:=public.b19_finance_command_begin((p_input->>'request_id')::uuid,'fee_update',fp,o,(p_input->>'school_id')::uuid); if existing is not null then return existing; end if;
  update public.finance_fee_definitions set name=btrim(p_input->>'name'),description=nullif(btrim(p_input->>'description'),''),default_amount_idr=(p_input->>'amount_idr')::bigint,charge_kind=p_input->>'charge_kind',row_version=row_version+1
  where id=(p_input->>'fee_id')::uuid and school_id=(p_input->>'school_id')::uuid and organization_id=o and status='active' and row_version=(p_input->>'expected_row_version')::bigint returning * into r;
  if not found then raise exception using errcode='P0001',message='B19_FINANCE_STALE'; end if;
  x:=jsonb_build_object('fee_id',r.id,'row_version',r.row_version,'status',r.status); perform public.b19_finance_command_complete((p_input->>'request_id')::uuid,'fee_update',x,'fee_definition',r.id); return x;
end; $$;

create or replace function public.b19_archive_finance_fee_definition(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; r public.finance_fee_definitions; x jsonb; fp text; existing jsonb;
begin
  o:=public.b19_finance_authorize('finance.manage_fees',(p_input->>'school_id')::uuid); fp:=public.b19_finance_fingerprint(p_input); existing:=public.b19_finance_command_begin((p_input->>'request_id')::uuid,'fee_archive',fp,o,(p_input->>'school_id')::uuid); if existing is not null then return existing; end if;
  update public.finance_fee_definitions set status='archived',row_version=row_version+1 where id=(p_input->>'fee_id')::uuid and organization_id=o and school_id=(p_input->>'school_id')::uuid and status='active' and row_version=(p_input->>'expected_row_version')::bigint returning * into r;
  if not found then raise exception using errcode='P0001',message='B19_FINANCE_STALE'; end if;
  x:=jsonb_build_object('fee_id',r.id,'row_version',r.row_version,'status',r.status); perform public.b19_finance_command_complete((p_input->>'request_id')::uuid,'fee_archive',x,'fee_definition',r.id); return x;
end; $$;

create or replace function public.b19_create_finance_billing_plan(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; r public.finance_billing_plans; x jsonb; fp text; existing jsonb;
begin
  o:=public.b19_finance_authorize('finance.manage_billing',(p_input->>'school_id')::uuid); fp:=public.b19_finance_fingerprint(p_input); existing:=public.b19_finance_command_begin((p_input->>'request_id')::uuid,'billing_plan_create',fp,o,(p_input->>'school_id')::uuid); if existing is not null then return existing; end if;
  insert into public.finance_billing_plans(organization_id,school_id,code,name,description) values(o,(p_input->>'school_id')::uuid,upper(btrim(p_input->>'code')),btrim(p_input->>'name'),nullif(btrim(p_input->>'description'),'')) returning * into r;
  x:=jsonb_build_object('plan_id',r.id,'row_version',r.row_version,'status',r.status); perform public.b19_finance_command_complete((p_input->>'request_id')::uuid,'billing_plan_create',x,'billing_plan',r.id); return x;
exception when unique_violation then raise exception using errcode='P0001',message='B19_FINANCE_REQUEST_CONFLICT'; end; $$;

create or replace function public.b19_update_finance_billing_plan(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; r public.finance_billing_plans; x jsonb; fp text; existing jsonb;
begin
  o:=public.b19_finance_authorize('finance.manage_billing',(p_input->>'school_id')::uuid); fp:=public.b19_finance_fingerprint(p_input); existing:=public.b19_finance_command_begin((p_input->>'request_id')::uuid,'billing_plan_update',fp,o,(p_input->>'school_id')::uuid); if existing is not null then return existing; end if;
  update public.finance_billing_plans set name=btrim(p_input->>'name'),description=nullif(btrim(p_input->>'description'),''),row_version=row_version+1 where id=(p_input->>'plan_id')::uuid and organization_id=o and school_id=(p_input->>'school_id')::uuid and row_version=(p_input->>'expected_row_version')::bigint returning * into r;
  if not found then raise exception using errcode='P0001',message='B19_FINANCE_STALE'; end if;
  x:=jsonb_build_object('plan_id',r.id,'row_version',r.row_version,'status',r.status); perform public.b19_finance_command_complete((p_input->>'request_id')::uuid,'billing_plan_update',x,'billing_plan',r.id); return x;
end; $$;

create or replace function public.b19_create_finance_billing_plan_version(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; f public.finance_fee_definitions; pl public.finance_billing_plans; r public.finance_billing_plan_versions; x jsonb; fp text; existing jsonb; n integer;
begin
  o:=public.b19_finance_authorize('finance.manage_billing',(p_input->>'school_id')::uuid);
  select * into pl from public.finance_billing_plans where id=(p_input->>'billing_plan_id')::uuid and organization_id=o and school_id=(p_input->>'school_id')::uuid;
  if pl.id is null then raise exception using errcode='P0001',message='B19_FINANCE_NOT_FOUND'; end if;
  select * into f from public.finance_fee_definitions where id=(p_input->>'fee_definition_id')::uuid and organization_id=o and school_id=pl.school_id and status='active';
  if f.id is null then raise exception using errcode='P0001',message='B19_FINANCE_NOT_FOUND'; end if;
  perform public.b19_finance_assert_open_year((p_input->>'academic_year_id')::uuid,o,pl.school_id);
  fp:=public.b19_finance_fingerprint(p_input); existing:=public.b19_finance_command_begin((p_input->>'request_id')::uuid,'billing_plan_activate',fp,o,pl.school_id); if existing is not null then return existing; end if;
  select coalesce(max(version_number),0)+1 into n from public.finance_billing_plan_versions where billing_plan_id=pl.id;
  insert into public.finance_billing_plan_versions(organization_id,school_id,billing_plan_id,version_number,fee_definition_id,fee_code_snapshot,fee_name_snapshot,fee_description_snapshot,amount_idr,currency,charge_kind,target_type,grade_level_id,academic_year_id,due_day,status)
  values(o,pl.school_id,pl.id,n,f.id,f.code,f.name,f.description,f.default_amount_idr,'IDR',f.charge_kind,p_input->>'target_type',nullif(p_input->>'grade_level_id','')::uuid,(p_input->>'academic_year_id')::uuid, nullif(p_input->>'due_day','')::smallint,'active') returning * into r;
  x:=jsonb_build_object('plan_version_id',r.id,'version_number',r.version_number,'amount_idr',r.amount_idr,'status',r.status); perform public.b19_finance_command_complete((p_input->>'request_id')::uuid,'billing_plan_activate',x,'billing_plan_version',r.id); return x;
end; $$;

create or replace function public.b19_add_finance_billing_plan_target(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; r public.finance_billing_plan_targets; v public.finance_billing_plan_versions; e public.student_enrollments;
begin
  o:=public.b19_finance_authorize('finance.manage_billing',(p_input->>'school_id')::uuid);
  select * into v from public.finance_billing_plan_versions where id=(p_input->>'plan_version_id')::uuid and organization_id=o and school_id=(p_input->>'school_id')::uuid and target_type='explicit_enrollment';
  select * into e from public.student_enrollments where id=(p_input->>'student_enrollment_id')::uuid and organization_id=o and school_id=(p_input->>'school_id')::uuid and academic_year_id=v.academic_year_id and status='active';
  if v.id is null or e.id is null then raise exception using errcode='P0001',message='B19_FINANCE_INVALID_ENROLLMENT'; end if;
  insert into public.finance_billing_plan_targets(organization_id,school_id,billing_plan_version_id,academic_year_id,student_enrollment_id) values(o,e.school_id,v.id,v.academic_year_id,e.id) on conflict do nothing returning * into r;
  return jsonb_build_object('target_id',coalesce(r.id,(select id from public.finance_billing_plan_targets where billing_plan_version_id=v.id and student_enrollment_id=e.id)),'plan_version_id',v.id);
end; $$;

create or replace function public.b19_generate_finance_invoice_internal(p_org uuid,p_school uuid,p_version uuid,p_enrollment uuid,p_period text,p_actor uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.finance_billing_plan_versions; e public.student_enrollments; f public.finance_fee_definitions; i public.finance_invoices; c public.finance_invoice_number_counters; seqkey text; num text;
begin
  select * into v from public.finance_billing_plan_versions where id=p_version and organization_id=p_org and school_id=p_school and status='active' for share;
  if v.id is null then raise exception using errcode='P0001',message='B19_FINANCE_NOT_FOUND'; end if;
  perform public.b19_finance_assert_open_year(v.academic_year_id,p_org,p_school);
  select * into e from public.student_enrollments where id=p_enrollment and organization_id=p_org and school_id=p_school and academic_year_id=v.academic_year_id and status='active';
  if e.id is null or (v.target_type='grade' and e.grade_level_id<>v.grade_level_id) or (v.target_type='explicit_enrollment' and not exists(select 1 from public.finance_billing_plan_targets t where t.billing_plan_version_id=v.id and t.student_enrollment_id=e.id)) then raise exception using errcode='P0001',message='B19_FINANCE_INVALID_ENROLLMENT'; end if;
  select * into i from public.finance_invoices where billing_plan_version_id=v.id and student_enrollment_id=e.id and billing_period_key=p_period;
  if i.id is not null then return i.id; end if;
  seqkey:=case when p_period='ONE_TIME' then to_char(current_date,'YYYY-MM') else p_period end;
  insert into public.finance_invoice_number_counters(organization_id,school_id,sequence_key) values(p_org,p_school,seqkey) on conflict (school_id,sequence_key) do nothing;
  select * into c from public.finance_invoice_number_counters where school_id=p_school and sequence_key=seqkey for update;
  num:='INV-'||seqkey||'-'||lpad(c.next_value::text,6,'0'); update public.finance_invoice_number_counters set next_value=next_value+1 where id=c.id;
  insert into public.finance_invoices(organization_id,school_id,student_id,student_enrollment_id,academic_year_id,billing_plan_version_id,source_type,billing_period_key,invoice_number,due_date,created_by_profile_id)
  values(p_org,p_school,e.student_id,e.id,e.academic_year_id,v.id,'billing_plan',p_period,num,(case when p_period='ONE_TIME' then current_date+interval '30 days' when v.due_day is null then (p_period||'-01')::date+interval '29 days' else make_date(left(p_period,4)::int,right(p_period,2)::int,least(v.due_day,extract(day from (date_trunc('month',(p_period||'-01')::date)+interval '1 month - 1 day'))::int)) end)::date,p_actor) returning * into i;
  insert into public.finance_invoice_items(organization_id,school_id,invoice_id,source_fee_definition_id,billing_plan_version_id,fee_code_snapshot,name_snapshot,description_snapshot,quantity,unit_amount_idr,line_amount_idr)
  values(p_org,p_school,i.id,v.fee_definition_id,v.id,v.fee_code_snapshot,v.fee_name_snapshot,v.fee_description_snapshot,1,v.amount_idr,v.amount_idr);
  return i.id;
end; $$;

create or replace function public.b19_generate_finance_invoice(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; id uuid; i public.finance_invoices; x jsonb; fp text; existing jsonb;
begin
  o:=public.b19_finance_authorize('finance.manage_billing',(p_input->>'school_id')::uuid); fp:=public.b19_finance_fingerprint(p_input); existing:=public.b19_finance_command_begin((p_input->>'request_id')::uuid,'invoice_generate',fp,o,(p_input->>'school_id')::uuid); if existing is not null then return existing; end if;
  id:=public.b19_generate_finance_invoice_internal(o,(p_input->>'school_id')::uuid,(p_input->>'plan_version_id')::uuid,(p_input->>'student_enrollment_id')::uuid,p_input->>'billing_period_key',auth.uid()); select * into i from public.finance_invoices where i.id=id;
  x:=jsonb_build_object('invoice_id',i.id,'invoice_number',i.invoice_number,'document_status',i.document_status,'row_version',i.row_version); perform public.b19_finance_command_complete((p_input->>'request_id')::uuid,'invoice_generate',x,'invoice',i.id); return x;
end; $$;

create or replace function public.b19_generate_finance_invoices(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; v public.finance_billing_plan_versions; e record; count integer:=0; id uuid; x jsonb; fp text; existing jsonb; period text;
begin
  o:=public.b19_finance_authorize('finance.manage_billing',(p_input->>'school_id')::uuid); period:=p_input->>'billing_period_key'; if period is null or (period<>'ONE_TIME' and period !~ '^[0-9]{4}-[0-9]{2}$') then raise exception using errcode='P0001',message='B19_FINANCE_INVALID_STATE'; end if;
  select * into v from public.finance_billing_plan_versions where id=(p_input->>'plan_version_id')::uuid and organization_id=o and school_id=(p_input->>'school_id')::uuid and status='active'; if v.id is null then raise exception using errcode='P0001',message='B19_FINANCE_NOT_FOUND'; end if;
  fp:=public.b19_finance_fingerprint(p_input); existing:=public.b19_finance_command_begin((p_input->>'request_id')::uuid,'invoice_generate',fp,o,(p_input->>'school_id')::uuid); if existing is not null then return existing; end if;
  perform public.b19_finance_assert_open_year(v.academic_year_id,o,v.school_id);
  for e in select se.id from public.student_enrollments se where se.organization_id=o and se.school_id=v.school_id and se.academic_year_id=v.academic_year_id and se.status='active' and ((v.target_type='school') or (v.target_type='grade' and se.grade_level_id=v.grade_level_id) or (v.target_type='explicit_enrollment' and exists(select 1 from public.finance_billing_plan_targets t where t.billing_plan_version_id=v.id and t.student_enrollment_id=se.id))) order by se.id limit 501 loop
    count:=count+1; if count>500 then raise exception using errcode='P0001',message='B19_FINANCE_INVALID_STATE'; end if; id:=public.b19_generate_finance_invoice_internal(o,v.school_id,v.id,e.id,period,auth.uid()); end loop;
  x:=jsonb_build_object('plan_version_id',v.id,'billing_period_key',period,'generated_count',count); perform public.b19_finance_command_complete((p_input->>'request_id')::uuid,'invoice_generate',x,'billing_plan_version',v.id); return x;
end; $$;

create or replace function public.b19_update_finance_draft_invoice(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; r public.finance_invoices; x jsonb; fp text; existing jsonb;
begin
  o:=public.b19_finance_authorize('finance.manage_billing',(p_input->>'school_id')::uuid); fp:=public.b19_finance_fingerprint(p_input); existing:=public.b19_finance_command_begin((p_input->>'request_id')::uuid,'invoice_generate',fp,o,(p_input->>'school_id')::uuid); if existing is not null then return existing; end if;
  update public.finance_invoices set due_date=(p_input->>'due_date')::date,row_version=row_version+1 where id=(p_input->>'invoice_id')::uuid and organization_id=o and school_id=(p_input->>'school_id')::uuid and document_status='draft' and row_version=(p_input->>'expected_row_version')::bigint returning * into r;
  if not found then raise exception using errcode='P0001',message='B19_FINANCE_STALE'; end if; x:=jsonb_build_object('invoice_id',r.id,'row_version',r.row_version); perform public.b19_finance_command_complete((p_input->>'request_id')::uuid,'invoice_generate',x,'invoice',r.id); return x;
end; $$;

create or replace function public.b19_issue_finance_invoice(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; r public.finance_invoices; x jsonb; fp text; existing jsonb; total bigint;
begin
  o:=public.b19_finance_authorize('finance.issue',(p_input->>'school_id')::uuid); fp:=public.b19_finance_fingerprint(p_input); existing:=public.b19_finance_command_begin((p_input->>'request_id')::uuid,'invoice_issue',fp,o,(p_input->>'school_id')::uuid); if existing is not null then return existing; end if;
  select coalesce(sum(line_amount_idr),0) into total from public.finance_invoice_items where invoice_id=(p_input->>'invoice_id')::uuid; if total<=0 then raise exception using errcode='P0001',message='B19_FINANCE_INVALID_STATE'; end if;
  update public.finance_invoices set document_status='issued',issue_date=current_date,issued_at=clock_timestamp(),issued_by_profile_id=auth.uid(),row_version=row_version+1 where id=(p_input->>'invoice_id')::uuid and organization_id=o and school_id=(p_input->>'school_id')::uuid and document_status='draft' and row_version=(p_input->>'expected_row_version')::bigint returning * into r;
  if not found then raise exception using errcode='P0001',message='B19_FINANCE_STALE'; end if;
  insert into public.finance_invoice_status_history(organization_id,school_id,invoice_id,from_status,to_status,actor_profile_id,request_id) values(o,r.school_id,r.id,'draft','issued',auth.uid(),(p_input->>'request_id')::uuid);
  x:=jsonb_build_object('invoice_id',r.id,'document_status',r.document_status,'row_version',r.row_version); perform public.b19_finance_command_complete((p_input->>'request_id')::uuid,'invoice_issue',x,'invoice',r.id); return x;
end; $$;

create or replace function public.b19_void_finance_invoice(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; r public.finance_invoices; x jsonb; fp text; existing jsonb; paid bigint;
begin
  o:=public.b19_finance_authorize('finance.issue',(p_input->>'school_id')::uuid); if nullif(btrim(p_input->>'reason'),'') is null then raise exception using errcode='P0001',message='B19_FINANCE_INVALID_STATE'; end if; fp:=public.b19_finance_fingerprint(p_input); existing:=public.b19_finance_command_begin((p_input->>'request_id')::uuid,'invoice_void',fp,o,(p_input->>'school_id')::uuid); if existing is not null then return existing; end if;
  select coalesce(sum(a.amount_idr),0) into paid from public.finance_payment_allocations a join public.finance_payments p on p.id=a.payment_id where a.invoice_id=(p_input->>'invoice_id')::uuid and not exists(select 1 from public.finance_payment_corrections c where c.original_payment_id=p.id);
  if paid>0 then raise exception using errcode='P0001',message='B19_FINANCE_INVALID_STATE'; end if;
  update public.finance_invoices set document_status='void',row_version=row_version+1 where id=(p_input->>'invoice_id')::uuid and organization_id=o and school_id=(p_input->>'school_id')::uuid and document_status='issued' and row_version=(p_input->>'expected_row_version')::bigint returning * into r;
  if not found then raise exception using errcode='P0001',message='B19_FINANCE_STALE'; end if;
  insert into public.finance_invoice_status_history(organization_id,school_id,invoice_id,from_status,to_status,actor_profile_id,reason,request_id) values(o,r.school_id,r.id,'issued','void',auth.uid(),btrim(p_input->>'reason'),(p_input->>'request_id')::uuid);
  x:=jsonb_build_object('invoice_id',r.id,'document_status',r.document_status,'row_version',r.row_version); perform public.b19_finance_command_complete((p_input->>'request_id')::uuid,'invoice_void',x,'invoice',r.id); return x;
end; $$;

create or replace function public.b19_record_finance_payment(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; i public.finance_invoices; e public.student_enrollments; p public.finance_payments; a public.finance_payment_allocations; x jsonb; fp text; existing jsonb; total bigint; paid bigint; amount bigint;
begin
  o:=public.b19_finance_authorize('finance.record_payment',(p_input->>'school_id')::uuid); amount:=(p_input->>'amount_idr')::bigint; if amount<=0 then raise exception using errcode='P0001',message='B19_FINANCE_INVALID_STATE'; end if; fp:=public.b19_finance_fingerprint(p_input); existing:=public.b19_finance_command_begin((p_input->>'request_id')::uuid,'payment_record',fp,o,(p_input->>'school_id')::uuid); if existing is not null then return existing; end if;
  select * into i from public.finance_invoices where id=(p_input->>'invoice_id')::uuid and organization_id=o and school_id=(p_input->>'school_id')::uuid for update; if i.id is null then raise exception using errcode='P0001',message='B19_FINANCE_NOT_FOUND'; end if; if i.document_status<>'issued' then raise exception using errcode='P0001',message='B19_FINANCE_INVALID_STATE'; end if;
  select coalesce(sum(line_amount_idr),0) into total from public.finance_invoice_items where invoice_id=i.id; select coalesce(sum(pa.amount_idr),0) into paid from public.finance_payment_allocations pa join public.finance_payments pp on pp.id=pa.payment_id where pa.invoice_id=i.id and not exists(select 1 from public.finance_payment_corrections pc where pc.original_payment_id=pp.id);
  if amount>total-paid then raise exception using errcode='P0001',message='B19_FINANCE_OVER_ALLOCATION'; end if;
  select * into e from public.student_enrollments where id=i.student_enrollment_id and student_id=i.student_id and academic_year_id=i.academic_year_id and organization_id=o and school_id=i.school_id; if e.id is null then raise exception using errcode='P0001',message='B19_FINANCE_INVALID_ENROLLMENT'; end if;
  insert into public.finance_payments(organization_id,school_id,student_id,student_enrollment_id,academic_year_id,amount_idr,received_at,method,manual_reference,note,recorded_by_profile_id) values(o,i.school_id,i.student_id,i.student_enrollment_id,i.academic_year_id,amount,coalesce((p_input->>'received_at')::timestamptz,clock_timestamp()),p_input->>'method',nullif(btrim(p_input->>'manual_reference'),''),nullif(p_input->>'note',''),auth.uid()) returning * into p;
  insert into public.finance_payment_allocations(organization_id,school_id,student_id,student_enrollment_id,currency,payment_id,invoice_id,amount_idr) values(o,i.school_id,i.student_id,i.student_enrollment_id,'IDR',p.id,i.id,amount) returning * into a;
  x:=jsonb_build_object('payment_id',p.id,'allocation_id',a.id,'invoice_id',i.id,'amount_idr',amount); perform public.b19_finance_command_complete((p_input->>'request_id')::uuid,'payment_record',x,'payment',p.id); return x;
end; $$;

create or replace function public.b19_reverse_finance_payment(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o uuid; p public.finance_payments; c public.finance_payment_corrections; x jsonb; fp text; existing jsonb;
begin
  o:=public.b19_finance_authorize('finance.adjust',(p_input->>'school_id')::uuid); if nullif(btrim(p_input->>'reason'),'') is null then raise exception using errcode='P0001',message='B19_FINANCE_INVALID_STATE'; end if; fp:=public.b19_finance_fingerprint(p_input); existing:=public.b19_finance_command_begin((p_input->>'request_id')::uuid,'payment_reverse',fp,o,(p_input->>'school_id')::uuid); if existing is not null then return existing; end if;
  select * into p from public.finance_payments where id=(p_input->>'payment_id')::uuid and organization_id=o and school_id=(p_input->>'school_id')::uuid for update; if p.id is null then raise exception using errcode='P0001',message='B19_FINANCE_NOT_FOUND'; end if; if exists(select 1 from public.finance_payment_corrections where original_payment_id=p.id) then raise exception using errcode='P0001',message='B19_FINANCE_ALREADY_REVERSED'; end if;
  insert into public.finance_payment_corrections(organization_id,school_id,original_payment_id,reason,corrected_by_profile_id,request_id) values(o,p.school_id,p.id,btrim(p_input->>'reason'),auth.uid(),(p_input->>'request_id')::uuid) returning * into c;
  x:=jsonb_build_object('correction_id',c.id,'payment_id',p.id,'status','reversed'); perform public.b19_finance_command_complete((p_input->>'request_id')::uuid,'payment_reverse',x,'payment_correction',c.id); return x;
end; $$;

create or replace function public.b19_list_finance_fees(p_school_id uuid,p_limit integer default 50,p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = '' as $$
select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select id,code,name,description,default_amount_idr,currency,charge_kind,status,row_version,created_at,updated_at from public.finance_fee_definitions where organization_id=public.b19_finance_authorize('finance.read',p_school_id) and school_id=p_school_id order by code limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0)) x;
$$;

create or replace function public.b19_list_finance_invoices(p_school_id uuid,p_limit integer default 50,p_offset integer default 0,p_billing_period_key text default null,p_document_status text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o uuid; result jsonb;
begin o:=public.b19_finance_authorize('finance.read',p_school_id); select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (select i.id,i.invoice_number,i.student_id,s.full_name student_name,i.student_enrollment_id,i.billing_period_key,i.issue_date,i.due_date,i.document_status,i.row_version,(public.b19_finance_settlement(i.id)||jsonb_build_object('overdue',i.document_status='issued' and ((public.b19_finance_settlement(i.id)->>'outstanding')::bigint)>0 and current_date>i.due_date)) settlement from public.finance_invoices i join public.students s on s.id=i.student_id and s.organization_id=o where i.organization_id=o and i.school_id=p_school_id and (p_billing_period_key is null or i.billing_period_key=p_billing_period_key) and (p_document_status is null or i.document_status=p_document_status) order by i.created_at desc limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0)) x; return result; end; $$;

create or replace function public.b19_get_finance_invoice(p_school_id uuid,p_invoice_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o uuid; result jsonb;
begin o:=public.b19_finance_authorize('finance.read',p_school_id); select jsonb_build_object('invoice',to_jsonb(i),'items',coalesce((select jsonb_agg(to_jsonb(ii)) from public.finance_invoice_items ii where ii.invoice_id=i.id),'[]'::jsonb),'settlement',public.b19_finance_settlement(i.id),'payments',coalesce((select jsonb_agg(jsonb_build_object('payment_id',p.id,'amount_idr',p.amount_idr,'received_at',p.received_at,'method',p.method,'reversed',exists(select 1 from public.finance_payment_corrections c where c.original_payment_id=p.id))) from public.finance_payment_allocations a join public.finance_payments p on p.id=a.payment_id where a.invoice_id=i.id),'[]'::jsonb),'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from public.finance_invoice_status_history h where h.invoice_id=i.id),'[]'::jsonb)) into result from public.finance_invoices i where i.id=p_invoice_id and i.organization_id=o and i.school_id=p_school_id; if result is null then raise exception using errcode='P0001',message='B19_FINANCE_NOT_FOUND'; end if; return result; end; $$;

create or replace function public.b19_get_finance_summary(p_school_id uuid,p_billing_period_key text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o uuid; result jsonb;
begin o:=public.b19_finance_authorize('finance.read',p_school_id); select jsonb_build_object('issued_total',coalesce(sum(case when i.document_status='issued' then s.invoice_total else 0 end),0),'collected_total',coalesce(sum(s.paid),0),'outstanding_total',coalesce(sum(case when i.document_status='issued' then s.outstanding else 0 end),0),'overdue_count',count(*) filter(where i.document_status='issued' and s.outstanding>0 and current_date>i.due_date),'overdue_amount',coalesce(sum(case when i.document_status='issued' and s.outstanding>0 and current_date>i.due_date then s.outstanding else 0 end),0)) into result from public.finance_invoices i cross join lateral (select (public.b19_finance_settlement(i.id)->>'invoice_total')::bigint invoice_total,(public.b19_finance_settlement(i.id)->>'paid')::bigint paid,(public.b19_finance_settlement(i.id)->>'outstanding')::bigint outstanding) s where i.organization_id=o and i.school_id=p_school_id and (p_billing_period_key is null or i.billing_period_key=p_billing_period_key); return result; end; $$;

create or replace function public.b19_list_finance_payments(p_school_id uuid,p_limit integer default 50,p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = '' as $$
select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select p.id payment_id,p.amount_idr,p.received_at,p.method,p.manual_reference,a.invoice_id,p.student_id,s.full_name student_name,exists(select 1 from public.finance_payment_corrections c where c.original_payment_id=p.id) reversed from public.finance_payments p join public.students s on s.id=p.student_id and s.organization_id=p.organization_id join public.finance_payment_allocations a on a.payment_id=p.id where p.organization_id=public.b19_finance_authorize('finance.read',p_school_id) and p.school_id=p_school_id order by p.received_at desc limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0)) x;
$$;

create or replace function public.b19_list_parent_billing(p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='P0001',message='B19_FINANCE_FORBIDDEN'; end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (select i.id,i.invoice_number,i.billing_period_key,i.issue_date,i.due_date,i.document_status,s.full_name child_name,(public.b19_finance_settlement(i.id)) settlement from public.finance_invoices i join public.students s on s.id=i.student_id where exists(select 1 from public.student_guardians sg join public.guardians g on g.id=sg.guardian_id where sg.student_id=i.student_id and sg.organization_id=i.organization_id and sg.status='active' and coalesce(sg.can_view_academic,false) and g.profile_id=auth.uid() and public.has_permission('finance.portal_read',i.organization_id,i.school_id,null,null,i.student_id)) order by i.created_at desc limit least(greatest(coalesce(p_limit,50),1),100) offset greatest(coalesce(p_offset,0),0)) x; return result;
end; $$;

create or replace function public.b19_get_parent_invoice(p_invoice_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='P0001',message='B19_FINANCE_FORBIDDEN'; end if;
  select jsonb_build_object('invoice',to_jsonb(i),'items',coalesce((select jsonb_agg(to_jsonb(ii)) from public.finance_invoice_items ii where ii.invoice_id=i.id),'[]'::jsonb),'settlement',public.b19_finance_settlement(i.id),'payments',coalesce((select jsonb_agg(jsonb_build_object('amount_idr',p.amount_idr,'received_at',p.received_at,'method',p.method,'reversed',exists(select 1 from public.finance_payment_corrections c where c.original_payment_id=p.id))) from public.finance_payment_allocations a join public.finance_payments p on p.id=a.payment_id where a.invoice_id=i.id),'[]'::jsonb)) into result from public.finance_invoices i where i.id=p_invoice_id and exists(select 1 from public.student_guardians sg join public.guardians g on g.id=sg.guardian_id where sg.student_id=i.student_id and sg.organization_id=i.organization_id and sg.status='active' and coalesce(sg.can_view_academic,false) and g.profile_id=auth.uid() and public.has_permission('finance.portal_read',i.organization_id,i.school_id,null,null,i.student_id));
  if result is null then raise exception using errcode='P0001',message='B19_FINANCE_NOT_FOUND'; end if; return result;
end; $$;

-- No anonymous or PUBLIC Finance execution. Application functions are authenticated only.
do $$ declare r record; begin
  for r in select p.oid::regprocedure proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'b19_%finance%' loop execute format('revoke all on function %s from public,anon,authenticated,service_role',r.proc); end loop;
end $$;

grant execute on function public.b19_create_finance_fee_definition(jsonb), public.b19_update_finance_fee_definition(jsonb), public.b19_archive_finance_fee_definition(jsonb), public.b19_create_finance_billing_plan(jsonb), public.b19_update_finance_billing_plan(jsonb), public.b19_create_finance_billing_plan_version(jsonb), public.b19_add_finance_billing_plan_target(jsonb), public.b19_generate_finance_invoice(jsonb), public.b19_generate_finance_invoices(jsonb), public.b19_update_finance_draft_invoice(jsonb), public.b19_issue_finance_invoice(jsonb), public.b19_void_finance_invoice(jsonb), public.b19_record_finance_payment(jsonb), public.b19_reverse_finance_payment(jsonb), public.b19_list_finance_fees(uuid,integer,integer), public.b19_list_finance_invoices(uuid,integer,integer,text,text), public.b19_get_finance_invoice(uuid,uuid), public.b19_get_finance_summary(uuid,text), public.b19_list_finance_payments(uuid,integer,integer), public.b19_list_parent_billing(integer,integer), public.b19_get_parent_invoice(uuid) to authenticated;

commit;
