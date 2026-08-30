-- B4 security reconciliation: converge legacy Development ACLs without
-- changing domain objects, RLS policies, functions, or data.

begin;

-- The public schema must remain discoverable by PostgREST roles, but anonymous
-- callers receive no privileges on application objects.
grant usage on schema public to anon, authenticated, service_role;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke execute on function
  public.audit_row_change(),
  public.can_access_assessment(text, uuid),
  public.can_access_enrollment(text, uuid),
  public.can_access_guardian(text, uuid, uuid),
  public.can_access_report_card(text, uuid),
  public.can_access_staff(text, uuid, uuid),
  public.can_access_student(text, uuid, uuid),
  public.can_access_teaching_assignment(text, uuid),
  public.can_read_membership(uuid, uuid),
  public.can_read_membership_role(uuid, uuid, text, uuid),
  public.can_read_role(uuid),
  public.guard_assessment_transition(),
  public.guard_attendance_session_transition(),
  public.guard_report_card_transition(),
  public.guard_student_status_transition(),
  public.guard_teaching_assignment_material_identity(),
  public.guard_teaching_assignment_transition(),
  public.guard_timetable_period_history(),
  public.guard_timetable_transition(),
  public.handle_new_auth_user(),
  public.has_active_membership(uuid),
  public.has_any_active_membership(),
  public.has_permission(text, uuid, uuid, uuid, uuid, uuid),
  public.has_permission_in_org(text, uuid),
  public.has_staff_scope_permission(text, uuid, uuid, uuid),
  public.is_own_membership(uuid),
  public.owns_teaching_assignment(uuid),
  public.prevent_tenant_boundary_change(),
  public.replace_teaching_assignment(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, date, date),
  public.replace_timetable_entry(uuid, uuid, uuid, bigint, date, uuid, uuid, uuid, smallint, text, boolean, date, boolean),
  public.set_timetable_entry_row_version(),
  public.set_updated_at(),
  public.validate_academic_year_calendar_bounds(),
  public.validate_assessment_consistency(),
  public.validate_attendance_session_consistency(),
  public.validate_calendar_within_year(),
  public.validate_class_enrollment_consistency(),
  public.validate_enrollment_placement_integrity(),
  public.validate_membership_role_scope(),
  public.validate_report_card_consistency(),
  public.validate_staff_assignment_timetable_conflicts(),
  public.validate_student_score(),
  public.validate_teaching_assignment_consistency(),
  public.validate_teaching_assignment_parent_integrity(),
  public.validate_teaching_assignment_timetable_conflicts(),
  public.validate_term_within_year(),
  public.validate_timetable_conflicts(),
  public.validate_timetable_consistency(),
  public.validate_timetable_history_lifecycle(),
  public.validate_timetable_parent_integrity()
from public, anon, authenticated;

-- service_role is server-only and must retain platform/privileged-flow access.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on function
  public.audit_row_change(),
  public.can_access_assessment(text, uuid),
  public.can_access_enrollment(text, uuid),
  public.can_access_guardian(text, uuid, uuid),
  public.can_access_report_card(text, uuid),
  public.can_access_staff(text, uuid, uuid),
  public.can_access_student(text, uuid, uuid),
  public.can_access_teaching_assignment(text, uuid),
  public.can_read_membership(uuid, uuid),
  public.can_read_membership_role(uuid, uuid, text, uuid),
  public.can_read_role(uuid),
  public.guard_assessment_transition(),
  public.guard_attendance_session_transition(),
  public.guard_report_card_transition(),
  public.guard_student_status_transition(),
  public.guard_teaching_assignment_material_identity(),
  public.guard_teaching_assignment_transition(),
  public.guard_timetable_period_history(),
  public.guard_timetable_transition(),
  public.handle_new_auth_user(),
  public.has_active_membership(uuid),
  public.has_any_active_membership(),
  public.has_permission(text, uuid, uuid, uuid, uuid, uuid),
  public.has_permission_in_org(text, uuid),
  public.has_staff_scope_permission(text, uuid, uuid, uuid),
  public.is_own_membership(uuid),
  public.owns_teaching_assignment(uuid),
  public.prevent_tenant_boundary_change(),
  public.replace_teaching_assignment(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, date, date),
  public.replace_timetable_entry(uuid, uuid, uuid, bigint, date, uuid, uuid, uuid, smallint, text, boolean, date, boolean),
  public.set_timetable_entry_row_version(),
  public.set_updated_at(),
  public.validate_academic_year_calendar_bounds(),
  public.validate_assessment_consistency(),
  public.validate_attendance_session_consistency(),
  public.validate_calendar_within_year(),
  public.validate_class_enrollment_consistency(),
  public.validate_enrollment_placement_integrity(),
  public.validate_membership_role_scope(),
  public.validate_report_card_consistency(),
  public.validate_staff_assignment_timetable_conflicts(),
  public.validate_student_score(),
  public.validate_teaching_assignment_consistency(),
  public.validate_teaching_assignment_parent_integrity(),
  public.validate_teaching_assignment_timetable_conflicts(),
  public.validate_term_within_year(),
  public.validate_timetable_conflicts(),
  public.validate_timetable_consistency(),
  public.validate_timetable_history_lifecycle(),
  public.validate_timetable_parent_integrity()
to service_role;

-- Browser CRUD reaches RLS only through this explicit application-table list.
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
  public.timetable_periods,
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

-- Preserve the canonical table/column hardening layered on top of RLS.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_file_id) on public.profiles to authenticated;

revoke insert, update, delete on
  public.organization_memberships,
  public.membership_school_access,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.membership_roles,
  public.invitations,
  public.audit_logs,
  public.file_assets,
  public.generated_documents
from authenticated;

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
  public.timetable_periods,
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

-- Authenticated execution is limited to RLS permission helpers and the two
-- SECURITY INVOKER replacement RPCs exposed by the generated client contract.
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
grant execute on function public.replace_teaching_assignment(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, date, date
) to authenticated;
grant execute on function public.replace_timetable_entry(
  uuid, uuid, uuid, bigint, date, uuid, uuid, uuid, smallint, text, boolean, date, boolean
) to authenticated;

-- Future public objects must be explicitly exposed by their owning migration.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

commit;
