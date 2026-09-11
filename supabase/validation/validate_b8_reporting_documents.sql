-- EduSmart Core V1 — Batch 8 Reporting Document Validator
-- Postdeploy validator for R3, LIVE-002 compatibility, and LIVE-005
-- authority-preserving PDF regeneration.
--
-- This validator is read-only. It must be executed after all Batch 8 document
-- migrations, including 20260911143000_b8_report_card_document_regeneration.sql.

-- ---------------------------------------------------------------------------
-- 1. Private bucket contract
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  select count(*)
  into v_count
  from storage.buckets b
  where b.id = 'report-cards'
    and b.name = 'report-cards'
    and b.public = false
    and b.file_size_limit = 10485760
    and coalesce(b.allowed_mime_types, array[]::text[]) = array['application/pdf']::text[];

  if v_count <> 1 then
    raise exception 'B8 R3 private report-cards bucket contract incomplete';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Storage policy surface: INSERT / SELECT / orphan DELETE only
-- ---------------------------------------------------------------------------
do $$
declare
  v_insert integer;
  v_select integer;
  v_delete integer;
  v_update integer;
  v_broad integer;
begin
  select count(*) into v_insert
  from pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.cmd = 'INSERT'
    and coalesce(p.with_check, '') ilike '%report-cards%'
    and coalesce(p.with_check, '') ilike '%can_write_report_card_document_object%';

  select count(*) into v_select
  from pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.cmd = 'SELECT'
    and coalesce(p.qual, '') ilike '%report-cards%'
    and coalesce(p.qual, '') ilike '%can_read_report_card_document_object%';

  select count(*) into v_delete
  from pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.cmd = 'DELETE'
    and coalesce(p.qual, '') ilike '%report-cards%'
    and coalesce(p.qual, '') ilike '%can_delete_orphan_report_card_document_object%';

  select count(*) into v_update
  from pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.cmd = 'UPDATE'
    and (
      coalesce(p.qual, '') ilike '%report-cards%'
      or coalesce(p.with_check, '') ilike '%report-cards%'
      or p.policyname ilike '%report_card%'
    );

  select count(*) into v_broad
  from pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and (
      coalesce(p.qual, '') ilike '%report-cards%'
      or coalesce(p.with_check, '') ilike '%report-cards%'
      or p.policyname ilike '%report_card%'
    )
    and (
      p.roles::text ilike '%anon%'
      or p.roles::text ilike '%service_role%'
      or p.roles::text ilike '%public%'
    );

  if v_insert <> 1 or v_select <> 1 or v_delete <> 1 then
    raise exception 'B8 R3 Storage policy contract incomplete';
  end if;

  if v_update <> 0 then
    raise exception 'B8 R3 authenticated Report Card Storage UPDATE must remain unavailable';
  end if;

  if v_broad <> 0 then
    raise exception 'B8 R3 Report Card Storage policy exposed to a forbidden role';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Metadata uniqueness / indexes / RLS
-- ---------------------------------------------------------------------------
do $$
declare
  v_index_def text;
  v_relrowsecurity boolean;
begin
  select pg_get_indexdef(i.indexrelid)
  into v_index_def
  from pg_index i
  join pg_class idx on idx.oid = i.indexrelid
  join pg_class tbl on tbl.oid = i.indrelid
  join pg_namespace ns on ns.oid = tbl.relnamespace
  where ns.nspname = 'public'
    and tbl.relname = 'generated_documents'
    and idx.relname = 'uq_generated_documents_report_card_pdf';

  if v_index_def is null
    or v_index_def not ilike '%unique index%'
    or v_index_def not ilike '%entity_type%'
    or v_index_def not ilike '%entity_id%'
    or v_index_def not ilike '%document_type%'
    or v_index_def not ilike '%report_card%'
    or v_index_def not ilike '%report_card_pdf%'
  then
    raise exception 'B8 R3 authoritative document uniqueness index missing or weakened';
  end if;

  foreach v_index_def in array array[
    'file_assets',
    'generated_documents'
  ] loop
    select c.relrowsecurity
    into v_relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_index_def;

    if coalesce(v_relrowsecurity, false) = false then
      raise exception 'B8 R3 RLS disabled on %', v_index_def;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Core path/write contract.
-- Keep this source-text block stable because focused regression tests inspect
-- the validator itself to prevent another escaped-filename false negative.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.can_write_report_card_document_object(text)'::regprocedure)
  into v_def;

  if position('p_object_path ~' in v_def) = 0
    or position('/report-cards/' in v_def) = 0
    or position('/v[1-9][0-9]*/' in v_def) = 0
    or position('/report-card\.pdf$' in v_def) = 0
    or position('split_part(p_object_path, ''/'', 4)::uuid' in v_def) = 0
    or position('split_part(p_object_path, ''/'', 6)::uuid' in v_def) = 0
    or position('p_object_path = public.report_card_document_object_path' in v_def) = 0
    or position('status = ''published''' in v_def) = 0
    or position(
      'has_staff_scope_permission(''report_card.download'''
      in regexp_replace(v_def, '\s+', '', 'g')
    ) = 0
    -- regression marker retained for source-level test readability:
    -- has_staff_scope_permission%report_card.download
  then
    raise exception 'B8 R3 path/write contract incomplete';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. LIVE-002: persisted UUIDs are canonical PostgreSQL UUIDs; only the
-- trusted generation nonce is strict UUIDv4.
-- ---------------------------------------------------------------------------
do $$
declare
  v_sig text;
  v_proc regprocedure;
  v_def text;
  v_generic_tenant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/report-cards/';
  v_over_strict text := '[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/';
  v_generation text := '/v[1-9][0-9]*/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/report-card\.pdf$';
begin
  foreach v_sig in array array[
    'public.can_write_report_card_document_object(text)',
    'public.can_staff_download_report_card_document_object(text)',
    'public.can_read_report_card_document_object(text)',
    'public.register_report_card_document(uuid,text,bigint,text,bigint,text)'
  ] loop
    v_proc := to_regprocedure(v_sig);
    if v_proc is null then
      raise exception 'B8 LIVE-002 missing function: %', v_sig;
    end if;

    select pg_get_functiondef(v_proc) into v_def;

    if position(v_over_strict in v_def) > 0 then
      raise exception 'B8 LIVE-002 regression: RFC-version tenant UUID restriction returned in %', v_sig;
    end if;

    if position(v_generic_tenant in v_def) = 0
      or position(v_generation in v_def) = 0
      or position('public.report_card_document_object_path' in v_def) = 0
    then
      raise exception 'B8 LIVE-002 canonical path contract lost in %', v_sig;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Security definer + empty search_path + exact EXECUTE matrix
-- ---------------------------------------------------------------------------
do $$
declare
  v_sig text;
  v_proc oid;
  v_prosecdef boolean;
  v_config text[];
  v_public_exec boolean;
  v_anon_exec boolean;
  v_auth_exec boolean;
  v_service_exec boolean;
  v_should_auth boolean;
begin
  foreach v_sig in array array[
    'public.report_card_document_object_path(uuid,uuid)',
    'public.can_write_report_card_document_object(text)',
    'public.can_staff_download_report_card_document_object(text)',
    'public.can_read_report_card_document_object(text)',
    'public.can_delete_orphan_report_card_document_object(text)',
    'public.register_report_card_document(uuid,text,bigint,text,bigint,text)',
    'public.replace_report_card_document(uuid,uuid,text,bigint,text,bigint,text)'
  ] loop
    v_proc := to_regprocedure(v_sig);
    if v_proc is null then
      raise exception 'B8 R3 missing document function: %', v_sig;
    end if;

    select p.prosecdef, p.proconfig
    into v_prosecdef, v_config
    from pg_proc p
    where p.oid = v_proc;

    if not v_prosecdef
      or not exists (
        select 1
        from unnest(coalesce(v_config, array[]::text[])) cfg
        where cfg in ('search_path=', 'search_path=""')
      )
    then
      raise exception 'B8 R3 function hardening contract incomplete: %', v_sig;
    end if;

    select exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where p.oid = v_proc
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) into v_public_exec;

    v_anon_exec := has_function_privilege('anon', v_proc, 'EXECUTE');
    v_auth_exec := has_function_privilege('authenticated', v_proc, 'EXECUTE');
    v_service_exec := has_function_privilege('service_role', v_proc, 'EXECUTE');

    v_should_auth := v_sig <> 'public.report_card_document_object_path(uuid,uuid)';

    if v_public_exec or v_anon_exec or v_service_exec or v_auth_exec <> v_should_auth then
      raise exception 'B8 R3 document function ACL mismatch: %', v_sig;
    end if;
  end loop;
end;
$$;

-- Internal attestation verifier has an intentionally private signature, so
-- discover it by name instead of hard-coding its argument list.
do $$
declare
  v_proc oid;
  v_count integer;
  v_config text[];
  v_public_exec boolean;
  v_anon_exec boolean;
  v_auth_exec boolean;
  v_service_exec boolean;
begin
  select count(*), min(p.oid)
  into v_count, v_proc
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'verify_report_card_document_attestation';

  if v_count <> 1 or v_proc is null then
    raise exception 'B8 R3 attestation verifier cardinality mismatch';
  end if;

  select p.proconfig into v_config from pg_proc p where p.oid = v_proc;
  if not exists (
    select 1
    from unnest(coalesce(v_config, array[]::text[])) cfg
    where cfg in ('search_path=', 'search_path=""')
  ) then
    raise exception 'B8 R3 attestation verifier search_path is not locked';
  end if;

  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = v_proc
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_exec;

  v_anon_exec := has_function_privilege('anon', v_proc, 'EXECUTE');
  v_auth_exec := has_function_privilege('authenticated', v_proc, 'EXECUTE');
  v_service_exec := has_function_privilege('service_role', v_proc, 'EXECUTE');

  if v_public_exec or v_anon_exec or v_auth_exec or v_service_exec then
    raise exception 'B8 R3 internal attestation verifier is client executable';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Vault + HMAC authority contract
-- ---------------------------------------------------------------------------
do $$
declare
  v_secret_count integer;
  v_min_plaintext_length integer;
  v_def text;
begin
  -- required Vault predicate: length(decrypted_secret) >= 32
  select count(*), min(length(decrypted_secret))
  into v_secret_count, v_min_plaintext_length
  from vault.decrypted_secrets
  where name = 'b8_report_card_document_attestation_hmac';

  if v_secret_count <> 1 or coalesce(v_min_plaintext_length, 0) < 32 then
    raise exception 'B8 R3 document authority Vault plaintext is missing or too short';
  end if;

  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'verify_report_card_document_attestation';

  if position('vault.decrypted_secrets' in v_def) = 0
    or position('min(ds.decrypted_secret)' in v_def) = 0
    or position('extensions.hmac' in v_def) = 0
    or position('sha256' in lower(v_def)) = 0
    or position('p_actor_id' in v_def) = 0
    or position('p_report_card_id' in v_def) = 0
    or position('p_version' in v_def) = 0
    or position('p_organization_id' in v_def) = 0
    or position('p_school_id' in v_def) = 0
    or position('p_object_path' in v_def) = 0
    or position('p_size_bytes' in v_def) = 0
    or position('p_checksum' in v_def) = 0
    or position('p_attestation_expires_at' in v_def) = 0
    or v_def ilike '%select secret into%'
    or v_def ilike '%min(ds.secret)%'
  then
    raise exception 'B8 R3 document attestation contract incomplete';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Registration contract: published, permission, path, Storage object,
-- HMAC, metadata uniqueness.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(
    'public.register_report_card_document(uuid,text,bigint,text,bigint,text)'::regprocedure
  ) into v_def;

  if position('for update' in lower(v_def)) = 0
    or position('v_rc.status <> ''published''' in v_def) = 0
    or position('has_staff_scope_permission(''report_card.download''' in v_def) = 0
    or position('public.report_card_document_object_path' in v_def) = 0
    or position('public.verify_report_card_document_attestation' in v_def) = 0
    or position('from storage.objects' in lower(v_def)) = 0
    or position('application/pdf' in v_def) = 0
    or position('public.file_assets' in v_def) = 0
    or position('public.generated_documents' in v_def) = 0
  then
    raise exception 'B8 R3 document registration authority contract incomplete';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. LIVE-005 regeneration contract.
-- This is intentionally a metadata swap, never a Storage UPDATE. New bytes
-- still pass through register_report_card_document, preserving HMAC authority.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_proc oid;
  v_public_exec boolean;
  v_anon_exec boolean;
  v_auth_exec boolean;
  v_service_exec boolean;
begin
  v_proc := to_regprocedure(
    'public.replace_report_card_document(uuid,uuid,text,bigint,text,bigint,text)'
  );
  if v_proc is null then
    raise exception 'B8 LIVE-005 regeneration contract: replacement RPC missing';
  end if;

  select pg_get_functiondef(v_proc) into v_def;

  if position('p_expected_file_asset_id' in v_def) = 0
    or position('for update' in lower(v_def)) = 0
    or position('status <> ''published''' in v_def) = 0
    or position(
      'has_staff_scope_permission(''report_card.download'''
      in regexp_replace(v_def, '\s+', '', 'g')
    ) = 0
    or position('public.can_write_report_card_document_object' in v_def) = 0
    or position('delete from public.generated_documents' in lower(v_def)) = 0
    or position('delete from public.file_assets' in lower(v_def)) = 0
    or position('public.register_report_card_document' in v_def) = 0
    or position('previous_object_path' in v_def) = 0
    or position('update storage.objects' in lower(v_def)) > 0
  then
    raise exception 'B8 LIVE-005 regeneration contract incomplete';
  end if;

  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = v_proc
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_exec;

  v_anon_exec := has_function_privilege('anon', v_proc, 'EXECUTE');
  v_auth_exec := has_function_privilege('authenticated', v_proc, 'EXECUTE');
  v_service_exec := has_function_privilege('service_role', v_proc, 'EXECUTE');

  if v_public_exec or v_anon_exec or v_service_exec or not v_auth_exec then
    raise exception 'B8 LIVE-005 regeneration RPC ACL mismatch';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Authoritative metadata + Storage integrity
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from public.generated_documents gd
    join public.file_assets fa on fa.id = gd.file_asset_id
    join public.report_cards rc on rc.id = gd.entity_id
    where gd.entity_type = 'report_card'
      and gd.document_type = 'report_card_pdf'
      and (
        gd.organization_id <> rc.organization_id
        or gd.school_id <> rc.school_id
        or fa.organization_id <> rc.organization_id
        or fa.school_id <> rc.school_id
        or fa.bucket <> 'report-cards'
        or fa.mime_type <> 'application/pdf'
        or fa.status <> 'active'
        or gd.checksum !~ '^[0-9a-f]{64}$'
        or fa.size_bytes is null
        or fa.size_bytes <= 0
        or fa.size_bytes > 10485760
        or fa.object_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/report-cards/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/v[1-9][0-9]*/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/report-card\.pdf$'
        or fa.object_path <> public.report_card_document_object_path(
          rc.id,
          split_part(fa.object_path, '/', 6)::uuid
        )
      )
  ) then
    raise exception 'B8 R3 authoritative Report Card document metadata mismatch';
  end if;

  if exists (
    select 1
    from public.generated_documents gd
    where gd.entity_type = 'report_card'
      and gd.document_type = 'report_card_pdf'
    group by gd.entity_id
    having count(*) > 1
  ) then
    raise exception 'B8 R3 duplicate authoritative Report Card document metadata detected';
  end if;

  if exists (
    select 1
    from public.generated_documents gd
    join public.file_assets fa on fa.id = gd.file_asset_id
    left join storage.objects o
      on o.bucket_id = fa.bucket
     and o.name = fa.object_path
    where gd.entity_type = 'report_card'
      and gd.document_type = 'report_card_pdf'
      and (
        o.id is null
        or coalesce(o.metadata ->> 'mimetype', '') <> 'application/pdf'
        or coalesce((o.metadata ->> 'size')::bigint, -1) <> fa.size_bytes
      )
  ) then
    raise exception 'B8 R3 authoritative metadata does not match its private Storage object';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Browser/Data API metadata writes remain unavailable.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('authenticated', 'public.file_assets', 'INSERT')
    or has_table_privilege('authenticated', 'public.file_assets', 'UPDATE')
    or has_table_privilege('authenticated', 'public.file_assets', 'DELETE')
    or has_table_privilege('authenticated', 'public.generated_documents', 'INSERT')
    or has_table_privilege('authenticated', 'public.generated_documents', 'UPDATE')
    or has_table_privilege('authenticated', 'public.generated_documents', 'DELETE')
  then
    raise exception 'B8 R3 authenticated direct metadata write privilege detected';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Parent/report access dependency remains exact and academic-scoped.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.can_access_report_card(text,uuid)'::regprocedure)
  into v_def;

  if v_def not ilike '%student_guardians%'
    or v_def not ilike '%can_view_academic%'
    or v_def not ilike '%guardian%'
    or v_def not ilike '%student_enrollment%'
  then
    raise exception 'B8 R3 Parent Report Card subject binding dependency incomplete';
  end if;
end;
$$;

select 'B8 reporting document validation passed' as result;
