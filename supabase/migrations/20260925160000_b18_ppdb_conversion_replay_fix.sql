-- Forward-only fix: resolve completed conversion request replay before the
-- already-converted state guard.
create or replace function public.b18_convert_admission_application(p_application_id uuid,p_expected_row_version bigint,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_app record; v_existing record; v_guardian record; v_fingerprint text; v_result jsonb; v_student uuid; v_guardian_id uuid; v_enrollment uuid; v_conversion uuid; v_guardian_count integer:=0;
begin
 select app.*,cyc.status as cycle_status,cyc.academic_year_id as cycle_academic_year_id,cyc.name as cycle_name,yr.status as year_status into v_app from public.admission_applications app join public.admission_cycles cyc on cyc.id=app.admission_cycle_id and cyc.organization_id=app.organization_id and cyc.school_id=app.school_id join public.academic_years yr on yr.id=app.target_academic_year_id and yr.organization_id=app.organization_id and yr.school_id=app.school_id where app.id=p_application_id for update;
 if not found then raise exception 'B18_ADMISSION_NOT_FOUND'; end if;
 if not public.has_permission('admission.convert',v_app.organization_id,v_app.school_id) then raise exception 'B18_ADMISSION_FORBIDDEN'; end if;
 v_fingerprint:=md5(concat(p_application_id::text,'|',p_expected_row_version,'|convert_application'));
 select status,semantic_fingerprint,result_payload into v_existing from public.admission_command_requests where request_id=p_request_id for update;
 if found then if v_existing.semantic_fingerprint<>v_fingerprint then raise exception 'B18_ADMISSION_REQUEST_CONFLICT'; elsif v_existing.status='completed' then return v_existing.result_payload; else raise exception 'B18_ADMISSION_REQUEST_CONFLICT'; end if; end if;
 if v_app.status='converted' then raise exception 'B18_ADMISSION_ALREADY_CONVERTED'; end if;
 if v_app.status<>'accepted' then raise exception 'B18_ADMISSION_INVALID_STATE'; end if;
 if v_app.year_status in ('closed','archived') then raise exception 'B18_ADMISSION_PERIOD_CLOSED'; end if;
 if v_app.row_version<>p_expected_row_version then raise exception 'B18_ADMISSION_STALE_VERSION'; end if;
 insert into public.admission_command_requests(actor_kind,actor_profile_id,organization_id,school_id,command,request_id,semantic_fingerprint,status) values('staff',auth.uid(),v_app.organization_id,v_app.school_id,'convert_application',p_request_id,v_fingerprint,'started');
 if v_app.applicant_nisn is not null and exists(select 1 from public.students st where st.organization_id=v_app.organization_id and st.nisn=v_app.applicant_nisn) then raise exception 'B18_ADMISSION_POSSIBLE_DUPLICATE'; end if;
 if not exists(select 1 from public.admission_application_guardians ag where ag.application_id=v_app.id) then raise exception 'B18_ADMISSION_VALIDATION_FAILED'; end if;
 insert into public.students(organization_id,nisn,full_name,preferred_name,gender,birth_date,birth_place,status) values(v_app.organization_id,v_app.applicant_nisn,v_app.applicant_full_name,v_app.applicant_preferred_name,v_app.applicant_gender,v_app.applicant_birth_date,v_app.applicant_birth_place,'active') returning id into v_student;
 for v_guardian in select * from public.admission_application_guardians ag where ag.application_id=v_app.id order by ag.is_primary desc,ag.created_at loop
   insert into public.guardians(organization_id,full_name,phone,email,status) values(v_app.organization_id,v_guardian.full_name,v_guardian.phone,v_guardian.email,'active') returning id into v_guardian_id;
   insert into public.student_guardians(organization_id,student_id,guardian_id,relationship_type,is_primary,status) values(v_app.organization_id,v_student,v_guardian_id,v_guardian.relationship,v_guardian.is_primary,'active'); v_guardian_count:=v_guardian_count+1;
 end loop;
 insert into public.student_enrollments(organization_id,school_id,student_id,academic_year_id,grade_level_id,status,enrolled_on) values(v_app.organization_id,v_app.school_id,v_student,v_app.target_academic_year_id,v_app.target_grade_level_id,'draft',current_date) returning id into v_enrollment;
 insert into public.admission_conversions(organization_id,school_id,application_id,student_id,student_enrollment_id,converted_by_profile_id,request_id) values(v_app.organization_id,v_app.school_id,v_app.id,v_student,v_enrollment,auth.uid(),p_request_id) returning id into v_conversion;
 update public.admission_applications set status='converted' where id=v_app.id and row_version=p_expected_row_version;
 insert into public.admission_stage_history(organization_id,school_id,application_id,from_status,to_status,actor_kind,actor_profile_id,request_id) values(v_app.organization_id,v_app.school_id,v_app.id,'accepted','converted','staff',auth.uid(),p_request_id);
 v_result:=jsonb_build_object('application_id',v_app.id,'student_id',v_student,'student_enrollment_id',v_enrollment,'conversion_id',v_conversion,'status','converted','guardian_count',v_guardian_count);
 update public.admission_command_requests set status='completed',completed_at=now(),result_payload=v_result where request_id=p_request_id;
 insert into public.audit_logs(organization_id,school_id,actor_profile_id,actor_type,action,entity_type,entity_id,before_data,after_data,metadata) values(v_app.organization_id,v_app.school_id,auth.uid(),'user','convert_application','admission_application',v_app.id,jsonb_build_object('status','accepted'),jsonb_build_object('status','converted'),jsonb_build_object('request_id',p_request_id,'student_id',v_student,'student_enrollment_id',v_enrollment,'guardian_count',v_guardian_count));
 return v_result;
end; $$;
