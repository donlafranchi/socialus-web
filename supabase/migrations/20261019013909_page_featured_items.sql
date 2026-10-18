-- #909 (Don, 2026-10-18) — a Page's Products & services section shows up to 12 featured products and services.
-- They are rows on the existing items spine (kind product or service, filed under the Page by group_id), with
-- their price on the existing item_products / item_services child. This adds what the section needs on top:
-- an in-stock switch, the owner's order, and, for a sample the unclaimed-Pages loader wrote from the business's
-- own website, where it came from. A featured product never stands alone: search finds the Page that carries it.

alter table public.items
  add column in_stock          boolean  not null default true,
  add column position          smallint not null default 0,
  -- Set only on a sample written by the unclaimed-Pages loader; the Page shows "Sample" and credits this site.
  add column sample_source_url text;

-- #241 — items' SELECT is granted column by column (member_id withheld), so a new column is invisible until granted.
grant select (in_stock, position, sample_source_url) on public.items to anon, authenticated;

comment on column public.items.in_stock is
  '#909: the owner''s in-stock (product) or available (service) switch on a featured item. Off shows the item muted, not hidden.';
comment on column public.items.position is
  '#909: the owner''s order for featured items on their Page, lowest first.';
comment on column public.items.sample_source_url is
  '#909: set only on a sample featured item written by the unclaimed-Pages loader, from the business''s own website. Null on real items.';

create index idx_items_group_featured
  on public.items (group_id, position)
  where deleted_at is null and kind in ('product', 'service');

-- ---------------------------------------------------------------------------------------------------------------
-- #909 (Don, 2026-10-18) — a Page's featured product or service is reportable on the courtesy-first flow (F078),
-- as subject kind 'page_item'. A first report sends the owner a courtesy notice; a repeat from someone else hides
-- just that item and the Page stays up; threat of harm and child content hide at once. A hidden or removed item
-- reaches nobody but the member who added it; their edit of its name or details shows it again (item.featured_save).

alter table public.items
  add column hidden_at        timestamptz,
  add column removed_at       timestamptz,
  -- The words a person restored; a report on exactly these words does not re-hide them. An edit un-locks them.
  add column hide_locked_text text;

grant select (hidden_at, removed_at, hide_locked_text) on public.items to anon, authenticated;

comment on column public.items.hidden_at is
  '#909: set when a report hid this featured item (the Page stays up). Cleared by a restore or by the owner''s edit.';

-- The owner's own policy (items_select_owner) is untouched, so the member who added it still sees it.
alter policy items_select_published on public.items
  using (
    state = 'published'
    and deleted_at is null
    and hidden_at is null
    and removed_at is null
    and (
      group_id is null
      or group_id in (
        select id from public.groups
         where discoverability = 'listed' and dissolved_at is null
      )
    )
  );

alter policy items_select_group_member on public.items
  using (
    group_id is not null
    and group_id in (select public.current_member_explicit_group_ids())
    and deleted_at is null
    and hidden_at is null
    and removed_at is null
  );

alter table public.reports drop constraint reports_subject_kind_check;
alter table public.reports
  add constraint reports_subject_kind_check
  check (subject_kind in ('group', 'post', 'page_picture', 'post_photo', 'page_words', 'page_item'));

alter table public.member_notices drop constraint member_notices_subject_kind_check;
alter table public.member_notices
  add constraint member_notices_subject_kind_check
  check (subject_kind in ('group', 'post', 'page_picture', 'post_photo', 'page_words', 'page_item'));

alter table public.legal_holds drop constraint legal_holds_subject_kind_check;
alter table public.legal_holds
  add constraint legal_holds_subject_kind_check
  check (subject_kind in ('group', 'post', 'page_picture', 'post_photo', 'page_words', 'page_item'));

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
    'group.post_hidden',
    'group.post_restored',
    'group.post_removed',
    'group.decision_reversed',
    'group.words_hidden',
    'group.words_restored',
    'group.words_removed',
    -- #909: a featured product or service
    'group.item_hidden',
    'group.item_restored',
    'group.item_removed'
  ));
