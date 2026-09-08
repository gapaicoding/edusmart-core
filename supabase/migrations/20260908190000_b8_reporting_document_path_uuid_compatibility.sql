-- Batch 8 LIVE-002: canonical tenant document-path compatibility.
--
-- Root cause: the deployed Report Card document path contract
-- (20260907200000_b8_reporting_documents.sql) pre-filters object paths with a
-- regex that assumes every UUID segment encodes an RFC 4122 version 1-5 nibble
-- ([1-5]) and an RFC variant nibble ([89ab]).  The organization and school
-- tenant identifiers, and some historical report_card identifiers, are valid
-- PostgreSQL `uuid` values that do NOT encode an RFC application-level version
-- (for example organization a08b610f-9619-ad04-2d76-712dd0d7a537 whose third
-- group starts with `a`).  The over-strict pre-filter rejects an otherwise
-- valid tenant path before the authoritative
-- `public.report_card_document_object_path(...)` equality / `::uuid` equality /
-- `has_staff_scope_permission(...)` / published-status checks are reached, so
-- `can_staff_download_report_card_document_object(...)` returns false and no
-- official PDF can be generated or downloaded for a valid published card.
--
-- Fix: the structural pre-filter now accepts any canonical PostgreSQL UUID
-- (8-4-4-4-12 hexadecimal groups) for the persisted domain identifiers
-- (organization_id, school_id, report_card_id) while KEEPING the strict
-- UUIDv4 contract for the trusted per-generation random path segment.  All
-- authoritative bindings are unchanged: exact `::uuid` equality against the
-- authoritative `report_cards` row, full-path equality against
-- `public.report_card_document_object_path(rc.id, <generation-uuid>)` (which
-- itself derives organization/school/id/version from the row), the
-- published-only requirement, and `has_staff_scope_permission
-- ('report_card.download', ...)`.  No broad path acceptance, no alternate
-- filename, no extra/missing segment, no path traversal.
--
-- Forward-only: the two applied B8 migrations
-- (20260907160000_b8_reporting_integrity.sql,
--  20260907200000_b8_reporting_documents.sql) are immutable and untouched.
-- This migration only CREATE OR REPLACEs the four functions whose embedded
-- structural regex needs correction, then reconverges their privileges.

begin;

create or replace function public.can_write_report_card_document_object(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.report_cards rc
    left join public.class_enrollments ce
      on ce.student_enrollment_id = rc.student_enrollment_id and ce.status = 'active' and ce.is_primary
    where rc.id = case
      when p_object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/report-cards/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/v[1-9][0-9]*/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/report-card\.pdf$'
      then split_part(p_object_path, '/', 4)::uuid
      else null
    end
      and rc.status = 'published'
      and p_object_path = public.report_card_document_object_path(rc.id, split_part(p_object_path, '/', 6)::uuid)
      and public.has_staff_scope_permission('report_card.download', rc.organization_id, rc.school_id, ce.classroom_id)
  )
$$;

create or replace function public.can_staff_download_report_card_document_object(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.report_cards rc
    join public.student_enrollments se on se.id = rc.student_enrollment_id
    left join public.class_enrollments ce
      on ce.student_enrollment_id = se.id and ce.status = 'active' and ce.is_primary
    where rc.id = case
      when p_object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/report-cards/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/v[1-9][0-9]*/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/report-card\.pdf$'
      then split_part(p_object_path, '/', 4)::uuid
      else null
    end
      and p_object_path = public.report_card_document_object_path(rc.id, split_part(p_object_path, '/', 6)::uuid)
      and public.has_staff_scope_permission('report_card.download', rc.organization_id, rc.school_id, ce.classroom_id)
  )
$$;

create or replace function public.can_read_report_card_document_object(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.report_cards rc
    join public.generated_documents gd
      on gd.entity_type = 'report_card' and gd.entity_id = rc.id
     and gd.document_type = 'report_card_pdf'
    join public.file_assets fa
      on fa.id = gd.file_asset_id and fa.bucket = 'report-cards'
     and fa.object_path = p_object_path and fa.status = 'active'
    where rc.id = case
      when p_object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/report-cards/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/v[1-9][0-9]*/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/report-card\.pdf$'
      then split_part(p_object_path, '/', 4)::uuid
      else null
    end
      and p_object_path = public.report_card_document_object_path(rc.id, split_part(p_object_path, '/', 6)::uuid)
      and public.can_access_report_card('report_card.download', rc.id)
  )
$$;

create or replace function public.register_report_card_document(
  p_report_card_id uuid,
  p_object_path text,
  p_size_bytes bigint,
  p_checksum text,
  p_attestation_expires_at bigint,
  p_attestation text
)
returns table(generated_document_id uuid, file_asset_id uuid, object_path text, checksum text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rc public.report_cards%rowtype;
  v_generation_id uuid;
  v_file_id uuid;
  v_document_id uuid;
  v_existing record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_rc from public.report_cards where id = p_report_card_id for update;
  if not found then raise exception 'Report Card not found'; end if;
  if v_rc.status <> 'published' then raise exception 'Only published Report Cards can generate documents'; end if;
  if not public.can_access_report_card('report_card.download', v_rc.id)
     or not exists (
       select 1
       from public.student_enrollments se
       left join public.class_enrollments ce
         on ce.student_enrollment_id = se.id and ce.status = 'active' and ce.is_primary
       where se.id = v_rc.student_enrollment_id
         and public.has_staff_scope_permission('report_card.download', v_rc.organization_id, v_rc.school_id, ce.classroom_id)
     ) then
    raise exception 'Missing Report Card document permission';
  end if;
  if p_size_bytes <= 0 or p_size_bytes > 10485760 then raise exception 'Invalid PDF size'; end if;
  if p_checksum !~ '^[0-9a-f]{64}$' then raise exception 'Invalid PDF checksum'; end if;
  if p_object_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/report-cards/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/v[1-9][0-9]*/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/report-card\.pdf$' then
    raise exception 'Invalid Report Card document path';
  end if;
  v_generation_id := split_part(p_object_path, '/', 6)::uuid;
  if p_object_path <> public.report_card_document_object_path(v_rc.id, v_generation_id) then
    raise exception 'Report Card document path mismatch';
  end if;
  if not public.verify_report_card_document_attestation(
    auth.uid(), v_rc.id, v_rc.version, v_rc.organization_id, v_rc.school_id,
    p_object_path, p_size_bytes, p_checksum, p_attestation_expires_at, p_attestation
  ) then
    raise exception 'Invalid or expired trusted server document attestation';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'report-cards' and o.name = p_object_path
      and coalesce(o.metadata->>'mimetype','') = 'application/pdf'
      and coalesce((o.metadata->>'size')::bigint,0) = p_size_bytes
  ) then
    raise exception 'Uploaded Report Card PDF does not match the attested object';
  end if;
  select gd.id, gd.file_asset_id, gd.checksum, fa.object_path, fa.bucket,
         fa.organization_id, fa.school_id, fa.mime_type, fa.size_bytes
    into v_existing
  from public.generated_documents gd
  join public.file_assets fa on fa.id = gd.file_asset_id
  where gd.entity_type = 'report_card' and gd.entity_id = v_rc.id
    and gd.document_type = 'report_card_pdf';
  if found then
    if v_existing.checksum = p_checksum and v_existing.object_path = p_object_path
       and v_existing.bucket = 'report-cards'
       and v_existing.organization_id = v_rc.organization_id
       and v_existing.school_id = v_rc.school_id
       and v_existing.mime_type = 'application/pdf'
       and v_existing.size_bytes = p_size_bytes then
      return query select v_existing.id, v_existing.file_asset_id, p_object_path, v_existing.checksum;
      return;
    end if;
    raise exception 'An authoritative document already exists for this Report Card';
  end if;

  insert into public.file_assets(
    organization_id, school_id, storage_provider, bucket, object_path,
    original_filename, mime_type, size_bytes, uploaded_by_profile_id, status
  ) values (
    v_rc.organization_id, v_rc.school_id, 'supabase', 'report-cards', p_object_path,
    'report-card-v' || v_rc.version::text || '.pdf', 'application/pdf', p_size_bytes,
    auth.uid(), 'active'
  ) returning id into v_file_id;

  insert into public.generated_documents(
    organization_id, school_id, entity_type, entity_id, document_type,
    file_asset_id, generated_by_profile_id, checksum
  ) values (
    v_rc.organization_id, v_rc.school_id, 'report_card', v_rc.id, 'report_card_pdf',
    v_file_id, auth.uid(), p_checksum
  ) returning id into v_document_id;

  return query select v_document_id, v_file_id, p_object_path, p_checksum;
end
$$;

-- Reconverge privileges explicitly for every replaced function; do not rely on
-- privileges inherited across CREATE OR REPLACE FUNCTION.
revoke all on function public.can_write_report_card_document_object(text) from public, anon, authenticated, service_role;
revoke all on function public.can_staff_download_report_card_document_object(text) from public, anon, authenticated, service_role;
revoke all on function public.can_read_report_card_document_object(text) from public, anon, authenticated, service_role;
revoke all on function public.register_report_card_document(uuid,text,bigint,text,bigint,text) from public, anon, authenticated, service_role;

grant execute on function public.can_write_report_card_document_object(text) to authenticated;
grant execute on function public.can_staff_download_report_card_document_object(text) to authenticated;
grant execute on function public.can_read_report_card_document_object(text) to authenticated;
grant execute on function public.register_report_card_document(uuid,text,bigint,text,bigint,text) to authenticated;

-- Post-migration structural sanity: the corrected contract must accept a
-- canonical PostgreSQL UUID whose version nibble is non-RFC (here `a`) for the
-- tenant/report-card segments, keep the strict UUIDv4 requirement for the
-- generation nonce, and still reject an alternate filename / non-v4 nonce.
-- Synthetic values only -- no QA identifiers in deployed logic.
do $$
declare
  -- synthetic tenant/report-card UUIDs whose version + variant nibbles are
  -- non-RFC ('a'), proving the pre-filter no longer assumes RFC version bits.
  v_ok text := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/report-cards/cccccccc-cccc-cccc-cccc-cccccccccccc/v2/55555555-5555-4555-8555-555555555555/report-card.pdf';
  v_pat text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/report-cards/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/v[1-9][0-9]*/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/report-card\.pdf$';
begin
  if v_ok !~ v_pat then
    raise exception 'LIVE-002 remediation self-check failed: canonical tenant path rejected';
  end if;
  if replace(v_ok, '/report-card.pdf', '/summary.pdf') ~ v_pat then
    raise exception 'LIVE-002 remediation self-check failed: alternate filename accepted';
  end if;
  if replace(v_ok, '/v2/55555555-5555-4555-8555-555555555555/', '/v2/55555555-5555-1555-8555-555555555555/') ~ v_pat then
    raise exception 'LIVE-002 remediation self-check failed: non-v4 generation nonce accepted';
  end if;
end $$;

commit;
