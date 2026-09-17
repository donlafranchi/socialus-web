-- T122 follow-up (#12) — a moderation decision becomes an EVENT, not a state
-- overwrite, so any decision can be reversed later.
--
-- Don's clarification, 2026-09-17: "We actually want two buttons. And perhaps a
-- record of what happened in order to reverse."
--
-- WHY THIS NEEDED A MIGRATION RATHER THAN A UI CHANGE. `report.remove` as
-- shipped set `groups.photo_url = null`. The URL was destroyed, so there was
-- nothing to restore a removal *to* — reversibility was not a missing feature
-- on top of the existing shape, it was impossible in it.
--
-- The fix is the pattern this codebase already states about itself, in
-- src/lib/groups/visible-photo-url.ts: "Hiding is a projection concern, not a
-- deletion." Removal now works the same way. `photo_removed_at` joins
-- `photo_hidden_at`, the read path stops serving the URL, and the bytes and the
-- URL are both left alone — which is exactly what makes the reversal possible.
--
-- THE SAFETY GAP THIS OPENS, recorded here because it must not be discovered
-- later: removed content stays fetchable by anyone holding the direct storage
-- URL, permanently. That was already true of hidden photos (recorded as a known
-- limit in visible-photo-url.ts) and is now true of removed ones too. For
-- ordinary bad content, reversible removal is the right trade. For illegal
-- content it is not an acceptable end state, and "we kept it so it could be
-- reversed" is the wrong answer. A separate, irreversible PURGE action is
-- specified in docs/purge-proposal.md and deliberately NOT built here: it needs
-- a storage policy change, which Don should run knowingly.

------------------------------------------------------------
-- 1. The decisions log — append-only. This is the source of truth.
------------------------------------------------------------

create table public.report_decisions (
  id                     uuid          not null default gen_random_uuid() primary key,
  report_id              uuid          not null references public.reports(id) on delete cascade,

  -- Who decided. Not nullable: an unattributable moderation decision is the
  -- thing this table exists to prevent.
  decided_by_member_id   uuid          not null references public.members(id),
  decided_at             timestamptz   not null default now(),

  outcome                text          not null
                                       check (outcome in ('restored', 'removed')),

  -- A CODE, not display text. Wording is Don's under the public-is-draft rule
  -- and lives in TypeScript (src/lib/admin/reason-codes.ts); if it lived here,
  -- every rephrasing would be a migration and a production apply.
  reason_code            text          not null
                                       check (reason_code in (
                                         -- restore
                                         'nothing_wrong',
                                         'reported_by_mistake',
                                         -- remove
                                         'not_a_real_place',
                                         'someone_elses_photo',
                                         'not_suitable',
                                         'person_did_not_agree',
                                         -- either, with a note
                                         'other'
                                       )),

  -- The exception, not the default path. A preset handles the common case in
  -- one tap; this carries the case that does not fit.
  reason_note            text          check (reason_note is null
                                              or char_length(reason_note) between 1 and 1000),

  -- Set when this decision undoes an earlier one. Nothing is ever mutated or
  -- deleted to reverse something — a reversal is a new row pointing back.
  reverses_decision_id   uuid                   references public.report_decisions(id),

  -- 'other' with nothing written is not a reason. It is the one code whose
  -- whole purpose is the note.
  constraint report_decisions_other_needs_a_note
    check (reason_code <> 'other' or reason_note is not null)
);

comment on table public.report_decisions is
  'Append-only log of moderation decisions. THE SOURCE OF TRUTH for whether a report is reviewed and what was decided: current status is the latest row by decided_at. Reversing a decision inserts a new row with reverses_decision_id set; nothing here is ever updated or deleted. reports.reviewed_at / reviewed_by_member_id / outcome are a PROJECTION of the latest row, kept because three readers depend on them.';

comment on column public.report_decisions.reverses_decision_id is
  'The decision this one undoes, when it is a reversal. Null for a first decision.';

create index idx_report_decisions_report on public.report_decisions (report_id, decided_at desc);

-- One reversal per decision. Two reversals of the same row is a double-undo
-- with no defined meaning, and it is how two reviewers ping-pong.
create unique index idx_report_decisions_one_reversal
  on public.report_decisions (reverses_decision_id)
  where reverses_decision_id is not null;

alter table public.report_decisions enable row level security;

-- No policy, deliberately, matching `reports`. Every read is server-side over
-- DATABASE_URL; nothing reaches this through PostgREST.

------------------------------------------------------------
-- 2. Removal stops destroying the URL
------------------------------------------------------------

alter table public.groups
  add column photo_removed_at timestamptz;

comment on column public.groups.photo_removed_at is
  'Non-null means the operator removed this photo. A projection concern, exactly like photo_hidden_at — photo_url and the storage object are LEFT INTACT, which is what makes the removal reversible. visiblePhotoUrl() returns null when either timestamp is set. Known and accepted: the bytes stay fetchable by direct storage URL. See docs/purge-proposal.md for the irreversible path that closes that.';

-- Any photo already removed under the old behaviour had its URL nulled and
-- cannot be recovered; there is nothing to backfill and nothing to undo. This
-- marks such Pages so the surface can say "removed" rather than "no photo".
update public.groups g
   set photo_removed_at = r.removed_at
  from public.reports r
 where r.subject_id = g.id
   and r.subject_kind = 'group'
   and r.outcome = 'removed'
   and r.removed_at is not null
   and g.photo_removed_at is null;

------------------------------------------------------------
-- 3. Backfill the decisions log from reviews already made
------------------------------------------------------------

-- Every past review becomes its first decision, so the log is complete from the
-- start rather than beginning mid-history. `reviewed_by_member_id` is nullable
-- on `reports` (on delete set null) but not here, so a review whose reviewer is
-- gone is skipped rather than attributed to nobody.
insert into public.report_decisions
       (report_id, decided_by_member_id, decided_at, outcome, reason_code, reason_note)
select r.id,
       r.reviewed_by_member_id,
       r.reviewed_at,
       r.outcome,
       'other',
       'Decided before reasons were recorded.'
  from public.reports r
 where r.reviewed_at is not null
   and r.outcome is not null
   and r.reviewed_by_member_id is not null
   and not exists (select 1 from public.report_decisions d where d.report_id = r.id);
