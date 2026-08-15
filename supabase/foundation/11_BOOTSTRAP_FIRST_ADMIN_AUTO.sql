-- EduSmart SchoolOS — Bootstrap First Organization Owner (AUTO)
-- Version: 1.1
-- Prerequisites:
--   1) 07_DATABASE_SCHEMA.sql PASS
--   2) 08_RLS_POLICIES.sql PASS
--   3) 09_SEED_RBAC_PATCHED.sql PASS
--   4) 10_SEED_DEMO_SCHOOL.sql PASS
--   5) Create exactly ONE initial user in Supabase Authentication > Users
--
-- This version does NOT require you to paste your email into SQL.
-- It safely auto-selects the only Auth user in the project.
-- If 0 users exist, it stops.
-- If >1 users exist, it stops rather than guessing.

begin;

do $$
declare
  v_auth_user_count bigint;
  v_profile_id uuid;
  v_admin_email text;

  v_organization_code text := 'EDUSMART_DEMO';
  v_school_code text := 'SD_DEMO';

  v_org_id uuid;
  v_school_id uuid;
  v_membership_id uuid;
  v_role_id uuid;
begin
  select count(*) into v_auth_user_count
  from auth.users;

  if v_auth_user_count = 0 then
    raise exception
      'Belum ada Auth user. Buat 1 user terlebih dahulu di Supabase Authentication > Users, lalu jalankan script ini lagi.';
  end if;

  if v_auth_user_count > 1 then
    raise exception
      'Ditemukan % Auth users. Script AUTO tidak akan menebak admin. Gunakan versi manual 11_BOOTSTRAP_FIRST_ADMIN.sql dengan email yang dipilih.',
      v_auth_user_count;
  end if;

  select id, email
  into v_profile_id, v_admin_email
  from auth.users
  order by created_at asc
  limit 1;

  insert into public.profiles (id, full_name, status)
  select
    u.id,
    coalesce(nullif(u.raw_user_meta_data ->> 'full_name',''), u.email, 'EduSmart Admin'),
    'active'
  from auth.users u
  where u.id = v_profile_id
  on conflict (id) do update
  set status = 'active';

  select id
  into v_org_id
  from public.organizations
  where code = v_organization_code;

  if v_org_id is null then
    raise exception 'Organization code % tidak ditemukan. Pastikan 10_SEED_DEMO_SCHOOL.sql sudah PASS.',
      v_organization_code;
  end if;

  select id
  into v_school_id
  from public.schools
  where organization_id = v_org_id
    and code = v_school_code;

  if v_school_id is null then
    raise exception 'School code % tidak ditemukan di organization %. Pastikan 10_SEED_DEMO_SCHOOL.sql sudah PASS.',
      v_school_code, v_organization_code;
  end if;

  select id
  into v_membership_id
  from public.organization_memberships
  where organization_id = v_org_id
    and profile_id = v_profile_id
    and status <> 'ended'
  limit 1;

  if v_membership_id is null then
    insert into public.organization_memberships (
      organization_id,
      profile_id,
      status,
      joined_at
    ) values (
      v_org_id,
      v_profile_id,
      'active',
      now()
    )
    returning id into v_membership_id;
  else
    update public.organization_memberships
    set status = 'active',
        joined_at = coalesce(joined_at, now()),
        ended_at = null
    where id = v_membership_id;
  end if;

  insert into public.membership_school_access (
    organization_id,
    membership_id,
    school_id,
    status
  ) values (
    v_org_id,
    v_membership_id,
    v_school_id,
    'active'
  )
  on conflict (membership_id, school_id)
  do update set status = 'active';

  select id
  into v_role_id
  from public.roles
  where organization_id is null
    and code = 'ORG_OWNER';

  if v_role_id is null then
    raise exception
      'System role ORG_OWNER belum ada. Jalankan 09_SEED_RBAC_PATCHED.sql sampai PASS terlebih dahulu.';
  end if;

  if not exists (
    select 1
    from public.membership_roles
    where membership_id = v_membership_id
      and role_id = v_role_id
      and scope_type = 'ORG'
      and scope_id is null
      and (ends_at is null or ends_at > now())
  ) then
    insert into public.membership_roles (
      organization_id,
      membership_id,
      role_id,
      scope_type,
      scope_id,
      starts_at
    ) values (
      v_org_id,
      v_membership_id,
      v_role_id,
      'ORG',
      null,
      now()
    );
  end if;

  raise notice
    'Bootstrap berhasil. Admin %, Profile %, Organization %, School %, Membership %',
    v_admin_email, v_profile_id, v_org_id, v_school_id, v_membership_id;
end $$;

commit;