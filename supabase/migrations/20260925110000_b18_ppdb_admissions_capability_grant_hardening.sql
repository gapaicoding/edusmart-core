-- Forward-only correction for the frozen B18 capability matrix.
-- The applied foundation migration remains immutable.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.organization_id is null
  and r.code = 'VICE_PRINCIPAL_CURRICULUM'
  and p.code = 'admission.review'
on conflict (role_id, permission_id) do nothing;
