-- B17 forward hardening: closed/archived periods may only arise through
-- controlled lifecycle transitions, never as direct inserts.
begin;

create or replace function public.b17_period_row_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_resource text:=case when tg_table_name='terms' then 'term' else 'academic_year' end;
  v_org uuid; v_school uuid; v_command text; v_ay record;
begin
  if tg_op='INSERT' then
    if new.status not in ('draft','active') then
      raise exception using errcode='P0001',message='B17_INVALID_TRANSITION';
    end if;
    return new;
  end if;
  if tg_op='DELETE' then v_id:=old.id; else v_id:=new.id; end if;
  v_org:=case when tg_op='DELETE' then old.organization_id else new.organization_id end;
  v_school:=case when tg_op='DELETE' then old.school_id else new.school_id end;
  if tg_table_name='terms' then
    for v_ay in select y.id,y.status from public.academic_years y
      where y.organization_id=v_org and y.school_id=v_school and y.id in (
        case when tg_op='DELETE' then old.academic_year_id else new.academic_year_id end,
        case when tg_op='UPDATE' then old.academic_year_id else null::uuid end)
      order by y.id for share loop
      if v_ay.status in ('closed','archived') then raise exception using errcode='P0001',message='B17_ACADEMIC_YEAR_CLOSED'; end if;
    end loop;
  end if;
  if tg_op='DELETE' then
    if old.status in ('closed','archived') then raise exception using errcode='P0001',message='B17_PERIOD_CLOSED'; end if;
    return old;
  end if;
  if new.status is distinct from old.status and new.status not in ('draft','active')
     and not (old.status='active' and new.status='closed')
     and not (old.status='closed' and new.status='active') then
    raise exception using errcode='P0001',message='B17_INVALID_TRANSITION';
  end if;
  if old.status in ('closed','archived') or new.status='closed' then
    v_command:=case when old.status='closed' and new.status='active' then 'reopen_'||case when tg_table_name='terms' then 'term' else 'academic_year' end
      when old.status='active' and new.status='closed' then 'close_'||case when tg_table_name='terms' then 'term' else 'academic_year' end else null end;
    if v_command is null or not exists(select 1 from public.academic_period_command_requests c where c.actor_profile_id=auth.uid()
      and c.command_name=v_command and c.resource_type=v_resource and c.resource_id=new.id and c.status='processing'
      and mod(txid_current(),4294967296)=c.xmin::text::bigint) then
      raise exception using errcode='P0001',message='B17_PERIOD_CLOSED';
    end if;
  end if;
  return new;
end $$;

drop trigger trg_b17_academic_year_period_guard on public.academic_years;
drop trigger trg_b17_term_period_guard on public.terms;
create trigger trg_b17_academic_year_period_guard before insert or update or delete on public.academic_years for each row execute function public.b17_period_row_guard();
create trigger trg_b17_term_period_guard before insert or update or delete on public.terms for each row execute function public.b17_period_row_guard();

commit;
