-- EduSmart Core V1 / Batch 9 — Student Portal & Student Identity Binding.
--
-- Forward-only migration. Does not edit any previously applied migration.
--
-- 1. Adds a nullable, tenant-bound `target_student_id` to `invitations` so a
--    STUDENT/OWN invitation can be issued against an exact student record
--    instead of relying on the generic role/scope invitation shape.
-- 2. Adds a DB-enforced trigger invariant (not just frontend validation) that:
--      - only allows target_student_id on a STUDENT / OWN invitation
--      - requires a valid enrollment in the invitation's school (when supplied)
--      - requires a STUDENT/OWN invitation created after this migration to
--        carry an exact target_student_id
--      - leaves every other role/scope invitation shape untouched
--      - still permits REVOKING a legacy pre-B9 STUDENT/OWN row that has no
--        target_student_id (lifecycle-only remediation), while permanently
--        blocking that same row from ever being accepted/provisioned
-- 3. Adds `list_student_own_attendance`, the Student-OWN analogue of B7's
--    `list_parent_student_attendance`: SECURITY DEFINER, search_path='',
--    derives the caller's own student via students.profile_id = auth.uid(),
--    never accepts a student id, and only returns outcome-visible sessions.
--
-- Existing OPEN invitations are left untouched by this migration (no backfill,
-- no deletion) — Phase 0 reconnaissance reports any found without an exact
-- student binding; this migration does not silently mutate them.

begin;

-- -----------------------------------------------------------------------------
-- 1. invitations.target_student_id
-- -----------------------------------------------------------------------------

alter table public.invitations
  add column target_student_id uuid;

alter table public.invitations
  add constraint invitations_target_student_fk
  foreign key (target_student_id, organization_id)
  references public.students (id, organization_id)
  on delete cascade;

create index idx_invitations_target_student
  on public.invitations (target_student_id)
  where target_student_id is not null;

comment on column public.invitations.target_student_id is
  'B9: exact student this STUDENT/OWN invitation binds to on acceptance. '
  'Tenant-bound via the composite FK to students(id, organization_id). '
  'Independent of invited_scope_id, which stays NULL for OWN scope.';

-- -----------------------------------------------------------------------------
-- 2. DB-enforced invariant (not frontend-only)
-- -----------------------------------------------------------------------------

create or replace function public.validate_student_invitation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role_code text;
begin
  select r.code into v_role_code
  from public.roles r
  where r.id = new.invited_role_id;

  if not found then
    raise exception 'Invitation role not found';
  end if;

  -- A student-targeted invitation is only ever valid for the STUDENT system
  -- role with OWN scope. invited_scope_id must stay NULL for OWN (unchanged
  -- canonical constraint from the foundation migration).
  if new.target_student_id is not null then
    if v_role_code <> 'STUDENT' or new.invited_scope_type <> 'OWN' then
      raise exception
        'target_student_id is only valid for a STUDENT / OWN invitation';
    end if;

    if new.school_id is not null and not exists (
      select 1
      from public.student_enrollments se
      where se.student_id = new.target_student_id
        and se.organization_id = new.organization_id
        and se.school_id = new.school_id
        and se.status in ('active', 'leave')
    ) then
      raise exception
        'Target student has no valid enrollment in the invitation school';
    end if;
  end if;

  -- Every STUDENT / OWN invitation created (or later updated) after this
  -- migration must carry an exact target student. Rows that already existed
  -- before this migration are left alone unless they are themselves updated.
  --
  -- Lifecycle exemption: a REVOCATION (new.revoked_at is not null) is always
  -- permitted, even for a legacy invalid row (target_student_id still null).
  -- Without this exemption a pre-B9 STUDENT/OWN row with no target would
  -- become impossible to revoke, because every UPDATE — including one that
  -- only sets revoked_at — re-evaluates this same invariant against the
  -- still-null target. Acceptance is a separate code path (it sets
  -- accepted_at, not revoked_at) and remains fully blocked by this check:
  -- a legacy invalid row can be revoked, but can never be accepted or
  -- otherwise provisioned.
  if v_role_code = 'STUDENT'
     and new.invited_scope_type = 'OWN'
     and new.target_student_id is null
     and new.revoked_at is null then
    raise exception
      'A STUDENT / OWN invitation requires an exact target_student_id. '
      'Use the Student Portal invitation workflow (createStudentPortalInvitation).';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_student_invitation on public.invitations;
create trigger trg_validate_student_invitation
before insert or update on public.invitations
for each row execute function public.validate_student_invitation();

comment on function public.validate_student_invitation() is
  'B9: DB-enforced invariant for student-targeted invitations. Rejects a '
  'student target on any non-STUDENT/OWN invitation, rejects a STUDENT/OWN '
  'invitation without an exact target student, and rejects a school-scoped '
  'target student without a valid enrollment in that school. Unrelated '
  'role/scope invitations are unaffected. A legacy pre-B9 STUDENT/OWN row '
  'with no target_student_id can still be revoked (new.revoked_at is not '
  'null bypasses only the missing-target check) but can never be accepted '
  'or otherwise provisioned.';

-- -----------------------------------------------------------------------------
-- 3. list_student_own_attendance — Student OWN safe attendance reader
-- -----------------------------------------------------------------------------

create or replace function public.list_student_own_attendance(
  p_organization_id uuid,
  p_school_id uuid,
  p_from date default null,
  p_to date default null
)
returns table (
  record_id uuid,
  session_id uuid,
  organization_id uuid,
  school_id uuid,
  classroom_id uuid,
  session_date date,
  session_status text,
  status text,
  recorded_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    star.id,
    s.id,
    star.organization_id,
    star.school_id,
    s.classroom_id,
    s.session_date,
    s.status,
    star.status,
    star.updated_at
  from public.student_attendance_records star
  join public.attendance_sessions s
    on s.id = star.attendance_session_id
   and s.organization_id = star.organization_id
   and s.school_id = star.school_id
  join public.student_enrollments se
    on se.id = star.student_enrollment_id
   and se.organization_id = star.organization_id
   and se.school_id = star.school_id
  join public.students st
    on st.id = se.student_id
   and st.organization_id = se.organization_id
  where s.status in ('submitted', 'locked', 'corrected')
    and star.organization_id = p_organization_id
    and star.school_id = p_school_id
    and st.profile_id = auth.uid()
    and (p_from is null or s.session_date >= p_from)
    and (p_to   is null or s.session_date <= p_to)
    and public.has_permission(
      'attendance.read',
      star.organization_id,
      star.school_id,
      s.classroom_id,
      st.profile_id,
      st.id
    )
$$;

revoke all on function public.list_student_own_attendance(uuid, uuid, date, date) from public;
revoke all on function public.list_student_own_attendance(uuid, uuid, date, date) from anon;
revoke all on function public.list_student_own_attendance(uuid, uuid, date, date) from service_role;
grant execute on function public.list_student_own_attendance(uuid, uuid, date, date) to authenticated;

comment on function public.list_student_own_attendance(uuid, uuid, date, date) is
  'B9: subject-scoped STUDENT/OWN read of the caller''s own attendance. Derives '
  'the student exclusively via students.profile_id = auth.uid() (never accepts '
  'a student id as authorization proof); requires attendance.read via '
  'public.has_permission OWN; returns only outcome-visible sessions '
  '(submitted/locked/corrected); never exposes classmate records, draft/open '
  'session state, or staff-internal notes/correction_reason. Mirrors the B7 '
  'list_parent_student_attendance security posture for the STUDENT persona.';

commit;
