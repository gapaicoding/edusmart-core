begin;

-- Migration 1 was amended after its first Development application. Reapply the
-- final repository function body so immutable consent events retain the same
-- evidence reference as the current preference projection.
create or replace function public.b25_record_contact_preference(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := nullif(p_input->>'school_id','')::uuid;
  v_profile uuid := nullif(p_input->>'recipient_profile_id','')::uuid;
  v_channel text := lower(btrim(coalesce(p_input->>'channel','')));
  v_purpose text := lower(btrim(coalesce(p_input->>'purpose','')));
  v_consent text := lower(btrim(coalesce(p_input->>'consent_state','')));
  v_contact text := lower(btrim(coalesce(p_input->>'contact_state','')));
  v_source text := lower(btrim(coalesce(p_input->>'source','')));
  v_org uuid;
  v_now timestamptz := pg_catalog.transaction_timestamp();
begin
  if auth.uid() is null then raise exception using errcode='42501',message='B25_PERMISSION_DENIED'; end if;
  select s.organization_id into v_org from public.schools s where s.id=v_school;
  if v_org is null or not public.has_staff_scope_permission('communication.delivery.manage',v_org,v_school) then
    raise exception using errcode='42501',message='B25_PERMISSION_DENIED';
  end if;
  if v_channel not in ('whatsapp','email') or v_purpose<>'operational' or
     v_consent not in ('unknown','granted','revoked') or
     v_contact not in ('unverified','verified_by_school','disabled') or
     v_source not in ('school_recorded','guardian_portal','imported') then
    raise exception using errcode='22023',message='B25_INVALID_PREFERENCE';
  end if;
  if v_consent='granted' and v_source='school_recorded' and
     nullif(btrim(coalesce(p_input->>'source_reference','')),'') is null then
    raise exception using errcode='22023',message='B25_CONSENT_EVIDENCE_REQUIRED';
  end if;
  if not exists (
    select 1 from public.guardians g
    join public.student_guardians sg on sg.guardian_id=g.id and sg.organization_id=g.organization_id and sg.status='active'
    join public.student_enrollments e on e.student_id=sg.student_id and e.organization_id=sg.organization_id and e.school_id=v_school and e.status='active'
    where g.organization_id=v_org and g.profile_id=v_profile and g.status='active'
  ) then raise exception using errcode='P0001',message='B25_CONTACT_NOT_IN_SCHOOL'; end if;

  insert into public.communication_contact_preferences(
    organization_id,school_id,recipient_profile_id,channel,purpose,consent_state,contact_state,source,source_reference,changed_by_profile_id,effective_at,revoked_at,updated_at
  ) values (
    v_org,v_school,v_profile,v_channel,v_purpose,v_consent,v_contact,v_source,
    nullif(btrim(p_input->>'source_reference'),''),auth.uid(),v_now,case when v_consent='revoked' then v_now else null end,v_now
  ) on conflict (organization_id,school_id,recipient_profile_id,channel,purpose) do update set
    consent_state=excluded.consent_state,contact_state=excluded.contact_state,source=excluded.source,
    source_reference=excluded.source_reference,changed_by_profile_id=excluded.changed_by_profile_id,
    effective_at=excluded.effective_at,revoked_at=excluded.revoked_at,updated_at=excluded.updated_at;

  insert into public.communication_contact_preference_events(
    organization_id,school_id,recipient_profile_id,channel,purpose,consent_state,contact_state,source,source_reference,changed_by_profile_id,effective_at
  ) values(v_org,v_school,v_profile,v_channel,v_purpose,v_consent,v_contact,v_source,nullif(btrim(p_input->>'source_reference'),''),auth.uid(),v_now);
  return jsonb_build_object('saved',true,'channel',v_channel,'purpose',v_purpose,'consent_state',v_consent,'contact_state',v_contact);
end;
$$;

commit;
