-- Forward-only hardening: extend the immutable Phase-1 command ledger check
-- with the frozen Phase-2 application lifecycle command names.
alter table public.admission_command_requests
  drop constraint if exists admission_command_requests_command_check;

alter table public.admission_command_requests
  add constraint admission_command_requests_command_check
  check (command in (
    'submit_application','transition_application','convert_application',
    'open_cycle','close_cycle','reopen_cycle','archive_cycle',
    'start_review','accept_application','reject_application','withdraw_application'
  ));
