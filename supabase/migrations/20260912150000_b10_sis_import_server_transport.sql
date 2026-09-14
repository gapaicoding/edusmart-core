-- Batch 10 Phase 3C: caller-JWT server transport, snapshots and export.
begin;

create or replace function public.has_any_sis_import_permission_for_school(
  p_organization_id uuid, p_school_id uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    public.has_sis_permission_for_school('student.import',p_organization_id,p_school_id)
    or public.has_sis_permission_for_school('guardian.import',p_organization_id,p_school_id)
    or public.has_sis_permission_for_school('staff.import',p_organization_id,p_school_id)
    or public.has_sis_permission_for_school('enrollment.import',p_organization_id,p_school_id)
    or public.has_sis_permission_for_school('class_enrollment.import',p_organization_id,p_school_id)
    or public.has_sis_permission_for_school('staff_school_assignment.import',p_organization_id,p_school_id)
  )
$$;
revoke all on function public.has_any_sis_import_permission_for_school(uuid,uuid) from public,anon,authenticated,service_role;

-- Narrow policy predicate. SECURITY DEFINER avoids recursive jobs->rows->jobs
-- RLS evaluation while exposing only an authorization boolean.
create or replace function public.can_read_sis_import_job(p_job_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.sis_import_jobs j where j.id=p_job_id and (
      (not exists(select 1 from public.sis_import_job_rows r where r.import_job_id=j.id)
        and public.has_any_sis_import_permission_for_school(j.organization_id,j.school_id))
      or (exists(select 1 from public.sis_import_job_rows r where r.import_job_id=j.id)
        and not exists(select 1 from public.sis_import_job_rows r where r.import_job_id=j.id and r.entity_type not in ('student','guardian','staff','student_guardian','student_enrollment','class_enrollment','staff_school_assignment'))
        and not exists(
        select 1 from public.sis_import_job_rows r
        cross join lateral unnest(public.sis_entity_import_permission_codes(r.entity_type)) required(code)
        where r.import_job_id=j.id and not public.has_sis_permission_for_school(required.code,j.organization_id,j.school_id)
      ))
    )
  )
$$;
revoke all on function public.can_read_sis_import_job(uuid) from public,anon,service_role;
grant execute on function public.can_read_sis_import_job(uuid) to authenticated;

create or replace function public.register_sis_import_source_file(
  p_job_id uuid, p_object_path text, p_original_filename text,
  p_mime_type text, p_size_bytes bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=auth.uid(); v_job public.sis_import_jobs; v_asset uuid;
begin
  if v_actor is null then raise exception 'B10_AUTHORIZATION_DENIED'; end if;
  select * into v_job from public.sis_import_jobs where id=p_job_id for update;
  if not found then raise exception 'B10_JOB_NOT_FOUND'; end if;
  if not public.has_any_sis_import_permission_for_school(v_job.organization_id,v_job.school_id) then raise exception 'B10_AUTHORIZATION_DENIED'; end if;
  if v_job.status<>'uploaded' or v_job.source_file_asset_id is not null then raise exception 'B10_JOB_STATE_CONFLICT'; end if;
  if p_size_bytes<1 or p_size_bytes>10485760 or p_mime_type<>'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
     or p_object_path <> (v_job.organization_id::text||'/'||v_job.school_id::text||'/sis-imports/'||v_job.id::text||'/source.xlsx')
    then raise exception 'B10_FILE_INVALID'; end if;
  insert into public.file_assets(organization_id,school_id,bucket,object_path,original_filename,mime_type,size_bytes,uploaded_by_profile_id)
  values(v_job.organization_id,v_job.school_id,'sis-imports',p_object_path,p_original_filename,p_mime_type,p_size_bytes,v_actor)
  returning id into v_asset;
  update public.sis_import_jobs set source_file_asset_id=v_asset where id=v_job.id;
  return v_asset;
end $$;
revoke all on function public.register_sis_import_source_file(uuid,text,text,text,bigint) from public,anon,service_role;
grant execute on function public.register_sis_import_source_file(uuid,text,text,text,bigint) to authenticated;

create or replace function public.fail_sis_import_upload(p_job_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_job public.sis_import_jobs;
begin
 if v_actor is null then raise exception 'B10_AUTHORIZATION_DENIED'; end if;
 select * into v_job from public.sis_import_jobs where id=p_job_id for update;
 if not found then raise exception 'B10_JOB_NOT_FOUND'; end if;
 if not public.has_any_sis_import_permission_for_school(v_job.organization_id,v_job.school_id) then raise exception 'B10_AUTHORIZATION_DENIED'; end if;
 if v_job.status='uploaded' and v_job.source_file_asset_id is null then
   update public.sis_import_jobs set status='failed',failure_summary='B10_FILE_UPLOAD_FAILED' where id=v_job.id;
 end if;
end $$;
revoke all on function public.fail_sis_import_upload(uuid) from public,anon,service_role;
grant execute on function public.fail_sis_import_upload(uuid) to authenticated;

create or replace function public.get_sis_import_job_payload(p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); j public.sis_import_jobs; types text[];
begin
 if v_actor is null then raise exception 'B10_AUTHORIZATION_DENIED'; end if;
 select * into j from public.sis_import_jobs where id=p_job_id;
 if not found then raise exception 'B10_JOB_NOT_FOUND'; end if;
 select array_agg(distinct entity_type) into types from public.sis_import_job_rows where import_job_id=j.id;
 if types is null then
   if not public.has_any_sis_import_permission_for_school(j.organization_id,j.school_id) then raise exception 'B10_AUTHORIZATION_DENIED'; end if;
 else
   perform public.assert_sis_import_permissions_for_entities(j.organization_id,j.school_id,types);
 end if;
 return jsonb_build_object('id',j.id,'organizationId',j.organization_id,'schoolId',j.school_id,'filename',j.source_filename,
  'templateVersion',j.template_version,'status',j.status,'totals',j.totals,'previewVersion',j.preview_version,
  'failureSummary',j.failure_summary,'createdAt',j.created_at,'validatedAt',j.validated_at,'confirmedAt',j.confirmed_at,'completedAt',j.completed_at,
  'rows',(select coalesce(jsonb_agg(jsonb_build_object('sheet',r.sheet_name,'rowNumber',r.row_number,'entityType',r.entity_type,'action',r.action,'normalized',r.normalized_data,
    'diff',(select coalesce(jsonb_agg(jsonb_build_object('field',e.key,'oldValue',r.expected_state->e.key,'newValue',e.value)),'[]') from jsonb_each(coalesce(r.normalized_data,'{}')) e where r.expected_state ? e.key and r.expected_state->e.key is distinct from e.value))),'[]') from public.sis_import_job_rows r where r.import_job_id=j.id),
  'issues',(select coalesce(jsonb_agg(jsonb_build_object('sheet',r.sheet_name,'rowNumber',r.row_number,'entityType',r.entity_type,'severity',i.severity,'code',i.error_code,'field',i.field_name,'rawValue',i.raw_value,'normalizedValue',i.normalized_value,'message',i.message)),'[]') from public.sis_import_job_issues i join public.sis_import_job_rows r on r.id=i.import_job_row_id where r.import_job_id=j.id));
end $$;
revoke all on function public.get_sis_import_job_payload(uuid) from public,anon,service_role;
grant execute on function public.get_sis_import_job_payload(uuid) to authenticated;

create or replace function public.list_sis_import_jobs(p_school_id uuid,p_limit integer default 25,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); s public.schools;
begin
 if v_actor is null then raise exception 'B10_AUTHORIZATION_DENIED'; end if;
 select * into s from public.schools where id=p_school_id;
 if not found or p_limit<1 or p_limit>100 or p_offset<0 then raise exception 'B10_JOB_NOT_FOUND'; end if;
 if not public.has_any_sis_import_permission_for_school(s.organization_id,s.id) then raise exception 'B10_AUTHORIZATION_DENIED'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
   select j.id,j.source_filename filename,j.template_version,j.status,j.totals,j.preview_version,j.failure_summary,j.created_at,j.validated_at,j.completed_at
   from public.sis_import_jobs j where j.school_id=s.id and (
     (not exists(select 1 from public.sis_import_job_rows r where r.import_job_id=j.id)
       and public.has_any_sis_import_permission_for_school(j.organization_id,j.school_id))
     or (exists(select 1 from public.sis_import_job_rows r where r.import_job_id=j.id)
       and not exists(select 1 from public.sis_import_job_rows r where r.import_job_id=j.id and r.entity_type not in ('student','guardian','staff','student_guardian','student_enrollment','class_enrollment','staff_school_assignment'))
       and not exists(
         select 1 from public.sis_import_job_rows r
         cross join lateral unnest(public.sis_entity_import_permission_codes(r.entity_type)) required(code)
         where r.import_job_id=j.id
           and not public.has_sis_permission_for_school(required.code,j.organization_id,j.school_id)
       ))
   ) order by j.created_at desc limit p_limit offset p_offset
 ) x);
end $$;
revoke all on function public.list_sis_import_jobs(uuid,integer,integer) from public,anon,service_role;
grant execute on function public.list_sis_import_jobs(uuid,integer,integer) to authenticated;

-- One bounded call supplies the exact job plus validation snapshot. Identifier
-- arrays are workbook-derived, capped, and never include caller-provided UUIDs.
create or replace function public.get_sis_import_validation_snapshot(
 p_job_id uuid,p_student_refs text[],p_student_nisns text[],p_guardian_refs text[],p_staff_refs text[],p_employee_numbers text[]
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); j public.sis_import_jobs; types text[];
begin
 if v_actor is null then raise exception 'B10_AUTHORIZATION_DENIED'; end if;
 select * into j from public.sis_import_jobs where id=p_job_id;
 if not found then raise exception 'B10_JOB_NOT_FOUND'; end if;
 if greatest(coalesce(cardinality(p_student_refs),0),coalesce(cardinality(p_student_nisns),0),coalesce(cardinality(p_guardian_refs),0),coalesce(cardinality(p_staff_refs),0),coalesce(cardinality(p_employee_numbers),0))>5000
   then raise exception 'B10_FILE_TOO_LARGE'; end if;
 if not public.has_any_sis_import_permission_for_school(j.organization_id,j.school_id) then raise exception 'B10_AUTHORIZATION_DENIED'; end if;
 return jsonb_build_object(
  'job',jsonb_build_object('id',j.id,'organizationId',j.organization_id,'schoolId',j.school_id,'templateVersion',j.template_version,'previewVersion',j.preview_version),
  'school',(select jsonb_build_object('id',s.id,'code',s.code,'organizationId',s.organization_id,'isActive',s.status='active') from public.schools s where s.id=j.school_id),
  'academicYears',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'code',a.code,'schoolId',a.school_id,'isActive',a.status='active')),'[]') from public.academic_years a where a.school_id=j.school_id),
  'gradeLevels',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'code',g.code,'schoolId',g.school_id,'isActive',g.is_active)),'[]') from public.grade_levels g where g.school_id=j.school_id),
  'classrooms',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'schoolId',c.school_id,'academicYearId',c.academic_year_id,'gradeLevelId',c.grade_level_id,'isActive',c.status='active')),'[]') from public.classrooms c where c.school_id=j.school_id),
  'students',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'ref',lower(r.external_ref),'nisn',s.nisn,'isActive',s.status='active','expectedState',jsonb_build_object('nisn',s.nisn,'full_name',s.full_name,'preferred_name',s.preferred_name,'gender',s.gender,'birth_date',s.birth_date,'birth_place',s.birth_place,'status',s.status))),'[]') from public.students s left join public.sis_import_entity_refs r on r.student_id=s.id and r.organization_id=s.organization_id where public.has_sis_permission_for_school('student.import',j.organization_id,j.school_id) and s.organization_id=j.organization_id and ((r.entity_type='student' and lower(r.external_ref)=any(coalesce(p_student_refs,array[]::text[]))) or s.nisn=any(coalesce(p_student_nisns,array[]::text[]))) and (public.has_permission('student.import',j.organization_id,null) or exists(select 1 from public.student_enrollments authorized_se where authorized_se.student_id=s.id and authorized_se.school_id=j.school_id))),
  'guardians',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'ref',lower(r.external_ref),'isActive',g.status='active','expectedState',jsonb_build_object('full_name',g.full_name,'phone',g.phone,'email',g.email,'occupation',g.occupation,'status',g.status))),'[]') from public.guardians g join public.sis_import_entity_refs r on r.guardian_id=g.id and r.organization_id=g.organization_id where public.has_sis_permission_for_school('guardian.import',j.organization_id,j.school_id) and g.organization_id=j.organization_id and r.entity_type='guardian' and lower(r.external_ref)=any(coalesce(p_guardian_refs,array[]::text[])) and exists(select 1 from public.student_guardians sg join public.student_enrollments se on se.student_id=sg.student_id where sg.guardian_id=g.id and se.school_id=j.school_id)),
  'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'ref',lower(r.external_ref),'employeeNumber',a.employee_number,'isActive',s.status='active','expectedState',jsonb_build_object('full_name',s.full_name,'staff_kind',s.staff_kind,'status',s.status))),'[]') from public.staff_members s left join public.sis_import_entity_refs r on r.staff_member_id=s.id and r.organization_id=s.organization_id left join public.staff_school_assignments a on a.staff_member_id=s.id and a.school_id=j.school_id where public.has_sis_permission_for_school('staff.import',j.organization_id,j.school_id) and s.organization_id=j.organization_id and ((r.entity_type='staff' and lower(r.external_ref)=any(coalesce(p_staff_refs,array[]::text[]))) or a.employee_number=any(coalesce(p_employee_numbers,array[]::text[]))) and (public.has_permission('staff.import',j.organization_id,null) or exists(select 1 from public.staff_school_assignments authorized_a where authorized_a.staff_member_id=s.id and authorized_a.school_id=j.school_id))),
  'studentGuardians',(select coalesce(jsonb_agg(to_jsonb(sg)),'[]') from public.student_guardians sg where public.has_sis_permission_for_school('student.import',j.organization_id,j.school_id) and public.has_sis_permission_for_school('guardian.import',j.organization_id,j.school_id) and sg.organization_id=j.organization_id and (
    sg.student_id in (select s.id from public.students s left join public.sis_import_entity_refs r on r.student_id=s.id and r.organization_id=s.organization_id where s.organization_id=j.organization_id and ((r.entity_type='student' and lower(r.external_ref)=any(coalesce(p_student_refs,array[]::text[]))) or s.nisn=any(coalesce(p_student_nisns,array[]::text[]))) and (public.has_permission('student.import',j.organization_id,null) or exists(select 1 from public.student_enrollments ase where ase.student_id=s.id and ase.school_id=j.school_id)))
    or sg.guardian_id in (select g.id from public.guardians g join public.sis_import_entity_refs r on r.guardian_id=g.id and r.organization_id=g.organization_id where g.organization_id=j.organization_id and r.entity_type='guardian' and lower(r.external_ref)=any(coalesce(p_guardian_refs,array[]::text[])) and exists(select 1 from public.student_guardians ag join public.student_enrollments ase on ase.student_id=ag.student_id where ag.guardian_id=g.id and ase.school_id=j.school_id))
  )),
  'studentEnrollments',(select coalesce(jsonb_agg(to_jsonb(se)),'[]') from public.student_enrollments se where public.has_sis_permission_for_school('student.import',j.organization_id,j.school_id) and public.has_sis_permission_for_school('enrollment.import',j.organization_id,j.school_id) and se.school_id=j.school_id and se.student_id in (select s.id from public.students s left join public.sis_import_entity_refs r on r.student_id=s.id and r.organization_id=s.organization_id where s.organization_id=j.organization_id and ((r.entity_type='student' and lower(r.external_ref)=any(coalesce(p_student_refs,array[]::text[]))) or s.nisn=any(coalesce(p_student_nisns,array[]::text[]))) and (public.has_permission('student.import',j.organization_id,null) or exists(select 1 from public.student_enrollments ase where ase.student_id=s.id and ase.school_id=j.school_id)))),
  'classEnrollments',(select coalesce(jsonb_agg(to_jsonb(ce)),'[]') from public.class_enrollments ce join public.student_enrollments se on se.id=ce.student_enrollment_id where public.has_sis_permission_for_school('student.import',j.organization_id,j.school_id) and public.has_sis_permission_for_school('enrollment.import',j.organization_id,j.school_id) and public.has_sis_permission_for_school('class_enrollment.import',j.organization_id,j.school_id) and ce.school_id=j.school_id and se.student_id in (select s.id from public.students s left join public.sis_import_entity_refs r on r.student_id=s.id and r.organization_id=s.organization_id where s.organization_id=j.organization_id and ((r.entity_type='student' and lower(r.external_ref)=any(coalesce(p_student_refs,array[]::text[]))) or s.nisn=any(coalesce(p_student_nisns,array[]::text[]))) and (public.has_permission('student.import',j.organization_id,null) or exists(select 1 from public.student_enrollments ase where ase.student_id=s.id and ase.school_id=j.school_id)))),
  'staffSchoolAssignments',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.staff_school_assignments a where public.has_sis_permission_for_school('staff.import',j.organization_id,j.school_id) and public.has_sis_permission_for_school('staff_school_assignment.import',j.organization_id,j.school_id) and a.school_id=j.school_id and (a.employee_number=any(coalesce(p_employee_numbers,array[]::text[])) or a.staff_member_id in (select sm.id from public.staff_members sm left join public.sis_import_entity_refs r on r.staff_member_id=sm.id and r.organization_id=sm.organization_id where sm.organization_id=j.organization_id and r.entity_type='staff' and lower(r.external_ref)=any(coalesce(p_staff_refs,array[]::text[])) and (public.has_permission('staff.import',j.organization_id,null) or exists(select 1 from public.staff_school_assignments aa where aa.staff_member_id=sm.id and aa.school_id=j.school_id)))))
 );
end $$;
revoke all on function public.get_sis_import_validation_snapshot(uuid,text[],text[],text[],text[],text[]) from public,anon,service_role;
grant execute on function public.get_sis_import_validation_snapshot(uuid,text[],text[],text[],text[],text[]) to authenticated;

-- Export is read-only. Missing refs are reported, never minted.
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
  select 'student' kind from public.student_enrollments se join public.students st on st.id=se.student_id left join public.sis_import_entity_refs r on r.student_id=st.id where se.school_id=s.id and r.id is null
  union all select 'guardian' from public.student_enrollments se join public.student_guardians sg on sg.student_id=se.student_id join public.guardians g on g.id=sg.guardian_id left join public.sis_import_entity_refs r on r.guardian_id=g.id where se.school_id=s.id and r.id is null
  union all select 'staff' from public.staff_school_assignments a join public.staff_members sm on sm.id=a.staff_member_id left join public.sis_import_entity_refs r on r.staff_member_id=sm.id where a.school_id=s.id and r.id is null
 ) x;
 if (missing->>'students')::int+(missing->>'guardians')::int+(missing->>'staff')::int>0 then
   return jsonb_build_object('ready',false,'missingRefs',missing);
 end if;
 return jsonb_build_object('ready',true,'missingRefs',missing,'schoolCode',s.code,
  'Students',(select coalesce(jsonb_agg(jsonb_build_object('student_ref',r.external_ref,'nisn',st.nisn,'full_name',st.full_name,'preferred_name',st.preferred_name,'gender',st.gender,'birth_date',st.birth_date,'birth_place',st.birth_place,'status',st.status)),'[]') from public.student_enrollments se join public.students st on st.id=se.student_id join public.sis_import_entity_refs r on r.student_id=st.id where se.school_id=s.id),
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

-- Finalize direct read policies: empty jobs use the complete any-import
-- capability set; populated jobs require every permission derived from their
-- persisted entity types.
drop policy if exists sis_import_jobs_select on public.sis_import_jobs;
create policy sis_import_jobs_select on public.sis_import_jobs for select to authenticated using (
  public.can_read_sis_import_job(id)
);

-- Storage RLS needs authenticated-callable predicates. Keep the generic
-- permission helper internal and expose only object-specific boolean checks.
create or replace function public.can_insert_sis_import_storage_object(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.sis_import_jobs j
    where p_name=j.organization_id::text||'/'||j.school_id::text||'/sis-imports/'||j.id::text||'/source.xlsx'
      and j.status='uploaded'
      and j.source_file_asset_id is null
      and j.created_by_profile_id=auth.uid()
      and public.has_any_sis_import_permission_for_school(j.organization_id,j.school_id)
  )
$$;
revoke all on function public.can_insert_sis_import_storage_object(text) from public,anon,service_role;
grant execute on function public.can_insert_sis_import_storage_object(text) to authenticated;

create or replace function public.can_select_sis_import_storage_object(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.sis_import_jobs j
    join public.file_assets fa
      on fa.id=j.source_file_asset_id
     and fa.organization_id=j.organization_id
     and fa.school_id=j.school_id
    where fa.bucket='sis-imports'
      and fa.object_path=p_name
      and p_name=j.organization_id::text||'/'||j.school_id::text||'/sis-imports/'||j.id::text||'/source.xlsx'
      and public.can_read_sis_import_job(j.id)
  )
$$;
revoke all on function public.can_select_sis_import_storage_object(text) from public,anon,service_role;
grant execute on function public.can_select_sis_import_storage_object(text) to authenticated;

-- Exact object authorization: path knowledge is never sufficient.
create policy sis_import_objects_insert on storage.objects for insert to authenticated
with check(bucket_id='sis-imports' and public.can_insert_sis_import_storage_object(name));
create policy sis_import_objects_select on storage.objects for select to authenticated
using(bucket_id='sis-imports' and public.can_select_sis_import_storage_object(name));
create policy sis_import_orphan_objects_delete on storage.objects for delete to authenticated
using(bucket_id='sis-imports' and exists(select 1 from public.sis_import_jobs j where name=j.organization_id::text||'/'||j.school_id::text||'/sis-imports/'||j.id::text||'/source.xlsx' and j.created_by_profile_id=auth.uid() and j.status in ('uploaded','failed') and not exists(select 1 from public.file_assets fa where fa.bucket='sis-imports' and fa.object_path=name)));

update storage.buckets set public=false,file_size_limit=10485760,allowed_mime_types=array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] where id='sis-imports';
commit;
