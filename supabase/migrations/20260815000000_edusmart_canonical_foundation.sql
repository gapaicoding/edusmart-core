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
-- EduSmart SchoolOS — Core V1 Row Level Security
-- Version: 1.0
-- Requires: 07_DATABASE_SCHEMA.sql
-- Principle: authentication != authorization. All tenant data is protected by RLS.

begin;

-- -----------------------------------------------------------------------------
-- 1. Authorization helper functions
-- -----------------------------------------------------------------------------

create or replace function public.has_active_membership(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.profiles p on p.id = m.profile_id
    where m.organization_id = p_organization_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and p.status = 'active'
  );
$$;

create or replace function public.has_any_active_membership()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.profiles p on p.id = m.profile_id
    where m.profile_id = auth.uid()
      and m.status = 'active'
      and p.status = 'active'
  );
$$;

create or replace function public.is_own_membership(p_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.id = p_membership_id
      and m.profile_id = auth.uid()
  );
$$;

create or replace function public.has_permission_in_org(
  p_permission_code text,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.profiles p on p.id = m.profile_id
    join public.membership_roles mr on mr.membership_id = m.id and mr.organization_id = m.organization_id
    join public.roles r on r.id = mr.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions perm on perm.id = rp.permission_id
    where m.organization_id = p_organization_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and p.status = 'active'
      and perm.code = p_permission_code
      and (r.organization_id is null or r.organization_id = p_organization_id)
      and (mr.starts_at is null or mr.starts_at <= now())
      and (mr.ends_at is null or mr.ends_at > now())
  );
$$;

create or replace function public.has_permission(
  p_permission_code text,
  p_organization_id uuid,
  p_school_id uuid default null,
  p_classroom_id uuid default null,
  p_owner_profile_id uuid default null,
  p_related_student_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.profiles p on p.id = m.profile_id
    join public.membership_roles mr on mr.membership_id = m.id and mr.organization_id = m.organization_id
    join public.roles r on r.id = mr.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions perm on perm.id = rp.permission_id
    where m.organization_id = p_organization_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and p.status = 'active'
      and perm.code = p_permission_code
      and (r.organization_id is null or r.organization_id = p_organization_id)
      and (mr.starts_at is null or mr.starts_at <= now())
      and (mr.ends_at is null or mr.ends_at > now())
      and (
        mr.scope_type = 'ORG'
        or (
          mr.scope_type = 'SCHOOL'
          and p_school_id is not null
          and mr.scope_id = p_school_id
        )
        or (
          mr.scope_type = 'CLASS'
          and p_classroom_id is not null
          and mr.scope_id = p_classroom_id
        )
        or (
          mr.scope_type = 'OWN'
          and (
            (p_owner_profile_id is not null and p_owner_profile_id = auth.uid())
            or exists (
              select 1
              from public.students s
              join public.student_enrollments se
                on se.student_id = s.id and se.organization_id = s.organization_id
              left join public.class_enrollments ce
                on ce.student_enrollment_id = se.id
               and ce.organization_id = se.organization_id
               and ce.school_id = se.school_id
               and ce.status = 'active'
              where s.organization_id = p_organization_id
                and s.profile_id = auth.uid()
                and (p_school_id is null or se.school_id = p_school_id)
                and (p_classroom_id is null or ce.classroom_id = p_classroom_id)
                and se.status in ('active','leave')
            )
          )
        )
        or (
          mr.scope_type = 'RELATED'
          and exists (
            select 1
            from public.guardians g
            join public.student_guardians sg
              on sg.guardian_id = g.id
             and sg.organization_id = g.organization_id
             and sg.status = 'active'
            join public.students s
              on s.id = sg.student_id
             and s.organization_id = sg.organization_id
            left join public.student_enrollments se
              on se.student_id = s.id
             and se.organization_id = s.organization_id
             and se.status in ('active','leave')
            left join public.class_enrollments ce
              on ce.student_enrollment_id = se.id
             and ce.organization_id = se.organization_id
             and ce.school_id = se.school_id
             and ce.status = 'active'
            where g.organization_id = p_organization_id
              and g.profile_id = auth.uid()
              and (p_related_student_id is null or s.id = p_related_student_id)
              and (p_school_id is null or se.school_id = p_school_id)
              and (p_classroom_id is null or ce.classroom_id = p_classroom_id)
          )
        )
      )
  );
$$;

create or replace function public.can_read_membership(
  p_membership_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_own_membership(p_membership_id)
    or public.has_permission('membership.read', p_organization_id)
    or exists (
      select 1
      from public.membership_school_access msa
      where msa.membership_id = p_membership_id
        and msa.organization_id = p_organization_id
        and msa.status = 'active'
        and public.has_permission('membership.read', p_organization_id, msa.school_id)
    );
$$;

create or replace function public.can_read_role(p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.roles r
    where r.id = p_role_id
      and (
        (r.organization_id is null and public.has_any_active_membership())
        or (r.organization_id is not null and public.has_permission_in_org('role.read', r.organization_id))
      )
  );
$$;

create or replace function public.can_read_membership_role(
  p_membership_id uuid,
  p_organization_id uuid,
  p_scope_type text,
  p_scope_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  if public.is_own_membership(p_membership_id) or public.has_permission('membership.read', p_organization_id) then
    return true;
  end if;

  if p_scope_type = 'SCHOOL' then
    return public.has_permission('membership.read', p_organization_id, p_scope_id);
  elsif p_scope_type = 'CLASS' then
    select school_id into v_school_id from public.classrooms where id = p_scope_id and organization_id = p_organization_id;
    return v_school_id is not null and public.has_permission('membership.read', p_organization_id, v_school_id);
  end if;

  return false;
end;
$$;

create or replace function public.has_staff_scope_permission(
  p_permission_code text,
  p_organization_id uuid,
  p_school_id uuid default null,
  p_classroom_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.profiles p on p.id = m.profile_id
    join public.membership_roles mr on mr.membership_id = m.id and mr.organization_id = m.organization_id
    join public.roles r on r.id = mr.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions perm on perm.id = rp.permission_id
    where m.organization_id = p_organization_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and p.status = 'active'
      and perm.code = p_permission_code
      and (r.organization_id is null or r.organization_id = p_organization_id)
      and (mr.starts_at is null or mr.starts_at <= now())
      and (mr.ends_at is null or mr.ends_at > now())
      and (
        mr.scope_type = 'ORG'
        or (mr.scope_type = 'SCHOOL' and p_school_id is not null and mr.scope_id = p_school_id)
        or (mr.scope_type = 'CLASS' and p_classroom_id is not null and mr.scope_id = p_classroom_id)
      )
  );
$$;

create or replace function public.can_access_student(
  p_permission_code text,
  p_student_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    left join public.student_enrollments se
      on se.student_id = s.id
     and se.organization_id = s.organization_id
     and se.status in ('active','leave','transferred','graduated')
    left join public.class_enrollments ce
      on ce.student_enrollment_id = se.id
     and ce.organization_id = se.organization_id
     and ce.school_id = se.school_id
     and ce.status = 'active'
    where s.id = p_student_id
      and s.organization_id = p_organization_id
      and public.has_permission(
        p_permission_code,
        s.organization_id,
        se.school_id,
        ce.classroom_id,
        s.profile_id,
        s.id
      )
  )
  or exists (
    select 1
    from public.students s
    where s.id = p_student_id
      and s.organization_id = p_organization_id
      and public.has_permission(
        p_permission_code,
        s.organization_id,
        null,
        null,
        s.profile_id,
        s.id
      )
  );
$$;

create or replace function public.can_access_guardian(
  p_permission_code text,
  p_guardian_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.guardians g
    left join public.student_guardians sg
      on sg.guardian_id = g.id
     and sg.organization_id = g.organization_id
     and sg.status = 'active'
    left join public.students s
      on s.id = sg.student_id
     and s.organization_id = sg.organization_id
    left join public.student_enrollments se
      on se.student_id = s.id
     and se.organization_id = s.organization_id
     and se.status in ('active','leave')
    left join public.class_enrollments ce
      on ce.student_enrollment_id = se.id
     and ce.organization_id = se.organization_id
     and ce.school_id = se.school_id
     and ce.status = 'active'
    where g.id = p_guardian_id
      and g.organization_id = p_organization_id
      and (
        g.profile_id = auth.uid()
        or public.has_permission(
          p_permission_code,
          g.organization_id,
          se.school_id,
          ce.classroom_id,
          null,
          s.id
        )
      )
  );
$$;

create or replace function public.can_access_staff(
  p_permission_code text,
  p_staff_member_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_members sm
    left join public.staff_school_assignments ssa
      on ssa.staff_member_id = sm.id
     and ssa.organization_id = sm.organization_id
     and ssa.status = 'active'
    where sm.id = p_staff_member_id
      and sm.organization_id = p_organization_id
      and (
        sm.profile_id = auth.uid()
        or public.has_permission(
          p_permission_code,
          sm.organization_id,
          ssa.school_id,
          null,
          sm.profile_id,
          null
        )
      )
  );
$$;

create or replace function public.can_access_enrollment(
  p_permission_code text,
  p_enrollment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_enrollments se
    join public.students s on s.id = se.student_id and s.organization_id = se.organization_id
    left join public.class_enrollments ce
      on ce.student_enrollment_id = se.id
     and ce.organization_id = se.organization_id
     and ce.school_id = se.school_id
     and ce.status = 'active'
    where se.id = p_enrollment_id
      and public.has_permission(
        p_permission_code,
        se.organization_id,
        se.school_id,
        ce.classroom_id,
        s.profile_id,
        s.id
      )
  );
$$;

create or replace function public.can_access_teaching_assignment(
  p_permission_code text,
  p_assignment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teaching_assignments ta
    join public.staff_school_assignments ssa
      on ssa.id = ta.staff_school_assignment_id
     and ssa.organization_id = ta.organization_id
     and ssa.school_id = ta.school_id
    join public.staff_members sm
      on sm.id = ssa.staff_member_id
     and sm.organization_id = ssa.organization_id
    where ta.id = p_assignment_id
      and public.has_permission(
        p_permission_code,
        ta.organization_id,
        ta.school_id,
        ta.classroom_id,
        sm.profile_id,
        null
      )
  );
$$;

create or replace function public.owns_teaching_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teaching_assignments ta
    join public.staff_school_assignments ssa on ssa.id = ta.staff_school_assignment_id
    join public.staff_members sm on sm.id = ssa.staff_member_id
    where ta.id = p_assignment_id
      and sm.profile_id = auth.uid()
      and ta.status = 'active'
      and ssa.status = 'active'
  );
$$;

create or replace function public.can_access_assessment(
  p_permission_code text,
  p_assessment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assessments a
    join public.teaching_assignments ta
      on ta.id = a.teaching_assignment_id
     and ta.organization_id = a.organization_id
     and ta.school_id = a.school_id
    where a.id = p_assessment_id
      and public.has_permission(
        p_permission_code,
        a.organization_id,
        a.school_id,
        ta.classroom_id,
        a.created_by_profile_id,
        null
      )
  );
$$;

create or replace function public.can_access_report_card(
  p_permission_code text,
  p_report_card_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.report_cards rc
    join public.student_enrollments se
      on se.id = rc.student_enrollment_id
     and se.organization_id = rc.organization_id
     and se.school_id = rc.school_id
    join public.students s
      on s.id = se.student_id
     and s.organization_id = se.organization_id
    left join public.class_enrollments ce
      on ce.student_enrollment_id = se.id
     and ce.organization_id = se.organization_id
     and ce.school_id = se.school_id
     and ce.status = 'active'
    where rc.id = p_report_card_id
      and public.has_permission(
        p_permission_code,
        rc.organization_id,
        rc.school_id,
        ce.classroom_id,
        s.profile_id,
        s.id
      )
  );
$$;

revoke all on function public.has_active_membership(uuid) from public;
revoke all on function public.has_any_active_membership() from public;
revoke all on function public.is_own_membership(uuid) from public;
revoke all on function public.has_permission_in_org(text, uuid) from public;
revoke all on function public.has_permission(text, uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function public.has_staff_scope_permission(text, uuid, uuid, uuid) from public;
revoke all on function public.can_read_membership(uuid, uuid) from public;
revoke all on function public.can_read_role(uuid) from public;
revoke all on function public.can_read_membership_role(uuid, uuid, text, uuid) from public;
revoke all on function public.can_access_student(text, uuid, uuid) from public;
revoke all on function public.can_access_guardian(text, uuid, uuid) from public;
revoke all on function public.can_access_staff(text, uuid, uuid) from public;
revoke all on function public.can_access_enrollment(text, uuid) from public;
revoke all on function public.can_access_teaching_assignment(text, uuid) from public;
revoke all on function public.owns_teaching_assignment(uuid) from public;
revoke all on function public.can_access_assessment(text, uuid) from public;
revoke all on function public.can_access_report_card(text, uuid) from public;

grant execute on function public.has_active_membership(uuid) to authenticated;
grant execute on function public.has_any_active_membership() to authenticated;
grant execute on function public.is_own_membership(uuid) to authenticated;
grant execute on function public.has_permission_in_org(text, uuid) to authenticated;
grant execute on function public.has_permission(text, uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.has_staff_scope_permission(text, uuid, uuid, uuid) to authenticated;
grant execute on function public.can_read_membership(uuid, uuid) to authenticated;
grant execute on function public.can_read_role(uuid) to authenticated;
grant execute on function public.can_read_membership_role(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.can_access_student(text, uuid, uuid) to authenticated;
grant execute on function public.can_access_guardian(text, uuid, uuid) to authenticated;
grant execute on function public.can_access_staff(text, uuid, uuid) to authenticated;
grant execute on function public.can_access_enrollment(text, uuid) to authenticated;
grant execute on function public.can_access_teaching_assignment(text, uuid) to authenticated;
grant execute on function public.owns_teaching_assignment(uuid) to authenticated;
grant execute on function public.can_access_assessment(text, uuid) to authenticated;
grant execute on function public.can_access_report_card(text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Enable RLS everywhere exposed through public schema
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations','schools','school_settings','profiles','organization_memberships',
    'membership_school_access','roles','permissions','role_permissions','membership_roles','invitations',
    'academic_years','terms','grade_levels','classrooms','subjects','curricula','learning_outcomes','learning_objectives',
    'students','guardians','student_guardians','staff_members','staff_school_assignments','student_enrollments','class_enrollments',
    'teaching_assignments','timetable_entries','academic_calendar_events',
    'attendance_sessions','student_attendance_records','staff_attendance_records',
    'assessment_types','assessments','assessment_learning_objectives','student_scores',
    'file_assets','report_cards','report_card_subject_entries','report_card_narratives','generated_documents','audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Organization / school / profile / RBAC policies
-- -----------------------------------------------------------------------------

create policy organizations_select
on public.organizations for select to authenticated
using (public.has_permission_in_org('organization.read', id));

create policy organizations_update
on public.organizations for update to authenticated
using (public.has_permission('organization.update', id))
with check (public.has_permission('organization.update', id));

create policy schools_select
on public.schools for select to authenticated
using (public.has_permission('school.read', organization_id, id));

create policy schools_update
on public.schools for update to authenticated
using (public.has_permission('school.update', organization_id, id))
with check (public.has_permission('school.update', organization_id, id));

create policy school_settings_select
on public.school_settings for select to authenticated
using (public.has_staff_scope_permission('school.read', organization_id, school_id));

create policy school_settings_update
on public.school_settings for update to authenticated
using (public.has_permission('school.update', organization_id, school_id))
with check (public.has_permission('school.update', organization_id, school_id));

create policy profiles_select_self
on public.profiles for select to authenticated
using (id = auth.uid());

create policy profiles_update_self
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy memberships_select
on public.organization_memberships for select to authenticated
using (public.can_read_membership(id, organization_id));

create policy membership_school_access_select
on public.membership_school_access for select to authenticated
using (
  public.is_own_membership(membership_id)
  or public.has_permission('membership.read', organization_id, school_id)
);

create policy roles_select
on public.roles for select to authenticated
using (public.can_read_role(id));

create policy permissions_select
on public.permissions for select to authenticated
using (public.has_any_active_membership());

create policy role_permissions_select
on public.role_permissions for select to authenticated
using (public.can_read_role(role_id));

create policy membership_roles_select
on public.membership_roles for select to authenticated
using (public.can_read_membership_role(membership_id, organization_id, scope_type, scope_id));

create policy invitations_select
on public.invitations for select to authenticated
using (
  public.has_permission('membership.read', organization_id)
  or (school_id is not null and public.has_permission('membership.read', organization_id, school_id))
);

-- Sensitive membership/role/invitation writes are server/RPC-only in Core V1.

-- -----------------------------------------------------------------------------
-- 4. Academic foundation policies
-- -----------------------------------------------------------------------------

create policy academic_years_select
on public.academic_years for select to authenticated
using (public.has_permission('academic_year.read', organization_id, school_id));
create policy academic_years_insert
on public.academic_years for insert to authenticated
with check (public.has_permission('academic_year.manage', organization_id, school_id));
create policy academic_years_update
on public.academic_years for update to authenticated
using (public.has_permission('academic_year.manage', organization_id, school_id))
with check (public.has_permission('academic_year.manage', organization_id, school_id));

create policy terms_select
on public.terms for select to authenticated
using (public.has_permission('term.read', organization_id, school_id));
create policy terms_insert
on public.terms for insert to authenticated
with check (public.has_permission('term.manage', organization_id, school_id));
create policy terms_update
on public.terms for update to authenticated
using (public.has_permission('term.manage', organization_id, school_id))
with check (public.has_permission('term.manage', organization_id, school_id));

create policy grade_levels_select
on public.grade_levels for select to authenticated
using (public.has_permission('grade_level.read', organization_id, school_id));
create policy grade_levels_insert
on public.grade_levels for insert to authenticated
with check (public.has_permission('grade_level.manage', organization_id, school_id));
create policy grade_levels_update
on public.grade_levels for update to authenticated
using (public.has_permission('grade_level.manage', organization_id, school_id))
with check (public.has_permission('grade_level.manage', organization_id, school_id));

create policy classrooms_select
on public.classrooms for select to authenticated
using (public.has_permission('classroom.read', organization_id, school_id, id));
create policy classrooms_insert
on public.classrooms for insert to authenticated
with check (public.has_permission('classroom.manage', organization_id, school_id));
create policy classrooms_update
on public.classrooms for update to authenticated
using (public.has_permission('classroom.manage', organization_id, school_id))
with check (public.has_permission('classroom.manage', organization_id, school_id));

create policy subjects_select
on public.subjects for select to authenticated
using (public.has_permission('subject.read', organization_id, school_id));
create policy subjects_insert
on public.subjects for insert to authenticated
with check (public.has_permission('subject.manage', organization_id, school_id));
create policy subjects_update
on public.subjects for update to authenticated
using (public.has_permission('subject.manage', organization_id, school_id))
with check (public.has_permission('subject.manage', organization_id, school_id));

create policy curricula_select
on public.curricula for select to authenticated
using (public.has_permission('curriculum.read', organization_id, school_id));
create policy curricula_insert
on public.curricula for insert to authenticated
with check (public.has_permission('curriculum.manage', organization_id, school_id));
create policy curricula_update
on public.curricula for update to authenticated
using (public.has_permission('curriculum.manage', organization_id, school_id))
with check (public.has_permission('curriculum.manage', organization_id, school_id));

create policy learning_outcomes_select
on public.learning_outcomes for select to authenticated
using (public.has_permission('curriculum.read', organization_id, school_id));
create policy learning_outcomes_insert
on public.learning_outcomes for insert to authenticated
with check (public.has_permission('curriculum.manage', organization_id, school_id));
create policy learning_outcomes_update
on public.learning_outcomes for update to authenticated
using (public.has_permission('curriculum.manage', organization_id, school_id))
with check (public.has_permission('curriculum.manage', organization_id, school_id));

create policy learning_objectives_select
on public.learning_objectives for select to authenticated
using (public.has_permission('curriculum.read', organization_id, school_id));
create policy learning_objectives_insert
on public.learning_objectives for insert to authenticated
with check (public.has_permission('curriculum.manage', organization_id, school_id));
create policy learning_objectives_update
on public.learning_objectives for update to authenticated
using (public.has_permission('curriculum.manage', organization_id, school_id))
with check (public.has_permission('curriculum.manage', organization_id, school_id));

-- -----------------------------------------------------------------------------
-- 5. SIS policies
-- -----------------------------------------------------------------------------

create policy students_select
on public.students for select to authenticated
using (public.can_access_student('student.read', id, organization_id));

create policy students_insert
on public.students for insert to authenticated
with check (
  public.has_permission_in_org('student.create', organization_id)
  and (status <> 'archived' or public.has_permission_in_org('student.archive', organization_id))
);

create policy students_update
on public.students for update to authenticated
using (public.can_access_student('student.update', id, organization_id))
with check (public.can_access_student('student.update', id, organization_id));

create policy guardians_select
on public.guardians for select to authenticated
using (public.can_access_guardian('guardian.read', id, organization_id));

create policy guardians_insert
on public.guardians for insert to authenticated
with check (public.has_permission_in_org('guardian.manage', organization_id));

create policy guardians_update
on public.guardians for update to authenticated
using (public.can_access_guardian('guardian.manage', id, organization_id))
with check (public.can_access_guardian('guardian.manage', id, organization_id));

create policy student_guardians_select
on public.student_guardians for select to authenticated
using (
  public.can_access_student('student.read', student_id, organization_id)
  or exists (
    select 1 from public.guardians g
    where g.id = student_guardians.guardian_id
      and g.profile_id = auth.uid()
      and g.organization_id = student_guardians.organization_id
  )
);

create policy student_guardians_insert
on public.student_guardians for insert to authenticated
with check (public.has_permission_in_org('guardian.manage', organization_id));

create policy student_guardians_update
on public.student_guardians for update to authenticated
using (public.can_access_guardian('guardian.manage', guardian_id, organization_id))
with check (public.can_access_guardian('guardian.manage', guardian_id, organization_id));

create policy staff_members_select
on public.staff_members for select to authenticated
using (public.can_access_staff('staff.read', id, organization_id));

create policy staff_members_insert
on public.staff_members for insert to authenticated
with check (public.has_permission_in_org('staff.create', organization_id));

create policy staff_members_update
on public.staff_members for update to authenticated
using (public.can_access_staff('staff.update', id, organization_id))
with check (public.can_access_staff('staff.update', id, organization_id));

create policy staff_school_assignments_select
on public.staff_school_assignments for select to authenticated
using (public.has_permission('staff.read', organization_id, school_id));

create policy staff_school_assignments_insert
on public.staff_school_assignments for insert to authenticated
with check (public.has_permission('staff.create', organization_id, school_id));

create policy staff_school_assignments_update
on public.staff_school_assignments for update to authenticated
using (public.has_permission('staff.update', organization_id, school_id))
with check (public.has_permission('staff.update', organization_id, school_id));

create policy student_enrollments_select
on public.student_enrollments for select to authenticated
using (public.can_access_enrollment('enrollment.read', id));

create policy student_enrollments_insert
on public.student_enrollments for insert to authenticated
with check (public.has_permission('enrollment.manage', organization_id, school_id));

create policy student_enrollments_update
on public.student_enrollments for update to authenticated
using (public.has_permission('enrollment.manage', organization_id, school_id))
with check (public.has_permission('enrollment.manage', organization_id, school_id));

create policy class_enrollments_select
on public.class_enrollments for select to authenticated
using (public.can_access_enrollment('enrollment.read', student_enrollment_id));

create policy class_enrollments_insert
on public.class_enrollments for insert to authenticated
with check (public.has_permission('class_enrollment.manage', organization_id, school_id, classroom_id));

create policy class_enrollments_update
on public.class_enrollments for update to authenticated
using (public.has_permission('class_enrollment.manage', organization_id, school_id, classroom_id))
with check (public.has_permission('class_enrollment.manage', organization_id, school_id, classroom_id));

-- -----------------------------------------------------------------------------
-- 6. Teaching & schedule policies
-- -----------------------------------------------------------------------------

create policy teaching_assignments_select
on public.teaching_assignments for select to authenticated
using (public.can_access_teaching_assignment('teaching_assignment.read', id));

create policy teaching_assignments_insert
on public.teaching_assignments for insert to authenticated
with check (
  public.has_permission('teaching_assignment.create', organization_id, school_id, classroom_id)
  and (status <> 'archived' or public.has_permission('teaching_assignment.archive', organization_id, school_id, classroom_id))
);

create policy teaching_assignments_update
on public.teaching_assignments for update to authenticated
using (public.has_permission('teaching_assignment.update', organization_id, school_id, classroom_id))
with check (public.has_permission('teaching_assignment.update', organization_id, school_id, classroom_id));

create policy timetable_entries_select
on public.timetable_entries for select to authenticated
using (
  exists (
    select 1 from public.teaching_assignments ta
    where ta.id = timetable_entries.teaching_assignment_id
      and (
        public.has_staff_scope_permission('schedule.read', timetable_entries.organization_id, timetable_entries.school_id, ta.classroom_id)
        or (timetable_entries.status = 'published' and public.can_access_teaching_assignment('schedule.read', timetable_entries.teaching_assignment_id))
      )
  )
);

create policy timetable_entries_insert
on public.timetable_entries for insert to authenticated
with check (exists (
  select 1 from public.teaching_assignments ta
  where ta.id = timetable_entries.teaching_assignment_id
    and public.has_permission('schedule.create', timetable_entries.organization_id, timetable_entries.school_id, ta.classroom_id)
    and (
      timetable_entries.status <> 'published'
      or public.has_permission('schedule.publish', timetable_entries.organization_id, timetable_entries.school_id, ta.classroom_id)
    )
));

create policy timetable_entries_update
on public.timetable_entries for update to authenticated
using (exists (
  select 1 from public.teaching_assignments ta
  where ta.id = timetable_entries.teaching_assignment_id
    and public.has_permission('schedule.update', timetable_entries.organization_id, timetable_entries.school_id, ta.classroom_id)
))
with check (exists (
  select 1 from public.teaching_assignments ta
  where ta.id = timetable_entries.teaching_assignment_id
    and public.has_permission('schedule.update', timetable_entries.organization_id, timetable_entries.school_id, ta.classroom_id)
));

create policy academic_calendar_select
on public.academic_calendar_events for select to authenticated
using (public.has_permission('schedule.read', organization_id, school_id));

create policy academic_calendar_insert
on public.academic_calendar_events for insert to authenticated
with check (public.has_permission('schedule.create', organization_id, school_id));

create policy academic_calendar_update
on public.academic_calendar_events for update to authenticated
using (public.has_permission('schedule.update', organization_id, school_id))
with check (public.has_permission('schedule.update', organization_id, school_id));

-- -----------------------------------------------------------------------------
-- 7. Attendance policies
-- -----------------------------------------------------------------------------

create policy attendance_sessions_select
on public.attendance_sessions for select to authenticated
using (public.has_permission('attendance.read', organization_id, school_id, classroom_id));

create policy attendance_sessions_insert
on public.attendance_sessions for insert to authenticated
with check (
  public.has_permission('attendance.session.create', organization_id, school_id, classroom_id)
  and status = 'open'
);

create policy attendance_sessions_update
on public.attendance_sessions for update to authenticated
using (
  (status = 'locked' and public.has_permission('attendance.correct_locked', organization_id, school_id, classroom_id))
  or (status <> 'locked' and (
    public.has_permission('attendance.submit', organization_id, school_id, classroom_id)
    or public.has_permission('attendance.correct_open', organization_id, school_id, classroom_id)
  ))
)
with check (
  public.has_permission('attendance.submit', organization_id, school_id, classroom_id)
  or public.has_permission('attendance.correct_open', organization_id, school_id, classroom_id)
  or public.has_permission('attendance.correct_locked', organization_id, school_id, classroom_id)
  or public.has_permission('attendance.lock', organization_id, school_id, classroom_id)
);

create policy student_attendance_select
on public.student_attendance_records for select to authenticated
using (
  exists (
    select 1
    from public.attendance_sessions s
    join public.student_enrollments se on se.id = student_attendance_records.student_enrollment_id
    join public.students st on st.id = se.student_id
    where s.id = student_attendance_records.attendance_session_id
      and public.has_permission(
        'attendance.read',
        student_attendance_records.organization_id,
        student_attendance_records.school_id,
        s.classroom_id,
        st.profile_id,
        st.id
      )
  )
);

create policy student_attendance_insert
on public.student_attendance_records for insert to authenticated
with check (exists (
  select 1 from public.attendance_sessions s
  where s.id = student_attendance_records.attendance_session_id
    and public.has_permission('attendance.record', student_attendance_records.organization_id, student_attendance_records.school_id, s.classroom_id)
));

create policy student_attendance_update
on public.student_attendance_records for update to authenticated
using (exists (
  select 1 from public.attendance_sessions s
  where s.id = student_attendance_records.attendance_session_id
    and (
      (s.status = 'locked' and public.has_permission('attendance.correct_locked', student_attendance_records.organization_id, student_attendance_records.school_id, s.classroom_id))
      or (s.status <> 'locked' and (
        public.has_permission('attendance.record', student_attendance_records.organization_id, student_attendance_records.school_id, s.classroom_id)
        or public.has_permission('attendance.correct_open', student_attendance_records.organization_id, student_attendance_records.school_id, s.classroom_id)
      ))
    )
))
with check (exists (
  select 1 from public.attendance_sessions s
  where s.id = student_attendance_records.attendance_session_id
    and (
      public.has_permission('attendance.record', student_attendance_records.organization_id, student_attendance_records.school_id, s.classroom_id)
      or public.has_permission('attendance.correct_open', student_attendance_records.organization_id, student_attendance_records.school_id, s.classroom_id)
      or public.has_permission('attendance.correct_locked', student_attendance_records.organization_id, student_attendance_records.school_id, s.classroom_id)
    )
));

create policy staff_attendance_select
on public.staff_attendance_records for select to authenticated
using (
  public.has_permission('attendance.read', organization_id, school_id)
  or exists (
    select 1 from public.staff_members sm
    where sm.id = staff_attendance_records.staff_member_id
      and sm.profile_id = auth.uid()
  )
);

create policy staff_attendance_insert
on public.staff_attendance_records for insert to authenticated
with check (public.has_permission('attendance.record', organization_id, school_id));

create policy staff_attendance_update
on public.staff_attendance_records for update to authenticated
using (public.has_permission('attendance.correct_open', organization_id, school_id))
with check (public.has_permission('attendance.correct_open', organization_id, school_id));

-- -----------------------------------------------------------------------------
-- 8. Assessment policies
-- -----------------------------------------------------------------------------

create policy assessment_types_select
on public.assessment_types for select to authenticated
using (public.has_permission_in_org('assessment.read', organization_id));

create policy assessment_types_insert
on public.assessment_types for insert to authenticated
with check (public.has_permission('academic_year.manage', organization_id, school_id));

create policy assessment_types_update
on public.assessment_types for update to authenticated
using (public.has_permission('academic_year.manage', organization_id, school_id))
with check (public.has_permission('academic_year.manage', organization_id, school_id));

create policy assessments_select
on public.assessments for select to authenticated
using (
  exists (
    select 1 from public.teaching_assignments ta
    where ta.id = assessments.teaching_assignment_id
      and (
        public.has_staff_scope_permission('assessment.read', assessments.organization_id, assessments.school_id, ta.classroom_id)
        or (assessments.status = 'published' and public.can_access_assessment('assessment.read', assessments.id))
      )
  )
);

create policy assessments_insert
on public.assessments for insert to authenticated
with check (
  status in ('draft','open')
  and public.can_access_teaching_assignment('assessment.create', teaching_assignment_id)
  and (
    public.owns_teaching_assignment(teaching_assignment_id)
    or public.has_permission('assessment.create', organization_id, school_id)
  )
);

create policy assessments_update
on public.assessments for update to authenticated
using (
  public.can_access_assessment('assessment.update_own', id)
  and (
    created_by_profile_id = auth.uid()
    or public.has_permission('assessment.update_own', organization_id, school_id)
  )
)
with check (
  public.can_access_assessment('assessment.update_own', id)
  and (
    created_by_profile_id = auth.uid()
    or public.has_permission('assessment.update_own', organization_id, school_id)
  )
);

create policy assessment_learning_objectives_select
on public.assessment_learning_objectives for select to authenticated
using (exists (
  select 1
  from public.assessments a
  join public.teaching_assignments ta on ta.id = a.teaching_assignment_id
  where a.id = assessment_learning_objectives.assessment_id
    and (
      public.has_staff_scope_permission('assessment.read', a.organization_id, a.school_id, ta.classroom_id)
      or (a.status = 'published' and public.can_access_assessment('assessment.read', a.id))
    )
));

create policy assessment_learning_objectives_insert
on public.assessment_learning_objectives for insert to authenticated
with check (
  public.can_access_assessment('assessment.update_own', assessment_id)
  and exists (
    select 1 from public.assessments a
    where a.id = assessment_learning_objectives.assessment_id
      and (a.created_by_profile_id = auth.uid() or public.has_permission('assessment.update_own', a.organization_id, a.school_id))
  )
);

create policy assessment_learning_objectives_delete
on public.assessment_learning_objectives for delete to authenticated
using (
  public.can_access_assessment('assessment.update_own', assessment_id)
  and exists (
    select 1 from public.assessments a
    where a.id = assessment_learning_objectives.assessment_id
      and (a.created_by_profile_id = auth.uid() or public.has_permission('assessment.update_own', a.organization_id, a.school_id))
  )
);

create policy student_scores_select
on public.student_scores for select to authenticated
using (
  exists (
    select 1
    from public.assessments a
    join public.teaching_assignments ta on ta.id = a.teaching_assignment_id
    join public.student_enrollments se on se.id = student_scores.student_enrollment_id
    join public.students st on st.id = se.student_id
    where a.id = student_scores.assessment_id
      and (
        public.has_staff_scope_permission(
          'score.read',
          student_scores.organization_id,
          student_scores.school_id,
          ta.classroom_id
        )
        or (
          a.status = 'published'
          and public.has_permission(
            'score.read',
            student_scores.organization_id,
            student_scores.school_id,
            ta.classroom_id,
            st.profile_id,
            st.id
          )
        )
      )
  )
);

create policy student_scores_insert
on public.student_scores for insert to authenticated
with check (exists (
  select 1
  from public.assessments a
  where a.id = student_scores.assessment_id
    and (
      (public.owns_teaching_assignment(a.teaching_assignment_id)
       and public.can_access_teaching_assignment('score.enter', a.teaching_assignment_id))
      or public.has_permission('score.enter', student_scores.organization_id, student_scores.school_id)
    )
));

create policy student_scores_update
on public.student_scores for update to authenticated
using (exists (
  select 1
  from public.assessments a
  where a.id = student_scores.assessment_id
    and (
      (a.status in ('draft','open','closed')
       and public.owns_teaching_assignment(a.teaching_assignment_id)
       and public.can_access_teaching_assignment('score.update_open', a.teaching_assignment_id))
      or public.has_permission('score.update_locked', student_scores.organization_id, student_scores.school_id)
    )
))
with check (exists (
  select 1
  from public.assessments a
  where a.id = student_scores.assessment_id
    and (
      (a.status in ('draft','open','closed')
       and public.owns_teaching_assignment(a.teaching_assignment_id)
       and public.can_access_teaching_assignment('score.update_open', a.teaching_assignment_id))
      or public.has_permission('score.update_locked', student_scores.organization_id, student_scores.school_id)
    )
));

-- -----------------------------------------------------------------------------
-- 9. Reporting, files & audit policies
-- -----------------------------------------------------------------------------

create policy report_cards_select
on public.report_cards for select to authenticated
using (
  exists (
    select 1
    from public.student_enrollments se
    left join public.class_enrollments ce on ce.student_enrollment_id = se.id and ce.status = 'active'
    where se.id = report_cards.student_enrollment_id
      and (
        public.has_staff_scope_permission('report_card.read', report_cards.organization_id, report_cards.school_id, ce.classroom_id)
        or (report_cards.status = 'published' and public.can_access_report_card('report_card.read', report_cards.id))
      )
  )
);

create policy report_cards_insert
on public.report_cards for insert to authenticated
with check (
  status = 'draft'
  and exists (
    select 1
    from public.student_enrollments se
    left join public.class_enrollments ce on ce.student_enrollment_id = se.id and ce.status = 'active'
    where se.id = report_cards.student_enrollment_id
      and public.has_permission('report_card.generate', report_cards.organization_id, report_cards.school_id, ce.classroom_id)
  )
);

create policy report_cards_update
on public.report_cards for update to authenticated
using (
  public.can_access_report_card('report_card.edit_narrative', id)
  or public.can_access_report_card('report_card.submit', id)
  or public.can_access_report_card('report_card.review', id)
  or public.can_access_report_card('report_card.publish', id)
  or public.can_access_report_card('report_card.revise_published', id)
)
with check (
  public.can_access_report_card('report_card.edit_narrative', id)
  or public.can_access_report_card('report_card.submit', id)
  or public.can_access_report_card('report_card.review', id)
  or public.can_access_report_card('report_card.publish', id)
  or public.can_access_report_card('report_card.revise_published', id)
);

create policy report_card_subject_entries_select
on public.report_card_subject_entries for select to authenticated
using (exists (
  select 1
  from public.report_cards rc
  join public.student_enrollments se on se.id = rc.student_enrollment_id
  left join public.class_enrollments ce on ce.student_enrollment_id = se.id and ce.status = 'active'
  where rc.id = report_card_subject_entries.report_card_id
    and (
      public.has_staff_scope_permission('report_card.read', rc.organization_id, rc.school_id, ce.classroom_id)
      or (rc.status = 'published' and public.can_access_report_card('report_card.read', rc.id))
    )
));

create policy report_card_subject_entries_insert
on public.report_card_subject_entries for insert to authenticated
with check (public.can_access_report_card('report_card.generate', report_card_id));

create policy report_card_subject_entries_update
on public.report_card_subject_entries for update to authenticated
using (
  public.can_access_report_card('report_card.edit_narrative', report_card_id)
  or public.can_access_report_card('report_card.revise_published', report_card_id)
)
with check (
  public.can_access_report_card('report_card.edit_narrative', report_card_id)
  or public.can_access_report_card('report_card.revise_published', report_card_id)
);

create policy report_card_narratives_select
on public.report_card_narratives for select to authenticated
using (exists (
  select 1
  from public.report_cards rc
  join public.student_enrollments se on se.id = rc.student_enrollment_id
  left join public.class_enrollments ce on ce.student_enrollment_id = se.id and ce.status = 'active'
  where rc.id = report_card_narratives.report_card_id
    and (
      public.has_staff_scope_permission('report_card.read', rc.organization_id, rc.school_id, ce.classroom_id)
      or (rc.status = 'published' and public.can_access_report_card('report_card.read', rc.id))
    )
));

create policy report_card_narratives_insert
on public.report_card_narratives for insert to authenticated
with check (public.can_access_report_card('report_card.edit_narrative', report_card_id));

create policy report_card_narratives_update
on public.report_card_narratives for update to authenticated
using (public.can_access_report_card('report_card.edit_narrative', report_card_id))
with check (public.can_access_report_card('report_card.edit_narrative', report_card_id));

create policy file_assets_select
on public.file_assets for select to authenticated
using (
  uploaded_by_profile_id = auth.uid()
  or (school_id is not null and public.has_staff_scope_permission('school.read', organization_id, school_id))
  or exists (
    select 1
    from public.generated_documents gd
    join public.report_cards rc on rc.id = gd.entity_id and gd.entity_type = 'report_card'
    where gd.file_asset_id = file_assets.id
      and rc.status = 'published'
      and public.can_access_report_card('report_card.download', rc.id)
  )
);

-- File metadata writes remain trusted server/storage workflow only for Core V1.

create policy generated_documents_select
on public.generated_documents for select to authenticated
using (
  (entity_type = 'report_card' and exists (
    select 1 from public.report_cards rc
    where rc.id = generated_documents.entity_id
      and (
        (rc.status = 'published' and public.can_access_report_card('report_card.download', rc.id))
        or public.has_staff_scope_permission('report_card.download', rc.organization_id, rc.school_id)
      )
  ))
  or (entity_type <> 'report_card' and public.has_staff_scope_permission('school.read', organization_id, school_id))
);

create policy audit_logs_select
on public.audit_logs for select to authenticated
using (
  organization_id is not null
  and (
    public.has_permission('audit.read', organization_id)
    or (school_id is not null and public.has_permission('audit.read', organization_id, school_id))
  )
);

-- -----------------------------------------------------------------------------
-- Column/table privilege hardening on top of RLS
-- -----------------------------------------------------------------------------

-- Profiles: users can edit display fields, never their own application status.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_file_id) on public.profiles to authenticated;

-- Identity/RBAC mutation is trusted server/RPC only in Core V1.
revoke insert, update, delete on
  public.organization_memberships,
  public.membership_school_access,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.membership_roles,
  public.invitations
from authenticated;

-- Audit and file/document metadata are written by trusted workflows only.
revoke insert, update, delete on
  public.audit_logs,
  public.file_assets,
  public.generated_documents
from authenticated;

-- Hard delete is disabled for normal browser workflows. The only Core V1 direct
-- delete exception is the Assessment <-> LearningObjective join row.
revoke delete on
  public.organizations,
  public.schools,
  public.school_settings,
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
  public.student_scores,
  public.report_cards,
  public.report_card_subject_entries,
  public.report_card_narratives
from authenticated;

grant delete on public.assessment_learning_objectives to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Workflow authorization guards
-- These protect privileged state transitions even when a user has general UPDATE.
-- Trusted SQL/service operations where auth.uid() is null are allowed.
-- -----------------------------------------------------------------------------

create or replace function public.guard_student_status_transition()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and new.status = 'archived'
     and old.status is distinct from new.status
     and not public.can_access_student('student.archive', old.id, old.organization_id)
  then
    raise exception 'Missing student.archive permission';
  end if;
  return new;
end;
$$;

create trigger trg_students_workflow_guard
before update on public.students
for each row execute function public.guard_student_status_transition();

create or replace function public.guard_teaching_assignment_transition()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
     and new.status = 'archived'
     and old.status is distinct from new.status
     and not public.has_permission('teaching_assignment.archive', old.organization_id, old.school_id, old.classroom_id)
  then
    raise exception 'Missing teaching_assignment.archive permission';
  end if;
  return new;
end;
$$;

create trigger trg_teaching_assignments_workflow_guard
before update on public.teaching_assignments
for each row execute function public.guard_teaching_assignment_transition();

create or replace function public.guard_timetable_transition()
returns trigger
language plpgsql
as $$
declare
  v_classroom_id uuid;
begin
  if auth.uid() is null or old.status is not distinct from new.status then
    return new;
  end if;

  select classroom_id into v_classroom_id
  from public.teaching_assignments
  where id = old.teaching_assignment_id;

  if new.status = 'published'
     and not public.has_permission('schedule.publish', old.organization_id, old.school_id, v_classroom_id)
  then
    raise exception 'Missing schedule.publish permission';
  end if;

  if new.status = 'inactive'
     and not public.has_permission('schedule.archive', old.organization_id, old.school_id, v_classroom_id)
  then
    raise exception 'Missing schedule.archive permission';
  end if;

  return new;
end;
$$;

create trigger trg_timetable_entries_workflow_guard
before update on public.timetable_entries
for each row execute function public.guard_timetable_transition();

create or replace function public.guard_assessment_transition()
returns trigger
language plpgsql
as $$
declare
  v_classroom_id uuid;
  v_elevated boolean;
begin
  if auth.uid() is null or old.status is not distinct from new.status then
    return new;
  end if;

  select classroom_id into v_classroom_id
  from public.teaching_assignments
  where id = old.teaching_assignment_id;

  if new.status = 'published' then
    v_elevated := public.has_staff_scope_permission('assessment.publish', old.organization_id, old.school_id, null);
    if not (
      public.has_permission('assessment.publish', old.organization_id, old.school_id, v_classroom_id)
      and (old.created_by_profile_id = auth.uid() or v_elevated)
    ) then
      raise exception 'Missing assessment.publish permission for this assessment';
    end if;
  end if;

  if new.status = 'archived' then
    v_elevated := public.has_staff_scope_permission('assessment.archive_own', old.organization_id, old.school_id, null);
    if not (
      public.has_permission('assessment.archive_own', old.organization_id, old.school_id, v_classroom_id)
      and (old.created_by_profile_id = auth.uid() or v_elevated)
    ) then
      raise exception 'Missing assessment.archive_own permission for this assessment';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_assessments_workflow_guard
before update on public.assessments
for each row execute function public.guard_assessment_transition();

create or replace function public.guard_attendance_session_transition()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if old.status = 'locked' and to_jsonb(old) is distinct from to_jsonb(new) then
    if not public.has_permission('attendance.correct_locked', old.organization_id, old.school_id, old.classroom_id) then
      raise exception 'Missing attendance.correct_locked permission';
    end if;
  elsif new.status = 'locked' and old.status is distinct from new.status then
    if not public.has_permission('attendance.lock', old.organization_id, old.school_id, old.classroom_id) then
      raise exception 'Missing attendance.lock permission';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_attendance_sessions_workflow_guard
before update on public.attendance_sessions
for each row execute function public.guard_attendance_session_transition();

create or replace function public.guard_report_card_transition()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if old.status = 'published' and to_jsonb(old) is distinct from to_jsonb(new) then
    if not public.can_access_report_card('report_card.revise_published', old.id) then
      raise exception 'Published report card requires report_card.revise_published permission';
    end if;
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status = 'submitted' and not public.can_access_report_card('report_card.submit', old.id) then
      raise exception 'Missing report_card.submit permission';
    elsif new.status = 'reviewed' and not public.can_access_report_card('report_card.review', old.id) then
      raise exception 'Missing report_card.review permission';
    elsif new.status = 'published' and not public.can_access_report_card('report_card.publish', old.id) then
      raise exception 'Missing report_card.publish permission';
    elsif new.status = 'revised' and not public.can_access_report_card('report_card.revise_published', old.id) then
      raise exception 'Missing report_card.revise_published permission';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_report_cards_workflow_guard
before update on public.report_cards
for each row execute function public.guard_report_card_transition();

-- -----------------------------------------------------------------------------
-- 10. RLS helper indexes recommended for policy performance
-- -----------------------------------------------------------------------------

create index if not exists idx_membership_roles_org_scope
on public.membership_roles (organization_id, scope_type, scope_id, membership_id);

create index if not exists idx_students_profile_org
on public.students (profile_id, organization_id)
where profile_id is not null;

create index if not exists idx_guardians_profile_org
on public.guardians (profile_id, organization_id)
where profile_id is not null;

create index if not exists idx_student_guardians_org_status
on public.student_guardians (organization_id, guardian_id, student_id, status);

create index if not exists idx_class_enrollments_student_active
on public.class_enrollments (student_enrollment_id, classroom_id)
where status = 'active';

commit;
-- EduSmart SchoolOS — Core V1 Permission Registry & Default Roles
-- Version: 1.2 HOTFIX
--
-- IMPORTANT:
-- This version intentionally DOES NOT use a temporary/private staging table.
-- It is designed to be reliable when pasted and run as one full query in
-- Supabase Dashboard SQL Editor.
--
-- Requires:
--   07_DATABASE_SCHEMA.sql PASS
--   08_RLS_POLICIES.sql PASS
--
-- Safe to re-run: yes. It rebuilds only the permission links of the 8
-- built-in system roles. Custom organization roles are not touched.

begin;

-- 1. Permission registry
insert into public.permissions (code, domain, action, description) values
('organization.read','organization','read','Read organization metadata'),
('organization.update','organization','update','Update organization metadata'),
('school.read','organization','read','Read school metadata'),
('school.update','organization','update','Update school metadata'),
('membership.read','identity','read','Read memberships in authorized scope'),
('membership.invite','identity','invite','Invite a user/member'),
('membership.update_role','identity','update_role','Change member role or scope'),
('membership.disable','identity','disable','Suspend or end membership'),
('role.read','identity','read','Read role definitions'),
('role.manage_custom','identity','manage','Manage custom organization roles'),
('academic_year.read','academic','read','Read academic years'),
('academic_year.manage','academic','manage','Create or update academic years'),
('term.read','academic','read','Read terms/semesters'),
('term.manage','academic','manage','Create or update terms/semesters'),
('grade_level.read','academic','read','Read grade levels'),
('grade_level.manage','academic','manage','Create or update grade levels'),
('classroom.read','academic','read','Read classrooms'),
('classroom.manage','academic','manage','Create or update classrooms'),
('subject.read','academic','read','Read subjects'),
('subject.manage','academic','manage','Create or update subjects'),
('curriculum.read','academic','read','Read curriculum structures'),
('curriculum.manage','academic','manage','Create or update curriculum structures'),
('student.read','sis','read','Read student records'),
('student.create','sis','create','Create student records'),
('student.update','sis','update','Update student records'),
('student.archive','sis','archive','Archive student records'),
('student.import','sis','import','Import students'),
('student.export','sis','export','Export students'),
('guardian.read','sis','read','Read guardian records'),
('guardian.manage','sis','manage','Create/update guardian relationships'),
('staff.read','sis','read','Read staff records'),
('staff.create','sis','create','Create staff records/assignments'),
('staff.update','sis','update','Update staff records/assignments'),
('enrollment.read','sis','read','Read student enrollment records'),
('enrollment.manage','sis','manage','Create/update student enrollment lifecycle'),
('class_enrollment.manage','sis','manage','Manage classroom placements'),
('teaching_assignment.read','teaching','read','Read teaching assignments'),
('teaching_assignment.create','teaching','create','Create teaching assignments'),
('teaching_assignment.update','teaching','update','Update teaching assignments'),
('teaching_assignment.archive','teaching','archive','Archive teaching assignments'),
('schedule.read','schedule','read','Read schedule'),
('schedule.create','schedule','create','Create schedule entries'),
('schedule.update','schedule','update','Update schedule entries'),
('schedule.publish','schedule','publish','Publish schedule'),
('schedule.archive','schedule','archive','Archive schedule'),
('attendance.read','attendance','read','Read attendance'),
('attendance.session.create','attendance','create','Create attendance session'),
('attendance.record','attendance','record','Record attendance'),
('attendance.submit','attendance','submit','Submit attendance session'),
('attendance.correct_open','attendance','update','Correct open/unlocked attendance'),
('attendance.correct_locked','attendance','update_locked','Correct locked attendance'),
('attendance.lock','attendance','lock','Lock attendance session'),
('attendance.export','attendance','export','Export attendance'),
('assessment.read','assessment','read','Read assessments'),
('assessment.create','assessment','create','Create assessments'),
('assessment.update_own','assessment','update','Update owned or elevated assessment'),
('assessment.archive_own','assessment','archive','Archive owned assessment'),
('assessment.publish','assessment','publish','Publish assessment'),
('score.read','assessment','read','Read scores'),
('score.enter','assessment','create','Enter scores'),
('score.update_open','assessment','update','Update scores while open'),
('score.update_locked','assessment','update_locked','Update locked/final score'),
('score.export','assessment','export','Export scores'),
('report_card.read','reporting','read','Read report card'),
('report_card.generate','reporting','generate','Generate report card draft/snapshot'),
('report_card.edit_narrative','reporting','update','Edit report card narrative'),
('report_card.submit','reporting','submit','Submit report card'),
('report_card.review','reporting','review','Review report card'),
('report_card.publish','reporting','publish','Publish report card'),
('report_card.revise_published','reporting','revise','Revise published report card'),
('report_card.download','reporting','download','Download published report document'),
('audit.read','security','read','Read authorized audit logs'),
('audit.export','security','export','Export authorized audit logs'),
('security.session_revoke_member','security','revoke','Revoke member session/access')
on conflict (code) do update
set domain = excluded.domain,
    action = excluded.action,
    description = excluded.description;

-- 2. Built-in system roles
insert into public.roles (organization_id, code, name, description, is_system_role, is_customizable) values
(null,'ORG_OWNER','Organization Owner','Yayasan/organization owner with organization-wide authority',true,false),
(null,'SCHOOL_ADMIN','School Admin / Tata Usaha','School-scoped operational master-data administrator',true,false),
(null,'PRINCIPAL','Principal / Kepala Sekolah','School-scoped leadership and approval role',true,false),
(null,'VICE_PRINCIPAL_CURRICULUM','Wakasek Kurikulum','School-scoped academic setup, assignment and scheduling role',true,false),
(null,'TEACHER','Teacher / Guru','Class-scoped teacher role; assign one CLASS grant per authorized classroom',true,false),
(null,'HOMEROOM_TEACHER','Homeroom Teacher / Wali Kelas','Class-scoped homeroom role; combine with TEACHER where also teaching subjects',true,false),
(null,'PARENT','Parent / Guardian','Relationship-scoped parent portal role',true,false),
(null,'STUDENT','Student / Siswa','Own-record student portal role',true,false)
on conflict (code) where organization_id is null do update
set name = excluded.name,
    description = excluded.description,
    is_system_role = excluded.is_system_role,
    is_customizable = excluded.is_customizable;

-- 3. Rebuild permission links for built-in roles only.
--    This avoids any dependency on temporary/staging relations.
delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and r.organization_id is null
  and r.code in (
    'ORG_OWNER',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'VICE_PRINCIPAL_CURRICULUM',
    'TEACHER',
    'HOMEROOM_TEACHER',
    'PARENT',
    'STUDENT'
  );

-- Organization Owner receives every Core V1 permission.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.organization_id is null
  and r.code = 'ORG_OWNER'
on conflict (role_id, permission_id) do nothing;

-- Remaining built-in roles use the conservative matrix below.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from (
  values
  ('SCHOOL_ADMIN','organization.read'),
  ('SCHOOL_ADMIN','school.read'),
  ('SCHOOL_ADMIN','membership.read'),
  ('SCHOOL_ADMIN','membership.invite'),
  ('SCHOOL_ADMIN','role.read'),
  ('SCHOOL_ADMIN','academic_year.read'),
  ('SCHOOL_ADMIN','academic_year.manage'),
  ('SCHOOL_ADMIN','term.read'),
  ('SCHOOL_ADMIN','term.manage'),
  ('SCHOOL_ADMIN','grade_level.read'),
  ('SCHOOL_ADMIN','grade_level.manage'),
  ('SCHOOL_ADMIN','classroom.read'),
  ('SCHOOL_ADMIN','classroom.manage'),
  ('SCHOOL_ADMIN','subject.read'),
  ('SCHOOL_ADMIN','subject.manage'),
  ('SCHOOL_ADMIN','curriculum.read'),
  ('SCHOOL_ADMIN','student.read'),
  ('SCHOOL_ADMIN','student.create'),
  ('SCHOOL_ADMIN','student.update'),
  ('SCHOOL_ADMIN','student.import'),
  ('SCHOOL_ADMIN','student.export'),
  ('SCHOOL_ADMIN','guardian.read'),
  ('SCHOOL_ADMIN','guardian.manage'),
  ('SCHOOL_ADMIN','staff.read'),
  ('SCHOOL_ADMIN','staff.create'),
  ('SCHOOL_ADMIN','staff.update'),
  ('SCHOOL_ADMIN','enrollment.read'),
  ('SCHOOL_ADMIN','enrollment.manage'),
  ('SCHOOL_ADMIN','class_enrollment.manage'),
  ('SCHOOL_ADMIN','teaching_assignment.read'),
  ('SCHOOL_ADMIN','teaching_assignment.create'),
  ('SCHOOL_ADMIN','teaching_assignment.update'),
  ('SCHOOL_ADMIN','schedule.read'),
  ('SCHOOL_ADMIN','schedule.create'),
  ('SCHOOL_ADMIN','schedule.update'),
  ('SCHOOL_ADMIN','attendance.read'),
  ('SCHOOL_ADMIN','attendance.session.create'),
  ('SCHOOL_ADMIN','attendance.record'),
  ('SCHOOL_ADMIN','attendance.submit'),
  ('SCHOOL_ADMIN','attendance.correct_open'),
  ('SCHOOL_ADMIN','attendance.lock'),
  ('SCHOOL_ADMIN','attendance.export'),
  ('SCHOOL_ADMIN','assessment.read'),
  ('SCHOOL_ADMIN','score.read'),
  ('SCHOOL_ADMIN','score.export'),
  ('SCHOOL_ADMIN','report_card.read'),
  ('SCHOOL_ADMIN','report_card.generate'),
  ('SCHOOL_ADMIN','report_card.download'),
  ('PRINCIPAL','organization.read'),
  ('PRINCIPAL','school.read'),
  ('PRINCIPAL','membership.read'),
  ('PRINCIPAL','role.read'),
  ('PRINCIPAL','academic_year.read'),
  ('PRINCIPAL','term.read'),
  ('PRINCIPAL','grade_level.read'),
  ('PRINCIPAL','classroom.read'),
  ('PRINCIPAL','subject.read'),
  ('PRINCIPAL','curriculum.read'),
  ('PRINCIPAL','student.read'),
  ('PRINCIPAL','student.export'),
  ('PRINCIPAL','guardian.read'),
  ('PRINCIPAL','staff.read'),
  ('PRINCIPAL','enrollment.read'),
  ('PRINCIPAL','teaching_assignment.read'),
  ('PRINCIPAL','schedule.read'),
  ('PRINCIPAL','attendance.read'),
  ('PRINCIPAL','attendance.session.create'),
  ('PRINCIPAL','attendance.record'),
  ('PRINCIPAL','attendance.submit'),
  ('PRINCIPAL','attendance.correct_open'),
  ('PRINCIPAL','attendance.correct_locked'),
  ('PRINCIPAL','attendance.lock'),
  ('PRINCIPAL','attendance.export'),
  ('PRINCIPAL','assessment.read'),
  ('PRINCIPAL','score.read'),
  ('PRINCIPAL','score.export'),
  ('PRINCIPAL','report_card.read'),
  ('PRINCIPAL','report_card.generate'),
  ('PRINCIPAL','report_card.edit_narrative'),
  ('PRINCIPAL','report_card.submit'),
  ('PRINCIPAL','report_card.review'),
  ('PRINCIPAL','report_card.publish'),
  ('PRINCIPAL','report_card.download'),
  ('PRINCIPAL','audit.read'),
  ('VICE_PRINCIPAL_CURRICULUM','organization.read'),
  ('VICE_PRINCIPAL_CURRICULUM','school.read'),
  ('VICE_PRINCIPAL_CURRICULUM','academic_year.read'),
  ('VICE_PRINCIPAL_CURRICULUM','academic_year.manage'),
  ('VICE_PRINCIPAL_CURRICULUM','term.read'),
  ('VICE_PRINCIPAL_CURRICULUM','term.manage'),
  ('VICE_PRINCIPAL_CURRICULUM','grade_level.read'),
  ('VICE_PRINCIPAL_CURRICULUM','grade_level.manage'),
  ('VICE_PRINCIPAL_CURRICULUM','classroom.read'),
  ('VICE_PRINCIPAL_CURRICULUM','classroom.manage'),
  ('VICE_PRINCIPAL_CURRICULUM','subject.read'),
  ('VICE_PRINCIPAL_CURRICULUM','subject.manage'),
  ('VICE_PRINCIPAL_CURRICULUM','curriculum.read'),
  ('VICE_PRINCIPAL_CURRICULUM','curriculum.manage'),
  ('VICE_PRINCIPAL_CURRICULUM','student.read'),
  ('VICE_PRINCIPAL_CURRICULUM','student.export'),
  ('VICE_PRINCIPAL_CURRICULUM','staff.read'),
  ('VICE_PRINCIPAL_CURRICULUM','enrollment.read'),
  ('VICE_PRINCIPAL_CURRICULUM','class_enrollment.manage'),
  ('VICE_PRINCIPAL_CURRICULUM','teaching_assignment.read'),
  ('VICE_PRINCIPAL_CURRICULUM','teaching_assignment.create'),
  ('VICE_PRINCIPAL_CURRICULUM','teaching_assignment.update'),
  ('VICE_PRINCIPAL_CURRICULUM','teaching_assignment.archive'),
  ('VICE_PRINCIPAL_CURRICULUM','schedule.read'),
  ('VICE_PRINCIPAL_CURRICULUM','schedule.create'),
  ('VICE_PRINCIPAL_CURRICULUM','schedule.update'),
  ('VICE_PRINCIPAL_CURRICULUM','schedule.publish'),
  ('VICE_PRINCIPAL_CURRICULUM','schedule.archive'),
  ('VICE_PRINCIPAL_CURRICULUM','attendance.read'),
  ('VICE_PRINCIPAL_CURRICULUM','attendance.session.create'),
  ('VICE_PRINCIPAL_CURRICULUM','attendance.record'),
  ('VICE_PRINCIPAL_CURRICULUM','attendance.submit'),
  ('VICE_PRINCIPAL_CURRICULUM','attendance.correct_open'),
  ('VICE_PRINCIPAL_CURRICULUM','attendance.export'),
  ('VICE_PRINCIPAL_CURRICULUM','assessment.read'),
  ('VICE_PRINCIPAL_CURRICULUM','assessment.create'),
  ('VICE_PRINCIPAL_CURRICULUM','assessment.update_own'),
  ('VICE_PRINCIPAL_CURRICULUM','assessment.publish'),
  ('VICE_PRINCIPAL_CURRICULUM','score.read'),
  ('VICE_PRINCIPAL_CURRICULUM','score.export'),
  ('VICE_PRINCIPAL_CURRICULUM','report_card.read'),
  ('VICE_PRINCIPAL_CURRICULUM','report_card.generate'),
  ('VICE_PRINCIPAL_CURRICULUM','report_card.edit_narrative'),
  ('VICE_PRINCIPAL_CURRICULUM','report_card.submit'),
  ('VICE_PRINCIPAL_CURRICULUM','report_card.review'),
  ('VICE_PRINCIPAL_CURRICULUM','report_card.download'),
  ('TEACHER','organization.read'),
  ('TEACHER','school.read'),
  ('TEACHER','academic_year.read'),
  ('TEACHER','term.read'),
  ('TEACHER','grade_level.read'),
  ('TEACHER','classroom.read'),
  ('TEACHER','subject.read'),
  ('TEACHER','curriculum.read'),
  ('TEACHER','student.read'),
  ('TEACHER','staff.read'),
  ('TEACHER','enrollment.read'),
  ('TEACHER','teaching_assignment.read'),
  ('TEACHER','schedule.read'),
  ('TEACHER','attendance.read'),
  ('TEACHER','attendance.session.create'),
  ('TEACHER','attendance.record'),
  ('TEACHER','attendance.submit'),
  ('TEACHER','attendance.correct_open'),
  ('TEACHER','assessment.read'),
  ('TEACHER','assessment.create'),
  ('TEACHER','assessment.update_own'),
  ('TEACHER','assessment.archive_own'),
  ('TEACHER','assessment.publish'),
  ('TEACHER','score.read'),
  ('TEACHER','score.enter'),
  ('TEACHER','score.update_open'),
  ('TEACHER','score.export'),
  ('TEACHER','report_card.read'),
  ('TEACHER','report_card.download'),
  ('HOMEROOM_TEACHER','organization.read'),
  ('HOMEROOM_TEACHER','school.read'),
  ('HOMEROOM_TEACHER','academic_year.read'),
  ('HOMEROOM_TEACHER','term.read'),
  ('HOMEROOM_TEACHER','grade_level.read'),
  ('HOMEROOM_TEACHER','classroom.read'),
  ('HOMEROOM_TEACHER','subject.read'),
  ('HOMEROOM_TEACHER','curriculum.read'),
  ('HOMEROOM_TEACHER','student.read'),
  ('HOMEROOM_TEACHER','student.export'),
  ('HOMEROOM_TEACHER','guardian.read'),
  ('HOMEROOM_TEACHER','staff.read'),
  ('HOMEROOM_TEACHER','enrollment.read'),
  ('HOMEROOM_TEACHER','teaching_assignment.read'),
  ('HOMEROOM_TEACHER','schedule.read'),
  ('HOMEROOM_TEACHER','attendance.read'),
  ('HOMEROOM_TEACHER','attendance.session.create'),
  ('HOMEROOM_TEACHER','attendance.record'),
  ('HOMEROOM_TEACHER','attendance.submit'),
  ('HOMEROOM_TEACHER','attendance.correct_open'),
  ('HOMEROOM_TEACHER','attendance.export'),
  ('HOMEROOM_TEACHER','assessment.read'),
  ('HOMEROOM_TEACHER','score.read'),
  ('HOMEROOM_TEACHER','score.export'),
  ('HOMEROOM_TEACHER','report_card.read'),
  ('HOMEROOM_TEACHER','report_card.generate'),
  ('HOMEROOM_TEACHER','report_card.edit_narrative'),
  ('HOMEROOM_TEACHER','report_card.submit'),
  ('HOMEROOM_TEACHER','report_card.download'),
  ('PARENT','school.read'),
  ('PARENT','academic_year.read'),
  ('PARENT','term.read'),
  ('PARENT','grade_level.read'),
  ('PARENT','classroom.read'),
  ('PARENT','subject.read'),
  ('PARENT','student.read'),
  ('PARENT','guardian.read'),
  ('PARENT','enrollment.read'),
  ('PARENT','teaching_assignment.read'),
  ('PARENT','schedule.read'),
  ('PARENT','attendance.read'),
  ('PARENT','assessment.read'),
  ('PARENT','score.read'),
  ('PARENT','report_card.read'),
  ('PARENT','report_card.download'),
  ('STUDENT','school.read'),
  ('STUDENT','academic_year.read'),
  ('STUDENT','term.read'),
  ('STUDENT','grade_level.read'),
  ('STUDENT','classroom.read'),
  ('STUDENT','subject.read'),
  ('STUDENT','curriculum.read'),
  ('STUDENT','student.read'),
  ('STUDENT','enrollment.read'),
  ('STUDENT','teaching_assignment.read'),
  ('STUDENT','schedule.read'),
  ('STUDENT','attendance.read'),
  ('STUDENT','assessment.read'),
  ('STUDENT','score.read'),
  ('STUDENT','report_card.read'),
  ('STUDENT','report_card.download')
) as seed(role_code, permission_code)
join public.roles r
  on r.code = seed.role_code
 and r.organization_id is null
join public.permissions p
  on p.code = seed.permission_code
on conflict (role_id, permission_id) do nothing;

commit;

-- Verification output.
select count(*) as permissions
from public.permissions;

select count(*) as system_roles
from public.roles
where organization_id is null
  and code in (
    'ORG_OWNER',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'VICE_PRINCIPAL_CURRICULUM',
    'TEACHER',
    'HOMEROOM_TEACHER',
    'PARENT',
    'STUDENT'
  );

select count(*) as system_role_permission_links
from public.role_permissions rp
join public.roles r on r.id = rp.role_id
where r.organization_id is null
  and r.code in (
    'ORG_OWNER',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'VICE_PRINCIPAL_CURRICULUM',
    'TEACHER',
    'HOMEROOM_TEACHER',
    'PARENT',
    'STUDENT'
  );