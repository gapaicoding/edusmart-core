-- EduSmart Core V1 - Batch 8 Reporting convergence (pending, not deployed)

begin;

do $$
begin
  if exists (
    select 1 from public.report_cards
    where status in ('draft','submitted','reviewed')
    group by student_enrollment_id, term_id having count(*) > 1
  ) then raise exception 'B8 precondition: duplicate working report cards'; end if;
  if exists (
    select 1 from public.report_cards where status='published'
    group by student_enrollment_id, term_id having count(*) > 1
  ) then raise exception 'B8 precondition: duplicate published report cards'; end if;
end $$;

create unique index if not exists uq_report_cards_one_working
on public.report_cards(student_enrollment_id, term_id)
where status in ('draft','submitted','reviewed');

create unique index if not exists uq_report_cards_one_published
on public.report_cards(student_enrollment_id, term_id)
where status='published';

create or replace function public.can_access_report_card(p_permission_code text, p_report_card_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1
    from public.report_cards rc
    join public.student_enrollments se on se.id=rc.student_enrollment_id
      and se.organization_id=rc.organization_id and se.school_id=rc.school_id
    join public.students s on s.id=se.student_id and s.organization_id=se.organization_id
    left join public.class_enrollments ce on ce.student_enrollment_id=se.id
      and ce.organization_id=se.organization_id and ce.school_id=se.school_id
      and ce.status='active' and ce.is_primary
    where rc.id=p_report_card_id and (
      public.has_staff_scope_permission(p_permission_code,rc.organization_id,rc.school_id,ce.classroom_id)
      or (
        p_permission_code in ('report_card.read','report_card.download') and rc.status='published' and (
          (s.profile_id=auth.uid() and public.has_permission(p_permission_code,rc.organization_id,rc.school_id,ce.classroom_id,s.profile_id,s.id))
          or exists (
            select 1 from public.guardians g
            join public.student_guardians sg on sg.guardian_id=g.id
              and sg.organization_id=g.organization_id and sg.student_id=s.id
              and sg.status='active' and sg.can_view_academic
            where g.profile_id=auth.uid() and g.organization_id=rc.organization_id and g.status='active'
          )
        )
      )
    )
  );
$$;

create or replace function public.validate_report_card_consistency()
returns trigger language plpgsql set search_path=''
as $$
declare v_se public.student_enrollments%rowtype; v_term public.terms%rowtype;
begin
  select * into v_se from public.student_enrollments where id=new.student_enrollment_id;
  if not found or v_se.organization_id<>new.organization_id or v_se.school_id<>new.school_id
    or v_se.academic_year_id<>new.academic_year_id then
    raise exception 'ReportCard enrollment context mismatch';
  end if;
  select * into v_term from public.terms where id=new.term_id;
  if not found or v_term.organization_id<>new.organization_id or v_term.school_id<>new.school_id
    or v_term.academic_year_id<>new.academic_year_id then
    raise exception 'ReportCard term context mismatch';
  end if;
  return new;
end $$;

create or replace function public.guard_report_card_transition()
returns trigger language plpgsql set search_path=''
as $$
declare v_workflow boolean := coalesce(current_setting('app.reporting_workflow',true),'')='on';
  v_snapshot boolean := coalesce(current_setting('app.reporting_snapshot_write',true),'')='on';
begin
  if old.organization_id is distinct from new.organization_id or old.school_id is distinct from new.school_id
    or old.academic_year_id is distinct from new.academic_year_id or old.term_id is distinct from new.term_id
    or old.student_enrollment_id is distinct from new.student_enrollment_id or old.version is distinct from new.version then
    raise exception 'ReportCard identity is immutable';
  end if;
  if old.attendance_summary is distinct from new.attendance_summary and not v_snapshot then
    raise exception 'Attendance snapshot is generation-controlled';
  end if;
  if old.status<> 'draft' and old.homeroom_comment is distinct from new.homeroom_comment then
    raise exception 'Non-draft ReportCard snapshot is immutable';
  end if;
  if old.status is distinct from new.status and not v_workflow then
    raise exception 'Use controlled ReportCard workflow';
  end if;
  if not v_workflow and (old.submitted_at is distinct from new.submitted_at
    or old.reviewed_at is distinct from new.reviewed_at or old.published_at is distinct from new.published_at
    or old.published_by_profile_id is distinct from new.published_by_profile_id) then
    raise exception 'Lifecycle metadata is workflow-controlled';
  end if;
  return new;
end $$;

create or replace function public.guard_report_card_subject_entry_write()
returns trigger language plpgsql set search_path=''
as $$
declare v_id uuid:=case when tg_op='DELETE' then old.report_card_id else new.report_card_id end;
  v_status text; v_internal boolean:=coalesce(current_setting('app.reporting_snapshot_write',true),'')='on';
begin
  select status into v_status from public.report_cards where id=v_id;
  if not found then raise exception 'ReportCard not found'; end if;
  if v_status<>'draft' then raise exception 'Subject snapshot is immutable outside draft'; end if;
  if v_internal then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op='DELETE' then raise exception 'Use controlled snapshot generation'; end if;
  if tg_op='INSERT' then raise exception 'Use controlled snapshot generation'; end if;
  if old.organization_id is distinct from new.organization_id or old.school_id is distinct from new.school_id
    or old.report_card_id is distinct from new.report_card_id or old.subject_id is distinct from new.subject_id then
    raise exception 'Subject snapshot identity is immutable';
  end if;
  if old.final_score is distinct from new.final_score or old.predicate is distinct from new.predicate
    or old.source_calculation is distinct from new.source_calculation then
    raise exception 'Generated subject fields are not narrative-editable';
  end if;
  if old.narrative is distinct from new.narrative and not public.can_access_report_card('report_card.edit_narrative',v_id) then
    raise exception 'Missing report_card.edit_narrative permission';
  end if;
  return new;
end $$;

create or replace function public.guard_report_card_narrative_write()
returns trigger language plpgsql set search_path=''
as $$
declare v_id uuid:=case when tg_op='DELETE' then old.report_card_id else new.report_card_id end;
  v_status text; v_internal boolean:=coalesce(current_setting('app.reporting_snapshot_write',true),'')='on';
begin
  select status into v_status from public.report_cards where id=v_id;
  if not found then raise exception 'ReportCard not found'; end if;
  if v_status<>'draft' then raise exception 'Narrative is immutable outside draft'; end if;
  if v_internal then return case when tg_op='DELETE' then old else new end; end if;
  if not public.can_access_report_card('report_card.edit_narrative',v_id) then
    raise exception 'Missing report_card.edit_narrative permission';
  end if;
  if tg_op='UPDATE' and (old.organization_id is distinct from new.organization_id
    or old.school_id is distinct from new.school_id or old.report_card_id is distinct from new.report_card_id) then
    raise exception 'Narrative identity is immutable';
  end if;
  return new;
end $$;

drop trigger if exists trg_report_card_subject_entries_write_guard on public.report_card_subject_entries;
create trigger trg_report_card_subject_entries_write_guard before insert or update or delete
on public.report_card_subject_entries for each row execute function public.guard_report_card_subject_entry_write();
drop trigger if exists trg_report_card_narratives_write_guard on public.report_card_narratives;
create trigger trg_report_card_narratives_write_guard before insert or update or delete
on public.report_card_narratives for each row execute function public.guard_report_card_narrative_write();

drop trigger if exists audit_report_card_subject_entries on public.report_card_subject_entries;
create trigger audit_report_card_subject_entries after insert or update or delete on public.report_card_subject_entries
for each row execute function public.audit_row_change();
drop trigger if exists audit_report_card_narratives on public.report_card_narratives;
create trigger audit_report_card_narratives after insert or update or delete on public.report_card_narratives
for each row execute function public.audit_row_change();

create or replace function public.generate_report_card_draft(p_student_enrollment_id uuid,p_term_id uuid,p_expected_updated_at timestamptz default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_se public.student_enrollments%rowtype; v_term public.terms%rowtype; v_rc public.report_cards%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_se from public.student_enrollments where id=p_student_enrollment_id for share;
  if not found then raise exception 'StudentEnrollment not found'; end if;
  select * into v_term from public.terms where id=p_term_id for share;
  if not found or v_term.academic_year_id<>v_se.academic_year_id or v_term.organization_id<>v_se.organization_id or v_term.school_id<>v_se.school_id then
    raise exception 'Invalid enrollment/term context';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_enrollment_id::text||':'||p_term_id::text,0));
  select * into v_rc from public.report_cards where student_enrollment_id=p_student_enrollment_id
    and term_id=p_term_id and status in ('draft','submitted','reviewed') for update;
  if found and v_rc.status<>'draft' then raise exception 'Existing working ReportCard is not draft'; end if;
  if found and p_expected_updated_at is null then raise exception 'Expected updated_at is required for regeneration'; end if;
  if found and p_expected_updated_at is not null and v_rc.updated_at<>p_expected_updated_at then raise exception 'Stale ReportCard'; end if;
  if not found then
    if exists(select 1 from public.report_cards where student_enrollment_id=p_student_enrollment_id and term_id=p_term_id and status='published') then
      raise exception 'Create a versioned revision of the published ReportCard';
    end if;
    insert into public.report_cards(organization_id,school_id,academic_year_id,term_id,student_enrollment_id,version,status)
    values(v_se.organization_id,v_se.school_id,v_se.academic_year_id,p_term_id,p_student_enrollment_id,1,'draft') returning * into v_rc;
  end if;
  if not public.can_access_report_card('report_card.generate',v_rc.id) then raise exception 'Missing report_card.generate permission'; end if;
  perform set_config('app.reporting_snapshot_write','on',true);
  insert into public.report_card_subject_entries(organization_id,school_id,report_card_id,subject_id,final_score,predicate,narrative,source_calculation)
  select v_rc.organization_id,v_rc.school_id,v_rc.id,roster.subject_id,
    case when count(ss.id)>0 then round(avg(((ss.score-a.min_score)/(a.max_score-a.min_score))*100) filter(where ss.id is not null)::numeric,2) end,
    null,existing.narrative,
    jsonb_build_object('algorithm','mean-normalized-percent-v1','assessmentIds',coalesce(jsonb_agg(a.id order by a.assessment_date) filter(where ss.id is not null),'[]'::jsonb),'inputs',coalesce(jsonb_agg(jsonb_build_object('assessmentId',a.id,'score',ss.score,'minScore',a.min_score,'maxScore',a.max_score,'normalizedPercent',round((((ss.score-a.min_score)/(a.max_score-a.min_score))*100)::numeric,4)) order by a.assessment_date) filter(where ss.id is not null),'[]'::jsonb),'sourceCount',count(ss.id),'result',case when count(ss.id)>0 then round(avg(((ss.score-a.min_score)/(a.max_score-a.min_score))*100) filter(where ss.id is not null)::numeric,2) end)
  from (
    select distinct ta.subject_id,ta.classroom_id
    from public.class_enrollments ce join public.teaching_assignments ta
      on ta.classroom_id=ce.classroom_id and ta.organization_id=ce.organization_id and ta.school_id=ce.school_id
      and ta.academic_year_id=v_se.academic_year_id and ta.status='active' and (ta.term_id is null or ta.term_id=p_term_id)
    where ce.student_enrollment_id=p_student_enrollment_id and ce.status='active' and ce.is_primary
  ) roster
  left join public.report_card_subject_entries existing
    on existing.report_card_id=v_rc.id and existing.subject_id=roster.subject_id
  left join public.teaching_assignments ta on ta.subject_id=roster.subject_id and ta.classroom_id=roster.classroom_id
    and ta.organization_id=v_se.organization_id and ta.academic_year_id=v_se.academic_year_id
    and ta.school_id=v_se.school_id and ta.status='active' and (ta.term_id is null or ta.term_id=p_term_id)
  left join public.assessments a on a.teaching_assignment_id=ta.id and a.term_id=p_term_id and a.status='published' and a.max_score>a.min_score
  left join public.student_scores ss on ss.assessment_id=a.id and ss.student_enrollment_id=p_student_enrollment_id
    and ss.score is not null and ss.score between a.min_score and a.max_score and ss.status in ('submitted','final')
  group by roster.subject_id,existing.narrative
  on conflict (report_card_id,subject_id) do update set
    final_score=excluded.final_score,
    predicate=excluded.predicate,
    source_calculation=excluded.source_calculation;
  delete from public.report_card_subject_entries entry
  where entry.report_card_id=v_rc.id
    and not exists (
      select 1
      from public.class_enrollments ce
      join public.teaching_assignments ta
        on ta.classroom_id=ce.classroom_id
       and ta.organization_id=ce.organization_id
       and ta.school_id=ce.school_id
       and ta.academic_year_id=v_se.academic_year_id
       and ta.status='active'
       and (ta.term_id is null or ta.term_id=p_term_id)
      where ce.student_enrollment_id=p_student_enrollment_id
        and ce.status='active' and ce.is_primary
        and ta.subject_id=entry.subject_id
    );
  update public.report_cards set attendance_summary=(
    select jsonb_build_object('finalizedSessionCount',count(distinct ats.id),'counts',jsonb_build_object(
      'present',count(*) filter(where sar.status='present'),'late',count(*) filter(where sar.status='late'),
      'excused',count(*) filter(where sar.status='excused'),'sick',count(*) filter(where sar.status='sick'),
      'absent',count(*) filter(where sar.status='absent'),'other',count(*) filter(where sar.status='other')))
    from public.student_attendance_records sar join public.attendance_sessions ats on ats.id=sar.attendance_session_id
    where sar.student_enrollment_id=p_student_enrollment_id and ats.term_id=p_term_id
      and ats.session_date between v_term.starts_on and v_term.ends_on
      and ats.status in ('submitted','locked','corrected')
  ) where id=v_rc.id;
  return v_rc.id;
end $$;

create or replace function public.transition_report_card(p_report_card_id uuid,p_expected_updated_at timestamptz,p_action text)
returns public.report_cards language plpgsql security definer set search_path=''
as $$
declare v_rc public.report_cards%rowtype; v_next text; v_permission text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_rc from public.report_cards where id=p_report_card_id for update;
  if not found then raise exception 'ReportCard not found'; end if;
  if v_rc.updated_at<>p_expected_updated_at then raise exception 'Stale ReportCard'; end if;
  if p_action='submit' and v_rc.status='draft' then v_next:='submitted';v_permission:='report_card.submit';
  elsif p_action='review' and v_rc.status='submitted' then v_next:='reviewed';v_permission:='report_card.review';
  elsif p_action='return' and v_rc.status in ('submitted','reviewed') then v_next:='draft';v_permission:='report_card.review';
  elsif p_action='archive' and v_rc.status='draft' then v_next:='archived';v_permission:='report_card.generate';
  else raise exception 'Invalid ReportCard transition'; end if;
  if not public.can_access_report_card(v_permission,v_rc.id) then raise exception 'Missing ReportCard workflow permission'; end if;
  perform set_config('app.reporting_workflow','on',true);
  update public.report_cards set status=v_next,
    submitted_at=case when v_next='submitted' then now() when v_next='draft' then null else submitted_at end,
    reviewed_at=case when v_next='reviewed' then now() when v_next='draft' then null else reviewed_at end,
    published_at=null,published_by_profile_id=null
  where id=v_rc.id returning * into v_rc;
  return v_rc;
end $$;

create or replace function public.create_report_card_revision(p_published_report_card_id uuid,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_old public.report_cards%rowtype; v_new_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_old from public.report_cards where id=p_published_report_card_id for update;
  if not found or v_old.status<>'published' then raise exception 'Published ReportCard required'; end if;
  if v_old.updated_at<>p_expected_updated_at then raise exception 'Stale ReportCard'; end if;
  if not public.can_access_report_card('report_card.revise_published',v_old.id) then raise exception 'Missing report_card.revise_published permission'; end if;
  if not public.can_access_report_card('report_card.generate',v_old.id) then raise exception 'Missing report_card.generate permission'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_old.student_enrollment_id::text||':'||v_old.term_id::text,0));
  insert into public.report_cards(organization_id,school_id,academic_year_id,term_id,student_enrollment_id,version,status,homeroom_comment,attendance_summary)
  select v_old.organization_id,v_old.school_id,v_old.academic_year_id,v_old.term_id,v_old.student_enrollment_id,max(rc.version)+1,'draft',v_old.homeroom_comment,v_old.attendance_summary
  from public.report_cards rc where rc.student_enrollment_id=v_old.student_enrollment_id and rc.term_id=v_old.term_id
  returning id into v_new_id;
  perform set_config('app.reporting_snapshot_write','on',true);
  insert into public.report_card_subject_entries(organization_id,school_id,report_card_id,subject_id,final_score,predicate,narrative,source_calculation)
  select organization_id,school_id,v_new_id,subject_id,final_score,predicate,narrative,source_calculation from public.report_card_subject_entries where report_card_id=v_old.id;
  insert into public.report_card_narratives(organization_id,school_id,report_card_id,section_code,title,content,sequence)
  select organization_id,school_id,v_new_id,section_code,title,content,sequence from public.report_card_narratives where report_card_id=v_old.id;
  return v_new_id;
end $$;

create or replace function public.publish_report_card(p_report_card_id uuid,p_expected_updated_at timestamptz)
returns public.report_cards language plpgsql security definer set search_path=''
as $$
declare v_new public.report_cards%rowtype; v_old public.report_cards%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_new from public.report_cards where id=p_report_card_id for update;
  if not found or v_new.status<>'reviewed' then raise exception 'Reviewed ReportCard required'; end if;
  if v_new.updated_at<>p_expected_updated_at then raise exception 'Stale ReportCard'; end if;
  if not public.can_access_report_card('report_card.publish',v_new.id) then raise exception 'Missing report_card.publish permission'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_new.student_enrollment_id::text||':'||v_new.term_id::text,0));
  if exists(select 1 from public.report_cards rc where rc.student_enrollment_id=v_new.student_enrollment_id and rc.term_id=v_new.term_id and rc.version>v_new.version) then
    raise exception 'Stale ReportCard version';
  end if;
  select * into v_old from public.report_cards where student_enrollment_id=v_new.student_enrollment_id and term_id=v_new.term_id and status='published' for update;
  if found and not public.can_access_report_card('report_card.revise_published',v_old.id) then
    raise exception 'Missing report_card.revise_published permission';
  end if;
  perform set_config('app.reporting_workflow','on',true);
  if found then update public.report_cards set status='revised' where id=v_old.id; end if;
  update public.report_cards set status='published',published_at=now(),published_by_profile_id=auth.uid()
  where id=v_new.id returning * into v_new;
  return v_new;
end $$;

drop policy if exists report_cards_insert on public.report_cards;
drop policy if exists report_cards_update on public.report_cards;
drop policy if exists report_card_subject_entries_insert on public.report_card_subject_entries;
drop policy if exists report_card_subject_entries_update on public.report_card_subject_entries;
drop policy if exists report_card_narratives_insert on public.report_card_narratives;
drop policy if exists report_card_narratives_update on public.report_card_narratives;
drop policy if exists report_card_narratives_delete on public.report_card_narratives;
create policy report_cards_update on public.report_cards for update to authenticated using(public.can_access_report_card('report_card.edit_narrative',id)) with check(status='draft' and public.can_access_report_card('report_card.edit_narrative',id));
create policy report_card_subject_entries_update on public.report_card_subject_entries for update to authenticated
using(exists(select 1 from public.report_cards rc where rc.id=report_card_id and rc.status='draft' and public.can_access_report_card('report_card.edit_narrative',rc.id)))
with check(exists(select 1 from public.report_cards rc where rc.id=report_card_id and rc.status='draft' and public.can_access_report_card('report_card.edit_narrative',rc.id)));
create policy report_card_narratives_insert on public.report_card_narratives for insert to authenticated
with check(exists(select 1 from public.report_cards rc where rc.id=report_card_id and rc.status='draft' and public.can_access_report_card('report_card.edit_narrative',rc.id)));
create policy report_card_narratives_update on public.report_card_narratives for update to authenticated
using(exists(select 1 from public.report_cards rc where rc.id=report_card_id and rc.status='draft' and public.can_access_report_card('report_card.edit_narrative',rc.id)))
with check(exists(select 1 from public.report_cards rc where rc.id=report_card_id and rc.status='draft' and public.can_access_report_card('report_card.edit_narrative',rc.id)));
create policy report_card_narratives_delete on public.report_card_narratives for delete to authenticated
using(exists(select 1 from public.report_cards rc where rc.id=report_card_id and rc.status='draft' and public.can_access_report_card('report_card.edit_narrative',rc.id)));

revoke all on function public.can_access_report_card(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_access_report_card(text,uuid) to authenticated;
revoke all on function public.validate_report_card_consistency() from public,anon,authenticated,service_role;
revoke all on function public.guard_report_card_transition() from public,anon,authenticated,service_role;
revoke all on function public.guard_report_card_subject_entry_write() from public,anon,authenticated,service_role;
revoke all on function public.guard_report_card_narrative_write() from public,anon,authenticated,service_role;
revoke all on function public.generate_report_card_draft(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.generate_report_card_draft(uuid,uuid,timestamptz) to authenticated;
revoke all on function public.transition_report_card(uuid,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.transition_report_card(uuid,timestamptz,text) to authenticated;
revoke all on function public.create_report_card_revision(uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.create_report_card_revision(uuid,timestamptz) to authenticated;
revoke all on function public.publish_report_card(uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.publish_report_card(uuid,timestamptz) to authenticated;

commit;
