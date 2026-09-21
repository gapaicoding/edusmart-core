-- EduSmart Core V1 / Batch 14 Phase 1
-- Student Progression / Promotion & Annual Enrollment Rollover foundation.
-- Phase 1 only: durable schema, invariants, permission registry, RLS deny posture,
-- audit hooks, CAS/idempotency storage. Commands/projections are Phase 2.

begin;

create table public.progression_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  source_academic_year_id uuid not null,
  target_academic_year_id uuid not null,
  status text not null default 'draft'
    check (status in ('draft','in_review','approved','rejected','applied','cancelled')),
  version bigint not null default 1
    check (version >= 1),
  readiness_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(readiness_snapshot) = 'object'),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_by_profile_id uuid references public.profiles(id) on delete restrict,
  submitted_at timestamptz,
  approved_by_profile_id uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  rejected_by_profile_id uuid references public.profiles(id) on delete restrict,
  rejected_at timestamptz,
  rejection_reason text,
  applied_by_profile_id uuid references public.profiles(id) on delete restrict,
  applied_at timestamptz,
  cancelled_by_profile_id uuid references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text,
  constraint progression_batches_id_org_school_key
    unique (id, organization_id, school_id),
  constraint progression_batches_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint progression_batches_source_year_fk
    foreign key (source_academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete restrict,
  constraint progression_batches_target_year_fk
    foreign key (target_academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete restrict,
  constraint progression_batches_source_target_check
    check (source_academic_year_id <> target_academic_year_id),
  constraint progression_batches_reason_length_check
    check (rejection_reason is null or length(btrim(rejection_reason)) between 3 and 1000),
  constraint progression_batches_cancellation_reason_length_check
    check (cancellation_reason is null or length(btrim(cancellation_reason)) between 3 and 1000)
);

create index idx_progression_batches_school_status
  on public.progression_batches (school_id, status, updated_at desc);

create unique index uq_progression_batches_active_scope
  on public.progression_batches (school_id, source_academic_year_id, target_academic_year_id)
  where status in ('draft','in_review','approved','applied');

create table public.progression_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  batch_id uuid not null,
  student_id uuid not null,
  source_student_enrollment_id uuid not null,
  outcome text
    check (outcome is null or outcome in ('promoted','retained','graduated')),
  target_grade_level_id uuid,
  target_classroom_id uuid,
  readiness_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(readiness_snapshot) = 'object'),
  exception_reason text,
  operator_note text,
  version bigint not null default 1
    check (version >= 1),
  decided_by_profile_id uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint progression_decisions_id_org_school_key
    unique (id, organization_id, school_id),
  constraint progression_decisions_batch_fk
    foreign key (batch_id, organization_id, school_id)
    references public.progression_batches(id, organization_id, school_id) on delete restrict,
  constraint progression_decisions_student_fk
    foreign key (student_id, organization_id)
    references public.students(id, organization_id) on delete restrict,
  constraint progression_decisions_source_enrollment_fk
    foreign key (source_student_enrollment_id, organization_id, school_id)
    references public.student_enrollments(id, organization_id, school_id) on delete restrict,
  constraint progression_decisions_target_grade_fk
    foreign key (target_grade_level_id, organization_id, school_id)
    references public.grade_levels(id, organization_id, school_id) on delete restrict,
  constraint progression_decisions_target_classroom_fk
    foreign key (target_classroom_id, organization_id, school_id)
    references public.classrooms(id, organization_id, school_id) on delete restrict,
  constraint progression_decisions_exception_reason_length_check
    check (exception_reason is null or length(btrim(exception_reason)) between 3 and 1000),
  constraint progression_decisions_operator_note_length_check
    check (operator_note is null or length(operator_note) <= 2000),
  constraint progression_decisions_decider_coherence_check
    check ((decided_by_profile_id is null and decided_at is null)
      or (decided_by_profile_id is not null and decided_at is not null)),
  constraint progression_decisions_outcome_target_check
    check (outcome is distinct from 'graduated' or (target_grade_level_id is null and target_classroom_id is null))
);

create unique index uq_progression_decisions_batch_source_enrollment
  on public.progression_decisions (batch_id, source_student_enrollment_id);

create index idx_progression_decisions_batch_outcome
  on public.progression_decisions (batch_id, outcome, updated_at desc);

create index idx_progression_decisions_student
  on public.progression_decisions (student_id, created_at desc);

create table public.progression_command_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  command_name text not null,
  payload_fingerprint text not null
    check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  resource_type text,
  resource_id uuid,
  result_payload jsonb,
  status text not null default 'processing'
    check (status in ('processing','completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint progression_command_requests_actor_request_key
    unique (actor_profile_id, request_id, command_name),
  constraint progression_command_requests_command_check
    check (length(btrim(command_name)) between 3 and 120),
  constraint progression_command_requests_resource_type_check
    check (resource_type is null or length(btrim(resource_type)) between 1 and 80),
  constraint progression_command_requests_completion_check
    check ((status = 'processing' and completed_at is null and result_payload is null)
      or (status = 'completed' and completed_at is not null and result_payload is not null))
);

create index idx_progression_command_requests_resource
  on public.progression_command_requests (resource_type, resource_id, created_at desc);

create or replace function public.validate_progression_batch_context()
returns trigger
language plpgsql
as $$
declare
  v_source public.academic_years;
  v_target public.academic_years;
begin
  select * into v_source
  from public.academic_years
  where id = new.source_academic_year_id
    and organization_id = new.organization_id
    and school_id = new.school_id;
  if not found then
    raise exception 'B14_SOURCE_ACADEMIC_YEAR_SCOPE_INVALID';
  end if;

  select * into v_target
  from public.academic_years
  where id = new.target_academic_year_id
    and organization_id = new.organization_id
    and school_id = new.school_id;
  if not found then
    raise exception 'B14_TARGET_ACADEMIC_YEAR_SCOPE_INVALID';
  end if;

  if v_target.starts_on <= v_source.starts_on
     or v_target.ends_on <= v_source.ends_on then
    raise exception 'B14_TARGET_ACADEMIC_YEAR_NOT_LATER';
  end if;

  if new.status = 'in_review' and new.submitted_at is null then
    raise exception 'B14_REVIEW_SUBMISSION_METADATA_REQUIRED';
  end if;
  if new.status = 'approved' and (new.approved_by_profile_id is null or new.approved_at is null) then
    raise exception 'B14_APPROVAL_METADATA_REQUIRED';
  end if;
  if new.status = 'rejected' and (new.rejected_by_profile_id is null or new.rejected_at is null or new.rejection_reason is null) then
    raise exception 'B14_REJECTION_METADATA_REQUIRED';
  end if;
  if new.status = 'applied' and (new.applied_by_profile_id is null or new.applied_at is null) then
    raise exception 'B14_APPLY_METADATA_REQUIRED';
  end if;
  if new.status = 'cancelled' and (new.cancelled_by_profile_id is null or new.cancelled_at is null or new.cancellation_reason is null) then
    raise exception 'B14_CANCELLATION_METADATA_REQUIRED';
  end if;

  return new;
end;
$$;

create or replace function public.validate_progression_decision_context()
returns trigger
language plpgsql
as $$
declare
  v_batch public.progression_batches;
  v_source public.student_enrollments;
  v_classroom public.classrooms;
  v_warning_count integer := 0;
begin
  select * into v_batch
  from public.progression_batches
  where id = new.batch_id
    and organization_id = new.organization_id
    and school_id = new.school_id;
  if not found then
    raise exception 'B14_BATCH_SCOPE_INVALID';
  end if;

  select * into v_source
  from public.student_enrollments
  where id = new.source_student_enrollment_id
    and organization_id = new.organization_id
    and school_id = new.school_id;
  if not found then
    raise exception 'B14_SOURCE_ENROLLMENT_SCOPE_INVALID';
  end if;
  if v_source.student_id <> new.student_id then
    raise exception 'B14_STUDENT_SOURCE_ENROLLMENT_MISMATCH';
  end if;
  if v_source.academic_year_id <> v_batch.source_academic_year_id then
    raise exception 'B14_SOURCE_ENROLLMENT_YEAR_MISMATCH';
  end if;

  if new.target_classroom_id is not null and new.target_grade_level_id is null then
    raise exception 'B14_TARGET_GRADE_REQUIRED_FOR_CLASSROOM';
  end if;
  if new.outcome = 'graduated' and (new.target_grade_level_id is not null or new.target_classroom_id is not null) then
    raise exception 'B14_GRADUATED_TARGET_CONTEXT_FORBIDDEN';
  end if;

  if new.target_classroom_id is not null then
    select * into v_classroom
    from public.classrooms
    where id = new.target_classroom_id
      and organization_id = new.organization_id
      and school_id = new.school_id;
    if not found or v_classroom.academic_year_id <> v_batch.target_academic_year_id
       or v_classroom.grade_level_id <> new.target_grade_level_id then
      raise exception 'B14_TARGET_CLASSROOM_CONTEXT_INVALID';
    end if;
  end if;

  if jsonb_typeof(new.readiness_snapshot -> 'warnings') = 'array' then
    v_warning_count := jsonb_array_length(new.readiness_snapshot -> 'warnings');
  end if;
  if new.outcome is not null and v_warning_count > 0
     and nullif(btrim(coalesce(new.exception_reason, '')), '') is null then
    raise exception 'B14_READINESS_EXCEPTION_REASON_REQUIRED';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_applied_progression_batch_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'applied' then
      raise exception 'B14_APPLIED_BATCH_IMMUTABLE';
    end if;
    return old;
  end if;
  if old.status = 'applied' then
    raise exception 'B14_APPLIED_BATCH_IMMUTABLE';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_applied_progression_decision_mutation()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from public.progression_batches where id = old.batch_id;
  if tg_op = 'DELETE' then
    if v_status = 'applied' then
      raise exception 'B14_APPLIED_DECISION_IMMUTABLE';
    end if;
    return old;
  end if;
  if v_status = 'applied' then
    raise exception 'B14_APPLIED_DECISION_IMMUTABLE';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_applied_progression_source_mutation()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.progression_decisions d
    join public.progression_batches b on b.id = d.batch_id
    where d.source_student_enrollment_id = old.id
      and b.status = 'applied'
  ) then
    raise exception 'B14_APPLIED_SOURCE_ENROLLMENT_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_progression_batches_context
before insert or update on public.progression_batches
for each row execute function public.validate_progression_batch_context();

create trigger trg_progression_batches_immutability
before update or delete on public.progression_batches
for each row execute function public.prevent_applied_progression_batch_mutation();

create trigger trg_progression_batches_updated_at
before update on public.progression_batches
for each row execute function public.set_updated_at();

create trigger trg_progression_batches_audit
after insert or update or delete on public.progression_batches
for each row execute function public.audit_row_change();

create trigger trg_progression_decisions_context
before insert or update on public.progression_decisions
for each row execute function public.validate_progression_decision_context();

create trigger trg_progression_decisions_immutability
before update or delete on public.progression_decisions
for each row execute function public.prevent_applied_progression_decision_mutation();

create trigger trg_progression_decisions_updated_at
before update on public.progression_decisions
for each row execute function public.set_updated_at();

create trigger trg_progression_decisions_audit
after insert or update or delete on public.progression_decisions
for each row execute function public.audit_row_change();

create trigger trg_student_enrollments_progression_immutability
before update or delete on public.student_enrollments
for each row execute function public.prevent_applied_progression_source_mutation();

alter table public.progression_batches enable row level security;
alter table public.progression_decisions enable row level security;
alter table public.progression_command_requests enable row level security;

revoke all on public.progression_batches from public, anon, authenticated, service_role;
revoke all on public.progression_decisions from public, anon, authenticated, service_role;
revoke all on public.progression_command_requests from public, anon, authenticated, service_role;

insert into public.permissions (code, domain, action, description) values
  ('progression.read', 'progression', 'read', 'Read scoped student progression batches and decisions'),
  ('progression.create', 'progression', 'create', 'Create a student progression batch'),
  ('progression.update', 'progression', 'update', 'Edit draft progression batches and decisions'),
  ('progression.submit', 'progression', 'submit', 'Submit a progression batch for review'),
  ('progression.review', 'progression', 'review', 'Review or reject a progression batch'),
  ('progression.approve', 'progression', 'approve', 'Approve a progression batch'),
  ('progression.apply', 'progression', 'apply', 'Apply an approved progression batch'),
  ('progression.cancel', 'progression', 'cancel', 'Cancel an eligible pre-apply progression batch'),
  ('progression.audit', 'progression', 'audit', 'Read progression audit events')
on conflict (code) do update
set domain = excluded.domain,
    action = excluded.action,
    description = excluded.description;

-- Capability grants follow canonical system role codes. Direct table access
-- remains denied; these permissions are consumed by Phase-2 RPCs/projections.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
  'progression.read','progression.create','progression.update','progression.submit'
)
where r.organization_id is null and r.code = 'SCHOOL_ADMIN'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
  'progression.read','progression.review','progression.approve','progression.apply','progression.audit'
)
where r.organization_id is null and r.code = 'PRINCIPAL'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('progression.read')
where r.organization_id is null and r.code in ('TEACHER','HOMEROOM_TEACHER')
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
  'progression.read','progression.create','progression.update','progression.submit',
  'progression.review','progression.approve','progression.apply','progression.cancel','progression.audit'
)
where r.organization_id is null and r.code = 'ORG_OWNER'
on conflict (role_id, permission_id) do nothing;

comment on table public.progression_batches is
  'B14 Phase 1 foundation. Annual progression scope; source enrollments remain historical. Phase 2 owns commands/projections/apply.';
comment on table public.progression_decisions is
  'B14 Phase 1 foundation. Allowed outcomes are promoted, retained, graduated only; readiness is informational, not an automatic formula.';
comment on table public.progression_command_requests is
  'B14 Phase 1 bounded idempotency ledger. No passwords, tokens, or unnecessary PII; runtime replay behavior is Phase 2.';
comment on column public.progression_decisions.readiness_snapshot is
  'Auditable readiness facts/warnings only; no hidden score or attendance threshold formula.';
comment on column public.progression_decisions.exception_reason is
  'Required by the Phase 1 context trigger when an outcome is recorded with readiness warnings.';

commit;
