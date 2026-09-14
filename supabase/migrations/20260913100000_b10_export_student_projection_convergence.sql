-- B10 forward remediation: person projections must use person cardinality.
create or replace function public.get_sis_export_projection(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); s public.schools; t text; v_code text; missing jsonb;
begin
 if v_actor is null then raise exception 'B10_AUTHORIZATION_DENIED'; end if;
 select * into s from public.schools where id=p_school_id;
 if not found then raise exception 'B10_JOB_NOT_FOUND'; end if;
 foreach t in array array['student','guardian','staff','student_guardian','student_enrollment','class_enrollment','staff_school_assignment']::text[] loop
  foreach v_code in array coalesce(public.sis_entity_export_permission_codes(t),array[]::text[]) loop
    perform public.assert_sis_permission_for_school(v_code,s.organization_id,s.id);
  end loop;
 end loop;
 select jsonb_build_object(
  'students',count(*) filter(where x.kind='student'), 'guardians',count(*) filter(where x.kind='guardian'),'staff',count(*) filter(where x.kind='staff')) into missing
 from (
  select 'student' kind from public.students st left join public.sis_import_entity_refs r on r.student_id=st.id where st.organization_id=s.organization_id and r.id is null and exists(select 1 from public.student_enrollments se where se.student_id=st.id and se.school_id=s.id)
  union all select 'guardian' from public.student_enrollments se join public.student_guardians sg on sg.student_id=se.student_id join public.guardians g on g.id=sg.guardian_id left join public.sis_import_entity_refs r on r.guardian_id=g.id where se.school_id=s.id and r.id is null
  union all select 'staff' from public.staff_school_assignments a join public.staff_members sm on sm.id=a.staff_member_id left join public.sis_import_entity_refs r on r.staff_member_id=sm.id where a.school_id=s.id and r.id is null
 ) x;
 if (missing->>'students')::int+(missing->>'guardians')::int+(missing->>'staff')::int>0 then
   return jsonb_build_object('ready',false,'missingRefs',missing);
 end if;
 return jsonb_build_object('ready',true,'missingRefs',missing,'schoolCode',s.code,
  'Students',(select coalesce(jsonb_agg(jsonb_build_object('student_ref',r.external_ref,'nisn',st.nisn,'full_name',st.full_name,'preferred_name',st.preferred_name,'gender',st.gender,'birth_date',st.birth_date,'birth_place',st.birth_place,'status',st.status) order by lower(r.external_ref)),'[]') from public.students st join public.sis_import_entity_refs r on r.student_id=st.id and r.organization_id=st.organization_id where st.organization_id=s.organization_id and r.entity_type='student' and exists(select 1 from public.student_enrollments se where se.student_id=st.id and se.school_id=s.id)),
  'Guardians',(select coalesce(jsonb_agg(distinct jsonb_build_object('guardian_ref',r.external_ref,'full_name',g.full_name,'phone',g.phone,'email',g.email,'occupation',g.occupation,'status',g.status)),'[]') from public.student_enrollments se join public.student_guardians sg on sg.student_id=se.student_id join public.guardians g on g.id=sg.guardian_id join public.sis_import_entity_refs r on r.guardian_id=g.id where se.school_id=s.id),
  'Staff',(select coalesce(jsonb_agg(distinct jsonb_build_object('staff_ref',r.external_ref,'full_name',sm.full_name,'staff_kind',sm.staff_kind,'status',sm.status)),'[]') from public.staff_school_assignments a join public.staff_members sm on sm.id=a.staff_member_id join public.sis_import_entity_refs r on r.staff_member_id=sm.id where a.school_id=s.id),
  'StaffSchoolAssignments',(select coalesce(jsonb_agg(jsonb_build_object('staff_ref_or_employee_number',r.external_ref,'school_code',s.code,'employee_number',a.employee_number,'employment_status',a.employment_status,'position_title',a.position_title,'joined_on',a.joined_on,'left_on',a.left_on,'status',a.status)),'[]') from public.staff_school_assignments a join public.sis_import_entity_refs r on r.staff_member_id=a.staff_member_id where a.school_id=s.id),
  'StudentGuardians',(select coalesce(jsonb_agg(distinct jsonb_build_object('student_ref_or_nisn',sr.external_ref,'guardian_ref',gr.external_ref,'relationship_type',sg.relationship_type,'is_primary',sg.is_primary,'can_view_academic',sg.can_view_academic,'can_view_attendance',sg.can_view_attendance,'can_receive_notification',sg.can_receive_notification,'can_manage_permissions',sg.can_manage_permissions,'status',sg.status)),'[]') from public.student_enrollments se join public.student_guardians sg on sg.student_id=se.student_id join public.sis_import_entity_refs sr on sr.student_id=se.student_id join public.sis_import_entity_refs gr on gr.guardian_id=sg.guardian_id where se.school_id=s.id),
  'StudentEnrollments',(select coalesce(jsonb_agg(jsonb_build_object('student_ref_or_nisn',r.external_ref,'school_code',s.code,'academic_year_code',ay.code,'grade_level_code',gl.code,'student_number',se.student_number,'enrollment_number',se.enrollment_number,'status',se.status,'enrolled_on',se.enrolled_on,'ended_on',se.ended_on)),'[]') from public.student_enrollments se join public.sis_import_entity_refs r on r.student_id=se.student_id join public.academic_years ay on ay.id=se.academic_year_id join public.grade_levels gl on gl.id=se.grade_level_id where se.school_id=s.id),
  'ClassEnrollments',(select coalesce(jsonb_agg(jsonb_build_object('student_ref_or_nisn',r.external_ref,'school_code',s.code,'academic_year_code',ay.code,'classroom_code',c.code,'starts_on',ce.starts_on,'ends_on',ce.ends_on,'is_primary',ce.is_primary,'status',ce.status)),'[]') from public.class_enrollments ce join public.student_enrollments se on se.id=ce.student_enrollment_id join public.sis_import_entity_refs r on r.student_id=se.student_id join public.academic_years ay on ay.id=se.academic_year_id join public.classrooms c on c.id=ce.classroom_id where ce.school_id=s.id)
 );
end $$;
revoke all on function public.get_sis_export_projection(uuid) from public,anon,service_role;
grant execute on function public.get_sis_export_projection(uuid) to authenticated;
