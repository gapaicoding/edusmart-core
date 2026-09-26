-- EduSmart Core V1 — Batch 18 PPDB Admissions foundation.
-- Phase 1 only: schema, integrity, capabilities and deny-by-default security.
-- No public submission or operational command RPC is exposed by this migration.

create or replace function public.b18_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.b18_bump_row_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

create table public.admission_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  name text not null,
  slug text not null,
  status text not null default 'draft'
    check (status in ('draft','open','closed','archived')),
  opens_at timestamptz,
  closes_at timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admission_cycles_dates_check check (closes_at is null or opens_at is null or closes_at >= opens_at),
  constraint admission_cycles_id_org_school_key unique (id, organization_id, school_id),
  constraint admission_cycles_id_scope_year_key unique (id, organization_id, school_id, academic_year_id),
  constraint admission_cycles_school_slug_key unique (school_id, slug),
  constraint admission_cycles_school_fk foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint admission_cycles_year_fk foreign key (academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete restrict
);

create trigger trg_admission_cycles_updated_at
before update on public.admission_cycles
for each row execute function public.b18_set_updated_at();

create trigger trg_admission_cycles_row_version
before update on public.admission_cycles
for each row execute function public.b18_bump_row_version();

create index idx_admission_cycles_scope_status
on public.admission_cycles (organization_id, school_id, status, created_at desc);

create index idx_admission_cycles_school_year
on public.admission_cycles (school_id, academic_year_id);

create table public.admission_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  admission_cycle_id uuid not null,
  target_academic_year_id uuid not null,
  target_grade_level_id uuid not null,
  application_number text,
  status text not null default 'submitted'
    check (status in ('submitted','under_review','accepted','rejected','withdrawn','converted')),
  applicant_full_name text not null,
  applicant_preferred_name text,
  applicant_gender text check (applicant_gender is null or applicant_gender in ('male','female','other','unspecified')),
  applicant_birth_date date,
  applicant_birth_place text,
  applicant_nisn text,
  applicant_email text,
  applicant_phone text,
  submission_note text,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by_profile_id uuid references public.profiles(id) on delete set null,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 2000),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admission_applications_id_org_school_key unique (id, organization_id, school_id),
  constraint admission_applications_cycle_scope_fk foreign key (admission_cycle_id, organization_id, school_id)
    references public.admission_cycles(id, organization_id, school_id) on delete restrict,
  constraint admission_applications_cycle_year_fk foreign key (admission_cycle_id, organization_id, school_id, target_academic_year_id)
    references public.admission_cycles(id, organization_id, school_id, academic_year_id) on delete restrict,
  constraint admission_applications_year_scope_fk foreign key (target_academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete restrict,
  constraint admission_applications_grade_scope_fk foreign key (target_grade_level_id, organization_id, school_id)
    references public.grade_levels(id, organization_id, school_id) on delete restrict
);

create unique index uq_admission_applications_cycle_number
on public.admission_applications (admission_cycle_id, application_number)
where application_number is not null;

create index idx_admission_applications_scope_status
on public.admission_applications (organization_id, school_id, admission_cycle_id, status, created_at desc);

create trigger trg_admission_applications_updated_at
before update on public.admission_applications
for each row execute function public.b18_set_updated_at();

create trigger trg_admission_applications_row_version
before update on public.admission_applications
for each row execute function public.b18_bump_row_version();

create table public.admission_application_guardians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  application_id uuid not null,
  full_name text not null,
  relationship text not null,
  phone text,
  email text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admission_application_guardians_application_fk
    foreign key (application_id, organization_id, school_id)
    references public.admission_applications(id, organization_id, school_id) on delete restrict
);

create unique index uq_admission_application_guardians_primary
on public.admission_application_guardians (application_id)
where is_primary;

create index idx_admission_application_guardians_application
on public.admission_application_guardians (application_id, created_at);

create trigger trg_admission_application_guardians_updated_at
before update on public.admission_application_guardians
for each row execute function public.b18_set_updated_at();

create table public.admission_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  application_id uuid not null,
  policy_version text not null,
  consented_at timestamptz not null,
  consent_source text not null check (consent_source in ('public_submission','staff_entry','imported')),
  created_at timestamptz not null default now(),
  constraint admission_consents_application_fk
    foreign key (application_id, organization_id, school_id)
    references public.admission_applications(id, organization_id, school_id) on delete restrict,
  constraint admission_consents_policy_version_check check (char_length(policy_version) between 1 and 128)
);

create unique index uq_admission_consents_application_policy
on public.admission_consents (application_id, policy_version);

create index idx_admission_consents_application
on public.admission_consents (application_id, consented_at desc);

create table public.admission_stage_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  application_id uuid not null,
  from_status text check (from_status is null or from_status in ('submitted','under_review','accepted','rejected','withdrawn','converted')),
  to_status text not null check (to_status in ('submitted','under_review','accepted','rejected','withdrawn','converted')),
  actor_kind text not null check (actor_kind in ('staff','public','system')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  request_id uuid,
  reason text check (reason is null or char_length(reason) <= 2000),
  occurred_at timestamptz not null default now(),
  constraint admission_stage_history_application_fk
    foreign key (application_id, organization_id, school_id)
    references public.admission_applications(id, organization_id, school_id) on delete restrict
);

create index idx_admission_stage_history_application_time
on public.admission_stage_history (application_id, occurred_at desc);

create table public.admission_conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  application_id uuid not null,
  student_id uuid not null,
  student_enrollment_id uuid not null,
  converted_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  converted_at timestamptz not null default now(),
  constraint admission_conversions_application_fk
    foreign key (application_id, organization_id, school_id)
    references public.admission_applications(id, organization_id, school_id) on delete restrict,
  constraint admission_conversions_student_fk
    foreign key (student_id, organization_id)
    references public.students(id, organization_id) on delete restrict,
  constraint admission_conversions_enrollment_fk
    foreign key (student_enrollment_id, organization_id, school_id)
    references public.student_enrollments(id, organization_id, school_id) on delete restrict,
  constraint admission_conversions_request_key unique (request_id),
  constraint admission_conversions_application_key unique (application_id)
);

create index idx_admission_conversions_student
on public.admission_conversions (student_id, converted_at desc);

create table public.admission_command_requests (
  id uuid primary key default gen_random_uuid(),
  actor_kind text not null check (actor_kind in ('staff','public','system')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  school_id uuid not null,
  command text not null check (command in ('submit_application','transition_application','convert_application','open_cycle','close_cycle','reopen_cycle','archive_cycle')),
  request_id uuid not null unique,
  semantic_fingerprint text not null check (char_length(semantic_fingerprint) between 1 and 256),
  status text not null default 'started' check (status in ('started','completed','failed','conflict')),
  result_payload jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admission_command_requests_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint admission_command_requests_result_bound
    check (result_payload is null or octet_length(result_payload::text) <= 16384),
  constraint admission_command_requests_status_fields_check
    check ((status = 'started' and completed_at is null) or (status <> 'started' and completed_at is not null))
);

create index idx_admission_command_requests_resource_scope
on public.admission_command_requests (organization_id, school_id, command, created_at desc);

alter table public.admission_cycles enable row level security;
alter table public.admission_cycles force row level security;
alter table public.admission_applications enable row level security;
alter table public.admission_applications force row level security;
alter table public.admission_application_guardians enable row level security;
alter table public.admission_application_guardians force row level security;
alter table public.admission_consents enable row level security;
alter table public.admission_consents force row level security;
alter table public.admission_stage_history enable row level security;
alter table public.admission_stage_history force row level security;
alter table public.admission_conversions enable row level security;
alter table public.admission_conversions force row level security;
alter table public.admission_command_requests enable row level security;
alter table public.admission_command_requests force row level security;

revoke all on public.admission_cycles from public, anon, authenticated, service_role;
revoke all on public.admission_applications from public, anon, authenticated, service_role;
revoke all on public.admission_application_guardians from public, anon, authenticated, service_role;
revoke all on public.admission_consents from public, anon, authenticated, service_role;
revoke all on public.admission_stage_history from public, anon, authenticated, service_role;
revoke all on public.admission_conversions from public, anon, authenticated, service_role;
revoke all on public.admission_command_requests from public, anon, authenticated, service_role;

insert into public.permissions(code, domain, action, description) values
  ('admission.read','admission','read','Read scoped admissions records'),
  ('admission.manage_cycle','admission','manage_cycle','Manage scoped admission cycles'),
  ('admission.review','admission','review','Review scoped admissions applications'),
  ('admission.decide','admission','decide','Make scoped admissions decisions'),
  ('admission.convert','admission','convert','Convert an accepted admission into SIS records')
on conflict (code) do update set domain=excluded.domain, action=excluded.action, description=excluded.description;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.organization_id is null and r.code in ('ORG_OWNER','PRINCIPAL','SCHOOL_ADMIN')
  and p.code in ('admission.read','admission.manage_cycle','admission.review','admission.decide','admission.convert')
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.organization_id is null and r.code='VICE_PRINCIPAL_CURRICULUM'
  and p.code='admission.read'
on conflict (role_id, permission_id) do nothing;

do $$
declare t text;
begin
  foreach t in array array['admission_cycles','admission_applications','admission_application_guardians','admission_consents','admission_stage_history','admission_conversions','admission_command_requests'] loop
    execute format('comment on table public.%I is %L', t, 'B18 PPDB Admissions foundation; Phase 1 deny-by-default security');
  end loop;
end $$;
