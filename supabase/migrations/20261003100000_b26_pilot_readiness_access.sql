begin;

insert into public.permissions (code, domain, action, description)
values (
  'school.readiness.read',
  'school',
  'readiness_read',
  'Read safe, school-scoped pilot readiness summaries'
)
on conflict (code) do update
set domain = excluded.domain,
    action = excluded.action,
    description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'school.readiness.read'
where r.organization_id is null
  and r.code in ('ORG_OWNER', 'SCHOOL_ADMIN', 'PRINCIPAL')
on conflict (role_id, permission_id) do nothing;

commit;
