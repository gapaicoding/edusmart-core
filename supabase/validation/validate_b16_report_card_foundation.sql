-- Batch 16 Phase 1 foundation validator. Empty result set means PASS.

with failures as (
  select 'missing report_card_command_requests' as failure
  where to_regclass('public.report_card_command_requests') is null

  union all
  select 'missing report_card_command_requests replay uniqueness'
  where not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'report_card_command_requests'
      and indexname = 'report_card_command_requests_replay_key'
  )

  union all
  select 'command ledger RLS not enabled'
  where not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'report_card_command_requests'
      and c.relrowsecurity and c.relforcerowsecurity
  )

  union all
  select 'command ledger direct privilege exposed'
  where has_table_privilege('public', 'public.report_card_command_requests', 'select')
     or has_table_privilege('anon', 'public.report_card_command_requests', 'select')
     or has_table_privilege('authenticated', 'public.report_card_command_requests', 'select')
     or has_table_privilege('service_role', 'public.report_card_command_requests', 'select')

  union all
  select 'command ledger contains forbidden raw content columns'
  where exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'report_card_command_requests'
      and column_name in ('narrative','content','before_data','after_data','student_profile','document_contents')
  )

  union all
  select 'report_cards.row_version missing or invalid'
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'report_cards'
      and column_name = 'row_version' and data_type = 'bigint'
  )
  or not exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='report_cards' and c.conname='report_cards_row_version_positive'
  )

  union all
  select 'report_card_subject_entries.row_version missing or invalid'
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'report_card_subject_entries'
      and column_name = 'row_version' and data_type = 'bigint'
  )
  or not exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='report_card_subject_entries' and c.conname='report_card_subject_entries_row_version_positive'
  )

  union all
  select 'report_card_narratives.row_version missing or invalid'
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'report_card_narratives'
      and column_name = 'row_version' and data_type = 'bigint'
  )
  or not exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='report_card_narratives' and c.conname='report_card_narratives_row_version_positive'
  )

  union all
  select 'row-version increment trigger missing or duplicated'
  where (
    select count(*) from information_schema.triggers
    where trigger_schema='public'
      and trigger_name in ('trg_report_cards_row_version','trg_report_card_subject_entries_row_version','trg_report_card_narratives_row_version')
  ) <> 3

  union all
  select 'row-version trigger function missing or wrong search_path'
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='bump_report_card_row_version'
      and coalesce(p.proconfig::text, '') like '%search_path=%'
  )

  union all
  select 'audit metadata foundation missing'
  where not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='audit_logs' and column_name='metadata'
  )

  union all
  select 'report-card lifecycle status domain changed'
  where not exists (
    select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='report_cards'
      and pg_get_constraintdef(c.oid) like '%draft%submitted%reviewed%published%revised%archived%'
  )

  union all
  select 'report-card RLS foundation disabled'
  where exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('report_cards','report_card_subject_entries','report_card_narratives')
      and not c.relrowsecurity
  )
)
select failure from failures order by failure;
