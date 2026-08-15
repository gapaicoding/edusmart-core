-- EduSmart SchoolOS — Core V1 Physical Database Schema
-- Version: 1.0
-- Target: Supabase PostgreSQL
-- Source of truth: 01_PRODUCT_DOMAIN_MODEL.md through 06_ACADEMIC_STRUCTURE.md
-- Run order: 07 -> 08 -> 09 -> 10. Run on a NEW development project first.

begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- -----------------------------------------------------------------------------
-- Shared functions
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Core tenant / organization
-- -----------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  legal_name text,
  status text not null default 'trial'
    check (status in ('trial','active','suspended','cancelled','archived')),
  timezone text not null default 'Asia/Jakarta',
  locale text not null default 'id-ID',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_code_key unique (code)
);

create trigger trg_organizations_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  education_stage text not null
    check (education_stage in ('paud','tk','sd','smp','sma','smk','other')),
  npsn text,
  timezone text not null default 'Asia/Jakarta',
  status text not null default 'active'
    check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schools_org_code_key unique (organization_id, code),
  constraint schools_id_org_key unique (id, organization_id)
);

create trigger trg_schools_updated_at
before update on public.schools
for each row execute function public.set_updated_at();

create table public.school_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  grading_settings jsonb not null default '{}'::jsonb,
  attendance_settings jsonb not null default '{}'::jsonb,
  report_branding jsonb not null default '{}'::jsonb,
  logo_file_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_settings_school_key unique (school_id),
  constraint school_settings_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete cascade
);

create trigger trg_school_settings_updated_at
before update on public.school_settings
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Identity & RBAC
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  avatar_file_id uuid,
  status text not null default 'active'
    check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email, 'User')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited','active','suspended','ended')),
  joined_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_memberships_id_org_key unique (id, organization_id),
  constraint org_memberships_dates_check check (ended_at is null or joined_at is null or ended_at >= joined_at)
);

create unique index uq_org_memberships_nonended
on public.organization_memberships (organization_id, profile_id)
where status <> 'ended';

create index idx_org_memberships_profile_status
on public.organization_memberships (profile_id, status, organization_id);

create trigger trg_org_memberships_updated_at
before update on public.organization_memberships
for each row execute function public.set_updated_at();

create table public.membership_school_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id uuid not null,
  school_id uuid not null,
  status text not null default 'active'
    check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_school_access_key unique (membership_id, school_id),
  constraint msa_membership_fk
    foreign key (membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete cascade,
  constraint msa_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete cascade
);

create index idx_membership_school_access_school
on public.membership_school_access (school_id, membership_id)
where status = 'active';

create trigger trg_membership_school_access_updated_at
before update on public.membership_school_access
for each row execute function public.set_updated_at();

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_system_role boolean not null default false,
  is_customizable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_roles_system_code
on public.roles (code)
where organization_id is null;

create unique index uq_roles_org_code
on public.roles (organization_id, code)
where organization_id is not null;

create trigger trg_roles_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  domain text not null,
  action text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index idx_role_permissions_permission
on public.role_permissions (permission_id, role_id);

create table public.membership_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null references public.roles(id) on delete restrict,
  scope_type text not null
    check (scope_type in ('ORG','SCHOOL','CLASS','OWN','RELATED')),
  scope_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_roles_membership_fk
    foreign key (membership_id, organization_id)
    references public.organization_memberships(id, organization_id) on delete cascade,
  constraint membership_roles_scope_check check (
    (scope_type in ('ORG','OWN','RELATED') and scope_id is null)
    or (scope_type in ('SCHOOL','CLASS') and scope_id is not null)
  ),
  constraint membership_roles_dates_check check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create unique index uq_membership_roles_grant
on public.membership_roles (
  membership_id,
  role_id,
  scope_type,
  coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(starts_at, '-infinity'::timestamptz)
);

create index idx_membership_roles_membership_active
on public.membership_roles (membership_id, role_id, scope_type, scope_id, starts_at, ends_at);

create trigger trg_membership_roles_updated_at
before update on public.membership_roles
for each row execute function public.set_updated_at();

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid,
  email text not null,
  invited_role_id uuid not null references public.roles(id) on delete restrict,
  invited_scope_type text not null
    check (invited_scope_type in ('ORG','SCHOOL','CLASS','OWN','RELATED')),
  invited_scope_id uuid,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint invitations_scope_check check (
    (invited_scope_type in ('ORG','OWN','RELATED') and invited_scope_id is null)
    or (invited_scope_type in ('SCHOOL','CLASS') and invited_scope_id is not null)
  ),
  constraint invitations_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete cascade
);

create index idx_invitations_email_open
on public.invitations (lower(email), expires_at)
where accepted_at is null and revoked_at is null;

-- -----------------------------------------------------------------------------
-- 3. Academic foundation
-- -----------------------------------------------------------------------------

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  code text not null,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft'
    check (status in ('draft','active','closed','archived')),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_years_dates_check check (ends_on >= starts_on),
  constraint academic_years_school_code_key unique (school_id, code),
  constraint academic_years_id_org_school_key unique (id, organization_id, school_id),
  constraint academic_years_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete cascade
);

create unique index uq_academic_years_current
on public.academic_years (school_id)
where is_current;

create trigger trg_academic_years_updated_at
before update on public.academic_years
for each row execute function public.set_updated_at();

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  code text not null,
  name text not null,
  sequence integer not null check (sequence > 0),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft'
    check (status in ('draft','active','closed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint terms_dates_check check (ends_on >= starts_on),
  constraint terms_year_code_key unique (academic_year_id, code),
  constraint terms_id_org_school_key unique (id, organization_id, school_id),
  constraint terms_year_fk
    foreign key (academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete cascade
);

create or replace function public.validate_term_within_year()
returns trigger
language plpgsql
as $$
declare
  y public.academic_years;
begin
  select * into y
  from public.academic_years
  where id = new.academic_year_id;

  if not found then
    raise exception 'Academic year % not found', new.academic_year_id;
  end if;

  if new.organization_id <> y.organization_id or new.school_id <> y.school_id then
    raise exception 'Term tenant boundary does not match academic year';
  end if;

  if new.starts_on < y.starts_on or new.ends_on > y.ends_on then
    raise exception 'Term dates must be inside academic year range';
  end if;

  return new;
end;
$$;

create trigger trg_terms_validate_year
before insert or update on public.terms
for each row execute function public.validate_term_within_year();

create trigger trg_terms_updated_at
before update on public.terms
for each row execute function public.set_updated_at();

create table public.grade_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  code text not null,
  name text not null,
  sequence integer not null check (sequence > 0),
  education_stage text not null
    check (education_stage in ('paud','tk','sd','smp','sma','smk','other')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grade_levels_school_code_key unique (school_id, code),
  constraint grade_levels_id_org_school_key unique (id, organization_id, school_id),
  constraint grade_levels_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete cascade
);

create trigger trg_grade_levels_updated_at
before update on public.grade_levels
for each row execute function public.set_updated_at();

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  grade_level_id uuid not null,
  code text not null,
  name text not null,
  homeroom_staff_school_assignment_id uuid,
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'active'
    check (status in ('draft','active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classrooms_school_year_code_key unique (school_id, academic_year_id, code),
  constraint classrooms_id_org_school_key unique (id, organization_id, school_id),
  constraint classrooms_year_fk
    foreign key (academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete cascade,
  constraint classrooms_grade_fk
    foreign key (grade_level_id, organization_id, school_id)
    references public.grade_levels(id, organization_id, school_id) on delete restrict
);

create index idx_classrooms_school_year_grade
on public.classrooms (school_id, academic_year_id, grade_level_id, status);

create trigger trg_classrooms_updated_at
before update on public.classrooms
for each row execute function public.set_updated_at();

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  code text not null,
  name text not null,
  category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_school_code_key unique (school_id, code),
  constraint subjects_id_org_school_key unique (id, organization_id, school_id),
  constraint subjects_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete cascade
);

create trigger trg_subjects_updated_at
before update on public.subjects
for each row execute function public.set_updated_at();

create table public.curricula (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  code text not null,
  name text not null,
  version text,
  status text not null default 'active'
    check (status in ('draft','active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curricula_school_code_version_key unique (school_id, code, version),
  constraint curricula_id_org_school_key unique (id, organization_id, school_id),
  constraint curricula_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete cascade
);

create trigger trg_curricula_updated_at
before update on public.curricula
for each row execute function public.set_updated_at();

create table public.learning_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  curriculum_id uuid not null,
  grade_level_id uuid,
  subject_id uuid not null,
  code text not null,
  description text not null,
  sequence integer not null default 1 check (sequence > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_outcomes_curriculum_code_key unique (curriculum_id, code),
  constraint learning_outcomes_id_org_school_key unique (id, organization_id, school_id),
  constraint learning_outcomes_curriculum_fk
    foreign key (curriculum_id, organization_id, school_id)
    references public.curricula(id, organization_id, school_id) on delete cascade,
  constraint learning_outcomes_grade_fk
    foreign key (grade_level_id, organization_id, school_id)
    references public.grade_levels(id, organization_id, school_id) on delete restrict,
  constraint learning_outcomes_subject_fk
    foreign key (subject_id, organization_id, school_id)
    references public.subjects(id, organization_id, school_id) on delete restrict
);

create trigger trg_learning_outcomes_updated_at
before update on public.learning_outcomes
for each row execute function public.set_updated_at();

create table public.learning_objectives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  learning_outcome_id uuid not null,
  code text not null,
  description text not null,
  sequence integer not null default 1 check (sequence > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_objectives_outcome_code_key unique (learning_outcome_id, code),
  constraint learning_objectives_id_org_school_key unique (id, organization_id, school_id),
  constraint learning_objectives_outcome_fk
    foreign key (learning_outcome_id, organization_id, school_id)
    references public.learning_outcomes(id, organization_id, school_id) on delete cascade
);

create trigger trg_learning_objectives_updated_at
before update on public.learning_objectives
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. SIS
-- -----------------------------------------------------------------------------

create table public.students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  nisn text,
  full_name text not null,
  preferred_name text,
  gender text check (gender is null or gender in ('male','female','other','unspecified')),
  birth_date date,
  birth_place text,
  status text not null default 'active'
    check (status in ('active','inactive','alumni','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_id_org_key unique (id, organization_id)
);

create unique index uq_students_org_nisn
on public.students (organization_id, nisn)
where nisn is not null;

create unique index uq_students_org_profile
on public.students (organization_id, profile_id)
where profile_id is not null;

create index idx_students_org_name
on public.students (organization_id, full_name);

create trigger trg_students_updated_at
before update on public.students
for each row execute function public.set_updated_at();

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  occupation text,
  status text not null default 'active'
    check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardians_id_org_key unique (id, organization_id)
);

create unique index uq_guardians_org_profile
on public.guardians (organization_id, profile_id)
where profile_id is not null;

create index idx_guardians_org_phone
on public.guardians (organization_id, phone)
where phone is not null;

create trigger trg_guardians_updated_at
before update on public.guardians
for each row execute function public.set_updated_at();

create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  guardian_id uuid not null,
  relationship_type text not null,
  is_primary boolean not null default false,
  can_view_academic boolean not null default true,
  can_view_attendance boolean not null default true,
  can_receive_notification boolean not null default true,
  can_manage_permissions boolean not null default false,
  status text not null default 'active'
    check (status in ('active','inactive','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_guardians_pair_key unique (student_id, guardian_id),
  constraint student_guardians_student_fk
    foreign key (student_id, organization_id)
    references public.students(id, organization_id) on delete cascade,
  constraint student_guardians_guardian_fk
    foreign key (guardian_id, organization_id)
    references public.guardians(id, organization_id) on delete cascade
);

create index idx_student_guardians_guardian_active
on public.student_guardians (guardian_id, student_id)
where status = 'active';

create trigger trg_student_guardians_updated_at
before update on public.student_guardians
for each row execute function public.set_updated_at();

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  staff_kind text not null
    check (staff_kind in ('teacher','non_teacher')),
  status text not null default 'active'
    check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_members_id_org_key unique (id, organization_id)
);

create unique index uq_staff_members_org_profile
on public.staff_members (organization_id, profile_id)
where profile_id is not null;

create index idx_staff_members_org_kind
on public.staff_members (organization_id, staff_kind, status);

create trigger trg_staff_members_updated_at
before update on public.staff_members
for each row execute function public.set_updated_at();

create table public.staff_school_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  staff_member_id uuid not null,
  employee_number text,
  employment_status text not null default 'active',
  position_title text,
  joined_on date,
  left_on date,
  status text not null default 'active'
    check (status in ('active','inactive','ended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_school_assignments_dates_check check (left_on is null or joined_on is null or left_on >= joined_on),
  constraint staff_school_assignments_id_org_school_key unique (id, organization_id, school_id),
  constraint staff_school_assignments_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete cascade,
  constraint staff_school_assignments_staff_fk
    foreign key (staff_member_id, organization_id)
    references public.staff_members(id, organization_id) on delete restrict
);

create unique index uq_staff_school_employee_number
on public.staff_school_assignments (school_id, employee_number)
where employee_number is not null and status <> 'archived';

create unique index uq_staff_school_one_active_assignment
on public.staff_school_assignments (school_id, staff_member_id)
where status = 'active';

create index idx_staff_school_assignment_lookup
on public.staff_school_assignments (school_id, staff_member_id, status);

create trigger trg_staff_school_assignments_updated_at
before update on public.staff_school_assignments
for each row execute function public.set_updated_at();

alter table public.classrooms
  add constraint classrooms_homeroom_assignment_fk
  foreign key (homeroom_staff_school_assignment_id, organization_id, school_id)
  references public.staff_school_assignments(id, organization_id, school_id)
  on delete restrict;

create table public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  academic_year_id uuid not null,
  grade_level_id uuid not null,
  student_number text,
  enrollment_number text,
  status text not null default 'draft'
    check (status in ('draft','active','leave','transferred','withdrawn','graduated')),
  enrolled_on date not null,
  ended_on date,
  previous_enrollment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_enrollments_dates_check check (ended_on is null or ended_on >= enrolled_on),
  constraint student_enrollments_student_year_key unique (student_id, school_id, academic_year_id),
  constraint student_enrollments_id_org_key unique (id, organization_id),
  constraint student_enrollments_id_org_school_key unique (id, organization_id, school_id),
  constraint student_enrollments_student_fk
    foreign key (student_id, organization_id)
    references public.students(id, organization_id) on delete restrict,
  constraint student_enrollments_year_fk
    foreign key (academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete restrict,
  constraint student_enrollments_grade_fk
    foreign key (grade_level_id, organization_id, school_id)
    references public.grade_levels(id, organization_id, school_id) on delete restrict
);

alter table public.student_enrollments
  add constraint student_enrollments_previous_fk
  foreign key (previous_enrollment_id, organization_id)
  references public.student_enrollments(id, organization_id)
  on delete restrict;

create unique index uq_student_enrollments_student_number
on public.student_enrollments (school_id, academic_year_id, student_number)
where student_number is not null;

create unique index uq_student_enrollments_enrollment_number
on public.student_enrollments (school_id, enrollment_number)
where enrollment_number is not null;

create index idx_student_enrollments_student_year
on public.student_enrollments (student_id, academic_year_id, status);

create trigger trg_student_enrollments_updated_at
before update on public.student_enrollments
for each row execute function public.set_updated_at();

create table public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  student_enrollment_id uuid not null,
  classroom_id uuid not null,
  starts_on date not null,
  ends_on date,
  is_primary boolean not null default true,
  status text not null default 'active'
    check (status in ('active','inactive','moved','ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_enrollments_dates_check check (ends_on is null or ends_on >= starts_on),
  constraint class_enrollments_id_org_school_key unique (id, organization_id, school_id),
  constraint class_enrollments_enrollment_fk
    foreign key (student_enrollment_id, organization_id, school_id)
    references public.student_enrollments(id, organization_id, school_id) on delete cascade,
  constraint class_enrollments_classroom_fk
    foreign key (classroom_id, organization_id, school_id)
    references public.classrooms(id, organization_id, school_id) on delete restrict
);

alter table public.class_enrollments
  add constraint class_enrollments_no_primary_overlap
  exclude using gist (
    student_enrollment_id with =,
    daterange(starts_on, coalesce(ends_on, 'infinity'::date), '[]') with &&
  )
  where (is_primary and status = 'active');

create index idx_class_enrollments_classroom_status
on public.class_enrollments (classroom_id, status, student_enrollment_id);

create trigger trg_class_enrollments_updated_at
before update on public.class_enrollments
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Teaching assignment & schedule
-- -----------------------------------------------------------------------------

create table public.teaching_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  term_id uuid,
  classroom_id uuid not null,
  subject_id uuid not null,
  staff_school_assignment_id uuid not null,
  role text not null default 'teacher'
    check (role in ('teacher','assistant')),
  starts_on date not null,
  ends_on date,
  status text not null default 'active'
    check (status in ('draft','active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teaching_assignments_dates_check check (ends_on is null or ends_on >= starts_on),
  constraint teaching_assignments_id_org_school_key unique (id, organization_id, school_id),
  constraint teaching_assignments_year_fk
    foreign key (academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete restrict,
  constraint teaching_assignments_term_fk
    foreign key (term_id, organization_id, school_id)
    references public.terms(id, organization_id, school_id) on delete restrict,
  constraint teaching_assignments_classroom_fk
    foreign key (classroom_id, organization_id, school_id)
    references public.classrooms(id, organization_id, school_id) on delete restrict,
  constraint teaching_assignments_subject_fk
    foreign key (subject_id, organization_id, school_id)
    references public.subjects(id, organization_id, school_id) on delete restrict,
  constraint teaching_assignments_staff_fk
    foreign key (staff_school_assignment_id, organization_id, school_id)
    references public.staff_school_assignments(id, organization_id, school_id) on delete restrict
);

create unique index uq_teaching_assignments_active_exact
on public.teaching_assignments (
  school_id, academic_year_id, coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid),
  classroom_id, subject_id, staff_school_assignment_id, role
)
where status = 'active';

create index idx_teaching_assignments_teacher_year
on public.teaching_assignments (staff_school_assignment_id, academic_year_id, status);

create index idx_teaching_assignments_class_year
on public.teaching_assignments (classroom_id, academic_year_id, status);

create trigger trg_teaching_assignments_updated_at
before update on public.teaching_assignments
for each row execute function public.set_updated_at();

create table public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  term_id uuid,
  teaching_assignment_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  room_label text,
  effective_from date not null,
  effective_to date,
  status text not null default 'draft'
    check (status in ('draft','published','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timetable_time_check check (end_time > start_time),
  constraint timetable_dates_check check (effective_to is null or effective_to >= effective_from),
  constraint timetable_entries_id_org_school_key unique (id, organization_id, school_id),
  constraint timetable_entries_year_fk
    foreign key (academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete restrict,
  constraint timetable_entries_term_fk
    foreign key (term_id, organization_id, school_id)
    references public.terms(id, organization_id, school_id) on delete restrict,
  constraint timetable_entries_assignment_fk
    foreign key (teaching_assignment_id, organization_id, school_id)
    references public.teaching_assignments(id, organization_id, school_id) on delete cascade
);

create index idx_timetable_school_weekday_start
on public.timetable_entries (school_id, weekday, start_time, status);

create index idx_timetable_year_weekday
on public.timetable_entries (academic_year_id, weekday, start_time);

create trigger trg_timetable_entries_updated_at
before update on public.timetable_entries
for each row execute function public.set_updated_at();

create table public.academic_calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  term_id uuid,
  title text not null,
  event_type text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  starts_on date,
  ends_on date,
  affects_instruction boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_time_shape_check check (
    (starts_at is not null and starts_on is null and ends_on is null)
    or (starts_at is null and starts_on is not null and ends_at is null)
  ),
  constraint calendar_datetime_range_check check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint calendar_date_range_check check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint calendar_year_fk
    foreign key (academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete cascade,
  constraint calendar_term_fk
    foreign key (term_id, organization_id, school_id)
    references public.terms(id, organization_id, school_id) on delete restrict
);

create index idx_calendar_school_dates
on public.academic_calendar_events (school_id, starts_on, starts_at);

create trigger trg_academic_calendar_updated_at
before update on public.academic_calendar_events
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. Attendance
-- -----------------------------------------------------------------------------

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  term_id uuid not null,
  timetable_entry_id uuid,
  teaching_assignment_id uuid,
  classroom_id uuid not null,
  session_date date not null,
  starts_at timestamptz,
  ends_at timestamptz,
  manual_reason text,
  status text not null default 'open'
    check (status in ('open','submitted','locked','corrected')),
  submitted_by_profile_id uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_session_time_check check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint attendance_manual_reason_check check (timetable_entry_id is not null or manual_reason is not null),
  constraint attendance_sessions_id_org_school_key unique (id, organization_id, school_id),
  constraint attendance_sessions_year_fk
    foreign key (academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete restrict,
  constraint attendance_sessions_term_fk
    foreign key (term_id, organization_id, school_id)
    references public.terms(id, organization_id, school_id) on delete restrict,
  constraint attendance_sessions_timetable_fk
    foreign key (timetable_entry_id, organization_id, school_id)
    references public.timetable_entries(id, organization_id, school_id) on delete restrict,
  constraint attendance_sessions_assignment_fk
    foreign key (teaching_assignment_id, organization_id, school_id)
    references public.teaching_assignments(id, organization_id, school_id) on delete restrict,
  constraint attendance_sessions_classroom_fk
    foreign key (classroom_id, organization_id, school_id)
    references public.classrooms(id, organization_id, school_id) on delete restrict
);

create unique index uq_attendance_session_class_date_assignment
on public.attendance_sessions (
  classroom_id,
  session_date,
  coalesce(teaching_assignment_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(timetable_entry_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create index idx_attendance_sessions_school_date
on public.attendance_sessions (school_id, session_date, status);

create trigger trg_attendance_sessions_updated_at
before update on public.attendance_sessions
for each row execute function public.set_updated_at();

create table public.student_attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  attendance_session_id uuid not null,
  student_enrollment_id uuid not null,
  status text not null
    check (status in ('present','late','excused','sick','absent','other')),
  check_in_at timestamptz,
  note text,
  correction_reason text,
  recorded_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_attendance_session_student_key unique (attendance_session_id, student_enrollment_id),
  constraint student_attendance_session_fk
    foreign key (attendance_session_id, organization_id, school_id)
    references public.attendance_sessions(id, organization_id, school_id) on delete cascade,
  constraint student_attendance_enrollment_fk
    foreign key (student_enrollment_id, organization_id, school_id)
    references public.student_enrollments(id, organization_id, school_id) on delete restrict
);

create index idx_student_attendance_enrollment_created
on public.student_attendance_records (student_enrollment_id, created_at desc);

create index idx_student_attendance_school_status
on public.student_attendance_records (school_id, status, created_at desc);

create trigger trg_student_attendance_updated_at
before update on public.student_attendance_records
for each row execute function public.set_updated_at();

create table public.staff_attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  staff_member_id uuid not null,
  attendance_date date not null,
  status text not null
    check (status in ('present','late','excused','sick','absent','leave','other')),
  check_in_at timestamptz,
  check_out_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_attendance_time_check check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at),
  constraint staff_attendance_unique_day unique (school_id, staff_member_id, attendance_date),
  constraint staff_attendance_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete cascade,
  constraint staff_attendance_staff_fk
    foreign key (staff_member_id, organization_id)
    references public.staff_members(id, organization_id) on delete restrict
);

create index idx_staff_attendance_school_date
on public.staff_attendance_records (school_id, attendance_date, status);

create trigger trg_staff_attendance_updated_at
before update on public.staff_attendance_records
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. Assessment
-- -----------------------------------------------------------------------------

create table public.assessment_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  code text not null,
  name text not null,
  default_weight numeric(7,4) check (default_weight is null or default_weight >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_types_school_code_key unique (school_id, code),
  constraint assessment_types_id_org_school_key unique (id, organization_id, school_id),
  constraint assessment_types_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete cascade
);

create trigger trg_assessment_types_updated_at
before update on public.assessment_types
for each row execute function public.set_updated_at();

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  term_id uuid not null,
  teaching_assignment_id uuid not null,
  assessment_type_id uuid not null,
  title text not null,
  description text,
  assessment_date date not null,
  min_score numeric(8,2) not null default 0,
  max_score numeric(8,2) not null default 100,
  weight numeric(7,4) check (weight is null or weight >= 0),
  status text not null default 'draft'
    check (status in ('draft','open','closed','published','archived')),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessments_score_range_check check (max_score > min_score),
  constraint assessments_id_org_school_key unique (id, organization_id, school_id),
  constraint assessments_year_fk
    foreign key (academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete restrict,
  constraint assessments_term_fk
    foreign key (term_id, organization_id, school_id)
    references public.terms(id, organization_id, school_id) on delete restrict,
  constraint assessments_teaching_fk
    foreign key (teaching_assignment_id, organization_id, school_id)
    references public.teaching_assignments(id, organization_id, school_id) on delete restrict,
  constraint assessments_type_fk
    foreign key (assessment_type_id, organization_id, school_id)
    references public.assessment_types(id, organization_id, school_id) on delete restrict
);

create index idx_assessments_assignment_term
on public.assessments (teaching_assignment_id, term_id, status, assessment_date);

create trigger trg_assessments_updated_at
before update on public.assessments
for each row execute function public.set_updated_at();

create table public.assessment_learning_objectives (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  learning_objective_id uuid not null references public.learning_objectives(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (assessment_id, learning_objective_id)
);

create table public.student_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  assessment_id uuid not null,
  student_enrollment_id uuid not null,
  score numeric(8,2),
  status text not null default 'missing'
    check (status in ('missing','submitted','excused','final')),
  feedback text,
  entered_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_scores_assessment_student_key unique (assessment_id, student_enrollment_id),
  constraint student_scores_assessment_fk
    foreign key (assessment_id, organization_id, school_id)
    references public.assessments(id, organization_id, school_id) on delete cascade,
  constraint student_scores_enrollment_fk
    foreign key (student_enrollment_id, organization_id, school_id)
    references public.student_enrollments(id, organization_id, school_id) on delete restrict
);

create or replace function public.validate_student_score()
returns trigger
language plpgsql
as $$
declare
  a public.assessments;
begin
  select * into a from public.assessments where id = new.assessment_id;
  if not found then
    raise exception 'Assessment % not found', new.assessment_id;
  end if;

  if new.organization_id <> a.organization_id or new.school_id <> a.school_id then
    raise exception 'Student score tenant boundary does not match assessment';
  end if;

  if new.score is not null and (new.score < a.min_score or new.score > a.max_score) then
    raise exception 'Score % must be between % and %', new.score, a.min_score, a.max_score;
  end if;

  return new;
end;
$$;

create trigger trg_student_scores_validate
before insert or update on public.student_scores
for each row execute function public.validate_student_score();

create index idx_student_scores_enrollment
on public.student_scores (student_enrollment_id, updated_at desc);

create trigger trg_student_scores_updated_at
before update on public.student_scores
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 8. Files, reporting & audit
-- -----------------------------------------------------------------------------

create table public.file_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid,
  storage_provider text not null default 'supabase',
  bucket text not null,
  object_path text not null,
  original_filename text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active'
    check (status in ('active','archived','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint file_assets_bucket_path_key unique (bucket, object_path),
  constraint file_assets_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete cascade
);

create index idx_file_assets_org_school
on public.file_assets (organization_id, school_id, status);

create trigger trg_file_assets_updated_at
before update on public.file_assets
for each row execute function public.set_updated_at();

alter table public.profiles
  add constraint profiles_avatar_file_fk
  foreign key (avatar_file_id) references public.file_assets(id) on delete set null;

alter table public.school_settings
  add constraint school_settings_logo_file_fk
  foreign key (logo_file_id) references public.file_assets(id) on delete set null;

create table public.report_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  term_id uuid not null,
  student_enrollment_id uuid not null,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft'
    check (status in ('draft','submitted','reviewed','published','revised','archived')),
  homeroom_comment text,
  attendance_summary jsonb,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  published_at timestamptz,
  published_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_cards_student_term_version_key unique (student_enrollment_id, term_id, version),
  constraint report_cards_id_org_school_key unique (id, organization_id, school_id),
  constraint report_cards_year_fk
    foreign key (academic_year_id, organization_id, school_id)
    references public.academic_years(id, organization_id, school_id) on delete restrict,
  constraint report_cards_term_fk
    foreign key (term_id, organization_id, school_id)
    references public.terms(id, organization_id, school_id) on delete restrict,
  constraint report_cards_enrollment_fk
    foreign key (student_enrollment_id, organization_id, school_id)
    references public.student_enrollments(id, organization_id, school_id) on delete restrict
);

create index idx_report_cards_student_term
on public.report_cards (student_enrollment_id, term_id, status, version desc);

create trigger trg_report_cards_updated_at
before update on public.report_cards
for each row execute function public.set_updated_at();

create table public.report_card_subject_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  report_card_id uuid not null,
  subject_id uuid not null,
  final_score numeric(8,2),
  predicate text,
  narrative text,
  source_calculation jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_card_subject_key unique (report_card_id, subject_id),
  constraint report_card_subject_report_fk
    foreign key (report_card_id, organization_id, school_id)
    references public.report_cards(id, organization_id, school_id) on delete cascade,
  constraint report_card_subject_subject_fk
    foreign key (subject_id, organization_id, school_id)
    references public.subjects(id, organization_id, school_id) on delete restrict
);

create trigger trg_report_card_subject_entries_updated_at
before update on public.report_card_subject_entries
for each row execute function public.set_updated_at();

create table public.report_card_narratives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  report_card_id uuid not null,
  section_code text not null,
  title text not null,
  content text not null,
  sequence integer not null default 1 check (sequence > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_card_narratives_section_key unique (report_card_id, section_code),
  constraint report_card_narratives_report_fk
    foreign key (report_card_id, organization_id, school_id)
    references public.report_cards(id, organization_id, school_id) on delete cascade
);

create trigger trg_report_card_narratives_updated_at
before update on public.report_card_narratives
for each row execute function public.set_updated_at();

create table public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  document_type text not null,
  file_asset_id uuid not null references public.file_assets(id) on delete restrict,
  generated_at timestamptz not null default now(),
  generated_by_profile_id uuid references public.profiles(id) on delete set null,
  checksum text,
  created_at timestamptz not null default now(),
  constraint generated_documents_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete cascade
);

create index idx_generated_documents_entity
on public.generated_documents (entity_type, entity_id, generated_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  school_id uuid,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_type text not null default 'user'
    check (actor_type in ('user','system','support')),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  ip_address inet,
  user_agent text,
  occurred_at timestamptz not null default now(),
  constraint audit_logs_org_fk foreign key (organization_id) references public.organizations(id) on delete set null,
  constraint audit_logs_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete set null
);

create index idx_audit_logs_org_time
on public.audit_logs (organization_id, occurred_at desc);

create index idx_audit_logs_entity
on public.audit_logs (entity_type, entity_id, occurred_at desc);

create index idx_audit_logs_actor
on public.audit_logs (actor_profile_id, occurred_at desc);

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_j jsonb;
  new_j jsonb;
  source_j jsonb;
  org_id uuid;
  school_id_value uuid;
  entity_uuid uuid;
  action_name text;
begin
  if tg_op = 'DELETE' then
    old_j := to_jsonb(old);
    new_j := null;
    source_j := old_j;
    action_name := lower(tg_op);
  elsif tg_op = 'INSERT' then
    old_j := null;
    new_j := to_jsonb(new);
    source_j := new_j;
    action_name := lower(tg_op);
  else
    old_j := to_jsonb(old);
    new_j := to_jsonb(new);
    source_j := new_j;
    action_name := lower(tg_op);
  end if;

  begin org_id := nullif(source_j ->> 'organization_id', '')::uuid; exception when others then org_id := null; end;
  begin school_id_value := nullif(source_j ->> 'school_id', '')::uuid; exception when others then school_id_value := null; end;
  begin entity_uuid := nullif(source_j ->> 'id', '')::uuid; exception when others then entity_uuid := null; end;

  insert into public.audit_logs (
    organization_id,
    school_id,
    actor_profile_id,
    actor_type,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) values (
    org_id,
    school_id_value,
    auth.uid(),
    case when auth.uid() is null then 'system' else 'user' end,
    action_name,
    tg_table_name,
    entity_uuid,
    old_j,
    new_j
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- High-value audit surfaces for Core V1.
create trigger audit_membership_roles
  after insert or update or delete on public.membership_roles
  for each row execute function public.audit_row_change();
create trigger audit_student_guardians
  after insert or update or delete on public.student_guardians
  for each row execute function public.audit_row_change();
create trigger audit_student_attendance
  after insert or update or delete on public.student_attendance_records
  for each row execute function public.audit_row_change();
create trigger audit_student_scores
  after insert or update or delete on public.student_scores
  for each row execute function public.audit_row_change();
create trigger audit_report_cards
  after insert or update or delete on public.report_cards
  for each row execute function public.audit_row_change();

-- -----------------------------------------------------------------------------
-- Academic consistency guards
-- -----------------------------------------------------------------------------

create or replace function public.validate_class_enrollment_consistency()
returns trigger
language plpgsql
as $$
declare
  v_enrollment_year uuid;
  v_class_year uuid;
begin
  select academic_year_id into v_enrollment_year
  from public.student_enrollments
  where id = new.student_enrollment_id;

  select academic_year_id into v_class_year
  from public.classrooms
  where id = new.classroom_id;

  if v_enrollment_year is null or v_class_year is null or v_enrollment_year <> v_class_year then
    raise exception 'ClassEnrollment classroom must belong to the same academic year as StudentEnrollment';
  end if;

  return new;
end;
$$;

create trigger trg_class_enrollments_validate_consistency
before insert or update on public.class_enrollments
for each row execute function public.validate_class_enrollment_consistency();

create or replace function public.validate_teaching_assignment_consistency()
returns trigger
language plpgsql
as $$
declare
  v_class_year uuid;
  v_term_year uuid;
begin
  select academic_year_id into v_class_year from public.classrooms where id = new.classroom_id;
  if v_class_year is null or v_class_year <> new.academic_year_id then
    raise exception 'TeachingAssignment classroom academic year mismatch';
  end if;

  if new.term_id is not null then
    select academic_year_id into v_term_year from public.terms where id = new.term_id;
    if v_term_year is null or v_term_year <> new.academic_year_id then
      raise exception 'TeachingAssignment term academic year mismatch';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_teaching_assignments_validate_consistency
before insert or update on public.teaching_assignments
for each row execute function public.validate_teaching_assignment_consistency();

create or replace function public.validate_timetable_consistency()
returns trigger
language plpgsql
as $$
declare
  ta public.teaching_assignments;
  v_term_year uuid;
begin
  select * into ta from public.teaching_assignments where id = new.teaching_assignment_id;
  if not found or ta.academic_year_id <> new.academic_year_id then
    raise exception 'TimetableEntry teaching assignment academic year mismatch';
  end if;

  if ta.term_id is not null and new.term_id is not null and ta.term_id <> new.term_id then
    raise exception 'TimetableEntry term must match TeachingAssignment term when assignment is term-scoped';
  end if;

  if new.term_id is not null then
    select academic_year_id into v_term_year from public.terms where id = new.term_id;
    if v_term_year is null or v_term_year <> new.academic_year_id then
      raise exception 'TimetableEntry term academic year mismatch';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_timetable_entries_validate_consistency
before insert or update on public.timetable_entries
for each row execute function public.validate_timetable_consistency();

create or replace function public.validate_attendance_session_consistency()
returns trigger
language plpgsql
as $$
declare
  c public.classrooms;
  t public.terms;
  ta public.teaching_assignments;
  te public.timetable_entries;
begin
  select * into c from public.classrooms where id = new.classroom_id;
  if not found or c.academic_year_id <> new.academic_year_id then
    raise exception 'AttendanceSession classroom academic year mismatch';
  end if;

  select * into t from public.terms where id = new.term_id;
  if not found or t.academic_year_id <> new.academic_year_id then
    raise exception 'AttendanceSession term academic year mismatch';
  end if;

  if new.teaching_assignment_id is not null then
    select * into ta from public.teaching_assignments where id = new.teaching_assignment_id;
    if not found or ta.academic_year_id <> new.academic_year_id or ta.classroom_id <> new.classroom_id then
      raise exception 'AttendanceSession teaching assignment mismatch';
    end if;
  end if;

  if new.timetable_entry_id is not null then
    select * into te from public.timetable_entries where id = new.timetable_entry_id;
    if not found or te.academic_year_id <> new.academic_year_id then
      raise exception 'AttendanceSession timetable academic year mismatch';
    end if;
    if new.teaching_assignment_id is not null and te.teaching_assignment_id <> new.teaching_assignment_id then
      raise exception 'AttendanceSession timetable and teaching assignment mismatch';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_attendance_sessions_validate_consistency
before insert or update on public.attendance_sessions
for each row execute function public.validate_attendance_session_consistency();

create or replace function public.validate_assessment_consistency()
returns trigger
language plpgsql
as $$
declare
  ta public.teaching_assignments;
  t public.terms;
begin
  select * into ta from public.teaching_assignments where id = new.teaching_assignment_id;
  if not found or ta.academic_year_id <> new.academic_year_id then
    raise exception 'Assessment teaching assignment academic year mismatch';
  end if;

  select * into t from public.terms where id = new.term_id;
  if not found or t.academic_year_id <> new.academic_year_id then
    raise exception 'Assessment term academic year mismatch';
  end if;

  if ta.term_id is not null and ta.term_id <> new.term_id then
    raise exception 'Assessment term must match term-scoped TeachingAssignment';
  end if;

  return new;
end;
$$;

create trigger trg_assessments_validate_consistency
before insert or update on public.assessments
for each row execute function public.validate_assessment_consistency();

create or replace function public.validate_report_card_consistency()
returns trigger
language plpgsql
as $$
declare
  se public.student_enrollments;
  t public.terms;
begin
  select * into se from public.student_enrollments where id = new.student_enrollment_id;
  if not found or se.academic_year_id <> new.academic_year_id then
    raise exception 'ReportCard enrollment academic year mismatch';
  end if;

  select * into t from public.terms where id = new.term_id;
  if not found or t.academic_year_id <> new.academic_year_id then
    raise exception 'ReportCard term academic year mismatch';
  end if;

  return new;
end;
$$;

create trigger trg_report_cards_validate_consistency
before insert or update on public.report_cards
for each row execute function public.validate_report_card_consistency();

-- Tenant boundary columns are immutable after insert. Cross-school lifecycle changes
-- are represented by new domain records (for example StudentEnrollment), never by
-- moving an existing row to another organization/school.
create or replace function public.prevent_tenant_boundary_change()
returns trigger
language plpgsql
as $$
declare
  old_j jsonb := to_jsonb(old);
  new_j jsonb := to_jsonb(new);
begin
  if old_j ? 'organization_id' and (old_j ->> 'organization_id') is distinct from (new_j ->> 'organization_id') then
    raise exception 'organization_id is immutable';
  end if;
  if old_j ? 'school_id' and (old_j ->> 'school_id') is distinct from (new_j ->> 'school_id') then
    raise exception 'school_id is immutable';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'schools','school_settings','organization_memberships','membership_school_access','membership_roles','invitations',
    'academic_years','terms','grade_levels','classrooms','subjects','curricula','learning_outcomes','learning_objectives',
    'students','guardians','student_guardians','staff_members','staff_school_assignments','student_enrollments','class_enrollments',
    'teaching_assignments','timetable_entries','academic_calendar_events','attendance_sessions','student_attendance_records',
    'staff_attendance_records','assessment_types','assessments','student_scores','file_assets','report_cards',
    'report_card_subject_entries','report_card_narratives','generated_documents'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.prevent_tenant_boundary_change()',
      'trg_' || t || '_tenant_immutable', t
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Authorization consistency guards
-- -----------------------------------------------------------------------------

create or replace function public.validate_membership_role_scope()
returns trigger
language plpgsql
as $$
declare
  v_role_org uuid;
  v_school_id uuid;
begin
  select organization_id into v_role_org from public.roles where id = new.role_id;
  if not found then
    raise exception 'Role % not found', new.role_id;
  end if;

  if v_role_org is not null and v_role_org <> new.organization_id then
    raise exception 'Custom role belongs to another organization';
  end if;

  if new.scope_type = 'SCHOOL' then
    if not exists (
      select 1 from public.schools s
      where s.id = new.scope_id and s.organization_id = new.organization_id
    ) then
      raise exception 'School scope does not belong to membership organization';
    end if;

    if not exists (
      select 1 from public.membership_school_access msa
      where msa.membership_id = new.membership_id
        and msa.organization_id = new.organization_id
        and msa.school_id = new.scope_id
        and msa.status = 'active'
    ) then
      raise exception 'Membership must have active school access before SCHOOL role scope is granted';
    end if;
  elsif new.scope_type = 'CLASS' then
    select c.school_id into v_school_id
    from public.classrooms c
    where c.id = new.scope_id and c.organization_id = new.organization_id;

    if v_school_id is null then
      raise exception 'Class scope does not belong to membership organization';
    end if;

    if not exists (
      select 1 from public.membership_school_access msa
      where msa.membership_id = new.membership_id
        and msa.organization_id = new.organization_id
        and msa.school_id = v_school_id
        and msa.status = 'active'
    ) then
      raise exception 'Membership must have active school access before CLASS role scope is granted';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_membership_roles_validate_scope
before insert or update on public.membership_roles
for each row execute function public.validate_membership_role_scope();

-- -----------------------------------------------------------------------------
-- 9. Critical general indexes
-- -----------------------------------------------------------------------------

create index idx_schools_org_status on public.schools (organization_id, status);
create index idx_academic_years_school_dates on public.academic_years (school_id, starts_on, ends_on);
create index idx_terms_year_sequence on public.terms (academic_year_id, sequence);
create index idx_subjects_school_active on public.subjects (school_id, is_active);
create index idx_staff_assignments_org_school on public.staff_school_assignments (organization_id, school_id, status);
create index idx_assessment_types_school_active on public.assessment_types (school_id, is_active);

-- -----------------------------------------------------------------------------
-- 10. Conservative grants. RLS policies are installed by 08_RLS_POLICIES.sql.
--     No application table is granted to anon.
-- -----------------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.organizations,
  public.schools,
  public.school_settings,
  public.profiles,
  public.organization_memberships,
  public.membership_school_access,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.membership_roles,
  public.invitations,
  public.academic_years,
  public.terms,
  public.grade_levels,
  public.classrooms,
  public.subjects,
  public.curricula,
  public.learning_outcomes,
  public.learning_objectives,
  public.students,
  public.guardians,
  public.student_guardians,
  public.staff_members,
  public.staff_school_assignments,
  public.student_enrollments,
  public.class_enrollments,
  public.teaching_assignments,
  public.timetable_entries,
  public.academic_calendar_events,
  public.attendance_sessions,
  public.student_attendance_records,
  public.staff_attendance_records,
  public.assessment_types,
  public.assessments,
  public.assessment_learning_objectives,
  public.student_scores,
  public.file_assets,
  public.report_cards,
  public.report_card_subject_entries,
  public.report_card_narratives,
  public.generated_documents,
  public.audit_logs
  to authenticated;

commit;
