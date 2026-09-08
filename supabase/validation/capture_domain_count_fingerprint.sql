-- Non-sensitive aggregate fingerprint for before/after remote validation proof.
-- Counts only; no tenant, member, user, or business row values are returned.
begin transaction read only;

select
  (select count(*) from public.organizations) as organizations,
  (select count(*) from public.schools) as schools,
  (select count(*) from public.organization_memberships) as organization_memberships,
  (select count(*) from public.students) as students,
  (select count(*) from public.staff_members) as staff_members,
  (select count(*) from public.membership_roles) as membership_roles,
  (select count(*) from public.teaching_assignments) as teaching_assignments,
  (select count(*) from public.timetable_entries) as timetable_entries;

rollback;
