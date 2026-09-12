-- EduSmart Core V1 / Batch 9 — OWN-scope authorization fix: structural validator.
-- Run after 20260911160000_b9_own_scope_authorization_fix.sql is applied.
--
-- Verifies the corrected LIVE function definitions (not merely that the
-- migration file exists), and regression-guards has_staff_scope_permission,
-- the B7 Parent attendance RPC, the B8 report-card document authority, and
-- the B9 Student attendance RPC, none of which this remediation should touch.

do $$
declare
  v_oid oid;
  v_owner oid;
  v_source text;
  v_normalized_source text;
begin
  -- 1. New exact-subject helper: identity, security posture, ACL --------------
  v_oid := 'public.has_scoped_permission_exact_subject(text,uuid,uuid,uuid,uuid,uuid)'::regprocedure::oid;
  select p.proowner, p.prosrc into v_owner, v_source
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where p.oid = v_oid;
  if v_source is null then
    raise exception 'B9-OWN-FIX: has_scoped_permission_exact_subject is missing';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = v_oid and p.prosecdef
  ) then
    raise exception 'B9-OWN-FIX: has_scoped_permission_exact_subject must be SECURITY DEFINER';
  end if;

  if exists (
    select 1 from aclexplode(coalesce((select proacl from pg_catalog.pg_proc where oid = v_oid), acldefault('f', v_owner))) a
    where a.privilege_type = 'EXECUTE' and a.grantee = 0
  ) then raise exception 'B9-OWN-FIX: has_scoped_permission_exact_subject grants EXECUTE to PUBLIC'; end if;
  if exists (
    select 1 from aclexplode(coalesce((select proacl from pg_catalog.pg_proc where oid = v_oid), acldefault('f', v_owner))) a
    where a.privilege_type = 'EXECUTE' and a.grantee in ('anon'::regrole::oid, 'service_role'::regrole::oid)
  ) then raise exception 'B9-OWN-FIX: has_scoped_permission_exact_subject grants EXECUTE to anon/service_role'; end if;
  if not exists (
    select 1 from aclexplode(coalesce((select proacl from pg_catalog.pg_proc where oid = v_oid), acldefault('f', v_owner))) a
    where a.privilege_type = 'EXECUTE' and a.grantee = 'authenticated'::regrole::oid
  ) then raise exception 'B9-OWN-FIX: has_scoped_permission_exact_subject must grant EXECUTE to authenticated'; end if;

  v_normalized_source := regexp_replace(lower(regexp_replace(v_source, '--[^' || chr(10) || chr(13) || ']*', ' ', 'g')), '[[:space:]]', '', 'g');

  -- Must delegate the staff path verbatim.
  if position('public.has_staff_scope_permission(' in v_normalized_source) = 0 then
    raise exception 'B9-OWN-FIX: has_scoped_permission_exact_subject no longer delegates the Staff scope path to has_staff_scope_permission';
  end if;

  -- Must require exact subject match for OWN -- the corrected invariant.
  if position('p_subject_profile_idisnotnull' in v_normalized_source) = 0
     or position('p_subject_profile_id=auth.uid()' in v_normalized_source) = 0
     or position('mr.scope_type=''own''' in v_normalized_source) = 0 then
    raise exception 'B9-OWN-FIX: has_scoped_permission_exact_subject is missing the exact-subject OWN predicate';
  end if;

  -- Must NEVER contain the vulnerable uncorrelated fallback shape (OWN
  -- granted merely because the caller has *some* own-student identity
  -- matching school/classroom, independent of the row/subject in question).
  if position('mr.scope_type=''own''and(' in v_normalized_source) <> 0
     and position('s2.profile_id=auth.uid()and(p_school_idisnullorse2.school_id=p_school_id)' in v_normalized_source) <> 0 then
    raise exception 'B9-OWN-FIX: the vulnerable uncorrelated OWN fallback appears to have been reintroduced';
  end if;

  -- RELATED path must remain present (Parent regression guard) and must not
  -- collapse into the OWN exact-subject predicate.
  if position('mr.scope_type=''related''' in v_normalized_source) = 0
     or position('sg.guardian_id=g.id' in v_normalized_source) = 0 then
    raise exception 'B9-OWN-FIX: has_scoped_permission_exact_subject is missing the RELATED (Parent) path';
  end if;

  -- 2. can_access_student: single block, no NULL/NULL org-wide fallback -------
  select prosrc into v_source from pg_catalog.pg_proc
  where oid = 'public.can_access_student(text,uuid,uuid)'::regprocedure;
  v_normalized_source := regexp_replace(lower(regexp_replace(v_source, '--[^' || chr(10) || chr(13) || ']*', ' ', 'g')), '[[:space:]]', '', 'g');
  if position('has_scoped_permission_exact_subject(' in v_normalized_source) = 0 then
    raise exception 'B9-OWN-FIX: can_access_student does not use has_scoped_permission_exact_subject';
  end if;
  if position('s.organization_id,null,null,s.profile_id,s.id' in v_normalized_source) <> 0 then
    raise exception 'B9-OWN-FIX: can_access_student still contains the org-wide NULL/NULL fallback block';
  end if;
  -- The function body should now contain exactly one `exists (` (single block).
  if (length(v_normalized_source) - length(replace(v_normalized_source, 'exists(', ''))) / length('exists(') > 1 then
    raise exception 'B9-OWN-FIX: can_access_student appears to still contain more than one exists() block';
  end if;

  -- 3. can_access_enrollment: uses the corrected helper ------------------------
  select prosrc into v_source from pg_catalog.pg_proc
  where oid = 'public.can_access_enrollment(text,uuid)'::regprocedure;
  v_normalized_source := regexp_replace(lower(regexp_replace(v_source, '--[^' || chr(10) || chr(13) || ']*', ' ', 'g')), '[[:space:]]', '', 'g');
  if position('has_scoped_permission_exact_subject(' in v_normalized_source) = 0 then
    raise exception 'B9-OWN-FIX: can_access_enrollment does not use has_scoped_permission_exact_subject';
  end if;

  -- 4. student_scores_select policy: uses the corrected helper -----------------
  if not exists (
    select 1 from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    where c.relname = 'student_scores' and p.polname = 'student_scores_select'
  ) then
    raise exception 'B9-OWN-FIX: student_scores_select policy is missing';
  end if;
  if position('has_scoped_permission_exact_subject' in lower((
    select pg_get_expr(p.polqual, p.polrelid) from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    where c.relname = 'student_scores' and p.polname = 'student_scores_select'
  ))) = 0 then
    raise exception 'B9-OWN-FIX: student_scores_select policy does not use has_scoped_permission_exact_subject';
  end if;

  -- 5. Regression guards: nothing else was weakened ----------------------------
  if not exists (
    select 1 from pg_catalog.pg_proc p where p.oid = 'public.has_staff_scope_permission(text,uuid,uuid,uuid)'::regprocedure and p.prosecdef
  ) then
    raise exception 'B9-OWN-FIX: has_staff_scope_permission was weakened or removed';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p where p.oid = 'public.has_permission(text,uuid,uuid,uuid,uuid,uuid)'::regprocedure and p.prosecdef
  ) then
    raise exception 'B9-OWN-FIX: has_permission (untouched by design) is missing or was weakened';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p where p.oid = 'public.list_parent_student_attendance(uuid,date,date)'::regprocedure and p.prosecdef
  ) then
    raise exception 'B9-OWN-FIX: B7 list_parent_student_attendance was weakened or removed';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p where p.oid = 'public.list_student_own_attendance(uuid,uuid,date,date)'::regprocedure and p.prosecdef
  ) then
    raise exception 'B9-OWN-FIX: B9 list_student_own_attendance was weakened or removed';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p where p.oid = 'public.can_access_report_card(text,uuid)'::regprocedure and p.prosecdef
  ) then
    raise exception 'B9-OWN-FIX: B8 can_access_report_card was weakened or removed';
  end if;
  select prosrc into v_source from pg_catalog.pg_proc where oid = 'public.can_access_report_card(text,uuid)'::regprocedure;
  v_normalized_source := regexp_replace(lower(regexp_replace(v_source, '--[^' || chr(10) || chr(13) || ']*', ' ', 'g')), '[[:space:]]', '', 'g');
  if position('s.profile_id=auth.uid()' in v_normalized_source) = 0 then
    raise exception 'B9-OWN-FIX: B8 can_access_report_card no longer double-guards Student OWN with an exact profile_id match';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p where p.oid = 'public.can_access_teaching_assignment(text,uuid)'::regprocedure and p.prosecdef
  ) then
    raise exception 'B9-OWN-FIX: can_access_teaching_assignment (Schedule visibility, intentionally untouched) was weakened or removed';
  end if;
end $$;

select 'B9 OWN-scope authorization fix validation passed' as result;
