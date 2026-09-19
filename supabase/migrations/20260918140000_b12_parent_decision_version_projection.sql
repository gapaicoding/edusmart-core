begin;

create or replace function public.list_parent_permission_requests(
  p_page_size integer default 50,
  p_offset integer default 0
)
returns table(id uuid,title text,request_type text,status text,due_at timestamptz,expired boolean,students jsonb)
language sql security definer stable set search_path=public as $$
  select
    q.id,
    q.title,
    q.request_type,
    q.status,
    q.due_at,
    (q.status='open' and q.due_at<=transaction_timestamp()),
    jsonb_agg(jsonb_build_object(
      'recipient_id',r.id,
      'student_id',r.student_id,
      'student_name',coalesce(s.preferred_name,s.full_name,'Student'),
      'decision',d.decision,
      'owned_by_me',d.decided_by_profile_id=auth.uid(),
      'decision_version',case when d.decided_by_profile_id=auth.uid() then d.version else null end,
      'can_respond',q.status='open' and q.due_at>transaction_timestamp() and (d.id is null or d.decided_by_profile_id=auth.uid())
    ))
  from public.parent_permission_requests q
  join public.parent_permission_request_recipients r on r.request_id=q.id
  join public.students s on s.id=r.student_id
  join public.student_guardians sg on sg.student_id=r.student_id and sg.organization_id=r.organization_id and sg.status='active' and sg.can_manage_permissions
  join public.guardians g on g.id=sg.guardian_id and g.organization_id=sg.organization_id and g.profile_id=auth.uid() and g.status='active'
  join public.profiles p on p.id=g.profile_id and p.status='active'
  left join public.parent_permission_decisions d on d.request_recipient_id=r.id
  where q.status<>'draft'
  group by q.id
  order by max(q.created_at) desc
  limit least(greatest(p_page_size,1),100)
  offset greatest(p_offset,0)
$$;

create or replace function public.get_parent_permission_request(p_request_id uuid)
returns table(id uuid,title text,description text,request_type text,status text,due_at timestamptz,expired boolean,students jsonb)
language sql security definer stable set search_path=public as $$
  select
    q.id,
    q.title,
    q.description,
    q.request_type,
    q.status,
    q.due_at,
    (q.status='open' and q.due_at<=transaction_timestamp()),
    jsonb_agg(jsonb_build_object(
      'recipient_id',r.id,
      'student_id',r.student_id,
      'student_name',coalesce(s.preferred_name,s.full_name,'Student'),
      'decision',d.decision,
      'owned_by_me',d.decided_by_profile_id=auth.uid(),
      'decision_version',case when d.decided_by_profile_id=auth.uid() then d.version else null end,
      'can_respond',q.status='open' and q.due_at>transaction_timestamp() and (d.id is null or d.decided_by_profile_id=auth.uid())
    ))
  from public.parent_permission_requests q
  join public.parent_permission_request_recipients r on r.request_id=q.id
  join public.students s on s.id=r.student_id
  join public.student_guardians sg on sg.student_id=r.student_id and sg.organization_id=r.organization_id and sg.status='active' and sg.can_manage_permissions
  join public.guardians g on g.id=sg.guardian_id and g.organization_id=sg.organization_id and g.profile_id=auth.uid() and g.status='active'
  join public.profiles p on p.id=g.profile_id and p.status='active'
  left join public.parent_permission_decisions d on d.request_recipient_id=r.id
  where q.id=p_request_id and q.status<>'draft'
  group by q.id
$$;

commit;
