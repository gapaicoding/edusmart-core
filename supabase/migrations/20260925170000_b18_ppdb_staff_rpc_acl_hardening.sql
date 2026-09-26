-- B18 forward-only ACL hardening.
-- Public execution is limited to the two intentional public RPCs.
-- No function bodies, tables, RLS policies, roles, or capabilities change.

revoke execute on function public.b18_transition_admission_application(uuid,bigint,uuid,text,text) from public;
revoke execute on function public.b18_transition_admission_application(uuid,bigint,uuid,text,text) from anon;
grant execute on function public.b18_transition_admission_application(uuid,bigint,uuid,text,text) to authenticated;

revoke execute on function public.b18_cycle_transition(uuid,bigint,uuid,text,text) from public;
revoke execute on function public.b18_cycle_transition(uuid,bigint,uuid,text,text) from anon;

revoke execute on function public.b18_bump_row_version() from public;
revoke execute on function public.b18_bump_row_version() from anon;
revoke execute on function public.b18_set_updated_at() from public;
revoke execute on function public.b18_set_updated_at() from anon;
