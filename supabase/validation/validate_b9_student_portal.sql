-- EduSmart Core V1 / Batch 9 Student Portal: structural release-contract validator.
-- Run after 20260911150000_b9_student_portal.sql is applied.
--
-- This validator is intentionally structural (column/constraint/trigger/
-- function/grant existence plus targeted source-predicate checks) rather than
-- an exact prosrc hash match: it complements — and does not replace — the
-- existing exact-hash B7/B8 validators, which remain the authority for
-- regression-detecting the functions this batch must not weaken.

do $$
declare
  v_oid oid;
  v_owner oid;
  v_source text;
  v_normalized_source text;
begin
  -- 1. invitations.target_student_id: column, tenant-bound composite FK -------
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invitations'
      and column_name = 'target_student_id' and data_type = 'uuid'
  ) then
    raise exception 'B9: invitations.target_student_id column is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    where t.relname = 'invitations' and c.contype = 'f'
      and c.conname = 'invitations_target_student_fk'
      and pg_get_constraintdef(c.oid) ilike '%(target_student_id, organization_id)%'
      -- pg_get_constraintdef omits the schema qualifier when the referenced
      -- table is unambiguous on the search_path (the live/normal case);
      -- accept both the qualified and unqualified forms.
      and (
        pg_get_constraintdef(c.oid) ilike '%REFERENCES public.students(id, organization_id)%'
        or pg_get_constraintdef(c.oid) ilike '%REFERENCES students(id, organization_id)%'
      )
  ) then
    raise exception 'B9: invitations_target_student_fk is missing or not tenant-bound to students(id, organization_id)';
  end if;

  -- 2. Student invitation invariant trigger ------------------------------------
  if not exists (
    select 1 from pg_catalog.pg_trigger tg
    join pg_catalog.pg_class t on t.oid = tg.tgrelid
    where t.relname = 'invitations' and tg.tgname = 'trg_validate_student_invitation'
      and not tg.tgisinternal
  ) then
    raise exception 'B9: trg_validate_student_invitation trigger is missing on invitations';
  end if;

  select prosrc into v_source from pg_catalog.pg_proc
  where oid = 'public.validate_student_invitation()'::regprocedure;
  if v_source is null then
    raise exception 'B9: validate_student_invitation() function is missing';
  end if;
  v_normalized_source := regexp_replace(lower(regexp_replace(v_source, '--[^' || chr(10) || chr(13) || ']*', ' ', 'g')), '[[:space:]]', '', 'g');

  if position('v_role_code<>''student''' in v_normalized_source) = 0
     or position('new.invited_scope_type<>''own''' in v_normalized_source) = 0
     or position('se.statusin(' in v_normalized_source) = 0
     or position('''active'',''leave''' in v_normalized_source) = 0
     or position('new.target_student_idisnull' in v_normalized_source) = 0 then
    raise exception 'B9: validate_student_invitation is missing a required invariant predicate';
  end if;

  -- Lifecycle exemption: a legacy invalid STUDENT/OWN row must remain
  -- revocable even though it can never be accepted/provisioned (see the B9
  -- predeploy security review, Gate 3).
  if position('new.revoked_atisnull' in v_normalized_source) = 0 then
    raise exception 'B9: validate_student_invitation no longer permits revoking a legacy invalid STUDENT/OWN invitation';
  end if;

  if position('nameislikesoundexof' in v_normalized_source) <> 0
     or position('lower(email)=lower(' in v_normalized_source) <> 0 then
    raise exception 'B9: validate_student_invitation must never auto-match by name or guessed email';
  end if;

  -- 3. list_student_own_attendance: identity, security posture, grants --------
  v_oid := 'public.list_student_own_attendance(uuid,uuid,date,date)'::regprocedure::oid;
  select p.proowner, p.prosrc into v_owner, v_source from pg_catalog.pg_proc p where p.oid = v_oid;
  if v_source is null then
    raise exception 'B9: list_student_own_attendance is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace ns on ns.oid = p.pronamespace
    where p.oid = v_oid and ns.nspname = 'public'
      and p.prosecdef
      and p.proconfig @> array['search_path=""']::text[]
      and pg_get_function_result(p.oid) = 'TABLE(record_id uuid, session_id uuid, organization_id uuid, school_id uuid, classroom_id uuid, session_date date, session_status text, status text, recorded_at timestamp with time zone)'
  ) then
    raise exception 'B9: list_student_own_attendance identity/security/return contract is wrong (must be SECURITY DEFINER with search_path='''')';
  end if;

  -- PUBLIC is grantee OID 0.
  if exists (
    select 1 from aclexplode(coalesce((select proacl from pg_catalog.pg_proc where oid = v_oid), acldefault('f', v_owner))) a
    where a.privilege_type = 'EXECUTE' and a.grantee = 0
  ) then raise exception 'B9: list_student_own_attendance grants EXECUTE to PUBLIC'; end if;
  if exists (
    select 1 from aclexplode(coalesce((select proacl from pg_catalog.pg_proc where oid = v_oid), acldefault('f', v_owner))) a
    where a.privilege_type = 'EXECUTE' and a.grantee in ('anon'::regrole::oid, 'service_role'::regrole::oid)
  ) then raise exception 'B9: list_student_own_attendance grants EXECUTE to anon/service_role'; end if;
  if not exists (
    select 1 from aclexplode(coalesce((select proacl from pg_catalog.pg_proc where oid = v_oid), acldefault('f', v_owner))) a
    where a.privilege_type = 'EXECUTE' and a.grantee = 'authenticated'::regrole::oid
  ) then raise exception 'B9: list_student_own_attendance must grant EXECUTE to authenticated'; end if;
  if exists (
    select 1 from aclexplode(coalesce((select proacl from pg_catalog.pg_proc where oid = v_oid), acldefault('f', v_owner))) a
    where a.privilege_type = 'EXECUTE' and a.grantee <> all (array[v_owner, 'authenticated'::regrole::oid]::oid[])
  ) then raise exception 'B9: list_student_own_attendance has an unexpected direct EXECUTE grantee'; end if;

  v_normalized_source := regexp_replace(lower(regexp_replace(v_source, '--[^' || chr(10) || chr(13) || ']*', ' ', 'g')), '[[:space:]]', '', 'g');

  if position('st.profile_id=auth.uid()' in v_normalized_source) = 0
     or position('s.statusin(''submitted'',''locked'',''corrected'')' in v_normalized_source) = 0
     or position('public.has_permission(' in v_normalized_source) = 0 then
    raise exception 'B9: list_student_own_attendance is missing a required subject/lifecycle/RBAC predicate';
  end if;

  if position('p_student_id' in v_normalized_source) <> 0 then
    raise exception 'B9: list_student_own_attendance must never accept a client-supplied student id';
  end if;

  if position('notes' in v_normalized_source) <> 0
     or position('correction_reason' in v_normalized_source) <> 0
     or position('classmate' in v_normalized_source) <> 0 then
    raise exception 'B9: list_student_own_attendance must never select internal notes/correction_reason or classmate rows';
  end if;

  -- 4. Regression guard: B7 Parent attendance RPC must remain intact ----------
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.list_parent_student_attendance(uuid,date,date)'::regprocedure
      and p.prosecdef and p.proconfig @> array['search_path=""']::text[]
  ) then
    raise exception 'B9: B7 list_parent_student_attendance was weakened (not SECURITY DEFINER / search_path='''')';
  end if;

  -- 5. Regression guard: B8 report-card document authority must remain intact -
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.can_access_report_card(text,uuid)'::regprocedure
      and p.prosecdef and p.proconfig @> array['search_path=""']::text[]
  ) then
    raise exception 'B9: B8 can_access_report_card was weakened (not SECURITY DEFINER / search_path='''')';
  end if;

  select prosrc into v_source from pg_catalog.pg_proc
  where oid = 'public.can_access_report_card(text,uuid)'::regprocedure;
  v_normalized_source := regexp_replace(lower(regexp_replace(v_source, '--[^' || chr(10) || chr(13) || ']*', ' ', 'g')), '[[:space:]]', '', 'g');
  if position('s.profile_id=auth.uid()' in v_normalized_source) = 0 then
    raise exception 'B9: B8 can_access_report_card no longer supports STUDENT OWN (s.profile_id = auth.uid())';
  end if;

  -- 6. STUDENT role must still carry every B9-required read permission --------
  declare
    v_perm text;
  begin
    foreach v_perm in array array[
      'student.read', 'enrollment.read', 'schedule.read', 'attendance.read',
      'assessment.read', 'score.read', 'report_card.read', 'report_card.download'
    ] loop
      if not exists (
        select 1 from public.role_permissions rp
        join public.roles ro on ro.id = rp.role_id
        join public.permissions pe on pe.id = rp.permission_id
        where ro.organization_id is null and ro.code = 'STUDENT' and pe.code = v_perm
      ) then
        raise exception 'B9: STUDENT role missing required permission: %', v_perm;
      end if;
    end loop;
  end;

  -- 7. uq_students_org_profile must still guard one-profile-per-org binding ---
  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public' and tablename = 'students' and indexname = 'uq_students_org_profile'
  ) then
    raise exception 'B9: uq_students_org_profile unique index is missing (required to hard-fail cross-student rebind)';
  end if;
end $$;

select 'B9 student portal validation passed' as result;
