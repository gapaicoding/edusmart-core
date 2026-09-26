-- EduSmart Core V1 / Batch 19 Phase 1 — Finance & Billing Foundation.
-- Foundation only: schema, ownership integrity, capabilities, RLS, ACLs,
-- immutable-history primitives, and no application-facing business RPCs.

begin;

-- -----------------------------------------------------------------------------
-- 1. Exact Finance capability registry and canonical role grants.
-- -----------------------------------------------------------------------------

insert into public.permissions (code, domain, action, description) values
  ('finance.read','finance','read','Read authorized Finance records and receivables'),
  ('finance.manage_fees','finance','manage_fees','Manage school fee definitions and plans'),
  ('finance.manage_billing','finance','manage_billing','Manage billing plans and draft billing'),
  ('finance.issue','finance','issue','Issue or void Finance invoices'),
  ('finance.record_payment','finance','record_payment','Record and allocate manual payments'),
  ('finance.adjust','finance','adjust','Perform controlled payment reversals/corrections'),
  ('finance.portal_read','finance','portal_read','Read related-child Finance portal projections')
on conflict (code) do update
set domain = excluded.domain,
    action = excluded.action,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.organization_id is null
  and r.code in ('ORG_OWNER','PRINCIPAL','SCHOOL_ADMIN')
  and p.code in (
    'finance.read','finance.manage_fees','finance.manage_billing',
    'finance.issue','finance.record_payment','finance.adjust'
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'finance.portal_read'
where r.organization_id is null
  and r.code = 'PARENT'
on conflict (role_id, permission_id) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Finance fee catalog and immutable billing-plan versions.
-- -----------------------------------------------------------------------------

create table public.finance_fee_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  code text not null,
  name text not null,
  description text,
  default_amount_idr bigint not null check (default_amount_idr > 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  charge_kind text not null check (charge_kind in ('one_time','monthly')),
  grade_level_id uuid,
  academic_year_id uuid,
  status text not null default 'active' check (status in ('active','archived')),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_fee_definitions_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint finance_fee_definitions_grade_fk
    foreign key (grade_level_id, organization_id, school_id)
    references public.grade_levels(id, organization_id, school_id) on delete restrict,
  constraint finance_fee_definitions_year_fk
    foreign key (academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete restrict,
  constraint finance_fee_definitions_code_check
    check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'),
  constraint finance_fee_definitions_name_check
    check (char_length(btrim(name)) between 1 and 160),
  constraint finance_fee_definitions_description_check
    check (description is null or char_length(description) <= 1000),
  constraint finance_fee_definitions_id_org_school_key unique (id, organization_id, school_id),
  constraint finance_fee_definitions_code_key unique (school_id, code)
);

create table public.finance_billing_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  code text not null,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_billing_plans_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint finance_billing_plans_code_check
    check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'),
  constraint finance_billing_plans_name_check
    check (char_length(btrim(name)) between 1 and 160),
  constraint finance_billing_plans_description_check
    check (description is null or char_length(description) <= 1000),
  constraint finance_billing_plans_id_org_school_key unique (id, organization_id, school_id),
  constraint finance_billing_plans_code_key unique (school_id, code)
);

create table public.finance_billing_plan_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  billing_plan_id uuid not null,
  version_number integer not null check (version_number > 0),
  fee_definition_id uuid not null,
  fee_code_snapshot text not null,
  fee_name_snapshot text not null,
  fee_description_snapshot text,
  amount_idr bigint not null check (amount_idr > 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  charge_kind text not null check (charge_kind in ('one_time','monthly')),
  target_type text not null check (target_type in ('school','grade','explicit_enrollment')),
  grade_level_id uuid,
  academic_year_id uuid not null,
  due_day smallint check (due_day is null or due_day between 1 and 28),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_plan_versions_plan_fk
    foreign key (billing_plan_id, organization_id, school_id)
    references public.finance_billing_plans(id, organization_id, school_id) on delete restrict,
  constraint finance_plan_versions_fee_fk
    foreign key (fee_definition_id, organization_id, school_id)
    references public.finance_fee_definitions(id, organization_id, school_id) on delete restrict,
  constraint finance_plan_versions_grade_fk
    foreign key (grade_level_id, organization_id, school_id)
    references public.grade_levels(id, organization_id, school_id) on delete restrict,
  constraint finance_plan_versions_year_fk
    foreign key (academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete restrict,
  constraint finance_plan_versions_target_check
    check ((target_type = 'grade' and grade_level_id is not null)
       or (target_type in ('school','explicit_enrollment') and grade_level_id is null)),
  constraint finance_plan_versions_snapshot_check
    check (char_length(btrim(fee_code_snapshot)) between 2 and 64
       and char_length(btrim(fee_name_snapshot)) between 1 and 160
       and (fee_description_snapshot is null or char_length(fee_description_snapshot) <= 1000)),
  constraint finance_plan_versions_id_org_school_key unique (id, organization_id, school_id),
  constraint finance_plan_versions_id_year_org_school_key unique (id, academic_year_id, organization_id, school_id),
  constraint finance_plan_versions_number_key unique (billing_plan_id, version_number)
);

-- Existing enrollment IDs are already unique, but these composite keys make
-- year/school and student/year consistency enforceable by Finance foreign keys.
alter table public.student_enrollments
  add constraint finance_student_enrollments_id_year_org_school_key
  unique (id, academic_year_id, organization_id, school_id),
  add constraint finance_student_enrollments_id_student_year_org_school_key
  unique (id, student_id, academic_year_id, organization_id, school_id);

create table public.finance_billing_plan_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  billing_plan_version_id uuid not null,
  academic_year_id uuid not null,
  student_enrollment_id uuid not null,
  created_at timestamptz not null default now(),
  constraint finance_plan_targets_version_fk
    foreign key (billing_plan_version_id, academic_year_id, organization_id, school_id)
    references public.finance_billing_plan_versions(id, academic_year_id, organization_id, school_id) on delete restrict,
  constraint finance_plan_targets_enrollment_fk
    foreign key (student_enrollment_id, academic_year_id, organization_id, school_id)
    references public.student_enrollments(id, academic_year_id, organization_id, school_id) on delete restrict,
  constraint finance_plan_targets_id_org_school_key unique (id, organization_id, school_id),
  constraint finance_plan_targets_version_enrollment_key unique (billing_plan_version_id, student_enrollment_id)
);

-- -----------------------------------------------------------------------------
-- 3. Invoice, item, numbering, and bounded document history foundation.
-- -----------------------------------------------------------------------------

create table public.finance_invoice_number_counters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  sequence_key text not null,
  next_value bigint not null default 1 check (next_value > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_invoice_counters_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint finance_invoice_counters_id_org_school_key unique (id, organization_id, school_id),
  constraint finance_invoice_counters_key unique (school_id, sequence_key),
  constraint finance_invoice_counters_sequence_key_check
    check (sequence_key ~ '^[0-9]{4}-[0-9]{2}$')
);

create table public.finance_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  student_enrollment_id uuid not null,
  academic_year_id uuid not null,
  billing_plan_version_id uuid,
  source_type text not null check (source_type in ('billing_plan','manual')),
  billing_period_key text not null,
  invoice_number text not null,
  issue_date date,
  due_date date not null,
  currency text not null default 'IDR' check (currency = 'IDR'),
  document_status text not null default 'draft' check (document_status in ('draft','issued','void')),
  row_version bigint not null default 1 check (row_version > 0),
  created_by_profile_id uuid references public.profiles(id) on delete restrict,
  issued_by_profile_id uuid references public.profiles(id) on delete restrict,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_invoices_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint finance_invoices_student_fk
    foreign key (student_id, organization_id)
    references public.students(id, organization_id) on delete restrict,
  constraint finance_invoices_enrollment_fk
    foreign key (student_enrollment_id, student_id, academic_year_id, organization_id, school_id)
    references public.student_enrollments(id, student_id, academic_year_id, organization_id, school_id) on delete restrict,
  constraint finance_invoices_plan_version_fk
    foreign key (billing_plan_version_id, academic_year_id, organization_id, school_id)
    references public.finance_billing_plan_versions(id, academic_year_id, organization_id, school_id) on delete restrict,
  constraint finance_invoices_source_check
    check ((source_type = 'billing_plan' and billing_plan_version_id is not null)
       or (source_type = 'manual' and billing_plan_version_id is null)),
  constraint finance_invoices_period_check
    check (billing_period_key = 'ONE_TIME' or billing_period_key ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint finance_invoices_issue_check
    check ((document_status = 'draft' and issue_date is null and issued_at is null and issued_by_profile_id is null)
       or (document_status in ('issued','void') and issue_date is not null)),
  constraint finance_invoices_id_org_school_key unique (id, organization_id, school_id),
  constraint finance_invoices_id_context_key unique (id, organization_id, school_id, student_id, student_enrollment_id, currency),
  constraint finance_invoices_number_key unique (school_id, invoice_number)
);

create table public.finance_invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  invoice_id uuid not null,
  source_fee_definition_id uuid,
  billing_plan_version_id uuid,
  fee_code_snapshot text not null,
  name_snapshot text not null,
  description_snapshot text,
  quantity bigint not null default 1 check (quantity > 0),
  unit_amount_idr bigint not null check (unit_amount_idr > 0),
  line_amount_idr bigint not null check (line_amount_idr > 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  created_at timestamptz not null default now(),
  constraint finance_invoice_items_invoice_fk
    foreign key (invoice_id, organization_id, school_id)
    references public.finance_invoices(id, organization_id, school_id) on delete restrict,
  constraint finance_invoice_items_fee_fk
    foreign key (source_fee_definition_id, organization_id, school_id)
    references public.finance_fee_definitions(id, organization_id, school_id) on delete restrict,
  constraint finance_invoice_items_plan_version_fk
    foreign key (billing_plan_version_id, organization_id, school_id)
    references public.finance_billing_plan_versions(id, organization_id, school_id) on delete restrict,
  constraint finance_invoice_items_snapshot_check
    check (char_length(btrim(fee_code_snapshot)) between 2 and 64
       and char_length(btrim(name_snapshot)) between 1 and 160
       and (description_snapshot is null or char_length(description_snapshot) <= 1000)),
  constraint finance_invoice_items_line_math_check
    check (line_amount_idr = quantity * unit_amount_idr)
);

create table public.finance_invoice_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  invoice_id uuid not null,
  from_status text,
  to_status text not null check (to_status in ('draft','issued','void')),
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  reason text,
  request_id uuid,
  created_at timestamptz not null default now(),
  constraint finance_invoice_history_invoice_fk
    foreign key (invoice_id, organization_id, school_id)
    references public.finance_invoices(id, organization_id, school_id) on delete restrict,
  constraint finance_invoice_history_from_check
    check (from_status is null or from_status in ('draft','issued','void')),
  constraint finance_invoice_history_reason_check
    check (reason is null or char_length(btrim(reason)) between 3 and 1000)
);

create unique index finance_invoice_generation_key
on public.finance_invoices(billing_plan_version_id, student_enrollment_id, billing_period_key)
where billing_plan_version_id is not null;

-- -----------------------------------------------------------------------------
-- 4. Manual payments, one-invoice allocation, reversal foundation, and ledger.
-- -----------------------------------------------------------------------------

create table public.finance_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  student_enrollment_id uuid not null,
  academic_year_id uuid not null,
  currency text not null default 'IDR' check (currency = 'IDR'),
  amount_idr bigint not null check (amount_idr > 0),
  received_at timestamptz not null,
  method text not null check (method in ('cash','bank_transfer','other')),
  manual_reference text,
  note text,
  recorded_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint finance_payments_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint finance_payments_student_fk
    foreign key (student_id, organization_id)
    references public.students(id, organization_id) on delete restrict,
  constraint finance_payments_enrollment_fk
    foreign key (student_enrollment_id, student_id, academic_year_id, organization_id, school_id)
    references public.student_enrollments(id, student_id, academic_year_id, organization_id, school_id) on delete restrict,
  constraint finance_payments_reference_check
    check (manual_reference is null or char_length(btrim(manual_reference)) between 1 and 120),
  constraint finance_payments_note_check
    check (note is null or char_length(note) <= 1000),
  constraint finance_payments_id_org_school_key unique (id, organization_id, school_id),
  constraint finance_payments_context_key unique (id, organization_id, school_id, student_id, student_enrollment_id, currency)
);

create table public.finance_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  student_enrollment_id uuid not null,
  currency text not null default 'IDR' check (currency = 'IDR'),
  payment_id uuid not null,
  invoice_id uuid not null,
  amount_idr bigint not null check (amount_idr > 0),
  created_at timestamptz not null default now(),
  constraint finance_allocations_payment_fk
    foreign key (payment_id, organization_id, school_id, student_id, student_enrollment_id, currency)
    references public.finance_payments(id, organization_id, school_id, student_id, student_enrollment_id, currency) on delete restrict,
  constraint finance_allocations_invoice_fk
    foreign key (invoice_id, organization_id, school_id, student_id, student_enrollment_id, currency)
    references public.finance_invoices(id, organization_id, school_id, student_id, student_enrollment_id, currency) on delete restrict,
  constraint finance_allocations_context_key unique (id, organization_id, school_id),
  constraint finance_allocations_one_per_payment unique (payment_id)
);

create table public.finance_payment_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  original_payment_id uuid not null,
  correction_type text not null default 'reversal' check (correction_type = 'reversal'),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  corrected_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null unique,
  created_at timestamptz not null default now(),
  constraint finance_payment_corrections_payment_fk
    foreign key (original_payment_id, organization_id, school_id)
    references public.finance_payments(id, organization_id, school_id) on delete restrict,
  constraint finance_payment_corrections_one_reversal unique (original_payment_id)
);

create table public.finance_command_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  command_name text not null check (command_name in (
    'fee_create','fee_update','fee_archive',
    'billing_plan_create','billing_plan_update','billing_plan_activate',
    'invoice_generate','invoice_issue','invoice_void',
    'payment_record','payment_reverse'
  )),
  resource_type text not null,
  resource_id uuid,
  semantic_fingerprint text not null check (semantic_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'processing' check (status in ('processing','completed')),
  result_payload jsonb,
  created_at timestamptz not null default transaction_timestamp(),
  completed_at timestamptz,
  constraint finance_command_requests_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint finance_command_requests_actor_request_key unique (actor_profile_id, command_name, request_id),
  constraint finance_command_requests_result_bound
    check (result_payload is null or octet_length(result_payload::text) <= 8192),
  constraint finance_command_requests_completion_check
    check ((status = 'processing' and result_payload is null and completed_at is null)
       or (status = 'completed' and result_payload is not null and completed_at is not null))
);

-- -----------------------------------------------------------------------------
-- 5. Indexes, timestamps, immutable guards, and document transition guards.
-- -----------------------------------------------------------------------------

create index finance_fee_definitions_school_status_idx
on public.finance_fee_definitions(school_id, status, code);
create index finance_billing_plans_school_status_idx
on public.finance_billing_plans(school_id, status, code);
create index finance_plan_versions_school_year_status_idx
on public.finance_billing_plan_versions(school_id, academic_year_id, status);
create index finance_plan_targets_enrollment_idx
on public.finance_billing_plan_targets(school_id, academic_year_id, student_enrollment_id);
create index finance_invoices_school_period_status_idx
on public.finance_invoices(school_id, billing_period_key, document_status, due_date);
create index finance_invoices_student_idx
on public.finance_invoices(school_id, student_id, student_enrollment_id);
create index finance_invoice_items_invoice_idx
on public.finance_invoice_items(invoice_id, organization_id, school_id);
create index finance_invoice_history_invoice_idx
on public.finance_invoice_status_history(invoice_id, created_at desc);
create index finance_payments_school_received_idx
on public.finance_payments(school_id, received_at desc);
create index finance_payments_student_idx
on public.finance_payments(school_id, student_id, student_enrollment_id);
create index finance_allocations_invoice_idx
on public.finance_payment_allocations(invoice_id, created_at desc);
create index finance_command_requests_resource_idx
on public.finance_command_requests(organization_id, school_id, resource_type, resource_id, created_at desc);

create trigger trg_finance_fee_definitions_updated_at
before update on public.finance_fee_definitions
for each row execute function public.set_updated_at();
create trigger trg_finance_billing_plans_updated_at
before update on public.finance_billing_plans
for each row execute function public.set_updated_at();
create trigger trg_finance_plan_versions_updated_at
before update on public.finance_billing_plan_versions
for each row execute function public.set_updated_at();
create trigger trg_finance_invoice_counters_updated_at
before update on public.finance_invoice_number_counters
for each row execute function public.set_updated_at();
create trigger trg_finance_invoices_updated_at
before update on public.finance_invoices
for each row execute function public.set_updated_at();

create or replace function public.finance_guard_plan_version_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.locked_at is not null and (
    old.fee_definition_id is distinct from new.fee_definition_id or
    old.fee_code_snapshot is distinct from new.fee_code_snapshot or
    old.fee_name_snapshot is distinct from new.fee_name_snapshot or
    old.fee_description_snapshot is distinct from new.fee_description_snapshot or
    old.amount_idr is distinct from new.amount_idr or
    old.currency is distinct from new.currency or
    old.charge_kind is distinct from new.charge_kind or
    old.target_type is distinct from new.target_type or
    old.grade_level_id is distinct from new.grade_level_id or
    old.academic_year_id is distinct from new.academic_year_id or
    old.due_day is distinct from new.due_day
  ) then
    raise exception using errcode = 'P0001', message = 'B19_FINANCE_PLAN_VERSION_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger trg_finance_plan_version_immutable
before update on public.finance_billing_plan_versions
for each row execute function public.finance_guard_plan_version_immutable();

create or replace function public.finance_guard_invoice_document()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'B19_FINANCE_INVOICE_DELETE_FORBIDDEN';
  end if;
  if old.document_status in ('issued','void') and (
    old.organization_id is distinct from new.organization_id or
    old.school_id is distinct from new.school_id or
    old.student_id is distinct from new.student_id or
    old.student_enrollment_id is distinct from new.student_enrollment_id or
    old.academic_year_id is distinct from new.academic_year_id or
    old.billing_plan_version_id is distinct from new.billing_plan_version_id or
    old.source_type is distinct from new.source_type or
    old.billing_period_key is distinct from new.billing_period_key or
    old.invoice_number is distinct from new.invoice_number or
    old.due_date is distinct from new.due_date or
    old.currency is distinct from new.currency
  ) then
    raise exception using errcode = 'P0001', message = 'B19_FINANCE_ISSUED_INVOICE_IMMUTABLE';
  end if;
  if old.document_status = 'draft' and new.document_status not in ('draft','issued') then
    raise exception using errcode = 'P0001', message = 'B19_FINANCE_INVALID_INVOICE_TRANSITION';
  end if;
  if old.document_status = 'issued' and new.document_status <> 'void' then
    if new.document_status <> old.document_status then
      raise exception using errcode = 'P0001', message = 'B19_FINANCE_INVALID_INVOICE_TRANSITION';
    end if;
  end if;
  if old.document_status = 'void' and new.document_status <> old.document_status then
    raise exception using errcode = 'P0001', message = 'B19_FINANCE_INVALID_INVOICE_TRANSITION';
  end if;
  return new;
end;
$$;

create trigger trg_finance_invoice_document_guard
before update or delete on public.finance_invoices
for each row execute function public.finance_guard_invoice_document();

create or replace function public.finance_guard_invoice_item_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select document_status into v_status
  from public.finance_invoices
  where id = old.invoice_id;
  if v_status is null or v_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'B19_FINANCE_INVOICE_ITEM_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_finance_invoice_item_immutable
before update or delete on public.finance_invoice_items
for each row execute function public.finance_guard_invoice_item_immutable();

create or replace function public.finance_guard_payment_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'B19_FINANCE_PAYMENT_IMMUTABLE';
end;
$$;

create trigger trg_finance_payment_immutable
before update or delete on public.finance_payments
for each row execute function public.finance_guard_payment_immutable();

-- -----------------------------------------------------------------------------
-- 6. RLS and least-privilege table/function ACL baseline.
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'finance_fee_definitions','finance_billing_plans','finance_billing_plan_versions',
    'finance_billing_plan_targets','finance_invoice_number_counters','finance_invoices',
    'finance_invoice_items','finance_invoice_status_history','finance_payments',
    'finance_payment_allocations','finance_payment_corrections','finance_command_requests'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
end;
$$;

grant select on
  public.finance_fee_definitions,
  public.finance_billing_plans,
  public.finance_billing_plan_versions,
  public.finance_billing_plan_targets,
  public.finance_invoices,
  public.finance_invoice_items,
  public.finance_invoice_status_history,
  public.finance_payments,
  public.finance_payment_allocations,
  public.finance_payment_corrections
to authenticated;

create policy finance_fee_definitions_select
on public.finance_fee_definitions for select to authenticated
using (public.has_permission('finance.read', organization_id, school_id));
create policy finance_billing_plans_select
on public.finance_billing_plans for select to authenticated
using (public.has_permission('finance.read', organization_id, school_id));
create policy finance_plan_versions_select
on public.finance_billing_plan_versions for select to authenticated
using (public.has_permission('finance.read', organization_id, school_id));
create policy finance_plan_targets_select
on public.finance_billing_plan_targets for select to authenticated
using (public.has_permission('finance.read', organization_id, school_id));
create policy finance_invoices_select
on public.finance_invoices for select to authenticated
using (public.has_permission('finance.read', organization_id, school_id));
create policy finance_invoice_items_select
on public.finance_invoice_items for select to authenticated
using (public.has_permission('finance.read', organization_id, school_id));
create policy finance_invoice_history_select
on public.finance_invoice_status_history for select to authenticated
using (public.has_permission('finance.read', organization_id, school_id));
create policy finance_payments_select
on public.finance_payments for select to authenticated
using (public.has_permission('finance.read', organization_id, school_id));
create policy finance_allocations_select
on public.finance_payment_allocations for select to authenticated
using (public.has_permission('finance.read', organization_id, school_id));
create policy finance_corrections_select
on public.finance_payment_corrections for select to authenticated
using (public.has_permission('finance.read', organization_id, school_id));

revoke all on function public.finance_guard_plan_version_immutable() from public, anon, authenticated, service_role;
revoke all on function public.finance_guard_invoice_document() from public, anon, authenticated, service_role;
revoke all on function public.finance_guard_invoice_item_immutable() from public, anon, authenticated, service_role;
revoke all on function public.finance_guard_payment_immutable() from public, anon, authenticated, service_role;

commit;
