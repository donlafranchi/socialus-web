-- T123 (Issue #13) — F058: reports, and hiding a Page photo.
--
-- Ships:
--   1. public.reports                          (new table; RLS on, zero policies)
--   2. public.groups.photo_hidden_at           (nullable; non-null means hidden)
--   3. public.groups.photo_hide_locked         (boolean; a restore is sticky)
--   4. group_events.event_kind CHECK           (extended with 3 new kinds)
--
-- Spec anchors:
--   planning/scenario-F058.md
--   product/foundation/model.md § There are no Items
--   RULES.md rule 1 (nothing a member contributes goes live without a
--     report-and-takedown path for that kind of content)
--   planning/adrs/ADR-0007-action-layer.md  (writes via the action layer)
--   planning/adrs/ADR-0010-events-from-day-one.md
--
-- The shape, in one line: a report hides the photo at once and reversibly;
-- the operator reviews after, and either restores it or removes it for good.
-- Ratified by Don 2026-09-13 — "I don't want to have to go to a computer and
-- possibly have an automated take down if something gets flagged. I really
-- don't want to subject people to disturbing things."
--
-- Hiding is a projection concern, never a deletion. The storage object is
-- untouched by a hide; that is precisely what makes restore possible. Only the
-- operator's "remove for good" deletes bytes (T122).
--
-- New lineage. A pre-rebuild `reports` table exists in
-- web/scripts/001-create-tables.sql — a values-attestation shape from the
-- retired product, on the deletion sweep (Issue #63). Nothing here reuses it.

------------------------------------------------------------
-- 1. public.reports
------------------------------------------------------------

create table public.reports (
  id                      uuid          not null default gen_random_uuid() primary key,
  reporter_member_id      uuid          not null references public.members(id) on delete cascade,

  -- One value today. Posts join this CHECK when posts exist; Items never do
  -- (model.md § There are no Items). A column rather than a second table so
  -- that growth is a constraint change, not a migration of shape.
  subject_kind            text          not null
                                        check (subject_kind in ('group')),
  subject_id              uuid          not null,

  -- Free text, deliberately. At this density the operator learns more from
  -- what people write than from a taxonomy guessed in advance; if categories
  -- are ever warranted they are derived from this column, not invented above it.
  body                    text          not null
                                        check (char_length(body) between 1 and 2000),

  created_at              timestamptz   not null default now(),

  -- Review columns. Written by the operator surface (T122), never by a member.
  reviewed_at             timestamptz,
  reviewed_by_member_id   uuid                   references public.members(id) on delete set null,
  outcome                 text                   check (outcome in ('restored', 'removed')),

  removed_at              timestamptz,

  -- A reviewed report has an outcome and an outcome implies a review. Neither
  -- half is meaningful alone, and a half-written review would silently drop
  -- the report out of the operator's queue.
  constraint reports_review_is_complete
    check ((reviewed_at is null) = (outcome is null))
);

-- The operator surface has exactly one query: unreviewed, oldest first.
create index idx_reports_unreviewed
  on public.reports (created_at)
  where reviewed_at is null and removed_at is null;

-- Lookups by subject: the limits in T159 ask "has this member already
-- reported this Page", and the surface shows a Page's history.
create index idx_reports_subject
  on public.reports (subject_kind, subject_id);

create index idx_reports_reporter
  on public.reports (reporter_member_id)
  where removed_at is null;

alter table public.reports enable row level security;

-- No policy. Not one, deliberately.
--
-- Writes go through the action layer per ADR-7, which connects as a role that
-- bypasses RLS — so an INSERT policy would buy nothing and would additionally
-- open a direct client write path that skips the event log and the limits.
--
-- Reads: nobody. Not the reporter, not the reported party, not a Page owner.
-- The operator reads server-side over DATABASE_URL. A report names a member
-- and describes what someone believes they did wrong; there is no client that
-- should be able to read one, so there is no policy that lets it.
--
-- If a SELECT policy ever appears on this table, it is a bug. The migration
-- test asserts the absence.

comment on table public.reports is
  'Member reports about Pages (posts later). Free text, no taxonomy. RLS on with zero policies: action-layer-only writes per ADR-7, and no client may read a report at all — the operator reads server-side. Reporter identity is never projected to the reported party.';

comment on column public.reports.subject_kind is
  'One value today (''group''). Grows to ''post'' when posts exist. Never ''item'' — Items are out of the model.';

comment on column public.reports.outcome is
  'Null until reviewed. ''restored'' returns the photo and locks the Page against future auto-hides; ''removed'' nulls groups.photo_url and deletes the storage object.';

------------------------------------------------------------
-- 2. public.groups — the hide state
------------------------------------------------------------

-- Non-null means hidden. A timestamp rather than a boolean so the operator
-- surface can order by how long something has been hidden, and so a restore
-- is a null-out with the history living in group_events.
alter table public.groups
  add column photo_hidden_at timestamptz;

-- Set to the photo's URL when the operator restores it. A Page is locked
-- against auto-hiding only while photo_hide_locked_url = photo_url, so later
-- reports on that *same* photo store and queue for review but never hide it
-- again. It ends the restore -> re-report -> hidden-again loop permanently
-- rather than rate-limiting it.
--
-- Scoped to the URL rather than a bare boolean, deliberately. A boolean set on
-- restore and never cleared would outlive the photo it was granted for: an
-- owner whose benign photo was restored could then upload a genuinely bad one
-- that could never be auto-hidden again, which inverts the protection into a
-- shield. Comparing against photo_url means replacing the photo un-locks the
-- Page on its own, with no handler obliged to remember.
alter table public.groups
  add column photo_hide_locked_url text;

create index idx_groups_photo_hidden
  on public.groups (photo_hidden_at)
  where photo_hidden_at is not null;

comment on column public.groups.photo_hidden_at is
  'Non-null means the photo is hidden pending operator review. Hiding is a projection concern: the storage object is untouched, which is what makes restore possible. Every surface that projects a Page photo must go through visiblePhotoUrl() (src/lib/groups/visible-photo-url.ts).';

comment on column public.groups.photo_hide_locked_url is
  'Set to photo_url when the operator restores a photo. The Page is locked against auto-hiding only while photo_hide_locked_url = photo_url, so replacing the photo un-locks it automatically. Scoped to the URL rather than a boolean so the lock cannot outlive the photo it was granted for.';

------------------------------------------------------------
-- 3. Extend group_events.event_kind CHECK
------------------------------------------------------------

alter table public.group_events
  drop constraint if exists group_events_event_kind_check;

alter table public.group_events
  add constraint group_events_event_kind_check
  check (event_kind in (
    'group.created',
    'group.activated',
    'group.member_joined',
    'group.member_left',
    'group.role_changed',
    'group.steward_transferred',
    'group.dormant',
    'group.dormancy_extended',
    'group.revived',
    'group.dissolved',
    'group.photo_set',
    'group.photo_removed',
    'group.updated',
    -- T123 — F058.
    'group.reported',
    'group.photo_hidden',
    'group.photo_restored'
  ));
