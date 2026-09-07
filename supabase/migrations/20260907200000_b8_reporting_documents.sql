-- Batch 8 R3: private, immutable Report Card PDF documents.

begin;

do $$
declare v_bucket storage.buckets%rowtype;
begin
  select * into v_bucket from storage.buckets where id = 'report-cards';
  if found then
    if v_bucket.public or v_bucket.file_size_limit is distinct from 10485760
       or v_bucket.allowed_mime_types is distinct from array['application/pdf']::text[] then
      raise exception 'Existing report-cards bucket does not match the private Report Card contract';
    end if;
  else
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('report-cards', 'report-cards', false, 10485760, array['application/pdf']);
  end if;
end $$;

create unique index uq_generated_documents_report_card_pdf
on public.generated_documents(entity_id, document_type)
where entity_type = 'report_card' and document_type = 'report_card_pdf';

create or replace function public.report_card_document_object_path(p_report_card_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select rc.organization_id::text || '/' || rc.school_id::text || '/report-cards/' || rc.id::text || '/v' || rc.version::text || '/report-card.pdf'
  from public.report_cards rc
  where rc.id = p_report_card_id
$$;

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
      on ce.student_enrollment_id = rc.student_enrollment_id and ce.status = 'active'
    where rc.id = case
      when p_object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/report-cards/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/v[1-9][0-9]*/report-card\.pdf$'
      then split_part(p_object_path, '/', 4)::uuid
      else null
    end
      and rc.status = 'published'
      and p_object_path = public.report_card_document_object_path(rc.id)
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
      when p_object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/report-cards/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/v[1-9][0-9]*/report-card\.pdf$'
      then split_part(p_object_path, '/', 4)::uuid
      else null
    end
      and p_object_path = public.report_card_document_object_path(rc.id)
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
    where rc.id = case
      when p_object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/report-cards/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/v[1-9][0-9]*/report-card\.pdf$'
      then split_part(p_object_path, '/', 4)::uuid
      else null
    end
      and p_object_path = public.report_card_document_object_path(rc.id)
      and public.can_access_report_card('report_card.download', rc.id)
  )
$$;

create or replace function public.can_delete_orphan_report_card_document_object(p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_write_report_card_document_object(p_object_path)
    and not exists (
      select 1 from public.file_assets fa
      where fa.bucket = 'report-cards' and fa.object_path = p_object_path
    )
$$;

create or replace function public.register_report_card_document(
  p_report_card_id uuid,
  p_size_bytes bigint,
  p_checksum text
)
returns table(generated_document_id uuid, file_asset_id uuid, object_path text, checksum text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rc public.report_cards%rowtype;
  v_path text;
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

  v_path := public.report_card_document_object_path(v_rc.id);
  select gd.id, gd.file_asset_id, gd.checksum, fa.object_path, fa.bucket,
         fa.organization_id, fa.school_id, fa.mime_type, fa.size_bytes
    into v_existing
  from public.generated_documents gd
  join public.file_assets fa on fa.id = gd.file_asset_id
  where gd.entity_type = 'report_card' and gd.entity_id = v_rc.id
    and gd.document_type = 'report_card_pdf';
  if found then
    if v_existing.checksum = p_checksum and v_existing.object_path = v_path
       and v_existing.bucket = 'report-cards'
       and v_existing.organization_id = v_rc.organization_id
       and v_existing.school_id = v_rc.school_id
       and v_existing.mime_type = 'application/pdf'
       and v_existing.size_bytes = p_size_bytes then
      return query select v_existing.id, v_existing.file_asset_id, v_path, v_existing.checksum;
      return;
    end if;
    raise exception 'An authoritative document already exists for this Report Card';
  end if;

  insert into public.file_assets(
    organization_id, school_id, storage_provider, bucket, object_path,
    original_filename, mime_type, size_bytes, uploaded_by_profile_id, status
  ) values (
    v_rc.organization_id, v_rc.school_id, 'supabase', 'report-cards', v_path,
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

  return query select v_document_id, v_file_id, v_path, p_checksum;
end
$$;

drop policy if exists report_card_documents_insert on storage.objects;
create policy report_card_documents_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'report-cards'
  and public.can_write_report_card_document_object(name)
);

drop policy if exists report_card_documents_select on storage.objects;
create policy report_card_documents_select
on storage.objects for select to authenticated
using (
  bucket_id = 'report-cards'
  and public.can_read_report_card_document_object(name)
);

drop policy if exists report_card_documents_delete_orphan on storage.objects;
create policy report_card_documents_delete_orphan
on storage.objects for delete to authenticated
using (
  bucket_id = 'report-cards'
  and public.can_delete_orphan_report_card_document_object(name)
);

revoke all on function public.report_card_document_object_path(uuid) from public, anon, authenticated, service_role;
revoke all on function public.can_write_report_card_document_object(text) from public, anon, authenticated, service_role;
revoke all on function public.can_staff_download_report_card_document_object(text) from public, anon, authenticated, service_role;
revoke all on function public.can_read_report_card_document_object(text) from public, anon, authenticated, service_role;
revoke all on function public.can_delete_orphan_report_card_document_object(text) from public, anon, authenticated, service_role;
revoke all on function public.register_report_card_document(uuid,bigint,text) from public, anon, authenticated, service_role;

grant execute on function public.can_write_report_card_document_object(text) to authenticated;
grant execute on function public.can_staff_download_report_card_document_object(text) to authenticated;
grant execute on function public.can_read_report_card_document_object(text) to authenticated;
grant execute on function public.can_delete_orphan_report_card_document_object(text) to authenticated;
grant execute on function public.register_report_card_document(uuid,bigint,text) to authenticated;

commit;
