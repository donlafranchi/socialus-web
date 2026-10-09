-- #488 — F102 criterion 12 (ruled B): the AI may restore severity-4 reported
-- content on its own, narrowly. Ships OFF.
--
-- 1. moderation_settings.severity4_restore_cleared — false until the harness has
--    cleared F100 criterion 11's targets on the severity-4 slice. NO CODE PATH
--    SETS IT TRUE: an operator flips it as data, after reading the harness run:
--      update public.moderation_settings set severity4_restore_cleared = true;
--    The AI acts only when ai_mode = 'live' AND this is true.
-- 2. A decision can be the AI's. decided_by_member_id becomes nullable, and the
--    "never unattributable" rule moves into a check: exactly one of a member or
--    decided_by_ai. A person's confirm or undo is a later row, as ever.
-- 3. report_ai_restore_checks — one row per evaluation of the restore gate: what
--    the AI did ('restored'), would have done in shadow or before clearance
--    ('would_restore'), or was blocked from ('blocked', with which gates). Read
--    over the server connection only, for the agreement view.

alter table public.moderation_settings
  add column severity4_restore_cleared boolean not null default false;

alter table public.report_decisions
  add column decided_by_ai boolean not null default false;
alter table public.report_decisions alter column decided_by_member_id drop not null;
alter table public.report_decisions
  add constraint report_decisions_attributed
  check ((decided_by_member_id is null) = decided_by_ai);

create table public.report_ai_restore_checks (
  id          uuid        not null default gen_random_uuid() primary key,
  report_id   uuid        not null references public.reports(id) on delete cascade,
  result      text        not null check (result in ('restored', 'would_restore', 'blocked')),
  blocked_by  text[]      not null default '{}',
  created_at  timestamptz not null default now(),
  constraint report_ai_restore_checks_blocked_says_why
    check (result = 'would_restore'
           or (result = 'restored' and cardinality(blocked_by) = 0)
           or (result = 'blocked' and cardinality(blocked_by) > 0))
);
create index idx_report_ai_restore_checks_report on public.report_ai_restore_checks (report_id, created_at desc);

alter table public.report_ai_restore_checks enable row level security;
-- No policy, deliberately: the operator reads over the server connection.

-- What the AI would have restored (or did), against the person's latest decision
-- that is not the AI's own. No grant to any API role.
create view public.report_ai_restore_agreement as
select
  c.report_id,
  c.result,
  d.outcome as person_decision,
  (d.outcome = 'restored') as agree
from (
  select distinct on (report_id) *
    from public.report_ai_restore_checks
   where result in ('restored', 'would_restore')
   order by report_id, created_at desc
) c
join (
  select distinct on (report_id) report_id, outcome
    from public.report_decisions
   where not decided_by_ai
   order by report_id, decided_at desc
) d on d.report_id = c.report_id;

revoke all on public.report_ai_restore_agreement from anon, authenticated;

-- F100 criterion 7 compares the AI with a PERSON. The AI's own restore is not a
-- person's decision, so it is left out here (it would agree with itself).
create or replace view public.report_ai_agreement as
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
   where not decided_by_ai
   order by report_id, decided_at desc
) d on d.report_id = a.report_id;
