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
