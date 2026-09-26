-- Batch 19 remediation B19-P3-DB-02: bounded, school-scoped staff plan reads.
begin;

create or replace function public.b19_list_finance_billing_plans(
  p_school_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  from (
    select p.id, p.code, p.name, p.description, p.status, p.row_version, p.created_at, p.updated_at,
      (select count(*) from public.finance_billing_plan_versions v
       where v.billing_plan_id = p.id and v.organization_id = p.organization_id and v.school_id = p.school_id)::integer as version_count
    from public.finance_billing_plans p
    where p.organization_id = public.b19_finance_authorize('finance.read', p_school_id)
      and p.school_id = p_school_id
    order by p.code
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  ) x;
$$;

create or replace function public.b19_get_finance_billing_plan(
  p_school_id uuid,
  p_billing_plan_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o uuid; result jsonb;
begin
  o := public.b19_finance_authorize('finance.read', p_school_id);
  select jsonb_build_object(
    'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description,
    'status', p.status, 'row_version', p.row_version, 'created_at', p.created_at, 'updated_at', p.updated_at,
    'version_count', (select count(*) from public.finance_billing_plan_versions v
      where v.billing_plan_id = p.id and v.organization_id = p.organization_id and v.school_id = p.school_id)::integer
  ) into result
  from public.finance_billing_plans p
  where p.id = p_billing_plan_id and p.organization_id = o and p.school_id = p_school_id;
  if result is null then raise exception using errcode = 'P0001', message = 'B19_FINANCE_NOT_FOUND'; end if;
  return result;
end;
$$;

create or replace function public.b19_list_finance_billing_plan_versions(
  p_school_id uuid,
  p_billing_plan_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  from (
    select v.id, v.billing_plan_id, v.version_number, v.fee_definition_id,
      v.fee_code_snapshot, v.fee_name_snapshot, v.amount_idr, v.currency, v.charge_kind,
      v.target_type, v.grade_level_id, v.academic_year_id, v.due_day, v.status, v.locked_at, v.created_at,
      (select count(*) from public.finance_billing_plan_targets t
       where t.billing_plan_version_id = v.id and t.organization_id = v.organization_id and t.school_id = v.school_id)::integer as target_count
    from public.finance_billing_plan_versions v
    where v.organization_id = public.b19_finance_authorize('finance.read', p_school_id)
      and v.school_id = p_school_id and v.billing_plan_id = p_billing_plan_id
    order by v.version_number desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  ) x;
$$;

create or replace function public.b19_get_finance_billing_plan_version(
  p_school_id uuid,
  p_billing_plan_version_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o uuid; result jsonb;
begin
  o := public.b19_finance_authorize('finance.read', p_school_id);
  select jsonb_build_object(
    'id', v.id, 'billing_plan_id', v.billing_plan_id, 'version_number', v.version_number,
    'fee_definition_id', v.fee_definition_id, 'fee_code_snapshot', v.fee_code_snapshot,
    'fee_name_snapshot', v.fee_name_snapshot, 'fee_description_snapshot', v.fee_description_snapshot,
    'amount_idr', v.amount_idr, 'currency', v.currency, 'charge_kind', v.charge_kind,
    'target_type', v.target_type, 'grade_level_id', v.grade_level_id, 'academic_year_id', v.academic_year_id,
    'due_day', v.due_day, 'status', v.status, 'locked_at', v.locked_at, 'created_at', v.created_at,
    'target_count', (select count(*) from public.finance_billing_plan_targets t
      where t.billing_plan_version_id = v.id and t.organization_id = v.organization_id and t.school_id = v.school_id)::integer
  ) into result
  from public.finance_billing_plan_versions v
  where v.id = p_billing_plan_version_id and v.organization_id = o and v.school_id = p_school_id;
  if result is null then raise exception using errcode = 'P0001', message = 'B19_FINANCE_NOT_FOUND'; end if;
  return result;
end;
$$;

create or replace function public.b19_list_finance_billing_plan_targets(
  p_school_id uuid,
  p_billing_plan_version_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  from (
    select t.id, t.student_enrollment_id, e.student_id, s.full_name as student_name, e.grade_level_id, t.created_at
    from public.finance_billing_plan_targets t
    join public.student_enrollments e
      on e.id = t.student_enrollment_id and e.organization_id = t.organization_id
      and e.school_id = t.school_id and e.academic_year_id = t.academic_year_id
    join public.students s on s.id = e.student_id and s.organization_id = e.organization_id
    where t.organization_id = public.b19_finance_authorize('finance.read', p_school_id)
      and t.school_id = p_school_id and t.billing_plan_version_id = p_billing_plan_version_id
    order by s.full_name, t.id
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  ) x;
$$;

revoke all on function public.b19_list_finance_billing_plans(uuid, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.b19_get_finance_billing_plan(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.b19_list_finance_billing_plan_versions(uuid, uuid, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.b19_get_finance_billing_plan_version(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.b19_list_finance_billing_plan_targets(uuid, uuid, integer, integer) from public, anon, authenticated, service_role;

grant execute on function public.b19_list_finance_billing_plans(uuid, integer, integer),
  public.b19_get_finance_billing_plan(uuid, uuid),
  public.b19_list_finance_billing_plan_versions(uuid, uuid, integer, integer),
  public.b19_get_finance_billing_plan_version(uuid, uuid),
  public.b19_list_finance_billing_plan_targets(uuid, uuid, integer, integer)
to authenticated;

commit;
