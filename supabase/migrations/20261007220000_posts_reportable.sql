-- F078 criterion 1 (#478 lane): a Post is reportable, and a report hides it.
--
-- Hiding reuses the state every read path already honours: a hidden post is
-- 'private' (managers only), so browse, the Page's list, /p/<id> and the
-- calendar file all withhold it from everyone else with no new predicate to
-- forget (the lesson of #439). hidden_prior_discoverability remembers what it
-- was, so a restore puts it back exactly. A removal keeps it hidden and stamps
-- removed_at; nothing is deleted, so either call can be reversed.

alter table public.page_posts
  add column hidden_at timestamptz,
  add column hidden_prior_discoverability text
    check (hidden_prior_discoverability in ('listed', 'unlisted', 'private')),
  add column removed_at timestamptz,
  -- A restore is sticky for the version restored: set to the body that was
  -- reviewed, so later reports on the same words store and queue but never
  -- hide again (the same rule as a Page photo's lock).
  add column hide_locked_body text,
  add constraint page_posts_hidden_has_prior
    check ((hidden_at is null) = (hidden_prior_discoverability is null));

create index idx_page_posts_hidden on public.page_posts (hidden_at) where hidden_at is not null;

alter table public.reports drop constraint reports_subject_kind_check;
alter table public.reports add constraint reports_subject_kind_check check (subject_kind in ('group', 'post'));

alter table public.member_notices drop constraint member_notices_subject_kind_check;
alter table public.member_notices add constraint member_notices_subject_kind_check check (subject_kind in ('group', 'post'));

alter table public.group_events
  drop constraint group_events_event_kind_check,
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
    'group.reported',
    'group.photo_hidden',
    'group.photo_restored',
    'group.post_created',
    'group.post_edited',
    'group.post_deleted',
    'group.unclaimed_hidden',
    'group.unclaimed_restored',
    'group.archived',
    'group.restored',
    -- this migration
    'group.post_hidden',
    'group.post_restored',
    'group.post_removed',
    -- written by report.reverse since #152, which the earlier lists never carried
    'group.decision_reversed'
  ));
