begin;

-- B8-LIVE-005
-- Allow an already-published Report Card PDF to be regenerated without
-- granting Storage UPDATE or weakening the existing HMAC authority model.
--
-- The caller first uploads a freshly generated PDF to a new random UUIDv4
-- object path using the existing INSERT policy. This function then atomically:
--   1. locks the published Report Card + current authoritative document,
--   2. verifies the caller still points at that exact current file asset,
--   3. removes the old metadata rows inside the transaction,
--   4. delegates all new-byte/path/HMAC/Storage validation to the already
--      audited register_report_card_document(...) function,
--   5. returns the previous object path so the application can delete that
--      now-orphaned Storage object through the existing orphan-only policy.
--
-- If registration fails, PostgreSQL rolls the metadata deletion back, so the
-- previous authoritative document remains intact.

create or replace function public.replace_report_card_document(
  p_report_card_id uuid,
  p_expected_file_asset_id uuid,
  p_object_path text,
  p_size_bytes bigint,
  p_checksum text,
  p_attestation_expires_at bigint,
  p_attestation text
)
returns table (
  generated_document_id uuid,
  file_asset_id uuid,
  object_path text,
  checksum text,
  previous_object_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rc public.report_cards%rowtype;
  v_old_generated_document_id uuid;
  v_old_file_asset_id uuid;
  v_old_object_path text;
  v_old_bucket text;
  v_old_mime_type text;
  v_old_status text;
  v_old_organization_id uuid;
  v_old_school_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select rc.*
  into v_rc
  from public.report_cards rc
  where rc.id = p_report_card_id
  for update;

  if not found then
    raise exception 'Report Card not found';
  end if;

  if v_rc.status <> 'published' then
    raise exception 'Only a published Report Card can regenerate an official PDF';
  end if;

  if not public.has_staff_scope_permission(
    'report_card.download',
    v_rc.organization_id,
    v_rc.school_id
  ) then
    raise exception 'Missing report_card.download permission';
  end if;

  select
    gd.id,
    gd.file_asset_id,
    fa.object_path,
    fa.bucket,
    fa.mime_type,
    fa.status,
    fa.organization_id,
    fa.school_id
  into
    v_old_generated_document_id,
    v_old_file_asset_id,
    v_old_object_path,
    v_old_bucket,
    v_old_mime_type,
    v_old_status,
    v_old_organization_id,
    v_old_school_id
  from public.generated_documents gd
  join public.file_assets fa
    on fa.id = gd.file_asset_id
  where gd.entity_type = 'report_card'
    and gd.entity_id = v_rc.id
    and gd.document_type = 'report_card_pdf'
  for update of gd, fa;

  if not found then
    raise exception 'No authoritative Report Card PDF exists to regenerate';
  end if;

  if v_old_file_asset_id <> p_expected_file_asset_id then
    raise exception 'The authoritative Report Card PDF changed. Refresh and retry regeneration';
  end if;

  if v_old_organization_id <> v_rc.organization_id
    or v_old_school_id <> v_rc.school_id
    or v_old_bucket <> 'report-cards'
    or v_old_mime_type <> 'application/pdf'
    or v_old_status <> 'active'
  then
    raise exception 'The existing Report Card document metadata is inconsistent';
  end if;

  if not public.can_staff_download_report_card_document_object(v_old_object_path) then
    raise exception 'The existing Report Card document path is not authorized';
  end if;

  if p_object_path = v_old_object_path then
    raise exception 'Regeneration requires a fresh document object path';
  end if;

  -- Structural/published/staff checks for the new random path are enforced
  -- before the old metadata is touched. The nested registration below repeats
  -- the authoritative checks and additionally verifies the HMAC + Storage row.
  if not public.can_write_report_card_document_object(p_object_path) then
    raise exception 'The replacement Report Card document path is not authorized';
  end if;

  -- Remove only the exact current authority metadata. The Storage object is
  -- intentionally not deleted here; after commit it is an orphan and can be
  -- removed through report_card_documents_delete_orphan.
  delete from public.generated_documents gd
  where gd.id = v_old_generated_document_id
    and gd.file_asset_id = v_old_file_asset_id;

  if not found then
    raise exception 'The authoritative Report Card PDF changed. Refresh and retry regeneration';
  end if;

  delete from public.file_assets fa
  where fa.id = v_old_file_asset_id
    and fa.object_path = v_old_object_path;

  if not found then
    raise exception 'The authoritative Report Card file metadata changed. Refresh and retry regeneration';
  end if;

  return query
  select
    registered.generated_document_id,
    registered.file_asset_id,
    registered.object_path,
    registered.checksum,
    v_old_object_path
  from public.register_report_card_document(
    p_report_card_id,
    p_object_path,
    p_size_bytes,
    p_checksum,
    p_attestation_expires_at,
    p_attestation
  ) registered;

  if not found then
    raise exception 'Replacement Report Card document registration returned no result';
  end if;
end;
$$;

revoke all on function public.replace_report_card_document(
  uuid, uuid, text, bigint, text, bigint, text
) from public, anon, authenticated, service_role;

grant execute on function public.replace_report_card_document(
  uuid, uuid, text, bigint, text, bigint, text
) to authenticated;

comment on function public.replace_report_card_document(
  uuid, uuid, text, bigint, text, bigint, text
) is
'Atomically replaces authoritative metadata for an existing published Report Card PDF by delegating new artifact verification/registration to register_report_card_document. The previous Storage object is returned as an orphan for caller-scoped cleanup.';

-- Migration-time structural guard. This does not mutate business data.
do $$
declare
  v_proc oid;
  v_def text;
  v_config text[];
  v_public_exec boolean;
  v_anon_exec boolean;
  v_authenticated_exec boolean;
  v_service_exec boolean;
begin
  v_proc := to_regprocedure(
    'public.replace_report_card_document(uuid,uuid,text,bigint,text,bigint,text)'
  );

  if v_proc is null then
    raise exception 'B8-LIVE-005: replace_report_card_document was not created';
  end if;

  select pg_get_functiondef(v_proc), p.proconfig
  into v_def, v_config
  from pg_proc p
  where p.oid = v_proc;

  if position('SECURITY DEFINER' in upper(v_def)) = 0
    or not exists (
      select 1
      from unnest(coalesce(v_config, array[]::text[])) cfg
      where cfg in ('search_path=', 'search_path=""')
    )
  then
    raise exception 'B8-LIVE-005: replacement RPC hardening contract incomplete';
  end if;

  if position('p_expected_file_asset_id' in v_def) = 0
    or position('for update' in lower(v_def)) = 0
    or position('delete from public.generated_documents' in lower(v_def)) = 0
    or position('delete from public.file_assets' in lower(v_def)) = 0
    or position('public.register_report_card_document' in v_def) = 0
    or position('previous_object_path' in v_def) = 0
  then
    raise exception 'B8-LIVE-005: replacement RPC atomic authority contract incomplete';
  end if;

  select
    has_function_privilege('anon', v_proc, 'EXECUTE'),
    has_function_privilege('authenticated', v_proc, 'EXECUTE'),
    has_function_privilege('service_role', v_proc, 'EXECUTE')
  into v_anon_exec, v_authenticated_exec, v_service_exec;

  select exists (
    select 1
    from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = v_proc
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )
  into v_public_exec
  from pg_proc p
  where p.oid = v_proc;

  if v_public_exec or v_anon_exec or v_service_exec or not v_authenticated_exec then
    raise exception 'B8-LIVE-005: replacement RPC ACL contract incomplete';
  end if;
end;
$$;

commit;