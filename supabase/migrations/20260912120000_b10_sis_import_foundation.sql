-- Batch 10 Phase 1: SIS import/export database foundation.
--
-- Scope (Phase 1 only): the four foundational tables (sis_import_jobs,
-- sis_import_job_rows, sis_import_job_issues, sis_import_entity_refs),
-- tenant-safe constraints, immutability guards, B10 permission codes + role
-- grants, RLS foundation, and a private `sis-imports` storage bucket.
--
-- Explicitly deferred to a later forward migration (Phase 3): the atomic
-- import commit RPC, narrow mapping-resolution/mint/bootstrap SECURITY
-- DEFINER helpers for sis_import_entity_refs, storage object policies tied to
-- the finalized upload/download transport, and the PII retention scrub
-- function. sis_import_entity_refs therefore intentionally receives ZERO
-- RLS policies and ZERO table grants to `authenticated` in this migration —
-- it must remain structurally unreachable by direct client SQL until Phase 3
-- adds narrow, authorization-proving SECURITY DEFINER RPCs.

begin;

-- PostgreSQL requires the exact composite unique target to exist when the
-- tenant-safe source-file FK below is created.
create unique index if not exists uq_file_assets_id_organization
  on public.file_assets (id, organization_id);

-- -----------------------------------------------------------------------------
-- 1. sis_import_jobs
-- -----------------------------------------------------------------------------

create table public.sis_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,

  source_filename text not null,
  source_file_hash text not null,
  source_file_asset_id uuid,

  template_version text not null,

  normalized_plan_fingerprint text,
  preview_version integer not null default 0,
  confirmation_token_hash text,

  status text not null default 'uploaded'
    constraint sis_import_jobs_status_check
    check (status in ('uploaded','validating','validated','importing','completed','failed','cancelled')),

  totals jsonb not null default '{}'::jsonb,
  failure_summary text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  validated_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,

  constraint sis_import_jobs_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint sis_import_jobs_preview_version_check check (preview_version >= 0),

  -- Tenant-safe composite FK against file_assets, mirroring the same pattern
  -- used for students/guardians/staff_members: file_assets exposes only
  -- PRIMARY KEY (id) plus UNIQUE (bucket, object_path), no (id,
  -- organization_id) unique key, so we add one below (a new object on an
  -- existing table -- the historical file_assets migration itself is not
  -- modified) and reference it here so a job can never point at a file asset
  -- belonging to a different organization.
  constraint sis_import_jobs_file_asset_fk
    foreign key (source_file_asset_id, organization_id)
    references public.file_assets(id, organization_id) on delete restrict
);

-- Required unique target for sis_import_jobs_file_asset_fk above. id is
-- already the primary key, so this composite index adds no real uniqueness
-- risk -- it only makes (id, organization_id) usable as an FK target,
-- exactly like the existing students/guardians/staff_members convention.
-- Required unique target for sis_import_entity_refs_created_by_job_fk
-- (section 4 below), for the same reason.
create unique index if not exists uq_sis_import_jobs_id_organization
  on public.sis_import_jobs (id, organization_id);

comment on table public.sis_import_jobs is
  'One B10 import job = exactly one school. source_file_hash/normalized_plan_fingerprint are diagnostics/duplicate-signal only, never identity authority. confirmation_token_hash binds a confirmation token to preview_version server-side (Phase 3 issues/validates the token; this column only stores its hash, never a reusable plaintext secret).';

create index idx_sis_import_jobs_org_school_status_created
  on public.sis_import_jobs (organization_id, school_id, status, created_at desc);
create index idx_sis_import_jobs_status on public.sis_import_jobs (status);
create index idx_sis_import_jobs_created_at on public.sis_import_jobs (created_at);

create trigger trg_sis_import_jobs_updated_at
before update on public.sis_import_jobs
for each row execute function public.set_updated_at();

-- Reuses the existing repository-wide tenant-boundary-immutability trigger
-- function (defined in 20260815000000): organization_id/school_id can never
-- change after insert, i.e. a job can never be moved to another school.
create trigger trg_sis_import_jobs_tenant_immutable
before update on public.sis_import_jobs
for each row execute function public.prevent_tenant_boundary_change();

-- B10-P1-SEC-001 Gate 4: created_by_profile_id is server-owned actor
-- provenance, set once from auth.uid()-derived context by the Phase-3 job
-- creation RPC. It must never be reassignable, even by a future privileged
-- helper -- protect it the same way organization_id/school_id are protected.
create or replace function public.prevent_sis_import_jobs_actor_change()
returns trigger
language plpgsql
as $$
begin
  if new.created_by_profile_id is distinct from old.created_by_profile_id then
    raise exception 'sis_import_jobs.created_by_profile_id is immutable';
  end if;
  return new;
end;
$$;

create trigger trg_sis_import_jobs_actor_immutable
before update on public.sis_import_jobs
for each row execute function public.prevent_sis_import_jobs_actor_change();

-- -----------------------------------------------------------------------------
-- 2. sis_import_job_rows
-- -----------------------------------------------------------------------------

create table public.sis_import_job_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.sis_import_jobs(id) on delete cascade,
  sheet_name text not null,
  row_number integer not null,
  entity_type text not null
    constraint sis_import_job_rows_entity_type_check
    check (entity_type in (
      'student','guardian','student_guardian',
      'student_enrollment','class_enrollment',
      'staff','staff_school_assignment'
    )),
  action text not null
    constraint sis_import_job_rows_action_check
    check (action in ('create','update','unchanged','skip','error')),
  match_key jsonb,
  -- Audit/result metadata only. NOT authorization proof: knowledge of a
  -- resolved_entity_id must never, by itself, grant access to that entity.
  resolved_entity_id uuid,
  raw_data jsonb,
  normalized_data jsonb,
  created_at timestamptz not null default now(),

  constraint sis_import_job_rows_row_number_check check (row_number > 0),
  constraint uq_sis_import_job_rows_job_sheet_row unique (import_job_id, sheet_name, row_number)
);

comment on table public.sis_import_job_rows is
  'raw_data/normalized_data hold detailed per-row PII and are nullable so a Phase-3 retention scrub can minimize them after the 30-day support window without violating NOT NULL constraints.';

create index idx_sis_import_job_rows_job on public.sis_import_job_rows (import_job_id);
create index idx_sis_import_job_rows_job_entity on public.sis_import_job_rows (import_job_id, entity_type);
create index idx_sis_import_job_rows_job_action on public.sis_import_job_rows (import_job_id, action);

-- -----------------------------------------------------------------------------
-- 3. sis_import_job_issues
-- -----------------------------------------------------------------------------

create table public.sis_import_job_issues (
  id uuid primary key default gen_random_uuid(),
  import_job_row_id uuid not null references public.sis_import_job_rows(id) on delete cascade,
  severity text not null
    constraint sis_import_job_issues_severity_check
    check (severity in ('error','warning','info')),
  error_code text not null,
  field_name text,
  raw_value text,
  normalized_value text,
  message text not null,
  created_at timestamptz not null default now()
);

create index idx_sis_import_job_issues_row on public.sis_import_job_issues (import_job_row_id);
create index idx_sis_import_job_issues_error_code on public.sis_import_job_issues (error_code);

-- -----------------------------------------------------------------------------
-- 4. sis_import_entity_refs (durable identity mapping)
-- -----------------------------------------------------------------------------

create table public.sis_import_entity_refs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null
    constraint sis_import_entity_refs_entity_type_check
    check (entity_type in ('student','guardian','staff')),
  external_ref text not null
    constraint sis_import_entity_refs_external_ref_format_check
    check (external_ref ~ '^[A-Za-z0-9-]{3,40}$'),

  student_id uuid,
  guardian_id uuid,
  staff_member_id uuid,

  created_at timestamptz not null default now(),
  created_by_import_job_id uuid,

  constraint sis_import_entity_refs_exactly_one_typed_fk_check check (
    (entity_type = 'student'  and student_id      is not null and guardian_id is null     and staff_member_id is null)
    or (entity_type = 'guardian' and guardian_id     is not null and student_id is null     and staff_member_id is null)
    or (entity_type = 'staff'    and staff_member_id is not null and student_id is null     and guardian_id is null)
  ),

  -- Tenant-safe composite FKs against the live-confirmed (id, organization_id)
  -- unique keys: a mapping row is structurally unable to point to a domain
  -- entity in a different organization.
  constraint sis_import_entity_refs_student_fk
    foreign key (student_id, organization_id)
    references public.students(id, organization_id) on delete restrict,
  constraint sis_import_entity_refs_guardian_fk
    foreign key (guardian_id, organization_id)
    references public.guardians(id, organization_id) on delete restrict,
  constraint sis_import_entity_refs_staff_fk
    foreign key (staff_member_id, organization_id)
    references public.staff_members(id, organization_id) on delete restrict,

  -- Tenant-safe composite FK against sis_import_jobs (using the
  -- uq_sis_import_jobs_id_organization index added above): a mapping row's
  -- provenance job can never belong to a different organization than the
  -- mapping itself. ON DELETE RESTRICT (not SET NULL) is used deliberately:
  -- a cross-column SET NULL is unavailable here anyway (it would have to
  -- null organization_id, which must never change -- see the immutability
  -- trigger below), and import jobs are never hard-deleted in V1, so RESTRICT
  -- imposes no real-world constraint while still closing the cross-org
  -- provenance gap at the DB level.
  constraint sis_import_entity_refs_created_by_job_fk
    foreign key (created_by_import_job_id, organization_id)
    references public.sis_import_jobs(id, organization_id) on delete restrict
);

comment on table public.sis_import_entity_refs is
  'Durable cross-run identity mapping for Student/Guardian/Staff. Intentionally has ZERO RLS policies and ZERO table grants to authenticated in Phase 1 -- resolution/mint/bootstrap happens only via narrow, authorization-proving SECURITY DEFINER RPCs added in Phase 3. Identity match is never authorization. Rows are fully immutable after insert (see trigger below); there is no UPDATE or DELETE path.';

-- Case-insensitive uniqueness per (organization, entity_type, external_ref);
-- original display casing is preserved in external_ref for export.
create unique index uq_sis_import_entity_refs_org_type_ref_ci
  on public.sis_import_entity_refs (organization_id, entity_type, lower(external_ref));

-- At most one durable ref per actual domain entity.
create unique index uq_sis_import_entity_refs_one_per_student
  on public.sis_import_entity_refs (organization_id, student_id) where student_id is not null;
create unique index uq_sis_import_entity_refs_one_per_guardian
  on public.sis_import_entity_refs (organization_id, guardian_id) where guardian_id is not null;
create unique index uq_sis_import_entity_refs_one_per_staff
  on public.sis_import_entity_refs (organization_id, staff_member_id) where staff_member_id is not null;

create index idx_sis_import_entity_refs_created_by_job
  on public.sis_import_entity_refs (created_by_import_job_id);

-- Whole-row immutability: no column may change after insert. Stricter than
-- (and therefore supersedes the need for) the generic
-- prevent_tenant_boundary_change() trigger used elsewhere in the repository.
create or replace function public.prevent_sis_import_entity_ref_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'sis_import_entity_refs rows are immutable and cannot be updated';
end;
$$;

create trigger trg_sis_import_entity_refs_immutable
before update on public.sis_import_entity_refs
for each row execute function public.prevent_sis_import_entity_ref_mutation();

-- -----------------------------------------------------------------------------
-- 5. B10 permission codes
-- -----------------------------------------------------------------------------

insert into public.permissions (code, domain, action, description) values
  ('guardian.import','sis','import','Import guardians'),
  ('guardian.export','sis','export','Export guardians'),
  ('staff.import','sis','import','Import staff'),
  ('staff.export','sis','export','Export staff'),
  ('enrollment.import','sis','import','Import student enrollments'),
  ('enrollment.export','sis','export','Export student enrollments'),
  ('class_enrollment.import','sis','import','Import class enrollments'),
  ('class_enrollment.export','sis','export','Export class enrollments'),
  ('staff_school_assignment.import','sis','import','Import staff school assignments'),
  ('staff_school_assignment.export','sis','export','Export staff school assignments')
on conflict (code) do nothing;

-- Note (Gate 19, frozen): there is deliberately NO student_guardian.import /
-- student_guardian.export permission code. StudentGuardian relationship
-- mutation/export authority is derived in application/RPC logic (Phase 3)
-- from requiring BOTH the relevant Student and Guardian import/export
-- permission at the job's school -- not a standalone permission grant.

-- Mirror the existing conservative role matrix used for student.import /
-- student.export (SCHOOL_ADMIN import; SCHOOL_ADMIN + leadership export).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from (
  values
    ('SCHOOL_ADMIN','guardian.import'),
    ('SCHOOL_ADMIN','guardian.export'),
    ('SCHOOL_ADMIN','staff.import'),
    ('SCHOOL_ADMIN','staff.export'),
    ('SCHOOL_ADMIN','enrollment.import'),
    ('SCHOOL_ADMIN','enrollment.export'),
    ('SCHOOL_ADMIN','class_enrollment.import'),
    ('SCHOOL_ADMIN','class_enrollment.export'),
    ('SCHOOL_ADMIN','staff_school_assignment.import'),
    ('SCHOOL_ADMIN','staff_school_assignment.export'),
    ('PRINCIPAL','guardian.export'),
    ('PRINCIPAL','staff.export'),
    ('PRINCIPAL','enrollment.export'),
    ('PRINCIPAL','class_enrollment.export'),
    ('PRINCIPAL','staff_school_assignment.export'),
    ('VICE_PRINCIPAL_CURRICULUM','guardian.export'),
    ('VICE_PRINCIPAL_CURRICULUM','staff.export'),
    ('VICE_PRINCIPAL_CURRICULUM','enrollment.export'),
    ('VICE_PRINCIPAL_CURRICULUM','class_enrollment.export'),
    ('VICE_PRINCIPAL_CURRICULUM','staff_school_assignment.export'),
    ('HOMEROOM_TEACHER','guardian.export'),
    ('HOMEROOM_TEACHER','staff.export'),
    ('HOMEROOM_TEACHER','enrollment.export'),
    ('HOMEROOM_TEACHER','class_enrollment.export'),
    ('HOMEROOM_TEACHER','staff_school_assignment.export')
) as grants(role_code, permission_code)
join public.roles r on r.code = grants.role_code and r.organization_id is null
join public.permissions p on p.code = grants.permission_code
on conflict (role_id, permission_id) do nothing;

-- ORG_OWNER receives every Core V1 permission (existing repository
-- convention, established in 20260815000000 for all pre-existing permission
-- codes); replicate that grant explicitly for the 10 new B10 codes since the
-- original cross-join insert already ran and will not re-run for new rows.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.organization_id is null
  and r.code = 'ORG_OWNER'
  and p.code in (
    'guardian.import','guardian.export',
    'staff.import','staff.export',
    'enrollment.import','enrollment.export',
    'class_enrollment.import','class_enrollment.export',
    'staff_school_assignment.import','staff_school_assignment.export'
  )
on conflict (role_id, permission_id) do nothing;

-- TEACHER (non-homeroom), PARENT, STUDENT intentionally receive no B10
-- import/export grants -- no rows inserted for those roles.

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------

alter table public.sis_import_jobs enable row level security;
alter table public.sis_import_job_rows enable row level security;
alter table public.sis_import_job_issues enable row level security;
alter table public.sis_import_entity_refs enable row level security;

-- sis_import_jobs: school-scoped, authorized administrative import roles
-- only. Any one of the six B10 import permissions at the job's own school is
-- sufficient (all are currently granted only to SCHOOL_ADMIN / ORG_OWNER).
-- PARENT/STUDENT/ordinary TEACHER hold none of these permissions and are
-- denied by has_permission() itself, not by a client-supplied role label.
create policy sis_import_jobs_select
on public.sis_import_jobs for select to authenticated
using (
  public.has_permission('student.import', organization_id, school_id)
  or public.has_permission('guardian.import', organization_id, school_id)
  or public.has_permission('staff.import', organization_id, school_id)
  or public.has_permission('enrollment.import', organization_id, school_id)
  or public.has_permission('class_enrollment.import', organization_id, school_id)
  or public.has_permission('staff_school_assignment.import', organization_id, school_id)
);

-- B10-P1-SEC-001 remediation: no INSERT/UPDATE/DELETE policy is created for
-- sis_import_jobs. Tenant/permission authorization (proven above for SELECT)
-- is NOT the same thing as workflow authorization -- status,
-- preview_version, normalized_plan_fingerprint, confirmation_token_hash,
-- validated_at/confirmed_at/completed_at, totals, and failure_summary are all
-- server-owned workflow fields controlled exclusively by Phase-3 narrow
-- SECURITY DEFINER RPCs (job creation, validation persistence, preview/token
-- issuance, atomic status transition, commit). A direct authenticated
-- UPDATE -- even from an otherwise-legitimately-authorized SCHOOL_ADMIN --
-- could bypass preview binding, corrupt confirmation-token state, or force
-- an invalid state transition, so no such path exists at all. SECURITY
-- DEFINER functions execute as their owner and are unaffected by the
-- absence of authenticated INSERT/UPDATE policies here. No hard delete of
-- import jobs in V1 either.

-- sis_import_job_rows / sis_import_job_issues: authorization is inherited
-- from the parent job only, via the identical permission check. A caller who
-- cannot see the parent job cannot see its rows/issues. No independent
-- broad org-only policy exists. This is a SELECT-only foundation by design:
-- Phase 3 will write rows/issues exclusively through SECURITY DEFINER RPCs
-- (which execute as the function owner and are unaffected by the absence of
-- an authenticated INSERT/UPDATE policy here), so no such client-facing
-- policy is added in Phase 1.
create policy sis_import_job_rows_select
on public.sis_import_job_rows for select to authenticated
using (
  exists (
    select 1 from public.sis_import_jobs j
    where j.id = sis_import_job_rows.import_job_id
      and (
        public.has_permission('student.import', j.organization_id, j.school_id)
        or public.has_permission('guardian.import', j.organization_id, j.school_id)
        or public.has_permission('staff.import', j.organization_id, j.school_id)
        or public.has_permission('enrollment.import', j.organization_id, j.school_id)
        or public.has_permission('class_enrollment.import', j.organization_id, j.school_id)
        or public.has_permission('staff_school_assignment.import', j.organization_id, j.school_id)
      )
  )
);

create policy sis_import_job_issues_select
on public.sis_import_job_issues for select to authenticated
using (
  exists (
    select 1
    from public.sis_import_job_rows row_
    join public.sis_import_jobs j on j.id = row_.import_job_id
    where row_.id = sis_import_job_issues.import_job_row_id
      and (
        public.has_permission('student.import', j.organization_id, j.school_id)
        or public.has_permission('guardian.import', j.organization_id, j.school_id)
        or public.has_permission('staff.import', j.organization_id, j.school_id)
        or public.has_permission('enrollment.import', j.organization_id, j.school_id)
        or public.has_permission('class_enrollment.import', j.organization_id, j.school_id)
        or public.has_permission('staff_school_assignment.import', j.organization_id, j.school_id)
      )
  )
);

-- sis_import_entity_refs: CRITICAL -- no policies of any kind are created
-- for this table in Phase 1 (see Gate 23). With RLS enabled and zero
-- policies, `authenticated` has no direct SELECT/INSERT/UPDATE/DELETE access
-- whatsoever. Narrow, authorization-proving SECURITY DEFINER resolution/
-- mint/bootstrap RPCs are Phase 3 work and will not need a policy here since
-- SECURITY DEFINER functions execute as their owner, bypassing RLS, while
-- still performing their own explicit school/org authorization checks.

-- -----------------------------------------------------------------------------
-- 7. Table grants (independent of RLS -- Gate 24)
-- -----------------------------------------------------------------------------

-- New tables created by this migration receive no default privileges for
-- anon/authenticated (repository-wide `alter default privileges ... revoke
-- all ... from anon, authenticated`, established in 20260830110000) and no
-- default privileges for service_role either are relied upon here: revoke
-- explicitly so service_role cannot be used as an application CRUD
-- shortcut for these tables, consistent with "no service-role app CRUD".
revoke all privileges on
  public.sis_import_jobs,
  public.sis_import_job_rows,
  public.sis_import_job_issues,
  public.sis_import_entity_refs
from service_role;

-- B10-P1-SEC-001 remediation: SELECT only. No INSERT/UPDATE/DELETE grant to
-- authenticated -- see the RLS section above for the rationale (workflow
-- fields are server-owned; direct client mutation must never be possible).
grant select on public.sis_import_jobs to authenticated;
grant select on public.sis_import_job_rows to authenticated;
grant select on public.sis_import_job_issues to authenticated;
-- No grants at all on sis_import_entity_refs to authenticated (Gate 23/24).

-- -----------------------------------------------------------------------------
-- 8. Private storage bucket foundation (Gate 25)
-- -----------------------------------------------------------------------------

do $$
declare v_bucket storage.buckets%rowtype;
begin
  select * into v_bucket from storage.buckets where id = 'sis-imports';
  if found then
    if v_bucket.public then
      raise exception 'Existing sis-imports bucket must not be public';
    end if;
  else
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('sis-imports', 'sis-imports', false, 10485760);
  end if;
end $$;

-- Storage object policies (upload/download authorization) are intentionally
-- DEFERRED TO PHASE 3 BY DESIGN: the exact object-path/transport contract
-- depends on the Phase-2/3 upload server function implementation. No
-- permissive authenticated storage.objects policy is created here.

commit;
