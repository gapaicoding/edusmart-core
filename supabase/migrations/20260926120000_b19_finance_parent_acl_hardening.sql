-- Batch 19 Phase 2 ACL convergence. Parent billing remains authenticated-only.
begin;
revoke all on function public.b19_list_parent_billing(integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.b19_get_parent_invoice(uuid) from public, anon, authenticated, service_role;
grant execute on function public.b19_list_parent_billing(integer,integer), public.b19_get_parent_invoice(uuid) to authenticated;
commit;
