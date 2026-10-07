-- #486 — F100: an AI reads every reported item first, and a person decides.
-- Shadow mode (beta): an assessment changes nothing a member or the queue does.
-- One row per read, so Haiku's and Sonnet's are both kept (criterion 3); a
-- report that was never sent to a model carries one row saying why (criterion
-- 12). RLS on with zero policies, like `reports`: the operator reads over
-- DATABASE_URL and no client reads at all.

create table public.report_assessments (
  id               uuid        not null default gen_random_uuid() primary key,
  report_id        uuid        not null references public.reports(id) on delete cascade,
  model            text,
  prompt_version   text,
  category         text        check (category in ('harassment','nudity','spam','violence','threat_of_harm','sensitive_other','sensitive_child','other')),
  severity         smallint    check (severity between 1 and 4),
  confidence       numeric     check (confidence between 0 and 1),
  outcome          text        check (outcome in ('approve','remove')),
  reason           text        check (char_length(reason) <= 140),
  latency_ms       integer,
  input_tokens     integer,
  output_tokens    integer,
  skipped_reason   text,
  created_at       timestamptz not null default now(),
  -- Either a read or a recorded reason for not reading, never both or neither.
  constraint report_assessments_read_or_skipped
    check ((model is null) = (skipped_reason is not null))
);

create index idx_report_assessments_report on public.report_assessments (report_id, created_at desc);

alter table public.report_assessments enable row level security;
-- No policy, deliberately: see the header.

-- F100 criterion 7: agreement between the AI's shown suggestion (the latest
-- read) and the person's current decision (the latest by decided_at, a reversal
-- being a later row). Accuracy per category and severity is a query on this.
-- No grant to any API role: only the owner reads it.
create view public.report_ai_agreement as
select
  a.report_id,
  a.category,
  a.severity,
  a.model,
  a.confidence,
  a.outcome as ai_outcome,
  d.outcome as decision,
  (a.outcome = 'remove') = (d.outcome = 'removed') as agree
from (
  select distinct on (report_id) *
    from public.report_assessments
   where model is not null
   order by report_id, created_at desc
) a
join (
  select distinct on (report_id) report_id, outcome
    from public.report_decisions
   order by report_id, decided_at desc
) d on d.report_id = a.report_id;

revoke all on public.report_ai_agreement from anon, authenticated;
