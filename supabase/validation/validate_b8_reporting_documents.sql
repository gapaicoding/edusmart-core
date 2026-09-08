-- Run only after the pending B8 R1 and R3 migrations are deployed.
do $$
declare
  v_count bigint;
  v_name text;
  v_def text;
begin
  select count(*) into v_count from storage.buckets
  where id = 'report-cards' and name = 'report-cards' and public = false
    and file_size_limit = 10485760
    and allowed_mime_types = array['application/pdf']::text[];
  if v_count <> 1 then raise exception 'B8 R3 bucket contract failed'; end if;

  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and (roles::text like '%public%' or roles::text like '%anon%')
    and (qual ilike '%report-cards%' or with_check ilike '%report-cards%')) then
    raise exception 'B8 R3 public/anon Storage policy detected';
  end if;

  foreach v_name in array array[
    'report_card_document_object_path',
    'can_write_report_card_document_object',
    'can_staff_download_report_card_document_object',
    'can_read_report_card_document_object',
    'can_delete_orphan_report_card_document_object',
    'verify_report_card_document_attestation',
    'register_report_card_document'
  ] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=v_name and p.prosecdef
        and exists (select 1 from unnest(coalesce(p.proconfig,'{}')) cfg where cfg in ('search_path=','search_path=""'))
    ) then raise exception 'B8 R3 function contract failed: %', v_name; end if;
    if exists (
      select 1
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
      where n.nspname='public' and p.proname=v_name and a.privilege_type='EXECUTE'
        and (a.grantee=0 or exists (select 1 from pg_roles r where r.oid=a.grantee and r.rolname in ('anon','service_role')))
    ) then
      raise exception 'B8 R3 forbidden function ACL: %', v_name;
    end if;
    if v_name not in ('report_card_document_object_path','verify_report_card_document_attestation') and not exists (
      select 1
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
      where n.nspname='public' and p.proname=v_name and a.privilege_type='EXECUTE'
        and a.grantee=(select oid from pg_roles where rolname='authenticated')
    ) then raise exception 'B8 R3 authenticated function ACL missing: %', v_name; end if;
    if v_name in ('report_card_document_object_path','verify_report_card_document_attestation') and exists (
      select 1
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
      where n.nspname='public' and p.proname=v_name and a.privilege_type='EXECUTE'
        and a.grantee=(select oid from pg_roles where rolname='authenticated')
    ) then raise exception 'B8 R3 internal path helper is over-granted'; end if;
  end loop;

  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='uq_generated_documents_report_card_pdf'
    and indexdef ilike '%where%entity_type%report_card%document_type%report_card_pdf%') then
    raise exception 'B8 R3 partial document uniqueness missing';
  end if;

  foreach v_name in array array['report_card_documents_insert','report_card_documents_select','report_card_documents_delete_orphan'] loop
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname=v_name and roles @> array['authenticated']::name[]) then
      raise exception 'B8 R3 Storage policy missing: %', v_name;
    end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname like 'report_card_documents_%' and cmd='UPDATE') then
    raise exception 'B8 R3 authoritative document UPDATE policy detected';
  end if;

  select pg_get_functiondef('public.can_read_report_card_document_object(text)'::regprocedure) into v_def;
  if v_def not ilike '%can_access_report_card%report_card.download%'
     or v_def not ilike '%generated_documents%' or v_def not ilike '%file_assets%' then
    raise exception 'B8 R3 registered-document read authorization missing';
  end if;
  select pg_get_functiondef('public.can_access_report_card(text,uuid)'::regprocedure) into v_def;
  if v_def not ilike '%guardians%' or v_def not ilike '%student_guardians%'
     or v_def not ilike '%can_view_academic%' or v_def not ilike '%sg.status=''active''%'
     or v_def not ilike '%g.status=''active''%' or v_def not ilike '%rc.status=''published''%' then
    raise exception 'B8 R3 Parent download dependency is not exact/published';
  end if;
  if to_regprocedure('extensions.hmac(text,text,text)') is null or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'B8 R3 cryptographic authority capability missing';
  end if;
  if (select count(*) from vault.decrypted_secrets where name='b8_report_card_document_attestation_hmac') <> 1
     or not exists (select 1 from vault.decrypted_secrets where name='b8_report_card_document_attestation_hmac' and length(decrypted_secret)>=32) then
    raise exception 'B8 R3 document authority secret missing';
  end if;
  select pg_get_functiondef('public.register_report_card_document(uuid,text,bigint,text,bigint,text)'::regprocedure) into v_def;
  if v_def not ilike '%status <> ''published''%' or v_def not ilike '%auth.uid()%'
     or v_def not ilike '%verify_report_card_document_attestation%'
     or v_def not ilike '%p_attestation_expires_at%' or v_def not ilike '%p_object_path%'
     or v_def not ilike '%storage.objects%metadata%size%'
     or v_def not ilike '%report_card_pdf%' or v_def not ilike '%application/pdf%' then
    raise exception 'B8 R3 registration contract incomplete';
  end if;
  select pg_get_functiondef('public.verify_report_card_document_attestation(uuid,uuid,integer,uuid,uuid,text,bigint,text,bigint,text)'::regprocedure) into v_def;
  if v_def not ilike '%vault.decrypted_secrets%'
     or v_def not ilike '%min(ds.decrypted_secret)%'
     or v_def ilike '%select secret into%'
     or v_def ilike '%min(ds.secret)%'
     or v_def not ilike '%v_secret_count <> 1%'
     or v_def not ilike '%extensions.hmac%'
     or v_def not ilike '%p_report_card_id%' or v_def not ilike '%p_version%'
     or v_def not ilike '%p_organization_id%' or v_def not ilike '%p_school_id%'
     or v_def not ilike '%p_object_path%' or v_def not ilike '%p_size_bytes%'
     or v_def not ilike '%p_checksum%' or v_def not ilike '%p_actor_id%'
     or v_def not ilike '%p_attestation_expires_at%' then
    raise exception 'B8 R3 trusted server attestation binding incomplete';
  end if;
  select pg_get_functiondef('public.can_write_report_card_document_object(text)'::regprocedure) into v_def;
  if v_def not ilike '%p_object_path ~%'
     or v_def not like '%/report-cards/%'
     or v_def not like '%/v[1-9][0-9]*/%'
     or position('/report-card\.pdf$' in v_def) = 0
     or v_def not ilike '%split_part(p_object_path, ''/'', 4)::uuid%'
     or v_def not ilike '%split_part(p_object_path, ''/'', 6)::uuid%'
     or v_def not ilike '%p_object_path = public.report_card_document_object_path%'
     or v_def not ilike '%status = ''published''%'
     or v_def not ilike '%has_staff_scope_permission%report_card.download%' then
    raise exception 'B8 R3 path/write contract incomplete';
  end if;
  select pg_get_functiondef('public.report_card_document_object_path(uuid,uuid)'::regprocedure) into v_def;
  if v_def not ilike '%/v%' or v_def not ilike '%rc.version%' or v_def not ilike '%rc.id%' or v_def not ilike '%p_generation_id%' then
    raise exception 'B8 R3 version-specific path contract missing';
  end if;
  select pg_get_functiondef('public.can_read_report_card_document_object(text)'::regprocedure) into v_def;
  if v_def not ilike '%can_access_report_card%' then raise exception 'B8 R3 Parent/staff read binding missing'; end if;

  if exists (
    select 1 from public.generated_documents
    where entity_type='report_card' and document_type='report_card_pdf'
    group by entity_id, document_type having count(*) > 1
  ) then raise exception 'B8 R3 duplicate Report Card documents detected'; end if;

  if exists (
    select 1
    from public.generated_documents gd
    join public.report_cards rc on rc.id=gd.entity_id
    join public.file_assets fa on fa.id=gd.file_asset_id
    where gd.entity_type='report_card' and gd.document_type='report_card_pdf'
      and (gd.organization_id<>rc.organization_id or gd.school_id<>rc.school_id
        or fa.organization_id<>rc.organization_id or fa.school_id<>rc.school_id
        or fa.bucket<>'report-cards' or fa.mime_type<>'application/pdf'
        or fa.object_path !~ ('^' || rc.organization_id::text || '/' || rc.school_id::text || '/report-cards/' || rc.id::text || '/v' || rc.version::text || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/report-card\.pdf$')
        or gd.checksum !~ '^[0-9a-f]{64}$')
  ) then raise exception 'B8 R3 invalid Report Card document metadata detected'; end if;

  raise notice 'B8 reporting document validation passed';
end $$;
select 'B8 reporting document validation passed' as result;
