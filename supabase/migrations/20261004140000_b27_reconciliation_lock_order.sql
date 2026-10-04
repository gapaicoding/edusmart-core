begin;

-- B24 financial lock order is invoice first, intent second. The initial lookup
-- must not retain an intent lock before acquiring the invoice lock.
do $$
declare
  definition text;
  old_clause text := 'and organization_id=o.organization_id and school_id=o.school_id for update;';
  new_clause text := 'and organization_id=o.organization_id and school_id=o.school_id;';
begin
  select pg_get_functiondef('public.b24_reconcile_midtrans_qris_event(jsonb)'::regprocedure) into definition;
  if definition is null or position(old_clause in definition)=0 then
    raise exception 'B27_EXPECTED_INITIAL_INTENT_LOCK_CLAUSE';
  end if;
  definition:=replace(definition,old_clause,new_clause);
  execute definition;
end $$;

commit;

