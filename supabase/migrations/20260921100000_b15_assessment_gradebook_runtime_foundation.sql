-- Batch 15 Phase 1: assessment/gradebook runtime foundation.
-- Authority alignment and durable command/CAS foundations only. Phase 2 owns
-- application command RPCs and bounded runtime projections.

-- The existing capability is reused. No role-name authorization is added.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'assessment.publish'
where r.organization_id is null
  and r.code = 'PRINCIPAL'
on conflict (role_id, permission_id) do nothing;

delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.organization_id is null
  and r.code = 'TEACHER'
  and p.code = 'assessment.publish';

-- DB-owned monotonic versions support the Phase-2 expected_version contract
-- while preserving legacy server-side writes during the transition.
alter table public.assessments
  add column if not exists version bigint not null default 1;

alter table public.assessments
  add constraint assessments_version_check check (version >= 1);

alter table public.student_scores
  add column if not exists version bigint not null default 1;

alter table public.student_scores
  add constraint student_scores_version_check check (version >= 1);

create or replace function public.b15_increment_assessment_gradebook_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end
$$;

drop trigger if exists trg_assessments_b15_version on public.assessments;
create trigger trg_assessments_b15_version
before update on public.assessments
for each row execute function public.b15_increment_assessment_gradebook_version();

drop trigger if exists trg_student_scores_b15_version on public.student_scores;
create trigger trg_student_scores_b15_version
before update on public.student_scores
for each row execute function public.b15_increment_assessment_gradebook_version();

revoke all on function public.b15_increment_assessment_gradebook_version() from public, anon, authenticated, service_role;

-- Assessment commands have a distinct privacy, scope, and replay contract;
-- prior domain ledgers are intentionally not reused.
create table public.assessment_command_requests (
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
    check (status in ('processing', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint assessment_command_requests_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint assessment_command_requests_actor_request_key
    unique (actor_profile_id, request_id, command_name),
  constraint assessment_command_requests_command_check
    check (length(btrim(command_name)) between 3 and 120),
  constraint assessment_command_requests_resource_type_check
    check (resource_type is null or length(btrim(resource_type)) between 1 and 80),
  constraint assessment_command_requests_result_size_check
    check (result_payload is null or octet_length(result_payload::text) <= 16384),
  constraint assessment_command_requests_result_privacy_check
    check (result_payload is null or not (result_payload ?| array[
      'password', 'token', 'service_key', 'student_profile', 'teacher_private_notes'
    ])),
  constraint assessment_command_requests_completion_check
    check ((status = 'processing' and completed_at is null and result_payload is null)
      or (status = 'completed' and completed_at is not null and result_payload is not null))
);

create index assessment_command_requests_resource_idx
  on public.assessment_command_requests (organization_id, school_id, resource_type, resource_id, created_at desc);

alter table public.assessment_command_requests enable row level security;
revoke all on public.assessment_command_requests from public, anon, authenticated, service_role;

-- Existing audit_logs already captures before_data/after_data, actor, time,
-- and assessment/student-score context. Phase 2 correction commands must put
-- the explicit bounded correction reason in audit_logs.metadata; no redundant
-- revision table is introduced in Phase 1.
