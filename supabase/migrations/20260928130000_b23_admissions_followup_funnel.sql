-- B23: operational follow-up for existing B18 applications.
-- Application status, decisions, conversion, and stage history remain owned by B18.

create table public.admission_followup_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  application_id uuid not null,
  assigned_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'open'
    check (status in ('open','completed','cancelled')),
  due_at timestamptz not null,
  completion_outcome text
    check (completion_outcome is null or completion_outcome in ('contacted','no_response','callback_required','documents_pending','followup_not_required')),
  completed_at timestamptz,
  cancelled_at timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  constraint admission_followup_tasks_application_fk
    foreign key (application_id, organization_id, school_id)
    references public.admission_applications(id, organization_id, school_id) on delete restrict,
  constraint admission_followup_tasks_id_scope_application_key
    unique (id, organization_id, school_id, application_id),
  constraint admission_followup_tasks_status_fields_check check (
    (status = 'open' and completion_outcome is null and completed_at is null and cancelled_at is null)
    or (status = 'completed' and completion_outcome is not null and completed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and completion_outcome is null and completed_at is null and cancelled_at is not null)
  )
);

create unique index admission_followup_one_open_task_per_application
  on public.admission_followup_tasks (application_id)
  where status = 'open';

create index idx_admission_followup_queue
  on public.admission_followup_tasks (organization_id, school_id, status, due_at, created_at desc);

create index idx_admission_followup_assignee
  on public.admission_followup_tasks (school_id, assigned_profile_id, status, due_at);

create table public.admission_followup_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  application_id uuid not null,
  task_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in ('created','updated','completed','cancelled')),
  previous_assigned_profile_id uuid references public.profiles(id) on delete restrict,
  assigned_profile_id uuid references public.profiles(id) on delete restrict,
  previous_due_at timestamptz,
  due_at timestamptz,
  completion_outcome text
    check (completion_outcome is null or completion_outcome in ('contacted','no_response','callback_required','documents_pending','followup_not_required')),
  occurred_at timestamptz not null default transaction_timestamp(),
  constraint admission_followup_activities_task_fk
    foreign key (task_id, organization_id, school_id, application_id)
    references public.admission_followup_tasks(id, organization_id, school_id, application_id) on delete restrict,
  constraint admission_followup_activities_event_fields_check check (
    (event_type = 'created' and assigned_profile_id is not null and due_at is not null and completion_outcome is null)
    or (event_type = 'updated' and completion_outcome is null)
    or (event_type = 'completed' and completion_outcome is not null)
    or (event_type = 'cancelled' and completion_outcome is null)
  )
);

create index idx_admission_followup_activities_task_time
  on public.admission_followup_activities (task_id, occurred_at, id);

create table public.admission_followup_command_requests (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  organization_id uuid not null,
  school_id uuid not null,
  application_id uuid not null,
  command text not null check (command in ('create','update','complete','cancel')),
  semantic_fingerprint text not null check (char_length(semantic_fingerprint) between 1 and 256),
  result_payload jsonb,
  created_at timestamptz not null default transaction_timestamp(),
  constraint admission_followup_command_requests_actor_request_key unique (actor_profile_id, request_id),
  constraint admission_followup_command_requests_school_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint admission_followup_command_requests_application_fk
    foreign key (application_id, organization_id, school_id)
    references public.admission_applications(id, organization_id, school_id) on delete restrict,
  constraint admission_followup_command_requests_result_bound
    check (result_payload is null or octet_length(result_payload::text) <= 16384)
);

create index idx_admission_followup_commands_scope
  on public.admission_followup_command_requests (organization_id, school_id, application_id, created_at desc);

create or replace function public.b23_touch_followup_task()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.organization_id <> old.organization_id
     or new.school_id <> old.school_id
     or new.application_id <> old.application_id
     or new.created_by_profile_id <> old.created_by_profile_id
     or new.created_at <> old.created_at then
    raise exception 'B23_FOLLOWUP_IMMUTABLE_FIELDS';
  end if;
  new.row_version := old.row_version + 1;
  new.updated_at := transaction_timestamp();
  return new;
end;
$$;

create trigger trg_admission_followup_task_touch
before update on public.admission_followup_tasks
for each row execute function public.b23_touch_followup_task();

create or replace function public.b23_reject_followup_activity_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'B23_FOLLOWUP_ACTIVITY_APPEND_ONLY';
end;
$$;

create trigger trg_admission_followup_activity_append_only
before update or delete on public.admission_followup_activities
for each row execute function public.b23_reject_followup_activity_mutation();

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
      and ssa.employment_status = 'active'
      and (ssa.left_on is null or ssa.left_on >= current_date)
      and exists (
        select 1 from public.organization_memberships om
        join public.membership_school_access msa
          on msa.membership_id = om.id and msa.organization_id = om.organization_id
        where om.organization_id = new.organization_id
          and om.profile_id = new.assigned_profile_id and om.status = 'active'
          and msa.school_id = new.school_id and msa.status = 'active'
      )
  ) then
    raise exception 'B23_FOLLOWUP_ASSIGNEE_INVALID';
  end if;
  return new;
end;
$$;

create trigger trg_admission_followup_assignee_valid
before insert or update of assigned_profile_id on public.admission_followup_tasks
for each row execute function public.b23_validate_followup_assignee();

alter table public.admission_followup_tasks enable row level security;
alter table public.admission_followup_tasks force row level security;
alter table public.admission_followup_activities enable row level security;
alter table public.admission_followup_activities force row level security;
alter table public.admission_followup_command_requests enable row level security;
alter table public.admission_followup_command_requests force row level security;

create policy b23_followup_tasks_scoped_read
  on public.admission_followup_tasks for select to authenticated
  using (public.has_permission('admission.read', organization_id, school_id));

create policy b23_followup_activities_scoped_read
  on public.admission_followup_activities for select to authenticated
  using (public.has_permission('admission.read', organization_id, school_id));

revoke all on public.admission_followup_tasks,
  public.admission_followup_activities,
  public.admission_followup_command_requests
  from public, anon, authenticated, service_role;

create or replace function public.b23_list_followup_assignees(p_school_id uuid)
returns table(profile_id uuid, full_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid;
begin
  select s.organization_id into v_org from public.schools s where s.id = p_school_id;
  if v_org is null or not public.has_permission('admission.review', v_org, p_school_id) then
    raise exception 'B23_FOLLOWUP_NOT_FOUND';
  end if;
  return query
  select distinct pr.id, pr.full_name
  from public.staff_members sm
  join public.staff_school_assignments ssa
    on ssa.staff_member_id = sm.id and ssa.organization_id = sm.organization_id
  join public.profiles pr on pr.id = sm.profile_id
  where sm.organization_id = v_org and sm.status = 'active'
    and pr.status = 'active'
    and ssa.school_id = p_school_id and ssa.status = 'active'
    and ssa.employment_status = 'active'
    and (ssa.left_on is null or ssa.left_on >= current_date)
    and exists (
      select 1 from public.organization_memberships om
      join public.membership_school_access msa
        on msa.membership_id = om.id and msa.organization_id = om.organization_id
      where om.organization_id = v_org and om.profile_id = sm.profile_id
        and om.status = 'active' and msa.school_id = p_school_id and msa.status = 'active'
    )
  order by pr.full_name;
end;
$$;

create or replace function public.b23_get_admission_funnel(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_cycle record; v_result jsonb;
begin
  select c.organization_id, c.school_id into v_cycle
  from public.admission_cycles c where c.id = p_cycle_id;
  if not found or not public.has_permission('admission.read', v_cycle.organization_id, v_cycle.school_id) then
    raise exception 'B23_FOLLOWUP_NOT_FOUND';
  end if;
  select jsonb_build_object(
    'total', count(*),
    'submitted', count(*) filter (where a.status = 'submitted'),
    'under_review', count(*) filter (where a.status = 'under_review'),
    'accepted', count(*) filter (where a.status = 'accepted'),
    'rejected', count(*) filter (where a.status = 'rejected'),
    'withdrawn', count(*) filter (where a.status = 'withdrawn'),
    'converted', count(*) filter (where a.status = 'converted')
  ) into v_result
  from public.admission_applications a where a.admission_cycle_id = p_cycle_id;
  return v_result;
end;
$$;

create or replace function public.b23_list_followup_tasks(
  p_cycle_id uuid,
  p_filter text default 'open',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_cycle record; v_result jsonb; v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100); v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  select c.organization_id, c.school_id into v_cycle
  from public.admission_cycles c where c.id = p_cycle_id;
  if not found or not public.has_permission('admission.read', v_cycle.organization_id, v_cycle.school_id) then
    raise exception 'B23_FOLLOWUP_NOT_FOUND';
  end if;
  if p_filter is null or p_filter not in ('open','overdue','mine','all') then raise exception 'B23_FOLLOWUP_VALIDATION_FAILED'; end if;
  if p_filter = 'mine' and auth.uid() is null then raise exception 'B23_FOLLOWUP_FORBIDDEN'; end if;
  with filtered as materialized (
    select t.id, t.application_id, t.assigned_profile_id, assigned.full_name as assigned_name,
      t.status, t.due_at,
      t.completion_outcome, t.completed_at, t.cancelled_at, t.row_version, t.created_at,
      a.application_number, a.applicant_full_name, a.status as application_status
    from public.admission_followup_tasks t
    join public.admission_applications a
      on a.id = t.application_id and a.organization_id = t.organization_id and a.school_id = t.school_id
    join public.profiles assigned on assigned.id = t.assigned_profile_id
    where t.organization_id = v_cycle.organization_id
      and t.school_id = v_cycle.school_id
      and a.admission_cycle_id = p_cycle_id
      and (p_filter = 'all' or t.status = 'open')
      and (p_filter <> 'overdue' or t.due_at < transaction_timestamp())
      and (p_filter <> 'mine' or t.assigned_profile_id = auth.uid())
  ), page as (
    select * from filtered order by due_at, created_at desc limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page) order by page.due_at, page.created_at desc) from page), '[]'::jsonb),
    'total', (select count(*) from filtered)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.b23_get_followup_application(p_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_app record; v_task jsonb; v_latest_task jsonb; v_activities jsonb;
begin
  select a.id, a.organization_id, a.school_id into v_app
  from public.admission_applications a where a.id = p_application_id;
  if not found or not public.has_permission('admission.read', v_app.organization_id, v_app.school_id) then
    raise exception 'B23_FOLLOWUP_NOT_FOUND';
  end if;
  select jsonb_build_object(
    'id', t.id, 'application_id', t.application_id, 'assigned_profile_id', t.assigned_profile_id,
    'assigned_name', pr.full_name, 'status', t.status, 'due_at', t.due_at,
    'completion_outcome', t.completion_outcome, 'completed_at', t.completed_at,
    'cancelled_at', t.cancelled_at, 'row_version', t.row_version, 'created_at', t.created_at
  ) into v_task
  from public.admission_followup_tasks t
  join public.profiles pr on pr.id = t.assigned_profile_id
  where t.application_id = v_app.id and t.organization_id = v_app.organization_id
    and t.school_id = v_app.school_id and t.status = 'open'
  order by t.created_at desc limit 1;
  select jsonb_build_object(
    'id', t.id, 'application_id', t.application_id, 'assigned_profile_id', t.assigned_profile_id,
    'assigned_name', pr.full_name, 'status', t.status, 'due_at', t.due_at,
    'completion_outcome', t.completion_outcome, 'completed_at', t.completed_at,
    'cancelled_at', t.cancelled_at, 'row_version', t.row_version, 'created_at', t.created_at
  ) into v_latest_task
  from public.admission_followup_tasks t
  join public.profiles pr on pr.id = t.assigned_profile_id
  where t.application_id = v_app.id and t.organization_id = v_app.organization_id
    and t.school_id = v_app.school_id
  order by t.created_at desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'task_id', h.task_id, 'event_type', h.event_type,
    'actor_name', actor.full_name, 'previous_assignee_name', previous_assignee.full_name,
    'assignee_name', assigned.full_name, 'previous_due_at', h.previous_due_at,
    'due_at', h.due_at, 'completion_outcome', h.completion_outcome, 'occurred_at', h.occurred_at
  ) order by h.occurred_at, h.id), '[]'::jsonb) into v_activities
  from public.admission_followup_activities h
  join public.profiles actor on actor.id = h.actor_profile_id
  left join public.profiles previous_assignee on previous_assignee.id = h.previous_assigned_profile_id
  left join public.profiles assigned on assigned.id = h.assigned_profile_id
  where h.application_id = v_app.id and h.organization_id = v_app.organization_id and h.school_id = v_app.school_id;
  return jsonb_build_object('active_task', v_task, 'latest_task', v_latest_task, 'activities', v_activities);
end;
$$;

create or replace function public.b23_followup_command(
  p_application_id uuid,
  p_task_id uuid,
  p_expected_row_version bigint,
  p_request_id uuid,
  p_command text,
  p_assigned_profile_id uuid default null,
  p_due_at timestamptz default null,
  p_completion_outcome text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app record; v_task public.admission_followup_tasks%rowtype; v_existing record;
  v_fingerprint text; v_result jsonb; v_previous_assignee uuid; v_previous_due timestamptz;
  v_actor uuid := auth.uid(); v_event text;
begin
  if v_actor is null or p_request_id is null or p_command is null
    or p_command not in ('create','update','complete','cancel') then
    raise exception 'B23_FOLLOWUP_VALIDATION_FAILED';
  end if;
  if p_application_id is null then raise exception 'B23_FOLLOWUP_VALIDATION_FAILED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor::text || p_request_id::text, 0)
  );

  -- Serialize all task creation for the application; the partial unique index is the backstop.
  select a.* into v_app from public.admission_applications a
  where a.id = p_application_id for update;
  if not found or not public.has_permission('admission.review', v_app.organization_id, v_app.school_id) then
    raise exception 'B23_FOLLOWUP_NOT_FOUND';
  end if;
  v_fingerprint := md5(concat_ws('|', p_application_id::text, coalesce(p_task_id::text,''),
    coalesce(p_expected_row_version::text,''), p_command,
    coalesce(p_assigned_profile_id::text,''), coalesce(p_due_at::text,''), coalesce(p_completion_outcome,'')));
  select r.semantic_fingerprint, r.result_payload into v_existing
  from public.admission_followup_command_requests r
  where r.actor_profile_id = v_actor and r.request_id = p_request_id;
  if found then
    if v_existing.semantic_fingerprint <> v_fingerprint then raise exception 'B23_FOLLOWUP_REQUEST_CONFLICT'; end if;
    return v_existing.result_payload;
  end if;

  if p_command = 'create' and v_app.status not in ('submitted','under_review','accepted') then
    raise exception 'B23_FOLLOWUP_APPLICATION_TERMINAL';
  end if;

  if p_command = 'create' then
    if p_task_id is not null or p_expected_row_version is not null
      or p_assigned_profile_id is null or p_due_at is null or p_completion_outcome is not null then
      raise exception 'B23_FOLLOWUP_VALIDATION_FAILED';
    end if;
    if exists (select 1 from public.admission_followup_tasks t where t.application_id = v_app.id and t.status = 'open') then
      raise exception 'B23_FOLLOWUP_ACTIVE_EXISTS';
    end if;
    insert into public.admission_followup_tasks(organization_id, school_id, application_id,
      assigned_profile_id, created_by_profile_id, due_at)
    values (v_app.organization_id, v_app.school_id, v_app.id, p_assigned_profile_id, v_actor, p_due_at)
    returning * into v_task;
    insert into public.admission_followup_activities(organization_id, school_id, application_id, task_id,
      actor_profile_id, event_type, assigned_profile_id, due_at)
    values (v_app.organization_id, v_app.school_id, v_app.id, v_task.id, v_actor, 'created', v_task.assigned_profile_id, v_task.due_at);
    v_event := 'created';
  else
    if p_task_id is null or p_expected_row_version is null then raise exception 'B23_FOLLOWUP_VALIDATION_FAILED'; end if;
    select t.* into v_task from public.admission_followup_tasks t
    where t.id = p_task_id and t.application_id = v_app.id
      and t.organization_id = v_app.organization_id and t.school_id = v_app.school_id
    for update;
    if not found then raise exception 'B23_FOLLOWUP_NOT_FOUND'; end if;
    if v_task.row_version <> p_expected_row_version then raise exception 'B23_FOLLOWUP_STALE_VERSION'; end if;
    if v_task.status <> 'open' then raise exception 'B23_FOLLOWUP_NOT_OPEN'; end if;
    v_previous_assignee := v_task.assigned_profile_id;
    v_previous_due := v_task.due_at;
    if p_command = 'update' then
      if (p_assigned_profile_id is null and p_due_at is null) or p_completion_outcome is not null then
        raise exception 'B23_FOLLOWUP_VALIDATION_FAILED';
      end if;
      if coalesce(p_assigned_profile_id, v_task.assigned_profile_id) = v_task.assigned_profile_id
        and coalesce(p_due_at, v_task.due_at) = v_task.due_at then
        raise exception 'B23_FOLLOWUP_NO_CHANGE';
      end if;
      update public.admission_followup_tasks set
        assigned_profile_id = coalesce(p_assigned_profile_id, assigned_profile_id),
        due_at = coalesce(p_due_at, due_at)
      where id = v_task.id returning * into v_task;
      insert into public.admission_followup_activities(organization_id, school_id, application_id, task_id,
        actor_profile_id, event_type, previous_assigned_profile_id, assigned_profile_id, previous_due_at, due_at)
      values (v_app.organization_id, v_app.school_id, v_app.id, v_task.id, v_actor, 'updated',
        v_previous_assignee, v_task.assigned_profile_id, v_previous_due, v_task.due_at);
      v_event := 'updated';
    elsif p_command = 'complete' then
      if p_assigned_profile_id is not null or p_due_at is not null or p_completion_outcome is null
        or p_completion_outcome not in ('contacted','no_response','callback_required','documents_pending','followup_not_required') then
        raise exception 'B23_FOLLOWUP_VALIDATION_FAILED';
      end if;
      update public.admission_followup_tasks set status = 'completed', completion_outcome = p_completion_outcome,
        completed_at = transaction_timestamp()
      where id = v_task.id returning * into v_task;
      insert into public.admission_followup_activities(organization_id, school_id, application_id, task_id,
        actor_profile_id, event_type, completion_outcome)
      values (v_app.organization_id, v_app.school_id, v_app.id, v_task.id, v_actor, 'completed', v_task.completion_outcome);
      v_event := 'completed';
    else
      if p_assigned_profile_id is not null or p_due_at is not null or p_completion_outcome is not null then
        raise exception 'B23_FOLLOWUP_VALIDATION_FAILED';
      end if;
      update public.admission_followup_tasks set status = 'cancelled', cancelled_at = transaction_timestamp()
      where id = v_task.id returning * into v_task;
      insert into public.admission_followup_activities(organization_id, school_id, application_id, task_id,
        actor_profile_id, event_type)
      values (v_app.organization_id, v_app.school_id, v_app.id, v_task.id, v_actor, 'cancelled');
      v_event := 'cancelled';
    end if;
  end if;

  v_result := jsonb_build_object(
    'task', jsonb_build_object(
      'id', v_task.id, 'application_id', v_task.application_id,
      'assigned_profile_id', v_task.assigned_profile_id, 'status', v_task.status,
      'due_at', v_task.due_at, 'completion_outcome', v_task.completion_outcome,
      'completed_at', v_task.completed_at, 'cancelled_at', v_task.cancelled_at,
      'row_version', v_task.row_version, 'created_at', v_task.created_at
    ),
    'event_type', v_event
  );
  insert into public.admission_followup_command_requests(actor_profile_id, request_id, organization_id,
    school_id, application_id, command, semantic_fingerprint, result_payload)
  values (v_actor, p_request_id, v_app.organization_id, v_app.school_id, v_app.id, p_command, v_fingerprint, v_result);
  return v_result;
end;
$$;

revoke all on function public.b23_list_followup_assignees(uuid) from public, anon, authenticated, service_role;
revoke all on function public.b23_get_admission_funnel(uuid) from public, anon, authenticated, service_role;
revoke all on function public.b23_list_followup_tasks(uuid,text,integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.b23_get_followup_application(uuid) from public, anon, authenticated, service_role;
revoke all on function public.b23_followup_command(uuid,uuid,bigint,uuid,text,uuid,timestamptz,text) from public, anon, authenticated, service_role;
revoke all on function public.b23_touch_followup_task() from public, anon, authenticated, service_role;
revoke all on function public.b23_reject_followup_activity_mutation() from public, anon, authenticated, service_role;
revoke all on function public.b23_validate_followup_assignee() from public, anon, authenticated, service_role;

grant execute on function public.b23_list_followup_assignees(uuid) to authenticated;
grant execute on function public.b23_get_admission_funnel(uuid) to authenticated;
grant execute on function public.b23_list_followup_tasks(uuid,text,integer,integer) to authenticated;
grant execute on function public.b23_get_followup_application(uuid) to authenticated;
grant execute on function public.b23_followup_command(uuid,uuid,bigint,uuid,text,uuid,timestamptz,text) to authenticated;

comment on table public.admission_followup_tasks is
  'B23 operational follow-up for existing B18 applications; never owns application lifecycle.';
comment on table public.admission_followup_activities is
  'B23 append-only audit events for follow-up task changes; contains no free-form contact notes.';
