-- F072 (Issue #114) — what the write half of a Page post needs.
--
-- Spec anchors:
--   planning/scenario-F072.md                    (acceptance 3 and 6)
--   planning/adrs/ADR-0007-action-layer.md       (writes via the action layer)
--   planning/adrs/ADR-0010-*.md                  (row write and event write in one transaction)
--   supabase/migrations/20260914202752_page_posts.sql  (the table, T162)
--
-- T162 shipped the table and the browse read source and said so: "substrate
-- only: the table and its read path. No composer, no rendering." Building the
-- composer found two things the substrate was missing.

------------------------------------------------------------
-- 1. Extend group_events.event_kind CHECK
------------------------------------------------------------

-- F072 acceptance 6 requires the post row and its event row in one
-- transaction. `event_kind` is an allowlist, so without these two the event
-- write raises and rolls the post back with it.
--
-- The whole list is restated because a CHECK cannot be extended in place. A
-- kind dropped here is a write that fails in production and nowhere else, so a
-- test names every prior kind and fails if one goes missing.

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
    'group.photo_restored',
    -- T164 — F072. An edit is its own kind rather than a second 'created':
    -- the row keeps its id, so the log is the only place the earlier wording
    -- is recorded at all.
    'group.post_created',
    'group.post_edited'
  ));

------------------------------------------------------------
-- 2. page_posts.parent_post_id
------------------------------------------------------------

-- F072 acceptance 3 asks for this "from its first migration". T162's migration
-- did not carry it and is already applied, so the criterion is met late rather
-- than not at all, and the PR records the deviation. Added now because the
-- table is empty, which is the cheap moment and will not come again.
--
-- Nothing reads it yet. Replies and threads are F072 § Not this; this is the
-- column the eventual reply hangs on, sized while nothing depends on it.
--
-- `on delete set null` rather than cascade: losing a parent orphans a reply,
-- it does not delete one. The asymmetry with group_id is deliberate and is the
-- same asymmetry location_id already carries.

alter table public.page_posts
  add column if not exists parent_post_id uuid
    references public.page_posts(id) on delete set null;

create index if not exists idx_page_posts_parent
  on public.page_posts (parent_post_id)
  where parent_post_id is not null;

comment on column public.page_posts.parent_post_id is
  'Optional parent post (F072 acceptance 3). Nullable and unread today: replies are out of scope for F072, and this exists so the column does not have to be added to a populated table later. `on delete set null` — losing a parent orphans a reply rather than deleting one.';

------------------------------------------------------------
-- 3. No write policy, deliberately
------------------------------------------------------------

-- `page_posts` still carries SELECT policies only. Writes go through
-- group.post_create / group.post_edit, which connect as the table owner and
-- bypass RLS; a write policy here would open a direct client path that skips
-- the event log and would be the only way to post without one.
--
-- AND THERE IS NO DELETE PATH. F072 acceptance 4 refuses deletion. It is
-- refused by absence on both sides: no DELETE policy here, and no handler in
-- the action layer. Nothing about visibility, ordering or any column added
-- here is derived from what anyone pays.
