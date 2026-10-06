-- Tighten optional labels and align duplicate review with lead-manage capability.
alter table public.admission_leads
  add constraint admission_leads_source_other_length_check
    check (source_other is null or (char_length(btrim(source_other)) between 1 and 80)),
  add constraint admission_leads_channel_other_length_check
    check (channel_other is null or (char_length(btrim(channel_other)) between 1 and 80));

create or replace function public.b28_find_lead_duplicates(p_school_id uuid,p_phone text default null,p_email text default null,p_exclude_lead_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_phone text:=nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),''); v_email text:=nullif(lower(btrim(coalesce(p_email,''))),'' ); v_items jsonb;
begin
 select organization_id into v_org from public.schools where id=p_school_id;
 if v_org is null or not public.has_permission('admission.lead.manage',v_org,p_school_id) then raise exception 'B28_LEAD_NOT_FOUND'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'prospect_name',prospect_name,'status',status,'created_at',created_at)),'[]'::jsonb) into v_items
 from (select id,prospect_name,status,created_at from public.admission_leads where organization_id=v_org and school_id=p_school_id
  and id is distinct from p_exclude_lead_id
  and ((v_phone is not null and phone_normalized=v_phone) or (v_email is not null and email_normalized=v_email))
  order by created_at desc limit 10) x;
 return v_items;
end $$;
revoke all on function public.b28_find_lead_duplicates(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.b28_find_lead_duplicates(uuid,text,text,uuid) to authenticated;
