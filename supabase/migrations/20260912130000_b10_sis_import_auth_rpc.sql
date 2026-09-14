-- Batch 10 Phase 3A: SIS import authorization + job lifecycle + durable ref
-- RPC foundation.
--
-- Scope (Phase 3A only): internal school-authorization helper, job
-- creation RPC, validation-plan persistence RPC (atomic preview/token
-- lifecycle), durable-ref resolution/mint helpers, legacy-ref bootstrap RPC,
-- PII scrub function, and the associated function ACL hardening.
--
-- Explicitly NOT implemented here (Phase 3B): the atomic SIS domain commit
-- RPC (Students/Guardians/Staff/StudentEnrollments/ClassEnrollments/
-- StaffSchoolAssignments/StudentGuardians writes), status transitions
-- validated -> importing -> completed/failed, and storage.objects transport
-- policies. This migration contains ZERO INSERT/UPDATE statements against
-- any SIS domain table -- the only write into domain-adjacent territory is
-- INSERT into sis_import_entity_refs (for exact existing entities, during
-- legacy bootstrap), which is explicitly permitted by Phase 1/2 architecture.

begin;

-- B10-P3A-SEC-001 remediation preflight: the plan-attestation verifier below
-- requires the same pgcrypto hmac()/digest() primitives B8's report-card
-- attestation already established, plus its OWN separate Vault secret
-- (never shared with B8's b8_report_card_document_attestation_hmac). This is
-- a DEPLOYMENT PREREQUISITE (B10-D): the secret must be provisioned in
-- Supabase Vault before this migration is applied. No secret value is
-- created, printed, or committed here.
do $$
begin
  if to_regprocedure('extensions.hmac(text,text,text)') is null then
    raise exception 'B10 Phase 3A requires pgcrypto hmac(text,text,text) in the extensions schema';
  end if;
  if to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'B10 Phase 3A requires pgcrypto digest(text,text) in the extensions schema';
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'B10 Phase 3A requires Supabase Vault';
  end if;
  if (select count(*) from vault.decrypted_secrets
      where name = 'b10_sis_import_plan_attestation_hmac') <> 1
     or not exists (
       select 1 from vault.decrypted_secrets
       where name = 'b10_sis_import_plan_attestation_hmac'
         and length(decrypted_secret) >= 32
     ) then
    raise exception 'B10 Phase 3A requires the SIS import plan attestation secret in Supabase Vault (b10_sis_import_plan_attestation_hmac, distinct from B8''s secret)';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Internal school-authorization helper
-- -----------------------------------------------------------------------------

-- Not exposed to authenticated. Every other function below calls this (or
-- inlines the equivalent has_permission() checks) to prove the CALLER
-- (auth.uid()-derived, never a supplied profile id) holds the given
-- permission at the given org/school. Raises a stable, non-leaky error on
-- failure so calling RPCs can simply invoke it rather than repeat the check.
create or replace function public.assert_sis_permission_for_school(
  p_permission_code text,
  p_organization_id uuid,
  p_school_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_organization_id is null or p_school_id is null or p_permission_code is null then
    raise exception 'B10_AUTHORIZATION_DENIED';
  end if;

  if not public.has_permission(p_permission_code, p_organization_id, p_school_id) then
    raise exception 'B10_AUTHORIZATION_DENIED';
  end if;
end;
$$;

revoke all on function public.assert_sis_permission_for_school(text, uuid, uuid) from public, anon, authenticated, service_role;

-- Returns true/false rather than raising -- used where a function needs to
-- OR together several possible permissions before deciding whether to raise.
create or replace function public.has_sis_permission_for_school(
  p_permission_code text,
  p_organization_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.has_permission(p_permission_code, p_organization_id, p_school_id), false);
$$;

revoke all on function public.has_sis_permission_for_school(text, uuid, uuid) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Permission matrix helper: required import permission(s) per entity type
-- -----------------------------------------------------------------------------

-- Frozen matrix (Gate 5/11): a caller must hold EVERY permission code
-- required by an entity type actually present in the job, not merely "any
-- one" B10 import permission. StudentGuardian/StudentEnrollment/
-- ClassEnrollment/StaffSchoolAssignment require the permissions of every
-- domain they touch (Gate 19's derived-authority principle, extended to
-- import as well as the relationship tables listed below).
create or replace function public.sis_entity_import_permission_codes(p_entity_type text)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_entity_type
    when 'student' then array['student.import']
    when 'guardian' then array['guardian.import']
    when 'staff' then array['staff.import']
    when 'student_guardian' then array['student.import', 'guardian.import']
    when 'student_enrollment' then array['student.import', 'enrollment.import']
    when 'class_enrollment' then array['student.import', 'enrollment.import', 'class_enrollment.import']
    when 'staff_school_assignment' then array['staff.import', 'staff_school_assignment.import']
    else null
  end;
$$;

create or replace function public.sis_entity_export_permission_codes(p_entity_type text)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_entity_type
    when 'student' then array['student.export']
    when 'guardian' then array['guardian.export']
    when 'staff' then array['staff.export']
    when 'student_guardian' then array['student.export', 'guardian.export']
    when 'student_enrollment' then array['student.export', 'enrollment.export']
    when 'class_enrollment' then array['student.export', 'enrollment.export', 'class_enrollment.export']
    when 'staff_school_assignment' then array['staff.export', 'staff_school_assignment.export']
    else null
  end;
$$;

-- Pure/immutable, no table access, no auth check needed -- safe to expose.
grant execute on function public.sis_entity_import_permission_codes(text) to authenticated;
grant execute on function public.sis_entity_export_permission_codes(text) to authenticated;
revoke all on function public.sis_entity_import_permission_codes(text) from anon, service_role;
revoke all on function public.sis_entity_export_permission_codes(text) from anon, service_role;

-- Raises unless the caller holds every import permission required by every
-- distinct entity_type present in p_entity_types (Gate 11).
create or replace function public.assert_sis_import_permissions_for_entities(
  p_organization_id uuid,
  p_school_id uuid,
  p_entity_types text[]
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entity_type text;
  v_code text;
begin
  foreach v_entity_type in array coalesce(p_entity_types, array[]::text[])
  loop
    foreach v_code in array coalesce(public.sis_entity_import_permission_codes(v_entity_type), array[]::text[])
    loop
      perform public.assert_sis_permission_for_school(v_code, p_organization_id, p_school_id);
    end loop;
  end loop;
end;
$$;

revoke all on function public.assert_sis_import_permissions_for_entities(uuid, uuid, text[]) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Job creation RPC
-- -----------------------------------------------------------------------------

-- Accepts ONLY user-supplied upload metadata. Never accepts
-- created_by_profile_id/status/preview_version/fingerprint/token/totals --
-- all server-derived. Initial permission rule (Gate 7): caller must hold AT
-- LEAST ONE B10 import permission at the target school to create/upload a
-- job at all (enumeration-resistant minimum bar); full per-entity permission
-- coverage is enforced later, in persist_sis_import_validation, once the
-- workbook's actual entity types are known -- a job cannot become
-- confirmable until the caller holds every required permission for every
-- entity type actually present.
create or replace function public.create_sis_import_job(
  p_organization_id uuid,
  p_school_id uuid,
  p_source_filename text,
  p_source_file_hash text,
  p_template_version text
)
returns public.sis_import_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.sis_import_jobs;
begin
  if v_actor is null then
    raise exception 'B10_AUTHORIZATION_DENIED';
  end if;

  if p_organization_id is null or p_school_id is null then
    raise exception 'B10_AUTHORIZATION_DENIED';
  end if;

  if not exists (
    select 1 from public.schools s
    where s.id = p_school_id and s.organization_id = p_organization_id
  ) then
    raise exception 'B10_JOB_NOT_FOUND';
  end if;

  if not (
    public.has_sis_permission_for_school('student.import', p_organization_id, p_school_id)
    or public.has_sis_permission_for_school('guardian.import', p_organization_id, p_school_id)
    or public.has_sis_permission_for_school('staff.import', p_organization_id, p_school_id)
    or public.has_sis_permission_for_school('enrollment.import', p_organization_id, p_school_id)
    or public.has_sis_permission_for_school('class_enrollment.import', p_organization_id, p_school_id)
    or public.has_sis_permission_for_school('staff_school_assignment.import', p_organization_id, p_school_id)
  ) then
    raise exception 'B10_AUTHORIZATION_DENIED';
  end if;

  if p_source_filename is null or length(trim(p_source_filename)) = 0 then
    raise exception 'B10_FILE_INVALID';
  end if;
  if p_source_file_hash is null or length(trim(p_source_file_hash)) = 0 then
    raise exception 'B10_FILE_INVALID';
  end if;
  if p_template_version is null or length(trim(p_template_version)) = 0 then
    raise exception 'B10_FILE_INVALID';
  end if;

  insert into public.sis_import_jobs (
    organization_id, school_id, created_by_profile_id,
    source_filename, source_file_hash, source_file_asset_id,
    template_version, status
  ) values (
    p_organization_id, p_school_id, v_actor,
    trim(p_source_filename), p_source_file_hash, null,
    trim(p_template_version), 'uploaded'
  )
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.create_sis_import_job(uuid, uuid, text, text, text) from public, anon, service_role;
grant execute on function public.create_sis_import_job(uuid, uuid, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Confirmation token support
-- -----------------------------------------------------------------------------

-- Server-generated, cryptographically random opaque token. Stored only as a
-- SHA-256 hash (confirmation_token_hash); plaintext is returned exactly once
-- by persist_sis_import_validation and never persisted anywhere.
create or replace function public.generate_sis_confirmation_token()
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select encode(extensions.gen_random_bytes(32), 'hex');
$$;

revoke all on function public.generate_sis_confirmation_token() from public, anon, authenticated, service_role;

create or replace function public.hash_sis_confirmation_token(p_token text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

revoke all on function public.hash_sis_confirmation_token(text) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Trusted validation-plan attestation (B10-P3A-SEC-001 remediation)
-- -----------------------------------------------------------------------------

-- Without this, any authenticated caller could invoke
-- persist_sis_import_validation directly with fabricated rows/issues/totals
-- and under-declared entity types, and mint a valid confirmation token for a
-- plan the trusted Phase-2 TypeScript validation pipeline never produced.
-- CHECK constraints on insert only prove *syntax*, never *provenance*.
--
-- Fix: the server-side orchestration function (Phase 3C) must compute an
-- HMAC-SHA256 attestation over a canonical digest of the plan using a
-- server-only secret (never shipped to the browser), and this RPC verifies
-- that attestation BEFORE any mutation. This reuses the exact pattern
-- established by B8's report-card document attestation
-- (verify_report_card_document_attestation / b8_report_card_document_
-- attestation_hmac) but with a SEPARATE B10-specific Vault secret name and a
-- separate verification helper -- B10 and B8 secrets are never interchanged.
--
-- Canonical payload (Gate 3): rather than serialize the full p_rows/p_issues
-- JSON identically in both TypeScript and Postgres (fragile -- key ordering,
-- number formatting, etc.), the contract uses explicit SHA-256 digests of the
-- canonical Phase-2 serialization of rows/issues/totals, computed once in
-- TypeScript (sis-import.attestation.ts) and re-derived independently in SQL
-- from the exact same p_rows/p_issues/p_totals bytes this RPC is about to
-- persist -- so a caller cannot attest one payload and submit another.
--
-- v1 payload (newline-joined, mirrors B8's concat_ws contract):
--   'edusmart-sis-import-plan-v1'
--   actor_id
--   job_id
--   expected_previous_preview_version
--   normalized_plan_fingerprint
--   rows_digest      (sha256 hex of p_rows_json, the RAW canonical JSON text)
--   issues_digest    (sha256 hex of p_issues_json, the RAW canonical JSON text)
--   totals_digest    (sha256 hex of p_totals_json, the RAW canonical JSON text)
--   attestation_expires_at
--
-- p_rows_json/p_issues_json/p_totals_json are the exact canonical JSON TEXT
-- the TypeScript orchestration layer hashed client-side -- deliberately text,
-- not jsonb. Casting a jsonb value to ::text in Postgres re-serializes it
-- (reordering/reformatting), which would silently break byte-for-byte digest
-- parity with the TypeScript-computed digest; passing the raw text through
-- unmodified is what keeps SQL and TypeScript hashing the identical bytes.
--
-- Binding job_id + expected_previous_preview_version means an attestation
-- cannot be replayed against a later preview version of the SAME job (the
-- version check below already rejects stale p_expected_previous_preview_
-- version, and the attestation itself is bound to that exact expected
-- version), and cannot be reused against a DIFFERENT job (job_id is bound).
create or replace function public.verify_sis_import_plan_attestation(
  p_actor_id uuid,
  p_job_id uuid,
  p_expected_previous_preview_version integer,
  p_normalized_plan_fingerprint text,
  p_rows_json text,
  p_issues_json text,
  p_totals_json text,
  p_attestation_expires_at bigint,
  p_attestation text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_secret_count bigint;
  v_payload text;
  v_expected text;
  v_now bigint := floor(extract(epoch from clock_timestamp()))::bigint;
begin
  if p_attestation_expires_at <= v_now or p_attestation_expires_at > v_now + 300 then
    return false;
  end if;
  if p_attestation !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select count(*), min(ds.decrypted_secret)
    into v_secret_count, v_secret
  from vault.decrypted_secrets ds
  where ds.name = 'b10_sis_import_plan_attestation_hmac';

  -- Fail closed: a missing/misconfigured secret must never be treated as
  -- "attestation not required".
  if v_secret_count <> 1 or v_secret is null or length(v_secret) < 32 then
    return false;
  end if;

  v_payload := concat_ws(E'\n',
    'edusmart-sis-import-plan-v1',
    p_actor_id::text,
    p_job_id::text,
    p_expected_previous_preview_version::text,
    coalesce(p_normalized_plan_fingerprint, ''),
    encode(extensions.digest(coalesce(p_rows_json, '[]'), 'sha256'), 'hex'),
    encode(extensions.digest(coalesce(p_issues_json, '[]'), 'sha256'), 'hex'),
    encode(extensions.digest(coalesce(p_totals_json, '{}'), 'sha256'), 'hex'),
    p_attestation_expires_at::text
  );

  v_expected := encode(extensions.hmac(v_payload, v_secret, 'sha256'), 'hex');

  return v_expected = p_attestation;
end;
$$;

revoke all on function public.verify_sis_import_plan_attestation(uuid, uuid, integer, text, text, text, text, bigint, text) from public, anon, authenticated, service_role;

comment on function public.verify_sis_import_plan_attestation is
  'B10-specific plan-attestation verifier (separate Vault secret b10_sis_import_plan_attestation_hmac -- never shared with B8''s report-card attestation secret). Internal only: no PUBLIC/anon/authenticated/service_role execute. Fails closed if the secret is absent or malformed.';

-- -----------------------------------------------------------------------------
-- 6. Validation-plan persistence RPC (atomic preview/token lifecycle)
-- -----------------------------------------------------------------------------

-- Called by the Phase-3C server-side orchestration function AFTER it has run
-- the Phase-2 pure buildSisValidationPlan() engine against authoritative DB
-- snapshots. This RPC does NOT re-run duplicate detection, matching, or
-- action classification -- that logic lives entirely in Phase-2 TypeScript
-- and must not be duplicated in SQL (Gate 36). This RPC's job is narrower:
-- verify the plan's trusted-server attestation, prove authorization,
-- atomically replace the persisted plan, and mint/invalidate the
-- confirmation token according to whether the plan is blocking-error-free.
--
-- B10-P3A-SEC-001 remediation: p_entity_types is no longer accepted as a
-- separate, independently-trusted parameter -- a caller could previously
-- under-declare it (e.g. supply an empty array) to skip permission checks
-- for entity types actually present in p_rows. Entity types are now DERIVED
-- from p_rows itself inside this function and that derived set is what the
-- permission matrix is evaluated against. Similarly, resolved_entity_id
-- remains audit-only metadata (Gate 8) -- it is never treated as
-- authorization, and Phase 3B must still perform its own stale-authoritative
-- recheck before any domain write.
create or replace function public.persist_sis_import_validation(
  p_job_id uuid,
  p_expected_previous_preview_version integer,
  p_normalized_plan_fingerprint text,
  p_rows_json text,
  p_issues_json text,
  p_totals_json text,
  p_attestation_expires_at bigint,
  p_attestation text
)
returns table (job_id uuid, preview_version integer, confirmation_token text, blocking_error_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.sis_import_jobs;
  v_new_version integer;
  v_rows jsonb;
  v_issues jsonb;
  v_totals jsonb;
  v_row jsonb;
  v_row_id uuid;
  v_row_ids uuid[] := array[]::uuid[];
  v_issue jsonb;
  v_blocking_errors integer := 0;
  v_token text;
  v_token_hash text;
  v_entity_types text[];
begin
  if v_actor is null then
    raise exception 'B10_AUTHORIZATION_DENIED';
  end if;

  -- Lock the job row for the duration of this transaction (Gate 13/30/31):
  -- only one validation-persistence (or confirm, in Phase 3B) call may
  -- mutate a given job's preview state at a time.
  select * into v_job from public.sis_import_jobs where id = p_job_id for update;
  if v_job.id is null then
    raise exception 'B10_JOB_NOT_FOUND';
  end if;

  if v_job.status not in ('uploaded', 'validating', 'validated', 'failed') then
    raise exception 'B10_JOB_STATE_CONFLICT';
  end if;

  if p_expected_previous_preview_version is distinct from v_job.preview_version then
    raise exception 'B10_PREVIEW_VERSION_CONFLICT';
  end if;

  -- Trusted-plan attestation MUST be verified before any mutation, and
  -- before the (derived) permission matrix is even evaluated -- an
  -- unattested request must never learn anything about which permissions it
  -- is missing (Gate 1/9/34).
  if not public.verify_sis_import_plan_attestation(
    v_actor, p_job_id, p_expected_previous_preview_version, p_normalized_plan_fingerprint,
    p_rows_json, p_issues_json, p_totals_json, p_attestation_expires_at, p_attestation
  ) then
    raise exception 'B10_VALIDATION_PLAN_ATTESTATION_INVALID';
  end if;

  -- Only parsed into jsonb AFTER attestation succeeds: the attestation was
  -- verified against the raw text bytes above, so parsing happens strictly
  -- downstream of that check, never before it.
  v_rows := coalesce(p_rows_json, '[]')::jsonb;
  v_issues := coalesce(p_issues_json, '[]')::jsonb;
  v_totals := coalesce(p_totals_json, '{}')::jsonb;

  -- Entity types are DERIVED from v_rows -- never trusted from a separate
  -- caller-supplied parameter (B10-P3A-SEC-001, Gate 4).
  select coalesce(array_agg(distinct elem->>'entityType'), array[]::text[])
    into v_entity_types
  from jsonb_array_elements(v_rows) elem;

  -- Caller must hold every import permission required by every distinct
  -- entity type actually present in the workbook (Gate 5/11) before the plan
  -- may even be persisted -- not merely at confirm time.
  perform public.assert_sis_import_permissions_for_entities(v_job.organization_id, v_job.school_id, v_entity_types);

  -- Atomic replace: delete prior rows (cascades to issues) then insert the
  -- current set. Both happen inside this single function invocation's
  -- transaction, so a failure anywhere rolls back the entire replacement
  -- (Gate 13).
  delete from public.sis_import_job_rows where import_job_id = p_job_id;

  for v_row in select * from jsonb_array_elements(v_rows)
  loop
    if v_row->>'entityType' is null
       or v_row->>'entityType' not in (
         'student','guardian','student_guardian',
         'student_enrollment','class_enrollment',
         'staff','staff_school_assignment'
       )
    then
      raise exception 'B10_SCHEMA_HEADER_MISSING';
    end if;
    if v_row->>'action' is null or v_row->>'action' not in ('create','update','unchanged','skip','error') then
      raise exception 'B10_TYPE_INVALID';
    end if;

    insert into public.sis_import_job_rows (
      import_job_id, sheet_name, row_number, entity_type, action,
      match_key, resolved_entity_id, raw_data, normalized_data
    ) values (
      p_job_id,
      v_row->>'sheet',
      (v_row->>'rowNumber')::integer,
      v_row->>'entityType',
      v_row->>'action',
      v_row->'matchKey',
      case when v_row->>'resolvedEntityId' is not null then (v_row->>'resolvedEntityId')::uuid else null end,
      v_row->'raw',
      v_row->'normalized'
    )
    returning id into v_row_id;

    v_row_ids := v_row_ids || v_row_id;

    if v_row->>'action' = 'error' then
      v_blocking_errors := v_blocking_errors + 1;
    end if;
  end loop;

  -- Every issue MUST reference a row index within the row set actually being
  -- persisted (Gate 5): orphan issue references are silently dropped rather
  -- than accepted as free-floating, disconnected findings.
  for v_issue in select * from jsonb_array_elements(v_issues)
  loop
    if v_issue->>'severity' is null or v_issue->>'severity' not in ('error','warning','info') then
      raise exception 'B10_TYPE_INVALID';
    end if;
    if (v_issue->>'rowIndex')::integer is null
       or (v_issue->>'rowIndex')::integer < 0
       or v_row_ids is null
       or (v_issue->>'rowIndex')::integer >= array_length(v_row_ids, 1)
    then
      continue;
    end if;

    insert into public.sis_import_job_issues (
      import_job_row_id, severity, error_code, field_name, raw_value, normalized_value, message
    ) values (
      v_row_ids[(v_issue->>'rowIndex')::integer + 1],
      v_issue->>'severity',
      v_issue->>'code',
      v_issue->>'field',
      v_issue->>'rawValue',
      v_issue->>'normalizedValue',
      v_issue->>'message'
    );

    if v_issue->>'severity' = 'error' then
      v_blocking_errors := v_blocking_errors + 1;
    end if;
  end loop;

  v_new_version := v_job.preview_version + 1;

  -- Only mint a confirmation token when the plan has zero blocking errors
  -- (Gate 12), where "zero blocking errors" is the count DERIVED above from
  -- the rows/issues actually persisted -- never a caller-supplied count.
  -- confirmation_token_hash stays NULL otherwise, so Phase 3B's commit RPC
  -- can never be called against a blocking-error plan even if a stale token
  -- were somehow replayed.
  if v_blocking_errors = 0 then
    v_token := public.generate_sis_confirmation_token();
    v_token_hash := public.hash_sis_confirmation_token(v_job.id::text || ':' || v_new_version::text || ':' || v_token);
  else
    v_token := null;
    v_token_hash := null;
  end if;

  -- totals is stored as a display/summary convenience column only; it plays
  -- no role in authorization or token issuance, both of which are derived
  -- above strictly from the persisted rows/issues (Gate 7).
  update public.sis_import_jobs
  set
    normalized_plan_fingerprint = p_normalized_plan_fingerprint,
    preview_version = v_new_version,
    confirmation_token_hash = v_token_hash,
    status = 'validated',
    totals = v_totals,
    validated_at = now()
  where id = p_job_id;

  return query select v_job.id, v_new_version, v_token, v_blocking_errors;
end;
$$;

revoke all on function public.persist_sis_import_validation(uuid, integer, text, text, text, text, bigint, text) from public, anon, service_role;
grant execute on function public.persist_sis_import_validation(uuid, integer, text, text, text, text, bigint, text) to authenticated;

comment on function public.persist_sis_import_validation is
  'Persists a Phase-2-produced validation plan atomically, after verifying its server-only HMAC attestation (verify_sis_import_plan_attestation). Does not re-run duplicate detection/matching/action classification (that lives in Phase-2 TypeScript). Entity types for the permission matrix and the blocking-error count used for token issuance are both DERIVED from the persisted rows/issues, never trusted from a separate caller-supplied parameter. Mints a confirmation token bound to (job id, new preview_version) only when the derived blocking-error count is zero; the plaintext token is returned exactly once and never stored.';

-- -----------------------------------------------------------------------------
-- 7. Durable ref resolution helpers (identity lookup with authorization)
-- -----------------------------------------------------------------------------

-- Returns the existing Student mapped to p_external_ref in this
-- organization, but ONLY if the caller may legitimately operate on that
-- Student in p_school_id (school-scoped: proven via an active enrollment at
-- that school; org-scoped callers -- those who also hold the permission at
-- an org-wide/other-school context per has_permission's own semantics --
-- fall through to the plain existence check). Identity match alone is never
-- authorization (Gate 16).
create or replace function public.resolve_sis_student_ref(
  p_organization_id uuid,
  p_school_id uuid,
  p_external_ref text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
begin
  perform public.assert_sis_permission_for_school('student.import', p_organization_id, p_school_id);

  select r.student_id into v_student_id
  from public.sis_import_entity_refs r
  where r.organization_id = p_organization_id
    and r.entity_type = 'student'
    and lower(r.external_ref) = lower(p_external_ref);

  if v_student_id is null then
    return null;
  end if;

  if exists (
    select 1 from public.student_enrollments se
    where se.student_id = v_student_id
      and se.organization_id = p_organization_id
      and se.school_id = p_school_id
  ) then
    return v_student_id;
  end if;

  -- Not enrolled at the selected school: only return the mapping if the
  -- caller's authorization genuinely spans the organization at large (an
  -- ORG-scoped grant, not merely school-scoped access to p_school_id).
  if public.has_permission('student.import', p_organization_id, null) then
    return v_student_id;
  end if;

  return null;
end;
$$;

revoke all on function public.resolve_sis_student_ref(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.resolve_sis_student_ref(uuid, uuid, text) to authenticated;

create or replace function public.resolve_sis_student_nisn(
  p_organization_id uuid,
  p_school_id uuid,
  p_nisn text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
begin
  perform public.assert_sis_permission_for_school('student.import', p_organization_id, p_school_id);

  select s.id into v_student_id
  from public.students s
  where s.organization_id = p_organization_id
    and s.nisn = p_nisn;

  if v_student_id is null then
    return null;
  end if;

  if exists (
    select 1 from public.student_enrollments se
    where se.student_id = v_student_id
      and se.organization_id = p_organization_id
      and se.school_id = p_school_id
  ) then
    return v_student_id;
  end if;

  if public.has_permission('student.import', p_organization_id, null) then
    return v_student_id;
  end if;

  return null;
end;
$$;

revoke all on function public.resolve_sis_student_nisn(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.resolve_sis_student_nisn(uuid, uuid, text) to authenticated;

-- Guardian: guardian_ref ONLY (Gate 17). No phone/email/name fallback.
-- Returned only when the mapped Guardian has an active relationship to a
-- Student who is themselves legitimately accessible in p_school_id.
create or replace function public.resolve_sis_guardian_ref(
  p_organization_id uuid,
  p_school_id uuid,
  p_external_ref text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_guardian_id uuid;
begin
  perform public.assert_sis_permission_for_school('guardian.import', p_organization_id, p_school_id);

  select r.guardian_id into v_guardian_id
  from public.sis_import_entity_refs r
  where r.organization_id = p_organization_id
    and r.entity_type = 'guardian'
    and lower(r.external_ref) = lower(p_external_ref);

  if v_guardian_id is null then
    return null;
  end if;

  if exists (
    select 1
    from public.student_guardians sg
    join public.student_enrollments se on se.student_id = sg.student_id and se.organization_id = sg.organization_id
    where sg.guardian_id = v_guardian_id
      and sg.organization_id = p_organization_id
      and se.school_id = p_school_id
  ) then
    return v_guardian_id;
  end if;

  if public.has_permission('guardian.import', p_organization_id, null) then
    return v_guardian_id;
  end if;

  return null;
end;
$$;

revoke all on function public.resolve_sis_guardian_ref(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.resolve_sis_guardian_ref(uuid, uuid, text) to authenticated;

-- Staff: staff_ref, or selected-school employee_number fallback (Gate 18).
-- Returned only when the mapped Staff has an active StaffSchoolAssignment at
-- p_school_id, unless the caller has legitimate ORG scope.
create or replace function public.resolve_sis_staff_ref(
  p_organization_id uuid,
  p_school_id uuid,
  p_external_ref text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
begin
  perform public.assert_sis_permission_for_school('staff.import', p_organization_id, p_school_id);

  select r.staff_member_id into v_staff_id
  from public.sis_import_entity_refs r
  where r.organization_id = p_organization_id
    and r.entity_type = 'staff'
    and lower(r.external_ref) = lower(p_external_ref);

  if v_staff_id is null then
    return null;
  end if;

  if exists (
    select 1 from public.staff_school_assignments ssa
    where ssa.staff_member_id = v_staff_id
      and ssa.organization_id = p_organization_id
      and ssa.school_id = p_school_id
  ) then
    return v_staff_id;
  end if;

  if public.has_permission('staff.import', p_organization_id, null) then
    return v_staff_id;
  end if;

  return null;
end;
$$;

revoke all on function public.resolve_sis_staff_ref(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.resolve_sis_staff_ref(uuid, uuid, text) to authenticated;

create or replace function public.resolve_sis_staff_employee_number(
  p_organization_id uuid,
  p_school_id uuid,
  p_employee_number text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
begin
  perform public.assert_sis_permission_for_school('staff.import', p_organization_id, p_school_id);

  select ssa.staff_member_id into v_staff_id
  from public.staff_school_assignments ssa
  where ssa.organization_id = p_organization_id
    and ssa.school_id = p_school_id
    and ssa.employee_number = p_employee_number;

  return v_staff_id;
end;
$$;

revoke all on function public.resolve_sis_staff_employee_number(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.resolve_sis_staff_employee_number(uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Ref minting (internal helper -- not directly granted to authenticated)
-- -----------------------------------------------------------------------------

-- Mints a durable ref for an EXACT existing domain entity that the caller has
-- already been proven to be authorized for (by the calling function). This
-- is an internal composition primitive for the bootstrap RPC below and for
-- Phase 3B's future commit RPC -- it is NOT granted to authenticated
-- directly, so it cannot be used as a generic "mint any ref for any UUID"
-- endpoint (Gate 19).
create or replace function public.mint_sis_entity_ref(
  p_organization_id uuid,
  p_entity_type text,
  p_external_ref text,
  p_student_id uuid default null,
  p_guardian_id uuid default null,
  p_staff_member_id uuid default null,
  p_created_by_import_job_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_entity_type not in ('student', 'guardian', 'staff') then
    raise exception 'B10_TYPE_INVALID';
  end if;
  if p_external_ref is null or p_external_ref !~ '^[A-Za-z0-9-]{3,40}$' then
    raise exception 'B10_EXTERNAL_REF_INVALID_FORMAT';
  end if;

  insert into public.sis_import_entity_refs (
    organization_id, entity_type, external_ref,
    student_id, guardian_id, staff_member_id, created_by_import_job_id
  ) values (
    p_organization_id, p_entity_type, p_external_ref,
    p_student_id, p_guardian_id, p_staff_member_id, p_created_by_import_job_id
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'B10_EXTERNAL_REF_CONFLICT';
end;
$$;

revoke all on function public.mint_sis_entity_ref(uuid, text, text, uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;

-- Deterministic, collision-safe, opaque ref generator. Not derived from raw
-- UUID text (Gate 21): random hex material with a stable typed prefix.
create or replace function public.generate_sis_entity_ref(p_entity_type text)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select
    (case p_entity_type when 'student' then 'STU-' when 'guardian' then 'GRD-' when 'staff' then 'STF-' else 'REF-' end)
    || upper(encode(extensions.gen_random_bytes(6), 'hex'));
$$;

revoke all on function public.generate_sis_entity_ref(text) from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. Legacy reference bootstrap RPC
-- -----------------------------------------------------------------------------

-- Explicit, user-triggered, idempotent bulk mint of durable refs for existing
-- Students/Guardians/Staff already visible/authorized in ONE selected
-- school. Never fuzzy-matches; skips already-mapped entities; never exposes
-- raw UUIDs as external refs; retries internally on ref collision.
create or replace function public.prepare_sis_import_references(
  p_organization_id uuid,
  p_school_id uuid
)
returns table (entity_type text, minted_count integer, already_mapped_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_student record;
  v_guardian record;
  v_staff record;
  v_ref text;
  v_attempts integer;
  v_minted_student integer := 0;
  v_mapped_student integer := 0;
  v_minted_guardian integer := 0;
  v_mapped_guardian integer := 0;
  v_minted_staff integer := 0;
  v_mapped_staff integer := 0;
begin
  if v_actor is null then
    raise exception 'B10_AUTHORIZATION_DENIED';
  end if;

  perform public.assert_sis_permission_for_school('student.export', p_organization_id, p_school_id);
  perform public.assert_sis_permission_for_school('guardian.export', p_organization_id, p_school_id);
  perform public.assert_sis_permission_for_school('staff.export', p_organization_id, p_school_id);

  -- Students in scope for this school (Gate 22): distinct students with an
  -- enrollment at the selected school, not every student in the org.
  for v_student in
    select distinct s.id
    from public.students s
    join public.student_enrollments se on se.student_id = s.id and se.organization_id = s.organization_id
    where s.organization_id = p_organization_id
      and se.school_id = p_school_id
  loop
    if exists (
      select 1 from public.sis_import_entity_refs r
      where r.organization_id = p_organization_id and r.entity_type = 'student' and r.student_id = v_student.id
    ) then
      v_mapped_student := v_mapped_student + 1;
      continue;
    end if;

    v_attempts := 0;
    loop
      v_attempts := v_attempts + 1;
      v_ref := public.generate_sis_entity_ref('student');
      begin
        perform public.mint_sis_entity_ref(p_organization_id, 'student', v_ref, p_student_id := v_student.id);
        v_minted_student := v_minted_student + 1;
        exit;
      exception when others then
        if v_attempts >= 5 then
          raise;
        end if;
      end;
    end loop;
  end loop;

  -- Guardians reachable only through eligible Students at this school
  -- (Gate 23): never org-wide.
  for v_guardian in
    select distinct g.id
    from public.guardians g
    join public.student_guardians sg on sg.guardian_id = g.id and sg.organization_id = g.organization_id
    join public.student_enrollments se on se.student_id = sg.student_id and se.organization_id = sg.organization_id
    where g.organization_id = p_organization_id
      and se.school_id = p_school_id
  loop
    if exists (
      select 1 from public.sis_import_entity_refs r
      where r.organization_id = p_organization_id and r.entity_type = 'guardian' and r.guardian_id = v_guardian.id
    ) then
      v_mapped_guardian := v_mapped_guardian + 1;
      continue;
    end if;

    v_attempts := 0;
    loop
      v_attempts := v_attempts + 1;
      v_ref := public.generate_sis_entity_ref('guardian');
      begin
        perform public.mint_sis_entity_ref(p_organization_id, 'guardian', v_ref, p_guardian_id := v_guardian.id);
        v_minted_guardian := v_minted_guardian + 1;
        exit;
      exception when others then
        if v_attempts >= 5 then
          raise;
        end if;
      end;
    end loop;
  end loop;

  -- Staff assigned to this school (Gate 24): never org-wide for a
  -- school-scoped actor.
  for v_staff in
    select distinct sm.id
    from public.staff_members sm
    join public.staff_school_assignments ssa on ssa.staff_member_id = sm.id and ssa.organization_id = sm.organization_id
    where sm.organization_id = p_organization_id
      and ssa.school_id = p_school_id
  loop
    if exists (
      select 1 from public.sis_import_entity_refs r
      where r.organization_id = p_organization_id and r.entity_type = 'staff' and r.staff_member_id = v_staff.id
    ) then
      v_mapped_staff := v_mapped_staff + 1;
      continue;
    end if;

    v_attempts := 0;
    loop
      v_attempts := v_attempts + 1;
      v_ref := public.generate_sis_entity_ref('staff');
      begin
        perform public.mint_sis_entity_ref(p_organization_id, 'staff', v_ref, p_staff_member_id := v_staff.id);
        v_minted_staff := v_minted_staff + 1;
        exit;
      exception when others then
        if v_attempts >= 5 then
          raise;
        end if;
      end;
    end loop;
  end loop;

  return query values
    ('student', v_minted_student, v_mapped_student),
    ('guardian', v_minted_guardian, v_mapped_guardian),
    ('staff', v_minted_staff, v_mapped_staff);
end;
$$;

revoke all on function public.prepare_sis_import_references(uuid, uuid) from public, anon, service_role;
grant execute on function public.prepare_sis_import_references(uuid, uuid) to authenticated;

comment on function public.prepare_sis_import_references is
  'Idempotent legacy-ref bootstrap for existing Students/Guardians/Staff in ONE selected school. Never fuzzy-matches, never mints a second ref for an already-mapped entity, never exposes a raw UUID as an external ref.';

-- -----------------------------------------------------------------------------
-- 10. PII scrub function
-- -----------------------------------------------------------------------------

-- Nulls detailed per-row/issue PII for terminal jobs older than the frozen
-- 30-day support window, retaining minimized audit fields (job/sheet/row/
-- action/error_code/severity/resolved_entity_id/timestamps/totals). Does not
-- touch durable entity refs or any SIS domain table. NOT granted to
-- authenticated (Gate 27) -- this is a platform maintenance operation, not
-- application CRUD; scheduler wiring is a deployment prerequisite, not
-- implemented here.
create or replace function public.scrub_expired_sis_import_payloads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scrubbed integer := 0;
begin
  with expired_jobs as (
    select id from public.sis_import_jobs
    where status in ('completed', 'failed', 'cancelled')
      and coalesce(completed_at, validated_at, created_at) < now() - interval '30 days'
  ),
  scrubbed_rows as (
    update public.sis_import_job_rows r
    set raw_data = null, normalized_data = null
    where r.import_job_id in (select id from expired_jobs)
      and (r.raw_data is not null or r.normalized_data is not null)
    returning r.id
  )
  select count(*) into v_scrubbed from scrubbed_rows;

  update public.sis_import_job_issues i
  set raw_value = null, normalized_value = null
  where i.import_job_row_id in (
    select r.id from public.sis_import_job_rows r
    join public.sis_import_jobs j on j.id = r.import_job_id
    where j.status in ('completed', 'failed', 'cancelled')
      and coalesce(j.completed_at, j.validated_at, j.created_at) < now() - interval '30 days'
  )
  and (i.raw_value is not null or i.normalized_value is not null);

  return v_scrubbed;
end;
$$;

-- Gate 27: no scheduler role/extension is enabled here. Execution is
-- restricted to service_role, which for THIS function is a platform
-- maintenance execution path (not an application CRUD shortcut -- it has no
-- application-facing input/output, only a retention side effect). Wiring an
-- actual scheduled invocation (pg_cron or an external maintenance job) is
-- recorded as a B10-D DEPLOYMENT PREREQUISITE, not implemented in this
-- migration.
revoke all on function public.scrub_expired_sis_import_payloads() from public, anon, authenticated;
grant execute on function public.scrub_expired_sis_import_payloads() to service_role;

commit;
