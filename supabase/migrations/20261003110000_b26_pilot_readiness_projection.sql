begin;

create or replace function public.b26_get_pilot_readiness_facts(p_school_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school public.schools%rowtype;
  v_academics boolean;
  v_students boolean;
  v_teaching boolean;
  v_guardians boolean;
  v_admissions boolean;
  v_finance boolean;
  v_communication boolean;
begin
  select * into v_school
  from public.schools s
  where s.id = p_school_id;

  if not found or not public.has_staff_scope_permission(
    'school.readiness.read', v_school.organization_id, v_school.id
  ) then
    raise exception using errcode = '42501', message = 'PILOT_READINESS_UNAVAILABLE';
  end if;

  v_academics := coalesce(public.has_staff_scope_permission('academic_year.read', v_school.organization_id, v_school.id), false);
  v_students := coalesce(public.has_staff_scope_permission('student.read', v_school.organization_id, v_school.id), false);
  v_teaching := coalesce(public.has_staff_scope_permission('teaching_assignment.read', v_school.organization_id, v_school.id), false);
  v_guardians := coalesce(public.has_staff_scope_permission('guardian.read', v_school.organization_id, v_school.id), false);
  v_admissions := coalesce(public.has_staff_scope_permission('admission.read', v_school.organization_id, v_school.id), false);
  v_finance := coalesce(public.has_staff_scope_permission('finance.read', v_school.organization_id, v_school.id), false);
  v_communication := coalesce(public.has_staff_scope_permission('notification.send', v_school.organization_id, v_school.id), false);

  return pg_catalog.jsonb_build_object(
    'schoolActive', v_school.status = 'active',
    'access', pg_catalog.jsonb_build_object(
      'academics', v_academics,
      'students', v_students,
      'teaching', v_teaching,
      'guardians', v_guardians,
      'admissions', v_admissions,
      'finance', v_finance,
      'communication', v_communication
    ),
    'activeAcademicYears', case when v_academics then (
      select count(*)::integer from public.academic_years y
      where y.organization_id = v_school.organization_id and y.school_id = v_school.id
        and y.status = 'active' and y.is_current
    ) else 0 end,
    'activeTerms', case when v_academics then (
      select count(*)::integer from public.terms t
      where t.organization_id = v_school.organization_id and t.school_id = v_school.id and t.status = 'active'
    ) else 0 end,
    'activeClassrooms', case when v_academics then (
      select count(*)::integer from public.classrooms c
      where c.organization_id = v_school.organization_id and c.school_id = v_school.id and c.status = 'active'
    ) else 0 end,
    'activeEnrollments', case when v_students then (
      select count(*)::integer from public.student_enrollments e
      where e.organization_id = v_school.organization_id and e.school_id = v_school.id and e.status = 'active'
    ) else 0 end,
    'activeClassAssignments', case when v_students then (
      select count(*)::integer from public.class_enrollments ce
      where ce.organization_id = v_school.organization_id and ce.school_id = v_school.id and ce.status = 'active'
    ) else 0 end,
    'activeTeachingAssignments', case when v_teaching then (
      select count(*)::integer from public.teaching_assignments a
      where a.organization_id = v_school.organization_id and a.school_id = v_school.id and a.status = 'active'
    ) else 0 end,
    'profileLinkedEnrollments', case when v_students then (
      select count(distinct e.id)::integer
      from public.student_enrollments e
      join public.students st on st.id = e.student_id and st.organization_id = e.organization_id
      where e.organization_id = v_school.organization_id and e.school_id = v_school.id
        and e.status = 'active' and st.profile_id is not null
    ) else 0 end,
    'activeGuardianLinks', case when v_guardians then (
      select count(distinct sg.id)::integer
      from public.student_guardians sg
      join public.student_enrollments e on e.student_id = sg.student_id and e.organization_id = sg.organization_id
      where sg.organization_id = v_school.organization_id and sg.status = 'active'
        and e.school_id = v_school.id and e.status = 'active'
    ) else 0 end,
    'openAdmissionCycles', case when v_admissions then (
      select count(*)::integer from public.admission_cycles c
      where c.organization_id = v_school.organization_id and c.school_id = v_school.id and c.status = 'open'
    ) else 0 end,
    'openFollowups', case when v_admissions then (
      select count(*)::integer from public.admission_followup_tasks f
      where f.organization_id = v_school.organization_id and f.school_id = v_school.id and f.status = 'open'
    ) else 0 end,
    'activeFeeDefinitions', case when v_finance then (
      select count(*)::integer from public.finance_fee_definitions f
      where f.organization_id = v_school.organization_id and f.school_id = v_school.id and f.status = 'active'
    ) else 0 end,
    'activeBillingPlans', case when v_finance then (
      select count(*)::integer from public.finance_billing_plans p
      where p.organization_id = v_school.organization_id and p.school_id = v_school.id and p.status = 'active'
    ) else 0 end,
    'publishedAnnouncements', case when v_communication then (
      select count(*)::integer from public.communication_announcements a
      where a.organization_id = v_school.organization_id and a.school_id = v_school.id and a.status = 'published'
    ) else 0 end
  );
end;
$$;

revoke all on function public.b26_get_pilot_readiness_facts(uuid) from public, anon, service_role;
grant execute on function public.b26_get_pilot_readiness_facts(uuid) to authenticated;

commit;
