-- Preserve B17's closed-period write lock while allowing only the canonical
-- B15 final-score correction command executing in the current transaction.
-- B15's command ledger is 'processing' during the score UPDATE and completed
-- only after that UPDATE; requiring 'completed' here made the exception
-- impossible to reach.
create or replace function public.b17_guard_period_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org uuid; v_school uuid; v_year uuid; v_other_year uuid; v_term uuid; v_card uuid;
  v_allowed boolean:=false; v_status text;
begin
  v_org:=nullif(r->>'organization_id','')::uuid; v_school:=nullif(r->>'school_id','')::uuid;
  if tg_table_name in ('academic_calendar_events','classrooms','teaching_assignments','timetable_entries','timetable_periods','student_enrollments','assessments','report_cards') then
    v_year:=nullif(r->>'academic_year_id','')::uuid; v_term:=nullif(r->>'term_id','')::uuid;
  elsif tg_table_name='class_enrollments' then
    select academic_year_id into v_year from public.student_enrollments where id=nullif(r->>'student_enrollment_id','')::uuid and organization_id=v_org and school_id=v_school;
  elsif tg_table_name='attendance_sessions' then
    v_year:=nullif(r->>'academic_year_id','')::uuid; v_term:=nullif(r->>'term_id','')::uuid;
  elsif tg_table_name='attendance_session_roster_members' then
    select s.academic_year_id,s.term_id into v_year,v_term from public.attendance_sessions s where s.id=nullif(r->>'attendance_session_id','')::uuid and s.organization_id=v_org and s.school_id=v_school;
  elsif tg_table_name='student_attendance_records' then
    select s.academic_year_id,s.term_id into v_year,v_term from public.attendance_sessions s where s.id=nullif(r->>'attendance_session_id','')::uuid and s.organization_id=v_org and s.school_id=v_school;
    v_allowed:=tg_op='UPDATE' and exists(select 1 from public.attendance_command_requests c where c.actor_profile_id=auth.uid()
      and c.command_kind='correct' and c.target_id=case when tg_op='DELETE' then old.id else new.id end and c.completed_at is null
      and mod(txid_current(),4294967296)=c.xmin::text::bigint);
  elsif tg_table_name='student_scores' then
    select a.academic_year_id,a.term_id into v_year,v_term from public.assessments a where a.id=nullif(r->>'assessment_id','')::uuid and a.organization_id=v_org and a.school_id=v_school;
    v_allowed:=tg_op='UPDATE' and exists(select 1 from public.assessment_command_requests c where c.actor_profile_id=auth.uid()
      and c.command_name='correct_final_score' and c.status='processing'
      and mod(txid_current(),4294967296)=c.xmin::text::bigint);
  elsif tg_table_name='assessment_learning_objectives' then
    select a.academic_year_id,a.term_id,a.organization_id,a.school_id into v_year,v_term,v_org,v_school from public.assessments a where a.id=nullif(r->>'assessment_id','')::uuid;
  elsif tg_table_name='report_card_subject_entries' or tg_table_name='report_card_narratives' then
    v_card:=nullif(r->>'report_card_id','')::uuid;
    select rc.academic_year_id,rc.term_id,rc.organization_id,rc.school_id into v_year,v_term,v_org,v_school from public.report_cards rc where rc.id=v_card;
    v_allowed:=public.b17_report_card_revision_exception(v_card);
  elsif tg_table_name='progression_batches' then
    v_year:=nullif(r->>'source_academic_year_id','')::uuid; v_other_year:=nullif(r->>'target_academic_year_id','')::uuid;
  elsif tg_table_name='progression_decisions' then
    select b.source_academic_year_id,b.target_academic_year_id,b.organization_id,b.school_id into v_year,v_other_year,v_org,v_school from public.progression_batches b where b.id=nullif(r->>'batch_id','')::uuid;
  end if;
  if tg_table_name='report_cards' then
    v_card:=nullif(r->>'id','')::uuid;
    if tg_op='INSERT' then
      v_allowed:=exists(select 1 from public.report_card_command_requests c join public.report_cards src on src.id=c.report_card_id
        where c.actor_profile_id=auth.uid() and c.command_name='create_report_card_revision' and c.status='processing'
          and c.report_card_id is not null and mod(txid_current(),4294967296)=c.xmin::text::bigint
          and src.student_enrollment_id=(r->>'student_enrollment_id')::uuid and src.academic_year_id=(r->>'academic_year_id')::uuid
          and src.term_id is not distinct from nullif(r->>'term_id','')::uuid and (src.version+1)=(r->>'version')::integer and src.status='published');
    elsif tg_op='UPDATE' then
      v_allowed:=public.b17_report_card_revision_exception(v_card)
       or (old.status='published' and new.status='revised' and exists(
          select 1 from public.report_cards draft join public.report_card_command_requests c on c.report_card_id=draft.id
          where draft.student_enrollment_id=old.student_enrollment_id and draft.academic_year_id=old.academic_year_id
            and draft.term_id is not distinct from old.term_id and draft.version=old.version+1 and draft.status='reviewed'
            and c.command_name='publish_report_card' and c.status='processing' and c.actor_profile_id=auth.uid() and mod(txid_current(),4294967296)=c.xmin::text::bigint));
    end if;
    v_year:=nullif(r->>'academic_year_id','')::uuid; v_term:=nullif(r->>'term_id','')::uuid;
  end if;
  if tg_table_name='assessment_learning_objectives' then v_allowed:=false; end if;
  if v_year is not null or v_term is not null then
    if not v_allowed then
      if v_year is not null then
        select y.status into v_status from public.academic_years y where y.id=v_year and y.organization_id=v_org and y.school_id=v_school for share;
        if v_status in ('closed','archived') then raise exception using errcode='P0001',message='B17_ACADEMIC_YEAR_CLOSED'; end if;
      end if;
      if v_term is not null then
        select t.status into v_status from public.terms t where t.id=v_term and t.organization_id=v_org and t.school_id=v_school for share;
        if v_status in ('closed','archived') then raise exception using errcode='P0001',message='B17_TERM_CLOSED'; end if;
      end if;
      if v_other_year is not null and v_other_year is distinct from v_year then
        select y.status into v_status from public.academic_years y where y.id=v_other_year and y.organization_id=v_org and y.school_id=v_school for share;
        if v_status in ('closed','archived') then raise exception using errcode='P0001',message='B17_ACADEMIC_YEAR_CLOSED'; end if;
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
