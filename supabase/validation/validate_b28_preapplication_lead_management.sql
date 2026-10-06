-- Read-only B28 schema, RLS, history, and command-boundary validator.
do $$
declare t text; f text; p oid; def text;
begin
 foreach t in array array['admission_leads','admission_lead_activities','admission_lead_command_requests'] loop
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname=t and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception 'B28_RLS:%',t;
  end if;
  if has_table_privilege('anon',to_regclass('public.'||t),'select') or has_table_privilege('anon',to_regclass('public.'||t),'insert')
   or has_table_privilege('authenticated',to_regclass('public.'||t),'insert') or has_table_privilege('authenticated',to_regclass('public.'||t),'update')
   or has_table_privilege('authenticated',to_regclass('public.'||t),'delete') then raise exception 'B28_DIRECT_WRITE:%',t; end if;
 end loop;
 if not exists(select 1 from pg_constraint where conrelid='public.admission_leads'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%NEW%CONTACTED%QUALIFIED%CONVERTED%CLOSED%') then raise exception 'B28_LIFECYCLE'; end if;
 if not exists(select 1 from pg_constraint where conrelid='public.admission_leads'::regclass and conname='admission_leads_application_fk') then raise exception 'B28_APPLICATION_SCOPE_FK'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.admission_lead_activities'::regclass and tgname='trg_b28_lead_activity_append_only' and not tgisinternal) then raise exception 'B28_HISTORY_IMMUTABILITY'; end if;
 if not exists(select 1 from pg_policy where polrelid='public.admission_leads'::regclass and polname='b28_admission_leads_read' and polcmd='r') then raise exception 'B28_READ_POLICY'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name like 'admission_lead_%' and (column_name ilike '%secret%' or column_name ilike '%token%' or column_name ilike '%raw%')) then raise exception 'B28_UNSAFE_COLUMN'; end if;
 foreach f in array array[
  'public.b28_list_admission_leads(uuid,text,text,text,uuid,boolean,text,integer,integer,text)',
  'public.b28_get_admission_lead(uuid)','public.b28_list_lead_assignees(uuid)',
  'public.b28_find_lead_duplicates(uuid,text,text,uuid)','public.b28_create_admission_lead(uuid,uuid,jsonb)',
  'public.b28_admission_lead_command(uuid,bigint,uuid,text,jsonb)','public.b28_convert_admission_lead(uuid,bigint,uuid,jsonb)'] loop
  select p.oid into p from pg_proc p where p.oid=to_regprocedure(f) and p.prosecdef and p.proconfig @> array['search_path=""'];
  if p is null then raise exception 'B28_FUNCTION_SECURITY:%',f; end if;
  if has_function_privilege('public',p,'execute') or has_function_privilege('anon',p,'execute') or not has_function_privilege('authenticated',p,'execute') then raise exception 'B28_FUNCTION_ACL:%',f; end if;
 end loop;
 select lower(pg_get_functiondef('public.b28_convert_admission_lead(uuid,bigint,uuid,jsonb)'::regprocedure)) into def;
 if strpos(def,'b18_submit_staff_admission_application')=0 or strpos(def,'linked_application_id=v_app_id')=0 or strpos(def,'admission_lead_activities')=0 then raise exception 'B28_CONVERSION_LINK'; end if;
 select lower(pg_get_functiondef('public.b18_submit_staff_admission_application(uuid,uuid,jsonb)'::regprocedure)) into def;
 if strpos(def,'staff_entry')=0 or strpos(def,'consent_confirmed')=0 or strpos(def,'admission_applications')=0 or strpos(def,'admission_consents')=0 or strpos(def,'admission_stage_history')=0 then raise exception 'B28_B18_CONSENT_BOUNDARY'; end if;
 if strpos(def,'student_enrollments')>0 or strpos(def,'insert into public.students')>0 or strpos(def,'insert into public.guardians')>0 then raise exception 'B28_DIRECT_SIS_CREATION'; end if;
 if has_function_privilege('public','public.b18_submit_staff_admission_application(uuid,uuid,jsonb)'::regprocedure,'execute') or has_function_privilege('anon','public.b18_submit_staff_admission_application(uuid,uuid,jsonb)'::regprocedure,'execute') or has_function_privilege('authenticated','public.b18_submit_staff_admission_application(uuid,uuid,jsonb)'::regprocedure,'execute') then raise exception 'B28_PRIVATE_B18_STAFF_BOUNDARY'; end if;
end $$;
