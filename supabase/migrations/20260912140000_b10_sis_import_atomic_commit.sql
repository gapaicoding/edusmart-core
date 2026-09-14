-- Batch 10 Phase 3B: authoritative, atomic SIS import commit.
begin;

-- `match_key` is part of the Phase-3A HMAC-attested canonical row payload.
-- Phase 3C must persist it as { identity: <LogicalEntityHandle>, expectedState:
-- <authoritative validation snapshot> }.  Keeping the snapshot derived from
-- the attested value avoids a second, unattested execution instruction.
alter table public.sis_import_job_rows
  add column expected_state jsonb generated always as (match_key -> 'expectedState') stored;

comment on column public.sis_import_job_rows.expected_state is
  'Phase-3B stale-state snapshot, derived solely from the HMAC-attested match_key.expectedState payload.';

create or replace function public.hash_sis_confirmation_token(
  p_job_id uuid,
  p_preview_version integer,
  p_normalized_plan_fingerprint text,
  p_token text
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select encode(extensions.digest(
    p_job_id::text || ':' || p_preview_version::text || ':' ||
    p_normalized_plan_fingerprint || ':' || p_token, 'sha256'), 'hex');
$$;

revoke all on function public.hash_sis_confirmation_token(uuid, integer, text, text)
  from public, anon, authenticated, service_role;

-- Phase 3A is already reviewed and remains an earlier pending migration. Make
-- its final installed persistence definition use the authoritative Phase-3B
-- helper without rewriting 130000. This is a bounded, exact source rewrite:
-- fail the migration if the reviewed Phase-3A call site no longer matches.
do $$
declare
  v_old text := 'public.hash_sis_confirmation_token(v_job.id::text || '':'' || v_new_version::text || '':'' || v_token)';
  v_new text := 'public.hash_sis_confirmation_token(v_job.id, v_new_version, p_normalized_plan_fingerprint, v_token)';
  v_definition text;
begin
  select pg_get_functiondef(
    'public.persist_sis_import_validation(uuid,integer,text,text,text,text,bigint,text)'::regprocedure
  ) into v_definition;
  if position(v_old in v_definition) = 0 then
    raise exception 'B10 Phase 3B token convergence: Phase-3A issuance call site changed';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end;
$$;

-- There is one final helper signature. No overload can accidentally retain
-- or select the pre-Phase-3B job/version/token-only formula.
drop function public.hash_sis_confirmation_token(text);

create or replace function public.commit_sis_import_job(
  p_job_id uuid,
  p_confirmation_token text
)
returns table (job_id uuid, status text, totals jsonb, failure_summary text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.sis_import_jobs;
  v_types text[];
  v_row public.sis_import_job_rows;
  v_n jsonb;
  v_h jsonb;
  v_expected jsonb;
  v_current jsonb;
  v_id uuid;
  v_parent uuid;
  v_student uuid;
  v_guardian uuid;
  v_staff uuid;
  v_ay uuid;
  v_grade uuid;
  v_classroom uuid;
  v_school_code text;
  v_map jsonb := '{}'::jsonb;
  v_failure text;
  v_created integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_skipped integer := 0;
  v_warnings integer := 0;
begin
  if v_actor is null then raise exception 'B10_AUTHORIZATION_DENIED'; end if;

  select * into v_job
  from public.sis_import_jobs j
  where j.id = p_job_id
  for update;
  if not found then raise exception 'B10_JOB_NOT_FOUND'; end if;

  select coalesce(array_agg(distinct r.entity_type), array[]::text[])
  into v_types from public.sis_import_job_rows r where r.import_job_id = v_job.id;
  perform public.assert_sis_import_permissions_for_entities(
    v_job.organization_id, v_job.school_id, v_types);

  -- Idempotent return is deliberately after current authorization and before
  -- token validation. A completed job can never re-enter domain execution.
  if v_job.status = 'completed' then
    return query select v_job.id, v_job.status, v_job.totals, v_job.failure_summary;
    return;
  elsif v_job.status = 'importing' then
    raise exception 'B10_CONFIRM_ALREADY_PROCESSING';
  elsif v_job.status <> 'validated' then
    raise exception 'B10_JOB_STATE_CONFLICT';
  end if;

  if v_job.confirmation_token_hash is null
     or v_job.normalized_plan_fingerprint is null
     or p_confirmation_token is null
     or public.hash_sis_confirmation_token(v_job.id, v_job.preview_version,
          v_job.normalized_plan_fingerprint, p_confirmation_token)
        <> v_job.confirmation_token_hash then
    raise exception 'B10_CONFIRMATION_TOKEN_INVALID';
  end if;

  if exists (select 1 from public.sis_import_job_rows r
             where r.import_job_id=v_job.id and r.action='error')
     or exists (select 1 from public.sis_import_job_issues i
                join public.sis_import_job_rows r on r.id=i.import_job_row_id
                where r.import_job_id=v_job.id and i.severity='error') then
    raise exception 'B10_IMPORT_HAS_ERRORS';
  end if;

  select s.code into v_school_code from public.schools s
  where s.id=v_job.school_id and s.organization_id=v_job.organization_id;
  if not found then raise exception 'B10_STALE_PREVIEW'; end if;

  update public.sis_import_jobs set status='importing', confirmed_at=now(),
    confirmation_token_hash=null, failure_summary=null where id=v_job.id;

  -- Every SIS/domain/ref/result mutation is in this exception block. PL/pgSQL
  -- establishes a savepoint; a caught exception rolls the whole block back.
  begin
    -- Base identities first: Staff, Students, Guardians.
    for v_row in select r.* from public.sis_import_job_rows r
      where r.import_job_id=v_job.id and r.entity_type='staff' and r.action not in ('skip','error')
      order by r.sheet_name,r.row_number
    loop
      v_n:=v_row.normalized_data; v_h:=coalesce(v_row.match_key->'identity',v_row.match_key);
      v_expected:=v_row.expected_state;
      if v_row.action in ('update','unchanged') and v_expected is null then raise exception 'B10_STALE_PREVIEW'; end if;
      select r.staff_member_id into v_id from public.sis_import_entity_refs r
       where r.organization_id=v_job.organization_id and r.entity_type='staff'
         and lower(r.external_ref)=lower(v_n->>'staff_ref');
      if v_row.action='create' then
        if v_id is not null or exists(select 1 from public.staff_school_assignments a
          where a.school_id=v_job.school_id and a.employee_number=v_n->>'employee_number'
            and v_n->>'employee_number' is not null and a.status<>'archived') then
          raise exception 'B10_STAFF_IDENTITY_CONFLICT';
        end if;
        insert into public.staff_members(organization_id,full_name,staff_kind,status)
        values(v_job.organization_id,v_n->>'full_name',v_n->>'staff_kind',coalesce(v_n->>'status','active'))
        returning id into v_id;
        perform public.mint_sis_entity_ref(v_job.organization_id,'staff',v_n->>'staff_ref',
          p_staff_member_id:=v_id,p_created_by_import_job_id:=v_job.id);
        v_created:=v_created+1;
      else
        if v_id is null and v_row.resolved_entity_id is not null then
          if not exists(select 1 from public.staff_members s where s.id=v_row.resolved_entity_id and s.organization_id=v_job.organization_id)
             or (v_n->>'employee_number' is not null and not exists(select 1 from public.staff_school_assignments a
                 where a.school_id=v_job.school_id and a.staff_member_id=v_row.resolved_entity_id
                   and a.employee_number=v_n->>'employee_number')) then raise exception 'B10_STAFF_IDENTITY_CONFLICT'; end if;
          v_id:=v_row.resolved_entity_id;
          perform public.mint_sis_entity_ref(v_job.organization_id,'staff',v_n->>'staff_ref',
            p_staff_member_id:=v_id,p_created_by_import_job_id:=v_job.id);
        end if;
        if v_id is distinct from v_row.resolved_entity_id then raise exception 'B10_STAFF_IDENTITY_CONFLICT'; end if;
        select jsonb_build_object('full_name',s.full_name,'staff_kind',s.staff_kind,'status',s.status)
          into v_current from public.staff_members s where s.id=v_id and s.organization_id=v_job.organization_id;
        if v_current is distinct from v_expected then raise exception 'B10_STALE_PREVIEW'; end if;
        if v_row.action='update' then update public.staff_members set full_name=v_n->>'full_name',
          staff_kind=v_n->>'staff_kind',status=v_n->>'status' where id=v_id; v_updated:=v_updated+1;
        else v_unchanged:=v_unchanged+1; end if;
      end if;
      v_map:=v_map||jsonb_build_object('staff:'||lower(v_n->>'staff_ref'),v_id::text);
      update public.sis_import_job_rows set resolved_entity_id=v_id where id=v_row.id;
    end loop;

    for v_row in select r.* from public.sis_import_job_rows r
      where r.import_job_id=v_job.id and r.entity_type='student' and r.action not in ('skip','error') order by r.sheet_name,r.row_number
    loop
      v_n:=v_row.normalized_data; v_expected:=v_row.expected_state;
      if v_row.action in ('update','unchanged') and v_expected is null then raise exception 'B10_STALE_PREVIEW'; end if;
      select r.student_id into v_id from public.sis_import_entity_refs r where r.organization_id=v_job.organization_id
       and r.entity_type='student' and lower(r.external_ref)=lower(v_n->>'student_ref');
      if v_row.action='create' then
        if v_id is not null or exists(select 1 from public.students s where s.organization_id=v_job.organization_id
           and s.nisn=v_n->>'nisn' and v_n->>'nisn' is not null) then raise exception 'B10_STUDENT_IDENTITY_CONFLICT'; end if;
        insert into public.students(organization_id,nisn,full_name,preferred_name,gender,birth_date,birth_place,status)
        values(v_job.organization_id,nullif(v_n->>'nisn',''),v_n->>'full_name',nullif(v_n->>'preferred_name',''),
          nullif(v_n->>'gender',''),nullif(v_n->>'birth_date','')::date,nullif(v_n->>'birth_place',''),coalesce(v_n->>'status','active'))
        returning id into v_id;
        perform public.mint_sis_entity_ref(v_job.organization_id,'student',v_n->>'student_ref',
          p_student_id:=v_id,p_created_by_import_job_id:=v_job.id); v_created:=v_created+1;
      else
        if v_id is null and v_row.resolved_entity_id is not null then
          if not exists(select 1 from public.students s where s.id=v_row.resolved_entity_id and s.organization_id=v_job.organization_id
            and (v_n->>'nisn' is null or s.nisn=v_n->>'nisn')) then raise exception 'B10_STUDENT_IDENTITY_CONFLICT'; end if;
          v_id:=v_row.resolved_entity_id;
          perform public.mint_sis_entity_ref(v_job.organization_id,'student',v_n->>'student_ref',
            p_student_id:=v_id,p_created_by_import_job_id:=v_job.id);
        end if;
        if v_id is distinct from v_row.resolved_entity_id then raise exception 'B10_STUDENT_IDENTITY_CONFLICT'; end if;
        select jsonb_build_object('nisn',s.nisn,'full_name',s.full_name,'preferred_name',s.preferred_name,
          'gender',s.gender,'birth_date',s.birth_date,'birth_place',s.birth_place,'status',s.status)
          into v_current from public.students s where s.id=v_id and s.organization_id=v_job.organization_id;
        if v_current is distinct from v_expected then raise exception 'B10_STALE_PREVIEW'; end if;
        if v_row.action='update' then
          if (v_current->>'nisn') is not null and nullif(v_n->>'nisn','') is distinct from v_current->>'nisn'
            then raise exception 'B10_STUDENT_IDENTITY_CONFLICT'; end if;
          update public.students set nisn=coalesce(nisn,nullif(v_n->>'nisn','')),full_name=v_n->>'full_name',
            preferred_name=nullif(v_n->>'preferred_name',''),gender=nullif(v_n->>'gender',''),
            birth_date=nullif(v_n->>'birth_date','')::date,birth_place=nullif(v_n->>'birth_place',''),status=v_n->>'status' where id=v_id;
          v_updated:=v_updated+1; else v_unchanged:=v_unchanged+1; end if;
      end if;
      v_map:=v_map||jsonb_build_object('student:'||lower(v_n->>'student_ref'),v_id::text);
      update public.sis_import_job_rows set resolved_entity_id=v_id where id=v_row.id;
    end loop;

    for v_row in select r.* from public.sis_import_job_rows r where r.import_job_id=v_job.id
      and r.entity_type='guardian' and r.action not in ('skip','error') order by r.sheet_name,r.row_number
    loop
      v_n:=v_row.normalized_data; v_expected:=v_row.expected_state;
      if v_row.action in ('update','unchanged') and v_expected is null then raise exception 'B10_STALE_PREVIEW'; end if;
      select r.guardian_id into v_id from public.sis_import_entity_refs r where r.organization_id=v_job.organization_id
        and r.entity_type='guardian' and lower(r.external_ref)=lower(v_n->>'guardian_ref');
      if v_row.action='create' then
        if v_id is not null then raise exception 'B10_EXTERNAL_REF_CONFLICT'; end if;
        insert into public.guardians(organization_id,full_name,phone,email,occupation,status)
        values(v_job.organization_id,v_n->>'full_name',nullif(v_n->>'phone',''),nullif(v_n->>'email',''),
          nullif(v_n->>'occupation',''),coalesce(v_n->>'status','active')) returning id into v_id;
        perform public.mint_sis_entity_ref(v_job.organization_id,'guardian',v_n->>'guardian_ref',
          p_guardian_id:=v_id,p_created_by_import_job_id:=v_job.id); v_created:=v_created+1;
      else
        if v_id is distinct from v_row.resolved_entity_id then raise exception 'B10_EXTERNAL_REF_CONFLICT'; end if;
        select jsonb_build_object('full_name',g.full_name,'phone',g.phone,'email',g.email,'occupation',g.occupation,'status',g.status)
          into v_current from public.guardians g where g.id=v_id and g.organization_id=v_job.organization_id;
        if v_current is distinct from v_expected then raise exception 'B10_STALE_PREVIEW'; end if;
        if v_row.action='update' then update public.guardians set full_name=v_n->>'full_name',phone=nullif(v_n->>'phone',''),
          email=nullif(v_n->>'email',''),occupation=nullif(v_n->>'occupation',''),status=v_n->>'status' where id=v_id;
          v_updated:=v_updated+1; else v_unchanged:=v_unchanged+1; end if;
      end if;
      v_map:=v_map||jsonb_build_object('guardian:'||lower(v_n->>'guardian_ref'),v_id::text);
      update public.sis_import_job_rows set resolved_entity_id=v_id where id=v_row.id;
    end loop;

    -- Dependents in the frozen order.
    for v_row in select r.* from public.sis_import_job_rows r where r.import_job_id=v_job.id
      and r.entity_type='staff_school_assignment' and r.action not in ('skip','error') order by r.sheet_name,r.row_number
    loop
      v_n:=v_row.normalized_data; v_h:=coalesce(v_row.match_key->'identity',v_row.match_key); v_expected:=v_row.expected_state;
      if lower(v_n->>'school_code')<>lower(v_school_code) then raise exception 'B10_STALE_PREVIEW'; end if;
      v_staff:=case when v_h->>'kind'='existing' then (v_h->>'id')::uuid
        else coalesce((v_map->>('staff:'||lower(v_h->>'ref')))::uuid,
          (select r.staff_member_id from public.sis_import_entity_refs r
           where r.organization_id=v_job.organization_id and r.entity_type='staff'
             and lower(r.external_ref)=lower(v_h->>'ref'))) end;
      select a.id into v_id from public.staff_school_assignments a where a.school_id=v_job.school_id and
        ((v_n->>'employee_number' is not null and a.employee_number=v_n->>'employee_number') or
         (v_n->>'employee_number' is null and a.staff_member_id=v_staff)) and a.status<>'archived';
      if v_row.action='create' then
        if v_id is not null or exists(select 1 from public.staff_school_assignments a where a.school_id=v_job.school_id
          and a.staff_member_id=v_staff and a.status='active') then raise exception 'B10_STAFF_IDENTITY_CONFLICT'; end if;
        insert into public.staff_school_assignments(organization_id,school_id,staff_member_id,employee_number,
          position_title,employment_status,joined_on,left_on,status)
        values(v_job.organization_id,v_job.school_id,v_staff,nullif(v_n->>'employee_number',''),nullif(v_n->>'position_title',''),
          coalesce(v_n->>'employment_status','active'),nullif(v_n->>'joined_on','')::date,nullif(v_n->>'left_on','')::date,
          coalesce(v_n->>'status','active')) returning id into v_id; v_created:=v_created+1;
      else
        if v_id is distinct from v_row.resolved_entity_id or v_expected is null then raise exception 'B10_STALE_PREVIEW'; end if;
        select jsonb_build_object('staff_member_id',a.staff_member_id,'employee_number',a.employee_number,'position_title',a.position_title,
          'employment_status',a.employment_status,'joined_on',a.joined_on,'left_on',a.left_on,'status',a.status)
          into v_current from public.staff_school_assignments a where a.id=v_id;
        if v_current is distinct from v_expected then raise exception 'B10_STALE_PREVIEW'; end if;
        if v_row.action='update' then update public.staff_school_assignments set position_title=nullif(v_n->>'position_title',''),
          employment_status=v_n->>'employment_status',joined_on=nullif(v_n->>'joined_on','')::date,
          left_on=nullif(v_n->>'left_on','')::date,status=v_n->>'status' where id=v_id; v_updated:=v_updated+1;
        else v_unchanged:=v_unchanged+1; end if;
      end if;
      update public.sis_import_job_rows set resolved_entity_id=v_id where id=v_row.id;
    end loop;

    for v_row in select r.* from public.sis_import_job_rows r where r.import_job_id=v_job.id
      and r.entity_type='student_guardian' and r.action not in ('skip','error') order by r.sheet_name,r.row_number
    loop
      v_n:=v_row.normalized_data;
      v_student:=coalesce((v_map->>('student:'||lower(v_n->>'student_ref_or_nisn')))::uuid,
        (select r.student_id from public.sis_import_entity_refs r where r.organization_id=v_job.organization_id
          and r.entity_type='student' and lower(r.external_ref)=lower(v_n->>'student_ref_or_nisn')),
        (select s.id from public.students s where s.organization_id=v_job.organization_id and s.nisn=v_n->>'student_ref_or_nisn'));
      v_guardian:=coalesce((v_map->>('guardian:'||lower(v_n->>'guardian_ref')))::uuid,
        (select r.guardian_id from public.sis_import_entity_refs r where r.organization_id=v_job.organization_id
          and r.entity_type='guardian' and lower(r.external_ref)=lower(v_n->>'guardian_ref')));
      select sg.id into v_id from public.student_guardians sg where sg.student_id=v_student and sg.guardian_id=v_guardian;
      if v_row.action='create' then if v_id is not null then raise exception 'B10_STALE_PREVIEW'; end if;
        insert into public.student_guardians(organization_id,student_id,guardian_id,relationship_type,is_primary,
          can_view_academic,can_view_attendance,can_receive_notification,can_manage_permissions,status)
        values(v_job.organization_id,v_student,v_guardian,v_n->>'relationship_type',(v_n->>'is_primary')::boolean,
          (v_n->>'can_view_academic')::boolean,(v_n->>'can_view_attendance')::boolean,
          (v_n->>'can_receive_notification')::boolean,(v_n->>'can_manage_permissions')::boolean,coalesce(v_n->>'status','active'))
        returning id into v_id; v_created:=v_created+1;
      else if v_id is null or v_row.expected_state is null then raise exception 'B10_STALE_PREVIEW'; end if;
        select jsonb_build_object('relationship_type',sg.relationship_type,'is_primary',sg.is_primary,'can_view_academic',sg.can_view_academic,
          'can_view_attendance',sg.can_view_attendance,'can_receive_notification',sg.can_receive_notification,
          'can_manage_permissions',sg.can_manage_permissions,'status',sg.status) into v_current from public.student_guardians sg where sg.id=v_id;
        if v_current is distinct from v_row.expected_state then raise exception 'B10_STALE_PREVIEW'; end if;
        if v_row.action='update' then update public.student_guardians set relationship_type=v_n->>'relationship_type',is_primary=(v_n->>'is_primary')::boolean,
          can_view_academic=(v_n->>'can_view_academic')::boolean,can_view_attendance=(v_n->>'can_view_attendance')::boolean,
          can_receive_notification=(v_n->>'can_receive_notification')::boolean,can_manage_permissions=(v_n->>'can_manage_permissions')::boolean,
          status=v_n->>'status' where id=v_id; v_updated:=v_updated+1; else v_unchanged:=v_unchanged+1; end if;
      end if; update public.sis_import_job_rows set resolved_entity_id=v_id where id=v_row.id;
    end loop;

    for v_row in select r.* from public.sis_import_job_rows r where r.import_job_id=v_job.id
      and r.entity_type='student_enrollment' and r.action not in ('skip','error') order by r.sheet_name,r.row_number
    loop
      v_n:=v_row.normalized_data;
      if lower(v_n->>'school_code')<>lower(v_school_code) then raise exception 'B10_STALE_PREVIEW'; end if;
      v_student:=coalesce((v_map->>('student:'||lower(v_n->>'student_ref_or_nisn')))::uuid,
        (select r.student_id from public.sis_import_entity_refs r where r.organization_id=v_job.organization_id
          and r.entity_type='student' and lower(r.external_ref)=lower(v_n->>'student_ref_or_nisn')),
        (select s.id from public.students s where s.organization_id=v_job.organization_id and s.nisn=v_n->>'student_ref_or_nisn'));
      select ay.id into v_ay from public.academic_years ay where ay.school_id=v_job.school_id and ay.organization_id=v_job.organization_id
        and ay.code=v_n->>'academic_year_code' and ay.status in ('active','draft');
      select gl.id into v_grade from public.grade_levels gl where gl.school_id=v_job.school_id and gl.organization_id=v_job.organization_id
        and gl.code=v_n->>'grade_level_code' and gl.is_active;
      if v_ay is null or v_grade is null then raise exception 'B10_STALE_PREVIEW'; end if;
      select se.id into v_id from public.student_enrollments se where se.student_id=v_student and se.school_id=v_job.school_id and se.academic_year_id=v_ay;
      if v_row.action='create' then if v_id is not null then raise exception 'B10_STALE_PREVIEW'; end if;
        insert into public.student_enrollments(organization_id,school_id,student_id,academic_year_id,grade_level_id,
          student_number,enrollment_number,status,enrolled_on,ended_on)
        values(v_job.organization_id,v_job.school_id,v_student,v_ay,v_grade,nullif(v_n->>'student_number',''),
          nullif(v_n->>'enrollment_number',''),coalesce(v_n->>'status','draft'),(v_n->>'enrolled_on')::date,
          nullif(v_n->>'ended_on','')::date) returning id into v_id; v_created:=v_created+1;
      else if v_id is distinct from v_row.resolved_entity_id or v_row.expected_state is null then raise exception 'B10_STALE_PREVIEW'; end if;
        select jsonb_build_object('student_id',se.student_id,'school_id',se.school_id,'academic_year_id',se.academic_year_id,
          'grade_level_id',se.grade_level_id,'student_number',se.student_number,'enrollment_number',se.enrollment_number,
          'status',se.status,'enrolled_on',se.enrolled_on,'ended_on',se.ended_on) into v_current from public.student_enrollments se where se.id=v_id;
        if v_current is distinct from v_row.expected_state then raise exception 'B10_STALE_PREVIEW'; end if;
        if v_row.action='update' then update public.student_enrollments set student_number=nullif(v_n->>'student_number',''),
          enrollment_number=nullif(v_n->>'enrollment_number',''),status=v_n->>'status',ended_on=nullif(v_n->>'ended_on','')::date where id=v_id;
          v_updated:=v_updated+1; else v_unchanged:=v_unchanged+1; end if;
      end if;
      v_map:=v_map||jsonb_build_object('enrollment:'||v_row.sheet_name||':'||v_row.row_number,v_id::text);
      update public.sis_import_job_rows set resolved_entity_id=v_id where id=v_row.id;
    end loop;

    for v_row in select r.* from public.sis_import_job_rows r where r.import_job_id=v_job.id
      and r.entity_type='class_enrollment' and r.action not in ('skip','error') order by r.sheet_name,r.row_number
    loop
      v_n:=v_row.normalized_data; v_h:=coalesce(v_row.match_key->'identity',v_row.match_key);
      if lower(v_n->>'school_code')<>lower(v_school_code) then raise exception 'B10_STALE_PREVIEW'; end if;
      v_parent:=case when v_h->>'kind'='existing' then (v_h->>'id')::uuid
        else (v_map->>('enrollment:'||(v_h->>'sheet')||':'||(v_h->>'rowNumber')))::uuid end;
      select c.id into v_classroom from public.classrooms c join public.student_enrollments se on se.id=v_parent
       where c.school_id=v_job.school_id and c.organization_id=v_job.organization_id and c.code=v_n->>'classroom_code'
         and c.academic_year_id=se.academic_year_id and c.grade_level_id=se.grade_level_id and c.status='active';
      if v_classroom is null then raise exception 'B10_AY_GRADE_MISMATCH'; end if;
      select ce.id into v_id from public.class_enrollments ce where ce.student_enrollment_id=v_parent
        and ce.classroom_id=v_classroom and ce.starts_on=(v_n->>'starts_on')::date;
      if v_row.action='create' then if v_id is not null then raise exception 'B10_STALE_PREVIEW'; end if;
        insert into public.class_enrollments(organization_id,school_id,student_enrollment_id,classroom_id,starts_on,ends_on,is_primary,status)
        values(v_job.organization_id,v_job.school_id,v_parent,v_classroom,(v_n->>'starts_on')::date,
          nullif(v_n->>'ends_on','')::date,(v_n->>'is_primary')::boolean,coalesce(v_n->>'status','active')) returning id into v_id; v_created:=v_created+1;
      else if v_id is distinct from v_row.resolved_entity_id or v_row.expected_state is null then raise exception 'B10_STALE_PREVIEW'; end if;
        select jsonb_build_object('student_enrollment_id',ce.student_enrollment_id,'classroom_id',ce.classroom_id,'starts_on',ce.starts_on,
          'ends_on',ce.ends_on,'is_primary',ce.is_primary,'status',ce.status) into v_current from public.class_enrollments ce where ce.id=v_id;
        if v_current is distinct from v_row.expected_state then raise exception 'B10_STALE_PREVIEW'; end if;
        if v_row.action='update' then update public.class_enrollments set ends_on=nullif(v_n->>'ends_on','')::date,
          is_primary=(v_n->>'is_primary')::boolean,status=v_n->>'status' where id=v_id; v_updated:=v_updated+1;
        else v_unchanged:=v_unchanged+1; end if;
      end if; update public.sis_import_job_rows set resolved_entity_id=v_id where id=v_row.id;
    end loop;

    select count(*) into v_skipped from public.sis_import_job_rows r where r.import_job_id=v_job.id and r.action='skip';
    select count(*) into v_warnings from public.sis_import_job_issues i join public.sis_import_job_rows r on r.id=i.import_job_row_id
      where r.import_job_id=v_job.id and i.severity='warning';
  exception when exclusion_violation then v_failure:='B10_CLASS_ENROLLMENT_OVERLAP';
    when unique_violation then v_failure:='B10_STALE_PREVIEW';
    when foreign_key_violation or check_violation or not_null_violation then v_failure:='B10_STALE_PREVIEW';
    when raise_exception then
      v_failure:=case when sqlerrm in ('B10_STALE_PREVIEW','B10_EXTERNAL_REF_CONFLICT','B10_STUDENT_IDENTITY_CONFLICT',
        'B10_STAFF_IDENTITY_CONFLICT','B10_CLASS_ENROLLMENT_OVERLAP','B10_AY_GRADE_MISMATCH') then sqlerrm else 'B10_IMPORT_COMMIT_FAILED' end;
    when others then v_failure:='B10_IMPORT_COMMIT_FAILED';
  end;

  if v_failure is not null then
    update public.sis_import_jobs set status='failed',confirmation_token_hash=null,
      failure_summary=v_failure,completed_at=null where id=v_job.id;
    return query select v_job.id,'failed'::text,v_job.totals,v_failure; return;
  end if;

  v_job.totals:=jsonb_build_object('created',v_created,'updated',v_updated,'unchanged',v_unchanged,
    'skipped',v_skipped,'errors',0,'warnings',v_warnings);
  update public.sis_import_jobs set status='completed',completed_at=now(),confirmation_token_hash=null,
    failure_summary=null,totals=v_job.totals where id=v_job.id;
  return query select v_job.id,'completed'::text,v_job.totals,null::text;
end;
$$;

revoke all on function public.commit_sis_import_job(uuid,text) from public, anon, service_role;
grant execute on function public.commit_sis_import_job(uuid,text) to authenticated;

comment on function public.commit_sis_import_job(uuid,text) is
  'B10 sole atomic commit surface. Inputs are job id + opaque confirmation token only; persisted HMAC-attested rows are authoritative.';

commit;
