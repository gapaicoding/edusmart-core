-- EduSmart Core V1 — Batch 16 Phase 1
-- Report Card lifecycle/snapshot runtime foundation only.
-- No command RPCs, projections, UI, document, or portal changes.

alter table public.report_cards
  add column row_version bigint not null default 1;

alter table public.report_cards
  add constraint report_cards_row_version_positive check (row_version >= 1);

alter table public.report_card_subject_entries
  add column row_version bigint not null default 1;

alter table public.report_card_subject_entries
  add constraint report_card_subject_entries_row_version_positive check (row_version >= 1);

alter table public.report_card_narratives
  add column row_version bigint not null default 1;

alter table public.report_card_narratives
  add constraint report_card_narratives_row_version_positive check (row_version >= 1);

create or replace function public.bump_report_card_row_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

drop trigger if exists trg_report_cards_row_version on public.report_cards;
create trigger trg_report_cards_row_version
before update on public.report_cards
for each row execute function public.bump_report_card_row_version();

drop trigger if exists trg_report_card_subject_entries_row_version on public.report_card_subject_entries;
create trigger trg_report_card_subject_entries_row_version
before update on public.report_card_subject_entries
for each row execute function public.bump_report_card_row_version();

drop trigger if exists trg_report_card_narratives_row_version on public.report_card_narratives;
create trigger trg_report_card_narratives_row_version
before update on public.report_card_narratives
for each row execute function public.bump_report_card_row_version();

create table public.report_card_command_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_id uuid not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  command_name text not null check (length(command_name) between 1 and 120),
  payload_fingerprint text not null check (length(payload_fingerprint) between 1 and 128),
  report_card_id uuid,
  resource_type text check (resource_type is null or length(resource_type) between 1 and 80),
  resource_id uuid,
  status text not null default 'started' check (status in ('started','completed','failed')),
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint report_card_command_request_scope_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id) on delete restrict,
  constraint report_card_command_request_report_fk
    foreign key (report_card_id, organization_id, school_id)
    references public.report_cards(id, organization_id, school_id) on delete set null,
  constraint report_card_command_request_result_bounded
    check (pg_column_size(result_payload) <= 16384),
  constraint report_card_command_request_completion_consistent
    check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);

create unique index report_card_command_requests_replay_key
on public.report_card_command_requests (actor_profile_id, command_name, request_id);

create index report_card_command_requests_scope_idx
on public.report_card_command_requests (organization_id, school_id, created_at desc);

create index report_card_command_requests_resource_idx
on public.report_card_command_requests (report_card_id, created_at desc)
where report_card_id is not null;

alter table public.report_card_command_requests enable row level security;
alter table public.report_card_command_requests force row level security;

revoke all on table public.report_card_command_requests from public, anon, authenticated, service_role;

comment on table public.report_card_command_requests is
  'Batch 16 domain-specific replay ledger; stores bounded results and fingerprints, never report-card content.';
comment on column public.report_cards.version is
  'Business report-card revision identity; not an optimistic-concurrency CAS field.';
comment on column public.report_cards.row_version is
  'Monotonic row-level CAS version for mutable report-card fields.';
comment on column public.report_card_subject_entries.row_version is
  'Monotonic row-level version; subject snapshot values remain guarded by existing report-card rules.';
comment on column public.report_card_narratives.row_version is
  'Monotonic row-level CAS version for independently mutable narrative rows.';
