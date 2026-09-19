begin;

create or replace function public.mark_notification_read(p_notification_recipient_id uuid)
returns table(notification_recipient_id uuid,read_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  update public.notification_recipients nr
  set read_at=coalesce(nr.read_at,transaction_timestamp())
  where nr.id=p_notification_recipient_id and nr.recipient_profile_id=auth.uid()
  returning nr.id,nr.read_at into notification_recipient_id,read_at;
  if not found then raise exception using errcode='P0001',message='B12_NOTIFICATION_NOT_FOUND'; end if;
end;
$$;

commit;
