-- F100.11 (#640): each run of the moderation harness is recorded, so the AI readiness panel can show the last run's
-- numbers and date against the live-mode targets. Written by `npm run moderation:eval -- --record`; read by staff over
-- the server connection (RLS on, no policy).

create table public.moderation_eval_runs (
  id               uuid        primary key default gen_random_uuid(),
  run_at           timestamptz not null default now(),
  cases            int         not null check (cases >= 0),
  recall           numeric     not null check (recall between 0 and 1),
  sev1_cases       int         not null check (sev1_cases >= 0),
  sev1_recall      numeric     not null check (sev1_recall between 0 and 1),
  false_alarm_rate numeric     not null check (false_alarm_rate between 0 and 1),
  meets_targets    boolean     not null
);

create index idx_moderation_eval_runs_run_at on public.moderation_eval_runs (run_at desc);

alter table public.moderation_eval_runs enable row level security;
