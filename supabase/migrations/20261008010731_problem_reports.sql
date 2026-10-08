-- #443 — a member's private "Report a problem". The whole report lives here and
-- nowhere public: no client can read or write this table; the app writes it through
-- the problem.report handler, and the pipeline (scripts/problem-reports.ts, run with
-- the database connection) reads it to file a scrubbed public Issue.
create table public.problem_reports (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  member_id     uuid references public.members(id) on delete set null,
  role          text not null check (role in ('member', 'operator')),
  route         text not null check (char_length(route) <= 300),
  build_sha     text check (build_sha is null or char_length(build_sha) <= 80),
  user_agent    text check (user_agent is null or char_length(user_agent) <= 400),
  description   text not null check (char_length(description) between 1 and 2000),
  issue_number  integer,
  filed_at      timestamptz
);

create index idx_problem_reports_unfiled on public.problem_reports (created_at) where issue_number is null;
create index idx_problem_reports_recent on public.problem_reports (created_at desc);

alter table public.problem_reports enable row level security;
revoke all on public.problem_reports from anon, authenticated;

comment on table public.problem_reports is
  '#443: members'' private problem reports. Operator and pipeline only (server-side connection); never readable through the API.';
