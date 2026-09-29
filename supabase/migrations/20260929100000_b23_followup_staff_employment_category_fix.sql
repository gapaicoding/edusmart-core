-- B23 follow-up assignee eligibility correction.
-- B18 defines employment_status as free text; assignment status and active dates
-- determine whether a staff member currently belongs to a school.

create or replace function public.b23_validate_followup_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.staff_members sm
    join public.staff_school_assignments ssa
      on ssa.staff_member_id = sm.id
     and ssa.organization_id = sm.organization_id
    join public.profiles pr on pr.id = sm.profile_id
    where sm.organization_id = new.organization_id
      and sm.profile_id = new.assigned_profile_id
      and sm.status = 'active'
      and pr.status = 'active'
      and ssa.organization_id = new.organization_id
      and ssa.school_id = new.school_id
      and ssa.status = 'active'
      and (ssa.left_on is null or ssa.left_on >= current_date)
      and exists (
        select 1
        from public.organization_memberships om
        join public.membership_school_access msa
          on msa.membership_id = om.id
         and msa.organization_id = om.organization_id
        where om.organization_id = new.organization_id
          and om.profile_id = new.assigned_profile_id
          and om.status = 'active'
          and msa.school_id = new.school_id
          and msa.status = 'active'
      )
  ) then
    raise exception 'B23_FOLLOWUP_ASSIGNEE_INVALID';
  end if;
  return new;
end;
$$;

create or replace function public.b23_list_followup_assignees(p_school_id uuid)
returns table(profile_id uuid, full_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select s.organization_id into v_org
  from public.schools s
  where s.id = p_school_id;

  if v_org is null or not public.has_permission('admission.review', v_org, p_school_id) then
    raise exception 'B23_FOLLOWUP_NOT_FOUND';
  end if;

  return query
  select distinct pr.id, pr.full_name
  from public.staff_members sm
  join public.staff_school_assignments ssa
    on ssa.staff_member_id = sm.id
   and ssa.organization_id = sm.organization_id
  join public.profiles pr on pr.id = sm.profile_id
  where sm.organization_id = v_org
    and sm.status = 'active'
    and pr.status = 'active'
    and ssa.school_id = p_school_id
    and ssa.status = 'active'
    and (ssa.left_on is null or ssa.left_on >= current_date)
    and exists (
      select 1
      from public.organization_memberships om
      join public.membership_school_access msa
        on msa.membership_id = om.id
       and msa.organization_id = om.organization_id
      where om.organization_id = v_org
        and om.profile_id = sm.profile_id
        and om.status = 'active'
        and msa.school_id = p_school_id
        and msa.status = 'active'
    )
  order by pr.full_name;
end;
$$;
