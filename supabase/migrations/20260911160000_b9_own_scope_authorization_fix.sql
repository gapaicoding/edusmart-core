-- EduSmart Core V1 / Batch 9 — OWN-scope authorization remediation.
--
-- Fixes B9-LIVE-UAT-002 (HIGH): a signed-in STUDENT could read every other
-- student's identity row in the same organization (confirmed live: 37/37
-- rows visible, including classmates in a different classroom entirely),
-- plus the same class of leak in student_enrollments and student_scores for
-- classmates in the caller's own classroom.
--
-- ROOT CAUSE (proven from live SQL, not assumed):
--   public.has_permission(...)'s OWN branch is:
--     (p_owner_profile_id is not null and p_owner_profile_id = auth.uid())
--     or exists (
--       -- "does the caller have *any* own-student identity matching the
--       -- supplied org/school/classroom filters" -- NOT correlated to the
--       -- specific row/subject being evaluated at all.
--       select 1 from students s2 join student_enrollments se2 ...
--       where s2.organization_id = p_organization_id
--         and s2.profile_id = auth.uid()
--         and (p_school_id is null or se2.school_id = p_school_id)
--         and (p_classroom_id is null or ce2.classroom_id = p_classroom_id)
--     )
--   The second clause is legitimate and load-bearing for CLASSROOM-SHARED
--   resources a Student is meant to see regardless of a specific "owner"
--   (e.g. their own published timetable/schedule, where the row's owner is
--   the TEACHER, never the student -- can_access_teaching_assignment relies
--   on exactly this). It is WRONG for PER-INDIVIDUAL resources, where the
--   row itself already has a specific, correlatable owner and "OWN" must
--   mean "this exact row", never "any row I share a classroom/school/org
--   with". can_access_student's own second `or exists (...)` block makes
--   this worse for the students table specifically by passing NULL for both
--   school and classroom, degenerating the fallback to "the caller has *any*
--   own-student identity in this organization at all" -- true for every row,
--   organization-wide, for any bound Student.
--
-- can_access_student's FIRST block already LEFT JOINs enrollment/class data
-- and passes the row's real s.profile_id/s.id as owner/subject -- for the
-- caller's own row this is sufficient on its own (has_permission's exact
-- first clause matches independently of the LEFT JOIN results). Proven live:
-- removing can_access_student's second `or exists` block loses no legitimate
-- access to the caller's own row, and the smallest correct fix additionally
-- requires closing the fallback inside has_permission's OWN branch for this
-- class of per-individual call site.
--
-- REMEDIATION STRATEGY (Option C -- smallest blast radius):
-- public.has_permission(...) itself is NOT modified. Its signature has 146+
-- existing call sites across every RLS policy and helper in this schema
-- (Staff ORG/SCHOOL/CLASS, Parent RELATED, and the legitimately
-- classroom-shared Student OWN uses -- schedule/timetable via
-- can_access_teaching_assignment, published-assessment visibility via
-- can_access_assessment). Extending has_permission's parameter list is
-- structurally unsafe here: CREATE OR REPLACE FUNCTION only replaces a
-- function with an IDENTICAL argument-type list, so adding a parameter
-- creates a second overload rather than fixing the original for existing
-- callers, and DROP FUNCTION would cascade into every dependent RLS policy.
--
-- Instead, a NEW, narrowly-scoped helper is introduced --
-- public.has_scoped_permission_exact_subject(...) -- which grants access
-- via the *unchanged* Staff ORG/SCHOOL/CLASS path (reusing
-- has_staff_scope_permission verbatim), a *corrected* OWN path (exact
-- subject-profile match only, no classroom/org-wide fallback), and a RELATED
-- path with identical semantics to has_permission's own RELATED branch (so
-- Parent access is byte-for-byte preserved). Only the three call sites
-- proven vulnerable are migrated to it:
--   1. public.can_access_student   (students table -- org-wide leak)
--   2. public.can_access_enrollment (student_enrollments -- classroom leak)
--   3. student_scores_select policy (student_scores -- classroom leak of
--      classmates' actual published grades)
--
-- can_access_teaching_assignment, can_access_assessment,
-- has_staff_scope_permission, and every RELATED/ORG/SCHOOL/CLASS evaluation
-- elsewhere are completely untouched -- zero behavior change for Staff,
-- Parent, Teacher, or the legitimate classroom-shared Schedule/Assessment
-- visibility a Student is meant to have. can_access_report_card's Student
-- OWN path is also untouched: it was already safe (it double-guards with an
-- explicit `s.profile_id = auth.uid()` equality check in SQL *before* ever
-- calling has_permission, so the OWN-branch fallback bug could never widen
-- it), confirmed by direct source inspection, not assumed.

begin;

-- -----------------------------------------------------------------------------
-- 1. New exact-subject helper (Staff scope unchanged, OWN corrected, RELATED
--    preserved byte-for-byte relative to has_permission's own branch).
-- -----------------------------------------------------------------------------

create or replace function public.has_scoped_permission_exact_subject(
  p_permission_code text,
  p_organization_id uuid,
  p_school_id uuid,
  p_classroom_id uuid,
  p_subject_profile_id uuid,
  p_related_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Staff path: byte-identical to the existing, unmodified helper.
    public.has_staff_scope_permission(
      p_permission_code, p_organization_id, p_school_id, p_classroom_id
    )
    or (
      -- Corrected Student OWN path: the row's own subject profile must be
      -- the caller -- exact match only. No classroom/school/org-wide
      -- fallback. This is the fix for B9-LIVE-UAT-002.
      p_subject_profile_id is not null
      and p_subject_profile_id = auth.uid()
      and exists (
        select 1
        from public.organization_memberships m
        join public.profiles p on p.id = m.profile_id
        join public.membership_roles mr
          on mr.membership_id = m.id and mr.organization_id = m.organization_id
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
          and mr.scope_type = 'OWN'
      )
    )
    or (
      -- RELATED path: identical predicate shape to has_permission's own
      -- RELATED branch (same guardian/student_guardians correlation, same
      -- active-status requirements, same optional exact-subject filter).
      exists (
        select 1
        from public.organization_memberships m
        join public.profiles p on p.id = m.profile_id
        join public.membership_roles mr
          on mr.membership_id = m.id and mr.organization_id = m.organization_id
        join public.roles r on r.id = mr.role_id
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions perm on perm.id = rp.permission_id
        join public.guardians g
          on g.organization_id = m.organization_id
         and g.profile_id = m.profile_id
         and g.status = 'active'
        join public.student_guardians sg
          on sg.guardian_id = g.id
         and sg.organization_id = g.organization_id
         and sg.status = 'active'
        left join public.students s2
          on s2.id = sg.student_id and s2.organization_id = sg.organization_id
        left join public.student_enrollments se2
          on se2.student_id = s2.id
         and se2.organization_id = s2.organization_id
         and se2.status in ('active', 'leave')
        left join public.class_enrollments ce2
          on ce2.student_enrollment_id = se2.id
         and ce2.organization_id = se2.organization_id
         and ce2.school_id = se2.school_id
         and ce2.status = 'active'
        where m.organization_id = p_organization_id
          and m.profile_id = auth.uid()
          and m.status = 'active'
          and p.status = 'active'
          and perm.code = p_permission_code
          and (r.organization_id is null or r.organization_id = p_organization_id)
          and (mr.starts_at is null or mr.starts_at <= now())
          and (mr.ends_at is null or mr.ends_at > now())
          and mr.scope_type = 'RELATED'
          and (p_related_student_id is null or sg.student_id = p_related_student_id)
          and (p_school_id is null or se2.school_id = p_school_id)
          and (p_classroom_id is null or ce2.classroom_id = p_classroom_id)
      )
    );
$$;

revoke all on function public.has_scoped_permission_exact_subject(text, uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function public.has_scoped_permission_exact_subject(text, uuid, uuid, uuid, uuid, uuid) from anon;
revoke all on function public.has_scoped_permission_exact_subject(text, uuid, uuid, uuid, uuid, uuid) from service_role;
grant execute on function public.has_scoped_permission_exact_subject(text, uuid, uuid, uuid, uuid, uuid) to authenticated;

comment on function public.has_scoped_permission_exact_subject(text, uuid, uuid, uuid, uuid, uuid) is
  'B9-LIVE-UAT-002 remediation: narrowly-scoped replacement for has_permission '
  'at per-individual-resource call sites. Staff ORG/SCHOOL/CLASS path is '
  'byte-identical (delegates to has_staff_scope_permission). OWN path grants '
  'access only when p_subject_profile_id exactly equals auth.uid() -- no '
  'classroom/school/organization-wide fallback. RELATED path mirrors '
  'has_permission''s own RELATED branch exactly, so Parent access is '
  'unchanged. Does not replace has_permission itself (146+ existing call '
  'sites, several of which legitimately rely on the classroom-shared OWN '
  'fallback for Schedule/Assessment visibility and must not regress).';

-- -----------------------------------------------------------------------------
-- 2. can_access_student -- remove the org-wide fallback, use exact-subject.
-- -----------------------------------------------------------------------------

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
      and public.has_scoped_permission_exact_subject(
        p_permission_code,
        s.organization_id,
        se.school_id,
        ce.classroom_id,
        s.profile_id,
        s.id
      )
  );
$$;

comment on function public.can_access_student(text, uuid, uuid) is
  'B9-LIVE-UAT-002 fix: Student OWN access now requires the row''s own '
  'profile_id to exactly equal auth.uid() (via '
  'has_scoped_permission_exact_subject) -- no classroom/school/'
  'organization-wide fallback. The previous second `or exists (...)` block '
  '(which passed NULL school/classroom, degenerating to "caller has *any* '
  'own-student identity in this organization") has been removed as proven '
  'unnecessary: the first block''s LEFT JOIN already evaluates correctly for '
  'an unenrolled or newly-bound student, independent of enrollment presence, '
  'because the exact-subject match does not depend on se/ce being non-null. '
  'Staff ORG/SCHOOL/CLASS and Parent RELATED behavior are unchanged.';

-- -----------------------------------------------------------------------------
-- 3. can_access_enrollment -- same fix, same reasoning.
-- -----------------------------------------------------------------------------

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
      and public.has_scoped_permission_exact_subject(
        p_permission_code,
        se.organization_id,
        se.school_id,
        ce.classroom_id,
        s.profile_id,
        s.id
      )
  );
$$;

comment on function public.can_access_enrollment(text, uuid) is
  'B9-LIVE-UAT-002 fix: Student OWN access to an enrollment record now '
  'requires the enrollment''s own student.profile_id to exactly equal '
  'auth.uid() -- no classroom-wide fallback that previously let any Student '
  'in the same classroom read a classmate''s enrollment record. Staff '
  'ORG/SCHOOL/CLASS and Parent RELATED behavior are unchanged.';

-- -----------------------------------------------------------------------------
-- 4. student_scores_select policy -- same fix, applied inline (this call site
--    invokes has_permission directly, not through a can_access_* wrapper).
-- -----------------------------------------------------------------------------

drop policy if exists student_scores_select on public.student_scores;
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
          'score.read', student_scores.organization_id, student_scores.school_id, ta.classroom_id
        )
        or (
          a.status = 'published'
          and public.has_scoped_permission_exact_subject(
            'score.read', student_scores.organization_id, student_scores.school_id,
            ta.classroom_id, st.profile_id, st.id
          )
        )
      )
  )
);

comment on policy student_scores_select on public.student_scores is
  'B9-LIVE-UAT-002 fix: Student OWN access to a published score now requires '
  'the score''s own student.profile_id to exactly equal auth.uid() -- no '
  'classroom-wide fallback that previously let any Student in the same '
  'classroom read a classmate''s actual published grade. Staff scope '
  'behavior is unchanged (has_staff_scope_permission untouched).';

commit;
