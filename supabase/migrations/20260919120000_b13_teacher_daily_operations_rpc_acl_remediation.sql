-- Forward-only ACL remediation for Phase 2 RPCs.
-- PostgreSQL functions default to PUBLIC EXECUTE unless explicitly revoked.

revoke all on function public.create_teaching_journal(uuid,uuid,date,text,text,text,text) from public, anon, service_role;
revoke all on function public.update_teaching_journal(uuid,uuid,bigint,text,text,text,text) from public, anon, service_role;
revoke all on function public.submit_teaching_journal(uuid,uuid,bigint) from public, anon, service_role;
revoke all on function public.manage_staff_attendance(uuid,uuid,date,text,timestamptz,timestamptz,text,bigint) from public, anon, service_role;
revoke all on function public.list_my_teaching_journals(uuid,uuid,date,date,text,integer,integer) from public, anon, service_role;
revoke all on function public.get_my_teaching_journal(uuid) from public, anon, service_role;
revoke all on function public.list_staff_teaching_journals(uuid,uuid,uuid,uuid,text,date,date,integer,integer) from public, anon, service_role;
revoke all on function public.get_staff_teaching_journal(uuid,uuid) from public, anon, service_role;
revoke all on function public.list_my_teaching_occurrences(date,date,integer,integer) from public, anon, service_role;
revoke all on function public.list_staff_attendance(uuid,date,date,text,uuid,integer,integer) from public, anon, service_role;
revoke all on function public.get_staff_attendance_record(uuid,uuid) from public, anon, service_role;
revoke all on function public.list_my_staff_attendance(date,date,text,integer,integer) from public, anon, service_role;

revoke all on function public.b13_claim_teacher_daily_command(uuid,uuid,text,uuid,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.b13_complete_teacher_daily_command(uuid,uuid,jsonb) from public, anon, authenticated, service_role;
